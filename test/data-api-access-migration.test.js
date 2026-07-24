import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/003_explicit_data_api_access.sql', import.meta.url),
  'utf8',
);

const privateTables = [
  'profiles',
  'contest_entitlements',
  'progress_records',
  'players',
  'subtopic_progress',
  'daily_logs',
  'review_queue',
  'wellbeing_logs',
  'routine_blocks',
];

const syncedTables = [
  'progress_records',
  'players',
  'subtopic_progress',
  'daily_logs',
  'review_queue',
  'wellbeing_logs',
  'routine_blocks',
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('anon não recebe privilégios nas tabelas privadas', () => {
  for (const table of privateTables) {
    assert.match(sql, new RegExp(`revoke all privileges on table public\\.${escapeRegex(table)} from anon`, 'i'));
    assert.doesNotMatch(sql, new RegExp(`grant[^;]+on table public\\.${escapeRegex(table)} to anon`, 'i'));
  }
});

test('profiles só permitem leitura e atualização de campos seguros', () => {
  assert.match(sql, /grant select on table public\.profiles to authenticated/i);
  assert.match(sql, /grant update \(name, preferences\) on table public\.profiles to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|delete)[^;]*public\.profiles to authenticated/i);
  assert.doesNotMatch(sql, /grant update \([^)]*(role|enabled_modules|email|updated_at)[^)]*\)[^;]*to authenticated/i);
  assert.match(sql, /profiles_select_own[\s\S]*?for select to authenticated[\s\S]*?\(select auth\.uid\(\)\) = id/i);
  assert.match(sql, /profiles_update_safe_own[\s\S]*?for update to authenticated[\s\S]*?\(select auth\.uid\(\)\) = id/i);
});

test('authenticated não escreve em contest_entitlements', () => {
  assert.match(sql, /grant select on table public\.contest_entitlements to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*public\.contest_entitlements to authenticated/i);
  assert.doesNotMatch(sql, /create policy\s+\w*entitlement\w*[\s\S]{0,160}for\s+(insert|update|delete|all)\s+to authenticated/i);
});

test('sincronização tem DML mínimo e RLS por user_id', () => {
  for (const table of syncedTables) {
    assert.match(
      sql,
      new RegExp(`grant select, insert, update, delete on table public\\.${escapeRegex(table)} to authenticated`, 'i'),
    );
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      assert.match(
        sql,
        new RegExp(`create policy [^;]+ on public\\.${escapeRegex(table)}\\s+for ${operation} to authenticated[\\s\\S]*?\\(select auth\\.uid\\(\\)\\) = user_id`, 'i'),
      );
    }
  }
});

test('service_role mantém DML administrativo explícito', () => {
  for (const table of privateTables) {
    assert.match(
      sql,
      new RegExp(`grant select, insert, update, delete on table public\\.${escapeRegex(table)} to service_role`, 'i'),
    );
  }
});

test('funções de trigger não são chamáveis pelos papéis do frontend', () => {
  for (const fn of ['handle_new_user', 'set_updated_at']) {
    assert.match(
      sql,
      new RegExp(`revoke execute on function public\\.${fn}\\(\\) from public, anon, authenticated`, 'i'),
    );
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(\\) to service_role`, 'i'));
  }
});
