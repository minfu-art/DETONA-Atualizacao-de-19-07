import { ENV } from '../config/env.js';
import { VerifiedPurchaseTracking } from './verifiedPurchaseTracking.js';

let pixelLoad;
function loadPixel() {
  if (pixelLoad) return pixelLoad;
  pixelLoad = new Promise((resolve) => {
    const win = globalThis;
    if (!win.fbq) {
      const fbq = function (...args) { fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args); };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.push = fbq;
      win.fbq = fbq;
      win._fbq = fbq;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const timer = setTimeout(() => resolve(false), 10000);
    script.onload = () => { clearTimeout(timer); resolve(true); };
    script.onerror = () => { clearTimeout(timer); resolve(false); };
    document.head.append(script);
  }).then((loaded) => {
    if (loaded) globalThis.fbq('init', ENV.META_PIXEL_ID);
    else pixelLoad = null;
    return loaded;
  });
  return pixelLoad;
}

async function sendPurchase({ eventId, payload }) {
  if (ENV.APP_ENV !== 'production' || !ENV.META_PURCHASE_TRACKING_ENABLED
    || !/^\d+$/.test(ENV.META_PIXEL_ID)) return false;
  // Never hand authentication/recovery tokens in the current URL to a marketing script.
  const current = new URL(globalThis.location.href);
  if (/access_token|refresh_token|code=|token=|recovery|password/i.test(current.search + current.hash)) return false;
  if (!await loadPixel()) return false;
  globalThis.fbq('trackSingle', ENV.META_PIXEL_ID, 'Purchase', payload, { eventID: eventId });
  return true; // Queued to the Pixel, not proof of receipt/attribution by Meta.
}

let tracking;
export function getPurchaseTracking() {
  if (!tracking) {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Private mode fallback. */ }
    tracking = new VerifiedPurchaseTracking({ storage, send: sendPurchase });
  }
  return tracking;
}
