import { ensureSeed,ensureLocalIdentity,snapshot,totalFor,available,receive,issue,countAdjust,setOpeningStock,applyWarehouseBatch,createTransfer,receiveTransfer,cancelTransfer,createProduct,createService,createCategory,updateItem,createWarehouse,createSupplier,updateSupplier,createReturn,createSale,createOrder,confirmOrder,processOrder,completeOrder,cancelOrder,currentShift,openShift,closeShift,markSalePaid,markOrderPaid,createExchange } from './engine.js?v=feature-completion-7';
import { clearAll,getAll,getOne,put,putMany,runTransaction } from './db.js';
import { syncStatus,flushOutbox } from './sync.js';
import { CONFIG } from './config.js';
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
let state={page:'dashboard',data:null,search:'',warehouse:'all',warehouseTab:'operations',warehouseSearch:'',warehouseFilter:'all',warehouseSort:'name',warehouseStockWarehouse:'all',orderSearch:'',orderFilter:'active',orderRange:'all',txSearch:'',customerSearch:'',customerType:'all',supplierSearch:'',productView:'compact',productType:'PRODUCT',productCategory:'all',productSort:'default',productLimit:40,productSelecting:false,productSelected:new Set(),currentProductId:null,currentOrderId:null,currentSaleId:null,displayPrefs:loadDisplayPrefs(),installPrompt:null,printTab:'templates',reportTab:'overview',reportRange:'month',reportWarehouse:'all',reportCustomStart:'',reportCustomEnd:'',notificationFilter:'all',notificationRead:new Set(),importStep:1,importType:'products',importSource:'file',saleCart:[],saleSearch:'',saleType:'all',saleShowAll:false,saleStep:'browse',saleTrail:[],saleBusy:false,saleReceipt:null,saleCustomer:null,saleDiscountOpen:new Set(),saleOptionsOpen:false,saleDraft:{discount:0,discountMode:'amount',cashReceived:'',note:'',payment:'cash',warehouseId:'',fulfillment:'counter',recipient:'',phone:'',address:'',shippingFee:0,cod:false,vatRate:0,vatCustom:''}};

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
  ,'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>'
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

async function refresh(){ state.data=await snapshot(); state.businessProfile = businessProfileModule.getBusinessProfile(); state.workspace = businessProfileModule.resolveWorkspaceProfile(state.businessProfile); render(); }
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
  if(previous!==page)window.scrollTo({top:0,left:0,behavior:'instant'});
}
function setSaleStep(step,{fromHistory=false}={}){
  if(step===state.saleStep){renderSales();headerActions();nav();return;}
  if(!fromHistory)state.saleTrail.push(state.saleStep);
  state.page='sales';state.saleStep=step;
  if(!fromHistory)history.pushState(historyState(),'');
  renderSales();headerActions();nav();
}
function goSaleBack(){const previous=state.saleTrail.pop()||'browse';state.saleStep=previous;state.page='sales';history.pushState(historyState(),'');renderSales();headerActions();nav();}
function headerActions(){
  const top=$('#topActions'); if(!top)return;
  const showScan=state.page==='sales'?state.saleStep==='browse':['products','transfers'].includes(state.page);
  const scan=showScan?`<button class="icon-btn scan-trigger" data-action="scan" title="Quét mã" aria-label="Quét mã">${icon('scan-line')}</button>`:'';
  const alerts=notificationItems();
  const auth=getAuthState();
  let userBadge='';
  if(auth.status===AUTH_STATES.AUTHENTICATED_SHOP_READY){
    userBadge=`<button class="user-badge-btn" data-action="open-user-menu" title="${esc(auth.user?.email||'Tài khoản')}">${icon('user')}<span>${esc(auth.shop?.name||'Shop')}</span></button>`;
  } else if(auth.status===AUTH_STATES.AUTHENTICATED_NO_SHOP){
    userBadge=`<button class="user-badge-btn" data-action="create-shop-modal" title="Tạo cửa hàng mới">${icon('store')}<span>Tạo Shop</span></button>`;
  } else {
    userBadge = `<button class="user-badge-btn icon-only" data-action="open-auth-modal" title="Tài khoản / Đăng nhập" aria-label="Đăng nhập">${icon('user')}</button>`;
  }
  top.innerHTML=`${userBadge}<button class="header-shortcut" data-page="orders">${icon('file-text')}<span>Đơn hàng</span></button><button class="icon-btn header-bell" data-action="notifications" aria-label="Thông báo" title="Thông báo">${icon('bell')}${alerts.length?`<b>${alerts.length}</b>`:''}</button>${scan}`;
}
function injectLocalNotice(){
  if(state.page!=='dashboard') return;
  const auth=getAuthState();
  if(auth.status===AUTH_STATES.AUTHENTICATED_SHOP_READY && (state.data?.products?.length||0)>0 && !sessionStorage.getItem('qbiz_dismiss_local_notice')){
    const content=$('#content');
    if(content && !$('#localDataNotice', content)){
      const banner=document.createElement('div');
      banner.className='local-data-banner';
      banner.id='localDataNotice';
      banner.innerHTML=`<div class="banner-body"><strong>Thiết bị này đang có dữ liệu cục bộ (${state.data.products.length} sản phẩm).</strong><span>Bước tiếp theo có thể đưa dữ liệu này lên Shop.</span></div><div class="banner-actions"><button class="secondary-btn tiny" data-action="dismiss-local-notice">Để sau</button><button class="ghost-btn tiny" data-action="prepare-sync-info">Chuẩn bị đồng bộ</button></div>`;
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
function render(){ if(!state.data) return; if(!state.workspace) state.workspace = businessProfileModule.resolveWorkspaceProfile(state.businessProfile || businessProfileModule.getBusinessProfile()); state.uiProfile = uiProfileModule.resolveUiProfile(uiProfileModule.getUiProfile()?.id, (state.businessProfile || businessProfileModule.getBusinessProfile())?.profile_id); document.body.dataset.saleStep=state.page==='sales'?state.saleStep:''; nav(); ({dashboard:renderDashboard,sales:renderSales,products:renderProducts,transfers:renderTransfers,history:renderHistory,settings:renderSettings,prints:renderPrintCenter,print:renderPrintCenter,reports:renderFeatureReports,more:renderMore,orders:renderOrders,transactions:renderTransactions,customers:renderCustomers,suppliers:renderSuppliers,imports:renderImportCenter,backup:renderBackupCenter,returns:renderReturnCenter,shifts:renderShiftCenter,notifications:renderNotificationCenter,shipping:renderShippingCenter,channels:renderChannelCenter,permissions:renderPermissionCenter,scanner:renderScannerCenter,advanced:renderAdvancedHub,prices:renderPrices,promos:renderPromotions,combos:renderCombos,units:renderUnits,opening:renderOpening,labels:renderLabels,cash:renderCash,debts:renderDebts,audit:renderAudit,search:renderSearch,modules:renderModules,onboarding:renderOnboarding,optional:renderOptional,documents:renderDocuments,numbering:renderNumbering,'purchase-orders':renderPurchaseOrders,'supplier-returns':renderSupplierReturns,replenish:renderReplenish,diagnostics:renderDiagnostics,exports:renderExports,'platform-admin':renderPlatformAdmin}[state.page]||renderDashboard)(); headerActions(); injectLocalNotice(); updateSyncPill(); updateContextAndChips(); }

const levelAvail=l=>Math.max(0,(l?.onHand||0)-(l?.reserved||0)-(l?.damaged||0));
function warehouseStock(productId){return (state.data.levels||[]).filter(l=>l.productId===productId).reduce((m,l)=>Math.max(m,levelAvail(l)),0);}
function stockView(product,warehouseId){if(warehouseId&&warehouseId!=='all'){const l=(state.data.levels||[]).find(x=>x.productId===product.id&&x.warehouseId===warehouseId)||{onHand:0,reserved:0,damaged:0};return {onHand:l.onHand||0,reserved:l.reserved||0,available:levelAvail(l)};}return productTotals(product);}
function bestSaleWarehouse(cart){const whs=state.data.warehouses||[];if(!whs.length)return '';const need=new Map();cart.forEach(l=>{const p=product(l.itemId);if(p&&p.type!=='SERVICE'&&p.trackInventory!==false)need.set(l.itemId,(need.get(l.itemId)||0)+Math.max(1,Math.floor(Number(l.quantity)||1)));});if(!need.size)return whs[0].id;const ranked=whs.map(w=>{let ok=true,min=Infinity;for(const [pid,n] of need){const lv=(state.data.levels||[]).find(x=>x.productId===pid&&x.warehouseId===w.id);const av=levelAvail(lv);if(av<n)ok=false;min=Math.min(min,av);}return {id:w.id,ok,min};});const pick=ranked.find(r=>r.ok)||ranked.slice().sort((a,b)=>b.min-a.min)[0];return pick?pick.id:whs[0].id;}
function normalizeSaleCart(){const merged=new Map();for(const line of state.saleCart){const previous=merged.get(line.itemId);if(previous){previous.quantity+=Math.max(1,Math.floor(Number(line.quantity)||1));previous.discount=(Number(previous.discount)||0)+(Number(line.discount)||0);}else merged.set(line.itemId,{...line,quantity:Math.max(1,Math.floor(Number(line.quantity)||1))});}state.saleCart=[...merged.values()];}
function saleStockLimit(id){const p=product(id);if(!p||p.type==='SERVICE'||p.trackInventory===false)return Infinity;const warehouseId=state.saleDraft.warehouseId||bestSaleWarehouse(state.saleCart);if(warehouseId){const level=(state.data.levels||[]).find(l=>l.productId===id&&l.warehouseId===warehouseId);return Math.max(0,levelAvail(level||{}));}return warehouseStock(id);}
function allowSaleQuantity(id,next){const limit=saleStockLimit(id);if(next<=limit)return true;toast(`Chỉ còn ${fmt(limit)} sản phẩm trong kho`,'error');return false;}
function saleLines(){normalizeSaleCart();return state.saleCart.map(line=>{const p=product(line.itemId);return p?{...line,p,lineTotal:Math.max(0,line.quantity*line.unitPrice-line.discount)}:null}).filter(Boolean)}
function saleTotals(){const lines=saleLines();const subtotal=lines.reduce((s,x)=>s+x.lineTotal,0);const tax=lines.reduce((s,x)=>s+Math.max(0,Number(x.tax_amount)||0),0);const raw=Number(state.saleDraft.discount)||0;const discount=Math.max(0,Math.min(subtotal,state.saleDraft.discountMode==='percent'?subtotal*Math.min(100,raw)/100:raw));const vatRate=Math.max(0,Math.min(100,Number(state.saleDraft.vatRate)||0));const vat=Math.round(Math.max(0,subtotal-discount)*vatRate/100);return {lines,subtotal,discount,tax,vatRate,vat,total:subtotal-discount+tax+vat};}
function paymentLabel(method){return ({cash:'Tiền mặt',transfer:'Chuyển khoản',qr:'QR'})[method]||'Chưa xác định'}
function currentCustomer(){return state.saleCustomer||{name:'Khách lẻ',phone:'',code:'',id:''};}
function normalizePhone(v){return String(v||'').replace(/\D/g,'');}
function customerLabel(c=currentCustomer()){return [c.name,c.phone].filter(Boolean).join(' · ')||'Khách lẻ';}
function customerDiscountHint(c=currentCustomer()){return Number(c.default_discount)>0?`<div class="customer-discount-hint">Gợi ý chiết khấu ${fmt(c.default_discount)}% · chưa tự động áp dụng</div>`:''}
async function customerRecords(){return getAll('customers');}
function customerMatches(c,q){const x=norm(q).trim();return !x||[c.name,c.phone,c.customer_code,c.code,c.tax_id].some(v=>norm(v).includes(x));}
function openCustomerPicker(){
  let type='all';
  openModal({title:'Chọn khách hàng',sub:'Khách lẻ là mặc định.',hideSubmit:true,body:`<div class="customer-picker"><input id="customerSearch" class="customer-search" placeholder="Tìm tên, SĐT, mã khách, MST"/><div class="customer-type-tabs">${[['all','Tất cả'],['retail','Khách lẻ'],['individual','Cá nhân'],['company','Công ty'],['agent','Đại lý']].map(([v,l])=>`<button class="${v==='all'?'active':''}" data-picker-type="${v}">${l}</button>`).join('')}</div><div id="customerResults" class="customer-results"></div><button class="secondary-btn full" data-action="new-customer">+ Thêm khách hàng</button></div>`});
  const draw=async()=>{const q=$('#customerSearch')?.value||'',rows=(await customerRecords()).filter(c=>c.active!==false&&customerMatches(c,q)&&(type==='all'||(c.customer_type||'retail')===type)).sort((a,b)=>(b.last_used_at||'').localeCompare(a.last_used_at||''));$('#customerResults').innerHTML=`<button class="customer-row" data-customer-id=""><span><strong>Khách lẻ</strong><small>Không lưu thông tin khách</small></span>${icon('chevron-right')}</button>`+rows.map(c=>`<button class="customer-row" data-customer-id="${c.id}"><span><strong>${esc(c.name)}</strong><small>${esc([c.phone,c.customer_code,c.tax_id].filter(Boolean).join(' · ')||'Chưa có thông tin liên hệ')}${c.default_discount?` · Gợi ý CK ${fmt(c.default_discount)}%`:''}</small></span>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có khách phù hợp.</div>';$$('[data-customer-id]',$('#customerResults')).forEach(b=>b.onclick=async()=>{const c=rows.find(x=>x.id===b.dataset.customerId)||{name:'Khách lẻ',phone:'',code:'',id:''};if(c.id){c.last_used_at=new Date().toISOString();await put('customers',c)}state.saleCustomer=c;$('#modalRoot').innerHTML='';state.page==='sales'?renderSales():render();});};$('#customerSearch').oninput=draw;$$('[data-picker-type]').forEach(b=>b.onclick=()=>{type=b.dataset.pickerType;$$('[data-picker-type]').forEach(x=>x.classList.toggle('active',x===b));draw()});draw();
}
function openNewCustomer(){openModal({title:'Thêm khách hàng',sub:'Tên là thông tin bắt buộc.',body:`<div class="form-grid"><div class="field full-span"><label>Tên khách hàng</label><input id="customerName" required placeholder="VD: Nguyễn Thị Lan"/></div><div class="field"><label>Số điện thoại</label><input id="customerPhone" inputmode="tel" placeholder="090..."/></div><div class="field"><label>Mã khách</label><input id="customerCode"/></div><div class="field"><label>Loại khách</label><select id="customerType"><option value="retail">Khách lẻ</option><option value="individual">Cá nhân</option><option value="company">Công ty</option><option value="agent">Đại lý</option></select></div><div class="field"><label>Nhóm khách</label><input id="customerGroup" placeholder="Tùy chọn"/></div><div class="field"><label>Chiết khấu mặc định (%)</label><input id="customerDiscount" type="number" inputmode="decimal" min="0" max="100" value="0"/></div><div class="field"><label>Mã số thuế</label><input id="customerTax" inputmode="numeric"/></div><div class="field full-span"><label>Ghi chú</label><input id="customerNote"/></div></div>`,submitText:'Lưu khách hàng',onSubmit:async root=>{const name=$('#customerName',root).value.trim(),phone=$('#customerPhone',root).value.trim(),code=$('#customerCode',root).value.trim();if(!name)throw new Error('Hãy nhập tên khách hàng.');const all=await customerRecords(),dup=phone&&all.find(c=>normalizePhone(c.phone)===normalizePhone(phone));if(dup&&confirm('Số điện thoại đã có trong danh bạ. Dùng khách hàng hiện có?')){state.saleCustomer=dup;$('#modalRoot').innerHTML='';state.page==='sales'?renderSales():render();return;}if(dup)throw new Error('Số điện thoại đã tồn tại.');const now=new Date().toISOString(),id=saleUuid(),c={id,customer_id:id,customer_code:code,name,phone,phone_normalized:normalizePhone(phone),customer_type:$('#customerType',root).value,customer_group:$('#customerGroup',root).value.trim(),default_discount:Math.min(100,Math.max(0,Number($('#customerDiscount',root).value)||0)),tax_id:$('#customerTax',root).value.trim(),note:$('#customerNote',root).value,active:true,created_at:now,updated_at:now,last_used_at:now};await put('customers',c);state.saleCustomer=c;$('#modalRoot').innerHTML='';state.page==='sales'?renderSales():render();toast('Đã lưu khách hàng.','ok')}})}
function addSaleItem(id){const p=product(id);if(!p||p.active===false)return;normalizeSaleCart();const found=state.saleCart.find(x=>x.itemId===id),next=(found?.quantity||0)+1;if(!allowSaleQuantity(id,next))return;if(found)found.quantity=next;else state.saleCart.push({itemId:id,quantity:1,unitPrice:Number(p.price)||0,discount:0});renderSales();}
function updateSaleLine(id,field,value){normalizeSaleCart();const line=state.saleCart.find(x=>x.itemId===id);if(!line)return;const n=Number(value);if(field==='quantity'){const next=Math.max(1,Math.floor(n||1));if(!allowSaleQuantity(id,next)){renderSales();return;}line.quantity=next;}else line[field]=Math.max(0,n||0);renderSales();}
function adjustSaleQuantity(id,delta){normalizeSaleCart();const line=state.saleCart.find(x=>x.itemId===id);if(!line)return;const next=Math.max(1,line.quantity+delta);if(!allowSaleQuantity(id,next))return;line.quantity=next;renderSales();}
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
  const isLowStock = !isService && stock !== null && p.lowStock && stock <= p.lowStock && stock > 0;
  
  let stockBadgeHtml = '';
  if (isService) {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock service">Dịch vụ</span>`;
  } else if (isOutOfStock) {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock out-of-stock">Hết hàng</span>`;
  } else if (isLowStock) {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock low-stock">Tồn: ${fmt(stock)}</span>`;
  } else {
    stockBadgeHtml = `<span class="pos-stock-badge pos-prod-stock">Tồn: ${fmt(stock ?? 0)}</span>`;
  }

  const priceText = p.price ? fmt(p.price) : 'Chưa có giá';
  return `<article class="pos-product">
    <button class="pos-product-main" data-sale-add="${p.id}">
      <div class="pos-product-image">${p.image ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>` : esc((p.name || 'S').slice(0, 1))}${stockBadgeHtml}</div>
      <strong class="pos-prod-title">${esc(p.name)}</strong>
      <div class="pos-prod-sku">${skuText}</div>
      <div class="pos-prod-price-row">
        <b class="pos-prod-price">${priceText}</b>
      </div>
    </button>
    ${line ? `<div class="pos-inline-qty"><button data-sale-adjust="-1" data-sale-id="${p.id}">−</button><span>${line.quantity}</span><button data-sale-adjust="1" data-sale-id="${p.id}">+</button></div>` : `<button class="pos-add" data-sale-add="${p.id}" aria-label="Thêm ${esc(p.name)}">+</button>`}
  </article>`;
}
function saleStepHeader(title){return `<div class="flow-head"><button class="flow-back" data-sale-back aria-label="Quay lại">‹</button><h2>${title}</h2><span></span></div>`}
function saleCartRows(){return saleLines().map(x=>{const open=state.saleDiscountOpen.has(x.itemId);return `<article class="cart-row"><div class="pos-product-image">${x.p.image?`<img src="${x.p.image}" alt="${esc(x.p.name)}"/>`:esc((x.p.name||'S').slice(0,1))}</div><div class="cart-row-main"><div class="cart-row-title"><span><strong>${esc(x.p.name)}</strong><small>${esc(x.p.sku||'Dịch vụ')}</small></span><button data-sale-remove="${x.itemId}" aria-label="Xóa ${esc(x.p.name)}">×</button></div><small>${fmt(x.unitPrice)} ₫</small><div class="cart-row-bottom"><div class="quantity-control"><button data-sale-adjust="-1" data-sale-id="${x.itemId}">−</button><input type="number" inputmode="numeric" min="1" value="${x.quantity}" data-sale-field="quantity" data-sale-id="${x.itemId}"/><button data-sale-adjust="1" data-sale-id="${x.itemId}">+</button></div><b>${fmt(x.lineTotal)} ₫</b></div><button class="line-discount-trigger" data-line-discount="${x.itemId}">Giảm giá${x.discount?` · ${fmt(x.discount)} ₫`:''} <span>›</span></button>${open?`<div class="line-discount-editor"><span class="active">₫</span><span>%</span><input aria-label="Giảm giá cho ${esc(x.p.name)}" type="number" inputmode="decimal" min="0" value="${x.discount}" data-sale-field="discount" data-sale-id="${x.itemId}"/></div>`:''}</div></article>`}).join('')}
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
  $$('[data-line-discount]').forEach(b=>b.onclick=()=>{const id=b.dataset.lineDiscount;state.saleDiscountOpen.has(id)?state.saleDiscountOpen.delete(id):state.saleDiscountOpen.add(id);renderSales()});
  $$('[data-discount-mode]').forEach(b=>b.onclick=()=>{state.saleDraft.discountMode=b.dataset.discountMode;renderSales()});
  $$('[data-payment-choice]').forEach(b=>b.onclick=()=>{state.saleDraft.payment=b.dataset.paymentChoice;renderSales()});
  $$('[data-fulfillment]').forEach(b=>b.onclick=()=>{state.saleDraft.fulfillment=b.dataset.fulfillment;renderSales()});
  customerChip?.addEventListener('click',openCustomerPicker);
  $('[data-sale-pay]')?.addEventListener('click',submitSale);
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
  const totals=saleTotals(),customer=currentCustomer();
  if(state.saleStep==='success'&&state.saleReceipt){const s=state.saleReceipt,method=s.payments?.[0]?.method||s.payment_method;$('#content').innerHTML=`<section class="pos-success"><div class="success-mark">✓</div><h2>Thanh toán thành công!</h2><p>${esc(s.code||s.sale_uuid||'Phiếu bán')}</p><strong>${fmt(s.grand_total??s.total)} ₫</strong><div class="success-summary"><div><span>Thời gian</span><b>${dt(s.created_at||s.createdAt||new Date().toISOString())}</b></div><div><span>Khách hàng</span><b>${esc(s.customer_label||'Khách lẻ')}</b></div><div><span>Phương thức</span><b>${paymentLabel(method)}</b></div></div><div class="success-actions"><button class="secondary-btn" data-action="print-receipt" data-id="${s.id}" data-type="sale">${icon('file-text')} In phiếu</button><button class="secondary-btn" data-action="invoice-info">${icon('file-text')} Hóa đơn</button><button class="ghost-btn" data-sale-detail>Xem chi tiết giao dịch</button><button class="primary-btn" data-sale-complete data-sale-new>Hoàn thành</button></div></section>`;const finishSale=()=>{state.saleReceipt=null;state.saleStep='browse';state.saleSearch='';state.saleType='all';state.saleShowAll=false;renderSales()};$('[data-sale-complete]').onclick=finishSale;$('[data-sale-detail]').onclick=()=>openTransaction(s);return;}
  if(state.saleStep==='cart'){$('#content').innerHTML=`<section class="pos-flow card">${saleStepHeader('Giỏ hàng')}<button class="customer-chip" data-action="customer-picker">${icon('user')}<span><small>Khách hàng</small>${esc(customerLabel(customer))}</span>${icon('chevron-right')}</button><div class="cart-list">${saleCartRows()||'<div class="empty">Giỏ hàng đang trống.</div>'}</div><details class="order-options" ${state.saleOptionsOpen?'open':''}><summary>Tùy chọn đơn hàng</summary><div class="discount-box"><strong>Giảm giá đơn</strong><div class="discount-control"><input id="saleDiscount" type="number" inputmode="decimal" min="0" value="${state.saleDraft.discount}"/><button class="discount-mode ${state.saleDraft.discountMode==='amount'?'active':''}" data-discount-mode="amount">₫</button><button class="discount-mode ${state.saleDraft.discountMode==='percent'?'active':''}" data-discount-mode="percent">%</button></div></div></details><div class="cart-totals"><div><span>Tạm tính</span><b>${fmt(totals.subtotal)} ₫</b></div>${totals.discount?`<div><span>Giảm giá</span><b>− ${fmt(totals.discount)} ₫</b></div>`:''}${totals.tax?`<div><span>Thuế/VAT theo mặt hàng</span><b>${fmt(totals.tax)} ₫</b></div>`:''}<div class="grand"><span>Tổng cộng</span><b>${fmt(totals.total)} ₫</b></div></div><button class="primary-btn flow-primary" data-sale-step="checkout" ${!totals.lines.length?'disabled':''}>Tiếp tục thanh toán</button></section>`;$('.order-options')?.addEventListener('toggle',e=>state.saleOptionsOpen=e.target.open);$('#saleDiscount')?.addEventListener('input',e=>{state.saleDraft.discount=e.target.value;renderSales()});bindSaleControls();return;}
   if(state.saleStep==='checkout'){const change=(Number(state.saleDraft.cashReceived)||0)-totals.total,delivery=state.saleDraft.fulfillment==='delivery';$('#content').innerHTML=`<section class="pos-flow checkout-screen card">${saleStepHeader('Thanh toán','cart')}<button class="customer-chip" data-action="customer-picker">${icon('user')}<span><small>Khách hàng</small>${esc(customerLabel(customer))}</span>${icon('chevron-right')}</button><div class="checkout-total"><span>Tổng thanh toán</span><strong>${fmt(totals.total)} ₫</strong></div><div class="choice-section"><h3>Phương thức thanh toán</h3>${[['cash','Tiền mặt'],['transfer','Chuyển khoản'],['qr','QR']].map(([v,l])=>`<button class="choice-row ${state.saleDraft.payment===v?'active':''}" data-payment-choice="${v}"><i></i><span>${l}</span></button>`).join('')}</div>${state.saleDraft.payment==='cash'?`<div class="cash-panel"><label>Khách đưa<input id="cashReceived" type="number" inputmode="decimal" value="${esc(state.saleDraft.cashReceived)}" placeholder="0"/></label><button class="cash-suggest" data-cash-exact>Đủ tiền · ${fmt(totals.total)} ₫</button><div><span>Tiền thừa</span><strong id="cashChange">${fmt(Math.max(0,change))} ₫</strong></div></div>`:''}<div class="choice-section"><h3>Hình thức nhận hàng</h3><div class="segment"><button class="${!delivery?'active':''}" data-fulfillment="counter">Tại quầy</button><button class="${delivery?'active':''}" data-fulfillment="delivery">Giao hàng</button></div>${delivery?`<div class="delivery-fields"><input id="recipient" value="${esc(state.saleDraft.recipient)}" placeholder="Người nhận"/><input id="deliveryPhone" inputmode="tel" value="${esc(state.saleDraft.phone)}" placeholder="Số điện thoại"/><input id="deliveryAddress" value="${esc(state.saleDraft.address)}" placeholder="Địa chỉ"/><input id="shippingFee" type="number" inputmode="decimal" value="${state.saleDraft.shippingFee||''}" placeholder="Phí giao hàng"/><label class="cod-disabled"><input type="checkbox" disabled/> COD · chưa hỗ trợ lưu an toàn</label><small class="field-limit">Thông tin giao hàng chưa được ghi vào phiếu bán trong data contract hiện tại.</small></div>`:''}</div><label class="cart-note">Ghi chú đơn hàng<input id="saleNote" value="${esc(state.saleDraft.note)}" placeholder="Nhập ghi chú (nếu có)..."/></label><div class="vat-box"><span>Thuế/VAT</span><div class="vat-control"><select id="vatRate">${[[0,'Không VAT'],[5,'5%'],[8,'8%'],[10,'10%'],[-1,'Tùy chỉnh…']].map(([v,l])=>`<option value="${v}" ${(v===-1?state.saleDraft.vatCustom!=='':Number(state.saleDraft.vatRate)===v)?'selected':''}>${l}</option>`).join('')}</select>${state.saleDraft.vatCustom!==''?`<input id="vatCustom" type="number" inputmode="decimal" min="0" max="100" value="${esc(state.saleDraft.vatCustom)}" placeholder="%"/>`:''}<b id="vatAmount">${fmt(totals.vat)} ₫</b></div></div><div class="invoice-box"><span>Hóa đơn điện tử</span><b>Chưa kết nối</b></div><button class="primary-btn flow-primary" data-sale-pay ${state.saleBusy?'disabled':''}>${state.saleBusy?'Đang lưu…':'Hoàn tất thanh toán'}</button></section>`;$('#cashReceived')?.addEventListener('input',e=>{state.saleDraft.cashReceived=e.target.value;const next=Math.max(0,(Number(e.target.value)||0)-totals.total);if($('#cashChange'))$('#cashChange').textContent=`${fmt(next)} ₫`});$('[data-cash-exact]')?.addEventListener('click',()=>{state.saleDraft.cashReceived=totals.total;$('#cashReceived').value=totals.total;$('#cashChange').textContent='0 ₫'});$('#saleNote')?.addEventListener('input',e=>state.saleDraft.note=e.target.value);[['recipient','recipient'],['deliveryPhone','phone'],['deliveryAddress','address'],['shippingFee','shippingFee']].forEach(([id,key])=>$('#'+id)?.addEventListener('input',e=>state.saleDraft[key]=e.target.value));$('#vatRate')?.addEventListener('change',e=>{const v=e.target.value;if(v==='-1'){state.saleDraft.vatCustom=state.saleDraft.vatCustom||'5';state.saleDraft.vatRate=Math.max(0,Math.min(100,Number(state.saleDraft.vatCustom)||0));}else{state.saleDraft.vatCustom='';state.saleDraft.vatRate=Number(v)||0;}renderSales();});$('#vatCustom')?.addEventListener('input',e=>{state.saleDraft.vatCustom=e.target.value;state.saleDraft.vatRate=Math.max(0,Math.min(100,Number(e.target.value)||0));const t=saleTotals();const va=$('#vatAmount');if(va)va.textContent=fmt(t.vat)+' ₫';const tt=document.querySelector('.checkout-total strong');if(tt)tt.textContent=fmt(t.total)+' ₫';});bindSaleControls();return;}
  const q=state.saleSearch.toLowerCase(),matched=state.data.products.filter(p=>p.active!==false&&(state.saleType==='all'||p.type===state.saleType)&&(!q||[p.name,p.sku,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q))))),items=(q||state.saleShowAll)?matched.slice(0,state.saleShowAll?40:20):matched.slice(0,8);
   $('#content').innerHTML=`<section class="pos-browser ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}"><div class="pos-search-row"><input id="saleSearch" value="${esc(state.saleSearch)}" placeholder="Tên / SKU / barcode"/><button data-action="sale-scan" aria-label="Quét mã">${icon('scan-line')}</button></div><div class="pos-chips"><button class="${state.saleType==='all'?'active':''}" data-sale-type="all">Tất cả</button><button class="${state.saleType==='PRODUCT'?'active':''}" data-sale-type="PRODUCT">Sản phẩm</button><button class="${state.saleType==='SERVICE'?'active':''}" data-sale-type="SERVICE">Dịch vụ</button></div><div class="pos-grid ${state.displayPrefs.posView} ui-profile-${state.uiProfile?.effective_profile_id || 'standard'}">${items.map(saleProductTile).join('')||'<div class="empty">Không tìm thấy sản phẩm.</div>'}</div>${!q&&!state.saleShowAll&&matched.length>items.length?'<button class="catalog-more" data-sale-show-all>Xem tất cả sản phẩm</button>':''}</section>${totals.lines.length?`<div class="sale-mobile-bar pos-cart-bar"><button class="sale-mobile-summary" data-sale-step="cart"><b>${totals.lines.reduce((n,x)=>n+x.quantity,0)} sản phẩm</b><strong>${fmt(totals.total)} ₫</strong></button><button class="primary-btn" data-sale-step="cart">Tiếp tục</button></div>`:''}`;
  $('#saleSearch').oninput=e=>{state.saleSearch=e.target.value;state.saleShowAll=false;keepFocus('#saleSearch',renderSales)};$$('[data-sale-type]').forEach(b=>b.onclick=()=>{state.saleType=b.dataset.saleType;state.saleShowAll=false;renderSales()});$('[data-sale-show-all]')?.addEventListener('click',()=>{state.saleShowAll=true;renderSales()});bindSaleControls();
}
async function submitSale(){if(state.saleBusy)return;state.saleBusy=true;renderSales();const saleId=state.salePendingId||(state.salePendingId=saleUuid());try{const totals=saleTotals();const vatLines=(()=>{if(!totals.vat)return state.saleCart;const base=Math.max(0,totals.subtotal-totals.discount);let acc=0;return state.saleCart.map((line,i,arr)=>{const lt=Math.max(0,line.quantity*line.unitPrice-line.discount);const share=i===arr.length-1?totals.vat-acc:Math.round(totals.vat*(base?lt/base:0));acc+=share;return {...line,tax_amount:Math.max(0,Number(line.tax_amount)||0)+Math.max(0,share)};})})();const sale=await createSale({saleId,items:vatLines,warehouseId:state.saleDraft.warehouseId||bestSaleWarehouse(state.saleCart)||state.data.warehouses[0]?.id,paymentMethod:state.saleDraft.payment,discount:totals.discount,note:state.saleDraft.note,customerLabel:customerLabel()});state.saleReceipt=sale;state.saleCart=[];state.salePendingId='';state.saleBusy=false;state.saleCustomer=null;state.saleStep='success';state.saleDraft={discount:0,discountMode:'amount',cashReceived:'',note:'',payment:'cash',warehouseId:'',fulfillment:'counter',recipient:'',phone:'',address:'',shippingFee:0,cod:false,vatRate:0,vatCustom:''};await refresh();toast('Đã thanh toán và lưu phiếu bán.','ok')}catch(err){state.saleBusy=false;renderSales();toast(err.message,'error')} }
function openSaleScan(){openModal({title:'Quét mã cho bán hàng',sub:'Quét liên tục hoặc nhập barcode/SKU thủ công.',hideSubmit:true,body:`<div class="scan-box"><video id="saleScanVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;display:none"></video><div id="saleScanPlaceholder"><div class="scan-placeholder-icon">${icon('scan-line')}</div><strong>Đưa barcode vào khung</strong><small>Camera hoạt động trên HTTPS hoặc localhost</small></div><div class="scan-frame"></div><div class="scan-corners"></div><div class="scan-line"></div></div><div id="saleScanStatus" class="scan-status">Nếu camera không khả dụng, nhập mã bên dưới.</div><div class="field" style="margin-top:14px"><label>Barcode / SKU thủ công</label><div style="display:flex;gap:8px"><input id="saleManualCode" inputmode="numeric" placeholder="Nhập mã..."/><button class="primary-btn" id="saleFindCode">Thêm</button></div></div>`});$('#saleFindCode').onclick=()=>{const code=$('#saleManualCode').value.trim().toLowerCase();const p=state.data.products.find(x=>[x.barcode,x.sku].some(v=>String(v||'').toLowerCase()===code));if(!p)return toast('Không tìm thấy barcode/SKU.','error');addSaleItem(p.id);$('#saleManualCode').value='';$('#saleScanStatus').textContent=`Đã thêm ${p.name}. Có thể quét tiếp.`;};startSaleBarcodeCamera();}
async function startSaleBarcodeCamera(){if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia)return;try{const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','qr_code']});const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const v=$('#saleScanVideo');if(!v)return;v.srcObject=stream;v.style.display='block';$('#saleScanPlaceholder').style.display='none';let lastCode='',lastAt=0;const loop=async()=>{if(!document.body.contains(v)){stream.getTracks().forEach(t=>t.stop());return}try{const codes=await detector.detect(v);const raw=codes[0]?.rawValue||'';const now=Date.now();if(raw&&(raw!==lastCode||now-lastAt>1200)){lastCode=raw;lastAt=now;const p=state.data.products.find(x=>[x.barcode,x.sku].some(v=>String(v||'')===String(raw)));if(p){addSaleItem(p.id);const status=$('#saleScanStatus');if(status)status.textContent=`Đã thêm ${p.name}. Tiếp tục đưa mã khác vào khung.`;}}}catch{}requestAnimationFrame(loop)};loop()}catch{}}

function metricCard(label,value,note,accent='blue',action=''){const tag=action?'button':'div';return `<${tag} class="metric-card ${accent}" ${action||''}><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div>${action?icon('chevron-right'):''}</${tag}>`}
function quickTile(kind,_icon,title,sub){const names={receive:'package-plus',issue:'package-minus',transfer:'arrow-left-right',count:'clipboard-check'};if(kind==='sales')return `<button class="quick-tile" data-page="sales"><span class="qt-ico">${icon('shopping-cart')}</span><strong>${title}</strong><small>${sub}</small></button>`;if(kind==='transactions')return `<button class="quick-tile" data-page="transactions"><span class="qt-ico">${icon('file-text')}</span><strong>${title}</strong><small>${sub}</small></button>`;if(kind==='customers')return `<button class="quick-tile" data-action="customer-directory"><span class="qt-ico">${icon('user')}</span><strong>${title}</strong><small>${sub}</small></button>`;return `<button class="quick-tile" data-action="quick-action" data-kind="${kind}"><span class="qt-ico">${icon(names[kind]||'package-search')}</span><strong>${title}</strong><small>${sub}</small></button>`}
function renderQuickActions(workspace){
  if(!workspace || workspace.profile_id === 'general' || workspace.profile_id === 'other'){
    return `
        <div class="quick-tile quick-hero">
          <button class="quick-hero-main" data-page="sales"><span class="qt-ico">${icon('shopping-cart')}</span><strong style="font-size:13px;line-height:1.2;white-space:normal;word-break:keep-all;text-align:center;display:block;overflow:visible;text-overflow:clip">Bán hàng</strong></button>
          <button class="quick-hero-sub" data-action="future-action" data-label="Đổi - Trả"><strong>Đổi - Trả</strong><em class="quick-hero-arrow">${icon('chevron-right')}</em></button>
        </div>
        ${quickTile('receive','📥','Nhập kho','Thêm hàng vào kho')}
        ${quickTile('count','✓','Kiểm kho','Xem tồn kho')}
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
          <button class="quick-hero-sub" data-action="future-action" data-label="Đổi - Trả"><strong>Đổi - Trả</strong><em class="quick-hero-arrow">${icon('chevron-right')}</em></button>
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

  const isDemo = sessionStorage.getItem('qbiz_preview_demo') === '1';
  const isUnauth = auth.status === AUTH_STATES.UNAUTHENTICATED;

  const dashboardBodyHtml = `
    <section class="dashboard-sales-hero card">
      <button class="dashboard-today" data-report-open="today"><span>Hôm nay</span><strong>${fmt(reportToday.net)} ₫</strong><small>${reportToday.sales.length} giao dịch</small></button>
      <button class="dashboard-month" data-report-open="month"><span>Tháng này</span><strong>${fmt(reportMonth.net)} ₫</strong><small>${reportMonth.sales.length} phiếu · ${esc(compare)}</small></button>
      <div class="dashboard-sales-subcards">
        <button class="dashboard-sales-subcard" data-page="orders"><i>${icon('shopping-cart')}</i><span>Đơn hàng</span><b>${fmt(d.orders.length)} đơn</b><em>${icon('chevron-right')}</em></button>
        <button class="dashboard-sales-subcard" data-report-open="month" ${reportMonth.hasCost ? '' : 'data-no-data="1"'}><i>${icon('trending-up')}</i><span>Lợi nhuận</span><b>${reportMonth.hasCost ? `${fmt(reportMonth.profit)} ₫` : 'Chưa đủ dữ liệu'}</b></button>
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
        <section class="card public-entry-card" style="background:#ffffff;border:1px solid var(--border,#e2e8f0);border-radius:18px;max-width:520px;width:100%;padding:22px 18px;box-shadow:0 18px 40px -12px rgba(15,23,42,0.18);animation:entryCardFadeIn 0.22s ease-out">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="width:42px;height:42px;border-radius:12px;background:var(--primary,#0284c7);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:20px;box-shadow:0 2px 8px rgba(2,132,199,0.3);flex-shrink:0">Q</div>
            <div style="min-width:0">
              <h2 style="margin:0;font-size:16.5px;font-weight:700;color:#0f172a;line-height:1.3">QBiz Kho — Quản lý & Bán hàng</h2>
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
      })() : ''}
      ${dashboardBodyHtml}
    `;
  }

  $$('[data-report-open]').forEach(b=>b.onclick=()=>{
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
  $('#content').innerHTML=`
  <section class="settings-center">
    <section class="card section-card settings-section"><div class="section-head"><div><h2>Cửa hàng</h2><p>Thông tin và quy tắc vận hành.</p></div></div><div class="settings-list"><button data-action="business-profile"><span>${icon('store')}<b>Thông tin cửa hàng</b><small>Tên, liên hệ, địa chỉ lấy và hoàn hàng</small></span>${icon('chevron-right')}</button><button data-action="business-mode-selector"><span>${icon('briefcase')}<b>Chế độ kinh doanh</b><small>${esc(currentModeName)}</small></span>${icon('chevron-right')}</button><button data-action="sale-preferences"><span>${icon('shopping-cart')}<b>Bán hàng & thanh toán</b><small>Kho và phương thức thanh toán mặc định</small></span>${icon('chevron-right')}</button><button data-action="warehouse-management"><span>${icon('arrow-left-right')}<b>Kho hàng</b><small>${d.warehouses.length} kho đang hoạt động</small></span>${icon('chevron-right')}</button></div></section>
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
  const prefs={default_warehouse_id:'',default_payment:'cash',...await settingValue(SALES_SETTING,{})};
  openModal({title:'Bán hàng',sub:'Mặc định cho thiết bị này.',body:`<div class="form-grid"><div class="field"><label>Kho bán mặc định</label><select id="salesWarehouse"><option value="">Chọn khi lập phiếu</option>${state.data.warehouses.map(w=>`<option value="${w.id}" ${prefs.default_warehouse_id===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></div><div class="field"><label>Thanh toán mặc định</label><select id="salesPayment"><option value="cash" ${prefs.default_payment==='cash'?'selected':''}>Tiền mặt</option><option value="transfer" ${prefs.default_payment==='transfer'?'selected':''}>Chuyển khoản</option><option value="qr" ${prefs.default_payment==='qr'?'selected':''}>QR</option></select></div></div>`,submitText:'Lưu cài đặt',onSubmit:r=>saveLocalSetting(SALES_SETTING,{default_warehouse_id:$('#salesWarehouse',r).value,default_payment:$('#salesPayment',r).value})});
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

async function printDocument({type='receipt',documentId='',saleId='',orderId='',reprint=false,test=false,template=null}={}){
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
  const now=new Date(),start=new Date(now),end=new Date(now);end.setHours(23,59,59,999);
  if(range==='today')start.setHours(0,0,0,0);
  else if(range==='yesterday'){start.setDate(now.getDate()-1);start.setHours(0,0,0,0);end.setDate(now.getDate()-1);end.setHours(23,59,59,999);}
  else if(range==='2_days'||range==='2d'){start.setDate(now.getDate()-1);start.setHours(0,0,0,0);}
  else if(range==='3_days'||range==='3d'){start.setDate(now.getDate()-2);start.setHours(0,0,0,0);}
  else if(range==='7d'||range==='week')start.setDate(now.getDate()-6),start.setHours(0,0,0,0);
  else if(range==='last_week'){start.setDate(now.getDate()-13);start.setHours(0,0,0,0);end.setDate(now.getDate()-7);end.setHours(23,59,59,999);}
  else if(range==='30d')start.setDate(now.getDate()-29),start.setHours(0,0,0,0);
  else if(range==='month')start.setDate(1),start.setHours(0,0,0,0);
  else if(range==='last_month'){start.setMonth(now.getMonth()-1,1);start.setHours(0,0,0,0);end.setDate(0);end.setHours(23,59,59,999);}
  else if(range==='custom'){ if(state.reportCustomStart)start.setTime(new Date(`${state.reportCustomStart}T00:00:00`).getTime()); else start.setFullYear(2000); if(state.reportCustomEnd)end.setTime(new Date(`${state.reportCustomEnd}T23:59:59.999`).getTime()); }
  else start.setFullYear(2000);
  const sales=(state.data.sales||[]).filter(s=>{const date=new Date(s.created_at||s.createdAt);return ['COMPLETED','PAID'].includes(s.status)&&date>=start&&date<=end});
  const saleCodes=new Set(sales.flatMap(s=>[s.code,s.id,s.sale_uuid,s.order_id,s.order_code,s.reference,s.reference_id].filter(Boolean)));
  const completedOrders=(state.data.orders||[]).filter(o=>{
    if(o.status!=='COMPLETED')return false;
    const date=new Date(o.created_at||o.createdAt||o.updated_at||0);
    if(date<start||date>end)return false;
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
  const sum=key=>allSales.reduce((n,s)=>n+Number(s[key]||0),0);
  const gross=sum('subtotal'),discount=sum('discount_total'),tax=sum('tax_total'),net=Math.max(0,gross-discount);
  const costTotal = allSales.reduce((sumCost, s) => {
    const saleCost = (s.items || []).reduce((itemSum, item) => {
      const prod = product(item.item_id || item.itemId || item.productId || item.id);
      const unitCost = Number(item.cost_price ?? prod?.cost_price ?? prod?.cost ?? prod?.purchase_price ?? 0);
      return itemSum + (unitCost * Number(item.quantity || 1));
    }, 0);
    return sumCost + saleCost;
  }, 0);
  const refundTotal = (state.data.refunds || []).filter(r => {
    const rDate = new Date(r.created_at || r.createdAt || 0);
    return rDate >= start && rDate <= end;
  }).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const hasCost = costTotal > 0;
  const profit = hasCost ? Math.max(0, net - costTotal - refundTotal) : 0;
  const paymentRows=allSales.flatMap(s=>(s.payments||[]).map(p=>({...p,sale:s})));
  const collected=paymentRows.filter(p=>p.status==='PAID').reduce((n,p)=>n+Number(p.amount||0),0);
  const receivable=paymentRows.filter(p=>p.status==='PENDING').reduce((n,p)=>n+Number(p.amount||0),0);
  return {sales:allSales,gross,discount,net,cost:costTotal,profit,hasCost,tax,collected,receivable,paymentRows};
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
  const sum=key=>allSales.reduce((n,s)=>n+Number(s[key]||0),0),gross=sum('subtotal'),discount=sum('discount_total'),tax=sum('tax_total'),net=Math.max(0,gross-discount),payments=allSales.flatMap(s=>(s.payments||[]).map(p=>({...p,sale:s}))),collected=payments.filter(p=>p.status==='PAID').reduce((n,p)=>n+Number(p.amount||0),0);

  const prodMap = new Map((state.data.products || []).map(p => [p.id, p]));
  let costTotal = 0, refundTotal = 0;
  for (const s of allSales) {
    refundTotal += Number(s.refund_amount || s.refundTotal || 0);
    for (const item of (s.items || [])) {
      const pId = item.item_id || item.itemId || item.productId || item.product_id;
      const p = prodMap.get(pId);
      const itemCost = Number(item.cost_price ?? item.cost ?? p?.cost_price ?? p?.cost ?? p?.purchase_price ?? 0);
      const qty = Number(item.quantity || 1);
      costTotal += (Number(item.cost_total) > 0 ? Number(item.cost_total) : (itemCost * qty));
    }
  }
  const hasCost = costTotal > 0;
  const profit = hasCost ? Math.max(0, net - costTotal - refundTotal) : 0;

  return {sales:allSales,gross,discount,tax,net,cost:costTotal,profit,hasCost,payments,collected,receivable:payments.filter(p=>p.status==='PENDING').reduce((n,p)=>n+Number(p.amount||0),0)};
}
function preparedReport(title,reason){return `<section class="card feature-panel report-prepared"><div class="section-head"><div><h2>${title}</h2><p>${reason}</p></div>${surfaceStatus('prepared','Chưa đủ dữ liệu')}</div><div class="empty"><strong>Không tạo số liệu giả</strong><span>Khi contract và nguồn dữ liệu thật sẵn sàng, báo cáo này sẽ dùng cùng bộ lọc hiện tại.</span></div></section>`}
function renderFeatureReports(){
  setTitle('Báo cáo','QBiz');const r=featureReportSales(),productMap=new Map();
  for(const s of r.sales)for(const i of s.items||[]){const key=i.item_id||i.itemId||i.sku||i.name,row=productMap.get(key)||{id:i.item_id||i.itemId,name:i.name||'Mặt hàng',qty:0,revenue:0};row.qty+=Number(i.quantity||0);row.revenue+=Number(i.line_total??i.lineTotal??0);productMap.set(key,row)}
  const products=[...productMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,20),inventory=state.data.products.filter(p=>p.type!=='SERVICE').map(p=>({p,t:stockView(p,state.reportWarehouse)})),low=inventory.filter(x=>x.t.available<=Number(x.p.lowStock||0));
  const tabs=[['overview','Tổng quan'],['revenue','Doanh thu'],['orders','Đơn hàng'],['products','Sản phẩm'],['inventory','Kho'],['payments','Thanh toán'],['returns','Trả hàng'],['debt','Công nợ'],['customers','Khách hàng'],['staff','Nhân viên / Ca'],['shipping','Vận chuyển']];
  const ranges=[['today','Hôm nay'],['yesterday','Hôm qua'],['7d','7 ngày'],['month','Tháng này'],['lastmonth','Tháng trước'],['custom','Tùy chọn']];
  const sourceRows=r.sales.map(s=>`<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code||'Phiếu bán')}</strong><small>${esc(s.customer_label||'Khách lẻ')} · ${dt(s.created_at||s.createdAt)}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có giao dịch trong khoảng đã chọn.</div>';
  let body='';
  if(['overview','revenue'].includes(state.reportTab))body=`<section class="report-metrics"><div><span>Doanh thu trước giảm</span><b>${fmt(r.gross)} ₫</b></div><div><span>Giảm giá</span><b>− ${fmt(r.discount)} ₫</b></div><div><span>Doanh thu thuần</span><b>${fmt(r.net)} ₫</b></div><div><span>Thuế</span><b>${fmt(r.tax)} ₫</b></div><div><span>Đã thu</span><b>${fmt(r.collected)} ₫</b></div><div><span>Còn phải thu theo payment</span><b>${fmt(r.receivable)} ₫</b></div></section><section class="card feature-panel"><div class="section-head"><div><h2>Giao dịch nguồn</h2><p>${r.sales.length} phiếu hoàn tất trong bộ lọc.</p></div></div>${sourceRows}</section>${state.reportTab==='overview'?(r.hasCost?`<section class="card feature-panel"><div class="section-head"><div><h2>Lợi nhuận gộp</h2><p>Tính toán tự động từ doanh thu thuần trừ giá vốn và hoàn tiền.</p></div></div><div class="report-metrics" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:0"><div><span>Tổng giá vốn</span><b>${fmt(r.cost)} ₫</b></div><div><span>Lợi nhuận gộp</span><b style="color:#16a34a">${fmt(r.profit)} ₫</b></div><div><span>Tỷ suất lợi nhuận</span><b>${r.net>0?((r.profit/r.net)*100).toFixed(1):0}%</b></div></div></section>`:preparedReport('Lợi nhuận','Phiếu bán chưa có cost snapshot/expense ledger đủ để tính lợi nhuận an toàn.')):''}`;
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
  $('#content').innerHTML=`<section class="directory-screen"><div class="directory-toolbar"><input id="customerDirectorySearch" value="${esc(state.customerSearch)}" placeholder="Tìm tên, SĐT, mã khách, MST..."/><button class="primary-btn" data-action="new-customer">+ Thêm</button></div><div class="directory-filters">${[['all','Tất cả'],['retail','Khách lẻ'],['individual','Cá nhân'],['company','Công ty'],['agent','Đại lý']].map(([v,l])=>`<button class="${state.customerType===v?'active':''}" data-customer-type="${v}">${l}</button>`).join('')}</div><div class="directory-list">${rows.map(c=>`<button class="directory-row" data-customer-open="${c.id}"><span class="directory-avatar">${esc((c.name||'K').slice(0,1))}</span><span><strong>${esc(c.customer_code||'KH')} · ${esc(c.name)}</strong><small>${esc(c.phone||'Chưa có số điện thoại')} ${c.customer_group?`· ${esc(c.customer_group)}`:''}</small></span><em>${({retail:'Khách lẻ',individual:'Cá nhân',company:'Công ty',agent:'Đại lý'})[c.customer_type||'retail']}</em>${icon('chevron-right')}</button>`).join('')||'<div class="empty"><strong>Chưa có khách phù hợp</strong></div>'}</div></section>`;
  $('#customerDirectorySearch').oninput=e=>{state.customerSearch=e.target.value;renderCustomers()};$$('[data-customer-type]').forEach(b=>b.onclick=()=>{state.customerType=b.dataset.customerType;renderCustomers()});$$('[data-customer-open]').forEach(b=>b.onclick=()=>openCustomerDetail(all.find(c=>c.id===b.dataset.customerOpen)));
}
function openCustomerDetail(c){if(!c)return;const sales=(state.data.sales||[]).filter(s=>s.customer_label===c.name||String(s.customer_label||'').startsWith(c.name+' ·'));openModal({title:'Chi tiết khách hàng',sub:c.customer_code||c.phone||'',hideSubmit:true,body:`<div class="contact-detail"><div class="contact-hero"><span class="directory-avatar">${esc((c.name||'K').slice(0,1))}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Chưa có số điện thoại')}</p></div><button class="primary-btn" data-customer-sell="${c.id}">Bán hàng</button><button class="secondary-btn" data-action="customer-soft" data-id="${c.id}" data-next="${c.active===false?'active':'inactive'}">${c.active===false?'Hiện lại':'Ẩn khách hàng'}</button></div><div class="product-facts"><div><span>Nhóm khách</span><strong>${esc(c.customer_group||'Chưa phân nhóm')}</strong></div><div><span>Chiết khấu mặc định</span><strong>${fmt(c.default_discount||0)}%</strong></div><div><span>Mã số thuế</span><strong>${esc(c.tax_id||'Chưa cập nhật')}</strong></div><div><span>Địa chỉ</span><strong>${esc(c.address||'Chưa cập nhật')}</strong></div><div><span>Email</span><strong>${esc(c.email||'Chưa cập nhật')}</strong></div></div>${c.note?`<p class="order-note">${esc(c.note)}</p>`:''}<details><summary>Địa chỉ giao hàng / xuất hóa đơn</summary><p class="muted">Chưa có cấu trúc nhiều địa chỉ riêng. Dữ liệu hiện có vẫn được giữ nguyên.</p></details><details><summary>Công nợ</summary><p class="muted">Chưa có Debt Ledger nên không hiển thị hoặc cho sửa số dư công nợ giả.</p></details><h3>Lịch sử mua</h3>${sales.slice(0,10).map(s=>`<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code)}</strong><small>${dt(s.created_at)}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`).join('')||'<div class="empty">Chưa có giao dịch gắn với khách này.</div>'}</div>`});$('[data-customer-sell]',$('#modalRoot'))?.addEventListener('click',()=>{$('#modalRoot').innerHTML='';state.saleCustomer=c;navigate('sales')});$$('[data-sale-id]',$('#modalRoot')).forEach(b=>b.onclick=()=>openTransaction(sales.find(s=>s.id===b.dataset.saleId)));}
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
      ['supplier-returns','undo-2','Trả hàng nhà cung cấp','Quy trình trả NCC (chuẩn bị)'],
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

  const filterRows=activeShift&&shiftStart?rows.filter(r=>new Date(r.date)>=shiftStart):rows;
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
  openModal({title:kind==='in'?'Phiếu thu':'Phiếu chi',submitText:'Lưu phiếu',body:`<div class="form-grid"><div class="field"><label>Số tiền (₫)</label><input id="csAmount" type="number" min="0"/></div><div class="field"><label>Phương thức</label><select id="csMethod"><option>Tiền mặt</option><option>Chuyển khoản</option><option>QR</option></select></div><div class="field"><label>Ngày</label><input id="csDate" type="date" value="${new Date().toISOString().slice(0,10)}"/></div><div class="field full-span"><label>Diễn giải</label><input id="csNote" placeholder="VD: Chi tiền điện"/></div></div>`,onSubmit:async root=>{const amount=Math.max(0,Number($('#csAmount',root).value)||0);if(!amount)throw new Error('Nhập số tiền.');const rows=await modList('cash_entries');rows.push({id:mid('cs'),kind,amount,method:$('#csMethod',root).value,date:$('#csDate',root).value,note:$('#csNote',root).value.trim(),created_at:new Date().toISOString()});await modSave('cash_entries',rows);state.page='cash';}});
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
  const rows=[];
  const body=`<div class="mod-actions"><button class="primary-btn" data-action="srt-new">Tạo phiếu trả NCC</button></div>
<div class="mod-block"><div class="mod-list">${rows.length?rows.map(r=>modRow(esc(r.code),esc(r.reason||''),'')).join(''):modEmpty('Chưa có phiếu trả NCC','Ghi nhận hàng trả lại nhà cung cấp theo chứng từ nhập.')}</div></div>
${modNote('<b>PREPARED</b>: chưa thực hiện biến động tồn kho và công nợ NCC. Cần contract trả hàng NCC (giảm tồn theo lô nhập + giảm công nợ) trước khi ghi sổ.')}
<div class="mod-block"><div class="mod-list">${['NCC + chứng từ nhập','Sản phẩm + số lượng trả','Lý do trả','Giá trị trả','Xem lại','Xác nhận'].map((s,i)=>modRow(`${i+1}. ${esc(s)}`,'Bước bắt buộc khi contract sẵn sàng','')).join('')}</div></div>`;
  panelScreen('Trả hàng nhà cung cấp','Quy trình trả hàng NCC (chuẩn bị).','prepared','Chuẩn bị',body);
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
function exportCsv(name,header,rows){downloadText(`qbiz-${name}-${new Date().toISOString().slice(0,10)}.csv`,csvRows(header,rows),'text/csv;charset=utf-8');toast(`Đã xuất ${rows.length} dòng.`,'ok');}
async function renderExports(){
  const d=state.data||{};
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
  const body=`<div class="mod-list">${defs.map(([key,label,header])=>modRow(esc(label),esc(header.join(', ')),`<button class="secondary-btn" data-action="export-csv" data-key="${key}">Xuất CSV</button>`)).join('')}</div>
${modNote('CSV mở bằng Excel/Google Sheets. Bảng giá: xuất trong màn Bảng giá & giá sỉ. Sao lưu toàn bộ dữ liệu: Cài đặt → Dữ liệu (JSON).')}`;
  panelScreen('Xuất dữ liệu','Xuất CSV các bảng dữ liệu chính (local).','working','Đang dùng',body);
  state.exportDefs=defs;
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
          ` : `
            <button class="primary-btn" data-action="drive-backup-now" style="gap:6px">
              ${icon('file-text')} Sao lưu ngay
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
      <div class="field"><label>Hoàn tiền</label><select id="returnRefundMethod"><option value="original">Theo phương thức gốc</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option></select></div>
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
        await createReturn({
          saleId:sale.id,
          lines,
          reason:$('#returnReason',root)?.value?.trim()||'Khách trả hàng',
          refundMethod:$('#returnRefundMethod',root)?.value||'original'
        });
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
    const summary={sales_count:sales.length,sales_total:0,cash_sales:0,transfer_sales:0,qr_sales:0,refund_total:0,cash_refunds:0};
    for(const sale of sales){
      const payments=Array.isArray(sale.payments)&&sale.payments.length?sale.payments:[{method:sale.payment_method||'cash',amount:sale.grand_total??sale.total??0}];
      for(const p of payments){const amount=Math.max(0,Number(p.amount)||0);summary.sales_total+=amount;if(p.method==='cash')summary.cash_sales+=amount;else if(p.method==='transfer')summary.transfer_sales+=amount;else if(p.method==='qr')summary.qr_sales+=amount;}
    }
    for(const refund of (state.data.refunds||[]).filter(r=>r.shift_id===shift.id)){const amount=Math.max(0,Number(refund.amount)||0);summary.refund_total+=amount;const sale=saleById.get(refund.sale_id)||state.data.sales.find(s=>s.id===refund.sale_id);const method=refund.method==='original'?(sale?.payment_method||'cash'):refund.method;if(method==='cash')summary.cash_refunds+=amount;}
    summary.expected=Math.max(0,Number(shift.opening_cash||0)+summary.cash_sales-summary.cash_refunds);
    return summary;
  };
  const s=active?summaryFor(active):latest?{...(latest.summary||{}),expected:Number(latest.expected_cash||0)}:null;
  const history=shifts.filter(x=>x.status==='CLOSED').slice(0,5);
  if(active){
    $('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Ca đang mở</h2><p>${dt(active.opened_at)} · ${esc(active.employee||'Thiết bị này')}</p></div>${surfaceStatus('working','Đang hoạt động')}</div><div class="shift-summary"><div><span>Tiền đầu ca</span><b>${fmt(active.opening_cash)} ₫</b></div><div><span>Tiền mặt</span><b>${fmt(s.cash_sales)} ₫</b></div><div><span>Chuyển khoản / QR</span><b>${fmt(s.transfer_sales+s.qr_sales)} ₫</b></div><div><span>Hoàn tiền</span><b>${fmt(s.refund_total)} ₫</b></div></div><div class="shift-reconcile"><div><span>Dự kiến trong két</span><strong>${fmt(s.expected)} ₫</strong></div><label>Tiền thực đếm<input id="shiftCountedCash" type="number" inputmode="decimal" min="0" placeholder="${fmt(s.expected)}"/></label><small id="shiftDifference" class="field-limit">Nhập tiền thực đếm để xem chênh lệch.</small></div><button class="primary-btn full" data-shift-close>Đóng ca</button><p class="field-limit">Đối soát vận hành từ phiếu bán và hoàn tiền local; chưa phải sổ quỹ kế toán.</p></section></section>`;
    $('#shiftCountedCash')?.addEventListener('input',e=>{const diff=(Number(e.target.value)||0)-s.expected;const el=$('#shiftDifference');if(el)el.textContent=`Chênh lệch: ${diff>=0?'+':''}${fmt(diff)} ₫`;});
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

function connectorCards(items){return `<div class="connector-grid">${items.map(([name,sub])=>`<article><div><b>${name}</b>${surfaceStatus('prepared','Chưa kết nối')}</div><p>${sub}</p><button class="secondary-btn" disabled>Kết nối</button></article>`).join('')}</div>`}
function renderShippingCenter(){setTitle('Vận chuyển','QBiz');$('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Nhà vận chuyển</h2><p>Thiết lập nền; chưa lưu token hoặc gọi API từ trình duyệt.</p></div>${surfaceStatus('prepared','Chuẩn bị')}</div>${connectorCards([['GHN','Báo giá, tạo vận đơn, tracking và nhãn khi có adapter backend.'],['GHTK','Chưa có adapter/credential server.'],['J&T Express','Chưa có adapter/credential server.']])}<div class="surface-callout"><b>Vận chuyển khác Kênh bán.</b><p>Delivered không đồng nghĩa COD đã đối soát.</p></div></section></section>`}
function renderChannelCenter(){setTitle('Kênh bán','QBiz');$('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Kênh bán hàng</h2><p>Shared Product Core; không tạo bản sản phẩm thứ hai.</p></div>${surfaceStatus('prepared','Chuẩn bị')}</div>${connectorCards([['QBiz Website','Sản phẩm, hiển thị website và đơn hàng qua Action API tương lai.'],['Shopee','Product mapping, order import và settlement cần backend.'],['TikTok Shop','Chưa kết nối.'],['Lazada','Chưa kết nối.']])}</section></section>`}
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
function renderScannerCenter(){setTitle('Quét mã','QBiz');$('#content').innerHTML=`<section class="feature-center"><section class="card feature-panel"><div class="section-head"><div><h2>Quét theo ngữ cảnh</h2><p>Hàng hóa mở chi tiết; Bán hàng thêm giỏ; nghiệp vụ kho thêm vào phiếu.</p></div>${surfaceStatus('working','Có fallback')}</div><div class="context-grid">${[['products','Hàng hóa'],['sales','Bán hàng'],['transfers','Kho']].map(([p,l])=>`<button data-page="${p}">${icon('scan-line')}<b>${l}</b><small>Mở màn rồi dùng nút Quét</small></button>`).join('')}</div><button class="primary-btn full" data-action="scan">Quét / nhập mã thủ công</button><p class="field-limit">Camera phụ thuộc BarcodeDetector và quyền trình duyệt; luôn có ô nhập SKU/barcode thủ công.</p></section></section>`}
function openDeviceCenter(){const _s=state.data.settings||[];const _did=_s.find(x=>x.id==='device_id')?.value,_rid=_s.find(x=>x.id==='register_id')?.value;const _dev=(state.data.devices||[]).find(x=>x.id===_did)||{};const _reg=(state.data.registers||[]).find(x=>x.id===_rid)||{};const devRows=`<div><span>${icon('settings-2')} Thiết bị này</span><b>${esc(_dev.device_name||'Thiết bị này')}</b></div><div><span>${icon('qr-code')} Mã thiết bị</span><b>${esc(_did||'—')}</b></div><div><span>${icon('store')} Quầy</span><b>${esc(_reg.register_name||'Quầy chính')}</b></div><div><span>${icon('layout-dashboard')} Hoạt động gần nhất</span><b>${esc(_dev.updated_at?dt(_dev.updated_at):'Chưa ghi nhận')}</b></div>`;
  openModal({title:'Thiết bị & In',sub:'Trạng thái thiết bị trên máy này.',hideSubmit:true,body:`<div class="device-list">${devRows}<div><span>${icon('file-text')} Máy in hóa đơn</span><b>Chưa kết nối</b></div><div><span>${icon('package-search')} Máy in tem</span><b>Chưa kết nối</b></div><div><span>${icon('scan-line')} Máy quét</span><b>Camera điện thoại</b></div><div><span>${icon('qr-code')} Màn QR khách hàng</span><b>Chưa kết nối</b></div><div><span>${icon('settings-2')} Két tiền</span><b>Qua máy in</b></div></div>`});}
function renderTransactions(){setTitle('Giao dịch & phiếu','QBiz');const sales=(state.data.sales||[]).slice().sort((a,b)=>String(b.created_at||b.createdAt||'').localeCompare(String(a.created_at||a.createdAt||'')));const q=norm(state.txSearch||'');const rows=q?sales.filter(s=>[s.code,s.sale_uuid,s.customer_label,s.payment_method].some(v=>norm(v).includes(q))):sales;const total=rows.reduce((n,s)=>n+Number(s.grand_total??s.total??0),0);$('#content').innerHTML=`<section class="card section-card"><div class="section-head"><div><h2>Phiếu bán</h2><p>${fmt(rows.length)} giao dịch trên thiết bị</p></div></div><div class="search large tx-search"><input id="txSearch" value="${esc(state.txSearch||'')}" placeholder="Tìm mã phiếu / khách hàng..."/></div><button class="secondary-btn full" data-page="documents">Trung tâm chứng từ — hóa đơn, nhập, xuất, chuyển, trả, thu/chi</button><div class="tx-summary"><span>Tổng giá trị</span><strong>${fmt(total)} ₫</strong></div><div class="tx-list">${rows.map(s=>{const paid=(s.payment_status||(s.payments?.[0]?.status))==='PAID';return `<button class="transaction-row" data-sale-id="${s.id}"><span><strong>${esc(s.code||s.sale_uuid||'Phiếu bán')}</strong><small>${esc(s.customer_label||'Khách lẻ')} · ${dt(s.created_at||s.createdAt)}</small></span><span class="tx-meta"><em class="tx-badge ${paid?'ok':'warn'}">${paid?'Đã thu':'Chờ thu'}</em><small>${esc(paymentLabel(s.payment_method||s.payments?.[0]?.method||'cash'))}</small></span><b>${fmt(s.grand_total??s.total)} ₫</b>${icon('chevron-right')}</button>`}).join('')||'<div class="empty"><strong>Chưa có giao dịch</strong><span>Phiếu bán sẽ hiện ở đây sau khi thanh toán.</span></div>'}</div></section>`;$('#txSearch')?.addEventListener('input',e=>{state.txSearch=e.target.value;keepFocus('#txSearch',renderTransactions)});$$('[data-sale-id]').forEach(b=>b.onclick=()=>{const s=sales.find(x=>x.id===b.dataset.saleId);if(s)openTransaction(s)});}
function openTransaction(s){if(!s)return;state.currentSaleId=s.id;updateContextAndChips();const payments=s.payments||[];const unpaid=(s.payment_status||(s.payments?.[0]?.status))!=='PAID';openModal({title:s.code||'Phiếu bán',sub:customerLabel({name:s.customer_label||'Khách lẻ'}),hideSubmit:true,body:`<div class="transaction-detail"><div class="transaction-total">${fmt(s.grand_total??s.total)} ₫</div><div class="detail-list">${(s.items||[]).map(i=>`<div><span><b>${esc(i.name||i.item_name||'Sản phẩm')}</b><small>${esc(i.sku||'')} · ${fmt(i.quantity)} × ${fmt(i.unit_price||0)} ₫</small></span><strong>${fmt(i.line_total??i.lineTotal??0)} ₫</strong></div>`).join('')}</div><div class="order-totals"><div><span>Tạm tính</span><b>${fmt(s.subtotal||0)} ₫</b></div><div><span>Giảm giá</span><b>− ${fmt(s.discount_total||0)} ₫</b></div><div><span>Thuế</span><b>${fmt(s.tax_total||0)} ₫</b></div><div class="grand"><span>Tổng cộng</span><b>${fmt(s.grand_total??s.total)} ₫</b></div></div><section class="order-facts"><div><span>Thanh toán</span><b>${payments.map(p=>`${paymentLabel(p.method)} · ${p.status==='PAID'?'Đã thu':'Chờ xác nhận'}`).join(', ')||paymentLabel(s.payment_method)}</b></div><div><span>Nguồn</span><b>${esc(s.channel||s.source||'POS trên thiết bị')}</b></div><div><span>Kho</span><b>${esc(warehouse(s.warehouseId||s.warehouse_id)?.name||'Chưa ghi nhận')}</b></div><div><span>Thiết bị / quầy</span><b>${esc(s.device_id||s.register_id||'Thiết bị local')}</b></div><div><span>Thời gian</span><b>${dt(s.created_at||s.createdAt)}</b></div></section>${s.note?`<p class="order-note">${esc(s.note)}</p>`:''}<div class="transaction-actions">${unpaid?`<button class="primary-btn" data-action="mark-sale-paid" data-sale-id="${s.id}">Xác nhận đã thu tiền</button>`:''}<button class="secondary-btn" data-action="print-receipt" data-id="${s.id}" data-type="sale">In phiếu</button><button class="secondary-btn" data-action="share-receipt">Chia sẻ</button><button class="ghost-btn" data-action="invoice-info">Hóa đơn điện tử</button></div><p class="muted">Hóa đơn điện tử chưa kết nối nhà cung cấp. In lại không tạo Sale/Payment/Movement mới.</p></div>`});}

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
function openOrderDetail(id){state.currentOrderId=id;updateContextAndChips();const o=(state.data.orders||[]).find(x=>x.id===id);if(!o)return;const paid=o.payment_status==='PAID';openModal({title:'Chi tiết đơn hàng',sub:`${esc(o.code)} · ${orderStatusLabel(o.status)}`,hideSubmit:true,body:`<div class="order-detail"><section class="order-customer"><span>Khách hàng</span><strong>${esc(o.customer_label||'Khách lẻ')}</strong></section><div class="detail-list">${(o.items||[]).map(i=>`<div><span><b>${esc(i.name||i.item_name||product(i.item_id||i.itemId)?.name||'Sản phẩm')}</b><small>${esc(i.sku||product(i.item_id||i.itemId)?.sku||'')} · ${fmt(i.quantity)} × ${fmt(i.unit_price||0)} ₫</small></span><strong>${fmt(i.line_total??i.lineTotal??0)} ₫</strong></div>`).join('')}</div><div class="order-totals"><div><span>Tạm tính</span><b>${fmt(o.subtotal||0)} ₫</b></div><div><span>Giảm giá</span><b>− ${fmt(o.discount_total||0)} ₫</b></div><div><span>Thuế</span><b>${fmt(o.tax_total||0)} ₫</b></div><div class="grand"><span>Tổng cộng</span><b>${fmt(o.grand_total)} ₫</b></div></div><section class="order-facts"><div><span>Thanh toán</span><b class="badge ${paid?'ok':'warn'}">${paid?'Đã thanh toán':'Chờ thanh toán'}</b></div><div><span>Nhận hàng</span><b>${o.fulfillment==='delivery'?'Giao hàng':'Tại quầy'}</b></div><div><span>Kho</span><b>${esc(warehouse(o.warehouseId||o.location_id)?.name||'Kho đã chọn')}</b></div><div><span>Cập nhật</span><b>${dt(o.updated_at||o.created_at)}</b></div></section>${o.note?`<p class="order-note">${esc(o.note)}</p>`:''}<div class="order-detail-actions">${!paid?`<button class="secondary-btn" data-action="mark-order-paid" data-order-id="${o.id}">Xác nhận đã thanh toán</button>`:''}<button class="secondary-btn" data-action="print-receipt" data-id="${o.id}" data-type="order">In lại</button><button class="secondary-btn" data-action="share-receipt">Chia sẻ</button><button class="secondary-btn" data-action="order-documents" data-order-id="${o.id}">Hóa đơn & chứng từ</button>${o.status==='NEW'?`<button class="primary-btn" data-order-action="confirm" data-order-id="${o.id}">Xác nhận</button>`:''}${o.status==='CONFIRMED'?`<button class="primary-btn" data-order-action="process" data-order-id="${o.id}">Xử lý</button>`:''}${o.status==='PROCESSING'?`<button class="primary-btn" data-order-action="complete" data-order-id="${o.id}">Hoàn tất</button>`:''}</div></div>`});}
function openOrderDocuments(id){const o=(state.data.orders||[]).find(x=>x.id===id);if(!o)return;openModal({title:'Hóa đơn & chứng từ',sub:o.code,hideSubmit:true,body:`<div class="document-list"><div><span>${icon('file-text')}<b>Phiếu bán hàng<small>Chứng từ bán nội bộ</small></b></span><button data-action="print-receipt" data-id="${o.id}" data-type="order">In</button></div>${o.fulfillment==='delivery'?`<div><span>${icon('package-search')}<b>Phiếu giao hàng<small>Thông tin giao nhận của đơn</small></b></span><button data-action="print-receipt" data-id="${o.id}" data-type="order">In</button></div>`:''}<div><span>${icon('qr-code')}<b>Tem sản phẩm<small>${(o.items||[]).length} dòng hàng</small></b></span><button data-action="print-receipt" data-id="${o.id}" data-type="order">In</button></div><button class="document-einvoice" data-action="invoice-info"><span>${icon('file-text')}<b>Hóa đơn điện tử<small>Chưa kết nối nhà cung cấp</small></b></span>${icon('chevron-right')}</button></div>`});}
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
  if(onSubmit) $('#modalSubmit',root).onclick=async()=>{ try{ await onSubmit(root); root.innerHTML=''; state.currentProductId=null;state.currentOrderId=null;state.currentSaleId=null;updateContextAndChips(); await refresh(); toast('Đã cập nhật.', 'ok'); } catch(e){ toast(e.message,'error'); } };
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
  const labels={receive:['Nhập hàng','Tăng tồn thực tế'],issue:['Xuất hàng','Giảm tồn thực tế'],transfer:['Chuyển kho','Kho đi trừ ngay, kho nhận tăng khi xác nhận'],count:['Kiểm kho','Nhập số đếm thực tế']};
  const [title,sub]=labels[kind]||labels.receive;
  const lines=[];let selectedId=preProduct||'';
  const extra=kind==='transfer'?`<div class="form-grid"><div class="field"><label>Kho đi</label><select id="fromWh">${whOptions()}</select></div><div class="field"><label>Kho nhận</label><select id="toWh">${whOptions(state.data.warehouses[1]?.id)}</select></div></div>`:`<div class="form-grid"><div class="field"><label>${kind==='receive'?'Kho nhận':'Kho'}</label><select id="wh">${whOptions()}</select></div>${kind==='receive'?`<div class="field"><label>Nhà cung cấp <small>(tuỳ chọn)</small></label><select id="supplierId">${supplierOptions()}</select></div>`:''}</div>`;
  const body=`<div class="stock-flow"><div class="field"><label>Quét mã / Tìm sản phẩm</label><div class="stock-search"><input id="stockProductSearch" value="${esc(preProduct?product(preProduct)?.name||'':'')}" placeholder="Tên / SKU / barcode..." autocomplete="off"/>${icon('scan-line')}</div><div id="stockProductResults" class="stock-product-results"></div></div>${extra}<div id="selectedStockProduct" class="selected-stock-product"></div><div class="stock-entry-row"><label>${kind==='count'?'Số lượng thực tế':'Số lượng'}<div class="quantity-control"><button type="button" id="stockMinus">−</button><input id="qty" type="number" inputmode="numeric" min="0" value="${kind==='count'?0:1}"/><button type="button" id="stockPlus">+</button></div></label>${kind==='receive'?'<label>Giá nhập<input id="purchasePrice" type="number" inputmode="decimal" min="0" placeholder="0"/></label>':''}</div>${kind==='count'?'<div class="count-compare"><div><span>Tồn hệ thống</span><strong id="systemQty">0</strong></div><div><span>Thực tế</span><strong id="actualQty">0</strong></div><div><span>Chênh lệch</span><strong id="countDiff">0</strong></div></div>':''}<button type="button" class="secondary-btn full" id="addLine">${kind==='count'?'Lưu dòng này':'+ Thêm dòng'}</button><div class="field"><label>Mã chứng từ / Ghi chú</label><input id="ref" placeholder="VD: PN-001..."/></div><div id="lineList" class="line-list"></div>${kind==='count'?'<div id="countSummary" class="count-summary"><span>Đã kiểm <b>0</b></span><span>Chưa khớp <b>0</b></span><span>Tạm chênh lệch <b>0</b></span></div>':''}</div>`;
  openModal({title,sub,body,submitText:kind==='count'?'Chốt kiểm kho':'Xác nhận',onSubmit:async r=>{if(!lines.length)throw new Error('Hãy thêm ít nhất một sản phẩm.');const ref=$('#ref',r).value,warehouseId=$('#wh',r)?.value,fromWarehouseId=$('#fromWh',r)?.value,toWarehouseId=$('#toWh',r)?.value;if(kind==='transfer'&&fromWarehouseId===toWarehouseId)throw new Error('Kho đi và kho nhận phải khác nhau.');for(const line of lines){const wid=kind==='transfer'?fromWarehouseId:warehouseId,lv=state.data.levels.find(x=>x.productId===line.productId&&x.warehouseId===wid)||{};if((kind==='issue'||kind==='transfer')&&available(lv)<line.qty)throw new Error(`Không đủ tồn cho ${product(line.productId)?.name}.`);if(kind==='count'&&line.qty<(lv.reserved||0)+(lv.damaged||0))throw new Error(`Số kiểm của ${product(line.productId)?.name} không hợp lệ.`)}if(kind==='transfer'){await createTransfer({lines,fromWarehouseId,toWarehouseId,note:ref});return;}for(const line of lines){if(kind==='receive'){if(line.price!==null)await updateItem({...product(line.productId),purchase_price:line.price});await receive({productId:line.productId,warehouseId,qty:line.qty,reference:ref})}if(kind==='issue')await issue({productId:line.productId,warehouseId,qty:line.qty,reference:ref});if(kind==='count')await countAdjust({productId:line.productId,warehouseId,counted:line.qty,reason:ref||'Kiểm kho'});}}});
  // Replace the legacy per-line submit loop with a single inventory operation.
  $('#modalSubmit',$('#modalRoot')).onclick=async()=>{try{
    if(!lines.length)throw new Error('Hãy thêm ít nhất một sản phẩm.');
    const root=$('#modalRoot'),ref=$('#ref',root).value.trim(),warehouseId=$('#wh',root)?.value,fromWarehouseId=$('#fromWh',root)?.value,toWarehouseId=$('#toWh',root)?.value;
    if(kind==='transfer'){
      if(fromWarehouseId===toWarehouseId)throw new Error('Kho đi và kho nhận phải khác nhau.');
      await createTransfer({lines,fromWarehouseId,toWarehouseId,note:ref});
    }else await applyWarehouseBatch({kind,warehouseId,lines,reference:ref,supplierId:kind==='receive'?($('#supplierId',root)?.value||''):''});
    root.innerHTML='';await refresh();toast(kind==='count'?'Đã chốt kiểm kho.':'Đã lưu phiếu kho.','ok');
  }catch(error){toast(error.message,'error')}};
  const results=$('#stockProductResults'),search=$('#stockProductSearch'),list=$('#lineList'),wid=()=>$('#wh')?.value||$('#fromWh')?.value;
  const sync=()=>{const p=product(selectedId),lv=p&&state.data.levels.find(x=>x.productId===p.id&&x.warehouseId===wid())||{onHand:0},actual=Number($('#qty').value)||0;$('#selectedStockProduct').innerHTML=p?`<div class="product-photo tiny">${p.image?`<img src="${p.image}" alt="${esc(p.name)}"/>`:esc(p.name.slice(0,1))}</div><span><strong>${esc(p.name)}</strong><small>${esc(p.sku||'')} · Tồn ${fmt(lv.onHand)}</small></span>`:'<span>Chưa chọn sản phẩm</span>';if(kind==='count'){$('#systemQty').textContent=fmt(lv.onHand);$('#actualQty').textContent=fmt(actual);$('#countDiff').textContent=(actual-lv.onHand>0?'+':'')+fmt(actual-lv.onHand)}};
  const redraw=()=>{list.innerHTML=lines.map((x,i)=>`<div class="line-item"><span><strong>${esc(product(x.productId)?.name)}</strong><small>${fmt(x.qty)}${kind==='receive'&&x.price!==null?` · ${fmt(x.price)} ₫`:''}${kind==='count'?` · chênh ${(x.diff>0?'+':'')+fmt(x.diff)}`:''}</small></span><button type="button" data-remove-line="${i}">×</button></div>`).join('')||'<div class="empty-line">Chưa có dòng nào</div>';$$('[data-remove-line]',list).forEach(b=>b.onclick=()=>{lines.splice(Number(b.dataset.removeLine),1);redraw()});if(kind==='count'){const mismatch=lines.filter(x=>x.diff),sum=mismatch.reduce((n,x)=>n+x.diff,0),boxes=$$('#countSummary b');boxes[0].textContent=lines.length;boxes[1].textContent=mismatch.length;boxes[2].textContent=(sum>0?'+':'')+fmt(sum)}};
  search.oninput=()=>{const q=search.value.toLowerCase().trim(),rows=state.data.products.filter(p=>p.type!=='SERVICE'&&q&&[p.name,p.sku,p.barcode].some(v=>String(v||'').toLowerCase().includes(q)||norm(v).includes(norm(q)))).slice(0,8);results.innerHTML=rows.map(p=>`<button data-stock-product="${p.id}"><strong>${esc(p.name)}</strong><small>${esc(p.sku||'')} · ${fmt(stockView(p,$('#wh')?.value||$('#fromWh')?.value||'').available)} có thể bán</small></button>`).join('');$$('[data-stock-product]',results).forEach(b=>b.onclick=()=>{selectedId=b.dataset.stockProduct;search.value=product(selectedId).name;results.innerHTML='';sync()})};
  $('#wh')?.addEventListener('change',sync);$('#fromWh')?.addEventListener('change',sync);$('#qty').oninput=sync;$('#stockMinus').onclick=()=>{$('#qty').value=Math.max(0,Number($('#qty').value)-1);sync()};$('#stockPlus').onclick=()=>{$('#qty').value=Number($('#qty').value)+1;sync()};$('#addLine').onclick=()=>{const qty=Number($('#qty').value);if(!selectedId||(kind==='count'?qty<0:!(qty>0)))return toast('Chọn sản phẩm và nhập số lượng hợp lệ.','error');const lv=state.data.levels.find(x=>x.productId===selectedId&&x.warehouseId===wid())||{onHand:0};lines.push({productId:selectedId,qty,price:kind==='receive'&&$('#purchasePrice').value!==''?Number($('#purchasePrice').value):null,diff:qty-lv.onHand});selectedId='';search.value='';$('#qty').value=kind==='count'?0:1;if($('#purchasePrice'))$('#purchasePrice').value='';sync();redraw()};sync();redraw();
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
  const p=product(id),service=p.type==='SERVICE',type=service?'SERVICE':'PRODUCT',selectedCategory=p.categoryId||p.category||'';
  const body=`<div class="compact-edit-form"><div class="form-grid edit-primary-grid"><div class="field full-span"><label>Tên</label><input id="editName" value="${esc(p.name)}" /></div><div class="field"><label>Giá bán</label><input id="editPrice" type="number" inputmode="decimal" value="${p.price??''}" /></div>${service?'':'<div class="field"><label>Giá nhập gần nhất</label><input id="editCost" type="number" min="0" inputmode="decimal" value="'+(p.purchase_price??'')+'" /></div>'}<div class="field"><label>Danh mục</label><select id="editCategory">${categoryOptions(type,selectedCategory)}</select></div>${service?'<div class="field"><label>Thời lượng (phút)</label><input id="editDuration" type="number" min="0" inputmode="numeric" value="'+(p.duration_minutes??'')+'" /></div>':'<div class="field"><label>SKU</label><input id="editSku" value="'+esc(p.sku||'')+'" readonly /></div>'}</div>${compactImagePickerMarkup()}<details class="edit-more"><summary>Thông tin thêm</summary><div class="form-grid">${service?'<label class="check-field"><input id="editBooking" type="checkbox" '+(p.booking_enabled?'checked':'')+' /> Cho phép đặt lịch</label><label class="check-field"><input id="editActive" type="checkbox" '+(p.active!==false?'checked':'')+' /> Đang hoạt động</label>':'<div class="field"><label>Barcode</label><input id="editBarcode" value="'+esc(p.barcode||'')+'" /></div><div class="field"><label>Tồn tối thiểu</label><input id="editLow" type="number" min="0" value="'+(p.lowStock??5)+'" /></div>'}<div class="field full-span"><label>Mô tả</label><textarea id="editDescription">${esc(p.description||'')}</textarea></div></div></details></div>`;
  openModal({title:'Sửa mục',sub:service?'Dịch vụ':'Sản phẩm',body,submitText:'Lưu thay đổi',onSubmit:r=>{const imgs=r._getImages?.()||[];return updateItem({...p,name:$('#editName',r).value,price:$('#editPrice',r).value===''?null:Number($('#editPrice',r).value),categoryId:$('#editCategory',r).value,description:$('#editDescription',r).value,...(service?{image:imgs[0]||'',images:imgs,duration_minutes:$('#editDuration',r).value===''?null:Number($('#editDuration',r).value),booking_enabled:$('#editBooking',r).checked,active:$('#editActive',r).checked}:{image:imgs[0]||'',images:imgs,purchase_price:$('#editCost',r).value===''?null:Number($('#editCost',r).value),barcode:$('#editBarcode',r).value,lowStock:Number($('#editLow',r).value)})})}});
  bindCompactImagePicker($('#modalRoot'),p.images?.length?p.images:[p.image]);
}
function openQR(id){const p=product(id);if(!p)return;openModal({title:'Mã QR sản phẩm',sub:`${p.name} · ${p.sku}`,hideSubmit:true,body:`<div class="qr-card"><div id="qrCanvas" class="qr-canvas"><div class="empty-line">Đang tạo mã QR…</div></div><strong>${esc(p.name)}</strong><span>${esc(p.sku)}${p.barcode?` · ${esc(p.barcode)}`:''}</span><div class="qr-actions"><button class="secondary-btn" data-qr-download="png">Tải PNG</button><button class="primary-btn" data-qr-download="svg">Tải SVG</button></div></div>`});const host=$('#qrCanvas');if(!window.QRCodeStyling)return host.innerHTML='<div class="empty-line">Không tải được bộ tạo QR. Hãy mở lại khi có mạng.</div>';const qr=new QRCodeStyling({width:260,height:260,type:'svg',data:p.barcode||p.sku,image:'./icons/icon-192.png',dotsOptions:{color:'#102a56',type:'rounded'},cornersSquareOptions:{color:'#102a56',type:'extra-rounded'},cornersDotOptions:{color:'#16a77a',type:'dot'},backgroundOptions:{color:'#ffffff'},imageOptions:{crossOrigin:'anonymous',margin:8,hideBackgroundDots:true},qrOptions:{errorCorrectionLevel:'H'}});qr.append(host);host._qr=qr;$$('[data-qr-download]',$('#modalRoot')).forEach(b=>b.onclick=()=>qr.download({name:`qbiz-${p.sku}`,extension:b.dataset.qrDownload}));}
function internalBarcode(){const base='200'+Array.from({length:9},()=>Math.floor(Math.random()*10)).join('');const sum=base.split('').reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0);return base+String((10-sum%10)%10);}
function openNewProduct(){ return state.productType==='SERVICE'?openNewServiceForm():openNewProductForm(); }
function openNewServiceForm(){
  openModal({title:'Thêm dịch vụ',sub:'Dịch vụ không theo dõi tồn kho.',submitText:'Lưu dịch vụ',body:`<div class="form-grid"><div class="field full-span"><label for="name">Tên dịch vụ</label><input id="name" placeholder="VD: Tư vấn trị liệu" /></div><div class="field"><label for="price">Giá</label><input id="price" type="number" min="0" /></div><div class="field"><label for="categoryId">Danh mục dịch vụ</label><select id="categoryId">${categoryOptions('SERVICE')}</select></div><div class="field"><label for="duration">Thời lượng (phút, tùy chọn)</label><input id="duration" type="number" min="0" /></div><label class="check-field"><input id="booking" type="checkbox" /> Cho phép đặt lịch</label>${filePickerMarkup()}</div>`,onSubmit:r=>createService({name:$('#name',r).value,price:$('#price',r).value,categoryId:$('#categoryId',r).value,durationMinutes:$('#duration',r).value||null,bookingEnabled:$('#booking',r).checked,images:$('#modalRoot')._getImages?.()||[]})});
  bindImagePicker($('#modalRoot'));
}
function openNewProductForm(){
  const units=['Cái','Chiếc','Bộ','Hộp','Chai','Kg','Gói','Khác'];
  const cats=categoryTree('PRODUCT').map(x=>x.category);
  const catsHtml=cats.length?`<div class="np-chips" id="npCategories">${cats.map(c=>`<button type="button" class="np-chip" data-cat-id="${c.id}">${esc(c.name)}</button>`).join('')}</div><button type="button" class="np-more" id="npMoreCats" hidden>thêm »</button>`:'<p class="field-limit">Chưa có danh mục. Tạo trong Hàng hóa → Danh mục.</p>';
  const imgBlock=`<div class="compact-image-field"><div class="compact-image-head"><label>Ảnh</label><small>bấm khung để chọn</small></div><div class="np-imgrow"><div id="editImagePreview" class="compact-image-preview" role="button" tabindex="0" aria-label="Chọn ảnh"></div><div class="compact-image-actions np-col"><label class="secondary-btn upload-inline compact-upload">${icon('camera')} Chụp<input id="editImagesCam" type="file" accept="image/*" capture="environment" hidden /></label></div><input id="editImages" type="file" accept="image/*" multiple hidden /></div></div>`;
  const body=`<div class="form-grid np-form">
    <div class="field full-span"><label for="name">Tên sản phẩm</label><input id="name" placeholder="VD: Ghế N85" /></div>
    <div class="full-span">${imgBlock}</div>
    <div class="full-span"><label class="np-label">Danh mục (chọn được nhiều)</label>${catsHtml}</div>
    <div class="np-row2"><div class="field"><label class="np-money" for="productPrice">Giá bán</label><input id="productPrice" type="number" min="0" inputmode="numeric" /></div><div class="field"><label class="np-money" for="productCost">Giá nhập <span class="np-lite">(gần nhất)</span></label><input id="productCost" type="number" min="0" inputmode="numeric" /></div></div>
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
    const created=await createProduct({name,price:$('#productPrice',r).value,categoryId:catIds[0]||'',sku,barcode,lowStock:$('#low',r).value,image:imgs[0]||'',images:imgs,variants});
    const patch={};if(catIds.length)patch.categoryIds=catIds;
    const cost=$('#productCost',r).value;if(cost!=='')patch.purchase_price=Number(cost);
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
function findScanned(code){ code=String(code||'').trim().toLowerCase(); const p=state.data.products.find(x=>[x.barcode,x.sku].some(v=>String(v||'').toLowerCase()===code)); if(!p) return toast('Không tìm thấy barcode/SKU này.','error'); $('#modalRoot').innerHTML=''; openProduct(p.id); }
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
function downloadText(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
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

function openUserMenuModal() {
  const auth = getAuthState();
  const user = getCurrentUser();
  const shop = getActiveShop();
  const role = getCurrentRole();
  const roleLabel = getRoleLabel(role);

  openModal({
    title: 'Tài khoản & Cửa hàng',
    sub: user?.email || '',
    hideSubmit: true,
    body: `
      <div class="user-menu-box" style="display:flex;flex-direction:column;gap:16px">
        <div style="background:var(--bg-subtle,#f8fafc);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;color:var(--text-muted,#64748b)">CỬA HÀNG ĐANG CHỌN</span>
            <span class="role-badge role-${(role||'').toLowerCase()}" style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px">${esc(roleLabel)}</span>
          </div>
          <div style="font-weight:700;font-size:16px">${esc(shop?.name || 'Chưa có Shop')}</div>
          <div style="font-size:12px;color:var(--text-muted,#64748b);margin-top:2px">ID: ${esc(shop?.id || '---')}</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="secondary-btn" id="menuBtnSwitchShop" style="text-align:left;justify-content:flex-start;gap:8px">
            ${icon('arrow-left-right')} Đổi cửa hàng (Switch Shop)
          </button>
          ${auth.isSuperAdmin ? `
          <button class="secondary-btn" id="menuBtnPlatformAdmin" style="text-align:left;justify-content:flex-start;gap:8px;border-color:var(--primary,#0284c7);color:var(--primary,#0284c7);font-weight:700">
            ${icon('shield-alert')} Platform Admin Console (Nền tảng)
          </button>
          ` : ''}
          ${userCan('MANAGE_USERS') ? `
          <button class="secondary-btn" id="menuBtnAddMember" style="text-align:left;justify-content:flex-start;gap:8px">
            ${icon('users')} Quản lý / Mời nhân viên
          </button>
          ` : ''}
          <button class="secondary-btn" id="menuBtnCreateShop" style="text-align:left;justify-content:flex-start;gap:8px">
            ${icon('store')} Tạo thêm Cửa hàng mới
          </button>
          <button class="secondary-btn" id="menuBtnPermissions" style="text-align:left;justify-content:flex-start;gap:8px">
            ${icon('shield-check')} Xem bảng phân quyền & tính năng
          </button>
        </div>

        <hr style="border:none;border-top:1px solid var(--border,#e2e8f0);margin:4px 0" />

        <button class="secondary-btn" id="menuBtnSignOut" style="color:var(--danger,#ef4444);border-color:var(--danger,#ef4444);width:100%;justify-content:center">
          ${icon('log-out')} Đăng xuất
        </button>
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

async function renderPlatformAdmin() {
  setTitle('Platform Admin Console', 'QBiz Nền tảng');
  if (!isSuperAdmin()) {
    toast('Từ chối truy cập: Bạn không có quyền Platform Super Admin.', 'error');
    state.page = 'dashboard';
    return render();
  }

  const auth = getAuthState();
  const currentTab = state.platformAdminTab || 'metrics';

  $('#content').innerHTML = `
    <section class="platform-admin-screen card" style="display:flex;flex-direction:column;gap:16px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;border-bottom:1px solid var(--border,#e2e8f0);padding-bottom:14px">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <h2 style="margin:0;font-size:20px;font-weight:700">Platform Admin Console</h2>
            <span class="role-badge" style="background:#fee2e2;color:#b91c1c;font-weight:700;font-size:12px;padding:3px 8px;border-radius:4px">SUPER_ADMIN</span>
          </div>
          <div style="font-size:13px;color:var(--text-muted,#64748b);margin-top:4px">
            Tài khoản quản trị viên nền tảng: <b>${esc(auth.user?.email || '')}</b>
          </div>
        </div>
        <button class="secondary-btn" id="exitPlatformAdminBtn" style="gap:6px">
          ${icon('arrow-left-right')} Quay về Cửa hàng
        </button>
      </div>

      <div class="pos-chips" style="display:flex;gap:8px">
        <button class="${currentTab === 'metrics' ? 'active' : ''}" data-admin-tab="metrics">
          ${icon('layout-dashboard')} Tổng quan Nền tảng
        </button>
        <button class="${currentTab === 'shops' ? 'active' : ''}" data-admin-tab="shops">
          ${icon('store')} Quản lý Cửa hàng
        </button>
        <button class="${currentTab === 'audit' ? 'active' : ''}" data-admin-tab="audit">
          ${icon('file-text')} Nhật ký Hệ thống (Audit)
        </button>
      </div>

      <div id="adminTabContent">
        <div style="text-align:center;padding:32px;color:var(--text-muted,#64748b)">Đang tải dữ liệu máy chủ...</div>
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
    if (currentTab === 'metrics') {
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
          <p style="margin:4px 0 0 0">Super Admin chỉ quản trị vòng đời shop, tài khoản và tình trạng đồng bộ. Super Admin không được tự ý ghi đè số liệu giao dịch, xuất nhập kho hay bypass sổ cái của các Shop mà không thông qua engine hợp lệ có lưu vết kiểm toán.</p>
        </div>
      `;
    } else if (currentTab === 'shops') {
      const shops = await getPlatformShops();
      tabContainer.innerHTML = `
        <div style="overflow-x:auto">
          <table class="data-table" style="width:100%;font-size:13px;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--border,#e2e8f0);text-align:left">
                <th style="padding:10px 8px">Cửa hàng</th>
                <th style="padding:10px 8px">Mã / ID</th>
                <th style="padding:10px 8px">Chủ sở hữu</th>
                <th style="padding:10px 8px">Nhân viên</th>
                <th style="padding:10px 8px">Thiết bị</th>
                <th style="padding:10px 8px">Trạng thái</th>
                <th style="padding:10px 8px;text-align:right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${shops.map(s => {
                const isActive = s.status === 'ACTIVE';
                return `
                  <tr style="border-bottom:1px solid var(--border,#e2e8f0)">
                    <td style="padding:10px 8px;font-weight:700">${esc(s.name)}</td>
                    <td style="padding:10px 8px;color:var(--text-muted,#64748b)">${esc(s.code || s.id?.slice(0, 8))}</td>
                    <td style="padding:10px 8px">${esc(s.owner_email || 'Chưa liên kết')}</td>
                    <td style="padding:10px 8px">${fmt(s.member_count || 1)}</td>
                    <td style="padding:10px 8px">${fmt(s.device_count || 1)}</td>
                    <td style="padding:10px 8px">
                      <span class="badge ${isActive ? 'ok' : 'danger'}">${isActive ? 'Hoạt động' : 'Tạm khóa'}</span>
                    </td>
                    <td style="padding:10px 8px;text-align:right">
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
        <div style="overflow-x:auto">
          <table class="data-table" style="width:100%;font-size:13px;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--border,#e2e8f0);text-align:left">
                <th style="padding:10px 8px">Thời gian</th>
                <th style="padding:10px 8px">Người thực hiện</th>
                <th style="padding:10px 8px">Hành động</th>
                <th style="padding:10px 8px">Kết quả</th>
                <th style="padding:10px 8px">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr style="border-bottom:1px solid var(--border,#e2e8f0)">
                  <td style="padding:10px 8px;white-space:nowrap">${dt(l.created_at)}</td>
                  <td style="padding:10px 8px"><span class="role-badge" style="font-size:11px">${esc(l.actor_platform_role || 'SUPER_ADMIN')}</span></td>
                  <td style="padding:10px 8px;font-weight:600">${esc(l.action)}</td>
                  <td style="padding:10px 8px"><span class="badge ${l.result === 'SUCCESS' ? 'ok' : 'danger'}">${esc(l.result)}</span></td>
                  <td style="padding:10px 8px;color:var(--text-muted,#64748b);font-family:monospace;font-size:11px">${esc(JSON.stringify(l.details || {}))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
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

window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.installPrompt=e; });
document.addEventListener('focusin',e=>{const t=e.target;if(t&&/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)){setTimeout(()=>{try{t.scrollIntoView({block:'center',behavior:'smooth'})}catch{}},220);}});
document.addEventListener('click', async e=>{
  const pick=e.target.closest('[data-pick-group]'); if(pick){const grp=pick.dataset.pickGroup; $$(`[data-pick-group="${grp}"]`).forEach(x=>x.classList.toggle('active',x===pick)); return;}
  const page=e.target.closest('[data-page]')?.dataset.page;
  if(page){const notificationId=e.target.closest('[data-notification-id]')?.dataset.notificationId;if(notificationId)state.notificationRead.add(notificationId);navigate(page); return; }
  const action=e.target.closest('[data-action]')?.dataset.action;
  const kind=e.target.closest('[data-kind]')?.dataset.kind;
  if(action==='open-auth-modal' || action==='open-hero-auth') return openAuthModal();
  if(action==='create-shop-modal') return openCreateShopModal();
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
  if(action==='exit-demo') return exitDemo();
  if(action==='open-user-menu') return openUserMenuModal();
  if(action==='add-member-modal') return openAddMemberModal();
  if(action==='open-forgot-password-modal') return openForgotPasswordModal();
  if(action==='switch-shop-modal') return openSwitchShopModal();
  if(action==='open-platform-admin') { state.page = 'platform-admin'; return render(); }
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
  if(action==='drive-backup-now') {
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
  if(action==='dismiss-local-notice'){
    sessionStorage.setItem('qbiz_dismiss_local_notice', '1');
    const b=$('#localDataNotice');
    if(b) b.remove();
    return;
  }
  if(action==='prepare-sync-info') return openSyncInfoModal();
  if(action==='quick-action') return openQuick(kind||'receive');
  if(action==='notifications') return navigate('notifications');
  if(action==='customer-picker') return openCustomerPicker();
  if(action==='new-customer') return openNewCustomer();
  if(action==='new-supplier') return openSupplierDraft();
  if(action==='customer-directory'){state.page='customers';return render();}
  if(action==='device-center') return openDeviceCenter();
  if(action==='business-profile') return openBusinessProfile();
  if(action==='business-mode-selector') return openBusinessModeModal();
  if(action==='ui-profile-selector') return openUiProfileModal();
  if(action==='sale-preferences') return openSalePreferences();
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
  if(action==='srt-new') return toast('Phiếu trả NCC: chưa có contract tồn kho/công nợ — xem mục Chuẩn bị.','');
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
  if(action==='invoice-info')return toast('Hóa đơn điện tử chưa kết nối.','');
  if(action==='scan') return openScan();
  if(action==='sale-scan') return openSaleScan();
  if(action==='new-product') return openNewProduct();
  if(action==='new-order') return openNewOrder();
  if(action==='edit-item') return openEditItem(e.target.closest('[data-product-id]')?.dataset.productId);
  if(action==='new-warehouse') return openNewWarehouse();
  if(action==='warehouse-management') return openWarehouseManagement();
  if(action==='show-qr') return openQR(e.target.closest('[data-product-id]')?.dataset.productId);
  if(action==='install-app') return openInstall();
  if(action==='export-backup') return exportBackup();
  if(action==='backup-now'){await exportBackup();localStorage.setItem('qbiz_last_backup_at',new Date().toISOString());renderBackupCenter();toast('Đã tạo tệp sao lưu local.','ok');return;}
  if(action==='mark-all-read'){buildNotifications().forEach(n=>state.notificationRead.add(n.id));renderNotificationCenter();return;}
  if(action==='export-csv') return exportProductsCsv();
  if(action==='sync-now'){ try{ const r=await flushOutbox(); toast(r.skipped?'Bản local: chưa bật API QBiz.':`Đã gửi ${r.sent} thay đổi.`,'ok'); } catch(err){ toast(err.message,'error'); } return; }
  if(action==='reset-demo'){ if(confirm('Khôi phục dữ liệu demo? Dữ liệu hiện tại trên thiết bị sẽ bị xóa.')){ await clearAll(); await ensureSeed(); await refresh(); toast('Đã khôi phục dữ liệu demo.','ok'); } return; }
  const orderAction=e.target.closest('[data-order-action]')?.dataset.orderAction; const orderId=e.target.closest('[data-order-id]')?.dataset.orderId;
  if(orderAction&&orderId){try{const fn={confirm:confirmOrder,process:processOrder,complete:completeOrder,cancel:cancelOrder}[orderAction];if(fn){await fn(orderId);await refresh();toast(orderAction==='cancel'?'Đã hủy đơn.':'Đã cập nhật đơn.','ok');}}catch(err){toast(err.message,'error')}return;}
  const p=e.target.closest('[data-product]')?.dataset.product; if(p){ if(state.productSelecting&&state.page==='products')return toggleProductSelection(p); return openProduct(p); }
  const tr=e.target.closest('[data-receive-transfer]')?.dataset.receiveTransfer; if(tr){ try{ await receiveTransfer(tr); await refresh(); toast('Kho nhận đã xác nhận hàng.','ok'); } catch(err){ toast(err.message,'error'); } }
  const cancelTr=e.target.closest('[data-cancel-transfer]')?.dataset.cancelTransfer;
  if(cancelTr){
    try{
      await cancelTransfer(cancelTr);
      await refresh();
      toast('Đã hủy phiếu chuyển và hoàn trả tồn kho xuất.','ok');
    }catch(err){toast(err.message,'error');}
    return;
  }
  if(action==='mark-sale-paid'){
    const saleId=e.target.closest('[data-sale-id]')?.dataset.saleId;
    if(saleId){
      try{
        await markSalePaid(saleId);
        $('#modalRoot').innerHTML='';
        await refresh();
        toast('Đã xác nhận thu tiền phiếu bán.','ok');
      }catch(err){toast(err.message,'error');}
    }
    return;
  }
  if(action==='mark-order-paid'){
    const orderId=e.target.closest('[data-order-id]')?.dataset.orderId;
    if(orderId){
      try{
        await markOrderPaid(orderId);
        $('#modalRoot').innerHTML='';
        await refresh();
        toast('Đã xác nhận thanh toán đơn hàng.','ok');
      }catch(err){toast(err.message,'error');}
    }
    return;
  }
});

async function boot(){
  await ensureSeed();
  await ensureLocalIdentity();
  await ensurePrintTemplates();
  await initAuth();
  subscribeAuthState(() => render());
  state.data=await snapshot();
  await businessProfileModule.initBusinessProfile(state.data?.settings);
  state.businessProfile = businessProfileModule.getBusinessProfile();
  await uiProfileModule.initUiProfile(state.data?.settings);
  state.uiProfile = uiProfileModule.resolveUiProfile(uiProfileModule.getUiProfile()?.id, state.businessProfile?.profile_id);
  const pageParam = new URLSearchParams(location.search).get('page') || (location.pathname.includes('/platform-admin') ? 'platform-admin' : null);
  if (pageParam) state.page = pageParam;
  history.replaceState(historyState(),'');render();
  initAiUI(state);
  window.__qbiz_app__ = {
    state,
    reportSales,
    navigate,
    nav: navigate,
    render,
    toast,
    openQuick,
    openScan,
    openProduct,
    openOrderDetail,
    openTransaction,
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
    uiProfile: uiProfileModule
  };
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
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('#modalRoot')?.innerHTML){
    $('#modalRoot').innerHTML='';
    state.currentProductId=null;state.currentOrderId=null;state.currentSaleId=null;
    updateContextAndChips();
    render();
  }
});
boot();
