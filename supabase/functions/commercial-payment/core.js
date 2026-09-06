const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEST_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const PAYMENT_METHOD = /^[a-z0-9_]{2,40}$/i;
const CARD_TYPES = new Set(['credit_card', 'debit_card', 'prepaid_card']);
const PIX_TYPES = new Set(['bank_transfer', 'pix']);

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function payerFrom(value) {
  const payer = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const identification = payer.identification && typeof payer.identification === 'object'
    ? payer.identification
    : {};
  const type = text(identification.type, 8).toUpperCase();
  const number = text(identification.number, 20).replace(/\D/g, '');
  if (!['CPF', 'CNPJ'].includes(type) || number.length < 8 || number.length > 14) {
    throw new Error('INVALID_PAYER_IDENTIFICATION');
  }
  return {
    first_name: text(payer.first_name, 80) || undefined,
    last_name: text(payer.last_name, 80) || undefined,
    identification: { type, number },
  };
}

export function validateEmbeddedPaymentRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
  const orderId = text(value.orderId, 80);
  const contestId = text(value.contestId, 80);
  const requestId = text(value.requestId, 80);
  const selectedPaymentMethod = text(value.selectedPaymentMethod, 40).toLowerCase();
  const formData = value.formData;
  if (!UUID.test(orderId)) throw new Error('INVALID_ORDER');
  if (!CONTEST_ID.test(contestId)) throw new Error('INVALID_CONTEST');
  if (!UUID.test(requestId)) throw new Error('INVALID_REQUEST_ID');
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) throw new Error('INVALID_PAYMENT_DATA');
  const paymentMethodId = text(formData.payment_method_id, 40).toLowerCase();
  if (!PAYMENT_METHOD.test(paymentMethodId)) throw new Error('INVALID_PAYMENT_METHOD');
  const payer = payerFrom(formData.payer);
  if (PIX_TYPES.has(selectedPaymentMethod)) {
    if (paymentMethodId !== 'pix') throw new Error('INVALID_PAYMENT_METHOD');
    return { orderId, contestId, requestId, selectedPaymentMethod: 'pix', formData: { paymentMethodId, payer } };
  }
  if (!CARD_TYPES.has(selectedPaymentMethod)) throw new Error('PAYMENT_METHOD_NOT_ALLOWED');
  const token = text(formData.token, 300);
  const installments = Number(formData.installments);
  const issuerId = text(formData.issuer_id, 40);
  if (!token) throw new Error('INVALID_CARD_TOKEN');
  if (!Number.isInteger(installments) || installments < 1 || installments > 24) {
    throw new Error('INVALID_INSTALLMENTS');
  }
  return {
    orderId,
    contestId,
    requestId,
    selectedPaymentMethod,
    formData: { paymentMethodId, token, installments, issuerId: issuerId || undefined, payer },
  };
}

export function paymentPayload({ request, order, contest, payerEmail, notificationUrl }) {
  if (!Number.isInteger(order?.amount_cents) || order.amount_cents <= 0 || order.currency !== 'BRL') {
    throw new Error('ORDER_PRICE_INVALID');
  }
  const notify = new URL(notificationUrl);
  if (notify.protocol !== 'https:') throw new Error('WEBHOOK_URL_INVALID');
  notify.searchParams.set('source_news', 'webhooks');
  const card = request.selectedPaymentMethod !== 'pix';
  return {
    transaction_amount: order.amount_cents / 100,
    description: `DETONA | ${text(contest?.name || 'Curso DETONA', 110)}`,
    payment_method_id: request.formData.paymentMethodId,
    ...(card ? {
      token: request.formData.token,
      installments: request.formData.installments,
      ...(request.formData.issuerId ? { issuer_id: request.formData.issuerId } : {}),
    } : {}),
    payer: {
      email: text(payerEmail, 160),
      ...request.formData.payer,
    },
    external_reference: order.id,
    notification_url: notify.toString(),
    statement_descriptor: 'DETONA',
    binary_mode: false,
    metadata: { contest_id: contest.id, brand: 'detona', checkout_experience: 'embedded' },
  };
}

export function publicPaymentResult(payment) {
  const id = text(payment?.id, 80);
  const status = text(payment?.status, 40).toLowerCase();
  if (!id || !['pending', 'approved', 'rejected', 'in_process', 'cancelled'].includes(status)) {
    throw new Error('INVALID_PROVIDER_PAYMENT');
  }
  const transaction = payment?.point_of_interaction?.transaction_data || {};
  return {
    id,
    status,
    statusDetail: text(payment.status_detail, 80) || null,
    paymentMethodId: text(payment.payment_method_id, 40) || null,
    paymentTypeId: text(payment.payment_type_id, 40) || null,
    pix: payment.payment_method_id === 'pix' ? {
      code: text(transaction.qr_code, 4096) || null,
      qrCodeBase64: text(transaction.qr_code_base64, 200000) || null,
      ticketUrl: text(transaction.ticket_url, 2048) || null,
    } : null,
  };
}
