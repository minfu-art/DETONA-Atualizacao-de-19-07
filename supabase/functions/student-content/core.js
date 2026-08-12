import { assertExactKeys, assertPlainObject, safeId } from '../_shared/adminValidation.js';

export const STUDENT_CONTENT_ACTIONS = Object.freeze(['list_catalog', 'set_interest', 'get_published_package']);

export function validateStudentContentRequest(input) {
  const body = assertPlainObject(input);
  if (!STUDENT_CONTENT_ACTIONS.includes(body.action)) throw new Error('action_not_allowed');
  if (body.action === 'list_catalog') {
    assertExactKeys(body, ['action']);
    return { action: body.action };
  }
  if (body.action === 'set_interest') {
    assertExactKeys(body, ['action', 'contestId', 'interested'], ['contestId', 'interested']);
    if (typeof body.interested !== 'boolean') throw new Error('interested_invalid');
    return { action: body.action, contestId: safeId(body.contestId, 'contest_id'), interested: body.interested };
  }
  assertExactKeys(body, ['action', 'contestId'], ['contestId']);
  return { action: body.action, contestId: safeId(body.contestId, 'contest_id') };
}

export function normalizeCatalogContest(contest, { interestCount = 0, interested = false } = {}) {
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
    contentStatus: ['draft', 'preparing', 'ready'].includes(contest.content_status) ? contest.content_status : 'preparing',
    salesStatus: contest.sales_status,
    examDate: contest.exam_date,
    coverAsset: contest.cover_asset,
    organization: contest.name,
    careerArea: contest.career_area || 'other',
    careerSubarea: contest.career_subarea || null,
    subtopicCount: Number(contest.subtopic_count || 0),
    questionCount: Number(contest.question_count || 0),
    interestCount: Math.max(0, Number(interestCount) || 0),
    interested: interested === true,
    interestGoal: Number.isInteger(Number(contest.interest_goal)) && Number(contest.interest_goal) > 0
      ? Number(contest.interest_goal) : null,
  };
}
