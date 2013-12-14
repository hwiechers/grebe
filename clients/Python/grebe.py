#! python3

import csv
import io
import socket
import struct

MAX_MESSAGE_SIZE = 512
PREFIX_SIZE = 2
MAX_BODY_SIZE = 510

class AlreadyLoggedIn(Exception):
    pass

class InvalidMessageFormat(Exception):
    """Raised when a message received has an invalid format."""

    def __init__(self, reason):
        self.reason = reason

    def __str__(self):
        return repr(self.reason)

class InvalidMessageSent(Exception):
    """Raised when a message with type INVALID is received from the server.
    
    The server only sends messages INVALID messages in reply to invalid
    messages sent by the client. The `reason` field indicates why the message 
    was invalid according to the server."""

    def __init__(self, reason):
        self.reason = reason

    def __str__(self):
        return repr(self, reason)

class ClientAlreadyLoggedIn(Exception):
    pass

class UserAlreadyLoggedIn(Exception):
    pass

class GameEnd(Exception):

    def __init__(self, result, reason, p1Move, p2Move):
        self.result = result
        self.reason = reason
        self.p1Move = p1Move
        self.p2Move = p2Move

    def __str__(self):
        return repr((self.result, self.reason))


class Client():

    def __init__(self, host, port):
        self._host = host
        self._port = port
        self._sock = None
        self._loggedIn = False

    def _formatMove(self, *args):
        return args[0]

    def _parseMove(self, value):
        return value

    def _parseState(self, value):
        return value

    def login(self, username, password):
        if self._loggedIn:
            raise AlreadyLoggedIn()

        self._connect()
        role, = self._login(username, password)
        initialState, movetime = self._waitForStart()

        self._loggedIn = True
        return role, initialState, movetime
    
    def _connect(self):
        self._sock = socket.create_connection((self._host, self._port))

    def _login(self, username, password):
        self._send('LOGIN', username, password)
        mtype, margs = self._recv()

        #TODO: Other errors
        if mtype == 'LOGIN/FAILURE':
            reason = margs[0]
            if reason == 'Client already logged in':
                raise ClientAlreadyLoggedIn()
            elif reason == 'User already logged in':
                raise UserAlreadyLoggedIn()
            else: 
                raise Exception('Unknown login failure')

        #TODO: Check 'LOGIN/SUCCESS' message type

        return margs


    def _waitForStart(self):
        mtype, margs = self._recv()
        if mtype != 'START':
            raise Exception('Unexpected message type')

        initialState = self._parseState(margs[0])
        movetime = int(margs[1]) / 1000
        return initialState, movetime

    def move(self, *args):
        self._send('MOVE', self._formatMove(*args))
        return self.waitForNextTurn()

    def waitForNextTurn(self):
        mtype, margs = self._recv()
        if mtype != 'NEXT':
            raise Exception('Unexpected message type')
        p1move = self._parseMove(margs[0])
        p2move = self._parseMove(margs[1])
        return (p1move, p2move)

    def _send(self, msgtype, *args):
        text = msgtype + ":" + self._toCsv(*args)
        bytes_ = text.encode('utf-8')
        prefix = struct.pack('!H', len(bytes_))

        self._sock.send(prefix + bytes_)

    def _toCsv(self, *args):
        f = io.StringIO()
        writer = csv.writer(f)
        writer.writerow(args)
        return f.getvalue()

    def _fromCsv(self, line):
        return [row for row in csv.reader(io.StringIO(line))]

    def _recv(self):

        prefix_bytes = bytes()
        while (len(prefix_bytes) < PREFIX_SIZE):
            total_bytes_needed = PREFIX_SIZE - len(prefix_bytes)
            prefix_bytes += self._sock.recv(total_bytes_needed)

        length = struct.unpack_from('!H', prefix_bytes)[0]
        if length == 0:
            raise InvalidMessageFormat('Length prefix is 0')
        if length > MAX_BODY_SIZE:
            raise InvalidMessageFormat('Length prefix is too large')

        body_bytes = bytes() 
        while (len(body_bytes) < length):
            total_bytes_needed = length - len(body_bytes)
            body_bytes += self._sock.recv(total_bytes_needed)

        body = body_bytes.decode('utf-8')
        mtype, argcsv = body.split(':', 1)
        rows = self._fromCsv(argcsv)
        if len(rows) > 1:
            raise InvalidMessageFormat(
                    'Multiple CSV rows received in message body')

        margs = rows[0] if rows else []

        if mtype == 'END':
            result, reason, p1move, p2move = margs
            raise GameEnd(result, reason, 
                          self._parseMove(p1move), self._parseMove(p2move))

        elif mtype == 'INVALID':
            raise InvalidMessageSent(margs[0])

        return (mtype, margs)

    def close(self):
        if self._sock is not None:
            self._sock.close()
        self._loggedIn = False
