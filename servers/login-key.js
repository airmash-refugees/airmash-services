const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express()
app.disable('x-powered-by');

/*
 *  Internal endpoint, needs to match nginx configuration
 */

const keyPath = "/key"

const hostname = 'localhost';
const port = 4100;

/*
 *  Data file paths
 */

const secretsPath = path.resolve(__dirname, '../data/secrets.json')

/*
 *  Logging helper
 */

const logfile = path.resolve(__dirname, '../logs', path.basename(__filename, '.js') + '.log');

var errstr = function(err) {
  let obj = {};
  Object.getOwnPropertyNames(err).forEach(name => obj[name] = err[name]);
  return JSON.stringify(obj);
}

var log = function() {
  let parts = [...arguments].map(part => part instanceof Error ? errstr(part) : part);
  let msg = (new Date().toISOString()) + ' | ' + parts.join(' | ') + '\n';
  fs.appendFileSync(logfile, msg, e => {
    console.error(`error writing to log:\n  ${errstr(e)}\n  ${msg}`);
  });
}

/*
 *  Read public key from file
 */

let Ed25519PublicKey;

fs.readFile(secretsPath, function (e, data) {
  if (e) {
    log('error', 'reading secrets', e);
    throw e;
  } else {
    try {
      secrets = JSON.parse(data);
      Ed25519PublicKey = secrets.Ed25519SigningKey.public;
    } catch(e) {
      log('error', 'adding secrets', e);
      throw e;  
    }
  }
});

/*
 *  Log all requests to this service for debugging purposes
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

/*
 *  GET https://login.airmash.online/key
 */

app.get(keyPath, (req, res) => {
  if (Ed25519PublicKey) {
    res.status(200).type('json').end(JSON.stringify({
      key: Ed25519PublicKey
    }));
  } else {
    res.status(500).type('json').end(JSON.stringify({
      error: "Key not found"
    }));
  }
});

/*
 *  Default route
 */

app.use(function (req, res) {
  res.status(204).end();
});

/*
 *  Error handling
 */

app.use(function(err, req, res, next) {
  log(req.reqid, 'error', 'default handler', err);
  res.status(500).end();
});

/*
 *  Start application
 */

app.set('trust proxy', 1);
app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
