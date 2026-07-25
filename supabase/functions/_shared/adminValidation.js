export function assertPlainObject(value, label = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_invalid`);
  return value;
}

export function assertExactKeys(value, allowed, required = []) {
  assertPlainObject(value);
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) throw new Error('unexpected_field');
  if (required.some((key) => !Object.hasOwn(value, key))) throw new Error('required_field_missing');
  return value;
}

export function safeId(value, label = 'id') {
  const clean = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(clean)) throw new Error(`${label}_invalid`);
  return clean;
}

export function safeUuid(value, label = 'id') {
  const clean = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw new Error(`${label}_invalid`);
  }
  return clean;
}

export function safeText(value, label, max, { optional = false } = {}) {
  const clean = String(value ?? '').trim();
  if (!clean && optional) return '';
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/u.test(clean)) throw new Error(`${label}_invalid`);
  return clean;
}

export function safeSearch(value = '') {
  const clean = String(value || '').trim();
  if (clean.length > 100 || !/^[\p{L}\p{N}\s._/-]*$/u.test(clean)) throw new Error('search_invalid');
  return clean;
}

export function safePagination(value = {}) {
  const page = Number.parseInt(value.page ?? 1, 10);
  const pageSize = Number.parseInt(value.pageSize ?? 20, 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('pagination_invalid');
  }
  return { page, pageSize };
}

export function safeEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label}_invalid`);
  return value;
}

export function safeHttpsUrl(value, label = 'url', { optional = false } = {}) {
  if ((value == null || value === '') && optional) return null;
  let url;
  try { url = new URL(String(value)); } catch { throw new Error(`${label}_invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label}_invalid`);
  return url.toString();
}

export const READ_ONLY_CAPABILITIES = Object.freeze({
  read: true, create: false, update: false, publish: false, archive: false,
});
