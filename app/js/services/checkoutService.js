import { PurchaseRepository } from '../repositories/entitlementRepository.js';
import { isLocalDevelopment } from '../config/appEnvironment.js';

/** Adapter demonstrativo. Substituir por um gateway remoto sem alterar LibraryService. */
export class LocalDemoCheckoutGateway {
  constructor({
    now = () => new Date(),
    idFactory = () => globalThis.crypto?.randomUUID?.() || `purchase_${Date.now()}`,
    allowDemo = isLocalDevelopment,
  } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.allowDemo = allowDemo;
  }

  async checkout({ userId, contest }) {
    if (!this.allowDemo()) {
      throw new Error('Checkout demonstrativo bloqueado neste ambiente.');
    }
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

export class CheckoutUnavailableGateway {
  async checkout() {
    throw new Error('Checkout comercial ainda não configurado. Nenhuma compra foi concluída.');
  }
}

export class CheckoutService {
  constructor({
    gateway = isLocalDevelopment() ? new LocalDemoCheckoutGateway() : new CheckoutUnavailableGateway(),
    purchases = new PurchaseRepository(),
    persistLocally = isLocalDevelopment,
  } = {}) {
    this.gateway = gateway;
    this.purchases = purchases;
    this.persistLocally = persistLocally;
  }

  async purchase(input) {
    const purchase = await this.gateway.checkout(input);
    const demoAllowed = purchase.status === 'demo_completed' && isLocalDevelopment();
    if (purchase.status !== 'paid' && !demoAllowed) throw new Error('Pagamento nao confirmado.');
    if (this.persistLocally()) await this.purchases.save(purchase);
    return purchase;
  }
}
