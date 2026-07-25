import {
  READ_ONLY_CAPABILITIES,
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
  'list_contests', 'save_contest', 'publish', 'suspend', 'archive',
  'list_curriculum', 'save_curriculum_node', 'reorder_curriculum', 'list_audit',
]);

export function assertAdminContestAction(action) {
  if (!ADMIN_CONTEST_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

export { READ_ONLY_CAPABILITIES };

export function validateAdminContestRequest(input) {
  const body = assertPlainObject(input);
  const action = assertAdminContestAction(body.action);
  const common = ['action'];
  if (action === 'list_contests') {
    assertExactKeys(body, [...common, 'search']);
    return { action, search: safeSearch(body.search) };
  }
  if (action === 'list_curriculum') {
    assertExactKeys(body, [...common, 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  if (action === 'list_audit') {
    assertExactKeys(body, [...common, 'contestId', 'page', 'pageSize']);
    return {
      action,
      contestId: body.contestId ? safeId(body.contestId, 'contest_id') : null,
      ...safePagination(body),
    };
  }
  if (action === 'save_contest') {
    assertExactKeys(body, [...common, 'contest'], ['contest']);
    const contest = assertExactKeys(body.contest, [
      'id', 'code', 'slug', 'name', 'role', 'description', 'price_cents', 'currency',
      'color', 'accent', 'icon', 'content_status', 'sales_status', 'exam_date',
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
      action,
      contest: {
        id: safeId(contest.id),
        code: safeText(contest.code, 'code', 30),
        slug: safeId(contest.slug, 'slug'),
        name: safeText(contest.name, 'name', 160),
        role: safeText(contest.role, 'role', 160),
        description: safeText(contest.description, 'description', 600),
        price_cents: priceCents,
        currency,
        color,
        accent,
        icon: safeText(contest.icon || contest.code, 'icon', 30),
        content_status: safeEnum(contest.content_status || 'draft', ['draft', 'preparing', 'ready', 'archived'], 'content_status'),
        sales_status: safeEnum(contest.sales_status || 'unavailable', ['unavailable', 'coming_soon', 'available', 'suspended'], 'sales_status'),
        exam_date: examDate,
      },
    };
  }
  if (action === 'save_curriculum_node') {
    assertExactKeys(body, [...common, 'contestId', 'node'], ['contestId', 'node']);
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
        name: safeText(node.name, 'name', 240),
        description: safeText(node.description, 'description', 1000, { optional: true }),
        order_index: orderIndex,
        status: safeEnum(node.status || 'draft', ['draft', 'active', 'inactive', 'archived'], 'status'),
      },
    };
  }
  if (action === 'reorder_curriculum') {
    assertExactKeys(body, [...common, 'contestId', 'orderedIds'], ['contestId', 'orderedIds']);
    if (!Array.isArray(body.orderedIds) || body.orderedIds.length > 1000) throw new Error('ordered_ids_invalid');
    return { action, contestId: safeId(body.contestId, 'contest_id'), orderedIds: body.orderedIds.map((id) => safeUuid(id)) };
  }
  assertExactKeys(body, [...common, 'contestId'], ['contestId']);
  return { action, contestId: safeId(body.contestId, 'contest_id') };
}

export function sanitizedAuditMetadata(input = {}) {
  const blocked = /password|token|jwt|secret|service.?role|authorization/i;
  return Object.fromEntries(Object.entries(input)
    .filter(([key]) => !blocked.test(key))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]));
}
