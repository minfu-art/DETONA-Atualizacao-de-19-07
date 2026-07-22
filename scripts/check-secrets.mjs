import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
const files = listed.toString('utf8').split('\0').filter(Boolean);
const realEnv = files.filter((file) => {
  const name = basename(file);
  return (name === '.env' || name.startsWith('.env.')) && name !== '.env.example';
});

const patterns = [
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['Stripe/Mercado secret', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['JWT potencial', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/],
  ['service role atribuída', /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/i],
];
const findings = realEnv.map((file) => `${file}: arquivo ambiental real versionável`);

for (const file of files) {
  if (/\.(?:png|jpe?g|gif|webp|xlsx|pdf|ico|woff2?|zip)$/i.test(file)) continue;
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { continue; }
  for (const [label, pattern] of patterns) {
    if (pattern.test(source)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length) {
  console.error(`Verificação de segredos falhou:\n- ${findings.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Segredos: nenhum .env real ou padrão óbvio encontrado em ${files.length} arquivos.`);
}
