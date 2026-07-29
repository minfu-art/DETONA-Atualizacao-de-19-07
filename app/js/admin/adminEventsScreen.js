import { rankedEventService } from '../services/rankedEventService.js';
import { escapeHtml } from '../ui/helpers.js';

const CONFIRMATION = 'PUBLICAR EVENTO RANKEADO';

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function eventRow(event) {
  return `
    <article class="admin-card admin-event-row" data-admin-event-id="${escapeHtml(event.id)}">
      <div>
        <span class="admin-status">${escapeHtml(event.status)}</span>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${new Date(event.starts_at).toLocaleString('pt-BR')} · ${Number(event.question_count)} questões</p>
      </div>
      <div class="admin-actions">
        ${event.status === 'draft' ? `<button type="button" class="admin-button admin-button--secondary" data-edit-event="${escapeHtml(event.id)}">Editar</button>
        <button type="button" class="admin-button" data-publish-event="${escapeHtml(event.id)}">Publicar</button>` : ''}
        ${!['finished', 'cancelled'].includes(event.status) ? `<button type="button" class="admin-button admin-button--danger" data-cancel-event="${escapeHtml(event.id)}">Cancelar</button>` : ''}
        <button type="button" class="admin-button admin-button--secondary" data-participants="${escapeHtml(event.id)}">Participantes</button>
        <button type="button" class="admin-button admin-button--secondary" data-ranking="${escapeHtml(event.id)}">Ranking</button>
      </div>
    </article>`;
}

function formHtml(event = {}) {
  return `
    <form class="admin-form admin-card" id="admin-ranked-event-form">
      <input type="hidden" name="id" value="${escapeHtml(event.id || '')}">
      <h2>${event.id ? 'Editar evento' : 'Novo evento ranqueado'}</h2>
      <label>Título<input name="title" maxlength="160" required value="${escapeHtml(event.title || '')}"></label>
      <label>Descrição<textarea name="description" maxlength="1000" required>${escapeHtml(event.description || '')}</textarea></label>
      <div class="admin-form-grid">
        <label>Início das inscrições<input type="datetime-local" name="registration_starts_at" required value="${localDateTime(event.registration_starts_at)}"></label>
        <label>Fim das inscrições<input type="datetime-local" name="registration_ends_at" required value="${localDateTime(event.registration_ends_at)}"></label>
        <label>Início do evento<input type="datetime-local" name="starts_at" required value="${localDateTime(event.starts_at)}"></label>
        <label>Fim do evento<input type="datetime-local" name="ends_at" required value="${localDateTime(event.ends_at)}"></label>
        <label>Duração (min)<input type="number" name="duration_minutes" min="1" max="360" required value="${Number(event.duration_minutes || 60)}"></label>
        <label>Questões<input type="number" name="question_count" min="1" max="200" required value="${Number(event.question_count || 20)}"></label>
        <label>Pontuação<select name="scoring_mode"><option value="simple" ${event.scoring_mode === 'simple' ? 'selected' : ''}>Simples</option><option value="cebraspe" ${event.scoring_mode === 'cebraspe' ? 'selected' : ''}>CEBRASPE (+1 / -1)</option></select></label>
        <label>Liberação do ranking<select name="ranking_release_mode"><option value="after_event" ${event.ranking_release_mode !== 'immediate' ? 'selected' : ''}>Após o evento</option><option value="immediate" ${event.ranking_release_mode === 'immediate' ? 'selected' : ''}>Imediata</option></select></label>
        <label>Resultado visível por (h)<input type="number" name="result_display_hours" min="1" max="168" required value="${Number(event.result_display_hours || 24)}"></label>
      </div>
      <div class="admin-actions">
        <button type="submit" class="admin-button">Salvar rascunho</button>
        <button type="button" class="admin-button admin-button--secondary" id="clear-ranked-event">Limpar</button>
      </div>
      <p class="admin-form-feedback" id="ranked-event-feedback" role="status"></p>
    </form>`;
}

function eventFromForm(form, contestId) {
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    id: values.id || null,
    contest_id: contestId,
    duration_minutes: Number(values.duration_minutes),
    question_count: Number(values.question_count),
    result_display_hours: Number(values.result_display_hours),
  };
}

export async function renderAdminEventsScreen(root, ctx) {
  const load = async (editing = null) => {
    const { events = [] } = await rankedEventService.listAdminEvents(ctx.adminSelectedContestId);
    root.innerHTML = `
      <section class="admin-page-header"><div><span>COMPETIÇÃO SEGURA</span><h1>Eventos ranqueados</h1><p>Crie o evento, congele as questões publicadas e acompanhe participantes sem alterar XP, domínio ou nível.</p></div><button type="button" class="admin-button" id="admin-new-ranked-event">Novo evento</button></section>
      ${formHtml(editing || {})}
      <section class="admin-section"><h2>Eventos deste concurso</h2><div class="admin-event-list">${events.map(eventRow).join('') || '<p>Nenhum evento criado.</p>'}</div></section>
      <section class="admin-card" id="ranked-participants" hidden></section>`;
    const form = root.querySelector('#admin-ranked-event-form');
    const feedback = root.querySelector('#ranked-event-feedback');
    form.addEventListener('submit', async (submitEvent) => {
      submitEvent.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await rankedEventService.saveDraft(eventFromForm(form, ctx.adminSelectedContestId));
        await load();
      } catch (error) {
        button.disabled = false;
        feedback.textContent = error.message;
      }
    });
    root.querySelector('#clear-ranked-event')?.addEventListener('click', () => load());
    root.querySelectorAll('[data-edit-event]').forEach((button) => {
      button.addEventListener('click', () => load(events.find(({ id }) => id === button.dataset.editEvent)));
    });
    root.querySelectorAll('[data-publish-event]').forEach((button) => {
      button.addEventListener('click', async () => {
        const event = events.find(({ id }) => id === button.dataset.publishEvent);
        const contest = ctx.availableContests.find(({ id }) => id === event.contest_id);
        const summary = [
          `Concurso: ${contest?.name || event.contest_id}`,
          `Questões: ${event.question_count}`,
          `Início: ${new Date(event.starts_at).toLocaleString('pt-BR')}`,
          `Encerramento: ${new Date(event.ends_at).toLocaleString('pt-BR')}`,
          `Duração: ${event.duration_minutes} minutos`,
          `Pontuação: ${event.scoring_mode}`,
          `Ranking: ${event.ranking_release_mode}`,
        ].join('\n');
        if (!globalThis.confirm(`${summary}\n\nAs questões serão congeladas e o evento ficará imutável. Continuar?`)) return;
        if (globalThis.prompt(`Digite exatamente: ${CONFIRMATION}`) !== CONFIRMATION) return;
        button.disabled = true;
        try {
          await rankedEventService.publishEvent(event.id);
          await load();
        } catch (error) {
          button.disabled = false;
          globalThis.alert(error.message);
        }
      });
    });
    root.querySelectorAll('[data-cancel-event]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!globalThis.confirm('Cancelar este evento ranqueado?')) return;
        await rankedEventService.cancelEvent(button.dataset.cancelEvent);
        await load();
      });
    });
    root.querySelectorAll('[data-participants]').forEach((button) => {
      button.addEventListener('click', async () => {
        const { participants = [] } = await rankedEventService.listParticipants(button.dataset.participants);
        const panel = root.querySelector('#ranked-participants');
        panel.hidden = false;
        panel.innerHTML = `<h2>Participantes</h2><p>${participants.length} registro(s)</p><ol>${participants.map((row) => `<li>${escapeHtml(row.display_name)} — ${escapeHtml(row.status)} — ${Number(row.score)} ponto(s)</li>`).join('')}</ol>`;
      });
    });
    root.querySelectorAll('[data-ranking]').forEach((button) => {
      button.addEventListener('click', async () => {
        const { participants = [] } = await rankedEventService.listParticipants(button.dataset.ranking);
        const ranking = participants.filter(({ status }) => ['submitted', 'timed_out'].includes(status)).sort((a, b) => (
          Number(b.score) - Number(a.score)
          || Number(b.accuracy) - Number(a.accuracy)
          || Number(a.elapsed_seconds) - Number(b.elapsed_seconds)
          || new Date(a.submitted_at) - new Date(b.submitted_at)
        ));
        const panel = root.querySelector('#ranked-participants');
        panel.hidden = false;
        panel.innerHTML = `<h2>Ranking administrativo</h2><ol>${ranking.map((row, index) => `<li>${index + 1}º ${escapeHtml(row.display_name)} — ${Number(row.score)} ponto(s)</li>`).join('') || '<li>Sem resultados enviados.</li>'}</ol>`;
      });
    });
    root.querySelector('#admin-new-ranked-event')?.addEventListener('click', () => load());
  };
  await load();
}

export { CONFIRMATION as RANKED_EVENT_PUBLISH_CONFIRMATION };
