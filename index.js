'use strict';

var
  http           = require('http'),
  https          = require('https'),
  _              = require('lodash'),
  events         = require('events'),
  util           = require('util'),
  url            = require('url')
;

var ORIGINALS;
function saveGlobals() {
  ORIGINALS = {
    http: _.pick(http, 'request'),
    https: _.pick(https, 'request')
  };
}

function resetGlobals() {
  _.assign(http, ORIGINALS.http);
  _.assign(https, ORIGINALS.https);
  globalLogSingleton.isEnabled = false;
}

var GlobalLog = function () {
  this.isEnabled = false;
  events.EventEmitter.call(this);
};
util.inherits(GlobalLog, events.EventEmitter);

var globalLogSingleton = module.exports = new GlobalLog();


function attachLoggersToRequest(protocol, options, callback) {
  var httporhttps = this;
  var req = ORIGINALS[protocol].request.call(httporhttps, options, callback);

  var logInfo = {
    request: {},
    response: {}
  };

  // Extract request logging details
  if (typeof options === 'string') {
    _.assign(logInfo.request, url.parse(options));
  } else if (typeof options === 'object') {
    _.assign(logInfo.request, options);
  }
  logInfo.request.method = req.method || 'get';
  logInfo.request.headers = req._headers;

  // todo - how do we get the request body

  req.on('error', function (error) {
    logInfo.request.error = error;
    globalLogSingleton.emit('error', logInfo.request, logInfo.response);
  });

  req.on('response', function (res) {
    _.assign(logInfo.response, _.pick(res, 'statusCode', 'headers', 'trailers', 'httpVersion', 'url', 'method'));

    var responseData = [];
    res.on('data', function (data) {
      // todo - put the check for max length here
      responseData[responseData.length] = data;
    });
    res.on('end', function () {
      logInfo.response.body = responseData.toString();
      globalLogSingleton.emit('success', logInfo.request, logInfo.response);
    });
    res.on('error', function (error) {
      logInfo.response.error = error;
      globalLogSingleton.emit('error', logInfo.request, logInfo.response);
    });
  });

  return req;
}


GlobalLog.prototype.initialize = function (options) {
  options = options || {};
  _.defaults(options, {
    maxBodyLength: 1024 * 1000 * 3
  });
  globalLogSingleton.maxBodyLength = options.maxBodyLength;


  try {
    saveGlobals();
    http.request = attachLoggersToRequest.bind(http, 'http');
    https.request = attachLoggersToRequest.bind(https, 'https');
    globalLogSingleton.isEnabled = true;
  } catch (e) {
    resetGlobals();
    throw e;
  }
};

GlobalLog.prototype.end = function () {
  resetGlobals();
};
