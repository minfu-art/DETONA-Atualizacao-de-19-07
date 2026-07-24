/**
 * Sistema Kafra — Backup/Restore criptografado (.rpgsave)
 * Criptografia simples XOR + base64 (proteção casual, não militar).
 * Offline-first: tudo no cliente.
 */
import { exportFullSnapshot, importFullSnapshot } from './db.js';
import { localDateKey } from './localDate.js';

const KAFRA_KEY = 'DETONA_KAFRA_RO_v1';

function xorBytes(bytes, key) {
  const k = new TextEncoder().encode(key);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ k[i % k.length];
  }
  return out;
}

function toBase64(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeKafraSnapshot(snapshot) {
  const plain = new TextEncoder().encode(JSON.stringify(snapshot));
  return 'KAFRA1:' + toBase64(xorBytes(plain, KAFRA_KEY));
}

export function decodeKafraPayload(text) {
  if (!String(text).startsWith('KAFRA1:')) return JSON.parse(text);
  const enc = fromBase64(String(text).slice(7));
  return JSON.parse(new TextDecoder().decode(xorBytes(enc, KAFRA_KEY)));
}

export async function saveToKafra() {
  const snapshot = await exportFullSnapshot();
  const payload = encodeKafraSnapshot(snapshot);
  const blob = new Blob([payload], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = localDateKey();
  a.href = url;
  a.download = `detona_concursos_${date}.rpgsave`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function loadFromKafra(file) {
  const text = await file.text();
  try {
    await importFullSnapshot(decodeKafraPayload(text));
    return true;
  } catch (error) {
    if (error?.message) throw error;
    throw new Error('Arquivo .rpgsave inválido; os dados atuais foram preservados.');
  }
}
