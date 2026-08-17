import { isDeveloperUser } from './authService.js';
import { isCourseFactoryStudentPreview } from '../services/courseFactoryPreviewService.js';

export const STUDENT_ENTRY = './index.html';
export const ADMIN_ENTRY = './admin.html';

export function entryForUser(user) {
  return isDeveloperUser(user) ? ADMIN_ENTRY : STUDENT_ENTRY;
}

export function isAdminDocument(pathname = globalThis.location?.pathname || '') {
  return /\/admin\.html$/i.test(pathname);
}

export function redirectForRole(user, {
  pathname = globalThis.location?.pathname || '',
  search = globalThis.location?.search || '',
  replace = (target) => globalThis.location?.replace?.(target),
} = {}) {
  const adminDocument = isAdminDocument(pathname);
  if (isDeveloperUser(user) && !adminDocument && !isCourseFactoryStudentPreview(search)) {
    replace(ADMIN_ENTRY);
    return ADMIN_ENTRY;
  }
  if (!isDeveloperUser(user) && adminDocument) {
    replace(STUDENT_ENTRY);
    return STUDENT_ENTRY;
  }
  return null;
}
