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
    else renderPanel(body, disciplines, subtopics, counts, filterDisc, (fd) => {
      filterDisc = fd;
      paint();
    });
  }

  await paint();
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

const ANNOUNCEMENT_CATEGORY_LABELS = Object.freeze({
  event: 'Evento',
  update: 'Atualização',
  maintenance: 'Manutenção',
  focus: 'Foco',
  study_tip: 'Dica de estudo',
  official_notice: 'Comunicado oficial',
});

function announcementState(item, now = new Date()) {
  if (item.archived_at) return 'Arquivado';
  if (!item.is_published) return 'Rascunho';
  if (new Date(item.starts_at) > now) return 'Agendado';
  if (item.ends_at && new Date(item.ends_at) <= now) return 'Encerrado';
  return 'Publicado';
}

function announcementPreview(item) {
  const suggestions = Array.isArray(item.suggestions) ? item.suggestions : [];
  openModal(
    item.title || 'Prévia do aviso',
    `
      <p><strong>${escapeHtml(item.summary)}</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(item.body)}</p>
      ${suggestions.length ? `
        <ul>${suggestions.map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join('')}</ul>
      ` : ''}
      ${item.cta_type !== 'none' && item.cta_label
    ? `<p><span class="btn btn-secondary">${escapeHtml(item.cta_label)}</span></p>`
    : ''}
    `,
    '<button type="button" class="btn btn-primary" data-modal-close>Fechar</button>',
  );
  $('[data-modal-close]')?.addEventListener('click', closeModal);
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
      <h3 id="announcements-editor-title">${editing ? 'Editar aviso' : 'Criar aviso'}</h3>
      ${announcementFormMarkup(editing || {})}
    </section>
    <section class="mt-12" aria-labelledby="announcements-list-title">
      <h3 id="announcements-list-title">Avisos cadastrados</h3>
      <div id="announcement-list">
        ${announcements.length ? announcements.map((item) => `
          <article class="list-item" data-announcement-id="${escapeAttr(item.id)}">
            <div class="meta">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(ANNOUNCEMENT_CATEGORY_LABELS[item.category] || item.category)} · ${escapeHtml(announcementState(item))} · ${escapeHtml(item.priority)}</small>
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
