"use strict";

function TicTacToe(board) {
  this._moveRegex = /^[1-3],[1-3]$/;

  if (board === undefined) {
    board = '...\n' + 
            '...\n' + 
            '...';
  }

  var rows = board.split('\n');
  if (rows.length !== 3) {
    throw new Error('`board` has incorrect number of rows');
  }

  for (var i = 0; i < 3; i++) {
    var row = rows[i];
    if (row.length !== 3) {
      throw new Error('`board` row ' + (i + 1) + ' has incorrect length');
    }
  }

  var _board = [['.', '.', '.'],
                ['.', '.', '.'],
                ['.', '.', '.']];

  var xCount = 0;
  var oCount = 0;

  for (var r = 0; r < 3; r++) {
    for (var c = 0; c < 3; c++) {
      var row = rows[r];
      var element = row[c];
      if (element === 'X') { 
        xCount++;
      } else if (element === 'O') {
        oCount++;
      } else if (element !== '.') {
        throw new Error('`board` has an invalid element');
      }
      _board[r][c] = element;
    }
  }

  if (xCount < oCount || xCount > oCount + 1) {
    throw new Error('`board` has incorrect number of Xs and Os');
  }

  this._board = _board;
  this._moveNumber = xCount + oCount;

  var p1Win = this._checkWin(true);
  var p2Win = this._checkWin(false);

  if (p1Win && p2Win) {
    throw new Error('`board` has invalid position');
  }

  if (p1Win) {
    this.result = "1-0";
    this.resultReason = "Three in a row";
  } else if (p2Win) {
    this.result = "0-1";
    this.resultReason = "Three in a row";
  } else if (this._moveNumber === 9) {
    this.result = "1/2-1/2";
    this.resultReason = 'Out of squares';
  } else {
    this.result = null;
    this.resultReason = null;
  }

  this._board = _board;
  this._moveNumber = xCount + oCount;
};

TicTacToe.prototype.getState = function getState() {
  var rows = [];
  for (var r = 0; r < 3; r++) {
    var row = '';
    for (var c = 0; c < 3; c++) {
      row += this._board[r][c];
    }
    rows.push(row);
  }
  return rows.join('\n');
}

TicTacToe.prototype._checkWin = function checkWin(forP1) {
  var mark = forP1 ? 'X' : 'O';
  var board = this._board;

  for (var i = 0; i < 3; i++) {
    if (mark === board[i][0] &&
        mark === board[i][1] &&
        mark === board[i][2]) {
      return true;
    }

    if (mark === board[0][i] &&
        mark === board[1][i] &&
        mark === board[2][i]) {
      return true;
    }
  }

  if (mark === board[0][0] &&
      mark === board[1][1] &&
      mark === board[2][2]) {
    return true;
  }

  if (mark === board[0][2] &&
      mark === board[1][1] &&
      mark === board[2][0]) {
    return true;
  }
}

TicTacToe.prototype.start = function start() {
  if (this.result !== null) {
    throw new Error('Game has ended');
  }
  var p1ToMove = this._isP1ToMove();
  return { P1: p1ToMove, P2: !p1ToMove };
}

TicTacToe.prototype._isP1ToMove = function _isP1ToMove() {
  return this._moveNumber % 2 === 0;
}

TicTacToe.prototype.move = function move(value) {

  var p1Move = value.P1;
  var p2Move = value.P2;
  var p1ToMove = this._isP1ToMove();

  var otherMove = p1ToMove ? p2Move : p1Move;
  if (otherMove !== null && otherMove !== undefined) {
    this.result = p1ToMove ? '1-0' : '0-1';
    this.resultReason = 'Invalid move';
    return null;
  }

  var move = p1ToMove ? p1Move : p2Move;
  if (!this._moveRegex.test(move)) {
    this.result = p1ToMove ? '0-1' : '1-0';
    this.resultReason = 'Invalid move';
    return null;
  }

  var coords = move.split(',');
  var r = parseInt(coords[0]) - 1;
  var c = parseInt(coords[1]) - 1;

  this._board[r][c] = p1ToMove ? 'X' : 'O';

  var isWon = this._checkWin(p1ToMove);
  if (isWon) {
    this.result = p1ToMove ? '1-0' : '0-1';
    this.resultReason = 'Three in a row';
    return null;
  }

  this._moveNumber++;
  if (this._moveNumber === 9) {
    this.result = '1/2-1/2';
    this.resultReason = 'Out of squares';
    return null;
  }

  p1ToMove = this._isP1ToMove();

  return {P1: p1ToMove, P2: !p1ToMove};
}

exports.Game = TicTacToe;
