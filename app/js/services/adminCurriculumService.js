import { DISCIPLINE_DEFS } from '../data/editalSeed.js';
import { getSupabaseClient } from '../supabase/client.js';

export const CURRICULUM_NODE_TYPES = Object.freeze(['role', 'discipline', 'topic', 'subtopic']);
export const CURRICULUM_STATUSES = Object.freeze(['draft', 'active', 'inactive', 'archived']);

export function validateCurriculumNode(input = {}, contestId) {
  if (!contestId) throw new Error('contestId é obrigatório.');
  const type = String(input.type || '');
  if (!CURRICULUM_NODE_TYPES.includes(type)) throw new Error('Tipo editorial inválido.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 240) throw new Error('Nome editorial inválido.');
  return {
    id: String(input.id || '').trim() || undefined,
    contest_id: contestId,
    parent_id: input.parent_id || null,
    type,
    name,
    description: String(input.description || '').trim() || null,
    order_index: Math.max(0, Number.parseInt(input.order_index || 0, 10)),
    status: CURRICULUM_STATUSES.includes(input.status) ? input.status : 'draft',
  };
}

function staticNodes(contestId) {
  if (contestId !== 'pc_al_2026') return [];
  return DISCIPLINE_DEFS.map((discipline, index) => ({
    id: discipline.id,
    contest_id: contestId,
    parent_id: 'role_pc_al',
    type: 'discipline',
    name: discipline.name,
    description: discipline.biome,
    order_index: discipline.order ?? index,
    status: 'active',
    question_count: null,
    child_count: discipline.items.length,
    source: 'static_edital',
  }));
}

export class AdminCurriculumService {
  constructor({ getClient = getSupabaseClient } = {}) {
    this.getClient = getClient;
  }

  async #invoke(action, payload) {
    const client = await this.getClient();
    if (!client) throw new Error('Backend administrativo indisponível.');
    const { data, error } = await client.functions.invoke('admin-contests', { body: { action, ...payload } });
    if (error || data?.error) throw new Error('Estrutura editorial ainda não publicada no staging.');
    return data;
  }

  async listNodes(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    try {
      const result = await this.#invoke('list_curriculum', { contestId });
      return { rows: result.nodes || [], source: 'administrative_table', writable: true };
    } catch {
      return { rows: staticNodes(contestId), source: 'static_edital', writable: false };
    }
  }

  async saveNode(contestId, input) {
    return this.#invoke('save_curriculum_node', { contestId, node: validateCurriculumNode(input, contestId) });
  }

  async reorderNodes(contestId, orderedIds) {
    if (!Array.isArray(orderedIds) || new Set(orderedIds).size !== orderedIds.length) {
      throw new Error('Ordem editorial inválida.');
    }
    return this.#invoke('reorder_curriculum', { contestId, orderedIds });
  }
}

export const adminCurriculumService = new AdminCurriculumService();
