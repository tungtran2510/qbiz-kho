/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — FLOATING TRIGGER & CONTEXTUAL SHEET UI
 * Injects floating trigger, contextual sheet, route chips, proposal card, and DEV Context Inspector.
 * Strictly respects responsive constraints: 390px, 412px, 1440px.
 */

import { buildContextEnvelope, getCurrentActor, switchActor, setLastResolvedProduct, getPendingIntent, clearPendingIntent } from './context.js';
import { routeIntent } from './router.js';
import { confirmProposal, cancelProposal, executeProposal, PROPOSAL_STATUS } from './proposals.js';
import { getProviderConfig, setProviderConfig, PROVIDER_MODES } from './providers.js';
import { executeAction, getSuggestedActions } from './registry.js';
import { executeSkill } from './skills.js';
import { levelFor } from '../engine.js';
import { loadEntries, togglePinMemory, archiveMemory, deleteMemory, commitMemory, MEMORY_SCOPES } from './memory.js';

let appStateRef = null;
let currentEnvelope = null;
let activeProposal = null;
let lastResult = null;
let devInspectorOpen = false;
let messageHistory = [];

const ROUTE_CHIPS = {
  dashboard: [
    'Hôm nay bán bao nhiêu?',
    'Hàng sắp hết',
    'Hôm nay cần chú ý gì?',
  ],
  products: [
    'Còn bao nhiêu?',
    'Kho nào còn?',
    'Hàng sắp hết',
    'Nhập thêm 20 cái này vào kho chính',
  ],
  sales: [
    'Tìm hàng',
    'Kiểm tồn',
    'Chọn khách',
  ],
  orders: [
    'Đơn này vì sao chưa xong?',
    'Thanh toán?',
    'Thiếu hàng?',
  ],
  transfers: [
    'Hàng sắp hết',
    'Nhập kho',
    'Chuyển kho',
    'Kiểm kho',
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
  // Basic markdown bold, bullet, and code formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\s*•\s*(.*?)(?=\n|$)/g, '<li class="ai-bullet">$1</li>')
    .replace(/\n\s*-\s*(.*?)(?=\n|$)/g, '<li class="ai-bullet">$1</li>')
    .replace(/(<li class="ai-bullet">.*?<\/li>)+/g, '<ul class="ai-list">$&</ul>')
    .replace(/\n/g, '<br/>');
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
              <small id="aiProviderBadge" class="ai-provider-badge">Tier 0: Offline</small>
            </div>
          </div>
          <div class="ai-head-actions">
            <button id="aiDevToggleBtn" class="ai-btn-sm ai-dev-btn" title="Xem thông số kỹ thuật (DEV Context Inspector)">DEV</button>
            <button id="aiMemoryToggleBtn" class="ai-btn-sm" title="Quản lý Trí nhớ QBiz">🧠</button>
            <button id="aiSettingsToggleBtn" class="ai-btn-sm" title="Cấu hình Provider (Gemini / OpenAI)">⚙</button>
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
                <option value="DETERMINISTIC">DETERMINISTIC (Tier 0 - Nội bộ / Offline)</option>
                <option value="GEMINI">GEMINI (Google Gemini 1.5 Flash - Session Key)</option>
                <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE (Session Key)</option>
                <option value="MOCK_DEV">MOCK_DEV (Giả lập Dev)</option>
              </select>
            </label>
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

        <!-- Input Box -->
        <form id="aiInputForm" class="ai-input-form" onsubmit="return false;">
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
}

/**
 * Global voice recognition state
 */
let micState = 'idle'; // 'idle' | 'listening' | 'processing'
let recognitionInstance = null;

/**
 * Initialize Web Speech API Voice Input
 */
function initVoiceInput() {
  const micBtn = document.getElementById('aiMicBtn');
  const input = document.getElementById('aiTextInput');
  if (!micBtn || !input) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.classList.add('ai-mic-unsupported');
    micBtn.title = 'Thiết bị này chưa hỗ trợ nhận dạng giọng nói';
    micBtn.addEventListener('click', () => {
      addAssistantMessage('⚠️ Thiết bị này chưa hỗ trợ nhận dạng giọng nói.');
      renderMessages();
    });
    return;
  }

  const setMicState = (state) => {
    micState = state;
    micBtn.classList.remove('is-listening', 'is-processing');
    if (state === 'listening') {
      micBtn.classList.add('is-listening');
      micBtn.title = 'Đang nghe tiếng Việt... Nhấn để dừng';
      input.placeholder = 'Đang nghe tiếng Việt... hãy nói nội dung';
    } else if (state === 'processing') {
      micBtn.classList.add('is-processing');
      micBtn.title = 'Đang xử lý giọng nói...';
      input.placeholder = 'Đang xử lý câu nói...';
    } else {
      micBtn.title = 'Nhập bằng giọng nói (vi-VN)';
      input.placeholder = 'Hỏi hoặc ra lệnh cho trợ lý...';
    }
  };

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
        setMicState('listening');
      };

      recognitionInstance.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const text = (finalTranscript || interimTranscript).trim();
        if (text) {
          input.value = text;
        }
      };

      recognitionInstance.onspeechend = () => {
        setMicState('processing');
      };

      recognitionInstance.onend = async () => {
        const text = input.value.trim();
        setMicState('idle');
        if (text) {
          input.value = '';
          // Dispatches into the standard AI intent router (permissions & proposals respected!)
          await handleUserMessage(text);
        }
      };

      recognitionInstance.onerror = (event) => {
        setMicState('idle');
        if (event.error === 'not-allowed') {
          addAssistantMessage('⚠️ Bạn cần cấp quyền truy cập Micro trên trình duyệt để sử dụng tính năng này.');
          renderMessages();
        } else if (event.error !== 'no-speech') {
          console.warn('Speech recognition error:', event.error);
        }
      };

      recognitionInstance.start();
    } catch (err) {
      setMicState('idle');
      console.warn('Speech recognition exception:', err);
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

  const submitMessage = async () => {
    const text = input?.value?.trim();
    if (!text) return;
    input.value = '';
    await handleUserMessage(text);
  };

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    await submitMessage();
  });

  document.getElementById('aiSendBtn')?.addEventListener('click', async e => {
    e.preventDefault();
    await submitMessage();
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
  // NOTE: Requirement 1 - Do NOT call .focus() here! Virtual keyboard will only open when user taps the input directly.
}

function closeSheet() {
  const sheet = document.getElementById('qbizAiSheet');
  if (sheet) sheet.style.display = 'none';
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
  if (gemGroup) gemGroup.style.display = mode === PROVIDER_MODES.GEMINI ? 'block' : 'none';
  if (openGroup) openGroup.style.display = mode === PROVIDER_MODES.OPENAI_COMPATIBLE ? 'block' : 'none';
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

  // Update Provider Badge
  const providerBadge = document.getElementById('aiProviderBadge');
  if (providerBadge) {
    const cfg = getProviderConfig();
    if (cfg.mode === PROVIDER_MODES.DETERMINISTIC) {
      providerBadge.textContent = 'Tier 0: Offline';
    } else {
      const model = cfg.mode === PROVIDER_MODES.GEMINI ? 'gemini-1.5-flash' : (cfg.mode === PROVIDER_MODES.OPENAI_COMPATIBLE ? 'gpt-4o-mini' : 'mock-dev');
      const hasKey = cfg.mode === PROVIDER_MODES.MOCK_DEV || (cfg.mode === PROVIDER_MODES.GEMINI && Boolean(cfg.geminiKey)) || (cfg.mode === PROVIDER_MODES.OPENAI_COMPATIBLE && Boolean(cfg.openaiKey));
      providerBadge.textContent = `${cfg.mode}: ${model} (${hasKey ? 'Connected' : 'Key Needed'})`;
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
  
  let chips = getSuggestedActions(route);
  if (!chips || chips.length === 0) {
    chips = ROUTE_CHIPS[route] || ROUTE_CHIPS.dashboard;
  }

  // If a product is actively bound on products screen or open modal, ensure product chips are prioritized
  if (currentEnvelope.current_product_id && (route === 'products' || appStateRef?.currentProductId)) {
    chips = ROUTE_CHIPS.products;
  } else if (currentEnvelope.current_order_id && (route === 'orders' || appStateRef?.currentOrderId)) {
    chips = ROUTE_CHIPS.orders;
  }

  bar.innerHTML = chips
    .map(c => {
      const text = typeof c === 'string' ? c : (c.phrase || c.name || '');
      return `<button class="ai-chip" type="button" data-chip-query="${esc(text)}">${esc(text)}</button>`;
    })
    .join('');

  bar.querySelectorAll('[data-chip-query]').forEach(btn => {
    btn.onclick = () => {
      const query = btn.dataset.chipQuery;
      handleUserMessage(query);
    };
  });
}

/**
 * Handle incoming user query.
 */
async function handleUserMessage(query) {
  // Add user bubble
  messageHistory.push({ role: 'user', text: query, time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) });
  renderMessages();

  // Scroll to bottom
  scrollMessagesToBottom();

  // Refresh context right before execution
  currentEnvelope = buildContextEnvelope(appStateRef);

  try {
    const res = await routeIntent(query, currentEnvelope, appStateRef);
    lastResult = res;

    // Handle proposal if generated
    if (res.proposal) {
      activeProposal = res.proposal;
    }

    messageHistory.push({
      role: 'assistant',
      text: res.text,
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
      permissionDenied: res.permissionDenied || null,
      tier: res.tier,
      provider: res.provider,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (err) {
    messageHistory.push({
      role: 'assistant',
      text: `⚠️ **Lỗi xử lý yêu cầu:** ${err.message}`,
      isError: true,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    });
  }

  renderMessages();
  scrollMessagesToBottom();
  if (devInspectorOpen) renderDevInspector();
}

function addAssistantMessage(text) {
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

  container.innerHTML = messageHistory.map((m, idx) => {
    if (m.role === 'user') {
      return `
        <div class="ai-msg user">
          <div class="ai-bubble user-bubble">${esc(m.text)}</div>
          <small class="ai-msg-time">${m.time}</small>
        </div>
      `;
    }

    // Assistant message
    const formattedBody = fmtMarkdown(m.text);

    // Candidates markup for ambiguous matching
    let candidatesHtml = '';
    if (m.candidates && m.candidates.length > 1) {
      candidatesHtml = `
        <div class="ai-candidates-box">
          <div class="ai-candidates-label">Vui lòng chọn sản phẩm cần thao tác:</div>
          <div class="ai-candidates-list">
            ${m.candidates.map(c => `
              <button class="ai-candidate-row" data-pick-candidate="${esc(c.id)}" data-candidate-name="${esc(c.name)}">
                <div class="ai-cand-info">
                  <strong>${esc(c.name)}</strong>
                  <small>SKU: ${esc(c.sku || '—')} · Giá: ${new Intl.NumberFormat('vi-VN').format(c.price)} ₫</small>
                </div>
                <div class="ai-cand-stock">
                  <span>Còn: <b>${c.available}</b> ${esc(c.unit)}</span>
                </div>
              </button>
            `).join('')}
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
            <button class="primary-btn ai-action-btn" data-action-id="${esc(act.actionId)}" ${act.params ? `data-action-params='${esc(JSON.stringify(act.params))}'` : ''}>
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
          <div class="ai-card-head">
            <span class="ai-badge-info">GỢI Ý NHẬP HÀNG (${m.suggestions.length})</span>
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
                    Đề xuất nhập +${s.suggestedQuantity}
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
        proposalHtml = `
          <div class="ai-proposal-card ${isConfirmed ? 'is-confirmed' : ''} ${isCancelled ? 'is-cancelled' : ''}">
            <div class="ai-proposal-head">
              <span class="ai-prop-tag ${p.risk_level === 'HIGH_RISK_WRITE' ? 'danger' : 'warn'}">${esc(p.risk_level)}</span>
              <strong class="ai-prop-title">${esc(p.intent)}</strong>
            </div>
            <div class="ai-prop-body">
              <p class="ai-prop-summary">${esc(p.human_summary)}</p>
              <div class="ai-prop-params">
                ${Object.entries(p.parameters || {}).map(([k, v]) => `
                  <div class="ai-param-row">
                    <span>${esc(k)}</span>
                    <b>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</b>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="ai-prop-actions" id="propActions_${p.id}">
              ${p.status === PROPOSAL_STATUS.SUCCEEDED ? `
                <div class="ai-prop-status-ok">✓ ${p.intent === 'propose_memory_save' ? 'Đã lưu vào Trí nhớ Shop thành công' : (p.intent === 'create_cart_draft' ? 'Đã cập nhật giỏ hàng POS thành công' : 'Đã thực thi thành công vào sổ kho (Succeeded & Reconciled)')}</div>
                ${p.intent !== 'propose_memory_save' && p.intent !== 'create_cart_draft' ? `
                <div style="margin-top:8px;">
                  <button class="secondary-btn ai-btn-nav" data-action-id="open_warehouse">Xem tồn kho</button>
                </div>` : ''}
              ` : p.status === PROPOSAL_STATUS.CONFIRMED ? `
                <button class="primary-btn ai-btn-confirm" data-execute-proposal="${p.id}">Thực thi thao tác</button>
                <button class="secondary-btn ai-btn-cancel" data-cancel-proposal="${p.id}">${p.intent === 'propose_memory_save' ? 'Không' : 'Hủy'}</button>
              ` : p.status === PROPOSAL_STATUS.FAILED ? `
                <div class="ai-prop-status-cancel">⚠️ Thao tác không thể hoàn tất: ${esc(p.failure_reason || 'Lỗi thực thi')}</div>
              ` : p.status === PROPOSAL_STATUS.EXPIRED ? `
                <div class="ai-prop-status-cancel">Đề xuất đã hết hạn (Expired).</div>
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

    return `
      <div class="ai-msg assistant">
        <div class="ai-bubble assistant-bubble">
          <div class="ai-bubble-content">${formattedBody}</div>
          ${candidatesHtml}
          ${warehouseCandidatesHtml}
          ${actionsHtml}
          ${attentionHtml}
          ${replenishmentHtml}
          ${healthHtml}
          ${diagnosisHtml}
          ${proposalHtml}
        </div>
        <small class="ai-msg-time">${m.time} ${m.tier !== undefined ? `· Tier ${m.tier}` : ''}</small>
      </div>
    `;
  }).join('');

  // Bind candidate picks with multi-turn intent resumption
  container.querySelectorAll('[data-pick-candidate]').forEach(btn => {
    btn.onclick = async () => {
      const candId = btn.dataset.pickCandidate;
      const candName = btn.dataset.candidateName;
      const cand = (appStateRef?.data?.products || []).find(p => p.id === candId);
      if (cand) setLastResolvedProduct(cand);

      const pending = getPendingIntent();
      if (pending && pending.skillId) {
        clearPendingIntent();
        addAssistantMessage(`Đã chọn sản phẩm: **${candName}**. Tiến hành tạo đề xuất...`);
        try {
          const res = await executeSkill(pending.skillId, {
            ...pending.params,
            productId: candId,
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
        handleUserMessage(`Kiểm tồn ${candName}`);
      }
    };
  });

  // Bind warehouse candidate picks
  container.querySelectorAll('[data-pick-warehouse]').forEach(btn => {
    btn.onclick = async () => {
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

  // Bind proposal confirm/cancel/execute
  container.querySelectorAll('[data-confirm-proposal]').forEach(btn => {
    btn.onclick = async () => {
      const propId = btn.dataset.confirmProposal;
      const prop = (activeProposal && activeProposal.id === propId) ? activeProposal : (messageHistory.find(m => m.proposal?.id === propId)?.proposal || activeProposal);
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
        addAssistantMessage(`✓ ${execRes.message || 'Thao tác đã được thực thi và đối soát thành công.'}`);
      } else {
        addAssistantMessage(`⚠️ Thực thi thất bại: ${execRes.error}`);
      }
    };
  });

  container.querySelectorAll('[data-execute-proposal]').forEach(btn => {
    btn.onclick = async () => {
      const propId = btn.dataset.executeProposal;
      const prop = (activeProposal && activeProposal.id === propId) ? activeProposal : (messageHistory.find(m => m.proposal?.id === propId)?.proposal || activeProposal);
      if (!prop) return;
      btn.disabled = true;
      btn.textContent = 'Đang thực thi…';
      const res = await executeProposal(prop, appStateRef, null, getCurrentActor());
      renderMessages();
      if (res.success) {
        addAssistantMessage(res.message);
      } else {
        addAssistantMessage(`⚠️ Thực thi thất bại: ${res.error}`);
      }
    };
  });

  container.querySelectorAll('[data-cancel-proposal]').forEach(btn => {
    btn.onclick = () => {
      const propId = btn.dataset.cancelProposal;
      const prop = (activeProposal && activeProposal.id === propId) ? activeProposal : (messageHistory.find(m => m.proposal?.id === propId)?.proposal || activeProposal);
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
      <div><span>Tier:</span> <b>${lastResult ? `Tier ${lastResult.tier}` : 'Tier 0'}</b></div>
      <div><span>Provider:</span> <b>${lastResult?.provider || cfg.mode}</b></div>
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
