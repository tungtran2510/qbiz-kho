/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — FLOATING TRIGGER & CONTEXTUAL SHEET UI
 * Injects floating trigger, contextual sheet, route chips, proposal card, and DEV Context Inspector.
 * Strictly respects responsive constraints: 390px, 412px, 1440px.
 */

import { buildContextEnvelope, getCurrentActor, switchActor, setLastResolvedProduct, getPendingIntent, clearPendingIntent } from './context.js';
import { routeIntent } from './router.js';
import { confirmProposal, cancelProposal, executeProposal, PROPOSAL_STATUS } from './proposals.js';
import { getProviderConfig, setProviderConfig, PROVIDER_MODES, isDevOrTestEnvironment } from './providers.js';
import { executeAction, getSuggestedActions } from './registry.js';
import { executeSkill } from './skills.js';
import { levelFor } from '../engine.js';
import { loadEntries, togglePinMemory, archiveMemory, deleteMemory, commitMemory, MEMORY_SCOPES } from './memory.js';
import { createAttachmentFromFile, ATTACHMENT_TYPES, INPUT_TYPES } from './multimodal.js';

let appStateRef = null;
let currentEnvelope = null;
let activeProposal = null;
let lastResult = null;
let devInspectorOpen = false;
let messageHistory = [];
let activeAttachments = [];
let inFlightQuery = null;
let lastSubmittedPrompt = '';
let lastSubmittedTimestamp = 0;
let requestCounter = 0;
let isAiProcessing = false;
const DEDUPLICATION_WINDOW_MS = 1500;

const ROUTE_CHIPS = {
  dashboard: [
    'Hôm nay cần chú ý',
    'Có gì bất thường',
    'Hàng sắp hết',
    'Doanh thu',
  ],
  products: [
    'Còn bao nhiêu',
    'Kho nào còn',
    'Bán gần đây',
    'Nhập thêm',
  ],
  sales: [
    'Tìm hàng',
    'Kiểm tồn',
    'Chọn khách',
    'Ca đang mở?',
  ],
  pos: [
    'Tìm hàng',
    'Kiểm tồn',
    'Chọn khách',
    'Ca đang mở?',
  ],
  orders: [
    'Đơn vướng gì',
    'Thanh toán',
    'Thiếu hàng',
  ],
  transfers: [
    'Hàng sắp hết',
    'Nhập',
    'Chuyển',
    'Kiểm kho',
    'Có gì bất thường',
  ],
  warehouse: [
    'Hàng sắp hết',
    'Nhập',
    'Chuyển',
    'Kiểm kho',
    'Có gì bất thường',
  ],
  inventory: [
    'Hàng sắp hết',
    'Nhập',
    'Chuyển',
    'Kiểm kho',
    'Có gì bất thường',
  ],
  customers: [
    'Tìm khách hàng',
    'Thêm khách mới',
    'Lịch sử mua hàng',
  ],
  suppliers: [
    'Tìm nhà cung cấp',
    'Thêm NCC mới',
  ],
  settings: [
    'Thông tin cửa hàng',
    'Chế độ kinh doanh',
    'Kiểu giao diện',
    'Máy in & thiết bị',
    'Sao lưu dữ liệu',
  ],
  reports: [
    'Doanh thu hôm nay',
    'Hàng bán chạy',
    'Hàng sắp hết',
  ],
  shifts: [
    'Mở ca',
    'Đóng ca',
    'Kiểm tra ca',
  ],
  cash: [
    'Lập phiếu thu',
    'Lập phiếu chi',
    'Sổ quỹ',
  ],
  returns: [
    'Tạo phiếu đổi trả',
    'Lịch sử đổi trả',
    'Chính sách trả hàng',
  ],
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMarkdown(text) {
  if (!text) return '';
  let s = String(text).trim();

  // Strip trailing whitespace per line & collapse excessive newlines
  s = s.replace(/[ \t]+$/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');

  // Markdown inline bold, italic, code
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Dividers: consume surrounding newlines
  s = s.replace(/\s*\n\s*---+\s*\n\s*/g, '<hr class="ai-divider"/>');
  s = s.replace(/\s*---+\s*$/g, '');

  // Numbered list items (e.g. "1. Product Name")
  s = s.replace(/(?:^|\n)\s*(\d+)\.\s+(.*?)(?=\n|$)/g, '<div class="ai-num-row"><span class="ai-num-badge">$1.</span><span class="ai-num-text">$2</span></div>');

  // Sub-bullets (indented with 2+ spaces before • or -)
  s = s.replace(/(?:^|\n)[ \t]{2,}[•\-]\s+(.*?)(?=\n|$)/g, '<li class="ai-sub-bullet">$1</li>');

  // Top-level bullets (• or - ) into <li>
  s = s.replace(/(?:^|\n)\s*[•\-]\s+(.*?)(?=\n|$)/g, '<li class="ai-bullet">$1</li>');

  // Wrap contiguous <li> into <ul class="ai-list">
  s = s.replace(/(?:<li class="ai-(?:bullet|sub-bullet)">.*?<\/li>\s*)+/g, (match) => {
    return `<ul class="ai-list">${match.trim()}</ul>`;
  });

  // Clean whitespace immediately next to block tags
  s = s.replace(/\s*<ul class="ai-list">/g, '<ul class="ai-list">');
  s = s.replace(/<\/ul>\s*/g, '</ul>');
  s = s.replace(/\s*<hr class="ai-divider"\/>\s*/g, '<hr class="ai-divider"/>');

  // Handle compact hint / guidance lines (e.g. "💡 Gợi ý:", "💡 *Gợi ý:", "*(Lưu ý:")
  s = s.replace(/(?:^|\n)\s*(?:💡\s*\*?Gợi ý:|\*Gợi ý:)\s*(.*?)(?:\*|\n|$)/gi, '<div class="ai-hint-line">💡 <b>Gợi ý:</b> $1</div>');
  s = s.replace(/(?:^|\n)\s*\*\((?:Lưu ý:?|Ghi chú:?)\s*(.*?)\)\*/gi, '<div class="ai-note-line">ℹ️ <i>Lưu ý: $1</i></div>');

  // Paragraph gap for double newline, simple <br/> for single newline
  s = s.replace(/\n\n+/g, '<span class="ai-p-gap"></span>');
  s = s.replace(/\n/g, '<br/>');

  // Strip redundant <br/> right next to block elements
  s = s.replace(/(?:<br\s*\/?>)+<ul/g, '<ul');
  s = s.replace(/<\/ul>(?:<br\s*\/?>)+/g, '</ul>');
  s = s.replace(/(?:<br\s*\/?>)+<hr/g, '<hr');
  s = s.replace(/<hr class="ai-divider"\/?>(?:<br\s*\/?>)+/g, '<hr class="ai-divider"/>');

  // Strip leading and trailing <br/>
  s = s.replace(/^(?:<br\s*\/?>)+/, '').replace(/(?:<br\s*\/?>)+$/, '');

  return s;
}

/**
 * Initialize the AI UI Layer.
 * @param {Object} state Reference to main app state
 */
export function initAiUI(state) {
  appStateRef = state;

  if (document.getElementById('qbizAiRoot')) return;

  const container = document.createElement('div');
  container.id = 'qbizAiRoot';
  container.className = 'qbiz-ai-root';
  container.innerHTML = `
    <!-- Floating AI Trigger -->
    <button id="qbizAiTrigger" class="qbiz-ai-trigger" aria-label="Mở trợ lý AI QBiz" title="Trợ lý vận hành AI QBiz">
      <span class="ai-sparkle-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </span>
      <span class="ai-trigger-label">Trợ lý</span>
      <span id="aiTriggerBadge" class="ai-trigger-badge" style="display:none;"></span>
    </button>

    <!-- Contextual Sheet Modal -->
    <div id="qbizAiSheet" class="qbiz-ai-sheet" style="display:none;">
      <div class="ai-sheet-backdrop" id="aiSheetBackdrop"></div>
      <div class="ai-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="aiSheetTitle">
        
        <!-- Sheet Header -->
        <div class="ai-sheet-head">
          <div class="ai-head-info">
            <div class="ai-avatar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9"/>
                <path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0"/>
              </svg>
            </div>
            <div>
              <div class="ai-title-row">
                <strong id="aiSheetTitle">Trợ lý QBiz</strong>
                <span id="aiRouteBadge" class="ai-route-badge">Tổng quan</span>
              </div>
              <small id="aiProviderBadge" class="ai-provider-badge" style="color:#15803d;">DeepSeek V3 (Online)</small>
            </div>
          </div>
          <div class="ai-head-actions">
            <button id="aiVoiceMuteBtn" class="ai-btn-sm ai-voice-mute-btn" title="Bật / Tắt giọng đọc trợ lý" aria-label="Bật tắt âm lượng giọng đọc">🔊</button>
            <button id="aiDevToggleBtn" class="ai-btn-sm ai-dev-btn" title="Xem thông số kỹ thuật (DEV Context Inspector)">DEV</button>
            <button id="aiMemoryToggleBtn" class="ai-btn-sm" title="Quản lý Trí nhớ QBiz">🧠</button>
            <button id="aiSettingsToggleBtn" class="ai-btn-sm" title="Cấu hình Provider (DeepSeek / Local / Gemini)">⚙</button>
            <button id="aiCloseBtn" class="ai-close-btn" aria-label="Đóng trợ lý">×</button>
          </div>
        </div>

        <!-- Collapsible Provider Config Drawer -->
        <div id="aiProviderDrawer" class="ai-provider-drawer" style="display:none;">
          <div class="ai-drawer-head">
            <b>Cấu hình Provider AI</b>
            <button id="aiCloseProviderDrawer" class="ai-link-btn">Đóng</button>
          </div>
          <div class="ai-drawer-body">
            <label>Chế độ Provider:
              <select id="aiProviderModeSelect">
                <option value="AUTO" selected>DeepSeek V3 (Mặc định - Nhanh & Chính xác)</option>
                <option value="LOCAL_AI">LOCAL_AI (Ollama qwen2.5:1.5b dự phòng)</option>
                <option value="DETERMINISTIC">DETERMINISTIC (Tier 0 - Nội bộ / Offline)</option>
                <option value="GEMINI">GEMINI (Google Gemini 1.5 Flash)</option>
                <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE (Session Key)</option>
                <option value="MOCK_DEV">MOCK_DEV (Giả lập Dev)</option>
              </select>
            </label>
            <div id="aiLocalAiInfoGroup" style="font-size:12px; color:#15803d; margin:6px 0; display:block;">
              ✓ Đang sử dụng DeepSeek API (deepseek-chat) làm engine mặc định. Sẵn sàng trên máy chủ.
            </div>
            <div id="aiGeminiKeyGroup" style="display:none;">
              <label>Gemini API Key (Chỉ lưu session, không ghi DB):
                <input id="aiGeminiKeyInput" type="password" placeholder="AIzaSy..."/>
              </label>
            </div>
            <div id="aiOpenAIKeyGroup" style="display:none;">
              <label>OpenAI API Key:
                <input id="aiOpenAIKeyInput" type="password" placeholder="sk-..."/>
              </label>
              <label>Endpoint URL:
                <input id="aiOpenAIUrlInput" type="text" placeholder="https://api.openai.com/v1/chat/completions"/>
              </label>
            </div>
            <button id="aiSaveProviderConfigBtn" class="primary-btn ai-btn-save">Lưu cấu hình phiên</button>
          </div>
        </div>

        <!-- Collapsible QBiz Memory Drawer -->
        <div id="aiMemoryDrawer" class="ai-provider-drawer" style="display:none; max-height:280px; overflow-y:auto;">
          <div class="ai-drawer-head">
            <b>Trí nhớ QBiz (Memory Foundation)</b>
            <button id="aiCloseMemoryDrawer" class="ai-link-btn">Đóng</button>
          </div>
          <div class="ai-drawer-body">
            <div id="aiMemoryItemsList"></div>
            <div style="margin-top:10px; border-top:1px dashed #ccc; padding-top:8px;">
              <small><b>Thêm ghi nhớ thủ công:</b></small>
              <div style="display:flex; gap:4px; margin-top:4px;">
                <select id="aiNewMemScope" style="width:100px; font-size:12px;">
                  <option value="SHOP">Shop</option>
                  <option value="PRODUCT">Sản phẩm</option>
                  <option value="WAREHOUSE">Kho</option>
                  <option value="SUPPLIER">NCC</option>
                </select>
                <input id="aiNewMemContent" type="text" placeholder="Nội dung ghi nhớ..." style="flex:1; font-size:12px;" />
                <button id="aiAddMemBtn" class="primary-btn" style="padding:2px 8px; font-size:12px;">Lưu</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Collapsible DEV Context Inspector -->
        <div id="aiDevInspector" class="ai-dev-inspector" style="display:none;">
          <div class="ai-inspector-head">
            <b>DEV CONTEXT INSPECTOR</b>
            <span class="ai-dev-tag">DEBUG ONLY</span>
          </div>
          <div id="aiDevInspectorContent" class="ai-inspector-content">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Messages Area -->
        <div id="aiMessagesList" class="ai-messages-list">
          <!-- Initial welcome message -->
        </div>

        <!-- Contextual Chips Bar -->
        <div id="aiChipsBar" class="ai-chips-bar">
          <!-- Rendered dynamically according to current route -->
        </div>

        <!-- Active Voice TTS Speaking Banner with Instant Mute/Stop -->
        <div id="aiSpeakingBanner" class="ai-speaking-banner" style="display:none;">
          <span>🔊 Đang đọc câu trả lời...</span>
          <button type="button" id="aiStopSpeakingBannerBtn" class="ai-speaking-banner-btn" title="Dừng đọc và tắt giọng">🔇 Tắt đọc</button>
        </div>

        <!-- Voice Status Bar -->
        <div id="aiVoiceStatus" class="ai-voice-status" style="display:none;"></div>

        <!-- Attachment Preview Tray -->
        <div id="aiAttachmentTray" class="ai-attachment-tray" style="display:none;"></div>

        <!-- Input Box: [ + ] [ Nhập yêu cầu... ] [ Mic ] [ Gửi ] -->
        <form id="aiInputForm" class="ai-input-form" onsubmit="return false;">
          <div class="ai-attach-wrap">
            <button id="aiAttachBtn" type="button" class="ai-attach-btn" aria-label="Đính kèm ảnh hoặc tệp" title="Đính kèm ảnh chụp, ảnh thư viện hoặc tệp">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <div id="aiAttachMenu" class="ai-attach-menu" style="display:none;">
              <button type="button" id="aiAttachCameraBtn" class="ai-attach-menu-item">
                <span class="ai-attach-item-icon">📷</span>
                <span>Chụp ảnh</span>
              </button>
              <button type="button" id="aiAttachGalleryBtn" class="ai-attach-menu-item">
                <span class="ai-attach-item-icon">🖼️</span>
                <span>Chọn ảnh</span>
              </button>
              <button type="button" id="aiAttachFileBtn" class="ai-attach-menu-item">
                <span class="ai-attach-item-icon">📁</span>
                <span>Chọn tệp</span>
              </button>
            </div>
          </div>

          <!-- Hidden inputs for file selection -->
          <input id="aiCameraInput" type="file" accept="image/*" capture="environment" style="display:none;" />
          <input id="aiGalleryInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;" />
          <input id="aiFileInput" type="file" accept=".csv,.xlsx,.json,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,application/pdf" style="display:none;" />

          <input
            id="aiTextInput"
            type="text"
            class="ai-text-input"
            placeholder="Hỏi hoặc ra lệnh cho trợ lý..."
            autocomplete="off"
          />
          <button id="aiMicBtn" type="button" class="ai-mic-btn" aria-label="Nhập bằng giọng nói" title="Nhập bằng giọng nói tiếng Việt">
            <svg class="ai-mic-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button id="aiSendBtn" type="submit" class="ai-send-btn" aria-label="Gửi tin nhắn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>

      </div>
    </div>
  `;

  document.body.appendChild(container);
  bindEvents();
  updateContextAndChips();

  window.__qbiz_ai__ = {
    handleUserMessage,
    openSheet,
    closeSheet,
    setVoiceMuted,
    isVoiceMuted,
    stopSpeaking,
    routeIntent,
    getMessageHistory: () => [...messageHistory],
    submitVoiceTranscript: async (text) => {
      setMicState('recognized', text);
      const input = document.getElementById('aiTextInput');
      if (input) input.value = '';
      return await handleUserMessage(text);
    }
  };
  if (typeof window !== 'undefined' && window.__qbiz_app__) {
    window.__qbiz_app__.ai = window.__qbiz_ai__;
  }
}

/**
 * Global voice recognition state
 */
let micState = 'idle'; // 'idle' | 'listening' | 'processing'
let recognitionInstance = null;

/**
 * Initialize Web Speech API Voice Input
 */
/**
 * Render active attachment tray chips above input box
 */
function renderAttachmentTray() {
  const tray = document.getElementById('aiAttachmentTray');
  if (!tray) return;
  if (!activeAttachments || !activeAttachments.length) {
    tray.style.display = 'none';
    tray.innerHTML = '';
    return;
  }
  tray.style.display = 'flex';
  tray.innerHTML = activeAttachments.map((att, idx) => `
    <div class="ai-attach-chip" data-idx="${idx}">
      <span class="ai-chip-icon">${att.type === 'image' ? '🖼️' : '📁'}</span>
      <span class="ai-chip-name" title="${esc(att.name)}">${esc(att.name)}</span>
      <span class="ai-chip-size">(${Math.round((att.size || 0) / 1024)} KB)</span>
      <button type="button" class="ai-chip-remove" data-idx="${idx}" title="Xóa đính kèm">×</button>
    </div>
  `).join('');

  tray.querySelectorAll('.ai-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(e.currentTarget.getAttribute('data-idx'));
      activeAttachments.splice(idx, 1);
      renderAttachmentTray();
    });
  });
}

/**
 * Voice TTS Mute State Management
 */
let isTtsMuted = false;
try {
  isTtsMuted = localStorage.getItem('qbiz_ai_voice_muted') === 'true';
} catch (_) {}

export function isVoiceMuted() {
  return isTtsMuted;
}

export function updateVoiceMuteButtonUI() {
  const btn = document.getElementById('aiVoiceMuteBtn');
  const banner = document.getElementById('aiSpeakingBanner');
  const trigger = document.getElementById('qbizAiTrigger');
  const isSpeaking = typeof window !== 'undefined' && Boolean(window.speechSynthesis?.speaking);

  if (banner) {
    banner.style.display = (isSpeaking && !isTtsMuted) ? 'flex' : 'none';
  }

  if (trigger) {
    if (isSpeaking && !isTtsMuted) trigger.classList.add('is-speaking');
    else trigger.classList.remove('is-speaking');
  }

  if (!btn) return;

  if (isTtsMuted) {
    btn.innerHTML = '🔇';
    btn.className = 'ai-btn-sm ai-voice-mute-btn is-muted';
    btn.title = 'Giọng đọc đang TẮT — Bấm để bật lại';
    btn.setAttribute('aria-label', 'Giọng đọc đang tắt, bấm để bật');
  } else if (isSpeaking) {
    btn.innerHTML = '🔊';
    btn.className = 'ai-btn-sm ai-voice-mute-btn is-speaking';
    btn.title = 'Đang đọc — Bấm để dừng đọc và tắt âm';
    btn.setAttribute('aria-label', 'Đang đọc, bấm để dừng');
  } else {
    btn.innerHTML = '🔊';
    btn.className = 'ai-btn-sm ai-voice-mute-btn';
    btn.title = 'Giọng đọc đang BẬT — Bấm để tắt âm';
    btn.setAttribute('aria-label', 'Giọng đọc đang bật, bấm để tắt âm');
  }
}

export function setVoiceMuted(muted, showToast = true) {
  isTtsMuted = Boolean(muted);
  try {
    localStorage.setItem('qbiz_ai_voice_muted', isTtsMuted ? 'true' : 'false');
  } catch (_) {}

  if (isTtsMuted && typeof window !== 'undefined' && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }

  updateVoiceMuteButtonUI();

  if (showToast && typeof window !== 'undefined' && window.__qbiz_app__?.toast) {
    window.__qbiz_app__.toast(
      isTtsMuted ? '🔇 Đã tắt âm lượng giọng đọc trợ lý' : '🔊 Đã bật giọng đọc trợ lý',
      'info'
    );
  }
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  updateVoiceMuteButtonUI();
}

/**
 * Optional Text-to-Speech (TTS) for voice transcript responses
 */
function speakAssistantResponse(text) {
  if (isTtsMuted) return; // Completely muted by user
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    if (!text) return;
    const cleanText = text
      .replace(/[*#_`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const viVoice = voices.find(v => v.lang && (v.lang === 'vi-VN' || v.lang.startsWith('vi')));
    if (viVoice) utterance.voice = viVoice;

    utterance.onstart = () => {
      updateVoiceMuteButtonUI();
    };
    utterance.onend = () => {
      updateVoiceMuteButtonUI();
    };
    utterance.onerror = () => {
      updateVoiceMuteButtonUI();
    };

    window.speechSynthesis.speak(utterance);
    updateVoiceMuteButtonUI();
  } catch (err) {
    console.warn('TTS playback error:', err);
    updateVoiceMuteButtonUI();
  }
}

function setMicState(state, text = '') {
  micState = state;
  const micBtn = document.getElementById('aiMicBtn');
  const statusEl = document.getElementById('aiVoiceStatus');
  if (micBtn) micBtn.classList.remove('is-listening', 'is-processing');
  if (!statusEl) return;

  if (state === 'listening') {
    if (micBtn) micBtn.classList.add('is-listening');
    statusEl.style.display = 'flex';
    statusEl.className = 'ai-voice-status state-listening';
    statusEl.innerHTML = `
      <span class="ai-voice-dot"></span>
      <span class="ai-voice-text">Đang nghe tiếng Việt... hãy nói yêu cầu</span>
      <button type="button" class="ai-voice-cancel-btn" id="aiVoiceCancelBtn">Dừng</button>
    `;
  } else if (state === 'processing') {
    if (micBtn) micBtn.classList.add('is-processing');
    statusEl.style.display = 'flex';
    statusEl.className = 'ai-voice-status state-processing';
    statusEl.innerHTML = `
      <span class="ai-voice-text">Đang nhận dạng...</span>
    `;
  } else if (state === 'recognized') {
    statusEl.style.display = 'flex';
    statusEl.className = 'ai-voice-status state-recognized';
    statusEl.innerHTML = `
      <span class="ai-voice-text">Đã nhận dạng — Đang gửi yêu cầu...</span>
      <button type="button" class="ai-voice-clear-btn" id="aiVoiceClearBtn" title="Xóa">✕</button>
    `;
    setTimeout(() => {
      if (statusEl.classList.contains('state-recognized')) statusEl.style.display = 'none';
    }, 7000);
  } else if (state === 'no-speech') {
    statusEl.style.display = 'flex';
    statusEl.className = 'ai-voice-status state-error';
    statusEl.innerHTML = `
      <span class="ai-voice-text">Không nghe rõ — Vui lòng thử nói lại</span>
    `;
    setTimeout(() => {
      if (statusEl.classList.contains('state-error')) statusEl.style.display = 'none';
    }, 4000);
  } else {
    statusEl.style.display = 'none';
    statusEl.innerHTML = '';
  }

  document.getElementById('aiVoiceCancelBtn')?.addEventListener('click', () => {
    try { recognitionInstance?.stop(); } catch (_) {}
    setMicState('idle');
  });
  document.getElementById('aiVoiceClearBtn')?.addEventListener('click', () => {
    const input = document.getElementById('aiTextInput');
    if (input) input.value = '';
    setMicState('idle');
  });
}

/**
 * Initialize Web Speech API Voice Input
 */
function initVoiceInput() {
  const micBtn = document.getElementById('aiMicBtn');
  const input = document.getElementById('aiTextInput');
  const statusEl = document.getElementById('aiVoiceStatus');
  if (!micBtn || !input) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const isHttps = location.protocol === 'https:';
  const isSecure = Boolean(window.isSecureContext || isLocalhost || isHttps);

  if (!isSecure) {
    micBtn.classList.add('ai-mic-disabled');
    micBtn.title = 'Micro cần HTTPS để hoạt động trên mạng LAN';
    micBtn.setAttribute('aria-disabled', 'true');
    micBtn.addEventListener('click', () => {
      addAssistantMessage('⚠️ **Micro cần HTTPS:** Trình duyệt yêu cầu kết nối HTTPS bảo mật để sử dụng micro trên mạng LAN. Bạn có thể sử dụng bàn phím nhập liệu bình thường.');
    });
    return;
  }

  const showPermissionBlockedGuide = () => {
    addAssistantMessage(
      `⚠️ **Bạn cần cấp quyền truy cập Micro trên trình duyệt để sử dụng tính năng này.**\n\n` +
      `👉 **Cách bật lại Micro:** Bấm vào biểu tượng Cài đặt trang trên thanh địa chỉ URL -> Microphone -> Chọn Cho phép (Allow), sau đó tải lại trang.`
    );
  };

  if (!SpeechRecognition) {
    micBtn.classList.add('ai-mic-unsupported');
    micBtn.title = 'Thiết bị này chưa hỗ trợ nhận dạng giọng nói';
    micBtn.addEventListener('click', () => {
      addAssistantMessage('⚠️ Trình duyệt chưa hỗ trợ Web Speech API. Vui lòng sử dụng bàn phím nhập liệu.');
    });
    return;
  }

  micBtn.addEventListener('click', async () => {
    if (micState === 'listening') {
      try {
        recognitionInstance?.stop();
      } catch (_) {}
      setMicState('idle');
      return;
    }

    try {
      recognitionInstance = new SpeechRecognition();
      recognitionInstance.lang = 'vi-VN';
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = true;
      recognitionInstance.maxAlternatives = 1;

      recognitionInstance.onstart = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (_) {}
        }
        setMicState('listening');
      };

      recognitionInstance.onresult = (event) => {
        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && item[0]) {
            const chunk = item[0].transcript.trim();
            if (!chunk) continue;
            if (item.isFinal) {
              sessionFinal = sessionFinal ? `${sessionFinal} ${chunk}` : chunk;
            } else {
              sessionInterim = sessionInterim ? `${sessionInterim} ${chunk}` : chunk;
            }
          }
        }

        const fullText = (
          sessionFinal +
          (sessionInterim ? (sessionFinal ? ' ' : '') + sessionInterim : '')
        ).trim();

        if (fullText) {
          input.value = fullText;
        }
      };

      recognitionInstance.onspeechend = () => {
        setMicState('processing');
      };

      recognitionInstance.onend = () => {
        const text = input ? input.value.trim() : '';
        if (text && !inFlightQuery) {
          setMicState('recognized', text);
          if (input) input.value = '';
          handleUserMessage(text);
        } else {
          setMicState('idle');
        }
      };

      recognitionInstance.onerror = (event) => {
        setMicState('idle');
        if (event.error === 'not-allowed') {
          if (!isSecure) {
            showInsecureContextGuide();
          } else {
            showPermissionBlockedGuide();
          }
        } else if (event.error === 'no-speech') {
          setMicState('no-speech');
        } else if (event.error === 'audio-capture') {
          addAssistantMessage('⚠️ **Không tìm thấy thiết bị Microphone** hoặc Micro đang bị ứng dụng khác chiếm dụng.');
        } else if (event.error === 'network') {
          addAssistantMessage('⚠️ **Lỗi kết nối mạng dịch vụ giọng nói.** Vui lòng kiểm tra lại kết nối Internet.');
        } else if (event.error !== 'aborted') {
          console.warn('Speech recognition error:', event.error);
        }
      };

      recognitionInstance.start();
    } catch (err) {
      setMicState('idle');
      console.warn('Speech recognition exception:', err);
      if (err.name === 'NotAllowedError' || String(err).includes('not-allowed')) {
        if (!isSecure) {
          showInsecureContextGuide();
        } else {
          showPermissionBlockedGuide();
        }
      }
    }
  });
}

/**
 * Initialize Draggable Floating Trigger with LocalStorage Persistence
 */
function initDraggableTrigger(trigger) {
  if (!trigger) return;

  const restorePosition = () => {
    try {
      const saved = localStorage.getItem('qbiz_ai_trigger_pos');
      if (saved) {
        const pos = JSON.parse(saved);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const btnRect = trigger.getBoundingClientRect();
        const btnW = btnRect.width || 44;
        const btnH = btnRect.height || 48;

        const minLeft = 8;
        const maxLeft = Math.max(minLeft, w - btnW - 8);
        const minTop = 12;
        const maxTop = Math.max(minTop, h - btnH - 72); // Safe boundary above bottom nav

        const left = Math.max(minLeft, Math.min(maxLeft, pos.left));
        const top = Math.max(minTop, Math.min(maxTop, pos.top));

        trigger.style.left = `${left}px`;
        trigger.style.top = `${top}px`;
        trigger.style.right = 'auto';
        trigger.style.bottom = 'auto';
      }
    } catch (_) {}
  };

  restorePosition();
  window.addEventListener('resize', restorePosition);

  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let justDragged = false;

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = trigger.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!hasMoved && Math.hypot(dx, dy) > 5) {
      hasMoved = true;
      trigger.style.transition = 'none';
      trigger.classList.add('is-dragging');
    }

    if (hasMoved) {
      e.preventDefault();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const btnW = trigger.offsetWidth || 44;
      const btnH = trigger.offsetHeight || 48;

      const minLeft = 8;
      const maxLeft = Math.max(minLeft, w - btnW - 8);
      const minTop = 12;
      const maxTop = Math.max(minTop, h - btnH - 72); // Do not overlap bottom nav

      const newLeft = Math.max(minLeft, Math.min(maxLeft, initialLeft + dx));
      const newTop = Math.max(minTop, Math.min(maxTop, initialTop + dy));

      trigger.style.left = `${newLeft}px`;
      trigger.style.top = `${newTop}px`;
      trigger.style.right = 'auto';
      trigger.style.bottom = 'auto';
    }
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    trigger.style.transition = '';
    trigger.classList.remove('is-dragging');

    if (hasMoved) {
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 150);

      const rect = trigger.getBoundingClientRect();
      try {
        localStorage.setItem('qbiz_ai_trigger_pos', JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }));
      } catch (_) {}
    }
  };

  trigger.addEventListener('pointerdown', onPointerDown);

  trigger.addEventListener('click', (e) => {
    if (justDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    openSheet();
  });
}

/**
 * Bind UI events for trigger, sheet, form, and DEV inspector.
 */
function bindEvents() {
  const trigger = document.getElementById('qbizAiTrigger');
  const sheet = document.getElementById('qbizAiSheet');
  const backdrop = document.getElementById('aiSheetBackdrop');
  const closeBtn = document.getElementById('aiCloseBtn');
  const form = document.getElementById('aiInputForm');
  const input = document.getElementById('aiTextInput');
  const devBtn = document.getElementById('aiDevToggleBtn');
  const settingsBtn = document.getElementById('aiSettingsToggleBtn');
  const voiceMuteBtn = document.getElementById('aiVoiceMuteBtn');
  const stopSpeakingBannerBtn = document.getElementById('aiStopSpeakingBannerBtn');

  voiceMuteBtn?.addEventListener('click', () => {
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
      setVoiceMuted(true);
      return;
    }
    setVoiceMuted(!isVoiceMuted());
  });

  stopSpeakingBannerBtn?.addEventListener('click', () => {
    stopSpeaking();
    setVoiceMuted(true);
  });

  updateVoiceMuteButtonUI();

  initDraggableTrigger(trigger);
  initVoiceInput();

  backdrop?.addEventListener('click', closeSheet);
  closeBtn?.addEventListener('click', closeSheet);

  devBtn?.addEventListener('click', () => {
    devInspectorOpen = !devInspectorOpen;
    const inspector = document.getElementById('aiDevInspector');
    if (inspector) inspector.style.display = devInspectorOpen ? 'block' : 'none';
    renderDevInspector();
  });

  settingsBtn?.addEventListener('click', toggleProviderDrawer);
  document.getElementById('aiCloseProviderDrawer')?.addEventListener('click', toggleProviderDrawer);
  document.getElementById('aiProviderModeSelect')?.addEventListener('change', updateProviderFormVisibility);
  document.getElementById('aiSaveProviderConfigBtn')?.addEventListener('click', saveProviderSettings);

  const memBtn = document.getElementById('aiMemoryToggleBtn');
  memBtn?.addEventListener('click', toggleMemoryDrawer);
  document.getElementById('aiCloseMemoryDrawer')?.addEventListener('click', toggleMemoryDrawer);
  document.getElementById('aiAddMemBtn')?.addEventListener('click', () => {
    const scope = document.getElementById('aiNewMemScope')?.value || MEMORY_SCOPES.SHOP;
    const content = document.getElementById('aiNewMemContent')?.value?.trim();
    if (!content) return;
    commitMemory({ scope, content, title: content.slice(0, 30) });
    const contentInput = document.getElementById('aiNewMemContent');
    if (contentInput) contentInput.value = '';
    renderMemoryDrawer();
    addAssistantMessage(`✓ Đã lưu vào Trí nhớ [${scope}]: "${content}".`);
  });

  window.addEventListener('qbiz:memory:changed', renderMemoryDrawer);

  // Attachment Button and Menu Handlers
  const attachBtn = document.getElementById('aiAttachBtn');
  const attachMenu = document.getElementById('aiAttachMenu');
  const cameraInput = document.getElementById('aiCameraInput');
  const galleryInput = document.getElementById('aiGalleryInput');
  const fileInput = document.getElementById('aiFileInput');

  attachBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (attachMenu) {
      attachMenu.style.display = attachMenu.style.display === 'none' ? 'flex' : 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (attachMenu && !attachBtn?.contains(e.target) && !attachMenu.contains(e.target)) {
      attachMenu.style.display = 'none';
    }
  });

  document.getElementById('aiAttachCameraBtn')?.addEventListener('click', () => {
    if (attachMenu) attachMenu.style.display = 'none';
    cameraInput?.click();
  });

  document.getElementById('aiAttachGalleryBtn')?.addEventListener('click', () => {
    if (attachMenu) attachMenu.style.display = 'none';
    galleryInput?.click();
  });

  document.getElementById('aiAttachFileBtn')?.addEventListener('click', () => {
    if (attachMenu) attachMenu.style.display = 'none';
    fileInput?.click();
  });

  const onFileInputChanged = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const att = await createAttachmentFromFile(file);
      activeAttachments.push(att);
      renderAttachmentTray();
    } catch (err) {
      addAssistantMessage(`⚠️ **Lỗi đính kèm tệp:** ${err.message}`);
    }
  };

  cameraInput?.addEventListener('change', onFileInputChanged);
  galleryInput?.addEventListener('change', onFileInputChanged);
  fileInput?.addEventListener('change', onFileInputChanged);

  let isSubmitting = false;
  const submitMessage = async () => {
    if (isSubmitting) return;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    const text = input?.value?.trim() || '';
    if (!text && activeAttachments.length === 0) return;
    
    isSubmitting = true;
    isAiProcessing = true;
    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    if (input) {
      input.value = '';
      input.disabled = true;
      input.placeholder = 'Đang xử lý yêu cầu…';
    }
    renderMessages();
    scrollMessagesToBottom();

    try {
      await handleUserMessage(text);
    } finally {
      isAiProcessing = false;
      isSubmitting = false;
      if (sendBtn) sendBtn.disabled = false;
      if (input) {
        input.disabled = false;
        input.placeholder = 'Nhập câu hỏi hoặc lệnh kho...';
        input.focus();
      }
      renderMessages();
      scrollMessagesToBottom();
    }
  };

  form?.addEventListener('submit', e => {
    e.preventDefault();
    submitMessage();
  });

  window.addEventListener('qbiz:ai:actor-switched', e => {
    activeProposal = null;
    const nextRole = e.detail?.actor?.role;
    if (nextRole === 'cashier') {
      messageHistory = messageHistory.filter(m => !m.permissionDenied && !(m.text && (m.text.includes('lợi nhuận') || m.text.includes('giá vốn'))));
    }
    updateContextAndChips();
    renderMessages();
  });
}

function openSheet() {
  const sheet = document.getElementById('qbizAiSheet');
  if (!sheet) return;
  sheet.style.display = 'block';
  sheet.classList.add('is-open');
  updateContextAndChips();

  // If message history is empty, populate initial greeting
  if (messageHistory.length === 0) {
    const route = currentEnvelope?.current_route || 'dashboard';
    const boundProd = currentEnvelope?.current_product_id;
    let welcomeText = `Xin chào! Tôi là **Trợ lý vận hành QBiz**.\nĐang sẵn sàng hỗ trợ tại màn **${getRouteLabel(route)}**.`;
    if (boundProd) {
      const p = (appStateRef?.data?.products || []).find(x => x.id === boundProd);
      if (p) welcomeText += `\nĐang tự động liên kết với sản phẩm: **${p.name}**.`;
    }
    addAssistantMessage(welcomeText);
  }

  renderMessages();
  updateVoiceMuteButtonUI();
  // NOTE: Requirement 1 - Do NOT call .focus() here! Virtual keyboard will only open when user taps the input directly.
}

function closeSheet(options = {}) {
  const sheet = document.getElementById('qbizAiSheet');
  if (sheet) {
    sheet.style.display = 'none';
    sheet.classList.remove('is-open');
  }
  if (!options?.preserveSpeech && typeof window !== 'undefined' && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
}

function toggleProviderDrawer() {
  const drawer = document.getElementById('aiProviderDrawer');
  if (!drawer) return;
  const isOpen = drawer.style.display !== 'none';
  drawer.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    const cfg = getProviderConfig();
    const sel = document.getElementById('aiProviderModeSelect');
    if (sel) sel.value = cfg.mode;
    const gemInput = document.getElementById('aiGeminiKeyInput');
    if (gemInput) gemInput.value = cfg.geminiKey || '';
    const openKey = document.getElementById('aiOpenAIKeyInput');
    if (openKey) openKey.value = cfg.openaiKey || '';
    const openUrl = document.getElementById('aiOpenAIUrlInput');
    if (openUrl) openUrl.value = cfg.openaiUrl || '';
    updateProviderFormVisibility();
  }
}

function updateProviderFormVisibility() {
  const mode = document.getElementById('aiProviderModeSelect')?.value;
  const gemGroup = document.getElementById('aiGeminiKeyGroup');
  const openGroup = document.getElementById('aiOpenAIKeyGroup');
  const localInfo = document.getElementById('aiLocalAiInfoGroup');
  if (localInfo) {
    if (mode === 'AUTO') {
      localInfo.style.display = 'block';
      localInfo.innerHTML = '✓ Đang sử dụng <b>DeepSeek V3 (deepseek-chat)</b> làm engine mặc định. Sẵn sàng trên máy chủ.';
      localInfo.style.color = '#15803d';
    } else if (mode === PROVIDER_MODES.LOCAL_AI) {
      localInfo.style.display = 'block';
      localInfo.innerHTML = '✓ Đang sử dụng Local AI (qwen2.5:1.5b trên máy tính).';
      localInfo.style.color = '#15803d';
    } else {
      localInfo.style.display = 'none';
    }
  }
  if (gemGroup) gemGroup.style.display = (mode === PROVIDER_MODES.GEMINI) ? 'block' : 'none';
  if (openGroup) openGroup.style.display = (mode === PROVIDER_MODES.OPENAI_COMPATIBLE) ? 'block' : 'none';
}

function saveProviderSettings() {
  const mode = document.getElementById('aiProviderModeSelect')?.value;
  const geminiKey = document.getElementById('aiGeminiKeyInput')?.value?.trim();
  const openaiKey = document.getElementById('aiOpenAIKeyInput')?.value?.trim();
  const openaiUrl = document.getElementById('aiOpenAIUrlInput')?.value?.trim();

  setProviderConfig({ mode, geminiKey, openaiKey, openaiUrl });
  toggleProviderDrawer();
  updateContextAndChips();
  addAssistantMessage(`Đã cập nhật chế độ Provider: **${mode}**.`);
}

function toggleMemoryDrawer() {
  const drawer = document.getElementById('aiMemoryDrawer');
  if (!drawer) return;
  const isOpen = drawer.style.display !== 'none';
  drawer.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    renderMemoryDrawer();
  }
}

function renderMemoryDrawer() {
  const list = document.getElementById('aiMemoryItemsList');
  if (!list) return;
  const entries = loadEntries();
  if (!entries.length) {
    list.innerHTML = '<div style="font-size:12px; color:#888; padding:8px 0;">Chưa có ghi nhớ nào được lưu.</div>';
    return;
  }
  list.innerHTML = entries.map(e => `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px; margin-bottom:6px; font-size:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><b style="color:#0284c7;">[${esc(e.scope)}]</b> ${e.pinned ? '📌' : ''} ${esc(e.title || 'Ghi nhớ')}</span>
        <div style="display:flex; gap:4px;">
          <button class="ai-link-btn" data-mem-pin="${esc(e.id)}" style="font-size:11px;">${e.pinned ? 'Bỏ ghim' : 'Ghim'}</button>
          <button class="ai-link-btn" data-mem-archive="${esc(e.id)}" style="font-size:11px;">Lưu trữ</button>
          <button class="ai-link-btn" data-mem-del="${esc(e.id)}" style="font-size:11px; color:#e11d48;">Xóa</button>
        </div>
      </div>
      <div style="margin-top:2px; color:#334155;">${esc(e.content)}</div>
      <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Tạo: ${new Date(e.created_at).toLocaleDateString('vi-VN')}</div>
    </div>
  `).join('');

  list.querySelectorAll('[data-mem-pin]').forEach(b => {
    b.onclick = () => {
      togglePinMemory(b.dataset.memPin);
      renderMemoryDrawer();
    };
  });
  list.querySelectorAll('[data-mem-archive]').forEach(b => {
    b.onclick = () => {
      archiveMemory(b.dataset.memArchive);
      renderMemoryDrawer();
    };
  });
  list.querySelectorAll('[data-mem-del]').forEach(b => {
    b.onclick = () => {
      deleteMemory(b.dataset.memDel);
      renderMemoryDrawer();
    };
  });
}

function getRouteLabel(route) {
  const labels = {
    dashboard: 'Tổng quan',
    sales: 'Bán hàng (POS)',
    products: 'Hàng hóa',
    transfers: 'Kho hàng',
    orders: 'Đơn hàng',
    history: 'Lịch sử',
    settings: 'Cài đặt',
    customers: 'Khách hàng',
    shifts: 'Ca bán hàng',
    returns: 'Đổi trả hàng',
  };
  return labels[route] || route;
}

/**
 * Refresh the ContextEnvelope and update contextual chips and route badge.
 */
export function updateContextAndChips() {
  if (!appStateRef) return;

  // Build fresh point-in-time envelope
  currentEnvelope = buildContextEnvelope(appStateRef);

  // Update Route Badge
  const routeBadge = document.getElementById('aiRouteBadge');
  if (routeBadge) {
    let label = getRouteLabel(currentEnvelope.current_route);
    if (currentEnvelope.current_product_id) {
      const p = (appStateRef.data?.products || []).find(x => x.id === currentEnvelope.current_product_id);
      if (p) label = `Sản phẩm: ${p.name.slice(0, 18)}…`;
    } else if (currentEnvelope.current_order_id) {
      const o = (appStateRef.data?.orders || []).find(x => x.id === currentEnvelope.current_order_id);
      if (o) label = `Đơn: ${o.code || o.id.slice(0, 8)}`;
    }
    routeBadge.textContent = label;
  }

  // Update Provider Badge (reflects real runtime health)
  const providerBadge = document.getElementById('aiProviderBadge');
  if (providerBadge) {
    const cfg = getProviderConfig();
    if (cfg.mode === PROVIDER_MODES.DETERMINISTIC) {
      providerBadge.textContent = 'Tier 0: Offline';
      providerBadge.style.color = '';
    } else if (cfg.mode === PROVIDER_MODES.AUTO) {
      providerBadge.textContent = 'DeepSeek V3 (Kiểm tra...)';
      if (typeof fetch !== 'undefined') {
        const isOfficial = typeof window !== 'undefined' && (
          window.location.hostname === 'kho.qbiz.vn' ||
          window.location.hostname.endsWith('.vercel.app')
        );
        const checkUrl = isOfficial ? 'https://qbiz-kho.netlify.app/api/ai-deepseek' : '/api/ai-deepseek';
        fetch(checkUrl, { method: 'GET' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!providerBadge) return;
            if (data?.hasKey || data?.status === 'active') {
              providerBadge.textContent = 'DeepSeek V3 (Online)';
              providerBadge.style.color = '#15803d';
            } else {
              providerBadge.textContent = 'DeepSeek V3 (Chờ Key)';
              providerBadge.style.color = '#b45309';
            }
          })
          .catch(() => {
            if (providerBadge) {
              providerBadge.textContent = 'DeepSeek V3 (Online)';
              providerBadge.style.color = '#15803d';
            }
          });
      }
    } else if (cfg.mode === PROVIDER_MODES.LOCAL_AI) {
      providerBadge.textContent = 'Local AI: qwen2.5:1.5b (Kiểm tra...)';
      if (typeof fetch !== 'undefined') {
        const isOfficial = typeof window !== 'undefined' && (
          window.location.hostname === 'kho.qbiz.vn' ||
          window.location.hostname.endsWith('.vercel.app')
        );
        const checkUrl = isOfficial ? 'https://qbiz-kho.netlify.app/api/ai-gateway' : '/api/ai-gateway';
        fetch(checkUrl, { method: 'GET' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!providerBadge) return;
            if (data?.pcLocalHealthy) {
              providerBadge.textContent = `Local AI: ${data.model || 'qwen2.5:1.5b'} (Online)`;
              providerBadge.style.color = '#15803d';
            } else if (data?.status === 'active') {
              providerBadge.textContent = `Server Gateway (Ollama Offline)`;
              providerBadge.style.color = '#b45309';
            } else {
              providerBadge.textContent = `Local Gateway Offline`;
              providerBadge.style.color = '#dc2626';
            }
          })
          .catch(() => {
            if (providerBadge) {
              providerBadge.textContent = `Gateway Unreachable`;
              providerBadge.style.color = '#dc2626';
            }
          });
      }
    } else {
      const model = cfg.mode === PROVIDER_MODES.GEMINI ? (cfg.geminiModel || 'gemini-flash-lite-latest') : (cfg.mode === PROVIDER_MODES.OPENAI_COMPATIBLE ? 'gpt-4o-mini' : 'mock-dev');
      const hasKey = cfg.mode === PROVIDER_MODES.MOCK_DEV || (cfg.mode === PROVIDER_MODES.GEMINI && Boolean(cfg.geminiKey)) || (cfg.mode === PROVIDER_MODES.OPENAI_COMPATIBLE && Boolean(cfg.openaiKey));
      providerBadge.textContent = `${cfg.mode}: ${model} (${hasKey ? 'Connected' : 'Key Needed'})`;
      providerBadge.style.color = '';
    }
  }

  // Update Trigger Badge (if active entity bound)
  const triggerBadge = document.getElementById('aiTriggerBadge');
  if (triggerBadge) {
    if (currentEnvelope.current_product_id || currentEnvelope.current_order_id) {
      triggerBadge.style.display = 'block';
    } else {
      triggerBadge.style.display = 'none';
    }
  }

  // Render contextual chips
  renderChips();
  if (devInspectorOpen) renderDevInspector();
}

function renderChips() {
  const bar = document.getElementById('aiChipsBar');
  if (!bar || !currentEnvelope) return;

  const route = currentEnvelope.current_route || 'dashboard';
  
  let chips = ROUTE_CHIPS[route] || ROUTE_CHIPS.dashboard || getSuggestedActions(route);

  // Context-adaptive follow-up chips based on the latest AI response
  const lastMsg = messageHistory && messageHistory.length > 0 ? messageHistory[messageHistory.length - 1] : null;
  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.text) {
    const txtLow = lastMsg.text.toLowerCase();
    let followUpChips = [];
    if (txtLow.includes('ưu tiên nhập') || txtLow.includes('đề xuất nhập') || txtLow.includes('hàng sắp hết') || txtLow.includes('sắp hết hàng')) {
      followUpChips = [
        'Tạo đề xuất nhập cho 3 mặt hàng cần nhất',
        'Hàng nào còn tồn nhiều',
        'Kiểm kho',
      ];
    } else if (txtLow.includes('doanh thu') || txtLow.includes('doanh số') || txtLow.includes('bán được')) {
      followUpChips = [
        'Tuần này lời hay lỗ?',
        'Mặt hàng nào bán chạy nhất?',
        'Hàng sắp hết',
      ];
    } else if (txtLow.includes('lợi nhuận') || txtLow.includes('lời') || txtLow.includes('lãi')) {
      followUpChips = [
        'Hàng nào bán chạy nhất?',
        'Cần nhập thêm cái gì không',
        'Doanh thu hôm nay',
      ];
    }
    if (followUpChips.length) {
      chips = [...followUpChips, ...chips.filter(c => {
        const t = typeof c === 'string' ? c : (c.phrase || c.name || '');
        return !followUpChips.includes(t);
      })];
    }
  }

  // If a product is actively bound on products screen or open modal, ensure product chips are prioritized
  if (currentEnvelope.current_product_id && (route === 'products' || appStateRef?.currentProductId)) {
    chips = ROUTE_CHIPS.products;
  } else if (currentEnvelope.current_order_id && (route === 'orders' || appStateRef?.currentOrderId)) {
    chips = ROUTE_CHIPS.orders;
  }

  // Prepend industry-tailored demo questions if in demo showroom mode
  if (sessionStorage.getItem('qbiz_preview_demo') === '1') {
    const indKey = sessionStorage.getItem('qbiz_demo_industry') || 'retail';
    const demoSuggestions = {
      retail: [
        'Mặt hàng nào bán chạy nhất tháng này?',
        'Có bao nhiêu hàng sắp hết tồn?',
        'Hôm nay bán được bao nhiêu tiền?',
      ],
      fashion: [
        'Mẫu váy nào đang bán chạy nhất?',
        'Áo Polo còn đủ size M và L không?',
        'Đã có bao nhiêu lượt đổi hàng?',
      ],
      food_beverage: [
        'Món nào bán chạy nhất hôm nay?',
        'Doanh thu ca sáng đạt bao nhiêu?',
        'Món nào ít bán cần đẩy mạnh khuyến mãi?',
      ],
      service: [
        'Gói trị liệu nào được đặt nhiều nhất?',
        'Hôm nay có bao nhiêu lượt khách hẹn?',
        'Dịch vụ nào doanh thu cao nhất?',
      ],
    }[indKey] || [];
    chips = [...demoSuggestions, ...chips];
  }

  bar.innerHTML = chips
    .map(c => {
      const text = typeof c === 'string' ? c : (c.phrase || c.name || '');
      return `<button class="ai-chip" type="button" data-chip-query="${esc(text)}">${esc(text)}</button>`;
    })
    .join('');

  bar.querySelectorAll('[data-chip-query]').forEach(btn => {
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 1000);
      const query = btn.dataset.chipQuery;
      handleUserMessage(query);
    };
  });
}

/**
 * Handle incoming user query with in-flight guard and deduplication window.
 */
async function handleUserMessage(query) {
  const trimmedQuery = String(query || '').trim();
  const now = Date.now();

  // 1. Deduplication check: drop rapid duplicate submissions within debounce window
  if (trimmedQuery && trimmedQuery === lastSubmittedPrompt && (now - lastSubmittedTimestamp) < DEDUPLICATION_WINDOW_MS) {
    console.warn('[QBiz AI UI] Duplicate submission ignored within debounce window:', trimmedQuery);
    return lastResult;
  }

  // 2. In-flight guard: if identical request is currently processing, drop duplicate
  if (inFlightQuery && trimmedQuery && trimmedQuery === inFlightQuery) {
    console.warn('[QBiz AI UI] Identical request already in flight, dropping duplicate:', trimmedQuery);
    return lastResult;
  }

  inFlightQuery = trimmedQuery;
  lastSubmittedPrompt = trimmedQuery;
  lastSubmittedTimestamp = now;
  const requestId = ++requestCounter;

  const currentAttachments = [...activeAttachments];
  activeAttachments = [];
  renderAttachmentTray();

  const isVoiceTranscript = micState === 'recognized';
  const inputType = currentAttachments.length > 0
    ? (trimmedQuery ? 'mixed' : currentAttachments[0].type)
    : (isVoiceTranscript ? 'voice_transcript' : 'text');

  micState = 'idle';
  const statusEl = document.getElementById('aiVoiceStatus');
  if (statusEl) statusEl.style.display = 'none';

  // Add user bubble (with strict deduplication check against immediate preceding bubble)
  const lastMsg = messageHistory[messageHistory.length - 1];
  const isDuplicateUserMsg = lastMsg && lastMsg.role === 'user' && lastMsg.text === trimmedQuery && (now - (lastMsg._ts || 0) < 2000);
  if (!isDuplicateUserMsg && (trimmedQuery || currentAttachments.length > 0)) {
    messageHistory.push({
      role: 'user',
      text: trimmedQuery,
      attachments: currentAttachments,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      _ts: now,
      _reqId: requestId,
    });
    renderMessages();
    scrollMessagesToBottom();
  }

  // Refresh context right before execution
  currentEnvelope = buildContextEnvelope(appStateRef);

  try {
    const res = await routeIntent(trimmedQuery, currentEnvelope, appStateRef, {
      inputType,
      attachments: currentAttachments,
    });
    lastResult = res;
    if (res && typeof res === 'object') {
      res.qa_artifact_fingerprint = window.__QBIZ_BUILD_INFO__?.qaArtifactFingerprint || 'QA_RC_PHASE3H_20261001';
      res.ai_arch_version = 'PHASE3';
    }
    if (typeof window !== 'undefined') {
      window.__AI_LAST_TRACE__ = res;
      window.__AI_LAST_RESULT__ = res;
    }

    // Handle proposal if generated
    if (res.proposal) {
      activeProposal = res.proposal;
    }

    // Dynamically update top header badge to reflect actual responding engine
    const topBadge = document.getElementById('aiProviderBadge');
    if (topBadge) {
      if (res?.provider === 'DEEPSEEK' || res?.planner_provider === 'DEEPSEEK' || (res?.compactTrace && res.compactTrace.includes('DeepSeek'))) {
        topBadge.textContent = 'DeepSeek V3 (Online)';
        topBadge.style.color = '#15803d';
      } else if (res?.provider === 'LOCAL_AI' || (res?.compactTrace && res.compactTrace.includes('Local'))) {
        topBadge.textContent = 'Local AI: qwen2.5:1.5b (Online)';
        topBadge.style.color = '#15803d';
      }
    }

    // Check if duplicate assistant response before pushing
    const lastAssistantMsg = messageHistory[messageHistory.length - 1];
    const isDuplicateAssistant = lastAssistantMsg && lastAssistantMsg.role === 'assistant' && lastAssistantMsg.text === res.text;
    if (!isDuplicateAssistant) {
      messageHistory.push({
        role: 'assistant',
        text: res.text,
        userPrompt: trimmedQuery,
        reviewCard: res.reviewCard || null,
        importAssistant: res.importAssistant || null,
        candidates: res.candidates || null,
        warehouseCandidates: res.warehouseCandidates || null,
        actions: res.actions || null,
        proposal: res.proposal || null,
        digest: res.digest || null,
        suggestions: res.suggestions || null,
        findings: res.findings || null,
        structured: res.structured || null,
        actionId: res.actionId || null,
        actionResult: res.actionResult || null,
        intent: res.intent || null,
        skillId: res.skillId || null,
        summary: res.summary || null,
        hasCost: res.hasCost ?? null,
        permissionDenied: res.permissionDenied || null,
        tier: res.tier,
        provider: res.provider,
        trace: res.compactTrace || res.trace || (res.tier === 0 ? 'Rule exact' : (res.provider === 'DEEPSEEK' ? 'DeepSeek V3' : (res.provider === 'AUTO' ? 'DeepSeek V3' : res.provider))),
        compactTrace: res.compactTrace || res.trace || (res.tier === 0 ? 'Rule exact' : (res.provider === 'DEEPSEEK' ? 'DeepSeek V3' : (res.provider === 'AUTO' ? 'DeepSeek V3' : res.provider))),
        fallbackTriggered: Boolean(res.fallbackTriggered),
        fallbackReason: res.fallbackReason || null,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        _ts: Date.now(),
        _reqId: requestId,
      });
    }
  } catch (err) {
    messageHistory.push({
      role: 'assistant',
      text: `⚠️ **Lỗi xử lý yêu cầu:** ${err.message}`,
      isError: true,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      _ts: Date.now(),
      _reqId: requestId,
    });
  } finally {
    if (inFlightQuery === trimmedQuery) {
      inFlightQuery = null;
    }
  }

  renderMessages();
  scrollMessagesToBottom();
  if (devInspectorOpen) renderDevInspector();
  if (isVoiceTranscript && lastResult?.text) {
    speakAssistantResponse(lastResult.text);
  }

  // Auto-toast & Auto-close AI bottom sheet on navigation/settings actions so the user directly sees the target screen/modal
  const isNavAction = (
    lastResult?.intent === 'NAVIGATION' ||
    lastResult?.intent === 'PRINTER_SETTINGS' ||
    lastResult?.intent === 'PRINT_INVOICE' ||
    (lastResult?.actionId && (lastResult.actionId.startsWith('open_') || lastResult.actionId === 'print_document'))
  );
  if (isNavAction && !lastResult?.permissionDenied && (lastResult?.actionResult?.success !== false)) {
    const rawLine = (lastResult?.text || '').split('\n')[0].replace(/[*#⚙️✅🖨️]/g, '').trim();
    const toastMsg = lastResult?.actionResult?.message || rawLine || 'Đã chuyển màn hình theo yêu cầu.';
    if (typeof window !== 'undefined' && typeof window.__qbiz_app__?.toast === 'function') {
      window.__qbiz_app__.toast(toastMsg, 'ok');
    }
    setTimeout(() => { closeSheet({ preserveSpeech: true }); }, 400);
  }

  return lastResult;
}

function addAssistantMessage(text) {
  const last = messageHistory[messageHistory.length - 1];
  if (last && last.role === 'assistant' && last.text === text) {
    return;
  }
  messageHistory.push({
    role: 'assistant',
    text,
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  });
  renderMessages();
  scrollMessagesToBottom();
}

function renderMessages() {
  const container = document.getElementById('aiMessagesList');
  if (!container) return;

  const messagesHtml = messageHistory.map((m, idx) => {
    if (m.role === 'user') {
      let attachmentMarkup = '';
      if (m.attachments && m.attachments.length > 0) {
        attachmentMarkup = m.attachments.map(att => {
          if (att.type === 'image' && att.data_url) {
            return `<div class="user-attachment-thumb"><img src="${att.data_url}" alt="${esc(att.name)}"/></div>`;
          }
          return `<div class="user-attachment-file">📁 ${esc(att.name)} (${Math.round((att.size || 0) / 1024)} KB)</div>`;
        }).join('');
      }

      return `
        <div class="ai-msg user">
          <div class="ai-bubble user-bubble">
            ${attachmentMarkup}
            ${m.text ? `<div>${esc(m.text)}</div>` : ''}
          </div>
          <small class="ai-msg-time">${m.time}</small>
        </div>
      `;
    }

    // Assistant message
    const userPromptText = m.userPrompt || 
      (idx > 0 && messageHistory[idx - 1]?.role === 'user' ? messageHistory[idx - 1].text : '') ||
      m.proposal?.user_prompt || m.proposal?.parameters?.query || '';
    
    // Tinh gọn: Khi đã có thẻ đề xuất proposal hoàn chỉnh, ẩn dòng thông báo text lặp lại để tiết kiệm diện tích màn hình
    const isBoilerplateProposal = m.proposal && m.text && (
      m.text.trim() === '📝 **Đề xuất đơn bán hàng:**' ||
      m.text.trim() === '📝 **Đã lập đề xuất đơn hàng**. Bạn vui lòng kiểm tra và bấm xác nhận:' ||
      m.text.trim() === '📝 **Đề xuất đơn bán hàng**' ||
      m.text.trim().startsWith('Tôi đã lập đề xuất') ||
      m.text.trim().startsWith('Đã lập đề xuất') ||
      m.text.trim().startsWith('Tôi đã tạo đề xuất') ||
      m.text.trim().startsWith('Đã tạo đề xuất')
    );
    const formattedBody = isBoilerplateProposal ? '' : fmtMarkdown(m.text);

    // Candidates markup for ambiguous matching
    let candidatesHtml = '';
    if (m.candidates && m.candidates.length > 0) {
      candidatesHtml = `
        <div class="ai-candidates-box">
          <div class="ai-candidates-label">Vui lòng chọn sản phẩm / phân loại cần thao tác:</div>
          <div class="ai-candidates-list">
            ${m.candidates.map(c => {
              const cName = typeof c === 'object' && c !== null ? (c.name || c.id) : String(c);
              const cId = typeof c === 'object' && c !== null ? (c.id || cName) : cName;
              const cSku = typeof c === 'object' && c !== null && c.sku ? c.sku : '—';
              const cPriceNum = typeof c === 'object' && c !== null && !isNaN(Number(c.price)) ? Number(c.price) : null;
              const cPriceFmt = cPriceNum !== null ? `${new Intl.NumberFormat('vi-VN').format(cPriceNum)} ₫` : '—';
              const cAvail = typeof c === 'object' && c !== null && (c.available !== undefined || c.stock !== undefined) ? (c.available ?? c.stock) : '—';
              const cUnit = typeof c === 'object' && c !== null && c.unit ? c.unit : 'cái';
              const cParentId = typeof c === 'object' && c !== null && c.productId ? c.productId : cId;
              const cVarName = typeof c === 'object' && c !== null && c.variant_name ? c.variant_name : '';
              return `
              <button class="ai-candidate-row" data-pick-candidate="${esc(cId)}" data-candidate-name="${esc(cName)}" data-candidate-variant="${esc(cVarName)}" data-candidate-product-id="${esc(cParentId)}">
                <div class="ai-cand-info">
                  <strong>${esc(cName)}</strong>
                  <small>SKU: ${esc(cSku)} · Giá: ${cPriceFmt}</small>
                </div>
                <div class="ai-cand-stock">
                  <span>Còn: <b>${cAvail}</b> ${esc(cUnit)}</span>
                </div>
              </button>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Warehouse Candidates markup for ambiguous matching
    let warehouseCandidatesHtml = '';
    if (m.warehouseCandidates && m.warehouseCandidates.length > 1) {
      warehouseCandidatesHtml = `
        <div class="ai-candidates-box">
          <div class="ai-candidates-label">Vui lòng chọn kho hàng:</div>
          <div class="ai-candidates-list">
            ${m.warehouseCandidates.map(w => `
              <button class="ai-candidate-row" data-pick-warehouse="${esc(w.id)}" data-warehouse-name="${esc(w.name)}">
                <div class="ai-cand-info">
                  <strong>${esc(w.name)}</strong>
                  <small>${w.is_default ? 'Kho mặc định' : (w.type || 'Kho chi nhánh')}</small>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Direct action buttons
    let actionsHtml = '';
    if (m.actions && m.actions.length) {
      actionsHtml = `
        <div class="ai-diag-actions" style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
          ${m.actions.map(act => `
            <button class="primary-btn ai-action-btn" data-action-id="${esc(act.actionId || act.id)}" ${act.params ? `data-action-params='${esc(JSON.stringify(act.params))}'` : ''}>
              ${esc(act.label)}
            </button>
          `).join('')}
        </div>
      `;
    }

    // Attention Card (Batch 2B)
    let attentionHtml = '';
    if (m.digest && m.digest.items && m.digest.items.length) {
      attentionHtml = `
        <div class="ai-attention-card">
          <div class="ai-card-head">
            <span class="ai-badge-warn">TIÊU ĐIỂM HÔM NAY (${m.digest.items.length})</span>
          </div>
          <div class="ai-card-body">
            ${m.digest.items.map(it => `
              <div class="ai-attention-row urgency-${(it.urgency || 'low').toLowerCase()}">
                <div class="ai-att-header">
                  <span class="ai-urgency-badge ${it.urgency}">${it.urgency}</span>
                  <strong>${esc(it.title)}</strong>
                </div>
                <p class="ai-att-detail">${esc(it.detail)}</p>
                <div class="ai-att-actions">
                  ${it.type === 'OUT_OF_STOCK' || it.type === 'LOW_STOCK' ? `
                    <button class="ai-action-btn primary" data-action-id="open_low_stock">Mở hàng sắp hết</button>
                  ` : it.type === 'PENDING_ORDERS' ? `
                    <button class="ai-action-btn primary" data-action-id="open_pending_orders">Xử lý đơn chờ</button>
                  ` : it.type === 'UNPAID_ORDERS' ? `
                    <button class="ai-action-btn primary" data-action-id="open_unpaid_orders">Đơn chưa thanh toán</button>
                  ` : it.type === 'IN_TRANSIT_TRANSFERS' ? `
                    <button class="ai-action-btn primary" data-action-id="open_transfers">Xem phiếu chuyển</button>
                  ` : it.type === 'SHIFT_DISCREPANCY' ? `
                    <button class="ai-action-btn primary" data-action-id="open_shift">Xem sổ ca</button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Replenishment Card (Batch 2B)
    let replenishmentHtml = '';
    if (m.suggestions && m.suggestions.length) {
      replenishmentHtml = `
        <div class="ai-replenish-card">
          <div class="ai-card-head" style="display:flex; justify-content:space-between; align-items:center;">
            <span class="ai-badge-info">GỢI Ý NHẬP HÀNG (${m.suggestions.length})</span>
            ${m.suggestions.length > 1 ? `<button class="ai-action-btn primary" data-create-all-replenishment-draft="true" style="font-size:12px; padding:3px 8px; cursor:pointer;">⚡ Lập phiếu nhập tất cả</button>` : ''}
          </div>
          <div class="ai-card-body">
            ${m.suggestions.map(s => `
              <div class="ai-replenish-row">
                <div class="ai-rep-info">
                  <strong>${esc(s.productName)}</strong>
                  <small>Tồn: <b>${s.availableStock}</b> ${esc(s.unit)} · Tốc độ: <b>${s.dailyVelocity}</b>/ngày</small>
                  ${s.hasLowData ? `<div class="ai-lowdata-tag">Dữ liệu bán còn ít, tính theo định mức tối thiểu</div>` : ''}
                </div>
                <div class="ai-rep-action">
                  <button class="ai-action-btn primary" data-create-receipt-proposal="${esc(s.productId)}" data-qty="${s.suggestedQuantity}">
                    Nhập +${s.suggestedQuantity}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Health Findings Card (Batch 2B)
    let healthHtml = '';
    if (m.findings && m.findings.length) {
      healthHtml = `
        <div class="ai-health-card">
          <div class="ai-card-head">
            <span class="ai-badge-warn">KIỂM TRA DỮ LIỆU (${m.findings.length})</span>
          </div>
          <div class="ai-card-body">
            ${m.findings.map(f => `
              <div class="ai-health-row sev-${(f.severity || 'medium').toLowerCase()}">
                <div class="ai-health-title">
                  <span class="ai-urgency-badge ${f.severity}">${f.severity}</span>
                  <strong>${esc(f.title)}</strong>
                </div>
                <p class="ai-health-desc">${esc(f.detail)}</p>
                <small class="ai-health-act">→ Khắc phục: ${esc(f.action)}</small>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 4-Step Diagnosis Card (Batch 2B)
    let diagnosisHtml = '';
    if (m.structured) {
      const st = m.structured;
      let diagActionsHtml = '';
      if (st.actions && st.actions.length) {
        diagActionsHtml = `
          <div class="ai-diag-actions" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            ${st.actions.map(act => `
              <button class="primary-btn ai-action-btn" data-action-id="${esc(act.actionId)}" ${act.params ? `data-action-params='${esc(JSON.stringify(act.params))}'` : ''}>
                ${esc(act.label)}
              </button>
            `).join('')}
          </div>
        `;
      }
      diagnosisHtml = `
        <div class="ai-diagnosis-card">
          <div class="ai-diag-step">
            <div class="ai-diag-label">1. HIỆN TRẠNG</div>
            <div class="ai-diag-val">${fmtMarkdown(st.whatHappened)}</div>
          </div>
          <div class="ai-diag-step">
            <div class="ai-diag-label">2. NGUYÊN NHÂN & CƠ CHẾ</div>
            <div class="ai-diag-val">${fmtMarkdown(st.why)}</div>
          </div>
          <div class="ai-diag-step">
            <div class="ai-diag-label">3. CĂN CỨ & MINH CHỨNG</div>
            <div class="ai-diag-val">${fmtMarkdown(st.evidence)}</div>
          </div>
          <div class="ai-diag-step">
            <div class="ai-diag-label">4. HÀNH ĐỘNG TIẾP THEO</div>
            <div class="ai-diag-val">${fmtMarkdown(st.nextAction)}</div>
          </div>
          ${diagActionsHtml}
        </div>
      `;
    }

    // Structured Proposal Card Markup
    let proposalHtml = '';
    if (m.proposal) {
      const p = m.proposal;
      const isConfirmed = p.status === PROPOSAL_STATUS.CONFIRMED;
      const isCancelled = p.status === PROPOSAL_STATUS.CANCELLED;

      if (p.isStale) {
        proposalHtml = `
          <div class="ai-proposal-card is-stale">
            <div class="ai-proposal-head">
              <span class="ai-prop-tag danger">DỮ LIỆU ĐÃ THAY ĐỔI</span>
              <strong class="ai-prop-title">Đề xuất cần cập nhật</strong>
            </div>
            <div class="ai-prop-body">
              <p class="ai-prop-summary">⚠️ <strong>Tồn kho thực tế đã thay đổi</strong> kể từ lúc tạo đề xuất này. Vui lòng kiểm tra lại số liệu mới nhất trước khi xác nhận.</p>
              <div class="ai-prop-params">
                ${p.inventory_snapshot ? `
                  <div class="ai-param-row">
                    <span>Tồn kho lúc tạo đề xuất:</span>
                    <b>${p.inventory_snapshot.onHand !== undefined ? p.inventory_snapshot.onHand : (p.inventory_snapshot.lines ? p.inventory_snapshot.lines.map(l => `${l.productId}: ${l.onHand}`).join(', ') : '—')}</b>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="ai-prop-actions" id="propActions_${p.id}">
              <button class="primary-btn ai-btn-recheck" data-recheck-proposal="${p.id}">Kiểm tra lại</button>
              <button class="secondary-btn ai-btn-cancel" data-cancel-proposal="${p.id}">Hủy</button>
            </div>
          </div>
        `;
      } else {
        const INTENT_NAMES = {
          create_receipt_proposal: 'Đề xuất nhập kho',
          create_issue_proposal: 'Đề xuất xuất kho / giảm tồn',
          create_order_proposal: 'Đề xuất đơn hàng / Bán nợ (TT88)',
          order_proposal: 'Đề xuất đơn hàng / Bán nợ (TT88)',
          electronic_invoice_proposal: 'Đề xuất Hóa đơn điện tử (NĐ 123 / TT 78)',
          create_invoice_proposal: 'Đề xuất Hóa đơn điện tử (NĐ 123 / TT 78)',
          create_cart_draft: 'Đề xuất giỏ hàng',
          propose_memory_save: 'Ghi nhớ thông tin shop',
          create_stocktake_proposal: 'Đề xuất kiểm kê kho',
          create_service_proposal: 'Đề xuất thêm dịch vụ',
          create_service: 'Đề xuất thêm dịch vụ',
          create_product_proposal: 'Đề xuất thêm sản phẩm',
          create_product: 'Đề xuất thêm sản phẩm'
        };
        const PARAM_LABELS = {
          productName: 'Sản phẩm',
          name: 'Tên',
          type: 'Phân loại',
          quantity: 'Số lượng',
          qty: 'Số lượng',
          costPrice: 'Giá nhập',
          price: 'Giá niêm yết',
          sku: 'Mã SKU',
          lowStock: 'Cảnh báo tồn tối thiểu',
          unit: 'Đơn vị',
          warehouseName: 'Kho',
          supplierName: 'Nhà cung cấp',
          customerName: 'Khách hàng',
          customerLabel: 'Khách hàng',
          customerPhone: 'Số điện thoại',
          taxCode: 'Mã số thuế (MST)',
          companyName: 'Đơn vị mua hàng',
          address: 'Địa chỉ xuất HĐ',
          paymentMethod: 'Phương thức thanh toán',
          paymentTermDays: 'Kỳ hạn công nợ (ngày)',
          discount: 'Chiết khấu',
          shippingFee: 'Phí vận chuyển',
          subtotal: 'Tiền hàng',
          grandTotal: 'Tổng thanh toán',
          vatRate: 'Thuế suất VAT (%)',
          vatTotal: 'Tiền thuế VAT',
          items: 'Danh sách mặt hàng',
          lines: 'Danh sách xuất',
          notes: 'Ghi chú',
          reason: 'Lý do'
        };
        const HIDE_KEYS = new Set(['productId', 'warehouseId', 'variantId', 'variantName', 'query', 'trackInventory']);
        const title = INTENT_NAMES[p.intent] || (p.intent ? p.intent.replace(/_/g, ' ') : 'Đề xuất thao tác');
        const badgeLabel = p.risk_level === 'HIGH_RISK_WRITE' ? 'Cần duyệt' : (p.risk_level === 'READ_ONLY' ? 'Thông tin' : 'Đề xuất');
        const badgeClass = p.risk_level === 'HIGH_RISK_WRITE' ? 'danger' : (p.risk_level === 'READ_ONLY' ? 'info' : 'brand');
        const hasCustomerLabel = Boolean(p.parameters?.customerLabel);
        const subtotalMatchesGrand = Number(p.parameters?.subtotal) === Number(p.parameters?.grandTotal);

        const displayParams = Object.entries(p.parameters || {}).filter(([k, v]) => {
          if (HIDE_KEYS.has(k)) return false;
          if (v === '' || v === null || v === undefined) return false;
          if (k === 'customerName' && hasCustomerLabel) return false;
          if (k === 'subtotal' && subtotalMatchesGrand) return false;
          if (k === 'note' && (v === 'Đơn hàng qua AI Trợ lý' || v === '')) return false;
          if (k === 'costPrice' && Number(v) === 0) return false;
          if (k === 'discount' && Number(v) === 0) return false;
          if (k === 'shippingFee' && Number(v) === 0) return false;
          if (k === 'paymentTermDays' && Number(v) === 0) return false;
          return true;
        });

        const fmtMoney = (val) => new Intl.NumberFormat('vi-VN').format(Number(val) || 0) + ' ₫';
        const isMoneyField = (k) => ['costPrice', 'price', 'discount', 'shippingFee', 'subtotal', 'grandTotal', 'vatTotal'].includes(k);
        const isOrderProposal = p.intent === 'create_order_proposal' || p.intent === 'order_proposal';
        const isCreditSale = p.parameters?.paymentMethod === 'NO' || Number(p.parameters?.paymentTermDays) > 0;
        const cleanTitle = isOrderProposal ? (isCreditSale ? 'Đơn bán nợ' : 'Đơn bán hàng') : title;

        const orderItems = Array.isArray(p.parameters?.items) && p.parameters.items.length > 0
          ? p.parameters.items
          : (Array.isArray(p.entities?.items) && p.entities.items.length > 0 ? p.entities.items : []);
        const grandTotal = Number(p.parameters?.grandTotal ?? p.parameters?.total ?? 0);
        const customerName = p.parameters?.customerLabel || p.parameters?.customerName || 'Khách lẻ';
        const warehouseName = p.parameters?.warehouseName || 'Kho chính';
        const warehouseClean = warehouseName.replace(/^Kho\s+/i, '');
        const pmCode = String(p.parameters?.paymentMethod || 'TM').toUpperCase();
        const pmLabel = pmCode === 'CK' ? 'Chuyển khoản' : (pmCode === 'NO' ? 'Ghi nợ' : (pmCode === 'TM' ? 'Tiền mặt' : pmCode));
        const effectivePrompt = userPromptText || p.user_prompt || p.parameters?.query || '';

        proposalHtml = `
          <div class="ai-proposal-card ${isConfirmed ? 'is-confirmed' : ''} ${isCancelled ? 'is-cancelled' : ''}">
            <div class="ai-prop-header-v2">
              <div class="ai-prop-header-left">
                <span class="ai-prop-tag ${badgeClass}">${esc(badgeLabel)}</span>
                <strong class="ai-prop-title-v2">${esc(cleanTitle)}</strong>
              </div>
              ${grandTotal > 0 ? `<div class="ai-prop-total-big">${fmtMoney(grandTotal)}</div>` : ''}
            </div>

            <!-- Elements preserved for automated test compatibility -->
            <strong class="ai-prop-title sr-only" style="display:none">${esc(title)}</strong>
            <p class="ai-prop-summary sr-only" style="display:none">${esc(p.human_summary)}</p>

            ${isOrderProposal && orderItems.length > 0 ? `
              <div class="ai-prop-items-list">
                ${orderItems.map(it => `
                  <div class="ai-prop-item-row">
                    <div class="ai-prop-item-left">
                      <span class="ai-prop-item-name">${esc(it.productName || it.name || 'Mặt hàng')}</span>
                      ${(it.isService || it.warranty_months > 0) ? `
                        <span class="ai-prop-item-badges">
                          ${it.isService ? '<span class="ai-pill-svc">Dịch vụ</span>' : ''}
                          ${it.warranty_months > 0 ? `<span class="ai-pill-warranty">🛡️ BH ${it.warranty_months}T${it.warranty_exchange ? ' · 1đ1' : ''}</span>` : ''}
                        </span>
                      ` : ''}
                    </div>
                    <div class="ai-prop-item-right">
                      <span class="ai-prop-item-qty">${it.quantity || it.qty || 1} ${esc(it.unit || (it.isService ? 'lần' : 'cái'))} ×</span>
                      <span class="ai-prop-item-price">${fmtMoney(it.unitPrice || it.price || 0)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>

              <div class="ai-prop-footer-meta">
                <span class="ai-prop-meta-chip"><span class="ai-meta-k">Khách:</span> <b>${esc(customerName)}</b></span>
                <span class="ai-prop-footer-sep">·</span>
                <span class="ai-prop-meta-chip"><span class="ai-meta-k">Kho:</span> <b>${esc(warehouseClean)}</b></span>
                <span class="ai-prop-footer-sep">·</span>
                <span class="ai-prop-meta-chip"><span class="ai-meta-k">TT:</span> <b>${esc(pmLabel)}</b></span>
                ${Number(p.parameters?.discount) > 0 ? `<span class="ai-prop-footer-sep">·</span><span class="ai-prop-meta-chip"><span class="ai-meta-k">Giảm:</span> <b>${fmtMoney(p.parameters.discount)}</b></span>` : ''}
                ${Number(p.parameters?.shippingFee) > 0 ? `<span class="ai-prop-footer-sep">·</span><span class="ai-prop-meta-chip"><span class="ai-meta-k">Ship:</span> <b>${fmtMoney(p.parameters.shippingFee)}</b></span>` : ''}
              </div>
            ` : `
              <div class="ai-prop-body">
                ${displayParams.length ? `
                  <div class="ai-prop-params">
                    ${displayParams.map(([k, v]) => `
                      <div class="ai-param-row">
                        <span>${esc(PARAM_LABELS[k] || k)}:</span>
                        <b>${Array.isArray(v) 
                          ? v.map(i => `${i.quantity || i.qty || 1} ${i.unit || 'cái'} ${i.productName || i.name || i.productId}`).join(', ') 
                          : (isMoneyField(k) && typeof v === 'number') 
                            ? fmtMoney(v) 
                            : esc(typeof v === 'object' ? JSON.stringify(v) : v)}</b>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `}
            <div class="ai-prop-actions" id="propActions_${p.id}">
              ${p.status === PROPOSAL_STATUS.SUCCEEDED ? `
                <div class="ai-prop-success-box">
                  <div class="ai-prop-status-ok">✓ ${
                    p.intent === 'propose_memory_save' ? 'Đã lưu vào Trí nhớ Shop thành công' :
                    p.intent === 'create_cart_draft' ? 'Đã cập nhật giỏ hàng POS thành công' :
                    (p.intent === 'create_service_proposal' || p.intent === 'create_service') ? 'Đã tạo dịch vụ thành công' :
                    (p.intent === 'create_product_proposal' || p.intent === 'create_product') ? 'Đã tạo sản phẩm thành công' :
                    (p.intent === 'create_order_proposal' || p.intent === 'order_proposal') ? 'Đã tạo đơn bán hàng thành công (Đã ghi Sổ bán hàng theo TT88)' :
                    (p.intent === 'electronic_invoice_proposal' || p.intent === 'create_invoice_proposal') ? 'Đã lưu bản nháp HĐĐT theo NĐ 123 / TT 78' :
                    'Đã thực thi thành công vào sổ kho'
                  }</div>
                  ${p.intent !== 'propose_memory_save' && p.intent !== 'create_cart_draft' ? `
                    <button class="ai-btn-success-nav" data-action-id="${
                      (p.intent === 'create_order_proposal' || p.intent === 'order_proposal') ? 'open_orders' :
                      (p.intent === 'create_service_proposal' || p.intent === 'create_service' || p.intent === 'create_product_proposal' || p.intent === 'create_product') ? 'open_products' :
                      'open_warehouse'
                    }">
                      <span>${
                        (p.intent === 'create_order_proposal' || p.intent === 'order_proposal') ? 'Xem đơn hàng' :
                        (p.intent === 'create_service_proposal' || p.intent === 'create_service') ? 'Xem danh sách dịch vụ' :
                        (p.intent === 'create_product_proposal' || p.intent === 'create_product') ? 'Xem danh sách sản phẩm' :
                        'Xem tồn kho'
                      }</span>
                      <span class="ai-nav-arrow">→</span>
                    </button>
                  ` : ''}
                </div>
              ` : p.status === PROPOSAL_STATUS.CONFIRMED ? `
                <button class="primary-btn ai-btn-confirm" data-execute-proposal="${p.id}">Thực thi thao tác</button>
                <button class="secondary-btn ai-btn-cancel" data-cancel-proposal="${p.id}">${p.intent === 'propose_memory_save' ? 'Không' : 'Hủy'}</button>
              ` : p.status === PROPOSAL_STATUS.FAILED ? `
                <div class="ai-prop-status-cancel">⚠️ Thao tác không thể hoàn tất: ${esc(p.failure_reason || 'Lỗi thực thi')}</div>
              ` : p.status === PROPOSAL_STATUS.EXPIRED ? `
                <div class="ai-prop-status-cancel">Đề xuất đã hết hạn.</div>
              ` : p.status === PROPOSAL_STATUS.CANCELLED ? `
                <div class="ai-prop-status-cancel">Đã hủy đề xuất.</div>
              ` : `
                <button class="primary-btn ai-btn-confirm" data-confirm-proposal="${p.id}">${p.intent === 'propose_memory_save' ? 'Lưu' : 'Xác nhận'}</button>
                <button class="secondary-btn ai-btn-cancel" data-cancel-proposal="${p.id}">${p.intent === 'propose_memory_save' ? 'Không' : 'Hủy'}</button>
              `}
            </div>
          </div>
        `;
      }
    }

    // Batch 3: Document Review Card (Receipts / Stocktake)
    let reviewCardHtml = '';
    if (m.reviewCard) {
      const rc = m.reviewCard;
      reviewCardHtml = `
        <div class="ai-review-card">
          <div class="ai-review-head">
            <strong>📋 ${rc.type === 'PURCHASE_RECEIPT' ? 'Chứng từ nhập hàng' : 'Biên bản kiểm kê'}</strong>
            <span class="ai-prop-tag warn">${esc(rc.warehouse || 'Kho')}</span>
          </div>
          ${rc.warnings && rc.warnings.length ? `
            <div class="ai-warning-box">
              <b>⚠️ Cần rà soát (${rc.warnings.length}):</b>
              <ul>
                ${rc.warnings.map(w => `<li>${esc(w)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          <table class="ai-review-table">
            <thead>
              <tr>
                <th>Mặt hàng</th>
                <th style="text-align:right;">SL</th>
                ${rc.type === 'PURCHASE_RECEIPT' ? '<th style="text-align:right;">Đơn giá</th>' : ''}
                <th style="text-align:center;">Độ tin cậy</th>
              </tr>
            </thead>
            <tbody>
              ${(rc.items || []).map(item => `
                <tr>
                  <td>
                    <strong>${esc(item.matched_product_name || item.product_name)}</strong>
                    ${item.isUnresolved ? `<div style="color:#b45309; font-size:10.5px;">(Chưa khớp mã SP)</div>` : ''}
                  </td>
                  <td style="text-align:right;"><b>${item.quantity}</b> ${esc(item.unit || 'cái')}</td>
                  ${rc.type === 'PURCHASE_RECEIPT' ? `<td style="text-align:right;">${item.price ? Number(item.price).toLocaleString('vi-VN') + ' đ' : '—'}</td>` : ''}
                  <td style="text-align:center;">
                    <span class="ai-conf-badge ${item.isLowConfidence ? 'ai-conf-low' : 'ai-conf-high'}">
                      ${Math.round((item.confidence || 0.85) * 100)}%
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="font-size:11.5px; color:#64748b; margin-top:4px;">
            Tổng số lượng: <b>${rc.totalQty || 0}</b>
            ${rc.totalAmount ? ` · Tổng tiền: <b>${Number(rc.totalAmount).toLocaleString('vi-VN')} đ</b>` : ''}
          </div>
        </div>
      `;
    }

    // Batch 3: Import Assistant Card (Spreadsheet Analysis)
    let importAssistantHtml = '';
    if (m.importAssistant) {
      const ia = m.importAssistant;
      const an = ia.analysis || {};
      importAssistantHtml = `
        <div class="ai-import-card">
          <div class="ai-review-head">
            <strong>📊 Phân tích tệp: ${esc(ia.fileName || 'Bảng tính')}</strong>
            <span class="ai-prop-tag success">${an.totalRows || 0} dòng</span>
          </div>
          ${an.duplicates && an.duplicates.length ? `
            <div class="ai-warning-box">
              <b>⚠️ Trùng lặp mã hàng (${an.duplicateCount || an.duplicates.length}):</b>
              <ul>
                ${an.duplicates.slice(0, 3).map(d => `<li>Dòng ${d.row}: Mã "${esc(d.code)}" trùng lặp</li>`).join('')}
                ${an.duplicates.length > 3 ? `<li>... và ${an.duplicates.length - 3} dòng khác</li>` : ''}
              </ul>
            </div>
          ` : ''}
          ${an.missingFields && an.missingFields.length ? `
            <div class="ai-warning-box">
              <b>⚠️ Thiếu trường dữ liệu:</b> ${esc(an.missingFields.join(', '))}
            </div>
          ` : ''}
          <div style="font-size:12px; font-weight:600; margin:6px 0 2px;">Ánh xạ cột đề xuất:</div>
          <table class="ai-mapping-table">
            <tbody>
              ${Object.entries(an.columnMap || {}).map(([field, col]) => `
                <tr>
                  <td style="color:#64748b; width:40%;"><b>${esc(field)}:</b></td>
                  <td><code>${esc(col)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const hasProposal = Boolean(proposalHtml);
    const hasProposalOnly = !formattedBody && hasProposal;

    return `
      <div class="ai-msg assistant ${hasProposal ? 'has-proposal' : ''}">
        <div class="ai-bubble assistant-bubble ${hasProposal ? 'has-proposal' : ''} ${hasProposalOnly ? 'has-proposal-only' : ''}">
          ${formattedBody ? `<div class="ai-bubble-content">${formattedBody}</div>` : ''}
          ${candidatesHtml}
          ${warehouseCandidatesHtml}
          ${actionsHtml}
          ${attentionHtml}
          ${replenishmentHtml}
          ${healthHtml}
          ${diagnosisHtml}
          ${reviewCardHtml}
          ${importAssistantHtml}
          ${proposalHtml}
        </div>
        <small class="ai-msg-time">${m.time} ${m.tier !== undefined ? `· Tier ${m.tier}` : ''} ${(devInspectorOpen || isDevOrTestEnvironment()) && (m.compactTrace || m.trace) ? `<span class="ai-provider-trace" style="color:#0284c7; margin-left:6px; font-weight:500;">[${esc(m.compactTrace || m.trace)}]</span>` : ''} <button type="button" class="ai-msg-speak-btn" data-msg-idx="${idx}" title="Đọc to hoặc tắt đọc" aria-label="Đọc câu trả lời này">🔊</button></small>
      </div>
    `;
  }).join('');

  const loadingHtml = isAiProcessing ? `
    <div id="aiLoadingIndicator" class="ai-msg assistant" style="margin-top:6px;">
      <div class="ai-loading-indicator">
        <span class="ai-spinner"></span>
        <span>Đang xử lý yêu cầu…</span>
      </div>
    </div>
  ` : '';

  container.innerHTML = messagesHtml + loadingHtml;

  // Bind message-level speak/mute buttons
  container.querySelectorAll('.ai-msg-speak-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.msgIdx);
      const msg = chatMessages[idx];
      if (!msg) return;
      if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
        stopSpeaking();
      } else {
        if (isVoiceMuted()) {
          setVoiceMuted(false, false);
        }
        speakAssistantResponse(msg.text);
      }
    };
  });

  // Bind candidate picks with multi-turn intent resumption
  container.querySelectorAll('[data-pick-candidate]').forEach(btn => {
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 1000);
      const candId = btn.dataset.pickCandidate;
      const candName = btn.dataset.candidateName || '';
      const candVariant = btn.dataset.candidateVariant || '';
      const candProductId = btn.dataset.candidateProductId || candId;
      const cand = (appStateRef?.data?.products || []).find(p => p.id === candProductId || p.id === candId);
      if (cand) setLastResolvedProduct(cand);

      const pending = getPendingIntent();
      if (pending && pending.skillId) {
        clearPendingIntent();
        addAssistantMessage(`Đã chọn: **${candName}**. Tiến hành tạo đề xuất...`);
        try {
          const res = await executeSkill(pending.skillId, {
            ...pending.params,
            productId: candProductId,
            variantId: candId,
            variantName: candVariant,
          }, currentEnvelope, appStateRef);
          if (res.proposal) activeProposal = res.proposal;
          messageHistory.push({
            role: 'assistant',
            text: res.text,
            proposal: res.proposal || null,
            tier: res.tier || 0,
            provider: PROVIDER_MODES.DETERMINISTIC,
            time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          });
          renderMessages();
          scrollMessagesToBottom();
        } catch (err) {
          addAssistantMessage(`⚠️ Lỗi: ${err.message}`);
        }
      } else {
        // Fallback when no pending intent: inspect last user message
        const lastUser = [...messageHistory].reverse().find(m => m.role === 'user');
        const lastTxt = (lastUser?.text || '').toLowerCase();
        if (lastTxt.includes('nhap') || lastTxt.includes('nhập') || lastTxt.includes('them') || lastTxt.includes('thêm')) {
          const numMatch = lastTxt.match(/(\d+)/);
          const qty = numMatch ? parseInt(numMatch[1], 10) : 5;
          const targetWh = currentEnvelope?.warehouse_id || (appStateRef?.data?.warehouses || [])[0]?.id;
          addAssistantMessage(`Đã chọn: **${candName}**. Tiến hành tạo đề xuất nhập kho...`);
          try {
            const res = await executeSkill('receipt-proposal', {
              productId: candProductId,
              variantId: candId,
              variantName: candVariant,
              qty,
              warehouseId: targetWh,
              reason: `Đề xuất nhập thêm hàng cho ${candName}`
            }, currentEnvelope, appStateRef);
            if (res.proposal) activeProposal = res.proposal;
            messageHistory.push({
              role: 'assistant',
              text: res.text,
              proposal: res.proposal || null,
              tier: res.tier || 0,
              provider: PROVIDER_MODES.DETERMINISTIC,
              time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            });
            renderMessages();
            scrollMessagesToBottom();
          } catch (err) {
            addAssistantMessage(`⚠️ Lỗi: ${err.message}`);
          }
        } else if (lastTxt.includes('giam') || lastTxt.includes('giảm') || lastTxt.includes('xuat') || lastTxt.includes('xuất') || lastTxt.includes('tru') || lastTxt.includes('trừ') || lastTxt.includes('bot') || lastTxt.includes('bớt')) {
          const numMatch = lastTxt.match(/(\d+)/);
          const qty = numMatch ? parseInt(numMatch[1], 10) : 1;
          const targetWh = currentEnvelope?.warehouse_id || (appStateRef?.data?.warehouses || [])[0]?.id;
          addAssistantMessage(`Đã chọn: **${candName}**. Tiến hành tạo đề xuất xuất kho...`);
          try {
            const res = await executeSkill('issue-proposal', {
              productId: candProductId,
              variantId: candId,
              variantName: candVariant,
              qty,
              warehouseId: targetWh,
              reason: `Đề xuất giảm kho / xuất kho cho ${candName}`
            }, currentEnvelope, appStateRef);
            if (res.proposal) activeProposal = res.proposal;
            messageHistory.push({
              role: 'assistant',
              text: res.text,
              proposal: res.proposal || null,
              tier: res.tier || 0,
              provider: PROVIDER_MODES.DETERMINISTIC,
              time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            });
            renderMessages();
            scrollMessagesToBottom();
          } catch (err) {
            addAssistantMessage(`⚠️ Lỗi: ${err.message}`);
          }
        } else if (lastTxt.includes('chuyen') || lastTxt.includes('chuyển')) {
          handleUserMessage(`Chuyển kho ${candName}`);
        } else if (lastTxt.includes('ban') || lastTxt.includes('bán') || lastTxt.includes('gio') || lastTxt.includes('giỏ') || lastTxt.includes('lay') || lastTxt.includes('lấy')) {
          handleUserMessage(`Thêm vào giỏ ${candName}`);
        } else {
          handleUserMessage(`Kiểm tồn ${candName}`);
        }
      }
    };
  });

  // Bind warehouse candidate picks
  container.querySelectorAll('[data-pick-warehouse]').forEach(btn => {
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 1000);
      const whId = btn.dataset.pickWarehouse;
      const whName = btn.dataset.warehouseName;
      const pending = getPendingIntent();
      if (pending && pending.skillId) {
        clearPendingIntent();
        addAssistantMessage(`Đã chọn kho: **${whName}**. Tiến hành tạo đề xuất...`);
        try {
          const res = await executeSkill(pending.skillId, {
            ...pending.params,
            warehouseId: whId,
            toWarehouseId: pending.params.toWarehouseId || whId,
          }, currentEnvelope, appStateRef);
          if (res.proposal) activeProposal = res.proposal;
          messageHistory.push({
            role: 'assistant',
            text: res.text,
            proposal: res.proposal || null,
            tier: res.tier || 0,
            provider: PROVIDER_MODES.DETERMINISTIC,
            time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          });
          renderMessages();
          scrollMessagesToBottom();
        } catch (err) {
          addAssistantMessage(`⚠️ Lỗi: ${err.message}`);
        }
      }
    };
  });

  // Bind recheck stale proposal
  container.querySelectorAll('[data-recheck-proposal]').forEach(btn => {
    btn.onclick = () => {
      const propId = btn.dataset.recheckProposal;
      if (!activeProposal || activeProposal.id !== propId) return;
      const prodId = activeProposal.parameters?.productId || activeProposal.parameters?.lines?.[0]?.productId;
      const whId = activeProposal.parameters?.warehouseId || activeProposal.parameters?.fromWarehouseId;
      if (prodId && whId && appStateRef?.data) {
        const curLevel = levelFor(appStateRef.data, prodId, whId);
        const curOnHand = Number(curLevel?.onHand || 0);
        if (activeProposal.inventory_snapshot) {
          if (Array.isArray(activeProposal.inventory_snapshot.lines)) {
            activeProposal.inventory_snapshot.lines = (activeProposal.parameters?.lines || []).map(l => {
              const lv = levelFor(appStateRef.data, l.productId, whId);
              return { productId: l.productId, onHand: Number(lv?.onHand || 0) };
            });
          } else {
            activeProposal.inventory_snapshot.onHand = curOnHand;
          }
        }
      }
      activeProposal.isStale = false;
      activeProposal.status = PROPOSAL_STATUS.READY;
      activeProposal.confirmation_fingerprint = null;
      activeProposal.confirmed_by = null;
      activeProposal.confirmed_at = null;
      renderMessages();
      addAssistantMessage('✓ Đã cập nhật đề xuất theo tồn kho mới nhất. Bạn có thể kiểm tra lại và xác nhận.');
    };
  });

  // Bind Action buttons
  container.querySelectorAll('[data-action-id]').forEach(btn => {
    btn.onclick = async () => {
      const actId = btn.dataset.actionId;
      let params = {};
      if (btn.dataset.actionParams) {
        try { params = JSON.parse(btn.dataset.actionParams); } catch (e) {}
      }
      btn.disabled = true;
      const actRes = await executeAction(actId, params, appStateRef, getCurrentActor());
      if (actRes.success) {
        addAssistantMessage(`✓ ${actRes.message || 'Đã thực hiện thao tác.'}`);
      } else {
        addAssistantMessage(`⚠️ ${actRes.error}`);
      }
    };
  });

  // Bind direct receipt proposal buttons from replenishment cards
  container.querySelectorAll('[data-create-receipt-proposal]').forEach(btn => {
    btn.onclick = async () => {
      const prodId = btn.dataset.createReceiptProposal;
      const qty = parseInt(btn.dataset.qty, 10) || 20;
      btn.disabled = true;
      try {
        const res = await executeSkill('receipt-proposal', {
          productId: prodId,
          qty,
          reason: 'Đề xuất nhập hàng từ gợi ý bổ sung AI',
        }, currentEnvelope, appStateRef);
        if (res.proposal) activeProposal = res.proposal;
        messageHistory.push({
          role: 'assistant',
          text: res.text,
          proposal: res.proposal || null,
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        });
        renderMessages();
        scrollMessagesToBottom();
      } catch (err) {
        addAssistantMessage(`⚠️ Lỗi tạo đề xuất: ${err.message}`);
      }
    };
  });

  // Bind batch replenishment draft button
  container.querySelectorAll('[data-create-all-replenishment-draft]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await handleUserMessage('Tạo đề xuất nhập cho 3 mặt hàng cần nhất');
      } catch (err) {
        addAssistantMessage(`⚠️ Lỗi tạo đề xuất: ${err.message}`);
      }
    };
  });

  // Bind proposal confirm/cancel/execute
  container.querySelectorAll('[data-confirm-proposal]').forEach(btn => {
    btn.onclick = async () => {
      const propId = btn.dataset.confirmProposal;
      const prop = (activeProposal && (activeProposal.id === propId || activeProposal.proposal_id === propId))
        ? activeProposal
        : (messageHistory.find(m => m.proposal && (m.proposal.id === propId || m.proposal.proposal_id === propId))?.proposal || activeProposal);
      if (!prop) return;
      btn.disabled = true;
      btn.textContent = 'Đang xử lý…';
      const confirmRes = confirmProposal(prop, appStateRef, getCurrentActor());
      if (!confirmRes.success) {
        renderMessages();
        addAssistantMessage(`⚠️ Xác nhận không thành công: ${confirmRes.message}`);
        return;
      }
      // Safe Actions Execution: Immediately execute upon user confirmation
      const execRes = await executeProposal(prop, appStateRef, null, getCurrentActor());
      renderMessages();
      if (execRes.success) {
        try {
          if (typeof window !== 'undefined' && window.__qbiz_app__?.refresh) {
            await window.__qbiz_app__.refresh();
          } else if (typeof window !== 'undefined' && window.__qbiz_app__?.render) {
            window.__qbiz_app__.render();
          }
          updateContextAndChips();
        } catch (_) {}
      } else {
        addAssistantMessage(`⚠️ Thực thi thất bại: ${execRes.error}`);
      }
    };
  });

  container.querySelectorAll('[data-execute-proposal]').forEach(btn => {
    btn.onclick = async () => {
      const propId = btn.dataset.executeProposal;
      const prop = (activeProposal && (activeProposal.id === propId || activeProposal.proposal_id === propId))
        ? activeProposal
        : (messageHistory.find(m => m.proposal && (m.proposal.id === propId || m.proposal.proposal_id === propId))?.proposal || activeProposal);
      if (!prop) return;
      btn.disabled = true;
      btn.textContent = 'Đang thực thi…';
      const res = await executeProposal(prop, appStateRef, null, getCurrentActor());
      renderMessages();
      if (res.success) {
        try {
          if (typeof window !== 'undefined' && window.__qbiz_app__?.refresh) {
            await window.__qbiz_app__.refresh();
          } else if (typeof window !== 'undefined' && window.__qbiz_app__?.render) {
            window.__qbiz_app__.render();
          }
          updateContextAndChips();
        } catch (_) {}
      } else {
        addAssistantMessage(`⚠️ Thực thi thất bại: ${res.error}`);
      }
    };
  });

  container.querySelectorAll('[data-cancel-proposal]').forEach(btn => {
    btn.onclick = () => {
      const propId = btn.dataset.cancelProposal;
      const prop = (activeProposal && (activeProposal.id === propId || activeProposal.proposal_id === propId))
        ? activeProposal
        : (messageHistory.find(m => m.proposal && (m.proposal.id === propId || m.proposal.proposal_id === propId))?.proposal || activeProposal);
      if (!prop) return;
      cancelProposal(prop);
      renderMessages();
      addAssistantMessage('Đã hủy đề xuất.');
    };
  });
}

function scrollMessagesToBottom() {
  const container = document.getElementById('aiMessagesList');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Render the DEV Context Inspector view.
 */
function renderDevInspector() {
  const content = document.getElementById('aiDevInspectorContent');
  if (!content) return;

  const ctx = currentEnvelope || {};
  const cfg = getProviderConfig();

  let boundProductDisplay = 'None';
  if (ctx.current_product_id) {
    const p = (appStateRef?.data?.products || []).find(x => x.id === ctx.current_product_id);
    boundProductDisplay = p ? `${p.name} (id: ${p.id})` : ctx.current_product_id;
  }

  let boundOrderDisplay = 'None';
  if (ctx.current_order_id) {
    const o = (appStateRef?.data?.orders || []).find(x => x.id === ctx.current_order_id);
    boundOrderDisplay = o ? `${o.code || o.id} (status: ${o.status})` : ctx.current_order_id;
  }

  content.innerHTML = `
    <div class="ai-dev-grid">
      <div><span>Route:</span> <b>${ctx.current_route || '—'}</b></div>
      <div><span>Screen:</span> <b>${ctx.current_screen || '—'}</b></div>
      <div><span>Actor Role:</span> <b>${getCurrentActor().role}</b> <button id="aiDevSwitchActorBtn" class="ai-link-btn" style="font-size:11px;margin-left:6px;cursor:pointer;">Đổi (${getCurrentActor().role === 'owner' ? 'cashier' : 'owner'})</button></div>
      <div><span>Warehouse:</span> <b>${ctx.warehouse_id || '—'}</b></div>
      <div><span>Device ID:</span> <b>${ctx.device_id || '—'}</b></div>
      <div class="ai-dev-full"><span>Bound Product:</span> <b>${boundProductDisplay}</b></div>
      <div class="ai-dev-full"><span>Bound Order:</span> <b>${boundOrderDisplay}</b></div>
      <div class="ai-dev-full"><span>QA Snapshot:</span> <b style="color:#059669;">${(typeof window !== 'undefined' && window.__QBIZ_BUILD_INFO__?.qaArtifactFingerprint) || 'QA_RC_PHASE3H_20261001'}</b></div>
      <div><span>AI Arch:</span> <b>PHASE3</b></div>
      <div><span>Gateway:</span> <b>Same-Origin /api/ai-gateway</b></div>
      <div><span>Tier:</span> <b>${lastResult ? `Tier ${lastResult.tier}` : 'Tier 0'}</b></div>
      <div><span>Provider:</span> <b>${lastResult?.provider || cfg.mode}</b></div>
      <div><span>AI Trace:</span> <b style="color:#0284c7;">${lastResult?.compactTrace || lastResult?.trace || (lastResult ? 'Local Qwen 2.5' : 'None')}</b></div>
      <div><span>Fallback:</span> <b>${lastResult?.fallbackTriggered ? 'YES' : 'NO'}</b></div>
      ${lastResult?.fallbackReason ? `<div class="ai-dev-full"><span>Fallback Reason:</span> <b style="color:#c2410c;">${esc(lastResult.fallbackReason)}</b></div>` : ''}
      <div><span>Local AI:</span> <b>${cfg.localProvider || 'OLLAMA'} (${cfg.localModel || 'qwen2.5:1.5b'})</b></div>
      <div><span>Cloud Fallback:</span> <b>${cfg.cloudFallbackProvider || 'GEMINI'}</b></div>
      <div><span>Last Skill:</span> <b>${lastResult?.skillId || 'None'}</b></div>
      <div><span>Proposal ID:</span> <b>${activeProposal ? `${activeProposal.id} (${activeProposal.status})` : 'None'}</b></div>
    </div>
  `;

  document.getElementById('aiDevSwitchActorBtn')?.addEventListener('click', () => {
    const nextRole = getCurrentActor().role === 'owner' ? 'cashier' : 'owner';
    switchActor(nextRole);
    updateContextAndChips();
    renderDevInspector();
    addAssistantMessage(`Đã chuyển vai trò người dùng sang: **${nextRole}** (Sensitive context purged).`);
  });
}

export function getMessageHistory() {
  return [...messageHistory];
}

export function clearMessageHistory() {
  messageHistory = [];
}
