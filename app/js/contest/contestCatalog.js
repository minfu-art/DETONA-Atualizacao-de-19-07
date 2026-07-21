export const CONTEST_CATALOG = [
  {
    id: 'pc_al_2026',
    code: 'PC AL',
    name: 'Policia Civil de Alagoas',
    role: 'Agente e Escrivao',
    color: '#7c6af5',
    accent: '#38bdf8',
    icon: 'PC',
    priceCents: 14990,
    currency: 'BRL',
    contentStatus: 'ready',
    description: 'Jornada completa com edital verticalizado, questoes e batalhas.',
  },
  {
    id: 'pf_2026',
    code: 'PF',
    name: 'Policia Federal',
    role: 'Agente de Policia Federal',
    color: '#0f766e',
    accent: '#5eead4',
    icon: 'PF',
    priceCents: 18990,
    currency: 'BRL',
    contentStatus: 'preparing',
    description: 'Modulo independente preparado para o proximo pacote editorial.',
  },
  {
    id: 'prf_2026',
    code: 'PRF',
    name: 'Policia Rodoviaria Federal',
    role: 'Policial Rodoviario Federal',
    color: '#b45309',
    accent: '#fbbf24',
    icon: 'PRF',
    priceCents: 17990,
    currency: 'BRL',
    contentStatus: 'preparing',
    description: 'Modulo independente pronto para receber edital e banco de questoes.',
  },
];

export function getContestById(contestId) {
  return CONTEST_CATALOG.find((contest) => contest.id === contestId) || null;
}

export function formatContestPrice(contest) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: contest.currency })
    .format(contest.priceCents / 100);
}
