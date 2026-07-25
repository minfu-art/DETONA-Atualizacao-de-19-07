import {
  OPERATIONAL_CAPABILITIES,
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeId,
  safePagination,
  safeSearch,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const ADMIN_CONTEST_ACTIONS = Object.freeze([
  'list_contests', 'get_contest', 'create_contest', 'update_contest',
  'publish', 'suspend', 'archive', 'list_curriculum', 'save_curriculum_node',
  'reorder_curriculum', 'list_audit', 'validate_curriculum_import',
  'import_curriculum_draft', 'get_curriculum_tree', 'replace_curriculum_draft',
]);

export function assertAdminContestAction(action) {
  if (!ADMIN_CONTEST_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

export { OPERATIONAL_CAPABILITIES };

function rejectMarkup(value, label) {
  if (/<\/?[a-z][^>]*>/i.test(String(value || ''))) throw new Error(`${label}_html_not_allowed`);
  return value;
}

export function validateContestRecord(contest) {
  assertExactKeys(contest, [
    'id', 'code', 'slug', 'name', 'role', 'description', 'price_cents', 'currency',
    'color', 'accent', 'icon', 'cover_asset', 'content_status', 'sales_status', 'exam_date',
  ], ['id', 'code', 'slug', 'name', 'role', 'description']);
  const priceCents = Number(contest.price_cents ?? 0);
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) throw new Error('price_cents_invalid');
  const currency = String(contest.currency || 'BRL').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency_invalid');
  const color = String(contest.color || '#7c6af5');
  const accent = String(contest.accent || '#ff8a1f');
  if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('color_invalid');
  const examDate = contest.exam_date == null || contest.exam_date === '' ? null : String(contest.exam_date);
  if (examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Number.isNaN(Date.parse(`${examDate}T00:00:00Z`)))) {
    throw new Error('exam_date_invalid');
  }
  return {
    id: safeId(contest.id),
    code: safeText(rejectMarkup(contest.code, 'code'), 'code', 30),
    slug: safeId(contest.slug, 'slug'),
    name: safeText(rejectMarkup(contest.name, 'name'), 'name', 160),
    role: safeText(rejectMarkup(contest.role, 'role'), 'role', 160),
    description: safeText(rejectMarkup(contest.description, 'description'), 'description', 600),
    price_cents: priceCents,
    currency,
    color,
    accent,
    icon: safeText(rejectMarkup(contest.icon || contest.code, 'icon'), 'icon', 30),
    cover_asset: contest.cover_asset
      ? safeText(rejectMarkup(contest.cover_asset, 'cover_asset'), 'cover_asset', 500)
      : null,
    content_status: safeEnum(contest.content_status || 'draft', ['draft', 'preparing', 'ready', 'archived'], 'content_status'),
    sales_status: safeEnum(contest.sales_status || 'unavailable', ['unavailable', 'coming_soon', 'available', 'suspended'], 'sales_status'),
    exam_date: examDate,
  };
}

export function validateAdminContestRequest(input) {
  const body = assertPlainObject(input);
  const action = assertAdminContestAction(body.action);
  if (action === 'list_contests') {
    assertExactKeys(body, ['action', 'search']);
    return { action, search: safeSearch(body.search) };
  }
  if (action === 'get_contest' || action === 'list_curriculum' || action === 'get_curriculum_tree') {
    assertExactKeys(body, ['action', 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  if (action === 'list_audit') {
    assertExactKeys(body, ['action', 'contestId', 'page', 'pageSize']);
    return {
      action,
      contestId: body.contestId ? safeId(body.contestId, 'contest_id') : null,
      ...safePagination(body),
    };
  }
  if (action === 'create_contest' || action === 'update_contest') {
    assertExactKeys(body, ['action', 'contest'], ['contest']);
    return { action, contest: validateContestRecord(body.contest) };
  }
  if (action === 'validate_curriculum_import' || action === 'import_curriculum_draft' || action === 'replace_curriculum_draft') {
    assertExactKeys(body, ['action', 'contestId', 'schemaVersion', 'nodes'], ['contestId', 'schemaVersion', 'nodes']);
    if (body.schemaVersion !== 1 || !Array.isArray(body.nodes) || !body.nodes.length || body.nodes.length > 10_000) {
      throw new Error('curriculum_import_invalid');
    }
    const ids = new Set();
    const nodes = body.nodes.map((raw) => {
      const node = assertExactKeys(raw, [
        'source_id', 'parent_source_id', 'type', 'name', 'description', 'order_index',
      ], ['source_id', 'parent_source_id', 'type', 'name', 'order_index']);
      const sourceId = safeId(node.source_id, 'source_id');
      if (ids.has(sourceId)) throw new Error('curriculum_source_id_duplicate');
      ids.add(sourceId);
      const orderIndex = Number(node.order_index);
      if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 100_000) throw new Error('order_index_invalid');
      return {
        source_id: sourceId,
        parent_source_id: node.parent_source_id ? safeId(node.parent_source_id, 'parent_source_id') : null,
        type: safeEnum(node.type, ['role', 'discipline', 'topic', 'subtopic'], 'type'),
        name: safeText(rejectMarkup(node.name, 'name'), 'name', 240),
        description: node.description ? safeText(rejectMarkup(node.description, 'description'), 'description', 1000) : null,
        order_index: orderIndex,
      };
    });
    for (const node of nodes) {
      if (node.parent_source_id && !ids.has(node.parent_source_id)) throw new Error('curriculum_parent_missing');
    }
    return { action, contestId: safeId(body.contestId, 'contest_id'), schemaVersion: 1, nodes };
  }
  if (action === 'save_curriculum_node') {
    assertExactKeys(body, ['action', 'contestId', 'node'], ['contestId', 'node']);
    const node = assertExactKeys(body.node, ['id', 'parent_id', 'type', 'name', 'description', 'order_index', 'status'], ['type', 'name']);
    const orderIndex = Number(node.order_index ?? 0);
    if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 100_000) throw new Error('order_index_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      node: {
        id: node.id ? safeUuid(node.id) : null,
        parent_id: node.parent_id ? safeUuid(node.parent_id, 'parent_id') : null,
        type: safeEnum(node.type, ['role', 'discipline', 'topic', 'subtopic'], 'type'),
        name: safeText(rejectMarkup(node.name, 'name'), 'name', 240),
        description: safeText(rejectMarkup(node.description, 'description'), 'description', 1000, { optional: true }),
        order_index: orderIndex,
        status: safeEnum(node.status || 'draft', ['draft', 'active', 'inactive', 'archived'], 'status'),
      },
    };
  }
  if (action === 'reorder_curriculum') {
    assertExactKeys(body, ['action', 'contestId', 'orderedIds'], ['contestId', 'orderedIds']);
    if (!Array.isArray(body.orderedIds) || body.orderedIds.length > 1000) throw new Error('ordered_ids_invalid');
    return { action, contestId: safeId(body.contestId, 'contest_id'), orderedIds: body.orderedIds.map((id) => safeUuid(id)) };
  }
  assertExactKeys(body, ['action', 'contestId'], ['contestId']);
  return { action, contestId: safeId(body.contestId, 'contest_id') };
}

export function sanitizedAuditMetadata(input = {}) {
  const blocked = /password|token|jwt|secret|service.?role|authorization/i;
  return Object.fromEntries(Object.entries(input)
    .filter(([key]) => !blocked.test(key))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]));
}
