const CONTEST_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DETONA_CHECKOUT_BRAND = Object.freeze({
  statementDescriptor: 'DETONA',
  pictureUrl: 'https://app.detonaconcursos.com/assets/icons/icon-512.png',
});

export function validateCheckoutRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
  const contestId = String(value.contestId || '').trim();
  const requestId = String(value.requestId || '').trim();
  if (!CONTEST_ID.test(contestId)) throw new Error('INVALID_CONTEST');
  if (!REQUEST_ID.test(requestId)) throw new Error('INVALID_REQUEST_ID');
  return { contestId, requestId };
}

export function assertPurchasableContest(contest) {
  if (!contest) throw new Error('CONTEST_NOT_FOUND');
  if (contest.content_status !== 'ready' || contest.sales_status !== 'available') {
    throw new Error('CONTEST_NOT_AVAILABLE');
  }
  if (!Number.isInteger(contest.price_cents) || contest.price_cents <= 0 || contest.currency !== 'BRL') {
    throw new Error('CONTEST_PRICE_INVALID');
  }
  return contest;
}

export function checkoutPreference({ order, contest, payerEmail, returnBaseUrl, notificationUrl }) {
  const base = new URL(returnBaseUrl);
  if (base.protocol !== 'https:') throw new Error('RETURN_URL_INVALID');
  const notify = new URL(notificationUrl);
  if (notify.protocol !== 'https:') throw new Error('WEBHOOK_URL_INVALID');
  // Mercado Pago uses this flag to send the modern Webhooks payload instead of legacy IPN.
  notify.searchParams.set('source_news', 'webhooks');
  const returnUrl = (state) => {
    const url = new URL(base);
    url.searchParams.set('checkout', state);
    url.searchParams.set('contest', contest.id);
    return url.toString();
  };
  const courseName = String(contest.name || 'Curso DETONA').trim().slice(0, 120);
  return {
    items: [{
      id: contest.id,
      title: `DETONA | ${courseName}`,
      description: `Acesso à jornada DETONA — ${courseName}`,
      picture_url: DETONA_CHECKOUT_BRAND.pictureUrl,
      quantity: 1,
      currency_id: contest.currency,
      unit_price: order.amount_cents / 100,
    }],
    payer: { email: payerEmail },
    external_reference: order.id,
    notification_url: notify.toString(),
    back_urls: {
      success: returnUrl('success'),
      failure: returnUrl('cancelled'),
      pending: returnUrl('pending'),
    },
    auto_return: 'approved',
    binary_mode: false,
    statement_descriptor: DETONA_CHECKOUT_BRAND.statementDescriptor,
    metadata: { contest_id: contest.id, brand: 'detona' },
  };
}

export function selectCheckoutUrl(preference, mode) {
  const candidate = mode === 'production' ? preference?.init_point : preference?.sandbox_init_point;
  const url = new URL(String(candidate || ''));
  if (url.protocol !== 'https:' || !/(^|\.)mercadopago\.com(?:\.br)?$/i.test(url.hostname)) {
    throw new Error('CHECKOUT_URL_INVALID');
  }
  return url.toString();
}

export async function resolveReservedCheckout(reservation, {
  createPreference,
  readOrder,
  savePreference,
  releaseClaim,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  pollAttempts = 20,
  pollIntervalMs = 250,
}) {
  let order = reservation?.order;
  if (!order?.id || order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');
  if (order.checkout_url) {
    return { id: order.id, status: 'redirect', redirectUrl: order.checkout_url };
  }
  if (!reservation.preferenceClaimed) {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      await wait(pollIntervalMs);
      order = await readOrder(order.id);
      if (order?.checkout_url) {
        return { id: order.id, status: 'redirect', redirectUrl: order.checkout_url };
      }
      if (order?.status !== 'pending') throw new Error('ORDER_NOT_PENDING');
    }
    throw new Error('CHECKOUT_INITIALIZING');
  }
  try {
    const preference = await createPreference(order);
    await savePreference(order.id, preference);
    return { id: order.id, status: 'redirect', redirectUrl: preference.redirectUrl };
  } catch (error) {
    await releaseClaim(order.id);
    throw error;
  }
}
