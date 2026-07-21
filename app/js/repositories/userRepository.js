import { authGetAll, authRequest } from '../auth/authDb.js';

export class UserRepository {
  async count() {
    return authRequest('users', 'readonly', (store) => store.count());
  }

  async findById(id) {
    return authRequest('users', 'readonly', (store) => store.get(id));
  }

  async findByEmail(email) {
    return authRequest('users', 'readonly', (store) => store.index('email').get(email));
  }

  async save(user) {
    await authRequest('users', 'readwrite', (store) => store.put(user));
    return user;
  }

  async list() {
    return authGetAll('users');
  }
}
