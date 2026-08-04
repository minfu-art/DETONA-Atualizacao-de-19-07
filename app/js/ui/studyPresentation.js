import { averageSubtopicMastery } from '../core/mastery.js';

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
