const express = require('express');
const fs = require('fs');

const app = express()

/*
 *  Internal endpoint, proxied via nginx
 */

const hostname = 'localhost';
const port = 7777;

/*
 *  Logging helper
 */

const logfile = 'settings.log';

var errobj = function(err) {
  let obj = {};
  Object.getOwnPropertyNames(err).forEach(name => obj[name] = err[name]);
  return obj;
}

var log = function() {
  let msg = (new Date().toISOString()) + ' | ' + [...arguments].join(' | ') + '\n';
  fs.appendFile(logfile, msg, e => {
    e && console.error(`error writing to log\n  ${JSON.stringify(errobj(e))}\n  ${msg}`);
  });
}

/*
 *  Open player database and prepare statements
 *
 *  The database is initialised in login.js, schema as follows:
 *
 *    create table if not exists players ( 
 *      player_id text not null primary key, 
 *      external_id text not null unique, 
 *      client_token text not null unique, 
 *      client_settings text 
 *    )
 *
 */

const db = require('better-sqlite3')('players.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');

const stmtGetClientSettings = db.prepare('select client_settings, client_token from players where client_token = ?');
const stmtSetClientSettings = db.prepare('update players set client_settings = ? where client_token = ?');

/*
 *  Upper limit on settings data, per player
 */

const SETTINGS_MAX_SIZE = 1024;

/*
 *  Log all requests to this service for debugging purposes
 */

var nextreqid = 1;
app.use((req, res, next) => {
  req.reqid = nextreqid++;
  log(req.reqid, 'request', req.headers['x-real-ip'], req.method, req.url, JSON.stringify(req.headers));
  next();
});

/*
 *  Helper function for checking if requestor is authenticated
 */

var getPlayerDataUsingAuthToken = function(authHeader) {
  if (authHeader === undefined) {
    return null;  
  }

  // Authorization: Bearer abcdefghijklmnopqrstuvwx
  let authHeaderParts = authHeader.split(' ');

  if (authHeaderParts.length !== 2 || authHeaderParts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  let data = stmtGetClientSettings.get(authHeaderParts[1]);
  if (data === undefined) {
    return null;
  }

  return data;
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
  let player = getPlayerDataUsingAuthToken(req.headers.authorization);
  if (!player) {
    log(req.reqid, 'error', 'not authorised');
    return res.status(401).end();  
  }

  res.header('Content-Type', 'application/json');

  let json;
  if (player.client_settings) {
    try {
      json = JSON.stringify(filterSettings(JSON.parse(player.client_settings)));
      log(req.reqid, 'settings read', json);
    } catch(e) {
      log(req.reqid, 'error', 'settings not valid json', JSON.stringify(errobj(e)), JSON.stringify(player.client_settings));
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
  let player = getPlayerDataUsingAuthToken(req.headers.authorization);
  if (!player) {
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
      log(req.reqid, 'error', 'body not valid json', JSON.stringify(errobj(e)), JSON.stringify(body));
      return res.status(400).end();
    }

    let result = 1;
    try {
      let json = JSON.stringify(filterSettings(settings));
      log(req.reqid, 'settings write', json, player.client_token);
      let info = stmtSetClientSettings.run(json, player.client_token);
      if (info.changes != 1) {
        log(req.reqid, 'error', 'writing settings updated ' + info.changes + ' rows in player database');
        result = 0;
      }
    } catch(e) {
      log(req.reqid, 'error', 'settings write', JSON.stringify(errobj(e)));
      result = 0;
    }

    res.type('json').send(JSON.stringify({result:result})).end();    
  });
});

/*
 *  Start application
 */

app.set('trust proxy', 1);
app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
