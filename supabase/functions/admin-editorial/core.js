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
  'list_questions', 'list_batches', 'validate_batch', 'import_draft', 'update_draft',
  'delete_draft', 'transition', 'generate_snapshot', 'publish_snapshot', 'rollback_snapshot',
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

function questions(value) {
  if (!Array.isArray(value) || !value.length || value.length > 1000 || JSON.stringify(value).length > 2_000_000) {
    throw new Error('questions_invalid');
  }
  value.forEach((question) => assertPlainObject(question, 'question'));
  return value;
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
  if (action === 'list_batches') {
    assertExactKeys(body, ['action', 'contestId'], ['contestId']);
    return { action, contestId: safeId(body.contestId, 'contest_id') };
  }
  if (action === 'transition' || action === 'delete_draft') {
    assertExactKeys(body, ['action', 'contestId', 'questionIds', ...(action === 'transition' ? ['status'] : [])], ['contestId', 'questionIds', ...(action === 'transition' ? ['status'] : [])]);
    if (!Array.isArray(body.questionIds) || !body.questionIds.length || body.questionIds.length > 500) throw new Error('question_ids_invalid');
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      questionIds: body.questionIds.map((id) => safeId(id, 'question_id')),
      ...(action === 'transition' ? { status: safeEnum(body.status, ['draft', 'technical_review', 'approved', 'published', 'archived'], 'status') } : {}),
    };
  }
  if (action === 'import_draft' || action === 'validate_batch') {
    assertExactKeys(body, ['action', 'contestId', 'batchName', 'questions'], ['contestId', 'questions']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      batchName: safeText(body.batchName || 'Importação JSON', 'batch_name', 160),
      questions: questions(body.questions),
    };
  }
  if (action === 'update_draft') {
    assertExactKeys(body, ['action', 'contestId', 'question'], ['contestId', 'question']);
    const question = assertExactKeys(body.question, [
      'id', 'statement', 'options', 'correct_answer', 'explanation', 'difficulty', 'source', 'is_trick', 'subtopic_id',
    ], ['id', 'statement', 'correct_answer', 'explanation', 'subtopic_id']);
    return {
      action,
      contestId: safeId(body.contestId, 'contest_id'),
      question: {
        ...question,
        id: safeId(question.id, 'question_id'),
        statement: safeText(question.statement, 'statement', 10_000),
        explanation: safeText(question.explanation, 'explanation', 20_000),
        subtopic_id: safeId(question.subtopic_id, 'subtopic_id'),
      },
    };
  }
  if (action === 'generate_snapshot') {
    assertExactKeys(body, ['action', 'contestId', 'version'], ['contestId', 'version']);
    return { action, contestId: safeId(body.contestId, 'contest_id'), version: safeText(body.version, 'version', 80) };
  }
  assertExactKeys(body, ['action', 'contestId', 'versionId'], ['contestId', 'versionId']);
  return { action, contestId: safeId(body.contestId, 'contest_id'), versionId: safeUuid(body.versionId, 'version_id') };
}
