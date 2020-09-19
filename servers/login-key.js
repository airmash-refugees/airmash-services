const log = require('./common/logger');
const token = require('./common/token');
const express = require('express');

const app = express();
app.disable('x-powered-by');

/**
 * Internal endpoint, needs to match nginx configuration
 */
const hostname = 'localhost';
const port = 4100;

const keyPath = "/key"

/**
 * Log all requests to this service for debugging purposes
 */
var nextreqid = 1;
app.use((req, res, next) => {
  // nginx passes in remote IP address in X-Real-IP header 
  //   ("proxy_set_header X-Real-IP $remote_addr" in its configuration)
  req.realip = req.headers['x-real-ip'] || req.connection.remoteAddress;

  // request id for log entry correlation
  req.reqid = nextreqid++;

  log(req.reqid, 'request', req.realip, req.method, req.url, JSON.stringify(req.headers));
  next();
});

/**
 * GET https://login.airmash.online/key
 */
app.get(keyPath, (req, res) => {
  if (token.publicKey) {
    res.status(200).type('json').end(JSON.stringify({
      key: token.publicKey
    }));
  } else {
    res.status(500).type('json').end(JSON.stringify({
      error: "Key not available"
    }));
    log('error', 'key not found');
  }
});

/**
 * Default route
 */
app.use(function (req, res) {
  res.status(204).end();
});

/**
 * Error handling
 */
app.use(function(err, req, res, next) {
  log(req.reqid, 'error', 'default handler', err);
  res.status(500).end();
});

/**
 * Start application
 */
app.set('trust proxy', 1);
app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
