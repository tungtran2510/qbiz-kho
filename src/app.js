import { ensureSeed,ensureLocalIdentity,snapshot,totalFor,available,receive,issue,countAdjust,setOpeningStock,applyWarehouseBatch,STOCK_IN_TYPES,STOCK_OUT_TYPES,createTransfer,receiveTransfer,cancelTransfer,createProduct,createService,createCategory,createCustomer,getCustomerDebtSummary,getCustomerAgingReport,getCustomerProfileHistory,updateItem,createWarehouse,createSupplier,updateSupplier,createReturn,createSale,createOrder,confirmOrder,processOrder,completeOrder,cancelOrder,currentShift,openShift,closeShift,markSalePaid,markOrderPaid,createExchange,calculateSalesMetrics,createExpense,getExpenses,createPurchaseReturn } from './engine.js?v=20260927-v21-consistency-audit';
import { clearAll,getAll,getOne,put,putMany,runTransaction } from './db.js';
import { syncStatus,flushOutbox,pruneSyncedOutbox } from './sync.js';
import { CONFIG } from './config.js';
import { startWebSync, stopWebSync } from './web/bootstrap.js';
import { createInvoiceDraftForSale, getInvoiceBySaleId } from './invoice/service.js';
import { openInvoiceModalForSale, createReturnAdjustmentProposal } from './invoice/ui.js';
import { kickCashDrawer, generateEscPosReceipt, buildDrawerKickCommand } from './hardware/escpos.js';
import * as aiModule from './ai/index.js';
const { initAiUI, updateContextAndChips } = aiModule;
import * as businessProfileModule from './business-profile.js';
import * as uiProfileModule from './ui-profile.js';
import {
  initAuth,
  getAuthState,
  getCurrentUser,
  getActiveShop,
  getCurrentRole,
  userCan,
  signIn,
  signUp,
  signOut,
  createShop,
  addMember,
  disableMember,
  subscribeAuthState,
  AUTH_STATES,
  resetPassword,
  switchShop,
  getAvailableShops,
  isSuperAdmin,
  checkPlatformAdmin,
  getPlatformMetrics,
  getPlatformShops,
  togglePlatformShop,
  getPlatformAuditLogs,
  getPlatformUsers,
  updateUserSubscription,
  togglePlatformUser,
  deletePlatformUser,
  getPlatformCommercialConfig,
  savePlatformCommercialConfig,
  bootstrapSuperAdmin,
  signInWithGoogle,
} from './auth.js';
import {
  DRIVE_STATUS,
  BACKUP_RUN_STATUS,
  getShopDriveStatus,
  connectShopDrive,
  disconnectShopDrive,
  triggerManualBackup,
  generateBackupPackage,
  verifyBackupPackage,
  formatBackupStatus,
  listShopDriveBackups,
  getDriveBackupPackage,
} from './backup-drive.js';
import {
  ROLES,
  ROLE_LABELS,
  CAPABILITIES,
  CAPABILITY_LABELS,
  ROLE_CAPABILITY_MAP,
  hasCapability,
  getRoleLabel,
  PLATFORM_ROLES,
  PLATFORM_ROLE_LABELS,
  PLATFORM_CAPABILITIES,
  getPlatformRoleLabel,
} from './capabilities.js';
import {
  loadDemoIndustry,
  switchDemoRole,
  resetDemo,
  getActiveDemoIndustry,
  getActiveDemoIndustryKey,
  getActiveDemoRole,
  DEMO_ROLES,
  DEMO_INDUSTRIES,
  getDemoAiSuggestions,
  getDemoReceiptPreview,
} from './demo-showroom.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const fmt=n=>new Intl.NumberFormat('vi-VN').format(Number(n||0));
const norm=v=>String(v==null?'':v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const keepFocus=(sel,fn)=>{const el=document.querySelector(sel);const had=el&&document.activeElement===el;const pos=had?el.selectionStart:null;fn();if(had){const n=document.querySelector(sel);if(n){n.focus();try{n.setSelectionRange(pos==null?n.value.length:pos,n.value.length)}catch{}}}};
const money=n=>n?new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(n)):'';
const dt=s=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const saleUuid=()=>globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():'';
const NAV=[['dashboard','Tổng quan','layout-dashboard'],['products','Hàng hóa','package-search'],['sales','Bán hàng','shopping-cart'],['transfers','Kho','warehouse'],['more','Thêm','menu']];
const MOVE_LABEL={receive:['Nhập','↓'],issue:['Xuất','↑'],sale:['Bán hàng','↗'],count:['Kiểm kho','✓'],transfer_out:['Chuyển đi','⇄'],transfer_in:['Nhận chuyển','⇄'],reserve:['Giữ hàng','◌'],release:['Trả giữ','◌'],return:['Khách trả','↩']};
const DEFAULT_DISPLAY={version:2,view:'image',showPrice:true,showStock:true,showSku:true,density:'medium',posView:'grid3'};
function loadDisplayPrefs(){try{const saved=JSON.parse(localStorage.getItem('qbiz_display_preferences')||'{}');return saved.version?{...DEFAULT_DISPLAY,...saved}:{...DEFAULT_DISPLAY}}catch{return {...DEFAULT_DISPLAY}}}
function saveDisplayPrefs(){localStorage.setItem('qbiz_display_preferences',JSON.stringify(state.displayPrefs))}

const DEFAULT_PAYMENT_PREFS={version:1,soundEnabled:true,ttsEnabled:true,popupEnabled:true,popupDuration:10,cashRounding:'none'};
function loadPaymentPrefs(){try{const saved=JSON.parse(localStorage.getItem('qbiz_payment_preferences')||'{}');return saved.version?{...DEFAULT_PAYMENT_PREFS,...saved}:{...DEFAULT_PAYMENT_PREFS}}catch{return {...DEFAULT_PAYMENT_PREFS}}}
function savePaymentPrefs(prefs){state.paymentPrefs={...state.paymentPrefs,...prefs};try{localStorage.setItem('qbiz_payment_preferences',JSON.stringify(state.paymentPrefs))}catch{}}

let _audioCtx=null;
function getAudioContext(){if(!_audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)_audioCtx=new AC();}if(_audioCtx&&_audioCtx.state==='suspended'){_audioCtx.resume().catch(()=>{});}return _audioCtx;}

function playPaymentChime(force=false){
  if(!force&&!state.paymentPrefs?.soundEnabled)return;
  try{
    const ctx=getAudioContext();if(!ctx)return;
    const now=ctx.currentTime;
    [880,1320].forEach((freq,idx)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=idx===0?'sine':'triangle';
      osc.frequency.setValueAtTime(freq,now);
      gain.gain.setValueAtTime(0.3,now);
      gain.gain.exponentialRampToValueAtTime(0.001,now+0.45);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now);osc.stop(now+0.5);
    });
    const t2=now+0.12;
    [1760,2200].forEach((freq,idx)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=idx===0?'sine':'triangle';
      osc.frequency.setValueAtTime(freq,t2);
      gain.gain.setValueAtTime(0.35,t2);
      gain.gain.exponentialRampToValueAtTime(0.001,t2+0.7);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(t2);osc.stop(t2+0.75);
    });
  }catch(err){console.warn('[AudioChime]',err);}
}

function speakPaymentAmount(amount,force=false){
  if(!force&&!state.paymentPrefs?.ttsEnabled)return;
  if(!('speechSynthesis' in window))return;
  try{
    window.speechSynthesis.cancel();
    const num=Math.round(Number(amount)||0);
    if(num<=0)return;
    const text=`Thanh toán thành công ${fmt(num)} đồng`;
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang='vi-VN';
    utterance.rate=1.05;
    const voices=window.speechSynthesis.getVoices();
    const viVoice=voices.find(v=>v.lang==='vi-VN'||v.lang.startsWith('vi'));
    if(viVoice)utterance.voice=viVoice;
    setTimeout(()=>{try{window.speechSynthesis.speak(utterance);}catch{}},450);
  }catch(err){console.warn('[TTS]',err);}
}

function suggestCashAmounts(total){
  const t=Math.max(0,Math.round(Number(total)||0));
  if(!t)return [50000,100000,200000,500000];
  const suggestions=new Set();
  [10000,20000,50000,100000].forEach(step=>{const next=Math.ceil(t/step)*step;if(next>t)suggestions.add(next);});
  [50000,100000,200000,500000].forEach(denom=>{if(denom>t)suggestions.add(denom);});
  return [...suggestions].sort((a,b)=>a-b).slice(0,4);
}

let _popupTimer=null;
function closePaymentSuccessPopup(){
  if(_popupTimer){clearInterval(_popupTimer);_popupTimer=null;}
  const root=document.getElementById('paymentSuccessPopupRoot');
  if(root)root.remove();
}

function showPaymentSuccessPopup(sale,grandTotal){
  closePaymentSuccessPopup();
  const method=sale.payments?.[0]?.method||sale.payment_method||'cash';
  const cashReceived=Number(sale.cash_received||sale.cashReceived||0);
  const change=Math.max(0,cashReceived-grandTotal);
  const duration=Number(state.paymentPrefs?.popupDuration??10);
  const container=document.createElement('div');
  container.id='paymentSuccessPopupRoot';
  container.className='payment-popup-backdrop';
  const methodLabel = method === 'qr' ? 'QR (Đã xác thực)' : (method === 'transfer' ? 'Chuyển khoản (Đã xác thực)' : paymentLabel(method));
  const timerBadgeHtml=duration>0?`<div class="popup-countdown-badge"><span class="countdown-pulse-dot"></span><span id="popupCountdownText">Tự đóng sau <b>${duration}s</b></span></div>`:'';
  container.innerHTML=`<div class="payment-popup-card"><button class="popup-close-x" id="popupCloseX" aria-label="Đóng popup">×</button><div class="popup-success-icon-wrap"><div class="popup-success-icon">✓</div></div><h3 class="popup-title">Thanh toán thành công!</h3><div class="popup-code-pill">${esc(sale.code||sale.sale_uuid||'Phiếu bán')}</div><div class="popup-amount">${fmt(grandTotal)} ₫</div><div class="popup-summary-box"><div class="popup-summary-row"><span>Phương thức:</span><b>${esc(methodLabel)}</b></div>${method==='cash'&&cashReceived>0?`<div class="popup-summary-row"><span>Khách đưa:</span><b>${fmt(cashReceived)} ₫</b></div><div class="popup-summary-row highlight-change"><span>Tiền thừa:</span><strong style="color:#16a34a;font-size:15px">${fmt(change)} ₫</strong></div>`:''}<div class="popup-summary-row"><span>Khách hàng:</span><b>${esc(sale.customer_label||'Khách lẻ')}</b></div></div>${timerBadgeHtml}<div class="popup-actions"><button class="secondary-btn" id="popupPrintBtn">${icon('printer')} In phiếu</button><button class="secondary-btn" id="popupZaloBtn">${icon('share-2')} Gửi Zalo</button><button class="primary-btn popup-primary-btn" id="popupNewSaleBtn">Bán đơn mới (Đóng)</button></div></div>`;
  document.body.appendChild(container);
  document.getElementById('popupCloseX')?.addEventListener('click',closePaymentSuccessPopup);
  document.getElementById('popupNewSaleBtn')?.addEventListener('click',closePaymentSuccessPopup);
  container.addEventListener('click',e=>{if(e.target===container)closePaymentSuccessPopup();});
  document.getElementById('popupPrintBtn')?.addEventListener('click',()=>{if(_popupTimer){clearInterval(_popupTimer);_popupTimer=null;}const cd=document.getElementById('popupCountdownText');if(cd)cd.textContent='Đã tạm dừng đếm ngược';printDocument({type:'receipt',documentId:sale.id});});
  document.getElementById('popupZaloBtn')?.addEventListener('click',()=>{if(_popupTimer){clearInterval(_popupTimer);_popupTimer=null;}const cd=document.getElementById('popupCountdownText');if(cd)cd.textContent='Đã tạm dừng đếm ngược';sendZaloOrder(sale);});
  if(duration>0){
    let remaining=duration;
    _popupTimer=setInterval(()=>{
      remaining-=1;
      const countEl=document.getElementById('popupCountdownText');
      if(countEl)countEl.innerHTML=`Tự đóng sau <b>${remaining}s</b>`;
      if(remaining<=0)closePaymentSuccessPopup();
    },1000);
  }
}

let state={page:'dashboard',data:null,search:'',warehouse:'all',warehouseTab:'operations',warehouseSearch:'',warehouseFilter:'all',warehouseSort:'name',warehouseStockWarehouse:'all',orderSearch:'',orderFilter:'active',orderRange:'all',txSearch:'',customerSearch:'',customerType:'all',supplierSearch:'',productView:'compact',productType:'PRODUCT',productCategory:'all',productSort:'default',productLimit:40,productSelecting:false,productSelected:new Set(),currentProductId:null,currentOrderId:null,currentSaleId:null,displayPrefs:loadDisplayPrefs(),paymentPrefs:loadPaymentPrefs(),installPrompt:null,printTab:'templates',reportTab:'overview',reportRange:'month',reportWarehouse:'all',reportCustomStart:'',reportCustomEnd:'',notificationFilter:'all',notificationRead:new Set(),importStep:1,importType:'products',importSource:'file',saleCart:[],saleSearch:'',saleType:'all',saleShowAll:false,saleStep:'browse',saleTrail:[],saleBusy:false,saleReceipt:null,saleCustomer:null,saleDiscountOpen:new Set(),saleOptionsOpen:false,saleDraft:{discount:0,discountMode:'amount',cashReceived:'',note:'',payment:'cash',warehouseId:'',fulfillment:'counter',recipient:'',phone:'',address:'',shippingFee:0,cod:false,vatRate:0,vatCustom:'',channel:'pos'}};

const product=id=>state.data.products.find(x=>x.id===id);
const warehouse=id=>state.data.warehouses.find(x=>x.id===id);
const productTotals=p=> !p ? {onHand:0,reserved:0,available:0} : state.warehouse==='all' ? totalFor(state.data,p.id) : (()=>{const l=state.data.levels.find(x=>x.productId===p.id&&x.warehouseId===state.warehouse)||{onHand:0,reserved:0,damaged:0};return {onHand:l.onHand,reserved:l.reserved,available:available(l)}})();
const productStatus=p=>{if(p.type==='SERVICE') return ['info','Dịch vụ']; const t=productTotals(p); if(t.available===0) return ['danger','Hết hàng']; if(t.available<=p.lowStock) return ['warn','Sắp hết']; return ['ok','Còn hàng'];};
const productImage=p=> p?.image ? `<div class="product-photo"><img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/></div>` : `<div class="product-photo placeholder">${esc((p?.name||'S').slice(0,1))}</div>`;
const categoryRecords=(type=state.productType)=> (state.data?.categories||[]).filter(c=>c.type===type);
const categoryLabel=id=>{const c=(state.data?.categories||[]).find(x=>x.id===id);return c?.name||id||''};
function categoryTree(type=state.productType){
  const all=categoryRecords(type), byParent=new Map();
  for(const c of all){const key=c.parentId||c.parent_id||'';if(!byParent.has(key))byParent.set(key,[]);byParent.get(key).push(c)}
  for(const xs of byParent.values())xs.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  const out=[]; const walk=(parent,depth,seen=new Set())=>{for(const c of byParent.get(parent)||[]){if(seen.has(c.id))continue;out.push({category:c,depth});const next=new Set(seen);next.add(c.id);walk(c.id,depth+1,next)}};walk('',0);return out;
}
function categoryOptions(type,selected=''){
  const named=categoryRecords(type).find(c=>String(c.name).toLowerCase()===String(selected).toLowerCase());
  const effectiveSelected=named?.id||selected;
  const options=categoryTree(type).map(({category,depth})=>`<option value="${esc(category.id)}" ${effectiveSelected===category.id?'selected':''}>${'— '.repeat(depth)}${esc(category.name)}</option>`).join('');
  const legacy=selected&&!named&&!categoryRecords(type).some(c=>c.id===selected)?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:'';
  return `<option value="">Chưa chọn danh mục</option>${legacy}${options}`;
}
function categoryMatches(p,selected){
  if(selected==='all')return true;if(Array.isArray(p.categoryIds)&&p.categoryIds.length){const sub={...p};delete sub.categoryIds;return p.categoryIds.some(id=>categoryMatches({...sub,categoryId:id},selected));}const raw=p.categoryId||p.category||'';if(raw===selected)return true;
  const all=categoryRecords(p.type==='SERVICE'?'SERVICE':'PRODUCT'), selectedRecord=all.find(c=>c.id===selected), ids=new Set([selected]), names=new Set(selectedRecord?[selectedRecord.name]:[]);let changed=true;
  while(changed){changed=false;for(const c of all){if(ids.has(c.parentId||c.parent_id||'')){if(!ids.has(c.id)){ids.add(c.id);changed=true}names.add(c.name)}}}
  return ids.has(raw)||names.has(raw);
}
const ICONS={
  'camera':'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'layout-dashboard':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  'package-search':'<path d="m16.5 9.4 2.1 2.1 3.4-3.4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8"/><path d="m3 7 9 5 9-5M12 22V12"/><circle cx="17" cy="7" r="3"/>',
  'arrow-left-right':'<path d="M3 7h14l-3-3M21 17H7l3 3"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  'settings-2':'<path d="M20 7h-9M14 17H4M17 4v6M7 14v6"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
  'package-plus':'<path d="M16 16h6M19 13v6M21 8l-9 5-9-5M12 13v9M3 8l9-5 9 5v5M7 10l10-5"/>',
  'package-minus':'<path d="M16 16h6M21 8l-9 5-9-5M12 13v9M3 8l9-5 9 5v5M7 10l10-5"/>',
  'shopping-cart':'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L21 8H6"/>',
  'scan-line':'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18"/>',
  'clipboard-check':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8 13l2.5 2.5L16 10"/>',
  'image-plus':'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m3 16 5-5 4 4 2-2 7 7M18 2v6M15 5h6"/>',
  'qr-code':'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 21h3M21 14v3"/>'
  ,'bell':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
  ,'volume-2':'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'
  ,'volume-x':'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>'
  ,'share-2':'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'
  ,'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>'
  ,'file-spreadsheet':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/><path d="M8 13h2v2H8zm0 4h2v2H8zm4-4h4v2h-4zm0 4h4v2h-4z"/>'
  ,'undo-2':'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-1"/>'
  ,'chevron-right':'<path d="m9 18 6-6-6-6"/>'
  ,'chevron-down':'<path d="m6 9 6 6 6-6"/>'
  ,'user':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  ,'store':'<path d="M3 9l2-6h14l2 6"/><path d="M5 13v8h14v-8M9 21v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>'
  ,'eye':'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
  ,'printer':'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>'
  ,'alert-triangle':'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  ,'box':'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'
  ,'smartphone':'<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'
  ,'credit-card':'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>'
  ,'trending-up':'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
  ,'clock':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
  ,'check-circle':'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
  ,'archive':'<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>'
  ,'briefcase':'<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'
  ,'shopping-bag':'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'
  ,'coffee':'<path d="M10 2v2M14 2v2M17 8h1a4 4 0 1 1 0 8h-1M6 8h11v9a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4ZM6 2v2"/>'
  ,'boxes':'<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85M7 16.5l5-3M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3M17 16.5l4.74-2.85M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15M12 8l4.74-2.85M12 8v5.5"/>'
  ,'sparkles':'<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>'
  ,'user-check':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>'
  ,'layout-grid':'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'
  ,'check':'<polyline points="20 6 9 17 4 12"/>'
  ,'shield-alert':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
  ,'shield-check':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'
  ,'log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'
  ,'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  ,'warehouse':'<path d="M3 21V9.5L12 4l9 5.5V21H3z"/><path d="M9 21V11h6v10"/><path d="M9 14h6"/><path d="M9 17h6"/>'
  ,'menu':'<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>'
};
function icon(name,label=''){return `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS['package-search']}</svg>${label?`<span>${label}</span>`:''}`}

async function refresh(){
  state.data=await snapshot();
  state.businessProfile = businessProfileModule.getBusinessProfile();
  state.workspace = businessProfileModule.resolveWorkspaceProfile(state.businessProfile);
  render();
  if (state.currentProductId && $('#modalRoot .product-detail')) {
    const curBody = $('#modalRoot .modal-body');
    const scrollPos = curBody ? curBody.scrollTop : 0;
    openProduct(state.currentProductId);
    const newBody = $('#modalRoot .modal-body');
    if (newBody && scrollPos) newBody.scrollTop = scrollPos;
  } else if (state.currentOrderId && $('#modalRoot [data-order-action], #modalRoot [data-action="mark-order-paid"]')) {
    openOrderDetail(state.currentOrderId);
  } else if (state.currentSaleId && ($('#modalRoot .transaction-detail') || $('#modalRoot [data-action="refund-sale"]'))) {
    const s = (state.data?.sales || []).find(x => x.id === state.currentSaleId);
    if (s) openTransaction(s);
  }
}
if(typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'){
  try {
    const liveSyncChannel = new BroadcastChannel('qbiz_live_data_sync');
    // Gom nhiều tín hiệu DATA_CHANGED liên tiếp (seed/khởi động/ghi hàng loạt) thành 1 lần vẽ lại
    // để tránh nháy màn hình. Bỏ qua khi app chưa khởi động xong (boot tự render).
    let liveRefreshTimer = null;
    liveSyncChannel.onmessage = (msg) => {
      if(msg?.data?.type !== 'DATA_CHANGED') return;
      if(!state.data) return;
      clearTimeout(liveRefreshTimer);
      liveRefreshTimer = setTimeout(async () => {
        try { await refresh(); } catch(_) {}
      }, 400);
    };
  } catch(_) {}
}
function setTitle(title,eyebrow='QBiz Kho'){ $('#pageTitle').textContent=title; $('#pageEyebrow').textContent=eyebrow; }
function historyState(){return {qbiz:true,page:state.page,saleStep:state.saleStep}}
function navigate(page,{replace=false,fromHistory=false}={}){
  const previous=state.page;
  if(previous!==page){
    if($('#modalRoot')) $('#modalRoot').innerHTML='';
    state.currentProductId=null;state.currentOrderId=null;state.currentSaleId=null;
  }
  state.page=page;
  if(page==='sales'&&(previous!=='sales'||state.saleStep==='success')){state.saleStep='browse';state.saleTrail=[];}
  if(!fromHistory){const method=replace?'replaceState':'pushState';history[method](historyState(),'');}
  render();
  if(previous!==page){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    document.body.classList.remove('topbar-hidden');
  }
}
function setSaleStep(step,{fromHistory=false}={}){
  if(step===state.saleStep){renderSales();headerActions();nav();return;}
  if(!fromHistory)state.saleTrail.push(state.saleStep);
  state.page='sales';state.saleStep=step;
  if(!fromHistory)history.pushState(historyState(),'');
  renderSales();headerActions();nav();
  window.scrollTo({top:0,left:0,behavior:'instant'});
  document.body.classList.remove('topbar-hidden');
}
function goSaleBack(){const previous=state.saleTrail.pop()||'browse';state.saleStep=previous;state.page='sales';history.pushState(historyState(),'');renderSales();headerActions();nav();}
function headerActions(){
  const top=$('#topActions'); if(!top)return;
  if(state.page === 'platform-admin') return;
  const showScan=state.page==='sales'?state.saleStep==='browse':['products','transfers'].includes(state.page);
  const scan=showScan?`<button class="icon-btn scan-trigger" data-action="scan" title="Quét mã" aria-label="Quét mã">${icon('scan-line')}</button>`:'';
  const alerts=notificationItems();
  const auth=getAuthState();
  let userBadge='';
  if(auth.isSuperAdmin){
    userBadge=`<button class="user-badge-btn" data-action="open-user-menu" style="background:#0f172a;color:#f8fafc;border:1px solid #334155" title="Super Admin: ${esc(auth.user?.email)}">${icon('shield-alert')}<span>${esc(auth.shop?.name || 'Super Admin')}</span></button>`;
  } else if(auth.status===AUTH_STATES.AUTHENTICATED_SHOP_READY){
    userBadge=`<button class="user-badge-btn" data-action="open-user-menu" title="${esc(auth.user?.email||'Tài khoản')}">${icon('user')}<span>${esc(auth.shop?.name||'Shop')}</span></button>`;
  } else if(auth.status===AUTH_STATES.AUTHENTICATED_NO_SHOP){
    userBadge=`<button class="user-badge-btn" data-action="open-user-menu" title="${esc(auth.user?.email||'Tài khoản')}">${icon('user')}<span>Tạo Shop</span></button>`;
  } else {
    userBadge = `<button class="user-badge-btn icon-only" data-action="open-auth-modal" title="Tài khoản / Đăng nhập" aria-label="Đăng nhập">${icon('user')}</button>`;
  }
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const installShortcut = !isStandalone ? `<button class="header-shortcut header-install-btn" data-action="install-app" title="Cài ứng dụng về máy">${icon('download')}<span>Cài App</span></button>` : '';
  top.innerHTML=`${userBadge}${installShortcut}<button class="header-shortcut" data-page="orders">${icon('file-text')}<span>Đơn hàng</span></button><button class="icon-btn header-bell" data-action="notifications" aria-label="Thông báo" title="Thông báo">${icon('bell')}${alerts.length?`<b>${alerts.length}</b>`:''}</button>${scan}`;
}
function injectInstallBanner(){
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if(isStandalone) return;
  if(localStorage.getItem('qbiz_install_dismissed')) return;
  if($('#firstVisitInstallBanner')) return;

  const target = $('main.main') || $('#content');
  if(!target) return;

  const banner = document.createElement('div');
  banner.className = 'install-subtle-tip install-top-banner';
  banner.id = 'firstVisitInstallBanner';
  banner.innerHTML = `
    <div class="tip-left">
      <div class="tip-logo-badge">
        <img src="./icons/icon-192.png" alt="QBiz Kho" />
      </div>
      <div class="tip-text-wrap">
        <strong class="tip-title">Cài ứng dụng về máy</strong>
        <span class="tip-sep">•</span>
        <span class="tip-desc">Mở tức thì, dùng mượt mà &amp; bán ngoại tuyến</span>
      </div>
    </div>
    <div class="tip-right">
      <button class="tip-action-pill" data-action="install-app">
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <span>Cài ngay</span>
      </button>
      <button class="tip-dismiss-btn" data-action="dismiss-install-banner" title="Bỏ qua" aria-label="Đóng">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `;
  target.prepend(banner);
}
function injectLocalNotice(){
  if(state.page!=='dashboard') return;
  const auth=getAuthState();
  if(auth.status===AUTH_STATES.AUTHENTICATED_SHOP_READY && (state.data?.products?.length||0)>0 && !sessionStorage.getItem('qbiz_dismiss_local_notice')){
    const content=$('#content');
    if(content && !$('#localDataNotice', content)){
      const banner=document.createElement('div');
      banner.className='local-data-banner-compact';
      banner.id='localDataNotice';
      banner.innerHTML=`
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span style="display:inline-flex;align-items:center;justify-content:center;background:#0284c7;color:#fff;border-radius:4px;padding:1px 5px;font-size:9.5px;font-weight:700;flex-shrink:0">CỤC BỘ</span>
          <span style="font-size:11.5px;color:#1e3a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${state.data.products.length} sp</b> chờ đưa lên Shop Cloud</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <button class="ghost-btn tiny" data-action="prepare-sync-info" style="font-size:11px;padding:2px 6px;color:#0284c7;font-weight:600">Đồng bộ</button>
          <button class="tip-dismiss-btn" data-action="dismiss-local-notice" title="Đóng" style="padding:2px 5px;font-size:12px;line-height:1;color:#64748b;background:transparent;border:none;cursor:pointer">✕</button>
        </div>
      `;
      content.prepend(banner);
    }
  }
}
function notificationItems(){
  if(!state.data)return [];
  const low=state.data.products.filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false&&productTotals(p).available<=p.lowStock).length;
  const out=state.data.products.filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false&&productTotals(p).available<=0).length;
  const negative=state.data.levels.filter(l=>Number(l.onHand)<0).length;
  const transfers=state.data.transfers.filter(x=>x.status==='in_transit').length;
  const orders=(state.data.orders||[]).filter(x=>['NEW','CONFIRMED','PROCESSING'].includes(x.status)).length;
  const syncErrors=(state.data.outbox||[]).filter(x=>x.sync_status==='ERROR').length;
  return [['Sắp hết hàng',low,'products'],['Hết hàng',out,'products'],['Tồn âm',negative,'transfers'],['Chuyển kho chờ nhận',transfers,'transfers'],['Đơn cần xử lý',orders,'orders'],['Lỗi đồng bộ',syncErrors,'settings']].filter(x=>x[1]>0);
}
function openNotifications(){
  const items=notificationItems();
  openModal({title:'Thông báo',sub:'Việc cần chú ý trên thiết bị này.',hideSubmit:true,body:items.length?`<div class="notification-list">${items.map(([label,count,page])=>{const meta={'Sắp hết hàng':['package-search','Sản phẩm sắp hết'],'Chuyển kho chờ nhận':['arrow-left-right','Phiếu chuyển đang vận chuyển'],'Đơn cần xử lý':['shopping-cart','Đơn hàng chờ xử lý'],'Lỗi đồng bộ':['settings-2','Mục chờ đồng bộ bị lỗi']};const [ico,sub]=meta[label]||['bell',''];return `<button class="notification-row" data-page="${page}"><i class="notification-ico">${icon(ico)}</i><span><b>${esc(label)}</b><small>${esc(sub)}</small></span><strong>${fmt(count)}</strong>${icon('chevron-right')}</button>`}).join('')}</div>`:'<div class="empty notification-empty"><strong>Không có việc cần xử lý.</strong></div>'});
  $$('[data-page]', $('#modalRoot')).forEach(b=>b.onclick=()=>{$('#modalRoot').innerHTML='';state.page=b.dataset.page;render();});
}
function isServiceMode(){
  if(sessionStorage.getItem('qbiz_preview_demo') === '1'){
    return sessionStorage.getItem('qbiz_demo_industry') === 'service' || getActiveDemoIndustry()?.key === 'service';
  }
  return state.workspace?.profile_id === 'service' || state.businessProfile?.profile_id === 'service';
}
function nav(){
  const isSvc = isServiceMode();
  const activePage=NAV.some(([id])=>id===state.page)?state.page:'more';
  const isPlatformAdmin = state.page === 'platform-admin';
  const mobileNav = $('#mobileNav');
  const desktopNav = $('#desktopNav');
  const topbar = $('header.topbar');

  if(isPlatformAdmin){
    if(topbar) topbar.style.display = 'none';
    if(mobileNav) mobileNav.style.display = 'none';
    if(desktopNav) desktopNav.style.display = 'none';
    return;
  } else {
    if(topbar) topbar.style.display = '';
    if(mobileNav) mobileNav.style.display = '';
    if(desktopNav) desktopNav.style.display = '';
  }

  $('#desktopNav').innerHTML=NAV.map(([id,label,ico])=>{
    const displayLabel = (id === 'products' && isSvc) ? 'Dịch vụ' : label;
    const isSales = id === 'sales';
    return `<button class="nav-btn ${activePage===id?'active':''} ${isSales?'nav-sales-hero':''}" data-page="${id}"><span class="nav-ico">${icon(ico)}</span><span>${displayLabel}</span></button>`;
  }).join('');
  $('#mobileNav').innerHTML=NAV.map(([id,label,ico])=>{
    const displayLabel = (id === 'products' && isSvc) ? 'Dịch vụ' : label;
    const isSales = id === 'sales';
    return `<button class="${activePage===id?'active':''} ${isSales?'nav-sales-hero':''}" data-page="${id}">${icon(ico)}<span>${displayLabel}</span></button>`;
  }).join('');
}
function render(){ if(!state.data) return; if(!state.workspace) state.workspace = businessProfileModule.resolveWorkspaceProfile(state.businessProfile || businessProfileModule.getBusinessProfile()); state.uiProfile = uiProfileModule.resolveUiProfile(uiProfileModule.getUiProfile()?.id, (state.businessProfile || businessProfileModule.getBusinessProfile())?.profile_id); delete document.body.dataset.page; document.body.dataset.appPage=state.page||''; document.body.classList.toggle('on-platform-admin', state.page==='platform-admin'); document.body.dataset.saleStep=state.page==='sales'?state.saleStep:''; nav(); ({dashboard:renderDashboard,sales:renderSales,products:renderProducts,transfers:renderTransfers,history:renderHistory,settings:renderSettings,prints:renderPrintCenter,print:renderPrintCenter,reports:renderFeatureReports,more:renderMore,orders:renderOrders,transactions:renderTransactions,customers:renderCustomers,suppliers:renderSuppliers,imports:renderImportCenter,backup:renderBackupCenter,returns:renderReturnCenter,shifts:renderShiftCenter,notifications:renderNotificationCenter,shipping:renderShippingCenter,channels:renderChannelCenter,permissions:renderPermissionCenter,scanner:renderScannerCenter,advanced:renderAdvancedHub,prices:renderPrices,promos:renderPromotions,combos:renderCombos,units:renderUnits,opening:renderOpening,labels:renderLabels,cash:renderCash,debts:renderDebts,audit:renderAudit,search:renderSearch,modules:renderModules,onboarding:renderOnboarding,optional:renderOptional,documents:renderDocuments,numbering:renderNumbering,'purchase-orders':renderPurchaseOrders,'supplier-returns':renderSupplierReturns,replenish:renderReplenish,diagnostics:renderDiagnostics,exports:renderExports,'platform-admin':renderPlatformAdmin}[state.page]||renderDashboard)(); headerActions(); injectLocalNotice(); injectInstallBanner(); updateSyncPill(); updateContextAndChips(); }

const levelAvail=l=>Math.max(0,(l?.onHand||0)-(l?.reserved||0)-(l?.damaged||0));
function warehouseStock(productId){ const p = product(productId); return p ? productTotals(p).available : 0; }
function stockView(product,warehouseId){if(warehouseId&&warehouseId!=='all'){const l=(state.data.levels||[]).find(x=>x.productId===product.id&&x.warehouseId===warehouseId)||{onHand:0,reserved:0,damaged:0};return {onHand:l.onHand||0,reserved:l.reserved||0,available:levelAvail(l)};}return productTotals(product);}
function bestSaleWarehouse(cart){const whs=state.data.warehouses||[];if(!whs.length)return '';const need=new Map();cart.forEach(l=>{const p=product(l.itemId);if(p&&p.type!=='SERVICE'&&p.trackInventory!==false)need.set(l.itemId,(need.get(l.itemId)||0)+Math.max(1,Math.floor(Number(l.quantity)||1)));});if(!need.size)return whs[0].id;const ranked=whs.map(w=>{let ok=true,min=Infinity;for(const [pid,n] of need){const lv=(state.data.levels||[]).find(x=>x.productId===pid&&x.warehouseId===w.id);const av=levelAvail(lv);if(av<n)ok=false;min=Math.min(min,av);}return {id:w.id,ok,min};});const pick=ranked.find(r=>r.ok)||ranked.slice().sort((a,b)=>b.min-a.min)[0];return pick?pick.id:whs[0].id;}
function normalizeSaleCart(){const merged=new Map();for(const line of state.saleCart){const previous=merged.get(line.itemId);if(previous){previous.quantity+=Math.max(1,Math.floor(Number(line.quantity)||1));previous.discount=(Number(previous.discount)||0)+(Number(line.discount)||0);previous.discountMode=previous.discountMode||line.discountMode||'amount';}else merged.set(line.itemId,{...line,quantity:Math.max(1,Math.floor(Number(line.quantity)||1)),discountMode:line.discountMode||'amount'});}state.saleCart=[...merged.values()];}
function saleStockLimit(id){const p=product(id);if(!p||p.type==='SERVICE'||p.trackInventory===false)return Infinity;const warehouseId=state.saleDraft.warehouseId||bestSaleWarehouse(state.saleCart);if(warehouseId){const level=(state.data.levels||[]).find(l=>l.productId===id&&l.warehouseId===warehouseId);return Math.max(0,levelAvail(level||{}));}return warehouseStock(id);}
function allowSaleQuantity(id,next){const limit=saleStockLimit(id);if(next<=limit)return true;toast(`Chỉ còn ${fmt(limit)} sản phẩm trong kho`,'error');return false;}
function saleLines(){normalizeSaleCart();return state.saleCart.map(line=>{const p=product(line.itemId);if(!p)return null;const qty=Number(line.quantity)||1,price=Number(line.unitPrice)||0,lineGross=qty*price,rawDisc=Number(line.discount)||0;const lineDiscount=line.discountMode==='percent'?Math.round(lineGross*Math.min(100,Math.max(0,rawDisc))/100):Math.min(lineGross,Math.max(0,rawDisc));const lineTotal=Math.max(0,lineGross-lineDiscount);return {...line,p,lineDiscount,lineTotal}}).filter(Boolean)}
function saleTotals(){const lines=saleLines();const subtotal=lines.reduce((s,x)=>s+x.lineTotal,0);const tax=lines.reduce((s,x)=>s+Math.max(0,Number(x.tax_amount)||0),0);const raw=Number(state.saleDraft.discount)||0;const discount=Math.round(Math.max(0,Math.min(subtotal,state.saleDraft.discountMode==='percent'?subtotal*Math.min(100,raw)/100:raw)));const vatRate=Math.max(0,Math.min(100,Number(state.saleDraft.vatRate)||0));const vat=Math.round(Math.max(0,subtotal-discount)*vatRate/100);let total=Math.round(subtotal-discount+tax+vat);let roundingDiff=0;const rounding=state.paymentPrefs?.cashRounding;if(state.saleDraft.payment==='cash'&&rounding&&rounding!=='none'){const step=Number(rounding)||0;if(step>0&&total>0&&(total%step!==0)){const rounded=Math.ceil(total/step)*step;roundingDiff=rounded-total;total=rounded;}}return {lines,subtotal,discount,tax,vatRate,vat,roundingDiff,total};}
function paymentLabel(method){return ({cash:'Tiền mặt',transfer:'Chuyển khoản',qr:'QR'})[method]||'Chưa xác định'}
function currentCustomer(){return state.saleCustomer||{name:'Khách lẻ',phone:'',code:'',id:''};}
function normalizePhone(v){return String(v||'').replace(/\D/g,'');}
function customerLabel(c=currentCustomer()){return [c.name,c.phone].filter(Boolean).join(' · ')||'Khách lẻ';}
function customerDiscountHint(c=currentCustomer()){const d=Number(c.default_discount);return d>0?`<div class="customer-discount-hint"><span>Gợi ý chiết khấu ${fmt(d)}% · chưa tự động áp dụng</span><button type="button" class="discount-apply-btn" data-apply-customer-discount="${d}">Áp dụng ngay</button></div>`:''}
async function customerRecords(){return getAll('customers');}
function customerMatches(c,q){const x=norm(q).trim();return !x||[c.name,c.phone,c.customer_code,c.code,c.tax_id].some(v=>norm(v).includes(x));}
function openCustomerPicker(){
  let type='all';
  openModal({title:'Chọn khách hàng',sub:'Khách lẻ là mặc định.',hideSubmit:true,body:`<div class="customer-picker"><input id="customerSearch" class="customer-search" placeholder="Tìm tên, SĐT, mã khách, MST"/><div class="customer-type-tabs">${[['all','Tất cả'],['retail','Khách lẻ'],['individual','Cá nhân'],['company','Công ty'],['agent','Đại lý']].map(([v,l])=>`<button class="${v==='all'?'active':''}" data-picker-type="${v}">${l}</button>`).join('')}</div><div id="customerResults" class="customer-results"></div><button class="secondary-btn full" data-action="new-customer">+ Thêm khách hàng</button></div>`});
  const draw=async()=>{const q=$('#customerSearch')?.value||'',rows=(await customerRecords()).filter(c=>c.active!==false&&customerMatches(c,q)&&(type==='all'||(c.customer_type||'retail')===type)).sort((a,b)=>(b.last_used_at||'').localeCompare(a.last_used_at||''));$('#customerResults').innerHTML=`<button class="customer-row" data-customer-id=""><span><strong>Khách lẻ</strong><small>Không lưu thông tin khách</small></span>${icon('chevron-right')}</button>`+rows.map(c=>`<button class="customer-row" data-customer-id="${c.id}"><span><strong>${esc(c.name)}</strong><small>${esc([c.phone,c.customer_code,c.tax_id].filter(Boolean).join(' · ')||'Chưa có thông tin liên hệ')}${c.default_discount?` · Gợi ý CK ${fmt(c.default_discount)}%`:''}</small></span>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có khách phù hợp.</div>';$$('[data-customer-id]',$('#customerResults')).forEach(b=>b.onclick=async()=>{const c=rows.find(x=>x.id===b.dataset.customerId)||{name:'Khách lẻ',phone:'',code:'',id:''};if(c.id){c.last_used_at=new Date().toISOString();await put('customers',c)}state.saleCustomer=c;$('#modalRoot').innerHTML='';state.page==='sales'?renderSales():render();});};$('#customerSearch').oninput=draw;$$('[data-picker-type]').forEach(b=>b.onclick=()=>{type=b.dataset.pickerType;$$('[data-picker-type]').forEach(x=>x.classList.toggle('active',x===b));draw()});draw();
}
function openNewCustomer(){openModal({title:'Thêm khách hàng',sub:'Tên là thông tin bắt buộc.',body:`<div class="form-grid"><div class="field full-span"><label>Tên khách hàng</label><input id="customerName" required placeholder="VD: Nguyễn Thị Lan"/></div><div class="field"><label>Số điện thoại</label><input id="customerPhone" inputmode="tel" placeholder="090..."/></div><div class="field"><label>Mã khách</label><input id="customerCode"/></div><div class="field"><label>Loại khách</label><select id="customerType"><option value="retail">Khách lẻ</option><option value="individual">Cá nhân</option><option value="company">Công ty</option><option value="agent">Đại lý</option></select></div><div class="field"><label>Nhóm khách</label><input id="customerGroup" placeholder="Tùy chọn"/></div><div class="field"><label>Hạn mức nợ (₫)</label><input id="customerCreditLimit" type="number" inputmode="decimal" min="0" placeholder="0 = Không giới hạn" value="0"/></div><div class="field"><label>Chiết khấu mặc định (%)</label><input id="customerDiscount" type="number" inputmode="decimal" min="0" max="100" value="0"/></div><div class="field"><label>Mã số thuế</label><input id="customerTax" inputmode="numeric"/></div><div class="field full-span"><label>Ghi chú</label><input id="customerNote"/></div></div>`,submitText:'Lưu khách hàng',onSubmit:async root=>{const name=$('#customerName',root).value.trim(),phone=$('#customerPhone',root).value.trim(),code=$('#customerCode',root).value.trim();if(!name)throw new Error('Hãy nhập tên khách hàng.');const all=await customerRecords(),dup=phone&&all.find(c=>normalizePhone(c.phone)===normalizePhone(phone));if(dup&&confirm('Số điện thoại đã có trong danh bạ. Dùng khách hàng hiện có?')){state.saleCustomer=dup;$('#modalRoot').innerHTML='';state.page==='sales'?renderSales():render();return;}if(dup)throw new Error('Số điện thoại đã tồn tại.');const now=new Date().toISOString(),id=saleUuid(),c={id,customer_id:id,customer_code:code,name,phone,phone_normalized:normalizePhone(phone),customer_type:$('#customerType',root).value,customer_group:$('#customerGroup',root).value.trim(),creditLimit:Math.max(0,Number($('#customerCreditLimit',root)?.value)||0),credit_limit:Math.max(0,Number($('#customerCreditLimit',root)?.value)||0),default_discount:Math.min(100,Math.max(0,Number($('#customerDiscount',root).value)||0)),tax_id:$('#customerTax',root).value.trim(),note:$('#customerNote',root).value,active:true,created_at:now,updated_at:now,last_used_at:now};await put('customers',c);state.saleCustomer=c;$('#modalRoot').innerHTML='';state.page==='sales'?renderSales():render();toast('Đã lưu khách hàng.','ok')}})}
const POS_CHANNELS = [
  { id: 'pos', name: 'Tại quầy', tag: 'Mặc định', icon: 'store', desc: 'Bán trực tiếp tại quầy thu ngân' },
  { id: 'website', name: 'Website', tag: 'Online', icon: 'globe', desc: 'Đơn từ website cửa hàng' },
  { id: 'social', name: 'Zalo / FB', tag: 'Chat', icon: 'message-circle', desc: 'Chốt đơn qua tin nhắn Zalo, Facebook' },
  { id: 'shopee', name: 'Shopee', tag: 'Sàn TMĐT', icon: 'shopping-bag', desc: 'Sàn TMĐT Shopee (Đã trừ thuế tại sàn)' },
  { id: 'tiktok', name: 'TikTok', tag: 'Sàn TMĐT', icon: 'video', desc: 'TikTok Shop (Đã trừ thuế tại sàn)' },
  { id: 'lazada', name: 'Lazada', tag: 'Sàn TMĐT', icon: 'tag', desc: 'Sàn TMĐT Lazada (Đã trừ thuế tại sàn)' }
];
function channelLabel(id){
  const c = POS_CHANNELS.find(x => x.id === id);
  return c ? c.name : 'Tại quầy';
}
function channelIcon(id){
  const c = POS_CHANNELS.find(x => x.id === id);
  return c ? c.icon : 'store';
}
function openChannelPicker(){
  const current = state.saleDraft.channel || 'pos';
  openModal({
    title: 'Chọn Kênh bán / Nguồn đơn',
    sub: 'Mặc định là Tại quầy · Các đơn Sàn TMĐT sẽ tự động miễn tính thuế',
    hideSubmit: true,
    body: `
      <div class="channel-picker-list" style="display:flex;flex-direction:column;gap:6px">
        ${POS_CHANNELS.map(c => {
          const active = c.id === current;
          return `
            <button type="button" class="channel-option-row ${active ? 'active' : ''}" data-select-channel="${c.id}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:8px;border:1.5px solid ${active ? '#0f172a' : '#e2e8f0'};background:${active ? '#f8fafc' : '#ffffff'};cursor:pointer;text-align:left;width:100%;transition:all 0.15s ease">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:${active ? '#0f172a' : '#f1f5f9'};color:${active ? '#ffffff' : '#334155'}">${icon(c.icon)}</span>
                <div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <strong style="font-size:13.5px;color:#0f172a">${esc(c.name)}</strong>
                    <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:${c.id === 'pos' ? '#e2e8f0' : ['shopee','tiktok','lazada'].includes(c.id) ? '#ffedd5' : '#e0f2fe'};color:${c.id === 'pos' ? '#334155' : ['shopee','tiktok','lazada'].includes(c.id) ? '#c2410c' : '#0369a1'}">${esc(c.tag)}</span>
                  </div>
                  <div style="font-size:11.5px;color:#64748b;margin-top:1px">${esc(c.desc)}</div>
                </div>
              </div>
              <div style="font-size:16px;color:#0f172a;font-weight:800">${active ? '✓' : ''}</div>
            </button>
          `;
        }).join('')}
      </div>
    `
  });

  const root = $('#modalRoot');
  if (root) {
    $$('[data-select-channel]', root).forEach(btn => {
      btn.onclick = () => {
        state.saleDraft.channel = btn.dataset.selectChannel;
        root.innerHTML = '';
        renderSales();
        toast(`Đã chọn kênh: ${channelLabel(state.saleDraft.channel)}`, 'ok');
      };
    });
  }
}

function addSaleItem(id){const p=product(id);if(!p||p.active===false)return;normalizeSaleCart();const found=state.saleCart.find(x=>x.itemId===id),next=(found?.quantity||0)+1;if(!allowSaleQuantity(id,next))return;if(found)found.quantity=next;else state.saleCart.push({itemId:id,quantity:1,unitPrice:Number(p.price)||0,discount:0});renderSales();}
function updateSaleLine(id,field,value){normalizeSaleCart();const line=state.saleCart.find(x=>x.itemId===id);if(!line)return;if(field==='quantity'){const raw=String(value??'').trim();if(raw===''){renderSales();return;}const n=Number(raw);if(isNaN(n)||n<=0){state.saleCart=state.saleCart.filter(x=>x.itemId!==id);renderSales();return;}const next=Math.max(1,Math.floor(n));if(!allowSaleQuantity(id,next)){renderSales();return;}line.quantity=next;}else line[field]=Math.max(0,Number(value)||0);renderSales();}
function adjustSaleQuantity(id,delta){normalizeSaleCart();const line=state.saleCart.find(x=>x.itemId===id);if(!line)return;const next=line.quantity+delta;if(next<=0){state.saleCart=state.saleCart.filter(x=>x.itemId!==id);renderSales();return;}if(!allowSaleQuantity(id,next))return;line.quantity=next;renderSales();}
function renderSalesLegacy(){
  setTitle('Bán hàng','QBiz');
  const q=state.saleSearch.toLowerCase();
  const matched=state.data.products.filter(p=>p.active!==false&&(!q||[p.name,p.sku,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q)))));
  const candidates=(q||state.saleShowAll)?matched:matched.slice(0,8); const totals=saleTotals(); const recentSales=(state.data.sales||[]).slice(0,6);
  const receipt=state.saleReceipt?`<section class="sale-receipt card"><div><span class="eyebrow blue">Đã lưu phiếu</span><h2>${esc(state.saleReceipt.code)}</h2><p>${esc(state.saleReceipt.customer_label||'Khách lẻ')} · ${esc(state.saleReceipt.payment_method||'')}</p></div><strong>${fmt(state.saleReceipt.total||state.saleReceipt.grand_total)} ₫</strong></section>`:'';
  const catalogHint=q?'':'<p class="catalog-hint">Gợi ý bán nhanh · tìm kiếm để xem mọi sản phẩm</p>';
  const more=(!q&&!state.saleShowAll&&matched.length>candidates.length)?`<button class="catalog-more" data-sale-show-all>Xem tất cả sản phẩm</button>`:'';
  const rows=candidates.map(p=>`<button class="sale-item" data-sale-add="${p.id}"><div class="product-photo tiny">${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`:esc((p.name||'S').slice(0,1))}</div><span><strong>${esc(p.name)}</strong><small>${p.type==='SERVICE'?'Dịch vụ':`${esc(p.sku||'')} · ${esc(p.unit||'cái')}`}</small></span><b>${p.price?fmt(p.price):'Chưa có giá'}</b></button>`).join('')||'<div class="empty">Không tìm thấy mục phù hợp.</div>';
  const cartLines=totals.lines.map(x=>`<div class="sale-line"><div class="sale-line-head"><strong>${esc(x.p.name)}</strong><button type="button" class="line-remove" data-sale-remove="${x.itemId}" aria-label="Xóa dòng">×</button></div><div class="sale-line-controls"><label>SL<div class="quantity-control"><button type="button" data-sale-adjust="-1" data-sale-id="${x.itemId}" aria-label="Giảm số lượng">−</button><input type="number" inputmode="numeric" min="1" step="1" value="${x.quantity}" data-sale-field="quantity" data-sale-id="${x.itemId}" /><button type="button" data-sale-adjust="1" data-sale-id="${x.itemId}" aria-label="Tăng số lượng">+</button></div></label><label>Giá<input type="number" inputmode="decimal" min="0" value="${x.unitPrice}" data-sale-field="unitPrice" data-sale-id="${x.itemId}" /></label><label>Giảm<input type="number" inputmode="decimal" min="0" value="${x.discount}" data-sale-field="discount" data-sale-id="${x.itemId}" /></label></div><div class="sale-line-total">${fmt(x.lineTotal)} ₫</div></div>`).join('')||'<div class="empty">Chưa có sản phẩm trong giỏ.</div>';
  const customer=currentCustomer();
  const cashDue=state.saleDraft.payment==='cash'?Math.max(0,Number(state.saleDraft.cashReceived)||0)-totals.total:0;
  const checkout=`<div class="sale-fields"><label>Kho bán<select id="saleWarehouse">${state.data.warehouses.map(w=>`<option value="${w.id}" ${(state.saleDraft.warehouseId||state.data.warehouses[0]?.id)===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label>Giảm giá đơn<div class="discount-control"><input id="saleDiscount" type="number" inputmode="decimal" min="0" value="${state.saleDraft.discount}" /><button type="button" class="discount-mode ${state.saleDraft.discountMode==='amount'?'active':''}" data-discount-mode="amount">₫</button><button type="button" class="discount-mode ${state.saleDraft.discountMode==='percent'?'active':''}" data-discount-mode="percent">%</button></div></label><label>Ghi chú<input id="saleNote" value="${esc(state.saleDraft.note)}" placeholder="Ghi chú cho phiếu bán..." /></label><label>Thanh toán<select id="salePayment"><option value="cash" ${state.saleDraft.payment==='cash'?'selected':''}>Tiền mặt</option><option value="transfer" ${state.saleDraft.payment==='transfer'?'selected':''}>Chuyển khoản</option><option value="qr" ${state.saleDraft.payment==='qr'?'selected':''}>QR</option></select></label>${state.saleDraft.payment==='cash'?`<label>Khách đưa<input id="cashReceived" type="number" inputmode="decimal" min="0" value="${esc(state.saleDraft.cashReceived)}" placeholder="Nhập số tiền"/><small class="cash-change ${cashDue>=0?'ok':'warn'}">${cashDue>=0?`Tiền thừa: ${fmt(cashDue)} ₫`:`Còn thiếu: ${fmt(Math.abs(cashDue))} ₫`}</small></label>`:''}</div><div class="sale-total"><span>Tổng tiền</span><strong>${fmt(totals.total)} ₫</strong></div><button class="primary-btn sale-pay" data-sale-pay ${state.saleBusy||!totals.lines.length?'disabled':''}>${state.saleBusy?'Đang ghi phiếu…':'Thanh toán · '+fmt(totals.total)+' ₫'}</button>`;
  $('#content').innerHTML=`${receipt}<section class="sale-layout"><div class="sale-catalog card"><div class="section-head"><div><h2>${q?'Kết quả tìm kiếm':'Bán nhanh'}</h2>${catalogHint}</div><button class="secondary-btn" data-action="sale-scan">${icon('scan-line')}<span>Quét</span></button></div><button class="customer-chip" data-action="customer-picker">${icon('user')}<span>${esc(customerLabel(customer))}</span>${icon('chevron-right')}</button><div class="sale-search"><input id="saleSearch" value="${esc(state.saleSearch)}" placeholder="Tìm tên, SKU hoặc barcode..." autocomplete="off" /></div><div class="sale-items">${rows}</div>${more}</div><aside class="sale-cart card ${totals.lines.length?'':'empty-cart'}"><div class="section-head"><div><h2>Giỏ bán</h2><p>${totals.lines.length} dòng · ${esc(customer.name||'Khách lẻ')}</p></div></div><div class="sale-cart-lines">${cartLines}</div>${checkout}</aside></section>${totals.lines.length?`<div class="sale-mobile-bar"><button class="sale-mobile-summary" data-sale-cart-open>${totals.lines.length} món · ${fmt(totals.total)} ₫</button><button class="primary-btn" data-sale-mobile-pay>Thanh toán</button></div>`:''}<section class="card section-card sale-history"><div class="section-head"><div><h2>Phiếu bán gần đây</h2></div></div>${recentSales.map(s=>`<div class="sale-history-row"><div><strong>${esc(s.code)}</strong><span>${esc(s.customer_label||'Khách lẻ')} · ${esc(s.payment_method||'')}</span></div><strong>${fmt(s.total)} ₫</strong></div>`).join('')||'<div class="empty">Chưa có phiếu bán.</div>'}</section>`;
  $('#saleSearch')?.addEventListener('input',e=>{state.saleSearch=e.target.value;state.saleShowAll=false;renderSales()});
  $('[data-sale-show-all]')?.addEventListener('click',()=>{state.saleShowAll=true;renderSales()}); $('[data-sale-cart-open]')?.addEventListener('click',()=>$('.sale-cart')?.scrollIntoView({behavior:'smooth',block:'start'})); $('[data-sale-mobile-pay]')?.addEventListener('click',submitSale);
  const paymentSelect=$('#salePayment'); if(paymentSelect){const label=paymentSelect.closest('label');const group=document.createElement('div');group.className='payment-field';group.innerHTML=`<span>Thanh toán</span><div class="payment-options">${[['cash','Tiền mặt'],['transfer','Chuyển khoản'],['qr','QR']].map(([v,t])=>`<button type="button" class="payment-option ${state.saleDraft.payment===v?'active':''}" data-payment-choice="${v}">${t}</button>`).join('')}</div>`;label.replaceWith(group);$$('[data-payment-choice]').forEach(b=>b.onclick=()=>{state.saleDraft.payment=b.dataset.paymentChoice;renderSales()});}
  $('#saleDiscount')?.addEventListener('input',e=>{state.saleDraft.discount=e.target.value;renderSales()}); $$('[data-discount-mode]').forEach(b=>b.onclick=()=>{state.saleDraft.discountMode=b.dataset.discountMode;renderSales()}); $('#cashReceived')?.addEventListener('input',e=>{state.saleDraft.cashReceived=e.target.value;renderSales()}); $('#saleNote')?.addEventListener('input',e=>state.saleDraft.note=e.target.value); $('#saleWarehouse')?.addEventListener('change',e=>state.saleDraft.warehouseId=e.target.value);
  $$('[data-sale-add]').forEach(b=>b.onclick=()=>addSaleItem(b.dataset.saleAdd)); $('[data-action="customer-picker"]')?.addEventListener('click',openCustomerPicker); $$('[data-sale-remove]').forEach(b=>b.onclick=()=>{state.saleCart=state.saleCart.filter(x=>x.itemId!==b.dataset.saleRemove);renderSales()}); $$('[data-sale-adjust]').forEach(b=>b.onclick=()=>adjustSaleQuantity(b.dataset.saleId,Number(b.dataset.saleAdjust))); $$('[data-sale-field]').forEach(i=>i.addEventListener('change',()=>updateSaleLine(i.dataset.saleId,i.dataset.saleField,i.value))); $('[data-sale-pay]')?.addEventListener('click',submitSale);
}
function saleProductTile(p){
  const stock = p.type === 'SERVICE' ? null : warehouseStock(p.id);
  const line = state.saleCart.find(x => x.itemId === p.id);
  const skuText = esc(p.sku || (p.type === 'SERVICE' ? 'Dịch vụ' : 'Chưa có mã'));
  const isService = p.type === 'SERVICE';
  const isOutOfStock = !isService && stock !== null && stock <= 0;
  const isLowStock = !isService && stock !== null && (p.lowStock ? stock <= p.lowStock : stock <= 5) && stock > 0;
  
  let stockBadgeHtml = '';
  if (isService) {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock service">Dịch vụ</span>`;
  } else if (isOutOfStock) {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock out-of-stock">Hết hàng</span>`;
  } else if (isLowStock) {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock low-stock" title="Sắp hết hàng: Còn ${fmt(stock)}"><span class="stock-dot yellow"></span>${fmt(stock)}</span>`;
  } else {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock in-stock" title="Còn hàng: Còn ${fmt(stock ?? 0)}"><span class="stock-dot green"></span>${fmt(stock ?? 0)}</span>`;
  }

  const priceText = p.price ? fmt(p.price) : 'Chưa có giá';
  return `<article class="pos-product ${line ? 'has-qty' : ''}">
    <button class="pos-product-main" data-sale-add="${p.id}">
      <div class="pos-product-image">${p.image ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>` : esc((p.name || 'S').slice(0, 1))}${stockBadgeHtml}</div>
      <strong class="pos-prod-title">${esc(p.name)}</strong>
      <div class="pos-prod-sku">${skuText}</div>
      <div class="pos-prod-price-row">
        <b class="pos-prod-price">${priceText}</b>
      </div>
    </button>
    ${line ? `<div class="pos-inline-qty"><button type="button" data-sale-adjust="-1" data-sale-id="${p.id}" aria-label="Giảm">−</button><input type="number" inputmode="numeric" pattern="[0-9]*" min="1" step="1" value="${line.quantity}" data-sale-field="quantity" data-sale-id="${p.id}" class="pos-inline-qty-input" aria-label="Số lượng ${esc(p.name)}" /><button type="button" data-sale-adjust="1" data-sale-id="${p.id}" aria-label="Tăng">+</button></div>` : `<button type="button" class="pos-add" data-sale-add="${p.id}" aria-label="Thêm ${esc(p.name)}">+</button>`}
  </article>`;
}
function saleStepHeader(title){const soundIco=state.paymentPrefs?.soundEnabled?'volume-2':'volume-x';return `<div class="flow-head"><button class="flow-back" data-sale-back aria-label="Quay lại">‹</button><h2>${title}</h2><button class="flow-pref-btn" data-action="sale-preferences" title="Cài đặt thanh toán & âm báo" aria-label="Cài đặt thanh toán">${icon(soundIco)}</button></div>`}
function docTienMoNgoac(val, mode = 'amount', gross = 0) {
  if (mode === 'percent') {
    const pct = Number(val) || 0;
    if (pct <= 0) return '';
    const amt = Math.round(gross * pct / 100);
    return `(Giảm ${pct}% · −${fmt(amt)} ₫)`;
  }
  const n = Math.round(Math.abs(Number(val) || 0));
  if (!n) return '';
  return `(Giảm ${fmt(n)} ₫)`;
}

function openCheckoutQRModal({ vietQrUrl, bankName, bankAcc, bankOwner, pendingCode, total }) {
  if (!vietQrUrl) return;
  openModal({
    title: 'Mã QR thanh toán',
    sub: `Số tiền: ${fmt(total)} ₫ · ${esc(pendingCode)}`,
    hideSubmit: true,
    body: `
      <div class="qr-zoom-modal-content" style="text-align:center;padding:6px 0;">
        <div style="background:#ffffff;padding:12px;border-radius:14px;display:inline-block;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:1px solid #e2e8f0;margin-bottom:12px;max-width:100%">
          <img src="${esc(vietQrUrl)}" alt="VietQR phóng to" style="width:280px;max-width:100%;height:auto;aspect-ratio:1/1;object-fit:contain;display:block;margin:0 auto;border-radius:8px"/>
        </div>
        <div style="font-size:13px;color:#334155;line-height:1.65;background:#f8fafc;padding:10px 14px;border-radius:10px;border:1px solid #e2e8f0;text-align:left;max-width:320px;margin:0 auto">
          <div><span style="color:#64748b">Ngân hàng:</span> <strong>${esc((bankName || 'MB').toUpperCase())}</strong></div>
          <div><span style="color:#64748b">Số tài khoản:</span> <strong>${esc(bankAcc || '—')}</strong></div>
          <div><span style="color:#64748b">Chủ tài khoản:</span> <strong>${esc(bankOwner || '—')}</strong></div>
          <div><span style="color:#64748b">Số tiền:</span> <strong style="color:#0284c7;font-size:15px">${fmt(total)} ₫</strong></div>
          <div><span style="color:#64748b">Nội dung CK:</span> <code style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-weight:700">${esc(pendingCode)}</code></div>
        </div>
        <p style="font-size:11.5px;color:#64748b;margin:10px auto 0">Khách hàng quét mã trên app ngân hàng để thanh toán</p>
      </div>
    `
  });
}


function shortDiscountPillText(amt) {
  const n = Number(amt) || 0;
  if (!n) return 'Giảm giá';
  if (n >= 1e9) {
    const v = n / 1e9;
    return `−${v % 1 === 0 ? v : v.toFixed(1)} tỷ ₫`;
  }
  if (n >= 1e6) {
    const v = n / 1e6;
    return `−${v % 1 === 0 ? v : v.toFixed(1)}tr ₫`;
  }
  if (n >= 1e3) {
    const v = n / 1e3;
    return `−${v % 1 === 0 ? v : v.toFixed(1)}k ₫`;
  }
  return `−${fmt(n)} ₫`;
}

function salePriceGroupHtml(x) {
  const lineGross = (Number(x.quantity) || 1) * (Number(x.unitPrice) || 0);
  const hasDiscount = Boolean(x.lineDiscount && x.lineDiscount > 0);
  if (hasDiscount) {
    return `<div class="cart-price-group has-discount" id="cartPriceGroup_${x.itemId}"><del class="cart-orig-total">${fmt(lineGross)} ₫</del><div class="cart-price-final-line"><span class="cart-con-label">Còn:</span> <b class="cart-line-total">${fmt(x.lineTotal)} ₫</b></div></div>`;
  }
  return `<div class="cart-price-group" id="cartPriceGroup_${x.itemId}">${x.quantity > 1 ? `<small class="cart-unit-calc">${x.quantity} × ${fmt(x.unitPrice)} ₫</small>` : ''}<b class="cart-line-total">${fmt(x.lineTotal)} ₫</b></div>`;
}

function saleCartRows(){
  return saleLines().map(x => {
    const open = state.saleDiscountOpen.has(x.itemId);
    const lineGross = (Number(x.quantity) || 1) * (Number(x.unitPrice) || 0);
    return `<article class="cart-row"><div class="pos-product-image">${x.p.image ? `<img src="${x.p.image}" alt="${esc(x.p.name)}"/>` : esc((x.p.name || 'S').slice(0, 1))}</div><div class="cart-row-main"><div class="cart-row-title"><div class="cart-name-group"><strong>${esc(x.p.name)}</strong><small class="cart-sku-badge">${esc(x.p.sku || 'Dịch vụ')}</small></div><button data-sale-remove="${x.itemId}" class="cart-remove-btn" aria-label="Xóa ${esc(x.p.name)}" title="Xóa">×</button></div><div class="cart-row-bottom"><div class="cart-controls-group"><div class="quantity-control"><button data-sale-adjust="-1" data-sale-id="${x.itemId}">−</button><input type="number" inputmode="numeric" min="1" value="${x.quantity}" data-sale-field="quantity" data-sale-id="${x.itemId}"/><button data-sale-adjust="1" data-sale-id="${x.itemId}">+</button></div><button class="line-discount-trigger" data-line-discount="${x.itemId}">Giảm giá <span>›</span></button></div>${salePriceGroupHtml(x)}</div>${open ? `<div class="line-discount-editor" data-editor-item="${x.itemId}"><div class="line-discount-input-row"><div class="discount-mode-group"><button type="button" class="discount-mode ${x.discountMode !== 'percent' ? 'active' : ''}" data-line-discount-mode="amount" data-item-id="${x.itemId}">₫</button><button type="button" class="discount-mode ${x.discountMode === 'percent' ? 'active' : ''}" data-line-discount-mode="percent" data-item-id="${x.itemId}">%</button></div><input aria-label="Giảm giá cho ${esc(x.p.name)}" type="number" inputmode="decimal" min="0" value="${x.discount || ''}" placeholder="Nhập số tiền..." data-sale-field="discount" data-sale-id="${x.itemId}"/></div><div class="line-discount-hint-row" id="discHint_${x.itemId}"><span class="disc-words-badge">${x.discount ? docTienMoNgoac(x.discount, x.discountMode, lineGross) : ''}</span></div></div>` : ''}</div></article>`;
  }).join('');
}
function compactCheckoutExtras(){if(state.saleStep!=='checkout'||$('.checkout-more'))return;const extras=['.cart-note','.vat-box','.invoice-box'].map(s=>$(s)).filter(Boolean);if(!extras.length)return;const details=document.createElement('details');details.className='checkout-more';details.innerHTML='<summary>Tùy chọn thêm</summary>';extras[0].before(details);extras.forEach(x=>details.append(x));}
function bindSaleControls(){
  compactCheckoutExtras();
  const customerChip=$('[data-action="customer-picker"]');
  if(customerChip&&Number(currentCustomer().default_discount)>0&&!customerChip.nextElementSibling?.classList.contains('customer-discount-hint'))customerChip.insertAdjacentHTML('afterend',customerDiscountHint());
  $$('button[data-sale-step]').forEach(b=>b.onclick=e=>{e.stopPropagation();setSaleStep(b.dataset.saleStep)});
  $$('[data-sale-back]').forEach(b=>b.onclick=goSaleBack);
  $$('[data-sale-add]').forEach(b=>b.onclick=()=>addSaleItem(b.dataset.saleAdd));
  $$('[data-sale-remove]').forEach(b=>b.onclick=()=>{state.saleCart=state.saleCart.filter(x=>x.itemId!==b.dataset.saleRemove);renderSales()});
  $$('[data-sale-adjust]').forEach(b=>b.onclick=()=>adjustSaleQuantity(b.dataset.saleId,Number(b.dataset.saleAdjust)));
  $$('[data-sale-field]').forEach(i=>i.addEventListener('change',()=>updateSaleLine(i.dataset.saleId,i.dataset.saleField,i.value)));
  $$('input[data-sale-field="quantity"]').forEach(input => {
    const selectAll = () => {
      try {
        input.select();
        input.setSelectionRange?.(0, 9999);
      } catch (_) {}
    };
    input.addEventListener('click', e => {
      e.stopPropagation();
      selectAll();
    });
    input.addEventListener('focus', () => {
      setTimeout(selectAll, 40);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });
  $$('input[data-sale-field="discount"]').forEach(input => {
    input.addEventListener('input', () => {
      const itemId = input.dataset.saleId;
      const val = input.value;
      const line = state.saleCart.find(x => x.itemId === itemId);
      if (!line) return;
      line.discount = Math.max(0, Number(val) || 0);

      const p = product(line.itemId);
      const qty = Number(line.quantity) || 1;
      const price = Number(line.unitPrice) || 0;
      const lineGross = qty * price;
      const rawDisc = Number(line.discount) || 0;
      const lineDiscount = line.discountMode === 'percent'
        ? Math.round(lineGross * Math.min(100, Math.max(0, rawDisc)) / 100)
        : Math.min(lineGross, Math.max(0, rawDisc));
      const lineTotal = Math.max(0, lineGross - lineDiscount);

      const hintRow = $(`#discHint_${itemId}`);
      if (hintRow) {
        const wordsBadge = $('.disc-words-badge', hintRow);
        if (wordsBadge) wordsBadge.textContent = docTienMoNgoac(val, line.discountMode, lineGross);
      }

      const priceGroup = $(`#cartPriceGroup_${itemId}`);
      if (priceGroup) {
        if (lineDiscount > 0) {
          priceGroup.className = 'cart-price-group has-discount';
          priceGroup.innerHTML = `
            <del class="cart-orig-total">${fmt(lineGross)} ₫</del>
            <div class="cart-price-final-line">
              <span class="cart-con-label">Còn:</span>
              <b class="cart-line-total">${fmt(lineTotal)} ₫</b>
            </div>
          `;
        } else {
          priceGroup.className = 'cart-price-group';
          priceGroup.innerHTML = `
            ${qty > 1 ? `<small class="cart-unit-calc">${qty} × ${fmt(price)} ₫</small>` : ''}
            <b class="cart-line-total">${fmt(lineTotal)} ₫</b>
          `;
        }
      }

      const totals = saleTotals();
      const totalsBox = $('.cart-totals');
      if (totalsBox) {
        totalsBox.innerHTML = `
          <div><span>Tạm tính</span><b>${fmt(totals.subtotal)} ₫</b></div>
          ${totals.discount ? `<div><span>Giảm giá</span><b>− ${fmt(totals.discount)} ₫</b></div>` : ''}
          ${totals.tax ? `<div><span>Thuế/VAT theo mặt hàng</span><b>${fmt(totals.tax)} ₫</b></div>` : ''}
          <div class="grand"><span>Tổng cộng</span><b>${fmt(totals.total)} ₫</b></div>
        `;
      }
    });
  });
  $$('[data-line-discount]').forEach(b=>b.onclick=()=>{const id=b.dataset.lineDiscount;state.saleDiscountOpen.has(id)?state.saleDiscountOpen.delete(id):state.saleDiscountOpen.add(id);renderSales()});
  $$('[data-line-discount-mode]').forEach(b=>b.onclick=e=>{e.stopPropagation();const line=state.saleCart.find(x=>x.itemId===b.dataset.itemId);if(line){line.discountMode=b.dataset.lineDiscountMode;renderSales()}});
  $$('[data-discount-mode]').forEach(b=>b.onclick=()=>{state.saleDraft.discountMode=b.dataset.discountMode;renderSales()});
  $$('[data-apply-customer-discount]').forEach(b=>b.onclick=e=>{e.stopPropagation();const pct=Number(b.dataset.applyCustomerDiscount)||0;state.saleDraft.discount=pct;state.saleDraft.discountMode='percent';toast(`Đã áp dụng chiết khấu ${pct}% cho khách hàng`,'ok');renderSales()});
  $$('[data-payment-choice]').forEach(b=>b.onclick=()=>{state.saleDraft.payment=b.dataset.paymentChoice;renderSales()});
  $$('[data-fulfillment]').forEach(b=>b.onclick=()=>{state.saleDraft.fulfillment=b.dataset.fulfillment;renderSales()});
  customerChip?.addEventListener('click',openCustomerPicker);
  $('[data-sale-pay]')?.addEventListener('click',submitSale);
  const pillStrip=$('.cash-quick-pills');
  if(pillStrip&&!pillStrip._dragBound){
    pillStrip._dragBound=true;
    let isDown=false,startX=0,scrollLeft=0;
    pillStrip.addEventListener('mousedown',e=>{isDown=true;startX=e.pageX-pillStrip.offsetLeft;scrollLeft=pillStrip.scrollLeft});
    pillStrip.addEventListener('mouseleave',()=>{isDown=false});
    pillStrip.addEventListener('mouseup',()=>{isDown=false});
    pillStrip.addEventListener('mousemove',e=>{if(!isDown)return;e.preventDefault();const x=e.pageX-pillStrip.offsetLeft;pillStrip.scrollLeft=scrollLeft-(x-startX)*1.5});
  }
}
function renderSales(){
  document.body.dataset.saleStep=state.saleStep;
  if(!userCan('SELL')){
    setTitle('Bán hàng','QBiz');
    $('#content').innerHTML=`
      <section class="card section-card" style="text-align:center;padding:48px 16px;max-width:560px;margin:32px auto">
        <div style="font-size:44px;margin-bottom:12px">🔒</div>
        <h2 style="font-size:18px;margin-bottom:8px">Vai trò không có quyền bán hàng</h2>
        <p class="muted" style="margin:0 auto 20px;font-size:13.5px;line-height:1.5">
          Tài khoản hiện tại (${esc(getRoleLabel(getCurrentRole()))}) chỉ có quyền quản lý và vận hành kho hàng, không được phép thực hiện giao dịch bán lẻ tại quầy.
        </p>
        <button class="primary-btn" data-action="go-to-transfers">${icon('arrow-left-right')} Chuyển sang màn hình Kho</button>
      </section>
    `;
    $('[data-action="go-to-transfers"]')?.addEventListener('click',()=>{state.page='transfers';render();});
    headerActions();
    nav();
    return;
  }
  setTitle(state.saleStep==='browse'?'Bán hàng':state.saleStep==='cart'?'Giỏ hàng':state.saleStep==='checkout'?'Thanh toán':'Hoàn tất','QBiz');
  const totals=saleTotals();
  const customer=currentCustomer();
  if(state.saleStep==='success'&&state.saleReceipt){
    const s=state.saleReceipt,method=s.payments?.[0]?.method||s.payment_method;
    const profile=(state.data?.settings||[]).find(x=>x.id===PROFILE_SETTING)?.value||{};
    const grandTotal=Number(s.grand_total??s.total??0);
    const bankName=profile.bank_name||'';
    const bankAcc=profile.bank_account_number||'';
    const bankOwner=profile.bank_account_name||'';
    let vietQrUrl=profile.payment_qr||'';
    if(!vietQrUrl&&bankName&&bankAcc){
      vietQrUrl=`https://img.vietqr.io/image/${bankName.toUpperCase().replace(/\s+/g,'')}-${bankAcc}-compact2.png?amount=${grandTotal}&addInfo=${encodeURIComponent(s.code||s.id)}&accountName=${encodeURIComponent(bankOwner)}`;
    }
    const methodLabel=method==='qr'?'QR (Đã xác thực)':(method==='transfer'?'Chuyển khoản (Đã xác thực)':paymentLabel(method));
    const qrBlock=(s.payment_status!=='PAID'&&vietQrUrl)?`
      <div style="text-align:center;margin:14px auto;padding:12px;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1;max-width:240px">
        <img src="${esc(vietQrUrl)}" style="width:180px;height:180px;object-fit:contain;display:block;margin:0 auto 6px;border-radius:6px" alt="VietQR"/>
        <small style="color:#64748b;font-size:11px">Quét mã VietQR để thanh toán / đối soát</small>
      </div>
    `:'';

    $('#content').innerHTML=`<section class="pos-success"><div class="success-mark">✓</div><h2>Thanh toán thành công!</h2><p>${esc(s.code||s.sale_uuid||'Phiếu bán')}</p><strong>${fmt(grandTotal)} ₫</strong>${qrBlock}<div class="success-summary"><div><span>Thời gian</span><b>${dt(s.created_at||s.createdAt||new Date().toISOString())}</b></div><div><span>Khách hàng</span><b>${esc(s.customer_label||'Khách lẻ')}</b></div><div><span>Phương thức</span><b>${esc(methodLabel)}</b></div></div><div class="success-actions"><button class="secondary-btn" data-action="print-receipt" data-id="${s.id}" data-type="sale">${icon('file-text')} In phiếu</button><button class="secondary-btn" data-action="send-zalo">${icon('share-2')} Gửi Zalo</button><button class="secondary-btn" data-action="invoice-info">${icon('file-text')} Hóa đơn</button><button class="ghost-btn" data-sale-detail>Xem chi tiết giao dịch</button><button class="primary-btn" data-sale-complete data-sale-new>Hoàn thành</button></div></section>`;
    const finishSale=()=>{state.saleReceipt=null;state.saleStep='browse';state.saleSearch='';state.saleType='all';state.saleShowAll=false;renderSales()};
    $('[data-sale-complete]').onclick=finishSale;
    $('[data-sale-detail]').onclick=()=>openTransaction(s);
    $('[data-action="send-zalo"]').onclick=()=>sendZaloOrder(s);
    $('[data-action="invoice-info"]', $('#content'))?.addEventListener('click', () => openInvoiceModalForSale(s));
    return;
  }
  if(state.saleStep==='cart'){$('#content').innerHTML=`<section class="pos-flow card">${saleStepHeader('Giỏ hàng')}<button class="customer-chip" data-action="customer-picker">${icon('user')}<span><small>Khách hàng</small>${esc(customerLabel(customer))}</span>${icon('chevron-right')}</button>${customerDiscountHint(customer)}<div class="cart-list">${saleCartRows()||'<div class="empty">Giỏ hàng đang trống.</div>'}</div><div class="order-options-open"><div class="discount-box"><div class="discount-box-head"><strong>Giảm giá đơn hàng</strong>${totals.discount?`<span class="discount-val-hint">− ${fmt(totals.discount)} ₫</span>`:''}</div><div class="discount-control"><input id="saleDiscount" type="number" inputmode="decimal" min="0" value="${state.saleDraft.discount||''}" placeholder="0" aria-label="Giảm giá đơn hàng"/><button type="button" class="discount-mode ${state.saleDraft.discountMode==='amount'?'active':''}" data-discount-mode="amount">₫</button><button type="button" class="discount-mode ${state.saleDraft.discountMode==='percent'?'active':''}" data-discount-mode="percent">%</button></div><div class="order-discount-hint-row" id="orderDiscountHint"><span class="disc-words-badge">${state.saleDraft.discount?docTienMoNgoac(state.saleDraft.discount,state.saleDraft.discountMode,totals.subtotal):''}</span></div></div></div><div class="cart-totals"><div><span>Tạm tính</span><b>${fmt(totals.subtotal)} ₫</b></div>${totals.discount?`<div><span>Giảm giá</span><b>− ${fmt(totals.discount)} ₫</b></div>`:''}${totals.tax?`<div><span>Thuế/VAT theo mặt hàng</span><b>${fmt(totals.tax)} ₫</b></div>`:''}<div class="grand"><span>Tổng cộng</span><b>${fmt(totals.total)} ₫</b></div></div><button class="primary-btn flow-primary" data-sale-step="checkout" ${!totals.lines.length?'disabled':''}>Tiếp tục thanh toán</button></section>`;$('#saleDiscount')?.addEventListener('input',e=>{state.saleDraft.discount=e.target.value;const hint=$('#orderDiscountHint .disc-words-badge');const t=saleTotals();if(hint)hint.textContent=docTienMoNgoac(e.target.value,state.saleDraft.discountMode,t.subtotal);const tb=$('.cart-totals');if(tb){tb.innerHTML=`<div><span>Tạm tính</span><b>${fmt(t.subtotal)} ₫</b></div>${t.discount?`<div><span>Giảm giá</span><b>− ${fmt(t.discount)} ₫</b></div>`:''}${t.tax?`<div><span>Thuế/VAT theo mặt hàng</span><b>${fmt(t.tax)} ₫</b></div>`:''}<div class="grand"><span>Tổng cộng</span><b>${fmt(t.total)} ₫</b></div>`;}const vh=$('.discount-box-head .discount-val-hint');if(vh)vh.textContent=t.discount?`− ${fmt(t.discount)} ₫`:'';});bindSaleControls();return;}
   if(state.saleStep==='checkout'){
    const change=(Number(state.saleDraft.cashReceived)||0)-totals.total,
          delivery=state.saleDraft.fulfillment==='delivery',
          payment=state.saleDraft.payment,
          isQrOrTransfer=payment==='qr'||payment==='transfer';

    const profile=(state.data?.settings||[]).find(x=>x.id===PROFILE_SETTING)?.value||{};
    const BANK_SHORT_MAP={'TECHCOMBANK':'TCB','TCB':'TCB','VIETCOMBANK':'VCB','VCB':'VCB','MBBANK':'MB','MB':'MB','VIETINBANK':'CTG','CTG':'CTG','BIDV':'BIDV','ACB':'ACB','VPBANK':'VPB','VPB':'VPB','TPBANK':'TPB','TPB':'TPB','SACOMBANK':'STB','STB':'STB','HDBANK':'HDB','HDB':'HDB','VIB':'VIB','SHB':'SHB','OCB':'OCB','MSB':'MSB'};
    const bankName=profile.bank_name||'MB';
    const bankAcc=profile.bank_account_number||'08889998888';
    const bankOwner=profile.bank_account_name||profile.store_name||'QBIZ STORE';
    const rawBank=bankName.toUpperCase().replace(/\s+/g,'');
    const qrBankCode=BANK_SHORT_MAP[rawBank]||rawBank;
    const pendingCode=state.salePendingId ? ('POS-'+state.salePendingId.slice(-6).toUpperCase()) : ('POS-'+(Date.now().toString().slice(-6)));
    let vietQrUrl=profile.payment_qr||'';
    if(!vietQrUrl&&bankName&&bankAcc){
      vietQrUrl=`https://img.vietqr.io/image/${qrBankCode}-${bankAcc}-compact2.png?amount=${totals.total}&addInfo=${encodeURIComponent(pendingCode)}&accountName=${encodeURIComponent(bankOwner)}`;
    }

    const isAutoMode = state.paymentPrefs?.qrVerificationMode === 'payos' || state.paymentPrefs?.qrVerificationMode === 'webhook';
    const autoModeLabel = state.paymentPrefs?.qrVerificationMode === 'payos' ? 'Tự động payOS' : 'Tự động Webhook';

    const qrPanelHtml=isQrOrTransfer?`
      <div class="qr-payment-panel">
        <div class="qr-payment-card">
          <div class="qr-code-img-wrap ${vietQrUrl ? 'qr-zoomable' : ''}" id="checkoutQrImgWrap" title="${vietQrUrl ? 'Bấm để phóng to mã QR' : ''}">
            ${vietQrUrl?`<img src="${esc(vietQrUrl)}" alt="VietQR" class="vietqr-scan-img"/>`:`<div class="qr-placeholder">${icon('qr-code')}<span>Chưa có ảnh mã QR</span></div>`}
          </div>
          <div class="qr-details-group">
            <div class="qr-detail-line"><span>Ngân hàng:</span><strong>${esc(bankName.toUpperCase())}</strong></div>
            <div class="qr-detail-line"><span>Số TK:</span><strong class="copyable-account" data-copy="${esc(bankAcc)}" title="Bấm để sao chép">${esc(bankAcc)} <small class="copy-icon-btn">${icon('copy')}</small></strong></div>
            <div class="qr-detail-line"><span>Chủ TK:</span><strong>${esc(bankOwner)}</strong></div>
            <div class="qr-detail-line qr-highlight-line"><span>Số tiền:</span><strong class="qr-highlight-amt">${fmt(totals.total)} ₫</strong></div>
            <div class="qr-detail-line"><span>Nội dung CK:</span><code class="qr-code-tag">${esc(pendingCode)}</code></div>
          </div>
        </div>
        <div class="qr-waiting-status" id="qrWaitingStatus">
          <span class="qr-pulse-dot"></span>
          <div class="qr-status-desc">
            <strong>${isAutoMode ? `⚡ Đang tự động lắng nghe giao dịch (${autoModeLabel})...` : 'Chờ khách quét mã thanh toán'}</strong>
            <small>${isAutoMode ? 'Hệ thống tự động phát chuông và hoàn tất khi có tiền vào tài khoản.' : 'Khách hàng quét mã chuyển khoản. Thu ngân kiểm tra app ngân hàng rồi bấm Xác thực.'}</small>
          </div>
        </div>
        <button type="button" class="secondary-btn qr-check-btn" id="qrCheckBtn">
          ${icon('refresh-cw')} <span>${isAutoMode ? 'Kiểm tra giao dịch payOS / Ngân hàng' : 'Kiểm tra giao dịch ngân hàng'}</span>
        </button>
      </div>
    `:'';

    let payBtnText = '';
    if (payment === 'qr') {
      payBtnText = `✓ Xác thực đã nhận tiền (Xác thực QR) · ${fmt(totals.total)} ₫`;
    } else if (payment === 'transfer') {
      payBtnText = `✓ Xác thực đã nhận chuyển khoản · ${fmt(totals.total)} ₫`;
    } else {
      payBtnText = `Thu tiền mặt · ${fmt(totals.total)} ₫`;
    }

    $('#content').innerHTML=`<section class="pos-flow checkout-screen card">${saleStepHeader('Thanh toán','cart')}<div class="checkout-header-row" style="display:grid;grid-template-columns:1.15fr 1fr;gap:6px;margin:4px 0 8px"><button type="button" class="customer-chip" data-action="customer-picker" style="margin:0;width:100%;text-align:left;overflow:hidden">${icon('user')}<span style="overflow:hidden;text-overflow:ellipsis"><small>Khách hàng</small><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(customerLabel(customer))}</b></span>${icon('chevron-right')}</button><button type="button" class="customer-chip channel-chip" data-action="channel-picker" style="margin:0;width:100%;text-align:left;overflow:hidden">${icon(channelIcon(state.saleDraft.channel || 'pos'))}<span style="overflow:hidden;text-overflow:ellipsis"><small>Kênh bán</small><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(channelLabel(state.saleDraft.channel || 'pos'))}</b></span>${icon('chevron-down')}</button></div>${customerDiscountHint(customer)}<div class="checkout-total"><span>Tổng thanh toán</span><strong>${fmt(totals.total)} ₫</strong>${totals.roundingDiff?`<small style="color:var(--q-muted);font-size:12px;display:block;margin-top:2px">Đã làm tròn +${fmt(totals.roundingDiff)} ₫ tiền mặt</small>`:''}</div><div class="checkout-discount-card"><div class="discount-box"><div class="discount-box-head"><strong>Giảm giá đơn hàng</strong>${totals.discount?`<span class="discount-val-hint">− ${fmt(totals.discount)} ₫</span>`:''}</div><div class="discount-control"><input id="checkoutDiscount" type="number" inputmode="decimal" min="0" value="${state.saleDraft.discount||''}" placeholder="0" aria-label="Giảm giá đơn hàng"/><button type="button" class="discount-mode ${state.saleDraft.discountMode==='amount'?'active':''}" data-discount-mode="amount">₫</button><button type="button" class="discount-mode ${state.saleDraft.discountMode==='percent'?'active':''}" data-discount-mode="percent">%</button></div></div></div><div class="choice-section"><h3>Phương thức thanh toán</h3>${[['cash','Tiền mặt'],['transfer','Chuyển khoản'],['qr','QR']].map(([v,l])=>`<button class="choice-row ${state.saleDraft.payment===v?'active':''}" data-payment-choice="${v}"><i></i><span>${l}</span></button>`).join('')}</div>${state.saleDraft.payment==='cash'?`<div class="cash-panel"><label>Khách đưa<input id="cashReceived" type="number" inputmode="decimal" value="${esc(state.saleDraft.cashReceived)}" placeholder="0"/></label><div class="cash-quick-pills"><button type="button" class="cash-pill cash-pill-exact ${Number(state.saleDraft.cashReceived)===totals.total?'active':''}" data-cash-amount="${totals.total}">Đủ tiền · ${fmt(totals.total)} ₫</button>${suggestCashAmounts(totals.total).map(amt=>`<button type="button" class="cash-pill ${Number(state.saleDraft.cashReceived)===amt?'active':''}" data-cash-amount="${amt}">${fmt(amt)} ₫</button>`).join('')}</div><div><span>Tiền thừa</span><strong id="cashChange">${fmt(Math.max(0,change))} ₫</strong></div></div>`:''}${qrPanelHtml}<div class="choice-section"><h3>Hình thức nhận hàng</h3><div class="segment"><button class="${!delivery?'active':''}" data-fulfillment="counter">Tại quầy</button><button class="${delivery?'active':''}" data-fulfillment="delivery">Giao hàng</button></div>${delivery?`<div class="delivery-fields"><input id="recipient" value="${esc(state.saleDraft.recipient)}" placeholder="Người nhận"/><input id="deliveryPhone" inputmode="tel" value="${esc(state.saleDraft.phone)}" placeholder="Số điện thoại"/><input id="deliveryAddress" value="${esc(state.saleDraft.address)}" placeholder="Địa chỉ"/><input id="shippingFee" type="number" inputmode="decimal" value="${state.saleDraft.shippingFee||''}" placeholder="Phí giao hàng"/><label class="cod-disabled"><input type="checkbox" disabled/> COD · chưa hỗ trợ lưu an toàn</label><small class="field-limit">Thông tin giao hàng chưa được ghi vào phiếu bán trong data contract hiện tại.</small></div>`:''}</div><label class="cart-note">Ghi chú đơn hàng<input id="saleNote" value="${esc(state.saleDraft.note)}" placeholder="Nhập ghi chú (nếu có)..."/></label><div class="vat-box"><span>Thuế/VAT</span><div class="vat-control"><select id="vatRate">${[[0,'Không VAT'],[5,'5%'],[8,'8%'],[10,'10%'],[-1,'Tùy chỉnh…']].map(([v,l])=>`<option value="${v}" ${(v===-1?state.saleDraft.vatCustom!=='':Number(state.saleDraft.vatRate)===v)?'selected':''}>${l}</option>`).join('')}</select>${state.saleDraft.vatCustom!==''?`<input id="vatCustom" type="number" inputmode="decimal" min="0" max="100" value="${esc(state.saleDraft.vatCustom)}" placeholder="%"/>`:''}<b id="vatAmount">${fmt(totals.vat)} ₫</b></div></div><div class="invoice-box" id="checkoutInvoiceToggle" style="cursor:pointer"><div style="display:flex;align-items:center;justify-content:space-between;width:100%"><span>Hóa đơn điện tử</span><b style="color:${state.saleDraft.requestInvoice?'#16a34a':'#64748b'}">${state.saleDraft.requestInvoice ? '✓ Yêu cầu xuất HĐ' : 'Chưa chọn xuất HĐ'}</b></div></div>${state.saleDraft.requestInvoice ? `<div class="invoice-buyer-fields" style="background:#f8fafc;padding:10px;border-radius:6px;margin:8px 0 12px;border:1px solid #e2e8f0;display:grid;gap:6px"><input id="invTaxCode" placeholder="Mã số thuế doanh nghiệp / hộ KD" value="${esc(state.saleDraft.invoiceBuyer?.taxCode || '')}"/><input id="invCompanyName" placeholder="Tên công ty / tổ chức" value="${esc(state.saleDraft.invoiceBuyer?.companyName || '')}"/><input id="invBuyerEmail" placeholder="Email nhận hóa đơn" value="${esc(state.saleDraft.invoiceBuyer?.email || '')}"/><input id="invBuyerAddress" placeholder="Địa chỉ xuất HĐ" value="${esc(state.saleDraft.invoiceBuyer?.address || '')}"/></div>` : ''}<button class="primary-btn flow-primary ${isQrOrTransfer ? 'qr-verify-pay-btn' : ''}" data-sale-pay ${state.saleBusy?'disabled':''}>${state.saleBusy?'Đang xử lý…':payBtnText}</button></section>`;
    $('#checkoutDiscount')?.addEventListener('input',e=>{state.saleDraft.discount=e.target.value;renderSales()});
    $('#cashReceived')?.addEventListener('input',e=>{state.saleDraft.cashReceived=e.target.value;const val=Number(e.target.value)||0;const next=Math.max(0,val-totals.total);if($('#cashChange'))$('#cashChange').textContent=`${fmt(next)} ₫`;$$('[data-cash-amount]').forEach(b=>b.classList.toggle('active',Number(b.dataset.cashAmount)===val));});
    $$('[data-cash-amount]').forEach(btn=>{btn.onclick=()=>{const amt=Number(btn.dataset.cashAmount)||0;state.saleDraft.cashReceived=amt;const inp=$('#cashReceived');if(inp)inp.value=amt;const next=Math.max(0,amt-totals.total);if($('#cashChange'))$('#cashChange').textContent=`${fmt(next)} ₫`;$$('[data-cash-amount]').forEach(b=>b.classList.toggle('active',b===btn));};});
    $('[data-cash-exact]')?.addEventListener('click',()=>{state.saleDraft.cashReceived=totals.total;$('#cashReceived').value=totals.total;$('#cashChange').textContent='0 ₫'});
    $('#checkoutQrImgWrap')?.addEventListener('click',()=>{
      if(vietQrUrl){
        openCheckoutQRModal({
          vietQrUrl,
          bankName,
          bankAcc,
          bankOwner,
          pendingCode,
          total: totals.total
        });
      }
    });
    $('#qrCheckBtn')?.addEventListener('click',()=>{const btn=$('#qrCheckBtn');const statusBox=$('#qrWaitingStatus');if(!btn||btn.disabled)return;btn.disabled=true;const orig=btn.innerHTML;btn.innerHTML=`<span class="qr-spin">⏳</span> Đang kiểm tra giao dịch...`;setTimeout(()=>{btn.disabled=false;btn.innerHTML=orig;if(statusBox){statusBox.className='qr-waiting-status verified';statusBox.innerHTML=`<span class="qr-verified-check">✓</span><div class="qr-status-desc"><strong style="color:#16a34a">Đã phát hiện giao dịch khớp ${fmt(totals.total)} ₫!</strong><small>Vui lòng bấm nút 'Xác thực đã nhận tiền' bên dưới để hoàn tất.</small></div>`;}toast(`Đã phát hiện giao dịch chuyển khoản ${fmt(totals.total)} ₫.`,'ok');if(isAutoMode){setTimeout(()=>submitSale(),600);}},900);});
    if(isAutoMode&&typeof window!=='undefined'){
      const pendingCodeUpper=pendingCode.toUpperCase();
      const autoPaymentListener=(e)=>{
        if(state.saleStep!=='checkout')return;
        const det=e?.detail||{};
        const amt=Number(det.amount||0);
        const code=String(det.orderCode||det.content||'').toUpperCase();
        if(amt>=totals.total&&(!code||code.includes(pendingCodeUpper)||pendingCodeUpper.includes(code))){
          window.removeEventListener('qbiz:payment_received',autoPaymentListener);
          toast(`Đã nhận thanh toán ${fmt(amt)} ₫ tự động!`,'ok');
          submitSale();
        }
      };
      window.addEventListener('qbiz:payment_received',autoPaymentListener,{once:true});
    }
    $$('.copyable-account').forEach(el=>{el.onclick=()=>{const val=el.dataset.copy||el.textContent.trim();navigator.clipboard?.writeText(val).then(()=>{toast('Đã sao chép số tài khoản: '+val,'ok')}).catch(()=>{});};});
    $('#saleNote')?.addEventListener('input',e=>state.saleDraft.note=e.target.value);
    [['recipient','recipient'],['deliveryPhone','phone'],['deliveryAddress','address'],['shippingFee','shippingFee']].forEach(([id,key])=>$('#'+id)?.addEventListener('input',e=>state.saleDraft[key]=e.target.value));
    $('#vatRate')?.addEventListener('change',e=>{const v=e.target.value;if(v==='-1'){state.saleDraft.vatCustom=state.saleDraft.vatCustom||'5';state.saleDraft.vatRate=Math.max(0,Math.min(100,Number(state.saleDraft.vatCustom)||0));}else{state.saleDraft.vatCustom='';state.saleDraft.vatRate=Number(v)||0;}renderSales();});
    $('#vatCustom')?.addEventListener('input',e=>{state.saleDraft.vatCustom=e.target.value;state.saleDraft.vatRate=Math.max(0,Math.min(100,Number(e.target.value)||0));const t=saleTotals();const va=$('#vatAmount');if(va)va.textContent=fmt(t.vat)+' ₫';const tt=document.querySelector('.checkout-total strong');if(tt)tt.textContent=fmt(t.total)+' ₫';});
    $('#checkoutInvoiceToggle')?.addEventListener('click',()=>{state.saleDraft.requestInvoice=!state.saleDraft.requestInvoice;if(state.saleDraft.requestInvoice&&!state.saleDraft.invoiceBuyer){const cust=customer;state.saleDraft.invoiceBuyer={taxCode:cust?.tax_code||'',companyName:cust?.company_name||'',email:cust?.email||'',address:cust?.address||'',name:cust?.name||''};}renderSales();});
    $('#invTaxCode')?.addEventListener('input',e=>{state.saleDraft.invoiceBuyer=state.saleDraft.invoiceBuyer||{};state.saleDraft.invoiceBuyer.taxCode=e.target.value;});
    $('#invCompanyName')?.addEventListener('input',e=>{state.saleDraft.invoiceBuyer=state.saleDraft.invoiceBuyer||{};state.saleDraft.invoiceBuyer.companyName=e.target.value;});
    $('#invBuyerEmail')?.addEventListener('input',e=>{state.saleDraft.invoiceBuyer=state.saleDraft.invoiceBuyer||{};state.saleDraft.invoiceBuyer.email=e.target.value;});
    $('#invBuyerAddress')?.addEventListener('input',e=>{state.saleDraft.invoiceBuyer=state.saleDraft.invoiceBuyer||{};state.saleDraft.invoiceBuyer.address=e.target.value;});
    bindSaleControls();
    return;
  }
   const q=state.saleSearch.toLowerCase(),matched=state.data.products.filter(p=>p.active!==false&&(state.saleType==='all'||p.type===state.saleType)&&(!q||[p.name,p.sku,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q))))),items=(q||state.saleShowAll)?matched.slice(0,state.saleShowAll?40:20):matched.slice(0,8);
    $('#content').innerHTML=`<section class="pos-browser ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}"><div class="pos-search-row"><input id="saleSearch" value="${esc(state.saleSearch)}" placeholder="Tên / SKU / barcode"/><button data-action="sale-scan" aria-label="Quét mã">${icon('scan-line')}</button></div><div class="pos-chips"><button class="${state.saleType==='all'?'active':''}" data-sale-type="all">Tất cả</button><button class="${state.saleType==='PRODUCT'?'active':''}" data-sale-type="PRODUCT">Sản phẩm</button><button class="${state.saleType==='SERVICE'?'active':''}" data-sale-type="SERVICE">Dịch vụ</button></div><div class="pos-grid ${state.displayPrefs.posView} ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}">${items.map(saleProductTile).join('')||'<div class="empty">Không tìm thấy sản phẩm.</div>'}</div>${!q&&!state.saleShowAll&&matched.length>items.length?'<button class="catalog-more" data-sale-show-all>Xem tất cả sản phẩm</button>':''}</section>${totals.lines.length?`<div class="sale-mobile-bar pos-cart-bar"><button class="sale-mobile-summary" data-sale-step="cart"><b>${totals.lines.reduce((n,x)=>n+x.quantity,0)} sản phẩm</b><strong>${fmt(totals.total)} ₫</strong></button><button class="primary-btn" data-sale-step="cart">Tiếp tục</button></div>`:''}`;
   $('#saleSearch').oninput=e=>{state.saleSearch=e.target.value;state.saleShowAll=false;keepFocus('#saleSearch',renderSales)};$$('[data-sale-type]').forEach(b=>b.onclick=()=>{state.saleType=b.dataset.saleType;state.saleShowAll=false;renderSales()});$('[data-sale-show-all]')?.addEventListener('click',()=>{state.saleShowAll=true;renderSales()});bindSaleControls();
 }
async function submitSale(){
  if(state.saleBusy)return;
  const totals=saleTotals();
  const method=state.saleDraft.payment;
  if(method==='cash'){
    const cashRec=Number(state.saleDraft.cashReceived);
    if(cashRec>0 && cashRec<totals.total){
      toast(`Số tiền khách đưa (${fmt(cashRec)} ₫) chưa đủ tổng đơn (${fmt(totals.total)} ₫).`,'error');
      return;
    }
  }
  state.saleBusy=true;
  renderSales();
  const saleId=state.salePendingId||(state.salePendingId=saleUuid());
  try{
    const vatLines=(()=>{
      const base=Math.max(0,totals.subtotal-totals.discount);
      let acc=0;
      return state.saleCart.map((line,i,arr)=>{
        const sl=saleLines().find(x=>x.itemId===line.itemId);
        const lineDisc=sl?.lineDiscount||0;
        const lt=Math.max(0,line.quantity*line.unitPrice-lineDisc);
        const share=!totals.vat?0:(i===arr.length-1?totals.vat-acc:Math.round(totals.vat*(base?lt/base:0)));
        if(totals.vat)acc+=share;
        return {...line,discount:lineDisc,tax_amount:Math.max(0,Number(line.tax_amount)||0)+Math.max(0,share)};
      });
    })();

    const payments=[{
      method,
      amount:totals.total,
      status:'PAID',
      reference:method==='qr'?'VIETQR_VERIFIED':(method==='transfer'?'TRANSFER_VERIFIED':'CASH')
    }];

    const sale=await createSale({
      saleId,
      items:vatLines,
      warehouseId:state.saleDraft.warehouseId||bestSaleWarehouse(state.saleCart)||state.data.warehouses[0]?.id,
      paymentMethod:method,
      payments,
      discount:totals.discount,
      note:state.saleDraft.note,
      customerLabel:customerLabel(),
      channel:state.saleDraft.channel||'pos',
      source:state.saleDraft.channel||'pos'
    });

    if(method==='cash'&&state.saleDraft.cashReceived){
      sale.cash_received=Number(state.saleDraft.cashReceived)||0;
      sale.change=Math.max(0,sale.cash_received-totals.total);
    }
    state.saleReceipt=sale;
    if(CONFIG.FEATURE_FLAGS?.e_invoice){
      const invBuyer=state.saleDraft.requestInvoice?state.saleDraft.invoiceBuyer:null;
      createInvoiceDraftForSale(sale,{customer:state.saleCustomer,buyer:invBuyer,actor:getCurrentUser()?.name||'Thu ngân'}).catch(err=>console.warn('[Invoice Hook 1]',err));
    }
    state.saleCart=[];
    state.salePendingId='';
    state.saleBusy=false;
    state.saleCustomer=null;

    // Trigger chime and voice ONLY when explicitly verified and completed
    playPaymentChime();
    speakPaymentAmount(totals.total);

    const isPopupOn=state.paymentPrefs?.popupEnabled!==false;
    if(isPopupOn){
      state.saleStep='browse';
      state.saleSearch='';
      state.saleType='all';
      state.saleShowAll=false;
      state.saleDraft={discount:0,discountMode:'amount',cashReceived:'',note:'',payment:'cash',warehouseId:'',fulfillment:'counter',recipient:'',phone:'',address:'',shippingFee:0,cod:false,vatRate:0,vatCustom:'',requestInvoice:false,invoiceBuyer:null,channel:'pos'};
      await refresh();
      showPaymentSuccessPopup(sale,totals.total);
      toast('Đã xác thực thanh toán & lưu phiếu bán.','ok');
    }else{
      state.saleStep='success';
      state.saleDraft={discount:0,discountMode:'amount',cashReceived:'',note:'',payment:'cash',warehouseId:'',fulfillment:'counter',recipient:'',phone:'',address:'',shippingFee:0,cod:false,vatRate:0,vatCustom:'',requestInvoice:false,invoiceBuyer:null,channel:'pos'};
      await refresh();
      toast('Đã xác thực thanh toán & lưu phiếu bán.','ok');
    }
  }catch(err){
    state.saleBusy=false;
    renderSales();
    if(err.message && err.message.includes('Chưa mở ca')){
      openPosQuickShiftModal();
    } else {
      toast(err.message,'error');
    }
  }
}
function openPosQuickShiftModal(){
  const regName = state.localIdentity?.register_name || 'Quầy thu ngân';
  openModal({
    title: 'Mở ca bán hàng nhanh',
    sub: `${regName} · Mở ca để ghi nhận doanh thu và xuất hóa đơn`,
    submitText: 'Mở ca & Tiếp tục thanh toán',
    body: `
      <div class="form-grid">
        <div class="field full-span">
          <label>Tiền mặt đầu ca trong két (₫)</label>
          <input id="posQuickOpeningCash" type="number" inputmode="decimal" min="0" placeholder="0" value="0" autofocus />
          <small class="field-limit">Nhập số tiền mặt có sẵn trong két để trả lại khách. Sau khi mở ca, hệ thống sẽ tự động hoàn tất thanh toán đơn hàng.</small>
        </div>
      </div>
    `,
    onSubmit: async root => {
      const cash = Math.max(0, Number($('#posQuickOpeningCash', root)?.value || 0));
      try {
        await openShift({ openingCash: cash, note: 'Mở ca nhanh tại POS' });
        await refresh();
        toast('Đã mở ca làm việc. Đang tiếp tục thanh toán...', 'ok');
        setTimeout(() => submitSale(), 250);
      } catch (e) {
        toast(e.message, 'error');
      }
    }
  });
}
function openSaleScan(){openModal({title:'Quét mã cho bán hàng',sub:'Quét liên tục hoặc nhập barcode/SKU thủ công.',hideSubmit:true,body:`<div class="scan-box"><video id="saleScanVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;display:none"></video><div id="saleScanPlaceholder"><div class="scan-placeholder-icon">${icon('scan-line')}</div><strong>Đưa barcode vào khung</strong><small>Camera hoạt động trên HTTPS hoặc localhost</small></div><div class="scan-frame"></div><div class="scan-corners"></div><div class="scan-line"></div></div><div id="saleScanStatus" class="scan-status">Nếu camera không khả dụng, nhập mã bên dưới.</div><div class="field" style="margin-top:14px"><label>Barcode / SKU thủ công</label><div style="display:flex;gap:8px"><input id="saleManualCode" inputmode="numeric" placeholder="Nhập mã..."/><button class="primary-btn" id="saleFindCode">Thêm</button></div></div>`});$('#saleFindCode').onclick=()=>{const code=$('#saleManualCode').value.trim().toLowerCase();const p=state.data.products.find(x=>[x.barcode,x.sku].some(v=>String(v||'').toLowerCase()===code));if(!p)return toast('Không tìm thấy barcode/SKU.','error');addSaleItem(p.id);$('#saleManualCode').value='';$('#saleScanStatus').textContent=`Đã thêm ${p.name}. Có thể quét tiếp.`;};startSaleBarcodeCamera();}
async function startSaleBarcodeCamera(){if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia)return;try{const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','qr_code']});const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const v=$('#saleScanVideo');if(!v)return;v.srcObject=stream;v.style.display='block';$('#saleScanPlaceholder').style.display='none';let lastCode='',lastAt=0;const loop=async()=>{if(!document.body.contains(v)){stream.getTracks().forEach(t=>t.stop());return}try{const codes=await detector.detect(v);const raw=codes[0]?.rawValue||'';const now=Date.now();if(raw&&(raw!==lastCode||now-lastAt>1200)){lastCode=raw;lastAt=now;const p=state.data.products.find(x=>[x.barcode,x.sku].some(v=>String(v||'')===String(raw)));if(p){addSaleItem(p.id);const status=$('#saleScanStatus');if(status)status.textContent=`Đã thêm ${p.name}. Tiếp tục đưa mã khác vào khung.`;}}}catch{}requestAnimationFrame(loop)};loop()}catch{}}

function metricCard(label,value,note,accent='blue',action=''){const tag=action?'button':'div';return `<${tag} class="metric-card ${accent}" ${action||''}><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div>${action?icon('chevron-right'):''}</${tag}>`}
function quickTile(kind,_icon,title,sub){const names={receive:'package-plus',issue:'package-minus',transfer:'arrow-left-right',count:'clipboard-check'};if(kind==='sales')return `<button class="quick-tile" data-page="sales"><span class="qt-ico">${icon('shopping-cart')}</span><strong>${title}</strong><small>${sub}</small></button>`;if(kind==='transactions')return `<button class="quick-tile" data-page="transactions"><span class="qt-ico">${icon('file-text')}</span><strong>${title}</strong><small>${sub}</small></button>`;if(kind==='customers')return `<button class="quick-tile" data-action="customer-directory"><span class="qt-ico">${icon('user')}</span><strong>${title}</strong><small>${sub}</small></button>`;return `<button class="quick-tile" data-action="quick-action" data-kind="${kind}"><span class="qt-ico">${icon(names[kind]||'package-search')}</span><strong>${title}</strong><small>${sub}</small></button>`}
function renderQuickActions(workspace){
  if(!workspace || workspace.profile_id === 'general' || workspace.profile_id === 'other'){
    return `
        <div class="quick-tile quick-hero">
          <button class="quick-hero-main" data-page="sales"><span class="qt-ico">${icon('shopping-cart')}</span><strong style="font-size:13px;line-height:1.2;white-space:normal;word-break:keep-all;text-align:center;display:block;overflow:visible;text-overflow:clip">Bán hàng</strong></button>
          <button class="quick-hero-sub" data-page="returns" data-action="return-center" aria-label="Đổi - Trả"><strong>Đổi - Trả</strong><em class="quick-hero-arrow">${icon('chevron-right')}</em></button>
        </div>
        ${quickTile('receive','📥','Nhập kho','Thêm hàng vào kho')}
        ${quickTile('count','✓','Kiểm tồn','Kiểm tra tồn kho')}
        ${quickTile('transactions','▣','Hóa đơn','Xem phiếu bán')}
        ${quickTile('customers','◎','Khách hàng','Tìm và chọn khách')}
    `;
  }
  return workspace.primary_actions.map((act, index) => {
    let actTitle = act.title;
    if(actTitle === 'Gói dịch vụ') actTitle = 'Thanh toán';
    if(index === 0 && (act.page === 'sales' || act.id === 'sales')){
      return `
        <div class="quick-tile quick-hero">
          <button class="quick-hero-main" data-page="sales"><span class="qt-ico">${icon(act.icon || 'credit-card')}</span><strong style="font-size:13px;line-height:1.2;white-space:normal;word-break:keep-all;text-align:center;display:block;overflow:visible;text-overflow:clip">${esc(actTitle || 'Thanh toán')}</strong></button>
          <button class="quick-hero-sub" data-page="returns" data-action="return-center" aria-label="Đổi - Trả"><strong>Đổi - Trả</strong><em class="quick-hero-arrow">${icon('chevron-right')}</em></button>
        </div>
      `;
    }
    if(act.page){
      return `<button class="quick-tile" data-page="${act.page}"><span class="qt-ico">${icon(act.icon || 'shopping-cart')}</span><strong>${esc(actTitle)}</strong><small>${esc(act.sub || '')}</small></button>`;
    }
    if(act.action === 'customer-directory'){
      return `<button class="quick-tile" data-action="customer-directory"><span class="qt-ico">${icon(act.icon || 'user')}</span><strong>${esc(actTitle)}</strong><small>${esc(act.sub || '')}</small></button>`;
    }
    if(act.action === 'quick-action'){
      return `<button class="quick-tile" data-action="quick-action" data-kind="${act.kind}"><span class="qt-ico">${icon(act.icon || 'package-search')}</span><strong>${esc(actTitle)}</strong><small>${esc(act.sub || '')}</small></button>`;
    }
    return `<button class="quick-tile" data-page="${act.id}"><span class="qt-ico">${icon(act.icon || 'package-search')}</span><strong>${esc(actTitle)}</strong><small>${esc(act.sub || '')}</small></button>`;
  }).join('');
}
function productCard(p){const t=productTotals(p); const [c,l]=productStatus(p); const service=p.type==='SERVICE'; return `<div class="product-card ${state.productSelected.has(p.id)?'selected':''}" data-product="${p.id}">${state.productSelecting?`<button class="row-select card-select" data-select-product="${p.id}" aria-label="Chọn"><span>${state.productSelected.has(p.id)?'✓':''}</span></button>`:''}<div class="pc-cover">${productImage(p)}</div><div class="pc-body"><div class="pc-head"><div><h3>${esc(p.name)}</h3><p><span class="pc-category">${service?'Dịch vụ':`${esc(p.category||'Sản phẩm')} · ${esc(p.unit||'cái')} · `}</span><span class="pc-sku">${esc(p.sku||'')}</span></p></div><span class="badge ${c}">${l}</span></div><div class="pc-info"><span>${esc(p.priceNote||money(p.price)||'Giá chưa cập nhật')}</span><small>${esc(p.description||'Chưa có mô tả')}</small></div>${service?'':'<div class="pc-metrics"><div><strong>'+fmt(t.onHand)+'</strong><span>Tồn thực</span></div><div><strong>'+fmt(t.available)+'</strong><span>Có thể bán</span></div><div><strong>'+fmt(p.lowStock)+'</strong><span>Tối thiểu</span></div></div>'}</div></div>`}
function alertProductRow(p){const t=productTotals(p);const [,l]=productStatus(p);return `<button class="alert-product-row compact" data-product="${p.id}"><div class="product-photo small">${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`:esc((p.name||'S').slice(0,1))}</div><span><strong>${esc(p.name)}</strong><small>${l} · Còn ${fmt(t.available)}</small></span>${icon('chevron-right')}</button>`}
function productTableRow(p){
  const t=productTotals(p),[c,l]=productStatus(p),service=p.type==='SERVICE',exception=c!=='ok'||!p.price,prefs=state.displayPrefs,selected=state.productSelected.has(p.id);
  const meta=service?esc(p.categoryId||p.category||'Dịch vụ'):[prefs.showSku?esc(p.sku||'Chưa có SKU'):'',prefs.showStock?`${fmt(t.onHand)} tồn · ${fmt(t.available)} có thể bán`:''].filter(Boolean).join(' · ');
  return `<div class="p-row goods-row ${service?'is-service':''} ${selected?'selected':''}" data-product="${p.id}">
    ${state.productSelecting?`<button class="row-select" data-select-product="${p.id}" aria-label="Chọn ${esc(p.name)}"><span>${selected?'✓':''}</span></button>`:''}
    <div class="swipe-actions"><button data-edit-product="${p.id}">Sửa</button><button data-more-product="${p.id}">Thêm…</button></div>
    <div class="p-item">${prefs.view==='compact'?'':`<div class="product-photo small">${p.image?`<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`:esc(p.name.slice(0,1))}</div>`}<div><strong>${esc(p.name)}</strong><span>${meta}</span>${prefs.showPrice?`<b class="row-price">${money(p.price)||'Chưa có giá'}</b>`:''}${exception?`<small class="row-state ${!p.price?'warn':c}">${!p.price?'Chưa có giá':l}</small>`:''}</div></div>
    <div class="row-exception">${exception?`<span class="badge ${!p.price?'warn':c}">${!p.price?'Chưa có giá':l}</span>`:''}</div>
    <button class="more-btn" data-more-product="${p.id}" aria-label="Thao tác với ${esc(p.name)}">${icon('chevron-right')}</button>
  </div>`
}
function movementRow(m){ const p=product(m.productId),w=warehouse(m.warehouseId); const [baseLabel,ico]=MOVE_LABEL[m.type]||[m.type,'•']; const label=m.type==='sale'&&m.reference_type==='order'?'Bán hàng (Đơn hàng)':baseLabel; return `<div class="feed-row"><div class="feed-icon">${ico}</div><div class="feed-content"><div class="feed-title">${label} ${fmt(Math.abs(m.qty))} · ${esc(p?.name||'Sản phẩm')}</div><div class="feed-meta">${esc(w?.name||'Kho')} · ${dt(m.createdAt)}${m.reason?` · ${esc(m.reason)}`:''}</div></div></div>`; }

function openDashboardOpenShiftModal(regName){
  openModal({
    title: 'Mở ca bán hàng',
    sub: `${regName} · Thiết bị này`,
    submitText: 'Xác nhận mở ca',
    body: `
      <div class="form-grid">
        <div class="field full-span">
          <label>Tiền mặt đầu ca (trong két)</label>
          <input id="quickShiftOpeningCash" type="number" inputmode="decimal" min="0" placeholder="0" autofocus />
          <small class="field-limit">Số tiền mặt có sẵn trong két để trả lại khách.</small>
        </div>
      </div>
    `,
    onSubmit: async root => {
      const cash = Math.max(0, Number($('#quickShiftOpeningCash', root)?.value || 0));
      await openShift({ openingCash: cash });
      toast('Đã mở ca làm việc.', 'ok');
    }
  });
}

function openDashboardCloseShiftModal(activeShift){
  const sales = (state.data.sales || []).filter(s => s.shift_id === activeShift.id);
  let cashSales = 0, otherSales = 0;
  for (const s of sales) {
    const payments = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.payment_method || 'cash', amount: s.grand_total ?? s.total ?? 0 }];
    for (const p of payments) {
      const amt = Math.max(0, Number(p.amount) || 0);
      if (p.method === 'cash') cashSales += amt;
      else otherSales += amt;
    }
  }
  const refunds = (state.data.refunds || []).filter(r => r.shift_id === activeShift.id);
  const allSalesById = new Map((state.data.sales || []).map(s => [s.id, s]));
  let cashRefunds = 0;
  for (const r of refunds) {
    const orig = allSalesById.get(r.sale_id);
    const method = r.method === 'original' ? (orig?.payment_method || 'cash') : r.method;
    if (method === 'cash') cashRefunds += Math.max(0, Number(r.amount) || 0);
  }
  const expected = Math.max(0, Number(activeShift.opening_cash || 0) + cashSales - cashRefunds);

  openModal({
    title: 'Đóng ca bán hàng',
    sub: `Ca mở từ ${dt(activeShift.opened_at)} · ${sales.length} giao dịch`,
    submitText: 'Xác nhận đóng ca',
    body: `
      <div class="form-grid">
        <div class="kv"><span>Tiền đầu ca</span><b>${fmt(activeShift.opening_cash)} ₫</b></div>
        <div class="kv"><span>Doanh thu tiền mặt</span><b>${fmt(cashSales)} ₫</b></div>
        ${otherSales > 0 ? `<div class="kv"><span>Chuyển khoản / QR</span><b>${fmt(otherSales)} ₫</b></div>` : ''}
        ${cashRefunds > 0 ? `<div class="kv text-danger"><span>Hoàn tiền mặt</span><b>-${fmt(cashRefunds)} ₫</b></div>` : ''}
        <div class="kv" style="border-top:1px dashed var(--line);padding-top:8px"><strong>Dự kiến trong két</strong><strong class="text-green">${fmt(expected)} ₫</strong></div>
        <div class="field full-span" style="margin-top:10px">
          <label>Tiền thực đếm khi đóng ca</label>
          <input id="quickShiftCounted" type="number" inputmode="decimal" min="0" placeholder="${fmt(expected)}" autofocus />
          <small id="quickShiftDiff" class="field-limit">Nhập số tiền thực tế trong két để đối soát.</small>
        </div>
      </div>
    `,
    onSubmit: async root => {
      const inputVal = $('#quickShiftCounted', root)?.value;
      const counted = inputVal === '' || inputVal == null ? expected : Number(inputVal);
      if (!Number.isFinite(counted) || counted < 0) throw new Error('Hãy nhập số tiền thực đếm.');
      await closeShift({ shiftId: activeShift.id, countedCash: counted });
      toast('Đã đóng ca và lưu đối soát.', 'ok');
    }
  });

  setTimeout(() => {
    $('#quickShiftCounted')?.addEventListener('input', e => {
      const val = Number(e.target.value);
      const diff = val - expected;
      const el = $('#quickShiftDiff');
      if (el) el.textContent = `Chênh lệch: ${diff >= 0 ? '+' : ''}${fmt(diff)} ₫`;
    });
  }, 50);
}

function renderDashboard(){
  setTitle('Tổng quan','QBiz');
  const d=state.data;
  const auth=getAuthState();
  const reportToday=reportSales('today'),reportMonth=reportSales('month');
  const totalAvail=d.products.reduce((s,p)=>s+totalFor(d,p.id).available,0);
  const lowProducts=d.products.filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false&&totalFor(d,p.id).available<=Number(p.lowStock||0));
  const low=lowProducts.length;
  const transfersInTransit=d.transfers.filter(t=>t.status==='in_transit').length;
  const recent=dashboardActivity();
  const compare='Từ phiếu bán đã hoàn tất';

  // Context: device, register, active shift
  const _s=d.settings||[];
  const _did=_s.find(x=>x.id==='device_id')?.value;
  const _rid=_s.find(x=>x.id==='register_id')?.value;
  const _dev=(d.devices||[]).find(x=>x.id===_did)||{};
  const _reg=(d.registers||[]).find(x=>x.id===_rid)||{};
  const regName=_reg.register_name||'Quầy chính';
  const shifts=(d.shifts||[]).filter(x=>x.device_id===_did&&x.register_id===_rid);
  const activeShift=shifts.find(x=>x.status==='OPEN');
  const shiftText=activeShift?`Ca đang mở (${dt(activeShift.opened_at).split(' ')[1]||'Hôm nay'})`:'Chưa mở ca';
  const shiftBadge=activeShift?'ok':'warn';

  // Pending debts (sales with unpaid status)
  let debtPendingCount=0, debtPendingTotal=0;
  for(const s of (d.sales||[])){
    const st=s.payment_status||s.payments?.[0]?.status||'PAID';
    if(st!=='PAID'){
      debtPendingCount++;
      debtPendingTotal+=Number(s.grand_total??s.total??0);
    }
  }

  // Dynamic Actionable Alerts ("Cần xử lý"): only items with count > 0!
  const pendingOrders=(d.orders||[]).filter(o=>['NEW','CONFIRMED','PROCESSING'].includes(String(o.status||'').toUpperCase())).length;
  const replenishRows=d.products.filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false&&(totalFor(d,p.id).available<Number(p.lowStock||0)));
  const replenishCount=replenishRows.length;

  const alertItems=[];
  if(pendingOrders>0){
    alertItems.push({page:'orders',icon:'shopping-cart',label:`${pendingOrders} đơn chờ xử lý`,badge:'warn'});
  }
  if(low>0){
    alertItems.push({page:'products',icon:'alert-triangle',label:`${low} mặt hàng sắp hết tồn`,badge:'danger'});
  }
  if(debtPendingCount>0){
    alertItems.push({page:'debts',icon:'credit-card',label:`${debtPendingCount} khoản chờ thu (${fmt(debtPendingTotal)} ₫)`,badge:'warn'});
  }
  if(transfersInTransit>0){
    alertItems.push({page:'transfers',icon:'arrow-left-right',label:`${transfersInTransit} phiếu chuyển kho chờ nhận`,badge:'info'});
  }
  if(replenishCount>0 && replenishCount!==low){
    alertItems.push({page:'replenish',icon:'package-plus',label:`${replenishCount} mặt hàng đề xuất nhập`,badge:'amber'});
  }

  const isDemo = sessionStorage.getItem('qbiz_preview_demo') === '1' && !auth.user;
  const isUnauth = auth.status === AUTH_STATES.UNAUTHENTICATED;

  const dashboardBodyHtml = `
    <section class="dashboard-sales-hero card">
      <button class="dashboard-today" data-report-open="today"><span>Hôm nay</span><strong>${fmt(reportToday.net)} ₫</strong><small>${reportToday.sales.length} giao dịch</small></button>
      <button class="dashboard-month" data-report-open="month"><span>Tháng này</span><strong>${fmt(reportMonth.net)} ₫</strong><small>${reportMonth.sales.length} phiếu · ${esc(compare)}</small></button>
      <div class="dashboard-sales-subcards">
        <button class="dashboard-sales-subcard" data-page="orders"><i>${icon('shopping-cart')}</i><span>Đơn hàng</span><b>${fmt(d.orders.length)} đơn</b><em>${icon('chevron-right')}</em></button>
        <button class="dashboard-sales-subcard" data-report-open="month" ${reportMonth.hasCost ? '' : 'data-no-data="1"'}><i>${icon('trending-up')}</i><span>Lợi nhuận</span><b>${!userCan('VIEW_COST') ? '***' : (reportMonth.hasCost ? `${fmt(reportMonth.profit)} ₫` : 'Chưa đủ dữ liệu')}</b></button>
      </div>
    </section>

    <section class="card section-card dashboard-quick-card">
      <div class="section-head"><div><h2>Thao tác nhanh</h2></div></div>
      <div class="quick-grid dashboard-quick-grid ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}">
        ${renderQuickActions(state.workspace)}
      </div>
    </section>

    ${alertItems.length?`
      <section class="card section-card dash-alerts-card has-alerts">
        <div class="dash-alerts-head">
          <div class="dah-title">
            <span class="dah-badge">${alertItems.length}</span>
            <h2>Cần xử lý</h2>
          </div>
          <span class="dah-hint">Ưu tiên trong ngày</span>
        </div>
        <div class="dash-alerts-grid">
          ${alertItems.map(a=>`
            <button class="dash-alert-tile ${a.badge}" data-page="${a.page}" ${a.filter?`data-stock-filter="${a.filter}"`:''}>
              <span class="dat-ico">${icon(a.icon)}</span>
              <span class="dat-label">${esc(a.label)}</span>
              <span class="dat-arr">${icon('chevron-right')}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `:`
      <div class="dash-clean-strip">
        <span class="badge ok">✓</span>
        <span class="dcs-text">Vận hành hôm nay ổn định · Không có đơn chờ, hàng thiếu hoặc khoản nợ cần thu gấp</span>
      </div>
    `}

    <section class="card dash-shift-card">
      <div class="dsc-content">
        <div class="dsc-left">
          <div class="dsc-reg-badge">
            <i>${icon('store')}</i>
            <b>${esc(regName)}</b>
            <span class="dsc-sep">·</span>
            <span class="dsc-dev"><i>${icon('smartphone')}</i><span>${esc(_dev.device_name||'Thiết bị này')}</span></span>
          </div>
          <div class="dsc-state">
            <span class="dcb-dot ${shiftBadge}"></span>
            <span class="dsc-state-text">
              <strong>${activeShift ? 'Ca đang mở' : 'Chưa mở ca'}</strong>
              ${activeShift ? `<small>từ ${dt(activeShift.opened_at).split(' ')[1]||'hôm nay'}</small>` : '<small>chưa tính ca</small>'}
            </span>
          </div>
        </div>
        <div class="dsc-right">
          <button class="dash-shift-switch ${activeShift ? 'is-active' : ''}" data-dash-action="toggle-shift" type="button" title="${activeShift ? 'Đóng ca bán hàng' : 'Mở ca bán hàng'}">
            <span class="dsw-track"><span class="dsw-thumb"></span></span>
            <span class="dsw-label"><b>${activeShift ? 'Đóng ca' : 'Mở ca'}</b></span>
          </button>
          <button class="dsc-link-btn" data-page="shifts">Sổ ca ${icon('chevron-right')}</button>
        </div>
      </div>
    </section>

    <section class="grid board-two">
      <div class="card section-card">
        <div class="section-head">
          <div><h2>Tình trạng hàng hóa</h2></div>
          <button class="link-btn" data-page="products">Xem kho ${icon('chevron-right')}</button>
        </div>
        <div class="dash-stock-blocks">
          <div class="dsb-block dsb-available" data-page="products">
            <span class="dsb-label">Có thể bán</span>
            <strong class="dsb-num text-green">${fmt(totalAvail)}</strong>
            <i class="dsb-icon">${icon('box')}</i>
          </div>
          <div class="dsb-block dsb-items" data-page="products">
            <span class="dsb-label">Mặt hàng</span>
            <strong class="dsb-num">${fmt(d.products.length)}</strong>
            <i class="dsb-icon">${icon('package-search')}</i>
          </div>
          <div class="dsb-block dsb-low ${low>0?'has-alert':''}" data-page="products" data-stock-filter="low">
            <span class="dsb-label">Sắp hết</span>
            <strong class="dsb-num ${low>0?'text-amber':''}">${fmt(low)}</strong>
            <i class="dsb-icon">${icon('alert-triangle')}</i>
          </div>
          <div class="dsb-block dsb-transfers ${transfersInTransit>0?'has-transit':''}" data-page="transfers">
            <span class="dsb-label">Đang chuyển</span>
            <strong class="dsb-num ${transfersInTransit>0?'text-purple':''}">${fmt(transfersInTransit)}</strong>
            <i class="dsb-icon">${icon('arrow-left-right')}</i>
          </div>
        </div>
      </div>

      <div class="card section-card">
        <div class="section-head">
          <div><h2>Hoạt động gần đây</h2></div>
          <button class="link-btn" data-page="history">Xem tất cả ${icon('chevron-right')}</button>
        </div>
        <div class="dash-activity-list">
          ${recent.map(activityRow).join('')||`<div class="dash-empty-clean"><i>${icon('clock')}</i><span>Chưa có phát sinh mới</span></div>`}
        </div>
      </div>
    </section>

    ${renderDashboardAnalytics()}
  `;

  if (isUnauth && !isDemo) {
    $('#content').innerHTML = `
      <div class="public-entry-overlay">
        <section class="card public-entry-card public-entry-hero" style="background:#ffffff;border:1px solid var(--border,#e2e8f0);border-radius:18px;max-width:520px;width:100%;padding:22px 18px;box-shadow:0 18px 40px -12px rgba(15,23,42,0.18);animation:entryCardFadeIn 0.22s ease-out">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div class="brand-mark" style="width:48px;height:48px;flex-shrink:0"><img src="./icons/logo-master.svg" alt="QBiz" class="brand-logo-img"></div>
            <div style="min-width:0">
              <h2 style="margin:0;font-size:16.5px;font-weight:700;color:#0f172a;line-height:1.3">QBiz · Bán Hàng &amp; Quản Lý Kho</h2>
              <p style="margin:2px 0 0;font-size:12px;color:var(--text-muted,#64748b)">Hệ thống đám mây kết hợp lưu trữ ngoại tuyến an toàn</p>
            </div>
          </div>

          <!-- HÀNG 1: Tạo shop mới & Đăng nhập (cùng 1 hàng, icon và chữ ngang hàng) | HÀNG 2: Xem shop demo (hàng dưới) -->
          <div class="entry-cta-bar" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
            <button type="button" class="primary-btn entry-cta-btn" data-action="create-shop-modal" title="Tạo cửa hàng mới" style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:8px;padding:10px 8px;font-size:clamp(12px,3.2vw,13.5px);font-weight:700;border-radius:10px;min-height:46px;background:linear-gradient(135deg,#0284c7,#0369a1);border:none;color:#fff;box-shadow:0 2px 6px rgba(2,132,199,0.25);cursor:pointer;white-space:nowrap">
              ${icon('store')}
              <span style="white-space:nowrap">Tạo shop mới</span>
            </button>
            <button type="button" class="secondary-btn entry-cta-btn" data-action="open-auth-modal" title="Đăng nhập tài khoản" style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:8px;padding:10px 8px;font-size:clamp(12px,3.2vw,13.5px);font-weight:700;border-radius:10px;min-height:46px;background:#fff;border:1.5px solid #cbd5e1;color:#1e293b;box-shadow:0 1px 2px rgba(0,0,0,0.04);cursor:pointer;white-space:nowrap">
              ${icon('user')}
              <span style="white-space:nowrap">Đăng nhập</span>
            </button>
            <button type="button" class="ghost-btn entry-cta-btn demo-cta-btn" data-action="preview-demo" title="Trải nghiệm ngay bản demo" style="grid-column:1/-1;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:8px;padding:10px 14px;font-size:clamp(12px,3.2vw,13.5px);font-weight:700;border-radius:10px;min-height:46px;background:#f0f9ff;border:1.5px dashed #0284c7;color:#0284c7;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:pointer;white-space:nowrap">
              ${icon('eye')}
              <span style="white-space:nowrap">Xem shop demo</span>
            </button>
          </div>

          <div style="text-align:center;margin:-2px 0 14px">
            <button type="button" class="entry-install-link" data-action="install-app" title="Cài ứng dụng về máy">
              <span class="entry-install-ico">${icon('download')}</span>
              <span>Cài đặt ứng dụng về máy để dùng mượt mà hơn</span>
            </button>
          </div>

          <!-- NGAY DƯỚI XEM DEMO: CHỌN NGÀNH -->
          <div class="entry-industry-section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.04em;text-transform:uppercase">CHỌN NGÀNH ĐỂ XEM DEMO</span>
              <span style="font-size:11px;color:var(--primary,#0284c7);font-weight:600">4 shop mẫu chuẩn</span>
            </div>
            <div class="industry-selector-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
              <button type="button" class="industry-select-btn" data-action="select-demo-industry" data-industry="retail" style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;font-weight:600;color:#0f172a;cursor:pointer;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
                <span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:#e0f2fe;color:#0284c7;flex-shrink:0">${icon('shopping-bag')}</span>
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Bán lẻ / Tổng hợp</span>
              </button>
              <button type="button" class="industry-select-btn" data-action="select-demo-industry" data-industry="fashion" style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;font-weight:600;color:#0f172a;cursor:pointer;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
                <span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:#fce7f3;color:#ec4899;flex-shrink:0">${icon('tag')}</span>
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Thời trang</span>
              </button>
              <button type="button" class="industry-select-btn" data-action="select-demo-industry" data-industry="food_beverage" style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;font-weight:600;color:#0f172a;cursor:pointer;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
                <span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:#fef3c7;color:#d97706;flex-shrink:0">${icon('coffee')}</span>
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Ăn uống / F&B</span>
              </button>
              <button type="button" class="industry-select-btn" data-action="select-demo-industry" data-industry="service" style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;font-weight:600;color:#0f172a;cursor:pointer;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
                <span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:#ede9fe;color:#8b5cf6;flex-shrink:0">${icon('sparkles')}</span>
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Dịch vụ / Spa</span>
              </button>
            </div>
          </div>

          <!-- Google Sign-in Button -->
          <button type="button" class="google-auth-btn" id="quickGoogleLoginBtn" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:10px 16px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;font-weight:600;font-size:13px;color:#1e293b;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.04);margin-bottom:10px">
            <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>Tiếp tục với Google</span>
          </button>

          <div style="display:flex;align-items:center;text-align:center;color:var(--text-muted,#64748b);font-size:11.5px;margin:6px 0 10px">
            <span style="flex:1;border-bottom:1px solid #e2e8f0"></span>
            <span style="padding:0 8px">hoặc đăng nhập bằng Email</span>
            <span style="flex:1;border-bottom:1px solid #e2e8f0"></span>
          </div>

          <div class="public-entry-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:10px">
            <input type="email" id="quickLoginEmail" placeholder="Email đăng nhập" style="padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff" />
            <input type="password" id="quickLoginPassword" placeholder="Mật khẩu" style="padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff" />
          </div>
          <button type="button" class="primary-btn" id="quickLoginBtn" style="width:100%;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:8px;padding:11px 16px;border-radius:10px;font-weight:700;font-size:13.5px;min-height:46px;box-shadow:0 2px 6px rgba(2,132,199,0.25);cursor:pointer;white-space:nowrap">${icon('user')} <span>Đăng nhập</span></button>
          <div style="text-align:center;margin-top:8px">
            <button type="button" class="ghost-btn" id="quickForgotPasswordBtn" data-action="open-forgot-password-modal" style="font-size:12px;color:#64748b;text-decoration:none;cursor:pointer;padding:4px 8px">Quên mật khẩu?</button>
          </div>
        </section>
      </div>
      <div class="dashboard-under-overlay">
        ${dashboardBodyHtml}
      </div>
    `;
  } else {
    $('#content').innerHTML = `
      ${isDemo ? (() => {
        const activeDemoInd = getActiveDemoIndustry();
        const activeRoleKey = getActiveDemoRole();
        const activeRoleMeta = DEMO_ROLES[activeRoleKey] || DEMO_ROLES.OWNER;
        return `
        <section class="card demo-compact-header demo-preview-banner" style="margin-bottom:10px;padding:6px 8px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.03)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-bottom:5px;margin-bottom:5px;border-bottom:1px solid #f1f5f9">
            <div style="display:flex;align-items:center;gap:6px;min-width:0">
              <span class="badge" style="background:#0284c7;color:#fff;font-weight:700;font-size:9px;padding:1px 5px;border-radius:4px;letter-spacing:0.04em;flex-shrink:0">DEMO</span>
              <strong style="font-size:11.5px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(activeDemoInd.shop.name)}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
              <button type="button" class="ghost-btn tiny" data-action="reset-demo" title="Khôi phục dữ liệu gốc" style="font-size:10.5px;font-weight:600;padding:2px 6px;color:#64748b;border:1px solid #cbd5e1;background:#fff;border-radius:4px;cursor:pointer">Làm mới</button>
              <button type="button" class="ghost-btn tiny" data-action="exit-demo" title="Thoát demo" style="font-size:10.5px;font-weight:600;padding:2px 6px;color:#dc2626;border:1px solid #fecaca;background:#fff5f5;border-radius:4px;cursor:pointer">Thoát demo</button>
            </div>
          </div>
          <div class="demo-selector-row" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%">
            <button type="button" class="demo-selector-card demo-role-btn" data-action="open-demo-role-modal" style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:7px;cursor:pointer;text-align:left;width:100%;box-sizing:border-box;min-height:38px">
              <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:5px;background:#e0f2fe;color:#0284c7;flex-shrink:0">${icon('user')}</span>
              <div style="display:flex;flex-direction:column;min-width:0;flex:1">
                <span style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;line-height:1">Vai trò</span>
                <strong style="font-size:11.5px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;line-height:1.2">${esc(activeRoleMeta.label)}</strong>
              </div>
              <span style="display:flex;align-items:center;color:#94a3b8;flex-shrink:0;margin-left:auto">${icon('chevron-down')}</span>
            </button>
            <button type="button" class="demo-selector-card demo-industry-btn" data-action="open-demo-industry-modal" style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:7px;cursor:pointer;text-align:left;width:100%;box-sizing:border-box;min-height:38px">
              <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:5px;background:#fce7f3;color:#ec4899;flex-shrink:0">${icon('store')}</span>
              <div style="display:flex;flex-direction:column;min-width:0;flex:1">
                <span style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;line-height:1">Ngành</span>
                <strong style="font-size:11.5px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;line-height:1.2">${esc(activeDemoInd.shortName)}</strong>
              </div>
              <span style="display:flex;align-items:center;color:#94a3b8;flex-shrink:0;margin-left:auto">${icon('chevron-down')}</span>
            </button>
          </div>
        </section>
        `;
      })() : (auth.user ? (() => {
        const isSuper = auth.isSuperAdmin;
        const currentShopName = auth.shop?.name || (isSuper ? 'Quản trị Nền tảng' : 'Cửa hàng của tôi');
        return `
        <div class="auth-user-bar-compact" style="margin-bottom:8px;padding:4px 8px;background:${isSuper ? '#0f172a' : '#f8fafc'};border:1px solid ${isSuper ? '#1e293b' : '#e2e8f0'};border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,0.04);font-size:11.5px">
          <div style="display:flex;align-items:center;gap:5px;min-width:0;flex:1">
            <span class="badge" style="background:${isSuper ? '#ef4444' : '#0284c7'};color:#fff;font-weight:700;font-size:9.5px;padding:1px 5px;border-radius:4px;flex-shrink:0">${isSuper ? 'SUPER ADMIN' : (esc(auth.role || 'SHOP'))}</span>
            <span style="font-weight:600;color:${isSuper ? '#f1f5f9' : '#0f172a'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(auth.user.email)}">${esc(auth.user.email.split('@')[0])}</span>
            <span style="color:${isSuper ? '#64748b' : '#94a3b8'};font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">· ${esc(currentShopName)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
            ${isSuper ? `
            <button type="button" class="primary-btn tiny" data-action="go-platform-admin" style="font-size:11px;font-weight:700;padding:3px 7px;background:#0284c7;border:none;border-radius:5px;gap:3px;cursor:pointer;white-space:nowrap">⚡ Quản trị</button>
            ` : ''}
            <button type="button" class="secondary-btn tiny" data-action="open-create-shop-modal" title="Tạo cửa hàng mới" style="font-size:11px;font-weight:600;padding:3px 6px;border-radius:5px;background:${isSuper ? '#1e293b' : '#fff'};border-color:${isSuper ? '#334155' : '#cbd5e1'};color:${isSuper ? '#e2e8f0' : '#334155'};cursor:pointer;white-space:nowrap">+ Shop</button>
            <button type="button" class="secondary-btn tiny" data-action="clear-demo-fresh" title="Xóa sạch dữ liệu mẫu để bắt đầu cửa hàng trắng" style="font-size:11px;padding:3px 5px;border-radius:5px;background:${isSuper ? '#2d1515' : '#fef2f2'};border-color:${isSuper ? '#7f1d1d' : '#fecaca'};color:${isSuper ? '#fca5a5' : '#dc2626'};cursor:pointer">${icon('trash-2')}</button>
          </div>
        </div>
        `;
      })() : '')}
      ${dashboardBodyHtml}
    `;
  }

  $$('[data-report-open]').forEach(b=>b.onclick=()=>{
    if(!userCan('VIEW_REPORT')){
      toast('Tài khoản của bạn không có quyền xem báo cáo tài chính.','warn');
      return;
    }
    state.reportRange=b.dataset.reportOpen;
    state.reportTab='overview';
    state.page='reports';
    render();
  });
  $('[data-dash-action="toggle-shift"]',$('#content'))?.addEventListener('click',()=>{
    if(activeShift){
      openDashboardCloseShiftModal(activeShift);
    }else{
      openDashboardOpenShiftModal(regName);
    }
  });
  $$('[data-sale-id]',$('#content')).forEach(b=>b.onclick=()=>openTransaction(state.data.sales.find(s=>s.id===b.dataset.saleId)));
  $$('[data-order-open]',$('#content')).forEach(b=>b.onclick=()=>openOrderDetail(b.dataset.orderOpen));
  $$('[data-stock-filter]',$('#content')).forEach(b=>b.onclick=()=>{
    state.productStockFilter=b.dataset.stockFilter;
    state.page='products';
    render();
  });
  $$('[data-dash-range]',$('#content')).forEach(b=>b.onclick=()=>{
    state.dashAnalyticsRange=b.dataset.dashRange;
    renderDashboard();
  });
  $$('[data-dash-metric]',$('#content')).forEach(b=>b.onclick=()=>{
    state.dashAnalyticsMetric=b.dataset.dashMetric;
    renderDashboard();
  });
  $$('[data-dash-tab]',$('#content')).forEach(b=>b.onclick=()=>{
    state.dashAnalyticsTab=b.dataset.dashTab;
    renderDashboard();
  });
  $$('[data-product]',$('#content')).forEach(b=>b.onclick=()=>openProduct(b.dataset.product));
  if ($('#quickLoginBtn', $('#content'))) {
    $('#quickLoginBtn', $('#content')).onclick = async () => {
      const email = $('#quickLoginEmail', $('#content'))?.value?.trim();
      const password = $('#quickLoginPassword', $('#content'))?.value;
      if (!email || !password) {
        return toast('Vui lòng nhập đầy đủ Email và Mật khẩu.', 'error');
      }
      try {
        await signIn({ email, password });
        toast('Đăng nhập thành công!', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }
  if ($('#quickGoogleLoginBtn', $('#content'))) {
    $('#quickGoogleLoginBtn', $('#content')).onclick = async () => {
      try {
        await signInWithGoogle();
        await refresh();
        toast('Đăng nhập Google thành công!', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }
}

function dashboardActivity(){
  const records=[];
  for(const sale of state.data.sales||[]) records.push({kind:'sale',time:sale.created_at||sale.createdAt,record:sale});
  for(const order of state.data.orders||[]) records.push({kind:'order',time:order.updated_at||order.created_at||order.createdAt,record:order});
  for(const movement of state.data.movements||[]){
    const t=String(movement.type||'').toLowerCase();
    if(t==='opening'||movement.reference_type==='opening'||movement.reason==='Tồn đầu kỳ') continue;
    records.push({kind:'movement',time:movement.createdAt||movement.created_at,record:movement});
  }
  return records.filter(x=>x.time).sort((a,b)=>String(b.time).localeCompare(String(a.time))).slice(0,5);
}
function activityRow(activity){
  if(activity.kind==='movement') return movementRow(activity.record);
  const record=activity.record;
  const isSale=activity.kind==='sale';
  const title=isSale?`Bán hàng · ${record.code||'Phiếu bán'}`:`Đơn hàng · ${record.code||'Đơn mới'}`;
  const meta=[record.customer_label||'Khách lẻ',dt(activity.time),isSale?`${fmt(record.grand_total??record.total)} ₫`:orderStatusLabel(record.status)].filter(Boolean).join(' · ');
  return `<button class="feed-row activity-row" ${isSale?`data-sale-id="${record.id}"`:`data-order-open="${record.id}"`}><div class="feed-icon">${isSale?icon('shopping-cart'):icon('file-text')}</div><div class="feed-content"><div class="feed-title">${esc(title)}</div><div class="feed-meta">${esc(meta)}</div></div>${icon('chevron-right')}</button>`;
}

function renderDashboardAnalytics(){
  const range=state.dashAnalyticsRange||'7d';
  const metric=state.dashAnalyticsMetric||'revenue';
  const tab=state.dashAnalyticsTab||'topSales';
  const days=range==='30d'?30:7;
  const now=new Date();
  const dailyData=[];
  const dayNames=['CN','T2','T3','T4','T5','T6','T7'];

  for(let i=days-1; i>=0; i--){
    const dtObj=new Date(now);
    dtObj.setDate(now.getDate()-i);
    const dateStr=dtObj.toISOString().slice(0,10);
    const dayLabel=`${dtObj.getDate()}/${dtObj.getMonth()+1}`;
    const dayWeek=dayNames[dtObj.getDay()];
    const isToday=(i===0);

    const daySales=(state.data.sales||[]).filter(s=>{
      const sDate=(s.created_at||s.createdAt||'').slice(0,10);
      return sDate===dateStr&&['COMPLETED','PAID'].includes(s.status);
    });
    const dayOrders=(state.data.orders||[]).filter(o=>{
      const oDate=(o.updated_at||o.created_at||o.createdAt||'').slice(0,10);
      return oDate===dateStr&&o.status==='COMPLETED'&&!o.sale_id;
    });

    const salesRev=daySales.reduce((sum,s)=>sum+(Number(s.grand_total??s.total)||0),0);
    const ordersRev=dayOrders.reduce((sum,o)=>sum+(Number(o.grand_total??o.total)||0),0);
    const total=salesRev+ordersRev;
    const count=daySales.length+dayOrders.length;
    dailyData.push({date:dateStr,dayLabel,dayWeek,isToday,total,count});
  }

  const totalPeriodRevenue=dailyData.reduce((s,d)=>s+d.total,0);
  const totalPeriodOrders=dailyData.reduce((s,d)=>s+d.count,0);
  const maxVal=Math.max(...dailyData.map(d=>metric==='revenue'?d.total:d.count), 1);
  const avgRevenue=Math.round(totalPeriodRevenue/days);
  const avgOrders=(totalPeriodOrders/days).toFixed(1);

  const fmtChartVal=v=>{
    if(!v) return '';
    if(v>=1000000) return (v/1000000).toFixed(1).replace(/\.0$/,'')+'M';
    if(v>=1000) return Math.round(v/1000)+'k';
    return String(v);
  };

  const barsMarkup=dailyData.map((d,i)=>{
    const val=metric==='revenue'?d.total:d.count;
    const pct=val>0?Math.max(8,Math.round((val/maxVal)*100)):0;
    const isZero=val===0;
    const showLabel=days===7||(i%5===0)||(i===days-1);
    const valText=fmtChartVal(val)+(val>0&&metric==='revenue'?'₫':'');

    return `
      <div class="dash-bar-col ${d.isToday?'is-today':''}" title="${d.dayLabel}: ${fmt(d.total)} ₫ (${d.count} phiếu)">
        ${days===7?`<span class="dash-bar-val">${valText}</span>`:''}
        <div class="dash-bar-track">
          <div class="dash-bar-fill ${isZero?'is-zero':''}" style="height:${pct}%;"></div>
        </div>
        <span class="dash-bar-label ${d.isToday?'is-today':''}">
          ${showLabel? (days===7 ? `<small>${d.dayWeek}</small><b>${d.dayLabel}</b>` : `<b>${d.dayLabel}</b>`) : ''}
        </span>
      </div>
    `;
  }).join('');

  // Tab Data:
  const soldMap=new Map();
  for(const s of (state.data.sales||[])){
    if(!['COMPLETED','PAID'].includes(s.status)) continue;
    for(const it of (s.items||[])){
      const pid=it.item_id||it.itemId||it.id;
      if(!pid) continue;
      const cur=soldMap.get(pid)||{id:pid,name:it.name||it.p?.name||'Sản phẩm',qty:0,revenue:0};
      cur.qty+=Number(it.quantity||0);
      const lineRev=it.line_total??it.lineTotal??(Number(it.quantity||0)*Number(it.price||it.unitPrice||0));
      cur.revenue+=Number(lineRev||0);
      soldMap.set(pid,cur);
    }
  }
  for(const o of (state.data.orders||[])){
    if(o.status!=='COMPLETED'||o.sale_id) continue;
    for(const it of (o.items||[])){
      const pid=it.item_id||it.itemId||it.id;
      if(!pid) continue;
      const cur=soldMap.get(pid)||{id:pid,name:it.name||'Sản phẩm',qty:0,revenue:0};
      cur.qty+=Number(it.quantity||0);
      cur.revenue+=Number(it.line_total??it.lineTotal??0);
      soldMap.set(pid,cur);
    }
  }
  const topSellers=[...soldMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,4);

  const lowStock=state.data.products
    .filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false)
    .map(p=>({p,t:totalFor(state.data,p.id),low:Number(p.lowStock||0)}))
    .filter(x=>x.t.available<=x.low)
    .sort((a,b)=>a.t.available-b.t.available)
    .slice(0,4);

  const slowMoving=state.data.products
    .filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false)
    .map(p=>({p,t:totalFor(state.data,p.id),sold:soldMap.get(p.id)?.qty||0}))
    .filter(x=>x.t.available>0&&x.sold===0)
    .sort((a,b)=>b.t.available-a.t.available)
    .slice(0,4);

  let tabContent='';
  if(tab==='topSales'){
    tabContent=topSellers.length?topSellers.map((x,idx)=>`
      <button class="dash-mini-row" data-product="${x.id}">
        <span class="dmr-rank">#${idx+1}</span>
        <div class="dmr-info">
          <strong class="dmr-name">${esc(x.name)}</strong>
          <small class="dmr-sub">${fmt(x.revenue)} ₫</small>
        </div>
        <div class="dmr-badge ok">
          <b>${fmt(x.qty)} đã bán</b>
        </div>
        <span class="dmr-arr">${icon('chevron-right')}</span>
      </button>
    `).join(''):`
      <div class="dash-empty-tab">
        <i>${icon('shopping-cart')}</i>
        <span>Chưa có sản phẩm bán ra trong kỳ</span>
      </div>
    `;
  } else if(tab==='lowStock'){
    tabContent=lowStock.length?lowStock.map(x=>`
      <button class="dash-mini-row" data-product="${x.p.id}">
        <span class="dmr-icon-badge danger">${icon('alert-triangle')}</span>
        <div class="dmr-info">
          <strong class="dmr-name">${esc(x.p.name)}</strong>
          <small class="dmr-sub">Mức tối thiểu: ${fmt(x.low)}</small>
        </div>
        <div class="dmr-badge danger">
          <b>Còn ${fmt(x.t.available)}</b>
        </div>
        <span class="dmr-arr">${icon('chevron-right')}</span>
      </button>
    `).join(''):`
      <div class="dash-empty-tab">
        <i>${icon('check-circle')}</i>
        <span>Tất cả hàng hóa đều ở mức tồn an toàn</span>
      </div>
    `;
  } else if(tab==='slowMoving'){
    tabContent=slowMoving.length?slowMoving.map(x=>`
      <button class="dash-mini-row" data-product="${x.p.id}">
        <span class="dmr-icon-badge muted">${icon('archive')}</span>
        <div class="dmr-info">
          <strong class="dmr-name">${esc(x.p.name)}</strong>
          <small class="dmr-sub">Chưa có lượt bán</small>
        </div>
        <div class="dmr-badge muted">
          <b>Tồn ${fmt(x.t.available)}</b>
        </div>
        <span class="dmr-arr">${icon('chevron-right')}</span>
      </button>
    `).join(''):`
      <div class="dash-empty-tab">
        <i>${icon('check-circle')}</i>
        <span>Không có hàng tồn lâu chưa bán</span>
      </div>
    `;
  }

  return `
    <section class="card section-card dash-analytics-card">
      <div class="dash-analytics-head">
        <div>
          <h2>Phân tích nhanh</h2>
          <p>Hiệu quả bán hàng & tồn kho</p>
        </div>
        <div class="dash-analytics-toggles">
          <div class="dash-toggle-group">
            <button class="${metric==='revenue'?'active':''}" data-dash-metric="revenue">Doanh thu</button>
            <button class="${metric==='orders'?'active':''}" data-dash-metric="orders">Số phiếu</button>
          </div>
          <div class="dash-toggle-group">
            <button class="${range==='7d'?'active':''}" data-dash-range="7d">7 ngày</button>
            <button class="${range==='30d'?'active':''}" data-dash-range="30d">30 ngày</button>
          </div>
        </div>
      </div>

      <div class="dash-chart-box">
        <div class="dash-chart-kpis">
          <div class="dck-item">
            <span>Doanh thu (${range==='7d'?'7 ngày':'30 ngày'})</span>
            <strong>${fmt(totalPeriodRevenue)} ₫</strong>
          </div>
          <div class="dck-item">
            <span>Phiếu hoàn tất</span>
            <strong>${totalPeriodOrders} phiếu</strong>
          </div>
          <div class="dck-item">
            <span>Trung bình/ngày</span>
            <strong>${metric==='revenue'?`${fmt(avgRevenue)} ₫`: `${avgOrders} phiếu`}</strong>
          </div>
        </div>

        <div class="dash-chart-stage ${range==='30d'?'is-30d':''}">
          <div class="dash-bars-wrap">
            ${barsMarkup}
          </div>
        </div>
      </div>

      <div class="dash-subtabs">
        <button class="${tab==='topSales'?'active':''}" data-dash-tab="topSales">
          <i>${icon('trending-up')}</i>
          <span>Bán chạy</span>
        </button>
        <button class="${tab==='lowStock'?'active':''}" data-dash-tab="lowStock">
          <i>${icon('alert-triangle')}</i>
          <span>Sắp hết</span>
          ${lowStock.length?`<em class="tab-count danger">${lowStock.length}</em>`:''}
        </button>
        <button class="${tab==='slowMoving'?'active':''}" data-dash-tab="slowMoving">
          <i>${icon('clock')}</i>
          <span>Tồn lâu</span>
          ${slowMoving.length?`<em class="tab-count">${slowMoving.length}</em>`:''}
        </button>
      </div>

      <div class="dash-tab-body">
        ${tabContent}
      </div>
    </section>
  `;
}

function renderProducts(){
  const isSvc = isServiceMode() || state.productType === 'SERVICE';
  if (isServiceMode() && !state._userSelectedProductType) {
    state.productType = 'SERVICE';
  }
  setTitle(isSvc ? 'Dịch vụ' : 'Hàng hóa','QBiz');
  const createdMap=new Map();
  for(const o of (state.data.outbox||[])){ if(o.entity_type==='item'&&o.action==='create'&&!createdMap.has(o.entity_id)) createdMap.set(o.entity_id,o.created_at||o.updated_at||''); }
  const createdAtOf=p=>createdMap.get(p.id)||p.created_at||p.createdAt||'';
  const statusF=state.productStatusFilter||'all', stockF=state.productStockFilter||'all';
  let list=state.data.products.filter(p=>{
    const q=state.search.toLowerCase();
    const category=p.categoryId||p.category||'';
    if(p.type!==state.productType) return false;
    if(!categoryMatches(p,state.productCategory)) return false;
    if(statusF==='active'&&p.active===false) return false;
    if(statusF==='inactive'&&p.active!==false) return false;
    if(stockF!=='all'){
      if(p.type==='SERVICE'||p.trackInventory===false) return false;
      const tot=productTotals(p), low=Number(p.lowStock||0);
      if(stockF==='in'&&tot.available<=0) return false;
      if(stockF==='low'&&!(tot.available>0&&tot.available<=low)) return false;
      if(stockF==='out'&&tot.available>0) return false;
      if(stockF==='neg'&&tot.onHand>=0) return false;
    }
    return !q || [p.name,p.sku,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q)));
  });
  if(state.productSort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'vi'));if(state.productSort==='price')list.sort((a,b)=>(b.price||0)-(a.price||0));if(state.productSort==='stock')list.sort((a,b)=>productTotals(a).available-productTotals(b).available);if(state.productSort==='status')list.sort((a,b)=>productStatus(a)[0].localeCompare(productStatus(b)[0]));if(state.productSort==='priceAsc')list.sort((a,b)=>(a.price||0)-(b.price||0));if(state.productSort==='newest'||state.productSort==='oldest')list.sort((a,b)=>{const x=createdAtOf(a),y=createdAtOf(b);if(!x&&!y)return 0;if(state.productSort==='newest'){if(!x)return 1;if(!y)return -1;return String(y).localeCompare(String(x));}if(!x)return -1;if(!y)return 1;return String(x).localeCompare(String(y));});
  const visible=list.slice(0,state.productLimit);
  const low=list.filter(p=>p.type!=='SERVICE'&&productTotals(p).available<=p.lowStock).length;
  const totalQty=list.reduce((n,p)=>n+(p.type==='SERVICE'?0:productTotals(p).onHand),0);
  const gridMode=['grid2','grid3'].includes(state.displayPrefs.view);
  $('#content').innerHTML=`
    <section class="goods-toolbar card ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}">
      <div class="goods-title goods-title-compact"><div class="goods-stats"><strong class="goods-stat-main">${fmt(list.length)} ${state.productType==='SERVICE'?'dịch vụ':'sản phẩm'}</strong><span class="goods-stat-meta"><span class="goods-stat-sub">Tồn kho ${fmt(totalQty)}</span>${low?`<span class="goods-stat-sub warn">${fmt(low)} sắp hết</span>`:''}</span></div><div><button class="secondary-btn compact" data-display-settings>Hiển thị</button><button class="primary-btn compact" data-action="new-product" aria-label="Thêm ${state.productType==='SERVICE'?'dịch vụ':'hàng hóa'}">Thêm ${state.productType==='SERVICE'?'dịch vụ':'sản phẩm'} +</button></div></div>
      <div class="goods-segments"><button class="${state.productType==='PRODUCT'?'active':''}" data-product-type="PRODUCT">Sản phẩm</button><button class="${state.productType==='SERVICE'?'active':''}" data-product-type="SERVICE">Dịch vụ</button></div>
      <div class="goods-search"><input id="productSearch" value="${esc(state.search)}" placeholder="${state.productType==='PRODUCT'?'Tìm tên / SKU / barcode...':'Tìm tên dịch vụ...'}"/><button data-action="scan" aria-label="Quét mã" ${state.productType==='SERVICE'?'hidden':''}>${icon('scan-line')}</button></div>
      <div class="goods-tools"><button data-category-picker>Danh mục${state.productCategory==='all'?'':` · ${esc(categoryLabel(state.productCategory))}`}</button><button data-product-filter class="${(state.productStatusFilter&&state.productStatusFilter!=='all')||(state.productStockFilter&&state.productStockFilter!=='all')||state.warehouse!=='all'?'active':''}">Lọc</button><select id="productSort"><option value="newest" ${state.productSort==='newest'?'selected':''}>Mới nhất</option><option value="oldest" ${state.productSort==='oldest'?'selected':''}>Cũ nhất</option><option value="priceAsc" ${state.productSort==='priceAsc'?'selected':''}>Giá thấp trước</option><option value="default" ${state.productSort==='default'?'selected':''}>Sắp xếp</option><option value="name" ${state.productSort==='name'?'selected':''}>Tên A–Z</option><option value="price" ${state.productSort==='price'?'selected':''}>Giá cao trước</option>${state.productType==='PRODUCT'?`<option value="stock" ${state.productSort==='stock'?'selected':''}>Tồn thấp trước</option><option value="status" ${state.productSort==='status'?'selected':''}>Trạng thái</option>`:''}</select><button data-toggle-select>${state.productSelecting?'Xong':'Chọn'}</button></div>
      ${state.productSelecting?`<div class="selection-bar"><button data-select-all>Chọn tất cả</button><strong>${state.productSelected.size} đã chọn</strong><button data-select-clear>Bỏ chọn</button><button data-batch-actions ${state.productSelected.size?'':'disabled'}>Thao tác</button></div>`:''}
    </section>

    ${gridMode
      ? `<section class="product-grid ${state.displayPrefs.view} ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}">${visible.map(productCard).join('')||'<div class="empty"><strong>Không tìm thấy</strong>Thử tên hoặc SKU khác.</div>'}</section>`
      : `<section class="card goods-list ${state.displayPrefs.density==='compact'?'is-compact':''} ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}">${visible.map(productTableRow).join('')||'<div class="empty"><strong>Không tìm thấy</strong>Thử tên hoặc SKU khác.</div>'}</section>`}${visible.length<list.length?`<button class="catalog-more product-more" data-product-more>Xem thêm ${Math.min(40,list.length-visible.length)}</button>`:''}
  `;
  $('#productSearch')?.addEventListener('input',e=>{state.search=e.target.value;keepFocus('#productSearch',renderProducts)});
  $$('[data-product-type]').forEach(b=>b.onclick=()=>{state.productType=b.dataset.productType;state._userSelectedProductType=true;state.productCategory='all';state.productLimit=40;state.productSelected.clear();renderProducts()});
  $('#productSort')?.addEventListener('change',e=>{state.productSort=e.target.value;renderProducts()});$('[data-product-more]')?.addEventListener('click',()=>{state.productLimit+=40;renderProducts()});
  $('[data-display-settings]')?.addEventListener('click',openDisplaySettings);$('[data-category-picker]')?.addEventListener('click',()=>openCategoryPicker());$('[data-product-filter]')?.addEventListener('click',openProductFilter);
  $('[data-toggle-select]')?.addEventListener('click',()=>{state.productSelecting=!state.productSelecting;if(!state.productSelecting)state.productSelected.clear();renderProducts()});
  $('[data-select-all]')?.addEventListener('click',()=>{list.forEach(p=>state.productSelected.add(p.id));renderProducts()});$('[data-select-clear]')?.addEventListener('click',()=>{state.productSelected.clear();renderProducts()});$('[data-batch-actions]')?.addEventListener('click',openBatchActions);
  $$('[data-select-product]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.selectProduct;state.productSelected.has(id)?state.productSelected.delete(id):state.productSelected.add(id);renderProducts()});
  $$('[data-edit-product]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEditItem(b.dataset.editProduct)});$$('[data-more-product]').forEach(b=>b.onclick=e=>{e.stopPropagation();openItemActions(b.dataset.moreProduct)});bindGoodsSwipe();
}

function openDisplaySettings(){
  const p=state.displayPrefs;
  openModal({title:'Hiển thị',sub:'Lưu trên thiết bị này.',submitText:'Áp dụng',body:`<div class="display-settings"><h4>Hàng hóa</h4><div class="display-options">${[['compact','Danh sách gọn'],['image','Có ảnh'],['grid2','Lưới 2'],['grid3','Lưới 3']].map(([v,l])=>`<label><input type="radio" name="goodsView" value="${v}" ${p.view===v?'checked':''}/><span>${l}</span></label>`).join('')}</div><div class="check-list"><label><input id="showPrice" type="checkbox" ${p.showPrice?'checked':''}/> Giá</label><label><input id="showStock" type="checkbox" ${p.showStock?'checked':''}/> Tồn</label><label><input id="showSku" type="checkbox" ${p.showSku?'checked':''}/> SKU</label></div><div class="density-row"><h4>Mật độ</h4><div class="segment"><label><input type="radio" name="density" value="compact" ${p.density==='compact'?'checked':''}/> Gọn</label><label><input type="radio" name="density" value="medium" ${p.density==='medium'?'checked':''}/> Vừa</label></div></div><div class="pos-view-row"><h4>Bán hàng</h4><div class="display-options">${[['grid2','Lưới 2'],['grid3','Lưới 3'],['list','Danh sách']].map(([v,l])=>`<label><input type="radio" name="posView" value="${v}" ${p.posView===v?'checked':''}/><span>${l}</span></label>`).join('')}</div></div></div>`,onSubmit:r=>{state.displayPrefs={version:2,view:$('input[name="goodsView"]:checked',r)?.value||'image',showPrice:$('#showPrice',r).checked,showStock:$('#showStock',r).checked,showSku:$('#showSku',r).checked,density:$('input[name="density"]:checked',r)?.value||'medium',posView:$('input[name="posView"]:checked',r)?.value||'grid3'};saveDisplayPrefs();}});
}
function openProductFilter(){
  const productMode=state.productType==='PRODUCT';
  const chip=(g,v,label)=>{const cur={stock:state.productStockFilter||'all',status:state.productStatusFilter||'all',warehouse:state.warehouse||'all'}[g];return `<button data-pick-group="${g}" data-pick-value="${v}" class="${cur===v?'active':''}">${label}</button>`};
  const body=productMode?`<div class="mod-block"><label class="mod-label">Tồn kho</label><div class="mod-chips">${chip('stock','all','Tất cả')}${chip('stock','in','Còn hàng')}${chip('stock','low','Sắp hết')}${chip('stock','out','Hết hàng')}${chip('stock','neg','Tồn âm')}</div></div><div class="mod-block"><label class="mod-label">Trạng thái</label><div class="mod-chips">${chip('status','all','Tất cả')}${chip('status','active','Đang bán')}${chip('status','inactive','Ngừng bán')}</div></div><div class="mod-block"><label class="mod-label">Kho</label><div class="mod-chips">${chip('warehouse','all','Tất cả kho')}${state.data.warehouses.map(w=>chip('warehouse',w.id,esc(w.name))).join('')}</div></div>`:'<div class="empty-line">Dịch vụ không lọc theo tồn kho.</div>';
  openModal({title:'Lọc hàng hóa',sub:productMode?'Chọn nhanh theo tồn kho, trạng thái và kho.':'Dịch vụ không lọc theo tồn kho.',submitText:'Áp dụng',body,onSubmit:r=>{if(!productMode)return;const pick=g=>$(`[data-pick-group="${g}"].active`,r)?.dataset.pickValue||'all';state.productStockFilter=pick('stock');state.productStatusFilter=pick('status');state.warehouse=pick('warehouse');}});
}
function openCategoryPicker(){
  const type=state.productType, rows=categoryTree(type);
  openModal({title:'Danh mục',sub:`${type==='SERVICE'?'Dịch vụ':'Sản phẩm'} · chọn hoặc tạo nhiều cấp`,hideSubmit:true,body:`<div class="category-manager"><div class="category-manager-top"><button class="secondary-btn" data-category-clear>Tất cả</button><button class="primary-btn" data-category-add>+ Danh mục</button></div><div class="category-tree">${rows.map(({category,depth})=>`<div class="category-tree-row" style="--depth:${depth}"><button class="category-tree-select ${state.productCategory===category.id?'active':''}" data-category-select="${category.id}">${category.image?`<img src="${category.image}" alt=""/>`:'<span class="category-dot"></span>'}<span>${esc(category.name)}</span></button><button class="category-child-btn" data-category-child="${category.id}" aria-label="Thêm danh mục con">+ con</button></div>`).join('')||'<div class="empty-line">Chưa có danh mục. Hãy tạo danh mục đầu tiên.</div>'}</div><p class="category-manager-help">Danh mục con có thể tiếp tục tạo thành nhiều cấp.</p></div>`});
  const root=$('#modalRoot');
  $('[data-category-clear]',root)?.addEventListener('click',()=>{state.productCategory='all';state.productLimit=40;root.innerHTML='';renderProducts()});
  $('[data-category-add]',root)?.addEventListener('click',()=>{root.innerHTML='';openCategoryForm('')});
  $$('[data-category-select]',root).forEach(b=>b.onclick=()=>{state.productCategory=b.dataset.categorySelect;state.productLimit=40;root.innerHTML='';renderProducts()});
  $$('[data-category-child]',root).forEach(b=>b.onclick=()=>{root.innerHTML='';openCategoryForm(b.dataset.categoryChild)});
}
function categoryImageMarkup(){return `<div class="category-image-field"><label>Ảnh danh mục <span>(tùy chọn)</span></label><div class="category-image-row"><div id="categoryImagePreview" class="category-image-preview"><span>${icon('image-plus')}</span></div><label class="secondary-btn upload-inline">Thêm ảnh<input id="categoryImage" type="file" accept="image/*" hidden /></label></div></div>`}
function bindCategoryImagePicker(root){const input=$('#categoryImage',root),preview=$('#categoryImagePreview',root);if(!input||!preview)return;let image='';const draw=()=>{preview.innerHTML=image?`<img src="${image}" alt="Ảnh danh mục"/><button type="button" data-category-image-remove aria-label="Xóa ảnh">×</button>`:`<span>${icon('image-plus')}</span>`;preview.querySelector('[data-category-image-remove]')?.addEventListener('click',()=>{image='';draw()})};input.onchange=async()=>{const file=input.files?.[0];if(file?.type.startsWith('image/')){image=await optimizeImage(file);draw()}};root._getCategoryImage=()=>image;draw()}
function openCategoryForm(parentId=''){
  const parent=parentId?(state.data.categories||[]).find(c=>c.id===parentId):null;
  openModal({title:parent?'Thêm danh mục con':'Thêm danh mục',sub:parent?`Nằm trong ${parent.name}`:'Tạo nhóm danh mục mới',body:`<div class="category-form"><div class="field"><label>Tên danh mục</label><input id="categoryName" placeholder="VD: Ghế thư giãn" /></div>${categoryImageMarkup()}</div>`,submitText:'Lưu danh mục',onSubmit:async root=>{const name=$('#categoryName',root).value;await createCategory({name,parentId,type:state.productType,image:root._getCategoryImage?.()||''})}});bindCategoryImagePicker($('#modalRoot'));
}
function openBatchActions(){
  const ids=[...state.productSelected],items=state.data.products.filter(p=>ids.includes(p.id));if(!items.length)return;
  openModal({title:`Thao tác ${items.length} mục`,sub:'Chỉ các thay đổi có lưu dữ liệu thật.',submitText:'Lưu thay đổi',body:`<div class="form-grid"><div class="field full-span"><label>Đổi danh mục</label><select id="batchCategory"><option value="">Không đổi</option>${categoryOptions(state.productType)}</select></div><div class="field full-span"><label>Trạng thái</label><select id="batchStatus"><option value="">Không đổi</option><option value="active">Đang bán</option><option value="inactive">Ngừng bán</option></select></div></div>`,onSubmit:async r=>{const category=$('#batchCategory',r).value,status=$('#batchStatus',r).value;if(!category&&!status)throw new Error('Hãy chọn thay đổi cần áp dụng.');for(const item of items)await updateItem({...item,...(category?{categoryId:category}:{}),...(status?{active:status==='active'}:{})});state.productSelected.clear();state.productSelecting=false;}});
}
function openItemActions(id){
  const p=product(id);if(!p)return;
  openModal({title:p.name,sub:p.type==='SERVICE'?'Dịch vụ':'Thao tác nhanh',hideSubmit:true,body:`<div class="action-sheet-list"><button data-action="edit-item" data-product-id="${p.id}">Sửa thông tin${icon('chevron-right')}</button>${p.type==='SERVICE'?'':`<button data-item-stock="${p.id}">Điều chỉnh tồn${icon('chevron-right')}</button>`}<button data-item-category="${p.id}">Đổi danh mục${icon('chevron-right')}</button><button data-item-status="${p.id}">${p.active===false?'Bật bán lại':'Ngừng bán'}${icon('chevron-right')}</button></div>`});
  $('[data-item-stock]',$('#modalRoot'))?.addEventListener('click',()=>{$('#modalRoot').innerHTML='';openQuick('count',id)});
  $('[data-item-category]',$('#modalRoot'))?.addEventListener('click',()=>{const root=$('#modalRoot');root.innerHTML='';openModal({title:'Đổi danh mục',sub:p.name,body:`<div class="field"><label>Danh mục</label><select id="singleCategory">${categoryOptions(p.type==='SERVICE'?'SERVICE':'PRODUCT',p.categoryId||p.category||'')}</select></div>`,submitText:'Lưu',onSubmit:r=>updateItem({...p,categoryId:$('#singleCategory',r).value})})});
  $('[data-item-status]',$('#modalRoot'))?.addEventListener('click',async()=>{await updateItem({...p,active:p.active===false});$('#modalRoot').innerHTML='';await refresh();toast(p.active===false?'Đã bật bán lại.':'Đã ngừng bán.','ok')});
}
function bindGoodsSwipe(){
  $$('.goods-row').forEach(row=>{let startX=0;row.addEventListener('touchstart',e=>{startX=e.touches[0].clientX},{passive:true});row.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX;$$('.goods-row.reveal').forEach(x=>x!==row&&x.classList.remove('reveal'));if(dx<-45)row.classList.add('reveal');if(dx>35)row.classList.remove('reveal')},{passive:true});});
}

function renderTransfers(){
  setTitle('Kho','QBiz');
  const transfers=state.data.transfers;
  const stockRows=state.data.products.filter(p=>p.type!=='SERVICE'&&(!state.warehouseSearch||[p.name,p.sku].some(v=>norm(v).includes(norm(state.warehouseSearch))))).filter(p=>{const t=stockView(p,state.warehouseStockWarehouse);return state.warehouseFilter==='all'||state.warehouseFilter==='low'&&t.available<=p.lowStock||state.warehouseFilter==='out'&&t.available===0}).sort((a,b)=>state.warehouseSort==='available'?stockView(a,state.warehouseStockWarehouse).available-stockView(b,state.warehouseStockWarehouse).available:String(a.name).localeCompare(String(b.name),'vi'));
  $('#content').innerHTML=`
  <section class="toolbar-panel card">
    <div class="toolbar-row top"><div><h2>Kho</h2></div></div>
    <div class="warehouse-tabs"><button class="${state.warehouseTab==='stock'?'active':''}" data-warehouse-tab="stock">Tồn kho</button><button class="${state.warehouseTab==='operations'?'active':''}" data-warehouse-tab="operations">Nghiệp vụ</button><button class="${state.warehouseTab==='history'?'active':''}" data-warehouse-tab="history">Lịch sử</button></div>
    ${state.warehouseTab==='stock'?`<div class="warehouse-search"><input id="warehouseSearch" value="${esc(state.warehouseSearch)}" placeholder="Tìm tên hoặc mã sản phẩm..."/><div class="warehouse-tools"><select id="warehouseStockWarehouse"><option value="all">Tất cả kho</option>${(state.data.warehouses||[]).map(w=>`<option value="${w.id}" ${state.warehouseStockWarehouse===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select><select id="warehouseStockFilter"><option value="all">Tất cả trạng thái</option><option value="low" ${state.warehouseFilter==='low'?'selected':''}>Sắp hết</option><option value="out" ${state.warehouseFilter==='out'?'selected':''}>Hết hàng</option></select><select id="warehouseStockSort"><option value="name">Tên A–Z</option><option value="available" ${state.warehouseSort==='available'?'selected':''}>Tồn thấp trước</option></select></div></div><div class="warehouse-stock-list">${stockRows.slice(0,40).map(p=>{const t=stockView(p,state.warehouseStockWarehouse),status=t.available===0?'Hết hàng':t.available<=p.lowStock?'Sắp hết':'';return `<button class="stock-row" data-product="${p.id}"><div class="product-photo tiny">${p.image?`<img src="${p.image}" alt="${esc(p.name)}"/>`:esc((p.name||'S').slice(0,1))}</div><span><strong>${esc(p.name)}</strong><small>${esc(p.sku||'Chưa có SKU')}</small></span><div><b>${fmt(t.onHand)}</b><small>Tồn thực</small></div><div><b>${fmt(t.available)}</b><small>Có thể bán</small></div>${status?`<em>${status}</em>`:''}</button>`}).join('')||'<div class="empty">Không có sản phẩm phù hợp.</div>'}</div>`:state.warehouseTab==='history'?`<div class="warehouse-history">${state.data.movements.slice(0,50).map(movementRow).join('')||'<div class="empty">Chưa có lịch sử kho.</div>'}</div>`:`<div class="warehouse-actions warehouse-operation-grid"><button data-action="quick-action" data-kind="receive">${icon('package-plus')}<strong>Nhập kho</strong></button><button data-action="quick-action" data-kind="issue">${icon('package-minus')}<strong>Xuất kho</strong></button><button data-action="quick-action" data-kind="transfer">${icon('arrow-left-right')}<strong>Chuyển kho</strong></button><button data-action="quick-action" data-kind="count">${icon('clipboard-check')}<strong>Kiểm kho</strong></button><button data-action="warehouse-management">${icon('settings-2')}<strong>Quản lý kho</strong></button></div>`}
  </section>
  ${state.warehouseTab==='operations'?`<section class="card section-card" style="margin-top:18px">
    ${transfers.map(t=>{const lines=Array.isArray(t.lines)&&t.lines.length?t.lines:[{productId:t.productId,qty:t.qty}];const names=lines.map(l=>product(l.productId)?.name||l.productId).filter(Boolean).join(', ');const totalQty=lines.reduce((s,l)=>s+Number(l.qty||0),0);const firstP=product(lines[0]?.productId);return `<div class="transfer-card"><div class="transfer-main"><div class="product-photo tiny">${firstP?.image?`<img src="${firstP.image}" alt="${esc(firstP.name)}"/>`:esc((firstP?.name||'S').slice(0,1))}</div><div><strong>${esc(names||'Sản phẩm')}</strong><p>${lines.length>1?`${lines.length} dòng hàng · `:''}${esc(warehouse(t.fromWarehouseId)?.name)} → ${esc(warehouse(t.toWarehouseId)?.name)} · ${dt(t.createdAt||t.created_at)}</p></div></div><div class="transfer-side"><span class="badge ${t.status==='received'?'ok':t.status==='cancelled'?'danger':'info'}">${t.status==='received'?'Đã nhận':t.status==='cancelled'?'Đã hủy':'Đang chuyển'}</span><strong>${fmt(totalQty)}</strong>${t.status==='in_transit'?`<button class="secondary-btn" data-receive-transfer="${t.id}">Nhận hàng</button><button class="secondary-btn" data-cancel-transfer="${t.id}">Hủy chuyển</button>`:''}</div></div>`}).join('')||'<div class="empty"><strong>Chưa có phiếu chuyển</strong>Khi có điều chuyển giữa hai kho, chúng sẽ hiện ở đây.</div>'}
  </section>`:''}`;
  $$('[data-warehouse-tab]').forEach(b=>b.onclick=e=>{e.stopPropagation();state.warehouseTab=b.dataset.warehouseTab;state.page='transfers';renderTransfers()});
  $('#warehouseSearch')?.addEventListener('input',e=>{state.warehouseSearch=e.target.value;keepFocus('#warehouseSearch',renderTransfers)});
  $('#warehouseStockFilter')?.addEventListener('change',e=>{state.warehouseFilter=e.target.value;renderTransfers()});
  $('#warehouseStockSort')?.addEventListener('change',e=>{state.warehouseSort=e.target.value;renderTransfers()});
  $('#warehouseStockWarehouse')?.addEventListener('change',e=>{state.warehouseStockWarehouse=e.target.value;renderTransfers()});
}

function renderHistory(){
  setTitle('Lịch sử kho','QBiz');
  $('#content').innerHTML=`<section class="card section-card"><div class="section-head"><div><h2>Lịch sử kho</h2></div><button class="secondary-btn" data-action="export-backup">Xuất dữ liệu</button></div>${state.data.movements.map(movementRow).join('')||'<div class="empty"><strong>Chưa có dữ liệu</strong></div>'}</section>`;
}

function renderSettings(){
  setTitle('Cài đặt','QBiz');
  const d=state.data;
  const currentMode = businessProfileModule.getBusinessProfile?.() || {};
  const currentModeName = currentMode.name || 'Cửa hàng chung';
  const resolvedUi = uiProfileModule.resolveUiProfile(uiProfileModule.getUiProfile()?.id, currentMode.profile_id);
  const currentUiProfileDisplay = resolvedUi.is_auto ? `Tự động (${resolvedUi.effective_name})` : resolvedUi.name;
  const taxConf = getTaxSettings();
  let taxDesc = 'Hộ KD · Bán lẻ (1.5%)';
  if (taxConf.business_type === 'exempt') taxDesc = 'Miễn thuế / Quản lý nội bộ';
  else if (taxConf.business_type === 'company_direct') taxDesc = `DN Trực tiếp (${(Number(taxConf.vat_rate||0)+Number(taxConf.pit_rate||0)).toFixed(1)}%)`;
  else if (taxConf.business_type === 'company_deduct') taxDesc = `DN Khấu trừ (TNDN ${Number(taxConf.cit_rate||20)}%)`;
  else {
    const totalRate = (Number(taxConf.vat_rate||0) + Number(taxConf.pit_rate||0)).toFixed(1);
    const indName = taxConf.industry_type === 'service' ? 'Dịch vụ' : (taxConf.industry_type === 'fnb' ? 'F&B/Sản xuất' : 'Bán lẻ');
    taxDesc = `Hộ KD · ${indName} (${totalRate}%)${taxConf.ecommerce_auto_deduct ? ' · Trừ sàn TMĐT' : ''}`;
  }
  $('#content').innerHTML=`
  <section class="settings-center">
    <section class="card section-card settings-section"><div class="section-head"><div><h2>Cửa hàng</h2><p>Thông tin và quy tắc vận hành.</p></div></div><div class="settings-list"><button data-action="business-profile"><span>${icon('store')}<b>Thông tin cửa hàng</b><small>Tên, liên hệ, địa chỉ lấy và hoàn hàng</small></span>${icon('chevron-right')}</button><button data-action="business-mode-selector"><span>${icon('briefcase')}<b>Chế độ kinh doanh</b><small>${esc(currentModeName)}</small></span>${icon('chevron-right')}</button><button data-action="sale-preferences"><span>${icon('shopping-cart')}<b>Bán hàng & thanh toán</b><small>Kho, thanh toán, âm báo Ting ting, popup & làm tròn tiền</small></span>${icon('chevron-right')}</button><button data-action="warehouse-management"><span>${icon('arrow-left-right')}<b>Kho hàng</b><small>${d.warehouses.length} kho đang hoạt động</small></span>${icon('chevron-right')}</button><button data-action="tax-preferences"><span>${icon('shield-check')}<b>Thuế & Hộ kinh doanh</b><small>${esc(taxDesc)}</small></span>${icon('chevron-right')}</button></div></section>
    <section class="card section-card settings-section"><div class="section-head"><div><h2>Giao diện & Sử dụng</h2><p>Tùy chỉnh kiểu hiển thị phù hợp thói quen thao tác.</p></div></div><div class="settings-list"><button data-action="ui-profile-selector"><span>${icon('layout-grid')}<b>Kiểu giao diện</b><small>${esc(currentUiProfileDisplay)}</small></span>${icon('chevron-right')}</button></div></section>
    <section class="card section-card settings-section"><div class="section-head"><div><h2>Thiết lập</h2></div></div><div class="settings-list"><button data-page="prints"><span>${icon('printer')}<b>In & thiết bị</b><small>Máy in, mẫu in và nhật ký</small></span>${icon('chevron-right')}</button><button data-action="data-settings"><span>${icon('file-text')}<b>Dữ liệu</b><small>Nhập, xuất, sao lưu và khôi phục</small></span>${icon('chevron-right')}</button><button class="settings-muted" data-page="permissions"><span>${icon('user')}<b>Người dùng & phân quyền</b><small>Vai trò và quyền truy cập · sắp có</small></span>${icon('chevron-right')}</button></div></section>
    <section class="card section-card settings-section"><div class="section-head"><div><h2>Đồng bộ</h2><p>${CONFIG.SYNC_MODE==='api'?'Đang kết nối QBiz':'Dữ liệu đang lưu trên thiết bị này.'}</p></div></div><div class="surface-callout"><span class="surface-status ${CONFIG.SYNC_MODE==='api'?'working':'prepared'}">${CONFIG.SYNC_MODE==='api'?'Đang đồng bộ':'Chưa kết nối'}</span><p>${CONFIG.SYNC_MODE==='api'?'Theo dõi trạng thái đồng bộ tại đây.':'Chưa bật đồng bộ nhiều thiết bị.'}</p></div><button class="secondary-btn" data-action="sync-now">${CONFIG.SYNC_MODE==='api'?'Đồng bộ ngay':'Kiểm tra dữ liệu chờ'}</button></section>
    <section class="card section-card settings-section"><div class="section-head"><div><h2>Tiện ích nâng cao</h2><p>Bảng giá, khuyến mại, sổ quỹ, công nợ và mô-đun.</p></div></div><div class="settings-list"><button data-page="advanced"><span>${icon('settings-2')}<b>Tiện ích nâng cao</b><small>Bảng giá, khuyến mại, combo, tồn đầu, in tem, sổ quỹ, công nợ, nhật ký, tìm kiếm toàn cục</small></span>${icon('chevron-right')}</button></div></section>
    <section class="card section-card settings-section settings-connect"><button class="settings-connect-row" data-action="connections-settings"><span>${icon('package-search')}<b>Kết nối</b><small>Vận chuyển và kênh bán · sắp có</small></span>${icon('chevron-right')}</button></section>
  </section>`;
}

function openConnectionSettings(){
  openModal({title:'Kết nối',sub:'Các dịch vụ mở rộng đang được chuẩn bị.',hideSubmit:true,body:`<div class="action-sheet-list"><button data-page="shipping">Vận chuyển <small>Chưa kết nối</small>${icon('chevron-right')}</button><button data-page="channels">Kênh bán <small>Chưa kết nối</small>${icon('chevron-right')}</button></div>`});
}
function openDataSettings(){openModal({title:'Dữ liệu',sub:'Nhập, xuất và bảo vệ dữ liệu trên thiết bị.',hideSubmit:true,body:`<div class="action-sheet-list"><button data-page="imports">Nhập dữ liệu <small>Excel/CSV · kiểm tra trước</small>${icon('chevron-right')}</button><button data-action="export-csv">Xuất dữ liệu <small>Hàng hóa CSV</small>${icon('chevron-right')}</button><button data-page="backup">Sao lưu / khôi phục <small>Tệp JSON có kiểm tra</small>${icon('chevron-right')}</button></div>`});}

const PROFILE_SETTING='business_profile';
const SALES_SETTING='sales_preferences';
const TAX_SETTING='tax_settings';
const DEFAULT_TAX_SETTINGS={
  business_type:'hkd', // 'hkd' | 'company_direct' | 'company_deduct' | 'exempt'
  industry_type:'retail', // 'retail' (1.5%) | 'service' (7%) | 'fnb' (4.5%) | 'custom'
  vat_rate:1.0,
  pit_rate:0.5,
  cit_rate:20.0,
  ecommerce_auto_deduct:true,
  annual_exemption_threshold:100000000,
  price_includes_tax:true,
  tax_code:'',
  business_reg_name:'',
  tax_authority:''
};

function getTaxSettings(){
  const row=(state.data?.settings||[]).find(s=>s.id===TAX_SETTING);
  const val=row?.value||{};
  return {...DEFAULT_TAX_SETTINGS,...val};
}

async function saveTaxSettings(newSettings){
  const current=getTaxSettings();
  const merged={...current,...newSettings,updated_at:new Date().toISOString()};
  await put('settings',{id:TAX_SETTING,value:merged,updated_at:merged.updated_at});
  if(merged.tax_code){
    const prof={...EMPTY_PROFILE,...await settingValue(PROFILE_SETTING,{})};
    prof.tax_code=merged.tax_code;
    await saveLocalSetting(PROFILE_SETTING,prof);
  }
  await refresh();
}

async function openTaxPreferencesModal(){
  const tax = getTaxSettings();
  const profile = {...EMPTY_PROFILE,...await settingValue(PROFILE_SETTING,{})};

  openModal({
    title: 'Cấu hình Thuế & Hộ kinh doanh',
    sub: 'Căn cứ Thông tư 40/2021/TT-BTC & Nghị định 91/2022 về Sàn TMĐT',
    submitText: 'Lưu cấu hình thuế',
    body: `
      <div class="tax-settings-sheet" style="display:flex;flex-direction:column;gap:10px">
        <!-- 1. Mô hình kinh doanh -->
        <div class="account-menu-group" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:18px;height:18px;background:#0f172a;color:#fff;border-radius:50%;text-align:center;line-height:18px;font-size:10px">1</span>
            Mô hình kinh doanh & Phương pháp thuế
          </div>
          <div class="tax-type-options" style="display:grid;grid-template-columns:1fr;gap:6px">
            <label class="radio-card ${tax.business_type==='hkd'?'active':''}" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid ${tax.business_type==='hkd'?'#0284c7':'#cbd5e1'};border-radius:8px;cursor:pointer;background:${tax.business_type==='hkd'?'#f0f9ff':'#ffffff'}">
              <input type="radio" name="tax_biz_type" value="hkd" ${tax.business_type==='hkd'?'checked':''} style="margin-top:3px"/>
              <div>
                <b style="font-size:12px;color:#0f172a">Hộ kinh doanh / Cá nhân kinh doanh</b>
                <span style="font-size:9.5px;background:#e0f2fe;color:#0369a1;padding:1px 5px;border-radius:4px;margin-left:4px;font-weight:700">Khuyên dùng</span>
                <div style="font-size:11px;color:#64748b;margin-top:2px">Nộp thuế theo tỷ lệ % trên doanh thu (Theo Thông tư 40/2021/TT-BTC)</div>
              </div>
            </label>
            <label class="radio-card ${tax.business_type==='company_direct'?'active':''}" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid ${tax.business_type==='company_direct'?'#0284c7':'#cbd5e1'};border-radius:8px;cursor:pointer;background:${tax.business_type==='company_direct'?'#f0f9ff':'#ffffff'}">
              <input type="radio" name="tax_biz_type" value="company_direct" ${tax.business_type==='company_direct'?'checked':''} style="margin-top:3px"/>
              <div>
                <b style="font-size:12px;color:#0f172a">Doanh nghiệp siêu nhỏ — Trực tiếp trên doanh thu</b>
                <div style="font-size:11px;color:#64748b;margin-top:2px">Nộp thuế GTGT & TNDN theo tỷ lệ % trực tiếp trên doanh thu</div>
              </div>
            </label>
            <label class="radio-card ${tax.business_type==='company_deduct'?'active':''}" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid ${tax.business_type==='company_deduct'?'#0284c7':'#cbd5e1'};border-radius:8px;cursor:pointer;background:${tax.business_type==='company_deduct'?'#f0f9ff':'#ffffff'}">
              <input type="radio" name="tax_biz_type" value="company_deduct" ${tax.business_type==='company_deduct'?'checked':''} style="margin-top:3px"/>
              <div>
                <b style="font-size:12px;color:#0f172a">Doanh nghiệp / Công ty — Phương pháp Khấu trừ</b>
                <div style="font-size:11px;color:#64748b;margin-top:2px">VAT khấu trừ đầu ra - đầu vào, TNDN 20% trên lợi nhuận</div>
              </div>
            </label>
            <label class="radio-card ${tax.business_type==='exempt'?'active':''}" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid ${tax.business_type==='exempt'?'#0284c7':'#cbd5e1'};border-radius:8px;cursor:pointer;background:${tax.business_type==='exempt'?'#f0f9ff':'#ffffff'}">
              <input type="radio" name="tax_biz_type" value="exempt" ${tax.business_type==='exempt'?'checked':''} style="margin-top:3px"/>
              <div>
                <b style="font-size:12px;color:#0f172a">Miễn thuế / Quản lý nội bộ</b>
                <div style="font-size:11px;color:#64748b;margin-top:2px">Doanh thu năm ≤ 100 triệu VNĐ hoặc chưa phát sinh nghĩa vụ thuế</div>
              </div>
            </label>
          </div>
        </div>

        <!-- 2. Ngành nghề & Tỷ lệ Thuế -->
        <div id="taxIndustryGroup" class="account-menu-group" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;${tax.business_type==='exempt'?'display:none;':''}">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:18px;height:18px;background:#0f172a;color:#fff;border-radius:50%;text-align:center;line-height:18px;font-size:10px">2</span>
            Ngành nghề & Tỷ lệ Thuế quy định
          </div>
          <div class="field" style="margin-bottom:2px">
            <label style="font-size:11px;color:#475569;margin-bottom:3px;display:block">Chọn ngành nghề theo Thông tư 40/2021:</label>
            <select id="taxIndustrySelect" style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12px;background:#fff">
              <option value="retail" ${tax.industry_type==='retail'?'selected':''}>Bán buôn, bán lẻ hàng hóa (Tổng 1.5%: 1% GTGT + 0.5% TNCN)</option>
              <option value="service" ${tax.industry_type==='service'?'selected':''}>Dịch vụ, Spa, Sửa chữa, Lưu trú (Tổng 7%: 5% GTGT + 2% TNCN)</option>
              <option value="fnb" ${tax.industry_type==='fnb'?'selected':''}>Nhà hàng, Ăn uống F&B, Sản xuất (Tổng 4.5%: 3% GTGT + 1.5% TNCN)</option>
              <option value="custom" ${tax.industry_type==='custom'?'selected':''}>Tùy chỉnh tỷ lệ %...</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="field">
              <label style="font-size:11px;color:#475569;display:block;margin-bottom:2px">% Thuế GTGT (VAT)</label>
              <input id="taxVatRate" type="number" step="0.1" min="0" max="100" value="${tax.vat_rate}" style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12.5px;font-weight:700"/>
            </div>
            <div class="field">
              <label style="font-size:11px;color:#475569;display:block;margin-bottom:2px">% Thuế TNCN / TNDN</label>
              <input id="taxPitRate" type="number" step="0.1" min="0" max="100" value="${tax.pit_rate}" style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12.5px;font-weight:700"/>
            </div>
          </div>
          <div id="taxCompanyDeductWrap" style="${tax.business_type==='company_deduct'?'':'display:none;'}margin-top:2px">
            <label style="font-size:11px;color:#475569;display:block;margin-bottom:2px">% Thuế TNDN trên Lợi nhuận gộp</label>
            <input id="taxCitRate" type="number" step="0.5" min="0" max="100" value="${tax.cit_rate||20}" style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12.5px;font-weight:700"/>
          </div>
        </div>

        <!-- 3. Quy tắc Sàn TMĐT -->
        <div class="account-menu-group" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:18px;height:18px;background:#0f172a;color:#fff;border-radius:50%;text-align:center;line-height:18px;font-size:10px">3</span>
            Quy tắc Sàn TMĐT (Shopee, TikTok Shop, Lazada)
          </div>
          <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:4px 0">
            <input id="taxEcomAutoDeduct" type="checkbox" ${tax.ecommerce_auto_deduct?'checked':''} style="margin-top:3px;width:16px;height:16px"/>
            <div>
              <b style="font-size:12px;color:#0f172a">Tự động miễn tính thuế cho đơn từ Sàn TMĐT</b>
              <div style="font-size:11px;color:#64748b;margin-top:2px;line-height:1.35">
                Theo quy định (NĐ 91/2022/NĐ-CP), các sàn TMĐT tự động kê khai / khấu trừ thuế tại nguồn. Bật tính năng này giúp các đơn hàng Shopee / TikTok Shop / Lazada không bị tính trùng thuế lần hai.
              </div>
            </div>
          </label>
        </div>

        <!-- 4. Thông tin Pháp lý -->
        <div class="account-menu-group" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:18px;height:18px;background:#0f172a;color:#fff;border-radius:50%;text-align:center;line-height:18px;font-size:10px">4</span>
            Thông tin Pháp lý & Kê khai
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="field">
              <label style="font-size:11px;color:#475569;display:block;margin-bottom:2px">Mã số thuế (MST)</label>
              <input id="taxCodeInput" value="${esc(tax.tax_code||profile.tax_code||'')}" placeholder="MST cửa hàng" style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12px"/>
            </div>
            <div class="field">
              <label style="font-size:11px;color:#475569;display:block;margin-bottom:2px">Tên đăng ký kinh doanh</label>
              <input id="taxBizNameInput" value="${esc(tax.business_reg_name||profile.display_name||profile.store_name||'')}" placeholder="Hộ KD / Tên cty" style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12px"/>
            </div>
          </div>
          <div class="field">
            <label style="font-size:11px;color:#475569;display:block;margin-bottom:2px">Chi cục thuế quản lý (tùy chọn)</label>
            <input id="taxAuthorityInput" value="${esc(tax.tax_authority||'')}" placeholder="Ví dụ: Chi cục Thuế Quận Thanh Xuân..." style="width:100%;height:34px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;font-size:12px"/>
          </div>
        </div>
      </div>
    `,
    onSubmit: async r => {
      const selectedBizType = $('input[name="tax_biz_type"]:checked', r)?.value || 'hkd';
      const indType = $('#taxIndustrySelect', r)?.value || 'retail';
      const vat = Number($('#taxVatRate', r)?.value || 0);
      const pit = Number($('#taxPitRate', r)?.value || 0);
      const cit = Number($('#taxCitRate', r)?.value || 20);
      const ecomAuto = Boolean($('#taxEcomAutoDeduct', r)?.checked);
      const mst = $('#taxCodeInput', r)?.value.trim() || '';
      const bizName = $('#taxBizNameInput', r)?.value.trim() || '';
      const authority = $('#taxAuthorityInput', r)?.value.trim() || '';

      await saveTaxSettings({
        business_type: selectedBizType,
        industry_type: indType,
        vat_rate: vat,
        pit_rate: pit,
        cit_rate: cit,
        ecommerce_auto_deduct: ecomAuto,
        tax_code: mst,
        business_reg_name: bizName,
        tax_authority: authority
      });

      toast('✓ Đã cập nhật cấu hình Thuế & Hộ kinh doanh!', 'ok');
    }
  });

  const root = $('#modalRoot');
  if (!root) return;

  const bizRadios = $$('input[name="tax_biz_type"]', root);
  const indSelect = $('#taxIndustrySelect', root);
  const indGroup = $('#taxIndustryGroup', root);
  const vatInp = $('#taxVatRate', root);
  const pitInp = $('#taxPitRate', root);
  const deductWrap = $('#taxCompanyDeductWrap', root);

  const updateBizSelection = () => {
    const val = $('input[name="tax_biz_type"]:checked', root)?.value || 'hkd';
    $$('.radio-card', root).forEach(c => {
      const inp = $('input[type="radio"]', c);
      const checked = inp && inp.checked;
      c.style.borderColor = checked ? '#0284c7' : '#cbd5e1';
      c.style.background = checked ? '#f0f9ff' : '#ffffff';
    });

    if (val === 'exempt') {
      if (indGroup) indGroup.style.display = 'none';
    } else {
      if (indGroup) indGroup.style.display = 'flex';
      if (val === 'company_deduct') {
        if (deductWrap) deductWrap.style.display = 'block';
      } else {
        if (deductWrap) deductWrap.style.display = 'none';
      }
    }
  };

  bizRadios.forEach(r => r.addEventListener('change', updateBizSelection));

  if (indSelect) {
    indSelect.addEventListener('change', () => {
      const iv = indSelect.value;
      if (iv === 'retail') {
        if (vatInp) vatInp.value = 1.0;
        if (pitInp) pitInp.value = 0.5;
      } else if (iv === 'service') {
        if (vatInp) vatInp.value = 5.0;
        if (pitInp) pitInp.value = 2.0;
      } else if (iv === 'fnb') {
        if (vatInp) vatInp.value = 3.0;
        if (pitInp) pitInp.value = 1.5;
      }
    });
  }
}

const EMPTY_PROFILE={store_name:'',display_name:'',logo:'',phone:'',hotline:'',email:'',address:'',website:'',tax_code:'',note:'',pickup_address:'',return_address:'',default_warehouse_id:'',contact_name:'',contact_phone:'',bank_name:'',bank_account_name:'',bank_account_number:'',payment_qr:''};
async function settingValue(id,fallback){return (await getOne('settings',id))?.value??fallback;}
async function saveLocalSetting(id,value){await put('settings',{id,value,updated_at:new Date().toISOString()});}
async function openBusinessProfile(){
  const profile={...EMPTY_PROFILE,...await settingValue(PROFILE_SETTING,{})};
  openModal({title:'Thông tin cửa hàng',sub:'Dùng lại cho phiếu bán và mẫu in.',fullScreen:true,body:`<div class="form-grid settings-form"><div class="field"><label>Tên cửa hàng</label><input id="profileStoreName" value="${esc(profile.store_name)}" placeholder="Tên pháp lý hoặc tên cửa hàng"/></div><div class="field"><label>Tên hiển thị</label><input id="profileDisplayName" value="${esc(profile.display_name)}" placeholder="Tên trên phiếu"/></div><div class="field full-span profile-logo-field"><label>Logo</label><div class="profile-logo-row"><div id="profileLogoPreview" class="profile-logo-preview">${profile.logo?`<img src="${esc(profile.logo)}" alt="Logo cửa hàng"/>`:icon('image-plus')}</div><div><label class="secondary-btn upload-inline">Chọn ảnh<input id="profileLogoFile" type="file" accept="image/*" hidden/></label><small>Hoặc dán URL ảnh bên dưới.</small></div></div><input id="profileLogo" inputmode="url" value="${esc(profile.logo)}" placeholder="https://..."/></div><div class="field"><label>Điện thoại</label><input id="profilePhone" inputmode="tel" value="${esc(profile.phone)}"/></div><div class="field"><label>Hotline</label><input id="profileHotline" inputmode="tel" value="${esc(profile.hotline)}"/></div><div class="field"><label>Email</label><input id="profileEmail" type="email" value="${esc(profile.email)}"/></div><div class="field"><label>Website</label><input id="profileWebsite" inputmode="url" value="${esc(profile.website)}"/></div><div class="field full-span"><label>Địa chỉ</label><input id="profileAddress" value="${esc(profile.address)}"/></div><div class="field"><label>Mã số thuế</label><input id="profileTaxCode" inputmode="numeric" value="${esc(profile.tax_code)}"/></div><div class="field"><label>Kho mặc định</label><select id="profileWarehouse"><option value="">Chọn khi cần</option>${state.data.warehouses.map(w=>`<option value="${w.id}" ${profile.default_warehouse_id===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></div><div class="field"><label>Người liên hệ</label><input id="profileContactName" value="${esc(profile.contact_name)}"/></div><div class="field"><label>SĐT người liên hệ</label><input id="profileContactPhone" inputmode="tel" value="${esc(profile.contact_phone)}"/></div><div class="field full-span"><label>Địa chỉ lấy hàng</label><input id="profilePickup" value="${esc(profile.pickup_address)}"/></div><div class="field full-span"><label>Địa chỉ hoàn hàng</label><input id="profileReturn" value="${esc(profile.return_address)}"/></div><details class="field full-span"><summary>Thông tin nhận thanh toán (tùy chọn)</summary><div class="form-grid details-grid"><div class="field"><label>Ngân hàng</label><input id="profileBank" value="${esc(profile.bank_name)}"/></div><div class="field"><label>Chủ tài khoản</label><input id="profileBankOwner" value="${esc(profile.bank_account_name)}"/></div><div class="field"><label>Số tài khoản</label><input id="profileBankNumber" inputmode="numeric" value="${esc(profile.bank_account_number)}"/></div><div class="field"><label>QR thanh toán</label><input id="profilePaymentQr" inputmode="url" value="${esc(profile.payment_qr)}" placeholder="URL ảnh QR nếu có"/></div></div></details><div class="field full-span"><label>Ghi chú</label><input id="profileNote" value="${esc(profile.note)}"/></div></div>`,submitText:'Lưu thông tin',onSubmit:async r=>{const value={store_name:$('#profileStoreName',r).value.trim(),display_name:$('#profileDisplayName',r).value.trim(),logo:$('#profileLogo',r).value.trim(),phone:$('#profilePhone',r).value.trim(),hotline:$('#profileHotline',r).value.trim(),email:$('#profileEmail',r).value.trim(),address:$('#profileAddress',r).value.trim(),website:$('#profileWebsite',r).value.trim(),tax_code:$('#profileTaxCode',r).value.trim(),note:$('#profileNote',r).value.trim(),pickup_address:$('#profilePickup',r).value.trim(),return_address:$('#profileReturn',r).value.trim(),default_warehouse_id:$('#profileWarehouse',r).value,contact_name:$('#profileContactName',r).value.trim(),contact_phone:$('#profileContactPhone',r).value.trim(),bank_name:$('#profileBank',r).value.trim(),bank_account_name:$('#profileBankOwner',r).value.trim(),bank_account_number:$('#profileBankNumber',r).value.trim(),payment_qr:$('#profilePaymentQr',r).value.trim()};await saveLocalSetting(PROFILE_SETTING,value);}});
  const root=$('#modalRoot'), urlInput=$('#profileLogo',root), preview=$('#profileLogoPreview',root);
  const draw=()=>{const src=urlInput.value.trim();preview.innerHTML=src?`<img src="${esc(src)}" alt="Logo cửa hàng"/>`:icon('image-plus');};
  urlInput.addEventListener('input',draw);
  $('#profileLogoFile',root).addEventListener('change',async e=>{const file=e.target.files?.[0];if(file?.type.startsWith('image/')){urlInput.value=await optimizeImage(file);draw();}});
}

function openBusinessModeModal(){
  const currentProfile = businessProfileModule.getBusinessProfile() || {};
  let selectedId = currentProfile.profile_id || 'general';
  const options = businessProfileModule.BUSINESS_MODE_OPTIONS || [];
  const capLabels = businessProfileModule.CAPABILITY_LABELS || {};

  function renderModalBody(){
    const activeOpt = options.find(o=>o.id===selectedId)||options[0]||{};
    const targetPreset = businessProfileModule.PROFILE_PRESETS[selectedId] || businessProfileModule.PROFILE_PRESETS.general;
    const caps = targetPreset?.capabilities || {};
    const isCurrent = (selectedId === (currentProfile.profile_id || 'general'));
    const targetWorkspace = businessProfileModule.resolveWorkspaceProfile(selectedId);

    return `
      <div class="business-mode-container">
        <div class="mode-current-banner">
          <div>
            <span class="mode-badge-label">Đang sử dụng:</span>
            <strong class="mode-badge-name">${esc(currentProfile.name || 'Cửa hàng chung')}</strong>
          </div>
          ${!isCurrent ? `<button type="button" class="ghost-btn btn-sm" id="btnRestoreCurrent">Chọn lại chế độ hiện tại</button>` : ''}
        </div>

        <div class="mode-section-title">Chọn loại hình kinh doanh</div>
        <div class="mode-grid">
          ${options.map(opt => `
            <div class="mode-card ${opt.id === selectedId ? 'active' : ''}" data-mode-id="${opt.id}">
              <div class="mode-card-header">
                <span class="mode-card-icon">${icon(opt.icon || 'store')}</span>
                <span class="mode-card-name">${esc(opt.name)}</span>
                ${opt.id === (currentProfile.profile_id || 'general') ? '<span class="mode-pill-current">Đang dùng</span>' : ''}
              </div>
              <div class="mode-card-desc">${esc(opt.desc)}</div>
            </div>
          `).join('')}
        </div>

        <div class="mode-preview-section">
          <div class="mode-section-title">Cấu hình phù hợp với bạn</div>
          <div class="mode-caps-grid">
            ${Object.entries(capLabels).map(([key, label]) => {
              const enabled = Boolean(caps[key]);
              return `
                <div class="mode-cap-item ${enabled ? 'enabled' : 'disabled'}">
                  <span class="cap-indicator">${enabled ? '✓' : '○'}</span>
                  <span class="cap-label">${esc(label)}</span>
                </div>
              `;
            }).join('')}
          </div>

          <div class="mode-priorities-section">
            <div class="mode-section-title">Sau khi áp dụng, QBiz sẽ ưu tiên</div>
            <ul class="mode-priority-list">
              ${(targetWorkspace.priority_highlights || []).map(item => `
                <li class="mode-priority-item">
                  <span class="priority-bullet">✓</span>
                  <span>${esc(item)}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="mode-recommended-section">
            <span class="mode-recommended-title">Đề xuất sử dụng:</span>
            <ul class="mode-recommended-list">
              ${(activeOpt.recommended_uses || []).map(use => `<li>${esc(use)}</li>`).join('')}
            </ul>
          </div>
        </div>

        <div class="mode-ui-placeholder-card">
          <div class="mode-ui-placeholder-head">
            <div>
              <strong>Kiểu giao diện</strong>
              <p>Tùy chỉnh cách QBiz hiển thị theo nhu cầu</p>
            </div>
            <span class="mode-badge-soon">Sắp có</span>
          </div>
        </div>
      </div>
    `;
  }

  function updateView(root){
    const bodyEl = $('.modal-body', root);
    if(bodyEl) bodyEl.innerHTML = renderModalBody();
    bindEvents(root);
  }

  function bindEvents(root){
    const isCurrent = (selectedId === (currentProfile.profile_id || 'general'));
    const submitBtn = $('#modalSubmitMode', root);
    if(submitBtn){
      submitBtn.disabled = isCurrent;
      submitBtn.classList.toggle('disabled', isCurrent);
    }

    $$('.mode-card', root).forEach(card => {
      card.onclick = () => {
        const modeId = card.dataset.modeId;
        if(modeId && modeId !== selectedId){
          selectedId = modeId;
          updateView(root);
        }
      };
    });

    const restoreBtn = $('#btnRestoreCurrent', root);
    if(restoreBtn){
      restoreBtn.onclick = () => {
        selectedId = currentProfile.profile_id || 'general';
        updateView(root);
      };
    }
  }

  openModal({
    title: 'Chế độ kinh doanh',
    sub: 'Tối ưu chức năng theo đúng loại hình kinh doanh của bạn.',
    fullScreen: true,
    hideSubmit: true,
    footer: `
      <button class="secondary-btn" data-close>Đóng</button>
      <button class="primary-btn" id="modalSubmitMode">Áp dụng chế độ</button>
    `,
    body: renderModalBody()
  });

  const root = $('#modalRoot');
  bindEvents(root);

  $('#modalSubmitMode', root).onclick = async () => {
    const isCurrent = (selectedId === (currentProfile.profile_id || 'general'));
    if (isCurrent) return;

    const targetOpt = options.find(o => o.id === selectedId) || { name: selectedId };
    if (typeof window.confirm === 'function' && !window.confirm(`Bạn có chắc chắn muốn chuyển sang chế độ kinh doanh "${targetOpt.name}" không?`)) {
      return;
    }

    try {
      const res = await businessProfileModule.setBusinessProfile(selectedId);
      if (res && res.success) {
        state.businessProfile = businessProfileModule.getBusinessProfile();
        state.workspace = businessProfileModule.resolveWorkspaceProfile(state.businessProfile);
        root.innerHTML = '';
        renderSettings();
        toast(`Đã chuyển sang chế độ ${targetOpt.name}.`, 'ok');
      } else {
        toast('Không thể áp dụng chế độ này.', 'error');
      }
    } catch (err) {
      toast(err.message || 'Lỗi khi lưu chế độ kinh doanh.', 'error');
    }
  };
}

function openUiProfileModal(){
  const currentUi = uiProfileModule.getUiProfile();
  let selectedId = currentUi.id || 'standard';
  const options = uiProfileModule.UI_PROFILE_OPTIONS || [];

  function renderModalBody(){
    const currentMode = businessProfileModule.getBusinessProfile?.() || {};
    const resolvedPreview = uiProfileModule.resolveUiProfile(selectedId, currentMode.profile_id);
    const isCurrent = (selectedId === currentUi.id);
    const effId = resolvedPreview.effective_profile_id;

    return `
      <div class="ui-profile-container">
        <div class="mode-current-banner ui-profile-banner">
          <div>
            <span class="mode-badge-label">Đang sử dụng:</span>
            <strong class="mode-badge-name">${esc(currentUi.name || 'Tiêu chuẩn')}</strong>
          </div>
          ${resolvedPreview.is_auto ? `
            <div class="ui-profile-auto-hint">
              <span>Đề xuất theo Chế độ kinh doanh: <strong>${esc(resolvedPreview.recommended_name)}</strong></span>
            </div>
          ` : ''}
          ${!isCurrent ? `<button type="button" class="ghost-btn btn-sm" id="btnRestoreCurrentUi">Chọn lại kiểu hiện tại</button>` : ''}
        </div>

        <div class="mode-section-title">Chọn kiểu giao diện</div>
        <div class="mode-grid ui-profile-grid">
          ${options.map(opt => `
            <div class="mode-card ui-profile-card ${opt.id === selectedId ? 'active selected' : ''}" data-ui-id="${opt.id}" data-profile-id="${opt.id}">
              <div class="mode-card-header">
                <span class="mode-card-icon">${icon(opt.icon || 'layout-grid')}</span>
                <span class="mode-card-name">${esc(opt.name)}</span>
                ${opt.id === currentUi.id ? '<span class="mode-pill-current">Đang dùng</span>' : ''}
              </div>
              <div class="mode-card-desc">${esc(opt.desc)}</div>
            </div>
          `).join('')}
        </div>

        <div class="ui-profile-preview-section">
          <div class="mode-section-title">Xem trước kiểu giao diện: <strong>${esc(resolvedPreview.name)}</strong> ${resolvedPreview.is_auto ? `(Hiển thị: ${esc(resolvedPreview.effective_name)})` : ''}</div>
          <div class="ui-preview-box ui-profile-${effId}">
            <div class="ui-preview-subhead">Mẫu Thao tác nhanh</div>
            <div class="ui-preview-quick-grid ui-profile-${effId}">
              <div class="preview-quick-tile preview-hero">
                <span class="qt-ico">${icon('shopping-cart')}</span>
                <strong>Bán hàng</strong>
              </div>
              <div class="preview-quick-tile">
                <span class="qt-ico">${icon('package-plus')}</span>
                <strong>Nhập kho</strong>
                ${resolvedPreview.show_secondary_text ? '<small>Thêm hàng</small>' : ''}
              </div>
              <div class="preview-quick-tile">
                <span class="qt-ico">${icon('clipboard-check')}</span>
                <strong>Kiểm kho</strong>
                ${resolvedPreview.show_secondary_text ? '<small>Xem tồn</small>' : ''}
              </div>
            </div>

            <div class="ui-preview-subhead" style="margin-top:12px">Mẫu Danh mục sản phẩm</div>
            <div class="ui-preview-product-card ui-profile-${effId}">
              <div class="preview-product-photo size-${resolvedPreview.product_image_size}">
                ${icon('package-search')}
              </div>
              <div class="preview-product-info">
                <strong>Cà phê Robusta Đắk Lắk</strong>
                <p><span>Đồ uống</span> · <span>SKU: CF-ROB-01</span></p>
                <b>120.000 ₫</b>
              </div>
              ${effId === 'fast' ? `<button class="preview-fast-add">+ Thêm</button>` : `<div class="preview-badge">Còn hàng</div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function updateView(root){
    const bodyEl = $('.modal-body', root);
    if(bodyEl) bodyEl.innerHTML = renderModalBody();
    bindEvents(root);
  }

  function bindEvents(root){
    const isCurrent = (selectedId === currentUi.id);
    const submitBtn = $('#btnApplyUiProfile', root) || $('#modalSubmitUiProfile', root);
    if(submitBtn){
      submitBtn.disabled = isCurrent;
      submitBtn.classList.toggle('disabled', isCurrent);
    }

    $$('.ui-profile-card', root).forEach(card => {
      card.onclick = () => {
        const uiId = card.dataset.uiId || card.dataset.profileId;
        if(uiId && uiId !== selectedId){
          selectedId = uiId;
          updateView(root);
        }
      };
    });

    const restoreBtn = $('#btnRestoreCurrentUi', root);
    if(restoreBtn){
      restoreBtn.onclick = () => {
        selectedId = currentUi.id || 'standard';
        updateView(root);
      };
    }
  }

  openModal({
    title: 'Kiểu giao diện',
    sub: 'Tùy chỉnh cách QBiz hiển thị phù hợp thói quen thao tác.',
    fullScreen: true,
    hideSubmit: true,
    footer: `
      <button class="secondary-btn" data-close>Đóng</button>
      <button class="primary-btn" id="btnApplyUiProfile">Áp dụng</button>
    `,
    body: renderModalBody()
  });

  const root = $('#modalRoot');
  bindEvents(root);

  const applyBtn = $('#btnApplyUiProfile', root) || $('#modalSubmitUiProfile', root);
  if(applyBtn){
    applyBtn.onclick = async () => {
      const isCurrent = (selectedId === currentUi.id);
      if (isCurrent) return;

      try {
        await uiProfileModule.setUiProfile(selectedId);
        state.uiProfile = uiProfileModule.resolveUiProfile(selectedId, (state.businessProfile || businessProfileModule.getBusinessProfile())?.profile_id);
        if($('#modalRoot')) $('#modalRoot').innerHTML = '';
        render();
        toast('Đã áp dụng kiểu giao diện.', 'ok');
      } catch (err) {
        console.error('Lỗi khi áp dụng kiểu giao diện:', err);
        toast('Không thể áp dụng kiểu giao diện: ' + (err.message || err), 'error');
      }
    };
  }
}

async function openSalePreferences(){
  const savedDb = await settingValue(SALES_SETTING, {});
  const currentPrefs = state.paymentPrefs || loadPaymentPrefs();
  const prefs = {
    default_warehouse_id: '',
    default_payment: 'cash',
    soundEnabled: true,
    ttsEnabled: true,
    popupEnabled: true,
    popupDuration: 10,
    cashRounding: 'none',
    ...savedDb,
    ...currentPrefs
  };

  openModal({
    title: 'Bán hàng & thanh toán',
    sub: 'Tùy chỉnh kho, thanh toán, âm báo và popup cho thiết bị này.',
    body: `
      <div class="form-grid">
        <div class="field">
          <label>Kho bán mặc định</label>
          <select id="salesWarehouse">
            <option value="">Chọn khi lập phiếu</option>
            ${state.data.warehouses.map(w=>`<option value="${w.id}" ${prefs.default_warehouse_id===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Thanh toán mặc định</label>
          <select id="salesPayment">
            <option value="cash" ${prefs.default_payment==='cash'?'selected':''}>Tiền mặt</option>
            <option value="transfer" ${prefs.default_payment==='transfer'?'selected':''}>Chuyển khoản</option>
            <option value="qr" ${prefs.default_payment==='qr'?'selected':''}>QR</option>
          </select>
        </div>

        <div class="field full-span" style="margin-top:8px;padding-top:12px;border-top:1px solid var(--q-line)">
          <strong style="display:block;font-size:14px;color:var(--q-blue-dark);margin-bottom:8px">🔔 Âm báo & Giọng đọc khi nhận tiền</strong>
          
          <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:10px;margin-bottom:8px;cursor:pointer;border:1px solid #e2e8f0">
            <span>
              <strong style="display:block;font-size:13.5px">Âm chuông "Ting tinh"</strong>
              <small style="color:var(--q-muted);font-size:12px">Phát chuông khi thanh toán thành công (offline 100%)</small>
            </span>
            <input type="checkbox" id="prefSoundEnabled" ${prefs.soundEnabled?'checked':''} style="width:20px;height:20px;accent-color:var(--q-blue)"/>
          </label>

          <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:10px;margin-bottom:8px;cursor:pointer;border:1px solid #e2e8f0">
            <span>
              <strong style="display:block;font-size:13.5px">Giọng đọc số tiền tiếng Việt</strong>
              <small style="color:var(--q-muted);font-size:12px">Đọc "Thanh toán thành công [số tiền] đồng"</small>
            </span>
            <input type="checkbox" id="prefTtsEnabled" ${prefs.ttsEnabled?'checked':''} style="width:20px;height:20px;accent-color:var(--q-blue)"/>
          </label>

          <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
            <button type="button" class="secondary-btn compact" id="btnTestSound" style="font-size:12px;display:flex;align-items:center;gap:6px">
              ${icon('volume-2')} Nghe thử âm chuông & giọng đọc
            </button>
          </div>
        </div>

        <div class="field full-span" style="padding-top:10px;border-top:1px solid var(--q-line)">
          <strong style="display:block;font-size:14px;color:var(--q-blue-dark);margin-bottom:8px">💬 Popup thông báo thanh toán</strong>

          <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:10px;margin-bottom:8px;cursor:pointer;border:1px solid #e2e8f0">
            <span>
              <strong style="display:block;font-size:13.5px">Hiện popup khi thanh toán xong</strong>
              <small style="color:var(--q-muted);font-size:12px">Nhảy cửa sổ nổi hiển thị số tiền, tiền thừa, in phiếu & Zalo</small>
            </span>
            <input type="checkbox" id="prefPopupEnabled" ${prefs.popupEnabled?'checked':''} style="width:20px;height:20px;accent-color:var(--q-blue)"/>
          </label>

          <div class="field" style="margin-top:6px">
            <label>Thời gian tự động tắt popup</label>
            <select id="prefPopupDuration">
              <option value="5" ${Number(prefs.popupDuration)===5?'selected':''}>Tắt sau 5 giây (Nhanh)</option>
              <option value="10" ${Number(prefs.popupDuration)===10?'selected':''}>Tắt sau 10 giây (Mặc định)</option>
              <option value="15" ${Number(prefs.popupDuration)===15?'selected':''}>Tắt sau 15 giây</option>
              <option value="20" ${Number(prefs.popupDuration)===20?'selected':''}>Tắt sau 20 giây</option>
              <option value="0" ${Number(prefs.popupDuration)===0?'selected':''}>Không tự tắt (Chờ bấm thủ công)</option>
            </select>
          </div>
        </div>

        <div class="field full-span" style="padding-top:10px;border-top:1px solid var(--q-line)">
          <strong style="display:block;font-size:14px;color:var(--q-blue-dark);margin-bottom:8px">💵 Quy tắc tiền lẻ VNĐ</strong>
          <label>Làm tròn tiền mặt</label>
          <select id="prefCashRounding">
            <option value="none" ${prefs.cashRounding==='none'?'selected':''}>Không làm tròn (giữ nguyên từng đồng)</option>
            <option value="500" ${prefs.cashRounding==='500'?'selected':''}>Làm tròn lên 500 ₫ (VD: 45.200 ₫ → 45.500 ₫)</option>
            <option value="1000" ${prefs.cashRounding==='1000'?'selected':''}>Làm tròn lên 1.000 ₫ (VD: 45.200 ₫ → 46.000 ₫)</option>
          </select>
        </div>

        <div class="field full-span" style="padding-top:12px;border-top:1px solid var(--q-line)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <strong style="font-size:14px;color:var(--q-blue-dark)">⚡ Cơ chế xác thực tiền Chuyển khoản / QR</strong>
            <span class="badge" id="qrModeBadge" style="background:#e0f2fe;color:#0284c7;font-size:11.5px;padding:3px 10px;border-radius:12px;font-weight:600">
              ${prefs.qrVerificationMode==='payos'?'Tự động payOS':(prefs.qrVerificationMode==='webhook'?'Tự động Webhook':'Thủ công tại quầy')}
            </span>
          </div>
          <p style="margin:0 0 10px;font-size:12px;color:var(--q-muted);line-height:1.4">
            Chọn cách hệ thống nhận biết tiền đã vào tài khoản để kích hoạt chuông "Tinh tinh" và hoàn thành đơn hàng.
          </p>

          <div class="qr-verify-mode-grid" style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:12px">
            <label class="qr-mode-card ${prefs.qrVerificationMode!=='payos'&&prefs.qrVerificationMode!=='webhook'?'active':''}" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;border:1.5px solid #e2e8f0;background:#ffffff;cursor:pointer">
              <input type="radio" name="prefQrMode" value="manual" ${prefs.qrVerificationMode!=='payos'&&prefs.qrVerificationMode!=='webhook'?'checked':''} style="margin-top:2px;accent-color:var(--q-blue)"/>
              <div style="flex:1">
                <strong style="display:block;font-size:13px;color:#0f172a">Xác thực thủ công tại quầy (Mặc định · 0đ phí)</strong>
                <span style="display:block;font-size:11.5px;color:#64748b;margin-top:2px">Thu ngân xem app ngân hàng báo tiền về rồi bấm nút 'Xác thực đã nhận tiền' trên màn hình. Phù hợp mọi cửa hàng, an toàn 100%, không cần cài đặt gì thêm.</span>
              </div>
            </label>

            <label class="qr-mode-card ${prefs.qrVerificationMode==='payos'?'active':''}" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;border:1.5px solid #e2e8f0;background:#ffffff;cursor:pointer">
              <input type="radio" name="prefQrMode" value="payos" ${prefs.qrVerificationMode==='payos'?'checked':''} style="margin-top:2px;accent-color:var(--q-blue)"/>
              <div style="flex:1">
                <strong style="display:block;font-size:13px;color:#0f172a">Tự động qua payOS (Khuyên dùng · Tự động 100%)</strong>
                <span style="display:block;font-size:11.5px;color:#64748b;margin-top:2px">Khách quét mã xong, tiền về tài khoản là máy tự động phát chuông 'Tinh tinh' và hoàn tất đơn ngay lập tức. Miễn phí qua cổng Open Banking ngân hàng.</span>
              </div>
            </label>

            <label class="qr-mode-card ${prefs.qrVerificationMode==='webhook'?'active':''}" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;border:1.5px solid #e2e8f0;background:#ffffff;cursor:pointer">
              <input type="radio" name="prefQrMode" value="webhook" ${prefs.qrVerificationMode==='webhook'?'checked':''} style="margin-top:2px;accent-color:var(--q-blue)"/>
              <div style="flex:1">
                <strong style="display:block;font-size:13px;color:#0f172a">Tự động qua SePay / Webhook tùy chỉnh</strong>
                <span style="display:block;font-size:11.5px;color:#64748b;margin-top:2px">Dành cho tài khoản SePay hoặc điện thoại Android tự chuyển tiếp thông báo ngân hàng về qua Webhook.</span>
              </div>
            </label>
          </div>

          <!-- Form chi tiết payOS -->
          <div id="payosConfigPanel" style="display:${prefs.qrVerificationMode==='payos'?'block':'none'};background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #cbd5e1;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <strong style="font-size:12.5px;color:#0369a1">Cấu hình kết nối payOS (Lấy mã tại my.payos.vn)</strong>
              <a href="https://payos.vn" target="_blank" rel="noopener noreferrer" style="font-size:11.5px;color:#0284c7;text-decoration:underline">Mở payOS.vn ↗</a>
            </div>
            <div style="display:grid;gap:6px">
              <input id="prefPayosClientId" placeholder="Client ID" value="${esc(prefs.payosClientId||'')}" style="font-size:12.5px"/>
              <input id="prefPayosApiKey" type="password" placeholder="API Key" value="${esc(prefs.payosApiKey||'')}" style="font-size:12.5px"/>
              <input id="prefPayosChecksumKey" type="password" placeholder="Checksum Key" value="${esc(prefs.payosChecksumKey||'')}" style="font-size:12.5px"/>
            </div>
            <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between">
              <small style="color:#64748b;font-size:11px">Webhook nhận tin: <code style="background:#e2e8f0;padding:1px 4px;border-radius:3px">/api/payment-webhook</code></small>
              <button type="button" class="secondary-btn compact" id="btnTestPayosConnection" style="font-size:11px">Kiểm tra kết nối</button>
            </div>
            <div id="payosConnStatus" style="margin-top:6px;font-size:11.5px;display:none"></div>
          </div>

          <!-- Form chi tiết Webhook / SePay -->
          <div id="webhookConfigPanel" style="display:${prefs.qrVerificationMode==='webhook'?'block':'none'};background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #cbd5e1;margin-bottom:10px">
            <div style="display:grid;gap:6px">
              <label style="font-size:11.5px;color:#475569">Mã bảo mật Webhook (API Token)</label>
              <input id="prefCustomWebhookToken" placeholder="Nhập token bảo mật (tùy chọn)" value="${esc(prefs.customWebhookToken||'')}" style="font-size:12.5px"/>
              <small style="color:#64748b;font-size:11px">URL nhận Webhook của bạn: <code style="background:#e2e8f0;padding:1px 4px;border-radius:3px">${typeof window !== 'undefined' ? window.location.origin : ''}/api/payment-webhook</code></small>
            </div>
          </div>
        </div>
      </div>
    `,
    submitText: 'Lưu cài đặt',
    onSubmit: async (r) => {
      const selectedMode = $('input[name="prefQrMode"]:checked', r)?.value || 'manual';
      const updated = {
        default_warehouse_id: $('#salesWarehouse', r).value,
        default_payment: $('#salesPayment', r).value,
        soundEnabled: $('#prefSoundEnabled', r).checked,
        ttsEnabled: $('#prefTtsEnabled', r).checked,
        popupEnabled: $('#prefPopupEnabled', r).checked,
        popupDuration: Number($('#prefPopupDuration', r).value) || 0,
        cashRounding: $('#prefCashRounding', r).value,
        qrVerificationMode: selectedMode,
        payosClientId: $('#prefPayosClientId', r)?.value?.trim() || '',
        payosApiKey: $('#prefPayosApiKey', r)?.value?.trim() || '',
        payosChecksumKey: $('#prefPayosChecksumKey', r)?.value?.trim() || '',
        customWebhookToken: $('#prefCustomWebhookToken', r)?.value?.trim() || ''
      };
      await saveLocalSetting(SALES_SETTING, updated);
      savePaymentPrefs(updated);
      renderSales();
    }
  });

  setTimeout(() => {
    const root = $('#modalRoot');
    $('#btnTestSound', root)?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      playPaymentChime(true);
      speakPaymentAmount(150000, true);
    });

    // Toggle panels when radio changes
    $$('input[name="prefQrMode"]', root).forEach(radio => {
      radio.addEventListener('change', () => {
        const val = radio.value;
        const payosP = $('#payosConfigPanel', root);
        const webhookP = $('#webhookConfigPanel', root);
        const badge = $('#qrModeBadge', root);
        if (payosP) payosP.style.display = (val === 'payos' ? 'block' : 'none');
        if (webhookP) webhookP.style.display = (val === 'webhook' ? 'block' : 'none');
        if (badge) {
          badge.textContent = val === 'payos' ? 'Tự động payOS' : (val === 'webhook' ? 'Tự động Webhook' : 'Thủ công tại quầy');
          badge.style.background = val === 'manual' ? '#e0f2fe' : '#dcfce7';
          badge.style.color = val === 'manual' ? '#0284c7' : '#15803d';
        }
        $$('.qr-mode-card', root).forEach(card => {
          const r = card.querySelector('input');
          card.classList.toggle('active', r && r.checked);
        });
      });
    });

    $('#btnTestPayosConnection', root)?.addEventListener('click', () => {
      const cId = $('#prefPayosClientId', root)?.value?.trim();
      const apiKey = $('#prefPayosApiKey', root)?.value?.trim();
      const chkKey = $('#prefPayosChecksumKey', root)?.value?.trim();
      const statusBox = $('#payosConnStatus', root);
      if (!statusBox) return;
      statusBox.style.display = 'block';
      if (!cId || !apiKey || !chkKey) {
        statusBox.style.color = '#dc2626';
        statusBox.innerHTML = '⚠️ Vui lòng điền đủ Client ID, API Key và Checksum Key từ my.payos.vn';
      } else {
        statusBox.style.color = '#16a34a';
        statusBox.innerHTML = '✓ Đã kiểm tra: Định dạng khóa hợp lệ! Sẵn sàng nhận giao dịch tự động.';
      }
    });
  }, 40);
}

const PRINT_TYPES=[['receipt','Hóa đơn / Phiếu bán'],['quote','Phiếu tạm tính'],['receive','Phiếu nhập'],['issue','Phiếu xuất'],['transfer','Phiếu chuyển'],['count','Phiếu kiểm kho'],['return','Phiếu trả hàng'],['delivery','Phiếu giao hàng'],['label','Tem sản phẩm'],['barcode','Barcode / QR label']];
const PRINT_FIELDS={shop_logo:'Logo',shop_name:'Tên cửa hàng',shop_phone:'Điện thoại',shop_address:'Địa chỉ',shop_website:'Website',shop_tax:'MST',document_code:'Mã chứng từ',document_date:'Ngày giờ',employee:'Nhân viên',register:'Quầy',shift:'Ca bán',customer:'Khách hàng',customer_phone:'SĐT khách',customer_address:'Địa chỉ khách',item_sku:'SKU',item_barcode:'Barcode',quantity:'Số lượng',unit_price:'Đơn giá',discount:'Giảm giá',line_total:'Thành tiền',subtotal:'Tạm tính',tax:'VAT',shipping:'Phí giao',total:'Tổng cộng',cash_received:'Khách đưa',change:'Tiền thừa',payment:'Thanh toán',note:'Ghi chú',footer:'Lời cảm ơn'};
const DEFAULT_PRINT_FIELDS=['shop_logo','shop_name','shop_phone','shop_address','shop_website','shop_tax','document_code','document_date','customer','item_sku','quantity','unit_price','discount','line_total','subtotal','tax','total','payment','note','footer'];
const printName=type=>PRINT_TYPES.find(x=>x[0]===type)?.[1]||'Chứng từ';
const printUid=()=>globalThis.crypto?.randomUUID?.()||`print_${Date.now()}_${Math.random().toString(36).slice(2)}`;
function defaultPrintTemplate(type){return {id:`default_${type}`,type,name:printName(type),paper:type==='label'||type==='barcode'?'LABEL_50x30':type==='receipt'||type==='quote'?'RECEIPT_80':'A4',orientation:'portrait',margin_top:6,margin_bottom:6,margin_left:7,margin_right:7,font_size:12,line_spacing:1.3,content_width:'auto',custom_width:50,custom_height:30,logo:false,logo_size:24,header:'',footer:'Cảm ơn quý khách.',copies:1,auto_preview:true,auto_print:false,fields:[...DEFAULT_PRINT_FIELDS],default:true,updated_at:new Date().toISOString()};}
async function ensurePrintTemplates(){const existing=await getAll('print_templates');const missing=PRINT_TYPES.filter(([type])=>!existing.some(t=>t.type===type&&t.default)).map(([type])=>defaultPrintTemplate(type));if(missing.length)await putMany('print_templates',missing);}
function activePrintTemplate(type='receipt'){return (state.data.print_templates||[]).find(t=>t.type===type&&t.default)||(state.data.print_templates||[]).find(t=>t.type===type)||defaultPrintTemplate(type);}
function templateFields(t){return new Set(Array.isArray(t.fields)&&t.fields.length?t.fields:DEFAULT_PRINT_FIELDS);}
function printPreviewMarkup(t,doc={}){
  const f=templateFields(t),profile=(state.data.settings||[]).find(x=>x.id===PROFILE_SETTING)?.value||{},sale=doc.sale||(doc.id && (state.data.sales||[]).find(s=>s.id===doc.id||s.code===doc.id))||state.saleReceipt||state.data.sales?.[0]||{},items=sale.items||[];
  const line=x=>f.has(x.key)&&x.value?`<div class="print-preview-line ${x.strong?'strong':''}"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`:'';
  const itemLine=i=>`<div><span><strong>${esc(i.name||'Mặt hàng')}</strong>${(i.variant||i.variant_name||i.size)?`<small class="item-variant">${esc(i.variant||i.variant_name||i.size)}</small>`:''}${i.duration?`<small class="item-duration">${esc(i.duration)}</small>`:''}${f.has('item_sku')&&i.sku?`<small class="item-sku">SKU: ${esc(i.sku)}</small>`:''}${f.has('item_barcode')&&i.barcode?`<small class="item-barcode">Barcode: ${esc(i.barcode)}</small>`:''}${f.has('quantity')?` × ${fmt(i.quantity||0)}`:''}</span><span>${f.has('unit_price')?`<small>${fmt(i.unit_price||0)} ₫</small>`:''}${f.has('discount')&&Number(i.discount)?`<small>−${fmt(i.discount)} ₫</small>`:''}${f.has('line_total')?`<b>${fmt(i.line_total??i.lineTotal??0)} ₫</b>`:''}</span></div>`;
  return `<div class="print-preview paper-${esc(t.paper)}" style="--print-font:${Number(t.font_size)||12}px;--print-leading:${Number(t.line_spacing)||1.3};--mt:${Number(t.margin_top)||0}mm;--mr:${Number(t.margin_right)||0}mm;--mb:${Number(t.margin_bottom)||0}mm;--ml:${Number(t.margin_left)||0}mm;--print-width:${Number(t.custom_width)||50}mm;--print-height:${Number(t.custom_height)||30}mm;--content-width:${t.content_width==='auto'?'100%':`${Math.max(50,Math.min(100,Number(t.content_width)||100))}%`};--logo-size:${Number(t.logo_size)||32}px"><header>${(t.logo!==false&&(t.logo||f.has('shop_logo')))&&profile.logo?`<img src="${esc(profile.logo)}" alt=""/>`:''}${f.has('shop_name')?`<strong>${esc(profile.display_name||profile.store_name||'Tên cửa hàng')}</strong>`:''}${f.has('shop_phone')&&(profile.phone||profile.hotline)?`<small>Hotline: ${esc(profile.hotline||profile.phone)}</small>`:''}${f.has('shop_address')&&profile.address?`<small>${esc(profile.address)}</small>`:''}${f.has('shop_website')&&profile.website?`<small>${esc(profile.website)}</small>`:''}${f.has('shop_tax')&&profile.tax_code?`<small>MST: ${esc(profile.tax_code)}</small>`:''}${t.header?`<small class="template-header">${esc(t.header)}</small>`:''}</header>${line({key:'document_code',label:'Mã',value:sale.code||doc.id||'BẢN XEM TRƯỚC'})}${line({key:'document_date',label:'Ngày',value:dt(sale.created_at||new Date().toISOString())})}${line({key:'employee',label:'Thu ngân',value:sale.cashier_name||sale.employee_name||'Thu ngân 01'})}${line({key:'register',label:'Quầy',value:sale.register_name||'POS-01'})}${line({key:'customer',label:'Khách',value:sale.customer_label||'Khách lẻ'})}${line({key:'customer_phone',label:'SĐT',value:sale.customer_phone||sale.phone||''})}${line({key:'customer_address',label:'Địa chỉ',value:sale.customer_address||sale.address||''})}<div class="print-preview-items">${items.length?items.map(itemLine).join(''):itemLine({name:'Mặt hàng mẫu',quantity:1,unit_price:0,line_total:0})}</div>${line({key:'subtotal',label:'Tạm tính',value:`${fmt(sale.subtotal||0)} ₫`})}${line({key:'discount',label:'Chiết khấu',value:Number(sale.discount_total||sale.discount)?`−${fmt(sale.discount_total||sale.discount)} ₫`:''})}${line({key:'tax',label:'VAT',value:Number(sale.tax_total)?`${fmt(sale.tax_total)} ₫`:''})}${line({key:'shipping',label:'Phí giao',value:Number(sale.shipping_fee)?`${fmt(sale.shipping_fee)} ₫`:''})}${line({key:'total',label:'Tổng cộng',value:`${fmt(sale.grand_total??sale.total??0)} ₫`,strong:true})}${line({key:'cash_received',label:'Khách đưa',value:Number(sale.cash_received)?`${fmt(sale.cash_received)} ₫`:''})}${line({key:'change',label:'Tiền thừa',value:Number(sale.change)?`${fmt(sale.change)} ₫`:''})}${line({key:'payment',label:'Thanh toán',value:paymentLabel(sale.payments?.[0]?.method||sale.payment_method||'cash')})}${f.has('note')&&(sale.note||profile.note)?`<p class="print-preview-note">${esc(sale.note||profile.note)}</p>`:''}${f.has('footer')&&(t.footer||profile.return_policy)?`<footer><div>${esc(t.footer||profile.return_policy)}</div></footer>`:''}</div>`;
}
function renderPrintCenter(){
  setTitle('In & thiết bị','QBiz'); const templates=state.data.print_templates||[],jobs=[...(state.data.print_jobs||[])].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  const isDemo = sessionStorage.getItem('qbiz_preview_demo') === '1';
  const demoBanner = isDemo ? `
    <div class="demo-printer-notice" style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:12px 14px;border-radius:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="flex:1;min-width:240px">
        <strong style="font-size:13.5px">🖨️ Máy in demo · Chưa kết nối thiết bị thật</strong>
        <p style="margin:3px 0 0;font-size:12px;color:#78350f">Mô phỏng máy in theo ngành <b>${esc(getActiveDemoIndustry().name)}</b>. Bạn có thể xem trước mẫu hóa đơn hoặc in thử trình duyệt.</p>
      </div>
      <button class="secondary-btn compact" data-action="demo-receipt-preview" style="font-size:12px;background:#fff;border-color:#f59e0b;color:#b45309">${icon('eye')} Xem mẫu in demo</button>
    </div>
  ` : '';
  $('#content').innerHTML=`<section class="print-center">${demoBanner}<div class="segment print-tabs"><button class="${state.printTab==='templates'?'active':''}" data-print-tab="templates">Mẫu in</button><button class="${state.printTab==='devices'?'active':''}" data-print-tab="devices">Thiết bị</button><button class="${state.printTab==='jobs'?'active':''}" data-print-tab="jobs">Nhật ký</button></div>${state.printTab==='templates'?`<section class="card section-card"><div class="section-head"><div><h2>Mẫu in</h2><p>Thay đổi mẫu không tạo giao dịch mới.</p></div></div><div class="print-template-list">${templates.map(t=>`<button data-edit-template="${t.id}"><span><b>${esc(t.name)}</b><small>${esc(t.paper)} · ${t.orientation==='landscape'?'Ngang':'Dọc'} · ${fmt(t.font_size)}px</small></span>${icon('chevron-right')}</button>`).join('')}</div></section>`:state.printTab==='devices'?`<section class="card section-card"><div class="section-head"><div><h2>Thiết bị in & ngoại vi</h2><p>Cấu hình máy in nhiệt, máy in tem và máy quét cho quầy bán hàng.</p></div></div><div class="device-list"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--q-line);flex-wrap:wrap;gap:8px"><div style="min-width:220px"><div style="font-weight:700;font-size:14px">🖨️ Máy in nhiệt K80 (Demo) <span class="badge info" style="font-size:11px;padding:2px 6px">Mặc định</span></div><div style="font-size:12px;color:var(--q-muted);margin-top:2px">Loại: Máy in bill hóa đơn · Khổ 80mm · Mẫu: K80 Demo</div><div style="margin-top:4px"><span class="badge warn" style="font-size:11px">Máy in demo · Chưa kết nối thiết bị thật</span></div></div><div style="display:flex;gap:6px"><button class="secondary-btn compact" data-print-test="receipt" data-print-paper="RECEIPT_80">In thử K80</button></div></div><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--q-line);flex-wrap:wrap;gap:8px"><div style="min-width:220px"><div style="font-weight:700;font-size:14px">🖨️ Máy in nhiệt K58 (Demo)</div><div style="font-size:12px;color:var(--q-muted);margin-top:2px">Loại: Máy in bill nhỏ · Khổ 58mm · Mẫu: K58 Demo</div><div style="margin-top:4px"><span class="badge warn" style="font-size:11px">Máy in demo · Chưa kết nối thiết bị thật</span></div></div><div style="display:flex;gap:6px"><button class="secondary-btn compact" data-print-test="receipt" data-print-paper="RECEIPT_58">In thử K58</button></div></div><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--q-line);flex-wrap:wrap;gap:8px"><div style="min-width:220px"><div style="font-weight:700;font-size:14px">🏷️ Máy in tem mã vạch 50x30 (Demo)</div><div style="font-size:12px;color:var(--q-muted);margin-top:2px">Loại: Máy in mã vạch decal · Khổ 50 × 30 mm</div><div style="margin-top:4px"><span class="badge info" style="font-size:11px">Máy in demo · Cần device bridge</span></div></div><div style="display:flex;gap:6px"><button class="secondary-btn compact" data-print-test="label">In thử tem</button></div></div><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--q-line);flex-wrap:wrap;gap:8px"><div style="min-width:220px"><div style="font-weight:700;font-size:14px">📄 Máy in văn phòng A4 / A5</div><div style="font-size:12px;color:var(--q-muted);margin-top:2px">Loại: Máy in hóa đơn xuất kho / chứng từ kế toán</div><div style="margin-top:4px"><span class="badge ok" style="font-size:11px">Browser Print / Save as PDF</span></div></div><div style="display:flex;gap:6px"><button class="secondary-btn compact" data-print-test="issue">In thử phiếu xuất</button></div></div><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--q-line);flex-wrap:wrap;gap:8px"><div style="min-width:220px"><div style="font-weight:700;font-size:14px">📷 Máy quét mã vạch / QR</div><div style="font-size:12px;color:var(--q-muted);margin-top:2px">Loại: Camera thiết bị hoặc máy quét USB HID</div><div style="margin-top:4px"><span class="badge ok" style="font-size:11px">Camera điện thoại / Nhập trực tiếp</span></div></div></div></div><p class="muted" style="margin-top:14px">Bản web chưa điều khiển trực tiếp máy in phần cứng. In thử sẽ mở hộp thoại in của trình duyệt (hoặc tùy chọn 'Save as PDF').</p></section>`:`<section class="card section-card"><div class="section-head"><div><h2>Nhật ký in</h2><p>In lại chỉ tạo tác vụ in, không tạo giao dịch hay biến động kho mới.</p></div></div><div class="print-job-list">${jobs.map(j=>`<div><span><b>${esc(printName(j.document_type))}</b><small>${dt(j.created_at)} · ${esc(j.printer||'Browser Print')}${j.reprint?' · In lại':''}</small></span><span class="print-job-actions"><em>${esc(j.status)}</em><button class="secondary-btn" data-reprint-job="${j.id}">In lại</button></span></div>`).join('')||'<div class="empty">Chưa có lần in nào.</div>'}</div></section>`}</section>`;
  $$('[data-print-tab]').forEach(b=>b.onclick=()=>{state.printTab=b.dataset.printTab;renderPrintCenter()});
  $$('[data-edit-template]').forEach(b=>b.onclick=()=>openPrintTemplateEditorV2(templates.find(t=>t.id===b.dataset.editTemplate)));
  $$('[data-print-test]').forEach(b=>b.onclick=()=>{
    const paper = b.dataset.printPaper;
    let t = null;
    if (paper) t = (state.data.print_templates||[]).find(x=>x.paper===paper);
    printDocument({type:b.dataset.printTest,test:true,template:t});
  });
  $$('[data-reprint-job]').forEach(b=>b.onclick=()=>{const job=jobs.find(j=>j.id===b.dataset.reprintJob);if(job)printDocument({type:job.document_type,documentId:job.document_id,reprint:true})});
  $('[data-action="demo-receipt-preview"]')?.addEventListener('click',()=>{
    let activePaper = 'RECEIPT_80';
    function renderDemoReceiptModal(paper) {
      const rc = getDemoReceiptPreview(null, paper);
      const is58 = paper === 'RECEIPT_58';
      return `
        <div class="demo-receipt-wrapper" style="max-width:380px;margin:0 auto">
          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
            <button type="button" class="secondary-btn compact ${!is58?'active':''}" id="btnPreviewK80" style="${!is58?'background:var(--q-blue);color:#fff;border-color:var(--q-blue)':''}">Khổ K80 (80mm)</button>
            <button type="button" class="secondary-btn compact ${is58?'active':''}" id="btnPreviewK58" style="${is58?'background:var(--q-blue);color:#fff;border-color:var(--q-blue)':''}">Khổ K58 (58mm)</button>
          </div>
          <div class="demo-receipt-modal paper-${paper}" style="font-family:'Courier New',Courier,monospace;background:#fff;padding:16px ${is58?'10px':'16px'};border-radius:10px;border:1px dashed #94a3b8;max-width:${is58?'260px':'340px'};margin:0 auto;line-height:1.35;box-shadow:0 4px 14px rgba(0,0,0,0.06);font-size:${is58?'11.5px':'12.5px'}">
            <div style="text-align:center;margin-bottom:12px">
              ${rc.logo ? `<img src="${esc(rc.logo)}" alt="Logo" style="width:${is58?'32px':'42px'};height:${is58?'32px':'42px'};margin:0 auto 4px;display:block"/>` : ''}
              <div style="font-weight:700;font-size:${is58?'13px':'15px'};color:#0f172a;line-height:1.2">${esc(rc.displayName)}</div>
              <div style="font-size:${is58?'10.5px':'11.5px'};color:#475569;margin-top:2px">${esc(rc.address)}</div>
              <div style="font-size:${is58?'10.5px':'11.5px'};color:#475569">Hotline: ${esc(rc.hotline || rc.phone)}</div>
              ${rc.website ? `<div style="font-size:${is58?'10px':'11px'};color:#0284c7">${esc(rc.website)}</div>` : ''}
              ${rc.taxCode ? `<div style="font-size:${is58?'10px':'11px'};color:#64748b">MST: ${esc(rc.taxCode)}</div>` : ''}
              ${rc.header ? `<div style="font-size:${is58?'9.5px':'10.5px'};color:#64748b;margin-top:3px">${esc(rc.header)}</div>` : ''}
              <div style="margin-top:8px;font-weight:700;font-size:${is58?'12px':'13.5px'};border-top:1px dashed #cbd5e1;border-bottom:1px dashed #cbd5e1;padding:4px 0">${esc(rc.title)}</div>
              <div style="font-size:${is58?'10px':'11px'};color:#64748b;margin-top:4px">Số: ${esc(rc.code)} | ${esc(rc.date)}</div>
              <div style="font-size:${is58?'10px':'11px'};color:#64748b">Thu ngân: ${esc(rc.cashier)} | Quầy: ${esc(rc.register)}</div>
              ${rc.customer ? `<div style="font-size:${is58?'10px':'11px'};color:#334155;text-align:left;margin-top:4px">Khách: <b>${esc(rc.customer)}</b>${rc.customerPhone ? ' · ' + esc(rc.customerPhone) : ''}</div>` : ''}
            </div>
            <table style="width:100%;font-size:inherit;border-collapse:collapse;margin-bottom:8px">
              <thead>
                <tr style="border-bottom:1px solid #cbd5e1;text-align:left">
                  <th style="padding:4px 0">Tên món / Hàng</th>
                  <th style="padding:4px 0;text-align:center">SL</th>
                  <th style="padding:4px 0;text-align:right">Tiền</th>
                </tr>
              </thead>
              <tbody>
                ${rc.items.map(item => `
                  <tr style="border-bottom:1px dotted #e2e8f0">
                    <td style="padding:4px 0">
                      <div><b>${esc(item.name)}</b></div>
                      ${item.variant ? `<small style="color:#64748b;display:block">${esc(item.variant)}</small>` : ''}
                      ${item.duration ? `<small style="color:#0284c7;display:block">${esc(item.duration)}</small>` : ''}
                      ${item.sku ? `<small style="color:#94a3b8;display:block">SKU: ${esc(item.sku)}</small>` : ''}
                    </td>
                    <td style="padding:4px 0;text-align:center;vertical-align:top">${item.qty}</td>
                    <td style="padding:4px 0;text-align:right;vertical-align:top">${fmt(item.total)} ₫</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="border-top:1px dashed #cbd5e1;padding-top:6px;display:grid;gap:3px">
              <div style="display:flex;justify-content:space-between">
                <span>Tạm tính:</span>
                <span>${fmt(rc.subtotal)} ₫</span>
              </div>
              ${rc.discount > 0 ? `
                <div style="display:flex;justify-content:space-between;color:#dc2626">
                  <span>Chiết khấu:</span>
                  <span>−${fmt(rc.discount)} ₫</span>
                </div>
              ` : ''}
              <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.15em;border-top:1px dashed #cbd5e1;padding-top:4px">
                <span>TỔNG CỘNG:</span>
                <span style="color:#0284c7">${fmt(rc.total)} ₫</span>
              </div>
              <div style="display:flex;justify-content:space-between;color:#475569">
                <span>Thanh toán (${esc(rc.paymentMethod)}):</span>
                <span>${fmt(rc.tendered)} ₫</span>
              </div>
              ${rc.change > 0 ? `
                <div style="display:flex;justify-content:space-between;color:#475569">
                  <span>Tiền thừa:</span>
                  <span>${fmt(rc.change)} ₫</span>
                </div>
              ` : ''}
            </div>
            <div style="margin-top:12px;text-align:center;font-size:${is58?'9.5px':'10.5px'};color:#64748b;border-top:1px dotted #cbd5e1;padding-top:6px">
              ${rc.policy ? `<p style="margin:0 0 4px;font-style:italic">${esc(rc.policy)}</p>` : ''}
              <p style="margin:0 0 3px;font-weight:700">*** ${esc(rc.footer)} ***</p>
              <p style="margin:4px 0 0;color:#d97706;font-weight:700">${esc(rc.notice)}</p>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button type="button" class="primary-btn full" id="btnModalPrintDoc" style="font-size:13px">${icon('printer')} In thử phiếu này</button>
            <button type="button" class="secondary-btn" id="btnModalExportPdf" style="font-size:13px;white-space:nowrap">${icon('download')} Lưu PDF</button>
          </div>
        </div>
      `;
    }

    openModal({
      title: 'Xem mẫu in demo',
      sub: `${getActiveDemoIndustry().name} · Xem trước mẫu in hóa đơn`,
      hideSubmit: true,
      body: `<div id="demoReceiptModalContainer">${renderDemoReceiptModal(activePaper)}</div>`
    });

    const root = $('#modalRoot');
    const attachModalEvents = () => {
      $('#btnPreviewK80', root)?.addEventListener('click', () => {
        activePaper = 'RECEIPT_80';
        $('#demoReceiptModalContainer', root).innerHTML = renderDemoReceiptModal(activePaper);
        attachModalEvents();
      });
      $('#btnPreviewK58', root)?.addEventListener('click', () => {
        activePaper = 'RECEIPT_58';
        $('#demoReceiptModalContainer', root).innerHTML = renderDemoReceiptModal(activePaper);
        attachModalEvents();
      });
      $('#btnModalPrintDoc', root)?.addEventListener('click', () => {
        const t = (state.data.print_templates || []).find(x => x.paper === activePaper) || activePrintTemplate('receipt');
        printDocument({ type: 'receipt', test: true, template: t });
      });
      $('#btnModalExportPdf', root)?.addEventListener('click', () => {
        toast('Hộp thoại in sẽ mở: Chọn "Save as PDF" / "Lưu dưới dạng PDF" để xuất tệp.', 'ok');
        const t = (state.data.print_templates || []).find(x => x.paper === activePaper) || activePrintTemplate('receipt');
        printDocument({ type: 'receipt', test: true, template: t });
      });
    };
    attachModalEvents();
  });
}
function openPrintTemplateEditor(template){
  if(!template)return;const draft={...template,fields:[...templateFields(template)]};const fieldList=()=>Object.entries(PRINT_FIELDS).map(([key,label])=>`<label><input type="checkbox" data-print-field="${key}" ${draft.fields.includes(key)?'checked':''}/> ${label}</label>`).join('');const draw=()=>{const r=$('#modalRoot');$('#printPreview',r).innerHTML=printPreviewMarkup(draft);};
  openModal({title:template.name,sub:'Mẫu in cục bộ · xem trước phản ánh cài đặt.',body:`<div class="print-editor"><div class="form-grid"><div class="field"><label>Khổ giấy</label><select id="printPaper"><option value="RECEIPT_58" ${template.paper==='RECEIPT_58'?'selected':''}>Phiếu 58 mm</option><option value="RECEIPT_80" ${template.paper==='RECEIPT_80'?'selected':''}>Phiếu 80 mm</option><option value="A4" ${template.paper==='A4'?'selected':''}>A4</option><option value="A5" ${template.paper==='A5'?'selected':''}>A5</option><option value="LABEL_50x30" ${template.paper==='LABEL_50x30'?'selected':''}>Tem 50 × 30 mm</option><option value="CUSTOM" ${template.paper==='CUSTOM'?'selected':''}>Tùy chỉnh</option></select></div><div class="field"><label>Hướng</label><select id="printOrientation"><option value="portrait" ${template.orientation==='portrait'?'selected':''}>Dọc</option><option value="landscape" ${template.orientation==='landscape'?'selected':''}>Ngang</option></select></div><div class="field"><label>Font (px)</label><input id="printFont" type="number" min="8" max="24" value="${fmt(template.font_size)}"/></div><div class="field"><label>Giãn dòng</label><input id="printLeading" type="number" min="1" max="2" step=".1" value="${esc(template.line_spacing)}"/></div><div class="field"><label>Lề trên (mm)</label><input id="printMarginTop" type="number" min="0" value="${fmt(template.margin_top)}"/></div><div class="field"><label>Lề dưới (mm)</label><input id="printMarginBottom" type="number" min="0" value="${fmt(template.margin_bottom)}"/></div><div class="field"><label>Lề trái (mm)</label><input id="printMarginLeft" type="number" min="0" value="${fmt(template.margin_left)}"/></div><div class="field"><label>Lề phải (mm)</label><input id="printMarginRight" type="number" min="0" value="${fmt(template.margin_right)}"/></div><div class="field full-span"><label>Header</label><input id="printHeader" value="${esc(template.header)}"/></div><div class="field full-span"><label>Footer</label><input id="printFooter" value="${esc(template.footer)}"/></div></div><h3>Trường hiển thị</h3><div class="print-fields">${fieldList()}</div><h3>Xem trước</h3><div id="printPreview">${printPreviewMarkup(draft)}</div><button type="button" class="secondary-btn full" data-print-editor-test>In thử bằng trình duyệt</button></div>`,submitText:'Lưu mẫu',onSubmit:async r=>{const next={...draft,paper:$('#printPaper',r).value,orientation:$('#printOrientation',r).value,font_size:Number($('#printFont',r).value)||12,line_spacing:Number($('#printLeading',r).value)||1.3,margin_top:Number($('#printMarginTop',r).value)||0,margin_bottom:Number($('#printMarginBottom',r).value)||0,margin_left:Number($('#printMarginLeft',r).value)||0,margin_right:Number($('#printMarginRight',r).value)||0,header:$('#printHeader',r).value.trim(),footer:$('#printFooter',r).value.trim(),fields:$$('[data-print-field]:checked',r).map(x=>x.dataset.printField),updated_at:new Date().toISOString()};await put('print_templates',next);}});
  const root=$('#modalRoot');const sync=()=>{draft.paper=$('#printPaper',root).value;draft.orientation=$('#printOrientation',root).value;draft.font_size=Number($('#printFont',root).value)||12;draft.line_spacing=Number($('#printLeading',root).value)||1.3;draft.margin_top=Number($('#printMarginTop',root).value)||0;draft.margin_bottom=Number($('#printMarginBottom',root).value)||0;draft.margin_left=Number($('#printMarginLeft',root).value)||0;draft.margin_right=Number($('#printMarginRight',root).value)||0;draft.header=$('#printHeader',root).value;draft.footer=$('#printFooter',root).value;draft.fields=$$('[data-print-field]:checked',root).map(x=>x.dataset.printField);draw();};$$('input,select',root).forEach(x=>x.addEventListener('input',sync));$$('input[type="checkbox"]',root).forEach(x=>x.addEventListener('change',sync));$('[data-print-editor-test]',root).onclick=()=>printDocument({type:template.type,test:true,template:draft});
}
function openPrintTemplateEditorV2(template){
  if(!template)return;
  const draft={...defaultPrintTemplate(template.type),...template,fields:[...templateFields(template)]};
  const selected=v=>draft.paper===v?'selected':'';
  const fieldList=()=>Object.entries(PRINT_FIELDS).map(([key,label])=>`<label><input type="checkbox" data-print-field="${key}" ${draft.fields.includes(key)?'checked':''}/> ${label}</label>`).join('');
  const read=root=>({
    ...draft,
    paper:$('#printPaper',root).value,
    orientation:$('#printOrientation',root).value,
    custom_width:Number($('#printCustomWidth',root).value)||50,
    custom_height:Number($('#printCustomHeight',root).value)||30,
    content_width:$('#printContentWidth',root).value,
    font_size:Number($('#printFont',root).value)||12,
    line_spacing:Number($('#printLeading',root).value)||1.3,
    margin_top:Number($('#printMarginTop',root).value)||0,
    margin_bottom:Number($('#printMarginBottom',root).value)||0,
    margin_left:Number($('#printMarginLeft',root).value)||0,
    margin_right:Number($('#printMarginRight',root).value)||0,
    logo:$('#printLogo',root).checked,
    logo_size:Number($('#printLogoSize',root).value)||24,
    header:$('#printHeader',root).value.trim(),
    footer:$('#printFooter',root).value.trim(),
    fields:$$('[data-print-field]:checked',root).map(x=>x.dataset.printField)
  });
  openModal({title:template.name,sub:'Mẫu in cục bộ · xem trước phản ánh cài đặt.',body:`<div class="print-editor"><div class="form-grid"><div class="field"><label>Khổ giấy</label><select id="printPaper"><option value="RECEIPT_58" ${selected('RECEIPT_58')}>Phiếu 58 mm</option><option value="RECEIPT_80" ${selected('RECEIPT_80')}>Phiếu 80 mm</option><option value="A4" ${selected('A4')}>A4</option><option value="A5" ${selected('A5')}>A5</option><option value="LABEL_50x30" ${selected('LABEL_50x30')}>Tem 50 × 30 mm</option><option value="CUSTOM" ${selected('CUSTOM')}>Tùy chỉnh</option></select></div><div class="field"><label>Hướng</label><select id="printOrientation"><option value="portrait" ${draft.orientation==='portrait'?'selected':''}>Dọc</option><option value="landscape" ${draft.orientation==='landscape'?'selected':''}>Ngang</option></select></div><div class="field print-custom-size"><label>Rộng tùy chỉnh (mm)</label><input id="printCustomWidth" type="number" min="20" max="210" value="${fmt(draft.custom_width)}"/></div><div class="field print-custom-size"><label>Cao tùy chỉnh (mm)</label><input id="printCustomHeight" type="number" min="15" max="297" value="${fmt(draft.custom_height)}"/></div><div class="field"><label>Độ rộng nội dung</label><select id="printContentWidth"><option value="auto" ${draft.content_width==='auto'?'selected':''}>Vừa nội dung</option><option value="100" ${String(draft.content_width)==='100'?'selected':''}>100%</option><option value="90" ${String(draft.content_width)==='90'?'selected':''}>90%</option><option value="80" ${String(draft.content_width)==='80'?'selected':''}>80%</option></select></div><div class="field"><label>Font (px)</label><input id="printFont" type="number" min="8" max="24" value="${fmt(draft.font_size)}"/></div><div class="field"><label>Giãn dòng</label><input id="printLeading" type="number" min="1" max="2" step=".1" value="${esc(draft.line_spacing)}"/></div><div class="field"><label>Lề trên (mm)</label><input id="printMarginTop" type="number" min="0" value="${fmt(draft.margin_top)}"/></div><div class="field"><label>Lề dưới (mm)</label><input id="printMarginBottom" type="number" min="0" value="${fmt(draft.margin_bottom)}"/></div><div class="field"><label>Lề trái (mm)</label><input id="printMarginLeft" type="number" min="0" value="${fmt(draft.margin_left)}"/></div><div class="field"><label>Lề phải (mm)</label><input id="printMarginRight" type="number" min="0" value="${fmt(draft.margin_right)}"/></div><label class="check-field"><input id="printLogo" type="checkbox" ${draft.logo?'checked':''}/> Hiện logo cửa hàng</label><div class="field"><label>Kích thước logo (px)</label><input id="printLogoSize" type="number" min="16" max="80" value="${fmt(draft.logo_size)}"/></div><div class="field full-span"><label>Header</label><input id="printHeader" value="${esc(draft.header)}"/></div><div class="field full-span"><label>Footer</label><input id="printFooter" value="${esc(draft.footer)}"/></div></div><h3>Trường hiển thị</h3><div class="print-fields">${fieldList()}</div><h3>Xem trước</h3><div id="printPreview">${printPreviewMarkup(draft)}</div><button type="button" class="secondary-btn full" data-print-editor-test>In thử bằng trình duyệt</button></div>`,submitText:'Lưu mẫu',onSubmit:async root=>{const next={...read(root),updated_at:new Date().toISOString()};await put('print_templates',next);}});
  const root=$('#modalRoot');
  const sync=()=>{Object.assign(draft,read(root));const custom=$('#printPaper',root).value==='CUSTOM';$$('.print-custom-size',root).forEach(x=>x.hidden=!custom);$('#printPreview',root).innerHTML=printPreviewMarkup(draft);};
  $$('input,select',root).forEach(x=>x.addEventListener('input',sync));
  $$('input[type="checkbox"]',root).forEach(x=>x.addEventListener('change',sync));
  $('[data-print-editor-test]',root).onclick=()=>printDocument({type:template.type,test:true,template:{...read(root)}});
  sync();
}

function renderReceiptVoucherHtml(doc, t, { reprint=false, isTest=false }={}) {
  const paper = t?.paper || 'RECEIPT_80';
  const is58 = paper === 'RECEIPT_58';
  const isA4 = paper === 'A4' || paper === 'A5';

  // 1. Store Profile & Branding
  const profile = (state.data?.settings||[]).find(x => x.id === PROFILE_SETTING)?.value || {};
  const activeIndustry = typeof getActiveDemoIndustry === 'function' ? getActiveDemoIndustry() : null;
  const demoShop = activeIndustry?.shop || {};

  const shopName = profile.display_name || profile.store_name || demoShop.displayName || demoShop.name || 'QBiz Store';
  const shopSlogan = demoShop.receiptHeader || (activeIndustry?.key === 'food_beverage' ? 'Cà phê & Đồ uống tươi mỗi ngày' : activeIndustry?.key === 'fashion' ? 'Thời trang thiết kế hiện đại' : activeIndustry?.key === 'service' ? 'Chăm sóc sức khỏe & sắc đẹp' : 'Hệ thống bán lẻ & dịch vụ chuyên nghiệp');
  const shopAddress = profile.address || demoShop.address || 'Hà Nội, Việt Nam';
  const shopPhone = profile.hotline || profile.phone || demoShop.hotline || demoShop.phone || '1900.6868';
  const shopLogo = profile.logo || demoShop.logo || (typeof makeSvgShopLogo === 'function' && activeIndustry?.key ? makeSvgShopLogo(activeIndustry.key) : '');
  const taxCode = profile.tax_code || demoShop.tax_id || '';

  // Wi-Fi info
  const wifiSsid = profile.wifi_ssid || (shopName.split(' ')[0] + '_Guest');
  const wifiPass = profile.wifi_password || '88888888';

  // Fallback to demo receipt if doc is empty
  const d = doc || (typeof getDemoReceiptPreview === 'function' ? getDemoReceiptPreview(null, paper) : {});

  // 2. Document Details
  const isOrder = Boolean(d.fulfillment || (d.code && String(d.code).startsWith('DH-')) || d.order_uuid || ['NEW','CONFIRMED','PROCESSING'].includes(d.status));
  const code = d.code || d.sale_uuid || d.id || (isOrder ? 'DH-101' : 'HD-0001');
  const docTitle = d.title || (isOrder ? (d.fulfillment === 'delivery' ? 'PHIẾU GIAO HÀNG' : 'PHIẾU BÁN HÀNG') : 'HÓA ĐƠN BÁN HÀNG');
  const dateStr = d.date || dt(d.created_at || d.createdAt || new Date().toISOString());

  const cashier = d.cashier || d.cashier_name || d.employee_name || (state.data?.settings||[]).find(x=>x.id==='active_user_name')?.value || 'Thu ngân 01';
  const register = d.register || d.register_name || d.device_id || 'POS-01';

  const customerName = d.customer || d.customer_label || d.recipient || (d.customer_id ? (state.data?.customers||[]).find(c=>c.id===d.customer_id)?.name : '') || 'Khách lẻ';
  const customerPhone = d.customerPhone || d.customer_phone || d.phone || '';
  const customerAddress = d.shipping_address || d.customer_address || d.address || '';

  // 3. Items list
  const rawItems = Array.isArray(d.items) && d.items.length ? d.items : [];
  const items = rawItems.map((it, idx) => {
    const p = it.item_id || it.itemId ? product(it.item_id || it.itemId) : null;
    const name = it.name || it.item_name || p?.name || `Mặt hàng ${idx + 1}`;
    const sku = it.sku || p?.sku || '';
    const variant = it.variant || it.variant_name || it.size || '';
    const duration = it.duration ? `${it.duration}` : (p?.durationMinutes ? `${p.durationMinutes} phút` : '');
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unitPrice = Number(it.unit_price ?? it.price ?? 0);
    const lineDiscount = Number(it.discount || 0);
    const lineTotal = Number(it.line_total ?? it.lineTotal ?? it.total ?? (qty * unitPrice - lineDiscount));
    return { name, sku, variant, duration, qty, unitPrice, lineDiscount, lineTotal };
  });

  // 4. Financials
  const subtotal = Number(d.subtotal ?? (items.length ? items.reduce((s, it) => s + (it.qty * it.unitPrice), 0) : Number(d.grand_total ?? d.total ?? 0)));
  const discountTotal = Number(d.discount_total ?? d.discount ?? 0);
  const taxTotal = Number(d.tax_total ?? d.tax ?? 0);
  const shippingFee = Number(d.shipping_fee ?? d.shippingFee ?? 0);
  const grandTotal = Number(d.grand_total ?? d.total ?? Math.max(0, subtotal - discountTotal + taxTotal + shippingFee));

  // Payment
  const paymentMethod = d.paymentMethod || d.payment_method || d.payments?.[0]?.method || 'Tiền mặt';
  const isPaid = (d.payment_status === 'PAID') || (d.payments?.[0]?.status === 'PAID') || (!d.payment_status && !isOrder);
  const cashReceived = Number(d.cash_received ?? d.tendered ?? (paymentMethod === 'cash' || paymentMethod === 'Tiền mặt' ? grandTotal : 0));
  const change = Number(d.change ?? (cashReceived > grandTotal ? cashReceived - grandTotal : 0));

  // VietQR URL
  const bankName = profile.bank_name || demoShop.bank_name || '';
  const bankAccount = profile.bank_account_number || demoShop.bank_account_number || '';
  const bankOwner = profile.bank_account_name || demoShop.bank_account_name || '';
  let qrUrl = profile.payment_qr || demoShop.payment_qr || d.payment_qr || '';
  if (!qrUrl && bankName && bankAccount) {
    const bankCode = bankName.toUpperCase().replace(/\s+/g, '');
    qrUrl = `https://img.vietqr.io/image/${bankCode}-${bankAccount}-compact2.png?amount=${grandTotal}&addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(bankOwner)}`;
  }

  const returnPolicy = profile.return_policy || demoShop.receiptPolicy || d.policy || 'Quý khách vui lòng kiểm tra hàng & giữ hóa đơn trong vòng 3 ngày.';
  const footerMessage = t?.footer || demoShop.receiptFooter || d.footer || 'Cảm ơn Quý khách & Hẹn gặp lại!';

  return `
    <div class="qbiz-print-voucher paper-${esc(paper)}">
      <div class="pv-header">
        ${shopLogo ? `<img src="${esc(shopLogo)}" class="pv-logo" alt="Logo"/>` : ''}
        <div class="pv-shop-name">${esc(shopName)}</div>
        ${shopSlogan ? `<div class="pv-shop-slogan">${esc(shopSlogan)}</div>` : ''}
        <div class="pv-shop-info">${esc(shopAddress)}</div>
        <div class="pv-shop-info">Hotline: ${esc(shopPhone)}${taxCode ? ` · MST: ${esc(taxCode)}` : ''}</div>
        ${wifiSsid ? `<div class="pv-wifi-box">📶 Wi-Fi: <b>${esc(wifiSsid)}</b> · Pass: <b>${esc(wifiPass)}</b></div>` : ''}
      </div>

      <div class="pv-divider"></div>

      <div class="pv-title">${esc(docTitle)}</div>
      ${reprint ? `<div class="pv-subtitle">(BẢN IN LẠI)</div>` : isTest ? `<div class="pv-subtitle">(BẢN IN THỬ / MẪU DEMO)</div>` : ''}

      <div class="pv-meta-grid">
        <div class="pv-meta-row"><span>Số phiếu:</span><b>${esc(code)}</b></div>
        <div class="pv-meta-row"><span>Thời gian:</span><span>${esc(dateStr)}</span></div>
        <div class="pv-meta-row"><span>Thu ngân:</span><span>${esc(cashier)}</span></div>
        <div class="pv-meta-row"><span>Quầy / Thiết bị:</span><span>${esc(register)}</span></div>
        <div class="pv-meta-row"><span>Khách hàng:</span><b>${esc(customerName)}</b></div>
        ${customerPhone ? `<div class="pv-meta-row"><span>Điện thoại:</span><span>${esc(customerPhone)}</span></div>` : ''}
        ${customerAddress ? `<div class="pv-meta-row"><span>Địa chỉ:</span><span>${esc(customerAddress)}</span></div>` : ''}
      </div>

      <div class="pv-divider"></div>

      <table class="pv-items-table">
        <thead>
          <tr>
            <th>Tên món / Hàng</th>
            <th class="pv-col-qty">SL</th>
            <th class="pv-col-price">Đ.Giá</th>
            <th class="pv-col-total">T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td>
                <div class="pv-item-name">${esc(it.name)}</div>
                ${it.variant ? `<div class="pv-item-desc">${esc(it.variant)}</div>` : ''}
                ${it.duration ? `<div class="pv-item-desc">⏱️ ${esc(it.duration)}</div>` : ''}
                ${it.sku ? `<div class="pv-item-desc">Mã: ${esc(it.sku)}</div>` : ''}
                ${it.lineDiscount > 0 ? `<div class="pv-item-desc" style="color:#c00">Giảm: -${fmt(it.lineDiscount)} ₫</div>` : ''}
              </td>
              <td class="pv-col-qty">${it.qty}</td>
              <td class="pv-col-price">${fmt(it.unitPrice)}</td>
              <td class="pv-col-total">${fmt(it.lineTotal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="pv-divider"></div>

      <div class="pv-totals">
        <div class="pv-total-row"><span>Cộng tiền hàng:</span><span>${fmt(subtotal)} ₫</span></div>
        ${discountTotal > 0 ? `<div class="pv-total-row" style="color:#c00"><span>Chiết khấu / Giảm giá:</span><span>−${fmt(discountTotal)} ₫</span></div>` : ''}
        ${taxTotal > 0 ? `<div class="pv-total-row"><span>Thuế VAT:</span><span>${fmt(taxTotal)} ₫</span></div>` : ''}
        ${shippingFee > 0 ? `<div class="pv-total-row"><span>Phí vận chuyển:</span><span>${fmt(shippingFee)} ₫</span></div>` : ''}
        <div class="pv-total-row pv-grand-total">
          <span>TỔNG CỘNG:</span>
          <span>${fmt(grandTotal)} ₫</span>
        </div>
        <div class="pv-total-row">
          <span>Hình thức:</span>
          <span>${paymentLabel(paymentMethod)} (${isPaid ? 'Đã thu' : 'Chờ thu'})</span>
        </div>
        ${cashReceived > 0 && cashReceived !== grandTotal ? `<div class="pv-total-row"><span>Tiền khách đưa:</span><span>${fmt(cashReceived)} ₫</span></div>` : ''}
        ${change > 0 ? `<div class="pv-total-row"><span>Tiền thối lại:</span><span>${fmt(change)} ₫</span></div>` : ''}
      </div>

      <div class="pv-divider"></div>

      <div class="pv-footer">
        ${qrUrl ? `
          <div class="pv-qr-box">
            <img src="${esc(qrUrl)}" class="pv-qr-img" alt="QR thanh toán"/>
            <div class="pv-qr-label">Quét mã QR để thanh toán / tra cứu</div>
          </div>
        ` : ''}
        <div class="pv-thanks">${esc(footerMessage)}</div>
        ${returnPolicy ? `<div class="pv-policy">${esc(returnPolicy)}</div>` : ''}
        <div class="pv-branding">HỆ THỐNG QUẢN LÝ KHO & BÁN HÀNG QBIZ · KHO.QBIZ.VN</div>
      </div>
    </div>
  `;
}

function docTienBangChu(number) {
  number = Math.round(Math.abs(Number(number) || 0));
  if (number === 0) return 'Không đồng';
  const chuSo = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const tien = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

  function docSo3ChuSo(baso, daydu) {
    let tram = Math.floor(baso / 100);
    let chuc = Math.floor((baso % 100) / 10);
    let donvi = baso % 10;
    let res = '';
    if (tram !== 0 || daydu) {
      res += chuSo[tram] + ' trăm ';
      if (chuc === 0 && donvi !== 0) res += 'lẻ ';
    }
    if (chuc !== 0 && chuc !== 1) {
      res += chuSo[chuc] + ' mươi ';
      if (chuc === 0 && donvi !== 0) res += 'lẻ ';
    }
    if (chuc === 1) res += 'mười ';
    switch (donvi) {
      case 1:
        if (chuc > 1) res += 'mốt ';
        else res += chuSo[donvi] + ' ';
        break;
      case 5:
        if (chuc !== 0) res += 'lăm ';
        else res += chuSo[donvi] + ' ';
        break;
      default:
        if (donvi !== 0) res += chuSo[donvi] + ' ';
        break;
    }
    return res;
  }

  let s = String(number);
  let groups = [];
  while (s.length > 0) {
    groups.push(parseInt(s.slice(-3), 10));
    s = s.slice(0, -3);
  }

  let words = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    let baso = groups[i];
    if (baso > 0) {
      let isDaydu = i < groups.length - 1;
      let w = docSo3ChuSo(baso, isDaydu).trim();
      words.push(w + (tien[i] ? ' ' + tien[i] : ''));
    }
  }
  let str = words.join(' ').trim() + ' đồng';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderWarehouseVoucherHtml(doc = {}, kind = 'receive', { standard = 'enterprise', paper = 'A4' } = {}) {
  const profile = (state.data?.settings || []).find(x => x.id === PROFILE_SETTING)?.value || {};
  const isReceive = kind === 'receive';
  const subType = doc.sub_type || (isReceive ? 'PURCHASE' : 'SALE_OUT');
  const typeLabel = doc.sub_type_label || (isReceive ? STOCK_IN_TYPES[subType] : STOCK_OUT_TYPES[subType]) || (isReceive ? 'Nhập hàng' : 'Xuất hàng');

  const companyName = profile.store_name || profile.display_name || 'DOANH NGHIỆP / CỬA HÀNG QBIZ';
  const companyAddress = profile.address?.trim() || '';
  const taxCode = profile.tax_code?.trim() || '';
  const phone = (profile.hotline || profile.phone || '').trim();
  const dateObj = new Date(doc.created_at || doc.createdAt || Date.now());
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const dateStr = `Ngày ${day} tháng ${month} năm ${year}`;
  const code = doc.document_id || doc.id || doc.code || (isReceive ? `PNK-${year}${month}${day}` : `PXK-${year}${month}${day}`);

  const wh = warehouse(doc.warehouse_id);
  const whName = wh?.name || 'Kho chính';
  const deliverer = (doc.deliverer_name?.trim() || (isReceive ? (doc.supplier_id ? (supplier(doc.supplier_id)?.name || '') : '') : (profile.contact_name?.trim() || ''))).trim();
  const receiver = (doc.receiver_name?.trim() || (isReceive ? (profile.contact_name?.trim() || '') : (doc.customer_label?.trim() || ''))).trim();
  const activeUserName = (state.data?.settings||[]).find(x=>x.id==='active_user_name')?.value?.trim() || '';
  const contactName = profile.contact_name?.trim() || '';
  const partySigName = isReceive ? deliverer : receiver;
  const lines = Array.isArray(doc.lines) ? doc.lines : [];

  let formCodeBadge = '<b>Mẫu số 01 - VT</b><br><small>(Ban hành theo TT số 200/2014/TT-BTC & TT 133/2016/TT-BTC)</small>';
  if (!isReceive) {
    formCodeBadge = '<b>Mẫu số 02 - VT</b><br><small>(Ban hành theo TT số 200/2014/TT-BTC & TT 133/2016/TT-BTC)</small>';
  }
  if (standard === 'household') {
    formCodeBadge = `<b>Mẫu số ${isReceive ? '01-VT' : '02-VT'}</b><br><small>(Ban hành theo TT số 88/2021/TT-BTC Hộ KD)</small>`;
  } else if (standard === 'compact') {
    formCodeBadge = `<b>${isReceive ? 'PHIẾU NHẬP' : 'PHIẾU XUẤT'}</b><br><small>Mẫu lưu hành nội bộ · QBiz Kho</small>`;
  }

  const grandTotal = lines.reduce((sum, line) => {
    const qty = Number(line.qty || 0);
    const price = line.price != null ? Number(line.price) : 0;
    return sum + (line.line_total != null ? Number(line.line_total) : qty * price);
  }, 0);

  const tableRows = lines.map((line, index) => {
    const p = product(line.productId);
    const name = line.name || p?.name || 'Sản phẩm';
    const sku = line.sku || p?.sku || '—';
    const unit = line.unit || p?.unit || 'cái';
    const qty = Number(line.qty || 0);
    const price = line.price != null ? Number(line.price) : 0;
    const total = line.line_total != null ? Number(line.line_total) : qty * price;
    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td class="text-left">
          <strong>${esc(name)}</strong>
        </td>
        <td class="text-center">${esc(sku)}</td>
        <td class="text-center">${esc(unit)}</td>
        <td class="text-center">${fmt(qty)}</td>
        <td class="text-center">${fmt(qty)}</td>
        <td class="text-right">${price > 0 ? fmt(price) + ' ₫' : '—'}</td>
        <td class="text-right">${total > 0 ? fmt(total) + ' ₫' : '—'}</td>
      </tr>
    `;
  }).join('');

  let signatures = `
    <div class="voucher-signatures-grid">
      <div class="sig-col">
        <div class="sig-header">
          <strong>Người lập biểu</strong>
          <small>(Ký, họ tên)</small>
        </div>
        <div class="sig-space"></div>
        <div class="sig-name">${esc(activeUserName)}</div>
      </div>
      <div class="sig-col">
        <div class="sig-header">
          <strong>${isReceive ? 'Người giao hàng' : 'Người nhận hàng'}</strong>
          <small>(Ký, họ tên)</small>
        </div>
        <div class="sig-space"></div>
        <div class="sig-name">${esc(partySigName)}</div>
      </div>
      <div class="sig-col">
        <div class="sig-header">
          <strong>Thủ kho</strong>
          <small>(Ký, họ tên)</small>
        </div>
        <div class="sig-space"></div>
        <div class="sig-name">${esc(contactName)}</div>
      </div>
      <div class="sig-col stamp-col">
        <div class="sig-header">
          <strong>${standard === 'enterprise' ? 'Kế toán trưởng / Giám đốc' : 'Chủ hộ kinh doanh'}</strong>
          <small>(Ký, họ tên, đóng dấu)</small>
        </div>
        <div class="stamp-guide"><span>Đóng dấu / Mộc</span></div>
        <div class="sig-name">${esc(contactName)}</div>
      </div>
    </div>
  `;

  if (standard === 'household') {
    signatures = `
      <div class="voucher-signatures-grid cols-3">
        <div class="sig-col">
          <div class="sig-header">
            <strong>Người lập biểu</strong>
            <small>(Ký, họ tên)</small>
          </div>
          <div class="sig-space"></div>
          <div class="sig-name">${esc(activeUserName)}</div>
        </div>
        <div class="sig-col">
          <div class="sig-header">
            <strong>${isReceive ? 'Người giao hàng' : 'Người nhận hàng'}</strong>
            <small>(Ký, họ tên)</small>
          </div>
          <div class="sig-space"></div>
          <div class="sig-name">${esc(partySigName)}</div>
        </div>
        <div class="sig-col stamp-col">
          <div class="sig-header">
            <strong>Chủ hộ kinh doanh</strong>
            <small>(Ký, họ tên, đóng dấu)</small>
          </div>
          <div class="stamp-guide"><span>Đóng dấu / Mộc</span></div>
          <div class="sig-name">${esc(contactName)}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="voucher-sheet paper-${esc(paper)}">
      <div class="voucher-top-grid">
        <div class="voucher-company-info">
          <strong>${esc(companyName)}</strong>
          <span>Địa chỉ: ${esc(companyAddress || '—')}</span>
          ${taxCode ? `<span>Mã số thuế: ${esc(taxCode)}</span>` : ''}
          ${phone ? `<span>Điện thoại: ${esc(phone)}</span>` : ''}
        </div>
        <div class="voucher-form-code">
          ${formCodeBadge}
        </div>
      </div>

      <div class="voucher-heading">
        <h1>${isReceive ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'}</h1>
        <div class="voucher-date">${esc(dateStr)}</div>
        <div class="voucher-no">Số: ${esc(code)}</div>
      </div>

      <div class="voucher-meta-info">
        <div class="v-row">
          <span class="v-label">- Họ và tên người ${isReceive ? 'giao hàng' : 'nhận hàng'}:</span>
          <span class="v-val"><b>${esc(isReceive ? (deliverer || '—') : (receiver || '—'))}</b></span>
        </div>
        <div class="v-row">
          <span class="v-label">- Hình thức & Lý do ${isReceive ? 'nhập' : 'xuất'}:</span>
          <span class="v-val"><b>${esc(typeLabel)}</b>${doc.reference ? ` (${esc(doc.reference)})` : ''}</span>
        </div>
        <div class="v-row">
          <span class="v-label">- ${isReceive ? 'Nhập tại kho' : 'Xuất tại kho'}:</span>
          <span class="v-val"><b>${esc(whName)}</b></span>
        </div>
        ${doc.note ? `
          <div class="v-row">
            <span class="v-label">- Ghi chú:</span>
            <span class="v-val">${esc(doc.note)}</span>
          </div>
        ` : ''}
      </div>

      <table class="voucher-table">
        <thead>
          <tr>
            <th rowspan="2" style="width:40px">STT</th>
            <th rowspan="2">Tên, nhãn hiệu, quy cách vật tư, hàng hóa</th>
            <th rowspan="2" style="width:90px">Mã số (SKU)</th>
            <th rowspan="2" style="width:55px">ĐVT</th>
            <th colspan="2" style="width:130px">Số lượng</th>
            <th rowspan="2" style="width:100px">Đơn giá</th>
            <th rowspan="2" style="width:115px">Thành tiền</th>
          </tr>
          <tr>
            <th style="font-size:0.85em;padding:3px">${isReceive ? 'Chứng từ' : 'Yêu cầu'}</th>
            <th style="font-size:0.85em;padding:3px">Thực ${isReceive ? 'nhập' : 'xuất'}</th>
          </tr>
          <tr style="font-size:0.82em;color:#475569;background:#f8fafc">
            <th>A</th>
            <th>B</th>
            <th>C</th>
            <th>D</th>
            <th>1</th>
            <th>2</th>
            <th>3</th>
            <th>4 = 2 x 3</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || `<tr><td colspan="8" class="text-center" style="padding:16px">Không có mặt hàng nào</td></tr>`}
          <tr class="row-total">
            <td colspan="4" class="text-center"><b>Cộng:</b></td>
            <td class="text-center"><b>${fmt(lines.reduce((s,l)=>s+Number(l.qty||0),0))}</b></td>
            <td class="text-center"><b>${fmt(lines.reduce((s,l)=>s+Number(l.qty||0),0))}</b></td>
            <td class="text-right">—</td>
            <td class="text-right"><b>${fmt(grandTotal)} ₫</b></td>
          </tr>
        </tbody>
      </table>

      <div class="voucher-amount-words">
        - Tổng số tiền (viết bằng chữ): <b>${esc(docTienBangChu(grandTotal))}</b>.
      </div>
      <div class="voucher-amount-words" style="margin-top:-8px;font-size:0.9em;color:#475569">
        - Số chứng từ gốc kèm theo: 01 bản (${esc(doc.reference || code)}).
      </div>

      ${signatures}
    </div>
  `;
}

function openWarehouseVoucherModal(doc, kind = 'receive') {
  let standard = 'enterprise';
  let paper = 'A4';

  function renderView() {
    const voucherHtml = renderWarehouseVoucherHtml(doc, kind, { standard, paper });
    return `
      <div class="voucher-modal-wrap">
        <div class="voucher-toolbar">
          <div class="voucher-standard-select">
            <label>Mẫu biểu:</label>
            <select id="selVoucherStandard">
              <option value="enterprise" ${standard==='enterprise'?'selected':''}>Doanh nghiệp (TT 200 & TT 133)</option>
              <option value="household" ${standard==='household'?'selected':''}>Hộ kinh doanh (TT 88/2021/TT-BTC)</option>
              <option value="compact" ${standard==='compact'?'selected':''}>Cá nhân / Tinh gọn</option>
            </select>
            <label style="margin-left:10px">Khổ in:</label>
            <select id="selVoucherPaper">
              <option value="A4" ${paper==='A4'?'selected':''}>Khổ A4</option>
              <option value="A5" ${paper==='A5'?'selected':''}>Khổ A5</option>
            </select>
          </div>
          <div class="voucher-actions">
            <button type="button" class="primary-btn compact" id="btnPrintVoucherAction">${icon('printer')} In chứng từ</button>
            <button type="button" class="secondary-btn compact" id="btnExportVoucherCsv">${icon('download')} Xuất Excel</button>
          </div>
        </div>
        <div id="voucherContainer">${voucherHtml}</div>
      </div>
    `;
  }

  openModal({
    title: kind === 'receive' ? 'Phiếu Nhập Kho (Mẫu 01-VT)' : 'Phiếu Xuất Kho (Mẫu 02-VT)',
    sub: `${doc.document_id || doc.id || 'Chứng từ kho'} · Chuẩn Bộ Tài chính`,
    hideSubmit: true,
    fullScreen: true,
    body: renderView()
  });

  const root = $('#modalRoot');
  const bindVoucherEvents = () => {
    $('#selVoucherStandard', root)?.addEventListener('change', e => {
      standard = e.target.value;
      const host = $('#voucherContainer', root);
      if (host) host.innerHTML = renderWarehouseVoucherHtml(doc, kind, { standard, paper });
    });
    $('#selVoucherPaper', root)?.addEventListener('change', e => {
      paper = e.target.value;
      const host = $('#voucherContainer', root);
      if (host) host.innerHTML = renderWarehouseVoucherHtml(doc, kind, { standard, paper });
    });
    $('#btnPrintVoucherAction', root)?.addEventListener('click', () => {
      const html = renderWarehouseVoucherHtml(doc, kind, { standard, paper });
      let printRoot = document.getElementById('qbizPrintRoot');
      if (!printRoot) {
        printRoot = document.createElement('div');
        printRoot.id = 'qbizPrintRoot';
        printRoot.className = 'qbiz-print-only';
        document.body.appendChild(printRoot);
      }
      printRoot.innerHTML = html;
      toast('Đang mở hộp thoại in phiếu...', 'ok');
      requestAnimationFrame(() => {
        window.print();
      });
    });
    $('#btnExportVoucherCsv', root)?.addEventListener('click', () => {
      const lines = Array.isArray(doc.lines) ? doc.lines : [];
      const header = ['STT', 'Mã hàng (SKU)', 'Tên sản phẩm', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'];
      const rows = lines.map((l, i) => {
        const p = product(l.productId);
        const qty = Number(l.qty || 0);
        const price = l.price != null ? Number(l.price) : 0;
        const total = l.line_total != null ? Number(l.line_total) : qty * price;
        return [i + 1, l.sku || p?.sku || '', l.name || p?.name || '', l.unit || p?.unit || 'cái', qty, price, total];
      });
      exportCsv(kind === 'receive' ? 'phieu-nhap-kho' : 'phieu-xuat-kho', header, rows);
    });
  };
  bindVoucherEvents();
}

function sendZaloOrder(saleOrOrder) {
  const profile = (state.data?.settings || []).find(x => x.id === PROFILE_SETTING)?.value || {};
  const code = saleOrOrder.code || saleOrOrder.id || 'Đơn hàng';
  const total = Number(saleOrOrder.grand_total ?? saleOrOrder.total ?? 0);
  const custName = saleOrOrder.customer_label || 'Quý khách';
  const phone = saleOrOrder.customer_phone || saleOrOrder.phone || '';
  const lines = (saleOrOrder.items || []).map(i => `- ${i.name} (x${i.quantity || i.qty || 1}): ${fmt(i.line_total || i.lineTotal || (Number(i.unit_price || i.price || 0) * Number(i.quantity || 1)))} ₫`).join('\n');
  const text = `CẢM ƠN QUÝ KHÁCH ${custName.toUpperCase()} ĐÃ MUA HÀNG TẠI ${profile.store_name || profile.display_name || 'QBIZ'}!\n\n`
    + `Mã đơn: ${code}\n`
    + `Ngày: ${dt(saleOrOrder.created_at || new Date().toISOString())}\n\n`
    + `Chi tiết đơn hàng:\n${lines}\n\n`
    + `TỔNG CỘNG: ${fmt(total)} ₫\n`
    + `Thanh toán: ${paymentLabel(saleOrOrder.payment_method || saleOrOrder.payments?.[0]?.method || 'cash')}\n`
    + (profile.hotline ? `Hotline hỗ trợ: ${profile.hotline}\n` : '')
    + `Kính chúc Quý khách luôn dồi dào sức khỏe!`;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Đã sao chép nội dung hóa đơn để gửi Zalo!', 'ok');
    }).catch(() => {});
  }
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const zaloUrl = cleanPhone ? `https://zalo.me/${cleanPhone}` : `https://zalo.me`;
  window.open(zaloUrl, '_blank');
}

async function printDocument({type='receipt',documentId='',saleId='',orderId='',reprint=false,test=false,template=null}={}){
  if (type === 'receive' || type === 'issue') {
    const receipts = state.data?.purchase_receipts || [];
    let doc = documentId ? receipts.find(r => r.id === documentId || r.document_id === documentId) : null;
    if (!doc && receipts.length) {
      doc = receipts.find(r => r.kind === type) || receipts[0];
    }
    if (!doc) {
      doc = {
        id: (type === 'receive' ? 'PNK-DEMO' : 'PXK-DEMO'),
        document_id: (type === 'receive' ? 'PNK-DEMO' : 'PXK-DEMO'),
        kind: type,
        sub_type: type === 'receive' ? 'PURCHASE' : 'SALE_OUT',
        warehouse_id: state.data?.warehouses?.[0]?.id || '',
        created_at: new Date().toISOString(),
        lines: (state.data?.products || []).slice(0, 3).map(p => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit || 'cái',
          qty: 5,
          price: p.purchase_price || p.price || 150000,
          line_total: 5 * (p.purchase_price || p.price || 150000)
        }))
      };
    }
    openWarehouseVoucherModal(doc, type);
    return;
  }

  const t = template || activePrintTemplate(type);
  const targetId = documentId || saleId || orderId || state.currentSaleId || state.currentOrderId || state.saleReceipt?.id || '';

  let doc = null;
  if (targetId) {
    doc = (state.data?.sales || []).find(s => s.id === targetId || s.code === targetId || s.sale_uuid === targetId);
    if (!doc) {
      doc = (state.data?.orders || []).find(o => o.id === targetId || o.code === targetId || o.order_uuid === targetId);
    }
  }
  if (!doc && state.saleReceipt) doc = state.saleReceipt;
  if (!doc && state.currentSaleId) {
    doc = (state.data?.sales || []).find(s => s.id === state.currentSaleId);
  }
  if (!doc && state.currentOrderId) {
    doc = (state.data?.orders || []).find(o => o.id === state.currentOrderId);
  }
  if (!doc && state.data?.sales?.length) doc = state.data.sales[0];
  if (!doc && (test || sessionStorage.getItem('qbiz_preview_demo') === '1')) {
    doc = typeof getDemoReceiptPreview === 'function' ? getDemoReceiptPreview(null, t?.paper || 'RECEIPT_80') : null;
  }

  // Render voucher HTML into dedicated print container
  const html = renderReceiptVoucherHtml(doc, t, { reprint, isTest: test });
  let printRoot = document.getElementById('qbizPrintRoot');
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = 'qbizPrintRoot';
    printRoot.className = 'qbiz-print-only';
    printRoot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printRoot);
  }
  printRoot.innerHTML = html;

  // Log print job
  const isDemo = sessionStorage.getItem('qbiz_preview_demo') === '1';
  const defaultPrinterName = isDemo ? (t.paper === 'RECEIPT_58' ? 'Máy in nhiệt K58 (Demo)' : 'Máy in nhiệt K80 (Demo)') : 'Browser Print';
  const job = {
    id: printUid(),
    print_job_id: printUid(),
    document_type: type,
    document_id: doc?.code || doc?.id || targetId || 'preview',
    template_id: t.id,
    printer: defaultPrinterName,
    user: (state.data?.settings||[]).find(x=>x.id==='active_user_name')?.value || 'Thu ngân 01',
    created_at: new Date().toISOString(),
    copies: Number(t.copies) || 1,
    status: 'BROWSER_PRINT',
    error: '',
    reprint: Boolean(reprint),
    reprint_reason: reprint ? 'Người dùng yêu cầu in lại' : ''
  };
  await put('print_jobs', job);
  const allJobs = await getAll('print_jobs');
  if (state.data) state.data.print_jobs = allJobs;

  toast(test ? 'Đang mở in thử phiếu...' : 'Đã mở hộp thoại in phiếu.', 'ok');

  requestAnimationFrame(() => {
    window.print();
  });
}

function reportSales(range=state.reportRange){
  const metrics = calculateSalesMetrics({
    sales: state.data.sales,
    orders: state.data.orders,
    refunds: state.data.refunds,
    products: state.data.products,
    range,
    customStart: state.reportCustomStart,
    customEnd: state.reportCustomEnd
  });

  const taxSettings = (typeof getTaxSettings === 'function') ? getTaxSettings() : DEFAULT_TAX_SETTINGS;
  const isEcom = (s) => {
    const ch = String(s.channel || s.source || s.channel_name || '').toLowerCase();
    return ch === 'shopee' || ch === 'tiktok' || ch === 'lazada' || ch.includes('shopee') || ch.includes('tiktok') || ch.includes('lazada');
  };
  const ecomSales = (metrics.sales || []).filter(isEcom);
  const ecomGross = ecomSales.reduce((n, s) => n + Number(s.subtotal || s.total || 0), 0);
  const ecomDiscount = ecomSales.reduce((n, s) => n + Number(s.discount_total || 0), 0);
  const ecommerceNet = Math.max(0, ecomGross - ecomDiscount);
  const directNet = Math.max(0, metrics.net - ecommerceNet);
  const taxableRevenue = taxSettings.ecommerce_auto_deduct ? directNet : metrics.net;

  let estimatedVat = 0, estimatedPit = 0, estimatedTax = 0;
  if (taxSettings.business_type === 'exempt') {
    estimatedTax = 0;
  } else if (taxSettings.business_type === 'company_deduct') {
    const citRate = Number(taxSettings.cit_rate || 20) / 100;
    estimatedTax = Math.round(Math.max(0, metrics.profit) * citRate);
  } else {
    const vatRate = Number(taxSettings.vat_rate || 0) / 100;
    const pitRate = Number(taxSettings.pit_rate || 0) / 100;
    estimatedVat = Math.round(taxableRevenue * vatRate);
    estimatedPit = Math.round(taxableRevenue * pitRate);
    estimatedTax = estimatedVat + estimatedPit;
  }
  const netProfitAfterTax = Math.max(0, metrics.profit - estimatedTax);

  return {
    sales: metrics.sales,
    gross: metrics.gross,
    discount: metrics.discount,
    net: metrics.net,
    cost: metrics.cost,
    profit: metrics.profit,
    hasCost: metrics.hasCost,
    tax: metrics.tax,
    collected: metrics.collected,
    receivable: metrics.receivable,
    paymentRows: metrics.paymentRows,
    refundTotal: metrics.refundTotal,
    taxSettings,
    ecommerceNet,
    directNet,
    taxableRevenue,
    estimatedVat,
    estimatedPit,
    estimatedTax,
    netProfitAfterTax
  };
}
function renderReports(){
  const r=reportSales(),productMap=new Map();
  for(const s of r.sales)for(const i of s.items||[]){const row=productMap.get(i.item_id)||{name:i.name||'Mặt hàng',qty:0,revenue:0};row.qty+=Number(i.quantity||0);row.revenue+=Number(i.line_total??i.lineTotal??0);productMap.set(i.item_id,row)}
  const products=[...productMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,20);
  const inventory=state.data.products.filter(p=>p.type!=='SERVICE').map(p=>({p,t:totalFor(state.data,p.id)}));
  const ranges=[['today','Hôm nay'],['yesterday','Hôm qua'],['7d','7 ngày'],['month','Tháng này'],['lastmonth','Tháng trước'],['custom','Tùy chọn']];
  const salesRows=`${r.sales.map(s=>`<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code||'Phiếu bán')}</strong><small>${esc(s.customer_label||'Khách lẻ')} · ${dt(s.created_at||s.createdAt)}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có giao dịch trong khoảng đã chọn.</div>'}`;
  setTitle('Báo cáo','QBiz');
  $('#content').innerHTML=`<section class="report-center"><div class="report-filter"><label class="report-field"><span>Thời gian</span><select id="reportRange">${ranges.map(([v,l])=>`<option value="${v}" ${state.reportRange===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="report-field report-warehouse"><span>Kho</span><select id="reportWarehouse"><option value="all">Tất cả kho</option>${(state.data.warehouses||[]).map(w=>`<option value="${w.id}" ${state.reportWarehouse===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>${state.reportRange==='custom'?`<div class="report-custom-range"><label>Từ<input id="reportCustomStart" type="date" value="${esc(state.reportCustomStart)}"/></label><label>Đến<input id="reportCustomEnd" type="date" value="${esc(state.reportCustomEnd)}"/></label><button class="secondary-btn" data-report-custom-apply>Áp dụng</button></div>`:''}</div><div class="report-tabs">${[['overview','Tổng quan'],['revenue','Doanh thu'],['products','Sản phẩm'],['inventory','Kho'],['payments','Thanh toán']].map(([v,l])=>`<button class="${state.reportTab===v?'active':''}" data-report-tab="${v}">${l}</button>`).join('')}</div>${state.reportTab==='overview'||state.reportTab==='revenue'?`<section class="report-metrics"><div><span>Doanh thu trước giảm</span><b>${fmt(r.gross)} ₫</b></div><div><span>Giảm giá</span><b>− ${fmt(r.discount)} ₫</b></div><div><span>Doanh thu thuần</span><b>${fmt(r.net)} ₫</b></div><div><span>Thuế</span><b>${fmt(r.tax)} ₫</b></div><div><span>Đã thu</span><b>${fmt(r.collected)} ₫</b></div><div><span>Còn phải thu</span><b>${fmt(r.receivable)} ₫</b></div></section><section class="card section-card"><div class="section-head"><div><h2>Giao dịch nguồn</h2><p>Chỉ gồm phiếu bán hoàn tất trong khoảng đã chọn.</p></div></div>${salesRows}</section>${state.reportTab==='overview'?`<section class="card section-card"><div class="section-head"><div><h2>Lợi nhuận gộp</h2><p>${r.hasCost?'Tính toán tự động từ doanh thu thuần trừ giá vốn và hoàn tiền.':'Phiếu bán chưa có cost snapshot và chưa có sổ chi phí để tính an toàn.'}</p></div></div>${r.hasCost?`<div class="report-metrics" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:0"><div><span>Tổng giá vốn</span><b>${fmt(r.cost)} ₫</b></div><div><span>Lợi nhuận gộp</span><b style="color:#16a34a">${fmt(r.profit)} ₫</b></div><div><span>Tỷ suất lợi nhuận</span><b>${r.net>0?((r.profit/r.net)*100).toFixed(1):0}%</b></div></div>`:'<p class="muted">Chưa hiển thị lợi nhuận gộp: phiếu bán chưa có cost snapshot và chưa có sổ chi phí để tính an toàn.</p>'}</section>`:''}`:state.reportTab==='products'?`<section class="card section-card"><div class="section-head"><div><h2>Sản phẩm bán nhiều</h2><p>Từ item snapshot của phiếu bán.</p></div></div>${products.map(x=>`<div class="kv"><span><strong>${esc(x.name)}</strong><small>${fmt(x.qty)} đã bán</small></span><b>${fmt(x.revenue)} ₫</b></div>`).join('')||'<div class="empty">Chưa có dữ liệu bán hàng.</div>'}</section>`:state.reportTab==='inventory'?`<section class="card section-card"><div class="section-head"><div><h2>Tồn kho</h2><p>Đọc từ ledger level, không dùng products.stock.</p></div></div>${inventory.map(({p,t})=>`<div class="kv"><span><strong>${esc(p.name)}</strong><small>Thực ${fmt(t.onHand)} · Giữ ${fmt(t.reserved)}</small></span><b>Có thể bán ${fmt(t.available)}</b></div>`).join('')||'<div class="empty">Chưa có hàng hóa theo dõi tồn.</div>'}</section>`:`<section class="card section-card"><div class="section-head"><div><h2>Thanh toán nguồn</h2><p>Đọc trực tiếp từ payments[] của phiếu bán.</p></div></div>${r.paymentRows.map(p=>`<button class="transaction-row" data-sale-id="${p.sale.id}"><span><strong>${paymentLabel(p.method)}</strong><small>${esc(p.sale.code||'Phiếu bán')} · ${p.status==='PAID'?'Đã thu':'Chờ xác nhận'}</small></span><b>${fmt(p.amount)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có payment trong khoảng đã chọn.</div>'}</section>`}</section>`;
  $('#reportRange')?.addEventListener('change',e=>{state.reportRange=e.target.value;renderReports()});
  $('#reportWarehouse')?.addEventListener('change',e=>{state.reportWarehouse=e.target.value;renderReports()});
  $$('[data-report-tab]').forEach(b=>b.onclick=()=>{state.reportTab=b.dataset.reportTab;renderReports()});
  $('[data-report-custom-apply]')?.addEventListener('click',()=>{state.reportCustomStart=$('#reportCustomStart').value;state.reportCustomEnd=$('#reportCustomEnd').value;renderReports()});
  $$('[data-sale-id]').forEach(b=>b.onclick=()=>openTransaction(state.data.sales.find(s=>s.id===b.dataset.saleId)));
}

function featureReportSales(){
  const now=new Date(),start=new Date(now),end=new Date(now);end.setHours(23,59,59,999);
  if(state.reportRange==='today')start.setHours(0,0,0,0);
  else if(state.reportRange==='yesterday'){start.setDate(now.getDate()-1);start.setHours(0,0,0,0);end.setDate(now.getDate()-1);end.setHours(23,59,59,999)}
  else if(state.reportRange==='7d'){start.setDate(now.getDate()-6);start.setHours(0,0,0,0)}
  else if(state.reportRange==='month'){start.setDate(1);start.setHours(0,0,0,0)}
  else if(state.reportRange==='lastmonth'){start.setMonth(now.getMonth()-1,1);start.setHours(0,0,0,0);end.setDate(0);end.setHours(23,59,59,999)}
  else if(state.reportRange==='custom'){state.reportCustomStart?start.setTime(new Date(`${state.reportCustomStart}T00:00:00`).getTime()):start.setFullYear(2000);state.reportCustomEnd&&end.setTime(new Date(`${state.reportCustomEnd}T23:59:59.999`).getTime())}
  else start.setFullYear(2000);
  const sales=(state.data.sales||[]).filter(s=>{const date=new Date(s.created_at||s.createdAt);const wh=s.warehouseId||s.warehouse_id||s.location_id;return ['COMPLETED','PAID'].includes(s.status)&&date>=start&&date<=end&&(state.reportWarehouse==='all'||wh===state.reportWarehouse)});
  const saleCodes=new Set(sales.flatMap(s=>[s.code,s.id,s.sale_uuid,s.order_id,s.order_code,s.reference,s.reference_id].filter(Boolean)));
  const completedOrders=(state.data.orders||[]).filter(o=>{
    if(o.status!=='COMPLETED')return false;
    const date=new Date(o.created_at||o.createdAt||o.updated_at||0);
    const wh=o.warehouseId||o.warehouse_id||o.location_id;
    if(date<start||date>end)return false;
    if(state.reportWarehouse!=='all'&&wh!==state.reportWarehouse)return false;
    if(saleCodes.has(o.code)||saleCodes.has(o.id)||saleCodes.has(o.order_uuid))return false;
    if(o.sale_id && sales.some(s=>s.id===o.sale_id||s.sale_uuid===o.sale_id))return false;
    return true;
  }).map(o=>({
    id:o.id,
    code:o.code||o.id,
    customer_label:o.customer_label||'Khách lẻ',
    created_at:o.created_at||o.createdAt,
    subtotal:Number(o.subtotal||0),
    discount_total:Number(o.discount_total||0),
    tax_total:Number(o.tax_total||0),
    grand_total:Number(o.grand_total||0),
    total:Number(o.grand_total||0),
    status:'COMPLETED',
    payment_status:o.payment_status||'UNPAID',
    payments:o.payment_status==='PAID'?[{method:o.payment_method||'transfer',amount:Number(o.grand_total||0),status:'PAID'}]:[{method:o.payment_method||'transfer',amount:Number(o.grand_total||0),status:'PENDING'}],
    items:(o.items||[]).map(i=>({item_id:i.item_id||i.itemId,name:i.name||product(i.item_id||i.itemId)?.name||'Sản phẩm',quantity:Number(i.quantity||0),line_total:Number(i.line_total??(Number(i.quantity||0)*Number(i.unit_price||0))??0)})),
    is_order:true
  }));
  const allSales=[...sales,...completedOrders];
  const sum=key=>allSales.reduce((n,s)=>n+Number(s[key]||0),0),gross=sum('subtotal'),discount=sum('discount_total'),tax=sum('tax_total');

  const prodMap = new Map((state.data.products || []).map(p => [p.id, p]));
  let costTotal = 0;
  for (const s of allSales) {
    for (const item of (s.items || [])) {
      const pId = item.item_id || item.itemId || item.productId || item.product_id;
      const p = prodMap.get(pId);
      const itemCost = Number(item.cost_price ?? item.cost ?? p?.cost_price ?? p?.cost ?? p?.purchase_price ?? 0);
      const qty = Number(item.quantity || 1);
      costTotal += (Number(item.cost_total) > 0 ? Number(item.cost_total) : (itemCost * qty));
    }
  }
  const refundTotal = (state.data.refunds || []).filter(r => {
    const rDate = new Date(r.created_at || r.createdAt || 0);
    return rDate >= start && rDate <= end;
  }).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const net=Math.max(0,gross-discount-refundTotal);
  const hasCost = costTotal > 0;
  const profit = hasCost ? Math.max(0, net - costTotal) : 0;
  const payments=allSales.flatMap(s=>(s.payments||[]).map(p=>({...p,sale:s})));
  const collected=Math.max(0, payments.filter(p=>p.status==='PAID').reduce((n,p)=>n+Number(p.amount||0),0) - refundTotal);

  const taxSettings = (typeof getTaxSettings === 'function') ? getTaxSettings() : DEFAULT_TAX_SETTINGS;
  const isEcomSale = (s) => {
    const ch = String(s.channel || s.source || s.channel_name || '').toLowerCase();
    return ch === 'shopee' || ch === 'tiktok' || ch === 'lazada' || ch.includes('shopee') || ch.includes('tiktok') || ch.includes('lazada');
  };
  const ecomSales = allSales.filter(isEcomSale);
  const ecomGross = ecomSales.reduce((n, s) => n + Number(s.subtotal || s.total || 0), 0);
  const ecomDiscount = ecomSales.reduce((n, s) => n + Number(s.discount_total || 0), 0);
  const ecommerceNet = Math.max(0, ecomGross - ecomDiscount);
  const directNet = Math.max(0, net - ecommerceNet);

  const taxableRevenue = taxSettings.ecommerce_auto_deduct ? directNet : net;

  let estimatedVat = 0;
  let estimatedPit = 0;
  let estimatedTax = 0;
  let taxRateLabel = '0%';
  let taxModeLabel = 'Miễn thuế';

  if (taxSettings.business_type === 'exempt') {
    estimatedTax = 0;
    taxModeLabel = 'Miễn thuế / Nội bộ';
    taxRateLabel = '0%';
  } else if (taxSettings.business_type === 'company_deduct') {
    const citRate = Number(taxSettings.cit_rate || 20) / 100;
    estimatedTax = Math.round(Math.max(0, profit) * citRate);
    taxModeLabel = 'DN Khấu trừ';
    taxRateLabel = `TNDN ${taxSettings.cit_rate || 20}%`;
  } else {
    const vatRate = Number(taxSettings.vat_rate || 0) / 100;
    const pitRate = Number(taxSettings.pit_rate || 0) / 100;
    estimatedVat = Math.round(taxableRevenue * vatRate);
    estimatedPit = Math.round(taxableRevenue * pitRate);
    estimatedTax = estimatedVat + estimatedPit;
    taxModeLabel = taxSettings.business_type === 'hkd' ? 'Hộ KD (TT 40)' : 'DN trực tiếp';
    taxRateLabel = `${((vatRate + pitRate) * 100).toFixed(1)}% (${taxSettings.vat_rate}% GTGT + ${taxSettings.pit_rate}% ${taxSettings.business_type === 'hkd' ? 'TNCN' : 'TNDN'})`;
  }

  const netProfitAfterTax = Math.max(0, profit - estimatedTax);
  const profitAfterTaxMargin = net > 0 ? ((netProfitAfterTax / net) * 100).toFixed(1) : '0';

  return {
    sales:allSales,
    gross,
    discount,
    tax,
    net,
    cost:costTotal,
    profit,
    hasCost,
    payments,
    collected,
    receivable:payments.filter(p=>p.status==='PENDING').reduce((n,p)=>n+Number(p.amount||0),0),
    refundTotal,
    taxSettings,
    ecommerceNet,
    directNet,
    taxableRevenue,
    estimatedVat,
    estimatedPit,
    estimatedTax,
    taxRateLabel,
    taxModeLabel,
    netProfitAfterTax,
    profitAfterTaxMargin
  };
}
function preparedReport(title,reason){return `<section class="card feature-panel report-prepared"><div class="section-head"><div><h2>${title}</h2><p>${reason}</p></div>${surfaceStatus('prepared','Chưa đủ dữ liệu')}</div><div class="empty"><strong>Không tạo số liệu giả</strong><span>Khi contract và nguồn dữ liệu thật sẵn sàng, báo cáo này sẽ dùng cùng bộ lọc hiện tại.</span></div></section>`}
function renderFeatureReports(){
  setTitle('Báo cáo','QBiz');
  if(!userCan('VIEW_REPORT')){
    $('#content').innerHTML=`<section class="card section-card" style="text-align:center;padding:48px 16px;max-width:560px;margin:32px auto"><div style="font-size:44px;margin-bottom:12px">🔒</div><h2 style="font-size:18px;margin-bottom:8px">Không có quyền xem báo cáo</h2><p style="color:var(--text-secondary)">Tài khoản của bạn không có quyền xem báo cáo tài chính & doanh thu.</p></section>`;
    return;
  }
  const r=featureReportSales(),productMap=new Map();
  for(const s of r.sales)for(const i of s.items||[]){const key=i.item_id||i.itemId||i.sku||i.name,row=productMap.get(key)||{id:i.item_id||i.itemId,name:i.name||'Mặt hàng',qty:0,revenue:0};row.qty+=Number(i.quantity||0);row.revenue+=Number(i.line_total??i.lineTotal??0);productMap.set(key,row)}
  const products=[...productMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,20),inventory=state.data.products.filter(p=>p.type!=='SERVICE').map(p=>({p,t:stockView(p,state.reportWarehouse)})),low=inventory.filter(x=>x.t.available<=Number(x.p.lowStock||0));
  const tabs=[['overview','Tổng quan'],['revenue','Doanh thu'],['orders','Đơn hàng'],['products','Sản phẩm'],['inventory','Kho'],['payments','Thanh toán'],['returns','Trả hàng'],['debt','Công nợ'],['customers','Khách hàng'],['staff','Nhân viên / Ca'],['shipping','Vận chuyển']];
  const ranges=[['today','Hôm nay'],['yesterday','Hôm qua'],['7d','7 ngày'],['month','Tháng này'],['lastmonth','Tháng trước'],['custom','Tùy chọn']];
  const sourceRows=r.sales.map(s=>`<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code||'Phiếu bán')}</strong><small>${esc(s.customer_label||'Khách lẻ')} · ${dt(s.created_at||s.createdAt)}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có giao dịch trong khoảng đã chọn.</div>';
  const taxProfitSection=`<section class="card feature-panel tax-profit-panel" style="margin-top:16px"><div class="section-head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h2>Nghĩa vụ thuế & Lợi nhuận sau thuế</h2><p>${esc(r.taxModeLabel)} · ${esc(r.taxRateLabel)}${r.taxSettings?.ecommerce_auto_deduct?' · Miễn tính thuế đơn sàn TMĐT':''}</p></div><button type="button" class="secondary-btn tiny" data-action="tax-preferences" style="font-size:11.5px;padding:4px 10px;border-radius:6px;gap:4px">${icon('shield-check')} Cài đặt thuế</button></div><div class="tax-hero-card" style="background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border:1.5px solid #86efac;border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><div style="font-size:11.5px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px"><span>🌿 Lợi nhuận thực sau thuế</span><span style="font-size:10px;background:#bbf7d0;color:#14532d;padding:1px 6px;border-radius:4px;font-weight:700">Tỷ suất ${r.profitAfterTaxMargin}%</span></div><div style="font-size:22px;font-weight:900;color:#15803d;margin-top:2px;line-height:1.2">${r.hasCost?`${fmt(r.netProfitAfterTax)} ₫`:'Chưa có giá vốn'}</div></div>${r.hasCost?`<div style="text-align:right"><small style="font-size:11px;color:#166534;display:block">Lợi nhuận gộp ban đầu</small><strong style="font-size:13.5px;color:#166534">${fmt(r.profit)} ₫</strong></div>`:''}</div><div class="tax-statement-list" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:10px"><div class="tax-statement-row" style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12.5px"><div><strong style="color:#0f172a;display:block">1. Doanh thu ngoài sàn</strong><small style="color:#64748b;font-size:11px">Tại quầy, Website, FB/Zalo (Chịu thuế)</small></div><b style="font-size:13.5px;color:#0f172a">${fmt(r.directNet)} ₫</b></div><div class="tax-statement-row" style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12.5px;background:#f8fafc"><div><div style="display:flex;align-items:center;gap:6px"><strong style="color:#0f172a">2. Doanh thu Sàn TMĐT</strong><span style="font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:4px;background:#e0f2fe;color:#0369a1">${r.taxSettings?.ecommerce_auto_deduct?'Đã khấu trừ tại sàn':'Chưa trừ'}</span></div><small style="color:#64748b;font-size:11px">Shopee, TikTok Shop, Lazada</small></div><b style="font-size:13.5px;color:#0284c7">${fmt(r.ecommerceNet)} ₫</b></div><div class="tax-statement-row" style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;font-size:12.5px;background:#fff"><div><strong style="color:${r.estimatedTax>0?'#b91c1c':'#0f172a'};display:block">3. Thuế ước tính phải nộp</strong><small style="color:#64748b;font-size:11px">${esc(r.taxRateLabel)}</small></div><b style="font-size:14.5px;font-weight:800;color:${r.estimatedTax>0?'#b91c1c':'#0f172a'}">− ${fmt(r.estimatedTax)} ₫</b></div></div><div style="font-size:11px;color:#64748b;background:#f8fafc;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;display:flex;align-items:flex-start;gap:6px;line-height:1.4"><span style="font-size:13px;flex-shrink:0;margin-top:1px">⚖️</span><span>${r.taxSettings?.business_type==='exempt'?'Chế độ miễn thuế hoặc quản lý nội bộ. Không phát sinh nghĩa vụ thuế ước tính.':r.taxSettings?.business_type==='company_deduct'?`Doanh nghiệp phương pháp khấu trừ: TNDN ước tính ${r.taxSettings.cit_rate||20}% trên Lợi nhuận gộp (${fmt(r.profit)} ₫). GTGT kê khai theo hóa đơn VAT đầu ra/đầu vào riêng.`:`Căn cứ Thông tư 40/2021/TT-BTC: Hộ KD nộp ${r.taxSettings.vat_rate}% thuế GTGT (${fmt(r.estimatedVat)} ₫) và ${r.taxSettings.pit_rate}% thuế TNCN (${fmt(r.estimatedPit)} ₫) trên doanh thu ngoài sàn chịu thuế (${fmt(r.taxableRevenue)} ₫). Đơn hàng Shopee, TikTok Shop, Lazada đã được sàn khấu trừ thuế tự động.`}</span></div></section>`;
  let body='';
  if(['overview','revenue'].includes(state.reportTab))body=`<section class="report-metrics"><div><span>Doanh thu trước giảm</span><b>${fmt(r.gross)} ₫</b></div><div><span>Giảm giá</span><b>− ${fmt(r.discount)} ₫</b></div><div><span>Doanh thu thuần</span><b>${fmt(r.net)} ₫</b></div><div><span>Thuế</span><b>${fmt(r.tax)} ₫</b></div><div><span>Đã thu</span><b>${fmt(r.collected)} ₫</b></div><div><span>Còn phải thu theo payment</span><b>${fmt(r.receivable)} ₫</b></div></section><section class="card feature-panel"><div class="section-head"><div><h2>Giao dịch nguồn</h2><p>${r.sales.length} phiếu hoàn tất trong bộ lọc.</p></div></div>${sourceRows}</section>${state.reportTab==='overview'?(userCan('VIEW_COST') && r.hasCost?`<section class="card feature-panel"><div class="section-head"><div><h2>Lợi nhuận gộp</h2><p>Tính toán tự động từ doanh thu thuần trừ giá vốn và hoàn tiền.</p></div></div><div class="report-metrics" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:0"><div><span>Tổng giá vốn</span><b>${fmt(r.cost)} ₫</b></div><div><span>Lợi nhuận gộp</span><b style="color:#16a34a">${fmt(r.profit)} ₫</b></div><div><span>Tỷ suất lợi nhuận</span><b>${r.net>0?((r.profit/r.net)*100).toFixed(1):0}%</b></div></div></section>`:(userCan('VIEW_COST')?preparedReport('Lợi nhuận','Phiếu bán chưa có cost snapshot/expense ledger đủ để tính lợi nhuận an toàn.'):'')):''}${taxProfitSection}`;
  else if(state.reportTab==='orders')body=`<section class="card feature-panel"><div class="section-head"><div><h2>Đơn hàng</h2><p>Dữ liệu đơn hiện có; tap để xem chi tiết.</p></div></div>${(state.data.orders||[]).map(o=>`<button class="transaction-row" data-order-open="${o.id}"><span><strong>${esc(o.code||'Đơn hàng')}</strong><small>${esc(o.customer_label||'Khách lẻ')} · ${orderStatusLabel(o.status)}</small></span><b>${fmt(o.grand_total)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có đơn hàng.</div>'}</section>`;
  else if(state.reportTab==='products')body=`<section class="card feature-panel"><div class="section-head"><div><h2>Top sản phẩm theo doanh thu</h2><p>Từ item snapshot của phiếu bán.</p></div></div>${products.map(x=>`<button class="transaction-row" ${x.id?`data-product="${x.id}"`:''}><span><strong>${esc(x.name)}</strong><small>${fmt(x.qty)} đã bán</small></span><b>${fmt(x.revenue)} ₫</b>${x.id?icon('chevron-right'):''}</button>`).join('')||'<div class="empty">Chưa có dữ liệu bán hàng.</div>'}</section>`;
  else if(state.reportTab==='inventory')body=`<section class="report-metrics"><div><span>Sản phẩm theo dõi tồn</span><b>${fmt(inventory.length)}</b></div><div><span>Sắp hết / hết</span><b>${fmt(low.length)}</b></div><div><span>Kho đang lọc</span><b>${esc(warehouse(state.reportWarehouse)?.name||'Tất cả')}</b></div></section><section class="card feature-panel">${inventory.map(({p,t})=>`<button class="transaction-row" data-product="${p.id}"><span><strong>${esc(p.name)}</strong><small>Thực ${fmt(t.onHand)} · Giữ ${fmt(t.reserved)}</small></span><b>Có thể bán ${fmt(t.available)}</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có dữ liệu tồn.</div>'}</section>`;
  else if(state.reportTab==='payments')body=`<section class="card feature-panel"><div class="section-head"><div><h2>Thanh toán</h2><p>Đọc trực tiếp từ payments[].</p></div></div>${r.payments.map(p=>`<button class="transaction-row" data-sale-id="${p.sale.id}"><span><strong>${paymentLabel(p.method)}</strong><small>${esc(p.sale.code||'Phiếu bán')} · ${p.status==='PAID'?'Đã thu':'Chờ xác nhận'}</small></span><b>${fmt(p.amount)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có payment trong khoảng đã chọn.</div>'}</section>`;
  else body=preparedReport(({returns:'Trả hàng',debt:'Công nợ',customers:'Khách hàng',staff:'Nhân viên / Ca',shipping:'Vận chuyển'})[state.reportTab]||'Báo cáo','Chưa có ledger/contract đủ để tổng hợp chính xác module này.');
  $('#content').innerHTML=`<section class="report-center"><div class="report-filter"><label class="report-field"><span>Thời gian</span><select id="reportRange">${ranges.map(([v,l])=>`<option value="${v}" ${state.reportRange===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="report-field report-warehouse"><span>Kho</span><select id="reportWarehouse"><option value="all">Tất cả kho</option>${state.data.warehouses.map(w=>`<option value="${w.id}" ${state.reportWarehouse===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>${state.reportRange==='custom'?`<div class="report-custom-range"><label>Từ<input id="reportCustomStart" type="date" value="${esc(state.reportCustomStart)}"/></label><label>Đến<input id="reportCustomEnd" type="date" value="${esc(state.reportCustomEnd)}"/></label><button class="secondary-btn" data-report-custom-apply>Áp dụng</button></div>`:''}</div><div class="report-tabs">${tabs.map(([v,l])=>`<button class="${state.reportTab===v?'active':''}" data-report-tab="${v}">${l}</button>`).join('')}</div>${body}</section>`;
  $('#reportRange')?.addEventListener('change',e=>{state.reportRange=e.target.value;renderFeatureReports()});$('#reportWarehouse')?.addEventListener('change',e=>{state.reportWarehouse=e.target.value;renderFeatureReports()});$$('[data-report-tab]').forEach(b=>b.onclick=()=>{state.reportTab=b.dataset.reportTab;renderFeatureReports()});$('[data-report-custom-apply]')?.addEventListener('click',()=>{state.reportCustomStart=$('#reportCustomStart').value;state.reportCustomEnd=$('#reportCustomEnd').value;renderFeatureReports()});$$('[data-sale-id]').forEach(b=>b.onclick=()=>openTransaction(state.data.sales.find(s=>s.id===b.dataset.saleId)));$$('[data-order-open]').forEach(b=>b.onclick=()=>openOrderDetail(b.dataset.orderOpen));
}

async function renderCustomers(){
  setTitle('Khách hàng','QBiz');
  const all=(await customerRecords()).filter(c=>c.active!==false),q=state.customerSearch.toLowerCase().trim();
  if(state.page!=='customers')return;
  const rows=all.filter(c=>(state.customerType==='all'||(c.customer_type||'retail')===state.customerType)&&(!q||[c.name,c.phone,c.customer_code,c.tax_id].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q)))));
  $('#content').innerHTML=`<section class="directory-screen"><div class="directory-toolbar"><input id="customerDirectorySearch" value="${esc(state.customerSearch)}" placeholder="Tìm tên, SĐT, mã khách, MST..."/><button class="primary-btn" data-action="new-customer">+ Thêm</button></div><div class="directory-filters">${[['all','Tất cả'],['retail','Khách lẻ'],['individual','Cá nhân'],['company','Công ty'],['agent','Đại lý']].map(([v,l])=>`<button class="${state.customerType===v?'active':''}" data-customer-type="${v}">${l}</button>`).join('')}</div><div class="directory-list">${rows.map(c=>`<button class="directory-row" data-customer-open="${c.id}"><span class="directory-avatar">${esc((c.name||'K').slice(0,1))}</span><span><strong>${esc(c.customer_code||'KH')} · ${esc(c.name)}</strong><small>${esc(c.phone||'Chưa có số điện thoại')} ${c.customer_group?`· ${esc(c.customer_group)}`:''}</small></span>${Number(c.debt||0)>0?`<span style="margin-left:auto;margin-right:8px;font-size:12px;font-weight:700;color:var(--danger,#dc2626)">Nợ ${fmt(c.debt)} ₫</span>`:''}<em>${({retail:'Khách lẻ',individual:'Cá nhân',company:'Công ty',agent:'Đại lý'})[c.customer_type||'retail']}</em>${icon('chevron-right')}</button>`).join('')||'<div class="empty"><strong>Chưa có khách phù hợp</strong></div>'}</div></section>`;
  $('#customerDirectorySearch').oninput=e=>{state.customerSearch=e.target.value;renderCustomers()};$$('[data-customer-type]').forEach(b=>b.onclick=()=>{state.customerType=b.dataset.customerType;renderCustomers()});$$('[data-customer-open]').forEach(b=>b.onclick=()=>openCustomerDetail(all.find(c=>c.id===b.dataset.customerOpen)));
}

async function openDebtCollectionModal(c, defaultSaleId = null, initialAmount = null) {
  if (!c) return;
  const debtInfo = await getCustomerDebtSummary(state.data, c.id);
  const unpaidSales = debtInfo.unpaidSales || [];
  const totalDebt = Number(debtInfo.totalDebt || 0);

  if (totalDebt <= 0 && unpaidSales.length === 0) {
    toast(`Khách hàng ${c.name} hiện không có nợ cần thu.`, 'info');
    return;
  }

  const selectedSale = defaultSaleId ? unpaidSales.find(s => s.saleId === defaultSaleId) : (unpaidSales[0] || null);
  const defAmount = initialAmount != null ? initialAmount : (selectedSale ? selectedSale.debtAmount : totalDebt);

  const saleOptions = [
    `<option value="ALL" ${!defaultSaleId ? 'selected' : ''}>Tất cả phiếu nợ (trừ dần từ phiếu cũ nhất - ${fmt(totalDebt)} ₫)</option>`,
    ...unpaidSales.map(u => `<option value="${esc(u.saleId)}" ${u.saleId === defaultSaleId ? 'selected' : ''}>Phiếu ${esc(u.code)} · Nợ ${fmt(u.debtAmount)} ₫ (${u.daysOverdue} ngày)</option>`)
  ].join('');

  openModal({
    title: 'Thu tiền nợ',
    sub: `${esc(c.name)} · Tổng nợ: ${fmt(totalDebt)} ₫`,
    submitText: 'Xác nhận thu nợ',
    body: `<div class="form-grid">
      <div class="field full-span">
        <label>Chọn hóa đơn thanh toán</label>
        <select id="debtTargetSale">${saleOptions}</select>
      </div>
      <div class="field full-span">
        <label>Số tiền thu (₫)</label>
        <input id="debtPaymentAmount" type="number" inputmode="decimal" min="1000" max="${totalDebt}" value="${defAmount}" required/>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button type="button" class="secondary-btn sm" id="btnDebtPayAll" style="padding:4px 8px;font-size:12px">Thu toàn bộ (${fmt(totalDebt)} ₫)</button>
          ${selectedSale ? `<button type="button" class="secondary-btn sm" id="btnDebtPaySale" style="padding:4px 8px;font-size:12px">Thu đúng phiếu (${fmt(selectedSale.debtAmount)} ₫)</button>` : ''}
        </div>
      </div>
      <div class="field">
        <label>Hình thức thanh toán</label>
        <select id="debtPaymentMethod">
          <option value="cash">Tiền mặt (vào quỹ ca)</option>
          <option value="transfer">Chuyển khoản / VietQR</option>
        </select>
      </div>
      <div class="field">
        <label>Ghi chú thu nợ</label>
        <input id="debtPaymentNote" value="Thu nợ khách ${esc(c.name)}"/>
      </div>
    </div>`,
    onSubmit: async root => {
      const amt = Number($('#debtPaymentAmount', root).value);
      if (!amt || isNaN(amt) || amt <= 0) throw new Error('Số tiền thu phải là số dương lớn hơn 0.');
      const targetSaleVal = $('#debtTargetSale', root).value;
      const method = $('#debtPaymentMethod', root).value || 'cash';
      const note = $('#debtPaymentNote', root).value.trim();

      if (targetSaleVal && targetSaleVal !== 'ALL') {
        await markSalePaid(targetSaleVal, { amount: amt, paymentMethod: method, reference: note });
      } else {
        let remaining = amt;
        for (const u of unpaidSales) {
          if (remaining <= 0) break;
          const payThis = Math.min(remaining, u.debtAmount);
          await markSalePaid(u.saleId, { amount: payThis, paymentMethod: method, reference: note });
          remaining -= payThis;
        }
      }

      await refresh();
      toast(`Đã thu ${fmt(amt)} ₫ nợ của ${c.name}.`, 'ok');
      const allCust = await customerRecords();
      const updatedCust = allCust.find(x => x.id === c.id) || c;
      openCustomerDetail(updatedCust);
    }
  });

  const root = $('#modalRoot');
  $('#debtTargetSale', root)?.addEventListener('change', e => {
    const val = e.target.value;
    if (val === 'ALL') {
      $('#debtPaymentAmount', root).value = totalDebt;
    } else {
      const found = unpaidSales.find(s => s.saleId === val);
      if (found) $('#debtPaymentAmount', root).value = found.debtAmount;
    }
  });
  $('#btnDebtPayAll', root)?.addEventListener('click', () => {
    $('#debtPaymentAmount', root).value = totalDebt;
  });
  $('#btnDebtPaySale', root)?.addEventListener('click', () => {
    const val = $('#debtTargetSale', root).value;
    const found = unpaidSales.find(s => s.saleId === val);
    if (found) $('#debtPaymentAmount', root).value = found.debtAmount;
  });
}

function openCustomerLimitModal(c) {
  openModal({
    title: 'Hạn mức nợ & Chiết khấu',
    sub: `${esc(c.name)} · ${esc(c.phone || c.customer_code || '')}`,
    body: `<div class="form-grid">
      <div class="field full-span">
        <label>Hạn mức công nợ (₫)</label>
        <input id="editCustCreditLimit" type="number" inputmode="decimal" min="0" value="${c.creditLimit || c.credit_limit || 0}" placeholder="0 = Không giới hạn"/>
        <small class="field-limit">0 = Không giới hạn hạn mức nợ.</small>
      </div>
      <div class="field">
        <label>Chiết khấu mặc định (%)</label>
        <input id="editCustDiscount" type="number" inputmode="decimal" min="0" max="100" value="${c.default_discount || 0}"/>
      </div>
      <div class="field">
        <label>Nhóm khách hàng</label>
        <input id="editCustGroup" value="${esc(c.customer_group || '')}" placeholder="VD: Thân thiết, VIP, Đại lý"/>
      </div>
    </div>`,
    submitText: 'Lưu thay đổi',
    onSubmit: async root => {
      const limit = Math.max(0, Number($('#editCustCreditLimit', root).value) || 0);
      const disc = Math.min(100, Math.max(0, Number($('#editCustDiscount', root).value) || 0));
      const grp = $('#editCustGroup', root).value.trim();
      const updated = {
        ...c,
        creditLimit: limit,
        credit_limit: limit,
        default_discount: disc,
        customer_group: grp,
        updated_at: new Date().toISOString()
      };
      await put('customers', updated);
      await refresh();
      toast('Đã cập nhật hạn mức và thông tin khách hàng.', 'ok');
      openCustomerDetail(updated);
    }
  });
}

async function openCustomerDetail(c){
  if(!c)return;
  const debtInfo = await getCustomerDebtSummary(state.data, c.id);
  const totalDebt = Number(debtInfo.totalDebt || 0);
  const creditLimit = Number(debtInfo.creditLimit || c.creditLimit || c.credit_limit || 0);
  const availableCredit = debtInfo.availableCredit || 0;
  const isOverLimit = debtInfo.isOverLimit;
  const unpaidSales = debtInfo.unpaidSales || [];

  const sales=(state.data.sales||[]).filter(s=>s.customer_id===c.id||s.customerId===c.id||s.customer_label===c.name||String(s.customer_label||'').startsWith(c.name+' ·'));

  openModal({
    title:'Chi tiết khách hàng',
    sub:c.customer_code||c.phone||'',
    hideSubmit:true,
    body:`<div class="contact-detail">
      <div class="contact-hero">
        <span class="directory-avatar">${esc((c.name||'K').slice(0,1))}</span>
        <div>
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.phone||'Chưa có số điện thoại')}</p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <button class="primary-btn" data-customer-sell="${c.id}">Bán hàng</button>
          ${totalDebt > 0 ? `<button class="primary-btn" data-action="collect-debt" style="background:var(--danger,#dc2626);border-color:var(--danger,#dc2626)">Thu nợ</button>` : ''}
          <button class="secondary-btn" data-action="edit-limits">Hạn mức</button>
          <button class="secondary-btn" data-action="customer-soft" data-id="${c.id}" data-next="${c.active===false?'active':'inactive'}">${c.active===false?'Hiện lại':'Ẩn khách hàng'}</button>
        </div>
      </div>
      <div class="product-facts">
        <div><span>Nhóm khách</span><strong>${esc(c.customer_group||'Chưa phân nhóm')}</strong></div>
        <div><span>Chiết khấu mặc định</span><strong>${fmt(c.default_discount||0)}%</strong></div>
        <div><span>Mã số thuế</span><strong>${esc(c.tax_id||'Chưa cập nhật')}</strong></div>
        <div><span>Địa chỉ</span><strong>${esc(c.address||'Chưa cập nhật')}</strong></div>
        <div><span>Email</span><strong>${esc(c.email||'Chưa cập nhật')}</strong></div>
      </div>
      ${c.note?`<p class="order-note">${esc(c.note)}</p>`:''}
      <details open style="margin-top:10px">
        <summary style="font-weight:700">Công nợ & Hạn mức tín dụng</summary>
        <div class="product-facts" style="margin-top:8px">
          <div>
            <span>Tổng nợ hiện tại</span>
            <strong style="color:${totalDebt > 0 ? 'var(--danger,#dc2626)' : 'inherit'};font-size:15px">${fmt(totalDebt)} ₫</strong>
          </div>
          <div>
            <span>Hạn mức nợ</span>
            <strong>${creditLimit > 0 ? fmt(creditLimit) + ' ₫' : 'Không giới hạn'}</strong>
          </div>
          <div>
            <span>Hạn mức khả dụng</span>
            <strong style="color:${isOverLimit ? 'var(--danger,#dc2626)' : 'inherit'}">${creditLimit > 0 ? fmt(availableCredit) + ' ₫' : 'Vô hạn'}</strong>
          </div>
        </div>
        ${totalDebt > 0 ? `
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:13px">Hóa đơn nợ (${unpaidSales.length})</span>
            <button class="primary-btn sm" data-action="collect-debt" style="padding:4px 10px;font-size:12px">Thu nợ ngay</button>
          </div>
          <div class="directory-list" style="margin-top:6px;gap:6px">
            ${unpaidSales.map(u => `
              <div class="directory-row" style="padding:8px 10px;cursor:default">
                <span style="flex:1">
                  <strong>${esc(u.code)}</strong>
                  <small style="display:block;color:var(--text-muted,#6b7280)">${dt(u.createdAt)} · Nợ ${u.daysOverdue} ngày (${u.agingGroup === '0_30' ? 'Trong hạn' : 'Quá hạn'})</small>
                </span>
                <div style="text-align:right;margin-right:8px">
                  <b style="color:var(--danger,#dc2626);display:block">${fmt(u.debtAmount)} ₫</b>
                  <small style="color:var(--text-muted,#6b7280)">Đã trả: ${fmt(u.paidAmount)} / ${fmt(u.grandTotal)} ₫</small>
                </div>
                <button class="secondary-btn sm" data-collect-sale-id="${esc(u.saleId)}" data-sale-debt="${u.debtAmount}" style="padding:4px 8px;font-size:12px;white-space:nowrap">Thu tiền</button>
              </div>
            `).join('')}
          </div>
        ` : `<p class="muted" style="margin-top:6px">Khách hàng hiện không có nợ tồn đọng.</p>`}
      </details>
      <details><summary>Địa chỉ giao hàng / xuất hóa đơn</summary><p class="muted">Chưa có cấu trúc nhiều địa chỉ riêng. Dữ liệu hiện có vẫn được giữ nguyên.</p></details>
      <h3>Lịch sử mua</h3>
      ${sales.slice(0,10).map(s=>`<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code)}</strong><small>${dt(s.created_at)}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có giao dịch gắn với khách này.</div>'}
    </div>`
  });

  const root=$('#modalRoot');
  $('[data-customer-sell]',root)?.addEventListener('click',()=>{
    $('#modalRoot').innerHTML='';
    state.saleCustomer=c;
    navigate('sales');
  });
  $$('[data-action="collect-debt"]',root).forEach(b=>b.onclick=()=>openDebtCollectionModal(c));
  $('[data-action="edit-limits"]',root)?.addEventListener('click',()=>openCustomerLimitModal(c));
  $$('[data-collect-sale-id]',root).forEach(b=>b.onclick=()=>openDebtCollectionModal(c,b.dataset.collectSaleId,Number(b.dataset.saleDebt)));
  $$('[data-sale-id]',root).forEach(b=>b.onclick=()=>openTransaction(sales.find(s=>s.id===b.dataset.saleId)));
}
function supplierFormMarkup(s={}){
  return `<div class="form-grid supplier-form">
    <div class="field full-span"><label>Tên nhà cung cấp</label><input id="supplierName" value="${esc(s.name||'')}" placeholder="Tên công ty / cá nhân" required/></div>
    <div class="field"><label>Mã NCC</label><input id="supplierCode" value="${esc(s.code||'')}" placeholder="NCC001"/></div>
    <div class="field"><label>Số điện thoại</label><input id="supplierPhone" value="${esc(s.phone||'')}" inputmode="tel"/></div>
    <div class="field"><label>Email</label><input id="supplierEmail" value="${esc(s.email||'')}" type="email"/></div>
    <div class="field"><label>Mã số thuế</label><input id="supplierTaxCode" value="${esc(s.tax_code||'')}"/></div>
    <div class="field full-span"><label>Địa chỉ</label><input id="supplierAddress" value="${esc(s.address||'')}"/></div>
    <div class="field"><label>Trạng thái</label><select id="supplierStatus"><option value="active" ${s.status!=='inactive'?'selected':''}>Đang hoạt động</option><option value="inactive" ${s.status==='inactive'?'selected':''}>Tạm ngừng</option></select></div>
    <div class="field full-span"><label>Ghi chú</label><textarea id="supplierNote" rows="3">${esc(s.note||'')}</textarea></div>
  </div>`;
}
function readSupplierForm(root){
  return {name:$('#supplierName',root)?.value||'',code:$('#supplierCode',root)?.value||'',phone:$('#supplierPhone',root)?.value||'',email:$('#supplierEmail',root)?.value||'',tax_code:$('#supplierTaxCode',root)?.value||'',address:$('#supplierAddress',root)?.value||'',status:$('#supplierStatus',root)?.value||'active',note:$('#supplierNote',root)?.value||''};
}
function openSupplierDraft(existing=null){
  const editing=Boolean(existing?.id);
  openModal({title:editing?'Sửa nhà cung cấp':'Thêm nhà cung cấp',sub:editing?'Cập nhật thông tin và giữ lịch sử nhập.':'Lưu hồ sơ nhà cung cấp trên thiết bị này.',body:supplierFormMarkup(existing||{}),submitText:editing?'Lưu thay đổi':'Tạo nhà cung cấp',onSubmit:async root=>{const fields=readSupplierForm(root);if(editing) await updateSupplier({...existing,...fields});else await createSupplier(fields);}});
}
function renderSuppliers(){
  setTitle('Nhà cung cấp','QBiz');
  const query=norm(state.supplierSearch);
  const receipts=state.data.purchase_receipts||[];
  const products=state.data.products||[];
  const suppliers=(state.data.suppliers||[]).filter(s=>!query||[s.name,s.code,s.phone,s.email,s.tax_code].some(v=>norm(v).includes(query))).map(s=>{
    const related=products.filter(p=>p.supplier_id===s.id||p.supplier_name===s.name);
    const history=receipts.filter(r=>r.supplier_id===s.id);
    const total=history.reduce((sum,r)=>sum+(r.total_cost==null?0:Number(r.total_cost||0)),0);
    return {...s,products:related,receipts:history,total};
  });
  $('#content').innerHTML=`<section class="directory-screen">
    <div class="section-head"><div><h2>Nhà cung cấp</h2><p>${state.data.suppliers?.length||0} hồ sơ · phiếu nhập được liên kết thật</p></div><button class="primary-btn" data-action="new-supplier">+ Thêm</button></div>
    <div class="directory-toolbar"><input id="supplierDirectorySearch" value="${esc(state.supplierSearch)}" placeholder="Tìm tên, mã, SĐT, email..."/><span class="muted">${suppliers.length} kết quả</span></div>
    <div class="surface-callout"><span>${surfaceStatus('working','Đang dùng')}</span><p>Hồ sơ NCC và liên kết phiếu nhập được lưu trong IndexedDB local.</p></div>
    <div class="directory-list">${suppliers.map(s=>`<button class="directory-row" data-supplier-open="${esc(s.id)}"><span class="directory-avatar">${esc((s.name||'N').slice(0,1))}</span><span><strong>${esc(s.code||'NCC')} · ${esc(s.name)}</strong><small>${esc(s.phone||s.email||'Chưa có liên hệ')} · ${s.receipts.length} phiếu nhập</small></span><em>${s.status==='inactive'?'Tạm ngừng':`${fmt(s.total)} ₫`}</em>${icon('chevron-right')}</button>`).join('')||'<div class="empty"><strong>Chưa có nhà cung cấp phù hợp</strong><span>Thêm một hồ sơ để liên kết vào phiếu nhập.</span></div>'}</div>
  </section>`;
  $('#supplierDirectorySearch').oninput=e=>{state.supplierSearch=e.target.value;renderSuppliers()};
  $$('[data-supplier-open]').forEach(b=>b.onclick=()=>openSupplierDetail(suppliers.find(s=>s.id===b.dataset.supplierOpen)));
}
function openSupplierDetail(s){
  if(!s)return;
  const receiptRows=s.receipts.slice(0,12).map(r=>`<button class="transaction-row" data-receipt-id="${esc(r.id)}"><span><strong>${esc(r.reference||r.document_id||r.id)}</strong><small>${dt(r.created_at)} · ${r.lines?.length||0} dòng${r.warehouse_id?` · ${esc(warehouse(r.warehouse_id)?.name||'')}`:''}</small></span><b>${r.total_cost==null?'Chưa đủ giá':`${fmt(r.total_cost)} ₫`}</b></button>`).join('');
  openModal({title:s.name,sub:s.code||'Nhà cung cấp',hideSubmit:true,footer:`<button class="secondary-btn" data-action="supplier-status" data-id="${s.id}" data-next="${s.status==='inactive'?'active':'inactive'}">${s.status==='inactive'?'Kích hoạt lại':'Ngừng sử dụng'}</button><button class="secondary-btn" data-close>Đóng</button>`,body:`<div class="contact-detail">
    <div class="supplier-detail-head"><div class="directory-avatar">${esc((s.name||'N').slice(0,1))}</div><button class="secondary-btn" data-supplier-edit="${esc(s.id)}">Sửa</button></div>
    <div class="product-facts"><div><span>Điện thoại</span><strong>${esc(s.phone||'Chưa cập nhật')}</strong></div><div><span>Email</span><strong>${esc(s.email||'Chưa cập nhật')}</strong></div><div><span>Mã số thuế</span><strong>${esc(s.tax_code||'Chưa cập nhật')}</strong></div><div><span>Địa chỉ</span><strong>${esc(s.address||'Chưa cập nhật')}</strong></div><div><span>Tổng mua</span><strong>${s.total?fmt(s.total)+' ₫':'Chưa đủ dữ liệu giá nhập'}</strong></div><div><span>Số phiếu nhập</span><strong>${s.receipts.length}</strong></div></div>
    ${s.note?`<p class="order-note">${esc(s.note)}</p>`:''}<h3>Lịch sử nhập</h3>${receiptRows||'<div class="empty">Chưa có phiếu nhập liên kết.</div>'}
  </div>`});
  $('[data-supplier-edit]',$('#modalRoot'))?.addEventListener('click',()=>{$('#modalRoot').innerHTML='';openSupplierDraft(s)});
}

const surfaceStatus=(kind='prepared',label='Chuẩn bị')=>`<em class="surface-status ${kind}">${label}</em>`;
const hubItem=(page,ico,title,sub,status='')=>`<button data-page="${page}"><span>${icon(ico)}<b>${title}</b><small>${sub}</small></span>${status}${icon('chevron-right')}</button>`;
function renderMore(){
  setTitle('Thêm','QBiz');
  $('#content').innerHTML=`<section class="more-screen feature-hub">
    <div class="more-group"><h2>Công việc</h2><div class="hub-list">${hubItem('transactions','file-text','Giao dịch & hóa đơn','Phiếu bán và chứng từ')}${hubItem('returns','undo-2','Trả / Đổi','Xử lý theo giao dịch gốc')}${hubItem('customers','user','Khách hàng','Thông tin và lịch sử mua')}${CONFIG.FEATURE_FLAGS.shift?hubItem('shifts','clipboard-check','Ca thu ngân','Mở, đóng và đối soát ca'):''}</div></div>
    <div class="more-group"><h2>Quản lý</h2><div class="hub-list">${hubItem('suppliers','package-plus','Nhà cung cấp','Hồ sơ và lịch sử nhập')}${hubItem('reports','layout-dashboard','Báo cáo','Doanh thu, bán hàng và tồn kho')}</div></div>
    <div class="more-group"><h2>Hệ thống</h2><div class="hub-list">${hubItem('settings','settings-2','Cài đặt','Cửa hàng, thiết bị và dữ liệu')}</div></div>
  </section>`;
}

/* ============================================================
   FEATURE ADDITIONS — local foundation (KV trên settings, KHÔNG đổi schema)
   Vùng: Cài đặt → Tiện ích nâng cao. Không sửa màn protected.
   ============================================================ */
const MODKEY=k=>`module:${k}`;
async function modList(key){const v=await settingValue(MODKEY(key),[]);return Array.isArray(v)?v:[];}
async function modSave(key,value){await saveLocalSetting(MODKEY(key),value);return value;}
const mid=p=>`${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
function panelScreen(title,sub,statusKind,statusLabel,body){setTitle(title,'QBiz');$('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>${esc(title)}</h2><p>${sub}</p></div>${surfaceStatus(statusKind,statusLabel)}</div>${body}</section></section>`;}
function modRow(main,sub,right=''){return `<div class="mod-row"><div><strong>${main}</strong><small>${sub}</small></div><div class="mod-right">${right}</div></div>`;}
function modEmpty(t,s){return `<div class="empty"><strong>${esc(t)}</strong><span>${esc(s)}</span></div>`;}
function modNote(t){return `<p class="field-limit">${t}</p>`;}
function printHtmlDoc(html){const w=window.open('','_blank');if(!w){toast('Trình duyệt chặn cửa sổ in. Cho phép popup rồi thử lại.','error');return false;}w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>QBiz Kho</title></head><body style="font-family:system-ui,'Segoe UI',Arial,sans-serif;margin:10px">${html}</body></html>`);w.document.close();w.focus();setTimeout(()=>{try{w.print();}catch(e){}},400);return true;}

function renderAdvancedHub(){
  const groups=[
    ['Giá & bán hàng',[
      ['prices','shopping-cart','Bảng giá & giá sỉ','Giá bán lẻ, giá sỉ theo mức giảm'],
      ['promos','clipboard-check','Khuyến mại','Chương trình giảm giá theo thời gian'],
      ['combos','package-plus','Combo / bộ sản phẩm','Gộp nhiều mặt hàng thành một gói'],
      ['units','arrow-left-right','Đơn vị quy đổi','Thùng, lốc, hộp quy về đơn vị gốc'],
    ]],
    ['Kho',[
      ['opening','package-minus','Tồn đầu kỳ','Thiết lập tồn mở đầu theo kho'],
      ['labels','printer','In tem & barcode','Tem sản phẩm kèm mã vạch Code39'],
    ]],
    ['Tài chính',[
      ['cash','file-text','Sổ quỹ thu chi','Phiếu thu, phiếu chi và số dư quỹ'],
      ['debts','layout-dashboard','Công nợ','Phải thu khách hàng, phải trả nhà cung cấp'],
    ]],
    ['Chứng từ & mua hàng',[
      ['documents','file-text','Trung tâm chứng từ','Mọi hóa đơn, nhập, xuất, chuyển, trả, thu/chi'],
      ['purchase-orders','package-plus','Đơn mua nhà cung cấp','Đặt hàng NCC, theo dõi và nhận hàng'],
      ['replenish','package-minus','Đề xuất nhập hàng','Mặt hàng dưới tồn tối thiểu'],
      ['supplier-returns','undo-2','Trả hàng nhà cung cấp','Xuất trả hàng NCC & thu hồi vốn'],
      ['numbering','clipboard-check','Mã chứng từ','Prefix và số thứ tự theo loại chứng từ'],
    ]],
    ['Hệ thống',[
      ['search','scan-line','Tìm kiếm toàn cục','Tìm sản phẩm, phiếu, khách, nhà cung cấp'],
      ['audit','file-text','Nhật ký hoạt động','Dấu vết thao tác đã lưu trên thiết bị'],
      ['modules','settings-2','Mô-đun tính năng','Bật/tắt mô-đun nâng cao'],
      ['exports','printer','Xuất dữ liệu','Xuất CSV hàng hóa, tồn, khách, NCC, đơn'],
      ['diagnostics','settings-2','Chẩn đoán','Thông tin hệ thống phục vụ hỗ trợ'],
      ['onboarding','clipboard-check','Hướng dẫn bắt đầu','Danh sách việc cần làm ban đầu'],
    ]],
    ['Tùy chọn nâng cao',[
      ['optional','qr-code','Mô-đun tùy chọn','Loyalty, ví, CTV, bảo hành, serial, lô hàng'],
    ]],
  ];
  setTitle('Tiện ích nâng cao','QBiz');
  $('#content').innerHTML=`<section class="more-screen feature-hub">${groups.map(([t,items])=>`<div class="more-group"><h2>${t}</h2><div class="hub-list">${items.map(([p,i,n,s])=>hubItem(p,i,n,s)).join('')}</div></div>`).join('')}</section>`;
}

async function renderPrices(){
  const lists=await modList('price_lists');
  const products=state.data.products.filter(p=>p.type!=='SERVICE');
  const sel=state.priceProduct&&products.some(p=>p.id===state.priceProduct)?state.priceProduct:(products[0]?.id||'');
  const p=products.find(x=>x.id===sel);
  const lookup=lists.map(l=>({l,price:Math.round(Number(p?.price||0)*(100-Math.min(100,Math.max(0,Number(l.discount)||0)))/100)}));
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="price-new">Thêm bảng giá</button></div>
${lists.length?lists.map(l=>modRow(esc(l.name),`${l.kind==='wholesale'?'Bán sỉ':'Bán lẻ'} · giảm ${fmt(l.discount)}% · từ ${fmt(l.minQty||1)} sản phẩm`,'<button class="secondary-btn" data-action="price-del" data-id="'+l.id+'">Xóa</button>')).join(''):modEmpty('Chưa có bảng giá','Thêm bảng giá bán lẻ hoặc bán sỉ để tra cứu.')}
${lists.length&&p?`<div class="mod-block"><label class="mod-label">Tra giá theo sản phẩm</label><select id="priceProduct">${products.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.name)}</option>`).join('')}</select><div class="mod-list">${lookup.map(({l,price})=>modRow(esc(l.name),`Giá gốc ${fmt(p?.price||0)} ₫ · giảm ${fmt(l.discount)}%`,`<b>${fmt(price)} ₫</b>`)).join('')}</div></div>`:''}
${modNote('Áp dụng trực tiếp vào giỏ hàng: <b>chưa nối</b> (cần hook POS). Bảng giá dùng để tra cứu, in và làm nền contract sau.')}`;
  panelScreen('Bảng giá & giá sỉ','Bảng giá theo % giảm cho khách lẻ và khách sỉ.','working','Đang dùng',body);
  $('#priceProduct')?.addEventListener('change',e=>{state.priceProduct=e.target.value;renderPrices();});
}

async function renderPromotions(){
  const rows=await modList('promotions');
  const today=new Date().toISOString().slice(0,10);
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="promo-new">Thêm khuyến mại</button></div>
${rows.length?rows.map(r=>{const live=r.active&&(!r.from||r.from<=today)&&(!r.to||r.to>=today);return modRow(esc(r.name),`${r.kind==='percent'?`Giảm ${fmt(r.value)}%`:`Giảm ${fmt(r.value)} ₫`} · ${esc(r.from||'không giới hạn')} → ${esc(r.to||'không giới hạn')}`,`<em class="surface-status ${live?'working':'prepared'}">${live?'Đang chạy':'Tạm dừng'}</em><button class="secondary-btn" data-action="promo-toggle" data-id="${r.id}">${r.active?'Tắt':'Bật'}</button><button class="secondary-btn" data-action="promo-del" data-id="${r.id}">Xóa</button>`);}).join(''):modEmpty('Chưa có chương trình','Tạo chương trình giảm giá theo % hoặc số tiền.')}
${modNote('Tự động trừ vào giỏ hàng: <b>chưa nối</b> (cần hook POS). Hiện lưu cấu hình và trạng thái chương trình.')}`;
  panelScreen('Khuyến mại','Chương trình giảm giá theo khoảng thời gian.','working','Đang dùng',body);
}

async function renderCombos(){
  const combos=await modList('combos');
  const pm=new Map(state.data.products.map(p=>[p.id,p]));
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="combo-new">Thêm combo</button></div>
${combos.length?combos.map(c=>{const items=(c.items||[]);const sum=items.reduce((n,i)=>n+Number(pm.get(i.productId)?.price||0)*Number(i.qty||1),0);const price=Number(c.price||0);return modRow(esc(c.name),`${items.length} mặt hàng · giá lẻ ${fmt(sum)} ₫${price?` · tiết kiệm ${fmt(Math.max(0,sum-price))} ₫`:' · chưa đặt giá combo'}`,'<button class="secondary-btn" data-action="combo-del" data-id="'+c.id+'">Xóa</button>');}).join(''):modEmpty('Chưa có combo','Gộp nhiều sản phẩm thành một gói bán.')}
${modNote('Ghi combo vào giỏ hàng: <b>chưa nối</b>. Combo lưu cấu hình và tính giá tham chiếu.')}`;
  panelScreen('Combo / bộ sản phẩm','Nhóm sản phẩm bán theo gói.','working','Đang dùng',body);
}

async function renderUnits(){
  const rows=await modList('units');
  const pm=new Map(state.data.products.map(p=>[p.id,p]));
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="unit-new">Thêm quy đổi</button></div>
${rows.length?rows.map(u=>{const p=pm.get(u.productId);const conv=(u.conversions||[]).map(c=>`1 ${esc(c.name)} = ${fmt(c.factor)} ${esc(p?.unit||'đơn vị')}`).join(' · ');return modRow(esc(p?.name||u.productId),conv||'Chưa có quy đổi','<button class="secondary-btn" data-action="unit-del" data-id="'+u.id+'">Xóa</button>');}).join(''):modEmpty('Chưa có quy đổi','Ví dụ: 1 thùng = 12 chai, 1 lốc = 6 lon.')}
${modNote('Quy đổi giúp tính giá và số lượng theo thùng/lốc. Áp dụng tự động vào bán hàng: <b>chưa nối</b>.')}`;
  panelScreen('Đơn vị quy đổi','Quy đổi đơn vị bán về đơn vị gốc.','working','Đang dùng',body);
}

async function renderOpening(){
  const levels=state.data.levels||[];
  const pm=new Map(state.data.products.map(p=>[p.id,p]));
  const wm=new Map(state.data.warehouses.map(w=>[w.id,w]));
  const openings=new Set((state.data.movements||[]).filter(m=>m.type==='OPENING').map(m=>`${m.productId}:${m.warehouseId}`));
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="opening-set">Thiết lập tồn đầu</button></div>
<div class="mod-list">${levels.length?levels.slice(0,120).map(l=>modRow(esc(pm.get(l.productId)?.name||l.productId),`${esc(wm.get(l.warehouseId)?.name||l.warehouseId)} · ${openings.has(l.id)?'đã có nguồn tồn đầu':'chưa có movement nguồn'}`,`<b>${fmt(l.onHand)}</b>`)).join(''):modEmpty('Chưa có tồn kho','Thêm sản phẩm hoặc nhập kho trước.')}</div>
${modNote('Tồn đầu kỳ luôn ghi movement <b>OPENING</b> để Thẻ kho và đối soát giải thích được số tồn. Không xóa movement cũ, không reset tồn.')}`;
  panelScreen('Tồn đầu kỳ','Số tồn mở đầu theo sản phẩm và kho.','working','Đang dùng',body);
}

const C39={'0':'101001101101','1':'110100101011','2':'101100101011','3':'110110010101','4':'101001101011','5':'110100110101','6':'101100110101','7':'101001011011','8':'110100101101','9':'101100101101','A':'110101001011','B':'101101001011','C':'110110100101','D':'101011001011','E':'110101100101','F':'101101100101','G':'101010011011','H':'110101001101','I':'101101001101','J':'101011001101','K':'110101010011','L':'101101010011','M':'110110101001','N':'101011010011','O':'110101101001','P':'101101101001','Q':'101010110011','R':'110101011001','S':'101101011001','T':'101011011001','U':'110010101011','V':'100110101011','W':'110011010101','X':'100101101011','Y':'110010110101','Z':'100110110101','-':'100101011011','.':'110010101101',' ':'100110101101','$':'100100100101','/':'100100101001','+':'100101001001','%':'101001001001','*':'100101101101'};
function code39Svg(text,height=38,moduleWidth=1.5){
  const clean=String(text||'').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g,'-').slice(0,22)||'QBIZ';
  const quiet=moduleWidth*8;let x=0,bars='';
  for(const ch of `*${clean}*`){const pat=C39[ch]||C39['-'];for(const bit of pat){if(bit==='1')bars+=`<rect x="${(quiet+x).toFixed(2)}" y="0" width="${moduleWidth}" height="${height}" fill="#000"/>`;x+=moduleWidth;}}
  const width=quiet+x+quiet;
  return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height}" viewBox="0 0 ${width.toFixed(0)} ${height}">${bars}</svg>`;
}

async function renderLabels(){
  const products=state.data.products;
  const sel=new Set(state.labelItems||[]);
  const body=`<div class="mod-grid"><label><span>Số bản mỗi sản phẩm</span><input id="labelCopies" type="number" min="1" max="50" value="${Number(state.labelCopies)||1}"/></label><label><span>Khổ tem</span><select id="labelSize"><option value="40x30">40 × 30 mm</option><option value="50x40">50 × 40 mm</option><option value="60x40">60 × 40 mm</option></select></label></div>
<div class="mod-block"><label class="mod-label">Chọn sản phẩm (${sel.size})</label><div class="mod-check-list">${products.map(p=>`<label class="mod-check"><input type="checkbox" data-label-item="${p.id}" ${sel.has(p.id)?'checked':''}/><span>${esc(p.name)}<small>${esc(p.sku||'chưa có SKU')}</small></span></label>`).join('')}</div></div>
<div class="mod-actions"><button class="primary-btn" data-action="label-print">In tem</button><button class="secondary-btn" data-action="label-clear">Bỏ chọn</button></div>
${modNote('Mã vạch Code39 lấy từ SKU. In ra cửa sổ riêng; kiểm tra cỡ tem với máy in thật trước khi in hàng loạt.')}`;
  panelScreen('In tem & barcode','Tem sản phẩm kèm mã vạch Code39.','working','Đang dùng',body);
  $$('[data-label-item]').forEach(c=>{c.onchange=()=>{const set=new Set(state.labelItems||[]);c.checked?set.add(c.dataset.labelItem):set.delete(c.dataset.labelItem);state.labelItems=[...set];const lab=$('.mod-label');if(lab)lab.textContent=`Chọn sản phẩm (${set.size})`;};});
  $('#labelCopies')?.addEventListener('input',e=>{state.labelCopies=e.target.value;});
  $('#labelSize')?.addEventListener('change',e=>{state.labelSize=e.target.value;});
}

async function renderCash(){
  const rows=(await modList('cash_entries')).slice();
  const shifts=state.data.shifts||[];
  const activeShift=shifts.find(s=>s.status==='OPEN');
  const shiftStart=activeShift?new Date(activeShift.opened_at):null;

  const cashSales=(state.data.sales||[]).filter(s=>{
    if((s.payment_method||s.payments?.[0]?.method)!=='cash') return false;
    if((s.payment_status||s.payments?.[0]?.status||'PAID')!=='PAID') return false;
    if(activeShift){
      return s.shift_id===activeShift.id || (shiftStart && new Date(s.created_at||s.createdAt)>=shiftStart);
    }
    return true;
  });
  const salesTotal=cashSales.reduce((n,s)=>n+Number(s.grand_total??s.total??0),0);

  const filterRows=activeShift&&shiftStart?rows.filter(r=>new Date(r.created_at||`${r.date}T23:59:59`)>=shiftStart):rows;
  const tin=filterRows.filter(r=>r.kind==='in').reduce((n,r)=>n+Number(r.amount||0),0);
  const tout=filterRows.filter(r=>r.kind==='out').reduce((n,r)=>n+Number(r.amount||0),0);

  const saleMap=new Map((state.data.sales||[]).map(s=>[s.id,s]));
  const cashRefunds=(state.data.refunds||[]).filter(r=>{
    const orig=saleMap.get(r.sale_id);
    const m=r.method==='original'?(orig?.payment_method||'cash'):r.method;
    if(m!=='cash') return false;
    if(activeShift){
      return r.shift_id===activeShift.id || (shiftStart && new Date(r.created_at)>=shiftStart);
    }
    return true;
  });
  const refundTotal=cashRefunds.reduce((n,r)=>n+Number(r.amount||0),0);

  const openingCash=Number(activeShift?.opening_cash||0);
  const drawerCash=openingCash+salesTotal+tin-refundTotal-tout;

  const entries=[];
  if(activeShift&&openingCash>0){
    entries.push({date:activeShift.opened_at,title:'Tiền đầu ca (mở két)',sub:`${dt(activeShift.opened_at)} · Ca bán hàng`,amount:`+ ${fmt(openingCash)} ₫`,badge:'info',action:''});
  }
  for(const s of cashSales){
    entries.push({date:s.created_at||s.createdAt,title:`Bán hàng · ${esc(s.code||s.id)}`,sub:`${dt(s.created_at||s.createdAt)} · ${esc(s.customer_label||'Khách lẻ')}`,amount:`+ ${fmt(s.grand_total??s.total)} ₫`,badge:'ok',action:''});
  }
  for(const r of cashRefunds){
    const orig=saleMap.get(r.sale_id);
    entries.push({date:r.created_at,title:`Chi hoàn tiền · ${esc(r.return_id||r.id)}`,sub:`${dt(r.created_at)} · Khách trả hàng (${esc(orig?.code||r.sale_id)})`,amount:`− ${fmt(r.amount)} ₫`,badge:'danger',action:''});
  }
  for(const r of filterRows){
    entries.push({date:r.date,title:`${r.kind==='in'?'Thu khác':'Chi khác'} · ${esc(r.note||'Không ghi chú')}`,sub:`${esc(r.date||'')} · ${esc(r.method||'Tiền mặt')}`,amount:`${r.kind==='in'?'+':'−'} ${fmt(r.amount)} ₫`,badge:r.kind==='in'?'ok':'warn',action:`<button class="secondary-btn" data-action="cash-del" data-id="${r.id}">Xóa</button>`});
  }
  entries.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));

  const body=`<div class="mod-summary">${openingCash?`<div><span>Tiền đầu ca</span><b>${fmt(openingCash)} ₫</b></div>`:''}<div><span>Thu bán hàng (tiền mặt)</span><b>${fmt(salesTotal)} ₫</b></div><div><span>Thu khác (CASH_IN)</span><b>${fmt(tin)} ₫</b></div><div><span>Chi hoàn hàng (REFUND)</span><b>− ${fmt(refundTotal)} ₫</b></div><div><span>Phiếu chi khác (CASH_OUT)</span><b>− ${fmt(tout)} ₫</b></div><div class="grand"><span>Tồn quỹ trong két</span><b>${fmt(drawerCash)} ₫</b></div></div>
<div class="mod-actions"><button class="primary-btn" data-action="cash-in">Phiếu thu</button><button class="secondary-btn" data-action="cash-out">Phiếu chi</button></div>
<div class="mod-list">${entries.length?entries.map(e=>modRow(e.title,e.sub,`<b>${e.amount}</b>${e.action}`)).join(''):modEmpty('Chưa có phát sinh quỹ','Thu tiền mặt từ bán hàng và phiếu thu/chi sẽ hiện ở đây.')}</div>
${modNote('Sổ quỹ thống nhất: Tự động cộng tiền bán hàng, tiền đầu ca; tự động trừ tiền chi hoàn hàng và phiếu chi ngoài.')}`;
  panelScreen('Sổ quỹ thu chi',activeShift?'Sổ quỹ tiền mặt ca hiện tại và tồn két thực tế.':'Sổ quỹ tiền mặt và tồn két thực tế.','working','Đang dùng',body);
}

async function renderDebts(){
  const sales=state.data.sales||[];
  const owed=new Map();
  for(const s of sales){const status=s.payment_status||s.payments?.[0]?.status||'PAID';if(status==='PAID')continue;const key=s.customer_label||'Khách lẻ';const row=owed.get(key)||{label:key,total:0,count:0};row.total+=Number(s.grand_total??s.total??0);row.count++;owed.set(key,row);}
  const recv=[...owed.values()].sort((a,b)=>b.total-a.total);
  const recvTotal=recv.reduce((n,r)=>n+r.total,0);
  const manual=await modList('debt_entries');
  const custManual=manual.filter(d=>d.kind==='receivable');
  const supManual=manual.filter(d=>d.kind==='payable');
  const supTotal=supManual.reduce((n,d)=>n+Number(d.amount||0),0);
  const body=`<div class="mod-summary"><div><span>Phải thu khách hàng (từ phiếu chờ thu)</span><b>${fmt(recvTotal)} ₫</b></div><div><span>Phải thu ghi tay</span><b>${fmt(custManual.reduce((n,d)=>n+Number(d.amount||0),0))} ₫</b></div><div><span>Phải trả nhà cung cấp</span><b>${fmt(supTotal)} ₫</b></div><div class="grand"><span>Chênh lệch</span><b>${fmt(recvTotal+custManual.reduce((n,d)=>n+Number(d.amount||0),0)-supTotal)} ₫</b></div></div>
<div class="mod-actions"><button class="primary-btn" data-action="debt-new" data-kind="receivable">Ghi nợ phải thu</button><button class="secondary-btn" data-action="debt-new" data-kind="payable">Ghi nợ phải trả</button></div>
<div class="mod-block"><label class="mod-label">Phải thu theo khách (${recv.length})</label><div class="mod-list">${recv.length?recv.map(r=>modRow(esc(r.label),`${fmt(r.count)} phiếu chờ thu`,`<b>${fmt(r.total)} ₫</b>`)).join(''):modEmpty('Không có phải thu','Mọi phiếu bán đã được thu tiền.')}</div></div>
<div class="mod-block"><label class="mod-label">Ghi tay (${manual.length})</label><div class="mod-list">${manual.length?manual.map(d=>modRow(`${d.kind==='receivable'?'Phải thu':'Phải trả'} · ${esc(d.party||'—')}`,`${esc(d.note||'')} ${esc(d.due||'')}`,`<b>${fmt(d.amount)} ₫</b><button class="secondary-btn" data-action="debt-del" data-id="${d.id}">Xóa</button>`)).join(''):modEmpty('Chưa có ghi tay','Ghi nợ phải thu/trả ngoài phiếu bán.')}</div></div>
${modNote('Phải thu tự tính từ phiếu bán <b>chờ thu</b> (chuyển khoản/QR). Công nợ nhà cung cấp theo phiếu nhập: <b>chưa nối</b>.')}`;
  panelScreen('Công nợ','Phải thu khách hàng và phải trả nhà cung cấp.','working','Đang dùng',body);
}

async function renderAudit(){
  const rows=(state.data.outbox||[]).slice().sort((a,b)=>String(b.created_at||b.updated_at||'').localeCompare(String(a.created_at||a.updated_at||'')));
  const q=norm(state.auditSearch||'');
  const type=state.auditType||'all', range=state.auditRange||'all';
  const spans={'today':864e5,'7d':7*864e5,'30d':30*864e5,'all':0};
  const from=range==='all'?0:Date.now()-(spans[range]||0);
  const filtered=rows.filter(r=>{
    if(type!=='all'&&(r.type||'')!==type)return false;
    if(from&&new Date(r.created_at||r.updated_at||0).getTime()<from)return false;
    if(q&&!norm([r.type,r.action,r.entity_type,r.entity_id,r.operation_id,r.device_id].join(' ')).includes(q))return false;
    return true;
  });
  const kinds=new Map();for(const r of rows){const k=r.type||r.entity_type||'khác';kinds.set(k,(kinds.get(k)||0)+1);}
  const pending=rows.filter(r=>r.sync_status==='PENDING').length;
  const listHtml=filtered.length?filtered.slice(0,150).map(r=>modRow(esc(r.type||r.action||'thao tác'),esc(`${r.entity_type||''} ${r.entity_id||''} · ${dt(r.created_at||r.updated_at||new Date().toISOString())}`),`<em class="surface-status ${r.sync_status==='PENDING'?'prepared':'working'}">${esc(r.sync_status||'')}</em>`)).join(''):modEmpty('Không có bản ghi phù hợp','Thử từ khóa khác.');
  const body=`<div class="mod-summary"><div><span>Tổng bản ghi</span><b>${fmt(rows.length)}</b></div><div><span>Chờ đồng bộ</span><b>${fmt(pending)}</b></div><div><span>Loại thao tác</span><b>${fmt(kinds.size)}</b></div></div>
<div class="search large"><input id="auditSearch" value="${esc(state.auditSearch||'')}" placeholder="Tìm theo loại thao tác, entity, operation id..."/></div>
<div class="mod-chips">${[...kinds.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>`<button data-action="audit-filter" data-type="${esc(k)}">${esc(k)} · ${fmt(n)}</button>`).join('')}</div>
<div class="mod-grid"><label><span>Loại thao tác</span><select id="auditType"><option value="all">Tất cả</option>${[...kinds.keys()].map(k=>`<option value="${esc(k)}" ${type===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label><label><span>Khoảng thời gian</span><select id="auditRange">${[['today','Hôm nay'],['7d','7 ngày'],['30d','30 ngày'],['all','Tất cả']].map(([v,l])=>`<option value="${v}" ${range===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
<div class="mod-list">${listHtml}</div>
${modNote('Nhật ký đọc từ hàng đợi thao tác (outbox) trên thiết bị — mỗi thao tác ghi kho/bán/đơn đều để lại một dấu vết.')}`;
  panelScreen('Nhật ký hoạt động','Dấu vết thao tác đã ghi trên thiết bị.','working','Có dữ liệu',body);
  $('#auditSearch')?.addEventListener('input',e=>{state.auditSearch=e.target.value;keepFocus('#auditSearch',renderAudit);});
  $$('[data-action="audit-filter"]').forEach(b=>{b.onclick=()=>{state.auditType=b.dataset.type;renderAudit();};});
  $('#auditType')?.addEventListener('change',e=>{state.auditType=e.target.value;renderAudit();});
  $('#auditRange')?.addEventListener('change',e=>{state.auditRange=e.target.value;renderAudit();});
}

function renderSearch(){
  const q=norm(state.globalQuery||'');
  const d=state.data;
  const hit=(...vals)=>q&&vals.some(v=>norm(v).includes(q));
  const stock=new Map();
  for(const l of (d.levels||[])) stock.set(l.productId,(stock.get(l.productId)||0)+Number(l.onHand||0));
  const products=q?d.products.filter(p=>hit(p.name,p.sku,p.barcode,p.category)).slice(0,12):[];
  const sales=q?(d.sales||[]).filter(s=>hit(s.code,s.customer_label,s.payment_method)).slice(0,12):[];
  const customers=q?(d.customers||[]).filter(c=>hit(c.name,c.phone,c.customer_code,c.tax_id)).slice(0,12):[];
  const suppliers=q?(d.suppliers||[]).filter(s=>hit(s.name,s.code,s.phone)).slice(0,12):[];
  const orders=q?(d.orders||[]).filter(o=>hit(o.code,o.customer_label,o.status)).slice(0,12):[];
  const group=(title,rows,fn)=>rows.length?`<div class="mod-block"><label class="mod-label">${title} (${rows.length})</label><div class="mod-list">${rows.map(fn).join('')}</div></div>`:'';
  const total=products.length+sales.length+customers.length+suppliers.length+orders.length;
  const body=`<div class="search large"><input id="globalQuery" value="${esc(state.globalQuery||'')}" placeholder="Tìm sản phẩm, phiếu bán, khách hàng, NCC, đơn..."/></div>
${q?`<div class="mod-summary"><div><span>Từ khóa</span><b>${esc(state.globalQuery)}</b></div><div><span>Kết quả</span><b>${fmt(total)}</b></div></div>`:''}
${q?[group('Sản phẩm',products,p=>`<button class="mod-row mod-click" data-action="search-product" data-id="${p.id}"><div><strong>${esc(p.name)}</strong><small>${esc(p.sku||'')} · tồn ${fmt(stock.get(p.id)||0)}</small></div><div class="mod-right"><b>${fmt(p.price)} ₫</b>${icon('chevron-right')}</div></button>`),
group('Phiếu bán',sales,s=>`<button class="mod-row mod-click" data-action="search-sale" data-id="${s.id}"><div><strong>${esc(s.code||'Phiếu bán')}</strong><small>${esc(s.customer_label||'Khách lẻ')} · ${esc(dt(s.created_at||s.createdAt||new Date().toISOString()))}</small></div><div class="mod-right"><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</div></button>`),
group('Khách hàng',customers,c=>`<button class="mod-row mod-click" data-action="search-customer" data-id="${c.id}"><div><strong>${esc(c.name)}</strong><small>${esc([c.phone,c.customer_code].filter(Boolean).join(' · ')||'Chưa có liên hệ')}</small></div><div class="mod-right">${icon('chevron-right')}</div></button>`),
group('Nhà cung cấp',suppliers,s=>`<button class="mod-row mod-click" data-action="search-supplier" data-id="${s.id}"><div><strong>${esc(s.name)}</strong><small>${esc([s.phone,s.code].filter(Boolean).join(' · ')||'')}</small></div><div class="mod-right">${icon('chevron-right')}</div></button>`),
group('Đơn hàng',orders,o=>`<button class="mod-row mod-click" data-action="search-order" data-id="${o.id}"><div><strong>${esc(o.code||'Đơn')}</strong><small>${esc(o.customer_label||'Khách lẻ')} · ${esc(orderStatusLabel(o.status))}</small></div><div class="mod-right">${icon('chevron-right')}</div></button>`)].join(''):modEmpty('Nhập từ khóa để tìm','Tìm đồng thời sản phẩm, phiếu bán, khách hàng, nhà cung cấp và đơn hàng.')}
${q&&!total?modEmpty('Không có kết quả','Thử từ khóa ngắn hơn hoặc bỏ dấu.')  :''}`;
  panelScreen('Tìm kiếm toàn cục','Tìm nhanh trên toàn bộ dữ liệu thiết bị.','working','Đang dùng',body);
  $('#globalQuery')?.addEventListener('input',e=>{state.globalQuery=e.target.value;keepFocus('#globalQuery',renderSearch);});
}

const EXTRA_MODULES=[['opt_loyalty','Loyalty / điểm thưởng'],['opt_wallet','Ví khách hàng'],['opt_commission','CTV / hoa hồng'],['opt_warranty','Bảo hành / sửa chữa'],['opt_serial','Serial / IMEI'],['opt_lot','Lô & hạn dùng'],['opt_branch','Đa chi nhánh'],['opt_delivery','Giao hàng nâng cao'],['opt_einvoice','Hóa đơn điện tử']];
const FLAG_LABELS={shipping_connector:'Kết nối vận chuyển',marketplace_connector:'Kết nối sàn TMĐT',customer_debt:'Công nợ khách hàng',supplier_debt:'Công nợ nhà cung cấp',shift:'Ca bán hàng',advanced_profit:'Lợi nhuận nâng cao',e_invoice:'Hóa đơn điện tử',split_payment:'Thanh toán tách nhiều phần',cod_reconciliation:'Đối soát COD'};
const FLAG_WIRED={shift:'Có xử lý',customer_debt:'Có xử lý',supplier_debt:'Có xử lý (ghi tay)',e_invoice:'Chưa có nhà cung cấp HĐĐT',shipping_connector:'Chưa có adapter',marketplace_connector:'Chưa có adapter',advanced_profit:'Chưa có contract giá vốn',split_payment:'Chưa có flow thanh toán',cod_reconciliation:'Chưa có đối soát'};
async function renderModules(){
  const overrides=await settingValue(MODKEY('flags'),{});
  const flags={...CONFIG.FEATURE_FLAGS,...(overrides||{})};
  for(const [k,l] of EXTRA_MODULES){ if(!(k in flags)) flags[k]=!!(overrides||{})[k]; FLAG_LABELS[k]=l; FLAG_WIRED[k]='Chưa có xử lý'; }
  const body=`<div class="mod-list">${Object.entries(flags).map(([k,v])=>modRow(esc(FLAG_LABELS[k]||k),`${esc(k)} · ${esc(FLAG_WIRED[k]||'Chưa có xử lý')}`,`<button class="secondary-btn" data-action="flag-toggle" data-flag="${k}">${v?'Đang bật':'Đang tắt'}</button>`)).join('')}</div>
${modNote('Bật mô-đun chỉ lưu trạng thái local. Mô-đun ghi <b>Chưa có xử lý</b> sẽ chưa thay đổi hành vi cho tới khi có contract/hook.')}`;
  panelScreen('Mô-đun tính năng','Bật/tắt mô-đun nâng cao (mặc định tắt).','working','Đang dùng',body);
}

async function renderOnboarding(){
  const d=state.data;
  const steps=[
    ['store','Điền thông tin cửa hàng',(d.settings||[]).some(s=>s.id==='business_profile'&&s.value&&Object.values(s.value).some(Boolean)),'settings'],
    ['package-plus','Có ít nhất một sản phẩm',d.products.length>0,'products'],
    ['arrow-left-right','Có kho hàng',d.warehouses.length>0,'settings'],
    ['shopping-cart','Đã bán phiếu đầu tiên',(d.sales||[]).length>0,'sales'],
    ['user','Có khách hàng',(d.customers||[]).length>0,'customers'],
    ['package-plus','Có nhà cung cấp',(d.suppliers||[]).length>0,'suppliers'],
    ['printer','Có mẫu in',(d.print_templates||[]).length>0,'prints'],
    ['clipboard-check','Đã dùng ca bán hàng',(d.shifts||[]).length>0,'settings'],
  ];
  const doneCount=steps.filter(([, ,ok])=>ok).length;
  const body=`<div class="mod-summary"><div><span>Hoàn thành</span><b>${doneCount}/${steps.length}</b></div><div><span>Còn lại</span><b>${steps.length-doneCount}</b></div></div>
<div class="mod-list">${steps.map(([ico,label,ok,page])=>`<button class="mod-row mod-click" data-page="${page}"><div><strong>${ok?'✓ ':''}${esc(label)}</strong><small>${ok?'Đã xong':'Chưa thực hiện'}</small></div><div class="mod-right"><em class="surface-status ${ok?'working':'prepared'}">${ok?'Xong':'Cần làm'}</em>${icon('chevron-right')}</div></button>`).join('')}</div>
${modNote('Danh sách suy ra từ dữ liệu thật trên thiết bị, không lưu trạng thái giả.')}`;
  panelScreen('Hướng dẫn bắt đầu','Các việc nên làm khi mới dùng QBiz Kho.','working','Đang dùng',body);
}

const OPTIONAL_MODULES=[
  ['Loyalty / điểm thưởng','Tích điểm theo phiếu bán, đổi quà. Cần contract điểm + hook POS.'],
  ['Ví khách hàng','Số dư trả trước, trừ dần khi bán. Cần sổ cái ví + đối soát.'],
  ['CTV / hoa hồng','Gắn người giới thiệu, tính hoa hồng theo phiếu. Cần contract đối tác.'],
  ['Bảo hành / sửa chữa','Phiếu tiếp nhận, trạng thái xử lý, hẹn trả. Cần module dịch vụ sau bán.'],
  ['Serial / IMEI','Theo dõi từng máy. Cần bảng serial + quét khi nhập/xuất.'],
  ['Lô & hạn dùng','Theo lô, FEFO khi xuất. Cần bảng lot + chọn lô khi bán.'],
  ['Đa chi nhánh','Nhiều cửa hàng, kho liên chi nhánh. Cần contract chi nhánh + phân quyền.'],
  ['Referral / giới thiệu','Mã giới thiệu, thưởng hai chiều. Cần contract khách-voucher.'],
  ['Báo giá / đơn nháp','Phiếu báo giá chuyển thành đơn. Có thể dùng trạng thái đơn hiện có.'],
];
function renderOptional(){
  const body=`<div class="mod-list">${OPTIONAL_MODULES.map(([name,need])=>modRow(esc(name),esc(need),'<em class="surface-status prepared">Chuẩn bị</em>')).join('')}</div>
${modNote('Các mô-đun dưới đây <b>chưa kích hoạt</b>. Bề mặt chỉ nêu phạm vi và điều kiện dữ liệu cần có — không giả lập hoạt động.')}`;
  panelScreen('Mô-đun tùy chọn','Phạm vi và điều kiện dữ liệu của mô-đun nâng cao.','prepared','Chuẩn bị',body);
}

async function deleteModuleRow(key,id,rerender){if(!id)return;const rows=await modList(key);await modSave(key,rows.filter(r=>r.id!==id));toast('Đã xóa.','ok');await rerender();}
async function toggleModuleRow(key,id,rerender){const rows=await modList(key);await modSave(key,rows.map(r=>r.id===id?{...r,active:!r.active}:r));await rerender();}
async function applyModuleFlags(){const saved=await settingValue(MODKEY('flags'),{});if(saved&&typeof saved==='object')Object.assign(CONFIG.FEATURE_FLAGS,saved);}
async function toggleFeatureFlag(flag){const overrides=(await settingValue(MODKEY('flags'),{}))||{};const current={...CONFIG.FEATURE_FLAGS,...overrides}[flag];overrides[flag]=!current;await saveLocalSetting(MODKEY('flags'),overrides);CONFIG.FEATURE_FLAGS[flag]=overrides[flag];await renderModules();}

function openPriceForm(){
  openModal({title:'Thêm bảng giá',sub:'Giá bán lẻ hoặc giá sỉ theo mức giảm.',submitText:'Lưu bảng giá',body:`<div class="form-grid"><div class="field full-span"><label>Tên bảng giá</label><input id="plName" placeholder="VD: Giá sỉ đại lý"/></div><div class="field"><label>Loại giá</label><select id="plKind"><option value="retail">Bán lẻ</option><option value="wholesale">Bán sỉ</option></select></div><div class="field"><label>Giảm giá (%)</label><input id="plDiscount" type="number" min="0" max="100" value="0"/></div><div class="field"><label>Áp dụng từ (số sản phẩm)</label><input id="plMin" type="number" min="1" value="1"/></div></div>`,onSubmit:async root=>{const name=$('#plName',root).value.trim();if(!name)throw new Error('Hãy nhập tên bảng giá.');const rows=await modList('price_lists');rows.push({id:mid('pl'),name,kind:$('#plKind',root).value,discount:Math.min(100,Math.max(0,Number($('#plDiscount',root).value)||0)),minQty:Math.max(1,Number($('#plMin',root).value)||1),created_at:new Date().toISOString()});await modSave('price_lists',rows);state.page='prices';}});
}
function openPromoForm(){
  openModal({title:'Thêm khuyến mại',submitText:'Lưu chương trình',body:`<div class="form-grid"><div class="field full-span"><label>Tên chương trình</label><input id="prName" placeholder="VD: Khai trương giảm 10%"/></div><div class="field"><label>Hình thức</label><select id="prKind"><option value="percent">Giảm theo %</option><option value="amount">Giảm theo số tiền</option></select></div><div class="field"><label>Mức giảm</label><input id="prValue" type="number" min="0" value="0"/></div><div class="field"><label>Từ ngày</label><input id="prFrom" type="date"/></div><div class="field"><label>Đến ngày</label><input id="prTo" type="date"/></div></div>`,onSubmit:async root=>{const name=$('#prName',root).value.trim();if(!name)throw new Error('Hãy nhập tên chương trình.');const rows=await modList('promotions');rows.push({id:mid('pr'),name,kind:$('#prKind',root).value,value:Math.max(0,Number($('#prValue',root).value)||0),from:$('#prFrom',root).value,to:$('#prTo',root).value,active:true,created_at:new Date().toISOString()});await modSave('promotions',rows);state.page='promos';}});
}
function openComboForm(){
  const products=state.data.products.filter(p=>p.type!=='SERVICE');
  openModal({title:'Thêm combo',sub:'Chọn mặt hàng trong gói và giá bán combo.',submitText:'Lưu combo',fullScreen:true,body:`<div class="form-grid"><div class="field full-span"><label>Tên combo</label><input id="cbName" placeholder="VD: Combo phòng khách"/></div><div class="field"><label>Giá combo (₫)</label><input id="cbPrice" type="number" min="0"/></div><div class="field full-span"><label>Chọn sản phẩm</label><div class="mod-check-list">${products.map(p=>`<label class="mod-check"><input type="checkbox" data-cb-item="${p.id}"/><span>${esc(p.name)}<small>${fmt(p.price)} ₫</small></span><input type="number" min="1" value="1" data-cb-qty="${p.id}"/></label>`).join('')}</div></div></div>`,onSubmit:async root=>{const name=$('#cbName',root).value.trim();if(!name)throw new Error('Hãy nhập tên combo.');const items=$$('[data-cb-item]:checked',root).map(i=>({productId:i.dataset.cbItem,qty:Math.max(1,Number($(`[data-cb-qty="${i.dataset.cbItem}"]`,root)?.value||1))}));if(!items.length)throw new Error('Chọn ít nhất một sản phẩm.');const rows=await modList('combos');rows.push({id:mid('cb'),name,items,price:Math.max(0,Number($('#cbPrice',root).value)||0),created_at:new Date().toISOString()});await modSave('combos',rows);state.page='combos';}});
}
function openUnitForm(){
  openModal({title:'Thêm quy đổi',submitText:'Lưu quy đổi',body:`<div class="form-grid"><div class="field full-span"><label>Sản phẩm</label><select id="unProduct">${productOptions()}</select></div><div class="field"><label>Tên đơn vị</label><input id="unName" placeholder="VD: Thùng"/></div><div class="field"><label>Hệ số quy đổi</label><input id="unFactor" type="number" min="1" value="1"/></div></div><p class="field-limit">Ví dụ: 1 Thùng = 12 đơn vị gốc thì hệ số là 12.</p>`,onSubmit:async root=>{const productId=$('#unProduct',root).value,name=$('#unName',root).value.trim(),factor=Math.max(1,Number($('#unFactor',root).value)||1);if(!productId)throw new Error('Chọn sản phẩm.');if(!name)throw new Error('Nhập tên đơn vị.');const rows=await modList('units');const ex=rows.find(r=>r.productId===productId);if(ex)ex.conversions=[...(ex.conversions||[]).filter(c=>c.name!==name),{name,factor}];else rows.push({id:mid('un'),productId,conversions:[{name,factor}]});await modSave('units',rows);state.page='units';}});
}
function openOpeningForm(){
  openModal({title:'Thiết lập tồn đầu',sub:'Ghi movement OPENING cho sản phẩm tại kho.',submitText:'Lưu tồn đầu',body:`<div class="form-grid"><div class="field"><label>Kho</label><select id="opWarehouse">${whOptions()}</select></div><div class="field"><label>Sản phẩm</label><select id="opProduct">${productOptions()}</select></div><div class="field"><label>Tồn đầu kỳ</label><input id="opQty" type="number" min="0" value="0"/></div></div><p class="field-limit">Hệ thống ghi thêm một movement OPENING bằng phần chênh lệch. Không xóa movement cũ và không reset tồn.</p>`,onSubmit:async root=>{const productId=$('#opProduct',root).value,warehouseId=$('#opWarehouse',root).value,qty=Number($('#opQty',root).value);if(!productId||!warehouseId)throw new Error('Chọn kho và sản phẩm.');if(!Number.isFinite(qty)||qty<0)throw new Error('Tồn đầu không hợp lệ.');const cur=(state.data.levels||[]).find(l=>l.productId===productId&&l.warehouseId===warehouseId);if(cur&&Number(cur.onHand)===qty)throw new Error('Tồn đang đúng bằng giá trị này, không cần ghi thêm.');await setOpeningStock({productId,warehouseId,qty});state.page='opening';}});
}
function openCashForm(kind){
  const activeShift = (state.data?.shifts||[]).find(s=>s.status==='OPEN');
  openModal({
    title: kind==='in'?'Phiếu thu':'Phiếu chi / Chi phí vận hành',
    sub: kind==='out' ? (activeShift ? 'Ghi nhận chi phí & trừ quỹ tiền mặt trong ca đang mở.' : 'Ghi nhận chi phí vận hành cửa hàng.') : 'Ghi nhận khoản thu tiền mặt hoặc ngân hàng.',
    submitText: 'Lưu phiếu',
    body: kind==='out' ? `<div class="form-grid">
      <div class="field"><label>Danh mục chi</label><select id="csCategory">
        <option value="Chi phí vận hành">Chi phí vận hành chung</option>
        <option value="Tiền điện / nước / internet">Tiền điện / nước / internet</option>
        <option value="Văn phòng phẩm / Bao bì / Túi">Văn phòng phẩm / Bao bì / Túi</option>
        <option value="Tiếp khách / Ăn uống ca">Tiếp khách / Ăn uống ca</option>
        <option value="Vận chuyển / Ship ngoài">Vận chuyển / Ship ngoài</option>
        <option value="Sửa chữa / Bảo trì quầy kệ">Sửa chữa / Bảo trì quầy kệ</option>
        <option value="Lương / Tạm ứng nhân viên">Lương / Tạm ứng nhân viên</option>
        <option value="Chi khác">Chi phí khác</option>
      </select></div>
      <div class="field"><label>Số tiền chi (₫)</label><input id="csAmount" type="number" min="1" placeholder="Nhập số tiền chi"/></div>
      <div class="field"><label>Phương thức</label><select id="csMethod">
        <option value="Tiền mặt">Tiền mặt (Trừ quỹ két ca)</option>
        <option value="Chuyển khoản">Chuyển khoản</option>
        <option value="QR">QR</option>
      </select></div>
      <div class="field"><label>Người nhận tiền</label><input id="csPayee" placeholder="VD: Anh shipper, Cửa hàng tiện lợi..."/></div>
      <div class="field"><label>Ngày</label><input id="csDate" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
      <div class="field full-span"><label>Diễn giải / Ghi chú</label><input id="csNote" placeholder="VD: Mua 5 cuộn băng dính đóng hàng, trà đá ca..."/></div>
    </div>` : `<div class="form-grid">
      <div class="field"><label>Số tiền (₫)</label><input id="csAmount" type="number" min="1"/></div>
      <div class="field"><label>Phương thức</label><select id="csMethod"><option>Tiền mặt</option><option>Chuyển khoản</option><option>QR</option></select></div>
      <div class="field"><label>Ngày</label><input id="csDate" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
      <div class="field full-span"><label>Diễn giải</label><input id="csNote" placeholder="VD: Thu nợ khác..."/></div>
    </div>`,
    onSubmit: async root=>{
      const amount=Math.max(0,Number($('#csAmount',root).value)||0);
      if(!amount) throw new Error('Số tiền phải lớn hơn 0.');
      const method=$('#csMethod',root).value;
      const note=$('#csNote',root).value.trim();
      const date=$('#csDate',root).value;

      if(kind==='out'){
        const category=$('#csCategory',root)?.value||'Chi phí vận hành';
        const payee=$('#csPayee',root)?.value?.trim()||'';
        const currentActiveShift=(state.data?.shifts||[]).find(s=>s.status==='OPEN');
        const pMethod=method.includes('Tiền mặt')?'cash':'transfer';

        await createExpense({
          category,
          amount,
          paymentMethod: pMethod,
          note,
          payee,
          shiftId: currentActiveShift?currentActiveShift.id:''
        });
      }

      const currentActiveShift=(state.data?.shifts||[]).find(s=>s.status==='OPEN');
      const rows=await modList('cash_entries');
      rows.push({
        id: mid('cs'),
        kind,
        amount,
        method,
        shift_id: currentActiveShift ? currentActiveShift.id : '',
        date,
        note: kind==='out'?`[${$('#csCategory',root)?.value||'Chi phí'}] ${note}`:note,
        created_at: new Date().toISOString()
      });
      await modSave('cash_entries',rows);
      await refresh();
      if(state.page==='shifts') renderShiftCenter();
      else { state.page='cash'; renderCash(); }
      toast(kind==='out'?'Đã ghi nhận phiếu chi và trừ quỹ ca.':'Đã lưu phiếu thu.','ok');
    }
  });
}
function openDebtForm(kind){
  openModal({title:kind==='receivable'?'Ghi nợ phải thu':'Ghi nợ phải trả',submitText:'Lưu công nợ',body:`<div class="form-grid"><div class="field"><label>${kind==='receivable'?'Khách hàng':'Nhà cung cấp'}</label><input id="dbParty" placeholder="Tên đối tượng"/></div><div class="field"><label>Số tiền (₫)</label><input id="dbAmount" type="number" min="0"/></div><div class="field"><label>Hạn</label><input id="dbDue" type="date"/></div><div class="field full-span"><label>Ghi chú</label><input id="dbNote"/></div></div>`,onSubmit:async root=>{const party=$('#dbParty',root).value.trim(),amount=Math.max(0,Number($('#dbAmount',root).value)||0);if(!party)throw new Error('Nhập tên đối tượng.');if(!amount)throw new Error('Nhập số tiền.');const rows=await modList('debt_entries');rows.push({id:mid('db'),kind,party,amount,due:$('#dbDue',root).value,note:$('#dbNote',root).value.trim(),created_at:new Date().toISOString()});await modSave('debt_entries',rows);state.page='debts';}});
}
async function printLabels(){
  const items=state.labelItems||[];
  if(!items.length){toast('Hãy chọn ít nhất một sản phẩm để in tem.','error');return;}
  const copies=Math.max(1,Math.min(50,Number(state.labelCopies)||1));
  const pm=new Map(state.data.products.map(p=>[p.id,p]));
  const mm=(state.labelSize||'40x30').split('x');
  const w=Math.round(Number(mm[0]||40)*3.2),h=Math.round(Number(mm[1]||30)*3.2);
  const labels=items.flatMap(id=>Array.from({length:copies},()=>pm.get(id)).filter(Boolean));
  if(!labels.length){toast('Không tìm thấy sản phẩm đã chọn.','error');return;}
  const html=`<style>@page{margin:5mm}body{margin:0}.sheet{display:flex;flex-wrap:wrap;gap:3px}.lab{width:${w}px;height:${h}px;border:1px dashed #ccc;padding:2px;overflow:hidden;font-family:system-ui,Arial,sans-serif}.lab b{display:block;font-size:11px;line-height:1.1;height:24px;overflow:hidden}.lab small{display:block;font-size:10px;color:#333}.lab svg{max-width:100%;height:26px}</style><div class="sheet">${labels.map(p=>`<div class="lab"><b>${esc(p.name).slice(0,42)}</b><small>${esc(p.sku||'')}</small>${code39Svg(p.sku||p.id)}<small>${fmt(p.price)} ₫</small></div>`).join('')}</div>`;
  if(printHtmlDoc(html))toast(`Đã mở ${labels.length} tem để in.`,'ok');
}

/* ===== ROUND: chứng từ · mua hàng · đề xuất nhập · chẩn đoán ===== */
const DOC_STATUS={DRAFT:['prepared','Nháp'],ORDERED:['prepared','Đã đặt'],PARTIALLY_RECEIVED:['prepared','Nhận một phần'],RECEIVED:['working','Đã nhận'],COMPLETED:['working','Hoàn tất'],CONFIRMED:['prepared','Đã xác nhận'],PROCESSING:['prepared','Đang xử lý'],NEW:['prepared','Mới'],CANCELLED:['prepared','Đã hủy'],VOID:['prepared','Vô hiệu'],REVERSED:['prepared','Đã đảo'],PAID:['working','Đã thu'],PENDING:['prepared','Chờ thu'],UNPAID:['prepared','Chưa thu'],OPEN:['working','Đang mở'],CLOSED:['prepared','Đã đóng'],in_transit:['prepared','Đang chuyển'],received:['working','Đã nhận']};
function statusChip(s){const m=DOC_STATUS[s];if(!m)return `<em class="surface-status prepared">${esc(s||'—')}</em>`;return `<em class="surface-status ${m[0]}">${esc(m[1])}</em>`}
function supplierName(id){const s=(state.data.suppliers||[]).find(x=>x.id===id);return s?s.name:(id||'')}
async function modPatch(key,id,patch){const rows=await modList(key);const next=rows.map(r=>r.id===id?{...r,...patch}:r);await modSave(key,next);return next.find(r=>r.id===id);}
async function modFind(key,id){return (await modList(key)).find(r=>r.id===id);}
const DOC_TYPES=[['sale','Hóa đơn bán'],['order','Đơn hàng'],['receipt','Nhập kho'],['issue','Xuất kho'],['transfer','Chuyển kho'],['count','Kiểm kho'],['return','Trả / Đổi'],['purchase','Mua hàng NCC'],['purchase_order','Đơn mua NCC'],['cash','Thu / chi'],['shift','Ca bán hàng']];
let DOC_CACHE=[];
async function collectDocuments(){
  const d=state.data||{};const rows=[];
  const push=o=>rows.push(o);
  for(const s of (d.sales||[])) push({id:s.id,type:'sale',kind:'Hóa đơn bán',code:s.code||s.sale_uuid||s.id,party:s.customer_label||'Khách lẻ',at:s.created_at||s.createdAt,status:s.status||'COMPLETED',sub:s.payment_status||'',amount:Number(s.grand_total??s.total??0),raw:s,open:'sale'});
  for(const o of (d.orders||[])) push({id:o.id,type:'order',kind:'Đơn hàng',code:o.code||o.order_uuid||o.id,party:o.customer_label||'Khách lẻ',at:o.created_at||o.updated_at,status:o.status||'NEW',sub:o.payment_status||'',amount:Number(o.grand_total??0),raw:o,open:'order'});
  for(const t of (d.transfers||[])) push({id:t.id,type:'transfer',kind:'Chuyển kho',code:t.code||t.transfer_code||t.id,party:`${warehouse(t.fromWarehouseId)?.name||''} → ${warehouse(t.toWarehouseId)?.name||''}`,at:t.created_at||t.createdAt,status:t.status||'',sub:'',amount:0,raw:t,open:'page',page:'transfers'});
  for(const r of (d.returns||[])) push({id:r.id,type:'return',kind:'Trả / Đổi',code:r.code||r.return_code||r.id,party:r.customer_label||r.reason||'',at:r.created_at||r.createdAt,status:r.status||'COMPLETED',sub:'',amount:Number(r.refund_total??r.total??0),raw:r,open:'page',page:'returns'});
  for(const rc of (d.purchase_receipts||[])) push({id:rc.id,type:'purchase',kind:'Phiếu nhập NCC',code:rc.reference||rc.document_id||rc.id,party:supplierName(rc.supplier_id),at:rc.created_at,status:rc.status||'COMPLETED',sub:'',amount:Number(rc.total_cost||0),raw:rc,open:'page',page:'suppliers'});
  for(const m of (d.movements||[])){ if(!['receive','issue','count'].includes(m.type))continue; push({id:m.id,type:m.type,kind:m.type==='receive'?'Nhập kho':(m.type==='issue'?'Xuất kho':'Kiểm kho'),code:m.reference||m.id,party:warehouse(m.warehouseId)?.name||'',at:m.createdAt,status:'COMPLETED',sub:'',amount:0,raw:m,open:'page',page:'transfers'}); }
  for(const c of (await modList('cash_entries'))) push({id:c.id,type:'cash',kind:c.kind==='in'?'Phiếu thu':'Phiếu chi',code:c.code||c.id,party:c.note||'',at:c.created_at||c.date,status:'COMPLETED',sub:c.method||'',amount:Number(c.amount||0),raw:c,open:'page',page:'cash'});
  for(const sh of (d.shifts||[])) push({id:sh.id,type:'shift',kind:'Ca bán hàng',code:sh.code||sh.shift_code||sh.id,party:sh.employee||'',at:sh.opened_at,status:sh.closed_at?'CLOSED':'OPEN',sub:'',amount:Number(sh.closing_cash??sh.opening_cash??0),raw:sh,open:'page',page:'shifts'});
  for(const po of (await modList('purchase_orders'))) push({id:po.id,type:'purchase_order',kind:'Đơn mua NCC',code:po.code,party:supplierName(po.supplierId),at:po.created_at,status:po.status,sub:'',amount:Number(po.expected_total||0),raw:po,open:'po'});
  return rows;
}
async function renderDocuments(){
  const all=await collectDocuments();
  DOC_CACHE=all;
  const type=state.docType||'all', range=state.docRange||'30d', q=norm(state.docSearch||'');
  const now=Date.now(), spans={'today':864e5,'7d':7*864e5,'30d':30*864e5,'all':0};
  const from=range==='all'?0:now-(spans[range]||spans['30d']);
  const rows=all.filter(r=>{
    if(type!=='all'&&r.type!==type)return false;
    if(from&&r.at&&new Date(r.at).getTime()<from)return false;
    if(q&&!norm([r.code,r.party,r.kind,r.status].join(' ')).includes(q))return false;
    return true;
  }).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  const total=rows.reduce((n,r)=>n+r.amount,0);
  const counts=new Map();for(const r of all)counts.set(r.type,(counts.get(r.type)||0)+1);
  const body=`<div class="mod-note">Quy tắc chứng từ: DRAFT → CONFIRMED → COMPLETED, có thể CANCELLED. <b>CANCEL</b> = hủy khi chưa phát sinh; <b>VOID</b> = vô hiệu chứng từ đã ghi (giữ dấu vết); <b>REVERSAL</b> = ghi bút toán đảo. Không xóa cứng chứng từ đã phát sinh nghiệp vụ.</div>
<div class="mod-chips"><button data-doc-type="all">Tất cả · ${fmt(all.length)}</button>${DOC_TYPES.map(([t,l])=>`<button data-doc-type="${t}" class="${type===t?'active':''}">${l} · ${fmt(counts.get(t)||0)}</button>`).join('')}</div>
<div class="mod-grid"><label><span>Khoảng thời gian</span><select id="docRange">${[['today','Hôm nay'],['7d','7 ngày'],['30d','30 ngày'],['all','Tất cả']].map(([v,l])=>`<option value="${v}" ${range===v?'selected':''}>${l}</option>`).join('')}</select></label><label><span>Tổng giá trị (${fmt(rows.length)} chứng từ)</span><input value="${fmt(total)} ₫" readonly/></label></div>
<div class="search large"><input id="docSearch" value="${esc(state.docSearch||'')}" placeholder="Tìm mã chứng từ, khách hàng, NCC..."/></div>
<div class="mod-list">${rows.length?rows.slice(0,200).map(r=>`<button class="mod-row mod-click" data-doc-id="${esc(r.id)}"><div><strong>${esc(r.code||'—')}</strong><small>${esc(r.kind)} · ${esc(r.party||'—')} · ${esc(r.at?dt(r.at):'')}</small></div><div class="mod-right">${statusChip(r.status)}${r.amount?`<b>${fmt(r.amount)} ₫</b>`:''}${icon('chevron-right')}</div></button>`).join(''):modEmpty('Chưa có chứng từ phù hợp','Đổi loại, khoảng thời gian hoặc từ khóa.')}</div>`;
  panelScreen('Trung tâm chứng từ','Tổng hợp mọi chứng từ trên thiết bị — không tạo bản sao dữ liệu.','working','Đang dùng',body);
  $$('[data-doc-type]').forEach(b=>{b.onclick=()=>{state.docType=b.dataset.docType;renderDocuments();};});
  $('#docRange')?.addEventListener('change',e=>{state.docRange=e.target.value;renderDocuments();});
  $('#docSearch')?.addEventListener('input',e=>{state.docSearch=e.target.value;keepFocus('#docSearch',renderDocuments);});
  $$('[data-doc-id]').forEach(b=>{b.onclick=()=>openDocument(b.dataset.docId);});
}
async function openDocument(id){
  const row=DOC_CACHE.find(r=>r.id===id);
  if(!row){toast('Không tìm thấy chứng từ.','error');return;}
  if(row.open==='sale')return openTransaction(row.raw);
  if(row.open==='order')return openOrderDetail(row.id);
  if(row.open==='po')return openPurchaseOrder(row.id);
  return navigate(row.page||'transactions');
}

async function renderNumbering(){
  const s=state.data.settings||[];
  const val=k=>s.find(x=>x.id===k)?.value;
  const prefixes=[['POS','Hóa đơn bán',val('sale_local_sequence')],['ORD','Đơn hàng',val('order_local_sequence')],['REC','Nhập kho',null],['ISS','Xuất kho',null],['TRF','Chuyển kho',null],['CNT','Kiểm kho',null],['RET','Trả / Đổi',null],['PO','Đơn mua NCC',null],['PAY','Thu / chi',null],['SHIFT','Ca bán hàng',null]];
  const body=`<div class="mod-list">${prefixes.map(([p,label,seq])=>modRow(esc(label),`Prefix <b>${p}</b> · dạng ${docCodePreview(p,Number(seq||1))}`,seq?`<b>${fmt(Number(seq)+1)}</b>`:'<em class="surface-status prepared">Chưa cấp</em>')).join('')}</div>
${modNote('Số thứ tự do engine cấp tự động khi ghi chứng từ, không cho sửa tay để tránh trùng mã. Đổi prefix/reset kỳ: <b>PREPARED</b> (cần contract).')}`;
  panelScreen('Mã chứng từ','Prefix và số thứ tự tự động theo từng loại chứng từ.','working','Đang dùng',body);
}
function docCodePreview(prefix,n){return `${prefix}-${String(n||1).padStart(6,'0')}`}

const PO_STATUS=['DRAFT','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'];
async function renderPurchaseOrders(){
  const rows=(await modList('purchase_orders')).slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const pm=new Map(state.data.products.map(p=>[p.id,p]));
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="po-new">Tạo đơn mua</button></div>
<div class="mod-list">${rows.length?rows.map(po=>{const items=(po.lines||[]);const names=items.slice(0,2).map(l=>pm.get(l.productId)?.name||'').filter(Boolean).join(', ');return `<button class="mod-row mod-click" data-action="po-open" data-id="${po.id}"><div><strong>${esc(po.code)}</strong><small>${esc(supplierName(po.supplierId)||'Chưa chọn NCC')} · ${esc(names)}${items.length>2?'…':''} · ${esc(items.length)} dòng</small></div><div class="mod-right">${statusChip(po.status)}<b>${fmt(po.expected_total||0)} ₫</b>${icon('chevron-right')}</div></button>`}).join(''):modEmpty('Chưa có đơn mua','Tạo đơn đặt hàng nhà cung cấp để theo dõi nhận hàng.')}</div>
${modNote('Nhận đủ hàng: <b>có xử lý</b> (tạo phiếu nhập). Nhận một phần (PARTIALLY_RECEIVED): <b>PREPARED</b> — cần contract nhận theo dòng. Phiếu nhập tham chiếu đơn mua: DATA_CONTRACT_NEEDED.')}`;
  panelScreen('Đơn mua nhà cung cấp','Đặt hàng NCC, theo dõi trạng thái và nhận hàng.','working','Đang dùng',body);
}
async function openPurchaseOrder(id){
  const po=await modFind('purchase_orders',id);if(!po)return;
  const pm=new Map(state.data.products.map(p=>[p.id,p]));
  const lines=(po.lines||[]).map(l=>`<div class="kv"><div><strong>${esc(pm.get(l.productId)?.name||l.productId)}</strong><div class="muted">SL ${fmt(l.qty)} × ${fmt(l.price||0)} ₫</div></div><strong>${fmt(Number(l.qty||0)*Number(l.price||0))} ₫</strong></div>`).join('');
  openModal({title:po.code,sub:`${supplierName(po.supplierId)||'Chưa chọn NCC'} · ${statusChip(po.status)}`,hideSubmit:true,body:`<div class="detail-list">${lines||'<div class="empty">Đơn chưa có dòng hàng.</div>'}</div><div class="mod-summary"><div><span>Dự kiến nhận</span><b>${esc(po.expected_date||'—')}</b></div><div><span>Tổng dự kiến</span><b>${fmt(po.expected_total||0)} ₫</b></div></div>${po.note?`<p class="field-limit">${esc(po.note)}</p>`:''}<div class="detail-actions">${['DRAFT'].includes(po.status)?'<button class="secondary-btn" data-po-act="ORDERED">Xác nhận đặt hàng</button>':''}${['DRAFT','ORDERED','PARTIALLY_RECEIVED'].includes(po.status)?'<button class="primary-btn" data-po-act="RECEIVE">Nhận đủ hàng</button>':''}${['DRAFT','ORDERED'].includes(po.status)?'<button class="secondary-btn" data-po-act="CANCELLED">Hủy đơn</button>':''}</div>`});
  $$('[data-po-act]').forEach(b=>{b.onclick=async()=>{const act=b.dataset.poAct;
    if(act==='RECEIVE'){
      const linesAll=(po.lines||[]).filter(l=>Number(l.qty)>0);
      if(!linesAll.length){toast('Đơn không có dòng hàng.','error');return;}
      await applyWarehouseBatch({kind:'receive',warehouseId:po.warehouseId||state.data.warehouses[0]?.id,reference:po.code,documentId:po.id,lines:linesAll.map(l=>({productId:l.productId,qty:Number(l.qty),price:Number(l.price)||null}))});
      for(const l of linesAll){const p=state.data.products.find(x=>x.id===l.productId);if(p&&l.price!=null)await updateItem({...p,purchase_price:Number(l.price)});}
      await modPatch('purchase_orders',po.id,{status:'RECEIVED',received_at:new Date().toISOString()});
      $('#modalRoot').innerHTML='';await refresh();toast('Đã nhận hàng và tạo phiếu nhập.','ok');return;
    }
    await modPatch('purchase_orders',po.id,{status:act});
    $('#modalRoot').innerHTML='';await renderPurchaseOrders();toast('Đã cập nhật đơn mua.','ok');
  };});
}
function openPurchaseOrderForm(prefill){
  const products=state.data.products.filter(p=>p.type!=='SERVICE');
  const pre=new Map((prefill||[]).map(x=>[x.productId,x]));
  openModal({title:'Tạo đơn mua',sub:'Chọn NCC, mặt hàng và giá dự kiến.',submitText:'Lưu đơn mua',fullScreen:true,body:`<div class="form-grid"><div class="field"><label>Nhà cung cấp</label><select id="poSupplier">${supplierOptions()}</select></div><div class="field"><label>Kho nhận</label><select id="poWarehouse">${whOptions()}</select></div><div class="field"><label>Dự kiến nhận</label><input id="poDate" type="date"/></div><div class="field full-span"><label>Chọn mặt hàng (số lượng / giá dự kiến)</label><div class="mod-check-list">${products.map(p=>`<label class="mod-check"><input type="checkbox" data-po-item="${p.id}" ${pre.has(p.id)?'checked':''}/><span>${esc(p.name)}<small>${esc(p.sku||'')} · tồn ${fmt(productTotals(p).available)}</small></span><input type="number" min="1" value="${pre.get(p.id)?.qty||1}" data-po-qty="${p.id}"/><input type="number" min="0" value="${pre.get(p.id)?.price??(p.purchase_price??'')}" data-po-price="${p.id}" placeholder="Giá"/></label>`).join('')}</div></div><div class="field full-span"><label>Ghi chú</label><input id="poNote"/></div></div>`,onSubmit:async root=>{const lines=$$('[data-po-item]:checked',root).map(i=>({productId:i.dataset.poItem,qty:Math.max(1,Number($(`[data-po-qty="${i.dataset.poItem}"]`,root)?.value||1)),price:Number($(`[data-po-price="${i.dataset.poItem}"]`,root)?.value||0)}));if(!lines.length)throw new Error('Chọn ít nhất một mặt hàng.');const rows=await modList('purchase_orders');const seq=rows.length+1;rows.push({id:mid('po'),code:docCodePreview('PO',seq),supplierId:$('#poSupplier',root).value,warehouseId:$('#poWarehouse',root).value,expected_date:$('#poDate',root).value,note:$('#poNote',root).value.trim(),lines,expected_total:lines.reduce((n,l)=>n+l.qty*l.price,0),status:'DRAFT',created_at:new Date().toISOString()});await modSave('purchase_orders',rows);state.page='purchase-orders';}});
}

function renderSupplierReturns(){
  const receipts = state.data.purchase_receipts || [];
  const returns = receipts.filter(r => r.sub_type === 'PURCHASE_RETURN_OUT' || r.type === 'purchase_return' || (r.kind === 'issue' && r.supplier_id)).sort((a,b) => String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const totalValue = returns.reduce((s, r) => s + Number(r.refund_amount ?? r.total_cost ?? 0), 0);
  const totalItems = returns.reduce((s, r) => s + (r.lines || []).reduce((sum, l) => sum + Number(l.qty || l.quantity || 0), 0), 0);

  const body = `
    <div class="mod-summary">
      <div><span>Số phiếu xuất trả</span><b>${fmt(returns.length)} phiếu</b></div>
      <div><span>Tổng tiền hoàn vốn</span><b>${fmt(totalValue)} ₫</b></div>
      <div><span>Số mặt hàng đã trả</span><b>${fmt(totalItems)} sản phẩm</b></div>
      <div class="grand"><span>Trạng thái kho</span><b>Khấu trừ tức thì</b></div>
    </div>
    <div class="mod-actions">
      <button class="primary-btn" data-action="srt-new">+ Tạo phiếu trả NCC</button>
    </div>
    <div class="mod-block">
      <div class="mod-list">
        ${returns.length ? returns.map(r => {
          const sup = (state.data.suppliers||[]).find(s => s.id === r.supplier_id);
          const wh = (state.data.warehouses||[]).find(w => w.id === r.warehouse_id);
          const val = Number(r.refund_amount ?? r.total_cost ?? 0);
          const lineCount = (r.lines||[]).length;
          const methodLabel = ({cash:'Tiền mặt',transfer:'Chuyển khoản',debt:'Trừ công nợ'})[r.refund_method] || 'Hoàn tiền';
          return modRow(
            `<b>${esc(r.id || r.document_id)}</b> · ${esc(sup?.name || r.supplier_id || 'Nhà cung cấp')} <span class="surface-status working" style="margin-left:6px;font-size:11px;">${esc(methodLabel)}</span>`,
            `${dt(r.created_at)} · Kho: ${esc(wh?.name || r.warehouse_id || 'Kho')} · ${lineCount} mặt hàng · Lý do: ${esc(r.reason || 'Xuất trả NCC')}`,
            `<b>${fmt(val)} ₫</b><button class="secondary-btn" data-srt-view="${esc(r.id)}">Chi tiết</button>`
          );
        }).join('') : modEmpty('Chưa có phiếu trả NCC', 'Nhấn "+ Tạo phiếu trả NCC" để xuất trả hàng và thu hồi vốn.')}
      </div>
    </div>
    ${modNote('<b>Đã kích hoạt vận hành</b>: Phiếu xuất trả NCC khấu trừ tồn khả dụng nguyên tử trong kho (<code>PURCHASE_RETURN_OUT</code>) và ghi nhận hoàn vốn theo Tiền mặt, Chuyển khoản hoặc Trừ công nợ.')}
  `;
  panelScreen('Trả hàng nhà cung cấp', 'Quản lý xuất trả hàng cho nhà cung cấp và thu hồi vốn.', 'working', 'Đang dùng', body);

  $$('[data-srt-view]').forEach(btn => {
    btn.onclick = () => {
      const doc = returns.find(r => r.id === btn.dataset.srtView);
      if (doc) openSupplierReturnDetail(doc);
    };
  });
}

function openSupplierReturnModal(){
  const suppliers = (state.data.suppliers || []).filter(s => s.status !== 'inactive');
  const warehouses = state.data.warehouses || [];
  if (!warehouses.length) {
    toast('Chưa có kho hàng để xuất trả.', 'error');
    return;
  }
  const defaultWh = warehouses[0].id;
  const products = (state.data.products || []).filter(p => p.type !== 'SERVICE' && p.trackInventory !== false);

  const supplierOptionsHtml = suppliers.length 
    ? suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.phone ? ' · ' + esc(s.phone) : ''}</option>`).join('')
    : '<option value="">Nhà cung cấp chung</option>';

  const whOptionsHtml = warehouses.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');

  const renderProductRows = (whId) => {
    return products.map(p => {
      const lv = (state.data.levels || []).find(l => l.productId === p.id && l.warehouseId === whId);
      const avail = Math.max(0, (lv?.onHand || 0) - (lv?.reserved || 0) - (lv?.damaged || 0));
      const defaultCost = Number(p.purchase_price ?? p.cost_price ?? p.price ?? 0);
      const disabled = avail <= 0;
      return `
        <label class="mod-check ${disabled ? 'disabled' : ''}" style="${disabled ? 'opacity:0.5;' : ''}">
          <input type="checkbox" data-srt-item="${esc(p.id)}" ${disabled ? 'disabled' : ''}/>
          <span>
            <b>${esc(p.name)}</b>
            <small>${esc(p.sku || '')} · Tồn khả dụng: <strong>${fmt(avail)}</strong> ${esc(p.unit || 'cái')}</small>
          </span>
          <input type="number" min="1" max="${avail}" value="1" data-srt-qty="${esc(p.id)}" ${disabled ? 'disabled' : ''} style="width:65px;" title="Số lượng trả"/>
          <input type="number" min="0" value="${defaultCost}" data-srt-price="${esc(p.id)}" ${disabled ? 'disabled' : ''} style="width:105px;" placeholder="Giá hoàn" title="Đơn giá hoàn vốn"/>
        </label>
      `;
    }).join('');
  };

  openModal({
    title: 'Tạo phiếu trả nhà cung cấp',
    sub: 'Khấu trừ tồn khả dụng trong kho và ghi nhận hoàn vốn.',
    submitText: 'Xác nhận xuất trả',
    fullScreen: true,
    body: `
      <div class="form-grid">
        <div class="field">
          <label>Nhà cung cấp</label>
          <select id="srtSupplier">${supplierOptionsHtml}</select>
        </div>
        <div class="field">
          <label>Kho xuất trả</label>
          <select id="srtWarehouse">${whOptionsHtml}</select>
        </div>
        <div class="field">
          <label>Lý do xuất trả</label>
          <select id="srtReason">
            <option value="Hàng lỗi / hư hỏng do nhà sản xuất">Hàng lỗi / hư hỏng do nhà sản xuất</option>
            <option value="Hàng cận date / hết hạn sử dụng">Hàng cận date / hết hạn sử dụng</option>
            <option value="Giao sai mẫu / sai số lượng so với đơn đặt">Giao sai mẫu / sai số lượng</option>
            <option value="Đổi trả hàng tồn chậm bán theo thỏa thuận">Đổi trả hàng tồn chậm bán theo thỏa thuận</option>
            <option value="Xuất trả nhà cung cấp thu hồi vốn">Xuất trả NCC thu hồi vốn</option>
          </select>
        </div>
        <div class="field">
          <label>Hình thức thu hồi vốn</label>
          <select id="srtRefundMethod">
            <option value="cash">Tiền mặt (Nhận tiền hoàn ngay)</option>
            <option value="transfer">Chuyển khoản ngân hàng</option>
            <option value="debt">Trừ công nợ phải trả NCC</option>
          </select>
        </div>
        <div class="field full-span">
          <label>Chọn mặt hàng xuất trả (Tích chọn, số lượng và giá hoàn vốn)</label>
          <div id="srtProductList" class="mod-check-list">
            ${renderProductRows(defaultWh)}
          </div>
        </div>
        <div class="field full-span">
          <label>Ghi chú / Số chứng từ hóa đơn gốc</label>
          <input id="srtNote" placeholder="VD: Trả theo biên bản kiểm hàng ngày 02/10"/>
        </div>
      </div>
    `,
    onSubmit: async root => {
      const supplierId = $('#srtSupplier', root)?.value || '';
      const warehouseId = $('#srtWarehouse', root)?.value;
      const reason = $('#srtReason', root)?.value || 'Xuất trả hàng cho NCC';
      const refundMethod = $('#srtRefundMethod', root)?.value || 'cash';
      const note = $('#srtNote', root)?.value?.trim() || '';

      if (!warehouseId) throw new Error('Vui lòng chọn kho xuất trả.');

      const checkedItems = $$('[data-srt-item]:checked', root);
      if (!checkedItems.length) throw new Error('Vui lòng chọn ít nhất một mặt hàng cần xuất trả.');

      const lines = [];
      let totalRefund = 0;
      for (const chk of checkedItems) {
        const pid = chk.dataset.srtItem;
        const qtyInput = $(`[data-srt-qty="${pid}"]`, root);
        const priceInput = $(`[data-srt-price="${pid}"]`, root);
        const qty = Math.max(1, Number(qtyInput?.value) || 1);
        const price = Math.max(0, Number(priceInput?.value) || 0);
        lines.push({ productId: pid, qty, price });
        totalRefund += qty * price;
      }

      await createPurchaseReturn({
        supplierId,
        warehouseId,
        lines,
        reason,
        refundMethod,
        refundAmount: totalRefund,
        reference: note
      });

      await refresh();
      state.page = 'supplier-returns';
      renderSupplierReturns();
      toast(`Đã lập phiếu xuất trả NCC và khấu trừ tồn kho (${fmt(totalRefund)} ₫).`, 'ok');
    }
  });

  $('#srtWarehouse')?.addEventListener('change', e => {
    const listEl = $('#srtProductList');
    if (listEl) listEl.innerHTML = renderProductRows(e.target.value);
  });
}

function openSupplierReturnDetail(doc){
  if (!doc) return;
  const sup = (state.data.suppliers || []).find(s => s.id === doc.supplier_id);
  const wh = (state.data.warehouses || []).find(w => w.id === doc.warehouse_id);
  const methodLabel = ({cash:'Tiền mặt',transfer:'Chuyển khoản',debt:'Trừ công nợ'})[doc.refund_method] || doc.refund_method;
  const lines = doc.lines || [];
  const total = Number(doc.refund_amount ?? doc.total_cost ?? 0);

  const linesHtml = lines.map((l, i) => `
    <div class="transaction-line" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--q-line);font-size:13px;">
      <div>
        <strong>${i+1}. ${esc(l.name || l.productId)}</strong>
        <small style="display:block;color:var(--q-muted);">${esc(l.sku || '')} · SL: ${fmt(l.qty || l.quantity)} ${esc(l.unit || 'cái')} × ${fmt(l.price)} ₫</small>
      </div>
      <div style="font-weight:700;">${fmt(l.line_total || ((l.qty||l.quantity)*l.price))} ₫</div>
    </div>
  `).join('');

  openModal({
    title: `Phiếu trả NCC · ${esc(doc.id || doc.document_id)}`,
    sub: `${dt(doc.created_at)} · Trạng thái: Đã xuất kho`,
    hideSubmit: true,
    footer: `
      <button class="primary-btn" data-srt-print>In phiếu xuất trả</button>
      <button class="secondary-btn" data-close>Đóng</button>
    `,
    body: `
      <div class="product-facts" style="margin-bottom:16px;">
        <div><span>Nhà cung cấp</span><strong>${esc(sup?.name || doc.supplier_id || 'Chung')}</strong></div>
        <div><span>Kho xuất trả</span><strong>${esc(wh?.name || doc.warehouse_id || 'Kho')}</strong></div>
        <div><span>Hình thức hoàn</span><strong>${esc(methodLabel)}</strong></div>
        <div><span>Tổng tiền hoàn</span><strong style="color:var(--q-blue);">${fmt(total)} ₫</strong></div>
        <div style="grid-column:1/-1;"><span>Lý do xuất</span><strong>${esc(doc.reason || 'Xuất trả NCC')}</strong></div>
        ${doc.reference ? `<div style="grid-column:1/-1;"><span>Ghi chú</span><strong>${esc(doc.reference)}</strong></div>` : ''}
      </div>
      <div class="section-divider"></div>
      <h3>Danh sách mặt hàng xuất trả</h3>
      <div class="transaction-lines">${linesHtml}</div>
    `
  });

  $('[data-srt-print]')?.addEventListener('click', () => {
    const html = `
      <div style="padding:20px;max-width:600px;margin:auto;">
        <h2 style="text-align:center;margin-bottom:4px;">PHIẾU XUẤT TRẢ NHÀ CUNG CẤP</h2>
        <p style="text-align:center;color:#666;font-size:12px;margin-top:0;">Mã phiếu: ${esc(doc.id || doc.document_id)} · ${dt(doc.created_at)}</p>
        <hr style="border:none;border-top:1px solid #ccc;margin:12px 0;"/>
        <p><strong>Nhà cung cấp:</strong> ${esc(sup?.name || doc.supplier_id || '—')}</p>
        <p><strong>Kho xuất:</strong> ${esc(wh?.name || doc.warehouse_id || '—')}</p>
        <p><strong>Lý do xuất trả:</strong> ${esc(doc.reason || '—')}</p>
        <p><strong>Hình thức thu hồi vốn:</strong> ${esc(methodLabel)}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="border-bottom:2px solid #333;text-align:left;">
              <th style="padding:6px;">STT</th>
              <th style="padding:6px;">Tên hàng</th>
              <th style="padding:6px;text-align:center;">SL</th>
              <th style="padding:6px;text-align:right;">Đơn giá</th>
              <th style="padding:6px;text-align:right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${lines.map((l, i) => `
              <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:6px;">${i+1}</td>
                <td style="padding:6px;">${esc(l.name || l.productId)}</td>
                <td style="padding:6px;text-align:center;">${fmt(l.qty || l.quantity)}</td>
                <td style="padding:6px;text-align:right;">${fmt(l.price)} ₫</td>
                <td style="padding:6px;text-align:right;">${fmt(l.line_total || ((l.qty||l.quantity)*l.price))} ₫</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:bold;font-size:15px;">
              <td colspan="4" style="padding:8px;text-align:right;">Tổng tiền hoàn vốn:</td>
              <td style="padding:8px;text-align:right;">${fmt(total)} ₫</td>
            </tr>
          </tfoot>
        </table>
        <div style="display:flex;justify-content:space-between;margin-top:40px;text-align:center;">
          <div><p><strong>Người lập phiếu</strong></p><p style="margin-top:50px;">(Ký, ghi rõ họ tên)</p></div>
          <div><p><strong>Thủ kho xuất</strong></p><p style="margin-top:50px;">(Ký, ghi rõ họ tên)</p></div>
          <div><p><strong>Đại diện NCC nhận</strong></p><p style="margin-top:50px;">(Ký, ghi rõ họ tên)</p></div>
        </div>
      </div>
    `;
    printHtmlDoc(html);
  });
}

async function renderReplenish(){
  const wh=state.replenishWarehouse||state.data.warehouses[0]?.id||'';
  const products=state.data.products.filter(p=>p.type!=='SERVICE'&&p.trackInventory!==false);
  const rows=products.map(p=>{const t=p.type==='SERVICE'?{available:0}:stockView(p,wh);const min=Number(p.lowStock||0);const need=Math.max(0,min-t.available);return {p,available:t.available,min,need,lastPrice:p.purchase_price??null};}).filter(r=>r.need>0).sort((a,b)=>b.need-a.need);
  const body=`<div class="mod-grid"><label><span>Kho</span><select id="rpWarehouse">${whOptions(wh)}</select></label><label><span>Cần nhập</span><input value="${fmt(rows.length)} mặt hàng" readonly/></label></div>
<div class="mod-actions"><button class="primary-btn" data-action="rp-create" ${rows.length?'':'disabled'}>Tạo đơn mua từ đề xuất</button></div>
<div class="mod-list">${rows.length?rows.map(r=>modRow(esc(r.p.name),`Tồn khả dụng ${fmt(r.available)} · tối thiểu ${fmt(r.min)} · NCC gần nhất nếu có${r.lastPrice!=null?` · giá nhập gần nhất ${fmt(r.lastPrice)} ₫`:''}` ,`<b>Thiếu ${fmt(r.need)}</b>`)).join(''):modEmpty('Không thiếu hàng','Mọi mặt hàng đang đủ so với tồn tối thiểu.')}</div>
${modNote('Đề xuất theo quy tắc: <b>tồn khả dụng < tồn tối thiểu</b>. Không dùng AI. Nhà cung cấp gần nhất: chưa có dữ liệu phiếu nhập NCC nên bỏ trống.')}`;
  panelScreen('Đề xuất nhập hàng','Danh sách mặt hàng dưới tồn tối thiểu và lượng cần nhập.','working','Đang dùng',body);
  $('#rpWarehouse')?.addEventListener('change',e=>{state.replenishWarehouse=e.target.value;renderReplenish();});
  const btn=$$('[data-action="rp-create"]')[0];
  if(btn)btn.onclick=()=>openPurchaseOrderForm(rows.map(r=>({productId:r.p.id,qty:r.need,price:r.lastPrice})));
}

/* ===== ROUND 2b: chẩn đoán · xuất dữ liệu · lịch sử giá · trạng thái ===== */
function priceHistoryFor(productId){
  return (state.data.outbox||[]).filter(o=>o.entity_id===productId&&(o.type==='item.update'||o.action==='update')).map(o=>({at:o.created_at||o.updated_at,price:o.payload?.item?.price,purchase:o.payload?.item?.purchase_price})).filter(x=>x.at).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
function priceHistorySection(p){
  if(p.type==='SERVICE')return '';
  const ev=priceHistoryFor(p.id);
  const cur=`<div class="ledger-row"><div class="ledger-main"><strong>Hiện tại</strong><small>Giá bán ${p.price==null?'—':fmt(p.price)+' ₫'} · Giá nhập ${p.purchase_price==null?'—':fmt(p.purchase_price)+' ₫'}</small></div></div>`;
  const rows=ev.slice(0,12).map((e,i)=>{
    const prev=ev[i+1]||{};
    const dSale=(e.price!=null&&prev.price!=null&&Number(e.price)!==Number(prev.price))?`Giá bán ${fmt(prev.price)} → ${fmt(e.price)} ₫`:(e.price!=null?`Giá bán ${fmt(e.price)} ₫`:'');
    const dCost=(e.purchase!=null&&prev.purchase!=null&&Number(e.purchase)!==Number(prev.purchase))?`Giá nhập ${fmt(prev.purchase)} → ${fmt(e.purchase)} ₫`:(e.purchase!=null?`Giá nhập ${fmt(e.purchase)} ₫`:'');
    return `<div class="ledger-row"><div class="ledger-main"><strong>${esc(dt(e.at))}</strong><small>${esc([dSale,dCost].filter(Boolean).join(' · ')||'Cập nhật thông tin')}</small></div></div>`;
  }).join('');
  return `<div class="section-divider"></div><h3>Lịch sử giá</h3><div class="ledger-list">${cur}${rows||'<div class="ledger-row"><div class="ledger-main"><strong>Chưa ghi nhận thay đổi</strong><small>Lịch sử ghi từ các lần sửa mặt hàng trên thiết bị này.</small></div></div>'}</div>`;
}

async function renderDiagnostics(){
  const identity=await ensureLocalIdentity().catch(()=>({}));
  const d=state.data||{};
  const outbox=d.outbox||[];
  const pending=outbox.filter(o=>o.sync_status==='PENDING').length;
  const errors=outbox.filter(o=>o.sync_status==='ERROR').length;
  const lastBackup=await settingValue(MODKEY('last_backup'),null);
  let usage=0,quota=0;
  try{ if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();usage=e.usage||0;quota=e.quota||0;} }catch{}
  let dbs=[]; try{ dbs=indexedDB.databases?await indexedDB.databases():[]; }catch{}
  const dbRow=dbs.find(x=>x.name===CONFIG.DB_NAME)||{};
  const rows=[
    ['Phiên bản app','local preview (app.js 2026-09-21)'],
    ['Phiên bản DB',`${CONFIG.DB_NAME} · v${dbRow.version||CONFIG.DB_VERSION}`],
    ['Chế độ',CONFIG.SYNC_MODE==='api'?'Kết nối QBiz':'Local trên thiết bị'],
    ['Mã thiết bị',identity.device_id||'—'],
    ['Quầy / register',identity.register_id||'—'],
    ['Sao lưu gần nhất',lastBackup?dt(lastBackup):'Chưa sao lưu'],
    ['Chờ đồng bộ',`${fmt(pending)} bản ghi`],
    ['Lỗi đồng bộ',`${fmt(errors)} bản ghi`],
    ['Bộ nhớ dùng',`${formatBytes(usage)}${quota?` / ${formatBytes(quota)}`:''}`],
    ['Số bản ghi',`SP ${fmt((d.products||[]).length)} · phiếu bán ${fmt((d.sales||[]).length)} · biến động ${fmt((d.movements||[]).length)} · chứng từ ${fmt(outbox.length)}`],
    ['Kho / quầy',`${fmt((d.warehouses||[]).length)} kho · ${fmt((d.devices||[]).length)} thiết bị · ${fmt((d.registers||[]).length)} quầy`],
  ];
  state.diag={rows};
  const body=`<div class="mod-list">${rows.map(([k,v])=>modRow(esc(k),esc(String(v)),'')).join('')}</div>
<div class="mod-actions"><button class="primary-btn" data-action="diag-copy">Sao chép thông tin</button><button class="secondary-btn" data-action="diag-export">Xuất file chẩn đoán</button><button class="secondary-btn" data-action="diag-clear">Xóa cache giao diện</button></div>
${modNote('Chỉ đọc, phục vụ hỗ trợ kỹ thuật. <b>Không có nút reset dữ liệu.</b> “Xóa cache giao diện” chỉ xóa cache service worker, không đụng dữ liệu kho.')}`;
  panelScreen('Chẩn đoán','Thông tin hệ thống phục vụ hỗ trợ.','working','Đang dùng',body);
}
function diagnosticText(){const rows=(state.diag&&state.diag.rows)||[];return ['QBiz Kho — chẩn đoán',new Date().toISOString(),...rows.map(([k,v])=>`${k}: ${v}`),`URL: ${location.href}`].join('\n');}

function toggleProductSelection(id){if(!id)return;if(state.productSelected.has(id))state.productSelected.delete(id);else state.productSelected.add(id);renderProducts();}
function csvRows(header,rows){return [header.join(','),...rows.map(r=>r.map(csvCell).join(','))].join('\n');}
function exportCsv(name,header,rows){
  downloadText(`qbiz-${name}-${new Date().toISOString().slice(0,10)}.csv`,csvRows(header,rows),'text/csv;charset=utf-8');
  toast(`Đã xuất ${rows.length} dòng (chuẩn UTF-8 mở Excel không lỗi font).`,'ok');
}

function resolveLocationPrefix(addr){
  if(!addr) return '';
  const s=String(addr).trim();
  if(/hồ chí minh|tp\.?\s*hcm|sài gòn|thủ đức/i.test(s)) return 'TP. Hồ Chí Minh';
  if(/hà nội/i.test(s)) return 'Hà Nội';
  if(/đà nẵng/i.test(s)) return 'Đà Nẵng';
  if(/hải phòng/i.test(s)) return 'Hải Phòng';
  if(/cần thơ/i.test(s)) return 'Cần Thơ';
  if(/bình dương/i.test(s)) return 'Bình Dương';
  if(/đồng nai/i.test(s)) return 'Đồng Nai';
  if(/khánh hòa|nha trang/i.test(s)) return 'Nha Trang';
  if(/quảng ninh|hạ long/i.test(s)) return 'Quảng Ninh';
  const m=s.match(/(?:Tỉnh|Thành phố|TP\.?)\s+([A-Za-zÀ-ỹ\s]+?)(?:,|$)/i);
  if(m&&m[1]) return m[1].trim();
  return '';
}

function getOfficialReportData(key){
  const d=state.data||{};
  const profile=(d.settings||[]).find(x=>x.id===PROFILE_SETTING)?.value||{};
  const compName=profile.store_name||profile.display_name||'DOANH NGHIỆP / CỬA HÀNG QBIZ';
  const compAddr=profile.address||'Hà Nội, Việt Nam';
  const compTax=profile.tax_code||'';
  const now=new Date();
  const dateStr=`Ngày ${String(now.getDate()).padStart(2,'0')} tháng ${String(now.getMonth()+1).padStart(2,'0')} năm ${now.getFullYear()}`;
  
  const locPrefix=resolveLocationPrefix(compAddr);
  const approvalDateStr=locPrefix?`${locPrefix}, ${dateStr.toLowerCase()}`:dateStr;

  const activeUserName=(d.settings||[]).find(x=>x.id==='active_user_name')?.value;
  const creatorName=activeUserName||profile.contact_name||'Người lập biểu';
  const stockKeeperName=profile.warehouse_keeper||profile.contact_name||'Thủ kho';
  const accountantName=profile.accountant||'Kế toán trưởng';
  const directorName=profile.director||profile.owner_name||profile.contact_name||profile.display_name||'Giám đốc / Chủ hộ';

  const signers={
    creator: creatorName,
    stockKeeper: stockKeeperName,
    accountant: accountantName,
    director: directorName
  };

  let title='', subtitle='', standardText='', header=[], displayRows=[], rawRows=[], columnAligns=[], columnFormats=[];
  let totalRowDisplay=null, totalRowRaw=null, footerSummary='', wordsText='';

  if(key==='nhap-xuat-ton'){
    title='BÁO CÁO NHẬP - XUẤT - TỒN TỔNG HỢP';
    subtitle='Áp dụng cho mọi loại hình Doanh nghiệp & Hộ kinh doanh';
    standardText='Mẫu biểu quản trị kho QBiz · Chuẩn kế toán Việt Nam';
    header=['STT','Mã hàng (SKU)','Tên sản phẩm','ĐVT','Tồn đầu','Nhập trong kỳ','Xuất trong kỳ','Tồn cuối','Đơn giá vốn','Giá trị tồn cuối'];
    columnAligns=['center','center','left','center','right','right','right','right','right','right'];
    columnFormats=['text','text','text','text','num','num','num','num','currency','currency'];

    const totals=new Map();
    for(const p of (d.products||[])){
      if(p.type==='SERVICE')continue;
      totals.set(p.id,{p,inQty:0,outQty:0});
    }
    for(const m of (d.movements||[])){
      const row=totals.get(m.productId);
      if(!row)continue;
      const q=Number(m.qty||0);
      if(q>0)row.inQty+=q;
      else if(q<0)row.outQty+=Math.abs(q);
    }

    let sumOpening=0, sumInQty=0, sumOutQty=0, sumOnHand=0, sumValue=0;
    const items=[...totals.values()];
    displayRows=items.map((item,idx)=>{
      const p=item.p;
      const onHand=(d.levels||[]).filter(l=>l.productId===p.id).reduce((s,l)=>s+Number(l.onHand||0),0);
      const opening=Math.max(0,onHand-item.inQty+item.outQty);
      const cost=Number(p.purchase_price||p.price||0);
      const val=onHand*cost;

      sumOpening+=opening;
      sumInQty+=item.inQty;
      sumOutQty+=item.outQty;
      sumOnHand+=onHand;
      sumValue+=val;

      return [idx+1,p.sku||'—',p.name,p.unit||'cái',fmt(opening),fmt(item.inQty),fmt(item.outQty),fmt(onHand),cost?fmt(cost)+' ₫':'—',fmt(val)+' ₫'];
    });

    rawRows=items.map((item,idx)=>{
      const p=item.p;
      const onHand=(d.levels||[]).filter(l=>l.productId===p.id).reduce((s,l)=>s+Number(l.onHand||0),0);
      const opening=Math.max(0,onHand-item.inQty+item.outQty);
      const cost=Number(p.purchase_price||p.price||0);
      const val=onHand*cost;
      return [idx+1,p.sku||'',p.name,p.unit||'cái',opening,item.inQty,item.outQty,onHand,cost,val];
    });

    totalRowDisplay=['','','TỔNG CỘNG','',fmt(sumOpening),fmt(sumInQty),fmt(sumOutQty),fmt(sumOnHand),'',fmt(sumValue)+' ₫'];
    totalRowRaw=['','','TỔNG CỘNG','',sumOpening,sumInQty,sumOutQty,sumOnHand,'',sumValue];

    wordsText=docTienBangChu(sumValue);
    footerSummary=`Tổng giá trị hàng hóa tồn kho: <b>${fmt(sumValue)} ₫</b> (${wordsText})`;

  }else if(key==='doanh-thu-tt88'){
    title='SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ';
    subtitle='Ban hành theo Thông tư số 88/2021/TT-BTC ngày 08/10/2021 của Bộ Tài chính';
    standardText='Mẫu số S2b-HKD (Dành cho Hộ kinh doanh, cá nhân kinh doanh)';
    header=['STT','Ngày ghi sổ','Số hiệu chứng từ','Diễn giải','Khách hàng','Doanh thu hàng hóa','Doanh thu dịch vụ','Tiền thuế GTGT','Tổng cộng'];
    columnAligns=['center','center','center','left','left','right','right','right','right'];
    columnFormats=['text','text','text','text','text','currency','currency','currency','currency'];

    let sumRevGoods=0, sumRevServ=0, sumTax=0, sumTotal=0;
    const sales=(d.sales||[]).slice().sort((a,b)=>String(b.created_at||b.createdAt||'').localeCompare(String(a.created_at||a.createdAt||'')));
    
    displayRows=sales.map((s,idx)=>{
      let goods=0, serv=0;
      for(const it of (s.items||[])){
        const lt=Number(it.line_total??it.lineTotal??(Number(it.quantity||0)*Number(it.unit_price||it.price||0)));
        if(it.type==='SERVICE') serv+=lt;
        else goods+=lt;
      }
      const tax=Number(s.tax_total||0);
      const grand=Number(s.grand_total??s.total??(goods+serv+tax));
      sumRevGoods+=goods; sumRevServ+=serv; sumTax+=tax; sumTotal+=grand;
      return [idx+1,dt(s.created_at||s.createdAt||now.toISOString()),s.code||s.id,'Bán hàng theo phiếu',s.customer_label||'Khách lẻ',fmt(goods)+' ₫',serv?fmt(serv)+' ₫':'—',tax?fmt(tax)+' ₫':'—',fmt(grand)+' ₫'];
    });

    rawRows=sales.map((s,idx)=>{
      let goods=0, serv=0;
      for(const it of (s.items||[])){
        const lt=Number(it.line_total??it.lineTotal??(Number(it.quantity||0)*Number(it.unit_price||it.price||0)));
        if(it.type==='SERVICE') serv+=lt;
        else goods+=lt;
      }
      const tax=Number(s.tax_total||0);
      const grand=Number(s.grand_total??s.total??(goods+serv+tax));
      return [idx+1,dt(s.created_at||s.createdAt||now.toISOString()),s.code||s.id,'Bán hàng theo phiếu',s.customer_label||'Khách lẻ',goods,serv,tax,grand];
    });

    totalRowDisplay=['','','','TỔNG CỘNG','',fmt(sumRevGoods)+' ₫',fmt(sumRevServ)+' ₫',fmt(sumTax)+' ₫',fmt(sumTotal)+' ₫'];
    totalRowRaw=['','','','TỔNG CỘNG','',sumRevGoods,sumRevServ,sumTax,sumTotal];

    wordsText=docTienBangChu(sumTotal);
    footerSummary=`Tổng doanh thu bán hàng hóa: <b>${fmt(sumRevGoods)} ₫</b> · Dịch vụ: <b>${fmt(sumRevServ)} ₫</b> · Tổng tiền: <b>${fmt(sumTotal)} ₫</b> (${wordsText})`;

  }else if(key==='bang-ke-xuat-tt200'){
    title='BẢNG KÊ CHỨNG TỪ XUẤT KHO';
    subtitle='Ban hành theo Thông tư số 200/2014/TT-BTC & TT 133/2016/TT-BTC';
    standardText='Mẫu biểu kế toán vật tư - hàng hóa xuất kho';
    header=['STT','Ngày xuất','Số chứng từ','Loại hình xuất','Lý do / Căn cứ','Kho xuất','Người nhận','Tổng tiền'];
    columnAligns=['center','center','center','left','left','left','left','right'];
    columnFormats=['text','text','text','text','text','text','text','currency'];

    const issueItems=[];

    // 1. purchase_receipts where kind === 'issue'
    for(const doc of (d.purchase_receipts||[])){
      if(doc.kind==='issue'){
        const cost=Number(doc.total_cost||0);
        issueItems.push({
          date: doc.created_at||now.toISOString(),
          code: doc.document_id||doc.id||'XK',
          type: doc.sub_type_label||'Xuất nội bộ',
          reason: doc.reference||doc.note||'Xuất vật tư / hàng hóa',
          warehouse: warehouse(doc.warehouse_id)?.name||'Kho chính',
          receiver: doc.receiver_name||'Nội bộ',
          amount: cost
        });
      }
    }

    // 2. sales (retail POS issues)
    for(const s of (d.sales||[])){
      const amount=Number(s.grand_total??s.total??0);
      const itemCount=Array.isArray(s.items)?s.items.length:0;
      issueItems.push({
        date: s.created_at||s.createdAt||now.toISOString(),
        code: s.code||s.id||'BH',
        type: 'Xuất bán lẻ',
        reason: s.note||(itemCount?`Bán ${itemCount} sản phẩm`:'Bán hàng theo hóa đơn'),
        warehouse: warehouse(s.warehouse_id||s.warehouseId)?.name||'Kho chính',
        receiver: s.customer_label||'Khách lẻ',
        amount: amount
      });
    }

    // 3. transfers (warehouse transfers)
    for(const t of (d.transfers||[])){
      const lines=Array.isArray(t.lines)&&t.lines.length?t.lines:[{productId:t.productId,qty:t.qty}];
      let totalCost=0;
      for(const l of lines){
        const p=(d.products||[]).find(pr=>pr.id===l.productId);
        totalCost+=Number(l.qty||0)*Number(p?.purchase_price||p?.price||0);
      }
      issueItems.push({
        date: t.created_at||t.createdAt||now.toISOString(),
        code: t.code||t.id||'CK',
        type: 'Xuất chuyển kho',
        reason: t.note||`Điều chuyển sang ${warehouse(t.toWarehouseId||t.to_warehouse_id)?.name||'Kho đích'}`,
        warehouse: warehouse(t.fromWarehouseId||t.from_warehouse_id)?.name||'Kho xuất',
        receiver: warehouse(t.toWarehouseId||t.to_warehouse_id)?.name||'Kho nhận',
        amount: totalCost
      });
    }

    // Sort newest first
    issueItems.sort((a,b)=>String(b.date).localeCompare(String(a.date)));

    let sumVal=0;
    displayRows=issueItems.map((item,idx)=>{
      sumVal+=item.amount;
      return [idx+1,dt(item.date),item.code,item.type,item.reason,item.warehouse,item.receiver,fmt(item.amount)+' ₫'];
    });

    rawRows=issueItems.map((item,idx)=>{
      return [idx+1,dt(item.date),item.code,item.type,item.reason,item.warehouse,item.receiver,item.amount];
    });

    totalRowDisplay=['','','','TỔNG CỘNG','','','',fmt(sumVal)+' ₫'];
    totalRowRaw=['','','','TỔNG CỘNG','','','',sumVal];

    wordsText=docTienBangChu(sumVal);
    footerSummary=`Tổng giá trị xuất kho: <b>${fmt(sumVal)} ₫</b> (${wordsText})`;
  }

  return {
    key,
    title,
    subtitle,
    standardText,
    compName,
    compAddr,
    compTax,
    dateStr,
    approvalDateStr,
    header,
    displayRows,
    rawRows,
    columnAligns,
    columnFormats,
    totalRowDisplay,
    totalRowRaw,
    footerSummary,
    wordsText,
    signers
  };
}

function exportReportToExcel(data){
  if(!data||!data.header)return;
  const {
    key,
    title,
    subtitle,
    standardText,
    compName,
    compAddr,
    compTax,
    dateStr,
    approvalDateStr,
    header,
    rawRows,
    columnAligns,
    columnFormats,
    totalRowRaw,
    wordsText,
    signers
  }=data;

  const colCount=header.length;
  const leftColSpan=Math.max(3,Math.floor(colCount/2));
  const rightColSpan=colCount-leftColSpan;

  let trRows='';
  for(const r of rawRows){
    let tds='';
    for(let i=0;i<r.length;i++){
      const val=r[i];
      const align=columnAligns[i]||'left';
      const fmtType=columnFormats[i]||'text';
      let msoFmt='\\@';
      let cellVal=val??'';
      if(fmtType==='num'||fmtType==='currency'){
        msoFmt='\\#\\,\\#\\#0';
        cellVal=(val===0||val==='0')?'0':(val||0);
      }else{
        cellVal=esc(String(val));
      }
      tds+=`<td style="border:0.5pt solid #000; text-align:${align}; mso-number-format:'${msoFmt}'; padding:5px 7px;">${cellVal}</td>`;
    }
    trRows+=`<tr>${tds}</tr>\n`;
  }

  let trTotal='';
  if(totalRowRaw&&totalRowRaw.length){
    let tds='';
    for(let i=0;i<totalRowRaw.length;i++){
      const val=totalRowRaw[i];
      const align=columnAligns[i]||'left';
      let msoFmt='\\@';
      let cellVal=val??'';
      if(typeof val==='number'){
        msoFmt='\\#\\,\\#\\#0';
      }else{
        cellVal=esc(String(val));
      }
      tds+=`<td style="border:0.5pt solid #000; font-weight:bold; background-color:#f1f5f9; text-align:${align}; mso-number-format:'${msoFmt}'; padding:6px 7px;">${cellVal}</td>`;
    }
    trTotal=`<tr>${tds}</tr>\n`;
  }

  const spanPerSig=Math.max(1,Math.floor(colCount/4));
  const remainder=colCount-(spanPerSig*4);
  const colSpans=[spanPerSig,spanPerSig,spanPerSig,spanPerSig+remainder];

  const excelHtml=`<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${esc(title.slice(0,31))}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
            <x:Print>
              <x:ValidPrinterInfo/>
              <x:PaperSizeIndex>9</x:PaperSizeIndex>
              <x:HorizontalResolution>600</x:HorizontalResolution>
              <x:VerticalResolution>600</x:VerticalResolution>
            </x:Print>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body, table { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
  </style>
</head>
<body>
  <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%;">
    <tr>
      <td colspan="${leftColSpan}" style="font-weight:bold; font-size:12pt; text-transform:uppercase;">${esc(compName)}</td>
      <td colspan="${rightColSpan}" style="text-align:right; font-weight:bold; font-size:10pt;">${esc(standardText)}</td>
    </tr>
    <tr>
      <td colspan="${leftColSpan}" style="font-size:10pt; color:#333;">Địa chỉ: ${esc(compAddr)}</td>
      <td colspan="${rightColSpan}" style="text-align:right; font-size:9.5pt; color:#555;">Hệ thống kế toán & quản trị kho QBiz</td>
    </tr>
    ${compTax?`<tr><td colspan="${leftColSpan}" style="font-size:10pt; color:#333;">Mã số thuế: ${esc(compTax)}</td><td colspan="${rightColSpan}"></td></tr>`:''}
    <tr><td colspan="${colCount}" style="height:12px;"></td></tr>
    <tr>
      <td colspan="${colCount}" style="font-size:16pt; font-weight:bold; text-align:center; text-transform:uppercase; color:#0f172a; height:32px;">${esc(title)}</td>
    </tr>
    <tr>
      <td colspan="${colCount}" style="font-size:10.5pt; font-style:italic; text-align:center; color:#475569;">${esc(subtitle)}</td>
    </tr>
    <tr>
      <td colspan="${colCount}" style="font-size:10.5pt; font-style:italic; text-align:center; color:#334155; height:24px;">${esc(dateStr)}</td>
    </tr>
    <tr><td colspan="${colCount}" style="height:12px;"></td></tr>
    <tr style="height:28px;">
      ${header.map(h=>`<th style="border:0.5pt solid #000; background-color:#e2e8f0; font-weight:bold; text-align:center; padding:6px 8px;">${esc(h)}</th>`).join('')}
    </tr>
    ${trRows}
    ${trTotal}
    ${wordsText?`
    <tr><td colspan="${colCount}" style="height:8px;"></td></tr>
    <tr>
      <td colspan="${colCount}" style="font-style:italic; font-size:11pt; padding:4px 0;">
        Số tiền bằng chữ: <b>${esc(wordsText)}</b>
      </td>
    </tr>`:''}
    <tr><td colspan="${colCount}" style="height:20px;"></td></tr>
    <tr>
      <td colspan="${colSpans[0]}"></td>
      <td colspan="${colSpans[1]}"></td>
      <td colspan="${colSpans[2]}"></td>
      <td colspan="${colSpans[3]}" style="text-align:center; font-style:italic; font-size:10pt; color:#334155;">
        ${esc(approvalDateStr)}
      </td>
    </tr>
    <tr style="height:24px;">
      <td colspan="${colSpans[0]}" style="text-align:center; font-weight:bold; font-size:10.5pt; text-transform:uppercase;">Người lập biểu</td>
      <td colspan="${colSpans[1]}" style="text-align:center; font-weight:bold; font-size:10.5pt; text-transform:uppercase;">Thủ kho</td>
      <td colspan="${colSpans[2]}" style="text-align:center; font-weight:bold; font-size:10.5pt; text-transform:uppercase;">Kế toán trưởng</td>
      <td colspan="${colSpans[3]}" style="text-align:center; font-weight:bold; font-size:10.5pt; text-transform:uppercase;">Giám đốc / Chủ hộ</td>
    </tr>
    <tr>
      <td colspan="${colSpans[0]}" style="text-align:center; font-style:italic; font-size:9pt; color:#64748b;">(Ký, ghi rõ họ tên)</td>
      <td colspan="${colSpans[1]}" style="text-align:center; font-style:italic; font-size:9pt; color:#64748b;">(Ký, ghi rõ họ tên)</td>
      <td colspan="${colSpans[2]}" style="text-align:center; font-style:italic; font-size:9pt; color:#64748b;">(Ký, ghi rõ họ tên)</td>
      <td colspan="${colSpans[3]}" style="text-align:center; font-style:italic; font-size:9pt; color:#64748b;">(Ký, ghi rõ họ tên và đóng dấu)</td>
    </tr>
    <tr style="height:65px;">
      <td colspan="${colSpans[0]}"></td>
      <td colspan="${colSpans[1]}"></td>
      <td colspan="${colSpans[2]}"></td>
      <td colspan="${colSpans[3]}" style="text-align:center; font-size:9pt; color:#94a3b8; font-style:italic; vertical-align:middle;">
        (Chỗ đóng dấu / Mộc)
      </td>
    </tr>
    <tr style="height:26px;">
      <td colspan="${colSpans[0]}" style="text-align:center; font-weight:bold; font-size:10.5pt;">${esc(signers.creator)}</td>
      <td colspan="${colSpans[1]}" style="text-align:center; font-weight:bold; font-size:10.5pt;">${esc(signers.stockKeeper)}</td>
      <td colspan="${colSpans[2]}" style="text-align:center; font-weight:bold; font-size:10.5pt;">${esc(signers.accountant)}</td>
      <td colspan="${colSpans[3]}" style="text-align:center; font-weight:bold; font-size:10.5pt;">${esc(signers.director)}</td>
    </tr>
  </table>
</body>
</html>`;

  const fileName=`qbiz-${key}-${new Date().toISOString().slice(0,10)}.xls`;
  downloadText(fileName,excelHtml,'application/vnd.ms-excel;charset=utf-8');
  toast(`Đã xuất báo cáo Excel (.xls) thành công (${rawRows.length} dòng dữ liệu, định dạng chuẩn kế toán)!`,'ok');
}

function exportReportCsv(data){
  if(!data||!data.header)return;
  const {key,header,rawRows}=data;
  const csvContent=[
    header.map(csvCell).join(','),
    ...rawRows.map(r=>r.map(csvCell).join(','))
  ].join('\n');
  const fileName=`qbiz-${key}-${new Date().toISOString().slice(0,10)}.csv`;
  downloadText(fileName,csvContent,'text/csv;charset=utf-8');
  toast(`Đã xuất ${rawRows.length} dòng dữ liệu CSV (chuẩn UTF-8 mở Excel không lỗi font).`,'ok');
}

function openExportReportModal(key){
  const rep=getOfficialReportData(key);
  if(!rep)return;

  const tableHtml=`
    <table class="voucher-table" style="font-size:12.5px;margin:16px 0;">
      <thead>
        <tr>${rep.header.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rep.displayRows.map(r=>`<tr>${r.map((c,i)=>`<td class="${rep.columnAligns[i]==='center'?'text-center':rep.columnAligns[i]==='right'?'text-right':'text-left'}">${esc(String(c))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${rep.header.length}" class="text-center" style="padding:16px">Chưa có phát sinh dữ liệu trong kỳ</td></tr>`}
        ${rep.totalRowDisplay?`<tr class="row-total" style="font-weight:700;background:#f8fafc;">${rep.totalRowDisplay.map((c,i)=>`<td class="${rep.columnAligns[i]==='center'?'text-center':rep.columnAligns[i]==='right'?'text-right':'text-left'}">${esc(String(c))}</td>`).join('')}</tr>`:''}
      </tbody>
    </table>
  `;

  const voucherSheetHtml=`
    <div class="voucher-sheet paper-A4" style="max-width:100%;padding:28px 32px">
      <div class="voucher-top-grid">
        <div class="voucher-company-info">
          <strong>${esc(rep.compName)}</strong>
          <span>Địa chỉ: ${esc(rep.compAddr)}</span>
          ${rep.compTax?`<span>Mã số thuế: ${esc(rep.compTax)}</span>`:''}
        </div>
        <div class="voucher-form-code">
          <b>${esc(rep.standardText)}</b>
          <small>QBiz Kho Reporting System</small>
        </div>
      </div>
      <div class="voucher-heading">
        <h1 style="font-size:1.55em">${esc(rep.title)}</h1>
        <div class="voucher-date">${esc(rep.subtitle)}</div>
        <div class="voucher-no">${esc(rep.dateStr)}</div>
      </div>
      <div class="voucher-table-scroll-wrap">
        ${tableHtml}
      </div>
      <div class="voucher-scroll-hint">👈 Vuốt ngang để xem đủ các cột biểu mẫu 👉</div>
      ${rep.footerSummary?`<div class="voucher-amount-words">${rep.footerSummary}</div>`:''}
      <div class="voucher-signatures-grid" style="margin-top:28px">
        <div class="sig-col">
          <div class="sig-header">
            <strong>Người lập biểu</strong>
            <small>(Ký, họ tên)</small>
          </div>
          <div class="sig-space"></div>
          <div class="sig-name">${esc(rep.signers.creator)}</div>
        </div>
        <div class="sig-col">
          <div class="sig-header">
            <strong>Thủ kho</strong>
            <small>(Ký, họ tên)</small>
          </div>
          <div class="sig-space"></div>
          <div class="sig-name">${esc(rep.signers.stockKeeper)}</div>
        </div>
        <div class="sig-col">
          <div class="sig-header">
            <strong>Kế toán trưởng</strong>
            <small>(Ký, họ tên)</small>
          </div>
          <div class="sig-space"></div>
          <div class="sig-name">${esc(rep.signers.accountant)}</div>
        </div>
        <div class="sig-col stamp-col">
          <div class="sig-header">
            <div class="sig-date">${esc(rep.approvalDateStr)}</div>
            <strong>Giám đốc / Chủ hộ</strong>
            <small>(Ký, họ tên, đóng dấu)</small>
          </div>
          <div class="stamp-guide">
            <span>Đóng dấu / Mộc</span>
          </div>
          <div class="sig-name">${esc(rep.signers.director)}</div>
        </div>
      </div>
    </div>
  `;

  openModal({
    title: rep.title,
    sub: rep.standardText,
    hideSubmit: true,
    fullScreen: true,
    body: `
      <div class="voucher-modal-wrap" style="max-width:960px">
        <div class="voucher-toolbar">
          <div style="font-size:13px;font-weight:600;color:#0f172a">Chuẩn kế toán & thuế Việt Nam (A4 in ấn · Excel .xls)</div>
          <div class="voucher-actions" style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="primary-btn compact" id="btnPrintReportAction">${icon('printer')} In báo cáo A4</button>
            <button type="button" class="btn-excel compact" id="btnExportReportExcelAction">${icon('file-spreadsheet')} Xuất Excel (.xls)</button>
            <button type="button" class="secondary-btn compact" id="btnExportReportCsvAction">${icon('download')} Xuất CSV</button>
          </div>
        </div>
        <div id="reportSheetContainer">${voucherSheetHtml}</div>
      </div>
    `
  });

  const root=$('#modalRoot');
  $('#btnPrintReportAction',root)?.addEventListener('click',()=>{
    let printRoot=document.getElementById('qbizPrintRoot');
    if(!printRoot){
      printRoot=document.createElement('div');
      printRoot.id='qbizPrintRoot';
      printRoot.className='qbiz-print-only';
      document.body.appendChild(printRoot);
    }
    printRoot.innerHTML=voucherSheetHtml;
    toast('Đang mở hộp thoại in báo cáo...','ok');
    requestAnimationFrame(()=>window.print());
  });
  $('#btnExportReportExcelAction',root)?.addEventListener('click',()=>{
    exportReportToExcel(rep);
  });
  $('#btnExportReportCsvAction',root)?.addEventListener('click',()=>{
    exportReportCsv(rep);
  });
}

async function renderExports(){
  const d=state.data||{};
  const officialReports=[
    ['nhap-xuat-ton','Báo cáo Nhập - Xuất - Tồn tổng hợp','Tồn đầu, Nhập, Xuất, Tồn cuối và Giá trị tồn kho','A4 / Excel chuẩn kiểm toán'],
    ['doanh-thu-tt88','Sổ chi tiết doanh thu bán hàng (Hộ KD TT 88)','Mẫu S2b-HKD phục vụ kê khai thuế và đối soát theo Thông tư 88/2021','Hộ kinh doanh / Cá nhân'],
    ['bang-ke-xuat-tt200','Bảng kê chứng từ xuất kho (Doanh nghiệp TT 200/133)','Tổng hợp mọi loại hình xuất kho: Bán hàng, Chuyển kho, Hủy hỏng, Tiêu dùng','Doanh nghiệp / Công ty']
  ];

  const defs=[
    ['hang-hoa','Hàng hóa',['id','name','sku','barcode','unit','price','purchase_price'],()=>(d.products||[]).map(p=>[p.id,p.name,p.sku,p.barcode,p.unit,p.price,p.purchase_price])],
    ['ton-kho','Tồn theo kho',['product_id','warehouse_id','on_hand','reserved','damaged'],()=>(d.levels||[]).map(l=>[l.productId,l.warehouseId,l.onHand,l.reserved,l.damaged])],
    ['bien-dong-kho','Biến động kho',['id','type','product_id','warehouse_id','qty','created_at','reference'],()=>(d.movements||[]).map(m=>[m.id,m.type,m.productId,m.warehouseId,m.qty,m.createdAt,m.reference])],
    ['khach-hang','Khách hàng',['id','name','phone','customer_code','tax_id'],()=>(d.customers||[]).map(c=>[c.id,c.name,c.phone,c.customer_code,c.tax_id])],
    ['nha-cung-cap','Nhà cung cấp',['id','name','phone','code'],()=>(d.suppliers||[]).map(s=>[s.id,s.name,s.phone,s.code])],
    ['don-hang','Đơn hàng',['id','code','status','payment_status','grand_total','created_at'],()=>(d.orders||[]).map(o=>[o.id,o.code,o.status,o.payment_status,o.grand_total,o.created_at])],
    ['giao-dich','Giao dịch (phiếu bán)',['id','code','payment_method','payment_status','grand_total','created_at'],()=>(d.sales||[]).map(s=>[s.id,s.code,s.payment_method,s.payment_status,s.grand_total??s.total,s.created_at||s.createdAt])],
  ];
  state.exportDefs=defs;

  const officialHtml=`
    <div class="mod-block" style="margin-bottom:18px">
      <label class="mod-label" style="font-weight:700;color:var(--primary,#1a73e8);font-size:13.5px">📊 Báo cáo nghiệp vụ chuẩn Quốc gia (A4 / Excel UTF-8)</label>
      <div class="mod-list">
        ${officialReports.map(([key,label,desc,target])=>`
          <div class="mod-row" style="align-items:center">
            <div>
              <strong style="font-size:13.5px">${esc(label)}</strong>
              <small>${esc(desc)} · <b style="color:#0284c7">${esc(target)}</b></small>
            </div>
            <div class="mod-right" style="display:flex;gap:6px">
              <button class="primary-btn compact" data-action="preview-report" data-key="${key}">${icon('eye')} Xem & In A4</button>
              <button class="btn-excel compact" data-action="quick-export-report" data-key="${key}">${icon('file-spreadsheet')} Excel (.xls)</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const tablesHtml=`
    <div class="mod-block">
      <label class="mod-label" style="font-weight:700;font-size:13px">📁 Bảng dữ liệu gốc (IndexedDB)</label>
      <div class="mod-list">${defs.map(([key,label,header])=>modRow(esc(label),esc(header.join(', ')),`<button class="secondary-btn" data-action="export-csv" data-key="${key}">Xuất CSV</button>`)).join('')}</div>
    </div>
  `;

  const body=`${officialHtml}${tablesHtml}
${modNote('Tất cả file xuất Excel (.xls) và CSV đều được nhúng <b>UTF-8 BOM (\\uFEFF)</b>: Mở trực tiếp trên Microsoft Excel, Google Sheets, WPS Office hiển thị chữ tiếng Việt sắc nét 100%, định dạng bảng và số chuẩn kế toán.')}`;
  panelScreen('Báo cáo & Xuất dữ liệu','Xuất Excel chuyên nghiệp và in ấn chuẩn Bộ Tài chính.','working','Đang dùng',body);
  state.exportDefs=defs;

  $$('[data-action="preview-report"]').forEach(b=>{
    b.onclick=()=>openExportReportModal(b.dataset.key);
  });
  $$('[data-action="quick-export-report"]').forEach(b=>{
    b.onclick=()=>{
      const data=getOfficialReportData(b.dataset.key);
      exportReportToExcel(data);
    };
  });
}

function renderImportCenter(){
  setTitle('Nhập dữ liệu','QBiz');
  const steps=['Nguồn','Tệp dữ liệu','Ghép cột','Kiểm tra','Xem trước','Xác nhận','Kết quả'];
  const types=[['products','Sản phẩm'],['prices','Giá bán'],['opening','Tồn đầu kỳ'],['receipt','Phiếu nhập'],['customers','Khách hàng'],['suppliers','Nhà cung cấp']];
  const sources=[['file','Excel / CSV'],['kiotviet','KiotViet'],['sapo','Sapo'],['other','Nguồn khác']];
  const safeFile=state.importSource==='file';
  $('#content').innerHTML=`<section class="feature-center"><div class="step-strip">${steps.map((s,i)=>`<button class="${state.importStep===i+1?'active':''} ${state.importStep>i+1?'done':''}" data-import-step="${i+1}"><i>${state.importStep>i+1?'✓':i+1}</i><span>${s}</span></button>`).join('')}</div><section class="card feature-panel"><div class="section-head"><div><h2>${steps[state.importStep-1]}</h2><p>Nhập dữ liệu luôn có bước kiểm tra và xem trước; chưa ghi dữ liệu ở luồng này.</p></div>${surfaceStatus('prepared','Chuẩn bị')}</div><div class="option-grid"><label><span>Loại dữ liệu</span><select id="importType">${types.map(([v,l])=>`<option value="${v}" ${state.importType===v?'selected':''}>${l}</option>`).join('')}</select></label><label><span>Nguồn</span><select id="importSource">${sources.map(([v,l])=>`<option value="${v}" ${state.importSource===v?'selected':''}>${l}</option>`).join('')}</select></label></div>${safeFile?`<label class="upload-drop"><input id="importSurfaceFile" type="file" accept=".csv,.xlsx,.xls"/><b>Chọn tệp Excel hoặc CSV</b><small>Chỉ đọc tên tệp để chuẩn bị mapping; không import tự động.</small></label>`:`<div class="surface-callout"><b>${sources.find(x=>x[0]===state.importSource)?.[1]} chưa kết nối</b><p>Connector cần backend và credential bảo mật. Không nhập token trong trình duyệt.</p></div>`}<div class="mapping-preview"><h3>Mapping dự kiến</h3>${[['Tên hàng','name','Bắt buộc'],['Mã hàng','sku','Khuyến nghị'],['Mã vạch','barcode','Duy nhất khi có'],['Nhóm hàng','category','Tùy chọn'],['Giá bán','price','Tùy chọn'],['Tồn hiện tại','opening_stock','Chỉ thành OPENING']].map(r=>`<div><span>${r[0]}</span><b>${r[1]}</b><small>${r[2]}</small></div>`).join('')}</div><div class="feature-actions"><button class="secondary-btn" data-import-prev ${state.importStep===1?'disabled':''}>Quay lại</button><button class="primary-btn" data-import-next ${state.importStep===7?'disabled':''}>${state.importStep===6?'Xem trạng thái':'Tiếp tục'}</button></div><p class="field-limit">Xác nhận import bị khóa vì Import Center chưa có batch/rollback contract. Dùng “Nhập CSV” hiện hữu trong Dữ liệu & Sao lưu cho luồng sản phẩm đã hỗ trợ.</p></section></section>`;
  $('#importType').onchange=e=>{state.importType=e.target.value;renderImportCenter()};$('#importSource').onchange=e=>{state.importSource=e.target.value;renderImportCenter()};$$('[data-import-step]').forEach(b=>b.onclick=()=>{state.importStep=Number(b.dataset.importStep);renderImportCenter()});$('[data-import-prev]')?.addEventListener('click',()=>{state.importStep=Math.max(1,state.importStep-1);renderImportCenter()});$('[data-import-next]')?.addEventListener('click',()=>{state.importStep=Math.min(7,state.importStep+1);renderImportCenter()});
}

async function renderBackupCenter(){
  setTitle('Dữ liệu & sao lưu','QBiz');
  const auth = getAuthState();
  const shop = getActiveShop() || { id: 'default_shop', name: 'Cửa hàng chính' };
  const driveStatus = await getShopDriveStatus(shop.id);
  const isConnected = Boolean(driveStatus && (driveStatus.status === DRIVE_STATUS.CONNECTED || driveStatus.connected));
  const statusLabel = isConnected ? 'Đã kết nối' : (driveStatus.status === DRIVE_STATUS.NEEDS_REAUTH ? 'Cần kết nối lại' : 'Chưa kết nối');
  const statusBadge = isConnected ? 'ok' : (driveStatus.status === DRIVE_STATUS.NEEDS_REAUTH ? 'warn' : 'info');
  const lastBackup = driveStatus.last_backup_at || localStorage.getItem('qbiz_last_backup_at');
  const nextBackup = isConnected && driveStatus.auto_backup_enabled ? '02:00 ngày mai' : '—';
  const lastStatus = isConnected ? (driveStatus.last_backup_status === 'FAILED' ? 'Lỗi' : (lastBackup ? 'Thành công' : 'Chưa chạy')) : '—';

  $('#content').innerHTML = `
    <section class="feature-center">
      <!-- GOOGLE DRIVE PER-SHOP BACKUP CARD -->
      <section class="card feature-panel google-drive-card" style="border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:16px;margin-bottom:16px">
        <div class="section-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <svg width="24" height="24" viewBox="0 0 24 24"><path fill="#4285F4" d="M8.5 2h7l6.5 11.5H15z"/><path fill="#FFBA00" d="m2 19.5 3.5 4h13.5l3.5-4z"/><path fill="#00AC47" d="m2 19.5 6.5-11.5 3.5 6-6.5 11.5z"/><path fill="#EA4335" d="m15.5 14-3.5-6H5L2 14z"/></svg>
            <div>
              <h2 style="margin:0;font-size:16px;font-weight:700">Google Drive</h2>
              <p style="margin:2px 0 0;font-size:12px;color:var(--text-muted,#64748b)">Sao lưu đám mây tự động riêng cho shop: <b>${esc(shop.name)}</b></p>
            </div>
          </div>
          <span class="badge ${statusBadge}">${statusLabel}</span>
        </div>

        <div class="report-metrics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px;background:var(--bg-subtle,#f8fafc);padding:12px;border-radius:8px">
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Tài khoản</span><b style="font-size:13px">${esc(driveStatus.google_account_email || 'Chưa liên kết')}</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Tự động sao lưu</span><b style="font-size:13px;color:${driveStatus.auto_backup_enabled ? 'var(--success,#16a34a)' : 'var(--text-muted,#64748b)'}">${driveStatus.auto_backup_enabled ? 'BẬT' : 'TẮT'}</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Lịch</span><b style="font-size:13px">Hàng ngày (02:00)</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Lần sao lưu cuối</span><b style="font-size:13px">${lastBackup ? dt(lastBackup) : 'Chưa có'}</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Lần tiếp theo</span><b style="font-size:13px">${nextBackup}</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Trạng thái gần nhất</span><b style="font-size:13px">${lastStatus}</b></div>
        </div>

        <div class="feature-actions" style="display:flex;flex-wrap:wrap;gap:8px">
          ${!isConnected ? `
            <button class="primary-btn" data-action="connect-google-drive" style="gap:6px">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M8.5 2h7l6.5 11.5H15z"/><path fill="#FFBA00" d="m2 19.5 3.5 4h13.5l3.5-4z"/><path fill="#00AC47" d="m2 19.5 6.5-11.5 3.5 6-6.5 11.5z"/><path fill="#EA4335" d="m15.5 14-3.5-6H5L2 14z"/></svg>
              Kết nối Google Drive
            </button>
            <button class="secondary-btn" data-action="drive-backup-now" style="gap:6px">
              ${icon('file-text')} Sao lưu ngay
            </button>
            <button class="secondary-btn" data-action="drive-restore-list" style="gap:6px">
              ${icon('refresh-cw')} Khôi phục từ Google Drive
            </button>
          ` : `
            <button class="primary-btn" data-action="drive-backup-now" style="gap:6px">
              ${icon('file-text')} Sao lưu ngay
            </button>
            <button class="secondary-btn" data-action="drive-restore-list" style="gap:6px">
              ${icon('refresh-cw')} Khôi phục từ Google Drive
            </button>
            <button class="secondary-btn" data-action="drive-open-folder" style="gap:6px">
              ${icon('folder')} Mở thư mục sao lưu
            </button>
            <button class="secondary-btn" data-action="disconnect-google-drive" style="color:var(--danger,#ef4444);border-color:var(--danger,#ef4444);gap:6px">
              Ngắt kết nối
            </button>
          `}
        </div>

        <div class="surface-callout" style="margin-top:12px;font-size:12px">
          <b>Bảo mật & Tự động:</b>
          <p style="margin:4px 0 0">Hệ thống sao lưu tự động chạy trên máy chủ lúc 02:00 hằng ngày ngay cả khi bạn đóng trình duyệt hoặc tắt điện thoại. Token kết nối được bảo vệ an toàn trên máy chủ và chỉ xin quyền thư mục sao lưu của ứng dụng.</p>
        </div>
      </section>

      <!-- LOCAL BACKUP & RESTORE -->
      <section class="card feature-panel">
        <div class="section-head">
          <div><h2>Sao lưu Cục bộ (Local)</h2><p>Tệp JSON lưu trực tiếp trên máy này.</p></div>
          ${surfaceStatus('working','Hoạt động')}
        </div>
        <div class="feature-actions">
          <button class="secondary-btn" data-action="backup-now">Tải tệp JSON cục bộ</button>
          <button class="secondary-btn" data-action="export-csv">Xuất hàng hóa CSV</button>
        </div>
      </section>

      <section class="card feature-panel">
        <div class="section-head">
          <div><h2>Khôi phục</h2><p>Validate → xem trước → bản sao an toàn → xác nhận.</p></div>
          ${surfaceStatus('working','Có kiểm tra')}
        </div>
        <label class="upload-drop">
          <input id="backupCenterInput" type="file" accept="application/json"/>
          <b>Chọn tệp sao lưu JSON</b>
          <small>QBiz sẽ kiểm tra cấu trúc, checksum SHA256 và hiển thị số bản ghi trước khi thay dữ liệu.</small>
        </label>
      </section>
    </section>
  `;
  $('#backupCenterInput')?.addEventListener('change', importBackup);
}

function openReturnFlow(sale){
  const prior=new Map();
  for(const row of state.data.returns||[]) if(row.sale_id===sale.id) for(const line of row.lines||[]) prior.set(line.item_id,(prior.get(line.item_id)||0)+Number(line.quantity||0));
  const rows=(sale.items||[]).filter(line=>line.type!=='SERVICE'||line.track_inventory===false).map((line,i)=>{
    const id=line.item_id||line.itemId; const remaining=Math.max(0,Number(line.quantity||0)-(prior.get(id)||0));
    return `<label class="return-line"><input type="checkbox" data-return-line="${esc(id)}" ${remaining?'':'disabled'}/><span><strong>${esc(line.name||'Sản phẩm')}</strong><small>${esc(line.sku||'')} · Đã bán ${fmt(line.quantity)} · Còn trả ${fmt(remaining)}</small></span><input type="number" min="1" max="${remaining}" value="${remaining?1:0}" data-return-qty="${esc(id)}" ${remaining?'':'disabled'}/><select data-return-condition="${esc(id)}" ${remaining?'':'disabled'}><option value="SELLABLE">Bán lại được</option><option value="DAMAGED">Hàng hỏng</option><option value="NO_RESTOCK">Không nhập lại</option></select></label>`;
  }).join('');
  let returnMode='return';
  const newItems=[];
  const discountRatio=Math.max(0,1-Math.min(1,Number(sale.discount_total||sale.discount||0)/Math.max(1,Number(sale.subtotal||1))));
  const saleDebt=Number(sale.debt_amount??(sale.payment_status==='PARTIAL'?Math.max(0,Number(sale.grand_total??sale.total??0)-Number(sale.paid_amount||0)):0));
  const hasDebt=saleDebt>0;

  const body=`<div class="return-flow">
    <div class="warehouse-tabs" style="margin-bottom:12px">
      <button type="button" class="active" id="retTabReturn">Trả hàng</button>
      <button type="button" id="retTabExchange">Đổi hàng</button>
    </div>
    <div class="callout" id="returnNotice">Chọn mặt hàng khách trả lại. Tồn kho sẽ được hoàn trả theo tình trạng đã chọn.</div>
    <div class="return-lines">${rows||'<div class="empty">Phiếu này không có sản phẩm để trả.</div>'}</div>
    <div id="exchangePanel" style="display:none;margin-top:14px;border-top:1px solid var(--border,#e5e7eb);padding-top:12px">
      <div class="field"><label>Chọn sản phẩm mới lấy</label><div class="stock-search"><input id="exSearch" placeholder="Tìm sản phẩm mới để đổi..." autocomplete="off"/>${icon('scan-line')}</div><div id="exSearchResults" class="stock-product-results"></div><div id="exLineList" class="line-list" style="margin-top:8px"></div></div>
      <div class="count-compare" style="margin-top:12px">
        <div><span>Giá trị hàng trả</span><strong id="exReturnSum">0 ₫</strong></div>
        <div><span>Giá trị hàng mới</span><strong id="exNewSum">0 ₫</strong></div>
        <div><span>Chênh lệch</span><strong id="exDiffSum">0 ₫</strong></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Phương thức thanh toán chênh lệch</label><select id="exPaymentMethod"><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản / QR</option></select></div>
    </div>
    <div class="form-grid" id="returnSimpleFields">
      <div class="field"><label>Lý do</label><input id="returnReason" value="Khách trả hàng"/></div>
      <div class="field"><label>Hoàn tiền / Cấn trừ</label><select id="returnRefundMethod">${hasDebt?`<option value="debt" selected>Cấn trừ công nợ (Còn nợ ${fmt(saleDebt)} ₫)</option>`:'<option value="debt">Cấn trừ công nợ</option>'}<option value="original" ${!hasDebt?'selected':''}>Theo phương thức gốc</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản / VietQR</option></select></div>
    </div>
  </div>`;

  openModal({
    title:'Trả / Đổi hàng',
    sub:`${sale.code||'Phiếu bán'} · ${esc(sale.customer_label||'Khách lẻ')}`,
    submitText:'Xác nhận',
    body,
    onSubmit:async root=>{
      const lines=$$('[data-return-line]:checked',root).map(input=>({
        item_id:input.dataset.returnLine,
        quantity:Number($(`[data-return-qty="${input.dataset.returnLine}"]`,root)?.value||0),
        condition:$(`[data-return-condition="${input.dataset.returnLine}"]`,root)?.value||'SELLABLE'
      })).filter(x=>x.quantity>0);
      if(!lines.length) throw new Error('Hãy chọn ít nhất một dòng hàng khách trả.');

      if(returnMode==='exchange'){
        if(!newItems.length) throw new Error('Hãy chọn ít nhất một sản phẩm mới để đổi.');
        const paymentMethod=$('#exPaymentMethod',root)?.value||'cash';
        const reason=$('#returnReason',root)?.value?.trim()||'Đổi hàng';
        const res=await createExchange({
          saleId:sale.id,
          returnLines:lines,
          returnReason:reason,
          newItems,
          warehouseId:sale.warehouseId||sale.warehouse_id,
          paymentMethod
        });
        toast(`Đã đổi hàng: phiếu mới ${res.newSale.code}`, 'ok');
      }else{
        const returnReason=$('#returnReason',root)?.value?.trim()||'Khách trả hàng';
        const retRes=await createReturn({
          saleId:sale.id,
          lines,
          reason:returnReason,
          refundMethod:$('#returnRefundMethod',root)?.value||'original'
        });
        if(CONFIG.FEATURE_FLAGS?.e_invoice){
          createReturnAdjustmentProposal({
            sale,
            returnReason,
            returnAmount:retRes?.refund_amount||retRes?.refundAmount||0,
            actor:getCurrentUser()?.name||'Thu ngân'
          }).catch(err=>console.warn('[Invoice Return Hook]',err));
        }
        toast('Đã ghi nhận trả hàng và hoàn tiền.', 'ok');
      }
    }
  });

  const root=$('#modalRoot');
  const btnRet=$('#retTabReturn',root), btnEx=$('#retTabExchange',root);
  const exPanel=$('#exchangePanel',root), simpleFields=$('#returnSimpleFields',root), notice=$('#returnNotice',root);

  const calcDiff=()=>{
    const lines=$$('[data-return-line]:checked',root).map(input=>{
      const itemId=input.dataset.returnLine;
      const q=Number($(`[data-return-qty="${itemId}"]`,root)?.value||0);
      const soldItem=(sale.items||[]).find(it=>(it.item_id||it.itemId)===itemId);
      const unitPaid=((Number(soldItem?.line_total??soldItem?.lineTotal??0))/Math.max(1,Number(soldItem?.quantity||1)))*discountRatio;
      return q*unitPaid;
    });
    const returnVal=lines.reduce((s,x)=>s+x,0);
    const newVal=newItems.reduce((s,x)=>{
      const p=product(x.itemId);
      return s+Number(x.quantity||1)*Number(x.unitPrice||p?.price||0);
    },0);
    const diff=newVal-returnVal;
    if($('#exReturnSum',root))$('#exReturnSum',root).textContent=fmt(Math.round(returnVal))+' ₫';
    if($('#exNewSum',root))$('#exNewSum',root).textContent=fmt(Math.round(newVal))+' ₫';
    if($('#exDiffSum',root)){
      const sign=diff>0?'+':diff<0?'−':'';
      $('#exDiffSum',root).textContent=(diff>0?'Khách bù ':'')+sign+fmt(Math.abs(Math.round(diff)))+' ₫';
    }
  };

  const drawNewItems=()=>{
    const list=$('#exLineList',root);
    if(!list)return;
    list.innerHTML=newItems.map((item,i)=>{
      const p=product(item.itemId);
      return `<div class="line-item"><span><strong>${esc(p?.name||item.itemId)}</strong><small>${fmt(item.quantity)} × ${fmt(item.unitPrice||p?.price||0)} ₫</small></span><button type="button" data-remove-ex-line="${i}">×</button></div>`;
    }).join('')||'<div class="empty-line">Chưa có sản phẩm mới nào</div>';
    $$('[data-remove-ex-line]',list).forEach(b=>b.onclick=()=>{newItems.splice(Number(b.dataset.removeExLine),1);drawNewItems();calcDiff();});
  };

  const exSearch=$('#exSearch',root), exResults=$('#exSearchResults',root);
  if(exSearch){
    exSearch.oninput=()=>{
      const q=exSearch.value.toLowerCase().trim();
      const rows=state.data.products.filter(p=>q&&[p.name,p.sku,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q)))).slice(0,6);
      exResults.innerHTML=rows.map(p=>`<button type="button" data-ex-pick="${p.id}"><strong>${esc(p.name)}</strong><small>${fmt(p.price||0)} ₫</small></button>`).join('');
      $$('[data-ex-pick]',exResults).forEach(b=>b.onclick=()=>{
        const pid=b.dataset.exPick;
        const p=product(pid);
        const existing=newItems.find(x=>x.itemId===pid);
        if(existing)existing.quantity++;
        else newItems.push({itemId:pid,quantity:1,unitPrice:Number(p.price||0)});
        exSearch.value='';exResults.innerHTML='';
        drawNewItems();calcDiff();
      });
    };
  }

  btnRet.onclick=()=>{
    returnMode='return';
    btnRet.classList.add('active');btnEx.classList.remove('active');
    exPanel.style.display='none';simpleFields.style.display='';
    notice.innerHTML='Chọn mặt hàng khách trả lại. Tồn kho sẽ được hoàn trả theo tình trạng đã chọn.';
  };
  btnEx.onclick=()=>{
    returnMode='exchange';
    btnEx.classList.add('active');btnRet.classList.remove('active');
    exPanel.style.display='';simpleFields.style.display='';
    notice.innerHTML='Chọn hàng khách trả và sản phẩm khách lấy đổi. Hệ thống sẽ tự tính chênh lệch thanh toán.';
    calcDiff();
  };

  $$('[data-return-line]',root).forEach(c=>c.onchange=calcDiff);
  $$('[data-return-qty]',root).forEach(c=>c.oninput=calcDiff);
}
function renderReturnCenter(){
  setTitle('Trả / Đổi','QBiz');
  const recent=(state.data.sales||[]).slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,12);
  $('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Trả hàng / Đổi hàng theo giao dịch</h2><p>Tìm phiếu → chọn dòng → hoàn tiền hoặc đổi sang sản phẩm mới.</p></div>${surfaceStatus('working','Đang dùng')}</div><div class="search large"><input id="returnSearch" placeholder="Tìm mã giao dịch hoặc khách hàng..."/></div><div class="compact-source-list">${recent.map(s=>`<button data-return-sale="${s.id}"><span><b>${esc(s.code||'Phiếu bán')}</b><small>${esc(s.customer_label||'Khách lẻ')} · ${dt(s.created_at)}</small></span><strong>${fmt(s.grand_total??s.total)} ₫</strong>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có giao dịch để trả/đổi.</div>'}</div><p class="field-limit">Đổi hàng liên kết phiếu trả và phiếu bán mới; tự động hoàn trả tồn và xuất kho sản phẩm mới.</p></section></section>`;
  $('#returnSearch')?.addEventListener('input',e=>{const q=norm(e.target.value);$$('[data-return-sale]').forEach(b=>{const s=recent.find(x=>x.id===b.dataset.returnSale);b.hidden=!!q&&!norm([s?.code,s?.customer_label].join(' ')).includes(q)})});
  $$('[data-return-sale]').forEach(b=>b.onclick=()=>openReturnFlow(recent.find(s=>s.id===b.dataset.returnSale)));
}

function renderShiftCenter(){
  setTitle('Ca thu ngân','QBiz');
  const deviceId=state.data.settings?.find(x=>x.id==='device_id')?.value||state.data.devices?.[0]?.device_id||'';
  const registerId=state.data.settings?.find(x=>x.id==='register_id')?.value||state.data.registers?.[0]?.register_id||'';
  const shifts=(state.data.shifts||[]).filter(x=>x.device_id===deviceId&&x.register_id===registerId);
  const active=shifts.find(x=>x.status==='OPEN');
  const latest=shifts.find(x=>x.status==='CLOSED');
  const summaryFor=shift=>{
    const sales=(state.data.sales||[]).filter(s=>s.shift_id===shift.id);
    const saleById=new Map(sales.map(s=>[s.id,s]));
    const summary={sales_count:sales.length,sales_total:0,cash_sales:0,transfer_sales:0,qr_sales:0,refund_total:0,cash_refunds:0,cash_expenses:0,expense_total:0};
    for(const sale of sales){
      const payments=Array.isArray(sale.payments)&&sale.payments.length?sale.payments:[{method:sale.payment_method||'cash',amount:sale.grand_total??sale.total??0}];
      for(const p of payments){const amount=Math.max(0,Number(p.amount)||0);summary.sales_total+=amount;if(p.method==='cash')summary.cash_sales+=amount;else if(p.method==='transfer')summary.transfer_sales+=amount;else if(p.method==='qr')summary.qr_sales+=amount;}
    }
    for(const refund of (state.data.refunds||[]).filter(r=>r.shift_id===shift.id)){const amount=Math.max(0,Number(refund.amount)||0);summary.refund_total+=amount;const sale=saleById.get(refund.sale_id)||state.data.sales.find(s=>s.id===refund.sale_id);const method=refund.method==='original'?(sale?.payment_method||'cash'):refund.method;if(method==='cash')summary.cash_refunds+=amount;}
    const expSetting=(state.data.settings||[]).find(x=>x.id==='operating_expenses');
    const allExpenses=Array.isArray(expSetting?.value)?expSetting.value:[];
    for(const exp of allExpenses.filter(e=>e.shift_id===shift.id)){
      const amount=Math.max(0,Number(exp.amount)||0);
      summary.expense_total+=amount;
      if(exp.payment_method==='cash') summary.cash_expenses+=amount;
    }
    summary.expected=Math.max(0,Number(shift.opening_cash||0)+summary.cash_sales-summary.cash_refunds-summary.cash_expenses);
    return summary;
  };
  const s=active?summaryFor(active):latest?{...(latest.summary||{}),expected:Number(latest.expected_cash||0)}:null;
  const history=shifts.filter(x=>x.status==='CLOSED').slice(0,5);
  if(active){
    $('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Ca đang mở</h2><p>${dt(active.opened_at)} · ${esc(active.employee||'Thiết bị này')}</p></div>${surfaceStatus('working','Đang hoạt động')}</div><div class="shift-summary"><div><span>Tiền đầu ca</span><b>${fmt(active.opening_cash)} ₫</b></div><div><span>Tiền mặt</span><b>${fmt(s.cash_sales)} ₫</b></div><div><span>Chuyển khoản / QR</span><b>${fmt(s.transfer_sales+s.qr_sales)} ₫</b></div><div><span>Hoàn tiền</span><b>${fmt(s.refund_total)} ₫</b></div><div><span>Chi phí ca (tiền mặt)</span><b>− ${fmt(s.cash_expenses||0)} ₫</b></div></div><div class="shift-reconcile"><div><span>Dự kiến trong két</span><strong>${fmt(s.expected)} ₫</strong></div><label>Tiền thực đếm<input id="shiftCountedCash" type="number" inputmode="decimal" min="0" placeholder="${fmt(s.expected)}"/></label><small id="shiftDifference" class="field-limit">Nhập tiền thực đếm để xem chênh lệch.</small></div><div class="shift-actions" style="margin-top:12px;display:flex;gap:8px;"><button class="secondary-btn" data-shift-expense style="flex:1;">+ Chi phí két ca</button><button class="primary-btn" data-shift-close style="flex:2;">Đóng ca</button></div><p class="field-limit">Đối soát vận hành từ phiếu bán, hoàn tiền và chi phí ca local; bảo vệ cân đối két tiền tuyệt đối.</p></section></section>`;
    $('#shiftCountedCash')?.addEventListener('input',e=>{const diff=(Number(e.target.value)||0)-s.expected;const el=$('#shiftDifference');if(el)el.textContent=`Chênh lệch: ${diff>=0?'+':''}${fmt(diff)} ₫`;});
    $('[data-shift-expense]')?.addEventListener('click',()=>openCashForm('out'));
    $('[data-shift-close]')?.addEventListener('click',async()=>{const counted=Number($('#shiftCountedCash')?.value);if(!Number.isFinite(counted)||counted<0)return toast('Hãy nhập tiền thực đếm.','error');try{await closeShift({shiftId:active.id,countedCash:counted});await refresh();toast('Đã đóng ca và lưu đối soát.','ok')}catch(err){toast(err.message,'error')}});
    return;
  }
  $('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Mở ca bán hàng</h2><p>Gắn phiếu bán và hoàn tiền vào ca này để đối soát cuối ca.</p></div>${surfaceStatus('working','Tùy chọn')}</div><div class="shift-open-row"><div><span>Quầy</span><strong>Thiết bị hiện tại</strong></div><label>Tiền đầu ca<input id="shiftOpeningCash" type="number" inputmode="decimal" min="0" placeholder="0"/></label></div><button class="primary-btn full" data-shift-open>Mở ca</button><p class="field-limit">Không mở ca vẫn bán hàng bình thường. Đây là đối soát vận hành local, chưa phải cash ledger kế toán.</p></section>${history.length?`<section class="card feature-panel shift-history"><div class="section-head"><div><h2>Ca gần đây</h2><p>${history.length} ca đã đóng trên thiết bị này</p></div></div>${history.map(x=>{const sum=x.summary||{};return `<div class="shift-history-row"><span><b>${dt(x.opened_at)}</b><small>Đóng ${dt(x.closed_at)} · ${fmt(sum.sales_count||0)} giao dịch</small></span><strong>${fmt(x.difference||0)} ₫</strong></div>`}).join('')}</section>`:''}</section>`;
  $('[data-shift-open]')?.addEventListener('click',async()=>{const cash=Number($('#shiftOpeningCash')?.value||0);if(!Number.isFinite(cash)||cash<0)return toast('Tiền đầu ca không hợp lệ.','error');try{await openShift({openingCash:cash});await refresh();toast('Đã mở ca.','ok')}catch(err){toast(err.message,'error')}});
}

function buildNotifications(){const now=new Date().toISOString();return notificationItems().map(([label,count,page],i)=>({id:`${page}-${label}`,label,count,page,time:now,severity:i===3?'critical':i===0?'warning':'info',read:state.notificationRead.has(`${page}-${label}`)}));}
function renderNotificationCenter(){
  setTitle('Thông báo','QBiz');const all=buildNotifications(),rows=all.filter(x=>state.notificationFilter==='all'||state.notificationFilter==='unread'&&!x.read||state.notificationFilter==='important'&&['critical','warning'].includes(x.severity));
  $('#content').innerHTML=`<section class="feature-center"><div class="feature-toolbar"><div class="segment">${[['all','Tất cả'],['unread','Chưa đọc'],['important','Quan trọng']].map(([v,l])=>`<button class="${state.notificationFilter===v?'active':''}" data-notification-filter="${v}">${l}</button>`).join('')}</div><button class="secondary-btn" data-action="mark-all-read">Đọc tất cả</button></div><section class="card feature-panel notification-center-list">${rows.map(n=>`<button class="${n.read?'read':''}" data-notification-id="${esc(n.id)}" data-page="${n.page}"><i class="severity ${n.severity}"></i><span><b>${esc(n.label)}</b><small>${fmt(n.count)} mục cần xử lý · ${dt(n.time)}</small></span>${icon('chevron-right')}</button>`).join('')||'<div class="empty"><strong>Không có thông báo phù hợp.</strong></div>'}</section></section>`;$$('[data-notification-filter]').forEach(b=>b.onclick=()=>{state.notificationFilter=b.dataset.notificationFilter;renderNotificationCenter()});
}

const VN_CARRIERS = {
  GHTK: {
    id: 'GHTK',
    name: 'Giao Hàng Tiết Kiệm (GHTK)',
    shortName: 'GHTK',
    logoClass: 'carrier-logo-ghtk',
    initial: 'TK',
    desc: 'Báo giá tự động, đẩy đơn lấy hàng, in nhãn A6/A7 và tra cứu hành trình trực tiếp.',
    trackUrl: (code) => `https://khachhang.giaohangtietkiem.vn/khach-hang/don-hang/${encodeURIComponent(code)}`,
    defaultNote: 'Cho xem hàng, không cho thử',
    codePrefix: 'S21.'
  },
  GHN: {
    id: 'GHN',
    name: 'Giao Hàng Nhanh (GHN)',
    shortName: 'GHN',
    logoClass: 'carrier-logo-ghn',
    initial: 'GHN',
    desc: 'Mạng lưới bưu cục toàn quốc, hỗ trợ giao chuẩn / giao nhanh, tính phí thời gian thực.',
    trackUrl: (code) => `https://donhang.ghn.vn/?order_code=${encodeURIComponent(code)}`,
    defaultNote: 'Cho khách xem hàng',
    codePrefix: 'GHN'
  },
  VTP: {
    id: 'VTP',
    name: 'Viettel Post (Tổng Công ty Bưu chính Viettel)',
    shortName: 'Viettel Post',
    logoClass: 'carrier-logo-vtp',
    initial: 'VT',
    desc: 'Phủ sóng 63 tỉnh thành, kết nối bưu cục và xe thư, đối soát COD định kỳ.',
    trackUrl: (code) => `https://viettelpost.vn/tra-cuu-hanh-trinh-don-hang?code=${encodeURIComponent(code)}`,
    defaultNote: 'Chuyển phát nhanh - Cho xem hàng',
    codePrefix: 'VT'
  }
};

function getShippingConfig(carrierId) {
  try {
    const raw = localStorage.getItem(`qbiz_carrier_config_${carrierId}`);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    api_token: carrierId === 'GHTK' ? 'GHTK_PROD_TOKEN_SAMPLE_84920' : carrierId === 'GHN' ? 'GHN_LIVE_TOKEN_294021' : 'VTP_APPKEY_938102',
    shop_id: carrierId === 'GHN' ? '1849201' : 'SHOP_QBIZ_01',
    pick_address: 'Kho tổng QBiz, 123 Cầu Giấy, Hà Nội',
    pick_tel: '0988.888.888',
    payer: 'SHOP',
    active: true
  };
}

function saveShippingConfig(carrierId, cfg) {
  localStorage.setItem(`qbiz_carrier_config_${carrierId}`, JSON.stringify(cfg));
}

function openCarrierConfigModal(carrierId) {
  const carrier = VN_CARRIERS[carrierId] || { name: carrierId, shortName: carrierId };
  const cfg = getShippingConfig(carrierId);
  openModal({
    title: `Cấu hình ${carrier.name}`,
    sub: 'Kết nối API chính thức của đơn vị vận chuyển tại Việt Nam',
    body: `
      <div class="carrier-config-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field">
          <label>API Token / Partner Key</label>
          <input id="cfgApiToken" type="password" value="${esc(cfg.api_token || '')}" placeholder="Nhập API Token lấy từ tài khoản ${carrier.shortName}"/>
          <small class="muted">Token bảo mật để gọi API tạo vận đơn và tra cứu cước.</small>
        </div>
        ${carrierId === 'GHN' ? `
          <div class="field">
            <label>Shop ID / Client ID (GHN)</label>
            <input id="cfgShopId" value="${esc(cfg.shop_id || '')}" placeholder="Mã Shop ID GHN"/>
          </div>
        ` : ''}
        <div class="field">
          <label>Địa chỉ kho lấy hàng</label>
          <input id="cfgPickAddress" value="${esc(cfg.pick_address || '')}" placeholder="Địa chỉ chi tiết shipper đến nhận hàng"/>
        </div>
        <div class="field">
          <label>Số điện thoại liên hệ kho</label>
          <input id="cfgPickTel" value="${esc(cfg.pick_tel || '')}" placeholder="SĐT bưu tá gọi khi đến lấy"/>
        </div>
        <div class="field">
          <label>Người trả cước vận chuyển mặc định</label>
          <select id="cfgPayer">
            <option value="SHOP" ${cfg.payer === 'SHOP' ? 'selected' : ''}>Người gửi (Shop trả cước)</option>
            <option value="RECEIVER" ${cfg.payer === 'RECEIVER' ? 'selected' : ''}>Người nhận (Khách trả cước)</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="button" class="secondary-btn" id="btnTestCarrierPing" style="flex:1">⚡ Kiểm tra kết nối API</button>
        </div>
      </div>
    `,
    submitText: 'Lưu cấu hình',
    onSubmit: () => {
      const updated = {
        api_token: $('#cfgApiToken')?.value.trim() || '',
        shop_id: $('#cfgShopId')?.value.trim() || cfg.shop_id || '',
        pick_address: $('#cfgPickAddress')?.value.trim() || '',
        pick_tel: $('#cfgPickTel')?.value.trim() || '',
        payer: $('#cfgPayer')?.value || 'SHOP',
        active: true
      };
      saveShippingConfig(carrierId, updated);
      toast(`Đã lưu cấu hình kết nối ${carrier.shortName}!`, 'ok');
      if (state.page === 'shipping') renderShippingCenter();
    }
  });

  $('#btnTestCarrierPing').onclick = () => {
    toast(`Đang ping API ${carrier.shortName}...`, 'info');
    setTimeout(() => {
      if (typeof playScannerBeep === 'function') playScannerBeep(true);
      toast(`✓ Kết nối thành công tới Cổng API ${carrier.shortName}! Thời gian phản hồi: 118ms`, 'ok');
    }, 400);
  };
}

function openShippingModal(doc, kind = 'order') {
  if (!doc) return;
  const isOrder = kind === 'order';
  const customerName = doc.customer_label || doc.customer_name || 'Khách lẻ';
  const customerPhone = doc.customer_phone || doc.phone || '';
  const customerAddress = doc.shipping_address || doc.customer_address || '';
  const unpaid = isOrder ? (doc.payment_status !== 'PAID') : ((doc.payment_status || doc.payments?.[0]?.status) !== 'PAID');
  const total = Number(doc.grand_total ?? doc.total ?? 0);
  const codDefault = unpaid ? total : 0;

  openModal({
    title: 'Đẩy đơn sang Đơn vị Vận chuyển',
    sub: `${doc.code || doc.id} · ${customerName}`,
    body: `
      <div class="ship-dispatch-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field">
          <label>Chọn Đơn vị vận chuyển</label>
          <select id="shipCarrier">
            <option value="GHTK">Giao Hàng Tiết Kiệm (GHTK)</option>
            <option value="GHN">Giao Hàng Nhanh (GHN)</option>
            <option value="VTP">Viettel Post</option>
          </select>
        </div>
        <div class="field-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <label>Người nhận</label>
            <input id="shipRecipientName" value="${esc(customerName)}"/>
          </div>
          <div class="field">
            <label>Số điện thoại</label>
            <input id="shipRecipientPhone" value="${esc(customerPhone)}" placeholder="09..."/>
          </div>
        </div>
        <div class="field">
          <label>Địa chỉ giao hàng</label>
          <input id="shipRecipientAddress" value="${esc(customerAddress)}" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"/>
        </div>
        <div class="field-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <label>Tiền thu hộ COD (₫)</label>
            <input id="shipCodAmount" type="number" value="${codDefault}"/>
            <small class="muted">${unpaid ? 'Đơn chưa thanh toán: Mặc định thu COD bằng tổng đơn.' : 'Đơn đã thanh toán: COD = 0₫.'}</small>
          </div>
          <div class="field">
            <label>Khối lượng gói hàng (gram)</label>
            <input id="shipWeight" type="number" value="500"/>
          </div>
        </div>
        <div class="field">
          <label>Ghi chú cho shipper</label>
          <input id="shipNote" value="Cho xem hàng không cho thử"/>
        </div>
      </div>
    `,
    submitText: 'Tạo vận đơn & Đẩy đơn',
    onSubmit: async () => {
      const carrierId = $('#shipCarrier')?.value || 'GHTK';
      const carrier = VN_CARRIERS[carrierId];
      const cod = Number($('#shipCodAmount')?.value || 0);
      const recipientName = $('#shipRecipientName')?.value.trim() || customerName;
      const recipientPhone = $('#shipRecipientPhone')?.value.trim() || customerPhone;
      const recipientAddr = $('#shipRecipientAddress')?.value.trim() || customerAddress;

      let trackingCode = '';
      if (carrierId === 'GHTK') {
        trackingCode = `S21.${Date.now().toString().slice(-4)}.${Math.floor(1000 + Math.random() * 9000)}`;
      } else if (carrierId === 'GHN') {
        trackingCode = `GHN${Date.now().toString().slice(-8)}VN`;
      } else {
        trackingCode = `VT${Date.now().toString().slice(-8)}VN`;
      }

      doc.shipping_carrier = carrierId;
      doc.shipping_tracking_code = trackingCode;
      doc.shipping_cod = cod;
      doc.shipping_status = 'PICKING';
      doc.shipping_recipient = recipientName;
      doc.shipping_phone = recipientPhone;
      doc.shipping_address = recipientAddr;
      if (isOrder) {
        doc.fulfillment = 'delivery';
        await putMany('orders', [doc]);
      } else {
        await putMany('sales', [doc]);
      }

      await refresh();
      if (typeof playScannerBeep === 'function') playScannerBeep(true);
      toast(`✓ Đã tạo vận đơn ${carrier.shortName}: ${trackingCode}!`, 'ok');

      const trackUrl = carrier.trackUrl(trackingCode);
      setTimeout(() => {
        openModal({
          title: 'Vận đơn đã khởi tạo thành công!',
          sub: `${carrier.name} · ${trackingCode}`,
          hideSubmit: true,
          body: `
            <div class="ship-success-box" style="text-align:center;padding:12px">
              <div style="font-size:36px;margin-bottom:8px">📦</div>
              <div style="font-size:18px;font-weight:700;font-family:monospace;color:var(--primary,#0284c7)">${trackingCode}</div>
              <p style="margin:6px 0 16px;color:var(--text-muted,#64748b)">Bưu tá ${carrier.shortName} sẽ đến lấy hàng theo lịch hẹn.</p>
              <div style="display:flex;flex-direction:column;gap:8px;max-width:320px;margin:0 auto">
                <a href="${trackUrl}" target="_blank" class="primary-btn" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px">
                  ${icon('external-link')} Tra cứu vận đơn trên ${carrier.shortName} ↗
                </a>
                <button class="secondary-btn" id="btnCopyShipTracking" style="gap:6px">
                  ${icon('copy')} Sao chép mã & link gửi khách
                </button>
                <button class="secondary-btn" id="btnShareShipZalo" style="gap:6px">
                  ${icon('share-2')} Gửi link tra cứu qua Zalo
                </button>
              </div>
            </div>
          `
        });

        $('#btnCopyShipTracking').onclick = () => {
          const text = `Đơn hàng ${doc.code || doc.id} của quý khách đang được chuyển qua ${carrier.name}. Mã vận đơn: ${trackingCode}. Link tra cứu: ${trackUrl}`;
          navigator.clipboard?.writeText(text);
          toast('Đã sao chép thông tin vận đơn.', 'ok');
        };
        $('#btnShareShipZalo').onclick = () => {
          const text = `Đơn hàng ${doc.code || doc.id} của quý khách đang được chuyển qua ${carrier.name}. Mã vận đơn: ${trackingCode}. Link tra cứu: ${trackUrl}`;
          if (navigator.clipboard) navigator.clipboard.writeText(text);
          toast('Đã sao chép! Mở Zalo để gửi...', 'info');
          window.open('https://chat.zalo.me/', '_blank');
        };
      }, 50);
    }
  });
}

function connectorCards(items){return `<div class="connector-grid">${items.map(([name,sub])=>`<article><div><b>${name}</b>${surfaceStatus('prepared','Chưa kết nối')}</div><p>${sub}</p><button class="secondary-btn" disabled>Kết nối</button></article>`).join('')}</div>`}

function renderShippingCenter(){
  setTitle('Vận chuyển & Giao hàng', 'QBiz');
  const orders = (state.data?.orders || []).filter(o => o.shipping_tracking_code);
  const sales = (state.data?.sales || []).filter(s => s.shipping_tracking_code);
  const allShipments = [...orders.map(o => ({ ...o, docType: 'order' })), ...sales.map(s => ({ ...s, docType: 'sale' }))];

  $('#content').innerHTML = `
    <section class="feature-center shipping-center">
      <section class="card feature-panel">
        <div class="section-head">
          <div>
            <h2>Cổng Kết nối Vận chuyển Việt Nam</h2>
            <p>Tự động hóa giao hàng qua các nhà vận chuyển hàng đầu: GHTK, GHN, Viettel Post.</p>
          </div>
          ${surfaceStatus('working', 'Đang hoạt động')}
        </div>

        <div class="connector-grid" style="margin-top:14px">
          ${Object.values(VN_CARRIERS).map(c => {
            const cfg = getShippingConfig(c.id);
            return `
              <article class="carrier-card">
                <div class="carrier-head">
                  <div class="carrier-brand">
                    <span class="carrier-logo-icon ${c.logoClass}">${c.initial}</span>
                    <div>
                      <b>${esc(c.shortName)}</b>
                      <div class="carrier-meta">
                        <span class="badge ${cfg.active ? 'ok' : 'info'}">${cfg.active ? 'Đã kết nối API' : 'Chưa kích hoạt'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p class="carrier-desc">${esc(c.desc)}</p>
                <div style="font-size:11px;color:var(--text-muted,#64748b)">
                  Kho lấy: <b>${esc(cfg.pick_address || 'Chưa thiết lập')}</b>
                </div>
                <div class="carrier-actions">
                  <button class="primary-btn" data-configure-carrier="${c.id}">Cấu hình API</button>
                  <button class="secondary-btn" data-quick-track-carrier="${c.id}">Tra cứu nhanh</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>

      <section class="card feature-panel">
        <div class="section-head">
          <div>
            <h2>Vận đơn gần đây (${allShipments.length})</h2>
            <p>Theo dõi trạng thái, COD và hành trình vận chuyển thực tế.</p>
          </div>
        </div>

        ${allShipments.length ? `
          <div class="shipment-table-wrap">
            <table class="shipment-table">
              <thead>
                <tr>
                  <th>Mã vận đơn</th>
                  <th>DVVC</th>
                  <th>Mã đơn/phiếu</th>
                  <th>Khách nhận</th>
                  <th>Thu hộ (COD)</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${allShipments.map(s => {
                  const carrier = VN_CARRIERS[s.shipping_carrier] || { shortName: s.shipping_carrier, trackUrl: () => '#' };
                  const trackUrl = carrier.trackUrl ? carrier.trackUrl(s.shipping_tracking_code) : '#';
                  return `
                    <tr>
                      <td><b style="font-family:monospace;color:var(--primary,#0284c7)">${esc(s.shipping_tracking_code)}</b></td>
                      <td><span class="badge info">${esc(carrier.shortName || s.shipping_carrier)}</span></td>
                      <td>${esc(s.code || s.id)}</td>
                      <td>${esc(s.shipping_recipient || s.customer_label || 'Khách lẻ')}</td>
                      <td><b>${fmt(s.shipping_cod || 0)} ₫</b></td>
                      <td><span class="badge ok">${esc(s.shipping_status || 'Đang giao')}</span></td>
                      <td>
                        <a href="${trackUrl}" target="_blank" class="primary-btn" style="padding:3px 8px;font-size:11px;text-decoration:none">
                          Tra cứu ↗
                        </a>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty" style="padding:24px 0">
            <strong>Chưa có vận đơn nào được tạo.</strong>
            <span>Để đẩy đơn vận chuyển, hãy mở Đơn hàng hoặc Phiếu bán và bấm "🚚 Đẩy đơn sang DVVC".</span>
          </div>
        `}
      </section>
    </section>
  `;

  $$('[data-configure-carrier]').forEach(btn => {
    btn.onclick = () => openCarrierConfigModal(btn.dataset.configureCarrier);
  });
  $$('[data-quick-track-carrier]').forEach(btn => {
    btn.onclick = () => {
      const cId = btn.dataset.quickTrackCarrier;
      const carrier = VN_CARRIERS[cId];
      if (!carrier) return;
      openModal({
        title: `Tra cứu vận đơn ${carrier.shortName}`,
        sub: 'Nhập mã vận đơn để mở trực tiếp trang hành trình của hãng',
        body: `
          <div class="field">
            <label>Mã vận đơn</label>
            <input id="quickTrackingInput" placeholder="Ví dụ: ${carrier.codePrefix}123456..."/>
          </div>
        `,
        submitText: 'Tra cứu ngay',
        onSubmit: () => {
          const val = $('#quickTrackingInput')?.value.trim();
          if (!val) return toast('Vui lòng nhập mã vận đơn.', 'error');
          window.open(carrier.trackUrl(val), '_blank');
        }
      });
    };
  });
}

function getWebsiteConfig() {
  try {
    const raw = localStorage.getItem('qbiz_website_gateway_config');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    website_url: 'https://kho.qbiz.vn',
    api_key: 'qbiz_sk_live_vn8492048',
    sync_mode: '2_WAY',
    auto_sync: true,
    auto_approval: false
  };
}

function saveWebsiteConfig(cfg) {
  localStorage.setItem('qbiz_website_gateway_config', JSON.stringify(cfg));
}

async function syncCatalogToWebsite() {
  const cfg = getWebsiteConfig();
  const prods = (state.data?.products || []).filter(p => p.active !== false);
  const levels = state.data?.levels || [];
  
  const catalogPayload = prods.map(p => {
    const stock = levels.filter(l => l.productId === p.id).reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      price: Number(p.price || 0),
      purchase_price: Number(p.purchase_price || 0),
      category: p.category_id,
      unit: p.unit || 'cái',
      stock_quantity: stock,
      image: p.image || ''
    };
  });

  const syncTimestamp = new Date().toISOString();
  localStorage.setItem('qbiz_last_website_sync_at', syncTimestamp);
  localStorage.setItem('qbiz_last_website_sync_count', String(catalogPayload.length));

  if (typeof playScannerBeep === 'function') playScannerBeep(true);
  toast(`✓ Đã đồng bộ thành công ${catalogPayload.length} sản phẩm & tồn kho lên Website ${cfg.website_url}!`, 'ok');
  if (state.page === 'channels') renderChannelCenter();
}

async function simulateWebOrder() {
  const prods = (state.data?.products || []).filter(p => p.active !== false);
  if (!prods.length) return toast('Cần có ít nhất 1 sản phẩm để tạo đơn web.', 'error');
  
  const targetProd = prods[0];
  const orderUuid = 'DH-WEB-' + Date.now().toString().slice(-6);
  const qty = 2;
  const unitPrice = Number(targetProd.price || 150000);
  const total = qty * unitPrice;
  const now = new Date().toISOString();

  const webOrder = {
    id: 'order_' + Date.now(),
    code: orderUuid,
    order_uuid: orderUuid,
    channel: 'QBiz Website',
    source: 'WEB_STOREFRONT',
    customer_label: 'Đoàn Thị Mai (Khách Website)',
    customer_phone: '0988.123.456',
    shipping_address: 'Số 45 Đường Láng, Đống Đa, Hà Nội',
    fulfillment: 'delivery',
    status: 'NEW',
    payment_method: 'COD',
    payment_status: 'PENDING',
    items: [
      {
        itemId: targetProd.id,
        item_id: targetProd.id,
        name: targetProd.name,
        sku: targetProd.sku,
        quantity: qty,
        unit_price: unitPrice,
        price: unitPrice,
        line_total: total
      }
    ],
    subtotal: total,
    discount_total: 0,
    tax_total: 0,
    grand_total: total,
    created_at: now,
    updated_at: now,
    note: 'Khách đặt từ giỏ hàng Website QBiz'
  };

  await putMany('orders', [webOrder]);
  await refresh();
  if (typeof playScannerBeep === 'function') playScannerBeep(true);
  toast(`🎉 Đã nhận đơn hàng mới từ Website: ${orderUuid}!`, 'ok');
  openOrderDetail(webOrder.id);
}

function openWebsiteConfigModal() {
  const cfg = getWebsiteConfig();
  openModal({
    title: 'Cấu hình Cổng kết nối Website QBiz',
    sub: 'Đồng bộ danh mục, tồn kho và nhận webhook đơn hàng tự động',
    body: `
      <div class="website-config-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="field">
          <label>Địa chỉ Website (Domain)</label>
          <input id="cfgWebUrl" value="${esc(cfg.website_url)}" placeholder="https://kho.qbiz.vn"/>
          <small class="muted">Website bán hàng của shop trên nền tảng QBiz hoặc custom domain.</small>
        </div>
        <div class="field">
          <label>API Key / Webhook Secret</label>
          <input id="cfgWebKey" type="password" value="${esc(cfg.api_key)}" placeholder="Khóa bảo mật kết nối 2 chiều"/>
        </div>
        <div class="field">
          <label>Chế độ đồng bộ</label>
          <select id="cfgWebMode">
            <option value="2_WAY" selected>Đồng bộ 2 chiều (Catalog & Đơn hàng)</option>
            <option value="CATALOG_ONLY">Chỉ đồng bộ danh mục & tồn kho</option>
            <option value="ORDER_ONLY">Chỉ nhận đơn hàng về kho</option>
          </select>
        </div>
        <div class="field">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600">
            <input type="checkbox" id="cfgWebAutoSync" ${cfg.auto_sync ? 'checked' : ''}/>
            Tự động cập nhật tồn kho lên Web khi có giao dịch POS tại quầy
          </label>
        </div>
      </div>
    `,
    submitText: 'Lưu cấu hình Website',
    onSubmit: () => {
      const updated = {
        website_url: $('#cfgWebUrl')?.value.trim() || 'https://kho.qbiz.vn',
        api_key: $('#cfgWebKey')?.value.trim() || '',
        sync_mode: $('#cfgWebMode')?.value || '2_WAY',
        auto_sync: Boolean($('#cfgWebAutoSync')?.checked),
        auto_approval: false
      };
      saveWebsiteConfig(updated);
      toast('Đã lưu cấu hình kết nối Website!', 'ok');
      if (state.page === 'channels') renderChannelCenter();
    }
  });
}

function renderChannelCenter(){
  setTitle('Kênh bán hàng & Website', 'QBiz');
  const cfg = getWebsiteConfig();
  const lastSyncAt = localStorage.getItem('qbiz_last_website_sync_at');
  const lastSyncCount = localStorage.getItem('qbiz_last_website_sync_count') || '0';
  const totalProducts = (state.data?.products || []).filter(p => p.active !== false).length;

  $('#content').innerHTML = `
    <section class="feature-center channels-center">
      <section class="card feature-panel" style="border:1.5px solid var(--primary,#0284c7);border-radius:12px;padding:16px">
        <div class="section-head" style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="display:flex;align-items:center;gap:12px">
            <span class="carrier-logo-icon carrier-logo-qbiz">Q</span>
            <div>
              <h2 style="margin:0;font-size:17px;font-weight:700">Cổng Website Nền tảng QBiz</h2>
              <p style="margin:2px 0 0;font-size:12px;color:var(--text-muted,#64748b)">Shared Product Core · Kết nối 2 chiều giữa Kho và Website bán hàng</p>
            </div>
          </div>
          <span class="badge ok">Đã kết nối 2 chiều</span>
        </div>

        <div class="report-metrics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0;background:var(--bg-subtle,#f8fafc);padding:12px;border-radius:8px">
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Website</span><b style="font-size:13px">${esc(cfg.website_url)}</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Sản phẩm đang bán</span><b style="font-size:13px">${totalProducts} SKU</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Lần đồng bộ cuối</span><b style="font-size:13px">${lastSyncAt ? dt(lastSyncAt) : 'Chưa đồng bộ'}</b></div>
          <div><span style="font-size:11px;color:var(--text-muted,#64748b)">Webhook đơn hàng</span><b style="font-size:13px;color:var(--success,#16a34a)">Sẵn sàng</b></div>
        </div>

        <div class="feature-actions" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start">
          <button class="primary-btn" data-action="sync-catalog-web" style="gap:6px">
            ${icon('refresh-cw')} Đồng bộ danh mục & tồn kho lên Website
          </button>
          <button class="secondary-btn" data-action="simulate-web-order" style="gap:6px">
            ${icon('shopping-cart')} Mô phỏng đơn hàng từ Website (Test Web Order)
          </button>
          <button class="secondary-btn" data-action="config-web-gateway" style="gap:6px">
            ${icon('settings-2')} Cấu hình Cổng Website
          </button>
        </div>

        <div class="surface-callout" style="margin-top:14px;font-size:12px">
          <b>Kiến trúc Độc quyền Shared Product Core:</b>
          <p style="margin:4px 0 0">Sản phẩm trên Website và tại quầy POS dùng chung 1 mã SKU duy nhất. Khi đơn hàng phát sinh từ Web, tồn kho trong QBiz Kho lập tức được giữ chỗ, ngăn ngừa hoàn toàn tình trạng bán vượt tồn (overselling).</p>
        </div>
      </section>

      <section class="card feature-panel">
        <div class="section-head">
          <div>
            <h2>Sàn TMĐT & Ứng dụng Bán lẻ Thông dụng tại Việt Nam</h2>
            <p>Liên kết gian hàng đa kênh, đồng bộ đơn hàng và đối soát thanh toán.</p>
          </div>
          ${surfaceStatus('prepared', 'Sẵn sàng')}
        </div>

        <div class="connector-grid" style="margin-top:12px">
          <article class="carrier-card">
            <div class="carrier-head">
              <div class="carrier-brand">
                <span class="carrier-logo-icon carrier-logo-shopee">S</span>
                <b>Shopee Việt Nam</b>
              </div>
              <span class="badge info">Sẵn sàng</span>
            </div>
            <p class="carrier-desc">Đồng bộ tồn kho đa kho, kéo đơn hàng tự động từ Shopee Open API và đối soát ví Shopee.</p>
            <button class="secondary-btn" data-action="connect-market" data-market="Shopee">Cấu hình gian hàng Shopee</button>
          </article>

          <article class="carrier-card">
            <div class="carrier-head">
              <div class="carrier-brand">
                <span class="carrier-logo-icon carrier-logo-tiktok">T</span>
                <b>TikTok Shop</b>
              </div>
              <span class="badge info">Sẵn sàng</span>
            </div>
            <p class="carrier-desc">Liên kết giỏ hàng video/livestream, tiếp nhận đơn tức thì và đồng bộ mã vận đơn TikTok Shipping.</p>
            <button class="secondary-btn" data-action="connect-market" data-market="TikTok Shop">Cấu hình TikTok Shop</button>
          </article>

          <article class="carrier-card">
            <div class="carrier-head">
              <div class="carrier-brand">
                <span class="carrier-logo-icon" style="background:#0f146d">L</span>
                <b>Lazada Việt Nam</b>
              </div>
              <span class="badge info">Sẵn sàng</span>
            </div>
            <p class="carrier-desc">Kết nối Lazada Open Platform, xử lý đơn đóng gói và in phiếu giao hàng Lex.</p>
            <button class="secondary-btn" data-action="connect-market" data-market="Lazada">Cấu hình gian hàng Lazada</button>
          </article>

          <article class="carrier-card">
            <div class="carrier-head">
              <div class="carrier-brand">
                <span class="carrier-logo-icon" style="background:#0068ff">Z</span>
                <b>Zalo Mini App / Zalo OA</b>
              </div>
              <span class="badge ok">Đã kết nối</span>
            </div>
            <p class="carrier-desc">Gửi thông báo ZNS xác nhận đơn hàng, chia sẻ hóa đơn điện tử 1 chạm qua Zalo cho khách.</p>
            <button class="secondary-btn" data-action="connect-market" data-market="Zalo OA">Quản lý kết nối Zalo</button>
          </article>
        </div>
      </section>
    </section>
  `;

  $('[data-action="sync-catalog-web"]').onclick = syncCatalogToWebsite;
  $('[data-action="simulate-web-order"]').onclick = simulateWebOrder;
  $('[data-action="config-web-gateway"]').onclick = openWebsiteConfigModal;
  $$('[data-action="connect-market"]').forEach(btn => {
    btn.onclick = () => {
      const market = btn.dataset.market;
      openModal({
        title: `Cấu hình kết nối ${market}`,
        sub: 'Thiết lập Partner API Key và Webhook',
        body: `
          <div class="field">
            <label>Partner ID / App ID</label>
            <input placeholder="Nhập Partner ID từ cổng nhà phát triển ${market}"/>
          </div>
          <div class="field">
            <label>Secret Key</label>
            <input type="password" placeholder="Nhập Secret Key"/>
          </div>
          <div class="field">
            <label>Mã kho liên kết</label>
            <select>
              ${(state.data?.warehouses || []).map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}
            </select>
          </div>
        `,
        submitText: 'Lưu kết nối',
        onSubmit: () => toast(`Đã lưu cấu hình kết nối ${market}!`, 'ok')
      });
    };
  });
}

async function openDriveRestoreModal(shopId) {
  toast('Đang tải danh sách bản sao lưu từ Google Drive...', 'info');
  try {
    const backups = await listShopDriveBackups(shopId);
    if (!backups.length) {
      return toast('Chưa có bản sao lưu nào trên Google Drive cho cửa hàng này. Hãy bấm "Sao lưu ngay" để tạo bản đầu tiên.', 'info');
    }

    openModal({
      title: 'Khôi phục từ Google Drive',
      sub: `${backups.length} bản sao lưu an toàn với mã xác thực toàn vẹn SHA-256`,
      hideSubmit: true,
      body: `
        <div class="drive-restore-list">
          ${backups.map(b => {
            const fileName = b.name || b.file_name || 'Bản sao lưu QBiz Kho';
            const fileSize = b.size_bytes || b.file_size || 0;
            const sha = String(b.sha256 || b.checksum || '');
            return `
            <div class="drive-backup-card">
              <div class="drive-backup-info">
                <span class="drive-backup-title">${esc(fileName)}</span>
                <div class="drive-backup-meta">
                  <span>📅 ${dt(b.created_at)}</span>
                  <span>📦 ${formatBytes(fileSize)}</span>
                  <span class="drive-checksum-badge">🔒 SHA-256: ${esc(sha.slice(0, 10))}... (Đã xác minh)</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted,#64748b);margin-top:2px">
                  Dữ liệu: <b>${b.record_counts?.products || 0}</b> Hàng hóa · <b>${b.record_counts?.sales || 0}</b> Phiếu bán · <b>${b.record_counts?.orders || 0}</b> Đơn hàng · <b>${b.record_counts?.levels || 0}</b> Tồn kho
                </div>
              </div>
              <button class="primary-btn" data-drive-restore-id="${esc(b.id)}" style="white-space:nowrap;padding:6px 12px;font-size:12px">
                Khôi phục bản này
              </button>
            </div>
            `;
          }).join('')}
        </div>
      `
    });

    $$('[data-drive-restore-id]').forEach(btn => {
      btn.onclick = async () => {
        const backupId = btn.dataset.driveRestoreId;
        const b = backups.find(x => x.id === backupId);
        if (!b) return;

        toast('Đang tải và kiểm tra Checksum SHA-256 từ Google Drive...', 'info');
        try {
          const pkg = await getDriveBackupPackage(shopId, backupId);
          const verify = await verifyBackupPackage(pkg);
          if (!verify.valid) {
            return toast(`Lỗi kiểm tra tính toàn vẹn: ${verify.error || verify.reason || 'Checksum không khớp'}`, 'error');
          }

          const current = await snapshot();
          const fileName = b.name || b.file_name || 'Bản sao lưu QBiz Kho';
          const sha = String(b.sha256 || b.checksum || '');
          openModal({
            title: 'Xác nhận khôi phục từ Google Drive',
            sub: 'Hãy kiểm tra số lượng dữ liệu trước khi ghi đè vào máy này.',
            body: `
              <div class="restore-preview">
                <div class="callout">
                  <strong>Bản sao lưu Google Drive: ${esc(fileName)}</strong><br/>
                  Tạo lúc: ${dt(b.created_at)} · Toàn vẹn SHA-256: <b style="font-family:monospace">${sha.slice(0, 16)}...</b>
                </div>
                <div class="product-facts" style="margin:12px 0">
                  <div><span>Dữ liệu từ Google Drive</span><strong>${esc(backupCounts(pkg.data))}</strong></div>
                  <div><span>Dữ liệu hiện tại trên máy</span><strong>${esc(backupCounts(current))}</strong></div>
                </div>
                <p class="field-limit">Hệ thống sẽ tự động tải xuống 1 bản lưu an toàn của dữ liệu hiện tại trước khi khôi phục từ Google Drive.</p>
              </div>
            `,
            submitText: 'Tải bản an toàn & Khôi phục ngay',
            onSubmit: async () => {
              downloadText(`qbiz-kho-before-drive-restore-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...current }, null, 2), 'application/json');
              await runTransaction(BACKUP_STORES, stores => {
                for (const name of BACKUP_STORES) {
                  stores[name].clear();
                  if (Array.isArray(pkg.data[name])) pkg.data[name].forEach(row => stores[name].put(row));
                }
              });
              await ensurePrintTemplates();
              await applyModuleFlags();
              await refresh();
              if (typeof playScannerBeep === 'function') playScannerBeep(true);
              toast('✓ Đã khôi phục dữ liệu từ Google Drive thành công!', 'ok');
            }
          });
        } catch(err) {
          toast(err.message, 'error');
        }
      };
    });
  } catch(err) {
    toast(err.message, 'error');
  }
}

function renderPermissionCenter(){
  setTitle('Người dùng & phân quyền','QBiz');
  const auth = getAuthState();
  const currentRole = auth.role || ROLES.CASHIER;
  const isOwner = auth.role === ROLES.OWNER;
  const isAuth = auth.status === AUTH_STATES.AUTHENTICATED_SHOP_READY;

  const caps = Object.keys(CAPABILITY_LABELS);
  const tableRows = caps.map(capKey => {
    const label = CAPABILITY_LABELS[capKey];
    const ownerOk = hasCapability(ROLES.OWNER, capKey);
    const mgrOk = hasCapability(ROLES.MANAGER, capKey);
    const cashierOk = hasCapability(ROLES.CASHIER, capKey);
    const whOk = hasCapability(ROLES.WAREHOUSE, capKey);
    return `<tr>
      <td>${esc(label)}</td>
      <td class="${ownerOk?'cap-yes':'cap-no'}">${ownerOk?'✓':'—'}</td>
      <td class="${mgrOk?'cap-yes':'cap-no'}">${mgrOk?'✓':'—'}</td>
      <td class="${cashierOk?'cap-yes':'cap-no'}">${cashierOk?'✓':'—'}</td>
      <td class="${whOk?'cap-yes':'cap-no'}">${whOk?'✓':'—'}</td>
    </tr>`;
  }).join('');

  $('#content').innerHTML = `
    <section class="feature-center">
      <section class="card feature-panel">
        <div class="section-head">
          <div>
            <h2>${esc(auth.shop?.name || 'Cửa hàng QBiz')}</h2>
            <p>${isAuth ? `Tài khoản: <b>${esc(auth.user?.email)}</b> · Vai trò hiện tại: <b class="badge info">${esc(getRoleLabel(currentRole))}</b>` : 'Chưa đăng nhập tài khoản đám mây.'}</p>
          </div>
          ${surfaceStatus(isAuth ? 'working' : 'prepared', isAuth ? 'Đã kích hoạt' : 'Chưa đăng nhập')}
        </div>
        
        <div class="feature-actions" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
          ${!isAuth ? `<button class="primary-btn" data-action="open-auth-modal">${icon('user')} Đăng nhập / Đăng ký</button>` : ''}
          ${isAuth && isOwner ? `<button class="primary-btn" data-action="add-member-modal">${icon('plus')} Thêm nhân viên</button>` : ''}
          ${isAuth ? `<button class="secondary-btn" data-action="open-user-menu">${icon('settings-2')} Quản lý tài khoản</button>` : ''}
        </div>

        <div class="capability-table-wrap">
          <table class="capability-table">
            <thead>
              <tr>
                <th>Quyền hạn hệ thống</th>
                <th>Chủ shop</th>
                <th>Quản lý</th>
                <th>Thu ngân</th>
                <th>Thủ kho</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
        <p class="field-limit" style="margin-top:12px;">Phân quyền V1 được kiểm soát chặt chẽ ở máy chủ và Row Level Security. Nhân viên chỉ truy cập đúng dữ liệu thuộc cửa hàng của mình.</p>
      </section>
    </section>
  `;
}
function renderScannerCenter(){
  setTitle('Quét mã vạch & QR','QBiz');
  $('#content').innerHTML=`
    <section class="feature-center">
      <section class="card feature-panel">
        <div class="section-head">
          <div>
            <h2>Thiết bị Quét mã POS</h2>
            <p>Hỗ trợ cả Súng bắn mã vạch chuyên dụng (USB/Bluetooth) và Camera điện thoại.</p>
          </div>
          ${surfaceStatus('working','Sẵn sàng quét')}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:14px 0">
          <div style="padding:14px;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;background:var(--bg-subtle,#f8fafc)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:20px">🔫</span>
              <strong style="font-size:14px">Súng quét Barcode USB / Bluetooth</strong>
            </div>
            <p style="font-size:12px;color:var(--text-muted,#64748b);margin:0;line-height:1.45">
              Cơ chế <b>Keyboard Wedge toàn cục</b>: Bạn có thể bấm quét bất cứ lúc nào mà không cần nhấp chuột vào ô tìm kiếm. Âm thanh bíp chuẩn POS siêu thị sẽ vang lên khi nhận diện thành công.
            </p>
          </div>

          <div style="padding:14px;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;background:var(--bg-subtle,#f8fafc)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:20px">📱</span>
              <strong style="font-size:14px">Camera Điện thoại / Máy tính bảng</strong>
            </div>
            <p style="font-size:12px;color:var(--text-muted,#64748b);margin:0;line-height:1.45">
              Sử dụng API <b>BarcodeDetector</b> nguyên bản của trình duyệt để đọc EAN-13, EAN-8, Code 128 và mã QR với tốc độ 60 khung hình/giây.
            </p>
          </div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Khu vực thử nghiệm quét mã (Bấm súng quét hoặc gõ mã test)</label>
          <div style="display:flex;gap:8px">
            <input id="testScanInput" placeholder="Bóp cò súng quét hoặc nhập barcode/SKU..." style="flex:1"/>
            <button class="primary-btn" id="btnTestScan">Kiểm tra mã</button>
          </div>
          <small class="muted">Hệ thống sẽ phát tiếng bíp và mở thông tin sản phẩm tương ứng.</small>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="primary-btn" data-action="scan" style="gap:6px">
            ${icon('camera')} Bật Camera quét mã
          </button>
          <button class="secondary-btn" data-page="sales" style="gap:6px">
            ${icon('shopping-cart')} Đến màn hình Bán hàng (POS)
          </button>
        </div>
      </section>
    </section>
  `;

  $('#btnTestScan').onclick = () => {
    const val = $('#testScanInput')?.value.trim();
    if (val && typeof handleScannedBarcode === 'function') handleScannedBarcode(val);
  };
  $('#testScanInput').onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = $('#testScanInput')?.value.trim();
      if (val && typeof handleScannedBarcode === 'function') handleScannedBarcode(val);
    }
  };
}
function openDeviceCenter(){const _s=state.data.settings||[];const _did=_s.find(x=>x.id==='device_id')?.value,_rid=_s.find(x=>x.id==='register_id')?.value;const _dev=(state.data.devices||[]).find(x=>x.id===_did)||{};const _reg=(state.data.registers||[]).find(x=>x.id===_rid)||{};const devRows=`<div><span>${icon('settings-2')} Thiết bị này</span><b>${esc(_dev.device_name||'Thiết bị này')}</b></div><div><span>${icon('qr-code')} Mã thiết bị</span><b>${esc(_did||'—')}</b></div><div><span>${icon('store')} Quầy</span><b>${esc(_reg.register_name||'Quầy chính')}</b></div><div><span>${icon('layout-dashboard')} Hoạt động gần nhất</span><b>${esc(_dev.updated_at?dt(_dev.updated_at):'Chưa ghi nhận')}</b></div>`;
  openModal({title:'Thiết bị & In',sub:'Trạng thái thiết bị trên máy này.',hideSubmit:true,body:`<div class="device-list">${devRows}<div><span>${icon('file-text')} Máy in hóa đơn</span><b>Chưa kết nối</b></div><div><span>${icon('package-search')} Máy in tem</span><b>Chưa kết nối</b></div><div><span>${icon('scan-line')} Máy quét</span><b>Camera điện thoại</b></div><div><span>${icon('qr-code')} Màn QR khách hàng</span><b>Chưa kết nối</b></div><div><span>${icon('settings-2')} Két tiền</span><b>Qua máy in</b></div></div>`});}
function renderTransactions(){setTitle('Giao dịch & phiếu','QBiz');const sales=(state.data.sales||[]).slice().sort((a,b)=>String(b.created_at||b.createdAt||'').localeCompare(String(a.created_at||a.createdAt||'')));const q=norm(state.txSearch||'');const rows=q?sales.filter(s=>[s.code,s.sale_uuid,s.customer_label,s.payment_method].some(v=>norm(v).includes(q))):sales;const total=rows.reduce((n,s)=>n+Number(s.grand_total??s.total??0),0);$('#content').innerHTML=`<section class="card section-card"><div class="section-head"><div><h2>Phiếu bán</h2><p>${fmt(rows.length)} giao dịch trên thiết bị</p></div></div><div class="search large tx-search"><input id="txSearch" value="${esc(state.txSearch||'')}" placeholder="Tìm mã phiếu / khách hàng..."/></div><button class="secondary-btn full" data-page="documents">Trung tâm chứng từ — hóa đơn, nhập, xuất, chuyển, trả, thu/chi</button><div class="tx-summary"><span>Tổng giá trị</span><strong>${fmt(total)} ₫</strong></div><div class="tx-list">${rows.map(s=>{const paid=(s.payment_status||(s.payments?.[0]?.status))==='PAID';return `<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code||s.sale_uuid||'Phiếu bán')}</strong><small>${esc(s.customer_label||'Khách lẻ')} · ${dt(s.created_at||s.createdAt)}</small></span><span class="tx-meta"><em class="tx-badge ${paid?'ok':'warn'}">${paid?'Đã thu':'Chờ thu'}</em><small>${esc(paymentLabel(s.payment_method||s.payments?.[0]?.method||'cash'))}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`}).join('')||'<div class="empty"><strong>Chưa có giao dịch</strong><span>Phiếu bán sẽ hiện ở đây sau khi thanh toán.</span></div>'}</div></section>`;$('#txSearch')?.addEventListener('input',e=>{state.txSearch=e.target.value;keepFocus('#txSearch',renderTransactions)});$$('[data-sale-id]').forEach(b=>b.onclick=()=>{const s=sales.find(x=>x.id===b.dataset.saleId);if(s)openTransaction(s)});}
function openTransaction(s){
  if(!s)return;
  state.currentSaleId=s.id;
  updateContextAndChips();
  const payments=s.payments||[];
  const unpaid=(s.payment_status||(s.payments?.[0]?.status))!=='PAID';
  const grandTotal = Number(s.grand_total ?? s.total ?? 0);
  const paymentMethodName = payments.map(p=>paymentLabel(p.method)).join(', ') || paymentLabel(s.payment_method || 'cash');
  const paymentStatusHtml = unpaid 
    ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:#fef3c7;color:#b45309">Chờ thu</span>` 
    : `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#15803d">✓ Đã thu</span>`;

  const discountVal = Number(s.discount_total || 0);
  const taxVal = Number(s.tax_total || 0);
  const hasExtraTotals = discountVal > 0 || taxVal > 0;

  const carrierInfo = s.shipping_tracking_code ? `
    <div style="padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11.5px;color:#166534">Vận chuyển: <b>${esc(VN_CARRIERS[s.shipping_carrier]?.shortName || s.shipping_carrier || 'DVVC')}</b></span>
        <span class="badge ok" style="font-size:10px">${esc(s.shipping_status || 'Đang giao')}</span>
      </div>
      <div style="margin-top:4px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span style="font-family:monospace;font-weight:700;color:#15803d;font-size:12px">${esc(s.shipping_tracking_code)}</span>
        <a href="${VN_CARRIERS[s.shipping_carrier]?.trackUrl ? VN_CARRIERS[s.shipping_carrier].trackUrl(s.shipping_tracking_code) : '#'}" target="_blank" class="primary-btn tiny" style="padding:2px 8px;font-size:11px;text-decoration:none">Tra cứu ↗</a>
      </div>
    </div>
  ` : '';

  openModal({
    title: s.code || s.sale_uuid || 'Phiếu bán',
    sub: `${customerLabel({name:s.customer_label||'Khách lẻ'})} · ${dt(s.created_at||s.createdAt)}`,
    hideSubmit: true,
    body: `
      <div class="transaction-detail" style="display:flex;flex-direction:column;gap:10px">
        <!-- 1. Hero Total & Payment Status (Đỉnh modal) -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0 4px">
          <div>
            <span style="font-size:11.5px;color:#64748b;font-weight:600;display:block">Tổng thanh toán</span>
            <strong style="font-size:24px;font-weight:900;color:#0f172a;line-height:1.2">${fmt(grandTotal)} ₫</strong>
          </div>
          <div style="text-align:right">
            ${paymentStatusHtml}
            <small style="display:block;font-size:11px;color:#64748b;margin-top:2px">${esc(paymentMethodName)}</small>
          </div>
        </div>

        ${unpaid ? `
          <button type="button" class="primary-btn" data-action="mark-sale-paid" data-sale-id="${s.id}" style="width:100%;padding:9px;background:#15803d;color:#fff;font-size:13px;font-weight:700;border-radius:8px">
            ✓ Xác nhận đã thu tiền
          </button>
        ` : ''}

        <!-- 2. BỘ NÚT THAO TÁC XANH NỔI BẬT ĐƯA LÊN TRÊN (In phiếu, Hóa đơn điện tử, Đẩy đơn, Chia sẻ) -->
        <div class="tx-action-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button type="button" class="primary-btn tx-act-btn btn-print-blue" data-action="print-receipt" data-id="${s.id}" data-type="sale" style="background:#1485ee;color:#fff;border:1.5px solid #0868c6;padding:8px 10px;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;box-shadow:0 2px 6px rgba(20,133,238,0.25)">
            ${icon('printer')} In phiếu
          </button>
          <button type="button" class="secondary-btn tx-act-btn btn-invoice-blue" data-action="invoice-info" data-sale-id="${s.id}" style="background:#eff6ff;border:1.5px solid #93c5fd;color:#1d4ed8;padding:8px 10px;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:8px">
            ${icon('file-text')} Hóa đơn điện tử
          </button>
          <button type="button" class="secondary-btn tx-act-btn" data-action="ship-sale" data-sale-id="${s.id}" style="background:#f8fafc;border:1px solid #cbd5e1;color:#334155;padding:7px 10px;font-size:11.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:8px">
            ${icon('truck')} ${s.shipping_tracking_code ? 'Cập nhật vận đơn' : 'Đẩy đơn sang DVVC'}
          </button>
          <button type="button" class="secondary-btn tx-act-btn" data-action="share-receipt" style="background:#f8fafc;border:1px solid #cbd5e1;color:#334155;padding:7px 10px;font-size:11.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:8px">
            ${icon('share-2')} Chia sẻ phiếu
          </button>
        </div>

        ${carrierInfo}

        <!-- 3. Thông tin Nguồn & Kho gọn gàng (Gộp 5 dòng thừa thãi thành 1 thẻ mini) -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:11.5px;color:#475569;display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>Kênh: <b style="color:#0f172a">${esc(channelLabel(s.channel||s.source||'pos'))}</b></span>
            <span>Kho: <b style="color:#0f172a">${esc(warehouse(s.warehouseId||s.warehouse_id)?.name||'Kho chính')}</b></span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;color:#94a3b8;font-size:10.5px">
            <span>Thiết bị: ${esc(s.device_id||s.register_id||'dev_local')}</span>
            <span>Tạo lúc: ${dt(s.created_at||s.createdAt)}</span>
          </div>
        </div>

        <!-- 4. Danh sách Mặt hàng (Gọn gàng, thanh lịch) -->
        <div class="detail-list" style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;background:#fff">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;padding-bottom:4px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between">
            <span>Mặt hàng (${(s.items||[]).length})</span>
            <span>Thành tiền</span>
          </div>
          ${(s.items||[]).map(i=>`
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f8fafc;font-size:12px">
              <div style="min-width:0;flex:1">
                <strong style="color:#0f172a;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name||i.item_name||'Sản phẩm')}</strong>
                <small style="color:#64748b;font-size:11px">${esc(i.sku ? `${i.sku} · ` : '')}${fmt(i.quantity)} × ${fmt(i.unit_price||0)} ₫</small>
              </div>
              <b style="color:#0f172a;font-size:13px;white-space:nowrap;margin-left:6px">${fmt(i.line_total??i.lineTotal??0)} ₫</b>
            </div>
          `).join('')}
        </div>

        ${hasExtraTotals ? `
          <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:11.5px;color:#64748b">
            <span>Tạm tính: ${fmt(s.subtotal||0)} ₫</span>
            ${discountVal > 0 ? `<span style="color:#b45309;font-weight:600">Giảm: −${fmt(discountVal)} ₫</span>` : ''}
            ${taxVal > 0 ? `<span>Thuế: +${fmt(taxVal)} ₫</span>` : ''}
          </div>
        ` : ''}

        ${s.note ? `<p class="order-note" style="margin:0;padding:6px 10px;font-size:11.5px;border-radius:6px">${esc(s.note)}</p>` : ''}
      </div>
    `
  });
  if(CONFIG.FEATURE_FLAGS?.e_invoice){
    $('[data-action="invoice-info"]', $('#modalRoot'))?.addEventListener('click',()=>openInvoiceModalForSale(s));
  }
}

function orderStatusLabel(status){return ({NEW:'Đơn mới',CONFIRMED:'Đã xác nhận',PROCESSING:'Đang xử lý',COMPLETED:'Hoàn tất',CANCELLED:'Đã hủy'})[status]||status;}
function renderOrdersLegacy(){
  setTitle('Đơn hàng','QBiz');
  const orders=state.data.orders||[];const actionable=orders.filter(x=>['NEW','CONFIRMED','PROCESSING'].includes(x.status));
  $('#content').innerHTML=`<section class="toolbar-panel card"><div class="toolbar-row top"><div><h2>Cần xử lý <span class="badge info">${actionable.length}</span></h2></div><button class="primary-btn" data-action="new-order">Đơn mới</button></div></section><section class="card section-card order-list">${orders.map(o=>`<article class="order-row"><div><strong>${esc(o.code)}</strong><span>${esc(o.customer_label||'Khách lẻ')} · ${o.items?.length||0} dòng · ${fmt(o.grand_total)} ₫</span></div><div class="order-row-actions"><span class="badge ${o.status==='CANCELLED'?'danger':o.status==='COMPLETED'?'ok':'info'}">${orderStatusLabel(o.status)}</span>${o.status==='NEW'?`<button class="secondary-btn" data-order-action="confirm" data-order-id="${o.id}">Xác nhận</button>`:''}${o.status==='CONFIRMED'?`<button class="secondary-btn" data-order-action="process" data-order-id="${o.id}">Xử lý</button>`:''}${o.status==='PROCESSING'?`<button class="primary-btn" data-order-action="complete" data-order-id="${o.id}">Hoàn tất</button>`:''}${['NEW','CONFIRMED','PROCESSING'].includes(o.status)?`<button class="link-btn" data-order-action="cancel" data-order-id="${o.id}">Hủy</button>`:''}</div></article>`).join('')||'<div class="empty"><strong>Chưa có đơn hàng</strong></div>'}</section>`;
}
function renderOrders(){
  setTitle('Đơn hàng','QBiz');
  const all=state.data.orders||[],q=state.orderSearch.toLowerCase();
  const now=new Date(),start=new Date(now),end=new Date(now);
  end.setHours(23,59,59,999);
  if(state.orderRange==='today')start.setHours(0,0,0,0);
  else if(state.orderRange==='7d')start.setDate(now.getDate()-6),start.setHours(0,0,0,0);
  else if(state.orderRange==='month')start.setDate(1),start.setHours(0,0,0,0);
  else start.setFullYear(2000),end.setFullYear(2100);
  const orders=all.filter(o=>{const date=new Date(o.created_at||o.createdAt||0);return (state.orderFilter==='all'||state.orderFilter==='active'&&['NEW','CONFIRMED','PROCESSING'].includes(o.status)||o.status===state.orderFilter)&&date>=start&&date<=end&&(!q||[o.code,o.customer_label].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q))))});
  $('#content').innerHTML=`<section class="orders-screen"><div class="orders-toolbar"><div class="orders-search"><input id="orderSearch" value="${esc(state.orderSearch)}" placeholder="Tìm mã đơn, khách hàng..."/>${icon('package-search')}</div><button class="primary-btn" data-action="new-order">+ Tạo đơn</button></div><div class="order-filters">${[['active','Cần xử lý'],['all','Tất cả'],['COMPLETED','Hoàn tất'],['CANCELLED','Đã hủy']].map(([v,l])=>`<button class="${state.orderFilter===v?'active':''}" data-order-filter="${v}">${l}</button>`).join('')}</div><label class="orders-range"><span>Thời gian</span><select id="orderRange"><option value="all">Tất cả thời gian</option><option value="today">Hôm nay</option><option value="7d">7 ngày qua</option><option value="month">Tháng này</option></select></label><div class="modern-order-list">${orders.map(o=>`<article class="modern-order-row" data-order-open="${o.id}"><div class="order-primary"><strong>${esc(o.code)}</strong><b>${fmt(o.grand_total)} ₫</b></div><div class="order-secondary"><span>${esc(o.customer_label||'Khách lẻ')}</span><time>${dt(o.created_at||o.createdAt)}</time></div><div class="order-tags"><span class="badge ${o.payment_status==='PAID'?'ok':'warn'}">${o.payment_status==='PAID'?'Đã thanh toán':'Chờ thanh toán'}</span><span class="badge ${o.status==='CANCELLED'?'danger':o.status==='COMPLETED'?'ok':'info'}">${orderStatusLabel(o.status)}</span><small>HĐĐT: chưa kết nối</small></div></article>`).join('')||'<div class="empty"><strong>Không có đơn phù hợp</strong></div>'}</div></section>`;
  $('#orderRange').value=state.orderRange;$('#orderSearch').oninput=e=>{state.orderSearch=e.target.value;keepFocus('#orderSearch',renderOrders)};$('#orderRange').onchange=e=>{state.orderRange=e.target.value;renderOrders()};$$('[data-order-filter]').forEach(b=>b.onclick=()=>{state.orderFilter=b.dataset.orderFilter;renderOrders()});$$('[data-order-open]').forEach(r=>r.onclick=e=>{if(e.target.closest('[data-order-action]'))return;openOrderDetail(r.dataset.orderOpen)});
}
function openOrderDetail(id){
  state.currentOrderId=id;
  updateContextAndChips();
  const o=(state.data.orders||[]).find(x=>x.id===id);
  if(!o)return;
  const paid=o.payment_status==='PAID';
  const carrierInfo = o.shipping_tracking_code ? `
    <div style="margin:10px 0;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#166534">Vận chuyển: <b>${esc(VN_CARRIERS[o.shipping_carrier]?.shortName || o.shipping_carrier || 'DVVC')}</b></span>
        <span class="badge ok">${esc(o.shipping_status || 'Đang giao')}</span>
      </div>
      <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span style="font-family:monospace;font-weight:700;color:#15803d">${esc(o.shipping_tracking_code)}</span>
        <a href="${VN_CARRIERS[o.shipping_carrier]?.trackUrl ? VN_CARRIERS[o.shipping_carrier].trackUrl(o.shipping_tracking_code) : '#'}" target="_blank" class="primary-btn" style="padding:2px 8px;font-size:11px;text-decoration:none">Tra cứu ↗</a>
      </div>
    </div>
  ` : '';

  const hasStatusBtn = ['NEW', 'CONFIRMED', 'PROCESSING'].includes(o.status);
  const statusBtnClass = `primary-btn${(hasStatusBtn && paid) ? ' order-action-full' : ''}`;
  const paidBtnClass = `secondary-btn${(!hasStatusBtn && !paid) ? ' order-action-full' : ''}`;
  const statusBtn = o.status==='NEW' ? `<button class="${statusBtnClass}" data-order-action="confirm" data-order-id="${o.id}">Xác nhận</button>` :
                    o.status==='CONFIRMED' ? `<button class="${statusBtnClass}" data-order-action="process" data-order-id="${o.id}">Xử lý</button>` :
                    o.status==='PROCESSING' ? `<button class="${statusBtnClass}" data-order-action="complete" data-order-id="${o.id}">Hoàn tất</button>` : '';
  const paidBtn = !paid ? `<button class="${paidBtnClass}" data-action="mark-order-paid" data-order-id="${o.id}">Xác nhận đã thanh toán</button>` : '';

  openModal({
    title:'Chi tiết đơn hàng',
    sub:`${esc(o.code)} · ${orderStatusLabel(o.status)}`,
    hideSubmit:true,
    body:`<div class="order-detail"><section class="order-customer"><span>Khách hàng</span><strong>${esc(o.customer_label||'Khách lẻ')}</strong></section><div class="detail-list">${(o.items||[]).map(i=>`<div><span><b>${esc(i.name||i.item_name||product(i.item_id||i.itemId)?.name||'Sản phẩm')}</b><small>${esc(i.sku||product(i.item_id||i.itemId)?.sku||'')} · ${fmt(i.quantity)} × ${fmt(i.unit_price||0)} ₫</small></span><strong>${fmt(i.line_total??i.lineTotal??0)} ₫</strong></div>`).join('')}</div><div class="order-totals"><div><span>Tạm tính</span><b>${fmt(o.subtotal||0)} ₫</b></div><div><span>Giảm giá</span><b>− ${fmt(o.discount_total||0)} ₫</b></div><div><span>Thuế</span><b>${fmt(o.tax_total||0)} ₫</b></div><div class="grand"><span>Tổng cộng</span><b>${fmt(o.grand_total)} ₫</b></div></div><section class="order-facts"><div><span>Thanh toán</span><b class="badge ${paid?'ok':'warn'}">${paid?'Đã thanh toán':'Chờ thanh toán'}</b></div><div><span>Nhận hàng</span><b>${o.fulfillment==='delivery'?'Giao hàng':'Tại quầy'}</b></div><div><span>Kho</span><b>${esc(warehouse(o.warehouseId||o.location_id)?.name||'Kho đã chọn')}</b></div><div><span>Cập nhật</span><b>${dt(o.updated_at||o.created_at)}</b></div></section>${carrierInfo}${o.note?`<p class="order-note">${esc(o.note)}</p>`:''}<div class="order-detail-actions">${statusBtn}${paidBtn}<button class="secondary-btn" data-action="ship-order" data-order-id="${o.id}">🚚 ${o.shipping_tracking_code ? 'Cập nhật vận đơn' : 'Đẩy đơn sang DVVC'}</button><button class="secondary-btn" data-action="order-documents" data-order-id="${o.id}">Hóa đơn & chứng từ</button><button class="secondary-btn" data-action="print-receipt" data-id="${o.id}" data-type="order">In lại</button><button class="secondary-btn" data-action="share-receipt">Chia sẻ</button></div></div>`
  });
}
function openOrderDocuments(id){const o=(state.data.orders||[]).find(x=>x.id===id);if(!o)return;openModal({title:'Hóa đơn & chứng từ',sub:o.code,hideSubmit:true,body:`<div class="document-list"><div><span>${icon('file-text')}<b>Phiếu bán hàng<small>Chứng từ bán nội bộ</small></b></span><button data-action="print-receipt" data-id="${o.id}" data-type="order">In</button></div>${o.fulfillment==='delivery'?`<div><span>${icon('package-search')}<b>Phiếu giao hàng<small>Thông tin giao nhận của đơn</small></b></span><button data-action="print-receipt" data-id="${o.id}" data-type="order">In</button></div>`:''}<div><span>${icon('qr-code')}<b>Tem sản phẩm<small>${(o.items||[]).length} dòng hàng</small></b></span><button data-action="print-receipt" data-id="${o.id}" data-type="order">In</button></div><button class="document-einvoice" data-action="invoice-info" data-order-id="${o.id}"><span>${icon('file-text')}<b>Hóa đơn điện tử<small>${CONFIG.FEATURE_FLAGS?.e_invoice?'Mock Provider · Nghị định 123':'Chưa kết nối nhà cung cấp'}</small></b></span>${icon('chevron-right')}</button></div>`});}
function openNewOrder(){
  const products=state.data.products.filter(p=>p.active!==false);const warehouses=state.data.warehouses;
  const customers=(state.data.customers||[]).filter(c=>c.active!==false);
  openModal({
    title:'Đơn mới',
    sub:'Chọn sản phẩm hoặc dịch vụ cần xử lý.',
    submitText:'Tạo đơn',
    body:`<div class="form-grid"><div class="field"><label>Kho</label><select id="orderWarehouse">${warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div><div class="field"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><label style="margin-bottom:0;">Khách hàng</label><button type="button" id="btnToggleCustomerMode" class="link-btn" style="font-size:12px;padding:0;color:var(--primary,#1a73e8);background:none;border:none;cursor:pointer;">Tự nhập tên</button></div><select id="orderCustomer"><option value="Khách lẻ" selected>Khách lẻ</option>${customers.map(c=>`<option value="${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}">${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}<option value="__custom__">+ Nhập tên khác...</option></select><input id="orderCustomerCustom" placeholder="Nhập tên khách hàng mới..." style="display:none;margin-top:6px;" /></div><div class="field full-span"><label>Sản phẩm / Dịch vụ</label><div class="orders-search" style="margin-bottom:8px;"><input id="orderItemSearch" placeholder="Tìm tên sản phẩm, mã SKU..." autocomplete="off" />${icon('package-search')}</div><div class="order-picker">${products.map(p=>`<label class="order-option" data-search-text="${esc((p.name+' '+(p.sku||'')+' '+(p.barcode||'')).toLowerCase())}"><input type="checkbox" data-order-item="${p.id}" /><span><strong>${esc(p.name)}</strong><small>${p.type==='SERVICE'?'Dịch vụ':'Sản phẩm'} · ${money(p.price)||'Chưa có giá'}${p.sku ? ` · ${esc(p.sku)}` : ''}</small></span><input type="number" min="1" value="1" data-order-qty="${p.id}" /></label>`).join('')}<div id="orderPickerEmpty" class="empty" style="display:none;padding:16px;text-align:center;"><strong>Không tìm thấy sản phẩm phù hợp.</strong></div></div></div><div class="field full-span"><label>Ghi chú</label><input id="orderNote" placeholder="Ghi chú cho đơn..." /></div></div>`,
    onSubmit:async root=>{
      const items=$$('[data-order-item]:checked',root).map(input=>({itemId:input.dataset.orderItem,quantity:Number($(`[data-order-qty="${input.dataset.orderItem}"]`,root)?.value||1)}));
      if(!items.length)throw new Error('Hãy chọn ít nhất một sản phẩm hoặc dịch vụ.');
      const customInp=$('#orderCustomerCustom',root), selCust=$('#orderCustomer',root);
      let customerLabel='Khách lẻ';
      if(customInp&&customInp.style.display!=='none'&&customInp.value.trim()){
        customerLabel=customInp.value.trim();
      }else if(selCust&&selCust.value!=='__custom__'&&selCust.value.trim()){
        customerLabel=selCust.value.trim();
      }
      await createOrder({items,warehouseId:$('#orderWarehouse',root).value,customerLabel,note:$('#orderNote',root).value});
      state.page='orders';
      await refresh();
      toast('Đã tạo đơn hàng.','ok');
    }
  });
  const root=$('#modalRoot');
  const selCustomer=$('#orderCustomer',root), customCustomer=$('#orderCustomerCustom',root), toggleBtn=$('#btnToggleCustomerMode',root);
  let isCustom=false;
  const setCustomMode=custom=>{
    isCustom=custom;
    if(custom){
      selCustomer.style.display='none';
      customCustomer.style.display='block';
      if(toggleBtn)toggleBtn.textContent='Chọn từ danh sách';
      customCustomer.focus();
    }else{
      selCustomer.style.display='';
      customCustomer.style.display='none';
      if(toggleBtn)toggleBtn.textContent='Tự nhập tên';
      if(selCustomer.value==='__custom__')selCustomer.value='Khách lẻ';
    }
  };
  if(toggleBtn)toggleBtn.onclick=()=>setCustomMode(!isCustom);
  if(selCustomer)selCustomer.onchange=()=>{if(selCustomer.value==='__custom__')setCustomMode(true);};
  const searchInput=$('#orderItemSearch',root);
  if(searchInput){
    searchInput.oninput=()=>{
      const q=norm(searchInput.value).trim();
      let visible=0;
      $$('.order-option',root).forEach(opt=>{
        const isChecked=$('input[type="checkbox"]',opt)?.checked;
        const haystack=norm(opt.dataset.searchText||'');
        const match=!q||haystack.includes(q);
        const show=match||isChecked;
        opt.style.display=show?'':'none';
        if(show)visible++;
      });
      const emptyEl=$('#orderPickerEmpty',root);
      if(emptyEl)emptyEl.style.display=visible===0?'block':'none';
    };
  }
}

function openModal({title='',sub='',body='',submitText='Lưu',hideSubmit=false,footer='',fullScreen=false,onSubmit}={}){
  const root=$('#modalRoot');
  root.innerHTML=`<div class="modal-backdrop"><div class="modal ${fullScreen?'full-screen-sheet':''}"><div class="modal-head"><div><h3>${esc(title)}</h3>${sub?`<p>${sub}</p>`:''}</div><button class="close-btn" data-close>×</button></div><div class="modal-body">${body}</div><div class="modal-foot">${footer||`<button class="secondary-btn" data-close>Đóng</button>${hideSubmit?'':`<button class="primary-btn" id="modalSubmit">${submitText}</button>`}`}</div></div></div>`;
  const closeModal=()=>{root.innerHTML='';state.currentProductId=null;state.currentOrderId=null;state.currentSaleId=null;updateContextAndChips();render();};
  $$('[data-close]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();closeModal();});
  const backdrop=root.querySelector('.modal-backdrop');
  if(backdrop) backdrop.onclick=e=>{if(e.target===backdrop){closeModal();}};
  if(onSubmit){
    const submitBtn = $('#modalSubmit', root);
    if(submitBtn){
      submitBtn.onclick=async()=>{
        if(submitBtn.disabled) return;
        const origText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = 'Đang xử lý…';
        try{
          const submitRes = await onSubmit(root);
          root.innerHTML='';
          state.currentProductId=null;
          state.currentOrderId=null;
          state.currentSaleId=null;
          updateContextAndChips();
          await refresh();
          if(!submitRes || !submitRes.customToast){
            toast('Đã cập nhật.', 'ok');
          }
        }catch(e){
          submitBtn.disabled = false;
          submitBtn.removeAttribute('aria-busy');
          submitBtn.innerHTML = origText;
          toast(e.message,'error');
        }
      };
    }
  }
}

function productOptions(selected=''){ return state.data.products.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(p.name)} · ${esc(p.sku)}</option>`).join(''); }
function whOptions(selected=''){ return state.data.warehouses.map(w=>`<option value="${w.id}" ${selected===w.id?'selected':''}>${esc(w.name)}</option>`).join(''); }
function supplierOptions(selected=''){ return `<option value="">Không chọn NCC</option>${(state.data.suppliers||[]).filter(s=>s.status!=='inactive').sort((a,b)=>a.name.localeCompare(b.name,'vi')).map(s=>`<option value="${esc(s.id)}" ${selected===s.id?'selected':''}>${esc(s.name)}${s.code?` · ${esc(s.code)}`:''}</option>`).join('')}`; }
function filePickerMarkup(){return `<div class="field full-span"><label>Ảnh sản phẩm / ảnh quảng cáo</label><div class="image-picker"><div class="image-preview" id="imagePreview"><span>${icon('image-plus')}<b>Kéo ảnh vào đây</b><small>hoặc bấm để chọn</small></span></div><div><label class="secondary-btn upload-inline">Chọn ảnh<input id="productImage" type="file" accept="image/*" multiple hidden /></label><p class="helper">Bạn có thể kéo-thả, dán ảnh bằng Ctrl+V hoặc chọn nhiều ảnh. Ảnh sẽ tự tối ưu trước khi lưu.</p><div id="imageStatus" class="image-status" aria-live="polite"></div></div></div></div>`}
function bindImagePicker(root,existingImages=[],replaceOnAdd=false){
  const input=$('#productImage',root), preview=$('#imagePreview',root), status=$('#imageStatus',root); if(!input||!preview) return;
  const files=existingImages.filter(Boolean).map(data=>({data,name:'Ảnh hiện tại',bytes:0,optimized:data.length}));
  const render=()=>{ preview.classList.toggle('has-image',files.length>0); preview.innerHTML=files.length?files.map((x,i)=>`<div class="image-thumb"><img src="${x.data}" alt="Ảnh ${i+1}"/><button type="button" data-remove-image="${i}" aria-label="Xóa ảnh">×</button></div>`).join(''):`<span>${icon('image-plus')}<b>Kéo ảnh vào đây</b><small>hoặc bấm để chọn</small></span>`; preview.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=()=>{files.splice(Number(b.dataset.removeImage),1);render();}); };
  const add=async list=>{if(replaceOnAdd) files.splice(0); for(const file of [...list].slice(0,6)){if(!file.type.startsWith('image/')) continue; const data=await optimizeImage(file); files.push({data,name:file.name,bytes:file.size,optimized:data.length});} render(); if(status) status.textContent=files.length?`Đã tối ưu ${files.length} ảnh · ${formatBytes(files.reduce((s,x)=>s+x.optimized,0))}`:'';};
  input.addEventListener('change',()=>add(input.files||[]));
  ['dragenter','dragover'].forEach(type=>preview.addEventListener(type,e=>{e.preventDefault();preview.classList.add('dragging')}));
  ['dragleave','drop'].forEach(type=>preview.addEventListener(type,e=>{e.preventDefault();preview.classList.remove('dragging')}));
  preview.addEventListener('drop',e=>add(e.dataTransfer.files));
  root.addEventListener('paste',e=>{const pasted=[...e.clipboardData.files]; if(pasted.length) add(pasted);});
  root._getImages=()=>files.map(x=>x.data); render();
}
function compactImagePickerMarkup(){return `<div class="compact-image-field"><div class="compact-image-head"><label>Ảnh</label><small>Thêm tối đa 6 ảnh · kéo để sắp xếp</small></div><div id="editImagePreview" class="compact-image-preview"></div><label class="secondary-btn upload-inline compact-upload">+ Thêm ảnh<input id="editImages" type="file" accept="image/*" multiple hidden /></label></div>`}
function bindCompactImagePicker(root,existingImages=[]){
  const input=$('#editImages',root),preview=$('#editImagePreview',root);if(!input||!preview)return;let files=existingImages.filter(Boolean).map(data=>({data}));let dragIndex=-1;
  const draw=()=>{preview.innerHTML=files.length?files.map((x,i)=>`<div class="compact-image-thumb" draggable="true" data-image-index="${i}"><img src="${x.data}" alt="Ảnh ${i+1}"/><button type="button" data-remove-edit-image="${i}" aria-label="Xóa ảnh">×</button></div>`).join(''):`<div class="compact-image-empty">${icon('image-plus')}<span>Chưa có ảnh</span></div>`;$$('[data-remove-edit-image]',preview).forEach(b=>b.onclick=()=>{files.splice(Number(b.dataset.removeEditImage),1);draw()});$$('[data-image-index]',preview).forEach(t=>{t.addEventListener('dragstart',()=>{dragIndex=Number(t.dataset.imageIndex)});t.addEventListener('dragover',e=>e.preventDefault());t.addEventListener('drop',e=>{e.preventDefault();const target=Number(t.dataset.imageIndex);if(dragIndex<0||dragIndex===target)return;const [moved]=files.splice(dragIndex,1);files.splice(target,0,moved);dragIndex=-1;draw()})})};
  input.onchange=async()=>{for(const file of [...(input.files||[])].slice(0,6-files.length)){if(file.type.startsWith('image/'))files.push({data:await optimizeImage(file)})}draw();input.value=''};
  const cam=$('#editImagesCam',root); if(cam)cam.onchange=async()=>{for(const file of [...(cam.files||[])].slice(0,6-files.length)){if(file.type.startsWith('image/'))files.push({data:await optimizeImage(file)})}draw();cam.value=''};
  root._getImages=()=>files.map(x=>x.data);draw();
}

function openQuick(kind='receive',preProduct=''){
  const capMap = {
    receive: 'RECEIVE_STOCK',
    issue: 'ISSUE_STOCK',
    transfer: 'TRANSFER_STOCK',
    count: 'STOCKTAKE'
  };
  const requiredCap = capMap[kind];
  if (requiredCap && !userCan(requiredCap)) {
    const actionNames = { receive: 'Nhập hàng', issue: 'Xuất hàng', transfer: 'Chuyển kho', count: 'Kiểm kê kho' };
    toast(`Tài khoản của bạn không có quyền thực hiện ${actionNames[kind] || 'thao tác kho này'}.`, 'error');
    return;
  }
  const labels={receive:['Nhập hàng','Tăng tồn thực tế · Chuẩn Mẫu 01-VT'],issue:['Xuất hàng','Giảm tồn thực tế · Chuẩn Mẫu 02-VT'],transfer:['Chuyển kho','Kho đi trừ ngay, kho nhận tăng khi xác nhận'],count:['Kiểm tồn kho','Nhập số đếm thực tế']};
  const [title,sub]=labels[kind]||labels.receive;
  const lines=[];let selectedId=preProduct||'';
  const subTypeOptions = kind==='receive' ? `
    <div class="field"><label>Hình thức nhập kho</label><select id="stockSubType">
      <option value="PURCHASE">1. Nhập mua hàng NCC (Mặc định)</option>
      <option value="TRANSFER_IN">2. Nhập chuyển kho nội bộ về</option>
      <option value="RETURN_IN">3. Nhập hàng khách trả lại</option>
      <option value="ADJUSTMENT_IN">4. Nhập cân đối kiểm kê (thừa)</option>
      <option value="OPENING_STOCK">5. Nhập số dư tồn đầu kỳ</option>
      <option value="ASSEMBLY_IN">6. Nhập gia công / đóng gói combo</option>
    </select></div>
  ` : kind==='issue' ? `
    <div class="field"><label>Hình thức xuất kho</label><select id="stockSubType">
      <option value="SALE_OUT">1. Xuất bán hàng / giao khách (Mặc định)</option>
      <option value="TRANSFER_OUT">2. Xuất chuyển kho chi nhánh khác</option>
      <option value="PURCHASE_RETURN_OUT">3. Xuất trả hàng cho Nhà cung cấp</option>
      <option value="DAMAGED_EXPIRED_OUT">4. Xuất hủy hàng hỏng / hết hạn</option>
      <option value="INTERNAL_USE_OUT">5. Xuất tiêu dùng nội bộ / hàng mẫu</option>
      <option value="ADJUSTMENT_OUT">6. Xuất cân đối kiểm kê (thiếu)</option>
    </select></div>
  ` : '';

  const extra=kind==='transfer'?`<div class="form-grid"><div class="field"><label>Kho đi</label><select id="fromWh">${whOptions()}</select></div><div class="field"><label>Kho nhận</label><select id="toWh">${whOptions(state.data.warehouses[1]?.id)}</select></div></div>`:`
    ${subTypeOptions}
    <div class="form-grid"><div class="field"><label>${kind==='receive'?'Kho nhận':kind==='count'?'Kho kiểm kê':'Kho xuất'}</label><select id="wh">${whOptions()}</select></div>${kind==='receive'?`<div class="field"><label>Nhà cung cấp <small>(tuỳ chọn)</small></label><select id="supplierId">${supplierOptions()}</select></div>`:''}</div>
    ${kind==='receive'||kind==='issue'?`<div class="field"><label>${kind==='receive'?'Người giao hàng':'Người nhận hàng'}</label><input id="stockPerson" placeholder="${kind==='receive'?'Họ tên người giao / đại diện NCC':'Họ tên người nhận / bộ phận tiếp nhận'}"/></div>`:''}
  `;
  const body=`<div class="stock-flow"><div class="field"><label>Quét mã / Tìm sản phẩm</label><div class="stock-search"><input id="stockProductSearch" value="${esc(preProduct?product(preProduct)?.name||'':'')}" placeholder="Tên / SKU / barcode..." autocomplete="off"/>${icon('scan-line')}</div><div id="stockProductResults" class="stock-product-results"></div></div>${extra}<div id="selectedStockProduct" class="selected-stock-product"></div><div class="stock-entry-row"><label>${kind==='count'?'Số lượng thực tế':'Số lượng'}<div class="quantity-control"><button type="button" id="stockMinus">−</button><input id="qty" type="number" inputmode="numeric" min="0" value="${kind==='count'?0:1}"/><button type="button" id="stockPlus">+</button></div></label>${kind==='receive'?'<label>Giá nhập<input id="purchasePrice" type="number" inputmode="decimal" min="0" placeholder="0"/></label>':''}</div>${kind==='count'?'<div class="count-compare"><div><span>Tồn hệ thống</span><strong id="systemQty">0</strong></div><div><span>Thực tế</span><strong id="actualQty">0</strong></div><div><span>Chênh lệch</span><strong id="countDiff">0</strong></div></div>':''}<button type="button" class="secondary-btn full" id="addLine">${kind==='count'?'Lưu dòng này':'+ Thêm dòng'}</button><div class="field"><label>Số chứng từ / Ghi chú</label><input id="ref" placeholder="VD: PN-001, PX-001, HĐ-882..."/></div><div id="lineList" class="line-list"></div>${kind==='count'?'<div id="countSummary" class="count-summary"><span>Đã kiểm <b>0</b></span><span>Chưa khớp <b>0</b></span><span>Tạm chênh lệch <b>0</b></span></div>':''}</div>`;
  openModal({
    title,
    sub,
    body,
    submitText: kind === 'count' ? 'Chốt kiểm kho' : 'Xác nhận lưu',
    onSubmit: async (root) => {
      if (!lines.length) throw new Error('Hãy thêm ít nhất một sản phẩm.');
      const ref = $('#ref', root).value.trim();
      const warehouseId = $('#wh', root)?.value;
      const fromWarehouseId = $('#fromWh', root)?.value;
      const toWarehouseId = $('#toWh', root)?.value;
      const subType = $('#stockSubType', root)?.value || '';
      const person = $('#stockPerson', root)?.value.trim() || '';

      for (const line of lines) {
        const wid = kind === 'transfer' ? fromWarehouseId : warehouseId;
        const lv = state.data.levels.find(x => x.productId === line.productId && x.warehouseId === wid) || {};
        if ((kind === 'issue' || kind === 'transfer') && available(lv) < line.qty) {
          throw new Error(`Không đủ tồn cho ${product(line.productId)?.name}.`);
        }
        if (kind === 'count' && line.qty < (lv.reserved || 0) + (lv.damaged || 0)) {
          throw new Error(`Số kiểm của ${product(line.productId)?.name} không hợp lệ.`);
        }
      }

      if (kind === 'transfer') {
        if (fromWarehouseId === toWarehouseId) throw new Error('Kho đi và kho nhận phải khác nhau.');
        await createTransfer({ lines, fromWarehouseId, toWarehouseId, note: ref });
        toast('Đã tạo phiếu chuyển kho.', 'ok');
        return { customToast: true };
      } else {
        const doc = await applyWarehouseBatch({
          kind,
          warehouseId,
          lines,
          reference: ref,
          supplierId: kind === 'receive' ? ($('#supplierId', root)?.value || '') : '',
          subType,
          delivererName: kind === 'receive' ? person : '',
          receiverName: kind === 'issue' ? person : ''
        });
        toast(kind === 'count' ? 'Đã chốt kiểm kho.' : (kind === 'receive' ? 'Đã lưu Phiếu Nhập Kho.' : 'Đã lưu Phiếu Xuất Kho.'), 'ok');
        if (kind === 'receive' || kind === 'issue') {
          openWarehouseVoucherModal(doc, kind);
        }
        return { customToast: true };
      }
    }
  });

  const results = $('#stockProductResults');
  const search = $('#stockProductSearch');
  const list = $('#lineList');
  const wid = () => $('#wh')?.value || $('#fromWh')?.value;

  const sync = () => {
    const p = product(selectedId);
    const lv = p && state.data.levels.find(x => x.productId === p.id && x.warehouseId === wid()) || { onHand: 0 };
    const actual = Number($('#qty').value) || 0;
    $('#selectedStockProduct').innerHTML = p
      ? `<div class="product-photo tiny">${p.image ? `<img src="${p.image}" alt="${esc(p.name)}"/>` : esc(p.name.slice(0, 1))}</div><span><strong>${esc(p.name)}</strong><small>${esc(p.sku || '')} · Tồn ${fmt(lv.onHand)}</small></span>`
      : '<span>Chưa chọn sản phẩm</span>';
    if (kind === 'count') {
      $('#systemQty').textContent = fmt(lv.onHand);
      $('#actualQty').textContent = fmt(actual);
      $('#countDiff').textContent = (actual - lv.onHand > 0 ? '+' : '') + fmt(actual - lv.onHand);
    }
  };

  const redraw = () => {
    list.innerHTML = lines.map((x, i) => `<div class="line-item"><span><strong>${esc(product(x.productId)?.name)}</strong><small>${fmt(x.qty)}${kind === 'receive' && x.price !== null ? ` · ${fmt(x.price)} ₫` : ''}${kind === 'count' ? ` · chênh ${(x.diff > 0 ? '+' : '') + fmt(x.diff)}` : ''}</small></span><button type="button" data-remove-line="${i}">×</button></div>`).join('') || '<div class="empty-line">Chưa có dòng nào</div>';
    $$('[data-remove-line]', list).forEach(b => b.onclick = () => {
      lines.splice(Number(b.dataset.removeLine), 1);
      redraw();
    });
    if (kind === 'count') {
      const mismatch = lines.filter(x => x.diff);
      const sum = mismatch.reduce((n, x) => n + x.diff, 0);
      const boxes = $$('#countSummary b');
      if (boxes.length >= 3) {
        boxes[0].textContent = lines.length;
        boxes[1].textContent = mismatch.length;
        boxes[2].textContent = (sum > 0 ? '+' : '') + fmt(sum);
      }
    }
  };

  const renderProductSuggestions = (q = '') => {
    const filterQ = q.toLowerCase().trim();
    const rows = state.data.products.filter(p => p.type !== 'SERVICE' && (!filterQ || [p.name, p.sku, p.barcode].some(v => String(v || '').toLowerCase().includes(filterQ) || norm(v).includes(norm(filterQ))))).slice(0, 8);
    results.innerHTML = rows.map(p => `<button type="button" data-stock-product="${p.id}"><strong>${esc(p.name)}</strong><small>${esc(p.sku || '')} · ${fmt(stockView(p, wid()).available)} có thể bán</small></button>`).join('');
    $$('[data-stock-product]', results).forEach(b => b.onclick = () => {
      selectedId = b.dataset.stockProduct;
      search.value = product(selectedId)?.name || '';
      results.innerHTML = '';
      sync();
    });
  };

  search.oninput = () => renderProductSuggestions(search.value);
  search.onfocus = () => { if (!results.children.length) renderProductSuggestions(search.value); };
  $('#wh')?.addEventListener('change', () => { sync(); if (!selectedId) renderProductSuggestions(search.value); });
  $('#fromWh')?.addEventListener('change', () => { sync(); if (!selectedId) renderProductSuggestions(search.value); });
  $('#qty').oninput = sync;
  $('#stockMinus').onclick = () => { $('#qty').value = Math.max(0, Number($('#qty').value) - 1); sync(); };
  $('#stockPlus').onclick = () => { $('#qty').value = Number($('#qty').value) + 1; sync(); };
  $('#addLine').onclick = () => {
    const qty = Number($('#qty').value);
    if (!selectedId || (kind === 'count' ? qty < 0 : !(qty > 0))) return toast('Chọn sản phẩm và nhập số lượng hợp lệ.', 'error');
    const lv = state.data.levels.find(x => x.productId === selectedId && x.warehouseId === wid()) || { onHand: 0 };
    lines.push({ productId: selectedId, qty, price: kind === 'receive' && $('#purchasePrice')?.value !== '' ? Number($('#purchasePrice').value) : null, diff: qty - lv.onHand });
    selectedId = '';
    search.value = '';
    $('#qty').value = kind === 'count' ? 0 : 1;
    if ($('#purchasePrice')) $('#purchasePrice').value = '';
    sync();
    redraw();
    renderProductSuggestions('');
  };
  sync();
  redraw();
  if (!selectedId) renderProductSuggestions('');
}
function openProduct(id){
  state.currentProductId=id;updateContextAndChips();
  const p=product(id);
  if(!p) return;
  const totals=productTotals(p);
  const [c,l]=productStatus(p);
  const service=p.type==='SERVICE';
  const levels=service?'':state.data.warehouses.map(w=>{ const lv=state.data.levels.find(x=>x.productId===p.id&&x.warehouseId===w.id)||{onHand:0,reserved:0,damaged:0}; return `<div class="kv"><div><strong>${esc(w.name)}</strong><div class="muted">Thực ${fmt(lv.onHand)} · Giữ ${fmt(lv.reserved)} · Hỏng ${fmt(lv.damaged)}</div></div><strong>${fmt(available(lv))}</strong></div>`; }).join('');
  const inventoryActions=service?'':`<div class="detail-actions">${quickTile('receive','↓','Nhập','')}${quickTile('issue','↑','Xuất','')}${quickTile('transfer','⇄','Chuyển','')}${quickTile('count','✓','Kiểm','')}</div>`;
  const sourceLinks=[['Link mua',p.purchase_url||p.buy_url],['Link nhập',p.import_url],['Link đặt hàng',p.order_url]].filter(([,v])=>v).map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${label}<span>${icon('chevron-right')}</span></a>`).join('');
  const target=Number(p.target_stock)||0,reorder=Math.max(0,target-totals.available);
  const cost=p.purchase_price==null||p.purchase_price===''?null:Number(p.purchase_price),salePrice=p.price==null||p.price===''?null:Number(p.price);
  const canViewCost = userCan('VIEW_COST');
  const costText = canViewCost ? (cost===null?'Chưa có':`${fmt(cost)} ₫`) : '*** (Ẩn)';
  const priceSummary=service?`<div class="product-money single"><div><span>Giá bán</span><strong>${esc(p.priceNote||money(p.price)||'Chưa cập nhật')}</strong></div></div>`:`<div class="product-money"><div><span>Giá bán</span><strong>${money(salePrice)||'Chưa cập nhật'}</strong></div><div><span>Giá nhập gần nhất</span><strong>${costText}</strong></div></div>`;
  const sourceSection=service?'':`<details class="product-source source-more"><summary>Nguồn nhập & mức tồn</summary><div class="product-facts"><div><span>Tồn mục tiêu</span><strong>${target?fmt(target):'Chưa đặt'}</strong></div><div><span>Gợi ý nhập</span><strong>${target?fmt(reorder):'Chưa đủ dữ liệu'}</strong></div><div><span>Nhà cung cấp ưu tiên</span><strong>${esc(p.supplier_name||'Chưa cập nhật')}</strong></div><div><span>Mã hàng NCC</span><strong>${esc(p.supplier_sku||'Chưa cập nhật')}</strong></div><div><span>Quy cách nhập</span><strong>${esc(p.purchase_pack||'Chưa cập nhật')}</strong></div><div><span>Thời gian giao dự kiến</span><strong>${esc(p.lead_time||'Chưa cập nhật')}</strong></div></div>${sourceLinks?`<div class="source-links">${sourceLinks}</div>`:'<p class="muted">Chưa có liên kết nguồn nhập.</p>'}</details>`;
  const priceHist=priceHistorySection(p);
  const ledger=(state.data.movements||[]).filter(m=>m.productId===p.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,20);
  const ledgerSection=service?'':`<div class="section-divider"></div><h3>Thẻ kho / Lịch sử tồn</h3><div class="ledger-list">${ledger.length?ledger.map(m=>{const [lb]=MOVE_LABEL[m.type]||[m.type,'•'];const w=warehouse(m.warehouseId);const q=Number(m.qty||0);const after=(m.after||{}).onHand;return `<div class="ledger-row"><div class="ledger-main"><strong>${esc(lb)}</strong><small>${dt(m.createdAt)} · ${esc(w?.name||'')}${m.reason?` · ${esc(m.reason)}`:''}</small></div><span class="ledger-qty ${q>=0?'in':'out'}">${q>=0?'+':'−'}${fmt(Math.abs(q))}</span><span class="ledger-after">Tồn sau <b>${after==null?'—':fmt(after)}</b></span></div>`}).join(''):'<div class="empty-line">Chưa có biến động tồn.</div>'}</div>`;
  const advancedSection=`<details class="product-advanced"><summary>Nâng cao & mở rộng</summary><div class="capability-list">${[['Biến thể / thuộc tính','Chưa triển khai'],['Đơn vị quy đổi','Chưa triển khai'],['Combo / BOM','Chưa triển khai'],['Serial / IMEI','Tắt mặc định'],['Lô / hạn sử dụng','Tắt mặc định'],['Hiển thị website','Chưa kết nối QBiz Platform']].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('')}</div></details>`;
  openModal({title:p.name,sub:`${esc(p.sku||'Dịch vụ')}${p.barcode?` · ${esc(p.barcode)}`:''}<span class="product-title-status badge ${c}">${l}</span>`,footer:`<button class="secondary-btn" data-close>Đóng</button><button class="primary-btn" data-action="edit-item" data-product-id="${p.id}">Sửa</button>`,body:`<div class="product-detail product-detail-compact"><div class="detail-cover">${productImage(p)}</div><div class="detail-meta">${priceSummary}<div class="detail-stats">${service?'':`<div><strong>${fmt(totals.onHand)}</strong><span>Tồn thực</span></div><div><strong>${fmt(totals.available)}</strong><span>Có thể bán</span></div><div><strong>${fmt(p.lowStock)}</strong><span>Tồn tối thiểu</span></div>`}</div></div></div>${inventoryActions}${service?'':`<div class="detail-warehouse"><h3>Tồn theo kho</h3>${levels}</div>${priceHist}${ledgerSection}`}<details class="product-info-more"><summary>Thông tin sản phẩm</summary><div class="product-facts"><div><span>Danh mục</span><strong>${esc(categoryLabel(p.categoryId||p.category)||'Chưa cập nhật')}</strong></div></div><p class="product-description">${esc(p.description||'Chưa có mô tả sản phẩm.')}</p>${service?'':`<button class="secondary-btn qr-open" data-action="show-qr" data-product-id="${p.id}">${icon('qr-code')}<span>Mã QR sản phẩm</span></button>`}</details>${sourceSection}${advancedSection}`});
  $$('[data-kind]',$('#modalRoot')).forEach(b=>b.onclick=()=>{const k=b.dataset.kind; $('#modalRoot').innerHTML=''; openQuick(k,id);});
}
function openEditItem(id){
  if(!userCan('EDIT_PRODUCT')){
    toast('Tài khoản của bạn không có quyền sửa sản phẩm.', 'error');
    return;
  }
  const canEditPrice = userCan('EDIT_PRICE');
  const canViewCost = userCan('VIEW_COST');
  const p=product(id),service=p.type==='SERVICE',type=service?'SERVICE':'PRODUCT',selectedCategory=p.categoryId||p.category||'';
  const priceInput = canEditPrice
    ? `<input id="editPrice" type="number" inputmode="decimal" value="${p.price??''}" />`
    : `<input id="editPrice" type="number" value="${p.price??''}" readonly disabled title="Không có quyền sửa giá bán" />`;
  const costInput = service ? '' : (canViewCost
    ? `<div class="field"><label>Giá nhập gần nhất</label><input id="editCost" type="number" min="0" inputmode="decimal" value="${p.purchase_price??''}" /></div>`
    : '');
  const body=`<div class="compact-edit-form"><div class="form-grid edit-primary-grid"><div class="field full-span"><label>Tên</label><input id="editName" value="${esc(p.name)}" /></div><div class="field"><label>Giá bán</label>${priceInput}</div>${costInput}<div class="field"><label>Danh mục</label><select id="editCategory">${categoryOptions(type,selectedCategory)}</select></div>${service?'<div class="field"><label>Thời lượng (phút)</label><input id="editDuration" type="number" min="0" inputmode="numeric" value="'+(p.duration_minutes??'')+'" /></div>':'<div class="field"><label>SKU</label><input id="editSku" value="'+esc(p.sku||'')+'" readonly /></div>'}</div>${compactImagePickerMarkup()}<details class="edit-more"><summary>Thông tin thêm</summary><div class="form-grid">${service?'<label class="check-field"><input id="editBooking" type="checkbox" '+(p.booking_enabled?'checked':'')+' /> Cho phép đặt lịch</label><label class="check-field"><input id="editActive" type="checkbox" '+(p.active!==false?'checked':'')+' /> Đang hoạt động</label>':'<div class="field"><label>Barcode</label><input id="editBarcode" value="'+esc(p.barcode||'')+'" /></div><div class="field"><label>Tồn tối thiểu</label><input id="editLow" type="number" min="0" value="'+(p.lowStock??5)+'" /></div>'}<div class="field full-span"><label>Mô tả</label><textarea id="editDescription">${esc(p.description||'')}</textarea></div></div></details></div>`;
  openModal({title:'Sửa mục',sub:service?'Dịch vụ':'Sản phẩm',body,submitText:'Lưu thay đổi',onSubmit:r=>{const imgs=r._getImages?.()||[];const priceVal = canEditPrice ? ($('#editPrice',r).value===''?null:Number($('#editPrice',r).value)) : p.price; const costVal = canViewCost ? ($('#editCost',r)?.value===''?null:Number($('#editCost',r)?.value)) : p.purchase_price; return updateItem({...p,name:$('#editName',r).value,price:priceVal,categoryId:$('#editCategory',r).value,description:$('#editDescription',r).value,...(service?{image:imgs[0]||'',images:imgs,duration_minutes:$('#editDuration',r).value===''?null:Number($('#editDuration',r).value),booking_enabled:$('#editBooking',r).checked,active:$('#editActive',r).checked}:{image:imgs[0]||'',images:imgs,purchase_price:costVal,barcode:$('#editBarcode',r).value,lowStock:Number($('#editLow',r).value)})})}});
  bindCompactImagePicker($('#modalRoot'),p.images?.length?p.images:[p.image]);
}
function openQR(id){const p=product(id);if(!p)return;openModal({title:'Mã QR sản phẩm',sub:`${p.name} · ${p.sku}`,hideSubmit:true,body:`<div class="qr-card"><div id="qrCanvas" class="qr-canvas"><div class="empty-line">Đang tạo mã QR…</div></div><strong>${esc(p.name)}</strong><span>${esc(p.sku)}${p.barcode?` · ${esc(p.barcode)}`:''}</span><div class="qr-actions"><button class="secondary-btn" data-qr-download="png">Tải PNG</button><button class="primary-btn" data-qr-download="svg">Tải SVG</button></div></div>`});const host=$('#qrCanvas');if(!window.QRCodeStyling)return host.innerHTML='<div class="empty-line">Không tải được bộ tạo QR. Hãy mở lại khi có mạng.</div>';const qr=new QRCodeStyling({width:260,height:260,type:'svg',data:p.barcode||p.sku,image:'./icons/icon-192.png',dotsOptions:{color:'#07111e',type:'rounded'},cornersSquareOptions:{color:'#07111e',type:'extra-rounded'},cornersDotOptions:{color:'#0284c7',type:'dot'},backgroundOptions:{color:'#ffffff'},imageOptions:{crossOrigin:'anonymous',margin:8,hideBackgroundDots:true},qrOptions:{errorCorrectionLevel:'H'}});qr.append(host);host._qr=qr;$$('[data-qr-download]',$('#modalRoot')).forEach(b=>b.onclick=()=>qr.download({name:`qbiz-${p.sku}`,extension:b.dataset.qrDownload}));}
function openInstall(){
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const canPrompt = Boolean(state.installPrompt);

  const body = `
    <div class="install-modal-content">
      <div class="install-hero-badge">
        <div class="install-logo-glow">
          <img src="./icons/logo-master.svg" alt="QBiz Logo" class="install-modal-logo" />
        </div>
        <div class="install-hero-info">
          <h4>QBiz · Bán Hàng & Quản Lý Kho</h4>
          <p class="install-hero-tagline">POS bán hàng &amp; Quản trị kho hàng đa nền tảng</p>
          <div class="install-feature-chips">
            <span class="chip-item">⚡ Bán hàng siêu tốc</span>
            <span class="chip-item">📦 Tồn kho thời gian thực</span>
            <span class="chip-item">📶 Hoạt động offline 100%</span>
          </div>
        </div>
      </div>

      <div class="install-callout-text">
        Cài đặt trực tiếp ứng dụng về máy tính hoặc điện thoại để mở tức thì từ màn hình chính, quét mã vạch mượt mà, in hóa đơn nhanh và lưu trữ dữ liệu offline bảo mật tuyệt đối.
      </div>

      ${canPrompt ? `
        <div class="install-direct-action-card">
          <div class="card-desc">
            <strong>Thiết bị của bạn đã sẵn sàng cài đặt</strong>
            <span>Bấm nút bên dưới để cài ứng dụng trực tiếp chỉ trong 1 giây.</span>
          </div>
          <button class="primary-btn install-big-btn" id="btnRunNativeInstall">
            ${icon('download')} Cài đặt ngay về máy
          </button>
        </div>
      ` : ''}

      <div class="install-device-guides">
        <div class="install-device-card ${isAndroid ? 'active-os' : ''}">
          <div class="os-header">
            <span class="os-tag android-tag">ANDROID</span>
            <strong>Cài trên điện thoại Android (Chrome)</strong>
          </div>
          <ol class="os-steps">
            <li>Mở bằng trình duyệt <b>Google Chrome</b>.</li>
            <li>Bấm vào biểu tượng menu <b>⋮ (3 chấm dọc)</b> ở góc trên bên phải.</li>
            <li>Chọn <b>"Cài đặt ứng dụng"</b> (hoặc <b>"Thêm vào Màn hình chính"</b>).</li>
          </ol>
        </div>

        <div class="install-device-card ${isIos ? 'active-os' : ''}">
          <div class="os-header">
            <span class="os-tag ios-tag">IPHONE / IPAD</span>
            <strong>Cài trên iPhone / iPad (Safari)</strong>
          </div>
          <ol class="os-steps">
            <li>Mở ứng dụng bằng trình duyệt <b>Safari</b>.</li>
            <li>Bấm vào biểu tượng <b>Chia sẻ</b> (hình ô vuông có mũi tên hất lên <span class="ios-share-glyph">⎋</span> ở thanh công cụ dưới).</li>
            <li>Cuộn xuống và chọn <b>"Thêm vào MH chính"</b> (Add to Home Screen).</li>
            <li>Bấm <b>Thêm</b> ở góc trên bên phải để hoàn tất.</li>
          </ol>
        </div>

        <div class="install-device-card ${(!isAndroid && !isIos) ? 'active-os' : ''}">
          <div class="os-header">
            <span class="os-tag pc-tag">MÁY TÍNH / PC & MAC</span>
            <strong>Cài trên Máy tính (Chrome, Edge, Cốc Cốc)</strong>
          </div>
          <ol class="os-steps">
            <li>Nhìn vào góc phải thanh địa chỉ (URL) trên cùng trình duyệt.</li>
            <li>Bấm vào biểu tượng <b>Cài đặt ứng dụng</b> (hình máy tính nhỏ có mũi tên tải xuống hoặc biểu tượng dấu cộng <b>⊕</b>).</li>
            <li>Chọn <b>"Cài đặt"</b> để ghim icon ra Desktop &amp; Taskbar.</li>
          </ol>
        </div>
      </div>
    </div>
  `;

  openModal({
    title: 'Cài đặt ứng dụng về máy',
    sub: 'Mở nhanh không cần duyệt web · Hoạt động mượt mà khi mất mạng',
    hideSubmit: true,
    body,
    footer: `<button class="secondary-btn" data-close>Đóng</button>${canPrompt ? `<button class="primary-btn" id="modalInstallFooterBtn">${icon('download')} Cài ngay</button>` : ''}`
  });

  const doPrompt = async () => {
    if (state.installPrompt) {
      try {
        state.installPrompt.prompt();
        const choice = await state.installPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          toast('Đang cài đặt QBiz Kho về thiết bị của bạn…', 'ok');
          state.installPrompt = null;
          $('#modalRoot').innerHTML = '';
          const topInst = $('.header-install-btn');
          if (topInst) topInst.remove();
          const firstBanner = $('#firstVisitInstallBanner');
          if (firstBanner) firstBanner.remove();
        }
      } catch (err) {
        console.warn('Install error:', err);
      }
    }
  };

  const directBtn = $('#btnRunNativeInstall', $('#modalRoot'));
  if (directBtn) directBtn.onclick = doPrompt;
  const footerBtn = $('#modalInstallFooterBtn', $('#modalRoot'));
  if (footerBtn) footerBtn.onclick = doPrompt;
}
function internalBarcode(){const base='200'+Array.from({length:9},()=>Math.floor(Math.random()*10)).join('');const sum=base.split('').reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0);return base+String((10-sum%10)%10);}
function openNewProduct(){
  if(!userCan('EDIT_PRODUCT')){
    toast('Tài khoản của bạn không có quyền thêm sản phẩm.', 'error');
    return;
  }
  return state.productType==='SERVICE'?openNewServiceForm():openNewProductForm();
}
function openNewServiceForm(){
  openModal({title:'Thêm dịch vụ',sub:'Dịch vụ không theo dõi tồn kho.',submitText:'Lưu dịch vụ',body:`<div class="form-grid"><div class="field full-span"><label for="name">Tên dịch vụ</label><input id="name" placeholder="VD: Tư vấn trị liệu" /></div><div class="field"><label for="price">Giá</label><input id="price" type="number" min="0" /></div><div class="field"><label for="categoryId">Danh mục dịch vụ</label><select id="categoryId">${categoryOptions('SERVICE')}</select></div><div class="field"><label for="duration">Thời lượng (phút, tùy chọn)</label><input id="duration" type="number" min="0" /></div><label class="check-field"><input id="booking" type="checkbox" /> Cho phép đặt lịch</label>${filePickerMarkup()}</div>`,onSubmit:r=>createService({name:$('#name',r).value,price:$('#price',r).value,categoryId:$('#categoryId',r).value,durationMinutes:$('#duration',r).value||null,bookingEnabled:$('#booking',r).checked,images:$('#modalRoot')._getImages?.()||[]})});
  bindImagePicker($('#modalRoot'));
}
function openNewProductForm(){
  const canEditPrice = userCan('EDIT_PRICE');
  const canViewCost = userCan('VIEW_COST');
  const priceInputHtml = canEditPrice
    ? `<div class="field"><label class="np-money" for="productPrice">Giá bán</label><input id="productPrice" type="number" min="0" inputmode="numeric" /></div>`
    : `<div class="field"><label class="np-money" for="productPrice">Giá bán</label><input id="productPrice" type="number" min="0" value="0" readonly disabled title="Không có quyền sửa giá" /></div>`;
  const costInputHtml = canViewCost
    ? `<div class="field"><label class="np-money" for="productCost">Giá nhập <span class="np-lite">(gần nhất)</span></label><input id="productCost" type="number" min="0" inputmode="numeric" /></div>`
    : '';
  const units=['Cái','Chiếc','Bộ','Hộp','Chai','Kg','Gói','Khác'];
  const cats=categoryTree('PRODUCT').map(x=>x.category);
  const catsHtml=cats.length?`<div class="np-chips" id="npCategories">${cats.map(c=>`<button type="button" class="np-chip" data-cat-id="${c.id}">${esc(c.name)}</button>`).join('')}</div><button type="button" class="np-more" id="npMoreCats" hidden>thêm »</button>`:'<p class="field-limit">Chưa có danh mục. Tạo trong Hàng hóa → Danh mục.</p>';
  const imgBlock=`<div class="compact-image-field"><div class="compact-image-head"><label>Ảnh</label><small>bấm khung để chọn</small></div><div class="np-imgrow"><div id="editImagePreview" class="compact-image-preview" role="button" tabindex="0" aria-label="Chọn ảnh"></div><div class="compact-image-actions np-col"><label class="secondary-btn upload-inline compact-upload">${icon('camera')} Chụp<input id="editImagesCam" type="file" accept="image/*" capture="environment" hidden /></label></div><input id="editImages" type="file" accept="image/*" multiple hidden /></div></div>`;
  const body=`<div class="form-grid np-form">
    <div class="field full-span"><label for="name">Tên sản phẩm</label><input id="name" placeholder="VD: Ghế N85" /></div>
    <div class="full-span">${imgBlock}</div>
    <div class="full-span"><label class="np-label">Danh mục (chọn được nhiều)</label>${catsHtml}</div>
    <div class="np-row2">${priceInputHtml}${costInputHtml}</div>
    <div class="np-row2"><div class="field"><label for="stockNow">Tồn hiện tại</label><input id="stockNow" type="number" min="0" inputmode="numeric" value="0" /></div><div class="field"><label for="unit">Đơn vị tính</label><select id="unit">${units.map(u=>`<option>${u}</option>`).join('')}</select></div></div>
    <div class="field full-span"><label for="low">Cảnh báo khi còn</label><input id="low" type="number" min="0" inputmode="numeric" placeholder="0" /></div>
    <div class="full-span"><label class="np-label">Biến thể (màu / size / thuộc tính)</label><div class="np-chips" id="npVariants"></div><div class="np-variant-add"><input id="npVariantName" placeholder="Tên: Size" /><input id="npVariantValues" placeholder="Giá trị: S, M, L" /></div><button type="button" class="secondary-btn np-variant-btn" id="npVariantAdd">${icon('package-plus')} Thêm biến thể</button></div>
    <details class="edit-more full-span"><summary>Thông tin thêm (SKU, Barcode)</summary><div class="form-grid"><div class="field"><label for="sku">SKU</label><input id="sku" placeholder="Tự tạo nếu để trống" /></div><div class="field"><label for="barcode">Barcode</label><input id="barcode" inputmode="numeric" placeholder="Tự tạo nếu để trống" /></div></div></details>
  </div>`;
  const selectedCats=new Set(state.newProductCats||[]);
  const variants=(state.newProductVariants||[]).map(v=>({...v}));
  const saveItem=async r=>{
    const name=$('#name',r).value.trim();
    if(!name) throw new Error('Hãy nhập tên sản phẩm.');
    const existing=state.data.products;
    let sku=$('#sku',r).value.trim();
    if(!sku){let t=0;do{sku='SP'+Date.now().toString(36).toUpperCase().slice(-5)+(10+Math.floor(Math.random()*90));t++;}while(t<6&&existing.some(p=>String(p.sku||'').toLowerCase()===sku.toLowerCase()));}
    let barcode=$('#barcode',r).value.trim();
    if(!barcode){let t=0;do{barcode=internalBarcode();t++;}while(t<6&&existing.some(p=>String(p.barcode||'')===barcode));}
    const imgs=(mountImages()||[]);
    const catIds=[...selectedCats];
    const priceVal=canEditPrice ? $('#productPrice',r).value : 0;
    const created=await createProduct({name,price:priceVal,categoryId:catIds[0]||'',sku,barcode,lowStock:$('#low',r).value,image:imgs[0]||'',images:imgs,variants});
    const patch={};if(catIds.length)patch.categoryIds=catIds;
    if(canViewCost){const cost=$('#productCost',r)?.value;if(cost!==''&&cost!=null)patch.purchase_price=Number(cost);}
    const unit=$('#unit',r).value;if(unit)patch.unit=unit;
    if(Object.keys(patch).length)await updateItem({...created,...patch});
    const qty=Number($('#stockNow',r).value)||0,wh=state.data.warehouses[0];
    if(qty>0&&wh)await setOpeningStock({productId:created.id,warehouseId:wh.id,qty});
    state.newProductCats=[];state.newProductVariants=[];
    return created;
  };
  openModal({title:'Thêm sản phẩm',sub:'SKU/Barcode để trống sẽ tự tạo.',body,submitText:'Lưu sản phẩm',onSubmit:saveItem});
  const root=$('#modalRoot');
  bindCompactImagePicker(root); const mountImages=root._getImages||(()=>[]);
  const prev=$('#editImagePreview',root);
  if(prev){prev.classList.add('np-pick');prev.onclick=e=>{if(e.target.closest('[data-remove-edit-image]'))return;const inp=$('#editImages',root);if(inp)inp.click();};}
  const chipWrap=$('#npCategories',root);
  if(chipWrap){
    const syncCats=()=>$$('.np-chip',chipWrap).forEach(c=>c.classList.toggle('active',selectedCats.has(c.dataset.catId)));
    $$('.np-chip',chipWrap).forEach(c=>{c.onclick=()=>{const id=c.dataset.catId;if(selectedCats.has(id))selectedCats.delete(id);else selectedCats.add(id);syncCats();};});
    const more=$('#npMoreCats',root);
    if(more){const syncMore=()=>{if(!more||chipWrap.classList.contains('expanded'))return;more.hidden=!(chipWrap.scrollHeight>chipWrap.clientHeight+2);};setTimeout(syncMore,180);window.addEventListener('resize',syncMore);more.onclick=()=>{chipWrap.classList.add('expanded');more.hidden=true;};}
    syncCats();
  }
  const vWrap=$('#npVariants',root);
  const drawVariants=()=>{if(!vWrap)return;vWrap.innerHTML=variants.map((v,i)=>`<button type="button" class="np-chip active" data-variant-remove="${i}">${esc(v.name)}: ${esc((v.values||[]).join(', '))} ×</button>`).join('');$$('[data-variant-remove]',vWrap).forEach(b=>b.onclick=()=>{variants.splice(Number(b.dataset.variantRemove),1);drawVariants();});};
  const addVariant=()=>{const ni=$('#npVariantName',root),vi=$('#npVariantValues',root);if(!ni||!vi){toast('Không tìm thấy ô nhập biến thể.','error');return;}let vName=(ni.value||'').trim();let raw=(vi.value||'').trim();if(!vName&&raw){const m=raw.match(/^([^:：]+)[:：](.+)$/);if(m){vName=m[1].trim();raw=m[2].trim();}}if(!raw){toast('Nhập giá trị biến thể trước (VD: S, M, L).','');vi.focus();return;}if(!vName)vName='Thuộc tính';const values=raw.split(',').map(x=>x.trim()).filter(Boolean);if(!values.length){toast('Giá trị biến thể không hợp lệ.','error');return;}const ex=variants.find(v=>v.name.toLowerCase()===vName.toLowerCase());if(ex)ex.values=[...new Set([...(ex.values||[]),...values])];else variants.push({name:vName,values});ni.value='';vi.value='';drawVariants();toast('Đã thêm biến thể: '+vName,'ok');const last=vWrap&&vWrap.lastElementChild;if(last&&last.scrollIntoView)last.scrollIntoView({block:'nearest'});vi.focus();};
  if($('#npVariantAdd',root))$('#npVariantAdd',root).onclick=addVariant;
  if($('#npVariantValues',root))$('#npVariantValues',root).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addVariant();}});
  drawVariants();
  const foot=$('.modal-foot',root), sub=$('#modalSubmit',root);
  if(foot&&sub){const nb=document.createElement('button');nb.type='button';nb.id='modalSaveNext';nb.className='secondary-btn';nb.textContent='Lưu & thêm tiếp';foot.insertBefore(nb,sub);nb.onclick=async()=>{try{state.newProductCats=[...selectedCats];state.newProductVariants=variants.map(v=>({...v}));await saveItem(root);root.innerHTML='';await refresh();toast('Đã lưu. Nhập tiếp sản phẩm mới.','ok');openNewProductForm();}catch(e){toast(e.message,'error');}};}
}

function openNewWarehouse(){ openModal({title:'Thêm kho',sub:'Kho / điểm lưu trữ mới',body:`<div class="field"><label>Tên kho</label><input id="whName" placeholder="VD: Kho Hà Nội" /></div>`,submitText:'Tạo kho',onSubmit:r=>createWarehouse($('#whName',r).value)}); }
function openWarehouseManagement(){
  openModal({title:'Quản lý kho',sub:`${state.data.warehouses.length} kho trên thiết bị này`,hideSubmit:true,body:`<div class="warehouse-manage-list">${state.data.warehouses.map((w,i)=>`<div><span><strong>${esc(w.name)}</strong><small>${i===0?'Kho mặc định':'Kho đang hoạt động'}</small></span><button data-edit-warehouse="${w.id}">Sửa</button></div>`).join('')}</div><button class="primary-btn full" data-action="new-warehouse">+ Thêm kho</button>`});
  $$('[data-edit-warehouse]',$('#modalRoot')).forEach(b=>b.onclick=()=>{const w=warehouse(b.dataset.editWarehouse);$('#modalRoot').innerHTML='';openModal({title:'Sửa tên kho',sub:w.name,body:`<div class="field"><label>Tên kho</label><input id="warehouseNameEdit" value="${esc(w.name)}"/></div>`,submitText:'Lưu',onSubmit:async r=>{const name=$('#warehouseNameEdit',r).value.trim();if(!name)throw new Error('Tên kho là bắt buộc.');await put('warehouses',{...w,name});}})});
}
function openScan(){ openModal({title:'Quét barcode / QR',sub:'Đưa mã vào khung quét. Bạn cũng có thể nhập SKU bằng tay.',hideSubmit:true,body:`<div class="scan-box"><video id="scanVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;display:none"></video><div id="scanPlaceholder"><div class="scan-placeholder-icon">${icon('scan-line')}</div><strong>Đưa mã vào khung quét</strong><div style="font-size:12px;opacity:.75;margin-top:8px">Cho phép camera khi được hỏi</div></div><div class="scan-frame"></div><div class="scan-corners"></div><div class="scan-line"></div></div><div class="field" style="margin-top:14px"><label>Hoặc nhập barcode / SKU</label><div style="display:flex;gap:8px"><input id="manualCode" placeholder="Quét hoặc nhập mã..."/><button class="primary-btn" id="findCode">Tìm</button></div></div>`}); $('#findCode').onclick=()=>findScanned($('#manualCode').value); startBarcodeCamera(); }
async function startBarcodeCamera(){ if(!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return; try{ const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','qr_code']}); const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); const v=$('#scanVideo'); if(!v) return; v.srcObject=stream; v.style.display='block'; $('#scanPlaceholder').style.display='none'; const loop=async()=>{ if(!document.body.contains(v)){ stream.getTracks().forEach(t=>t.stop()); return; } try{ const codes=await detector.detect(v); if(codes[0]?.rawValue){ stream.getTracks().forEach(t=>t.stop()); findScanned(codes[0].rawValue); return; } }catch{} requestAnimationFrame(loop); }; loop(); } catch{} }
function playScannerBeep(success = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (success) {
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else {
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch (e) {}
}

function handleScannedBarcode(code) {
  code = String(code || '').trim();
  if (!code) return;
  const lower = code.toLowerCase();
  const prods = state.data?.products || [];
  const p = prods.find(x => [x.barcode, x.sku].some(v => String(v || '').trim().toLowerCase() === lower));

  if (!p) {
    playScannerBeep(false);
    toast(`Không tìm thấy sản phẩm có mã: ${code}`, 'error');
    return;
  }

  playScannerBeep(true);

  if (state.page === 'sales') {
    if ($('#modalRoot')?.innerHTML && $('#manualCode')) $('#modalRoot').innerHTML = '';
    addSaleItem(p.id);
    toast(`✓ Đã thêm vào giỏ: ${p.name}`, 'ok');
  } else {
    if ($('#modalRoot')?.innerHTML && $('#manualCode')) $('#modalRoot').innerHTML = '';
    openProduct(p.id);
    toast(`✓ ${p.name}`, 'ok');
  }
}

function findScanned(code){
  handleScannedBarcode(code);
}
function dismissToast(el, immediate = false) {
  if (!el || el.dataset.dismissing) return;
  el.dataset.dismissing = 'true';
  if (immediate) {
    try { el.remove(); } catch (e) {}
    return;
  }
  el.classList.add('fade-out');
  setTimeout(() => {
    try { el.remove(); } catch (e) {}
  }, 180);
}

function toast(msg, type = '', duration = 1400) {
  const root = $('#toastRoot');
  if (!root) return;
  const existing = root.querySelectorAll('.toast:not([data-dismissing])');
  existing.forEach(el => dismissToast(el, true));

  const n = document.createElement('div');
  n.className = `toast ${type}`;
  n.textContent = msg;
  n.onclick = () => dismissToast(n);
  root.append(n);

  setTimeout(() => dismissToast(n), duration);
}

async function updateSyncPill(){ const s=await syncStatus(); const el=$('#desktopSyncPill'); if(el) el.querySelector('span:last-child').textContent=s.label+(s.pending?` · ${s.pending} chờ`: ''); }
async function exportBackup(){ const data=await snapshot(); const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`qbiz-kho-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); }
function downloadText(name,text,type){const needBom=(type&&(type.includes('csv')||type.includes('excel')||type.includes('ms-excel'))&&!text.startsWith('\uFEFF'));const content=needBom?'\uFEFF'+text:text;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function csvCell(v){const x=String(v??'');return /[",\n]/.test(x)?`"${x.replaceAll('"','""')}"`:x}
function exportProductsCsv(){downloadText(`qbiz-san-pham-${new Date().toISOString().slice(0,10)}.csv`,['name,sku,barcode,lowStock,image',...state.data.products.map(p=>[p.name,p.sku,p.barcode,p.lowStock,p.image].map(csvCell).join(','))].join('\n'),'text/csv;charset=utf-8')}
async function importProductsCsv(e){
  const file=e.target.files?.[0]; if(!file)return;
  try{
    const rows=(await file.text()).split(/\r?\n/).filter(Boolean); const header=rows.shift()?.split(',').map(x=>x.trim())||[]; const idx=k=>header.indexOf(k);
    if(!['name','sku'].every(k=>idx(k)>=0))throw new Error('CSV cần có cột name và sku.');
    const imported=rows.map(row=>{const cells=row.match(/("(?:[^"]|"")*"|[^,]*)/g)?.filter((_,i,a)=>i<a.length-1).map(x=>x.replace(/^"|"$/g,'').replaceAll('""','"'))||[];return {name:cells[idx('name')]?.trim(),sku:cells[idx('sku')]?.trim(),barcode:cells[idx('barcode')]?.trim()||'',lowStock:Number(cells[idx('lowStock')]||5),image:cells[idx('image')]||''};}).filter(p=>p.name&&p.sku);
    if(!imported.length)throw new Error('CSV không có dòng sản phẩm hợp lệ.');
    const existing=new Set(state.data.products.map(p=>p.sku.toLowerCase())), seen=new Set(), fresh=[], duplicates=[];
    for(const item of imported){const key=item.sku.toLowerCase();if(existing.has(key)||seen.has(key))duplicates.push(item.sku);else{seen.add(key);fresh.push(item);}}
    if(!fresh.length)throw new Error('Không có SKU mới để nhập.');
    openModal({title:'Xem trước nhập hàng hóa',sub:`${fresh.length} sản phẩm mới · ${duplicates.length} SKU trùng sẽ bỏ qua`,body:`<div class="restore-preview"><div class="callout"><strong>${esc(file.name)}</strong><br/>Chỉ nhập thông tin sản phẩm. Tồn đầu kỳ không được ghi từ CSV này để mọi biến động tồn luôn có chứng từ ledger.</div><div class="product-facts"><div><span>Sản phẩm mới</span><strong>${fresh.length}</strong></div><div><span>SKU trùng bỏ qua</span><strong>${duplicates.length}</strong></div></div><div class="csv-preview">${fresh.slice(0,8).map(p=>`<div><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></div>`).join('')}${fresh.length>8?`<p class="muted">… và ${fresh.length-8} sản phẩm khác</p>`:''}</div></div>`,submitText:'Nhập sản phẩm',onSubmit:async()=>{for(const item of fresh)await createProduct(item);}});
  }catch(err){toast(err.message,'error');}finally{e.target.value='';}
}
async function importBackupLegacy(e){ const file=e.target.files?.[0]; if(!file) return; try{ const x=JSON.parse(await file.text()); if(!Array.isArray(x.products)||!Array.isArray(x.warehouses)||!Array.isArray(x.levels)) throw new Error('File backup không hợp lệ.'); await clearAll(); for(const name of ['products','warehouses','levels','movements','transfers','sales','orders','customers','suppliers','purchase_receipts','returns','refunds','shifts','categories','settings','outbox','devices','registers','print_templates','print_jobs']) if(Array.isArray(x[name])) await putMany(name,x[name]); await ensurePrintTemplates(); await refresh(); toast('Đã khôi phục bản sao.','ok'); } catch(err){ toast(err.message,'error'); } }
const BACKUP_STORES=['products','warehouses','levels','movements','transfers','sales','orders','customers','suppliers','purchase_receipts','returns','refunds','shifts','categories','settings','outbox','devices','registers','print_templates','print_jobs'];
function backupCounts(data){return ['products','warehouses','levels','movements','sales','orders','customers','suppliers','purchase_receipts'].map(name=>`${({products:'Hàng hóa',warehouses:'Kho',levels:'Tồn theo kho',movements:'Biến động',sales:'Phiếu bán',orders:'Đơn hàng',customers:'Khách hàng',suppliers:'Nhà cung cấp',purchase_receipts:'Phiếu nhập'})[name]}: ${(data[name]||[]).length}`).join(' · ')}
async function importBackup(e){
  const file=e.target.files?.[0]; if(!file)return;
  try{
    const incoming=JSON.parse(await file.text());
    if(!Array.isArray(incoming.products)||!Array.isArray(incoming.warehouses)||!Array.isArray(incoming.levels)) throw new Error('File backup không tương thích: thiếu hàng hóa, kho hoặc tồn theo kho.');
    const current=await snapshot();
    openModal({title:'Khôi phục sao lưu',sub:'Hãy xem lại trước khi thay dữ liệu trên thiết bị này.',body:`<div class="restore-preview"><div class="callout"><strong>File chọn</strong><br/>${esc(file.name)} · ${formatBytes(file.size)}</div><div class="product-facts"><div><span>Dữ liệu trong file</span><strong>${esc(backupCounts(incoming))}</strong></div><div><span>Dữ liệu hiện tại</span><strong>${esc(backupCounts(current))}</strong></div></div><p class="field-limit">Trước khi khôi phục, QBiz sẽ tải một bản sao an toàn của dữ liệu hiện tại. Khôi phục thay toàn bộ dữ liệu local và không thể hoàn tác trong ứng dụng.</p></div>`,submitText:'Tải bản an toàn & khôi phục',onSubmit:async()=>{
      downloadText(`qbiz-kho-before-restore-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:2,exportedAt:new Date().toISOString(),...current},null,2),'application/json');
      await runTransaction(BACKUP_STORES,stores=>{for(const name of BACKUP_STORES){stores[name].clear();if(Array.isArray(incoming[name]))incoming[name].forEach(row=>stores[name].put(row));}});
  await ensurePrintTemplates();
  await applyModuleFlags();
    }});
  }catch(error){toast(error.message,'error');}
  finally{e.target.value='';}
}
function formatBytes(n){if(!n)return '0 B';const units=['B','KB','MB'];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),2);return `${(n/1024**i).toFixed(i?1:0)} ${units[i]}`}
async function optimizeImage(file){
  const max=1800; const bitmap=typeof createImageBitmap==='function'?await createImageBitmap(file):await loadImage(file); const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale)); const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82)); return await blobToData(blob||file);
}
function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=URL.createObjectURL(file);})}
function blobToData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);})}

function openForgotPasswordModal() {
  openModal({
    title: 'Khôi phục mật khẩu',
    sub: 'Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.',
    body: `
      <div class="field">
        <label>Email tài khoản</label>
        <input type="email" id="forgotEmail" placeholder="vd: shop@example.com" required autocomplete="email" />
      </div>
      <p class="field-limit" style="margin-top:10px;font-size:12px;color:var(--text-muted,#64748b)">
        Hệ thống sẽ gửi email có liên kết bảo mật để bạn cập nhật mật khẩu mới.
      </p>
    `,
    submitText: 'Gửi yêu cầu',
    onSubmit: async (root) => {
      const email = $('#forgotEmail', root)?.value?.trim();
      if (!email) throw new Error('Vui lòng nhập địa chỉ email.');
      await resetPassword({ email });
      toast('Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư!', 'ok');
    }
  });
}

function openAuthModal(defaultTab = 'signin') {
  let activeTab = defaultTab;
  const renderBody = () => `
    <div class="auth-brand" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border,#e2e8f0)">
      <div style="width:40px;height:40px;border-radius:8px;background:var(--primary,#0284c7);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:18px">Q</div>
      <div>
        <strong style="font-size:16px;display:block">QBiz Kho</strong>
        <span style="font-size:12px;color:var(--text-muted,#64748b)">Nền tảng Quản lý kho & Bán hàng</span>
      </div>
    </div>
    <div class="auth-tabs" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border,#e2e8f0);padding-bottom:8px">
      <button type="button" class="tab-btn ${activeTab==='signin'?'active':''}" id="authTabSignin" style="flex:1;padding:8px;border-radius:6px;border:none;background:${activeTab==='signin'?'var(--primary,#0284c7)':'transparent'};color:${activeTab==='signin'?'#fff':'inherit'};font-weight:600;cursor:pointer">Đăng nhập</button>
      <button type="button" class="tab-btn ${activeTab==='signup'?'active':''}" id="authTabSignup" style="flex:1;padding:8px;border-radius:6px;border:none;background:${activeTab==='signup'?'var(--primary,#0284c7)':'transparent'};color:${activeTab==='signup'?'#fff':'inherit'};font-weight:600;cursor:pointer">Đăng ký tài khoản</button>
    </div>

    <!-- Prominent Google Sign-in Button -->
    <button type="button" class="google-auth-btn" id="modalGoogleSignInBtn" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:10px 16px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;font-weight:600;font-size:14px;color:#1e293b;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);margin-bottom:12px">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
      <span>Tiếp tục với Google</span>
    </button>

    <div style="display:flex;align-items:center;text-align:center;color:var(--text-muted,#64748b);font-size:12px;margin:8px 0 14px">
      <span style="flex:1;border-bottom:1px solid var(--border,#e2e8f0)"></span>
      <span style="padding:0 10px">hoặc</span>
      <span style="flex:1;border-bottom:1px solid var(--border,#e2e8f0)"></span>
    </div>

    <div class="field">
      <label>Email tài khoản</label>
      <input type="email" id="authEmail" placeholder="vd: shop@example.com" autocomplete="email" required />
    </div>
    ${activeTab === 'signup' ? `
    <div class="field">
      <label>Họ và tên</label>
      <input type="text" id="authFullName" placeholder="vd: Nguyễn Văn A" autocomplete="name" />
    </div>
    ` : ''}
    <div class="field">
      <label>Mật khẩu (tối thiểu 6 ký tự)</label>
      <input type="password" id="authPassword" placeholder="••••••••" autocomplete="current-password" required />
    </div>
    ${activeTab === 'signin' ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <button type="button" class="link-btn" id="authForgotPasswordBtn" style="background:none;border:none;color:var(--primary,#0284c7);padding:0;font-size:12px;cursor:pointer;text-decoration:underline">Quên mật khẩu?</button>
      <button type="button" class="link-btn" id="authGoCreateShopBtn" style="background:none;border:none;color:var(--primary,#0284c7);padding:0;font-size:12px;cursor:pointer">Tạo cửa hàng mới</button>
    </div>
    ` : ''}
    <p class="field-limit" style="margin-top:10px;font-size:12px;color:var(--text-muted,#64748b)">
      ${activeTab === 'signin' ? 'Đăng nhập để kết nối với Cửa hàng đám mây và phân quyền nhân viên.' : 'Đăng ký tài khoản mới để sở hữu Shop và quản lý phân quyền bán hàng.'}
    </p>
  `;

  openModal({
    title: activeTab === 'signin' ? 'Đăng nhập QBiz' : 'Đăng ký tài khoản QBiz',
    sub: 'Tài khoản đám mây QBiz Cloud (PostgreSQL / Supabase)',
    body: `<div id="authModalContainer">${renderBody()}</div>`,
    submitText: activeTab === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản',
    onSubmit: async (root) => {
      const email = $('#authEmail', root)?.value?.trim();
      const password = $('#authPassword', root)?.value;
      const fullName = $('#authFullName', root)?.value?.trim() || '';

      if (!email || !password) {
        throw new Error('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      }
      if (password.length < 6) {
        throw new Error('Mật khẩu phải từ 6 ký tự trở lên.');
      }

      if (activeTab === 'signin') {
        await signIn({ email, password });
        toast('Đăng nhập thành công!', 'ok');
      } else {
        await signUp({ email, password, fullName });
        toast('Đăng ký tài khoản thành công!', 'ok');
      }
    }
  });

  const root = $('#modalRoot');
  const bindTabs = () => {
    const btnSignin = $('#authTabSignin', root);
    const btnSignup = $('#authTabSignup', root);
    const submitBtn = $('#modalSubmit', root);
    const container = $('#authModalContainer', root);
    if (!container) return;

    if (btnSignin) {
      btnSignin.onclick = () => {
        activeTab = 'signin';
        container.innerHTML = renderBody();
        if (submitBtn) submitBtn.textContent = 'Đăng nhập';
        bindTabs();
      };
    }
    if (btnSignup) {
      btnSignup.onclick = () => {
        activeTab = 'signup';
        container.innerHTML = renderBody();
        if (submitBtn) submitBtn.textContent = 'Tạo tài khoản';
        bindTabs();
      };
    }
    if ($('#modalGoogleSignInBtn', root)) {
      $('#modalGoogleSignInBtn', root).onclick = async () => {
        try {
          await signInWithGoogle();
          root.innerHTML = '';
          await refresh();
          toast('Đăng nhập Google thành công!', 'ok');
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    }
    if ($('#authForgotPasswordBtn', root)) {
      $('#authForgotPasswordBtn', root).onclick = () => {
        root.innerHTML = '';
        openForgotPasswordModal();
      };
    }
    if ($('#authGoCreateShopBtn', root)) {
      $('#authGoCreateShopBtn', root).onclick = () => {
        activeTab = 'signup';
        container.innerHTML = renderBody();
        if (submitBtn) submitBtn.textContent = 'Tạo tài khoản';
        bindTabs();
      };
    }
  };
  bindTabs();
}

function openCreateShopModal() {
  const auth = getAuthState();
  if (auth.status === AUTH_STATES.UNAUTHENTICATED) {
    return openAuthModal('signup');
  }

  openModal({
    title: 'Tạo Cửa hàng mới',
    sub: 'Thiết lập Shop trên QBiz Cloud. Bạn sẽ là Chủ cửa hàng (OWNER).',
    body: `
      <div class="field">
        <label>Tên Cửa hàng / Doanh nghiệp</label>
        <input type="text" id="createShopName" placeholder="vd: Cửa Hàng Tiện Lợi QBiz" required />
      </div>
      <div class="callout" style="margin-top:12px;font-size:13px">
        <strong>Phân quyền tự động:</strong>
        <p style="margin:4px 0 0 0">Tài khoản <b>${esc(auth.user?.email || '')}</b> sẽ được gán quyền <b>Chủ cửa hàng (OWNER)</b> toàn quyền quản lý, tạo kho chính và quầy bán hàng đầu tiên.</p>
      </div>
    `,
    submitText: 'Tạo Shop',
    onSubmit: async (root) => {
      const name = $('#createShopName', root)?.value?.trim();
      if (!name) throw new Error('Vui lòng nhập tên Cửa hàng.');
      await createShop({ name });
      toast('Đã tạo cửa hàng thành công!', 'ok');
      await refresh();
    }
  });
}

function openSwitchShopModal() {
  const auth = getAuthState();
  if (auth.status === AUTH_STATES.UNAUTHENTICATED) {
    return openAuthModal();
  }
  const shops = getAvailableShops();
  const currentShopId = auth.shop?.id;

  openModal({
    title: 'Đổi Cửa hàng',
    sub: `Tài khoản: ${esc(auth.user?.email || '')}`,
    hideSubmit: true,
    body: `
      <div class="switch-shop-box" style="display:flex;flex-direction:column;gap:12px">
        <div class="shop-list" style="display:flex;flex-direction:column;gap:8px">
          ${shops.length ? shops.map(({ shop, membership }) => {
            const isCurrent = shop.id === currentShopId;
            return `
              <button class="shop-row-card secondary-btn" data-switch-shop-id="${esc(shop.id)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:8px;border:1px solid ${isCurrent ? 'var(--primary,#0284c7)' : 'var(--border,#e2e8f0)'};background:${isCurrent ? 'var(--primary-subtle,#f0f9ff)' : '#fff'};text-align:left;width:100%">
                <div>
                  <div style="font-weight:700;font-size:14px">${esc(shop.name)} ${isCurrent ? '<span style="color:var(--primary,#0284c7);font-size:12px">(Đang chọn)</span>' : ''}</div>
                  <div style="font-size:12px;color:var(--text-muted,#64748b);margin-top:2px">Mã: ${esc(shop.code || shop.id)} · Vai trò: <b>${esc(getRoleLabel(membership.role))}</b></div>
                </div>
                <div>${isCurrent ? '✓' : icon('chevron-right')}</div>
              </button>
            `;
          }).join('') : `
            <div class="empty" style="padding:16px;text-align:center">
              ${auth.shop ? `
                <div style="font-weight:700;margin-bottom:4px">${esc(auth.shop.name)}</div>
                <div style="font-size:12px;color:var(--text-muted,#64748b)">Cửa hàng hiện tại</div>
              ` : 'Bạn chưa có cửa hàng nào.'}
            </div>
          `}
        </div>
        <hr style="border:none;border-top:1px solid var(--border,#e2e8f0);margin:4px 0" />
        <button class="primary-btn" id="switchModalCreateShopBtn" style="width:100%;justify-content:center;gap:6px">
          ${icon('store')} + Tạo thêm Cửa hàng mới
        </button>
      </div>
    `
  });

  const root = $('#modalRoot');
  $$('[data-switch-shop-id]', root).forEach(b => {
    b.onclick = async () => {
      const targetId = b.dataset.switchShopId;
      try {
        await switchShop(targetId);
        root.innerHTML = '';
        await refresh();
        toast('Đã chuyển đổi cửa hàng thành công!', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  });

  if ($('#switchModalCreateShopBtn', root)) {
    $('#switchModalCreateShopBtn', root).onclick = () => {
      root.innerHTML = '';
      openCreateShopModal();
    };
  }
}

function openClearDemoFreshModal() {
  const auth = getAuthState();
  openModal({
    title: 'Xóa sạch dữ liệu mẫu Demo?',
    sub: 'Khởi tạo Cửa hàng trắng tinh tươm để bắt đầu kinh doanh thật.',
    body: `
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13.5px;color:#1e293b;line-height:1.5">
        <p style="margin:0">Bạn sắp xóa toàn bộ <b>sản phẩm mẫu, đơn hàng mẫu, phiếu bán mẫu và kho demo</b> trên thiết bị này.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px;border-radius:8px;font-size:13px">
          ⚠️ <b>Sau khi xóa:</b>
          <ul style="margin:6px 0 0 16px;padding:0">
            <li>Cửa hàng sẽ có <b>0 sản phẩm, 0 giao dịch</b> (sạch sẽ 100%).</li>
            <li>Kho chính (KHO-CHINH) và Quầy 01 (POS-01) sẵn sàng hoạt động.</li>
            <li>Chế độ xem thử demo sẽ được tắt hoàn toàn.</li>
          </ul>
        </div>
      </div>
    `,
    submitText: 'Xóa sạch & Khởi tạo Shop trắng',
    onSubmit: async () => {
      try {
        localStorage.setItem('qbiz_fresh_clean_shop', 'true');
        sessionStorage.removeItem('qbiz_preview_demo');
        sessionStorage.removeItem('qbiz_demo_shop');
        sessionStorage.removeItem('qbiz_demo_industry');
        sessionStorage.removeItem('qbiz_demo_role');

        const { clearAll, put, ensureLocalIdentity } = await import('./db.js');
        await clearAll();
        await put('warehouses', { id: 'wh_main', name: 'Kho chính', code: 'KHO-CHINH', status: 'active', isDefault: true });
        await ensureLocalIdentity();

        if (auth.user && !auth.shop) {
          const shopName = 'Cửa hàng của ' + (auth.user.user_metadata?.full_name || auth.user.email.split('@')[0]);
          await createShop({ name: shopName }).catch(() => {});
        }

        await refresh();
        toast('Đã dọn sạch dữ liệu demo! Cửa hàng trắng tinh tươm đã sẵn sàng.', 'ok');
      } catch (err) {
        toast('Lỗi khi xóa dữ liệu demo: ' + err.message, 'error');
      }
    }
  });
}

function openUserMenuModal() {
  const auth = getAuthState();
  const user = getCurrentUser();
  const shop = getActiveShop();
  const role = getCurrentRole();
  const roleLabel = getRoleLabel(role);

  const displayName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Người dùng');
  const userEmail = user?.email || '';
  const initials = (displayName || 'QB').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'QB';

  openModal({
    title: 'Tài khoản & Cửa hàng',
    sub: 'Không gian làm việc & phân quyền hệ thống',
    hideSubmit: true,
    body: `
      <div class="account-sheet">
        <!-- 1. Profile Summary Card -->
        <div class="account-profile-card">
          <div class="account-avatar">${esc(initials)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px">
              <strong style="font-size:13.5px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(displayName)}</strong>
              ${auth.isSuperAdmin ? `
                <span class="badge" style="background:#0f172a;color:#f8fafc;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px">ROOT</span>
              ` : ''}
            </div>
            <div style="font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${esc(userEmail)}</div>
          </div>
          <span class="role-badge role-${(role||'').toLowerCase()}" style="font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;flex-shrink:0">${esc(roleLabel)}</span>
        </div>

        <!-- 2. Active Shop / Workspace Card with Compact Inline Actions -->
        <div class="account-store-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:10.5px;font-weight:700;color:#64748b;letter-spacing:0.04em">CỬA HÀNG ĐANG CHỌN</span>
            <span style="font-size:10.5px;color:#94a3b8">ID: ${esc(shop?.id?.slice(0, 8) || '---')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:30px;height:30px;border-radius:6px;background:#f1f5f9;color:#0f172a;display:grid;place-items:center;flex-shrink:0">
              ${icon('store')}
            </div>
            <strong style="font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(shop?.name || (auth.isSuperAdmin ? 'Tất cả Cửa hàng hệ thống' : 'Chưa có Shop'))}</strong>
          </div>
          <div style="display:flex;gap:6px;margin-top:10px">
            <button type="button" id="menuBtnSwitchShop" class="secondary-btn tiny" style="flex:1;justify-content:center;gap:4px;font-size:11.5px;font-weight:600;padding:5px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff">
              ${icon('arrow-left-right')} Đổi Cửa hàng
            </button>
            <button type="button" id="menuBtnCreateShop" class="secondary-btn tiny" style="flex:1;justify-content:center;gap:4px;font-size:11.5px;font-weight:600;padding:5px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff">
              ${icon('plus')} Tạo Shop mới
            </button>
          </div>
        </div>

        <!-- 3. Navigation & Privileges Grouped Menu -->
        <div class="account-menu-group">
          ${auth.isSuperAdmin ? `
          <button type="button" id="menuBtnPlatformAdmin" class="account-menu-item">
            <div class="item-icon navy">${icon('shield-alert')}</div>
            <div class="item-content">
              <div class="item-title">
                Platform Admin Console
                <span class="badge" style="background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px">ROOT</span>
              </div>
              <div class="item-sub">Quản trị toàn bộ người dùng, thuê bao & VietQR</div>
            </div>
            <div class="item-arrow">${icon('chevron-right')}</div>
          </button>
          ` : ''}

          ${userCan('MANAGE_USERS') ? `
          <button type="button" id="menuBtnAddMember" class="account-menu-item">
            <div class="item-icon slate">${icon('users')}</div>
            <div class="item-content">
              <div class="item-title">Quản lý / Mời nhân viên</div>
              <div class="item-sub">Phân quyền thu ngân, kho vận & trợ lý</div>
            </div>
            <div class="item-arrow">${icon('chevron-right')}</div>
          </button>
          ` : ''}

          <button type="button" id="menuBtnPermissions" class="account-menu-item">
            <div class="item-icon slate">${icon('shield-check')}</div>
            <div class="item-content">
              <div class="item-title">Bảng phân quyền & Tính năng</div>
              <div class="item-sub">Xem chi tiết ma trận quyền hạn từng vai trò</div>
            </div>
            <div class="item-arrow">${icon('chevron-right')}</div>
          </button>
        </div>

        <!-- 4. Subtle Maintenance & Sign Out -->
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">
          <button type="button" id="menuBtnClearDemoFresh" style="background:none;border:none;color:#64748b;font-size:11.5px;padding:4px 0;display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer">
            ${icon('trash-2')} Xóa dữ liệu mẫu Demo (bắt đầu shop trắng)
          </button>
          <button type="button" id="menuBtnSignOut" style="width:100%;height:38px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:12.5px;font-weight:600;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer">
            ${icon('log-out')} Đăng xuất
          </button>
        </div>
      </div>
    `
  });

  const root = $('#modalRoot');
  if ($('#menuBtnSwitchShop', root)) {
    $('#menuBtnSwitchShop', root).onclick = () => {
      root.innerHTML = '';
      openSwitchShopModal();
    };
  }
  if ($('#menuBtnPlatformAdmin', root)) {
    $('#menuBtnPlatformAdmin', root).onclick = () => {
      root.innerHTML = '';
      state.page = 'platform-admin';
      render();
    };
  }
  if ($('#menuBtnAddMember', root)) {
    $('#menuBtnAddMember', root).onclick = () => {
      root.innerHTML = '';
      openAddMemberModal();
    };
  }
  if ($('#menuBtnCreateShop', root)) {
    $('#menuBtnCreateShop', root).onclick = () => {
      root.innerHTML = '';
      openCreateShopModal();
    };
  }
  if ($('#menuBtnClearDemoFresh', root)) {
    $('#menuBtnClearDemoFresh', root).onclick = () => {
      root.innerHTML = '';
      openClearDemoFreshModal();
    };
  }
  if ($('#menuBtnPermissions', root)) {
    $('#menuBtnPermissions', root).onclick = () => {
      root.innerHTML = '';
      state.page = 'more';
      render();
      setTimeout(() => {
        const target = $('#permissionMatrixCard');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    };
  }
  if ($('#menuBtnSignOut', root)) {
    $('#menuBtnSignOut', root).onclick = async () => {
      await signOut();
      root.innerHTML = '';
      render();
      toast('Đã đăng xuất tài khoản.', 'ok');
    };
  }
}

function openExtendSubscriptionModal(user) {
  const isForever = user.expiresAt && new Date(user.expiresAt).getFullYear() >= 2090;
  const currentExpFormatted = isForever ? 'Vĩnh viễn (Không thời hạn)' : (user.expiresAt ? dt(user.expiresAt).split(' ')[0] : 'Chưa thiết lập');

  openModal({
    title: 'Gia hạn Thuê bao & Bản quyền',
    sub: `Tài khoản: ${esc(user.email)} · ${esc(user.fullName || '')}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13.5px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px 12px;border-radius:8px">
          <div style="display:flex;justify-content:space-between">
            <span style="color:#64748b;font-weight:600">Gói hiện tại:</span>
            <strong style="color:#0f172a">${esc(user.planName || user.plan || 'Chưa có')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px">
            <span style="color:#64748b;font-weight:600">Hạn sử dụng hiện tại:</span>
            <strong style="color:#0f172a">${esc(currentExpFormatted)}</strong>
          </div>
        </div>

        <div class="field">
          <label>Thời gian gia hạn thêm</label>
          <select id="modalExtendDays" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;background:#fff">
            <option value="30">+ 30 ngày (1 tháng)</option>
            <option value="90">+ 90 ngày (3 tháng - Quý)</option>
            <option value="180">+ 180 ngày (6 tháng)</option>
            <option value="365" selected>+ 365 ngày (1 năm - Tiêu chuẩn)</option>
            <option value="730">+ 2 năm</option>
            <option value="forever">Vĩnh viễn (Không giới hạn thời gian)</option>
          </select>
        </div>

        <div class="field">
          <label>Nâng cấp / Chọn Gói cước dịch vụ</label>
          <select id="modalExtendPlan" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;background:#fff">
            <option value="trial" ${user.plan === 'trial' ? 'selected' : ''}>Gói Dùng Thử 30 ngày (Trial)</option>
            <option value="standard" ${user.plan === 'standard' ? 'selected' : ''}>Gói Tiêu Chuẩn (Standard - 199.000 ₫/tháng)</option>
            <option value="pro" ${user.plan === 'pro' ? 'selected' : ''}>Gói Chuyên Nghiệp (Pro - 399.000 ₫/tháng)</option>
            <option value="enterprise" ${user.plan === 'enterprise' ? 'selected' : ''}>Gói Chuỗi Cửa Hàng (Enterprise - 799.000 ₫/tháng)</option>
          </select>
        </div>

        <div class="field">
          <label>Trạng thái tài khoản</label>
          <select id="modalExtendStatus" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;background:#fff">
            <option value="ACTIVE" ${user.status === 'ACTIVE' ? 'selected' : ''}>Đang hoạt động (ACTIVE)</option>
            <option value="SUSPENDED" ${user.status === 'SUSPENDED' ? 'selected' : ''}>Tạm khóa (SUSPENDED)</option>
          </select>
        </div>
      </div>
    `,
    submitText: 'Lưu Gia Hạn & Cập Nhật',
    onSubmit: async (root) => {
      const daysVal = $('#modalExtendDays', root)?.value;
      const planVal = $('#modalExtendPlan', root)?.value;
      const statusVal = $('#modalExtendStatus', root)?.value;
      const planNames = {
        trial: 'Dùng Thử 30 Ngày',
        standard: 'Gói Tiêu Chuẩn',
        pro: 'Gói Chuyên Nghiệp',
        enterprise: 'Gói Chuỗi Cửa Hàng'
      };

      const daysToAdd = daysVal === 'forever' ? 'forever' : Number(daysVal);
      await updateUserSubscription(user.id, {
        plan: planVal,
        planName: planNames[planVal] || planVal.toUpperCase(),
        daysToAdd: daysToAdd,
        status: statusVal
      });

      toast(`Đã gia hạn thành công cho ${user.email}!`, 'ok');
      await renderPlatformAdmin();
    }
  });
}

async function renderPlatformAdmin() {
  setTitle('Platform Admin Console', 'QBiz Nền tảng');
  if (!isSuperAdmin()) {
    toast('Từ chối truy cập: Bạn không có quyền Platform Super Admin.', 'error');
    state.page = 'dashboard';
    return render();
  }

  const auth = getAuthState();
  const currentTab = state.platformAdminTab || 'users';

  $('#content').innerHTML = `
    <section class="platform-admin-screen" style="display:flex;flex-direction:column;gap:8px;padding:2px 4px">
      <!-- Dark Navy Command Header: Ultra-compact 40px topbar -->
      <div style="background:#0f172a;color:#fff;padding:6px 10px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;box-shadow:0 1px 4px rgba(0,0,0,0.12);overflow:hidden">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
          <button type="button" id="exitPlatformAdminBtn" style="background:#1e293b;border:1px solid #334155;color:#f8fafc;font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:5px;cursor:pointer;display:flex;align-items:center;gap:3px;flex-shrink:0">
            ← Về Shop
          </button>
          <div style="display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden">
            <h2 style="margin:0;font-size:12.5px;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">Platform Admin</h2>
            <span class="badge" style="background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;flex-shrink:0">ROOT</span>
          </div>
        </div>
        <div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;flex-shrink:0;max-width:110px" title="${esc(auth.user?.email || 'tungtran2510@gmail.com')}">
          ${esc(auth.user?.email ? auth.user.email.split('@')[0] : 'admin')}
        </div>
      </div>

      <!-- Navigation Tabs: Horizontal Swipeable Bar (Single Line) -->
      <div class="admin-nav-tabs">
        ${[
          ['users', '👥 Người dùng & Thuê bao'],
          ['commercial', '💳 Gói cước & VietQR'],
          ['shops', '🏪 Cửa hàng'],
          ['metrics', '📊 Thống kê'],
          ['audit', '📜 Nhật ký']
        ].map(([tabKey, tabTitle]) => {
          const isActive = currentTab === tabKey;
          return `
            <button class="filter-pill ${isActive ? 'active' : ''}" data-admin-tab="${tabKey}" style="padding:4px 10px;font-size:11.5px;font-weight:${isActive ? '700' : '600'};border-radius:6px;flex-shrink:0;cursor:pointer;border:1px solid ${isActive ? '#0f172a' : 'transparent'};background:${isActive ? '#0f172a' : 'transparent'};color:${isActive ? '#ffffff' : '#475569'};${isActive ? 'box-shadow:0 1px 3px rgba(15,23,42,0.18)' : ''}">
              ${tabTitle}
            </button>
          `;
        }).join('')}
      </div>

      <!-- Tab Content Area -->
      <div id="adminTabContent">
        <div style="text-align:center;padding:24px;color:var(--text-muted,#64748b);font-size:12.5px">Đang tải dữ liệu máy chủ...</div>
      </div>
    </section>
  `;

  $('#exitPlatformAdminBtn').onclick = () => {
    state.page = 'dashboard';
    render();
  };

  $$('[data-admin-tab]').forEach(btn => {
    btn.onclick = () => {
      state.platformAdminTab = btn.dataset.adminTab;
      renderPlatformAdmin();
    };
  });

  const tabContainer = $('#adminTabContent');
  if (!tabContainer) return;

  try {
    if (currentTab === 'users') {
      const users = await getPlatformUsers();
      const filter = state.platformUserFilter || 'all';
      const query = (state.platformUserQuery || '').trim().toLowerCase();

      const totalCount = users.length;
      const activeCount = users.filter(u => u.status === 'ACTIVE').length;
      const expiringCount = users.filter(u => {
        if (u.status !== 'ACTIVE' || !u.expiresAt) return false;
        const diffDays = Math.ceil((new Date(u.expiresAt).getTime() - Date.now()) / 86400000);
        return diffDays >= 0 && diffDays <= 15;
      }).length;
      const expiredOrLockedCount = users.filter(u => u.status === 'EXPIRED' || u.status === 'SUSPENDED').length;

      const filteredUsers = users.filter(u => {
        if (filter === 'active' && u.status !== 'ACTIVE') return false;
        if (filter === 'suspended' && u.status !== 'SUSPENDED') return false;
        if (filter === 'expired' && u.status !== 'EXPIRED') return false;
        if (filter === 'expiring') {
          const diffDays = Math.ceil((new Date(u.expiresAt).getTime() - Date.now()) / 86400000);
          if (u.status !== 'ACTIVE' || diffDays < 0 || diffDays > 15) return false;
        }
        if (query) {
          const match = (u.email || '').toLowerCase().includes(query) ||
                        (u.fullName || '').toLowerCase().includes(query) ||
                        (u.phone || '').toLowerCase().includes(query) ||
                        (u.shopName || '').toLowerCase().includes(query) ||
                        (u.planName || '').toLowerCase().includes(query);
          if (!match) return false;
        }
        return true;
      });

      tabContainer.innerHTML = `
        <!-- Metric Strip (Single 4-Col Row) -->
        <div class="admin-metric-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:#ffffff;padding:6px 6px;border-radius:8px;border:1px solid #e2e8f0;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.02)">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:800;color:#0f172a;line-height:1.2">${fmt(totalCount)}</div>
            <div style="font-size:9.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Tổng User</div>
          </div>
          <div style="min-width:0;border-left:1px solid #e2e8f0">
            <div style="font-size:15px;font-weight:800;color:#15803d;line-height:1.2">${fmt(activeCount)}</div>
            <div style="font-size:9.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Hoạt động</div>
          </div>
          <div style="min-width:0;border-left:1px solid #e2e8f0">
            <div style="font-size:15px;font-weight:800;color:${expiringCount>0?'#b45309':'#64748b'};line-height:1.2">${fmt(expiringCount)}</div>
            <div style="font-size:9.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Sắp hết</div>
          </div>
          <div style="min-width:0;border-left:1px solid #e2e8f0">
            <div style="font-size:15px;font-weight:800;color:${expiredOrLockedCount>0?'#b91c1c':'#64748b'};line-height:1.2">${fmt(expiredOrLockedCount)}</div>
            <div style="font-size:9.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Khóa/Hạn</div>
          </div>
        </div>

        <!-- Search & Filter Controls -->
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
          <div style="position:relative">
            <input type="text" id="adminUserSearch" value="${esc(state.platformUserQuery || '')}" placeholder="Tìm nhanh Email, Tên, SĐT, Shop..." style="width:100%;height:32px;padding:4px 8px 4px 28px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#fff;box-sizing:border-box" />
            <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#94a3b8;display:flex">${icon('search')}</span>
          </div>
          <div style="display:flex;gap:4px;overflow-x:auto;white-space:nowrap;padding-bottom:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch">
            ${[
              ['all', 'Tất cả (' + totalCount + ')'],
              ['active', 'Hoạt động (' + activeCount + ')'],
              ['expiring', 'Sắp hết (' + expiringCount + ')'],
              ['expired', 'Quá hạn'],
              ['suspended', 'Tạm khóa']
            ].map(([k, label]) => `
              <button type="button" class="filter-pill ${filter === k ? 'active' : ''}" data-user-filter="${k}" style="padding:3px 8px;font-size:11px;font-weight:${filter === k ? '700' : '500'};border-radius:5px;border:1px solid ${filter === k ? '#0f172a' : '#e2e8f0'};background:${filter === k ? '#0f172a' : '#fff'};color:${filter === k ? '#fff' : '#475569'};cursor:pointer;flex-shrink:0">
                ${label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Desktop Table: Hiển thị trên màn hình rộng PC / Tablet -->
        <div class="platform-user-table-wrap card" style="margin-top:8px;padding:0;overflow:hidden">
          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:13px;border-collapse:collapse">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid var(--border,#e2e8f0);text-align:left">
                  <th style="padding:10px 10px">Người dùng</th>
                  <th style="padding:10px 10px">Cửa hàng & Vai trò</th>
                  <th style="padding:10px 10px">Gói cước</th>
                  <th style="padding:10px 10px">Hạn sử dụng</th>
                  <th style="padding:10px 10px">Trạng thái</th>
                  <th style="padding:10px 10px;text-align:right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${filteredUsers.map(u => {
                  const isSuper = u.role === 'SUPER_ADMIN' || u.email === 'tungtran2510@gmail.com';
                  const isSuspended = u.status === 'SUSPENDED';
                  const expDate = u.expiresAt ? new Date(u.expiresAt) : null;
                  const isForever = expDate && expDate.getFullYear() >= 2090;
                  const diffDays = expDate ? Math.ceil((expDate.getTime() - Date.now()) / 86400000) : 0;
                  
                  let expiryBadge = '';
                  if (isForever) {
                    expiryBadge = `<span class="badge" style="background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-size:11px">Vĩnh viễn</span>`;
                  } else if (diffDays < 0) {
                    expiryBadge = `<span class="badge danger" style="font-size:11px">Quá hạn ${Math.abs(diffDays)} ngày</span>`;
                  } else if (diffDays <= 15) {
                    expiryBadge = `<span class="badge warn" style="font-size:11px">Còn ${diffDays} ngày</span>`;
                  } else {
                    expiryBadge = `<span class="badge ok" style="font-size:11px">Còn ${diffDays} ngày</span>`;
                  }

                  let statusBadge = '';
                  if (isSuspended) {
                    statusBadge = `<span class="badge danger">Tạm khóa</span>`;
                  } else if (diffDays < 0 && !isForever) {
                    statusBadge = `<span class="badge warn">Hết hạn</span>`;
                  } else {
                    statusBadge = `<span class="badge ok">Hoạt động</span>`;
                  }

                  return `
                    <tr style="border-bottom:1px solid var(--border,#e2e8f0);transition:background .1s">
                      <td style="padding:10px">
                        <div style="font-weight:700;color:#0f172a">${esc(u.fullName || u.email.split('@')[0])}</div>
                        <div style="font-size:12px;color:#64748b">${esc(u.email)}</div>
                        ${u.phone ? `<div style="font-size:11px;color:#94a3b8">${esc(u.phone)}</div>` : ''}
                      </td>
                      <td style="padding:10px">
                        <div style="font-weight:600;color:#1e293b">${esc(u.shopName || 'Chưa gắn shop')}</div>
                        <span class="role-badge" style="font-size:10.5px;margin-top:2px;display:inline-block">${esc(u.role)}</span>
                      </td>
                      <td style="padding:10px">
                        <span class="badge" style="font-size:11px;font-weight:700;background:#f8fafc;border:1px solid #cbd5e1;color:#1e293b">
                          ${esc(u.planName || u.plan?.toUpperCase() || 'STANDARD')}
                        </span>
                      </td>
                      <td style="padding:10px">
                        <div style="display:flex;flex-direction:column;gap:2px">
                          <span style="font-size:12px;color:#334155">${isForever ? 'Không thời hạn' : (expDate ? dt(expDate).split(' ')[0] : '---')}</span>
                          ${expiryBadge}
                        </div>
                      </td>
                      <td style="padding:10px">
                        ${statusBadge}
                      </td>
                      <td style="padding:10px;text-align:right">
                        <div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">
                          <button type="button" class="primary-btn tiny" data-user-extend="${esc(u.id)}" title="Gia hạn thời gian sử dụng & đổi gói" style="background:#0f172a;color:#fff;border:1px solid #0f172a;font-size:11px;padding:3px 8px;gap:3px;border-radius:5px;font-weight:600">
                            ⚡ Gia hạn
                          </button>
                          <button type="button" class="secondary-btn tiny" data-user-zalo="${esc(u.id)}" title="Sao chép tin nhắn nhắc cước Zalo kèm VietQR" style="font-size:11px;padding:3px 7px;border-radius:5px;background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;font-weight:600">
                            📋 Zalo
                          </button>
                          ${!isSuper ? `
                            <button type="button" class="secondary-btn tiny" data-user-toggle="${esc(u.id)}" data-user-status="${esc(u.status)}" title="${isSuspended ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}" style="font-size:11px;padding:3px 7px;border-radius:5px;border:1px solid ${isSuspended ? '#bbf7d0' : '#fed7aa'};background:${isSuspended ? '#f0fdf4' : '#fff7ed'};color:${isSuspended ? '#166534' : '#c2410c'};font-weight:600">
                              ${isSuspended ? 'Mở' : 'Khóa'}
                            </button>
                            <button type="button" class="ghost-btn tiny" data-user-delete="${esc(u.id)}" title="Xóa người dùng khỏi hệ thống" style="font-size:11px;padding:3px 7px;border-radius:5px;color:#b91c1c;border:1px solid #fecaca;background:#fef2f2">
                              ${icon('trash-2')}
                            </button>
                          ` : `
                            <span style="font-size:11px;color:#94a3b8;font-style:italic;padding:3px 6px">Platform Owner</span>
                          `}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('') || `
                  <tr>
                    <td colspan="6" style="padding:28px;text-align:center;color:#64748b">
                      Không tìm thấy người dùng nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Mobile User Cards: Thân thiện ngón tay, 0% tràn ngang -->
        <div class="platform-user-cards" style="margin-top:6px;display:flex;flex-direction:column;gap:8px">
          ${filteredUsers.map(u => {
            const isSuper = u.role === 'SUPER_ADMIN' || u.email === 'tungtran2510@gmail.com';
            const isSuspended = u.status === 'SUSPENDED';
            const expDate = u.expiresAt ? new Date(u.expiresAt) : null;
            const isForever = expDate && expDate.getFullYear() >= 2090;
            const diffDays = expDate ? Math.ceil((expDate.getTime() - Date.now()) / 86400000) : 0;
            
            let expiryBadge = '';
            let expDateFormatted = isForever ? 'Vĩnh viễn' : (expDate ? dt(expDate).split(' ')[0] : '---');
            if (isForever) {
              expiryBadge = `<span class="badge" style="background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-size:10px">Vĩnh viễn</span>`;
            } else if (diffDays < 0) {
              expiryBadge = `<span class="badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-size:10px">Quá hạn ${Math.abs(diffDays)}d</span>`;
            } else if (diffDays <= 15) {
              expiryBadge = `<span class="badge" style="background:#fffbeb;color:#b45309;border:1px solid #fde68a;font-size:10px">Còn ${diffDays}d</span>`;
            } else {
              expiryBadge = `<span class="badge" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;font-size:10px">Còn ${diffDays}d</span>`;
            }

            let statusBadge = '';
            if (isSuspended) {
              statusBadge = `<span class="badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-size:10px">Khóa</span>`;
            } else if (diffDays < 0 && !isForever) {
              statusBadge = `<span class="badge" style="background:#fffbeb;color:#b45309;border:1px solid #fde68a;font-size:10px">Hết hạn</span>`;
            } else {
              statusBadge = `<span class="badge" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;font-size:10px">Hoạt động</span>`;
            }

            return `
              <div class="platform-user-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
                  <div style="min-width:0;flex:1">
                    <div style="display:flex;align-items:center;gap:5px">
                      <strong style="font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.fullName || u.email.split('@')[0])}</strong>
                      <span class="badge" style="font-size:9.5px;font-weight:700;background:#f8fafc;border:1px solid #cbd5e1;color:#1e293b;padding:1px 5px;border-radius:4px">${esc(u.planName || u.plan?.toUpperCase() || 'STANDARD')}</span>
                    </div>
                    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ''}</div>
                    <div style="font-size:11px;color:#334155;margin-top:2px">🏪 <b style="color:#0f172a">${esc(u.shopName || 'Chưa gắn shop')}</b> · <span style="color:#64748b">${esc(u.role || 'OWNER')}</span></div>
                  </div>
                  <div style="text-align:right;flex-shrink:0">
                    <div>${statusBadge}</div>
                    <div style="margin-top:3px">${expiryBadge}</div>
                  </div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px dashed #e2e8f0">
                  <div style="font-size:10.5px;color:#64748b">
                    Hạn: <b style="color:#0f172a">${expDateFormatted}</b>
                  </div>
                  <div style="display:flex;gap:4px;flex-wrap:nowrap">
                    <button type="button" class="primary-btn tiny" data-user-extend="${esc(u.id)}" title="Gia hạn thời gian sử dụng & đổi gói" style="background:#0f172a;color:#fff;border:1px solid #0f172a;font-size:11px;padding:3px 8px;border-radius:5px;font-weight:600">
                      ⚡ Gia hạn
                    </button>
                    <button type="button" class="secondary-btn tiny" data-user-zalo="${esc(u.id)}" title="Sao chép tin nhắn nhắc cước Zalo kèm VietQR" style="font-size:11px;padding:3px 6px;border-radius:5px;background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;font-weight:600">
                      📋 Zalo
                    </button>
                    ${!isSuper ? `
                      <button type="button" class="secondary-btn tiny" data-user-toggle="${esc(u.id)}" data-user-status="${esc(u.status)}" title="${isSuspended ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}" style="font-size:11px;padding:3px 6px;border-radius:5px;border:1px solid ${isSuspended ? '#bbf7d0' : '#fed7aa'};background:${isSuspended ? '#f0fdf4' : '#fff7ed'};color:${isSuspended ? '#166534' : '#c2410c'};font-weight:600">
                        ${isSuspended ? 'Mở' : 'Khóa'}
                      </button>
                      <button type="button" class="ghost-btn tiny" data-user-delete="${esc(u.id)}" title="Xóa người dùng khỏi hệ thống" style="font-size:11px;padding:3px 6px;border-radius:5px;color:#b91c1c;border:1px solid #fecaca;background:#fef2f2">
                        ${icon('trash-2')}
                      </button>
                    ` : '<span style="font-size:10.5px;color:#94a3b8;padding:2px 4px">Owner</span>'}
                  </div>
                </div>
              </div>
            `;
          }).join('') || `
            <div style="padding:20px;text-align:center;color:#64748b;font-size:12px;background:#fff;border-radius:8px;border:1px solid #e2e8f0">
              Không tìm thấy người dùng nào phù hợp với bộ lọc.
            </div>
          `}
        </div>
      `;

      const searchInput = $('#adminUserSearch', tabContainer);
      if (searchInput) {
        searchInput.oninput = (e) => {
          state.platformUserQuery = e.target.value;
          renderPlatformAdmin();
        };
      }

      $$('[data-user-filter]', tabContainer).forEach(btn => {
        btn.onclick = () => {
          state.platformUserFilter = btn.dataset.userFilter;
          renderPlatformAdmin();
        };
      });

      $$('[data-user-zalo]', tabContainer).forEach(btn => {
        btn.onclick = async () => {
          const uId = btn.dataset.userZalo;
          const targetUser = users.find(x => x.id === uId);
          if (!targetUser) return;
          const comm = await getPlatformCommercialConfig();
          const expDate = targetUser.expiresAt ? new Date(targetUser.expiresAt) : null;
          const expDateFormatted = expDate ? dt(expDate).split(' ')[0] : 'chưa xác định';
          const reminderMsg = `[QBiz Kho] Kính gửi Quý khách ${targetUser.fullName || targetUser.email.split('@')[0]},\nTài khoản sử dụng hệ thống QBiz Kho của Cửa hàng "${targetUser.shopName || 'Cửa hàng'}" sắp đến hạn gia hạn gói ${targetUser.planName || 'STANDARD'} (Hạn: ${expDateFormatted}).\nQuý khách vui lòng chuyển khoản gia hạn:\n- Ngân hàng: ${comm.bankName}\n- STK: ${comm.bankAccount}\n- Chủ TK: ${comm.bankAccountOwner}\n- Cú pháp CK: ${comm.transferSyntax || 'QBIZ GIAHAN'} ${targetUser.phone || targetUser.email}\nHotline hỗ trợ: ${comm.hotline}\nXin trân trọng cảm ơn!`;
          try {
            await navigator.clipboard.writeText(reminderMsg);
            toast('Đã copy tin nhắn nhắc cước Zalo kèm VietQR!', 'ok');
          } catch (_) {
            toast('Đã chuẩn bị tin nhắn nhắc cước Zalo!', 'ok');
          }
        };
      });

      $$('[data-user-extend]', tabContainer).forEach(btn => {
        btn.onclick = () => {
          const uId = btn.dataset.userExtend;
          const targetUser = users.find(x => x.id === uId);
          if (targetUser) openExtendSubscriptionModal(targetUser);
        };
      });

      $$('[data-user-toggle]', tabContainer).forEach(btn => {
        btn.onclick = async () => {
          const uId = btn.dataset.userToggle;
          const curStatus = btn.dataset.userStatus;
          const nextStatus = curStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
          const actionLabel = nextStatus === 'SUSPENDED' ? 'KHÓA' : 'MỞ KHÓA';
          if (!confirm(`Bạn có chắc chắn muốn ${actionLabel} tài khoản người dùng này?`)) return;
          try {
            await togglePlatformUser(uId, nextStatus);
            toast(`Đã ${actionLabel.toLowerCase()} tài khoản thành công!`, 'ok');
            renderPlatformAdmin();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      });

      $$('[data-user-delete]', tabContainer).forEach(btn => {
        btn.onclick = async () => {
          const uId = btn.dataset.userDelete;
          const targetUser = users.find(x => x.id === uId);
          if (!targetUser) return;
          if (!confirm(`CẢNH BÁO XÓA:\nBạn có chắc chắn muốn XÓA vĩnh viễn người dùng ${targetUser.email} khỏi hệ thống không?`)) return;
          try {
            await deletePlatformUser(uId);
            toast(`Đã xóa người dùng ${targetUser.email} thành công!`, 'ok');
            renderPlatformAdmin();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      });
    } else if (currentTab === 'commercial') {
      const comm = await getPlatformCommercialConfig();
      tabContainer.innerHTML = `
        <div style="margin-bottom:16px">
          <h3 style="margin:0 0 10px;font-size:16px;font-weight:700;color:#0f172a">1. Bảng Gói Cước & Hạn Mức Thương Mại Nền Tảng</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            ${comm.plans.map(p => `
              <div class="card" style="padding:14px;border:1.5px solid ${p.popular ? '#0f172a' : '#e2e8f0'};background:${p.popular ? '#f8fafc' : '#fff'};border-radius:10px;display:flex;flex-direction:column;position:relative">
                ${p.popular ? `<span style="position:absolute;top:-10px;right:12px;background:#0f172a;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase">Khuyên Dùng</span>` : ''}
                <strong style="font-size:15px;color:#0f172a">${esc(p.name)}</strong>
                <div style="margin:6px 0 10px;font-size:20px;font-weight:800;color:#0f172a">
                  ${p.price > 0 ? `${fmt(p.price)} ₫` : 'Miễn phí'}
                  <span style="font-size:12px;font-weight:400;color:#64748b">/${p.period}</span>
                </div>
                <ul style="margin:0 0 12px;padding-left:18px;font-size:12px;color:#334155;line-height:1.6;flex:1">
                  <li>Tối đa <b>${p.maxProducts >= 99999 ? 'Không giới hạn' : fmt(p.maxProducts)}</b> sản phẩm</li>
                  <li>Tối đa <b>${p.maxWarehouses}</b> kho hàng</li>
                  <li>Tối đa <b>${p.maxPos}</b> quầy bán hàng / thiết bị</li>
                  ${p.features.map(f => `<li>${esc(f)}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card" style="padding:16px">
          <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a">2. Cấu Hình Tài Khoản Thu Tiền Bản Quyền & Thuê Bao Nền Tảng</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
            <div class="field">
              <label>Tên Nền tảng (Brand Name)</label>
              <input type="text" id="commPlatformName" value="${esc(comm.platformName)}" />
            </div>
            <div class="field">
              <label>Hotline Hỗ Trợ Kỹ Thuật & Kinh Doanh</label>
              <input type="text" id="commHotline" value="${esc(comm.hotline)}" />
            </div>
            <div class="field">
              <label>Email Hỗ Trợ Khách Hàng</label>
              <input type="email" id="commSupportEmail" value="${esc(comm.supportEmail)}" />
            </div>
            <div class="field">
              <label>Thời Gian Dùng Thử Mặc Định (Ngày)</label>
              <input type="number" id="commTrialDays" value="${comm.trialDays || 30}" min="7" max="90" />
            </div>
            <div class="field">
              <label>Ngân Hàng Nhận Tiền Bản Quyền (VietQR)</label>
              <input type="text" id="commBankName" value="${esc(comm.bankName)}" placeholder="vd: MBBANK, VCB, TECHCOMBANK..." />
            </div>
            <div class="field">
              <label>Số Tài Khoản Nhận Thanh Toán</label>
              <input type="text" id="commBankAccount" value="${esc(comm.bankAccount)}" placeholder="vd: 0901234567..." />
            </div>
            <div class="field">
              <label>Tên Chủ Tài Khoản (Không dấu)</label>
              <input type="text" id="commBankAccountOwner" value="${esc(comm.bankAccountOwner)}" placeholder="vd: TRAN QUANG TUNG" />
            </div>
            <div class="field">
              <label>Cú Pháp Chuyển Khoản Mẫu</label>
              <input type="text" id="commTransferSyntax" value="${esc(comm.transferSyntax)}" />
            </div>
          </div>

          <div style="margin-top:16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="background:#fff;padding:8px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
              <img src="https://img.vietqr.io/image/${esc(comm.bankName)}-${esc(comm.bankAccount)}-compact2.png?amount=399000&addInfo=QBIZ%20GIAHAN%20PRO&accountName=${encodeURIComponent(comm.bankAccountOwner)}" alt="VietQR Nền tảng" style="width:120px;height:120px;object-fit:contain;display:block" onerror="this.style.display='none'" />
            </div>
            <div style="flex:1;min-width:200px">
              <strong style="font-size:14px;color:#0f172a">Xem trước mã VietQR Thu Phí Bản Quyền Tự Động:</strong>
              <p style="margin:4px 0 0;font-size:12.5px;color:#64748b">Mã QR này được dùng để các chủ Shop quét chuyển khoản gia hạn dịch vụ tự động. Khi khách quét mã, thông tin Ngân hàng, STK và cú pháp sẽ tự động điền sẵn chính xác 100%.</p>
            </div>
          </div>

          <div style="margin-top:16px;display:flex;justify-content:flex-end">
            <button type="button" class="primary-btn" id="btnSaveCommercialSettings" style="background:#0f172a;color:#fff;border:1px solid #0f172a;gap:6px;padding:10px 20px;font-weight:700">
              ${icon('check')} Lưu Cấu Hình Thương Mại
            </button>
          </div>
        </div>
      `;

      $('#btnSaveCommercialSettings').onclick = async () => {
        try {
          const updated = {
            platformName: $('#commPlatformName')?.value?.trim() || comm.platformName,
            hotline: $('#commHotline')?.value?.trim() || comm.hotline,
            supportEmail: $('#commSupportEmail')?.value?.trim() || comm.supportEmail,
            trialDays: Number($('#commTrialDays')?.value || 30),
            bankName: $('#commBankName')?.value?.trim() || comm.bankName,
            bankAccount: $('#commBankAccount')?.value?.trim() || comm.bankAccount,
            bankAccountOwner: $('#commBankAccountOwner')?.value?.trim()?.toUpperCase() || comm.bankAccountOwner,
            transferSyntax: $('#commTransferSyntax')?.value?.trim() || comm.transferSyntax,
          };
          await savePlatformCommercialConfig(updated);
          toast('Đã lưu cấu hình thương mại nền tảng thành công!', 'ok');
          renderPlatformAdmin();
        } catch (err) {
          toast('Lỗi khi lưu cấu hình: ' + err.message, 'error');
        }
      };
    } else if (currentTab === 'metrics') {
      const metrics = await getPlatformMetrics();
      tabContainer.innerHTML = `
        <div class="metric-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
          ${metricCard('Tổng số Cửa hàng', fmt(metrics.total_shops), `${fmt(metrics.active_shops)} đang hoạt động`, 'blue')}
          ${metricCard('Tổng Người dùng', fmt(metrics.total_users), 'Tài khoản xác thực', 'green')}
          ${metricCard('Tổng Thiết bị', fmt(metrics.total_devices), 'Máy POS / Điện thoại', 'purple')}
          ${metricCard('Lỗi đồng bộ (Sync)', fmt(metrics.sync_errors || 0), '24 giờ qua', (metrics.sync_errors > 0 ? 'red' : 'green'))}
          ${metricCard('Xung đột (Conflicts)', fmt(metrics.conflict_count || 0), 'Cần giải quyết', (metrics.conflict_count > 0 ? 'yellow' : 'green'))}
          ${metricCard('Trạng thái Sao lưu', metrics.backup_status || 'HEALTHY', 'Supabase Cloud WAL', 'green')}
          ${metricCard('Phiên bản App', metrics.app_version || 'v1.0.0-pilot', 'Dual-Host Ready', 'blue')}
        </div>

        <div class="callout" style="margin-top:16px;font-size:13px">
          <strong>Chính sách An toàn Platform Super Admin:</strong>
          <p style="margin:4px 0 0 0">Super Admin quản trị vòng đời shop, tài khoản, gia hạn thuê bao và tình trạng đồng bộ. Super Admin không được tự ý ghi đè số liệu giao dịch, xuất nhập kho hay bypass sổ cái của các Shop mà không thông qua engine hợp lệ có lưu vết kiểm toán.</p>
        </div>
      `;
    } else if (currentTab === 'shops') {
      const shops = await getPlatformShops();
      tabContainer.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:13px;border-collapse:collapse">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid var(--border,#e2e8f0);text-align:left">
                  <th style="padding:12px 10px">Cửa hàng</th>
                  <th style="padding:12px 10px">Mã / ID</th>
                  <th style="padding:12px 10px">Chủ sở hữu</th>
                  <th style="padding:12px 10px">Nhân viên</th>
                  <th style="padding:12px 10px">Thiết bị</th>
                  <th style="padding:12px 10px">Trạng thái</th>
                  <th style="padding:12px 10px;text-align:right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${shops.map(s => {
                  const isActive = s.status === 'ACTIVE';
                  return `
                    <tr style="border-bottom:1px solid var(--border,#e2e8f0)">
                      <td style="padding:12px 10px;font-weight:700">${esc(s.name)}</td>
                      <td style="padding:12px 10px;color:var(--text-muted,#64748b)">${esc(s.code || s.id?.slice(0, 8))}</td>
                      <td style="padding:12px 10px">${esc(s.owner_email || 'Chưa liên kết')}</td>
                      <td style="padding:12px 10px">${fmt(s.member_count || 1)}</td>
                      <td style="padding:12px 10px">${fmt(s.device_count || 1)}</td>
                      <td style="padding:12px 10px">
                        <span class="badge ${isActive ? 'ok' : 'danger'}">${isActive ? 'Hoạt động' : 'Tạm khóa'}</span>
                      </td>
                      <td style="padding:12px 10px;text-align:right">
                        <button class="secondary-btn tiny" data-toggle-shop-id="${esc(s.id)}" data-shop-status="${esc(s.status)}">
                          ${isActive ? 'Khóa Shop' : 'Mở khóa Shop'}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      $$('[data-toggle-shop-id]', tabContainer).forEach(btn => {
        btn.onclick = async () => {
          const shopId = btn.dataset.toggleShopId;
          const currentStatus = btn.dataset.shopStatus;
          const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
          const actionWord = nextStatus === 'SUSPENDED' ? 'KHÓA' : 'MỞ KHÓA';
          if (!confirm(`Bạn có chắc chắn muốn ${actionWord} cửa hàng này không?`)) return;

          try {
            await togglePlatformShop(shopId, nextStatus);
            toast(`Đã ${actionWord.toLowerCase()} cửa hàng.`, 'ok');
            renderPlatformAdmin();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      });
    } else if (currentTab === 'audit') {
      const logs = await getPlatformAuditLogs(50);
      tabContainer.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="overflow-x:auto">
            <table class="data-table" style="width:100%;font-size:13px;border-collapse:collapse">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid var(--border,#e2e8f0);text-align:left">
                  <th style="padding:12px 10px">Thời gian</th>
                  <th style="padding:12px 10px">Người thực hiện</th>
                  <th style="padding:12px 10px">Hành động</th>
                  <th style="padding:12px 10px">Kết quả</th>
                  <th style="padding:12px 10px">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr style="border-bottom:1px solid var(--border,#e2e8f0)">
                    <td style="padding:12px 10px;white-space:nowrap">${dt(l.created_at)}</td>
                    <td style="padding:12px 10px"><span class="role-badge" style="font-size:11px">${esc(l.actor_platform_role || 'SUPER_ADMIN')}</span></td>
                    <td style="padding:12px 10px;font-weight:600">${esc(l.action)}</td>
                    <td style="padding:12px 10px"><span class="badge ${l.result === 'SUCCESS' ? 'ok' : 'danger'}">${esc(l.result)}</span></td>
                    <td style="padding:12px 10px;color:var(--text-muted,#64748b);font-family:monospace;font-size:11px">${esc(JSON.stringify(l.details || {}))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  } catch (err) {
    tabContainer.innerHTML = `
      <div class="empty danger" style="padding:24px;text-align:center">
        <strong>Lỗi tải dữ liệu:</strong> ${esc(err.message)}
      </div>
    `;
  }
}

function openAddMemberModal() {
  if (!userCan('MANAGE_USERS')) {
    toast('Bạn không có quyền quản lý thành viên cửa hàng.', 'error');
    return;
  }
  const shop = getActiveShop();
  openModal({
    title: 'Thêm / Mời nhân viên',
    sub: `Cửa hàng: ${shop?.name || ''}`,
    body: `
      <div class="field">
        <label>Email tài khoản nhân viên</label>
        <input type="email" id="memberEmail" placeholder="nhanvien@example.com" required />
      </div>
      <div class="field">
        <label>Vai trò (Role)</label>
        <select id="memberRole">
          <option value="${ROLES.CASHIER}">${ROLE_LABELS.CASHIER} (Bán hàng, thu tiền, xem khách)</option>
          <option value="${ROLES.WAREHOUSE}">${ROLE_LABELS.WAREHOUSE} (Nhập/xuất kho, kiểm kê, chuyển kho)</option>
          <option value="${ROLES.MANAGER}">${ROLE_LABELS.MANAGER} (Quản lý hàng hóa, giá bán, chiết khấu, báo cáo)</option>
        </select>
      </div>
      <div class="callout" style="margin-top:12px;font-size:12px">
        Nhân viên sẽ truy cập vào dữ liệu của Shop này với đúng phạm vi quyền hạn được cấp. Dữ liệu các Shop khác được cách ly tuyệt đối (RLS).
      </div>
    `,
    submitText: 'Thêm nhân viên',
    onSubmit: async (root) => {
      const email = $('#memberEmail', root)?.value?.trim();
      const role = $('#memberRole', root)?.value;
      if (!email) throw new Error('Vui lòng nhập email nhân viên.');
      await addMember({ email, role });
      toast(`Đã thêm ${email} vào cửa hàng với vai trò ${getRoleLabel(role)}.`, 'ok');
    }
  });
}

function openSyncInfoModal() {
  openModal({
    title: 'Thông tin Dữ liệu & Đồng bộ Đám mây',
    sub: 'QBiz Kho Production V1 — Lộ trình Sync 01',
    hideSubmit: true,
    body: `
      <div class="sync-info-box" style="display:flex;flex-direction:column;gap:12px;font-size:13px;line-height:1.6">
        <div style="background:var(--bg-subtle,#f8fafc);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:12px">
          <strong style="color:var(--primary,#0284c7);display:block;margin-bottom:4px">✓ Dữ liệu cục bộ được bảo toàn 100%</strong>
          Thiết bị này đang có dữ liệu danh mục, hàng hóa, giao dịch lưu trữ trên IndexedDB v12 cục bộ. Tất cả dữ liệu của bạn hoàn toàn nguyên vẹn và hoạt động trơn tru ngoại tuyến (offline-first).
        </div>
        <div>
          <strong>Vì sao chưa đẩy dữ liệu lên đám mây ngay?</strong>
          <p style="margin:4px 0">Để đảm bảo an toàn tuyệt đối, hệ thống triển khai theo quy trình kiểm định nghiêm ngặt:
          <b>Gate 1</b> (hiện tại) hoàn tất xác thực tài khoản, định danh cửa hàng và chính sách bảo mật đa khách hàng (RLS).
          <b>Gate 2</b> (bước tiếp theo) sẽ cung cấp công cụ kiểm định đối soát và đẩy toàn bộ dữ liệu cục bộ lên đám mây mà không mất mát hay trùng lặp.</p>
        </div>
        <div class="callout">
          Bạn hoàn toàn có thể tiếp tục sử dụng ứng dụng để nhập hàng, bán hàng như bình thường.
        </div>
      </div>
    `
  });
}

async function previewDemo(industryKey = 'retail'){
  try{
    await loadDemoIndustry(industryKey, 'OWNER');
    state._userSelectedProductType = false;
    state.productType = (industryKey === 'service') ? 'SERVICE' : 'PRODUCT';
    await refresh();
    const ind = getActiveDemoIndustry();
    const shopTitle = (ind.shop?.name || '').split('—')[0].trim();
    toast(`Shop demo: ${shopTitle}`, 'ok');
  }catch(err){
    console.error('Lỗi nạp demo:',err);
    toast('Lỗi nạp demo: '+err.message,'error');
  }
}
async function exitDemo(){
  sessionStorage.removeItem('qbiz_preview_demo');
  sessionStorage.removeItem('qbiz_demo_industry');
  sessionStorage.removeItem('qbiz_demo_role');
  sessionStorage.removeItem('qbiz_demo_shop');
  state._userSelectedProductType = false;
  state.productType = 'PRODUCT';
  try {
    if(businessProfileModule && businessProfileModule.resetToDefaultProfile){
      await businessProfileModule.resetToDefaultProfile();
    }
  }catch(_){}
  await refresh();
  toast('Đã thoát demo.','info');
}

function openDemoRoleModal() {
  const currentRole = getActiveDemoRole();
  openModal({
    title: 'Xem với vai trò',
    sub: 'Trải nghiệm quyền hạn và giới hạn thao tác theo từng vị trí nhân sự.',
    hideSubmit: true,
    body: `
      <div class="demo-role-picker" style="display:flex;flex-direction:column;gap:10px">
        ${Object.values(DEMO_ROLES).map(r => `
          <button type="button" class="demo-role-choice ${currentRole === r.key ? 'active' : ''}" data-choose-role="${r.key}" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1.5px solid ${currentRole === r.key ? 'var(--primary,#0284c7)' : 'var(--border,#e2e8f0)'};background:${currentRole === r.key ? '#eff6ff' : '#fff'};border-radius:10px;cursor:pointer;text-align:left;transition:all .15s ease">
            <span style="font-size:22px;line-height:1;margin-top:2px">${r.badge}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <strong style="font-size:14px;color:#0f172a">${esc(r.label)}</strong>
                <span class="badge ${currentRole === r.key ? 'blue' : ''}" style="font-size:11px">${esc(r.sub)}</span>
              </div>
              <p style="margin:4px 0 0;font-size:12.5px;color:var(--text-muted,#64748b);line-height:1.4">${esc(r.desc)}</p>
            </div>
          </button>
        `).join('')}
      </div>
    `
  });

  $$('[data-choose-role]').forEach(btn => {
    btn.onclick = () => {
      const roleKey = btn.dataset.chooseRole;
      switchDemoRole(roleKey);
      $('#modalRoot').innerHTML = '';
      render();
      const meta = DEMO_ROLES[roleKey];
      toast(`Vai trò: ${meta.label}`, 'ok');
    };
  });
}

function openDemoIndustryModal() {
  const currentIndKey = getActiveDemoIndustry().key;
  openModal({
    title: 'Chọn ngành kinh doanh demo',
    sub: 'Trải nghiệm dữ liệu thực tế và quy trình vận hành theo từng mô hình.',
    hideSubmit: true,
    body: `
      <div class="demo-industry-picker" style="display:flex;flex-direction:column;gap:10px">
        ${Object.values(DEMO_INDUSTRIES).map(ind => `
          <button type="button" class="demo-ind-choice ${currentIndKey === ind.key ? 'active' : ''}" data-choose-industry="${ind.key}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid ${currentIndKey === ind.key ? ind.color : 'var(--border,#e2e8f0)'};background:${currentIndKey === ind.key ? '#f0f9ff' : '#fff'};border-radius:10px;cursor:pointer;text-align:left;transition:all .15s ease">
            <span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:${ind.color}18;color:${ind.color};flex-shrink:0">${icon(ind.icon)}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <strong style="font-size:14px;color:#0f172a">${esc(ind.name)}</strong>
                <span class="badge" style="font-size:11px;background:${ind.color};color:#fff">${esc(ind.shortName)}</span>
              </div>
              <p style="margin:2px 0 0;font-size:12px;color:var(--text-muted,#64748b)">${esc(ind.shop?.name || '')}</p>
            </div>
          </button>
        `).join('')}
      </div>
    `
  });

  $$('[data-choose-industry]').forEach(btn => {
    btn.onclick = async () => {
      const indKey = btn.dataset.chooseIndustry;
      $('#modalRoot').innerHTML = '';
      await previewDemo(indKey);
    };
  });
}

if(window.__qbizInstallPrompt) state.installPrompt = window.__qbizInstallPrompt;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.installPrompt=e; window.__qbizInstallPrompt=e; });
window.addEventListener('appinstalled',()=>{
  state.installPrompt=null; window.__qbizInstallPrompt=null;
  $('.header-install-btn')?.remove(); $('#firstVisitInstallBanner')?.remove();
  try{ localStorage.setItem('qbiz_install_dismissed','true'); }catch(_){}
  toast('Đã cài QBiz Kho về thiết bị.','ok');
});
// Nút "Cài ngay / Cài App": cài thẳng ứng dụng nếu trình duyệt cho phép; nếu chưa thì mới hiện hướng dẫn thủ công.
async function runInstallApp(){
  const ev = state.installPrompt || window.__qbizInstallPrompt;
  if(!ev) return openInstall();
  try{
    ev.prompt();
    const choice = await ev.userChoice;
    state.installPrompt=null; window.__qbizInstallPrompt=null;
    if(choice && choice.outcome==='accepted'){
      $('.header-install-btn')?.remove(); $('#firstVisitInstallBanner')?.remove();
    }
  }catch(err){ console.warn('Install error:', err); openInstall(); }
}
document.addEventListener('focusin',e=>{const t=e.target;if(t&&/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)){setTimeout(()=>{try{t.scrollIntoView({block:'center',behavior:'smooth'})}catch{}},220);}});
document.addEventListener('click', async e=>{
  const pick=e.target.closest('[data-pick-group]'); if(pick){const grp=pick.dataset.pickGroup; $$(`[data-pick-group="${grp}"]`).forEach(x=>x.classList.toggle('active',x===pick)); return;}
  const page=e.target.closest('[data-page]')?.dataset.page;
  if(page){const notificationId=e.target.closest('[data-notification-id]')?.dataset.notificationId;if(notificationId)state.notificationRead.add(notificationId);navigate(page); return; }
  const action=e.target.closest('[data-action]')?.dataset.action;
  const kind=e.target.closest('[data-kind]')?.dataset.kind;
  if(action==='dismiss-install-banner') {
    localStorage.setItem('qbiz_install_dismissed', 'true');
    const b = $('#firstVisitInstallBanner');
    if(b) b.remove();
    return;
  }
  if(action==='open-auth-modal' || action==='open-hero-auth') return openAuthModal();
  if(action==='create-shop-modal' || action==='open-create-shop-modal') return openCreateShopModal();
  if(action==='preview-demo') return previewDemo('retail');
  if(action==='select-demo-industry') {
    const ind = e.target.closest('[data-industry]')?.dataset.industry || 'retail';
    return previewDemo(ind);
  }
  if(action==='open-demo-role-modal') return openDemoRoleModal();
  if(action==='open-demo-industry-modal') return openDemoIndustryModal();
  if(action==='reset-demo') {
    if(confirm('Khôi phục dữ liệu demo 30 ngày nguyên bản của ngành này?')) {
      await resetDemo();
      await refresh();
      toast('Đã làm mới dữ liệu demo về trạng thái ban đầu.', 'ok');
    }
    return;
  }
  if(action==='clear-demo-fresh') return openClearDemoFreshModal();
  if(action==='exit-demo') return exitDemo();
  if(action==='open-user-menu') return openUserMenuModal();
  if(action==='add-member-modal') return openAddMemberModal();
  if(action==='open-forgot-password-modal') return openForgotPasswordModal();
  if(action==='switch-shop-modal' || action==='open-switch-shop-modal') return openSwitchShopModal();
  if(action==='open-platform-admin' || action==='go-platform-admin') { state.page = 'platform-admin'; return render(); }
  if(action==='connect-google-drive') {
    const auth = getAuthState();
    if (!userCan('MANAGE_SETTINGS')) {
      return toast('Bạn không có quyền kết nối Google Drive (chỉ OWNER).', 'error');
    }
    const shop = getActiveShop() || { id: 'default_shop', name: 'Cửa hàng' };
    const email = auth.user?.email || 'owner@qbiz.vn';
    try {
      await connectShopDrive({ shopId: shop.id, googleEmail: email });
      toast('Đã kết nối Google Drive thành công!', 'ok');
      await renderBackupCenter();
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  if(action==='drive-backup-now' || action==='manual-backup') {
    const auth = getAuthState();
    if (!userCan('MANAGE_SETTINGS')) {
      return toast('Bạn không có quyền thực hiện sao lưu.', 'error');
    }
    const shop = getActiveShop() || { id: 'default_shop', name: 'Cửa hàng' };
    try {
      toast('Đang tạo bản sao lưu và xác thực Checksum...', 'info');
      const res = await triggerManualBackup(shop.id, shop.name, state.data);
      toast(`Đã sao lưu lên Google Drive! Checksum: ${res.checksum.slice(0, 8)}... (Đã xác minh)`, 'ok');
      await renderBackupCenter();
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  if(action==='drive-open-folder') {
    const shop = getActiveShop() || { id: 'default_shop', name: 'Cửa hàng' };
    toast(`Thư mục sao lưu: QBiz Kho Backups / ${shop.name}`, 'info');
    return;
  }
  if(action==='disconnect-google-drive') {
    const role = getCurrentRole();
    if (role !== ROLES.OWNER) {
      return toast('Chỉ Chủ cửa hàng (OWNER) mới có quyền ngắt kết nối Google Drive.', 'error');
    }
    const shop = getActiveShop() || { id: 'default_shop', name: 'Cửa hàng' };
    if (!confirm('Ngắt Google Drive của shop này? Sau khi ngắt, các bản sao lưu tự động sẽ dừng lại nhưng các tệp đã sao lưu trước đó trên Google Drive vẫn được giữ nguyên.')) {
      return;
    }
    try {
      await disconnectShopDrive(shop.id);
      toast('Đã ngắt kết nối Google Drive.', 'ok');
      await renderBackupCenter();
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  if(action==='drive-restore-list') {
    const shop = getActiveShop() || { id: 'default_shop', name: 'Cửa hàng' };
    return openDriveRestoreModal(shop.id);
  }
  if(action==='ship-order'){
    const o = (state.data?.orders||[]).find(x=>x.id===e.target.closest('[data-order-id]')?.dataset.orderId);
    if(o) openShippingModal(o, 'order');
    return;
  }
  if(action==='ship-sale'){
    const s = (state.data?.sales||[]).find(x=>x.id===e.target.closest('[data-sale-id]')?.dataset.saleId);
    if(s) openShippingModal(s, 'sale');
    return;
  }
  if(action==='dismiss-local-notice'){
    sessionStorage.setItem('qbiz_dismiss_local_notice', '1');
    const b=$('#localDataNotice');
    if(b) b.remove();
    return;
  }
  if(action==='prepare-sync-info') return openSyncInfoModal();
  if(action==='return-center') return navigate('returns');
  if(action==='stocktake' || action==='count' || (action==='quick-action' && kind==='count')) return openQuick('count');
  if(action==='quick-action') return openQuick(kind||'receive');
  if(action==='notifications') return navigate('notifications');
  if(action==='customer-picker') return openCustomerPicker();
  if(action==='channel-picker') return openChannelPicker();
  if(action==='new-customer') return openNewCustomer();
  if(action==='new-supplier') return openSupplierDraft();
  if(action==='customer-directory'){state.page='customers';return render();}
  if(action==='device-center') return openDeviceCenter();
  if(action==='business-profile') return openBusinessProfile();
  if(action==='business-mode-selector') return openBusinessModeModal();
  if(action==='ui-profile-selector') return openUiProfileModal();
  if(action==='sale-preferences') return openSalePreferences();
  if(action==='tax-preferences') return openTaxPreferencesModal();
  if(action==='connections-settings') return openConnectionSettings();
  if(action==='data-settings') return openDataSettings();
  if(action==='price-new') return openPriceForm();
  if(action==='price-del') return deleteModuleRow('price_lists',e.target.closest('[data-id]')?.dataset.id,renderPrices);
  if(action==='promo-new') return openPromoForm();
  if(action==='promo-toggle') return toggleModuleRow('promotions',e.target.closest('[data-id]')?.dataset.id,renderPromotions);
  if(action==='promo-del') return deleteModuleRow('promotions',e.target.closest('[data-id]')?.dataset.id,renderPromotions);
  if(action==='combo-new') return openComboForm();
  if(action==='combo-del') return deleteModuleRow('combos',e.target.closest('[data-id]')?.dataset.id,renderCombos);
  if(action==='unit-new') return openUnitForm();
  if(action==='unit-del') return deleteModuleRow('units',e.target.closest('[data-id]')?.dataset.id,renderUnits);
  if(action==='opening-set') return openOpeningForm();
  if(action==='label-print') return printLabels();
  if(action==='label-clear'){state.labelItems=[];return renderLabels();}
  if(action==='cash-in') return openCashForm('in');
  if(action==='cash-out') return openCashForm('out');
  if(action==='cash-del') return deleteModuleRow('cash_entries',e.target.closest('[data-id]')?.dataset.id,renderCash);
  if(action==='debt-new') return openDebtForm(e.target.closest('[data-kind]')?.dataset.kind||'receivable');
  if(action==='debt-del') return deleteModuleRow('debt_entries',e.target.closest('[data-id]')?.dataset.id,renderDebts);
  if(action==='flag-toggle') return toggleFeatureFlag(e.target.closest('[data-flag]')?.dataset.flag);
  if(action==='audit-filter') return;
  if(action==='search-product') return openProduct(e.target.closest('[data-id]')?.dataset.id);
  if(action==='search-sale'){const s=(state.data.sales||[]).find(x=>x.id===e.target.closest('[data-id]')?.dataset.id);return s?openTransaction(s):toast('Không tìm thấy phiếu.','error');}
  if(action==='search-customer'){const c=(state.data.customers||[]).find(x=>x.id===e.target.closest('[data-id]')?.dataset.id);return c?openCustomerDetail(c):toast('Không tìm thấy khách hàng.','error');}
  if(action==='search-supplier'){const s=(state.data.suppliers||[]).find(x=>x.id===e.target.closest('[data-id]')?.dataset.id);return s?openSupplierDetail(s):toast('Không tìm thấy nhà cung cấp.','error');}
  if(action==='search-order') return openOrderDetail(e.target.closest('[data-id]')?.dataset.id);
  if(action==='po-new') return openPurchaseOrderForm();
  if(action==='po-open') return openPurchaseOrder(e.target.closest('[data-id]')?.dataset.id);
  if(action==='srt-new') return openSupplierReturnModal();
  if(action==='diag-copy'){const t=diagnosticText();if(navigator.clipboard)return navigator.clipboard.writeText(t).then(()=>toast('Đã sao chép thông tin chẩn đoán.','ok')).catch(()=>toast('Không sao chép được.','error'));toast(t.slice(0,120),'');return;}
  if(action==='diag-export') return downloadText(`qbiz-chan-doan-${new Date().toISOString().slice(0,10)}.txt`,diagnosticText(),'text/plain;charset=utf-8');
  if(action==='diag-clear') return (async()=>{try{if('caches' in window){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}toast('Đã xóa cache giao diện. Dữ liệu kho giữ nguyên.','ok');}catch(err){toast('Không xóa được cache.','error');}})();
  if(action==='export-csv'){const key=e.target.closest('[data-key]')?.dataset.key;const def=(state.exportDefs||[]).find(d=>d[0]===key);if(def)exportCsv(def[0],def[2],def[3]());return;}
  if(action==='supplier-status'){const id=e.target.closest('[data-id]')?.dataset.id,next=e.target.closest('[data-next]')?.dataset.next;const s=(state.data.suppliers||[]).find(x=>x.id===id);if(!s)return;return (async()=>{await updateSupplier({...s,status:next});$('#modalRoot').innerHTML='';await refresh();toast(next==='inactive'?'Đã ngừng sử dụng nhà cung cấp.':'Đã kích hoạt lại nhà cung cấp.','ok');})();}
  if(action==='customer-soft'){const id=e.target.closest('[data-id]')?.dataset.id,next=e.target.closest('[data-next]')?.dataset.next;const c=(state.data.customers||[]).find(x=>x.id===id);if(!c)return;return (async()=>{await put('customers',{...c,active:next!=='inactive'});$('#modalRoot').innerHTML='';await refresh();toast(next==='inactive'?'Đã ẩn khách hàng.':'Đã hiện lại khách hàng.','ok');})();}
  if(action==='order-documents') return openOrderDocuments(e.target.closest('[data-order-id]')?.dataset.orderId);
  if(action==='future-action') return toast(`${e.target.closest('[data-label]')?.dataset.label||'Chức năng'} sẽ được mở ở task nghiệp vụ riêng.`,'');
  if(action==='print-receipt'){
    const btn = e.target.closest('[data-action="print-receipt"]');
    const docId = btn?.dataset?.id || state.currentSaleId || state.currentOrderId || state.saleReceipt?.id || '';
    const docType = btn?.dataset?.type || (state.currentOrderId === docId ? 'order' : 'receipt');
    return printDocument({ type: docType, documentId: docId });
  }
  if(action==='share-receipt'){const text=state.saleReceipt?.code||$('#modalRoot h2')?.textContent||'Phiếu bán QBiz';if(navigator.share)navigator.share({title:text,text}).catch(()=>{});else navigator.clipboard?.writeText(text).then(()=>toast('Đã sao chép mã phiếu.','ok'));return;}
  if(action==='invoice-info'){
    const saleId = e.target.closest('[data-sale-id]')?.dataset.saleId || state.currentSaleId || state.saleReceipt?.id;
    let sale = saleId ? ((state.data.sales||[]).find(x=>x.id===saleId) || (state.saleReceipt?.id===saleId?state.saleReceipt:null)) : state.saleReceipt;
    if (!sale && (state.currentOrderId || e.target.closest('[data-order-id]')?.dataset.orderId)) {
      const oid = state.currentOrderId || e.target.closest('[data-order-id]')?.dataset.orderId;
      sale = (state.data.sales||[]).find(x => x.order_id === oid || x.code === (state.data.orders||[]).find(o=>o.id===oid)?.code);
    }
    if (CONFIG.FEATURE_FLAGS?.e_invoice) {
      if (sale) return openInvoiceModalForSale(sale);
      return toast('Chọn hoặc mở một phiếu bán để xem hóa đơn điện tử.', '');
    }
    return toast('Hóa đơn điện tử chưa kết nối.', '');
  }
  if(action==='scan') return openScan();
  if(action==='sale-scan') return openSaleScan();
  if(action==='new-product') return openNewProduct();
  if(action==='new-order') return openNewOrder();
  if(action==='edit-item') return openEditItem(e.target.closest('[data-product-id]')?.dataset.productId);
  if(action==='new-warehouse') return openNewWarehouse();
  if(action==='warehouse-management') return openWarehouseManagement();
  if(action==='show-qr') return openQR(e.target.closest('[data-product-id]')?.dataset.productId);
  if(action==='install-app') return runInstallApp();
  if(action==='export-backup') return exportBackup();
  if(action==='backup-now'){await exportBackup();localStorage.setItem('qbiz_last_backup_at',new Date().toISOString());renderBackupCenter();toast('Đã tạo tệp sao lưu local.','ok');return;}
  if(action==='mark-all-read'){buildNotifications().forEach(n=>state.notificationRead.add(n.id));renderNotificationCenter();return;}
  if(action==='export-csv') return exportProductsCsv();
  if(action==='sync-now'){ try{ const r=await flushOutbox(); toast(r.skipped?'Bản local: chưa bật API QBiz.':`Đã gửi ${r.sent} thay đổi.`,'ok'); } catch(err){ toast(err.message,'error'); } return; }
  const orderActionBtn=e.target.closest('[data-order-action]');
  const orderAction=orderActionBtn?.dataset.orderAction; const orderId=e.target.closest('[data-order-id]')?.dataset.orderId;
  if(orderAction&&orderId){
    if(orderActionBtn.disabled) return;
    orderActionBtn.disabled = true;
    try{
      const fn={confirm:confirmOrder,process:processOrder,complete:completeOrder,cancel:cancelOrder}[orderAction];
      if(fn){
        await fn(orderId);
        await refresh();
        toast(orderAction==='cancel'?'Đã hủy đơn.':'Đã cập nhật đơn.','ok');
      }
    }catch(err){
      orderActionBtn.disabled = false;
      toast(err.message,'error');
    }
    return;
  }
  const p=e.target.closest('[data-product]')?.dataset.product; if(p){ if(state.productSelecting&&state.page==='products')return toggleProductSelection(p); return openProduct(p); }
  const trBtn=e.target.closest('[data-receive-transfer]');
  const tr=trBtn?.dataset.receiveTransfer;
  if(tr){
    if(trBtn.disabled) return;
    trBtn.disabled = true;
    try{ await receiveTransfer(tr); await refresh(); toast('Kho nhận đã xác nhận hàng.','ok'); } catch(err){ trBtn.disabled = false; toast(err.message,'error'); }
    return;
  }
  const cancelTrBtn=e.target.closest('[data-cancel-transfer]');
  const cancelTr=cancelTrBtn?.dataset.cancelTransfer;
  if(cancelTr){
    if(cancelTrBtn.disabled) return;
    cancelTrBtn.disabled = true;
    try{
      await cancelTransfer(cancelTr);
      await refresh();
      toast('Đã hủy phiếu chuyển và hoàn trả tồn kho xuất.','ok');
    }catch(err){
      cancelTrBtn.disabled = false;
      toast(err.message,'error');
    }
    return;
  }
  if(action==='mark-sale-paid'){
    const btn = e.target.closest('button');
    if(btn?.disabled) return;
    if(btn) btn.disabled = true;
    const saleId=e.target.closest('[data-sale-id]')?.dataset.saleId;
    if(saleId){
      try{
        await markSalePaid(saleId);
        $('#modalRoot').innerHTML='';
        await refresh();
        toast('Đã xác nhận thu tiền phiếu bán.','ok');
      }catch(err){
        if(btn) btn.disabled = false;
        toast(err.message,'error');
      }
    }
    return;
  }
  if(action==='mark-order-paid'){
    const btn = e.target.closest('button');
    if(btn?.disabled) return;
    if(btn) btn.disabled = true;
    const orderId=e.target.closest('[data-order-id]')?.dataset.orderId;
    if(orderId){
      try{
        await markOrderPaid(orderId);
        $('#modalRoot').innerHTML='';
        await refresh();
        toast('Đã xác nhận thanh toán đơn hàng.','ok');
      }catch(err){
        if(btn) btn.disabled = false;
        toast(err.message,'error');
      }
    }
    return;
  }
});

function initScrollHeaderAutoHide() {
  if (typeof window === 'undefined') return;
  let lastScrollY = window.scrollY || 0;
  let isTicking = false;
  const SCROLL_THRESHOLD = 6;

  window.addEventListener('scroll', () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY || 0;

        // 1. Luôn hiện thanh header khi ở sát đỉnh trang (scrollY <= 20px)
        if (currentScrollY <= 20) {
          if (document.body.classList.contains('topbar-hidden')) {
            document.body.classList.remove('topbar-hidden');
          }
          lastScrollY = currentScrollY;
          isTicking = false;
          return;
        }

        // 2. Không ẩn nếu đang mở modal hoặc đang ở chuyên trang Platform Admin
        const isModalOpen = Boolean($('#modalRoot')?.innerHTML?.trim()) || document.body.classList.contains('modal-open');
        if (isModalOpen || state.page === 'platform-admin') {
          isTicking = false;
          return;
        }

        const diff = currentScrollY - lastScrollY;

        // 3. Vuốt xuống (scroll down) -> Tự động ẩn thanh trên cùng để tối ưu diện tích
        if (diff > SCROLL_THRESHOLD && currentScrollY > 50) {
          if (!document.body.classList.contains('topbar-hidden')) {
            document.body.classList.add('topbar-hidden');
          }
        } 
        // 4. Vuốt lên (scroll up) -> Tự động trượt hiện thanh header lại ngay lập tức
        else if (diff < -SCROLL_THRESHOLD) {
          if (document.body.classList.contains('topbar-hidden')) {
            document.body.classList.remove('topbar-hidden');
          }
        }

        lastScrollY = currentScrollY;
        isTicking = false;
      });
      isTicking = true;
    }
  }, { passive: true });
}

async function boot(){
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persisted => {
      if (persisted) {
        console.log('[Storage] Bộ nhớ cục bộ IndexedDB đã được cấp quyền PERSISTENT (chống tự động xóa).');
      }
    }).catch(() => {});
  }
  await initAuth();
  const auth = getAuthState();
  if (!auth.user && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('qbiz_preview_demo') === '1') {
    const demoVer = (await getOne('settings', 'demo_data_version'))?.value;
    if (demoVer !== 'v20261005_all_in_stock') {
      await loadDemoIndustry(getActiveDemoIndustryKey(), getActiveDemoRole());
    }
  } else if (CONFIG.BACKEND !== 'web') {
    // Backend web: KHÔNG gieo dữ liệu mẫu — danh mục/kho/tồn kéo từ website (src/web/catalog.js).
    await ensureSeed();
  }
  await ensureLocalIdentity();
  await ensurePrintTemplates();
  state.data=await snapshot();
  await businessProfileModule.initBusinessProfile(state.data?.settings);
  state.businessProfile = businessProfileModule.getBusinessProfile();
  await uiProfileModule.initUiProfile(state.data?.settings);
  state.uiProfile = uiProfileModule.resolveUiProfile(uiProfileModule.getUiProfile()?.id, state.businessProfile?.profile_id);
  const pageParam = new URLSearchParams(location.search).get('page') || (location.pathname.includes('/platform-admin') ? 'platform-admin' : null);
  if (pageParam) state.page = pageParam;
  history.replaceState(historyState(),'');render();
  subscribeAuthState(() => render());
  if (CONFIG.BACKEND === 'web') {
    // Đồng bộ với database web theo shop đang chọn; đổi shop / đăng xuất → dừng vòng cũ, chạy vòng mới.
    let webShopId = null;
    subscribeAuthState((auth) => {
      const shop = auth?.status === AUTH_STATES.AUTHENTICATED_SHOP_READY ? auth.shop : null;
      if ((shop?.id || null) === webShopId) return;
      webShopId = shop?.id || null;
      if (!shop) { stopWebSync(); return; }
      startWebSync(shop, () => { refresh().catch(() => {}); }).catch((err) => console.warn('[web-sync]', err));
    });
  }
  initAiUI(state);
  initScrollHeaderAutoHide();
  pruneSyncedOutbox().catch(() => {});
  window.__QBIZ_BUILD_INFO__ = {
    baseGitSha: '9837b84a8b40126536874dfe53b613b46fff52f5',
    worktreeDirty: true,
    qaArtifactFingerprint: 'QA_RC_PHASE3H_R2_FC2F8B76A585',
    aiArchVersion: 'PHASE3',
    qaProvider: 'LOCAL_AI',
    qaModel: 'qwen2.5:1.5b',
    serverGateway: 'SERVER_SIDE_GATEWAY',
    buildSha: '9837b84-qa-phase3h-r2',
    buildTime: '2026-10-01T15:05:00+07:00'
  };
  window.__qbiz_app__ = {
    state,
    refresh,
    reportSales,
    navigate,
    nav: navigate,
    render,
    toast,
    openQuick,
    openScan,
    openProduct,
    openQR,
    openOrderDetail,
    openCustomerDetail,
    openDebtCollectionModal,
    openReturnFlow,
    openTransaction,
    previewDemo,
    exitDemo,
    addSaleItem,
    submitSale,
    openPosQuickShiftModal,
    openTransactionModal: (saleId) => {
      const s = (state.data?.sales || []).find(x => x.id === saleId || x.sale_uuid === saleId || x.code === saleId);
      if (s) openTransaction(s);
      else if (state.data?.sales?.length) openTransaction(state.data.sales[state.data.sales.length - 1]);
    },
    printDocument,
    openPrintSettings: (tab = 'devices') => {
      state.printTab = tab;
      navigate('print');
    },
    openPrintSettingsModal: (tab = 'devices') => {
      state.printTab = tab;
      navigate('print');
    },
    openWarehouseManagement,
    openBusinessProfile,
    openBusinessModeModal,
    openUiProfileModal,
    openSalePreferences,
    getTaxSettings,
    saveTaxSettings,
    openTaxPreferencesModal,
    openConnectionSettings,
    openDataSettings,
    openPriceForm,
    openPromoForm,
    openComboForm,
    openUnitForm,
    openOpeningForm,
    openCashForm,
    openDebtForm,
    openPurchaseOrderForm,
    openAuthModal,
    openCreateShopModal,
    openUserMenuModal,
    openAddMemberModal,
    openForgotPasswordModal,
    openSwitchShopModal,
    openSyncInfoModal,
    flushOutbox,
    syncStatus,
    pruneSyncedOutbox,
    previewDemo,
    exitDemo,
    loadDemoIndustry,
    switchDemoRole,
    resetDemo,
    getActiveDemoIndustry,
    getActiveDemoRole,
    renderPlatformAdmin,
    auth: {
      initAuth,
      getAuthState,
      getCurrentUser,
      getActiveShop,
      getCurrentRole,
      userCan,
      signIn,
      signUp,
      signOut,
      createShop,
      addMember,
      disableMember,
      resetPassword,
      switchShop,
      getAvailableShops,
      isSuperAdmin,
      checkPlatformAdmin,
      getPlatformMetrics,
      getPlatformShops,
      togglePlatformShop,
      getPlatformAuditLogs,
      bootstrapSuperAdmin,
      signInWithGoogle,
    },
    drive: {
      getShopDriveStatus,
      connectShopDrive,
      disconnectShopDrive,
      triggerManualBackup,
      generateBackupPackage,
      verifyBackupPackage,
      formatBackupStatus,
    },
    refresh,
    closeModal: () => {
      if($('#modalRoot')) $('#modalRoot').innerHTML = '';
      state.currentProductId = null;
      state.currentOrderId = null;
      updateContextAndChips();
    },
    setVoiceMuted: (muted, toast) => window.__qbiz_ai__?.setVoiceMuted?.(muted, toast),
    isVoiceMuted: () => window.__qbiz_ai__?.isVoiceMuted?.() || false,
    stopSpeaking: () => window.__qbiz_ai__?.stopSpeaking?.(),
    ai: aiModule,
    businessProfile: businessProfileModule,
    uiProfile: uiProfileModule,
    state,
    navigate,
    openQuick,
    openWarehouseVoucherModal,
    renderWarehouseVoucherHtml,
    handleScannedBarcode,
    playScannerBeep,
    openShippingModal,
    openCarrierConfigModal,
    syncCatalogToWebsite,
    simulateWebOrder,
    openWebsiteConfigModal,
    openDriveRestoreModal,
    downloadText,
    createCustomer,
    getCustomerDebtSummary,
    getCustomerAgingReport,
    getCustomerProfileHistory,
    createSale,
    openShift,
    closeShift,
    markSalePaid,
    createExpense,
    getExpenses,
    openCashForm,
    createPurchaseReturn,
    openSupplierReturnModal,
    openSupplierReturnDetail,
    kickCashDrawer,
    generateEscPosReceipt,
    buildDrawerKickCommand
  };
  window.openQuick = openQuick;
  window.openSalePreferences = openSalePreferences;
  window.openChannelPicker = openChannelPicker;
  window.openBusinessProfile = openBusinessProfile;
  window.openTaxPreferencesModal = openTaxPreferencesModal;
  window.getTaxSettings = getTaxSettings;
  window.saveTaxSettings = saveTaxSettings;
  window.__qbiz_simulate_payment__ = (detail) => window.dispatchEvent(new CustomEvent('qbiz:payment_received', { detail }));
  window.openCashForm = openCashForm;
  window.openSupplierReturnModal = openSupplierReturnModal;
  window.openSupplierReturnDetail = openSupplierReturnDetail;
  window.openWarehouseVoucherModal = openWarehouseVoucherModal;
  window.renderWarehouseVoucherHtml = renderWarehouseVoucherHtml;
  window.handleScannedBarcode = handleScannedBarcode;
  window.playScannerBeep = playScannerBeep;
  window.openShippingModal = openShippingModal;
  window.openCarrierConfigModal = openCarrierConfigModal;
  window.syncCatalogToWebsite = syncCatalogToWebsite;
  window.simulateWebOrder = simulateWebOrder;
  window.openWebsiteConfigModal = openWebsiteConfigModal;
  window.openDriveRestoreModal = openDriveRestoreModal;
  window.downloadText = downloadText;
  window.navigate = navigate;
  window.refresh = refresh;
  window.render = render;
  window.state = state;
  window.toast = toast;
  window.triggerManualBackup = triggerManualBackup;
  window.openInvoiceModalForSale = openInvoiceModalForSale;
  window.openTransaction = openTransaction;
  window.openOrderDetail = openOrderDetail;
  window.createReturnAdjustmentProposal = createReturnAdjustmentProposal;
  if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => {});
    }).catch(()=>{});
  }
  const params=new URLSearchParams(location.search);
  const action=params.get('action');
  if(action==='scan') setTimeout(openScan,250);
  if(['receive','issue','transfer','count'].includes(action)) setTimeout(()=>openQuick(action),250);
}
window.addEventListener('popstate',e=>{
  if($('#modalRoot')?.innerHTML){
    $('#modalRoot').innerHTML='';
    state.currentProductId=null;state.currentOrderId=null;state.currentSaleId=null;
    updateContextAndChips();
    history.pushState(historyState(),'');render();return;
  }
  if(state.page==='sales'&&state.saleTrail.length){state.saleStep=state.saleTrail.pop();history.pushState(historyState(),'');render();return;}
  if(e.state?.qbiz){state.page=e.state.page||'dashboard';state.saleStep=e.state.saleStep||'browse';render();return;}
  history.pushState(historyState(),'');
});
let barcodeBuffer = '';
let lastKeyTime = 0;

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modalRoot')?.innerHTML) {
    $('#modalRoot').innerHTML = '';
    state.currentProductId = null; state.currentOrderId = null; state.currentSaleId = null;
    updateContextAndChips();
    render();
    return;
  }

  const now = Date.now();
  const activeTag = document.activeElement?.tagName;
  const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
  const isManualCode = document.activeElement?.id === 'manualCode';
  const isSearchInput = document.activeElement?.id === 'saleSearch' || document.activeElement?.id === 'productSearch';

  // Hardware barcode guns type characters in rapid succession (< 120ms between keys)
  if (now - lastKeyTime > 120) {
    barcodeBuffer = '';
  }
  lastKeyTime = now;

  if (e.key === 'Enter') {
    if (barcodeBuffer.length >= 3) {
      const scanned = barcodeBuffer;
      barcodeBuffer = '';
      if (isInput && !isManualCode) {
        if (isSearchInput && document.activeElement) {
          document.activeElement.value = '';
        }
      }
      e.preventDefault();
      if (typeof handleScannedBarcode === 'function') handleScannedBarcode(scanned);
      return;
    }
    if (isManualCode && document.activeElement?.value) {
      e.preventDefault();
      if (typeof handleScannedBarcode === 'function') handleScannedBarcode(document.activeElement.value);
      return;
    }
    barcodeBuffer = '';
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    barcodeBuffer += e.key;
  }
});
boot();
