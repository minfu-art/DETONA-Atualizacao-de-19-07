import { escapeHtml, formatDate } from './helpers.js';
import { formatContestPrice } from '../contest/contestCatalog.js';
import { emptyState, progressBar, statusBadge } from './components.js';
import { heroSrcForLevel } from './heroAssets.js';

function contestCard(item) {
  const { contest, owned, summary } = item;
  const ready = contest.contentStatus === 'ready';
  return `
    <article class="contest-card ${owned ? 'contest-card--owned' : ''}" style="--contest:${contest.color};--contest-accent:${contest.accent}">
      <div class="contest-card__visual"><span class="contest-card__emblem">${escapeHtml(contest.icon)}</span>${owned ? statusBadge(ready ? 'Jornada ativa' : 'Em preparacao', ready ? 'success' : 'warning') : statusBadge('Disponivel', 'info')}</div>
      <div class="contest-card__body">
        <span class="contest-card__code">${escapeHtml(contest.code)}</span>
        <h3>${escapeHtml(contest.name)}</h3>
        <p class="contest-card__role">${escapeHtml(contest.role)}</p>
        <p>${escapeHtml(contest.description)}</p>
        ${owned && ready ? `<div class="contest-card__progress">${progressBar({ value: summary?.editalCompletionPct || 0, label: 'Dominio do edital', tone: 'plasma' })}<span class="contest-card__last">${summary ? `Nivel ${summary.level} · ${summary.streakDays} dias de constancia${summary.lastAccessAt ? ` · ultimo estudo ${formatDate(summary.lastAccessAt)}` : ''}` : 'Sua jornada esta pronta para comecar.'}</span></div>` : ''}
        <div class="contest-card__footer">
          ${owned
            ? `<button type="button" class="btn btn-primary" data-open-contest="${contest.id}" ${ready ? '' : 'disabled'}>${ready ? (summary ? 'Continuar jornada' : 'Iniciar jornada') : 'Conteudo em preparacao'}</button>`
            : `<div><small>Acesso completo</small><strong>${formatContestPrice(contest)}</strong></div><button type="button" class="btn" data-buy-contest="${contest.id}" aria-label="Adicionar ${escapeHtml(contest.code)} a biblioteca">Adicionar</button>`}
        </div>
      </div>
    </article>`;
}

export function renderLibrary(root, { user, items, onOpen, onPurchase, onLogout }) {
  const owned = items.filter((item) => item.owned);
  const catalog = items.filter((item) => !item.owned);
  const activeJourney = owned.find((item) => item.contest.contentStatus === 'ready');
  const guideLevel = activeJourney?.summary?.level || 20;
  root.innerHTML = `
    <div class="library-page">
      <header class="library-header">
        <div class="saas-brand"><span>DC</span><strong>DETONA <em>CONCURSOS</em></strong></div>
        <div class="library-account"><span>${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div><button id="library-logout" type="button">Sair</button></div>
      </header>
      <section class="library-hero">
        <div class="library-hero__copy"><span class="saas-kicker">Minha biblioteca</span><p class="library-greeting">Olá, <strong>${escapeHtml(user.name.split(' ')[0])}</strong>. Sua evolução é construída todos os dias.</p><h1>Escolha sua próxima missão.</h1><p>Cada concurso é uma jornada independente. Seu perfil continua sendo o mesmo.</p><div class="library-summary"><strong>${owned.length}</strong><span>${owned.length === 1 ? 'concurso ativo' : 'concursos ativos'}</span></div></div>
        <div class="library-guide" aria-hidden="true"><span class="library-guide__orbit"></span><img src="${heroSrcForLevel(guideLevel)}" alt="" width="560" height="560" decoding="async"><div><small>Conhecimento é poder</small><strong>Continue de onde parou.</strong></div></div>
      </section>
      <section class="library-section" aria-labelledby="owned-title"><div class="library-section__title"><div><span class="saas-kicker">Seus acessos</span><h2 id="owned-title">Continue de onde parou</h2></div></div><div class="contest-grid">${owned.map(contestCard).join('') || emptyState({ title: 'Sua biblioteca esta pronta', description: 'Adicione um concurso para iniciar uma jornada independente.' })}</div></section>
      <section class="library-section library-section--catalog" aria-labelledby="catalog-title"><div class="library-section__title"><div><span class="saas-kicker">Catalogo DETONA</span><h2 id="catalog-title">Expanda sua preparacao</h2></div><p>Checkout demonstrativo nesta fase; nenhum valor real sera cobrado.</p></div><div class="contest-grid">${catalog.map(contestCard).join('') || emptyState({ title: 'Biblioteca completa', description: 'Todos os modulos disponiveis ja pertencem a sua conta.' })}</div></section>
    </div>`;
  root.querySelector('#library-logout').addEventListener('click', onLogout);
  root.querySelectorAll('[data-open-contest]').forEach((button) => button.addEventListener('click', () => onOpen(button.dataset.openContest)));
  root.querySelectorAll('[data-buy-contest]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Adicionando...';
    try { await onPurchase(button.dataset.buyContest); } catch (error) { button.disabled = false; button.textContent = error.message || 'Tentar novamente'; }
  }));
}
