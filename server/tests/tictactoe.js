"use strict";

var TicTacToe = require('../tictactoe.js').TicTacToe;

exports.testCtorThrowsWhenBoardBadLength = function(test) {
  test.throws(
    function() {
      new TicTacToe('...\n' + 
                    '...');     
    }, 
    /`board` has incorrect number of rows/);

  test.done();
}

exports.testCtorThrowsWhenBoardRowHasBadLength = function(test) {
  test.throws(
    function() {
      new TicTacToe('...\n' + 
                    '..\n' + 
                    '...');
    },
    /`board` row 2 has incorrect length/);

  test.done();
}

exports.testCtorThrowsWhenBoardHasInvalidElement = function(test) {
  test.throws(
    function() {
      new TicTacToe('...\n' + 
                    '.f.\n' + 
                    '...');
    },
    /`board` has an invalid element/);

  test.done();
}

exports.testCtorThrowsWhenTooManyXs = function(test) {
  test.throws(
    function() {
      new TicTacToe('XX.\n' + 
                    '.OX\n' + 
                    '...');
    },
    /`board` has incorrect number of Xs and Os/);

  test.done();
}


exports.testCtorThrowsWhenTooFewXs = function(test) {
  test.throws(
    function() {
      new TicTacToe('XO.\n' + 
                    '.O.\n' + 
                    '...');
    },
    /`board` has incorrect number of Xs and Os/);

  test.done();
}

exports.testCtorThrowsWhenBothSidesWin = function(test) {
  test.throws(
      function() {
        new TicTacToe('XXX\n' + 
                      'OOO\n' +
                      '...');
      },
      /`board` has invalid position/);

  test.done();
}

exports.testCtorP1Win = function(test) {
  var game = new TicTacToe('XXX\n' + 
                           'OO.\n' + 
                           '...');
  test.equal(game.result, '1-0');
  test.equal(game.resultReason, 'Three in a row');
  test.throws(
    function() { game.start(); },
    /Game has ended/);

  test.done();
}

exports.testCtorP2Win = function(test) {
  var game = new TicTacToe('XX.\n' + 
                           'OOO\n' + 
                           '.X.');
  test.equal(game.result, '0-1');
  test.equal(game.resultReason, 'Three in a row');
  test.throws(
    function() { game.start(); },
    /Game has ended/);

  test.done();
}

exports.testCtorDraw = function(test) {
  var game = new TicTacToe('XXO\n' + 
                           'OOX\n' + 
                           'XOX');
  test.equal(game.result, '1/2-1/2');
  test.equal(game.resultReason, 'Out of squares');
  test.throws(
    function() { game.start(); },
    /Game has ended/);

  test.done();
}

exports.testGetState = function(test) {
  var board = 'XX.\n' + 
              '.O.\n' +
              '...';
  var game = new TicTacToe(board);
  test.equal(game.getState(), board); 

  test.done();
}

exports.testDefaultInitialState = function(test) {
  var game = new TicTacToe();
  test.equal(
    game.getState(),
    '...\n' + 
    '...\n' + 
    '...');

  test.done();
}

exports.testStartWhenP1ToMove = function(test) {
  var game = new TicTacToe('O..\n' + 
                           '.X.\n' + 
                           '...');
  test.deepEqual(game.start(), { P1: true, P2: false });

  test.done();
}

exports.testStartWhenP2ToMove = function(test) {
  var game = new TicTacToe('O..\n' + 
                           '.X.\n' + 
                           '..X');
  test.deepEqual(game.start(), { P1: false, P2: true });

  test.done();
}

exports.testMoveForP1 = function(test) {
  var game = new TicTacToe('O..\n' + 
                           '.X.\n' +
                           '...');
  var toMove = game.move({P1: '3,3', P2: null});
  
  test.equal(
      game.getState(),
      'O..\n' + 
      '.X.\n' + 
      '..X');
  test.deepEqual(toMove, {P1: false, P2: true});

  test.done();
}

exports.testMoveForP2 = function(test) {
  var game = new TicTacToe('...\n' + 
                           '.X.\n' + 
                           '...');
  var toMove = game.move({P1: null, P2: '1,1'});

  test.equal(
      game.getState(),
      'O..\n' + 
      '.X.\n' + 
      '...');
  test.deepEqual(toMove, {P1: true, P2: false});

  test.done();
}

exports.testMoveThrowsWhenInvalidFormat = function(test) {
  var messageRegex = /Move has invalid format/;

  var testMove = function(move) {
    var game = new TicTacToe();
    var toMove = game.move({P1: move});
    test.equal(null, toMove);
    test.equal('0-1', game.result);
    test.equal('Invalid move', game.resultReason);
  }

  testMove('-');
  testMove('1,0');
  testMove('0,1');
  testMove('1.5,1');
  testMove('1,1.5');
  testMove('1,4');
  testMove('4,1');
  testMove('4,1');
  testMove('1 , 4');
  testMove(' 1,4 ');

  test.done();
}

exports.testPlayerMovesWhenNotHisTurn = function(test) {
  var game = new TicTacToe();
  var toMove = game.move({P1: '2,2', P2: '1,1' });

  test.equal(null, toMove);
  test.equal(game.result, '1-0');
  test.equal(game.resultReason, 'Invalid move');

  test.done();
}

exports.testPlayerMissesHisMove = function(test) {
  var game = new TicTacToe();
  var toMove = game.move({P1: null });

  test.equal(null, toMove);
  test.equal(game.result, '0-1');
  test.equal(game.resultReason, 'Invalid move');

  test.done();
}

exports.testP1PlaysWinningMove = function(test) {
  var game = new TicTacToe('XX.\n' + 
                           'OO.\n' +
                           '...');

  var toMove = game.move({P1: '1,3'});

  test.equal(
      game.getState(),
      'XXX\n' + 
      'OO.\n' +
      '...');
  
  test.equal(toMove, null);
  test.equal(game.result, '1-0');
  test.equal(game.resultReason, 'Three in a row');

  test.done();
}

exports.testP2PlaysWinningMove = function(test) {
  var game = new TicTacToe('XX.\n' + 
                           'OO.\n' +
                           'X..');

  var toMove = game.move({P2: '2,3'});

  test.equal(
      game.getState(),
      'XX.\n' + 
      'OOO\n' +
      'X..');
  
  test.equal(toMove, null);
  test.equal(game.result, '0-1');
  test.equal(game.resultReason, 'Three in a row');

  test.done();
}

exports.testP1PlaysDrawingMove = function(test) {
  var game = new TicTacToe('XXO\n' + 
                           'OOX\n' + 
                           'XO.');

  var toMove = game.move({P1: '3,3'});

  test.equal(
    game.getState(),
    'XXO\n' + 
    'OOX\n' + 
    'XOX');

  test.equal(toMove, null);
  test.equal(game.result, '1/2-1/2');
  test.equal(game.resultReason, 'Out of squares');

  test.done();
}

exports.testSampleGame1 = function(test) {
  var game = new TicTacToe();

  game.move({P1: '2,2'});
  game.move({P2: '3,1'});
  game.move({P1: '1,3'});
  game.move({P2: '2,1'});
  game.move({P1: '1,1'});
  game.move({P2: '1,2'});
  game.move({P1: '3,3'});

  test.equal(
    game.getState(),
    'XOX\n' + 
    'OX.\n' + 
    'O.X');
  test.equal(game.result, '1-0');
  test.equal(game.resultReason, 'Three in a row');

  test.done();
}

exports.testSampleGame2 = function(test) {
  var game = new TicTacToe();

  game.move({P1: '3,1'});
  game.move({P2: '2,1'});
  game.move({P1: '3,3'});
  game.move({P2: '3,2'});
  game.move({P1: '1,3'});
  game.move({P2: '2,2'});
  game.move({P1: '2,3'});

  test.equal(
    game.getState(),
    '..X\n' + 
    'OOX\n' + 
    'XOX');
  test.equal(game.result, '1-0');
  test.equal(game.resultReason, 'Three in a row');

  test.done();
}
