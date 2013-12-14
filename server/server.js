"use strict";

var crypto = require('crypto');
var docopt = require('docopt');
var fs = require('fs');
var net = require('net');
var path = require('path');

var Client = require('./client.js').Client;

var pkg = require('./package.json');
var semver = require('semver');

if(!semver.satisfies(process.version, pkg.engines.node)) {
  console.log('Script requires node.js version ' + pkg.engines.node);
  process.exit(1);
}

var doc = (
'Usage: server.js GAME P1 P2 [options]\n' +
'\n' + 
'Runs the server for a single match between two players.\n' + 
'\n' +
'Arguments:\n' + 
'  GAME Path to the game module\n' +
"  P1   Player 1's username\n" +
"  P2   Player 2's username\n" +
'\n' +
'Options:\n' +
'  -h --help      Show help\n' + 
'  --port PORT    The port to use [default: 13579]\n' + 
'  --movetime MS  The time limit per move in milliseconds [default: 1000]\n'
);

var input = docopt.docopt(doc);
var gameModulePath = path.resolve(input['GAME']);
var p1Username = input['P1'];
var p2Username = input['P2'];

var port = parseInt(input['--port'], 10);
if (isNaN(port) || port <= 0 || port > 65535) {
  console.log('Invalid port');
  process.exit(1);
} 

var movetime = parseInt(input['--movetime'], 10);
if (isNaN(movetime) || movetime <= 0) {
  console.log('Invalid movetime');
  process.exit(1);
}

try {
  var Game = require(gameModulePath).Game;
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('Game module not found');
    process.exit(1);
  }
  throw error;
}

var loggedInUsernames = [];
var p1 = null;
var p2 = null;
var spectators = [];

var game = null;
var gameStarted = false;
var gameEnded = false;
var turnNumber = 0;
var toMove = {P1: false, P2: false};
var moves = {P1: null, P2: null};

var startHRTime = null;
function gametime() {
  var diff = process.hrtime(startHRTime);
  return Math.floor(diff[0] * 1e3 + diff[1] / 1e6);
}

function startGame() {
  console.log('Starting game')
  gameStarted = true;
  startHRTime = process.hrtime();

  game = new Game();
  toMove = game.start();

  turnNumber++;
  console.log(gametime() + ': Turn ' + turnNumber);

  var clients = getFairClientList();
  var initialState = game.getState();
  for (var i = 0; i < clients.length; i++) {
    clients[i].sendGameStart(initialState, movetime);
  }

  setTimeout(makeTimeout(turnNumber), movetime);
}

function nextTurn() {
  if (gameEnded) {
    return;
  }

  toMove = game.move(moves);

  if (toMove === null) {
    endGame(game.result, game.resultReason, moves);
    return;
  }

  turnNumber++;
  console.log(gametime() + ': Turn ' + turnNumber);

  var lastMoves = moves;
  moves = { P1: null, P2: null };
  
  var clients = getFairClientList();
  for (var i = 0; i < clients.length; i++) {
    clients[i].sendNextTurn(lastMoves);
  }

  setTimeout(makeTimeout(turnNumber), movetime);
}

function endGame(result, reason, moves) {
  if (gameEnded) {
    return;
  }
  gameEnded = true;
  console.log(gametime() + ': Result ' + result + ' (' + reason + ')' )

  var clients = getFairClientList();
  for (var i = 0; i < clients.length; i++) {
    clients[i].sendGameEndAndDisconnect(result, reason, moves);
  }

  server.close();
}

function makeTimeout(turnNumber) {
  var created = gametime();
  return function() {
    timeout(turnNumber, created);
  }
}

function timeout(turnNumber_, created) {
  if (gameEnded) {
    return;
  }

  if (turnNumber_ != turnNumber) {
    return;
  }

  var p1Disqualified = toMove.P1 && moves.P1 === null;
  var p2Disqualified = toMove.P2 && moves.P2 === null; 
  
  if (p1Disqualified && p2Disqualified) {
    // TODO: Game drawn
  } else if (p1Disqualified) {
    endGame('0-1', 'P1 exceeded move time limit', moves)
  } else if (p2Disqualified) {
    endGame('1-0', 'P2 exceeded move time limit', moves)
  } else {
    throw new Error('timeout ran but no one was disqualified.');
  }
}

function getFairClientList() {
  var result = [];

  var randomByte = crypto.randomBytes(1).readUInt8(0);
  if (randomByte % 2 === 0) {
    result.push(p1);
    result.push(p2);
  } else {
    result.push(p2);
    result.push(p1);
  }

  for (var i = 0; i < spectators.length; i++) {
    result.push(spectators[i]);
  }

  return result;
}

function lossFor(player) {
  return player === p1 ? '0-1' : '1-0';
}

function winFor(player) {
  return player === p1 ? '1-0' : '0-1';
}

function handleConnection(socket) {
  var client = new Client(socket, 'client1');

  client.on('authRequest', function(client, username, password) {
    //TODO: Proper password checking
  
    if (loggedInUsernames.indexOf(username) > -1) {
      //TODO: Get the existing client, if it's disconnected
      //      replace it instead of denying
      client.denyAuthentication('User already logged in');
      return;
    }

    var role;
    if (username === p1Username) {
      console.log('P1 logged in');
      role = 'P1';
      p1 = client;
    } else if (username === p2Username) {
      console.log('P2 logged in');
      role = 'P2';
      p2 = client;
    } else {
      role = 'Spectator';
      spectators.push(client);
    }
    
    loggedInUsernames.push(username);
    client.authenticate(role);

    if (p1 !== null && !p1.isDisconnected && 
        p2 !== null && !p2.isDisconnected) {
      startGame();
    }
  });

  client.on('disconnect', function(client, reason) {
    if (gameEnded) {
      return;
    }

    var index = loggedInUsernames.indexOf(client.username);
    if (index > -1) {
      console.log(client.role + ' disconnected')
      loggedInUsernames.splice(index, 1);
    }

    if (!gameStarted) {
      return;
    }

    if (client === p1 || client === p2) {
      endGame(
        lossFor(client),
        (client === p1 ? 'P1' : 'P2') + ' disconnected', 
        moves);  
    }
  });

  client.on('move', function(client, move) {
    if (!gameStarted) {
      client.sendInvalidAndDisconnect('Not logged in');
      return;
    }

    if (gameEnded) {
      return;
    }

    var time = gametime();
    var role = client.role;
    console.log(time + ': ' + role + ' ' + move);

    if (!toMove[role]) {
      endGame(
        lossFor(client),
        role + ' moved when not allowed to', 
        moves);
    }

    moves[role] = move;
    //TODO: Broadcast moves to specators

    if ((!toMove.P1 || moves.P1 !== null) &&
        (!toMove.P2 || moves.P2 !== null)) {
      nextTurn();
    }
  });

  client.on('invalidMessage', function(client, reason) {
    if (gameEnded) {
      return;
    }

    if (client === p1 || client === p2) {
      endGame(
        client === p1 ? '0-1' : '1-0',
        (client === p1 ? 'P1' : 'P2') + ' sent an invalid message', 
        moves);
    }
  });
};

var server = net.createServer(handleConnection);

server.on('error', function handleError(error) {
  if (error.code === 'EADDRINUSE') {
    console.error('Port already in use');
    process.exit(1);
  }
  throw error;
});

server.listen(port, function handleListen() {
  console.log('Server started');
});
