import { courseFactoryStudentPreviewUrl, PC_BA_CONTEST_ID } from '../services/courseFactoryPreviewService.js';
import { escapeHtml } from '../ui/helpers.js';

const STATUS_COPY = Object.freeze({
  ready: 'ATIVO',
  preparing: 'EM PREPARAÇÃO',
  draft: 'RASCUNHO',
  archived: 'ARQUIVADO',
});

function stageRows(contest) {
  const pcBa = contest.id === PC_BA_CONTEST_ID;
  return [
    ['IDENTIFICAÇÃO', 'ok', 'Concluída'],
    ['MAPA DO EDITAL', pcBa ? 'ok' : 'ok', 'Concluído'],
    ['BANCO DE QUESTÕES', pcBa ? 'warning' : 'ok', pcBa ? 'Em validação' : 'Operacional'],
    ['AUDITORIA', pcBa ? 'warning' : 'ok', pcBa ? 'Em teste' : 'Operacional'],
    ['TESTAR COMO ALUNO', pcBa ? 'pending' : 'ok', pcBa ? 'Disponível no Preview' : 'Operacional'],
    ['PUBLICAÇÃO', pcBa ? 'blocked' : 'ok', pcBa ? 'BLOQUEADA' : 'Publicado'],
  ];
}

export async function renderAdminCoursesScreen(root, ctx) {
  const courses = ctx.availableContests.filter(({ id }) => id === 'pc_al_2026' || id === PC_BA_CONTEST_ID);
  const selected = courses.find(({ id }) => id === ctx.adminSelectedContestId) || courses[0];
  root.innerHTML = `
    <header class="admin-page-header admin-page-header--courses"><div><span>Área ADM · Course Factory</span><h1>Cursos</h1>
      <p>Administração e provisionamento sobre o motor DETONA existente.</p></div>
      <button class="admin-button" id="course-factory-new" type="button">+ CRIAR NOVO CURSO</button>
    </header>
    <section class="admin-course-list" aria-label="Cursos conhecidos">
      ${courses.map((course) => {
    const active = course.id === selected?.id;
    const status = course.id === PC_BA_CONTEST_ID ? 'EM TESTE' : (STATUS_COPY[course.content_status] || course.content_status);
    return `<button type="button" class="admin-course-card ${active ? 'active' : ''}" data-select-course="${escapeHtml(course.id)}">
          <span class="admin-course-card__icon" style="--course-color:${escapeHtml(course.color)};--course-accent:${escapeHtml(course.accent)}">${escapeHtml(course.icon)}</span>
          <span><small>${escapeHtml(course.code)}</small><strong>${escapeHtml(course.name)}</strong><em>${escapeHtml(course.role)}</em></span>
          <b class="admin-course-status admin-course-status--${course.id === PC_BA_CONTEST_ID ? 'test' : 'active'}">${escapeHtml(status)}</b>
        </button>`;
  }).join('')}
    </section>
    <section class="admin-panel admin-course-identification">
      <div class="admin-panel-heading"><div><span class="admin-panel__eyebrow">1. Identificação</span><h2>${escapeHtml(selected.name)}</h2></div>
        <strong class="admin-readonly-badge">${selected.id === PC_BA_CONTEST_ID ? 'EM TESTE · NÃO PUBLICADO' : 'PRESERVADO'}</strong></div>
      <dl class="admin-course-identity">
        <div><dt>contest_id</dt><dd><code>${escapeHtml(selected.id)}</code></dd></div>
        <div><dt>position_id</dt><dd><code>${escapeHtml(selected.position_id || (selected.id === 'pc_al_2026' ? 'role_pc_al' : '—'))}</code></dd></div>
        <div><dt>offering_id</dt><dd><code>${escapeHtml(selected.offering_id || (selected.id === 'pc_al_2026' ? 'pc_al_2026' : '—'))}</code></dd></div>
        <div><dt>Data da prova</dt><dd>${selected.exam_date ? new Date(`${selected.exam_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</dd></div>
      </dl>
      <div class="admin-course-stage-list">${stageRows(selected).map(([label, state, copy]) => `
        <article class="admin-course-stage admin-course-stage--${state}"><span aria-hidden="true">${state === 'ok' ? '✓' : state === 'warning' ? '!' : state === 'blocked' ? '×' : '…'}</span><strong>${label}</strong><small>${copy}</small></article>`).join('')}</div>
      ${selected.id === PC_BA_CONTEST_ID ? `<div class="admin-form__actions">
        <button class="admin-button" type="button" data-course-screen="curriculum">Abrir Mapa do Edital</button>
        <a class="admin-button admin-button--secondary" href="${courseFactoryStudentPreviewUrl()}">VER COMO ALUNO</a>
      </div>` : ''}
    </section>
    <section class="admin-panel admin-course-factory-new" id="course-factory-new-panel" hidden>
      <span class="admin-panel__eyebrow">Estrutura inicial</span><h2>Novo curso</h2>
      <p>A fundação está pronta para receber identificação, mapa do edital, banco de questões, auditoria, teste como aluno e publicação.</p>
      <div class="admin-prepared">Criação persistente permanece desabilitada nesta etapa. Nenhum dado será gravado no Supabase.</div>
    </section>`;
  root.querySelector('#course-factory-new').addEventListener('click', () => {
    const panel = root.querySelector('#course-factory-new-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  root.querySelectorAll('[data-select-course]').forEach((button) => button.addEventListener('click', async () => {
    await globalThis.__DETONA_ADMIN?.selectContest?.(button.dataset.selectCourse);
  }));
  root.querySelectorAll('[data-course-screen]').forEach((button) => button.addEventListener('click', () => {
    globalThis.__DETONA_ADMIN?.navigate?.(button.dataset.courseScreen);
  }));
}
