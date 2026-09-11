import { ENV } from '../config/env.js';

function safePublicUrl(value, fallback = null) {
  const input = String(value || '').trim();
  if (!input) return fallback;
  if (/^(?:https:\/\/|legal\.html(?:#|$))/i.test(input)) return input;
  return fallback;
}

function safeSupportEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? `mailto:${email}` : null;
}

export function getStudentEntryLinks() {
  const configuredCourses = safePublicUrl(ENV.PUBLIC_COURSES_URL);
  const courses = new URL(configuredCourses?.startsWith('https://') ? configuredCourses : 'https://detonaconcursos.com/cursos/');
  if (courses.hostname === 'detonaconcursos.com' && courses.pathname === '/') courses.pathname = '/cursos/';
  return Object.freeze({
    courses: courses.href,
    support: safeSupportEmail(ENV.SUPPORT_EMAIL || 'adm@detonaconcursos.com'),
    terms: safePublicUrl(ENV.TERMS_URL, 'legal.html#termos'),
    privacy: safePublicUrl(ENV.PRIVACY_URL, 'legal.html#privacidade'),
  });
}
