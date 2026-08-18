import { courseFactoryStudentPreviewUrl, PC_BA_CONTEST_ID } from '../services/courseFactoryPreviewService.js';

export async function renderAdminStudentPreviewScreen(root, ctx) {
  const isPcBa = ctx.adminSelectedContestId === PC_BA_CONTEST_ID;
  root.innerHTML = `
    <header class="admin-page-header"><div><span>Course Factory · Testar como aluno</span><h1>Motor DETONA</h1>
      <p>Abra o curso no runtime real do aluno, com progresso isolado localmente e sincronização em nuvem desativada.</p></div></header>
    <section class="admin-panel admin-student-preview-card">
      <span class="admin-student-preview-card__mark" aria-hidden="true">D</span>
      <div><span class="admin-panel__eyebrow">${isPcBa ? 'PC BA · EM TESTE' : 'CURSO ATUAL'}</span><h2>${isPcBa ? 'PC BA 2026 — Investigador de Polícia Civil' : 'Curso preservado'}</h2>
        <p>${isPcBa ? 'A mesma aplicação, navegação, motor de questões, explicações e progresso do DETONA — sem página HTML paralela.' : 'O curso atual continua usando o fluxo publicado.'}</p></div>
      ${isPcBa ? `<a class="admin-button" href="${courseFactoryStudentPreviewUrl()}">VER COMO ALUNO</a>` : ''}
    </section>
    <div class="admin-prepared">Modo seguro: nenhuma conta real é impersonada e nenhum progresso deste teste é enviado ao Supabase.</div>`;
}
