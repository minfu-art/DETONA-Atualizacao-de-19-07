export function mobileCheckoutContext() {
  const standalone = globalThis.matchMedia?.('(display-mode: standalone)')?.matches
    || globalThis.navigator?.standalone === true;
  // A regular mobile browser can complete payment in the same tab.
  // Only an installed PWA needs an external browser window.
  return Boolean(standalone);
}

function renderWaitingState(target) {
  try {
    target.document.title = 'Abrindo pagamento seguro — DETONA';
    target.document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#060914;color:#f8fafc;font-family:system-ui,sans-serif;text-align:center">
        <div><strong style="display:block;font-size:20px">Abrindo pagamento seguro...</strong><span style="display:block;margin-top:8px;color:#a9b4c8">Aguarde enquanto preparamos o checkout no navegador.</span></div>
      </main>`;
  } catch {
    // O documento provisório pode ser restrito; a navegação ainda é válida.
  }
}

export function reserveCheckoutBrowserWindow({
  enabled = mobileCheckoutContext(),
  openWindow = globalThis.open?.bind(globalThis),
} = {}) {
  if (!enabled || !openWindow) return null;
  try {
    const target = openWindow('about:blank', '_blank');
    if (!target) return null;
    renderWaitingState(target);
    try { target.opener = null; } catch { /* proteção adicional quando suportada */ }
    return target;
  } catch {
    return null;
  }
}

export function closeReservedCheckoutWindow(target) {
  try {
    if (target && !target.closed) target.close();
  } catch {
    // O checkout principal continuará exibindo o erro.
  }
}

export function navigateToCheckout(redirectUrl, {
  target = null,
  currentLocation = globalThis.location,
} = {}) {
  if (target && !target.closed) {
    try {
      target.location.replace(redirectUrl);
      return 'browser-window';
    } catch {
      closeReservedCheckoutWindow(target);
    }
  }
  currentLocation.assign(redirectUrl);
  return 'current-window';
}
