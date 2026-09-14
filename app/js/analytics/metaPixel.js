import { ENV } from '../config/env.js';

const PIXEL_ID_PATTERN = /^\d+$/;
const PURCHASE_STORAGE_PREFIX = 'detona:meta-purchase:';

function pixelId() {
  const value = String(ENV.META_PIXEL_ID || '').trim();
  return PIXEL_ID_PATTERN.test(value) ? value : null;
}

function canTrack() {
  return ENV.APP_ENV === 'production' && typeof window !== 'undefined' && Boolean(pixelId());
}

function ensurePixel() {
  if (!canTrack()) return null;
  if (typeof window.fbq !== 'function') {
    const fbq = function pixelQueue(...args) {
      fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    window.fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  if (!window.__detonaMetaPixelInitialized) {
    window.fbq('init', pixelId());
    window.__detonaMetaPixelInitialized = true;
  }
  return window.fbq;
}

function remembered(key) {
  try { return window.sessionStorage.getItem(key) === '1'; } catch { return false; }
}

function remember(key) {
  try { window.sessionStorage.setItem(key, '1'); } catch { /* armazenamento pode estar indisponível */ }
}

export function purchasePayload(contest) {
  const value = Number(contest?.priceCents);
  if (!contest?.id || !Number.isInteger(value) || value <= 0) return null;
  return {
    content_ids: [String(contest.id)],
    content_name: String(contest.name || contest.id),
    content_type: 'product',
    num_items: 1,
    value: value / 100,
    currency: String(contest.currency || 'BRL').toUpperCase(),
  };
}

export function trackConfirmedPurchase(contest) {
  const payload = purchasePayload(contest);
  if (!payload) return false;
  const key = `${PURCHASE_STORAGE_PREFIX}${contest.id}`;
  if (!canTrack() || remembered(key)) return false;
  const fbq = ensurePixel();
  if (!fbq) return false;
  fbq('track', 'Purchase', payload);
  remember(key);
  return true;
}
