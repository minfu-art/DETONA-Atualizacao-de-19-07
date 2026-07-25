export const READ_ONLY_CAPABILITIES = Object.freeze({
  read: true,
  create: false,
  update: false,
  publish: false,
  archive: false,
});

export const NO_CAPABILITIES = Object.freeze({
  read: false,
  create: false,
  update: false,
  publish: false,
  archive: false,
});

export function normalizeAdminCapabilities(value, fallback = NO_CAPABILITIES) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };
  return Object.fromEntries(Object.keys(NO_CAPABILITIES).map((key) => [key, value[key] === true]));
}

export function hasWriteCapability(capabilities = {}) {
  return ['create', 'update', 'publish', 'archive'].some((key) => capabilities[key] === true);
}
