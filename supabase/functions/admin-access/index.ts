import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createAdminAccessHandler } from './core.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins = (Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Configuração segura da Edge Function incompleta.');
}

const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ListUsersInput = {
  search: string;
  page: number;
  pageSize: number;
};

type ChangeAccessInput = {
  actorUserId: string;
  targetUserId: string;
  contestId: string;
  action: 'grant_access' | 'revoke_access' | 'reactivate_access';
};

type EntitlementRow = {
  user_id: string;
  contest_id: string;
  status: string;
  granted_at: string;
  source: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '';
  return {
    ...(allowedOrigin ? { 'access-control-allow-origin': allowedOrigin } : {}),
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

async function resolveIdentity(token: string) {
  const userClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) throw new Error('unauthorized');

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('id,role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw new Error('unauthorized');
  return { userId: authData.user.id, role: profile?.role || null };
}

const repository = {
  async listUsers({ search, page, pageSize }: ListUsersInput) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    let query = adminClient
      .from('profiles')
      .select('id,name,email,role,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(start, end);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data: profiles, count, error } = await query;
    if (error) throw new Error('list_failed');

    const userIds = (profiles || []).map((profile) => profile.id);
    let entitlements: EntitlementRow[] = [];
    if (userIds.length) {
      const result = await adminClient
        .from('contest_entitlements')
        .select('user_id,contest_id,status,granted_at,source')
        .eq('contest_id', 'pc_al_2026')
        .in('user_id', userIds);
      if (result.error) throw new Error('entitlements_failed');
      entitlements = result.data || [];
    }
    const entitlementByUser = new Map(entitlements.map((item) => [item.user_id, item]));
    return {
      users: (profiles || []).map((profile) => ({
        ...profile,
        entitlement: entitlementByUser.get(profile.id) || null,
      })),
      total: count || 0,
    };
  },

  async userExists(userId: string) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error('target_lookup_failed');
    return Boolean(data);
  },

  async entitlementExists(userId: string, contestId: string) {
    const { data, error } = await adminClient
      .from('contest_entitlements')
      .select('id')
      .eq('user_id', userId)
      .eq('contest_id', contestId)
      .maybeSingle();
    if (error) throw new Error('access_lookup_failed');
    return Boolean(data);
  },

  async changeAccess({ actorUserId, targetUserId, contestId, action }: ChangeAccessInput) {
    const { data, error } = await adminClient.rpc('admin_set_contest_access', {
      p_actor_user_id: actorUserId,
      p_target_user_id: targetUserId,
      p_contest_id: contestId,
      p_action: action,
    });
    if (error || !data?.[0]) throw new Error('access_change_failed');
    return data[0];
  },
};

Deno.serve((request) => createAdminAccessHandler({
  resolveIdentity,
  repository,
  corsHeaders: corsHeaders(request),
})(request));
