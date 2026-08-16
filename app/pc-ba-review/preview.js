const QUESTION_FILES = Object.freeze([
  './ui-import-piloto-20.json',
  './ui-import-conteudo-validado-1227-parte-01.json',
  './ui-import-conteudo-validado-1227-parte-02.json',
  './ui-import-conteudo-validado-1227-parte-03.json',
  './ui-import-conteudo-validado-1227-parte-04.json',
  './ui-import-conteudo-validado-1227-parte-05.json',
]);

const state = {
  contest: null,
  curriculum: null,
  questions: [],
  filteredQuestions: [],
  disciplineNames: new Map(),
  selectedDisciplineId: null,
  curriculumQuery: '',
  questionDisciplineId: '',
  questionQuery: '',
  questionIndex: 0,
  answers: new Map(),
};

const $ = (selector) => document.querySelector(selector);
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

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
  const query = normalize(state.curriculumQuery);
  const disciplines = state.curriculum.roles[0].disciplines;
  if (!query) return disciplines;
  return disciplines.filter((discipline) => normalize(JSON.stringify(discipline)).includes(query));
}

function renderDisciplineButtons() {
  const container = $('#discipline-buttons');
  const disciplines = filteredDisciplines();
  container.innerHTML = disciplines.map((discipline) => `
    <button class="discipline-button ${discipline.id === state.selectedDisciplineId ? 'is-active' : ''}"
      type="button" data-discipline-id="${escapeHtml(discipline.id)}">${escapeHtml(discipline.name)}</button>
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
  const query = normalize(state.curriculumQuery);
  const visibleTopics = query
    ? discipline.topics.filter((topic) => normalize(JSON.stringify(topic)).includes(query))
    : discipline.topics;
  const subtopicCount = discipline.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0);
  $('#selected-discipline').textContent = discipline.name;
  $('#discipline-summary').textContent = `${discipline.topics.length} tópicos · ${subtopicCount} subtópicos`;
  $('#topic-list').innerHTML = visibleTopics.map((topic, index) => `
    <details class="topic" ${index === 0 ? 'open' : ''}>
      <summary>${escapeHtml(topic.name)}</summary>
      <ol class="subtopics">
        ${topic.subtopics.map((subtopic) => `<li>${escapeHtml(subtopic.name)}</li>`).join('')}
      </ol>
    </details>
  `).join('') || '<p class="empty">O termo não aparece nesta disciplina.</p>';
}

function applyQuestionFilters() {
  const query = normalize(state.questionQuery);
  state.filteredQuestions = state.questions.filter((question) => {
    if (state.questionDisciplineId && question.discipline_id !== state.questionDisciplineId) return false;
    if (!query) return true;
    return normalize([
      question.id,
      question.statement,
      question.explanation,
      state.disciplineNames.get(question.discipline_id),
    ].join(' ')).includes(query);
  });
  state.questionIndex = 0;
  $('#question-filter-total').textContent = `${state.filteredQuestions.length} questões`;
  renderQuestion();
}

function answerQuestion(label) {
  const question = state.filteredQuestions[state.questionIndex];
  if (!question || state.answers.has(question.id)) return;
  state.answers.set(question.id, label);
  renderQuestion();
}

function renderQuestion() {
  const question = state.filteredQuestions[state.questionIndex];
  $('#previous-question').disabled = !question || state.questionIndex === 0;
  $('#next-question').disabled = !question;
  if (!question) {
    $('#quiz-position').textContent = '0/0';
    $('#quiz-score').textContent = '0 acertos';
    $('#question-card').innerHTML = '<p class="empty">Nenhuma questão corresponde aos filtros.</p>';
    return;
  }

  const answer = state.answers.get(question.id);
  const score = state.filteredQuestions.reduce(
    (total, item) => total + (state.answers.get(item.id) === item.correct_answer ? 1 : 0),
    0,
  );
  $('#quiz-position').textContent = `${state.questionIndex + 1}/${state.filteredQuestions.length}`;
  $('#quiz-score').textContent = `${score} ${score === 1 ? 'acerto' : 'acertos'}`;
  $('#next-question').textContent = state.questionIndex === state.filteredQuestions.length - 1 ? 'Voltar à primeira' : 'Próxima questão';

  $('#question-card').innerHTML = `
    <div class="question-meta">
      <span>RASCUNHO</span>
      <span>${escapeHtml(state.disciplineNames.get(question.discipline_id) || question.discipline_id)}</span>
      <span>${escapeHtml(question.difficulty || 'não informada')}</span>
      <span>${escapeHtml(question.competence || 'competência não informada')}</span>
      <span>${escapeHtml(question.reasoning_type || 'raciocínio não informado')}</span>
    </div>
    <small class="question-id">${escapeHtml(question.id)}</small>
    <div class="question-statement">${escapeHtml(question.statement)}</div>
    <div class="options">
      ${(question.options || []).map((option) => {
    const selected = answer === option.label;
    const correct = answer && option.label === question.correct_answer;
    const wrong = selected && answer !== question.correct_answer;
    return `<button class="option ${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}" type="button"
          data-answer="${escapeHtml(option.label)}" ${answer ? 'disabled' : ''}>
          <span class="option__label">${escapeHtml(option.label)}</span><span>${escapeHtml(option.text)}</span>
        </button>`;
  }).join('')}
    </div>
    ${answer ? `<div class="feedback"><strong>${answer === question.correct_answer ? 'Resposta correta.' : `Resposta incorreta. Gabarito: ${escapeHtml(question.correct_answer)}.`}</strong>\n\n${escapeHtml(question.explanation)}</div>` : ''}
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
    const [contestPayload, curriculum, technicalStatus, ...questionPayloads] = await Promise.all([
      loadJson('./contest.json'),
      loadJson('./curriculum.json'),
      loadJson('./learning-engine.json'),
      ...QUESTION_FILES.map(loadJson),
    ]);
    state.contest = contestPayload.contest;
    state.curriculum = curriculum;
    state.questions = questionPayloads.flatMap((payload) => payload.questions || []);
    state.filteredQuestions = [...state.questions];
    state.selectedDisciplineId = curriculum.roles[0].disciplines[0].id;
    curriculum.roles[0].disciplines.forEach((discipline) => state.disciplineNames.set(discipline.id, discipline.name));

    const totals = curriculumTotals(curriculum.roles[0]);
    $('#course-description').textContent = state.contest.description;
    $('#discipline-count').textContent = totals.disciplines;
    $('#topic-count').textContent = totals.topics;
    $('#subtopic-count').textContent = totals.subtopics;
    $('#question-count').textContent = state.questions.length;
    $('#question-filter-total').textContent = `${state.questions.length} questões`;
    $('#technical-status').textContent = JSON.stringify(technicalStatus, null, 2);
    $('#question-discipline').insertAdjacentHTML('beforeend', curriculum.roles[0].disciplines
      .filter((discipline) => state.questions.some((question) => question.discipline_id === discipline.id))
      .map((discipline) => `<option value="${escapeHtml(discipline.id)}">${escapeHtml(discipline.name)}</option>`)
      .join(''));
    renderDisciplineButtons();
    renderTopics();
    renderQuestion();
  } catch (error) {
    document.body.innerHTML = `<main class="shell"><p class="empty">Não foi possível abrir a prévia.<br>${escapeHtml(error.message)}</p></main>`;
  }
}

$('#curriculum-search').addEventListener('input', (event) => {
  state.curriculumQuery = event.target.value;
  const first = filteredDisciplines()[0];
  if (first && !filteredDisciplines().some(({ id }) => id === state.selectedDisciplineId)) state.selectedDisciplineId = first.id;
  renderDisciplineButtons();
  renderTopics();
});
$('#question-discipline').addEventListener('change', (event) => {
  state.questionDisciplineId = event.target.value;
  applyQuestionFilters();
});
$('#question-search').addEventListener('input', (event) => {
  state.questionQuery = event.target.value;
  applyQuestionFilters();
});
$('#previous-question').addEventListener('click', () => {
  state.questionIndex = Math.max(0, state.questionIndex - 1);
  renderQuestion();
});
$('#next-question').addEventListener('click', () => {
  state.questionIndex = state.questionIndex === state.filteredQuestions.length - 1 ? 0 : state.questionIndex + 1;
  renderQuestion();
});

setupTabs();
initialize();
