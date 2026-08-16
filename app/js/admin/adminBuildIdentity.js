const ENVIRONMENT_LABELS = Object.freeze({
  production: 'PRODUÇÃO',
  preview: 'PREVIEW',
  local: 'LOCAL',
});

function normalizeEnvironment(value) {
  const environment = String(value || '').trim().toLowerCase();
  return Object.hasOwn(ENVIRONMENT_LABELS, environment) ? environment : 'local';
}

function normalizeCommitSha(value) {
  const commitSha = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{7,40}$/.test(commitSha) ? commitSha : '';
}

function formatBuildTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function readAdminBuildIdentity(runtime = globalThis.__DETONA_ENV__ || {}) {
  const environment = normalizeEnvironment(runtime.BUILD_ENVIRONMENT);
  const commitSha = normalizeCommitSha(runtime.BUILD_COMMIT_SHA);
  const gitRef = String(runtime.BUILD_GIT_REF || '').trim().slice(0, 160);
  const buildTime = String(runtime.BUILD_TIME || '').trim();

  return Object.freeze({
    environment,
    environmentLabel: ENVIRONMENT_LABELS[environment],
    commitSha,
    shortCommit: commitSha ? commitSha.slice(0, 7) : 'desconhecido',
    gitRef,
    buildTime,
    buildTimeLabel: formatBuildTime(buildTime),
  });
}
