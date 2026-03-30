const crypto = require('node:crypto');

const HASH_KEYLEN = 64;

function scryptHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, HASH_KEYLEN, { N: 1 << 14, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey.toString('hex'));
    });
  });
}

class AuthStore {
  constructor({ sessionTtlMs = 1000 * 60 * 60 * 24 } = {}) {
    this.usersByEmail = new Map();
    this.usersById = new Map();
    this.sessionsByToken = new Map();
    this.sessionTtlMs = sessionTtlMs;
  }

  async createUser({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new Error('invalid_input');
    }

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new Error('email_exists');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await scryptHash(password, salt);
    const user = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      salt,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    this.usersByEmail.set(normalizedEmail, user);
    this.usersById.set(user.id, user);
    return this.toPublicUser(user);
  }

  async verifyUser({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = this.usersByEmail.get(normalizedEmail);
    if (!user) {
      return null;
    }

    const passwordHash = await scryptHash(password, user.salt);
    const a = Buffer.from(passwordHash, 'hex');
    const b = Buffer.from(user.passwordHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    return this.toPublicUser(user);
  }

  createSession({ userId }) {
    const user = this.usersById.get(userId);
    if (!user) {
      throw new Error('unknown_user');
    }

    const now = Date.now();
    const token = crypto.randomBytes(48).toString('base64url');
    const session = {
      token,
      userId,
      createdAtMs: now,
      expiresAtMs: now + this.sessionTtlMs
    };

    this.sessionsByToken.set(token, session);
    return {
      token,
      expiresAt: new Date(session.expiresAtMs).toISOString()
    };
  }

  getSession(token) {
    if (!token) {
      return null;
    }

    const session = this.sessionsByToken.get(token);
    if (!session) {
      return null;
    }

    if (session.expiresAtMs <= Date.now()) {
      this.sessionsByToken.delete(token);
      return null;
    }

    const user = this.usersById.get(session.userId);
    if (!user) {
      this.sessionsByToken.delete(token);
      return null;
    }

    return {
      token: session.token,
      user: this.toPublicUser(user),
      expiresAt: new Date(session.expiresAtMs).toISOString()
    };
  }

  revokeSession(token) {
    return this.sessionsByToken.delete(token);
  }

  toPublicUser(user) {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt
    };
  }
}

module.exports = {
  AuthStore
};
