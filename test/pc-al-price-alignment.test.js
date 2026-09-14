import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/20260914234129_set_pc_al_price_2490.sql',
  import.meta.url,
);

test('PC AL migration aligns the checkout source with BRL 24.90', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /where id = 'pc_al_2026'/i);
  assert.match(sql, /set price_cents = 2490/i);
  assert.match(sql, /currency = 'BRL'/i);
  assert.match(sql, /current_price not in \(2490, 6999, 14990\)/i);
});
