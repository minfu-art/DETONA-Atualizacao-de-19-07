import { authRequest } from '../auth/authDb.js';

export class EntitlementRepository {
  async listByUser(userId) {
    return authRequest('entitlements', 'readonly', (store) => store.index('userId').getAll(userId));
  }

  async find(userId, contestId) {
    return authRequest('entitlements', 'readonly', (store) => store.get(`${userId}:${contestId}`));
  }

  async save(entitlement) {
    await authRequest('entitlements', 'readwrite', (store) => store.put(entitlement));
    return entitlement;
  }
}

export class PurchaseRepository {
  async save(purchase) {
    await authRequest('purchases', 'readwrite', (store) => store.put(purchase));
    return purchase;
  }
}
