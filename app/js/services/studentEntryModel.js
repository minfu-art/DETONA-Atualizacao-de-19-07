const CHECKOUT_RETURN_VALUES = new Set(['success', 'cancelled']);

export function partitionLibrary(items = []) {
  return {
    owned: items.filter((item) => item?.owned),
    offers: items.filter((item) => !item?.owned),
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
      careerArea: contest.careerArea,
      careerSubarea: contest.careerSubarea,
      subtopicCount: contest.subtopicCount,
      questionCount: contest.questionCount,
    },
    owned: Boolean(owned),
  }));
}
