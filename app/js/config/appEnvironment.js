import { ENV } from './env.js';

export const APP_ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
});

export function getAppEnvironment() {
  const value = String(ENV.APP_ENV || '').trim().toLowerCase();
  if (!Object.values(APP_ENVIRONMENTS).includes(value)) {
    throw new Error(`APP_ENV inválido: ${value || '(vazio)'}.`);
  }
  return value;
}

export function isLocalDevelopment() {
  return getAppEnvironment() === APP_ENVIRONMENTS.DEVELOPMENT;
}

export function requiresRemoteBackend() {
  return !isLocalDevelopment();
}

export function environmentLabel() {
  return isLocalDevelopment() ? 'DESENVOLVIMENTO LOCAL' : getAppEnvironment().toUpperCase();
}
