#!python3
#This module contains integration tests for both the Python client and server.
#Protocol details are tested using private methods of the client

import os
import sys

from os.path import (abspath, dirname, join, normpath)

proj_root = normpath(join(abspath(sys.path[0]), '..'))
def rel(path):
    return join(proj_root, path)

sys.path.append(rel('clients/Python'))
sys.path.append(rel('samples/tictactoe/clients/Python'))

import locale
import queue
import subprocess
import random
import re
import socket
import threading
import time
import unittest

from collections import namedtuple
from itertools import zip_longest
from threading import Thread, current_thread
from traceback import format_exc

from grebe import (Client, 
                   GameEnd, 
                   InvalidMessageSent, 
                   ClientAlreadyLoggedIn, 
                   UserAlreadyLoggedIn)

from tictactoe import TicTacToe

HOST = 'localhost'
PORT = 13579

server_script_path = rel('server/server.js')
tictactoe_path = rel('samples/tictactoe/server/game.js')

def assertEqual(actual, expected):
    if actual != expected:
        raise AssertionError('{!r} != {!r}'.format(actual, expected))

def assertTrue(actual):
    if not actual:
        raise AssertionError()

def assertOutput(actual_lines, expected_lines):
    expected_lines += [''] 
    for actual, expected in zip_longest(actual_lines, expected_lines):
        if expected is None or not re.match('^' + expected + '$', actual):
            raise AssertionError(
                    '{!r} does not match {!r}'.format(actual, expected))

TestResult = namedtuple('TestResult', ['passed', 'error'])
TestRunResult = namedtuple('TestRunResult', 
                           ['passed', 'error', 'stdout', 'stderr'])

class TestBase:
    def __init__(self):
        self.__serverArgs = ['node.exe',  server_script_path, tictactoe_path,
                             'A', 'B', '--port', None]
        self.serverPort = random.randint(49152, 65535)
        self.cwd = rel('.')

    @property
    def serverPort(self):
        return int(self.__serverArgs[6])

    @serverPort.setter
    def serverPort(self, value):
        self.__serverArgs[6] = str(value)

    @property
    def gameModulePath(self):
        return int(self.__serverArgs[2])

    @gameModulePath.setter
    def gameModulePath(self, value):
        self.__serverArgs[2] = str(value)

    def addOption(self, name, value):
        self.__serverArgs += ('--' + name, value)

    def run(self, _test=lambda: TestResult(True, None)):
        result = None

        server = None
        stdout = None
        stderr = None
        try:
            server = subprocess.Popen(self.__serverArgs, 
                                      cwd=self.cwd,
                                      stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE)

            result = _test()
        except:
            result = TestResult(False, format_exc())

        finally:
            if server:
                try:
                    stdout, stderr = server.communicate(timeout=0.25)
                except subprocess.TimeoutExpired:
                    server.kill()
                    stdout, stderr = server.communicate()

        encoding = locale.getpreferredencoding()
        stdout = stdout.decode(encoding) if stdout is not None else None
        stderr = stderr.decode(encoding) if stderr is not None else None

        if result.passed:
            try:
                self.checkServerOutput(stdout, stderr)
            except Exception:
                return TestRunResult(False, format_exc(), stdout, stderr)

        return TestRunResult(result.passed, result.error, stdout, stderr)

    def checkServerOutput(self, stdout, stderr):
        pass


class ClientTestBase(TestBase):
    """Base class for running tests with a thread for each client"""

    def __init__(self):
        super().__init__()
        self._queue = queue.Queue()
        self._clientFunc = Client

    def __run(self):
        def wrap(func):
            def wrapped():
                client = None
                try:
                    client = self._clientFunc('localhost', self.serverPort)
                    func(client)
                    client.close()
                    self._queue.put(current_thread())
                except Exception as error:
                    self._queue.put(format_exc())
                finally:
                    if client is not None:
                        client.close()

            return wrapped

        threads = set()

        def createThread(func):
            thread = Thread(
                    target=wrap(func), 
                    name=func.__name__, 
                    daemon=True) 
            threads.add(thread)
            return thread

        passed = True
        traceback = None

        p1Thread = createThread(self.p1Run)
        p2Thread = createThread(self.p2Run)

        for thread in threads:
            thread.start()

        while threads:
            item = self._queue.get()
            if item in threads:
                threads.remove(item)
            else:
                passed = False
                traceback = item
                break

        if not passed:
            return TestResult(False, item)

        return TestResult(True, None)

    def run(self):
        return super().run(_test=self.__run)

    def p1Run(self, client):
        raise NotImplementedError()

    def p2Run(self, client):
        raise NotImplementedError()


# Handles logging in and starting the game
class InGameTestBase(ClientTestBase):
    def p1Run(self, client):
        client.login('A', '')
        self.p1InGameRun(client)

    def p2Run(self, client):
        client.login('B', '')
        self.p2InGameRun(client)

    def p1InGameRun(self, client):
        raise NotImplementedError()

    def p2InGameRun(self, client):
        raise NotImplementedError()


class ServerPortInUse(TestBase):
    def run(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(('', self.serverPort))
            sock.listen(5)

            return super().run()

    def checkServerOutput(self, stdout, stderr):
        assertEqual(stdout, '')

        actual_lines = stderr.split("\n")
        assertOutput(actual_lines, ['Port already in use'])

class GameModuleNotFound(TestBase):
    def __init__(self):
        super().__init__()
        self.gameModulePath = 'missing_module.js'

    def checkServerOutput(self, stdout, stderr):
        assertEqual(stdout, '')

        actual_lines = stderr.split("\n")
        assertOutput(actual_lines,['Game module not found'])

class GameModulePathRelativeToCwd(TestBase):
    def __init__(self):
        super().__init__()
        self.cwd = rel('samples')
        self.gameModulePath = 'tictactoe/server/game.js'

    def checkServerOutput(self, stdout, stderr):
        assertEqual(stdout, 'Server started\n')
        assertEqual(stderr, '')

class P1TriesToLogInTwice(ClientTestBase):
    def p1Run(self, client):
        errorRaised = False
        try: 
            client._connect()
            client._login('A', '')
            client._login('A', '')

        except ClientAlreadyLoggedIn:
            errorRaised = True

        assertTrue(errorRaised)

    def p2Run(self, client):
        pass

class P2TriesToLogInAsP1(ClientTestBase):
    def __init__(self):
        super().__init__()
        self._p1loginEvent = threading.Event()
        self._p2loginEvent = threading.Event()

    def p1Run(self, client):
        client._connect()
        client._login('A', '')
        self._p1loginEvent.set()
        self._p2loginEvent.wait()

    def p2Run(self, client):
        errorRaised = False
        try:
            self._p1loginEvent.wait()
            client._connect()
            client._login('A', '')
        except UserAlreadyLoggedIn:
            errorRaised = True

        self._p2loginEvent.set()
            
        assertTrue(errorRaised)

class P1ReconnectsBeforeGameStarts(ClientTestBase):
    def p1Run(self, client):
        client._connect()
        client._login('A', '')
        client._sock.close()
        client.login('A', '')

    def p2Run(self, client):
        #Wait for P1 to reconnect
        #TODO: Use proper thread sync instead of sleep
        time.sleep(0.25)

        client.login('B', '')


class P1SendsMoveBeforeLogIn(ClientTestBase):
    def p1Run(self, client):
        errorRaised = False
        try:
            client._connect()
            client.move('1,1')
        except InvalidMessageSent as error:
            errorRaised = True
            assertEqual(error.reason, 'Not logged in')

        assertTrue(errorRaised)

    def p2Run(self, client):
        pass

class P1SendsInvalidMessageType(ClientTestBase):
    def p1Run(self, client):
        errorRaised = False

        client._connect()
        client._login('A', '')
        try:
            client._send('FOO', '')
            client._recv()
        except InvalidMessageSent as invalidMessageSent:
            errorRaised = True
            assertEqual(invalidMessageSent.reason,
                        'Invalid message type')

        assertTrue(errorRaised)

    def p2Run(self, client):
        pass

class P1SendsInvalidMoveMessage(InGameTestBase):
    def p1InGameRun(self, client):
        errorRaised = False
        try: 
            client._send('MOVE', 'a', 'b')
            client.waitForNextTurn()

        except InvalidMessageSent as invalidMessageSent:
            errorRaised = True
            assertEqual(invalidMessageSent.reason,
                        'Incorrect number of arguments for MOVE')

        assertTrue(errorRaised)

    def p2InGameRun(self, client):
        try:
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '0-1')
            assertEqual(gameEnd.reason, 'P1 sent an invalid message')

class P2SendsInvalidMoveMessage(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.move('2,2')
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '1-0')
            assertEqual(gameEnd.reason, 'P2 sent an invalid message')

    def p2InGameRun(self, client):
        errorRaised = False
        try: 
            client.waitForNextTurn()
            client._send('MOVE', 'a', 'b')
            client.waitForNextTurn()

        except InvalidMessageSent as invalidMessageSent:
            errorRaised = True
            assertEqual(invalidMessageSent.reason,
                        'Incorrect number of arguments for MOVE')

        assertTrue(errorRaised)

class P1MovesWhenNotHisTurn(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.move('1,1')

            #Sleep to allow server to process next turn
            time.sleep(0.25)
            client.move('2,2')

            client.waitForNextTurn()

        except GameEnd:
            pass
            

    def p2InGameRun(self, client):
        try:
            client.waitForNextTurn()
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '0-1')
            assertEqual(gameEnd.reason, 'P1 moved when not allowed to')
            pass

class P2MovesWhenNotHisTurn(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '1-0')
            assertEqual(gameEnd.reason, 'P2 moved when not allowed to')
            

    def p2InGameRun(self, client):
        try:
            client.move('2,1')
            client.waitForNextTurn()

        except GameEnd:
            pass

class P1ExceedsTimeLimit(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '0-1')
            assertEqual(gameEnd.reason, 'P1 exceeded move time limit')

    def p2InGameRun(self, client):
        try: 
            client.waitForNextTurn()

        except GameEnd:
            pass

class P2ExceedsTimeLimit(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.move('2,2')
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '1-0')
            assertEqual(gameEnd.reason, 'P2 exceeded move time limit')

    def p2InGameRun(self, client):
        try: 
            client.waitForNextTurn()
            client.waitForNextTurn()

        except GameEnd:
            pass

class P1Disconnects(InGameTestBase):
    def p1InGameRun(self, client):
        client._sock.close()

    def p2InGameRun(self, client):
        try:
            client.waitForNextTurn()
        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '0-1')
            assertEqual(gameEnd.reason, 'P1 disconnected')

class P2Disconnects(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.move('2,2')
            client.waitForNextTurn()
        except GameEnd as gameEnd:
            assertEqual(gameEnd.result, '1-0')
            assertEqual(gameEnd.reason, 'P2 disconnected')

    def p2InGameRun(self, client):
        client._sock.close()

# TODO: Test player sending a move twice in one turn. 
#       (Wait for game with simultaneous tests to test this)
class MoveReturnValues(InGameTestBase):
    def p1InGameRun(self, client):
        p1move, p2move = client.move('2,2')

        assertEqual(p1move, '2,2')
        assertEqual(p2move, '')

    def p2InGameRun(self, client):
        client.waitForNextTurn()

class GameStartReturnValues(ClientTestBase):
    def __init__(self):
        super().__init__()
        self._MOVETIMEMS = 60000
        self.addOption('movetime', str(self._MOVETIMEMS))

    def p1Run(self, client):
        role, initialState, movetime = client.login('A', '')

        assertEqual(role, 'P1')
        assertEqual(initialState, '...\n...\n...')
        assertEqual(movetime, (self._MOVETIMEMS / 1000))

    def p2Run(self, client):
        client._connect()
        client._login('B', '')

        mtype, margs = client._recv()

        assertEqual(mtype, 'START')
        assertEqual(len(margs), 2)
        assertEqual(margs[1], str(self._MOVETIMEMS))

class WaitForNextTurnReturnValues(InGameTestBase):
    def p1InGameRun(self, client):
        client.move('2,2')

    def p2InGameRun(self, client):
        p1move, p2move = client.waitForNextTurn()

        assertEqual(p1move, '2,2')
        assertEqual(p2move, '')

class SampleGame1(InGameTestBase):
    def p1InGameRun(self, client):
        try:
            client.move('2,2')
            client.waitForNextTurn()

            client.move('1,3')
            client.waitForNextTurn()

            client.move('1,1')
            client.waitForNextTurn()

            client.move('3,3')
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.reason, 'Three in a row')
            assertEqual(gameEnd.result, '1-0')
            assertEqual(gameEnd.p1Move, '3,3')
            assertEqual(gameEnd.p2Move, '')


    def p2InGameRun(self, client):
        try:
            client.waitForNextTurn()
            client.move('3,1')

            client.waitForNextTurn()
            client.move('2,1')

            client.waitForNextTurn()
            client.move('1,2')

            client.waitForNextTurn()

        except GameEnd as gameEnd:
            pass

    def checkServerOutput(self, stdout, stderr):
        actual_lines = stdout.split("\n")
        expected_lines = [
            'Server started',
            'P[12] logged in',
            'P[12] logged in',
            'Starting game',
            '\d+: Turn 1',
            '\d+: P1 2,2',
            '\d+: Turn 2',
            '\d+: P2 3,1',
            '\d+: Turn 3',
            '\d+: P1 1,3',
            '\d+: Turn 4',
            '\d+: P2 2,1',
            '\d+: Turn 5',
            '\d+: P1 1,1',
            '\d+: Turn 6',
            '\d+: P2 1,2',
            '\d+: Turn 7',
            '\d+: P1 3,3',
            '\d+: Result 1-0 \(Three in a row\)']
        assertOutput(actual_lines, expected_lines)

class TicToeClientSampleGame(ClientTestBase):
    def __init__(self):
        super().__init__()
        self._clientFunc = TicTacToe 

    def p1Run(self, client):
        try:
            role, state, movetime = client.login('A', '')
            assertEqual(state, (('.', '.', '.'), 
                                ('.', '.', '.'),
                                ('.', '.', '.')))

            client.move(2, 2)
            p1move, p2move = client.waitForNextTurn()
            assertEqual(p1move, None)
            assertEqual(p2move, (3, 1))

            client.move(1, 3)
            client.waitForNextTurn()

            client.move(1, 1)
            client.waitForNextTurn()

            client.move(3, 3)
            client.waitForNextTurn()

        except GameEnd as gameEnd:
            assertEqual(gameEnd.reason, 'Three in a row')
            assertEqual(gameEnd.result, '1-0')
            assertEqual(gameEnd.p1Move, (3, 3))
            assertEqual(gameEnd.p2Move, None)


    def p2Run(self, client):
        try:
            client.login('B', '')

            p1move, p2move = client.waitForNextTurn()
            assertEqual(p1move, (2, 2))
            assertEqual(p2move, None)

            client.move(3, 1)

            client.waitForNextTurn()
            client.move(2, 1)

            client.waitForNextTurn()
            client.move(1, 2)

            client.waitForNextTurn()

        except GameEnd as gameEnd:
            pass


start = time.clock()

tests = [ServerPortInUse, 
         GameModuleNotFound,
         GameModulePathRelativeToCwd,
         P1TriesToLogInTwice, 
         P2TriesToLogInAsP1, 
         P1ReconnectsBeforeGameStarts, 
         P1SendsMoveBeforeLogIn,
         P1SendsInvalidMessageType,
         P1SendsInvalidMoveMessage,
         P2SendsInvalidMoveMessage,
         P1MovesWhenNotHisTurn, 
         P2MovesWhenNotHisTurn, 
         P1ExceedsTimeLimit,         
         P2ExceedsTimeLimit,         
         P1Disconnects,
         P2Disconnects,
         MoveReturnValues,
         GameStartReturnValues,
         WaitForNextTurnReturnValues,
         SampleGame1,
         TicToeClientSampleGame,
         ]

numTestsRun = 0
failure = None
for test in tests:
    instance = test()
    result = instance.run()
    numTestsRun += 1
    if result[0]:
        print('.', end='', flush=True)
    else:
        print('F', end='', flush=True)
        failure = (test.__name__, result[1], result[2], result[3])
        break

if failure:
    name, error, stdout, stderr = failure
    print()
    print(80 * '=')
    print('FAIL: {}'.format(name))
    print(80 * '-')

    print()
    print(error)

    print(80 * '-')
    print('Server stdout')
    print('-------------')
    print()
    print(stdout, end='')
    print()

    print(80 * '-')
    print('Server stderr')
    print('-------------')
    print(stderr, end='')
    print()


duration = time.clock() - start

print()
print(80 * '-')
print('Ran {} tests in {:0.1f}s'.format(numTestsRun, duration))
print()

#TODO: Test this log-in error when client is already logged in
