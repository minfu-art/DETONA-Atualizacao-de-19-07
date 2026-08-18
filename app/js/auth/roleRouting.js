import { isDeveloperUser } from './authService.js';
import { isCourseFactoryStudentPreview } from '../services/courseFactoryPreviewService.js';
import { APP_ENVIRONMENTS, getAppEnvironment } from '../config/appEnvironment.js';

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
  environment = getAppEnvironment(),
  replace = (target) => globalThis.location?.replace?.(target),
} = {}) {
  const adminDocument = isAdminDocument(pathname);
  const stagingHomologation = isDeveloperUser(user) && environment === APP_ENVIRONMENTS.STAGING;
  if (isDeveloperUser(user) && !adminDocument && !isCourseFactoryStudentPreview(search) && !stagingHomologation) {
    replace(ADMIN_ENTRY);
    return ADMIN_ENTRY;
  }
  if (!isDeveloperUser(user) && adminDocument) {
    replace(STUDENT_ENTRY);
    return STUDENT_ENTRY;
  }
  return null;
}
