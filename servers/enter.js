const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express()
app.disable('x-powered-by');

/*
 *  Internal endpoint, proxied via nginx
 */

const hostname = 'localhost';
const port = 3333;

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
 *  POST https://data.airmash.online/enter
 */

app.post('/', (req, res) => {
  let ip = req.headers['x-real-ip'] || req.connection.remoteAddress;

  let body = '';
  req.on('data', (chunk) => { body += chunk; });

  req.on('end', () => {
    log(ip, JSON.stringify(req.headers), JSON.stringify(body));
    res.status(200).type('json').end('{"result":1}');
  });
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
  log(req.reqid, 'error', e);
  res.status(500).end();
});

/*
 *  Start application
 */

app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
