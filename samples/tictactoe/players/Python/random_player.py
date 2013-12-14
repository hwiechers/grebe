#!python3

import os
import random
import sys

from os.path import (abspath, dirname, join, normpath)

proj_root = normpath(join(abspath(sys.path[0]), '../../../..'))
sys.path.append(join(proj_root, 'clients/Python'))
sys.path.append(join(proj_root, 'samples/tictactoe/clients/Python'))

import grebe
from tictactoe import TicTacToe

if not (3 <= len(sys.argv) <= 4):
    print('Invalid number of args', file=sys.stderr)
    sys.exit(1)

username = sys.argv[1]
server = sys.argv[2]
port = int(sys.argv[3]) if len(sys.argv) == 4 else 13579

client = TicTacToe(server, port)

open_cells = [(r,c) for r in (1,2,3) for c in (1,2,3)]

try:
    role, _, _ = client.login(username, '')

    if role == 'P1':
        move = random.choice(open_cells)
        open_cells.remove(move)
        client.move(*move)

    while True:
        p1move, p2move = client.waitForNextTurn()
        opmove = p2move if role == 'P1' else p1move
        open_cells.remove(opmove)

        move = random.choice(open_cells)
        open_cells.remove(move)
        client.move(*move)

except grebe.GameEnd:
    pass


