const paths = require('./paths');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Read key from secrets file
 */
const secretsPath = path.resolve(paths.data, 'secrets.json')
const secretsJson = fs.readFileSync(secretsPath);
const secrets = JSON.parse(secretsJson);

const key = {
  private: crypto.createPrivateKey({
    key: Buffer.from(secrets.Ed25519SigningKey.private, 'base64'),
    format: 'der',
    type: 'pkcs8'
  }),
  public: crypto.createPublicKey({
    key: Buffer.from(secrets.Ed25519SigningKey.public, 'base64'),
    format: 'der',
    type: 'spki'
  })
};

/**
 * Generate signed token for a particular purpose
 */
const generate = function(obj, purpose) {
  obj.for = purpose;
  const data = Buffer.from(JSON.stringify(obj));  
  const signature = crypto.sign(null, data, key.private);
  
  return (data.toString('base64') + '.' + signature.toString('base64')).replace(/=/g, '');
};

/**
 * Validate signed token for a particular purpose
 * 
 * This will either return valid token data or throw an exception
 */
const validate = function(token, purpose) {
  /**
   * Token must be two base64 strings separated by a dot
   */
  const tokenParts = token.split('.');

  if (tokenParts.length !== 2) {
    throw new TokenValidationError('Wrong number of parts in authentication token');
  }

  /**
   * First part is data, second part is signature
   */
  let data;
  let signature;
  let auth;

  try {
    data = Buffer.from(tokenParts[0], 'base64');
    signature = Buffer.from(tokenParts[1], 'base64');
    auth = JSON.parse(data.toString());
  } catch (e) {
    throw new TokenValidationError('Cannot parse authentication token');
  }

  if (typeof auth !== 'object' || auth === null) {
    throw new TokenValidationError('Decoded token data was not an object');
  }

  /** 
   * Check purpose
   */
  if (auth.for !== purpose) {
    throw new TokenValidationError('Token was issued for a different purpose than required');
  }

  /**
   * Ed25519 signature must be exactly 64 bytes long
   */
  if (signature.length !== 64) {
    throw new TokenValidationError('Invalid signature length in authentication token');
  }

  /**
   * Verify signature
   */
  if (!crypto.verify(null, data, key.public, signature)) {
    throw new TokenValidationError('Authentication token signature not verified');
  }

  /**
   * We have a correctly signed object, so return it
   */
  return auth;
}

class TokenValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

module.exports = {
  generate,
  validate,
  publicKey: secrets.Ed25519SigningKey.public
};