import {
  adminCourseFactoryService,
  COURSE_FACTORY_SOURCE_CATEGORIES,
} from '../services/adminCourseFactoryService.js';
import { escapeHtml } from '../ui/helpers.js';

const STATUS_LABELS = Object.freeze({
  sources: 'FONTES', analyzing: 'ANALISANDO', proposed: 'PROPOSTA DA IA',
  analysis_failed: 'ANÁLISE COM PENDÊNCIA', map_approved: 'MAPA APROVADO',
  awaiting_upload: 'ENVIANDO', uploaded: 'ARMAZENADO', extracted: 'EXTRAÍDO', extraction_error: 'ERRO DE EXTRAÇÃO',
});

const MAP_ARRAY_FIELDS = Object.freeze([
  ['essential_concepts', 'Conceitos essenciais'], ['rules', 'Regras'], ['exceptions', 'Exceções'],
  ['applications', 'Aplicações'], ['competencies', 'Competências exigidas'], ['required_knowledge', 'Conhecimentos necessários'],
]);

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function traceList(traces = []) {
  if (!traces.length) return '<span class="admin-trace admin-trace--human">Edição humana</span>';
  return `<ul class="admin-trace-list">${traces.map((trace) => `<li>
    <strong>${escapeHtml(trace.source_type === 'official_edital' ? 'EDITAL OFICIAL' : 'MATERIAL COMPLEMENTAR')}</strong>
    <span>${escapeHtml(trace.source_name)} · página ${Number(trace.page_number)}</span>
    <q>${escapeHtml(trace.excerpt)}</q>
  </li>`).join('')}</ul>`;
}

function confidenceField(value, attributes, editable) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 1;
  return `<label class="admin-confidence-field"><span>Confiança</span><input type="number" min="0" max="1" step="0.01" value="${numeric}" ${attributes} ${editable ? '' : 'disabled'}></label>`;
}

function firstTrace(...candidates) {
  for (const candidate of candidates) if (Array.isArray(candidate) && candidate.length) return structuredClone(candidate);
  return [];
}

function summaryCounts(draft) {
  const curriculum = Array.isArray(draft.curriculum) ? draft.curriculum : [];
  const editalMap = Array.isArray(draft.edital_map) ? draft.edital_map : [];
  return {
    disciplines: curriculum.length,
    topics: curriculum.reduce((sum, discipline) => sum + (discipline.topics?.length || 0), 0),
    subtopics: curriculum.reduce((sum, discipline) => sum + (discipline.topics || []).reduce((total, topic) => total + (topic.subtopics?.length || 0), 0), 0),
    knowledges: editalMap.reduce((sum, item) => sum + (item.microknowledges?.length || 0), 0),
  };
}

function findMapItem(draft, disciplineTitle, topicTitle, subtopicTitle) {
  return (draft.edital_map || []).find((item) => item.discipline_title === disciplineTitle
    && item.topic_title === topicTitle && item.subtopic_title === subtopicTitle);
}

function renderSources(draft, sources, capabilities, busy) {
  const official = sources.find(({ source_type: type }) => type === 'official_edital');
  const complements = sources.filter(({ source_type: type }) => type === 'complementary');
  const locked = busy || draft.status === 'analyzing' || draft.status === 'map_approved';
  const row = (source) => `<article class="admin-source-row">
    <span class="admin-source-row__icon" aria-hidden="true">PDF</span>
    <div><strong>${escapeHtml(source.file_name)}</strong><span>${escapeHtml(source.source_type === 'official_edital' ? 'Edital oficial' : COURSE_FACTORY_SOURCE_CATEGORIES.find(([id]) => id === source.category)?.[1] || source.category)} · ${formatBytes(source.byte_size)}</span>
      ${source.extraction_error ? `<small class="admin-source-error">${escapeHtml(source.extraction_error)}</small>` : ''}</div>
    <b class="admin-source-status admin-source-status--${escapeHtml(source.status)}">${escapeHtml(STATUS_LABELS[source.status] || source.status)}</b>
    ${locked ? '' : `<button type="button" class="admin-button admin-button--secondary" data-remove-source="${escapeHtml(source.id)}">Remover</button>`}
  </article>`;
  return `<section class="admin-panel admin-factory-sources">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Etapa 1</span><h2>Fontes</h2></div><strong class="admin-readonly-badge">PERSISTÊNCIA PRIVADA</strong></div>
    <div class="admin-source-upload-grid">
      <label class="admin-upload-field"><strong>Edital oficial *</strong><span>PDF obrigatório · até 20 MB</span>
        <input id="factory-official-file" type="file" accept="application/pdf,.pdf" ${official || locked ? 'disabled' : ''}>
      </label>
      <div class="admin-upload-field"><strong>Materiais complementares</strong><span>Múltiplos PDFs · apoio sem ampliar o edital</span>
        <label><span class="sr-only">Categoria do material</span><select id="factory-complement-category" ${locked ? 'disabled' : ''}>
          ${COURSE_FACTORY_SOURCE_CATEGORIES.map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join('')}
        </select></label>
        <input id="factory-complement-files" type="file" accept="application/pdf,.pdf" multiple ${locked ? 'disabled' : ''}>
      </div>
    </div>
    <div class="admin-source-list">
      ${official ? row(official) : '<div class="admin-empty admin-empty--compact"><strong>Edital oficial ainda não enviado.</strong><span>A análise permanece bloqueada.</span></div>'}
      ${complements.map(row).join('')}
    </div>
    <div class="admin-factory-analysis-action">
      <div><strong>${capabilities.aiConfigured ? `${escapeHtml(capabilities.provider)} · ${escapeHtml(capabilities.model)}` : 'IA NÃO CONFIGURADA'}</strong>
        <span>${capabilities.aiConfigured ? 'Análise server-side com saída estruturada e validação de negócio.' : 'Configure OPENAI_API_KEY no ambiente server-side do staging.'}</span></div>
      <button type="button" class="admin-button" id="factory-analyze" ${!official || !capabilities.aiConfigured || locked ? 'disabled' : ''}>
        ${draft.status === 'proposed' || draft.status === 'analysis_failed' ? 'REANALISAR COM IA' : 'ANALISAR COM IA'}
      </button>
    </div>
  </section>`;
}

function renderIdentity(draft, editable) {
  const identity = draft.identity || {};
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Etapa 2</span><h2>Identificação do curso</h2></div><strong class="admin-readonly-badge">${editable ? 'PROPOSTA DA IA' : 'MAPA APROVADO'}</strong></div>
    <div class="admin-form-grid admin-factory-identity">
      ${[
    ['contest_name', 'Concurso'], ['organization', 'Órgão'], ['position', 'Cargo'], ['board', 'Banca'],
    ['year', 'Ano'], ['exam_date', 'Data da prova'], ['exam_format', 'Formato da prova'],
  ].map(([field, label]) => `<label><span>${label}</span><input data-identity-field="${field}" value="${escapeHtml(identity[field] || '')}" ${editable ? '' : 'disabled'}></label>`).join('')}
    </div>
    ${confidenceField(identity.confidence, 'data-identity-confidence', editable)}
    <div class="admin-form-grid admin-factory-generated-ids">
      ${['contest_id', 'position_id', 'offering_id', 'slug'].map((field) => `<label><span>${field}</span><input data-identity-field="${field}" value="${escapeHtml(identity[field] || '')}" ${editable ? '' : 'disabled'}></label>`).join('')}
    </div>
    <details class="admin-trace-details"><summary>Ver rastreabilidade da identificação</summary>${traceList(identity.traces)}</details>
  </section>`;
}

function nodeControls(type, d, t = -1, s = -1) {
  const attrs = `data-node-type="${type}" data-d="${d}" data-t="${t}" data-s="${s}"`;
  return `<span class="admin-tree-actions">
    <button type="button" aria-label="Mover para cima" data-tree-action="up" ${attrs}>↑</button>
    <button type="button" aria-label="Mover para baixo" data-tree-action="down" ${attrs}>↓</button>
    <button type="button" aria-label="Excluir" data-tree-action="delete" ${attrs}>×</button>
  </span>`;
}

function renderCurriculum(draft, editable) {
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Etapa 3</span><h2>Currículo proposto pela IA</h2></div>
      ${editable ? '<button type="button" class="admin-button admin-button--secondary" data-tree-action="add-discipline">+ Disciplina</button>' : ''}</div>
    <div class="admin-factory-tree">${(draft.curriculum || []).map((discipline, d) => `<details class="admin-factory-discipline" open>
      <summary><span>${d + 1}</span><strong>${escapeHtml(discipline.title)}</strong><small>${discipline.topics?.length || 0} tópicos</small></summary>
      <div class="admin-factory-node-editor"><input data-tree-title="discipline" data-d="${d}" value="${escapeHtml(discipline.title)}" ${editable ? '' : 'disabled'}>${confidenceField(discipline.confidence, `data-tree-confidence="discipline" data-d="${d}"`, editable)}${editable ? nodeControls('discipline', d) : ''}</div>
      <details class="admin-trace-details"><summary>Fonte da disciplina</summary>${traceList(discipline.traces)}</details>
      <div class="admin-factory-topic-list">${(discipline.topics || []).map((topic, t) => `<details class="admin-factory-topic">
        <summary><span>${d + 1}.${t + 1}</span><strong>${escapeHtml(topic.title)}</strong><small>${topic.subtopics?.length || 0} subtópicos</small></summary>
        <div class="admin-factory-node-editor"><input data-tree-title="topic" data-d="${d}" data-t="${t}" value="${escapeHtml(topic.title)}" ${editable ? '' : 'disabled'}>${confidenceField(topic.confidence, `data-tree-confidence="topic" data-d="${d}" data-t="${t}"`, editable)}${editable ? nodeControls('topic', d, t) : ''}</div>
        <details class="admin-trace-details"><summary>Fonte do tópico</summary>${traceList(topic.traces)}</details>
        <div class="admin-factory-subtopic-list">${(topic.subtopics || []).map((subtopic, s) => `<article class="admin-factory-subtopic">
          <div class="admin-factory-node-editor"><input data-tree-title="subtopic" data-d="${d}" data-t="${t}" data-s="${s}" value="${escapeHtml(subtopic.title)}" ${editable ? '' : 'disabled'}>${confidenceField(subtopic.confidence, `data-tree-confidence="subtopic" data-d="${d}" data-t="${t}" data-s="${s}"`, editable)}${editable ? nodeControls('subtopic', d, t, s) : ''}</div>
          <details class="admin-trace-details"><summary>Fonte do subtópico</summary>${traceList(subtopic.traces)}</details>
        </article>`).join('')}</div>
        ${editable ? `<button type="button" class="admin-inline-add" data-tree-action="add-subtopic" data-d="${d}" data-t="${t}">+ Subtópico</button>` : ''}
      </details>`).join('')}</div>
      ${editable ? `<button type="button" class="admin-inline-add" data-tree-action="add-topic" data-d="${d}">+ Tópico</button>` : ''}
    </details>`).join('')}</div>
  </section>`;
}

function renderMap(draft, editable) {
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Etapa 4</span><h2>Mapa do Edital proposto</h2><p>Conhecimentos complementares são identificados explicitamente.</p></div></div>
    <div class="admin-factory-map">${(draft.edital_map || []).map((item, mapIndex) => `<details class="admin-factory-map-item">
      <summary><span>${mapIndex + 1}</span><strong>${escapeHtml(item.subtopic_title)}</strong><small>${item.microknowledges?.length || 0} conhecimentos</small></summary>
      <div class="admin-factory-map-path">${escapeHtml(item.discipline_title)} → ${escapeHtml(item.topic_title)} → ${escapeHtml(item.subtopic_title)}</div>
      ${confidenceField(item.confidence, `data-map-confidence data-map="${mapIndex}"`, editable)}
      <label class="admin-factory-wide-field"><span>Escopo</span><input data-map-field="scope" data-map="${mapIndex}" value="${escapeHtml(item.scope)}" ${editable ? '' : 'disabled'}></label>
      <div class="admin-form-grid">${MAP_ARRAY_FIELDS.map(([field, label]) => `<label><span>${label}</span><textarea data-map-array="${field}" data-map="${mapIndex}" ${editable ? '' : 'disabled'}>${escapeHtml((item[field] || []).join('\n'))}</textarea></label>`).join('')}</div>
      <h3>Possíveis microconhecimentos</h3>
      <div class="admin-microknowledge-list">${(item.microknowledges || []).map((knowledge, knowledgeIndex) => `<article>
        <input data-knowledge-title data-map="${mapIndex}" data-k="${knowledgeIndex}" value="${escapeHtml(knowledge.title)}" ${editable ? '' : 'disabled'}>
        <select data-knowledge-origin data-map="${mapIndex}" data-k="${knowledgeIndex}" ${editable ? '' : 'disabled'}>
          <option value="official" ${knowledge.scope_origin === 'official' ? 'selected' : ''}>ESCOPO OFICIAL</option>
          <option value="complementary" ${knowledge.scope_origin === 'complementary' ? 'selected' : ''}>CONHECIMENTO COMPLEMENTAR</option>
        </select>
        ${confidenceField(knowledge.confidence, `data-knowledge-confidence data-map="${mapIndex}" data-k="${knowledgeIndex}"`, editable)}
        ${editable ? `<button type="button" data-remove-knowledge data-map="${mapIndex}" data-k="${knowledgeIndex}" aria-label="Excluir conhecimento">×</button>` : ''}
        <details class="admin-trace-details"><summary>Fonte do conhecimento</summary>${traceList(knowledge.traces)}</details>
      </article>`).join('')}</div>
      ${editable ? `<button type="button" class="admin-inline-add" data-add-knowledge="${mapIndex}">+ Conhecimento</button>` : ''}
      <details class="admin-trace-details"><summary>Rastreabilidade do mapa</summary>${traceList(item.traces)}</details>
    </details>`).join('')}</div>
  </section>`;
}

function renderApproval(draft, editable) {
  const counts = summaryCounts(draft);
  return `<section class="admin-panel admin-factory-approval">
    <div><span class="admin-panel__eyebrow">Resumo da análise</span><h2>${draft.status === 'map_approved' ? 'MAPA APROVADO' : 'Aprovação humana obrigatória'}</h2>
      <p>A aprovação encerra esta V2 e não publica curso, questões ou venda.</p></div>
    <div class="admin-factory-summary">
      <strong>${counts.disciplines}<span>disciplinas</span></strong><strong>${counts.topics}<span>tópicos</span></strong>
      <strong>${counts.subtopics}<span>subtópicos</span></strong><strong>${counts.knowledges}<span>conhecimentos</span></strong>
    </div>
    ${editable ? `<div class="admin-form__actions"><button type="button" class="admin-button admin-button--secondary" id="factory-save">SALVAR EDIÇÕES</button>
      <button type="button" class="admin-button" id="factory-approve">APROVAR MAPA</button></div>` : '<div class="admin-prepared">Próxima fase liberada futuramente: cobertura → plano de questões → geração por IA.</div>'}
  </section>`;
}

function mapPathSnapshot(draft, d, t, s) {
  const discipline = draft.curriculum[d];
  const topic = discipline?.topics?.[t];
  const subtopic = topic?.subtopics?.[s];
  return { discipline, topic, subtopic };
}

function removeMapByPath(draft, disciplineTitle, topicTitle = null, subtopicTitle = null) {
  draft.edital_map = (draft.edital_map || []).filter((item) => {
    if (item.discipline_title !== disciplineTitle) return true;
    if (topicTitle != null && item.topic_title !== topicTitle) return true;
    if (subtopicTitle != null && item.subtopic_title !== subtopicTitle) return true;
    return false;
  });
}

function renameMapPath(draft, previous, next, type) {
  for (const item of draft.edital_map || []) {
    if (type === 'discipline' && item.discipline_title === previous.discipline.title) item.discipline_title = next;
    if (type === 'topic' && item.discipline_title === previous.discipline.title && item.topic_title === previous.topic.title) item.topic_title = next;
    if (type === 'subtopic' && item.discipline_title === previous.discipline.title && item.topic_title === previous.topic.title && item.subtopic_title === previous.subtopic.title) item.subtopic_title = next;
  }
}

function proposalPayload(draft) {
  return {
    identity: draft.identity,
    curriculum: draft.curriculum,
    edital_map: draft.edital_map,
    relevant_observations: draft.analysis_summary?.relevant_observations || [],
  };
}

export async function renderAdminCourseCreateScreen(root, ctx, { draftId = null, createNew = false } = {}) {
  root.innerHTML = '<div class="admin-loading" role="status">Preparando rascunho seguro…</div>';
  let capabilities;
  let envelope;
  try {
    capabilities = await adminCourseFactoryService.capabilities();
    envelope = createNew || !draftId
      ? await adminCourseFactoryService.createDraft()
      : await adminCourseFactoryService.getDraft(draftId);
  } catch (error) {
    root.innerHTML = `<section class="admin-panel admin-empty"><h1>Novo curso</h1><div class="admin-alert" role="alert">${escapeHtml(error.message)}</div>
      <button type="button" class="admin-button admin-button--secondary" id="factory-back">Voltar para Cursos</button></section>`;
    root.querySelector('#factory-back')?.addEventListener('click', () => globalThis.__DETONA_ADMIN?.navigate?.('contests'));
    return;
  }

  let draft = structuredClone(envelope.draft);
  let sources = structuredClone(envelope.sources || []);
  let busy = false;
  let feedback = '';

  const refresh = async () => {
    envelope = await adminCourseFactoryService.getDraft(draft.id);
    draft = structuredClone(envelope.draft);
    sources = structuredClone(envelope.sources || []);
  };

  const draw = () => {
    const proposed = ['proposed', 'map_approved'].includes(draft.status);
    const editable = draft.status === 'proposed' && !busy;
    root.innerHTML = `
      <header class="admin-page-header admin-page-header--courses"><div><span>Course Factory V2</span><h1>Novo curso</h1>
        <p>Fontes → análise por IA → identificação → currículo → Mapa do Edital → aprovação humana.</p></div>
        <button type="button" class="admin-button admin-button--secondary" id="factory-back">← Cursos</button>
      </header>
      <section class="admin-factory-draft-bar"><div><span>course_draft_id</span><code>${escapeHtml(draft.id)}</code></div>
        <strong>${escapeHtml(STATUS_LABELS[draft.status] || draft.status)}</strong><span>Revisão ${Number(draft.revision || 0)}</span></section>
      ${feedback ? `<div class="${feedback.startsWith('Erro:') ? 'admin-alert' : 'admin-prepared'}" role="status">${escapeHtml(feedback)}</div>` : ''}
      ${renderSources(draft, sources, capabilities, busy)}
      ${proposed ? renderIdentity(draft, editable) + renderCurriculum(draft, editable) + renderMap(draft, editable) + renderApproval(draft, editable) : `
        <section class="admin-panel admin-empty"><h2>Aguardando análise</h2><p>O currículo e o mapa só aparecerão após extração, resposta estruturada da IA e validação server-side.</p></section>`}
    `;
    bind();
  };

  const run = async (message, operation) => {
    if (busy) return;
    busy = true;
    feedback = message;
    draw();
    try {
      await operation();
    } catch (error) {
      feedback = `Erro: ${error.message || 'Operação indisponível.'}`;
    } finally {
      busy = false;
      draw();
    }
  };

  const uploadFiles = async (files, settings) => {
    for (const file of files) {
      feedback = `Enviando ${file.name}…`;
      draw();
      await adminCourseFactoryService.uploadSource(draft.id, file, settings);
    }
    await refresh();
    feedback = `${files.length} PDF(s) armazenado(s) com segurança.`;
  };

  const bindProposalInputs = () => {
    root.querySelectorAll('[data-identity-field]').forEach((input) => input.addEventListener('input', () => {
      draft.identity[input.dataset.identityField] = input.value;
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelector('[data-identity-confidence]')?.addEventListener('input', (event) => {
      draft.identity.confidence = Number(event.target.value); globalThis.__DETONA_ADMIN?.markDirty?.();
    });
    root.querySelectorAll('[data-tree-confidence]').forEach((input) => input.addEventListener('input', () => {
      const { discipline, topic, subtopic } = mapPathSnapshot(draft, Number(input.dataset.d), Number(input.dataset.t), Number(input.dataset.s));
      const node = input.dataset.treeConfidence === 'discipline' ? discipline : input.dataset.treeConfidence === 'topic' ? topic : subtopic;
      node.confidence = Number(input.value); globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-map-confidence]').forEach((input) => input.addEventListener('input', () => {
      draft.edital_map[Number(input.dataset.map)].confidence = Number(input.value); globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-knowledge-confidence]').forEach((input) => input.addEventListener('input', () => {
      draft.edital_map[Number(input.dataset.map)].microknowledges[Number(input.dataset.k)].confidence = Number(input.value);
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-tree-title]').forEach((input) => input.addEventListener('change', () => {
      const d = Number(input.dataset.d); const t = Number(input.dataset.t); const s = Number(input.dataset.s);
      const previous = structuredClone(mapPathSnapshot(draft, d, t, s));
      const type = input.dataset.treeTitle;
      if (type === 'discipline') draft.curriculum[d].title = input.value;
      if (type === 'topic') draft.curriculum[d].topics[t].title = input.value;
      if (type === 'subtopic') draft.curriculum[d].topics[t].subtopics[s].title = input.value;
      renameMapPath(draft, previous, input.value, type);
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-map-field]').forEach((input) => input.addEventListener('input', () => {
      draft.edital_map[Number(input.dataset.map)][input.dataset.mapField] = input.value;
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-map-array]').forEach((input) => input.addEventListener('input', () => {
      draft.edital_map[Number(input.dataset.map)][input.dataset.mapArray] = input.value.split('\n').map((value) => value.trim()).filter(Boolean);
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-knowledge-title]').forEach((input) => input.addEventListener('input', () => {
      draft.edital_map[Number(input.dataset.map)].microknowledges[Number(input.dataset.k)].title = input.value;
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelectorAll('[data-knowledge-origin]').forEach((input) => input.addEventListener('change', () => {
      draft.edital_map[Number(input.dataset.map)].microknowledges[Number(input.dataset.k)].scope_origin = input.value;
      globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
  };

  const bindTreeActions = () => {
    root.querySelectorAll('[data-tree-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.treeAction;
      const type = button.dataset.nodeType;
      const d = Number(button.dataset.d); const t = Number(button.dataset.t); const s = Number(button.dataset.s);
      if (action === 'add-discipline') {
        draft.curriculum.push({ title: 'Nova disciplina', order: draft.curriculum.length + 1, confidence: 1, traces: firstTrace(draft.identity.traces), topics: [] });
      } else if (action === 'add-topic') {
        const discipline = draft.curriculum[d];
        discipline.topics.push({ title: 'Novo tópico', order: discipline.topics.length + 1, confidence: 1, traces: firstTrace(discipline.traces, draft.identity.traces), subtopics: [] });
      } else if (action === 'add-subtopic') {
        const { discipline, topic } = mapPathSnapshot(draft, d, t, -1);
        const subtopic = { title: 'Novo subtópico', order: topic.subtopics.length + 1, confidence: 1, traces: firstTrace(topic.traces, discipline.traces) };
        topic.subtopics.push(subtopic);
        draft.edital_map.push({ discipline_title: discipline.title, topic_title: topic.title, subtopic_title: subtopic.title, confidence: 1, scope: 'Definir escopo', essential_concepts: [], rules: [], exceptions: [], applications: [], competencies: [], required_knowledge: [], microknowledges: [], traces: firstTrace(subtopic.traces) });
      } else if (type) {
        const snapshot = mapPathSnapshot(draft, d, t, s);
        const collection = type === 'discipline' ? draft.curriculum : type === 'topic' ? snapshot.discipline.topics : snapshot.topic.subtopics;
        const index = type === 'discipline' ? d : type === 'topic' ? t : s;
        if (action === 'delete') {
          removeMapByPath(draft, snapshot.discipline.title, type === 'discipline' ? null : snapshot.topic.title, type === 'subtopic' ? snapshot.subtopic.title : null);
          collection.splice(index, 1);
        } else {
          const target = action === 'up' ? index - 1 : index + 1;
          if (target >= 0 && target < collection.length) [collection[index], collection[target]] = [collection[target], collection[index]];
        }
      }
      globalThis.__DETONA_ADMIN?.markDirty?.();
      draw();
    }));
  };

  function bind() {
    root.querySelector('#factory-back')?.addEventListener('click', () => globalThis.__DETONA_ADMIN?.navigate?.('contests'));
    root.querySelector('#factory-official-file')?.addEventListener('change', (event) => run('Enviando edital oficial…', async () => {
      await uploadFiles([...event.target.files], { sourceType: 'official_edital', category: 'edital' });
    }));
    root.querySelector('#factory-complement-files')?.addEventListener('change', (event) => run('Enviando materiais complementares…', async () => {
      const category = root.querySelector('#factory-complement-category').value;
      await uploadFiles([...event.target.files], { sourceType: 'complementary', category });
    }));
    root.querySelectorAll('[data-remove-source]').forEach((button) => button.addEventListener('click', () => run('Removendo fonte…', async () => {
      await adminCourseFactoryService.removeSource(draft.id, button.dataset.removeSource);
      await refresh(); feedback = 'Fonte removida.';
    })));
    root.querySelector('#factory-analyze')?.addEventListener('click', () => run('Extraindo páginas e analisando com IA…', async () => {
      await adminCourseFactoryService.analyzeSources(draft.id);
      await refresh(); feedback = 'Análise estruturada concluída. Revise a proposta antes de aprovar.';
    }));
    bindProposalInputs();
    bindTreeActions();
    root.querySelectorAll('[data-add-knowledge]').forEach((button) => button.addEventListener('click', () => {
      const item = draft.edital_map[Number(button.dataset.addKnowledge)];
      const traces = firstTrace(item.traces);
      item.microknowledges.push({ title: 'Novo conhecimento', scope_origin: traces.some(({ source_type: type }) => type === 'complementary') ? 'complementary' : 'official', confidence: 1, traces });
      globalThis.__DETONA_ADMIN?.markDirty?.();
      draw();
    }));
    root.querySelectorAll('[data-remove-knowledge]').forEach((button) => button.addEventListener('click', () => {
      draft.edital_map[Number(button.dataset.map)].microknowledges.splice(Number(button.dataset.k), 1);
      globalThis.__DETONA_ADMIN?.markDirty?.();
      draw();
    }));
    root.querySelector('#factory-save')?.addEventListener('click', () => run('Validando e salvando edições…', async () => {
      const result = await adminCourseFactoryService.saveProposal(draft.id, proposalPayload(draft));
      draft = structuredClone(result.draft); feedback = 'Edições humanas salvas e IDs determinísticos atualizados.';
      globalThis.__DETONA_ADMIN?.markSaved?.();
    }));
    root.querySelector('#factory-approve')?.addEventListener('click', () => {
      if (!globalThis.confirm?.('Aprovar este Mapa do Edital? Isso não publica o curso e não gera questões.')) return;
      run('Aprovando mapa…', async () => {
        const result = await adminCourseFactoryService.approveMap(draft.id);
        draft = structuredClone(result.draft); feedback = 'MAPA APROVADO. Publicação e geração de questões continuam bloqueadas.';
        globalThis.__DETONA_ADMIN?.markSaved?.();
      });
    });
  }

  draw();
}

export function renderCourseFactoryDraftCards(drafts = []) {
  if (!drafts.length) return '';
  return `<section class="admin-panel admin-factory-resume"><div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Rascunhos persistentes</span><h2>Continuar criação</h2></div></div>
    <div class="admin-course-draft-list">${drafts.map((draft) => `<button type="button" data-resume-draft="${escapeHtml(draft.id)}">
      <span><strong>${escapeHtml(draft.identity?.contest_name || 'Novo curso')}</strong><small>${escapeHtml(draft.identity?.position || draft.id)}</small></span>
      <b>${escapeHtml(STATUS_LABELS[draft.status] || draft.status)}</b>
    </button>`).join('')}</div></section>`;
}
