import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AnnouncementService,
  canDismissAnnouncement,
  validateAnnouncementInput,
} from '../app/js/services/announcementService.js';

const NOW = new Date('2026-07-23T12:00:00.000Z');

function validInput(overrides = {}) {
  return {
    title: 'Atenção ao cronograma',
    summary: 'Confira a atualização desta semana.',
    body: 'A programação de estudos foi atualizada.',
    category: 'official_notice',
    priority: 'normal',
    audience_type: 'all',
    contest_id: null,
    suggestions: [],
    cta_type: 'none',
    cta_label: null,
    cta_value: null,
    starts_at: '2026-07-23T10:00:00.000Z',
    ends_at: null,
    is_pinned: false,
    ...overrides,
  };
}

function announcement(overrides = {}) {
  return {
    id: overrides.id || `notice-${Math.random()}`,
    ...validInput(),
    is_published: true,
    published_at: '2026-07-23T11:00:00.000Z',
    archived_at: null,
    created_at: '2026-07-23T10:00:00.000Z',
    ...overrides,
  };
}

class Query {
  constructor(response, operations) {
    this.response = response;
    this.operations = operations;
  }
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  lte() { return this; }
  or() { return this; }
  order() { return this; }
  maybeSingle() { return this; }
  single() { return this; }
  insert(payload) {
    this.operations.push({ type: 'insert', payload });
    this.response = { data: { id: 'created-id', ...payload }, error: null };
    return this;
  }
  update(payload) {
    this.operations.push({ type: 'update', payload });
    this.response = { data: { id: 'updated-id', ...payload }, error: null };
    return this;
  }
  upsert(payload) {
    this.operations.push({ type: 'upsert', payload });
    this.response = { data: payload, error: null };
    return this;
  }
  then(resolve, reject) {
    return Promise.resolve(this.response).then(resolve, reject);
  }
}

function fakeClient({ announcements = [], reads = [] } = {}) {
  const operations = [];
  return {
    operations,
    auth: { getUser: async () => ({ data: { user: { id: 'developer-1' } }, error: null }) },
    from(table) {
      const data = table === 'announcements' ? announcements : reads;
      return new Query({ data, error: null }, operations);
    },
  };
}

test('administrador cria aviso inicialmente como rascunho', async () => {
  const client = fakeClient();
  const service = new AnnouncementService({
    getClient: async () => client,
    getUserId: async () => 'developer-1',
    now: () => NOW,
  });
  const created = await service.createAnnouncement(validInput());
  assert.equal(created.created_by, 'developer-1');
  assert.equal(created.is_published, false);
  assert.equal(client.operations[0].type, 'insert');
});

test('rascunho, aviso futuro, encerrado e arquivado não aparecem ao aluno', async () => {
  const client = fakeClient({
    announcements: [
      announcement({ id: 'draft', is_published: false }),
      announcement({ id: 'future', starts_at: '2026-07-24T00:00:00.000Z' }),
      announcement({ id: 'ended', ends_at: '2026-07-23T11:00:00.000Z' }),
      announcement({ id: 'archived', archived_at: '2026-07-23T11:30:00.000Z' }),
      announcement({ id: 'active' }),
    ],
  });
  const service = new AnnouncementService({ getClient: async () => client, now: () => NOW });
  const result = await service.listActiveAnnouncements({ userId: 'student-1', contestId: 'pc_al_2026' });
  assert.deepEqual(result.map((item) => item.id), ['active']);
});

test('aviso global aparece em qualquer concurso e aviso específico somente no correspondente', async () => {
  const client = fakeClient({
    announcements: [
      announcement({ id: 'global' }),
      announcement({ id: 'pc', audience_type: 'contest', contest_id: 'pc_al_2026' }),
    ],
  });
  const service = new AnnouncementService({ getClient: async () => client, now: () => NOW });
  const pc = await service.listActiveAnnouncements({ userId: 'student-1', contestId: 'pc_al_2026' });
  const pf = await service.listActiveAnnouncements({ userId: 'student-1', contestId: 'pf_2026' });
  assert.deepEqual(new Set(pc.map((item) => item.id)), new Set(['global', 'pc']));
  assert.deepEqual(pf.map((item) => item.id), ['global']);
});

test('urgente fixado tem prioridade na Home', async () => {
  const service = new AnnouncementService();
  service.listActiveAnnouncements = async () => [
    announcement({ id: 'recent', published_at: '2026-07-23T11:59:00.000Z' }),
    announcement({ id: 'pinned', is_pinned: true }),
    announcement({ id: 'urgent-pinned', is_pinned: true, priority: 'urgent' }),
  ];
  assert.equal((await service.getCurrentHomeAnnouncement({})).id, 'urgent-pinned');
});

test('aviso lido deixa de ser considerado novo na prioridade da Home', async () => {
  const service = new AnnouncementService();
  service.listActiveAnnouncements = async () => [
    announcement({ id: 'read-urgent', priority: 'urgent', read: { read_at: NOW.toISOString() } }),
    announcement({ id: 'unread', read: null }),
  ];
  assert.equal((await service.getCurrentHomeAnnouncement({})).id, 'unread');
});

test('evento novo aparece antes de aviso fixado comum e de conselho automático', async () => {
  const service = new AnnouncementService();
  service.listActiveAnnouncements = async () => [
    announcement({ id: 'fixed', is_pinned: true, read: { read_at: NOW.toISOString() } }),
    announcement({ id: 'event', category: 'event', read: null }),
  ];
  assert.equal((await service.getCurrentHomeAnnouncement({})).id, 'event');
});

test('aviso administrativo não lido precede mensagem motivacional administrativa', async () => {
  const service = new AnnouncementService();
  service.listActiveAnnouncements = async () => [
    announcement({ id: 'focus', category: 'focus', read: null }),
    announcement({ id: 'update', category: 'update', read: null }),
  ];
  assert.equal((await service.getCurrentHomeAnnouncement({})).id, 'update');
});

test('regras de dispensa protegem urgente, fixado e manutenção crítica', () => {
  assert.equal(canDismissAnnouncement(announcement({ priority: 'urgent' })), false);
  assert.equal(canDismissAnnouncement(announcement({ is_pinned: true })), false);
  assert.equal(canDismissAnnouncement(announcement({ category: 'maintenance', priority: 'high' })), false);
  assert.equal(canDismissAnnouncement(announcement({ category: 'focus', priority: 'normal' })), true);
});

test('aceita URL HTTPS e rota interna permitida', () => {
  assert.equal(validateAnnouncementInput(validInput({
    cta_type: 'external_url',
    cta_label: 'Abrir',
    cta_value: 'https://example.com/aviso',
  })).cta_value, 'https://example.com/aviso');
  assert.equal(validateAnnouncementInput(validInput({
    cta_type: 'internal_route',
    cta_label: 'Revisar',
    cta_value: 'review',
  })).cta_value, 'review');
});

test('bloqueia javascript, protocolos desconhecidos e rota interna não permitida', () => {
  for (const url of ['javascript:alert(1)', 'data:text/plain,x', 'file:///tmp/a', 'ftp://example.com']) {
    assert.throws(() => validateAnnouncementInput(validInput({
      cta_type: 'external_url',
      cta_label: 'Abrir',
      cta_value: url,
    })), /https/i);
  }
  assert.throws(() => validateAnnouncementInput(validInput({
    cta_type: 'internal_route',
    cta_label: 'Abrir',
    cta_value: 'admin-secret',
  })), /Rota interna não permitida/);
});

test('valida limites, datas, sugestões e rejeita HTML', () => {
  assert.throws(() => validateAnnouncementInput(validInput({ title: 'x'.repeat(81) })), /80/);
  assert.throws(() => validateAnnouncementInput(validInput({ ends_at: '2026-07-23T09:00:00Z' })), /posterior/);
  assert.throws(() => validateAnnouncementInput(validInput({ suggestions: ['1', '2', '3', '4', '5', '6'] })), /cinco/);
  assert.throws(() => validateAnnouncementInput(validInput({ body: '<img src=x>' })), /HTML/);
});
