import { ENV } from '../config/env.js';
import { getSupabaseClient } from '../supabase/client.js';

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const ALLOWED_PAYMENT_TYPES = new Set(['credit_card', 'debit_card', 'prepaid_card', 'bank_transfer', 'pix']);

function paymentError(code) {
  const messages = {
    EMBEDDED_CHECKOUT_NOT_CONFIGURED: 'O pagamento nesta página ainda não está disponível.',
    PAYMENT_METHOD_NOT_ALLOWED: 'Escolha cartão ou Pix para continuar.',
    INVALID_PAYER_IDENTIFICATION: 'Confira o CPF ou CNPJ informado.',
    PROVIDER_PAYMENT_REJECTED: 'O Mercado Pago não conseguiu processar estes dados. Confira e tente novamente.',
    PAYMENT_INITIALIZING: 'Seu pagamento está sendo preparado. Aguarde alguns segundos e tente novamente.',
  };
  return messages[code] || 'Não foi possível processar o pagamento agora. Tente novamente.';
}

export class MercadoPagoEmbeddedCheckout {
  constructor({
    publicKey = ENV.MERCADO_PAGO_PUBLIC_KEY,
    experience = ENV.CHECKOUT_EXPERIENCE,
    getClient = getSupabaseClient,
    documentRef = globalThis.document,
    mercadoPagoFactory = null,
    idFactory = () => globalThis.crypto?.randomUUID?.() || '',
    storage = globalThis.sessionStorage,
  } = {}) {
    this.publicKey = String(publicKey || '').trim();
    this.experience = experience === 'embedded' ? 'embedded' : 'redirect';
    this.getClient = getClient;
    this.document = documentRef;
    this.mercadoPagoFactory = mercadoPagoFactory;
    this.idFactory = idFactory;
    this.storage = storage;
    this.controller = null;
    this.sdkPromise = null;
    this.requestId = '';
  }

  configured() {
    return this.experience === 'embedded' && Boolean(this.publicKey);
  }

  async #loadSdk() {
    if (this.mercadoPagoFactory) return this.mercadoPagoFactory;
    if (globalThis.MercadoPago) return globalThis.MercadoPago;
    if (!this.document) throw new Error('PAYMENT_SDK_UNAVAILABLE');
    if (!this.sdkPromise) {
      this.sdkPromise = new Promise((resolve, reject) => {
        const existing = this.document.querySelector(`script[src="${SDK_URL}"]`);
        const script = existing || this.document.createElement('script');
        const finish = () => globalThis.MercadoPago ? resolve(globalThis.MercadoPago) : reject(new Error('PAYMENT_SDK_UNAVAILABLE'));
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', () => reject(new Error('PAYMENT_SDK_UNAVAILABLE')), { once: true });
        if (!existing) {
          script.src = SDK_URL;
          script.async = true;
          script.dataset.detonaPaymentSdk = 'mercado-pago';
          this.document.head.append(script);
        }
      }).catch((error) => {
        this.sdkPromise = null;
        throw error;
      });
    }
    return this.sdkPromise;
  }

  async #submit(checkout, contestId, selectedPaymentMethod, formData) {
    const type = String(selectedPaymentMethod || '').trim().toLowerCase();
    if (!ALLOWED_PAYMENT_TYPES.has(type)) throw new Error('PAYMENT_METHOD_NOT_ALLOWED');
    const storageKey = `detona.payment-attempt:${checkout.id}`;
    if (!this.requestId) this.requestId = this.storage?.getItem?.(storageKey) || this.idFactory();
    if (!this.requestId) throw new Error('INVALID_REQUEST_ID');
    this.storage?.setItem?.(storageKey, this.requestId);
    const client = await this.getClient();
    if (!client) throw new Error('EMBEDDED_CHECKOUT_NOT_CONFIGURED');
    const { data, error } = await client.functions.invoke('commercial-payment', {
      body: {
        orderId: checkout.id,
        contestId,
        requestId: this.requestId,
        selectedPaymentMethod: type,
        formData,
      },
    });
    if (error || data?.error || !data?.payment) {
      // Erros determinísticos permitem uma nova tentativa. Em falha de rede, a
      // mesma chave é preservada para o provedor nunca interpretar como nova cobrança.
      let errorCode = data?.error;
      if (!errorCode && error?.context?.clone) {
        try { errorCode = (await error.context.clone().json())?.error; }
        catch { /* Falhas de transporte preservam a tentativa. */ }
      }
      const safeRetry = new Set(['INVALID_PAYER_IDENTIFICATION', 'INVALID_PAYMENT_DATA', 'INVALID_PAYMENT_METHOD', 'INVALID_CARD_TOKEN', 'INVALID_INSTALLMENTS', 'PAYMENT_METHOD_NOT_ALLOWED']);
      if (safeRetry.has(errorCode)) {
        this.storage?.removeItem?.(storageKey);
        this.requestId = '';
      }
      const failure = new Error(paymentError(errorCode));
      failure.code = errorCode || 'PAYMENT_FAILED';
      throw failure;
    }
    this.storage?.removeItem?.(storageKey);
    this.requestId = '';
    return data.payment;
  }

  async mount({ containerId, checkout, contestId, getPayerIdentification = () => '', onReady = () => {}, onPayment = () => {}, onError = () => {} }) {
    if (!this.configured()) throw new Error('O pagamento nesta página ainda não está configurado.');
    await this.unmount();
    this.requestId = '';
    try {
      const MercadoPago = await this.#loadSdk();
      const mp = new MercadoPago(this.publicKey, { locale: 'pt-BR' });
      const bricks = mp.bricks({ theme: 'dark' });
      this.controller = await bricks.create('payment', containerId, {
        initialization: {
          amount: checkout.amountCents / 100,
          payer: { email: checkout.payerEmail || '' },
        },
        customization: {
          visual: { style: { theme: 'dark' } },
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
            prepaidCard: 'all',
            bankTransfer: 'all',
          },
        },
        callbacks: {
          onReady,
          onSubmit: async ({ selectedPaymentMethod, formData }) => {
            try {
              if (formData?.payment_method_id === 'pix' && !formData?.payer?.identification?.number) {
                const number = String(getPayerIdentification() || '').replace(/\D/g, '');
                if (![11, 14].includes(number.length)) {
                  const failure = new Error(paymentError('INVALID_PAYER_IDENTIFICATION'));
                  failure.code = 'INVALID_PAYER_IDENTIFICATION';
                  throw failure;
                }
                formData = { ...formData, payer: { ...formData.payer, identification: { type: number.length === 11 ? 'CPF' : 'CNPJ', number } } };
              }
              const payment = await this.#submit(checkout, contestId, selectedPaymentMethod, formData);
              onPayment(payment);
              return payment;
            } catch (error) {
              onError(error, { stage: 'submit' });
              throw error;
            }
          },
          onError: (error) => onError(error instanceof Error ? error : new Error('Falha ao carregar o meio de pagamento.'), { stage: 'brick' }),
        },
      });
      return this.controller;
    } catch (error) {
      onError(error, { stage: 'initialization' });
      throw error;
    }
  }

  async unmount() {
    const active = this.controller;
    this.controller = null;
    this.requestId = '';
    if (active?.unmount) {
      try { await active.unmount(); }
      catch { /* desmontagem nunca deve bloquear a navegação do aluno */ }
    }
  }
}

export const mercadoPagoEmbeddedCheckout = new MercadoPagoEmbeddedCheckout();
