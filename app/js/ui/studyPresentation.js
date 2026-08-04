import { averageSubtopicMastery } from '../core/mastery.js';
import { isQuestionEligible } from '../core/questionSchema.js';

export const STUDY_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'Todas' }),
  Object.freeze({ id: 'in-progress', label: 'Em andamento' }),
  Object.freeze({ id: 'not-started', label: 'Não iniciadas' }),
  Object.freeze({ id: 'attention', label: 'Precisam de atenção' }),
  Object.freeze({ id: 'completed', label: 'Concluídas' }),
]);

function canonicalSort(a, b) {
  const byNumber = String(a?.edital_numbering || '').localeCompare(
    String(b?.edital_numbering || ''),
    undefined,
    { numeric: true },
  );
  return byNumber || Number(a?.order || 0) - Number(b?.order || 0);
}

function normalizedAttempts(item = {}) {
  return Math.max(0, Number(item.attempts_count ?? item.tentativas) || 0);
}

function normalizedAccuracy(item = {}) {
  return Math.max(0, Math.min(100, Number(item.best_accuracy ?? item.melhorPercentual) || 0));
}

function canonicalSubtopicId(question = {}) {
  return String(question.subtopic_id || '').trim();
}

function uniqueIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function activityDate(subtopic = {}) {
  const value = subtopic.last_attempt_at || subtopic.ultimaTentativaEm || subtopic.last_studied_at || null;
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? { value, timestamp } : { value: null, timestamp: Number.NEGATIVE_INFINITY };
}

export function buildQuestionAvailabilityBySubtopic({ questions = [], subtopics = [] } = {}) {
  const eligibleBySubtopic = new Map(subtopics.map((subtopic) => [String(subtopic.id), new Set()]));
  const seenQuestionIds = new Set();
  for (const question of questions) {
    if (!isQuestionEligible(question)) continue;
    const subtopicId = canonicalSubtopicId(question);
    const id = String(question.id || '').trim();
    if (!id || seenQuestionIds.has(id) || !eligibleBySubtopic.has(subtopicId)) continue;
    seenQuestionIds.add(id);
    eligibleBySubtopic.get(subtopicId).add(id);
  }
  return Object.fromEntries(subtopics.map((subtopic) => {
    const subtopicId = String(subtopic.id);
    const eligibleIds = [...(eligibleBySubtopic.get(subtopicId) || [])];
    const answeredIds = new Set(uniqueIds([
      ...(Array.isArray(subtopic.answered_question_ids) ? subtopic.answered_question_ids : []),
      ...(Array.isArray(subtopic.questoesRespondidas) ? subtopic.questoesRespondidas : []),
    ]));
    const answeredEligibleIds = eligibleIds.filter((id) => answeredIds.has(id));
    const unseenEligibleIds = eligibleIds.filter((id) => !answeredIds.has(id));
    return [subtopicId, {
      eligibleIds,
      total: eligibleIds.length,
      answeredEligibleIds,
      answeredTotal: answeredEligibleIds.length,
      unseenEligibleIds,
      unseenTotal: unseenEligibleIds.length,
    }];
  }));
}

export function eligibleReviewItems({ reviewQueue = [], questions = [], subtopicId } = {}) {
  const expectedSubtopicId = String(subtopicId || '');
  const eligibleQuestions = new Map(questions
    .filter(isQuestionEligible)
    .filter((question) => canonicalSubtopicId(question) === expectedSubtopicId)
    .map((question) => [String(question.id), question]));
  return reviewQueue.filter((item) => {
    if (item?.status === 'frozen') return false;
    if (String(item?.subtopicId || item?.subtopic_id || '') !== expectedSubtopicId) return false;
    const questionId = String(item?.questionId || item?.question_id || '').trim();
    return Boolean(questionId && eligibleQuestions.has(questionId));
  });
}

export function resolveQuestionBankState(totalValue, minimumValue) {
  const total = Math.max(0, Number(totalValue) || 0);
  const minimum = Math.max(1, Number(minimumValue) || 1);
  if (total === 0) {
    return {
      key: 'empty',
      ready: false,
      title: 'Questões ainda não disponíveis',
      description: 'O banco de treino deste subtópico ainda está em preparação.',
    };
  }
  if (total < minimum) {
    return {
      key: 'insufficient',
      ready: false,
      title: 'Banco ainda insuficiente para uma sessão',
      description: `Este subtópico possui ${total} questões elegíveis. São necessárias ${minimum} para montar uma sessão completa.`,
    };
  }
  return { key: 'ready', ready: true, title: '', description: '' };
}

export function resolveStudyContinuation({ subtopics = [], nodes = [], currentSubtopicId = null } = {}) {
  const nodeList = nodes instanceof Map ? [...nodes.values()] : [...nodes];
  const nodeById = new Map(nodeList.map((node) => [
    String(node.subtopicId || node.subtopic?.id || ''),
    node,
  ]));
  const unlocked = (subtopic) => {
    const node = nodeById.get(String(subtopic?.id || ''));
    return node?.unlocked === true ? { subtopic, node } : null;
  };
  let selected = unlocked(subtopics.find((item) => String(item.id) === String(currentSubtopicId)));
  if (!selected) {
    selected = subtopics.map(unlocked).filter(Boolean)
      .map((entry) => ({ ...entry, activity: activityDate(entry.subtopic) }))
      .filter((entry) => entry.activity.value)
      .sort((a, b) => b.activity.timestamp - a.activity.timestamp)[0] || null;
  }
  if (!selected) selected = subtopics.map(unlocked).filter(Boolean)
    .find((entry) => normalizedAttempts(entry.subtopic) === 0) || null;
  if (!selected) selected = subtopics.map(unlocked).find(Boolean) || null;
  if (!selected) return null;
  const lastActivity = activityDate(selected.subtopic).value;
  return {
    subtopicId: String(selected.subtopic.id),
    topicId: selected.node.topicId || null,
    mode: lastActivity ? 'resume' : 'start',
    actionLabel: lastActivity ? 'Retomar último subtópico' : 'Começar próximo subtópico',
    lastActivity,
  };
}

function statusFromProgress({ attempts = 0, progress = 0, accuracy = 0, memory = '' } = {}) {
  if (progress >= 100) return { key: 'completed', label: 'Concluída', tone: 'success' };
  if (attempts === 0) return { key: 'not-started', label: 'Não iniciada', tone: 'neutral' };
  if (accuracy < 60 || ['frio', 'congelado'].includes(String(memory))) {
    return { key: 'attention', label: 'Precisa de atenção', tone: 'danger' };
  }
  if (progress >= 70 || accuracy >= 80) return { key: 'in-progress', label: 'Bom domínio', tone: 'good' };
  return { key: 'in-progress', label: 'Em andamento', tone: 'active' };
}

export function resolveDisciplinePresentation(discipline = {}, subtopics = []) {
  const ordered = [...subtopics].sort(canonicalSort);
  const started = ordered.filter((item) => normalizedAttempts(item) > 0);
  const completed = ordered.filter((item) => Number(item.stars) >= 3);
  const progress = Math.max(0, Math.min(100, Math.round(averageSubtopicMastery(ordered) * 100) / 100));
  const accuracy = started.length
    ? Math.round(started.reduce((sum, item) => sum + normalizedAccuracy(item), 0) / started.length)
    : 0;
  const attempts = started.reduce((sum, item) => sum + normalizedAttempts(item), 0);
  const status = ordered.length > 0 && completed.length === ordered.length
    ? { key: 'completed', label: 'Concluída', tone: 'success' }
    : statusFromProgress({ attempts, progress, accuracy });
  return {
    id: discipline.id,
    name: discipline.name,
    icon: discipline.icon,
    progress,
    accuracy,
    topicCount: 0,
    subtopicCount: ordered.length,
    completedSubtopics: completed.length,
    status,
    actionLabel: 'Abrir disciplina',
  };
}

export function resolveSubtopicPresentation(subtopic = {}, questionAvailability = 0, reviewState = {}) {
  const attempts = normalizedAttempts(subtopic);
  const accuracy = normalizedAccuracy(subtopic);
  const stars = Math.max(0, Math.min(5, Number(subtopic.stars) || 0));
  const progress = Math.max(0, Math.min(100, accuracy));
  const reviewCount = Math.max(0, Number(reviewState.count) || 0);
  const unlocked = reviewState.unlocked !== false;
  const status = stars >= 3 ? { key: 'completed', label: 'Concluída', tone: 'success' } : statusFromProgress({
    attempts,
    progress,
    accuracy,
    memory: subtopic.memory_temperature,
  });
  let actionLabel = attempts === 0 ? 'Começar' : stars >= 3 ? 'Treinar novamente' : 'Continuar';
  if (questionAvailability <= 0) actionLabel = 'Ver disponibilidade';
  if (!unlocked) actionLabel = 'Bloqueado';
  return {
    label: status.label,
    actionLabel,
    tone: status.tone,
    description: questionAvailability > 0
      ? `${questionAvailability} questões disponíveis para treino.`
      : 'O banco de treino deste subtópico ainda está em preparação.',
    disabled: !unlocked,
    reason: unlocked ? '' : 'Conclua o requisito acadêmico do subtópico anterior.',
    attempts,
    accuracy,
    stars,
    reviewCount,
  };
}

function curriculumIndex(curriculum = []) {
  const byId = new Map();
  curriculum.forEach((node) => {
    if (node?.id) byId.set(String(node.id), node);
    if (node?.source_id) byId.set(String(node.source_id), node);
  });
  return byId;
}

function childrenOf(curriculum, parent) {
  const ids = new Set([parent?.id, parent?.source_id].filter(Boolean).map(String));
  return curriculum
    .filter((node) => ids.has(String(node?.parent_id ?? node?.parent_source_id ?? '')))
    .sort((a, b) => Number(a?.order_index || 0) - Number(b?.order_index || 0));
}

export function buildDisciplineTopics(discipline, subtopics = [], curriculum = []) {
  const orderedSubtopics = [...subtopics].sort(canonicalSort);
  const bySubtopicId = new Map(orderedSubtopics.map((item) => [String(item.id), item]));
  const index = curriculumIndex(curriculum);
  const disciplineNode = curriculum.find((node) => (
    node?.type === 'discipline'
    && String(node.source_id || node.id) === String(discipline?.id)
  ));
  const topicNodes = disciplineNode ? childrenOf(curriculum, disciplineNode).filter((node) => node.type === 'topic') : [];
  if (!topicNodes.length) {
    return [{
      id: `study-topic:${discipline.id}:all`,
      name: 'Conteúdos do edital',
      description: 'Ordem oficial dos conteúdos desta disciplina.',
      synthetic: true,
      subtopics: orderedSubtopics,
    }];
  }

  const used = new Set();
  const topics = topicNodes.map((topic) => {
    const children = childrenOf(curriculum, topic).filter((node) => node.type === 'subtopic');
    const entries = children.map((node) => {
      const item = bySubtopicId.get(String(node.source_id || node.id))
        || bySubtopicId.get(String(index.get(String(node.id))?.source_id || ''));
      if (item) used.add(String(item.id));
      return item;
    }).filter(Boolean);
    return {
      id: String(topic.source_id || topic.id),
      name: topic.name,
      description: topic.description || '',
      synthetic: false,
      subtopics: entries,
    };
  });
  const unassigned = orderedSubtopics.filter((item) => !used.has(String(item.id)));
  if (unassigned.length) {
    topics.push({
      id: `study-topic:${discipline.id}:unassigned`,
      name: 'Outros conteúdos do edital',
      description: 'Conteúdos preservados na ordem oficial.',
      synthetic: true,
      subtopics: unassigned,
    });
  }
  return topics;
}

export function filterDisciplines(items = [], { filter = 'all', search = '' } = {}) {
  const term = String(search || '').trim().toLocaleLowerCase('pt-BR');
  return items.filter((item) => {
    const matchesFilter = filter === 'all' || item.status.key === filter;
    const matchesSearch = !term || String(item.name || '').toLocaleLowerCase('pt-BR').includes(term);
    return matchesFilter && matchesSearch;
  });
}

export function createSingleSessionStarter(createSession) {
  let pending = null;
  return async (...args) => {
    if (pending) return pending;
    pending = Promise.resolve().then(() => createSession(...args));
    try {
      return await pending;
    } catch (error) {
      pending = null;
      throw error;
    }
  };
}

export function studySessionErrorMessage(error) {
  const message = String(error?.message || '').trim();
  if (/precisa de \d+ quest(?:ão|ões) disponíveis/i.test(message)) return message;
  if (/exatamente \d+ quest(?:ão|ões) válidas/i.test(message)) return message;
  if (/subtópico não encontrado/i.test(message)) return 'Este subtópico não está disponível no momento.';
  return 'Não foi possível preparar a sessão. Tente novamente.';
}
