"use strict";

var csv = require('csv-string');
var events = require('events');
var util = require('util');

var PREFIX_LENGTH = 2;
var MAX_BODY_LENGTH = 510;

function Client(connection) {
  events.EventEmitter.call(this);

  this.username = null;
  this.role = null;

  this._connection = connection;
  this._isAuthenticated = false;
  this.isDisconnected = false;

  this._inBodyLength = 0;
  this._inHandlers = {
    'LOGIN' : this._handleLogIn.bind(this),
    'MOVE' : this._handleMove.bind(this)
  };

  this._outBuffer = new Buffer(PREFIX_LENGTH + MAX_BODY_LENGTH);
  
  connection.on('readable', this._handleReadable.bind(this));
  connection.on('error', this._handleError.bind(this));
  connection.on('close', this._handleClose.bind(this));
};

util.inherits(Client, events.EventEmitter);

Client.prototype.authenticate = function authenticate(role) {
  this.role = role;
  this._isAuthenticated = true;

  this._sendLoginSuccess(role);
};

Client.prototype.denyAuthentication = function denyAuthentication(reason) {
  this._sendLogInFailureAndDisconnect(reason); 
};

Client.prototype.sendGameEndAndDisconnect = 
  function sendGameEndAndDisconnect(result, reason, moves) {

  this._sendGameEnd(result, reason, moves.P1, moves.P2);
  this._disconnect();
};

Client.prototype.sendInvalidAndDisconnect = 
  function sendInvalidAndDisconnect(reason) {

  this._sendInvalid(reason);
  this._disconnect();
};

Client.prototype._handleReadable = function _handleReadable() {

  if (this._inBodyLength === 0) {
    var prefixBytes = this._connection.read(2);
    if (prefixBytes === null) {
      return;
    }
    var lengthInput = prefixBytes.readUInt16BE(0);
    var isOutOfRange = lengthInput === 0 || lengthInput > MAX_BODY_LENGTH;
    if (isOutOfRange) {
      this._sendInvalidAndDisconnect('Prefix shows valid length prefix');
      return;
    }
    this._inBodyLength = lengthInput;
  }

  var bytes = this._connection.read(this._inBodyLength);
  if (bytes === null) {
    return;
  }
  this._inBodyLength = 0;

  //Note: Buffer.toString(...) ignores utf-8 decoding errors and
  //    I can't find a way to validate that the encoding is correct.
  var message = bytes.toString();
  var colonIndex = message.indexOf(':');
  if (colonIndex === -1) {
    this._sendInvalidAndDisconnect('Body has invalid format - no colon.');
    return;
  }

  var mtype = message.substring(0, colonIndex);
  if (!(mtype in this._inHandlers)) {
    this._sendInvalidAndDisconnect('Invalid message type');
    return;
  }

  var mbody = message.substring(colonIndex + 1);
  var margs = csv.parse(mbody)[0];

  this._inHandlers[mtype](margs);
};

Client.prototype._handleError = function _handleError(error) {
  if (error.code === 'ECONNRESET') {
    // Will be handled by _handleClose
    return;
  }
  throw error;
};

Client.prototype._handleClose = function _handleClose(hadError) {
  this.isDisconnected = true;
  this.emit('disconnect', this);
};

Client.prototype._handleLogIn = function _handleLogIn(args) {
  if (args.length !== 2) {
    this._sendInvalidAndDisconnect(
        'Incorrect number of arguments for LOGIN');
    return;
  }
  var username = args[0];
  var password = args[1];

  if (typeof username !== 'string' ||
      username.length === 0 ||
      username !== username.trim() ||
      !/^[a-zA-Z0-9 ]+$/.test(username)) {
    this._sendLogInFailureAndDisconnect('Bad username');
    return;
  }

  if (this._isAuthenticated) {
    this._sendLogInFailureAndDisconnect('Client already logged in');
    return;
  }

  this.username = username;
  this.emit('authRequest', this, username, password);
};

Client.prototype._handleMove = function _handleMove(args) {
  if (args.length !== 1) {
    this._sendInvalidAndDisconnect(
        'Incorrect number of arguments for MOVE');
    return;
  }
  //TODO: Check args length etc.
  this.emit('move', this, args[0]);
};

Client.prototype._sendInvalidAndDisconnect = 
    function _sendInvalidAndDisconnect(reason) {

  this.sendInvalidAndDisconnect(reason);

  this.emit('invalidMessage', this);
};

Client.prototype._sendLogInFailureAndDisconnect = 
    function _sendLogInFailureAndDisconnect(reason) {

  this._sendLoginFailure(reason);

  this._disconnect();
};

Client.prototype._sendMessage = function _sendMessage(type, args) {
  if (this.isDisconnected) {
    return;
  }

  var body = type + ':' + csv.stringify(args).trim();

  var bodyLength = Buffer.byteLength(body);
  if (bodyLength > MAX_BODY_LENGTH) {
    throw new Error('Message byte length exceeds MAX_BODY_LENGTH.');
  }

  this._outBuffer.writeUInt16BE(bodyLength, 0);
  this._outBuffer.write(body, 2);

  try {
    this._connection.write(this._outBuffer.slice(0, bodyLength + 2));
  } catch (error) {
    if (error.code === 'EPIPE') {
      // Handled by 'close' event handler
      return;
    }

    throw error;
  }
};

Client.prototype.sendNextTurn = function sendNextTurn(moves) {
  this._sendMessage('NEXT', [moves.P1, moves.P2]);
};

function createSendFunc(mtype) {
  return function() {
    this._sendMessage(mtype, arguments);
  };
};

Client.prototype._sendInvalid = createSendFunc('INVALID');
Client.prototype._sendLoginFailure = createSendFunc('LOGIN/FAILURE');
Client.prototype._sendLoginSuccess = createSendFunc('LOGIN/SUCCESS');
Client.prototype._sendGameEnd = createSendFunc('END');

Client.prototype.sendGameStart = createSendFunc('START');

Client.prototype._disconnect = function _disconnect() {
  this.isDisconnected = true;
  this._connection.end();
};

exports.Client = Client;
