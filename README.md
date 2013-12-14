#Grebe

## Description

Grebe is a turn based game TCP server that is intended to be used for 
'AI games' (e.g. [Google AI Challenge](http://aichallenge.org/)).

The server hosts a single game between two players. Time control is a single
time limit for each move. 

The server takes care of authenticating the players, communicating with 
participants and managing the game turns. 

The actual the game logic is implemented as a separate Node.js module. 
Currently, only tic-tac-toe is implemented and the API for game modules 
hasn't been finalized yet.

Grebe will also support a set of client libraries that can be used to 
communicate with the server. Only a Python 3 library is included right now.
The protocol will be fully documented so that people can implement their own 
libraries but it is still a draft.

## Trying it out

Here are instructions on running a game of tic-tac-toe with random players:

1. Clone the project
2. Install Node.js - nodejs.org
3. Install Python 3 - python.org
4. Open three terminals in the project root
5. Start the server in the first one: 
   `node server/server.js samples/tictactoe/server/game.js A B`
6. Start Player 1: 
   `python3 samples/tictactoe/players/Python/random_player.py A localhost`
7. Start Player 2: 
   `python3 samples/tictactoe/players/Python/random_player.py B localhost`
