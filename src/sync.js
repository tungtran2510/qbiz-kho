import { CONFIG } from './config.js';
import { getAll,put,remove } from './db.js';

export async function syncStatus(){
  const pending=(await getAll('outbox')).filter(x=>normalize(x).sync_status==='PENDING'||normalize(x).sync_status==='ERROR').length;
  return {mode:CONFIG.SYNC_MODE,pending,connected:CONFIG.SYNC_MODE==='api',label:CONFIG.SYNC_MODE==='api'?'QBiz Cloud':'Thiết bị này'};
}

const BACKOFF=[2000,5000,10000,30000,60000];
const STALE_MS=30000;
const newUuid=()=>globalThis.crypto?.randomUUID?.()||`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function normalize(row){
  const legacy=String(row.sync_status||row.status||'pending').toUpperCase();
  const eventId=row.event_id||newUuid();
  return {...row,operation_id:row.operation_id||row.id||newUuid(),event_id:eventId,source_event_id:row.source_event_id||eventId,version:Number(row.version||1),sync_status:legacy==='SYNCED'?'SYNCED':legacy==='ERROR'?'ERROR':legacy==='SYNCING'?'SYNCING':'PENDING',retry_count:Number(row.retry_count||0),created_at:row.created_at||new Date().toISOString(),updated_at:row.updated_at||row.created_at||new Date().toISOString()};
}
function retryAt(count){return new Date(Date.now()+BACKOFF[Math.min(Math.max(count-1,0),BACKOFF.length-1)]).toISOString()}

export async function pruneSyncedOutbox({ maxAgeDays = 30 } = {}){
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const rows = await getAll('outbox');
  let pruned = 0;
  for(const raw of rows){
    const row = normalize(raw);
    if(row.sync_status === 'SYNCED'){
      const ts = Date.parse(row.synced_at || row.updated_at || row.created_at || 0);
      if(ts && ts < cutoff){
        const idToDelete = raw.id || raw.operation_id || row.id || row.operation_id;
        if(idToDelete){
          await remove('outbox', idToDelete);
          pruned++;
        }
      }
    }
  }
  return { pruned };
}

// Hợp đồng đồng bộ V1: client KHÔNG ghi thẳng DB production.
// Khi API thật có, endpoint phải idempotent và backend mới là nơi kiểm quyền/transaction.
export async function flushOutbox(){
  if(CONFIG.SYNC_MODE!=='api') return {sent:0,skipped:true};
  const now=Date.now();const rows=(await getAll('outbox')).map(normalize);let sent=0,failed=0;
  const seenOperations=new Set();
  for(const rawEvent of rows){
    const event=normalize(rawEvent); if(seenOperations.has(event.operation_id)) continue; seenOperations.add(event.operation_id);
    let current=event;const stale=current.sync_status==='SYNCING'&&(!current.updated_at||now-Date.parse(current.updated_at)>STALE_MS);
    if(stale) current={...current,sync_status:'ERROR',retry_count:Number(current.retry_count||0)+1,last_error:'Sync attempt stale; retrying safely.',updated_at:new Date().toISOString(),next_retry_at:new Date().toISOString()};
    if(current.sync_status==='SYNCED'||(!stale&&current.sync_status==='ERROR'&&current.next_retry_at&&Date.parse(current.next_retry_at)>now)) {if(stale)await put('outbox',current);continue;}
    if(!['PENDING','ERROR'].includes(current.sync_status))continue;
    const syncing={...current,sync_status:'SYNCING',updated_at:new Date().toISOString()};await put('outbox',syncing);
    try{const res=await fetch(`${CONFIG.API_BASE_URL}/events`,{method:'POST',credentials:'include',headers:{'content-type':'application/json','Idempotency-Key':current.operation_id||current.id},body:JSON.stringify(current)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const ack=await res.clone().json().catch(()=>null);await put('outbox',{...syncing,sync_status:'SYNCED',synced_at:new Date().toISOString(),ack:ack||syncing.ack||null,last_error:null,updated_at:new Date().toISOString()});sent++;}catch(error){const retryCount=Number(current.retry_count||0)+1;await put('outbox',{...syncing,sync_status:'ERROR',retry_count:retryCount,last_error:String(error?.message||error),updated_at:new Date().toISOString(),next_retry_at:retryAt(retryCount)});failed++;}
  }
  if(sent > 0){
    try { await pruneSyncedOutbox(); } catch(_) {}
  }
  return {sent,failed,skipped:false};
}
