import { escapeHtml } from './helpers.js';

export const ANNOUNCEMENT_CATEGORY_LABELS = Object.freeze({
  event: 'EVENTO',
  update: 'NOVIDADE',
  maintenance: 'MANUTENÇÃO',
  focus: 'MENSAGEM DO DETONA',
  study_tip: 'DICA DE ESTUDO',
  official_notice: 'COMUNICADO',
});

export const AUTOMATIC_MENTOR_LABELS = Object.freeze({
  daily_goal: '⚡ FOCO DO DIA',
  review_due: '🧠 REVISÃO INTELIGENTE',
  exam_near: '🏁 RETA FINAL',
  wellbeing: '🌱 PREPARAÇÃO',
  streak: '🔥 CONSTÂNCIA',
  weak_discipline: '🎯 FOCO ESTRATÉGICO',
  return_after_absence: '🔁 RETOME O CONTROLE',
  default: '💬 CONSELHO DO SEU AVATAR',
});

const PRIORITY_LABELS = Object.freeze({
  high: 'IMPORTANTE',
  urgent: 'URGENTE',
});

const MENTOR_ART_VERSION = 'v1';

export function mentorIdentity(player = {}) {
  const isFemale = player.avatar_sprite === 'female';
  return isFemale
    ? {
      name: 'Mentora',
      src: `assets/mentor/mentora.png?${MENTOR_ART_VERSION}`,
      variant: 'female',
    }
    : {
      name: 'Mentor',
      src: `assets/mentor/mentor.png?${MENTOR_ART_VERSION}`,
      variant: 'male',
    };
}

function mentorPortraitHtml(player, { modal = false } = {}) {
  const mentor = mentorIdentity(player);
  if (modal) {
    return `
      <img
        src="${mentor.src}"
        alt="${escapeHtml(mentor.name)} do aluno"
        class="dj-announcement-modal__avatar"
        data-mentor-variant="${mentor.variant}"
      />`;
  }
  return `
    <div class="dj-mentor__character" aria-hidden="true">
      <div class="dj-mentor__portrait">
        <img
          src="${mentor.src}"
          alt=""
          class="dj-mentor__portrait-image"
          draggable="false"
          data-mentor-variant="${mentor.variant}"
        />
      </div>
    </div>`;
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function eventContextText(announcement, now = new Date()) {
  if (announcement?.category !== 'event') return '';
  const start = announcement.starts_at ? new Date(announcement.starts_at) : null;
  const end = announcement.ends_at ? new Date(announcement.ends_at) : null;
  if (start && Number.isNaN(start.getTime())) return '';
  if (end && Number.isNaN(end.getTime())) return '';

  const today = dateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);

  if (start && start > now && dateKey(start) === today) return `Começa hoje às ${formatTime(start)}`;
  if (start && start > now && dateKey(start) === tomorrow) return `Amanhã às ${formatTime(start)}`;
  if ((!start || start <= now) && (!end || end > now)) {
    if (end && dateKey(end) === today) return `Disponível até hoje às ${formatTime(end)}`;
    return 'Evento em andamento';
  }
  return '';
}

function announcementCategoryLabel(announcement = {}) {
  if (
    announcement.category === 'event'
    && /\bsimulado\b/i.test(`${announcement.title || ''} ${announcement.summary || ''}`)
  ) {
    return 'SIMULADO';
  }
  return ANNOUNCEMENT_CATEGORY_LABELS[announcement.category] || 'COMUNICADO';
}

function priorityBadge(priority) {
  const label = PRIORITY_LABELS[priority];
  return label
    ? `<span class="dj-mentor__priority dj-mentor__priority--${escapeHtml(priority)}">${label}</span>`
    : '';
}

export function automaticMentorHtml(player, mentor, { preview = false } = {}) {
  const badge = AUTOMATIC_MENTOR_LABELS[mentor.category] || AUTOMATIC_MENTOR_LABELS.default;
  const action = mentor.actionType !== 'none' && mentor.actionLabel
    ? `<button type="button" class="dj-mentor__action"${preview ? ' disabled' : ' id="mentor-action"'}>${escapeHtml(mentor.actionLabel)}</button>`
    : '';
  return `
    <section class="dj-mentor dj-mentor--automatic dj-mentor--${escapeHtml(mentor.priority)}" aria-labelledby="${preview ? 'mentor-preview-title' : 'dj-mentor-title'}">
      ${mentorPortraitHtml(player)}
      <div class="dj-mentor__bubble">
        <div class="dj-mentor__meta">
          <span class="dj-mentor__eyebrow">${escapeHtml(badge)}</span>
          ${priorityBadge(mentor.priority)}
        </div>
        <h2 class="dj-mentor__title" id="${preview ? 'mentor-preview-title' : 'dj-mentor-title'}">${escapeHtml(mentor.title)}</h2>
        <p class="dj-mentor__message">${escapeHtml(mentor.message)}</p>
        ${action}
      </div>
    </section>`;
}

export function officialMentorHtml(player, announcement, {
  preview = false,
  now = new Date(),
} = {}) {
  const isNew = !announcement.read?.read_at;
  const category = announcementCategoryLabel(announcement);
  const motivational = announcement.category === 'focus' || announcement.category === 'study_tip';
  const context = eventContextText(announcement, now);
  return `
    <section class="dj-mentor dj-mentor--official dj-mentor--${escapeHtml(announcement.priority)}" aria-labelledby="${preview ? 'mentor-preview-title' : 'dj-mentor-title'}">
      ${mentorPortraitHtml(player)}
      <div class="dj-mentor__bubble">
        <div class="dj-mentor__meta">
          ${motivational ? '' : '<span class="dj-mentor__origin">📣 AVISO OFICIAL</span>'}
          <span class="dj-mentor__eyebrow">${escapeHtml(category)}</span>
          ${priorityBadge(announcement.priority)}
          ${isNew ? `<span class="dj-mentor__new"${preview ? '' : ' id="mentor-new-indicator"'}>NOVO</span>` : ''}
        </div>
        <h2 class="dj-mentor__title" id="${preview ? 'mentor-preview-title' : 'dj-mentor-title'}">${escapeHtml(announcement.title)}</h2>
        <p class="dj-mentor__message">${escapeHtml(announcement.summary)}</p>
        ${context ? `<p class="dj-mentor__context">${escapeHtml(context)}</p>` : ''}
        <button type="button" class="dj-mentor__action"${preview ? ' disabled' : ' id="mentor-read-announcement" aria-haspopup="dialog"'} aria-label="Ver mensagem completa">Ver mais</button>
      </div>
    </section>`;
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function announcementModalDetailsHtml(player, announcement, { now = new Date() } = {}) {
  const suggestions = Array.isArray(announcement.suggestions) ? announcement.suggestions.slice(0, 5) : [];
  const category = announcementCategoryLabel(announcement);
  const eventStatus = eventContextText(announcement, now);
  const showPeriod = announcement.category === 'event'
    || announcement.category === 'maintenance'
    || announcement.category === 'official_notice';
  const start = formatDateTime(announcement.starts_at);
  const end = formatDateTime(announcement.ends_at);
  return `
    <div class="dj-announcement-modal">
      <div class="dj-announcement-modal__header">
        ${mentorPortraitHtml(player, { modal: true })}
        <div class="dj-announcement-modal__badges">
          <span>📣 AVISO OFICIAL</span>
          <span>${escapeHtml(category)}</span>
          ${PRIORITY_LABELS[announcement.priority] ? `<span>${PRIORITY_LABELS[announcement.priority]}</span>` : ''}
        </div>
      </div>
      ${eventStatus ? `<p class="dj-announcement-modal__status"><strong>${escapeHtml(eventStatus)}</strong></p>` : ''}
      <p class="dj-announcement-modal__body">${escapeHtml(announcement.body)}</p>
      ${suggestions.length ? `
        <div class="dj-announcement-modal__suggestions">
          <strong>Recomendações</strong>
          <ul>${suggestions.map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join('')}</ul>
        </div>` : ''}
      ${showPeriod && (start || end) ? `
        <p class="dj-announcement-modal__period">
          ${start ? `<span><strong>Início:</strong> ${escapeHtml(start)}</span>` : ''}
          ${end ? `<span><strong>Fim:</strong> ${escapeHtml(end)}</span>` : ''}
        </p>` : ''}
    </div>`;
}
