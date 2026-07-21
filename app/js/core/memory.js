/**
 * Temperatura da Memória (repetição espaçada visual)
 * - < 7 dias: quente
 * - 7–14 dias: morno
 * - 14–30 dias: frio
 * - > 30 dias: congelado
 */

/**
 * @param {string|null} lastStudiedAt ISO date string
 * @returns {'quente'|'morno'|'frio'|'congelado'}
 */
export function computeMemoryTemperature(lastStudiedAt) {
  if (!lastStudiedAt) return 'congelado';
  const ms = Date.now() - new Date(lastStudiedAt).getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 7) return 'quente';
  if (days < 14) return 'morno';
  if (days < 30) return 'frio';
  return 'congelado';
}

/**
 * Compatibilidade: a temperatura não reduz o domínio visual conquistado.
 * @param {{ stars: number, memory_temperature?: string, last_studied_at?: string|null }} sub
 */
export function effectiveStars(sub) {
  return Math.min(5, Math.max(0, Number(sub.stars) || 0));
}

export function tempLabel(temp) {
  const map = {
    quente: 'Quente',
    morno: 'Morno',
    frio: 'Frio',
    congelado: 'Congelado',
  };
  return map[temp] || temp;
}

export function tempClass(temp) {
  return `temp-${temp || 'morno'}`;
}
