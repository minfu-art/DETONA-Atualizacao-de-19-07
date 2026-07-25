import { DISCIPLINE_DEFS } from '../data/editalSeed.js';
import { getSupabaseClient } from '../supabase/client.js';
import { READ_ONLY_CAPABILITIES, hasWriteCapability, normalizeAdminCapabilities } from './adminCapabilities.js';

export const CURRICULUM_NODE_TYPES = Object.freeze(['role', 'discipline', 'topic', 'subtopic']);
export const CURRICULUM_STATUSES = Object.freeze(['draft', 'active', 'inactive', 'archived']);
const MAX_NODES = 10_000;
const LEVELS = Object.freeze([
  ['roles', 'role'],
  ['disciplines', 'discipline'],
  ['topics', 'topic'],
  ['subtopics', 'subtopic'],
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} deve ser um objeto.`);
  return value;
}

function exact(value, allowed, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label}: campo inesperado (${unexpected[0]}).`);
}

function text(value, label, max = 240) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > max || /<\/?[a-z][^>]*>/i.test(clean)) throw new Error(`${label} inválido.`);
  return clean;
}

export function parseCurriculumImport(raw, expectedContestId) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  object(payload, 'Currículo');
  exact(payload, ['schema_version', 'contest_id', 'roles'], 'Currículo');
  if (payload.schema_version !== 1) throw new Error('schema_version deve ser 1.');
  if (String(payload.contest_id) !== String(expectedContestId)) throw new Error('contest_id não corresponde ao workspace selecionado.');
  if (!Array.isArray(payload.roles) || !payload.roles.length) throw new Error('roles deve conter pelo menos um cargo.');
  const ids = new Set();
  const nodes = [];
  const counts = { roles: 0, disciplines: 0, topics: 0, subtopics: 0 };
  const visit = (items, depth, parentSourceId = null) => {
    const [collection, type] = LEVELS[depth] || [];
    if (!collection || !Array.isArray(items)) throw new Error('Hierarquia curricular inválida.');
    items.forEach((rawNode, index) => {
      const node = object(rawNode, type);
      const childCollection = LEVELS[depth + 1]?.[0];
      exact(node, ['id', 'name', 'description', 'order', ...(childCollection ? [childCollection] : [])], type);
      const id = text(node.id, `${type}.id`, 80);
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`${type}.id inválido.`);
      if (ids.has(id)) throw new Error(`ID curricular duplicado: ${id}.`);
      ids.add(id);
      const order = Number(node.order ?? index);
      if (!Number.isInteger(order) || order < 0 || order > 100_000) throw new Error(`Ordem inválida em ${id}.`);
      nodes.push({
        source_id: id,
        parent_source_id: parentSourceId,
        type,
        name: text(node.name, `${type}.name`),
        description: node.description ? text(node.description, `${type}.description`, 1000) : null,
        order_index: order,
      });
      counts[collection] += 1;
      if (nodes.length > MAX_NODES) throw new Error(`Currículo excede ${MAX_NODES} nós.`);
      if (childCollection) {
        if (!Array.isArray(node[childCollection]) || !node[childCollection].length) {
          throw new Error(`${id} deve possuir ${childCollection}.`);
        }
        visit(node[childCollection], depth + 1, id);
      }
    });
  };
  visit(payload.roles, 0);
  return { valid: true, schemaVersion: 1, contestId: expectedContestId, nodes, counts, errors: [], warnings: [] };
}

export function validateCurriculumNode(input = {}, contestId) {
  if (!contestId) throw new Error('contestId é obrigatório.');
  const type = String(input.type || '');
  if (!CURRICULUM_NODE_TYPES.includes(type)) throw new Error('Tipo editorial inválido.');
  return {
    id: String(input.id || '').trim() || undefined,
    contest_id: contestId,
    parent_id: input.parent_id || null,
    type,
    name: text(input.name, 'Nome editorial'),
    description: String(input.description || '').trim() || null,
    order_index: Math.max(0, Number.parseInt(input.order_index || 0, 10)),
    status: CURRICULUM_STATUSES.includes(input.status) ? input.status : 'draft',
  };
}

function staticNodes(contestId) {
  if (contestId !== 'pc_al_2026') return [];
  return DISCIPLINE_DEFS.map((discipline, index) => ({
    id: discipline.id, source_id: discipline.id, contest_id: contestId, parent_id: 'role_pc_al',
    type: 'discipline', name: discipline.name, description: discipline.biome,
    order_index: discipline.order ?? index, status: 'active', child_count: discipline.items.length,
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
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Operação curricular indisponível.');
    return data;
  }

  async listNodes(contestId) {
    if (!contestId) throw new Error('contestId é obrigatório.');
    try {
      const result = await this.#invoke('get_curriculum_tree', { contestId });
      const capabilities = normalizeAdminCapabilities(result.capabilities, READ_ONLY_CAPABILITIES);
      return { rows: result.nodes || [], source: 'administrative_table', capabilities, writable: hasWriteCapability(capabilities) };
    } catch {
      return { rows: staticNodes(contestId), source: 'static_edital', capabilities: { ...READ_ONLY_CAPABILITIES }, writable: false };
    }
  }

  validateImport(raw, contestId) {
    return parseCurriculumImport(raw, contestId);
  }

  async importDraft(raw, contestId, { replace = false } = {}) {
    const validation = parseCurriculumImport(raw, contestId);
    return this.#invoke(replace ? 'replace_curriculum_draft' : 'import_curriculum_draft', {
      contestId,
      schemaVersion: validation.schemaVersion,
      nodes: validation.nodes,
    });
  }

  async saveNode(contestId, input) {
    return this.#invoke('save_curriculum_node', { contestId, node: validateCurriculumNode(input, contestId) });
  }

  async reorderNodes(contestId, orderedIds) {
    if (!Array.isArray(orderedIds) || new Set(orderedIds).size !== orderedIds.length) throw new Error('Ordem editorial inválida.');
    return this.#invoke('reorder_curriculum', { contestId, orderedIds });
  }
}

export const adminCurriculumService = new AdminCurriculumService();
