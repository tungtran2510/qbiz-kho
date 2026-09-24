// ==============================================================================
// QBIZ KHO PRODUCTION V1 — AUTHENTICATION & MULTI-TENANT CLIENT (GATE 1)
// Spec: QBIZ_KHO_MASTER_PRODUCTION_V1_SYNC01.md (§3, §4, §14, §16, §20, §22)
// ==============================================================================

import { CONFIG } from './config.js';
import { ROLES, hasCapability } from './capabilities.js';

export const AUTH_STATES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  AUTHENTICATED_NO_SHOP: 'AUTHENTICATED_NO_SHOP',
  AUTHENTICATED_SHOP_READY: 'AUTHENTICATED_SHOP_READY',
};

const STORAGE_SESSION_KEY = 'qbiz_auth_session';
const STORAGE_ACTIVE_SHOP_KEY = 'qbiz_active_shop';

let currentSession = null;
let currentShop = null;
let currentMembership = null;
const listeners = new Set();

function emitState() {
  const state = getAuthState();
  listeners.forEach(fn => {
    try { fn(state); } catch (e) { console.error('Auth listener error:', e); }
  });
}

export function subscribeAuthState(callback) {
  listeners.add(callback);
  callback(getAuthState());
  return () => listeners.delete(callback);
}

export function getAuthState() {
  if (!currentSession || !currentSession.user) {
    return {
      status: AUTH_STATES.UNAUTHENTICATED,
      user: null,
      shop: null,
      role: null,
      membership: null,
    };
  }
  if (!currentShop) {
    return {
      status: AUTH_STATES.AUTHENTICATED_NO_SHOP,
      user: currentSession.user,
      shop: null,
      role: null,
      membership: null,
    };
  }
  return {
    status: AUTH_STATES.AUTHENTICATED_SHOP_READY,
    user: currentSession.user,
    shop: currentShop,
    role: currentMembership?.role || ROLES.CASHIER,
    membership: currentMembership,
  };
}

export function getCurrentUser() {
  return currentSession?.user || null;
}

export function getActiveShop() {
  return currentShop;
}

export function getCurrentRole() {
  return currentMembership?.role || null;
}

export function userCan(capability) {
  const role = getCurrentRole();
  return hasCapability(role, capability);
}

export function getSupabaseConfig() {
  const url = CONFIG.SUPABASE_URL || localStorage.getItem('qbiz_supabase_url') || '';
  const anonKey = CONFIG.SUPABASE_ANON_KEY || localStorage.getItem('qbiz_supabase_anon_key') || '';
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export async function supabaseFetch(path, options = {}) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error('Chưa cấu hình Supabase Cloud URL / Anon Key.');
  }

  const headers = {
    'apikey': anonKey,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (currentSession?.access_token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${currentSession.access_token}`;
  }

  const endpoint = `${url}${path}`;
  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const errorMsg = data?.msg || data?.message || data?.error_description || (typeof data === 'string' ? data : `Lỗi máy chủ (${response.status})`);
    const err = new Error(translateAuthError(errorMsg));
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

function translateAuthError(msg) {
  if (!msg) return 'Đã xảy ra lỗi không xác định.';
  const str = String(msg).toLowerCase();
  if (str.includes('invalid login credentials') || str.includes('invalid_grant')) {
    return 'Email hoặc mật khẩu không chính xác.';
  }
  if (str.includes('user already registered')) {
    return 'Email này đã được đăng ký tài khoản.';
  }
  if (str.includes('password should be at least')) {
    return 'Mật khẩu phải có tối thiểu 6 ký tự.';
  }
  if (str.includes('networkerror') || str.includes('failed to fetch')) {
    return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.';
  }
  return msg;
}

/**
 * Initialize session from storage on app load.
 */
export async function initAuth() {
  try {
    const saved = localStorage.getItem(STORAGE_SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.user && parsed.access_token) {
        currentSession = parsed;
        const savedShop = localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY);
        if (savedShop) {
          const shopData = JSON.parse(savedShop);
          currentShop = shopData.shop || null;
          currentMembership = shopData.membership || null;
        }

        // Try background token refresh if token might be expired
        tryRefreshToken().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc session lưu trữ:', err);
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }
  emitState();
  return getAuthState();
}

/**
 * Register a new user with email and password.
 */
export async function signUp({ email, password, fullName = '' }) {
  if (!email || !password) throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
  if (password.length < 6) throw new Error('Mật khẩu cần tối thiểu 6 ký tự.');

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    // Local / Dev Fallback simulation
    const mockId = `mock_user_${Date.now().toString(36)}`;
    const mockSession = {
      access_token: `mock_jwt_${Date.now()}`,
      refresh_token: `mock_refresh_${Date.now()}`,
      user: {
        id: mockId,
        email: email.trim().toLowerCase(),
        user_metadata: { full_name: fullName.trim() },
        created_at: new Date().toISOString(),
      },
    };
    currentSession = mockSession;
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
    emitState();
    return getAuthState();
  }

  const payload = {
    email: email.trim().toLowerCase(),
    password,
    data: { full_name: fullName.trim() },
  };

  const res = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (res.session) {
    currentSession = res.session;
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
  } else if (res.user) {
    currentSession = {
      user: res.user,
      access_token: res.access_token || '',
      refresh_token: res.refresh_token || '',
    };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
  }

  emitState();
  return getAuthState();
}

/**
 * Sign in existing user with email and password.
 */
export async function signIn({ email, password }) {
  if (!email || !password) throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    // Local / Dev Fallback simulation
    const mockId = `mock_user_${email.replace(/[^a-z0-9]/gi, '_')}`;
    const mockSession = {
      access_token: `mock_jwt_${Date.now()}`,
      refresh_token: `mock_refresh_${Date.now()}`,
      user: {
        id: mockId,
        email: email.trim().toLowerCase(),
        user_metadata: { full_name: 'Chủ shop' },
        created_at: new Date().toISOString(),
      },
    };
    currentSession = mockSession;
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
    
    // Check if mock shop exists in localStorage
    const savedShop = localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY);
    if (savedShop) {
      const parsed = JSON.parse(savedShop);
      currentShop = parsed.shop;
      currentMembership = parsed.membership;
    }

    emitState();
    return getAuthState();
  }

  const res = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  currentSession = {
    access_token: res.access_token,
    refresh_token: res.refresh_token,
    expires_in: res.expires_in,
    user: res.user,
  };
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));

  // Load user's shops
  await loadUserShops();

  emitState();
  return getAuthState();
}

/**
 * Sign out current user. Preserves local IndexedDB data!
 */
export async function signOut() {
  try {
    const { url } = getSupabaseConfig();
    if (url && currentSession?.access_token) {
      await supabaseFetch('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.warn('Signout API warning:', err);
  } finally {
    currentSession = null;
    currentShop = null;
    currentMembership = null;
    localStorage.removeItem(STORAGE_SESSION_KEY);
    localStorage.removeItem(STORAGE_ACTIVE_SHOP_KEY);
    emitState();
  }
}

/**
 * Refresh access token using refresh token.
 */
export async function tryRefreshToken() {
  if (!currentSession?.refresh_token) return;
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return;

  try {
    const res = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
    });

    if (res?.access_token) {
      currentSession.access_token = res.access_token;
      currentSession.refresh_token = res.refresh_token || currentSession.refresh_token;
      if (res.user) currentSession.user = res.user;
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
      emitState();
    }
  } catch (err) {
    console.warn('Không thể refresh token:', err);
  }
}

/**
 * Create a new Shop and assign the creator as OWNER.
 */
export async function createShop({ name }) {
  if (!currentSession?.user) throw new Error('Vui lòng đăng nhập trước khi tạo cửa hàng.');
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Tên cửa hàng không được để trống.');

  const userId = currentSession.user.id;
  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey) {
    // Local / Dev Fallback simulation
    const shopId = `shop_${Date.now().toString(36)}`;
    const shop = {
      id: shopId,
      name: trimmedName,
      owner_user_id: userId,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    const membership = {
      id: `mem_${Date.now().toString(36)}`,
      shop_id: shopId,
      user_id: userId,
      role: ROLES.OWNER,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    currentShop = shop;
    currentMembership = membership;
    localStorage.setItem(STORAGE_ACTIVE_SHOP_KEY, JSON.stringify({ shop, membership }));
    emitState();
    return { shop, membership };
  }

  // 1. Insert Shop
  const [shop] = await supabaseFetch('/rest/v1/shops', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      name: trimmedName,
      owner_user_id: userId,
      status: 'ACTIVE',
    }),
  });

  if (!shop?.id) throw new Error('Không thể tạo thông tin cửa hàng trên máy chủ.');

  // 2. Insert Membership as OWNER
  const [membership] = await supabaseFetch('/rest/v1/memberships', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      shop_id: shop.id,
      user_id: userId,
      role: ROLES.OWNER,
      status: 'ACTIVE',
    }),
  });

  // 3. Provision Default Warehouse & Register
  await Promise.all([
    supabaseFetch('/rest/v1/warehouses', {
      method: 'POST',
      body: JSON.stringify({
        shop_id: shop.id,
        name: 'Kho chính',
        is_default: true,
        version: 1,
      }),
    }).catch(e => console.warn('Tạo kho mặc định:', e)),
    supabaseFetch('/rest/v1/registers', {
      method: 'POST',
      body: JSON.stringify({
        shop_id: shop.id,
        name: 'Quầy chính',
        status: 'ACTIVE',
      }),
    }).catch(e => console.warn('Tạo quầy mặc định:', e)),
  ]);

  currentShop = shop;
  currentMembership = membership;
  localStorage.setItem(STORAGE_ACTIVE_SHOP_KEY, JSON.stringify({ shop, membership }));

  emitState();
  return { shop, membership };
}

/**
 * Load user's shops and memberships from server.
 */
export async function loadUserShops() {
  if (!currentSession?.user) return [];
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    const saved = localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      currentShop = parsed.shop;
      currentMembership = parsed.membership;
      return [parsed];
    }
    return [];
  }

  try {
    const memberships = await supabaseFetch(
      `/rest/v1/memberships?user_id=eq.${currentSession.user.id}&status=eq.ACTIVE&select=*,shops(*)`,
      { method: 'GET' }
    );

    if (Array.isArray(memberships) && memberships.length > 0) {
      const active = memberships[0];
      currentShop = active.shops;
      currentMembership = {
        id: active.id,
        shop_id: active.shop_id,
        user_id: active.user_id,
        role: active.role,
        status: active.status,
      };
      localStorage.setItem(STORAGE_ACTIVE_SHOP_KEY, JSON.stringify({ shop: currentShop, membership: currentMembership }));
    } else {
      currentShop = null;
      currentMembership = null;
      localStorage.removeItem(STORAGE_ACTIVE_SHOP_KEY);
    }
  } catch (err) {
    console.warn('Lỗi tải danh sách cửa hàng:', err);
  }

  emitState();
  return currentShop ? [{ shop: currentShop, membership: currentMembership }] : [];
}

/**
 * Add / Invite a new member to the current shop. (OWNER only)
 */
export async function addMember({ email, role }) {
  if (!userCan('MANAGE_USERS')) throw new Error('Bạn không có quyền quản lý thành viên cửa hàng.');
  if (!currentShop?.id) throw new Error('Chưa chọn cửa hàng.');
  if (!email || !role) throw new Error('Vui lòng cung cấp email và vai trò.');

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    // Local / Dev Fallback simulation
    const mockMem = {
      id: `mem_${Date.now().toString(36)}`,
      shop_id: currentShop.id,
      user_id: `user_${email.replace(/[^a-z0-9]/gi, '_')}`,
      role: role.toUpperCase(),
      status: 'ACTIVE',
      email: email.trim().toLowerCase(),
      created_at: new Date().toISOString(),
    };
    return mockMem;
  }

  // Look up user by email via custom secure RPC or insert invite
  const [membership] = await supabaseFetch('/rest/v1/memberships', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      shop_id: currentShop.id,
      role: role.toUpperCase(),
      status: 'ACTIVE',
      invited_by: currentSession.user.id,
    }),
  });

  return membership;
}

/**
 * Disable a membership. (OWNER only)
 */
export async function disableMember(membershipId) {
  if (!userCan('MANAGE_USERS')) throw new Error('Bạn không có quyền quản lý thành viên.');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return { id: membershipId, status: 'DISABLED' };
  }

  const [updated] = await supabaseFetch(`/rest/v1/memberships?id=eq.${membershipId}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ status: 'DISABLED', updated_at: new Date().toISOString() }),
  });
  return updated;
}
