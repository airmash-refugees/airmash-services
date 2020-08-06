const log = require('./common/logger');
const express = require('express');

const app = express()
app.disable('x-powered-by');

/*
 *  Internal endpoint, proxied via nginx
 */

const hostname = 'localhost';
const port = 5555;

/*
 *  POST https://data.airmash.online/clienterror
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
  log(req.reqid, 'error', err);
  res.status(500).end();
});

/*
 *  Start application
 */

app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
