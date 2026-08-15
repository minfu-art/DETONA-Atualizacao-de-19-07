const state = {
  contest: null,
  curriculum: null,
  questions: [],
  selectedDisciplineId: null,
  query: '',
  questionIndex: 0,
  answers: new Map(),
};

const $ = (selector) => document.querySelector(selector);
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar ${path}: ${response.status}`);
  return response.json();
}

function curriculumTotals(role) {
  const topics = role.disciplines.flatMap((discipline) => discipline.topics);
  return {
    disciplines: role.disciplines.length,
    topics: topics.length,
    subtopics: topics.reduce((sum, topic) => sum + topic.subtopics.length, 0),
  };
}

function filteredDisciplines() {
  const query = normalize(state.query);
  const disciplines = state.curriculum.roles[0].disciplines;
  if (!query) return disciplines;
  return disciplines.filter((discipline) => normalize(JSON.stringify(discipline)).includes(query));
}

function renderDisciplineButtons() {
  const container = $('#discipline-buttons');
  const disciplines = filteredDisciplines();
  container.innerHTML = disciplines.map((discipline) => `
    <button class="discipline-button ${discipline.id === state.selectedDisciplineId ? 'is-active' : ''}"
      type="button" data-discipline-id="${discipline.id}">${discipline.name}</button>
  `).join('') || '<p class="empty">Nenhuma disciplina encontrada.</p>';

  container.querySelectorAll('[data-discipline-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedDisciplineId = button.dataset.disciplineId;
      renderDisciplineButtons();
      renderTopics();
    });
  });
}

function renderTopics() {
  const disciplines = state.curriculum.roles[0].disciplines;
  const discipline = disciplines.find(({ id }) => id === state.selectedDisciplineId) || filteredDisciplines()[0];
  if (!discipline) {
    $('#selected-discipline').textContent = 'Nenhum resultado';
    $('#discipline-summary').textContent = '';
    $('#topic-list').innerHTML = '<p class="empty">Altere a busca para ver o conteúdo.</p>';
    return;
  }

  state.selectedDisciplineId = discipline.id;
  const query = normalize(state.query);
  const visibleTopics = query
    ? discipline.topics.filter((topic) => normalize(JSON.stringify(topic)).includes(query))
    : discipline.topics;
  const subtopicCount = discipline.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0);
  $('#selected-discipline').textContent = discipline.name;
  $('#discipline-summary').textContent = `${discipline.topics.length} tópicos · ${subtopicCount} subtópicos`;
  $('#topic-list').innerHTML = visibleTopics.map((topic, index) => `
    <details class="topic" ${index === 0 ? 'open' : ''}>
      <summary>${topic.name}</summary>
      <ol class="subtopics">
        ${topic.subtopics.map((subtopic) => `<li>${subtopic.name}</li>`).join('')}
      </ol>
    </details>
  `).join('') || '<p class="empty">O termo não aparece nesta disciplina.</p>';
}

function answerQuestion(label) {
  const question = state.questions[state.questionIndex];
  if (!question || state.answers.has(question.id)) return;
  state.answers.set(question.id, label);
  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.questionIndex];
  const answer = state.answers.get(question.id);
  const score = state.questions.reduce((total, item) => total + (state.answers.get(item.id) === item.correct_answer ? 1 : 0), 0);
  $('#quiz-position').textContent = `${state.questionIndex + 1}/${state.questions.length}`;
  $('#quiz-score').textContent = `${score} ${score === 1 ? 'acerto' : 'acertos'}`;
  $('#previous-question').disabled = state.questionIndex === 0;
  $('#next-question').textContent = state.questionIndex === state.questions.length - 1 ? 'Voltar à primeira' : 'Próxima questão';

  $('#question-card').innerHTML = `
    <div class="question-meta">
      <span>${question.difficulty.toUpperCase()}</span>
      <span>${question.competence.toUpperCase()}</span>
      <span>${question.reasoning_type.toUpperCase()}</span>
    </div>
    <div class="question-statement">${question.statement}</div>
    <div class="options">
      ${question.options.map((option) => {
        const selected = answer === option.label;
        const correct = answer && option.label === question.correct_answer;
        const wrong = selected && answer !== question.correct_answer;
        return `<button class="option ${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}" type="button"
          data-answer="${option.label}" ${answer ? 'disabled' : ''}>
          <span class="option__label">${option.label}</span><span>${option.text}</span>
        </button>`;
      }).join('')}
    </div>
    ${answer ? `<div class="feedback"><strong>${answer === question.correct_answer ? 'Resposta correta.' : `Resposta incorreta. Gabarito: ${question.correct_answer}.`}</strong>\n\n${question.explanation}</div>` : ''}
  `;
  $('#question-card').querySelectorAll('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => answerQuestion(button.dataset.answer));
  });
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item === tab));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === `${tab.dataset.tab}-panel`));
    });
  });
}

async function initialize() {
  try {
    const [contestPayload, curriculum, questions, technicalStatus] = await Promise.all([
      loadJson('./contest.json'),
      loadJson('./curriculum.json'),
      loadJson('./questions/lote_001.json'),
      loadJson('./learning-engine.json'),
    ]);
    state.contest = contestPayload.contest;
    state.curriculum = curriculum;
    state.questions = questions.questions;
    state.selectedDisciplineId = curriculum.roles[0].disciplines[0].id;

    const totals = curriculumTotals(curriculum.roles[0]);
    $('#course-description').textContent = state.contest.description;
    $('#discipline-count').textContent = totals.disciplines;
    $('#topic-count').textContent = totals.topics;
    $('#subtopic-count').textContent = totals.subtopics;
    $('#question-count').textContent = state.questions.length;
    $('#technical-status').textContent = JSON.stringify(technicalStatus, null, 2);
    renderDisciplineButtons();
    renderTopics();
    renderQuestion();
  } catch (error) {
    document.body.innerHTML = `<main class="shell"><p class="empty">Não foi possível abrir a prévia.<br>${error.message}</p></main>`;
  }
}

$('#curriculum-search').addEventListener('input', (event) => {
  state.query = event.target.value;
  const first = filteredDisciplines()[0];
  if (first && !filteredDisciplines().some(({ id }) => id === state.selectedDisciplineId)) state.selectedDisciplineId = first.id;
  renderDisciplineButtons();
  renderTopics();
});
$('#previous-question').addEventListener('click', () => {
  state.questionIndex = Math.max(0, state.questionIndex - 1);
  renderQuestion();
  window.scrollTo({ top: $('#questions-panel').offsetTop - 70, behavior: 'smooth' });
});
$('#next-question').addEventListener('click', () => {
  state.questionIndex = state.questionIndex === state.questions.length - 1 ? 0 : state.questionIndex + 1;
  renderQuestion();
  window.scrollTo({ top: $('#questions-panel').offsetTop - 70, behavior: 'smooth' });
});

setupTabs();
initialize();
