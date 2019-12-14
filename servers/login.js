const express = require('express');
const session = require('express-session');
const oauth = require('oauth');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const url = require('url');
const path = require('path');

const app = express()
app.disable('x-powered-by');


/*
 *  External and internal endpoints, needs to match nginx configuration
 */

const baseUrl = 'https://login.airmash.online';
const loginPath = "/login"
const callbackPath = "/login/callback"
const keyPath = "/key"

const hostname = 'localhost';
const port = 4444;

const permittedOrigins = [ 
  'https://airmash.online',
  'https://test.airmash.online'
];

/*
 *  Data file paths
 */

const secretsPath = path.resolve(__dirname, '../data/secrets.json')
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
 *  Set up player database
 */

const db = require('better-sqlite3')(playersDatabasePath);
db.pragma('synchronous = FULL');

db.exec("create table if not exists users ( user_id text not null primary key, external_id text not null unique )");

const stmtGetUserIdFromExternalId = db.prepare('select user_id from users where external_id = ?');
const stmtSetUserIdForExternalId = db.prepare('insert into users (user_id, external_id) values (?,?)');

/*
 *  Helper function to look up identity in player database
 */

var generateNewUserId = function() {
  return crypto.randomBytes(8).toString('hex');
};

var generateNewTimestamp = function() {
  return Math.floor(new Date().getTime()/1000);
};

var getUserIdFromExternalId = function(provider, uniqueid) {
  // external id is just the concatenation of provider id and an id unique to that provider
  let externalId = provider + ':' + uniqueid;

  // check if user already exists
  let user = stmtGetUserIdFromExternalId.get(externalId);

  // if not found, create new user in database and associate with external identity
  if (user === undefined) {
    let userId = generateNewUserId();
    stmtSetUserIdForExternalId.run(userId, externalId);
    user = stmtGetUserIdFromExternalId.get(externalId);
  }

  return user.user_id;
}

/*
 *  Identity extraction functions
 *    first parameter: the results from querying the access token URL
 *    second parameter: callback that takes the unique id and display name
 * 
 *  These either extract the identity from the results (microsoft, google, twitter)
 *  or use the access token to query a web service for the identity (reddit, twitch)
 * 
 */

var getIdentityFromIdToken = function(results, callback) {
  try {
    let idToken = JSON.parse(Buffer.from(results.id_token.split('.')[1], 'base64').toString());
    if (idToken.sub === undefined) {
      log('error', 'sub missing from id_token', JSON.stringify(idToken));
      callback(null);
    } else {
      callback(idToken.sub, (idToken.email || idToken.sub));
    }
  } catch(e) {
    log('error', 'identity from id_token', e, JSON.stringify(results));
    callback(null);
  }
};

var getIdentityFromTwitter = function(results, callback) {
  if (results.user_id === undefined) {
    log('error', 'identity missing from twitter results', JSON.stringify(results));
    callback(null);
  } else {
    callback(results.user_id, (results.screen_name || results.user_id));
  }
};

var getIdentityFromReddit = function(results, callback) {
  try {
    https.get(
      "https://oauth.reddit.com/api/v1/me", 
      { headers: 
        { 'Authorization': 'Bearer ' + results.access_token,
          'User-Agent': 'login.airmash.online by /u/airmashonline' }}, 
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
    
        res.on('end', () => {
          let name = JSON.parse(data)['name'];
          if (name === undefined) {
            log('error', 'identity missing from reddit data', JSON.stringify(data));
            callback(null);
          } else {
            callback(name, name);
          }
        });
      });
  } catch(e) {
    log('error', 'identity from reddit', e, JSON.stringify(results));
    callback(null);
  }
};

var getIdentityFromTwitch = function(results, callback) {
  try {
    https.get(
      "https://api.twitch.tv/helix/users", 
      { headers: 
        { 'Authorization': 'Bearer ' + results.access_token,
          'User-Agent': 'login.airmash.online' }}, 
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
    
        res.on('end', () => {
          let user = JSON.parse(data).data[0];
          if (user.id === undefined) {
            log('error', 'identity missing from twitch data', JSON.stringify(data));
            callback(null);
          } else {
            callback(user.id, (user.login || user.id));
          }
        });
      }); 
  } catch(e) {
    log('error', 'identity from twitch', e, JSON.stringify(results));
    callback(null);
  } 
};

/*
 *  OAuth details for each identity provider
 */

const IdentityProviders = {
  1: {
    name: 'Microsoft',
    oAuthVersion: 2,
    authorizationUrl: 'https://login.live.com/oauth20_authorize.srf',
    accessTokenUrl: 'https://login.live.com/oauth20_token.srf',
    clientId: '1f3e960f-3d8f-4649-9dfe-3ee5d72b8668',
    scope: 'openid',
    extraAuthorizeParams: { prompt: 'consent' },
    identityFunction: getIdentityFromIdToken
    // app settings  https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/1f3e960f-3d8f-4649-9dfe-3ee5d72b8668
    // help page     https://docs.microsoft.com/en-us/azure/active-directory/develop/v1-protocols-openid-connect-code
  },

  2: {
    name: 'Google',
    oAuthVersion: 2,
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    accessTokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '583241767780-bnrnpjqetiuqsd5tuovunflmdjthl7vk.apps.googleusercontent.com',
    scope: 'openid email',
    extraAuthorizeParams: { prompt: 'consent' },
    identityFunction: getIdentityFromIdToken
    // app settings  https://console.developers.google.com/apis/credentials/oauthclient/583241767780-bnrnpjqetiuqsd5tuovunflmdjthl7vk.apps.googleusercontent.com?project=583241767780
    // help page     https://developers.google.com/identity/protocols/OAuth2UserAgent
  },

  3: {
    name: 'Twitter',
    oAuthVersion: 1,
    requestTokenUrl: 'https://twitter.com/oauth/request_token',
    authorizationUrl: 'https://twitter.com/oauth/authenticate',
    accessTokenUrl: 'https://twitter.com/oauth/access_token',
    consumerKey: 'arA6LBEe0Nh6jTRw6L9TdH9sU',
    signatureMethod: 'HMAC-SHA1',
    extraRequestParams: { x_auth_access_type: 'read' },
    identityFunction: getIdentityFromTwitter
    // app settings  https://developer.twitter.com/en/apps/16989177
    // help page     https://developer.twitter.com/en/docs/twitter-for-websites/log-in-with-twitter/guides/browser-sign-in-flow
  },

  4: {
    name: 'Reddit',
    oAuthVersion: 2,
    authorizationUrl: 'https://www.reddit.com/api/v1/authorize',
    accessTokenUrl: 'https://www.reddit.com/api/v1/access_token',
    accessTokenBasicAuth: true,
    clientId: 'H6O5BLUMNaiAEw',
    scope: 'identity',
    extraAuthorizeParams: { duration: 'temporary' },
    identityFunction: getIdentityFromReddit
    // app settings  https://old.reddit.com/prefs/apps
    // help page     https://github.com/reddit-archive/reddit/wiki/API
  },

  5: {
    name: 'Twitch',
    oAuthVersion: 2,
    authorizationUrl: 'https://id.twitch.tv/oauth2/authorize',
    accessTokenUrl: 'https://id.twitch.tv/oauth2/token',
    clientId: 'xzp3ei9be2rpm0vdhx2gwpjo238kah',
    scope: '',
    extraAuthorizeParams: { force_verify: 'true' },
    identityFunction: getIdentityFromTwitch
    // app settings  https://dev.twitch.tv/console/apps/xzp3ei9be2rpm0vdhx2gwpjo238kah
    // help page     https://dev.twitch.tv/docs/authentication/getting-tokens-oauth
  }
};

/*
 *  Read secrets from file, add to IdentityProviders and Ed25519SigningKey
 */

let Ed25519SigningKey;

fs.readFile(secretsPath, function (e, data) {
  if (e) {
    log('error', 'reading secrets', e);
    throw e;
  } else {
    try {
      secrets = JSON.parse(data);

      let idProvidersSecrets = secrets['IdentityProviders'];
      for (provider in idProvidersSecrets) {
        for (propname in idProvidersSecrets[provider]) {
          IdentityProviders[parseInt(provider)][propname] = idProvidersSecrets[provider][propname];
        }
      }

      // as previously generated with scripts/generate-ed25519-keypair.js
      Ed25519SigningKey = secrets['Ed25519SigningKey']; // also includes public key, which isn't a secret
      Ed25519SigningKey.private = crypto.createPrivateKey({
        key: Buffer.from(Ed25519SigningKey.private, 'base64'),
        format: 'der',
        type: 'pkcs8'
      });
    } catch(e) {
      log('error', 'adding secrets', e);
      throw e;  
    }
  }
});

/*
 *  Helper function to generate signed token for a particular purpose
 */

var generateSignedToken = function(userId, timestamp, purpose) {
  let data = Buffer.from(JSON.stringify({
    uid: userId,
    ts: timestamp, 
    for: purpose
  }));

  let signature = crypto.sign(null, data, Ed25519SigningKey.private);

  return (data.toString('base64') + '.' + signature.toString('base64')).replace(/=/g, '');
};

/*
 *  Helper function to generate HTML for error page
 */

var errorPage = function(msg) {
  return '<html><body><div style="position:absolute;top:50%;left:50%;transform:translateX(-50%) translateY(-50%);text-align:center">' + 
         '<code style="word-wrap:break-word;white-space:pre;font-size:125%"><b>error</b><br/><br/>' + msg + '<br/><br/>' + 
         '<a href="javascript:window.close();">close window</a></code></div></body></html>'
}

/*
 *  Helper function to generate HTML for debug info
 */

var debugHtml = function(session, player, provider, displayName, uniqueId, results, tokens) {
  return '<code style="word-wrap:break-word;white-space:pre">you are logged in 😊<br/><br/>' + 
         '<a href="javascript:window.close();">close window</a><br/><br/>' + 
         '------------------------<br/><br>' + 
         'nonce: ' + session.nonce + '<br/>' +
         'userid: ' + player.userid + '<br/>' +
         'clienttoken: ' + player.clienttoken + '<br/>' +
         'provider: ' + session.provider + ' (' + provider.name + ')<br/>' +
         'loginname: ' + displayName + '<br/>' +
//         '<br/>' +
//         'external_id: ' + session.provider + ':' + uniqueId + '<br/>' +
//         '<br/>' +
//         'results: ' + JSON.stringify(results, null, 2) + 
         '<br/>' +
         'tokens: ' + JSON.stringify(tokens, null, 2) + 
         '</code>';
}

/*
 *  Set up short-lived session cookies
 */

app.use(session({
  secret: crypto.randomBytes(16).toString('hex'),
  key: 'session',
  cookie: {
    httpOnly: true,
    secure: true,
    path: '/',
    maxAge: 15 * 60 * 1000
  }
}));

/*
 *  Log all requests to this service for debugging purposes, but not the request body because it will contain private data and tokens
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
  res.status(200).type('json').end(JSON.stringify({
    key: Ed25519SigningKey.public
  }));
});

/*
 *  GET https://login.airmash.online/login
 */

app.get(loginPath, (req, res) => {
  try {
    let session = req.session;

    // are required parameters present?

    if (req.query.provider === undefined) {
      return res.send(errorPage('provider required 😢')).status(400).end();
    }

    if (req.query.origin === undefined) {
      return res.send(errorPage('origin required 😢')).status(400).end();
    }

    if (req.query.nonce === undefined) {
      return res.send(errorPage('nonce required 😢')).status(400).end();
    }

    for (let param in req.query) {
      if (!['provider','origin','nonce','debug'].includes(param)) {
        return res.send(errorPage('unrecognised query parameter 😢')).status(400).end();
      }
    }

    // are required parameters correct?

    if (typeof req.query.provider !== 'string') {
      return res.send(errorPage('invalid provider 😢')).status(400).end();
    }

    let provider = IdentityProviders[parseInt(req.query.provider)];
    if (provider === undefined) {
      return res.send(errorPage('invalid provider 😢')).status(400).end();
    }

    let origin = req.query.origin;
    if (typeof origin !== 'string' || !(/^https?:\/\//m.test(origin))) {
      return res.send(errorPage('invalid origin 😢')).status(400).end();
    }

    if (!permittedOrigins.includes(origin.toLowerCase())) {
      // not a permitted origin
      // but check for http://127.0.0.1 and display warning if this matches
      if (/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/?$/m.test(req.query.origin)) {
        if (!req.query.debug || req.query.debug !== session.debugtoken) {
          session.debugtoken = crypto.randomBytes(16).toString('hex');
          let newurl = new URL(baseUrl + req.originalUrl);
          return res.send('<html><body><div style="position:absolute;top:50%;left:50%;transform:translateX(-50%) translateY(-50%);text-align:center">' + 
                          '<code><span style="font-size:500%">⚠️</span><br/><br/>your origin is local (' + req.query.origin + ')<br/>️️️<br/>' + 
                          '<a href="' + baseUrl + newurl.pathname + newurl.search + '&debug=' + session.debugtoken + '">continue</a> only if developer</code>' + 
                          '</div></body></html>').status(200).end();
        } else {
          // used in callback to display useful information for debugging
          session.debug = true;
        }
      } else {
        return res.send(errorPage('origin not permitted 🤔')).status(400).end();
      }
    }

    let nonce = req.query.nonce;
    if (typeof nonce !== 'string' || !(/^[0-9a-f]{32}$/im.test(nonce))) {
      return res.send(errorPage('invalid nonce 😢')).status(400).end();
    }

    // save parameters in session

    session.nonce = req.query.nonce;
    session.origin = req.query.origin;
    session.provider = parseInt(req.query.provider);

    switch (provider.oAuthVersion) {
      case 1:
        let oa = new oauth.OAuth(provider.requestTokenUrl, null, provider.consumerKey, provider.consumerSecret, '1.0A', null, provider.signatureMethod);
        oa.getOAuthRequestToken(
          provider.extraRequestParams,
          function (error, oAuthToken, oAuthTokenSecret) {
            if (error) {
              log(req.reqid, 'error', 'getOAuthRequestToken', JSON.stringify(error));
              res.send(errorPage('error retrieving request token 😟')).status(500).end();
            } else {
              session.oAuthTokenSecret = oAuthTokenSecret;
              session.valid = true;
              res.redirect(302, provider.authorizationUrl + '?oauth_token=' + oa._encodeData(oAuthToken));
            }
          });
        break;

      case 2:
        let oa2 = new oauth.OAuth2(provider.clientId, null, '', provider.authorizationUrl, null, null);
        session.state = crypto.randomBytes(16).toString('hex');
        session.valid = true;
        res.redirect(
          302,
          oa2.getAuthorizeUrl({
            scope: provider.scope,
            response_type: 'code',
            ...provider.extraAuthorizeParams,
            redirect_uri: baseUrl + callbackPath,
            state: session.state
          }));
        break;

      default:
        res.send(errorPage('invalid provider data 😢')).status(400).end();
        break;
    }
  } catch (e) {
    log(req.reqid, 'error', 'login', e);
    res.send(errorPage('internal error 😟')).status(500).end();
  }
});

/*
 *  GET https://login.airmash.online/login/callback
 */

app.get(callbackPath, (req, res) => {
  try {
    let session = req.session;

    // session must have been set up in /login response and not expired in client
    if (!session.valid) {
      return res.send(errorPage('session expired 😱')).status(400).end();
    }
    let provider = IdentityProviders[session.provider];
    if (provider === undefined) {
      return res.send(errorPage('invalid provider 😢')).status(400).end();
    }

    // if we see either of these query parameters it means the user most likely chose to deny access 
    if (req.query.error || req.query.denied) {
      log(req.reqid, 'callback error/denied', JSON.stringify(req.query.error), JSON.stringify(req.query.denied));
      return res.type('html').send('<html><head><script type="text/javascript">window.close();</script></head><html>').end();
    }

    switch (provider.oAuthVersion) {
      case 1:
        if (typeof req.query.oauth_token !== 'string' || typeof req.query.oauth_verifier !== 'string') {
            return res.send(errorPage('invalid parameters 😢')).status(400).end();
        }
        let oa = new oauth.OAuth(null, provider.accessTokenUrl, provider.consumerKey, provider.consumerSecret, '1.0A', null, provider.signatureMethod);
        oa.getOAuthAccessToken(
          req.query.oauth_token,
          session.oAuthTokenSecret,
          req.query.oauth_verifier,
          function (error, oauthAccessToken, oauthAccessTokenSecret, results) {
            if (error) {
              log(req.reqid, 'error', 'OAuth.getOAuthAccessToken', JSON.stringify(error));
              return res.send(errorPage('error retrieving access token 😟')).status(500).end();
            } else {
              provider.identityFunction(results, (uniqueId, displayName) => {
                commonIdentityFunctionCallback(res, session, provider, displayName, uniqueId, results);
              });
            }
          });
        break;

      case 2:
        // are required parameters present and correct?
        if (req.query.state === undefined || session.state !== req.query.state) {
          return res.send(errorPage('invalid state 😢')).status(400).end();
        }
        if (req.query.code === undefined || typeof req.query.code !== 'string') {
          return res.send(errorPage('invalid code 😢')).status(400).end();
        }

        let customHeaders = provider.accessTokenBasicAuth ?
          { 'Authorization': 'Basic ' + Buffer.from(provider.clientId + ':' + provider.clientSecret).toString('base64') } :
          null;
        let oa2 = new oauth.OAuth2(provider.clientId, provider.clientSecret, '', null, provider.accessTokenUrl, customHeaders);
        
        oa2.getOAuthAccessToken(
          req.query.code,
          { grant_type: 'authorization_code', redirect_uri: baseUrl + callbackPath },
          function (error, access_token, refresh_token, results) {
            if (error) {
              log(req.reqid, 'error', 'OAuth2.getOAuthAccessToken', JSON.stringify(error));
              return res.send(errorPage('error retrieving access token 😟')).status(500).end();
            } else {
              provider.identityFunction(results, (uniqueId, displayName) => {
                commonIdentityFunctionCallback(res, session, provider, displayName, uniqueId, results);
              });
            }
          });
        break;

      default:
        return res.send(errorPage('invalid provider data 😟')).status(400).end();
    }
  } catch (e) {
    log(req.reqid, 'error', 'login callback', e);
    return res.send(errorPage('internal error 😟')).status(500).end();
  }
});

/*
 *  Handler for identity function results is common to both OAuth versions
 */

var commonIdentityFunctionCallback = function(res, session, provider, displayName, uniqueId, results) {
  if (uniqueId == null) {
    return res.send(errorPage('error retrieving identity 😟')).status(500).end();
  }

  let userId = getUserIdFromExternalId(session.provider, uniqueId);

  let timestamp = generateNewTimestamp();

  let tokens = {
    settings: generateSignedToken(userId, timestamp, "settings"),
    game: generateSignedToken(userId, timestamp, "game")
  };

  let html = '<html><head><script type="text/javascript">function closePopup(){window.opener.postMessage(' + 
        JSON.stringify({
          nonce: session.nonce,
          tokens,
          provider: session.provider,
          loginname: displayName,
        }) +
        ',"' + session.origin + '");' + (!session.debug ? 'window.close();' : '') + 
      '}</script></head><body onload="closePopup()">' + 
        (session.debug ? debugHtml(session, userId, provider, displayName, uniqueId, results, tokens) : '') +
      '</body></html>';

  session.destroy();

  return res.status(200).clearCookie('session').type('html').send(html).end();
};

/*
 *  Default route
 */

app.use(function (req, res) {
  res.location('https://airmash.online').status(302).end();
});

/*
 *  Error handling
 */

app.use(function(err, req, res, next) {
  log(req.reqid, 'error', 'default handler', e);
  res.status(500).end();
});

/*
 *  Start application
 */

app.set('trust proxy', 1);
app.listen(port, hostname, () => {
  log('start', `server running at http://${hostname}:${port}/`);
});
