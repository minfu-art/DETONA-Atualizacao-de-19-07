import {
  assertExactKeys,
  assertPlainObject,
  safeEnum,
  safeId,
  safePagination,
  safeSearch,
  safeText,
  safeUuid,
} from '../_shared/adminValidation.js';

export const EDITORIAL_ACTIONS = Object.freeze([
  'list_questions', 'validate_batch', 'import_draft', 'transition',
  'generate_snapshot', 'publish_snapshot', 'rollback_snapshot',
]);

export function assertEditorialAction(action) {
  if (!EDITORIAL_ACTIONS.includes(action)) throw new Error('action_not_allowed');
  return action;
}

export function assertEditorialTransition(from, to) {
  const transitions = {
    draft: ['technical_review', 'archived'],
    technical_review: ['draft', 'approved', 'archived'],
    approved: ['technical_review', 'published', 'archived'],
    published: ['archived'],
    archived: ['draft'],
  };
  if (!transitions[from]?.includes(to)) throw new Error('transition_not_allowed');
  return to;
}

export function validateEditorialRequest(input) {
  const body = assertPlainObject(input);
  const action = assertEditorialAction(body.action);
  if (action === 'list_questions') {
    assertExactKeys(body, ['action', 'contestId', 'search', 'status', 'page', 'pageSize'], ['contestId']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      search: safeSearch(body.search),
      status: body.status ? safeEnum(body.status, ['draft', 'technical_review', 'approved', 'published', 'archived'], 'status') : null,
      ...safePagination(body),
    };
  }
  if (action === 'transition') {
    assertExactKeys(body, ['action', 'contestId', 'questionIds', 'status'], ['contestId', 'questionIds', 'status']);
    if (!Array.isArray(body.questionIds) || !body.questionIds.length || body.questionIds.length > 500) throw new Error('question_ids_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      questionIds: body.questionIds.map((id) => safeId(id, 'question_id')),
      status: safeEnum(body.status, ['draft', 'technical_review', 'approved', 'published', 'archived'], 'status'),
    };
  }
  if (action === 'import_draft' || action === 'validate_batch') {
    assertExactKeys(body, ['action', 'contestId', 'questions'], ['contestId', 'questions']);
    if (!Array.isArray(body.questions) || !body.questions.length || body.questions.length > 1000
      || JSON.stringify(body.questions).length > 2_000_000) throw new Error('questions_invalid');
    body.questions.forEach((question) => assertPlainObject(question, 'question'));
    return { action, contestId: safeId(body.contestId, 'contest_id'), questions: body.questions };
  }
  if (action === 'generate_snapshot') {
    assertExactKeys(body, ['action', 'contestId', 'version'], ['contestId', 'version']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      version: safeText(body.version, 'version', 80),
    };
  }
  assertExactKeys(body, ['action', 'contestId', 'versionId'], ['contestId', 'versionId']);
  return {
    action,
    contestId: safeId(body.contestId, 'contest_id'),
    versionId: safeUuid(body.versionId, 'version_id'),
  };
}
