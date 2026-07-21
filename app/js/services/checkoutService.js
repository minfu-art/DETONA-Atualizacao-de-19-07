import { PurchaseRepository } from '../repositories/entitlementRepository.js';

/** Adapter demonstrativo. Substituir por um gateway remoto sem alterar LibraryService. */
export class LocalDemoCheckoutGateway {
  constructor({ now = () => new Date(), idFactory = () => globalThis.crypto?.randomUUID?.() || `purchase_${Date.now()}` } = {}) {
    this.now = now;
    this.idFactory = idFactory;
  }

  async checkout({ userId, contest }) {
    return {
      id: this.idFactory(),
      userId,
      contestId: contest.id,
      amountCents: contest.priceCents,
      currency: contest.currency,
      status: 'demo_completed',
      provider: 'local_demo',
      createdAt: this.now().toISOString(),
    };
  }
}

export class CheckoutService {
  constructor({ gateway = new LocalDemoCheckoutGateway(), purchases = new PurchaseRepository() } = {}) {
    this.gateway = gateway;
    this.purchases = purchases;
  }

  async purchase(input) {
    const purchase = await this.gateway.checkout(input);
    if (!['paid', 'demo_completed'].includes(purchase.status)) throw new Error('Pagamento nao confirmado.');
    await this.purchases.save(purchase);
    return purchase;
  }
}
