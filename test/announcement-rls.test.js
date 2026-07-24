import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/005_administrative_announcements.sql', import.meta.url),
  'utf8',
);

test('migration cria as duas tabelas com RLS e mantém anon sem privilégios', () => {
  for (const table of ['announcements', 'announcement_reads']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all privileges on table public\\.${table} from anon`, 'i'));
    assert.doesNotMatch(sql, new RegExp(`grant[^;]+public\\.${table} to anon`, 'i'));
  }
});

test('aluno só lê avisos publicados, ativos, não arquivados e do público autorizado', () => {
  assert.match(sql, /create policy announcements_student_select_active/i);
  assert.match(sql, /is_published[\s\S]*archived_at is null[\s\S]*starts_at <= now\(\)[\s\S]*ends_at > now\(\)/i);
  assert.match(sql, /audience_type = 'all'[\s\S]*audience_type = 'contest'/i);
  assert.match(sql, /contest_entitlements[\s\S]*auth\.uid\(\)[\s\S]*status = 'active'/i);
});

test('somente developer cria e altera avisos, sempre em nome próprio', () => {
  assert.match(sql, /create policy announcements_admin_insert[\s\S]*created_by = \(select auth\.uid\(\)\)[\s\S]*profile\.role = 'developer'/i);
  assert.match(sql, /create policy announcements_admin_update[\s\S]*profile\.role = 'developer'/i);
  assert.doesNotMatch(sql, /create policy announcements_\w+[\s\S]{0,120}for delete to authenticated/i);
});

test('usuário não registra leitura em nome de outro usuário', () => {
  assert.match(sql, /announcement_reads_select_own[\s\S]*\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /announcement_reads_insert_own[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /announcement_reads_update_own[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test('constraints cobrem conteúdo, datas, sugestões, público, CTA e rotas', () => {
  assert.match(sql, /char_length\(title\) between 1 and 80/i);
  assert.match(sql, /char_length\(summary\) between 1 and 180/i);
  assert.match(sql, /char_length\(body\) between 1 and 4000/i);
  assert.match(sql, /jsonb_array_length\(suggestions\) <= 5/i);
  assert.match(sql, /ends_at is null or ends_at > starts_at/i);
  assert.match(sql, /cta_value ~ '\^https:\/\//i);
  for (const route of ['home', 'map', 'edital', 'expedition', 'performance', 'wellbeing', 'profile', 'review']) {
    assert.match(sql, new RegExp(`'${route}'`, 'i'));
  }
});
