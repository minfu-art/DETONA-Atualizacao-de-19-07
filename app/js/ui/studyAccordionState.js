export function toggleStudyTopic(currentTopicId, selectedTopicId) {
  const current = String(currentTopicId || '');
  const selected = String(selectedTopicId || '');
  if (!selected) return null;
  return current === selected ? null : selectedTopicId;
}

export function rememberStudyReturn(context, {
  contestId = null,
  disciplineId = null,
  topicId = null,
  subtopicId = null,
} = {}) {
  if (!context || !disciplineId || !topicId || !subtopicId) return null;
  const returnContext = { contestId, disciplineId, topicId, subtopicId };
  context.studyReturnContext = returnContext;
  return returnContext;
}

export function consumeStudyReturn(context, { contestId = null, disciplineId = null } = {}) {
  if (!context) return null;
  const returnContext = context.studyReturnContext || null;
  context.studyReturnContext = null;
  if (!returnContext) return null;
  if (String(returnContext.contestId || '') !== String(contestId || '')) return null;
  if (String(returnContext.disciplineId || '') !== String(disciplineId || '')) return null;
  return {
    topicId: returnContext.topicId,
    subtopicId: returnContext.subtopicId,
  };
}

export function clearStudyAccordion(context) {
  if (!context) return context;
  context.studyTopicId = null;
  context.studySubtopicId = null;
  context.studyReturnContext = null;
  return context;
}
