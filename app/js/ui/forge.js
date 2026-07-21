import { $, toast } from './helpers.js';
import { STORES } from '../core/types.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { MIN_QUESTIONS_BATTLE, getQuestionCounts } from '../core/ssot.js';
import { SFX } from '../core/audio.js';
import { parseImportPayload, forgeQuestionsFromItems } from '../core/questionImport.js';
import { isDeveloperUser } from '../auth/authService.js';
import { emptyState } from './components.js';

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
