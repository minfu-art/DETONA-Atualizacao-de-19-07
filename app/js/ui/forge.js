import { $, closeModal, escapeAttr, escapeHtml, openModal, toast } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { MIN_QUESTIONS_BATTLE, getQuestionCounts } from '../core/ssot.js';
import { SFX } from '../core/audio.js';
import { parseImportPayload, forgeQuestionsFromItems } from '../core/questionImport.js';
import { isDeveloperUser } from '../auth/authService.js';
import { emptyState } from './components.js';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_ROUTES,
  announcementService,
  validateAnnouncementInput,
} from '../services/announcementService.js';
import {
  ANNOUNCEMENT_CATEGORY_LABELS,
  officialMentorHtml,
} from './mentorCommunication.js';
import {
  ANNOUNCEMENT_TEMPLATES,
  announcementFromTemplate,
} from '../data/announcementTemplates.js';
import {
  ADMIN_CONTEST_ID,
  adminAccessService,
} from '../services/adminAccessService.js';

/**
 * Banco de questões — ingestão e gestão editorial
 */
export async function renderForge(root, navigate, ctx = {}) {
  if (!isDeveloperUser(ctx.user)) {
    root.innerHTML = emptyState({
      title: 'Área restrita',
      description: 'A criação e a importação de questões são exclusivas da equipe de desenvolvimento.',
      action: '<button type="button" class="btn btn-primary" id="forge-home">Voltar para Hoje</button>',
    });
    $('#forge-home', root)?.addEventListener('click', () => navigate('home'));
    return;
  }

  const [disciplines, subtopics] = await Promise.all([
    progressRepository.getAll(STORES.disciplines),
    progressRepository.getAll(STORES.subtopics),
  ]);
  disciplines.sort((a, b) => a.order - b.order);
  let tab = 'manual';
  let filterDisc = '';

  async function paint() {
    const counts = await getQuestionCounts();
    const totalQ = Object.values(counts).reduce((a, b) => a + b, 0);
    const disarmed = subtopics.filter((s) => (counts[s.id] || 0) < MIN_QUESTIONS_BATTLE).length;

    root.innerHTML = `
      <div class="ro-window mb-8">
        <div class="ro-title">Central de questões</div>
        <div class="ro-body">
          <p class="muted mb-8">${totalQ} questões disponíveis · ${disarmed} subtópicos precisam de mais questões para liberar sessões</p>
          <div class="tabs">
            <button type="button" class="tab ${tab === 'manual' ? 'active' : ''}" data-t="manual">Nova questão</button>
            <button type="button" class="tab ${tab === 'import' ? 'active' : ''}" data-t="import">Importar</button>
            <button type="button" class="tab ${tab === 'panel' ? 'active' : ''}" data-t="panel">Banco atual</button>
            <button type="button" class="tab ${tab === 'announcements' ? 'active' : ''}" data-t="announcements">Avisos</button>
            <button type="button" class="tab ${tab === 'access' ? 'active' : ''}" data-t="access">Alunos e acessos</button>
          </div>
          <div id="forge-body"></div>
        </div>
      </div>
    `;

    root.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        SFX.click();
        tab = t.dataset.t;
        paint();
      });
    });

    const body = $('#forge-body', root);
    if (tab === 'manual') renderManual(body, disciplines, subtopics);
    else if (tab === 'import') renderImport(body, subtopics);
    else if (tab === 'announcements') await renderAnnouncements(body);
    else if (tab === 'access') await renderAdminAccess(body, ctx);
    else renderPanel(body, disciplines, subtopics, counts, filterDisc, (fd) => {
      filterDisc = fd;
      paint();
    });
  }

  await paint();
}

export function adminAccessState(entitlement) {
  if (entitlement?.status === 'active') {
    return { label: 'Ativo', className: 'ok', action: 'revoke', actionLabel: 'Revogar' };
  }
  if (entitlement?.status === 'revoked') {
    return { label: 'Revogado', className: 'warn', action: 'reactivate', actionLabel: 'Reativar' };
  }
  return { label: 'Sem acesso', className: 'muted', action: 'grant', actionLabel: 'Conceder' };
}

function adminAccessDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function adminUserCard(user) {
  const state = adminAccessState(user.entitlement);
  return `
    <article class="admin-access-card" data-admin-user="${escapeAttr(user.userId)}">
      <div class="admin-access-card__identity">
        <strong>${escapeHtml(user.name || 'Aluno sem nome')}</strong>
        <span>${escapeHtml(user.email || 'E-mail indisponível')}</span>
      </div>
      <div class="admin-access-card__status">
        <span class="badge ${state.className}">${state.label}</span>
        <small>Concedido em: ${escapeHtml(adminAccessDate(user.entitlement?.grantedAt))}</small>
      </div>
      <button
        type="button"
        class="btn ${state.action === 'revoke' ? 'btn-secondary' : 'btn-primary'} admin-access-card__action"
        data-access-action="${state.action}"
        aria-label="${state.actionLabel} acesso de ${escapeAttr(user.name || 'aluno')} ao PC/AL"
      >${state.actionLabel}</button>
    </article>
  `;
}

function confirmAccessRevocation(user) {
  return new Promise((resolve) => {
    const modal = openModal(
      'Revogar acesso ao PC/AL',
      `<p>Confirma a revogação do acesso de <strong>${escapeHtml(user.name || 'este aluno')}</strong>?</p>
       <p class="muted mt-8">O progresso acadêmico será preservado e reaparecerá se o acesso for reativado.</p>`,
      `<button type="button" class="btn btn-secondary" id="admin-revoke-cancel">Cancelar</button>
       <button type="button" class="btn btn-primary" id="admin-revoke-confirm">Confirmar revogação</button>`,
    );
    let settled = false;
    let onEscape = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (onEscape) document.removeEventListener('keydown', onEscape);
      closeModal();
      resolve(value);
    };
    $('#admin-revoke-cancel', modal)?.addEventListener('click', () => finish(false));
    $('#admin-revoke-confirm', modal)?.addEventListener('click', () => finish(true));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) finish(false);
    });
    onEscape = (event) => {
      if (event.key !== 'Escape') return;
      finish(false);
    };
    document.addEventListener('keydown', onEscape);
  });
}

export async function renderAdminAccess(body, ctx = {}) {
  if (!isDeveloperUser(ctx.user)) {
    body.innerHTML = '<p class="muted" role="alert">Área restrita à equipe autorizada.</p>';
    return;
  }

  let page = 1;
  const pageSize = 20;
  let search = '';

  body.innerHTML = `
    <section class="admin-access" aria-labelledby="admin-access-title">
      <div class="admin-access__header">
        <div>
          <h3 id="admin-access-title">Alunos e acessos</h3>
          <p class="muted">Gerencie somente o acesso ao concurso PC/AL. Nenhum progresso é removido.</p>
        </div>
        <form id="admin-access-search" class="admin-access__search" role="search">
          <label class="sr-only" for="admin-access-query">Pesquisar por nome ou e-mail</label>
          <input id="admin-access-query" type="search" maxlength="100" placeholder="Nome ou e-mail" autocomplete="off" />
          <button type="submit" class="btn btn-primary">Pesquisar</button>
        </form>
      </div>
      <div id="admin-access-feedback" class="muted" role="status" aria-live="polite"></div>
      <div id="admin-access-list" class="admin-access__list"></div>
      <nav id="admin-access-pagination" class="admin-access__pagination" aria-label="Paginação de alunos"></nav>
    </section>
  `;

  const list = $('#admin-access-list', body);
  const feedback = $('#admin-access-feedback', body);
  const pagination = $('#admin-access-pagination', body);

  async function loadUsers() {
    feedback.textContent = 'Carregando alunos...';
    feedback.setAttribute('role', 'status');
    list.innerHTML = '';
    pagination.innerHTML = '';
    try {
      const result = await adminAccessService.listUsers({ search, page, pageSize });
      const users = Array.isArray(result?.users) ? result.users : [];
      const total = Number(result?.total || 0);
      feedback.textContent = users.length
        ? `${total} aluno${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`
        : 'Nenhum aluno encontrado.';
      list.innerHTML = users.map(adminUserCard).join('');

      const pages = Math.max(1, Math.ceil(total / pageSize));
      pagination.innerHTML = `
        <button type="button" class="btn btn-secondary" id="admin-page-prev" ${page <= 1 ? 'disabled' : ''} aria-label="Página anterior">Anterior</button>
        <span>Página ${page} de ${pages}</span>
        <button type="button" class="btn btn-secondary" id="admin-page-next" ${page >= pages ? 'disabled' : ''} aria-label="Próxima página">Próxima</button>
      `;
      $('#admin-page-prev', pagination)?.addEventListener('click', () => {
        page -= 1;
        loadUsers();
      });
      $('#admin-page-next', pagination)?.addEventListener('click', () => {
        page += 1;
        loadUsers();
      });

      list.querySelectorAll('[data-admin-user]').forEach((card) => {
        const user = users.find((item) => item.userId === card.dataset.adminUser);
        const button = $('[data-access-action]', card);
        if (!user || !button) return;
        button.addEventListener('click', async () => {
          const action = button.dataset.accessAction;
          if (action === 'revoke' && !(await confirmAccessRevocation(user))) return;
          button.disabled = true;
          feedback.textContent = 'Atualizando acesso...';
          try {
            if (action === 'grant') {
              await adminAccessService.grantAccess(user.userId, ADMIN_CONTEST_ID);
            } else if (action === 'reactivate') {
              await adminAccessService.reactivateAccess(user.userId, ADMIN_CONTEST_ID);
            } else {
              await adminAccessService.revokeAccess(user.userId, ADMIN_CONTEST_ID);
            }
            toast('Acesso atualizado com segurança.');
            await loadUsers();
          } catch (error) {
            feedback.textContent = error?.message || 'Não foi possível atualizar o acesso.';
            feedback.setAttribute('role', 'alert');
            button.disabled = false;
          }
        });
      });
    } catch (error) {
      feedback.textContent = error?.message || 'Não foi possível carregar os alunos.';
      feedback.setAttribute('role', 'alert');
    }
  }

  $('#admin-access-search', body)?.addEventListener('submit', (event) => {
    event.preventDefault();
    search = $('#admin-access-query', body)?.value?.trim() || '';
    page = 1;
    loadUsers();
  });

  await loadUsers();
}

function renderManual(body, disciplines, subtopics) {
  body.innerHTML = `
    <div class="field">
      <label>Disciplina</label>
      <select id="f-disc">
        <option value="">— selecione —</option>
        ${disciplines.map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Subtópico do Edital</label>
      <select id="f-sub" disabled><option value="">— selecione disciplina —</option></select>
    </div>
    <div class="field">
      <label>Formato</label>
      <select id="f-fmt">
        <option value="certo_errado">Certo / Errado (CEBRASPE)</option>
        <option value="multipla_escolha">Múltipla Escolha</option>
      </select>
    </div>
    <div class="field">
      <label>Enunciado</label>
      <textarea id="f-stmt" placeholder="Cole o enunciado da questão..."></textarea>
    </div>
    <div id="f-opts-wrap" class="hidden">
      <div class="field"><label>Opção A</label><input id="f-oa" /></div>
      <div class="field"><label>Opção B</label><input id="f-ob" /></div>
      <div class="field"><label>Opção C</label><input id="f-oc" /></div>
      <div class="field"><label>Opção D</label><input id="f-od" /></div>
      <div class="field"><label>Opção E (opcional)</label><input id="f-oe" /></div>
    </div>
    <div class="field">
      <label>Resposta Correta</label>
      <select id="f-ans">
        <option value="true">Certo</option>
        <option value="false">Errado</option>
      </select>
    </div>
    <div class="field">
      <label>Explicação / Resolução</label>
      <textarea id="f-exp" placeholder="Justificativa da resposta..."></textarea>
    </div>
    <button type="button" class="btn btn-primary btn-block" id="f-save">Salvar questão</button>
  `;

  const discSel = $('#f-disc', body);
  const subSel = $('#f-sub', body);
  const fmtSel = $('#f-fmt', body);
  const ansSel = $('#f-ans', body);

  discSel.addEventListener('change', () => {
    const id = discSel.value;
    const list = subtopics.filter((s) => s.discipline_id === id);
    subSel.disabled = !id;
    subSel.innerHTML = list.length
      ? list.map((s) => `<option value="${s.id}">${s.edital_numbering} — ${s.name.slice(0, 50)}</option>`).join('')
      : '<option value="">—</option>';
  });

  fmtSel.addEventListener('change', () => {
    const me = fmtSel.value === 'multipla_escolha';
    $('#f-opts-wrap', body).classList.toggle('hidden', !me);
    if (me) {
      ansSel.innerHTML = 'ABCDE'.split('').map((l) => `<option value="${l}">${l}</option>`).join('');
    } else {
      ansSel.innerHTML = `
        <option value="true">Certo</option>
        <option value="false">Errado</option>
      `;
    }
  });

  $('#f-save', body).addEventListener('click', async () => {
    const subtopic_id = subSel.value;
    const statement = $('#f-stmt', body).value.trim();
    const explanation = $('#f-exp', body).value.trim();
    const format = fmtSel.value;
    if (!subtopic_id || !statement) {
      toast('Preencha subtópico e enunciado!');
      return;
    }

    let options = ['Certo', 'Errado'];
    let correct_answer = ansSel.value === 'true';
    if (format === 'multipla_escolha') {
      options = ['A', 'B', 'C', 'D', 'E']
        .map((l, i) => {
          const v = $(`#f-o${'abcde'[i]}`, body)?.value?.trim();
          return v ? `${l}) ${v}` : null;
        })
        .filter(Boolean);
      correct_answer = ansSel.value;
      if (options.length < 2) {
        toast('Informe ao menos 2 opções');
        return;
      }
    } else {
      correct_answer = ansSel.value === 'true';
    }

    const q = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      subtopic_id,
      format,
      statement,
      options,
      correct_answer,
      explanation: explanation || 'Sem resolução cadastrada.',
      is_user_created: true,
      created_at: new Date().toISOString(),
    };
    await progressRepository.put(STORES.questions, q);
    SFX.forge();
    toast('Questão salva com sucesso.');
    $('#f-stmt', body).value = '';
    $('#f-exp', body).value = '';
  });
}

function renderImport(body, subtopics) {
  const idHint = subtopics.slice(0, 3).map((s) => s.id).join(', ');
  body.innerHTML = `
    <p class="muted mb-8">Cole JSON/CSV ou envie o arquivo <strong>questoes_pc_al_importadas.json</strong>. O app mapeia subtópicos de Português automaticamente.</p>
    <p class="muted mb-8">IDs nativos de exemplo: <code style="color:var(--neon-hi);font-size:11px">${idHint}</code></p>
    <div class="field">
      <label>JSON / CSV</label>
      <textarea id="imp-text" style="min-height:160px" placeholder='[{"subtopic_id":"port_3","format":"certo_errado","statement":"...","correct_answer":true,"explanation":"..."}]'></textarea>
    </div>
    <div class="field">
      <label>Ou upload de arquivo (.json / .csv)</label>
      <input type="file" id="imp-file" accept=".json,.csv,.txt" />
    </div>
    <button type="button" class="btn btn-primary btn-block" id="imp-go">Importar questões</button>
    <p class="muted mt-8" id="imp-result"></p>
  `;

  $('#imp-file', body).addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    $('#imp-text', body).value = await f.text();
    toast(`Arquivo carregado: ${f.name}`);
  });

  $('#imp-go', body).addEventListener('click', async () => {
    const raw = $('#imp-text', body).value.trim();
    if (!raw) {
      toast('Cole o JSON ou CSV');
      return;
    }
    const btn = $('#imp-go', body);
    btn.disabled = true;
    btn.textContent = 'Importando...';
    try {
      const items = parseImportPayload(raw);
      const { forged, errors, bySubtopic } = await forgeQuestionsFromItems(items);
      SFX.forge();
      const dist = Object.entries(bySubtopic || {})
        .map(([k, v]) => `${k}:${v}`)
        .slice(0, 8)
        .join(' · ');
      toast(`${forged} questões importadas com sucesso.${errors.length ? ` (${errors.length} erros)` : ''}`);
      const res = $('#imp-result', body);
      if (res) {
        res.innerHTML = `<strong style="color:var(--ok)">${forged} importadas</strong>`
          + (dist ? `<br><span class="muted">${dist}</span>` : '')
          + (errors.length ? `<br><span style="color:var(--warn)">${errors.slice(0, 5).join('<br>')}</span>` : '');
      }
      if (errors.length) console.warn(errors);
    } catch (err) {
      toast('Erro ao processar: ' + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Importar questões';
    }
  });
}

function renderPanel(body, disciplines, subtopics, counts, filterDisc, setFilter) {
  const discMap = Object.fromEntries(disciplines.map((d) => [d.id, d]));
  let list = [...subtopics];
  if (filterDisc) list = list.filter((s) => s.discipline_id === filterDisc);
  list.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));

  body.innerHTML = `
    <div class="field">
      <label>Filtrar disciplina</label>
      <select id="p-filter">
        <option value="">Todos</option>
        ${disciplines.map((d) => `<option value="${d.id}" ${filterDisc === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
      </select>
    </div>
    <div id="p-list">
      ${list.map((s) => {
        const n = counts[s.id] || 0;
        const armed = n >= MIN_QUESTIONS_BATTLE;
        const d = discMap[s.discipline_id];
        return `
          <div class="list-item ${armed ? '' : 'disarmed'}">
            <div class="meta">
              <strong>${s.edital_numbering} · ${s.name.slice(0, 48)}</strong>
              <small>${d?.icon || ''} ${d?.name || ''} · ${s.enemy_name.split('—')[0].trim()}</small>
            </div>
            <span class="badge ${armed ? 'ok' : 'warn'}">${n} q ${armed ? '✓' : '⚠'}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  $('#p-filter', body).addEventListener('change', (e) => setFilter(e.target.value));
}

function announcementState(item, now = new Date()) {
  if (item.archived_at) return 'Arquivado';
  if (!item.is_published) return 'Rascunho';
  if (new Date(item.starts_at) > now) return 'Agendado';
  if (item.ends_at && new Date(item.ends_at) <= now) return 'Encerrado';
  return 'Publicado';
}

function announcementPreview(item) {
  const modal = openModal(
    `Prévia: ${item.title || 'aviso'}`,
    `<div class="mentor-admin-preview">
      <div class="mentor-admin-preview__controls" role="group" aria-label="Opções da prévia">
        <label>Avatar
          <select id="mentor-preview-avatar">
            <option value="male">Masculino</option>
            <option value="female">Feminino</option>
          </select>
        </label>
        <label>Visualização
          <select id="mentor-preview-viewport">
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </label>
      </div>
      <div id="mentor-preview-card" class="mentor-admin-preview__canvas"></div>
      <small>A escolha do avatar serve apenas para esta prévia e não será salva.</small>
    </div>`,
    '<button type="button" class="btn btn-primary" data-modal-close>Fechar</button>',
  );
  const paint = () => {
    const avatar = $('#mentor-preview-avatar', modal)?.value || 'male';
    const viewport = $('#mentor-preview-viewport', modal)?.value || 'desktop';
    const canvas = $('#mentor-preview-card', modal);
    canvas.classList.toggle('is-mobile', viewport === 'mobile');
    canvas.innerHTML = officialMentorHtml(
      { avatar_sprite: avatar },
      { ...item, read: null },
      { preview: true },
    );
  };
  $('#mentor-preview-avatar', modal)?.addEventListener('change', paint);
  $('#mentor-preview-viewport', modal)?.addEventListener('change', paint);
  $('[data-modal-close]', modal)?.addEventListener('click', closeModal);
  paint();
}

function adminDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function audienceLabel(item) {
  return item.audience_type === 'contest' ? `Concurso ${item.contest_id || '—'}` : 'Global';
}

function announcementFormMarkup(item = {}) {
  const suggestions = Array.isArray(item.suggestions) ? item.suggestions.join('\n') : '';
  const startsAt = item.starts_at ? new Date(item.starts_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);
  const endsAt = item.ends_at ? new Date(item.ends_at).toISOString().slice(0, 16) : '';
  const option = (value, label, selected) => (
    `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`
  );
  return `
    <form id="announcement-form" novalidate>
      <input type="hidden" id="an-id" value="${escapeAttr(item.id || '')}" />
      <div class="field"><label for="an-title">Título</label><input id="an-title" maxlength="80" required value="${escapeAttr(item.title || '')}" /></div>
      <div class="field"><label for="an-summary">Resumo</label><textarea id="an-summary" maxlength="180" required>${escapeHtml(item.summary || '')}</textarea></div>
      <div class="field"><label for="an-body">Mensagem completa</label><textarea id="an-body" maxlength="4000" required style="min-height:140px">${escapeHtml(item.body || '')}</textarea></div>
      <div class="row gap-8" style="align-items:flex-start;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:150px">
          <label for="an-category">Categoria</label>
          <select id="an-category">${ANNOUNCEMENT_CATEGORIES.map((value) => option(value, ANNOUNCEMENT_CATEGORY_LABELS[value], item.category || 'official_notice')).join('')}</select>
        </div>
        <div class="field" style="flex:1;min-width:150px">
          <label for="an-priority">Prioridade</label>
          <select id="an-priority">
            ${option('normal', 'Normal', item.priority || 'normal')}
            ${option('high', 'Alta', item.priority)}
            ${option('urgent', 'Urgente', item.priority)}
          </select>
        </div>
        <div class="field" style="flex:1;min-width:150px">
          <label for="an-audience">Público</label>
          <select id="an-audience">
            ${option('all', 'Todos', item.audience_type || 'all')}
            ${option('contest', 'Concurso', item.audience_type)}
          </select>
        </div>
      </div>
      <div class="field" id="an-contest-wrap">
        <label for="an-contest">Concurso</label>
        <input id="an-contest" placeholder="pc_al_2026" value="${escapeAttr(item.contest_id || '')}" />
      </div>
      <div class="row gap-8" style="align-items:flex-start;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:180px"><label for="an-starts">Início</label><input type="datetime-local" id="an-starts" required value="${escapeAttr(startsAt)}" /></div>
        <div class="field" style="flex:1;min-width:180px"><label for="an-ends">Encerramento</label><input type="datetime-local" id="an-ends" value="${escapeAttr(endsAt)}" /></div>
      </div>
      <div class="field">
        <label><input type="checkbox" id="an-pinned" ${item.is_pinned ? 'checked' : ''} /> Fixar na Home</label>
      </div>
      <div class="field">
        <label for="an-suggestions">Sugestões (uma por linha, máximo 5)</label>
        <textarea id="an-suggestions" placeholder="Revise o edital&#10;Organize sua rotina">${escapeHtml(suggestions)}</textarea>
      </div>
      <div class="field">
        <label for="an-cta-type">Tipo de botão</label>
        <select id="an-cta-type">
          ${option('none', 'Sem botão', item.cta_type || 'none')}
          ${option('internal_route', 'Rota interna', item.cta_type)}
          ${option('external_url', 'URL externa HTTPS', item.cta_type)}
        </select>
      </div>
      <div id="an-cta-fields">
        <div class="field"><label for="an-cta-label">Texto do botão</label><input id="an-cta-label" value="${escapeAttr(item.cta_label || '')}" /></div>
        <div class="field" id="an-route-wrap">
          <label for="an-route">Rota interna</label>
          <select id="an-route">${ANNOUNCEMENT_ROUTES.map((route) => option(route, route, item.cta_value || 'home')).join('')}</select>
        </div>
        <div class="field" id="an-url-wrap"><label for="an-url">URL externa</label><input type="url" id="an-url" placeholder="https://..." value="${escapeAttr(item.cta_type === 'external_url' ? item.cta_value : '')}" /></div>
      </div>
      <div class="row gap-8" style="flex-wrap:wrap">
        <button type="button" class="btn btn-primary" id="an-save" aria-label="Salvar aviso como rascunho">Salvar rascunho</button>
        <button type="button" class="btn btn-secondary" id="an-preview" aria-label="Visualizar prévia do aviso">Visualizar prévia</button>
        <button type="button" class="btn btn-secondary" id="an-publish" aria-label="Publicar aviso">Publicar</button>
        ${item.id ? '<button type="button" class="btn" id="an-cancel">Cancelar edição</button>' : ''}
      </div>
    </form>
  `;
}

function readAnnouncementForm(body) {
  const ctaType = $('#an-cta-type', body).value;
  return validateAnnouncementInput({
    title: $('#an-title', body).value,
    summary: $('#an-summary', body).value,
    body: $('#an-body', body).value,
    category: $('#an-category', body).value,
    priority: $('#an-priority', body).value,
    audience_type: $('#an-audience', body).value,
    contest_id: $('#an-audience', body).value === 'contest' ? $('#an-contest', body).value : null,
    starts_at: $('#an-starts', body).value,
    ends_at: $('#an-ends', body).value || null,
    is_pinned: $('#an-pinned', body).checked,
    suggestions: $('#an-suggestions', body).value.split('\n').map((value) => value.trim()).filter(Boolean),
    cta_type: ctaType,
    cta_label: ctaType === 'none' ? null : $('#an-cta-label', body).value,
    cta_value: ctaType === 'internal_route'
      ? $('#an-route', body).value
      : ctaType === 'external_url' ? $('#an-url', body).value : null,
  });
}

async function renderAnnouncements(body, editing = null) {
  let announcements;
  try {
    announcements = await announcementService.listAdminAnnouncements();
  } catch (err) {
    body.innerHTML = `<div role="alert" class="muted">Não foi possível carregar os avisos: ${escapeHtml(err.message || err)}</div>`;
    return;
  }

  body.innerHTML = `
    <section aria-labelledby="announcements-editor-title">
      <h3 id="announcements-editor-title">${editing?.id ? 'Editar aviso' : 'Criar aviso'}</h3>
      <div class="field announcement-template-picker">
        <label for="an-template">Modelo rápido</label>
        <div class="row gap-8">
          <select id="an-template">
            <option value="">Selecione um modelo</option>
            ${Object.entries(ANNOUNCEMENT_TEMPLATES).map(([id, template]) => (
              `<option value="${escapeAttr(id)}">${escapeHtml(template.label)}</option>`
            )).join('')}
          </select>
          <button type="button" class="btn btn-secondary" id="an-apply-template">Usar modelo</button>
        </div>
        <small>O modelo apenas preenche o formulário. Nada será publicado automaticamente.</small>
      </div>
      ${announcementFormMarkup(editing || {})}
    </section>
    <section class="mt-12" aria-labelledby="announcements-list-title">
      <h3 id="announcements-list-title">Avisos cadastrados</h3>
      <div id="announcement-list">
        ${announcements.length ? announcements.map((item) => `
          <article class="list-item" data-announcement-id="${escapeAttr(item.id)}">
            <div class="meta">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(ANNOUNCEMENT_CATEGORY_LABELS[item.category] || 'COMUNICADO')} · ${escapeHtml(audienceLabel(item))} · ${escapeHtml(item.priority)}</small>
              <small>Status: ${escapeHtml(announcementState(item))} · Início: ${escapeHtml(adminDate(item.starts_at))} · Fim: ${escapeHtml(adminDate(item.ends_at))}</small>
              <small>Publicado em: ${escapeHtml(adminDate(item.published_at))}</small>
              <small>${escapeHtml(item.summary)}</small>
            </div>
            <div class="row gap-8" style="flex-wrap:wrap">
              <button type="button" class="btn an-edit" aria-label="Editar ${escapeAttr(item.title)}">Editar</button>
              <button type="button" class="btn an-item-preview" aria-label="Visualizar ${escapeAttr(item.title)}">Prévia</button>
              ${item.archived_at ? '' : `<button type="button" class="btn an-archive" aria-label="Arquivar ${escapeAttr(item.title)}">Arquivar</button>`}
            </div>
          </article>
        `).join('') : '<p class="muted">Nenhum aviso cadastrado.</p>'}
      </div>
    </section>
  `;

  const syncAudience = () => {
    $('#an-contest-wrap', body).classList.toggle('hidden', $('#an-audience', body).value !== 'contest');
  };
  const syncCta = () => {
    const type = $('#an-cta-type', body).value;
    $('#an-cta-fields', body).classList.toggle('hidden', type === 'none');
    $('#an-route-wrap', body).classList.toggle('hidden', type !== 'internal_route');
    $('#an-url-wrap', body).classList.toggle('hidden', type !== 'external_url');
  };
  syncAudience();
  syncCta();
  $('#an-audience', body).addEventListener('change', syncAudience);
  $('#an-cta-type', body).addEventListener('change', syncCta);
  $('#an-apply-template', body).addEventListener('click', () => {
    const template = announcementFromTemplate($('#an-template', body).value);
    if (!template) {
      toast('Selecione um modelo.');
      return;
    }
    renderAnnouncements(body, template);
  });

  async function persist({ publish = false } = {}) {
    const saveButton = publish ? $('#an-publish', body) : $('#an-save', body);
    saveButton.disabled = true;
    try {
      const payload = readAnnouncementForm(body);
      const id = $('#an-id', body).value;
      const saved = id
        ? await announcementService.updateAnnouncement(id, payload)
        : await announcementService.createAnnouncement(payload);
      if (publish) await announcementService.publishAnnouncement(saved.id);
      toast(publish ? 'Aviso publicado.' : 'Rascunho salvo.');
      await renderAnnouncements(body);
    } catch (err) {
      toast(err.message || String(err));
      saveButton.disabled = false;
    }
  }

  $('#an-save', body).addEventListener('click', () => persist());
  $('#an-publish', body).addEventListener('click', () => persist({ publish: true }));
  $('#an-preview', body).addEventListener('click', () => {
    try {
      announcementPreview(readAnnouncementForm(body));
    } catch (err) {
      toast(err.message || String(err));
    }
  });
  $('#an-cancel', body)?.addEventListener('click', () => renderAnnouncements(body));

  body.querySelectorAll('[data-announcement-id]').forEach((row) => {
    const item = announcements.find((value) => value.id === row.dataset.announcementId);
    $('.an-edit', row)?.addEventListener('click', () => renderAnnouncements(body, item));
    $('.an-item-preview', row)?.addEventListener('click', () => announcementPreview(item));
    $('.an-archive', row)?.addEventListener('click', async () => {
      try {
        await announcementService.archiveAnnouncement(item.id);
        toast('Aviso arquivado.');
        await renderAnnouncements(body);
      } catch (err) {
        toast(err.message || String(err));
      }
    });
  });
}
