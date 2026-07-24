/**
 * Retorna a data civil do dispositivo, sem converter para UTC.
 * Timestamps completos continuam sendo persistidos em ISO.
 */
export function localDateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('INVALID_LOCAL_DATE');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(value, amount) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('INVALID_LOCAL_DATE');
  date.setDate(date.getDate() + Number(amount || 0));
  return date;
}

export function previousLocalDateKey(value = new Date()) {
  return localDateKey(addLocalDays(value, -1));
}
