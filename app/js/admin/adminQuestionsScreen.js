import { adminCurriculumService } from '../services/adminCurriculumService.js';
import {
  adminQuestionService,
  canEditEditorialQuestion,
  canTransitionEditorialSelection,
  parseQuestionItems,
  validateEditorialBatch,
} from '../services/adminQuestionService.js';
import { escapeHtml } from '../ui/helpers.js';

const STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  technical_review: 'Revisão técnica',
  approved: 'Aprovada',
  published: 'Publicada',
  archived: 'Arquivada',
  generated: 'Gerado',
  rolled_back: 'Revertido',
});

const TRANSITION_LABELS = Object.freeze({
  technical_review: 'Enviar para revisão técnica',
  draft: 'Voltar para rascunho',
  approved: 'Aprovar',
  archived: 'Arquivar',
});

export function toggleEditorialSelection(selectedIds, questionId, checked) {
  const next = new Set(selectedIds);
  if (checked) next.add(questionId);
  else next.delete(questionId);
  return next;
}

export function selectVisibleEditorialQuestions(selectedIds, visibleIds, checked) {
  const next = new Set(selectedIds);
  visibleIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
  return next;
}

export function canGenerateEditorialSnapshot(approvedCount) {
  return Number(approvedCount) > 0;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Desconhecido';
}

function questionSourceId(question) {
  return String(question?.source_question_id || question?.id || '');
}

function normalizedAnswer(value) {
  if (value === true || value === 'true' || String(value).toLowerCase() === 'certo') return true;
  if (value === false || value === 'false' || String(value).toLowerCase() === 'errado') return false;
  return null;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function renderOptions(question) {
  const answer = normalizedAnswer(question.correct_answer);
  return `
    <div class="admin-question-options" aria-label="Alternativas da questão">
      <span class="${answer === true ? 'is-answer' : ''}">Certo${answer === true ? ' · gabarito' : ''}</span>
      <span class="${answer === false ? 'is-answer' : ''}">Errado${answer === false ? ' · gabarito' : ''}</span>
    </div>`;
}

function makeCurriculumIndex(rows) {
  const index = new Map();
  rows.forEach((row) => {
    if (row.id) index.set(String(row.id), row);
    if (row.source_id) index.set(String(row.source_id), row);
  });
  return index;
}

function curriculumDetails(question, curriculumIndex) {
  const payload = question.payload || {};
  const subtopicId = String(
    payload.subtopic_id
      || payload.topicoEditalId
      || curriculumIndex.get(String(question.curriculum_node_id || ''))?.source_id
      || '',
  );
  let node = curriculumIndex.get(String(question.curriculum_node_id || ''))
    || curriculumIndex.get(subtopicId);
  const subtopic = node?.name || subtopicId || 'Não identificado';
  let discipline = payload.discipline || payload.disciplina || payload.discipline_id || '';
  while (!discipline && node) {
    if (node.type === 'discipline') discipline = node.name || node.source_id;
    node = curriculumIndex.get(String(node.parent_id || node.parent_source_id || ''));
  }
  return { subtopicId, subtopic, discipline: discipline || 'Não identificada' };
}

function renderVersionHistory(versions) {
  if (!versions.length) return '<div class="admin-prepared">Nenhum snapshot gerado para este concurso.</div>';
  return versions.map((version) => `
    <article>
      <span>${escapeHtml(statusLabel(version.status))}</span>
      <strong>${escapeHtml(version.version)}</strong>
      <small>${Number(version.item_count || 0)} questões · hash ${escapeHtml(String(version.content_hash || '').slice(0, 16))}…</small>
      <small>Gerado em ${escapeHtml(formatDate(version.created_at))}</small>
    </article>`).join('');
}

async function readFiles(files) {
  const questions = [];
  for (const file of files) {
    if (file.size > 2_000_000) throw new Error(`${file.name}: arquivo maior que 2 MB.`);
    questions.push(...parseQuestionItems(await file.text()));
  }
  return questions;
}

export async function renderAdminQuestionsScreen(root, ctx) {
  const contestId = ctx.adminSelectedContestId;
  const [summary, curriculum, batches, questionList, approvedList, versionList] = await Promise.all([
    adminQuestionService.getPublishedSummary(contestId),
    adminCurriculumService.listNodes(contestId),
    adminQuestionService.listBatches(contestId).catch(() => ({ batches: [] })),
    adminQuestionService.listQuestions(contestId),
    adminQuestionService.listQuestions(contestId, { status: 'approved', pageSize: 1 }),
    adminQuestionService.listVersions(contestId),
  ]);
  const subtopics = curriculum.rows.filter(({ type }) => type === 'subtopic');
  const subtopicIds = subtopics.map((node) => node.source_id || node.id);
  const curriculumIndex = makeCurriculumIndex(curriculum.rows);
  let questions = questionList.questions || [];
  let approvedCount = Number(approvedList.total ?? approvedList.questions?.length ?? 0);
  let versions = versionList.versions || [];
  let selectedIds = new Set();
  const questionCache = new Map(questions.map((question) => [questionSourceId(question), question]));
  let busy = false;

  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica · Questões</span><h1>Banco editorial por concurso</h1>
      <p>Valide, revise e aprove questões isoladas antes de gerar um snapshot imutável.</p></div></header>
    <section class="admin-metrics">
      <article class="admin-metric admin-metric--orange"><span>Publicadas</span><strong>${summary.count}</strong></article>
      <article class="admin-metric"><span>Questões editoriais</span><strong id="question-total">${questionList.total ?? questions.length}</strong></article>
      <article class="admin-metric"><span>Aprovadas</span><strong id="question-approved-total">${approvedCount}</strong></article>
      <article class="admin-metric"><span>Subtópicos válidos</span><strong>${subtopicIds.length}</strong></article>
    </section>
    <section class="admin-grid admin-grid--2">
      <form id="admin-question-import" class="admin-panel admin-form">
        <span class="admin-panel__eyebrow">Importação segura</span><h2>Validar lote JSON</h2>
        <label>Nome do lote<input name="batchName" maxlength="160" value="Lote ${new Date().toLocaleDateString('pt-BR')}"></label>
        <label>Arquivos JSON<input name="files" type="file" accept=".json,application/json" multiple></label>
        <label>Ou cole o JSON<textarea name="payload" rows="10" placeholder='{"questions":[...]}'></textarea></label>
        <div class="admin-form__actions">
          <button class="admin-button" type="submit">Validar lote</button>
          <button class="admin-button admin-button--secondary" id="question-import" type="button" disabled>Importar como rascunho</button>
        </div>
        <div id="admin-question-validation" role="status" aria-live="polite"></div>
      </form>
      <article class="admin-panel">
        <span class="admin-panel__eyebrow">Fluxo editorial</span><h2>Lotes recentes</h2>
        <ol class="admin-steps"><li class="is-active">Rascunho</li><li>Revisão técnica</li><li>Aprovado</li><li>Snapshot</li><li>Publicado</li></ol>
        <div class="admin-message-list">${batches.batches.map((batch) => `<article><span>${escapeHtml(statusLabel(batch.status))}</span>
          <strong>${escapeHtml(batch.name)}</strong><small>${batch.item_count} questões · ${escapeHtml(batch.id)}</small></article>`).join('')
          || '<div class="admin-prepared">Nenhum lote importado neste concurso.</div>'}</div>
      </article>
    </section>
    <section class="admin-panel admin-editorial-workspace">
      <div class="admin-panel-heading">
        <div><span class="admin-panel__eyebrow">Revisão controlada</span><h2>Questões do concurso</h2></div>
        <div id="question-operation-status" class="admin-operation-status" role="status" aria-live="polite"></div>
      </div>
      <div class="admin-toolbar">
        <input id="question-search" type="search" placeholder="Buscar por ID ou enunciado" aria-label="Buscar questões">
        <select id="question-status" aria-label="Filtrar estado"><option value="">Todos os estados</option>
          ${Object.keys(STATUS_LABELS).filter((status) => !['generated', 'rolled_back'].includes(status))
    .map((status) => `<option value="${status}">${escapeHtml(statusLabel(status))}</option>`).join('')}</select>
        <button class="admin-button" id="question-filter" type="button">Filtrar</button>
      </div>
      <div class="admin-editorial-selection">
        <label><input id="question-select-all" type="checkbox"> Selecionar todas as questões visíveis</label>
        <strong id="question-selected-count">0 selecionadas</strong>
        <button class="admin-button admin-button--secondary admin-button--small" id="question-clear-selection" type="button" disabled>Limpar seleção</button>
      </div>
      <div class="admin-editorial-actions" aria-label="Ações editoriais">
        ${Object.entries(TRANSITION_LABELS).map(([status, label]) => (
    `<button class="admin-button admin-button--secondary" type="button" data-transition="${status}" disabled>${label}</button>`
  )).join('')}
      </div>
      <div id="question-list" class="admin-table-wrap"></div>
    </section>
    <section class="admin-panel admin-snapshot-panel">
      <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Snapshot imutável</span><h2>Gerar versão editorial</h2></div>
        <strong id="snapshot-approved-count">${approvedCount} aprovadas</strong></div>
      <p>O snapshot usa somente questões aprovadas. Depois de gerado, seu conteúdo e hash não podem ser alterados.</p>
      <div class="admin-snapshot-controls">
        <label>Versão<input id="snapshot-version" maxlength="80" value="${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}"></label>
        <button class="admin-button" id="snapshot-generate" type="button" ${canGenerateEditorialSnapshot(approvedCount) ? '' : 'disabled'}>Gerar snapshot</button>
      </div>
      <div id="snapshot-result" role="status" aria-live="polite"></div>
      <div><h3>Histórico de snapshots</h3><div id="snapshot-history" class="admin-message-list">${renderVersionHistory(versions)}</div></div>
    </section>
    <dialog id="question-detail-dialog" class="admin-question-dialog" aria-labelledby="question-detail-title">
      <form method="dialog" class="admin-question-dialog__header">
        <div><span class="admin-panel__eyebrow">Questão editorial</span><h2 id="question-detail-title">Detalhes</h2></div>
        <button class="admin-question-dialog__close" value="cancel" aria-label="Fechar detalhes da questão">×</button>
      </form>
      <div id="question-detail-body"></div>
    </dialog>`;

  const form = root.querySelector('#admin-question-import');
  const output = root.querySelector('#admin-question-validation');
  const importButton = root.querySelector('#question-import');
  const operationStatus = root.querySelector('#question-operation-status');
  const selectAll = root.querySelector('#question-select-all');
  const clearSelection = root.querySelector('#question-clear-selection');
  const selectedCount = root.querySelector('#question-selected-count');
  const dialog = root.querySelector('#question-detail-dialog');
  const dialogBody = root.querySelector('#question-detail-body');
  let validation = null;
  let loadedQuestions = [];

  const ensureContest = () => {
    if (ctx.adminSelectedContestId !== contestId) throw new Error('O concurso selecionado mudou. Reabra a tela antes de continuar.');
  };

  const currentSelectedQuestions = () => [...selectedIds]
    .map((id) => questionCache.get(id))
    .filter(Boolean);

  const setBusy = (value) => {
    busy = value;
    root.querySelectorAll('button').forEach((button) => {
      if (value) {
        button.dataset.wasDisabled = button.disabled ? 'true' : 'false';
        button.disabled = true;
      } else if (button.dataset.wasDisabled === 'false') {
        button.disabled = false;
        delete button.dataset.wasDisabled;
      } else {
        delete button.dataset.wasDisabled;
      }
    });
    updateSelectionControls();
    root.querySelector('#snapshot-generate').disabled = busy || !canGenerateEditorialSnapshot(approvedCount);
  };

  const updateSelectionControls = () => {
    const selected = currentSelectedQuestions();
    selectedCount.textContent = `${selected.length} selecionada${selected.length === 1 ? '' : 's'}`;
    clearSelection.disabled = busy || selected.length === 0;
    const visibleIds = questions.map(questionSourceId);
    selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    selectAll.indeterminate = !selectAll.checked && visibleIds.some((id) => selectedIds.has(id));
    selectAll.disabled = busy || visibleIds.length === 0;
    root.querySelectorAll('[data-transition]').forEach((button) => {
      button.disabled = busy || !canTransitionEditorialSelection(selected, button.dataset.transition);
    });
  };

  const renderQuestionTable = () => {
    root.querySelector('#question-list').innerHTML = `<table class="admin-table admin-question-table">
      <thead><tr><th aria-label="Selecionar"></th><th>ID</th><th>Enunciado</th><th>Status</th><th>Versão</th><th>Ação</th></tr></thead>
      <tbody>${questions.map((question) => {
    const id = questionSourceId(question);
    return `<tr data-question-id="${escapeHtml(id)}">
          <td data-label="Selecionar"><input class="question-row-select" type="checkbox" value="${escapeHtml(id)}"
            aria-label="Selecionar questão ${escapeHtml(id)}" ${selectedIds.has(id) ? 'checked' : ''}></td>
          <td data-label="ID"><code>${escapeHtml(id)}</code></td>
          <td data-label="Enunciado"><span class="admin-question-statement">${escapeHtml(question.statement || '')}</span></td>
          <td data-label="Status"><span class="admin-badge">${escapeHtml(statusLabel(question.status))}</span></td>
          <td data-label="Versão">${Number(question.version || 1)}</td>
          <td data-label="Ação"><button class="admin-button admin-button--secondary admin-button--small question-open" type="button"
            data-question-open="${escapeHtml(id)}" aria-label="Abrir questão ${escapeHtml(id)}">Abrir</button></td>
        </tr>`;
  }).join('') || '<tr><td colspan="6">Nenhuma questão encontrada.</td></tr>'}</tbody></table>`;
    updateSelectionControls();
  };

  const refreshQuestions = async () => {
    ensureContest();
    const result = await adminQuestionService.listQuestions(contestId, {
      search: root.querySelector('#question-search').value,
      status: root.querySelector('#question-status').value,
    });
    questions = result.questions || [];
    questions.forEach((question) => questionCache.set(questionSourceId(question), question));
    root.querySelector('#question-total').textContent = String(result.total ?? questions.length);
    renderQuestionTable();
    return result;
  };

  const refreshApprovedAndVersions = async () => {
    const [approved, history] = await Promise.all([
      adminQuestionService.listQuestions(contestId, { status: 'approved', pageSize: 1 }),
      adminQuestionService.listVersions(contestId),
    ]);
    approvedCount = Number(approved.total ?? approved.questions?.length ?? 0);
    versions = history.versions || [];
    root.querySelector('#question-approved-total').textContent = String(approvedCount);
    root.querySelector('#snapshot-approved-count').textContent = `${approvedCount} aprovadas`;
    root.querySelector('#snapshot-generate').disabled = busy || !canGenerateEditorialSnapshot(approvedCount);
    root.querySelector('#snapshot-history').innerHTML = renderVersionHistory(versions);
  };

  const refetchQuestion = async (id) => {
    const result = await adminQuestionService.listQuestions(contestId, { search: id, pageSize: 50 });
    return (result.questions || []).find((question) => questionSourceId(question) === id) || null;
  };

  const validationMessage = (item) => {
    if (typeof item === 'string') return item;
    const prefix = item.index ? `#${item.index}: ` : '';
    return `${prefix}${item.message || item.code || 'Item inválido.'}`;
  };

  const renderValidation = (result) => {
    const errors = result?.errors || [];
    const warnings = result?.warnings || [];
    const total = result?.total ?? result?.count ?? loadedQuestions.length;
    output.innerHTML = result?.valid
      ? `<div class="admin-validation admin-validation--ok"><strong>${total} questões válidas.</strong>${warnings.map((warning) => `<small>${escapeHtml(validationMessage(warning))}</small>`).join('')}</div>`
      : `<div class="admin-validation admin-validation--error"><strong>${errors.length} erro(s).</strong>${errors.slice(0, 30).map((error) => `<small>${escapeHtml(validationMessage(error))}</small>`).join('')}</div>`;
  };

  const openQuestion = (id) => {
    const question = questionCache.get(id);
    if (!question) return;
    const details = curriculumDetails(question, curriculumIndex);
    const editable = canEditEditorialQuestion(question);
    const answer = normalizedAnswer(question.correct_answer);
    dialog.querySelector('#question-detail-title').textContent = id;
    dialogBody.innerHTML = `
      <dl class="admin-question-metadata">
        <div><dt>Disciplina</dt><dd>${escapeHtml(details.discipline)}</dd></div>
        <div><dt>Subtópico</dt><dd>${escapeHtml(details.subtopic)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(statusLabel(question.status))}</dd></div>
        <div><dt>Versão</dt><dd>${Number(question.version || 1)}</dd></div>
      </dl>
      <form id="question-edit-form" class="admin-form">
        <label>Enunciado<textarea name="statement" rows="5" required ${editable ? '' : 'disabled'}>${escapeHtml(question.statement || '')}</textarea></label>
        ${renderOptions(question)}
        <label>Gabarito<select name="correct_answer" required ${editable ? '' : 'disabled'}>
          <option value="">Selecione</option><option value="true" ${answer === true ? 'selected' : ''}>Certo</option>
          <option value="false" ${answer === false ? 'selected' : ''}>Errado</option></select></label>
        <label>Explicação<textarea name="explanation" rows="6" required ${editable ? '' : 'disabled'}>${escapeHtml(question.explanation || '')}</textarea></label>
        <div class="admin-form__row">
          <label>Dificuldade<input name="difficulty" maxlength="80" value="${escapeHtml(question.difficulty || '')}" ${editable ? '' : 'disabled'}></label>
          <label>Fonte<input name="source" maxlength="500" value="${escapeHtml(question.source || '')}" ${editable ? '' : 'disabled'}></label>
        </div>
        <label>Subtópico<select name="subtopic_id" required ${editable ? '' : 'disabled'}>
          ${subtopics.map((node) => {
    const value = node.source_id || node.id;
    return `<option value="${escapeHtml(value)}" ${value === details.subtopicId ? 'selected' : ''}>${escapeHtml(node.name || value)} · ${escapeHtml(value)}</option>`;
  }).join('')}</select></label>
        <label class="admin-checkbox-label"><input name="is_trick" type="checkbox" ${question.is_trick ? 'checked' : ''} ${editable ? '' : 'disabled'}> Questão com pegadinha</label>
        ${editable
    ? '<div class="admin-form__actions"><button class="admin-button" type="submit">Salvar questão</button></div>'
    : '<div class="admin-alert">Esta questão está bloqueada para edição no estado atual.</div>'}
        <div id="question-edit-status" role="status" aria-live="polite"></div>
      </form>`;
    const editForm = dialogBody.querySelector('#question-edit-form');
    if (editable) {
      editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const editStatus = editForm.querySelector('#question-edit-status');
        const submit = editForm.querySelector('button[type=submit]');
        const data = new FormData(editForm);
        const statement = String(data.get('statement') || '').trim();
        const explanation = String(data.get('explanation') || '').trim();
        const subtopicId = String(data.get('subtopic_id') || '').trim();
        const answerValue = String(data.get('correct_answer') || '');
        if (!statement || !explanation || !subtopicId || !['true', 'false'].includes(answerValue)) {
          editStatus.innerHTML = '<div class="admin-validation admin-validation--error">Preencha enunciado, explicação, subtópico e gabarito.</div>';
          return;
        }
        submit.disabled = true;
        try {
          ensureContest();
          await adminQuestionService.updateDraft(contestId, {
            id,
            statement,
            options: Array.isArray(question.options) && question.options.length ? question.options : ['Certo', 'Errado'],
            correct_answer: answerValue === 'true',
            explanation,
            difficulty: String(data.get('difficulty') || '').trim() || null,
            source: String(data.get('source') || '').trim() || null,
            is_trick: data.get('is_trick') === 'on',
            subtopic_id: subtopicId,
          });
          const persisted = await refetchQuestion(id);
          if (!persisted
            || persisted.statement !== statement
            || persisted.explanation !== explanation
            || normalizedAnswer(persisted.correct_answer) !== (answerValue === 'true')) {
            throw new Error('O backend não confirmou todos os campos salvos.');
          }
          questionCache.set(id, persisted);
          await refreshQuestions();
          editStatus.innerHTML = '<div class="admin-validation admin-validation--ok">Questão salva e confirmada no backend.</div>';
          operationStatus.textContent = `Questão ${id} atualizada.`;
        } catch (error) {
          editStatus.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
        } finally {
          submit.disabled = false;
        }
      });
    }
    dialog.showModal();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    importButton.disabled = true;
    try {
      ensureContest();
      const fileItems = await readFiles([...form.elements.files.files]);
      const pasted = form.elements.payload.value.trim() ? parseQuestionItems(form.elements.payload.value) : [];
      if (fileItems.length || pasted.length) loadedQuestions = [...fileItems, ...pasted];
      if (!loadedQuestions.length) throw new Error('Selecione um arquivo JSON ou cole um lote antes de validar.');
      const localValidation = validateEditorialBatch(loadedQuestions, {
        contestId,
        knownSubtopicIds: subtopicIds,
        knownIds: [...questionCache.keys()],
      });
      if (!localValidation.valid) {
        validation = localValidation;
        renderValidation(validation);
        return;
      }
      const remoteValidation = await adminQuestionService.validateBatch(contestId, localValidation.questions);
      validation = { ...localValidation, ...remoteValidation, total: localValidation.total, questions: localValidation.questions };
      importButton.disabled = !validation.valid;
      renderValidation(validation);
    } catch (error) {
      validation = null;
      importButton.disabled = true;
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });

  importButton.addEventListener('click', async () => {
    if (!validation?.valid) return;
    try {
      ensureContest();
      const result = await adminQuestionService.importDraft(contestId, validation.questions, {
        batchName: form.elements.batchName.value,
        knownSubtopicIds: subtopicIds,
      });
      if (!result.valid) {
        validation = result;
        importButton.disabled = true;
        renderValidation(result);
        return;
      }
      output.innerHTML = `<div class="admin-validation admin-validation--ok">Lote ${escapeHtml(result.batchId)} importado com ${result.imported} questões.</div>`;
      await renderAdminQuestionsScreen(root, ctx);
    } catch (error) {
      importButton.disabled = true;
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });

  root.querySelector('#question-filter').addEventListener('click', async () => {
    operationStatus.textContent = '';
    try {
      setBusy(true);
      await refreshQuestions();
    } catch (error) {
      operationStatus.textContent = error.message;
    } finally {
      setBusy(false);
    }
  });

  root.querySelector('#question-list').addEventListener('change', (event) => {
    if (!event.target.matches('.question-row-select')) return;
    selectedIds = toggleEditorialSelection(selectedIds, event.target.value, event.target.checked);
    updateSelectionControls();
  });

  root.querySelector('#question-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-question-open]');
    if (button) openQuestion(button.dataset.questionOpen);
  });

  selectAll.addEventListener('change', () => {
    selectedIds = selectVisibleEditorialQuestions(selectedIds, questions.map(questionSourceId), selectAll.checked);
    renderQuestionTable();
  });

  clearSelection.addEventListener('click', () => {
    selectedIds = new Set();
    renderQuestionTable();
  });

  root.querySelector('.admin-editorial-actions').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-transition]');
    if (!button || busy) return;
    const selected = currentSelectedQuestions();
    const targetStatus = button.dataset.transition;
    if (!canTransitionEditorialSelection(selected, targetStatus)) {
      operationStatus.textContent = 'Selecione questões com o mesmo status e uma transição compatível.';
      return;
    }
    const currentStatus = selected[0].status;
    const ids = selected.map(questionSourceId);
    const confirmed = globalThis.confirm([
      `Concurso: ${contestId}`,
      `Questões selecionadas: ${ids.length}`,
      `Status atual: ${statusLabel(currentStatus)}`,
      `Novo status: ${statusLabel(targetStatus)}`,
      '',
      'Confirmar alteração editorial?',
    ].join('\n'));
    if (!confirmed) return;
    try {
      setBusy(true);
      ensureContest();
      operationStatus.textContent = 'Aplicando e confirmando no backend…';
      await adminQuestionService.transition(ids, targetStatus, contestId);
      const persisted = await Promise.all(ids.map(refetchQuestion));
      const changed = persisted.filter((question) => question?.status === targetStatus).length;
      if (changed !== ids.length) throw new Error(`O backend confirmou ${changed} de ${ids.length} alterações.`);
      persisted.forEach((question) => questionCache.set(questionSourceId(question), question));
      selectedIds = new Set();
      await Promise.all([refreshQuestions(), refreshApprovedAndVersions()]);
      operationStatus.textContent = `${changed} questão${changed === 1 ? '' : 'ões'} confirmada${changed === 1 ? '' : 's'} como ${statusLabel(targetStatus)}.`;
    } catch (error) {
      operationStatus.textContent = `Nenhuma atualização visual foi assumida: ${error.message}`;
    } finally {
      setBusy(false);
    }
  });

  root.querySelector('#snapshot-generate').addEventListener('click', async () => {
    if (!canGenerateEditorialSnapshot(approvedCount) || busy) return;
    const version = root.querySelector('#snapshot-version').value.trim();
    const snapshotResult = root.querySelector('#snapshot-result');
    if (!version) {
      snapshotResult.innerHTML = '<div class="admin-validation admin-validation--error">Informe uma versão.</div>';
      return;
    }
    const confirmed = globalThis.confirm([
      `Concurso: ${contestId}`,
      `Versão: ${version}`,
      `Questões aprovadas: ${approvedCount}`,
      '',
      'O snapshot será imutável. Confirmar geração?',
    ].join('\n'));
    if (!confirmed) return;
    try {
      setBusy(true);
      ensureContest();
      const generated = await adminQuestionService.generateSnapshot(contestId, version);
      const history = await adminQuestionService.listVersions(contestId);
      versions = history.versions || [];
      const persisted = versions.find((item) => item.id === generated.version?.id || item.version === version);
      if (!persisted) throw new Error('O snapshot não foi confirmado no histórico do backend.');
      root.querySelector('#snapshot-history').innerHTML = renderVersionHistory(versions);
      snapshotResult.innerHTML = `<div class="admin-validation admin-validation--ok">
        <strong>Snapshot ${escapeHtml(persisted.version)} confirmado.</strong>
        <small>${Number(persisted.item_count)} questões · hash ${escapeHtml(persisted.content_hash)} · ${escapeHtml(statusLabel(persisted.status))}</small>
      </div>`;
    } catch (error) {
      snapshotResult.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    } finally {
      setBusy(false);
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  renderQuestionTable();
}
