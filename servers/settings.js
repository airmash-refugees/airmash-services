const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express()
app.disable('x-powered-by');

/*
 *  Internal endpoint, proxied via nginx
 */

const hostname = 'localhost';
const port = 7777;

/*
 *  Database path
 */

const playersDatabasePath = path.resolve(__dirname, '../data/players.db')

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
*  Set up player database and prepare statements
*/

const db = require('better-sqlite3')(playersDatabasePath);
db.pragma('synchronous = FULL');

db.exec("create table if not exists settings ( user_id text not null primary key, client_settings text )");

const stmtGetSettingsForUserId = db.prepare('select client_settings from settings where user_id = ?');
const stmtSetSettingsForUserId = db.prepare('insert into settings (user_id, client_settings) values (?,?) ' 
                                          + 'on conflict(user_id) do update set client_settings = excluded.client_settings');

/*
 *  Public key from login.airmash.online, retrieved later
 */

var loginPublicKey;

/*
 *  Upper limit on settings data, per player
 */

const SETTINGS_MAX_SIZE = 1024;

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
 *  Helper function for checking if requestor is authenticated
 */

var getUserIdFromAuthToken = function(req) {
  let authHeader = req.headers.authorization;
  if (authHeader === undefined) {
    return null;  
  }

  // "Authorization: Bearer token"
  let authHeaderParts = authHeader.split(' ');
  if (authHeaderParts.length !== 2 || authHeaderParts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  // token must be two base64 strings separated by a dot
  let token = authHeaderParts[1];
  let tokenParts = token.split('.');
  if (tokenParts.length !== 2) {
    return null;
  }

  // first part is data, second part is signature
  let data = tokenParts[0], auth;
  let signature = tokenParts[1];
  try {
    data = Buffer.from(data, 'base64');
    signature = Buffer.from(signature, 'base64');
    auth = JSON.parse(data);
  } catch(e) {
    log(req.reqid, 'error', 'cannot parse token', e, token);
    return null;
  }

  // user id, timestamp, and purpose must be specified in token
  if (undefined === auth.uid ||
      undefined === auth.ts || 
      undefined === auth.for) {
    log(req.reqid, 'error', 'required fields not present in token data', JSON.stringify(data));
    return null;
  }

  // check uid type
  if (typeof auth.uid !== 'string') {
    log(req.reqid, 'error', 'uid field must be a string', JSON.stringify(auth));
    return null;
  }

  // check ts type
  if (typeof auth.ts !== 'number') {
    log(req.reqid, 'error', 'ts field must be a number', JSON.stringify(auth));
    return null;
  }
  
  // purpose of token must be settings
  if (auth.for !== "settings") {
    log(req.reqid, 'error', 'token purpose is incorrect', JSON.stringify(auth));
    return null;
  }

  // ed25519 signature must be exactly 64 bytes long
  if (signature.length !== 64) {
    log(req.reqid, 'error', 'invalid signature length', token);
    return null;
  }

  // verify signature
  if (!crypto.verify(null, data, loginPublicKey, signature)) {
    log(req.reqid, 'error', 'signature not verified', token);
    return null;
  }

  return auth.uid;
}

/*
 *  Helper function to remove settings that must not be persisted
 */

var filterSettings = function(settings) {
  
  // privacy defence in depth, the client should not be trying to save these settings
  delete settings.clienttoken;
  delete settings.identityprovider;
  delete settings.loginname;
  delete settings.playerid;

  return settings;
}

/*
 *  GET https://airmash.online/settings
 */

app.get('/', (req, res) => {
  let userId = getUserIdFromAuthToken(req);
  if (!userId) {
    log(req.reqid, 'error', 'not authorised');
    return res.status(401).end();  
  }

  let data;
  try {
    data = stmtGetSettingsForUserId.get(userId);
  } catch(e) {
    log(req.reqid, 'error', 'reading settings from database', e);
    return res.status(500).end();  
  }

  let json;
  if (data.client_settings) {
    try {
      json = JSON.stringify(filterSettings(JSON.parse(data.client_settings)));
      log(req.reqid, 'settings read', json);
    } catch(e) {
      log(req.reqid, 'error', 'settings not valid json', e, JSON.stringify(data.client_settings));
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

/*
 *  POST https://airmash.online/settings
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
      let info = stmtSetSettingsForUserId.run(userId, json);
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

/*
 *  Start application
 */

https.get("https://login.airmash.online/key", (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });

  res.on('end', () => {
    loginPublicKey = crypto.createPublicKey({
      key: Buffer.from(JSON.parse(data).key, 'base64'),
      format: 'der',
      type: 'spki'
    });
    
    if (loginPublicKey === undefined) {
      log('error', 'cannot set up login public key');
      process.exit(1);
    }
    else
    {
      app.set('trust proxy', 1);
      app.listen(port, hostname, () => {
        log('start', `server running at http://${hostname}:${port}/`);
      });      
    }
  });
});

