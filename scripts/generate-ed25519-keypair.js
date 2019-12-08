const crypto = require('crypto');

crypto.generateKeyPair('ed25519', (e, pubkey, privkey) => {
  if (e) throw e; 

	console.log(JSON.stringify({
		'public': pubkey.export({format:'der', type:'spki'}).toString('base64'),
		'private': privkey.export({format:'der', type:'pkcs8'}).toString('base64')
	}));
});
