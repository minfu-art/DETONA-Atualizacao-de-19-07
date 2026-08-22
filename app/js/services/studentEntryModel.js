const CHECKOUT_RETURN_VALUES = new Set(['success', 'cancelled']);
const COMMERCIAL_SOURCE = 'detona-site';
const SAFE_CONTEST_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;

export function readCommercialIntent(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));
  if (params.get('source') !== COMMERCIAL_SOURCE) return null;
  const contestId = String(params.get('contestId') || '').trim();
  if (!SAFE_CONTEST_ID.test(contestId)) return null;
  const courseId = String(params.get('courseId') || '').trim();
  const salesPage = String(params.get('salesPage') || '').trim();
  return Object.freeze({
    source: COMMERCIAL_SOURCE,
    contestId,
    courseId: SAFE_CONTEST_ID.test(courseId) ? courseId : null,
    salesPage: SAFE_CONTEST_ID.test(salesPage) ? salesPage : null,
    directCheckout: params.get('action') === 'buy',
  });
}

export function resolveCommercialIntent(intent, items = []) {
  if (!intent) return null;
  const item = items.find(({ contest }) => contest?.id === intent.contestId);
  if (!item) return { state: 'unavailable', item: null };
  if (item.owned) return { state: 'owned', item };
  if (item.accessVerificationRequired) return { state: 'offline', item };
  if (item.checkoutAction?.action === 'purchase' && item.checkoutAction.disabled !== true) {
    return { state: 'ready', item };
  }
  return { state: 'unavailable', item };
}

export function directCheckoutContestId(intent, items = []) {
  if (intent?.directCheckout !== true) return null;
  const resolution = resolveCommercialIntent(intent, items);
  return resolution?.state === 'ready' ? resolution.item.contest.id : null;
}

export function partitionLibrary(items = []) {
  return {
    owned: items.filter((item) => item?.owned),
    offers: items.filter((item) => !item?.owned),
  };
}

export function partitionCommercialLibrary(items = []) {
  const { owned, offers } = partitionLibrary(items);
  return {
    owned,
    available: offers.filter(({ contest }) => contest?.salesStatus === 'available'),
    upcoming: offers.filter(({ contest }) => ['monitoring', 'coming_soon'].includes(contest?.salesStatus)),
  };
}

export function formatCanonicalPrice(contest) {
  const amount = Number(contest?.priceCents);
  const currency = String(contest?.currency || 'BRL');
  if (!Number.isFinite(amount) || amount <= 0) return null;
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return null;
  }
}

export function readCheckoutReturn(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));
  const state = params.get('checkout');
  if (!CHECKOUT_RETURN_VALUES.has(state)) return null;
  const contestId = String(params.get('contest') || '').trim();
  return Object.freeze({ state, contestId: contestId || null });
}

export function resolveCheckoutReturn(returnState, items = []) {
  if (!returnState) return null;
  const item = returnState.contestId
    ? items.find(({ contest }) => contest?.id === returnState.contestId)
    : null;
  if (returnState.state === 'cancelled') {
    return {
      tone: 'warning',
      title: 'Compra não concluída.',
      description: 'Nenhum acesso foi concedido. Você pode tentar novamente quando o checkout estiver disponível.',
      contestId: returnState.contestId,
      retryAllowed: Boolean(item && !item.owned && item.checkoutAction?.action === 'purchase'),
    };
  }
  if (item?.owned) {
    return {
      tone: 'success',
      title: 'Acesso confirmado.',
      description: `${item.contest.name} já está disponível em Meus cursos.`,
      contestId: item.contest.id,
      confirmed: true,
    };
  }
  return {
    tone: 'info',
    title: 'Estamos confirmando seu acesso.',
    description: 'A compra só libera o curso depois da confirmação segura no servidor.',
    contestId: returnState.contestId,
    pending: true,
  };
}

export function checkoutActionFor(item, capability = {}) {
  const { contest = {}, owned, accessVerificationRequired } = item || {};
  if (accessVerificationRequired) {
    return { label: 'Conecte-se para validar', action: 'none', disabled: true };
  }
  if (owned && contest.contentStatus === 'ready') {
    return { label: item.summary ? 'Continuar' : 'Começar', action: 'open', disabled: false };
  }
  if (contest.salesStatus === 'unavailable' || contest.contentStatus !== 'ready') {
    return { label: 'Em preparação', action: 'none', disabled: true };
  }
  if (contest.salesStatus === 'coming_soon') {
    return { label: 'Em breve', action: 'none', disabled: true };
  }
  if (contest.salesStatus === 'suspended') {
    return { label: 'Indisponível', action: 'none', disabled: true };
  }
  if (contest.salesStatus === 'available' && capability.configured === true) {
    return { label: 'Adquirir acesso', action: 'purchase', disabled: false };
  }
  return { label: 'Ver curso', action: 'details', disabled: false };
}

export function sanitizeLibrarySnapshot(items = []) {
  return items.map(({ contest, owned }) => ({
    contest: {
      id: contest.id,
      code: contest.code,
      name: contest.name,
      role: contest.role,
      description: contest.description,
      color: contest.color,
      accent: contest.accent,
      icon: contest.icon,
      contentStatus: contest.contentStatus,
      salesStatus: contest.salesStatus,
      coverAsset: contest.coverAsset,
      organization: contest.organization,
      examBoard: contest.examBoard,
      examDate: contest.examDate,
      priceCents: contest.priceCents,
      currency: contest.currency,
      careerArea: contest.careerArea,
      careerSubarea: contest.careerSubarea,
      subtopicCount: contest.subtopicCount,
      questionCount: contest.questionCount,
      interestCount: contest.interestCount,
      interested: contest.interested === true,
      interestGoal: contest.interestGoal ?? null,
    },
    owned: Boolean(owned),
  }));
}
