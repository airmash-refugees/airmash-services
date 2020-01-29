const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express()
app.disable('x-powered-by');

/*
 *  Internal endpoint, proxied via nginx
 */

const hostname = 'localhost';
const port = 9999;

/*
 *  Data file paths
 */

const deploymentsPath = path.resolve(__dirname, '../data/ci-deployments.json')

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
 *  Log all requests to this service for debugging purposes
 */

var nextreqid = 1;
app.use((req, res, next) => {
  // nginx passes remote IP address in X-Real-IP header 
  // ("proxy_set_header X-Real-IP $remote_addr" in its configuration)
  req.realip = req.headers['x-real-ip'] || req.connection.remoteAddress;

  // request id for log entry correlation
  req.reqid = nextreqid++;

  log(req.reqid, 'request', req.realip, req.method, req.url, JSON.stringify(req.headers));
  next();
});

/*
 *  Read deployments information from file
 */

var deployments;

fs.readFile(deploymentsPath, function (e, data) {
  if (e) {
    log('error', 'reading deployments', e);
    throw e;
  } else {
    try {
      deployments = JSON.parse(data);
    } catch(e) {
      log('error', 'adding deployments', e);
      throw e;  
    }
  }
});

/*
 *  Helper function to check if requestor is authorised
 */

var isRequestorAuthorised = function(req) {
  let authHeader = req.headers.authorization;
  if (authHeader === undefined) {
    log(req.reqid, 'error', 'authorization header missing');
    return false;  
  }

  // Authorization: Basic credentials
  let authHeaderParts = authHeader.split(' ');
  if (authHeaderParts.length !== 2 || authHeaderParts[0].toLowerCase() !== 'basic') {
    log(req.reqid, 'error', 'authorization header scheme invalid', JSON.stringify(authHeader));
    return false;
  }

  // only one set of credentials at present, so just compare the base64 blob
  if (!crypto.timingSafeEqual(Buffer.from(authHeaderParts[1]), Buffer.from(deployments.credentials))) {
    log(req.reqid, 'error', 'credentials invalid');
    return false;
  }

  return true;
}

/*
 *  POST https://data.airmash.online/ci
 */

app.post('/', (req, res) => {
  if (!isRequestorAuthorised(req)) {
    log(req.reqid, 'error', 'not authorised');
    return res.status(401).end();  
  }

  req.on('data', () => {});

  req.on('end', () => {
    log(req.reqid, 'ci', req.headers.buildnumber, req.headers.deployto);

    let target = deployments.targets[req.headers.deployto];
    if (!target) {
      log(req.reqid, 'error', 'unrecognised deployto');
      return res.status(400).end();  
    }

    let buildId = Number(req.headers.buildnumber);
    if (isNaN(buildId)) {
      log(req.reqid, 'error', 'buildnumber is not a number', JSON.stringify(req.headers.buildnumber));
      return res.status(400).end();  
    }

    log(req.reqid, 'cmd', 'starting');
    const cmd = spawn('bash', [ target.script, buildId + '' ]);

    cmd.stdout.on( 'data', data => {
      log(req.reqid, 'cmd', 'stdout', JSON.stringify(data.toString()));
    });

    cmd.stderr.on( 'data', data => {
      log(req.reqid, 'cmd', 'stderr', JSON.stringify(data.toString()));
    });

    cmd.on( 'exit', code => {
      log(req.reqid, 'cmd', 'exit', code);
      if (code === 0) {
        log(req.reqid, 'deployment success');
        res.status(200).type('json').end('deployed');
      } else {
        log(req.reqid, 'deployment failure');
        res.status(500).type('json').end('error in deployment');
      }
    });
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

app.use(function(err, req, res) {
  log(req.reqid, 'error', err);
  res.status(500).end();
});

/*
 *  Start application
 */

app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
