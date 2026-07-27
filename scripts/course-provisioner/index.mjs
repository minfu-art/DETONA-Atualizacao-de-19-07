#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourseBundle } from './bundle.mjs';
import { AdminEdgeClient, configFromEnvironment } from './client.mjs';
import { ProvisionJournalStore } from './journal.mjs';
import { CourseProvisioner } from './provisioner.mjs';

const MODES = new Set(['validate', 'apply', 'verify']);

export function parseArguments(argv) {
  const options = {
    bundle: '',
    environment: '',
    mode: '',
    allowReplaceDraft: false,
    publishAppearance: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--allow-replace-draft') options.allowReplaceDraft = true;
    else if (token === '--publish-appearance') options.publishAppearance = true;
    else if (['--bundle', '--environment', '--mode'].includes(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${token} exige um valor.`);
      options[token.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${token}.`);
    }
  }
  if (!options.bundle) throw new Error('--bundle é obrigatório.');
  if (options.environment !== 'staging') throw new Error('--environment deve ser staging; produção é bloqueada.');
  if (!MODES.has(options.mode)) throw new Error('--mode deve ser validate, apply ou verify.');
  if (options.publishAppearance && options.mode !== 'apply') {
    throw new Error('--publish-appearance só pode ser usado com --mode apply.');
  }
  return options;
}

function sanitizeReport(report) {
  const blocked = /password|token|jwt|secret|service.?role|authorization|apikey/i;
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !blocked.test(key))
        .map(([key, item]) => [key, visit(item)]));
    }
    return typeof value === 'string' ? value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]') : value;
  };
  return visit(report);
}

export async function run(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArguments(argv);
  const bundle = await loadCourseBundle(options.bundle, { mode: options.mode });
  const client = dependencies.client || new AdminEdgeClient(configFromEnvironment(options.environment));
  const journalStore = dependencies.journalStore || new ProvisionJournalStore();
  const provisioner = dependencies.provisioner || new CourseProvisioner({
    client,
    journalStore,
    cwd: dependencies.cwd || process.cwd(),
  });
  if (options.mode === 'validate') return provisioner.validate(bundle, options);
  if (options.mode === 'apply') return provisioner.apply(bundle, options);
  return provisioner.verify(bundle, options);
}

async function main() {
  try {
    const report = await run();
    process.stdout.write(`${JSON.stringify(sanitizeReport(report), null, 2)}\n${report.result}\n`);
    process.exitCode = ['COURSE_PROVISION_INVALID', 'COURSE_PROVISION_CONFLICT', 'COURSE_PROVISION_PARTIAL'].includes(report.result) ? 2 : 0;
  } catch (error) {
    const code = String(error?.code || 'COURSE_PROVISION_BLOCKED').slice(0, 120);
    const safe = {
      result: code,
      stage: 'failed',
      message: /password|token|jwt|secret|service.?role|authorization|apikey/i.test(String(error?.message))
        ? 'Operação bloqueada por configuração de segurança.'
        : String(error?.message || 'Operação bloqueada.').slice(0, 500),
    };
    process.stderr.write(`${JSON.stringify(safe, null, 2)}\n${code}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
