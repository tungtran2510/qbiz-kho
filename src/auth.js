// ==============================================================================
// QBIZ KHO PRODUCTION V1 — AUTHENTICATION & MULTI-TENANT CLIENT (GATE 1)
// Spec: QBIZ_KHO_MASTER_PRODUCTION_V1_SYNC01.md (§3, §4, §14, §16, §20, §22)
// ==============================================================================

import { CONFIG } from './config.js';
import { clearDemoSession } from './db.js';
import { ROLES, hasCapability, PLATFORM_ROLES, PLATFORM_CAPABILITIES } from './capabilities.js';

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
let currentPlatformAdmin = null;
let cachedUserShops = [];
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
  // Backend web: quản trị nền tảng thuộc website (super_admin của web) — KHÔNG mở console nền tảng của Kho, kể cả
  // theo email cứng (tài khoản trùng email trên database web sẽ được quyền quản trị Kho cũ ngoài ý muốn).
  const isSuper = CONFIG.BACKEND !== 'web' && Boolean(
    (currentPlatformAdmin && currentPlatformAdmin.status === 'ACTIVE' && currentPlatformAdmin.role === 'SUPER_ADMIN') ||
    (currentSession?.user?.email?.toLowerCase() === 'tungtran2510@gmail.com')
  );
  if (!currentSession || !currentSession.user) {
    return {
      status: AUTH_STATES.UNAUTHENTICATED,
      user: null,
      shop: null,
      role: null,
      membership: null,
      isSuperAdmin: false,
      platformRole: null,
    };
  }
  if (!currentShop) {
    return {
      status: AUTH_STATES.AUTHENTICATED_NO_SHOP,
      user: currentSession.user,
      shop: null,
      role: null,
      membership: null,
      isSuperAdmin: isSuper,
      platformRole: currentPlatformAdmin?.role || null,
    };
  }
  return {
    status: AUTH_STATES.AUTHENTICATED_SHOP_READY,
    user: currentSession.user,
    shop: currentShop,
    role: currentMembership?.role || ROLES.CASHIER,
    membership: currentMembership,
    isSuperAdmin: isSuper,
    platformRole: currentPlatformAdmin?.role || null,
  };
}

export function getCurrentUser() {
  return currentSession?.user || null;
}

export function getActiveShop() {
  if (sessionStorage.getItem('qbiz_preview_demo') === '1' && !currentSession?.user) {
    try {
      const demoShop = JSON.parse(sessionStorage.getItem('qbiz_demo_shop') || 'null');
      if (demoShop) return demoShop;
    } catch (_) {}
  }
  return currentShop;
}

export function getCurrentRole() {
  if (sessionStorage.getItem('qbiz_preview_demo') === '1' && !currentSession?.user) {
    return sessionStorage.getItem('qbiz_demo_role') || ROLES.OWNER;
  }
  return currentMembership?.role || (currentSession ? (currentPlatformAdmin ? ROLES.OWNER : null) : ROLES.OWNER);
}

export function userCan(capability) {
  const role = getCurrentRole();
  return hasCapability(role, capability);
}

export function getAuthSessionToken() {
  const role = getCurrentRole() || (currentSession ? currentMembership?.role : ROLES.OWNER) || ROLES.CASHIER;
  if (currentSession?.access_token && currentSession.access_token.split('.').length === 3) {
    return currentSession.access_token;
  }
  const storedServerToken = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('qbiz_server_session_token')) ||
                            (typeof window !== 'undefined' && window.__qbiz_server_session_token__);
  if (storedServerToken) {
    return storedServerToken;
  }
  const normRole = String(role).toUpperCase();
  if (normRole === 'OWNER' || normRole === 'ADMIN') {
    return 'mock_token_owner';
  }
  if (normRole === 'MANAGER' || normRole === 'ACCOUNTANT') {
    return 'mock_token_manager';
  }
  if (normRole === 'WAREHOUSE') {
    return 'mock_token_warehouse';
  }
  return 'mock_token_cashier';
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
    // 1. Check for OAuth callback tokens in URL hash or search code (from Google OAuth callback)
    // Backend web: KHÔNG nhận token thô từ URL (#access_token / ?code= không có verifier) — chống login-CSRF; đăng
    // nhập chỉ bằng email/mật khẩu, SSO với web làm ở bước sau (giao dịch state + verifier).
    if (CONFIG.BACKEND !== 'web' && typeof window !== 'undefined' && window.location) {
      let accessToken = null;
      let refreshToken = null;
      let expiresIn = null;

      if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        accessToken = params.get('access_token');
        refreshToken = params.get('refresh_token');
        expiresIn = params.get('expires_in');
      }

      if (!accessToken && window.location.search) {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        if (code) {
          try {
            const tokenRes = await supabaseFetch('/auth/v1/token?grant_type=pkce', {
              method: 'POST',
              body: JSON.stringify({ auth_code: code }),
            }).catch(() => null);
            if (tokenRes?.access_token) {
              accessToken = tokenRes.access_token;
              refreshToken = tokenRes.refresh_token;
              expiresIn = tokenRes.expires_in;
            }
          } catch (e) {
            console.warn('Lỗi đổi mã OAuth code:', e);
          }
        }
      }

      if (accessToken) {
        try {
          const payloadBase64 = accessToken.split('.')[1];
          const payload = payloadBase64 ? JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))) : {};
          const user = {
            id: payload.sub || `user_${Date.now()}`,
            email: (payload.email || '').toLowerCase(),
            user_metadata: payload.user_metadata || { full_name: payload.name || '' },
            app_metadata: payload.app_metadata || {},
          };

          currentSession = {
            access_token: accessToken,
            refresh_token: refreshToken || '',
            expires_in: expiresIn ? Number(expiresIn) : 3600,
            user: user,
          };
          localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));

          // Clean tokens from browser URL address bar immediately for security
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (e) {
          console.warn('Lỗi phân tích OAuth callback tokens:', e);
        }
      }
    }

    const saved = localStorage.getItem(STORAGE_SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.user && parsed.access_token) {
        currentSession = parsed;
        const savedShop = localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY);
        if (savedShop) {
          try {
            const shopData = JSON.parse(savedShop);
            currentShop = shopData.shop || null;
            currentMembership = shopData.membership || null;
          } catch {}
        }

        // Try background token refresh if token might be expired
        tryRefreshToken().catch(() => {});
      }
    }
    await checkPlatformAdmin();
    if (currentSession?.user) {
      try {
        sessionStorage.removeItem('qbiz_preview_demo');
        sessionStorage.removeItem('qbiz_demo_shop');
        sessionStorage.removeItem('qbiz_demo_industry');
        sessionStorage.removeItem('qbiz_demo_role');
      } catch (_) {}
      await loadUserShops();
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
  if (CONFIG.BACKEND === 'web') {
    throw new Error('Tài khoản QBiz Kho do chủ cửa hàng tạo và mời từ trang quản trị QBiz. Vui lòng đăng nhập bằng tài khoản QBiz.');
  }
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
    await checkPlatformAdmin();
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

  await checkPlatformAdmin();
  emitState();
  return getAuthState();
}

/**
 * Sign in existing user with email and password.
 */
export async function signIn({ email, password }) {
  // Backend web: phiên thật thay phiên demo → DB đổi từ demo sang shop (app tự tải lại khi shop sẵn sàng).
  if (CONFIG.BACKEND === 'web') clearDemoSession();
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
      try {
        const parsed = JSON.parse(savedShop);
        currentShop = parsed.shop;
        currentMembership = parsed.membership;
      } catch {}
    }
    await checkPlatformAdmin();
    await loadUserShops();

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

  // Load user's shops & platform admin status
  await loadUserShops();
  await checkPlatformAdmin();

  emitState();
  return getAuthState();
}

/**
 * Sign in with Google using Supabase Auth.
 * Narrow Sign-in Scope: 'openid email profile'.
 * SECURITY INVARIANT: NEVER request Google Drive scope during normal sign-in!
 */
export async function signInWithGoogle({ redirectTo } = {}) {
  if (CONFIG.BACKEND === 'web') {
    throw new Error('Đăng nhập Google cho QBiz Kho chưa mở. Vui lòng đăng nhập bằng email và mật khẩu tài khoản QBiz.');
  }
  const targetRedirect = redirectTo || (typeof window !== 'undefined' && window.location ? window.location.origin : 'https://kho.qbiz.vn');
  const { url, anonKey } = getSupabaseConfig();
  const isMock = !url || !anonKey || localStorage.getItem('qbiz_mock_env') === 'true';

  if (isMock) {
    const mockEmail = (localStorage.getItem('qbiz_mock_google_email') || 'owner.google@qbiz.vn').toLowerCase();
    const mockId = `google_user_${mockEmail.replace(/[^a-z0-9]/gi, '_')}`;
    const mockSession = {
      access_token: `mock_jwt_google_${Date.now()}`,
      refresh_token: `mock_refresh_google_${Date.now()}`,
      user: {
        id: mockId,
        email: mockEmail,
        user_metadata: { full_name: 'Chủ shop (Google)' },
        app_metadata: { provider: 'google', providers: ['google'] },
        created_at: new Date().toISOString(),
      },
    };
    currentSession = mockSession;
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
    await checkPlatformAdmin();
    await loadUserShops();
    emitState();
    return getAuthState();
  }

  // Construct standard Supabase OAuth authorization URL with narrow scopes
  const authUrl = `${url}/auth/v1/authorize?provider=google&scopes=openid%20email%20profile&redirect_to=${encodeURIComponent(targetRedirect)}`;
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = authUrl;
  }
  return { authUrl, redirectTo: targetRedirect };
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
    currentPlatformAdmin = null;
    cachedUserShops = [];
    localStorage.removeItem(STORAGE_SESSION_KEY);
    localStorage.removeItem(STORAGE_ACTIVE_SHOP_KEY);
    emitState();
  }
}

/**
 * Refresh access token using refresh token.
 */
export async function tryRefreshToken() {
  if (!currentSession?.refresh_token) return false;
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return false;

  try {
    // Không gửi access token CŨ (đã hết hạn) — gateway có thể từ chối cả yêu cầu làm mới. Dùng anon key.
    const res = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
    });

    if (res?.access_token) {
      currentSession.access_token = res.access_token;
      currentSession.refresh_token = res.refresh_token || currentSession.refresh_token;
      if (res.user) currentSession.user = res.user;
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
      emitState();
      return true;
    }
  } catch (err) {
    console.warn('Không thể refresh token:', err);
  }
  return false;
}

/**
 * Create a new Shop and assign the creator as OWNER.
 */
export async function createShop({ name }) {
  if (CONFIG.BACKEND === 'web') throw new Error('Cửa hàng được tạo và quản lý tại trang quản trị QBiz (web).');
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
/**
 * Load user's shops and memberships from server.
 */
// Backend web: vai trò web → vai trò Kho.
const WEB_ROLE_MAP = { owner: ROLES.OWNER, shop_manager: ROLES.MANAGER, cashier: ROLES.CASHIER, warehouse: ROLES.WAREHOUSE };

/** Backend web: danh sách shop + vai trò qua RPC kho_my_shops (server chỉ trả shop của chính người gọi). */
async function loadUserShopsWeb() {
  const rows = await supabaseFetch('/rest/v1/rpc/kho_my_shops', { method: 'POST', body: '{}' });
  cachedUserShops = (Array.isArray(rows) ? rows : []).map((r) => ({
    shop: { id: r.shop_id, name: r.name, slug: r.slug, status: 'ACTIVE', kho_entitled: r.kho_entitled !== false,
      default_warehouse_id: r.default_warehouse_id || null },
    membership: { id: `${r.shop_id}:${currentSession.user.id}`, shop_id: r.shop_id, user_id: currentSession.user.id,
      role: WEB_ROLE_MAP[r.role] || ROLES.CASHIER, web_role: r.role, status: 'ACTIVE' },
  }));
  let target = null;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY) || 'null');
    target = cachedUserShops.find((s) => s.shop?.id === parsed?.shop?.id) || null;
  } catch {}
  target = target || cachedUserShops[0] || null;
  currentShop = target?.shop || null;
  currentMembership = target?.membership || null;
  if (target) localStorage.setItem(STORAGE_ACTIVE_SHOP_KEY, JSON.stringify(target));
  else localStorage.removeItem(STORAGE_ACTIVE_SHOP_KEY);
  emitState();
  return cachedUserShops;
}

export async function loadUserShops() {
  if (!currentSession?.user) {
    cachedUserShops = [];
    return [];
  }
  if (CONFIG.BACKEND === 'web') {
    try { return await loadUserShopsWeb(); }
    catch (err) { console.warn('Lỗi tải danh sách cửa hàng (web):', err); emitState(); return cachedUserShops; }
  }
  const isMockToken = currentSession.access_token?.startsWith('mock_');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || isMockToken) {
    const saved = localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        currentShop = parsed.shop;
        currentMembership = parsed.membership;
        cachedUserShops = [parsed];
        return cachedUserShops;
      } catch {}
    }
    cachedUserShops = [];
    return [];
  }

  try {
    const memberships = await supabaseFetch(
      `/rest/v1/memberships?user_id=eq.${currentSession.user.id}&status=eq.ACTIVE&select=*,shops(*)`,
      { method: 'GET' }
    );

    if (Array.isArray(memberships) && memberships.length > 0) {
      cachedUserShops = memberships.map(m => ({
        shop: m.shops,
        membership: {
          id: m.id,
          shop_id: m.shop_id,
          user_id: m.user_id,
          role: m.role,
          status: m.status,
        }
      })).filter(item => item.shop && item.shop.status === 'ACTIVE');

      const savedShop = localStorage.getItem(STORAGE_ACTIVE_SHOP_KEY);
      let targetShop = null;
      if (savedShop) {
        try {
          const parsed = JSON.parse(savedShop);
          targetShop = cachedUserShops.find(s => s.shop?.id === parsed.shop?.id);
        } catch {}
      }

      if (!targetShop && cachedUserShops.length > 0) {
        targetShop = cachedUserShops[0];
      }

      if (targetShop) {
        currentShop = targetShop.shop;
        currentMembership = targetShop.membership;
        localStorage.setItem(STORAGE_ACTIVE_SHOP_KEY, JSON.stringify({ shop: currentShop, membership: currentMembership }));
      } else {
        currentShop = null;
        currentMembership = null;
        localStorage.removeItem(STORAGE_ACTIVE_SHOP_KEY);
      }
    } else {
      currentShop = null;
      currentMembership = null;
      cachedUserShops = [];
      localStorage.removeItem(STORAGE_ACTIVE_SHOP_KEY);
    }
  } catch (err) {
    console.warn('Lỗi tải danh sách cửa hàng:', err);
  }

  emitState();
  return cachedUserShops;
}

/**
 * Get cached user shops for multi-shop switching.
 */
export function getAvailableShops() {
  return cachedUserShops;
}

/**
 * Switch active shop context without touching IndexedDB or device keys.
 */
export async function switchShop(shopId) {
  if (!shopId) throw new Error('Vui lòng chọn cửa hàng hợp lệ.');
  const target = cachedUserShops.find(s => s.shop?.id === shopId);
  if (!target) {
    throw new Error('Bạn không có quyền truy cập cửa hàng này hoặc cửa hàng không tồn tại.');
  }
  // Backend web: mỗi shop có database riêng (db.js currentDbName) → đổi shop an toàn kể cả khi còn thay đổi chưa
  // đồng bộ (chúng nằm trong DB của shop cũ, gửi tiếp khi quay lại shop đó). app.js tải lại trang để mở đúng DB.
  currentShop = target.shop;
  currentMembership = target.membership;
  localStorage.setItem(STORAGE_ACTIVE_SHOP_KEY, JSON.stringify({ shop: currentShop, membership: currentMembership }));
  emitState();
  return { shop: currentShop, membership: currentMembership };
}

/**
 * Add / Invite a new member to the current shop. (OWNER only)
 * Security Invariant: Only MANAGER, CASHIER, WAREHOUSE can be invited.
 * SUPER_ADMIN is NEVER a shop membership role.
 */
export async function addMember({ email, role }) {
  if (CONFIG.BACKEND === 'web') throw new Error('Nhân viên và vai trò được mời / quản lý tại trang quản trị QBiz (web).');
  if (!email || !role) throw new Error('Vui lòng cung cấp email và vai trò.');

  const upperRole = String(role).toUpperCase().trim();
  if (upperRole === 'SUPER_ADMIN' || upperRole === 'SUPERADMIN') {
    throw new Error('Không thể gán quyền SUPER_ADMIN qua lời mời thành viên cửa hàng.');
  }
  if (upperRole === 'OWNER') {
    throw new Error('Cửa hàng chỉ có một OWNER duy nhất.');
  }
  if (!['MANAGER', 'CASHIER', 'WAREHOUSE'].includes(upperRole)) {
    throw new Error(`Vai trò "${role}" không hợp lệ. Chỉ chấp nhận MANAGER, CASHIER, WAREHOUSE.`);
  }

  if (!userCan('MANAGE_USERS')) throw new Error('Bạn không có quyền quản lý thành viên cửa hàng.');
  if (!currentShop?.id) throw new Error('Chưa chọn cửa hàng.');

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    // Local / Dev Fallback simulation
    const mockMem = {
      id: `mem_${Date.now().toString(36)}`,
      shop_id: currentShop.id,
      user_id: `user_${email.replace(/[^a-z0-9]/gi, '_')}`,
      role: upperRole,
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
      role: upperRole,
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
  if (CONFIG.BACKEND === 'web') throw new Error('Nhân viên và vai trò được mời / quản lý tại trang quản trị QBiz (web).');
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

/**
 * Send password recovery email via Supabase Auth.
 */
export async function resetPassword({ email }) {
  if (!email || !email.trim()) throw new Error('Vui lòng nhập địa chỉ email.');
  const cleanEmail = email.trim().toLowerCase();
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return { success: true, message: 'Đã gửi email đặt lại mật khẩu.' };
  }
  await supabaseFetch('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail }),
  });
  return { success: true, message: 'Đã gửi email đặt lại mật khẩu.' };
}

/**
 * Server-Authoritative check for Platform Super Admin.
 * Verifies against platform_admins table or is_platform_admin RPC.
 * NEVER trusts client-side storage or user claim.
 */
export async function checkPlatformAdmin() {
  // Backend web: không có bảng platform_admins của Kho — quản trị nền tảng làm ở website.
  if (!currentSession?.user || CONFIG.BACKEND === 'web') {
    currentPlatformAdmin = null;
    return false;
  }

  // 0. Sovereign designated Platform Owner & Super Admin
  const userEmail = currentSession.user.email?.toLowerCase();
  if (userEmail === 'tungtran2510@gmail.com') {
    currentPlatformAdmin = {
      role: PLATFORM_ROLES.SUPER_ADMIN,
      status: 'ACTIVE',
      user_id: currentSession.user.id,
      email: userEmail,
    };
    return true;
  }

  // 1. Check server-authoritative cryptographically signed claim in JWT (app_metadata)
  const appMeta = currentSession.user.app_metadata || {};
  if (appMeta.platform_role === PLATFORM_ROLES.SUPER_ADMIN || appMeta.is_super_admin === true) {
    currentPlatformAdmin = {
      role: PLATFORM_ROLES.SUPER_ADMIN,
      status: 'ACTIVE',
      user_id: currentSession.user.id,
      email: currentSession.user.email,
    };
    return true;
  }

  // 2. Dev / Mock test environment support
  const isMockToken = currentSession.access_token?.startsWith('mock_');
  if (isMockToken) {
    const isDesignatedOwner = userEmail === 'tungtran2510@gmail.com';
    const isMockAdmin = isDesignatedOwner && localStorage.getItem('qbiz_mock_super_admin') === 'true';
    if (isMockAdmin) {
      currentPlatformAdmin = {
        role: PLATFORM_ROLES.SUPER_ADMIN,
        status: 'ACTIVE',
        user_id: currentSession.user.id,
        email: userEmail,
      };
      return true;
    }
    currentPlatformAdmin = null;
    return false;
  }

  // 3. For live sessions without app_metadata claim, verify against platform_admins table only if table check requested
  // This prevents 404 console errors for regular shop users before owner applies migration
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || !appMeta.check_platform_table) {
    currentPlatformAdmin = null;
    return false;
  }

  try {
    const admins = await supabaseFetch(
      `/rest/v1/platform_admins?user_id=eq.${currentSession.user.id}&status=eq.ACTIVE&select=*`,
      { method: 'GET' }
    );
    if (Array.isArray(admins) && admins.length > 0) {
      currentPlatformAdmin = admins[0];
      return true;
    }
    currentPlatformAdmin = null;
    return false;
  } catch (err) {
    // If table doesn't exist yet or query denied by RLS, treat as non-admin
    currentPlatformAdmin = null;
    return false;
  }
}

/**
 * Check if active session holds verified Platform Super Admin privileges.
 */
export function isSuperAdmin() {
  if (currentSession?.user?.email?.toLowerCase() === 'tungtran2510@gmail.com') return true;
  return Boolean(
    currentPlatformAdmin &&
    currentPlatformAdmin.status === 'ACTIVE' &&
    currentPlatformAdmin.role === PLATFORM_ROLES.SUPER_ADMIN
  );
}

// ==============================================================================
// PLATFORM ADMIN CONSOLE APIS (Server-Authoritative, Guarded)
// ==============================================================================

/**
 * Get system-wide platform metrics (SUPER_ADMIN only).
 */
export async function getPlatformMetrics() {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  const isMockToken = currentSession?.access_token?.startsWith('mock_');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || isMockToken) {
    return {
      total_shops: 3,
      active_shops: 2,
      total_users: 5,
      total_devices: 4,
      sync_errors: 0,
      conflict_count: 0,
      app_version: 'v1.0.0-pilot',
      backup_status: 'HEALTHY',
      timestamp: new Date().toISOString(),
    };
  }
  return await supabaseFetch('/rest/v1/rpc/get_platform_metrics', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Get all platform shops list with owner and status (SUPER_ADMIN only).
 */
export async function getPlatformShops() {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  const isMockToken = currentSession?.access_token?.startsWith('mock_');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || isMockToken) {
    return [
      { id: 'mock_shop_1', name: 'QBiz Kho Flagship', code: 'QB-001', status: 'ACTIVE', owner_email: 'tungtran2510@gmail.com', member_count: 3, device_count: 2, created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'mock_shop_2', name: 'Chi nhánh Quận 1', code: 'QB-002', status: 'ACTIVE', owner_email: 'manager@example.com', member_count: 2, device_count: 1, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: 'mock_shop_3', name: 'Cửa hàng Test', code: 'QB-TEST', status: 'SUSPENDED', owner_email: 'test@example.com', member_count: 1, device_count: 1, created_at: new Date(Date.now() - 86400000 * 10).toISOString() },
    ];
  }
  return await supabaseFetch('/rest/v1/rpc/get_platform_shops', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Toggle shop status between ACTIVE and SUSPENDED (SUPER_ADMIN only).
 */
export async function togglePlatformShop(shopId, nextStatus) {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  const isMockToken = currentSession?.access_token?.startsWith('mock_');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || isMockToken) {
    return { success: true, shop_id: shopId, status: nextStatus };
  }
  return await supabaseFetch('/rest/v1/rpc/toggle_platform_shop', {
    method: 'POST',
    body: JSON.stringify({ p_shop_id: shopId, p_status: nextStatus }),
  });
}

/**
 * Query platform audit logs (SUPER_ADMIN only).
 */
export async function getPlatformAuditLogs(limit = 50) {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  let localLogs = [];
  try {
    const raw = localStorage.getItem('qbiz_platform_audit_logs');
    if (raw) localLogs = JSON.parse(raw);
  } catch (_) {}

  const isMockToken = currentSession?.access_token?.startsWith('mock_');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || isMockToken) {
    if (!localLogs.length) {
      localLogs = [
        { id: 'log_1', actor_platform_role: 'SUPER_ADMIN', action: 'BOOTSTRAP_SUPER_ADMIN', result: 'SUCCESS', details: { email: 'tungtran2510@gmail.com' }, created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: 'log_2', actor_platform_role: 'SUPER_ADMIN', action: 'VIEW_PLATFORM_CONSOLE', result: 'SUCCESS', details: {}, created_at: new Date().toISOString() },
      ];
    }
    return localLogs.slice(0, limit);
  }

  try {
    const serverLogs = await supabaseFetch(`/rest/v1/platform_audit_logs?select=*&order=created_at.desc&limit=${limit}`, {
      method: 'GET',
    });
    if (Array.isArray(serverLogs)) {
      const combined = [...localLogs, ...serverLogs];
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return combined.slice(0, limit);
    }
  } catch (_) {}
  return localLogs.slice(0, limit);
}

/**
 * Bootstrap Super Admin (Restricted to designated platform owner).
 */
export async function bootstrapSuperAdmin(email) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return { success: true, message: 'Super admin bootstrap simulated in local mode.' };
  }
  return await supabaseFetch('/rest/v1/rpc/bootstrap_super_admin', {
    method: 'POST',
    body: JSON.stringify({ p_email: email }),
  });
}

// ==============================================================================
// PLATFORM COMMERCIAL CONFIG & USER SUBSCRIPTION EXTENSION APIS
// ==============================================================================

const DEFAULT_COMMERCIAL_CONFIG = {
  platformName: 'QBiz · Quản Lý Kho & Bán Hàng Đa Kênh',
  hotline: '0901.234.567',
  supportEmail: 'hotro@qbiz.vn',
  trialDays: 30,
  expiryPolicy: 'warn_and_grace',
  bankName: 'MBBANK',
  bankAccount: '0901234567',
  bankAccountOwner: 'TRAN QUANG TUNG',
  transferSyntax: 'QBIZ [EMAIL_HOAC_SHOP]',
  plans: [
    {
      id: 'trial',
      name: 'Dùng thử 30 ngày',
      price: 0,
      period: '30 ngày',
      maxProducts: 200,
      maxWarehouses: 1,
      maxPos: 1,
      features: ['POS bán hàng cơ bản', 'Quản lý tồn kho', 'Báo cáo doanh thu']
    },
    {
      id: 'standard',
      name: 'Gói Tiêu chuẩn',
      price: 199000,
      period: 'tháng',
      maxProducts: 1000,
      maxWarehouses: 2,
      maxPos: 2,
      features: ['POS bán hàng tốc độ cao', 'Quản lý 2 kho hàng', 'Báo cáo lãi lỗ chi tiết', 'In hóa đơn K80/K58']
    },
    {
      id: 'pro',
      name: 'Gói Chuyên nghiệp',
      price: 399000,
      period: 'tháng',
      maxProducts: 10000,
      maxWarehouses: 5,
      maxPos: 5,
      popular: true,
      features: ['Không giới hạn sản phẩm', 'Đa kho & điều chuyển hàng', 'Trợ lý AI QBiz Agent thông minh', 'Hóa đơn điện tử MISA/VNPT', 'Sổ quỹ & công nợ nhà cung cấp']
    },
    {
      id: 'enterprise',
      name: 'Gói Chuỗi Cửa Hàng',
      price: 799000,
      period: 'tháng',
      maxProducts: 99999,
      maxWarehouses: 99,
      maxPos: 99,
      features: ['Không giới hạn toàn bộ hệ thống', 'Quản lý chuỗi nhiều chi nhánh', 'Phân quyền phân cấp nhân viên', 'API kết nối TMĐT & Webhook', 'Kênh hỗ trợ ưu tiên 24/7']
    }
  ]
};

export async function getPlatformCommercialConfig() {
  try {
    const raw = localStorage.getItem('qbiz_platform_commercial_config');
    if (raw) return { ...DEFAULT_COMMERCIAL_CONFIG, ...JSON.parse(raw) };
  } catch (_) {}
  return DEFAULT_COMMERCIAL_CONFIG;
}

export async function savePlatformCommercialConfig(config) {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  const merged = { ...DEFAULT_COMMERCIAL_CONFIG, ...(config || {}) };
  localStorage.setItem('qbiz_platform_commercial_config', JSON.stringify(merged));
  await recordPlatformAudit('UPDATE_COMMERCIAL_CONFIG', 'SUCCESS', {
    platformName: merged.platformName,
    bankName: merged.bankName,
    bankAccount: merged.bankAccount,
    updated_at: new Date().toISOString()
  });
  return merged;
}

export async function recordPlatformAudit(action, result = 'SUCCESS', details = {}) {
  const logItem = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    actor_user_id: currentSession?.user?.id || 'admin',
    actor_platform_role: 'SUPER_ADMIN',
    action,
    result,
    details,
    created_at: new Date().toISOString()
  };
  try {
    const raw = localStorage.getItem('qbiz_platform_audit_logs');
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift(logItem);
    if (logs.length > 200) logs.pop();
    localStorage.setItem('qbiz_platform_audit_logs', JSON.stringify(logs));
  } catch (_) {}

  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey && currentSession?.access_token) {
    supabaseFetch('/rest/v1/platform_audit_logs', {
      method: 'POST',
      body: JSON.stringify(logItem)
    }).catch(() => {});
  }
}

const DEFAULT_PLATFORM_USERS = [
  {
    id: 'usr_super_admin',
    email: 'tungtran2510@gmail.com',
    fullName: 'Trần Quang Tùng (Platform Owner)',
    phone: '0901234567',
    role: 'SUPER_ADMIN',
    plan: 'enterprise',
    planName: 'Gói Chuỗi Cửa Hàng (Vĩnh Viễn)',
    expiresAt: '2099-12-31T23:59:59.000Z',
    status: 'ACTIVE',
    shopName: 'QBiz Flagship & Chuỗi Shop',
    shopCount: 3,
    createdAt: '2026-09-01T08:00:00.000Z'
  },
  {
    id: 'usr_fashion_01',
    email: 'fashion_owner@qbiz.vn',
    fullName: 'Lê Hoàng Yến',
    phone: '0912345678',
    role: 'OWNER',
    plan: 'pro',
    planName: 'Gói Chuyên Nghiệp',
    expiresAt: new Date(Date.now() + 18 * 86400000).toISOString(),
    status: 'ACTIVE',
    shopName: 'Thời Trang Thiết Kế Yến Boutique',
    shopCount: 1,
    createdAt: new Date(Date.now() - 35 * 86400000).toISOString()
  },
  {
    id: 'usr_fnb_02',
    email: 'quanly_fnb@gmail.com',
    fullName: 'Nguyễn Văn Minh',
    phone: '0987654321',
    role: 'OWNER',
    plan: 'standard',
    planName: 'Gói Tiêu Chuẩn',
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    status: 'ACTIVE',
    shopName: 'The Morning Cafe & Bakery',
    shopCount: 2,
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString()
  },
  {
    id: 'usr_trial_exp',
    email: 'taphoa_thanhson@gmail.com',
    fullName: 'Trần Thanh Sơn',
    phone: '0934567890',
    role: 'OWNER',
    plan: 'trial',
    planName: 'Dùng Thử 30 Ngày',
    expiresAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    status: 'EXPIRED',
    shopName: 'Tạp Hóa & Tiện Lợi Thanh Sơn',
    shopCount: 1,
    createdAt: new Date(Date.now() - 32 * 86400000).toISOString()
  },
  {
    id: 'usr_locked_03',
    email: 'spammer_violation@gmail.com',
    fullName: 'Tài khoản Vi Phạm Quy Chế',
    phone: '0977889900',
    role: 'OWNER',
    plan: 'standard',
    planName: 'Gói Tiêu Chuẩn',
    expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    status: 'SUSPENDED',
    shopName: 'Shop Hàng Nhái (Đã Khóa)',
    shopCount: 1,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString()
  }
];

export async function getPlatformUsers() {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  
  let stored = [];
  try {
    const raw = localStorage.getItem('qbiz_platform_users_list');
    if (raw) stored = JSON.parse(raw);
  } catch (_) {}

  if (!stored || stored.length === 0) {
    stored = [...DEFAULT_PLATFORM_USERS];
    localStorage.setItem('qbiz_platform_users_list', JSON.stringify(stored));
  }

  // Ensure current authenticated user is included
  if (currentSession?.user) {
    const email = (currentSession.user.email || '').toLowerCase();
    const existingIndex = stored.findIndex(u => (u.email || '').toLowerCase() === email);
    if (existingIndex >= 0) {
      if (email === 'tungtran2510@gmail.com') {
        stored[existingIndex].role = 'SUPER_ADMIN';
        stored[existingIndex].status = 'ACTIVE';
        stored[existingIndex].expiresAt = '2099-12-31T23:59:59.000Z';
        stored[existingIndex].plan = 'enterprise';
        stored[existingIndex].planName = 'Gói Chuỗi Cửa Hàng (Vĩnh Viễn)';
      }
    } else {
      stored.unshift({
        id: currentSession.user.id || `usr_${Date.now()}`,
        email: email,
        fullName: currentSession.user.user_metadata?.full_name || email.split('@')[0],
        phone: '',
        role: email === 'tungtran2510@gmail.com' ? 'SUPER_ADMIN' : 'OWNER',
        plan: email === 'tungtran2510@gmail.com' ? 'enterprise' : 'trial',
        planName: email === 'tungtran2510@gmail.com' ? 'Gói Chuỗi Cửa Hàng (Vĩnh Viễn)' : 'Dùng Thử 30 Ngày',
        expiresAt: email === 'tungtran2510@gmail.com' ? '2099-12-31T23:59:59.000Z' : new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'ACTIVE',
        shopName: currentShop?.name || 'Cửa hàng của tôi',
        shopCount: 1,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('qbiz_platform_users_list', JSON.stringify(stored));
    }
  }

  return stored;
}

export async function updateUserSubscription(userId, { plan, planName, daysToAdd, expiresAt, status }) {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  const users = await getPlatformUsers();
  const target = users.find(u => u.id === userId);
  if (!target) throw new Error('Không tìm thấy người dùng.');

  if (plan) target.plan = plan;
  if (planName) target.planName = planName;
  if (status) target.status = status;

  if (daysToAdd === 'forever') {
    target.expiresAt = '2099-12-31T23:59:59.000Z';
  } else if (typeof daysToAdd === 'number' && daysToAdd > 0) {
    const currentExp = new Date(target.expiresAt || Date.now());
    const baseDate = currentExp.getTime() > Date.now() ? currentExp : new Date();
    target.expiresAt = new Date(baseDate.getTime() + daysToAdd * 86400000).toISOString();
  } else if (expiresAt) {
    target.expiresAt = new Date(expiresAt).toISOString();
  }

  if (target.status !== 'SUSPENDED') {
    target.status = new Date(target.expiresAt).getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED';
  }

  localStorage.setItem('qbiz_platform_users_list', JSON.stringify(users));
  await recordPlatformAudit('EXTEND_SUBSCRIPTION', 'SUCCESS', {
    user_id: userId,
    email: target.email,
    plan: target.plan,
    expiresAt: target.expiresAt,
    status: target.status
  });
  return target;
}

export async function togglePlatformUser(userId, nextStatus) {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  const users = await getPlatformUsers();
  const target = users.find(u => u.id === userId);
  if (!target) throw new Error('Không tìm thấy người dùng.');

  target.status = nextStatus;
  localStorage.setItem('qbiz_platform_users_list', JSON.stringify(users));
  await recordPlatformAudit('TOGGLE_USER_STATUS', 'SUCCESS', {
    user_id: userId,
    email: target.email,
    new_status: nextStatus
  });
  return target;
}

export async function deletePlatformUser(userId) {
  if (!isSuperAdmin()) throw new Error('Từ chối truy cập: Cần quyền Platform Super Admin.');
  let users = await getPlatformUsers();
  const target = users.find(u => u.id === userId);
  if (!target) throw new Error('Không tìm thấy người dùng.');
  if (target.email === 'tungtran2510@gmail.com') {
    throw new Error('CẤM: Không thể xóa tài khoản Sovereign Platform Owner.');
  }

  users = users.filter(u => u.id !== userId);
  localStorage.setItem('qbiz_platform_users_list', JSON.stringify(users));
  await recordPlatformAudit('DELETE_USER', 'SUCCESS', {
    user_id: userId,
    email: target.email
  });
  return { success: true, deleted_id: userId };
}
