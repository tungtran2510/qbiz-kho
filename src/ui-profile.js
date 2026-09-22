/**
 * QBIZ KHO — UI PROFILE / KIỂU GIAO DIỆN (PHASE 3A)
 *
 * Purpose: Separates visual presentation style from business mode.
 * - Business Mode: "Tôi kinh doanh gì?" (Retail, Wholesale, F&B, Service, Consulting, General)
 * - UI Profile: "Tôi muốn QBiz hiển thị như thế nào?" (Auto, Standard, Fast, Visual, Compact)
 *
 * STRICT INVARIANTS:
 * 1. Storage isolation: Key 'qbiz_ui_profile' is completely separate from
 *    'business_profile' (store info) and 'qbiz_business_mode_profile' (mode).
 * 2. Single codebase: No code forks, no multi-app architecture.
 * 3. Default safety: Default is 'standard'. Existing baseline UI remains 100% untouched.
 * 4. Manual override: If user manually chooses a profile, switching business mode
 *    never overwrites the manual choice. Only 'auto' follows business mode recommendations.
 * 5. Data immutability: Switching UI profiles NEVER mutates business data (products, levels,
 *    movements, sales, orders, customers, suppliers).
 */

import { setting, setSetting } from './db.js';
import { getBusinessProfile } from './business-profile.js';

export const UI_PROFILE_STORAGE_KEY = 'qbiz_ui_profile';
export const DEFAULT_UI_PROFILE_ID = 'standard';

/**
 * 5 UI Profiles Specification
 */
export const UI_PROFILES = Object.freeze({
  auto: {
    id: 'auto',
    name: 'Tự động',
    desc: 'QBiz tự chọn kiểu phù hợp với loại hình kinh doanh.',
    icon: 'sparkles',
  },
  standard: {
    id: 'standard',
    name: 'Tiêu chuẩn',
    desc: 'Cân bằng, dễ sử dụng.',
    icon: 'layout-dashboard',
  },
  fast: {
    id: 'fast',
    name: 'Bán nhanh',
    desc: 'Nút lớn, thao tác nhanh.',
    icon: 'zap',
  },
  visual: {
    id: 'visual',
    name: 'Hình ảnh',
    desc: 'Ảnh sản phẩm/dịch vụ nổi bật.',
    icon: 'image',
  },
  compact: {
    id: 'compact',
    name: 'Gọn',
    desc: 'Hiển thị nhiều thông tin hơn.',
    icon: 'layout-grid',
  },
});

export const UI_PROFILE_OPTIONS = Object.freeze(Object.values(UI_PROFILES));

/**
 * Recommendation from Business Mode
 * @param {string} [businessModeId]
 * @returns {string} One of 'standard', 'fast', 'visual', 'compact'
 */
export function getRecommendedUiProfile(businessModeId = null) {
  let modeId = businessModeId;
  if (!modeId) {
    try {
      const curMode = getBusinessProfile();
      modeId = curMode?.profile_id || 'general';
    } catch (_) {
      modeId = 'general';
    }
  }
  const mid = String(modeId).trim().toLowerCase();
  switch (mid) {
    case 'retail':
      return 'fast';
    case 'fnb':
      return 'visual';
    case 'wholesale':
      return 'compact';
    case 'service':
    case 'consulting':
    case 'general':
    case 'other':
    default:
      return 'standard';
  }
}

/**
 * Presentation Preferences presets
 */
const PRESENTATION_PRESETS = Object.freeze({
  standard: {
    density: 'standard',
    product_view: 'image',
    product_image_size: 'medium',
    quick_action_density: 'standard',
    pos_view: 'grid3',
    card_density: 'standard',
    content_emphasis: 'balanced',
    show_secondary_text: true,
    dashboard_action_style: 'hero_standard',
  },
  fast: {
    density: 'comfortable',
    product_view: 'image',
    product_image_size: 'medium',
    quick_action_density: 'fast_touch',
    pos_view: 'grid2',
    card_density: 'prominent',
    content_emphasis: 'speed_first',
    show_secondary_text: true,
    dashboard_action_style: 'fast_touch',
  },
  visual: {
    density: 'comfortable',
    product_view: 'image',
    product_image_size: 'large',
    quick_action_density: 'spacious',
    pos_view: 'grid2',
    card_density: 'prominent',
    content_emphasis: 'image_first',
    show_secondary_text: true,
    dashboard_action_style: 'visual_tile',
  },
  compact: {
    density: 'compact',
    product_view: 'compact',
    product_image_size: 'small',
    quick_action_density: 'compact',
    pos_view: 'grid3',
    card_density: 'compact',
    content_emphasis: 'data_first',
    show_secondary_text: false,
    dashboard_action_style: 'compact_dense',
  },
});

// In-memory active profile ID ('standard' by default)
let activeUiProfileId = DEFAULT_UI_PROFILE_ID;
let isInitialized = false;

function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(obj); } catch (_) {}
  }
  return JSON.parse(JSON.stringify(obj));
}

function readStorageCache() {
  try {
    const raw = localStorage.getItem(UI_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : { id: raw };
    if (parsed?.id && UI_PROFILES[parsed.id]) {
      return parsed.id;
    }
  } catch (_) {}
  return null;
}

function writeStorageCache(id) {
  try {
    localStorage.setItem(UI_PROFILE_STORAGE_KEY, JSON.stringify({ id, updated_at: new Date().toISOString() }));
  } catch (_) {}
}

/**
 * Initialize UI Profile module
 * @param {Array<{ id: string, value: any }>} [settingsData]
 */
export async function initUiProfile(settingsData = null) {
  // 1. Try local storage cache
  const cached = readStorageCache();
  if (cached && UI_PROFILES[cached]) {
    activeUiProfileId = cached;
  }

  // 2. Try IndexedDB settings store under UI_PROFILE_STORAGE_KEY
  try {
    let dbVal = null;
    if (Array.isArray(settingsData)) {
      const entry = settingsData.find(s => s.id === UI_PROFILE_STORAGE_KEY);
      dbVal = entry?.value;
    } else {
      dbVal = await setting(UI_PROFILE_STORAGE_KEY, null);
    }

    if (dbVal) {
      let candidate = typeof dbVal === 'string' && dbVal.startsWith('{') ? JSON.parse(dbVal) : dbVal;
      const targetId = typeof candidate === 'object' ? candidate.id : candidate;
      if (targetId && UI_PROFILES[targetId]) {
        activeUiProfileId = targetId;
        writeStorageCache(targetId);
      }
    }
  } catch (err) {
    console.warn('Failed to load UI profile from DB:', err);
  }

  isInitialized = true;
  return resolveUiProfile();
}

/**
 * Get active UI profile reference
 * @returns {{ id: string, name: string, desc: string, is_auto: boolean }}
 */
export function getUiProfile() {
  const profile = UI_PROFILES[activeUiProfileId] || UI_PROFILES[DEFAULT_UI_PROFILE_ID];
  return {
    id: activeUiProfileId,
    name: profile.name,
    desc: profile.desc,
    is_auto: activeUiProfileId === 'auto',
  };
}

/**
 * Set and persist UI Profile
 * @param {string} profileId One of 'auto', 'standard', 'fast', 'visual', 'compact'
 * @returns {Promise<{ success: boolean, profile: Object, effective_profile_id: string }>}
 */
export async function setUiProfile(profileId) {
  const id = String(profileId || '').trim().toLowerCase();
  const valid = UI_PROFILES[id] ? id : DEFAULT_UI_PROFILE_ID;

  activeUiProfileId = valid;
  writeStorageCache(valid);

  try {
    await setSetting(UI_PROFILE_STORAGE_KEY, {
      id: valid,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Failed to save UI profile to DB:', err);
  }

  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('qbiz:ui-profile:changed', {
        detail: { profileId: valid, resolved: resolveUiProfile(valid) }
      }));
    } catch (_) {}
  }

  return {
    success: true,
    profile: getUiProfile(),
    effective_profile_id: resolveUiProfile(valid).effective_profile_id,
  };
}

/**
 * Reset to default UI Profile (standard)
 */
export async function resetToDefaultUiProfile() {
  return setUiProfile(DEFAULT_UI_PROFILE_ID);
}

/**
 * Resolve UI Profile presentation preferences
 * Centralized resolver deriving actual visual styles.
 *
 * @param {string} [profileId] Optional id; defaults to active profile
 * @param {string} [businessModeId] Optional business mode id; defaults to active business mode
 * @returns {Object} Full resolved presentation object
 */
export function resolveUiProfile(profileId = null, businessModeId = null) {
  const inputId = (profileId || activeUiProfileId || DEFAULT_UI_PROFILE_ID).trim().toLowerCase();
  const validId = UI_PROFILES[inputId] ? inputId : DEFAULT_UI_PROFILE_ID;
  const is_auto = (validId === 'auto');

  const recommended = getRecommendedUiProfile(businessModeId);
  const effective_profile_id = is_auto ? recommended : validId;

  const basePresentation = PRESENTATION_PRESETS[effective_profile_id] || PRESENTATION_PRESETS.standard;
  const meta = UI_PROFILES[validId] || UI_PROFILES.standard;
  const effectiveMeta = UI_PROFILES[effective_profile_id] || UI_PROFILES.standard;

  return {
    id: effective_profile_id,
    profile_id: validId,
    effective_profile_id,
    name: meta.name,
    effective_name: effectiveMeta.name,
    desc: meta.desc,
    is_auto,
    recommended_profile_id: recommended,
    recommended_name: UI_PROFILES[recommended]?.name || 'Tiêu chuẩn',
    ...deepClone(basePresentation),
  };
}

/**
 * List all available UI profile options
 */
export function listUiProfiles() {
  return UI_PROFILE_OPTIONS.map(opt => ({
    ...opt,
    is_active: opt.id === activeUiProfileId,
  }));
}
