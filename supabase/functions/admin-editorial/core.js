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

function questionId(question) {
  return String(question.id || question.question_id || '').trim();
}

function questionSubtopicId(question) {
  return String(question.subtopic_id || question.topicoEditalId || '').trim();
}

function questionStatement(question) {
  return String(question.statement || question.enunciado || '').trim();
}

function questionExplanation(question) {
  return String(question.explanation || question.explicacao || '').trim();
}

function questionAnswer(question) {
  return question.correct_answer ?? question.respostaCorreta;
}

function validationError(index, code, message) {
  return { index, code, message };
}

export function validateRemoteEditorialBatch({
  contestId,
  questions: batch,
  contestExists,
  curriculumNodes = [],
  existingQuestions = [],
}) {
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const targetSubtopics = new Set(
    curriculumNodes
      .filter((node) => node.type === 'subtopic' && node.contest_id === contestId)
      .map((node) => String(node.source_id)),
  );
  const foreignSubtopics = new Set(
    curriculumNodes
      .filter((node) => node.type === 'subtopic' && node.contest_id !== contestId)
      .map((node) => String(node.source_id)),
  );
  const existingIds = new Set(existingQuestions.map((question) => String(question.source_question_id || question.id)));

  if (!contestExists) errors.push(validationError(0, 'contest_not_found', 'Concurso não encontrado.'));

  batch.forEach((question, offset) => {
    const index = offset + 1;
    const id = questionId(question);
    const subtopicId = questionSubtopicId(question);
    if (question.contest_id && String(question.contest_id) !== contestId) {
      errors.push(validationError(index, 'question_contest_mismatch', 'A questão pertence a outro concurso.'));
    }
    if (!id) {
      errors.push(validationError(index, 'question_id_missing', 'ID obrigatório.'));
    } else if (seenIds.has(id)) {
      errors.push(validationError(index, 'question_id_duplicate', 'ID repetido dentro do lote.'));
    } else if (existingIds.has(id)) {
      errors.push(validationError(index, 'question_id_exists', 'A questão já existe no banco editorial.'));
    }
    if (id) seenIds.add(id);

    if (!subtopicId) {
      errors.push(validationError(index, 'question_subtopic_missing', 'Subtópico obrigatório.'));
    } else if (!targetSubtopics.has(subtopicId)) {
      const wrongContest = foreignSubtopics.has(subtopicId);
      errors.push(validationError(
        index,
        wrongContest ? 'question_subtopic_wrong_contest' : 'question_subtopic_not_found',
        wrongContest ? 'O subtópico pertence a outro concurso.' : 'Subtópico não encontrado.',
      ));
    }
    if (!questionStatement(question)) {
      errors.push(validationError(index, 'question_statement_missing', 'Enunciado obrigatório.'));
    }
    if (!questionExplanation(question)) {
      errors.push(validationError(index, 'question_explanation_missing', 'Explicação obrigatória.'));
    }
    const answer = questionAnswer(question);
    if (answer == null || (typeof answer === 'string' && !answer.trim())) {
      errors.push(validationError(index, 'question_answer_invalid', 'Gabarito obrigatório ou inválido.'));
    }
  });

  return { valid: errors.length === 0, count: batch.length, errors, warnings };
}

export function sanitizedEditorialErrorCode(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || '').toLowerCase();
  const known = [
    'question_subtopic_not_found', 'question_subtopic_wrong_contest',
    'question_subtopic_missing', 'question_id_exists', 'question_id_duplicate',
    'question_id_missing', 'question_contest_mismatch', 'question_statement_missing',
    'question_explanation_missing', 'question_answer_invalid', 'contest_not_found',
    'developer_required', 'invalid_session', 'questions_invalid',
    'payload_too_large', 'audit_failure', 'question_import_database_error',
  ];
  if (known.includes(code)) return code;
  if (known.includes(message)) return message;
  if (code === '23505' || /duplicate key|already exists/.test(message)) return 'question_id_exists';
  if (code === '42702' || /column reference.+ambiguous/.test(message)) return 'question_import_database_error';
  if (/audit/.test(message)) return 'audit_failure';
  return 'invalid_request';
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
