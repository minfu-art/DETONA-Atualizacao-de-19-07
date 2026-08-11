import { openIndexedDatabase } from '../core/indexedDb.js';

const AUTH_DB_NAME = 'DetonaConcursosAuthDB';
const AUTH_DB_VERSION = 2;
let authDb = null;

export function openAuthDB() {
  if (authDb) return Promise.resolve(authDb);
  return openIndexedDatabase({
    name: AUTH_DB_NAME,
    version: AUTH_DB_VERSION,
    upgrade: (db) => {
      if (!db.objectStoreNames.contains('users')) {
        const users = db.createObjectStore('users', { keyPath: 'id' });
        users.createIndex('email', 'email', { unique: true });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('userId', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('entitlements')) {
        const entitlements = db.createObjectStore('entitlements', { keyPath: 'id' });
        entitlements.createIndex('userId', 'userId', { unique: false });
        entitlements.createIndex('contestId', 'contestId', { unique: false });
      }
      if (!db.objectStoreNames.contains('purchases')) {
        const purchases = db.createObjectStore('purchases', { keyPath: 'id' });
        purchases.createIndex('userId', 'userId', { unique: false });
      }
    },
  }).then((database) => {
    authDb = database;
    authDb.onversionchange = () => { authDb.close(); authDb = null; };
    return authDb;
  });
}

export async function authRequest(store, mode, operation) {
  const db = await openAuthDB();
  const transaction = db.transaction(store, mode);
  const request = operation(transaction.objectStore(store));
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function authGetAll(store) {
  return authRequest(store, 'readonly', (objectStore) => objectStore.getAll());
}

export { AUTH_DB_NAME };
