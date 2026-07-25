import { getSupabaseClient } from '../supabase/client.js';

export const AVATAR_ASSET_TYPES = Object.freeze([
  'portrait', 'full_body', 'chibi_head', 'success', 'error', 'attention',
  'victory', 'defeat', 'weapon', 'equipment',
]);
const ALLOWED_MIME = new Set(['image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export function validateMediaFile(file, { requireTransparency = false } = {}) {
  if (!file) throw new Error('Selecione um arquivo.');
  if (!ALLOWED_MIME.has(file.type)) throw new Error('Use PNG ou WebP.');
  if (!file.size || file.size > MAX_BYTES) throw new Error('O arquivo deve ter no máximo 8 MB.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file.name)) throw new Error('Nome de arquivo inseguro.');
  if (requireTransparency && file.type !== 'image/png' && file.type !== 'image/webp') {
    throw new Error('Este ativo exige transparência.');
  }
  return { name: file.name, type: file.type, size: file.size, valid: true };
}

export class AdminAvatarService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async listCollections(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    const client = await this.getClient();
    if (!client) return { rows: [], writable: false };
    const { data, error } = await client.functions.invoke('admin-media', {
      body: { action: 'list_collections', contestId },
    });
    if (error || data?.error) return { rows: [], writable: false };
    return { rows: data.collections || [], writable: true };
  }
}

export const adminAvatarService = new AdminAvatarService();
