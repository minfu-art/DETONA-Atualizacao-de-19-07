import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/js/ui/forge.js', import.meta.url), 'utf8');
const communicationSource = readFileSync(new URL('../app/js/ui/mentorCommunication.js', import.meta.url), 'utf8');
const templatesSource = readFileSync(new URL('../app/js/data/announcementTemplates.js', import.meta.url), 'utf8');

test('Forja mantém abas existentes e adiciona a aba Avisos', () => {
  for (const tab of ['Nova questão', 'Importar', 'Banco atual', 'Avisos']) {
    assert.match(source, new RegExp(tab));
  }
  assert.match(source, /data-t="announcements"/);
});

test('aba administrativa oferece ciclo completo e estados dos avisos', () => {
  for (const action of ['Criar aviso', 'Salvar rascunho', 'Visualizar prévia', 'Publicar', 'Editar', 'Arquivar']) {
    assert.match(source, new RegExp(action, 'i'));
  }
  for (const state of ['Rascunho', 'Agendado', 'Publicado', 'Encerrado', 'Arquivado']) {
    assert.match(source, new RegExp(state));
  }
});

test('conteúdo administrativo é escapado e não é renderizado como HTML', () => {
  assert.match(source, /escapeHtml\(item\.title\)/);
  assert.match(source, /escapeHtml\(item\.summary\)/);
  assert.match(communicationSource, /escapeHtml\(announcement\.body\)/);
  assert.doesNotMatch(source, /\$\{item\.body\}/);
});

test('modelos rápidos preenchem o formulário sem publicar automaticamente', () => {
  for (const label of [
    'Novo simulado',
    'Novo evento',
    'Nova atualização',
    'Manutenção',
    'Mensagem motivacional',
    'Dica de estudo',
    'Comunicado oficial',
  ]) {
    assert.match(templatesSource, new RegExp(label));
  }
  assert.match(templatesSource, /category:\s*'event'/);
  assert.match(templatesSource, /title:\s*'Novo simulado disponível'/);
  assert.doesNotMatch(templatesSource, /publishAnnouncement/);
  assert.match(source, /announcementFromTemplate/);
});

test('prévia usa o mesmo cartão, permite avatar e viewport sem persistir a escolha', () => {
  assert.match(source, /officialMentorHtml/);
  assert.match(source, /mentor-preview-avatar/);
  assert.match(source, /mentor-preview-viewport/);
  assert.match(source, /A escolha do avatar serve apenas para esta prévia e não será salva/);
  assert.doesNotMatch(templatesSource, /avatar_sprite/);
});

test('histórico mostra metadados administrativos sem identificar alunos', () => {
  for (const field of ['Status:', 'Início:', 'Fim:', 'Publicado em:']) {
    assert.match(source, new RegExp(field));
  }
  assert.doesNotMatch(source, /student.*email|user.*email/i);
});

test('painel valida o formulário antes de persistir', () => {
  assert.match(source, /validateAnnouncementInput\(/);
  assert.match(source, /announcementService\.createAnnouncement/);
  assert.match(source, /announcementService\.updateAnnouncement/);
  assert.match(source, /announcementService\.publishAnnouncement/);
  assert.match(source, /announcementService\.archiveAnnouncement/);
});
