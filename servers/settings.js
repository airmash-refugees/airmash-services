const log = require('./common/logger');
const express = require('express');
const crypto = require('crypto');
const db = require('./common/database');
const token = require('./common/token');

const app = express();
app.disable('x-powered-by');

/**
 *  Internal endpoint, proxied via nginx
 */
const hostname = 'localhost';
const port = 7777;

/**
 *  Upper limit on settings data, per player
 */
const SETTINGS_MAX_SIZE = 8192;

/**
 * Log all requests to this service for debugging purposes
 */
let nextreqid = 1;
app.use((req, res, next) => {
  // nginx passes remote IP address in X-Real-IP header 
  // ("proxy_set_header X-Real-IP $remote_addr" in its configuration)
  req.realip = req.headers['x-real-ip'] || req.connection.remoteAddress;

  // request id for log entry correlation
  req.reqid = nextreqid++;

  log(req.reqid, 'request', req.realip, req.method, req.url, JSON.stringify(req.headers));
  next();
});

/**
 * Check if requestor is authenticated and if so, return user id
 */
function getUserIdFromAuthToken(req) {
  let authHeader = req.headers.authorization;
  if (authHeader === undefined) {
    return null;  
  }

  /* "Authorization: Bearer token" */
  let authHeaderParts = authHeader.split(' ');
  if (authHeaderParts.length !== 2 || authHeaderParts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  const authToken = authHeaderParts[1];

  let auth;
  try {
    auth = token.validate(authToken, 'settings');
  } catch(err) {
    if (err.name == "TokenValidationError") {
      log(req.reqid, 'error', 'token validation', err.message, JSON.stringify(authToken));
    }
    else {
      log(req.reqid, 'error', err);
    }

    return null;
  }

  /* User id and timestamp must be specified in token data */
  if (undefined === auth.uid ||
      undefined === auth.ts || 
      undefined === auth.for) {
    log(req.reqid, 'error', 'required fields not present in token data', JSON.stringify(data));
    return null;
  }

  /* Check user id type */
  if (typeof auth.uid !== 'string') {
    log(req.reqid, 'error', 'uid field must be a string', JSON.stringify(auth));
    return null;
  }

  /* Check timestamp type */
  if (typeof auth.ts !== 'number') {
    log(req.reqid, 'error', 'ts field must be a number', JSON.stringify(auth));
    return null;
  }

  return auth.uid;
}

/**
 * Remove settings that must not be persisted
 * 
 * Privacy defence in depth; the client should not be trying to save these settings
 */
function filterSettings(settings) {
  delete settings.clienttoken;
  delete settings.identityprovider;
  delete settings.loginname;
  delete settings.playerid;

  return settings;
}

/**
 * GET https://airmash.online/settings
 */
app.get('/', (req, res) => {
  let userId = getUserIdFromAuthToken(req);
  if (!userId) {
    log(req.reqid, 'error', 'not authorised');
    return res.status(401).end();  
  }

  let data;
  try {
    data = db.userSettings.get(userId);
  } catch(e) {
    log(req.reqid, 'error', 'reading settings from database', e);
    return res.status(500).end();  
  }

  let json;
  if (data && data.settings) {
    try {
      json = JSON.stringify(filterSettings(JSON.parse(data.settings)));
      log(req.reqid, 'settings read', json);
    } catch(e) {
      log(req.reqid, 'error', 'settings not valid json', e, JSON.stringify(data.settings));
      return res.status(400).end();
    }
  }
  else
  {
    json = '{}';
    log(req.reqid, 'settings empty', json);
  }

  return res.type('json').send(json).end();
});

/**
 * POST https://airmash.online/settings
 */
app.post('/', (req, res) => {
  let userId = getUserIdFromAuthToken(req);
  if (!userId) {
    log(req.reqid, 'error', 'not authorised');
    return res.status(401).end();  
  }

  let body = '';

  req.on('data', function (chunk) {
      body += chunk;

      if (body.length > SETTINGS_MAX_SIZE) {
        log(req.reqid, 'error', 'body too large');
        return res.status(400).end();
      }
  });

  req.on('end', function () {
    let settings;
    try {
      settings = JSON.parse(body);
    } catch(e) {
      log(req.reqid, 'error', 'body not valid json', e, JSON.stringify(body));
      return res.status(400).end();
    }

    let result = 1;
    try {
      let json = JSON.stringify(filterSettings(settings));
      log(req.reqid, 'settings write', userId, json);
      let info = db.userSettings.set(userId, json);
      if (info.changes != 1) {
        log(req.reqid, 'error', 'writing settings updated ' + info.changes + ' rows in player database');
        result = 0;
      }
    } catch(e) {
      log(req.reqid, 'error', 'settings write', e);
      result = 0;
    }

    res.type('json').send(JSON.stringify({result:result})).end();    
  });
});

/**
 *  Start application
 */
app.set('trust proxy', 1);
app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});      
