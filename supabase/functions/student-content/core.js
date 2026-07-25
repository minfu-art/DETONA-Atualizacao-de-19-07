import { assertExactKeys, assertPlainObject, safeId } from '../_shared/adminValidation.js';

export const STUDENT_CONTENT_ACTIONS = Object.freeze(['list_catalog', 'get_published_package']);

export function validateStudentContentRequest(input) {
  const body = assertPlainObject(input);
  if (!STUDENT_CONTENT_ACTIONS.includes(body.action)) throw new Error('action_not_allowed');
  if (body.action === 'list_catalog') {
    assertExactKeys(body, ['action']);
    return { action: body.action };
  }
  assertExactKeys(body, ['action', 'contestId'], ['contestId']);
  return { action: body.action, contestId: safeId(body.contestId, 'contest_id') };
}

export function normalizeCatalogContest(contest) {
  return {
    id: contest.id,
    code: contest.code,
    name: contest.name,
    role: contest.role,
    description: contest.description,
    color: contest.color,
    accent: contest.accent,
    icon: contest.icon,
    priceCents: Number(contest.price_cents || 0),
    currency: contest.currency,
    contentStatus: contest.content_status === 'ready' ? 'ready' : 'preparing',
    salesStatus: contest.sales_status,
    examDate: contest.exam_date,
    coverAsset: contest.cover_asset,
  };
}
