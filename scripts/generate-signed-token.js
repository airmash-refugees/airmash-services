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

var generateNewTimestamp = function() {
  return Math.floor(new Date().getTime()/1000);
};

var generateSignedToken = function(userId, timestamp, purpose) {
  let data = Buffer.from(JSON.stringify({
    uid: userId,
    ts: timestamp, 
    for: purpose
  }));

  let signature = crypto.sign(null, data, Ed25519SigningKey.private);

  return (data.toString('base64') + '.' + signature.toString('base64')).replace(/=/g,'');
};

let Ed25519SigningKey;

fs.readFile(secretsPath, function (e, data) {
  if (e) {
    log('error', 'reading secrets', e);
    throw e;
  } else {
    try {
      secrets = JSON.parse(data);

      // as previously generated with scripts/generate-ed25519-keypair.js
      Ed25519SigningKey = secrets['Ed25519SigningKey']; // also includes public key, which isn't a secret
      Ed25519SigningKey.private = crypto.createPrivateKey({
        key: Buffer.from(Ed25519SigningKey.private, 'base64'),
        format: 'der',
        type: 'pkcs8'
			});
			
			let userId = process.argv[2];
			let purpose = process.argv[3];

			console.log(generateSignedToken(userId, generateNewTimestamp(), purpose));

    } catch(e) {
      log('error', 'adding secrets', e);
      throw e;  
    }
  }
});

