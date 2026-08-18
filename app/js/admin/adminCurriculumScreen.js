import { adminCurriculumService } from '../services/adminCurriculumService.js';
import { escapeHtml } from '../ui/helpers.js';
import { PC_BA_CONTEST_ID } from '../services/courseFactoryPreviewService.js';

function treeRows(nodes) {
  const byParent = new Map();
  nodes.forEach((node) => {
    const parent = node.parent_id || node.parent_source_id || 'root';
    byParent.set(parent, [...(byParent.get(parent) || []), node]);
  });
  const rows = [];
  const visit = (parent, depth) => {
    (byParent.get(parent) || []).sort((a, b) => a.order_index - b.order_index).forEach((node) => {
      rows.push({ ...node, depth });
      visit(node.id || node.source_id, depth + 1);
    });
  };
  visit('root', 0);
  return rows.length ? rows : nodes.map((node) => ({ ...node, depth: Math.max(0, ['role', 'discipline', 'topic', 'subtopic'].indexOf(node.type)) }));
}

function childNodes(nodes) {
  const byParent = new Map();
  nodes.forEach((node) => {
    const parent = node.parent_id || node.parent_source_id || 'root';
    byParent.set(parent, [...(byParent.get(parent) || []), node]);
  });
  for (const children of byParent.values()) children.sort((a, b) => a.order_index - b.order_index);
  return byParent;
}

function coverageBadge(coverage = {}) {
  const insufficient = coverage.insufficient === true;
  return `<span class="admin-coverage ${insufficient ? 'is-warning' : 'is-ok'}">
    ${Number(coverage.question_count || 0)} questões · ${Number(coverage.microknowledge_count || 0)} microconhecimentos · ${Number(coverage.coverage_pct || 0)}%
    ${insufficient ? '<b>cobertura insuficiente</b>' : '<b>cobertura adequada</b>'}
  </span>`;
}

function renderPcBaMap(root, data) {
  const nodes = data.rows;
  const byParent = childNodes(nodes);
  const role = nodes.find(({ type }) => type === 'role');
  const disciplines = byParent.get(role?.id) || nodes.filter(({ type }) => type === 'discipline');
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Course Factory · Mapa do Edital</span><h1>PC BA 2026 — Investigador</h1>
      <p>Currículo canônico em homologação. Visualização somente leitura; nenhuma alteração será enviada ao banco.</p></div></header>
    <section class="admin-metrics admin-metrics--course-factory">
      <article class="admin-metric admin-metric--orange"><span>Disciplinas</span><strong>${data.counts.discipline}</strong></article>
      <article class="admin-metric"><span>Tópicos</span><strong>${data.counts.topic}</strong></article>
      <article class="admin-metric"><span>Subtópicos</span><strong>${data.counts.subtopic}</strong></article>
      <article class="admin-metric"><span>Estado</span><strong class="admin-metric__text">EM TESTE</strong></article>
    </section>
    <section class="admin-panel">
      <div class="admin-course-map-toolbar">
        <input id="course-map-search" type="search" placeholder="Pesquisar disciplina, tópico ou subtópico" aria-label="Pesquisar no mapa do edital">
        <button class="admin-button admin-button--secondary" id="course-map-expand" type="button">Expandir tudo</button>
        <button class="admin-button admin-button--secondary" id="course-map-collapse" type="button">Recolher tudo</button>
      </div>
      <div class="admin-course-map" id="course-map-tree">
        ${disciplines.map((discipline, disciplineIndex) => {
    const topics = byParent.get(discipline.id) || [];
    return `<details class="admin-course-discipline" ${disciplineIndex === 0 ? 'open' : ''}>
            <summary><span>${String(disciplineIndex + 1).padStart(2, '0')}</span><strong>${escapeHtml(discipline.name)}</strong><small>${topics.length} tópicos · ${topics.reduce((sum, topic) => sum + (byParent.get(topic.id)?.length || 0), 0)} subtópicos</small></summary>
            <div class="admin-course-topics">${topics.map((topic, topicIndex) => {
    const subtopics = byParent.get(topic.id) || [];
    return `<details class="admin-course-topic">
                <summary><span>${disciplineIndex + 1}.${topicIndex + 1}</span><strong>${escapeHtml(topic.name)}</strong><small>${subtopics.length} subtópicos</small></summary>
                <div class="admin-course-subtopics">${subtopics.map((subtopic) => `
                  <article class="admin-course-subtopic" data-searchable="${escapeHtml(`${discipline.name} ${topic.name} ${subtopic.name}`.toLocaleLowerCase('pt-BR'))}">
                    <div><strong>${escapeHtml(subtopic.name)}</strong><code>${escapeHtml(subtopic.id)}</code></div>
                    ${coverageBadge(data.coverage?.[subtopic.id])}
                  </article>`).join('')}</div>
              </details>`;
  }).join('')}</div>
          </details>`;
  }).join('')}
      </div>
      <p id="course-map-search-result" class="admin-course-map-result" role="status"></p>
    </section>`;
  const details = [...root.querySelectorAll('#course-map-tree details')];
  root.querySelector('#course-map-expand').addEventListener('click', () => details.forEach((item) => { item.open = true; }));
  root.querySelector('#course-map-collapse').addEventListener('click', () => details.forEach((item) => { item.open = false; }));
  root.querySelector('#course-map-search').addEventListener('input', (event) => {
    const needle = event.currentTarget.value.trim().toLocaleLowerCase('pt-BR');
    const subtopics = [...root.querySelectorAll('.admin-course-subtopic')];
    let visible = 0;
    subtopics.forEach((item) => {
      const matches = !needle || item.dataset.searchable.includes(needle);
      item.hidden = !matches;
      if (matches) {
        visible += 1;
        if (needle) {
          item.closest('.admin-course-topic').open = true;
          item.closest('.admin-course-discipline').open = true;
        }
      }
    });
    root.querySelector('#course-map-search-result').textContent = needle ? `${visible} subtópico(s) encontrado(s).` : '';
  });
}

export async function renderAdminCurriculumScreen(root, ctx) {
  const data = await adminCurriculumService.listNodes(ctx.adminSelectedContestId);
  if (ctx.adminSelectedContestId === PC_BA_CONTEST_ID) {
    renderPcBaMap(root, data);
    return;
  }
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Fábrica · Currículo</span><h1>Edital verticalizado</h1>
      <p>Importe o JSON oficial, valide toda a árvore e grave o rascunho sem tocar em conteúdo publicado.</p></div></header>
    <section class="admin-grid admin-grid--2">
      <form id="admin-curriculum-import" class="admin-panel admin-form">
        <span class="admin-panel__eyebrow">Importação JSON</span><h2>Arquivo ou conteúdo colado</h2>
        <label>Arquivo JSON<input type="file" name="file" accept=".json,application/json"></label>
        <label>Conteúdo<textarea name="payload" rows="15" placeholder='{"schema_version":1,"contest_id":"...","roles":[]}'></textarea></label>
        <div class="admin-form__actions">
          <button class="admin-button" type="submit">Validar</button>
          <button class="admin-button admin-button--secondary" type="button" id="curriculum-import" disabled>Importar rascunho</button>
          <button class="admin-button admin-button--secondary" type="button" id="curriculum-replace" disabled>Substituir rascunho</button>
        </div>
        <div id="curriculum-validation" role="status" aria-live="polite"></div>
      </form>
      <article class="admin-panel">
        <span class="admin-panel__eyebrow">Prévia atual</span><h2>${data.rows.length} nós curriculares</h2>
        <div class="admin-curriculum-tree">${treeRows(data.rows).slice(0, 250).map((node) => `
          <div style="--depth:${node.depth}"><span>${escapeHtml(node.type)}</span><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.status || 'draft')}</small></div>`).join('')
          || '<div class="admin-prepared">Nenhum currículo cadastrado.</div>'}</div>
      </article>
    </section>`;
  const form = root.querySelector('#admin-curriculum-import');
  const output = root.querySelector('#curriculum-validation');
  const importButton = root.querySelector('#curriculum-import');
  const replaceButton = root.querySelector('#curriculum-replace');
  let validPayload = null;
  form.elements.file.addEventListener('change', async () => {
    const [file] = form.elements.file.files;
    if (!file) return;
    if (file.size > 2_000_000) {
      output.innerHTML = '<div class="admin-validation admin-validation--error">Arquivo maior que 2 MB.</div>';
      return;
    }
    form.elements.payload.value = await file.text();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      validPayload = form.elements.payload.value;
      const validation = adminCurriculumService.validateImport(validPayload, ctx.adminSelectedContestId);
      const { counts } = validation;
      output.innerHTML = `<div class="admin-validation admin-validation--ok"><strong>Estrutura válida.</strong>
        <small>${counts.roles} cargo(s), ${counts.disciplines} disciplina(s), ${counts.topics} tópico(s), ${counts.subtopics} subtópico(s).</small></div>`;
      importButton.disabled = false;
      replaceButton.disabled = false;
    } catch (error) {
      validPayload = null;
      importButton.disabled = true;
      replaceButton.disabled = true;
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  });
  const performImport = async (replace) => {
    if (!validPayload) return;
    if (replace && !globalThis.confirm?.('Substituir somente o rascunho curricular deste concurso?')) return;
    try {
      const result = await adminCurriculumService.importDraft(validPayload, ctx.adminSelectedContestId, { replace });
      output.innerHTML = `<div class="admin-validation admin-validation--ok">${result.imported} nós importados de forma transacional.</div>`;
      globalThis.__DETONA_ADMIN?.markSaved?.();
      await renderAdminCurriculumScreen(root, ctx);
    } catch (error) {
      output.innerHTML = `<div class="admin-validation admin-validation--error">${escapeHtml(error.message)}</div>`;
    }
  };
  importButton.addEventListener('click', () => performImport(false));
  replaceButton.addEventListener('click', () => performImport(true));
}
