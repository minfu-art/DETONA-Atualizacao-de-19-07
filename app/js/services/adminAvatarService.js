import { getSupabaseClient } from '../supabase/client.js';
import { READ_ONLY_CAPABILITIES, hasWriteCapability, normalizeAdminCapabilities } from './adminCapabilities.js';

export const CONTEST_VISUAL_TYPES = Object.freeze(['battle_avatar', 'success', 'error', 'attention', 'cover']);
export const AVATAR_ASSET_TYPES = Object.freeze([
  'portrait', 'full_body', 'chibi_head', 'success', 'error', 'attention',
  'victory', 'defeat', 'weapon', 'equipment',
]);
const ALLOWED_MIME = new Set(['image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 16_777_216;

export function precheckMediaFile(file) {
  if (!file) throw new Error('Selecione um arquivo.');
  if (!ALLOWED_MIME.has(file.type)) throw new Error('Use PNG ou WebP.');
  if (!file.size || file.size > MAX_BYTES) throw new Error('O arquivo deve ter no máximo 8 MB.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file.name)) throw new Error('Nome de arquivo inseguro.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if ((file.type === 'image/png' && extension !== 'png') || (file.type === 'image/webp' && extension !== 'webp')) {
    throw new Error('Extensão incompatível com o MIME.');
  }
  return { name: file.name, type: file.type, size: file.size };
}

export function detectTransparency(pixelData) {
  if (!pixelData || pixelData.length % 4 !== 0) throw new Error('Pixels inválidos.');
  for (let index = 3; index < pixelData.length; index += 4) if (pixelData[index] < 255) return true;
  return false;
}

async function decodeImageInBrowser(file) {
  if (typeof globalThis.createImageBitmap !== 'function') throw new Error('Decodificador de imagem indisponível.');
  const bitmap = await globalThis.createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION
      || bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('Dimensões de imagem inválidas.');
    const canvas = typeof globalThis.OffscreenCanvas === 'function'
      ? new globalThis.OffscreenCanvas(bitmap.width, bitmap.height) : globalThis.document?.createElement?.('canvas');
    if (!canvas) throw new Error('Canvas indisponível.');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Imagem não pôde ser inspecionada.');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally {
    bitmap.close?.();
  }
}

export async function validateMediaFile(file, { requireTransparency = false, decodeImage = decodeImageInBrowser } = {}) {
  const precheck = precheckMediaFile(file);
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new Error('Arquivo de imagem inválido ou não decodificável.');
  }
  const width = Number(decoded?.width);
  const height = Number(decoded?.height);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0
    || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS
    || decoded.pixels?.length !== width * height * 4) throw new Error('Dimensões de imagem inválidas.');
  const hasTransparency = detectTransparency(decoded.pixels);
  if (requireTransparency && !hasTransparency) throw new Error('A imagem precisa possuir transparência real.');
  return { ...precheck, width, height, hasTransparency, valid: true };
}

export class AdminAvatarService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #invoke(action, payload) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend de mídia indisponível.');
    const { data, error } = await client.functions.invoke('admin-media', { body: { action, ...payload } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Operação de mídia indisponível.');
    return { client, data };
  }

  async listCollections(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    try {
      const { data } = await this.#invoke('list_collections', { contestId });
      const capabilities = normalizeAdminCapabilities(data.capabilities, READ_ONLY_CAPABILITIES);
      return { rows: data.collections || [], capabilities, writable: hasWriteCapability(capabilities) };
    } catch {
      return { rows: [], capabilities: { ...READ_ONLY_CAPABILITIES }, writable: false };
    }
  }

  async listContestAssets(contestId) {
    const { data } = await this.#invoke('list_contest_assets', { contestId });
    return data;
  }

  async uploadContestAsset(contestId, assetType, file, { requireTransparency = assetType !== 'cover' } = {}) {
    precheckMediaFile(file);
    const { client, data: signed } = await this.#invoke('create_signed_upload', {
      contestId,
      file: { name: file.name, mimeType: file.type, size: file.size },
    });
    const { error: uploadError } = await client.storage.from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
    if (uploadError) throw new Error('Falha no upload assinado.');
    const { data } = await this.#invoke('register_asset', {
      contestId,
      asset: { storagePath: signed.path, assetType, requireTransparency },
    });
    return data.asset;
  }

  async removeDraftAsset(contestId, assetId) {
    const { data } = await this.#invoke('remove_draft_asset', { contestId, assetId });
    return data;
  }

  async saveContestVisual(contestId, visual, { publish = false } = {}) {
    const normalized = Object.fromEntries(CONTEST_VISUAL_TYPES.map((key) => [key, visual[key] || null]));
    const { data } = await this.#invoke(publish ? 'publish_contest_visual' : 'save_contest_visual', { contestId, visual: normalized });
    return data;
  }
}

export const adminAvatarService = new AdminAvatarService();
