import { CONFIG } from './config.js';

const STORES = ['products','warehouses','levels','movements','transfers','sales','orders','customers','suppliers','purchase_receipts','returns','refunds','shifts','categories','settings','outbox','devices','registers','print_templates','print_jobs','electronic_invoices','invoice_audit_logs'];
let dbPromise;
let activeTransactionsCount = 0;
let pendingVersionChangeClose = null;

export function isDbBusy() {
  return activeTransactionsCount > 0;
}

export function beginBusyTransaction() {
  activeTransactionsCount++;
}

export function endBusyTransaction() {
  activeTransactionsCount = Math.max(0, activeTransactionsCount - 1);
  if (activeTransactionsCount === 0 && pendingVersionChangeClose) {
    const fn = pendingVersionChangeClose;
    pendingVersionChangeClose = null;
    fn();
  }
}

function requestSafeCloseDb(db, dbName, source = '') {
  const executeClose = () => {
    console.warn(`[DB] Đóng kết nối DB an toàn (${source}) sau khi mọi giao dịch hoàn tất.`);
    try { db.close(); } catch(_) {}
    dbPromise = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qbiz:db_versionchange', { detail: { dbName } }));
    }
  };

  if (isDbBusy()) {
    console.warn(`[DB] Đang có giao dịch bán hàng/kho dở dang (${activeTransactionsCount} tx). Hoãn đóng kết nối cho đến khi giao dịch kết thúc.`);
    pendingVersionChangeClose = executeClose;
  } else {
    executeClose();
  }
}

if(typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'){
  try {
    const syncChannel = new BroadcastChannel('qbiz_db_sync');
    syncChannel.onmessage = (msg) => {
      if(msg?.data?.type === 'PLEASE_CLOSE_DB'){
        if(dbPromise){
          dbPromise.then(db => {
            requestSafeCloseDb(db, globalThis.__QBIZ_TEST_DB_NAME || CONFIG.DB_NAME, 'BroadcastChannel');
          }).catch(()=>{});
        }
      }
    };
  } catch(_) {}
}

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    // Test harnesses may opt into a dedicated database before importing this module.
    // Production keeps the configured database name unchanged.
    const dbName = globalThis.__QBIZ_TEST_DB_NAME || CONFIG.DB_NAME;
    const req = indexedDB.open(dbName, CONFIG.DB_VERSION);
    req.onblocked = () => {
      console.warn('[DB] Quá trình nâng cấp DB bị chặn bởi tab/phiên khác đang mở.');
      if(typeof BroadcastChannel !== 'undefined'){
        try {
          const bc = new BroadcastChannel('qbiz_db_sync');
          bc.postMessage({ type: 'PLEASE_CLOSE_DB', newVersion: CONFIG.DB_VERSION });
          bc.close();
        } catch(_) {}
      }
    };
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for(const name of STORES){ if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath:'id'}); }
      if(event.oldVersion < 8){
        const tx=req.transaction;
        const stamp=new Date().toISOString();
        const migrationUuid=()=>globalThis.crypto?.randomUUID?.()||`legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const updateStore=(name,mapper)=>{
          const s=tx.objectStore(name); const q=s.openCursor();
          q.onsuccess=()=>{const cursor=q.result;if(!cursor)return;const next=mapper(cursor.value);if(next)cursor.update(next);cursor.continue();};
        };
        updateStore('levels',row=>row?.version?row:{...row,version:1});
        updateStore('movements',row=>row?.operation_id&&row?.event_id?row:{...row,operation_id:row?.operation_id||migrationUuid(),event_id:row?.event_id||migrationUuid(),source_event_id:row?.source_event_id||row?.event_id||migrationUuid(),version:Number(row?.version||1),source:row?.source||'qbiz-kho-local'});
        updateStore('outbox',row=>{const operationId=row?.operation_id||row?.id||migrationUuid();const eventId=row?.event_id||migrationUuid();return {...row,id:row?.id||operationId,operation_id:operationId,event_id:eventId,source_event_id:row?.source_event_id||eventId,version:Number(row?.version||1),device_id:row?.device_id||'',retry_count:Number(row?.retry_count||0),sync_status:row?.sync_status||'PENDING',created_at:row?.created_at||stamp,updated_at:row?.updated_at||stamp};});
      }
      if(event.oldVersion < 10){
        // Additive Supplier/Purchase stores. Existing records and ledgers stay intact.
        if(!db.objectStoreNames.contains('suppliers')) db.createObjectStore('suppliers',{keyPath:'id'});
        if(!db.objectStoreNames.contains('purchase_receipts')) db.createObjectStore('purchase_receipts',{keyPath:'id'});
      }
      if(event.oldVersion < 11){
        if(!db.objectStoreNames.contains('returns')) db.createObjectStore('returns',{keyPath:'id'});
        if(!db.objectStoreNames.contains('refunds')) db.createObjectStore('refunds',{keyPath:'id'});
      }
      if(event.oldVersion < 12){
        if(!db.objectStoreNames.contains('shifts')) db.createObjectStore('shifts',{keyPath:'id'});
      }
      if(event.oldVersion < 13){
        if(!db.objectStoreNames.contains('electronic_invoices')){
          const s = db.createObjectStore('electronic_invoices', { keyPath: 'id' });
          s.createIndex('by_sale_id', 'sale_id', { unique: false });
          s.createIndex('by_idempotency_key', 'idempotency_key', { unique: true });
        }
        if(!db.objectStoreNames.contains('invoice_audit_logs')){
          const s = db.createObjectStore('invoice_audit_logs', { keyPath: 'id' });
          s.createIndex('by_invoice_id', 'invoice_id', { unique: false });
          s.createIndex('by_sale_id', 'sale_id', { unique: false });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        requestSafeCloseDb(db, dbName, 'versionchange');
      };
      resolve(db);
    };
    req.onerror = ()=>reject(req.error);
  });
  return dbPromise;
}

async function store(name,mode='readonly'){
  const db=await openDB();
  return db.transaction(name,mode).objectStore(name);
}
export async function getAll(name){
  const s=await store(name); return new Promise((r,j)=>{const q=s.getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error)});
}
export async function getOne(name,id){
  const s=await store(name); return new Promise((r,j)=>{const q=s.get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
}
export async function put(name,value){
  const s=await store(name,'readwrite');
  beginBusyTransaction();
  return new Promise((r,j)=>{
    const q=s.put(value);
    q.onsuccess=()=>{ endBusyTransaction(); r(value); };
    q.onerror=()=>{ endBusyTransaction(); j(q.error); };
  });
}
export async function putMany(name,values){
  const db=await openDB();
  beginBusyTransaction();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(name,'readwrite'); const s=tx.objectStore(name); values.forEach(v=>s.put(v));
    tx.oncomplete=()=>{ endBusyTransaction(); resolve(values); };
    tx.onerror=()=>{ endBusyTransaction(); reject(tx.error); };
  });
}
export async function remove(name,id){
  const s=await store(name,'readwrite'); return new Promise((r,j)=>{const q=s.delete(id);q.onsuccess=()=>r();q.onerror=()=>j(q.error)});
}
export async function clearAll(){
  const db=await openDB();
  return Promise.all(STORES.map(name=>new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})));
}
export async function setting(key,fallback=null){ const x=await getOne('settings',key); return x?.value ?? fallback; }
export async function setSetting(key,value){ return put('settings',{id:key,value}); }
export async function runTransaction(names, work){
  const db=await openDB();
  beginBusyTransaction();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(names,'readwrite');
    const stores=Object.fromEntries(names.map(name=>[name,tx.objectStore(name)]));
    let result; let failure;
    const context={abort(error){failure=error;try{tx.abort();}catch{}}};
    try { result=work(stores,tx,context); } catch(error){ context.abort(error); }
    tx.oncomplete=()=>{ endBusyTransaction(); resolve(result); };
    tx.onerror=()=>{ endBusyTransaction(); reject(tx.error||new Error('Giao dịch dữ liệu thất bại.')); };
    tx.onabort=()=>{ endBusyTransaction(); reject(failure||tx.error||new Error('Giao dịch dữ liệu đã được hoàn tác.')); };
  });
}

const fallbackUuid=()=>globalThis.crypto?.randomUUID?.()||`id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
export async function ensureLocalIdentity(uuid=fallbackUuid, timestamp=()=>new Date().toISOString()){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['settings','devices','registers'],'readwrite');
    const settings=tx.objectStore('settings'), devices=tx.objectStore('devices'), registers=tx.objectStore('registers');
    let result;
    // Keep every follow-up request inside the same transaction callback chain.
    // Awaiting a Promise here would let IndexedDB auto-commit between reads.
    const deviceSettingReq=settings.get('device_id');
    deviceSettingReq.onerror=()=>reject(deviceSettingReq.error);
    deviceSettingReq.onsuccess=()=>{
      const deviceSetting=deviceSettingReq.result; const registerSettingReq=settings.get('register_id');
      registerSettingReq.onerror=()=>reject(registerSettingReq.error);
      registerSettingReq.onsuccess=()=>{
        const registerSetting=registerSettingReq.result; const deviceId=deviceSetting?.value||uuid(); const registerId=registerSetting?.value||uuid();
        const deviceReq=devices.get(deviceId);
        deviceReq.onerror=()=>reject(deviceReq.error);
        deviceReq.onsuccess=()=>{
          const deviceRecord=deviceReq.result; const registerReq=registers.get(registerId);
          registerReq.onerror=()=>reject(registerReq.error);
          registerReq.onsuccess=()=>{
            const registerRecord=registerReq.result; const stamp=timestamp();
            const device=deviceRecord||{id:deviceId,device_id:deviceId,device_name:'Thiết bị này',created_at:stamp,updated_at:stamp,active:true};
            const register=registerRecord||{id:registerId,register_id:registerId,device_id:deviceId,register_name:'Quầy chính',created_at:stamp,updated_at:stamp,active:true};
            if(!deviceRecord) devices.put(device); if(!registerRecord) registers.put(register);
            if(!deviceSetting) settings.put({id:'device_id',value:deviceId}); if(!registerSetting) settings.put({id:'register_id',value:registerId});
            result={device,register,device_id:deviceId,register_id:registerId};
          };
        };
      };
    };
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('Không thể khởi tạo định danh thiết bị.'));tx.onabort=()=>reject(tx.error||new Error('Khởi tạo định danh thiết bị đã được hoàn tác.'));
  });
}

export async function nextLocalSequence(key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');const s=tx.objectStore('settings');const q=s.get(key);let next=1;q.onsuccess=()=>{next=Number(q.result?.value||0)+1;s.put({id:key,value:next});};q.onerror=()=>reject(q.error);tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(tx.error||new Error('Không thể cấp số thứ tự local.'));tx.onabort=()=>reject(tx.error||new Error('Cấp số thứ tự local đã được hoàn tác.'));});
}
