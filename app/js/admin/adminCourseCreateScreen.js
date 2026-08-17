import {
  adminCourseFactoryService,
  assembleAssistedCoursePackage,
  COURSE_FACTORY_SOURCE_CATEGORIES,
} from '../services/adminCourseFactoryService.js';
import { escapeHtml } from '../ui/helpers.js';
import { courseFactoryStudentPreviewUrl } from '../services/courseFactoryPreviewService.js';

const STATUS_LABELS = Object.freeze({
  sources: 'FONTES', analyzing: 'LEGADO V2', proposed: 'LEGADO V2', analysis_failed: 'LEGADO V2',
  package_validated: 'PACOTE VALIDADO', package_imported: 'PACOTE IMPORTADO',
  validation_failed: 'PACOTE COM ERROS', map_approved: 'MAPA APROVADO',
  awaiting_upload: 'ENVIANDO', uploaded: 'ARMAZENADO', extracted: 'EXTRAÍDO', extraction_error: 'ERRO DE EXTRAÇÃO',
});

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function traceList(traces = []) {
  if (!traces.length) return '<span class="admin-trace admin-trace--human">Sem rastreabilidade</span>';
  return `<ul class="admin-trace-list">${traces.map((trace) => `<li>
    <strong>${escapeHtml(trace.source_type === 'official_edital' ? 'EDITAL OFICIAL' : 'MATERIAL COMPLEMENTAR')}</strong>
    <span>${escapeHtml(trace.source_name || trace.source_id)} · ${trace.trace_status === 'missing' ? 'RASTREABILIDADE AUSENTE' : `página ${Number(trace.page_number)}`}</span>
    ${trace.excerpt ? `<q>${escapeHtml(trace.excerpt)}</q>` : ''}${trace.location ? `<small>${escapeHtml(trace.location)}</small>` : ''}
    ${trace.note ? `<p>${escapeHtml(trace.note)}</p>` : ''}
  </li>`).join('')}</ul>`;
}

function renderSources(draft, sources, busy) {
  const official = sources.find(({ source_type: type }) => type === 'official_edital');
  const complements = sources.filter(({ source_type: type }) => type === 'complementary');
  const locked = busy || ['package_imported', 'map_approved'].includes(draft.status);
  const row = (source) => `<article class="admin-source-row">
    <span class="admin-source-row__icon" aria-hidden="true">PDF</span>
    <div><strong>${escapeHtml(source.file_name)}</strong><span>${escapeHtml(source.source_type === 'official_edital' ? 'Edital oficial' : COURSE_FACTORY_SOURCE_CATEGORIES.find(([id]) => id === source.category)?.[1] || source.category)} · ${formatBytes(source.byte_size)}</span></div>
    <b class="admin-source-status admin-source-status--${escapeHtml(source.status)}">${escapeHtml(STATUS_LABELS[source.status] || source.status)}</b>
    ${locked ? '' : `<button type="button" class="admin-button admin-button--secondary" data-remove-source="${escapeHtml(source.id)}">Remover</button>`}
  </article>`;
  return `<section class="admin-panel admin-factory-sources">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">1. Fontes</span><h2>FONTES</h2><p>Edital e materiais usados pelo ChatGPT/Codex para construir o pacote.</p></div><strong class="admin-readonly-badge">STAGING PRIVADO</strong></div>
    <div class="admin-source-upload-grid">
      <label class="admin-upload-field"><strong>Edital oficial *</strong><span>PDF obrigatório · até 20 MB</span>
        <input id="factory-official-file" type="file" accept="application/pdf,.pdf" ${official || locked ? 'disabled' : ''}>
      </label>
      <div class="admin-upload-field"><strong>Materiais complementares</strong><span>Múltiplos PDFs, com categoria explícita</span>
        <label><span class="sr-only">Categoria</span><select id="factory-complement-category" ${locked ? 'disabled' : ''}>
          ${COURSE_FACTORY_SOURCE_CATEGORIES.map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join('')}
        </select></label>
        <input id="factory-complement-files" type="file" accept="application/pdf,.pdf" multiple ${locked ? 'disabled' : ''}>
      </div>
    </div>
    <div class="admin-source-list">
      ${official ? row(official) : '<div class="admin-empty admin-empty--compact"><strong>Edital oficial ainda não enviado.</strong><span>A validação do pacote apontará essa pendência.</span></div>'}
      ${complements.map(row).join('')}
    </div>
  </section>`;
}

function reportIssues(items, tone) {
  if (!items?.length) return '';
  return `<div class="admin-factory-issues admin-factory-issues--${tone}"><strong>${tone === 'error' ? 'Erros' : 'Avisos'} (${items.length})</strong><ol>
    ${items.slice(0, 100).map((item) => `<li><code>${escapeHtml(item.code)}</code><span>${escapeHtml(item.path)}</span><p>${escapeHtml(item.message)}</p></li>`).join('')}
  </ol>${items.length > 100 ? `<p>Mais ${items.length - 100} ocorrência(s) não exibida(s).</p>` : ''}</div>`;
}

function renderValidation(report) {
  if (!report) return '<div class="admin-empty admin-empty--compact"><strong>Pacote ainda não validado.</strong><span>Carregue os JSONs e execute a validação server-side.</span></div>';
  const counts = report.counts || {};
  return `<section class="admin-factory-validation ${report.valid ? 'is-valid' : 'is-invalid'}">
    <div><strong>${report.valid ? 'PACOTE VÁLIDO' : 'PACOTE COM ERROS'}</strong><code>${escapeHtml(report.package_hash || '—')}</code></div>
    <div class="admin-factory-summary">
      <strong>${Number(counts.disciplines || 0)}<span>disciplinas</span></strong>
      <strong>${Number(counts.topics || 0)}<span>tópicos</span></strong>
      <strong>${Number(counts.subtopics || 0)}<span>subtópicos</span></strong>
      <strong>${Number(counts.microknowledges || 0)}<span>microconhecimentos</span></strong>
      <strong>${Number(counts.questions || 0)}<span>questões</span></strong>
    </div>
    ${reportIssues(report.errors, 'error')}${reportIssues(report.warnings, 'warning')}
  </section>`;
}

function renderPackagePanel(draft, pendingPackage, report, busy) {
  const locked = draft.status === 'map_approved';
  const effectiveReport = report || (draft.validation_report?.valid != null ? draft.validation_report : null);
  return `<section class="admin-panel admin-factory-package">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">2. Importação assistida</span><h2>PACOTE DO CURSO</h2><p>Produzido externamente por ChatGPT/Codex e validado dentro do DETONA.</p></div><strong class="admin-readonly-badge">IA AUTOMÁTICA: DESATIVADA</strong></div>
    <div class="admin-prepared">OPENAI_API_KEY não é necessária · nenhuma chamada paga de IA · contrato genérico schema_version 1.</div>
    <div class="admin-source-upload-grid">
      <label class="admin-upload-field"><strong>Pacote JSON único</strong><span>Estrutura canônica completa</span>
        <input id="factory-package-files" type="file" accept="application/json,.json" multiple ${locked || busy ? 'disabled' : ''}>
      </label>
      <label class="admin-upload-field"><strong>Pasta estruturada</strong><span>course.json, curriculum.json, edital-map.json, microknowledge.json, sources.json e questions/*.json</span>
        <input id="factory-package-folder" type="file" accept="application/json,.json" webkitdirectory multiple ${locked || busy ? 'disabled' : ''}>
      </label>
    </div>
    <label class="admin-factory-json"><span>Ou cole o pacote canônico JSON</span><textarea id="factory-package-json" rows="10" placeholder='{"schema_version":1,"operation_id":"...","course":{...}}' ${locked || busy ? 'disabled' : ''}></textarea></label>
    <div class="admin-form__actions">
      <button type="button" class="admin-button admin-button--secondary" id="factory-load-json" ${locked || busy ? 'disabled' : ''}>CARREGAR JSON COLADO</button>
      <button type="button" class="admin-button admin-button--secondary" id="factory-validate" ${!pendingPackage || locked || busy ? 'disabled' : ''}>VALIDAR PACOTE</button>
      <button type="button" class="admin-button" id="factory-import" ${!pendingPackage || !report?.valid || locked || busy ? 'disabled' : ''}>IMPORTAR PACOTE</button>
    </div>
    ${pendingPackage ? `<div class="admin-factory-package-ready"><strong>Pacote carregado localmente</strong><span>${escapeHtml(pendingPackage.operation_id || 'operation_id ausente')}</span></div>` : ''}
    ${renderValidation(effectiveReport)}
  </section>`;
}

function renderIdentity(draft) {
  const identity = draft.identity || {};
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">3. Identificação</span><h2>${escapeHtml(identity.contest_name || 'Curso importado')}</h2></div><strong class="admin-readonly-badge">PACOTE ASSISTIDO</strong></div>
    <dl class="admin-course-identity">
      ${[
    ['contest_id', identity.contest_id], ['position_id', identity.position_id], ['offering_id', identity.offering_id],
    ['Órgão', identity.organization], ['Cargo', identity.position], ['Banca', identity.board || '—'],
    ['Ano', identity.year || '—'], ['Data', identity.exam_date || '—'],
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value || '—')}</code></dd></div>`).join('')}
    </dl>
  </section>`;
}

function renderCurriculum(draft) {
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">4. Currículo</span><h2>Currículo importado</h2></div></div>
    <div class="admin-factory-tree">${(draft.curriculum || []).map((discipline, d) => `<details class="admin-factory-discipline" ${d === 0 ? 'open' : ''}>
      <summary><span>${d + 1}</span><strong>${escapeHtml(discipline.title)}</strong><small>${discipline.topics?.length || 0} tópicos</small></summary>
      <details class="admin-trace-details"><summary>Rastreabilidade da disciplina</summary>${traceList(discipline.traces)}</details>
      <div class="admin-factory-topic-list">${(discipline.topics || []).map((topic, t) => `<details class="admin-factory-topic">
        <summary><span>${d + 1}.${t + 1}</span><strong>${escapeHtml(topic.title)}</strong><small>${topic.subtopics?.length || 0} subtópicos</small></summary>
        <details class="admin-trace-details"><summary>Rastreabilidade do tópico</summary>${traceList(topic.traces)}</details>
        <div class="admin-factory-subtopic-list">${(topic.subtopics || []).map((subtopic) => `<article class="admin-factory-subtopic"><strong>${escapeHtml(subtopic.title)}</strong>
          <details class="admin-trace-details"><summary>Fonte do subtópico</summary>${traceList(subtopic.traces)}</details></article>`).join('')}</div>
      </details>`).join('')}</div>
    </details>`).join('')}</div>
  </section>`;
}

function renderMap(draft) {
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">5. Mapa do Edital</span><h2>Cadeia curricular e conhecimentos</h2><p>Edital → disciplina → tópico → subtópico → microconhecimento → questão.</p></div></div>
    <div class="admin-factory-map">${(draft.edital_map || []).map((item, index) => `<details class="admin-factory-map-item">
      <summary><span>${index + 1}</span><strong>${escapeHtml(item.subtopic_title)}</strong><small>${item.microknowledges?.length || 0} microconhecimentos</small></summary>
      <div class="admin-factory-map-path">${escapeHtml(item.discipline_title)} → ${escapeHtml(item.topic_title)} → ${escapeHtml(item.subtopic_title)}</div>
      <p class="admin-factory-scope">${escapeHtml(item.scope)}</p>
      <div class="admin-microknowledge-list">${(item.microknowledges || []).map((knowledge) => `<article>
        <strong>${escapeHtml(knowledge.title)}</strong><span class="admin-source-status">${escapeHtml(knowledge.scope_origin === 'official' ? 'ESCOPO OFICIAL' : 'COMPLEMENTAR')}</span>
        <details class="admin-trace-details"><summary>Rastreabilidade</summary>${traceList(knowledge.traces)}</details>
      </article>`).join('')}</div>
      <details class="admin-trace-details"><summary>Rastreabilidade do mapa</summary>${traceList(item.traces)}</details>
    </details>`).join('')}</div>
  </section>`;
}

function renderCoverage(draft) {
  const coverage = draft.coverage || {};
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">6. Cobertura</span><h2>Cobertura calculada</h2></div></div>
    <div class="admin-factory-summary">
      <strong>${Number(coverage.edital_map_pct || 0)}%<span>Mapa do Edital</span></strong>
      <strong>${Number(coverage.microknowledge_question_pct || 0)}%<span>Microconhecimentos com questão</span></strong>
      <strong>${Number(coverage.subtopic_question_pct || 0)}%<span>Subtópicos com questão</span></strong>
      <strong>${Number(coverage.questions_total || draft.question_count || 0)}<span>Questões no rascunho</span></strong>
    </div>
  </section>`;
}

function renderQuestions(draft, samples) {
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">7. Banco</span><h2>Questões importadas no rascunho</h2></div><strong class="admin-readonly-badge">${Number(draft.question_count || 0)} QUESTÕES</strong></div>
    <div class="admin-question-sample-list">${samples.length ? samples.map((row, index) => `<article><span>${index + 1}</span><div><strong>${escapeHtml(row.payload?.statement || row.source_question_id)}</strong>
      <small>${escapeHtml(row.subtopic_id)} · ${escapeHtml(row.batch_name)}</small><p>${escapeHtml(row.payload?.explanation || '')}</p></div></article>`).join('') : '<div class="admin-empty admin-empty--compact"><strong>Sem questões neste pacote.</strong><span>A cobertura permanece calculada e o banco pode entrar em pacote posterior.</span></div>'}</div>
  </section>`;
}

function renderAudit(events) {
  return `<section class="admin-panel">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">8. Auditoria</span><h2>Histórico imutável do rascunho</h2></div></div>
    <div class="admin-course-stage-list">${events.length ? events.map((event) => `<article class="admin-course-stage admin-course-stage--ok"><span>✓</span><strong>${escapeHtml(event.action === 'package_imported' ? 'PACOTE IMPORTADO' : 'MAPA APROVADO')}</strong><small>${new Date(event.created_at).toLocaleString('pt-BR')} · ${escapeHtml((event.package_hash || '').slice(0, 12))}</small></article>`).join('') : '<div class="admin-empty admin-empty--compact"><strong>Nenhum evento persistido.</strong></div>'}</div>
  </section>`;
}

function renderStudentPreview(draft, samples) {
  const first = samples[0]?.payload;
  return `<section class="admin-panel admin-student-preview-card">
    <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Prévia do aluno</span><h2>${escapeHtml(draft.identity?.contest_name || 'Curso')}</h2><p>${escapeHtml(draft.identity?.position || '')}</p></div><strong class="admin-readonly-badge">NÃO PUBLICADO</strong></div>
    <div class="admin-factory-summary"><strong>${draft.curriculum?.length || 0}<span>disciplinas</span></strong><strong>${draft.question_count || 0}<span>questões</span></strong></div>
    ${first ? `<article class="admin-preview-question"><span>Questão de amostra</span><h3>${escapeHtml(first.statement)}</h3><ul>${(first.options || []).map((option) => `<li>${escapeHtml(typeof option === 'string' ? option : `${option.label || ''} ${option.text || ''}`)}</li>`).join('')}</ul></article>` : ''}
  </section>`;
}

function renderApproval(draft) {
  if (draft.status === 'map_approved') return '<section class="admin-panel admin-factory-approval"><div><span class="admin-panel__eyebrow">9. Homologação</span><h2>MAPA APROVADO</h2><p>Preparado para a etapa futura de publicação. Nenhum conteúdo foi publicado.</p></div></section>';
  return `<section class="admin-panel admin-factory-approval"><div><span class="admin-panel__eyebrow">9. Homologação</span><h2>Aprovação humana</h2><p>A aprovação não publica curso, questões ou acesso.</p></div>
    <button type="button" class="admin-button" id="factory-approve">APROVAR MAPA</button></section>`;
}

export async function renderAdminCourseCreateScreen(root, ctx, { draftId = null, createNew = false } = {}) {
  root.innerHTML = '<div class="admin-loading" role="status">Preparando rascunho assistido…</div>';
  let capabilities;
  let envelope;
  try {
    capabilities = await adminCourseFactoryService.capabilities();
    envelope = createNew || !draftId ? await adminCourseFactoryService.createDraft() : await adminCourseFactoryService.getDraft(draftId);
  } catch (error) {
    root.innerHTML = `<section class="admin-panel admin-empty"><h1>Novo curso</h1><div class="admin-alert" role="alert">${escapeHtml(error.message)}</div><button type="button" class="admin-button admin-button--secondary" id="factory-back">Voltar</button></section>`;
    root.querySelector('#factory-back')?.addEventListener('click', () => globalThis.__DETONA_ADMIN?.navigate?.('contests'));
    return;
  }
  let draft = structuredClone(envelope.draft);
  let sources = structuredClone(envelope.sources || []);
  let questionSamples = structuredClone(envelope.question_samples || []);
  let auditEvents = structuredClone(envelope.audit_events || []);
  let pendingPackage = null;
  let validationReport = null;
  let busy = false;
  let feedback = '';

  const setEnvelope = (next) => {
    envelope = next;
    draft = structuredClone(next.draft);
    sources = structuredClone(next.sources || []);
    questionSamples = structuredClone(next.question_samples || []);
    auditEvents = structuredClone(next.audit_events || []);
  };
  const refresh = async () => setEnvelope(await adminCourseFactoryService.getDraft(draft.id));

  const draw = () => {
    const imported = ['package_imported', 'map_approved'].includes(draft.status);
    root.innerHTML = `<header class="admin-page-header admin-page-header--courses"><div><span>Course Factory · Modo assistido</span><h1>Novo curso</h1>
      <p>Fontes → pacote ChatGPT/Codex → validação → currículo → mapa → banco → cobertura → auditoria.</p></div><button type="button" class="admin-button admin-button--secondary" id="factory-back">← Cursos</button></header>
      <section class="admin-factory-draft-bar"><div><span>course_draft_id</span><code>${escapeHtml(draft.id)}</code></div><strong>${escapeHtml(STATUS_LABELS[draft.status] || draft.status)}</strong><span>Revisão ${Number(draft.revision || 0)}</span></section>
      <div class="admin-factory-mode-banner"><strong>IA AUTOMÁTICA: DESATIVADA</strong><span>Fluxo oficial: proprietário → ChatGPT/Codex → pacote estruturado → Course Factory.</span></div>
      ${feedback ? `<div class="${feedback.startsWith('Erro:') ? 'admin-alert' : 'admin-prepared'}" role="status">${escapeHtml(feedback)}</div>` : ''}
      ${renderSources(draft, sources, busy)}
      ${renderPackagePanel(draft, pendingPackage, validationReport, busy)}
      ${imported ? `<div class="admin-form__actions"><a class="admin-button admin-button--secondary" href="${courseFactoryStudentPreviewUrl({ contestId: draft.identity.contest_id, draftId: draft.id })}">VER COMO ALUNO</a></div>
        ${renderIdentity(draft) + renderCurriculum(draft) + renderMap(draft) + renderQuestions(draft, questionSamples) + renderCoverage(draft) + renderAudit(auditEvents) + renderApproval(draft)}` : '<section class="admin-panel admin-empty"><h2>Aguardando pacote válido</h2><p>Os dados do curso só serão persistidos após validação server-side sem erros.</p></section>'}`;
    bind();
  };

  const run = async (message, operation) => {
    if (busy) return;
    busy = true; feedback = message; draw();
    try { await operation(); } catch (error) {
      validationReport = error.report || validationReport;
      feedback = `Erro: ${error.message || 'Operação indisponível.'}`;
    } finally { busy = false; draw(); }
  };
  const uploadFiles = async (files, settings) => {
    for (const file of files) {
      feedback = `Enviando ${file.name}…`; draw();
      await adminCourseFactoryService.uploadSource(draft.id, file, settings);
    }
    await refresh(); feedback = `${files.length} PDF(s) armazenado(s) no staging.`;
  };
  const loadFiles = async (files) => {
    pendingPackage = await assembleAssistedCoursePackage(files);
    validationReport = null;
    feedback = `Pacote ${pendingPackage.operation_id || 'sem operation_id'} carregado. Execute a validação.`;
    globalThis.__DETONA_ADMIN?.markDirty?.();
  };

  function bind() {
    root.querySelector('#factory-back')?.addEventListener('click', () => globalThis.__DETONA_ADMIN?.navigate?.('contests'));
    root.querySelector('#factory-official-file')?.addEventListener('change', (event) => run('Enviando edital…', () => uploadFiles([...event.target.files], { sourceType: 'official_edital', category: 'edital' })));
    root.querySelector('#factory-complement-files')?.addEventListener('change', (event) => run('Enviando materiais…', () => uploadFiles([...event.target.files], { sourceType: 'complementary', category: root.querySelector('#factory-complement-category').value })));
    root.querySelectorAll('[data-remove-source]').forEach((button) => button.addEventListener('click', () => run('Removendo fonte…', async () => {
      await adminCourseFactoryService.removeSource(draft.id, button.dataset.removeSource); await refresh(); feedback = 'Fonte removida.';
    })));
    for (const id of ['factory-package-files', 'factory-package-folder']) root.querySelector(`#${id}`)?.addEventListener('change', (event) => run('Lendo pacote…', () => loadFiles(event.target.files)));
    root.querySelector('#factory-load-json')?.addEventListener('click', () => run('Lendo JSON…', async () => {
      try { pendingPackage = JSON.parse(root.querySelector('#factory-package-json').value); } catch { throw new Error('O texto colado não contém JSON válido.'); }
      validationReport = null; feedback = `Pacote ${pendingPackage.operation_id || 'sem operation_id'} carregado.`; globalThis.__DETONA_ADMIN?.markDirty?.();
    }));
    root.querySelector('#factory-validate')?.addEventListener('click', () => run('Validando contrato, vínculos, rastreabilidade e cobertura…', async () => {
      validationReport = await adminCourseFactoryService.validatePackage(draft.id, pendingPackage);
      feedback = validationReport.valid ? 'Pacote válido. A importação foi liberada.' : `Validação encontrou ${validationReport.errors.length} erro(s).`;
    }));
    root.querySelector('#factory-import')?.addEventListener('click', () => run('Importando pacote validado no rascunho privado…', async () => {
      setEnvelope(await adminCourseFactoryService.importPackage(draft.id, pendingPackage));
      validationReport = draft.validation_report; feedback = 'Pacote importado e auditado. Nenhum conteúdo foi publicado.';
      globalThis.__DETONA_ADMIN?.markSaved?.();
    }));
    root.querySelector('#factory-approve')?.addEventListener('click', () => {
      if (!globalThis.confirm?.('Aprovar este Mapa do Edital? Isso não publica o curso nem as questões.')) return;
      run('Aprovando mapa…', async () => {
        await adminCourseFactoryService.approveMap(draft.id); await refresh(); feedback = 'MAPA APROVADO. Publicação continua bloqueada.'; globalThis.__DETONA_ADMIN?.markSaved?.();
      });
    });
  }
  if (capabilities.automaticAI !== false || capabilities.openAIKeyRequired !== false) feedback = 'Erro: configuração assistida inconsistente.';
  draw();
}

export function renderCourseFactoryDraftCards(drafts = []) {
  if (!drafts.length) return '';
  return `<section class="admin-panel admin-factory-resume"><div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">Rascunhos persistentes</span><h2>Continuar criação</h2></div></div>
    <div class="admin-course-draft-list">${drafts.map((draft) => `<button type="button" data-resume-draft="${escapeHtml(draft.id)}"><span><strong>${escapeHtml(draft.identity?.contest_name || 'Novo curso')}</strong><small>${escapeHtml(draft.identity?.position || draft.id)}</small></span><b>${escapeHtml(STATUS_LABELS[draft.status] || draft.status)}</b></button>`).join('')}</div></section>`;
}
