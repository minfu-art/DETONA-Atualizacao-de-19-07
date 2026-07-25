let activePackage = null;

export function setActiveContestContent(contentPackage) {
  activePackage = contentPackage ? structuredClone(contentPackage) : null;
  return getActiveContestContent();
}

export function getActiveContestContent() {
  return activePackage ? structuredClone(activePackage) : null;
}

export function clearActiveContestContent() {
  activePackage = null;
}

export function isDynamicContestContent() {
  return Boolean(activePackage?.version && activePackage?.contestId !== 'pc_al_2026');
}
