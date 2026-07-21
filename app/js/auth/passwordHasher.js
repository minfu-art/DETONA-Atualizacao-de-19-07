const DEFAULT_ITERATIONS = 210000;

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value) {
  if (typeof atob === 'function') {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export class PasswordHasher {
  constructor({ cryptoProvider = globalThis.crypto, iterations = DEFAULT_ITERATIONS } = {}) {
    if (!cryptoProvider?.subtle || !cryptoProvider?.getRandomValues) {
      throw new Error('Web Crypto indisponivel');
    }
    this.crypto = cryptoProvider;
    this.iterations = iterations;
  }

  async hash(password) {
    const salt = this.crypto.getRandomValues(new Uint8Array(16));
    const derived = await this.#derive(password, salt, this.iterations);
    return {
      algorithm: 'PBKDF2-SHA-256',
      iterations: this.iterations,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(derived),
    };
  }

  async verify(password, credential) {
    if (!credential || credential.algorithm !== 'PBKDF2-SHA-256') return false;
    const salt = base64ToBytes(credential.salt);
    const expected = base64ToBytes(credential.hash);
    const actual = await this.#derive(password, salt, credential.iterations);
    return constantTimeEqual(actual, expected);
  }

  async #derive(password, salt, iterations) {
    const material = await this.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(String(password)),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await this.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      256,
    );
    return new Uint8Array(bits);
  }
}
