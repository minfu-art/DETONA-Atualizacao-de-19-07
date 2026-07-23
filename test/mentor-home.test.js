import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  automaticMentorHtml,
  officialMentorHtml,
} from '../app/js/ui/home.js';
import { getMentorMessage } from '../app/js/services/mentorMessageService.js';

const homeSource = readFileSync(new URL('../app/js/ui/home.js', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../app/js/ui/helpers.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/css/dashboard-jrpg.css', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../app/js/ui/profile.js', import.meta.url), 'utf8');

const player = { level: 37, avatar_sprite: 'male' };
const automatic = getMentorMessage({
  player,
  meta: { complete: true, idle: false },
  routine: { enabled: true },
  reviewData: { due: 0 },
  wellbeingState: { cards: [] },
  daysUntilExam: 90,
  missionFocus: null,
  currentDate: '2026-07-23',
});
const official = {
  id: 'notice-1',
  title: 'Mudança no cronograma',
  summary: 'Confira a programação.',
  body: 'Mensagem completa.',
  category: 'update',
  priority: 'urgent',
  suggestions: [],
  cta_type: 'none',
  read: null,
};

test('Home possui conselho automático quando não existe aviso', () => {
  assert.match(homeSource, /officialAnnouncement\s*\?\s*officialMentorHtml[\s\S]*:\s*automaticMentorHtml/);
  assert.match(automaticMentorHtml(player, automatic), /CONSELHO DO MENTOR/);
});

test('falha no carregamento do Supabase registra aviso técnico e preserva conselho automático', () => {
  assert.match(homeSource, /catch \(error\)[\s\S]*console\.warn\('\[home\] avisos indisponíveis; usando conselho automático'/);
  assert.doesNotMatch(homeSource, /toast\([^)]*avisos indisponíveis/);
});

test('personagem masculino usa a arte dedicada do Mentor', () => {
  const html = automaticMentorHtml({ level: 37, avatar_sprite: 'male' }, automatic);
  assert.match(html, /assets\/mentor\/mentor\.png\?v1/);
  assert.match(html, /data-mentor-variant="male"/);
  assert.match(html, /CONSELHO DO MENTOR/);
});

test('personagem feminino usa a arte dedicada da Mentora sem duplicar imagem', () => {
  const html = automaticMentorHtml({ level: 74, avatar_sprite: 'female' }, automatic);
  assert.match(html, /assets\/mentor\/mentora\.png\?v1/);
  assert.match(html, /data-mentor-variant="female"/);
  assert.match(html, /CONSELHO DA MENTORA/);
  assert.equal((html.match(/<img\b/g) || []).length, 1);
});

test('aviso oficial urgente substitui visualmente o conselho e mostra indicador novo', () => {
  const html = officialMentorHtml(player, official);
  assert.match(html, /dj-mentor--official/);
  assert.match(html, /dj-mentor--urgent/);
  assert.match(html, /AVISO OFICIAL DO MENTOR/);
  assert.match(html, />NOVO</);
  assert.match(html, />Ver mais</);
});

test('aviso da Mentora abre a mensagem completa pelo botão Ver mais', () => {
  const html = officialMentorHtml({ level: 12, avatar_sprite: 'female' }, official);
  assert.match(html, /AVISO OFICIAL DA MENTORA/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-label="Ver mensagem completa de Mentora"/);
  assert.match(html, />Ver mais</);
  assert.match(homeSource, /openAnnouncementModal\(officialAnnouncement/);
});

test('aviso fixado já lido continua renderizável sem indicador novo', () => {
  const html = officialMentorHtml(player, {
    ...official,
    is_pinned: true,
    read: { read_at: '2026-07-23T12:00:00Z' },
  });
  assert.match(html, /Mudança no cronograma/);
  assert.doesNotMatch(html, />NOVO</);
});

test('conteúdo HTML recebido é escapado no cartão', () => {
  const html = officialMentorHtml(player, {
    ...official,
    title: '<img src=x onerror=alert(1)>',
    summary: '<script>alert(1)</script>',
  });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;/);
});

test('modal marca aviso como lido e escapa corpo e sugestões', () => {
  assert.match(homeSource, /announcementService\.markAnnouncementRead\(userId, announcement\.id\)/);
  assert.match(homeSource, /suggestions\.map\(\(suggestion\) => `<li>\$\{escapeHtml\(suggestion\)\}<\/li>`\)/);
  assert.match(homeSource, /escapeHtml\(announcement\.body\)/);
});

test('CTA interno aceita somente rotas permitidas e navega após fechar', () => {
  assert.match(homeSource, /ANNOUNCEMENT_ROUTES\.includes\(announcement\.cta_value\)/);
  assert.match(homeSource, /closeModal\(\);\s*navigate\?\.\(internalRoute\)/);
});

test('CTA externo aceita somente HTTPS e protege a nova guia', () => {
  assert.match(homeSource, /url\.protocol === 'https:'/);
  assert.match(homeSource, /target="_blank" rel="noopener noreferrer"/);
});

test('modal compartilhado oferece Escape, foco preso e restauração de foco', () => {
  assert.match(homeSource, /openModal\(/);
  assert.match(helperSource, /event\.key === 'Escape'/);
  assert.match(helperSource, /event\.key !== 'Tab'/);
  assert.match(helperSource, /modalReturnFocus\?\.isConnected/);
  assert.match(helperSource, /aria-modal="true"/);
});

test('ação automática reutiliza a função da missão principal', () => {
  assert.match(homeSource, /const startPrimaryMission = \(\) =>/);
  assert.match(homeSource, /addEventListener\('click', startPrimaryMission\)/);
  assert.match(homeSource, /actionType === 'start_daily_mission'\) startPrimaryMission\(\)/);
});

test('nova caixa não possui XP fictício nem conteúdo de conquistas', () => {
  const html = automaticMentorHtml(player, automatic);
  assert.doesNotMatch(html, /\bXP\b|\+\d+/);
  assert.doesNotMatch(homeSource, /achRows|Conquistas recentes|Ver todas as conquistas/);
});

test('conquistas continuam disponíveis no Perfil', () => {
  assert.match(profileSource, /STORES\.mvpCards/);
  assert.match(profileSource, /carta de conquista/i);
});

test('layout móvel limita texto e impede overflow horizontal', () => {
  assert.match(css, /\.dj-mentor[\s\S]*overflow:\s*hidden/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.dj-mentor__message[\s\S]*-webkit-line-clamp:\s*4/);
  assert.match(css, /\.dj-mentor__message[\s\S]*overflow-wrap:\s*anywhere/);
});
