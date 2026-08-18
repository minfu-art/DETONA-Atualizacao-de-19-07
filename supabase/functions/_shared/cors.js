const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
const ALLOWED_METHODS = 'POST, OPTIONS';
const DETONA_STAGING_PREVIEW = /^(?:detona-staging-[a-z0-9]{9}-min-fu-projetos|detona-staging-git-(?:fix-p0-foundation|feat-detona-course-factory)-min-fu-projetos)\.vercel\.app$/;

export function createAllowedOrigins(value = '') {
  const origins = new Set();
  for (const candidate of String(value).split(',')) {
    const clean = candidate.trim();
    if (!clean) continue;
    try {
      const url = new URL(clean);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === clean.replace(/\/$/, '')) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid entries are ignored instead of broadening the allowlist.
    }
  }
  return origins;
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:'
      && url.origin === origin
      && DETONA_STAGING_PREVIEW.test(url.hostname);
  } catch {
    return false;
  }
}

export function corsHeaders(origin, allowedOrigins) {
  const headers = {
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (isAllowedOrigin(origin, allowedOrigins)) headers['access-control-allow-origin'] = origin;
  return headers;
}

export function jsonResponse(status, payload, origin, allowedOrigins) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin, allowedOrigins),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function handleCorsPreflight(request, allowedOrigins) {
  if (request.method !== 'OPTIONS') return null;
  const origin = request.headers.get('origin') || '';
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return jsonResponse(403, { error: 'origin_not_allowed' }, origin, allowedOrigins);
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, allowedOrigins),
  });
}
