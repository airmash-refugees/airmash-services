const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const secretsPath = path.resolve(__dirname, '../data/secrets.json')

var errstr = function(err) {
	let obj = {};
	Object.getOwnPropertyNames(err).forEach(name => obj[name] = err[name]);
	return JSON.stringify(obj);
}

var log = function() {
	let parts = [...arguments].map(part => part instanceof Error ? errstr(part) : part);
	let msg = (new Date().toISOString()) + ' | ' + parts.join(' | ') + '\n';
	console.error(msg);
}

var getUserIdFromToken = function(token) {
  // token must be two base64 strings separated by a dot
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
    log('error', 'cannot parse token', e, token);
    return null;
  }

  // user id, timestamp, and purpose must be specified in token
  if (undefined === auth.uid ||
      undefined === auth.ts || 
      undefined === auth.for) {
    log('error', 'required fields not present in token data', JSON.stringify(data));
    return null;
  }

  // check uid type
  if (typeof auth.uid !== 'string') {
    log('error', 'uid field must be a string', JSON.stringify(auth));
    return null;
  }

  // check ts type
  if (typeof auth.ts !== 'number') {
    log('error', 'ts field must be a number', JSON.stringify(auth));
    return null;
  }

  // ed25519 signature must be exactly 64 bytes long
  if (signature.length !== 64) {
    log('error', 'invalid signature length', token);
    return null;
  }

  // verify signature
  if (!crypto.verify(null, data, Ed25519SigningKey.public, signature)) {
    log('error', 'signature not verified', token);
    return null;
  }

  return [auth.uid, auth.for];
}

var Ed25519SigningKey;

fs.readFile(secretsPath, function (e, data) {
  if (e) {
    log('error', 'reading secrets', e);
    throw e;
  } else {
    try {
      secrets = JSON.parse(data);

      // as previously generated with scripts/generate-ed25519-keypair.js
      Ed25519SigningKey = secrets['Ed25519SigningKey'];
      Ed25519SigningKey.public = crypto.createPublicKey({
        key: Buffer.from(Ed25519SigningKey.public, 'base64'),
        format: 'der',
        type: 'spki'
			});
			
			let token = process.argv[2];
      console.log(getUserIdFromToken(token));

    } catch(e) {
      log('error', 'adding secrets', e);
      throw e;  
    }
  }
});

