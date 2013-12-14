#! python3

import os
import sys

from os.path import (abspath, dirname, join, normpath)

proj_root = normpath(join(abspath(sys.path[0]), '../../../..'))
sys.path.append(join(proj_root, 'clients/Python'))

from grebe import Client

class TicTacToe(Client):

    def _formatMove(self, *args):
        return '{},{}'.format(*args); 

    def _parseMove(self, value):
        if not value:
            return None

        components = value.split(',')
        return (int(components[0]), int(components[1]))

    def _parseState(self, value):
        return tuple(tuple(row) for row in value.split())

    def move(self, row, column):
        super().move(row, column)
