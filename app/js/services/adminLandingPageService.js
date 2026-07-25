import { getSupabaseClient } from '../supabase/client.js';

export const LANDING_BLOCK_TYPES = Object.freeze([
  'hero', 'benefits', 'method', 'features', 'demo', 'testimonials',
  'price', 'faq', 'cta', 'footer',
]);

export function validateLandingBlock(input = {}) {
  const type = String(input.type || '');
  if (!LANDING_BLOCK_TYPES.includes(type)) throw new Error('Tipo de bloco não permitido.');
  const content = input.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Conteúdo do bloco inválido.');
  const serialized = JSON.stringify(content);
  if (/<(?:script|iframe|object|embed|style)\b/i.test(serialized)) throw new Error('HTML arbitrário não é permitido.');
  if (serialized.length > 20_000) throw new Error('Bloco excede o limite permitido.');
  return {
    type,
    content,
    order_index: Math.max(0, Number.parseInt(input.order_index || 0, 10)),
    is_enabled: input.is_enabled !== false,
  };
}

export class AdminLandingPageService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async list(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    const client = await this.getClient();
    if (!client) return { rows: [], writable: false };
    const { data, error } = await client.functions.invoke('admin-site', {
      body: { action: 'list_pages', contestId },
    });
    if (error || data?.error) return { rows: [], writable: false };
    return { rows: data.pages || [], writable: true };
  }
}

export const adminLandingPageService = new AdminLandingPageService();
