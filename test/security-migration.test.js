import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/002_security_hardening.sql', import.meta.url), 'utf8');

test('entitlements mantêm somente leitura própria para authenticated', () => {
  assert.match(sql, /drop policy if exists entitlements_write_own/i);
  assert.match(sql, /create policy entitlements_select_own[\s\S]*for select to authenticated[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(sql, /revoke insert, update, delete on table public\.contest_entitlements from authenticated/i);
  assert.doesNotMatch(sql, /create policy\s+\w*entitlement\w*[\s\S]{0,120}for\s+(all|insert|update|delete)\s+to authenticated/i);
});

test('profiles limitam update do aluno a colunas seguras', () => {
  assert.match(sql, /drop policy if exists profiles_insert_own/i);
  assert.match(sql, /revoke insert, update, delete on table public\.profiles from authenticated/i);
  assert.match(sql, /grant update \(name, preferences\) on table public\.profiles to authenticated/i);
  assert.doesNotMatch(sql, /grant update \([^)]*(role|enabled_modules|email|updated_at)[^)]*\).*authenticated/i);
});

test('leituras próprias e operação por service_role continuam previstas', () => {
  assert.match(sql, /profiles_select_own[\s\S]*auth\.uid\(\) = id/i);
  assert.match(sql, /entitlements_select_own[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(sql, /grant all privileges on table public\.profiles to service_role/i);
  assert.match(sql, /grant all privileges on table public\.contest_entitlements to service_role/i);
});
