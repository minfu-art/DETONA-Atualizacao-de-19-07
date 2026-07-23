import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/js/ui/forge.js', import.meta.url), 'utf8');

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
  assert.match(source, /escapeHtml\(item\.body\)/);
  assert.doesNotMatch(source, /\$\{item\.body\}/);
});

test('painel valida o formulário antes de persistir', () => {
  assert.match(source, /validateAnnouncementInput\(/);
  assert.match(source, /announcementService\.createAnnouncement/);
  assert.match(source, /announcementService\.updateAnnouncement/);
  assert.match(source, /announcementService\.publishAnnouncement/);
  assert.match(source, /announcementService\.archiveAnnouncement/);
});
