import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration001 = readFileSync(
  new URL('../supabase/migrations/001_detona_schema.sql', import.meta.url),
  'utf8',
);
const migration003 = readFileSync(
  new URL('../supabase/migrations/003_explicit_data_api_access.sql', import.meta.url),
  'utf8',
);
const migration004 = readFileSync(
  new URL('../supabase/migrations/004_fix_function_search_path.sql', import.meta.url),
  'utf8',
);

test('set_updated_at recebe search_path fixo na migration incremental', () => {
  assert.match(
    migration004,
    /alter function public\.set_updated_at\(\) set search_path = '';/i,
  );
  assert.doesNotMatch(migration004, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(migration004, /\b(create|drop|alter)\s+table\b/i);
});

test('handle_new_user continua protegido pela migration anterior', () => {
  assert.match(migration003, /alter function public\.handle_new_user\(\) set search_path = '';/i);
  assert.match(
    migration003,
    /revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated;/i,
  );
  assert.doesNotMatch(migration004, /handle_new_user/i);
});

test('triggers existentes permanecem preservados', () => {
  assert.match(migration001, /create trigger on_auth_user_created[\s\S]*public\.handle_new_user\(\)/i);
  assert.match(migration001, /create trigger set_updated_at[\s\S]*public\.set_updated_at\(\)/i);
  assert.doesNotMatch(migration004, /\b(create|drop|alter)\s+trigger\b/i);
});

test('migration 004 não amplia permissões da Data API', () => {
  assert.doesNotMatch(migration004, /\bgrant\b/i);
  assert.doesNotMatch(migration004, /\b(anon|authenticated)\b/i);
});
