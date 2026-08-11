import { PurchaseRepository } from '../repositories/entitlementRepository.js';
import { isLocalDevelopment } from '../config/appEnvironment.js';
import { getSupabaseClient } from '../supabase/client.js';

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

  capability() {
    return { configured: false, provider: 'local_demo', reason: 'development_only' };
  }
}

export class CheckoutUnavailableGateway {
  async checkout() {
    throw new Error('Checkout comercial ainda não configurado. Nenhuma compra foi concluída.');
  }

  capability() {
    return { configured: false, provider: null, reason: 'gateway_not_configured' };
  }
}

export class MercadoPagoCheckoutGateway {
  constructor({
    getClient = getSupabaseClient,
    idFactory = () => globalThis.crypto?.randomUUID?.() || '',
  } = {}) {
    this.getClient = getClient;
    this.idFactory = idFactory;
  }

  async checkout({ contest }) {
    const client = await this.getClient();
    if (!client) throw new Error('Checkout indisponível neste ambiente.');
    const requestId = this.idFactory();
    if (!requestId) throw new Error('Não foi possível criar uma solicitação segura de compra.');
    const { data, error } = await client.functions.invoke('commercial-checkout', {
      body: { contestId: contest.id, requestId },
    });
    if (error) throw new Error('Não foi possível iniciar o pagamento. Tente novamente.');
    if (data?.error) throw new Error(data.error === 'ALREADY_ENTITLED'
      ? 'Este curso já está liberado para sua conta.'
      : 'Não foi possível iniciar o pagamento. Tente novamente.');
    if (!data?.checkout) throw new Error('O servidor não retornou uma sessão de pagamento válida.');
    return data.checkout;
  }

  capability() {
    return { configured: true, provider: 'mercado_pago', reason: null };
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
    if (purchase?.status === 'redirect') {
      let redirect;
      try { redirect = new URL(purchase.redirectUrl); }
      catch { throw new Error('O checkout retornou um destino inválido.'); }
      if (redirect.protocol !== 'https:') throw new Error('O checkout retornou um destino inseguro.');
      return { ...purchase, redirectUrl: redirect.toString() };
    }
    if (purchase?.status === 'pending') return purchase;
    const demoAllowed = purchase.status === 'demo_completed' && isLocalDevelopment();
    if (purchase.status !== 'paid' && !demoAllowed) throw new Error('Pagamento nao confirmado.');
    if (this.persistLocally()) await this.purchases.save(purchase);
    return purchase;
  }

  capability() {
    const value = this.gateway?.capability?.() || { configured: false, provider: null, reason: 'gateway_not_configured' };
    return Object.freeze({
      configured: value.configured === true,
      provider: value.provider || null,
      reason: value.reason || null,
    });
  }
}
