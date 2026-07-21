let activeUserId = null;

export function setActiveUserId(userId) {
  activeUserId = userId || null;
}

export function getActiveUserId() {
  return activeUserId;
}

export function requireActiveUserId() {
  if (!activeUserId) throw new Error('AUTH_REQUIRED');
  return activeUserId;
}

export function clearActiveUserId() {
  activeUserId = null;
}
