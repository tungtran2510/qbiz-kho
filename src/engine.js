import { getAll,getOne,put,putMany,runTransaction,ensureLocalIdentity as ensureIdentity,nextLocalSequence } from './db.js';
import { CONFIG } from './config.js';

const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const now=()=>new Date().toISOString();
const uuid=()=>{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();const b=globalThis.crypto?.getRandomValues?globalThis.crypto.getRandomValues(new Uint8Array(16)):Uint8Array.from({length:16},()=>Math.floor(Math.random()*256));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((x,i)=>`${x.toString(16).padStart(2,'0')}${[3,5,7,9].includes(i)?'-':''}`).join('').replace(/-$/,'')};
const SYNC_SOURCE='qbiz-kho-local';
const makeOutbox=( {operationId,eventId=uuid(),entityType,entityId,action,version=1,deviceId='',registerId='',payload,createdAt=now(),type=`${entityType}.${action}`} )=>({id:operationId,event_id:eventId,source_event_id:eventId,operation_id:operationId,entity_type:entityType,entity_id:entityId,action,version,device_id:deviceId,register_id:registerId,source:SYNC_SOURCE,provider:'local',created_at:createdAt,updated_at:createdAt,retry_count:0,sync_status:'PENDING',type,payload});
export async function ensureLocalIdentity(){return ensureIdentity(uuid,now);}
async function localIdentity(){return ensureLocalIdentity();}
async function localDeviceId(){return (await localIdentity()).device_id;}
function openShiftFor(rows,identity){
  return (rows||[]).filter(row=>row?.status==='OPEN'&&row.device_id===identity.device_id&&row.register_id===identity.register_id)
    .sort((a,b)=>String(b.opened_at||'').localeCompare(String(a.opened_at||'')))[0]||null;
}
export async function currentShift(){
  const identity=await localIdentity();
  return openShiftFor(await getAll('shifts'),identity);
}
export async function openShift({openingCash=0,shiftId='',operationId='',employee=''}={}){
  const cash=Number(openingCash);
  if(!Number.isFinite(cash)||cash<0) throw new Error('Tiền đầu ca không hợp lệ.');
  const identity=await localIdentity(); const operation=operationId||uuid(); const id=shiftId||uid('shift'); let result;
  await runTransaction(['shifts','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(operation);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.shift||null;return;}
      const rowsReq=stores.shifts.getAll();
      rowsReq.onerror=()=>context.abort(rowsReq.error);
      rowsReq.onsuccess=()=>{
        try{
          const existing=openShiftFor(rowsReq.result,identity);
          if(existing) throw new Error('Quầy này đang có một ca mở.');
          const stamp=now();
          const shift={id,shift_id:id,device_id:identity.device_id,register_id:identity.register_id,employee:employee||'Thiết bị này',opened_at:stamp,opening_cash:cash,status:'OPEN',closed_at:null,expected_cash:null,counted_cash:null,difference:null,summary:null,version:1,operation_id:operation,source:SYNC_SOURCE};
          const outbox=makeOutbox({operationId:operation,entityType:'shift',entityId:id,action:'open',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'shift.open',createdAt:stamp,payload:{shift}});
          stores.shifts.put(shift);stores.outbox.put(outbox);result=shift;
        }catch(error){context.abort(error);}
      };
    };
  });
  return result;
}
export async function closeShift({shiftId,countedCash=0,operationId=''}={}){
  if(!shiftId) throw new Error('Thiếu ca cần đóng.');
  const counted=Number(countedCash); if(!Number.isFinite(counted)||counted<0) throw new Error('Tiền thực đếm không hợp lệ.');
  const identity=await localIdentity(); const operation=operationId||uuid(); let result;
  await runTransaction(['shifts','sales','refunds','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(operation);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.shift||null;return;}
      const shiftReq=stores.shifts.get(shiftId);
      shiftReq.onerror=()=>context.abort(shiftReq.error);
      shiftReq.onsuccess=()=>{
        const salesReq=stores.sales.getAll();
        salesReq.onerror=()=>context.abort(salesReq.error);
        salesReq.onsuccess=()=>{
          const refundsReq=stores.refunds.getAll();
          refundsReq.onerror=()=>context.abort(refundsReq.error);
          refundsReq.onsuccess=()=>{
            try{
              const shift=shiftReq.result;
              if(!shift) throw new Error('Không tìm thấy ca.');
              if(shift.device_id!==identity.device_id||shift.register_id!==identity.register_id) throw new Error('Ca này thuộc thiết bị hoặc quầy khác.');
              if(shift.status!=='OPEN'){result=shift;return;}
              const allSales=salesReq.result||[];
              const sales=allSales.filter(s=>s.shift_id===shiftId);
              const saleById=new Map(allSales.map(s=>[s.id,s]));
              const summary={sales_count:sales.length,sales_total:0,cash_sales:0,transfer_sales:0,qr_sales:0,refund_total:0,cash_refunds:0};
              for(const sale of sales){
                const payments=Array.isArray(sale.payments)&&sale.payments.length?sale.payments:[{method:sale.payment_method||'cash',amount:sale.grand_total??sale.total??0,status:sale.payment_status||'PAID'}];
                for(const payment of payments){
                  const amount=Math.max(0,Number(payment.amount)||0); summary.sales_total+=amount;
                  if(payment.method==='cash')summary.cash_sales+=amount;
                  else if(payment.method==='transfer')summary.transfer_sales+=amount;
                  else if(payment.method==='qr')summary.qr_sales+=amount;
                }
              }
              for(const refund of (refundsReq.result||[]).filter(r=>r.shift_id===shiftId)){
                const amount=Math.max(0,Number(refund.amount)||0);summary.refund_total+=amount;
                const original=saleById.get(refund.sale_id);const method=refund.method==='original'?(original?.payment_method||'cash'):refund.method;
                if(method==='cash')summary.cash_refunds+=amount;
              }
              const expected=Math.max(0,Number(shift.opening_cash||0)+summary.cash_sales-summary.cash_refunds);
              const stamp=now();
              const closed={...shift,status:'CLOSED',closed_at:stamp,expected_cash:expected,counted_cash:counted,difference:counted-expected,summary,version:Number(shift.version||1)+1,operation_id:operation,updated_at:stamp};
              const outbox=makeOutbox({operationId:operation,entityType:'shift',entityId:shiftId,action:'close',version:closed.version,deviceId:identity.device_id,registerId:identity.register_id,type:'shift.close',createdAt:stamp,payload:{shift:closed}});
              stores.shifts.put(closed);stores.outbox.put(outbox);result=closed;
            }catch(error){context.abort(error);}
          };
        };
      };
    };
  });
  return result;
}
const svgThumb=(label,bg1,bg2)=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="160" height="160" rx="24" fill="url(#g)"/><circle cx="122" cy="38" r="18" fill="rgba(255,255,255,.14)"/><circle cx="42" cy="118" r="28" fill="rgba(255,255,255,.12)"/><rect x="34" y="36" width="92" height="70" rx="18" fill="rgba(255,255,255,.92)"/><rect x="50" y="52" width="60" height="10" rx="5" fill="${bg2}" opacity=".75"/><rect x="50" y="69" width="44" height="10" rx="5" fill="${bg2}" opacity=".45"/><text x="24" y="138" fill="white" font-family="Arial, sans-serif" font-size="17" font-weight="700">${label}</text></svg>`)}`;

const asset=(name)=>`./assets/products/optimized/${name.replace(/\.png$/i,'.webp')}`;
const asItem=(item)=>({type:'PRODUCT',categoryId:'',price:null,images:item.images||[item.image].filter(Boolean),active:true,websiteVisibility:false,variants:[],trackInventory:true,...item,low_stock_threshold:item.lowStock});
const SAMPLE_PRODUCTS=[
  {id:'p_n85_navy_high',name:'Ghế N85 - chân cao',sku:'N85-NAVY-H',barcode:'8938500010011',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'3 năm',price:2300000,priceNote:'Chân dài 2.300.000 · chân ngắn 2.127.000',description:'Ghế công thái học DoctorLoan N85, phiên bản chân cao, hỗ trợ tư thế ngồi và thư giãn.',lowStock:5,image:asset('chair-n85.png'),images:[asset('chair-n85.png')]},
  {id:'p_n85_navy_low',name:'Ghế N85 - chân thấp',sku:'N85-NAVY-L',barcode:'8938500010012',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'3 năm',price:2127000,priceNote:'Chân ngắn 2.127.000 · chân dài 2.300.000',description:'Ghế N85 chân thấp, thiết kế gọn cho không gian gia đình và phòng làm việc.',lowStock:5,image:asset('chair-n85.png'),images:[asset('chair-n85.png')]},
  {id:'p_n85_pink_high',name:'Ghế N85 màu hồng - chân cao',sku:'N85-PINK-H',barcode:'8938500010013',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'3 năm',price:2300000,description:'Phiên bản màu hồng của ghế N85 chân cao.',lowStock:4,image:asset('chair-n85.png'),images:[asset('chair-n85.png')]},
  {id:'p_90d',name:'Ghế sáng chế 90D',sku:'DL-90D',barcode:'8938500010201',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'10 năm',price:34937000,description:'Ghế sáng chế DoctorLoan 90D với thiết kế nâng đỡ chuyên sâu.',lowStock:2,image:asset('chair-90d.png'),images:[asset('chair-90d.png')]},
  {id:'p_90t',name:'Ghế sáng chế 90T',sku:'DL-90T',barcode:'8938500010202',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'10 năm',price:34937000,description:'Ghế sáng chế DoctorLoan 90T, phù hợp khu vực trị liệu và thư giãn.',lowStock:2,image:asset('chair-90t.png'),images:[asset('chair-90t.png')]},
  {id:'p_95',name:'Ghế sáng chế 95',sku:'DL-95',barcode:'8938500010203',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'10 năm',price:39249000,description:'Ghế sáng chế DoctorLoan 95, kết cấu lớn và vững chắc.',lowStock:2,image:asset('chair-95.png'),images:[asset('chair-95.png')]},
  {id:'p_135',name:'Ghế sáng chế 135',sku:'DL-135',barcode:'8938500010204',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'10 năm',price:53762000,description:'Ghế sáng chế DoctorLoan 135 cho trải nghiệm thư giãn chuyên sâu.',lowStock:1,image:asset('chair-135.png'),images:[asset('chair-135.png')]},
  {id:'p_150',name:'Ghế sáng chế 150',sku:'DL-150',barcode:'8938500010205',category:'Ghế',unit:'chiếc',brand:'DoctorLoan',warranty:'10 năm',price:53762000,description:'Ghế sáng chế DoctorLoan 150, thiết kế cao cấp cho không gian chuyên nghiệp.',lowStock:1,image:asset('chair-150.png'),images:[asset('chair-150.png')]},
  {id:'p_f1',name:'Gối lưng sáng chế F1',sku:'DL-F1',barcode:'8938500010110',category:'Gối lưng',unit:'cái',brand:'DoctorLoan',price:3500000,description:'Gối lưng F1 hỗ trợ vùng thắt lưng khi ngồi lâu.',lowStock:8,image:asset('back-f1.png'),images:[asset('back-f1.png')]},
  {id:'p_f3',name:'Gối lưng sáng chế F3/C',sku:'DL-F3',barcode:'8938500010111',category:'Gối lưng',unit:'cái',brand:'DoctorLoan',price:3737000,description:'Gối lưng F3/C ôm sát vùng lưng, giúp tư thế ngồi ổn định hơn.',lowStock:8,image:asset('back-f3.png'),images:[asset('back-f3.png')]},
  {id:'p_f4',name:'Gối cổ sáng chế F4/09',sku:'DL-F4',barcode:'8938500010113',category:'Gối cổ',unit:'cái',brand:'DoctorLoan',price:7624000,description:'Gối cổ F4/09 hỗ trợ vùng cổ và vai khi nghỉ ngơi.',lowStock:6,image:asset('neck-f4.png'),images:[asset('neck-f4.png')]},
  {id:'p_f5',name:'Gối cổ sáng chế F5/S',sku:'DL-F5',barcode:'8938500010114',category:'Gối cổ',unit:'cái',brand:'DoctorLoan',price:4312000,description:'Gối cổ F5/S nhỏ gọn, phù hợp sử dụng hằng ngày.',lowStock:6,image:asset('neck-f5.png'),images:[asset('neck-f5.png')]},
  {id:'p_f6',name:'Gối cổ sáng chế F6',sku:'DL-F6',barcode:'8938500010112',category:'Gối cổ',unit:'cái',brand:'DoctorLoan',price:7049000,description:'Gối cổ F6 nâng đỡ vùng cổ trong tư thế nghỉ ngơi.',lowStock:6,image:asset('neck-f6.png'),images:[asset('neck-f6.png')]},
  {id:'p_lumbar',name:'Gối lưng DoctorLoan',sku:'DL-LUMBAR',barcode:'8938500010120',category:'Gối lưng',unit:'cái',brand:'DoctorLoan',price:2900000,description:'Gối lưng hỗ trợ vùng thắt lưng trong thời gian ngồi làm việc.',lowStock:5,image:asset('back-f1.png'),images:[asset('back-f1.png')]},
  {id:'p_meditation',name:'Đệm thiền DoctorLoan',sku:'DL-MEDITATION',barcode:'8938500010130',category:'Đệm',unit:'cái',brand:'DoctorLoan',price:6000000,priceNote:'Size S 6.000.000 · Size M 6.500.000',description:'Đệm thiền nâng đỡ cơ thể, có hai lựa chọn kích thước S và M.',lowStock:3,image:asset('meditation-cushion.png'),images:[asset('meditation-cushion.png')]}
].map(asItem);
const SAMPLE_WAREHOUSES=[{id:'wh_hadong',name:'Kho Hà Đông'},{id:'wh_center',name:'Kho Trung tâm'}];
const SAMPLE_LEVELS=[18,7,3,24,11,4,9,2,15,12,6,10,8,9,5].flatMap((q,i)=>[
  {id:`${SAMPLE_PRODUCTS[i].id}:wh_hadong`,productId:SAMPLE_PRODUCTS[i].id,warehouseId:'wh_hadong',onHand:q,reserved:i%3,damaged:0,updatedAt:now()},
  {id:`${SAMPLE_PRODUCTS[i].id}:wh_center`,productId:SAMPLE_PRODUCTS[i].id,warehouseId:'wh_center',onHand:Math.max(0,Math.floor(q/2)),reserved:0,damaged:0,updatedAt:now()}
]);
const SAMPLE_SERVICES=[
  {id:'s_massage_co_vai_gay',type:'SERVICE',name:'Massage cổ vai gáy',unit:'lần',category:'Trị liệu',price:300000,trackInventory:false,durationMinutes:45,description:'Massage trị liệu vùng cổ vai gáy, giảm căng cơ do ngồi lâu.',lowStock:0,image:asset('neck-f4.png'),images:[asset('neck-f4.png')]},
  {id:'s_xong_hoi_thao_moc',type:'SERVICE',name:'Xông hơi thảo mộc',unit:'lần',category:'Chăm sóc',price:250000,trackInventory:false,durationMinutes:30,description:'Xông hơi thảo mộc thư giãn, hỗ trợ tuần hoàn.',lowStock:0,image:asset('meditation-cushion.png'),images:[asset('meditation-cushion.png')]},
  {id:'s_goi_dau_duong_sinh',type:'SERVICE',name:'Gội đầu dưỡng sinh',unit:'buổi',category:'Chăm sóc',price:180000,trackInventory:false,durationMinutes:40,description:'Gội đầu dưỡng sinh kết hợp bấm huyệt vùng đầu.',lowStock:0,image:asset('back-f3.png'),images:[asset('back-f3.png')]},
  {id:'s_tu_van_tu_the',type:'SERVICE',name:'Tư vấn tư thế & cột sống',unit:'buổi',category:'Tư vấn',price:500000,trackInventory:false,durationMinutes:60,description:'Tư vấn tư thế ngồi và chăm sóc cột sống theo tình trạng thực tế.',lowStock:0,image:asset('chair-90d.png'),images:[asset('chair-90d.png')]}
].map(asItem);
const CATEGORY_IMAGES={'Ghế':asset('chair-90d.png'),'Gối lưng':asset('back-f1.png'),'Gối cổ':asset('neck-f4.png'),'Đệm':asset('meditation-cushion.png'),'Trị liệu':asset('neck-f5.png'),'Chăm sóc':asset('back-f3.png'),'Tư vấn':asset('chair-n85.png')};
const categoryImage=(name)=>CATEGORY_IMAGES[String(name||'').trim()]||'';

export async function ensureOpeningMovements(){
  const [levels,movements,outbox]=await Promise.all([getAll('levels'),getAll('movements'),getAll('outbox')]);
  const knownIds=new Set(movements.map(m=>m.id));
  const knownOps=new Set(outbox.map(o=>o.operation_id));
  const onHandSums=new Map();
  for(const m of movements){
    if(m.type==='OPENING'||['reserve','release','damage'].includes(m.type)) continue;
    const k=`${m.productId}:${m.warehouseId}`;
    onHandSums.set(k,(onHandSums.get(k)||0)+Number(m.qty||0));
  }
  const created=[];
  for(const l of levels){
    if(!l||!l.productId||!l.warehouseId) continue;
    const key=`${l.productId}:${l.warehouseId}`;
    const need=Number(l.onHand||0)-(onHandSums.get(key)||0);
    if(!need) continue;
    const id=`opening:${key}`;
    if(knownIds.has(id)||knownOps.has(id)) continue;
    const eventId=uuid(); const identity=await localIdentity();
    const mv={id,groupId:'',type:'OPENING',productId:l.productId,warehouseId:l.warehouseId,qty:need,reason:'Tồn đầu kỳ',reference:'',reference_type:'opening',reference_id:id,operation_id:id,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:Number(l.version||1),createdAt:l.updatedAt||l.createdAt||now(),after:{onHand:Number(l.onHand||0),reserved:Number(l.reserved||0),damaged:Number(l.damaged||0)}};
    const ob=makeOutbox({operationId:id,eventId,entityType:'inventory',entityId:id,action:'opening',version:mv.version,deviceId:identity.device_id,registerId:identity.register_id,type:'inventory.OPENING',createdAt:mv.createdAt,payload:{movement:mv}});
    await runTransaction(['movements','outbox'],stores=>{stores.movements.put(mv);stores.outbox.put(ob);});
    created.push(id);
  }
  return created;
}

export async function ensureSeed(){
  const products=await getAll('products');
  const warehouses=await getAll('warehouses');
  const wss=warehouses.length?warehouses:SAMPLE_WAREHOUSES;
  if(!warehouses.length) await putMany('warehouses',SAMPLE_WAREHOUSES);
  const seedQty=new Map(SAMPLE_LEVELS.filter(l=>l.warehouseId===wss[0].id).map(l=>[l.productId,l.onHand]));
  const ensureLevels=async(productId,fallbackQty=0)=>{
    const levels=await getAll('levels');
    if(levels.some(l=>l.productId===productId)) return;
    const q=seedQty.has(productId)?seedQty.get(productId):(Number(fallbackQty)||0);
    for(const w of wss) await put('levels',{id:`${productId}:${w.id}`,productId,warehouseId:w.id,onHand:w.id===wss[0].id?q:Math.max(0,Math.floor(q/2)),reserved:0,damaged:0,updatedAt:now()});
  };
  if(!products.length){
    await putMany('products',SAMPLE_PRODUCTS); await putMany('levels',SAMPLE_LEVELS); await putMany('products',SAMPLE_SERVICES);
    await put('settings',{id:'seededAt',value:now()}); await ensureCategorySeed(); await ensureLegacySuppliers(); await ensureOpeningMovements(); return;
  }
  const existing=new Map(products.map(p=>[p.id,p]));
  for(const seed of SAMPLE_PRODUCTS){
    const old=existing.get(seed.id);
    if(!old){ await put('products',seed); await ensureLevels(seed.id); continue; }
    const patch={};
    if((old.price==null||old.price==='')&&seed.price!=null) patch.price=seed.price;
    if(!old.image || old.image.startsWith('data:image/svg+xml') || !old.type) Object.assign(patch,seed);
    if(Object.keys(patch).length) await put('products',{...asItem(old),...patch,id:old.id});
    await ensureLevels(seed.id);
  }
  const haveServices=new Set(products.filter(p=>p.type==='SERVICE').map(p=>p.id));
  for(const svc of SAMPLE_SERVICES){ if(!haveServices.has(svc.id)) await put('products',svc); }
  await ensureCategorySeed();
  await ensureLegacySuppliers();
  await ensureOpeningMovements();
}
export async function ensureCategorySeed(){
  const [categories,products]=await Promise.all([getAll('categories'),getAll('products')]);
  const fresh=[]; const patched=new Set();
  for(const p of products){
    const type=p.type==='SERVICE'?'SERVICE':'PRODUCT';
    const name=String(p.categoryId||p.category||'').trim();
    if(!name) continue;
    const img=categoryImage(name);
    const found=categories.find(c=>c.type===type&&(c.id===name||String(c.name).toLowerCase()===name.toLowerCase()))||fresh.find(c=>c.type===type&&c.name.toLowerCase()===name.toLowerCase());
    if(found){ if(!found.image&&img&&!patched.has(found.id)){patched.add(found.id);await put('categories',{...found,image:img,updated_at:now()});} continue; }
    fresh.push({id:uid('cat'),name,parentId:'',parent_id:'',type,image:img,created_at:now(),updated_at:now()});
  }
  if(fresh.length) await putMany('categories',fresh);
  return [...categories,...fresh];
}

async function ensureLegacySuppliers(){
  const [suppliers,products]=await Promise.all([getAll('suppliers'),getAll('products')]);
  const existing=new Map(suppliers.map(s=>[s.id,s]));
  const byName=new Map(suppliers.map(s=>[String(s.name||'').trim().toLowerCase(),s]));
  const fresh=[];
  for(const product of products){
    const name=String(product.supplier_name||'').trim();
    if(!name) continue;
    const key=String(product.supplier_id||'').trim()||`legacy_supplier_${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}`;
    if(existing.has(key)||byName.has(name.toLowerCase())) continue;
    const stamp=now();
    const supplier={id:key,name,code:String(product.supplier_code||'').trim(),phone:String(product.supplier_phone||'').trim(),email:'',address:'',tax_code:'',note:'Được chuyển từ thông tin nguồn nhập cũ.',status:'active',created_at:stamp,updated_at:stamp,version:1,source:'legacy-migration'};
    fresh.push(supplier); existing.set(key,supplier); byName.set(name.toLowerCase(),supplier);
  }
  if(fresh.length) await putMany('suppliers',fresh);
  return [...suppliers,...fresh];
}

export async function snapshot(){
  const [products,warehouses,levels,movements,transfers,sales,orders,customers,suppliers,purchase_receipts,returns,refunds,shifts,categories,settings,outbox,devices,registers,print_templates,print_jobs]=await Promise.all(['products','warehouses','levels','movements','transfers','sales','orders','customers','suppliers','purchase_receipts','returns','refunds','shifts','categories','settings','outbox','devices','registers','print_templates','print_jobs'].map(getAll));
  return {products,warehouses,levels,customers,suppliers,purchase_receipts,returns,refunds,shifts:shifts.sort((a,b)=>(b.opened_at||'').localeCompare(a.opened_at||'')),categories,settings,devices,registers,print_templates,print_jobs,movements:movements.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')),transfers:transfers.sort((a,b)=>(b.created_at||b.createdAt||'').localeCompare(a.created_at||a.createdAt||'')),purchase_receipts:purchase_receipts.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),returns:returns.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),refunds:refunds.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),sales:sales.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),orders:orders.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),outbox};
}
export function available(level){ return Math.max(0,(level?.onHand||0)-(level?.reserved||0)-(level?.damaged||0)); }
export function levelFor(data,productId,warehouseId){ return (data?.levels||[]).find(x=>x.productId===productId&&x.warehouseId===warehouseId) || {onHand:0,reserved:0,damaged:0}; }
export function totalFor(data,productId){ const xs=(data?.levels||[]).filter(x=>x.productId===productId); return {onHand:xs.reduce((s,x)=>s+x.onHand,0),reserved:xs.reduce((s,x)=>s+x.reserved,0),available:xs.reduce((s,x)=>s+available(x),0)}; }

async function changeLevel({productId,warehouseId,onHandDelta=0,reservedDelta=0,damagedDelta=0,type,qty,reason='',reference='',referenceType='',saleUuid='',groupId='',operationId='',validate=()=>{}}){
  const id=`${productId}:${warehouseId}`; const op=operationId||uuid(); const identity=await localIdentity(); let result;
  await runTransaction(['levels','movements','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(op);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.level||existingReq.result.payload?.movement?.after||null;return;}
      const levelReq=stores.levels.get(id);
      levelReq.onerror=()=>context.abort(levelReq.error);
      levelReq.onsuccess=()=>{
        try{
          const cur=levelReq.result||{id,productId,warehouseId,onHand:0,reserved:0,damaged:0,version:0};
          validate(cur);
          const resolveDelta=value=>typeof value==='function'?Number(value(cur)||0):Number(value||0); const movementQty=resolveDelta(qty);
          if(type==='count'&&movementQty===0){result=cur;return;}
          const next={...cur,onHand:cur.onHand+resolveDelta(onHandDelta),reserved:cur.reserved+resolveDelta(reservedDelta),damaged:cur.damaged+resolveDelta(damagedDelta),version:Number(cur.version||0)+1,updatedAt:now()};
          if(next.onHand<0 || next.reserved<0 || next.damaged<0) throw new Error('Số lượng kho không hợp lệ.');
          if(next.reserved+next.damaged>next.onHand) throw new Error('Số đã giữ/hỏng vượt quá tồn thực tế.');
          const eventId=uuid();
          const mv={id:`${op}:movement`,groupId,type,productId,warehouseId,qty:movementQty,reason,reference,reference_type:referenceType||'',reference_id:reference||'',sale_uuid:saleUuid||'',operation_id:op,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:now(),after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}};
          const outbox=makeOutbox({operationId:op,eventId,entityType:referenceType||'inventory',entityId:reference||id,action:type||'change',version:next.version,deviceId:identity.device_id,registerId:identity.register_id,type:`${referenceType||'inventory'}.${type||'change'}`,payload:{level:next,movement:mv}});
          stores.levels.put(next);stores.movements.put(mv);stores.outbox.put(outbox);result=next;
        }catch(error){context.abort(error);}
      };
    };
  });
  return result;
}

export async function receive({productId,warehouseId,qty,reason='Nhập hàng',reference='',operationId=''}){
  qty=Number(qty); if(!(qty>0)) throw new Error('Số lượng phải lớn hơn 0.');
  return changeLevel({productId,warehouseId,onHandDelta:qty,type:'receive',qty,reason,reference,operationId});
}
export async function issue({productId,warehouseId,qty,reason='Xuất hàng',reference='',operationId=''}){
  qty=Number(qty); if(!(qty>0)) throw new Error('Số lượng phải lớn hơn 0.');
  return changeLevel({productId,warehouseId,onHandDelta:-qty,type:'issue',qty:-qty,reason,reference,operationId,validate:cur=>{if(available(cur)<qty)throw new Error(`Chỉ còn ${available(cur)} sản phẩm có thể xuất.`);}});
}
// Tồn đầu kỳ: đặt tồn mở đầu và ghi movement OPENING để ledger giải thích được số tồn.
export async function setOpeningStock({productId,warehouseId,qty,reason='Tồn đầu kỳ',operationId=''}){
  const value=Number(qty);
  if(!productId||!warehouseId) throw new Error('Thiếu sản phẩm hoặc kho.');
  if(!Number.isFinite(value)||value<0) throw new Error('Tồn đầu kỳ không hợp lệ.');
  const onHandDelta=cur=>value-cur.onHand;
  return changeLevel({productId,warehouseId,onHandDelta,qty:onHandDelta,type:'OPENING',reason,referenceType:'opening',operationId,validate:cur=>{if(value<Number(cur.reserved||0)+Number(cur.damaged||0))throw new Error('Tồn đầu nhỏ hơn số đang giữ hoặc hàng hỏng.');}});
}

export async function countAdjust({productId,warehouseId,counted,reason='Kiểm kho',operationId=''}){
  counted=Number(counted); if(counted<0) throw new Error('Số kiểm thực tế không hợp lệ.');
  return changeLevel({productId,warehouseId,onHandDelta:cur=>counted-cur.onHand,type:'count',qty:cur=>counted-cur.onHand,reason,operationId,validate:cur=>{if(counted<cur.reserved+cur.damaged)throw new Error('Tồn thực tế nhỏ hơn số đã giữ/hàng hỏng. Hãy xử lý ngoại lệ trước.');}});
}

export const STOCK_IN_TYPES = {
  PURCHASE: 'Nhập mua hàng NCC',
  TRANSFER_IN: 'Nhập chuyển kho đến',
  RETURN_IN: 'Nhập hàng khách trả lại',
  ADJUSTMENT_IN: 'Nhập cân đối kiểm kê (thừa)',
  OPENING_STOCK: 'Nhập tồn đầu kỳ',
  ASSEMBLY_IN: 'Nhập thành phẩm gia công / combo'
};

export const STOCK_OUT_TYPES = {
  SALE_OUT: 'Xuất bán hàng',
  TRANSFER_OUT: 'Xuất chuyển kho đi',
  PURCHASE_RETURN_OUT: 'Xuất trả hàng cho NCC',
  DAMAGED_EXPIRED_OUT: 'Xuất hủy hàng hỏng / hết hạn',
  INTERNAL_USE_OUT: 'Xuất tiêu dùng nội bộ / hàng mẫu',
  ADJUSTMENT_OUT: 'Xuất cân đối kiểm kê (thiếu)'
};

// One warehouse document is one local business operation.  Its level changes,
// movements and outbox record commit together so a multi-line receipt cannot
// leave inventory half-applied when a line fails.
export async function applyWarehouseBatch({kind,warehouseId,lines,reference='',operationId='',documentId='',supplierId='',subType='',receiverName='',delivererName='',note=''}){
  if(!['receive','issue','count'].includes(kind)) throw new Error('Loại phiếu kho không hợp lệ.');
  if(!warehouseId) throw new Error('Hãy chọn kho.');
  if(!Array.isArray(lines)||!lines.length) throw new Error('Phiếu cần ít nhất một dòng hàng.');
  const normalized=new Map();
  for(const raw of lines){
    const productId=String(raw?.productId||''); const qty=Number(raw?.qty);
    if(!productId||!Number.isFinite(qty)||(kind==='count'?qty<0:qty<=0)) throw new Error('Có dòng hàng không hợp lệ.');
    if(kind==='count'&&normalized.has(productId)) throw new Error('Mỗi sản phẩm chỉ được kiểm một lần trong cùng phiếu.');
    const previous=normalized.get(productId);
    normalized.set(productId,kind==='count'?{productId,qty,price:raw.price}:{productId,qty:(previous?.qty||0)+qty,price:raw.price??previous?.price??null});
  }
  const operation=operationId||uuid(), docId=documentId||uid('invdoc'), stamp=now(), identity=await localIdentity();
  const resolvedSubType = subType || (kind === 'receive' ? 'PURCHASE' : kind === 'issue' ? 'SALE_OUT' : 'COUNT');
  const typeLabel = (kind === 'receive' ? STOCK_IN_TYPES[resolvedSubType] : kind === 'issue' ? STOCK_OUT_TYPES[resolvedSubType] : 'Kiểm kho') || ({receive:'Nhập hàng',issue:'Xuất hàng',count:'Kiểm kho'}[kind]);
  const defaultReason = reference ? `${typeLabel} (${reference})` : typeLabel;

  let result;
  await runTransaction(['products','levels','movements','outbox','purchase_receipts'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(operation);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.document||null;return;}
      const levelsReq=stores.levels.getAll();
      levelsReq.onerror=()=>context.abort(levelsReq.error);
      levelsReq.onsuccess=()=>{
        const productsReq=stores.products.getAll();
        productsReq.onerror=()=>context.abort(productsReq.error);
        productsReq.onsuccess=()=>{
          try{
            const levelMap=new Map((levelsReq.result||[]).map(x=>[x.id,x]));
            const productMap=new Map((productsReq.result||[]).map(x=>[x.id,x]));
            const nextLevels=[],movements=[],nextProducts=[];
            for(const line of normalized.values()){
              const item=productMap.get(line.productId);
              if(!item||item.type==='SERVICE'||item.trackInventory===false) throw new Error('Phiếu kho chỉ nhận sản phẩm có theo dõi tồn.');
              const levelId=`${line.productId}:${warehouseId}`;
              const current=levelMap.get(levelId)||{id:levelId,productId:line.productId,warehouseId,onHand:0,reserved:0,damaged:0,version:0};
              let onHand=current.onHand, movementQty=line.qty;
              if(kind==='receive') onHand+=line.qty;
              if(kind==='issue'){
                if(available(current)<line.qty) throw new Error(`Chỉ còn ${available(current)} sản phẩm có thể xuất: ${item.name}.`);
                onHand-=line.qty; movementQty=-line.qty;
              }
              if(kind==='count'){
                if(line.qty<current.reserved+current.damaged) throw new Error(`Số kiểm của ${item.name} nhỏ hơn hàng giữ hoặc hỏng.`);
                movementQty=line.qty-current.onHand; onHand=line.qty;
              }
              const next={...current,onHand,reserved:Number(current.reserved||0),damaged:Number(current.damaged||0),version:Number(current.version||0)+1,updatedAt:stamp};
              if(next.onHand<0||next.reserved<0||next.damaged<0||next.reserved+next.damaged>next.onHand) throw new Error('Tồn kho không hợp lệ.');
              nextLevels.push(next);
              if(movementQty!==0){const eventId=uuid();movements.push({id:`${operation}:movement:${line.productId}`,groupId:docId,type:kind,productId:line.productId,warehouseId,qty:movementQty,reason:defaultReason,reference:docId,reference_type:'warehouse_document',reference_id:docId,sub_type:resolvedSubType,operation_id:operation,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:stamp,after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}});}
              if(kind==='receive'&&line.price!==null&&line.price!==undefined&&!Number.isNaN(Number(line.price))) nextProducts.push({...item,purchase_price:Number(line.price),updated_at:stamp});
            }
            const receiptLines=[...normalized.values()].map(line=>({...line,name:productMap.get(line.productId)?.name||'',sku:productMap.get(line.productId)?.sku||'',unit:productMap.get(line.productId)?.unit||'cái',line_total:line.price===null||line.price===undefined?null:Number(line.qty||0)*Number(line.price||0)}));
            const totalCost=receiptLines.some(line=>line.line_total===null)?null:receiptLines.reduce((sum,line)=>sum+Number(line.line_total||0),0);
            const document={id:docId,document_id:docId,kind,sub_type:resolvedSubType,sub_type_label:typeLabel,warehouse_id:warehouseId,supplier_id:kind==='receive'?(supplierId||''):'',receiver_name:receiverName||'',deliverer_name:delivererName||'',note:note||'',reference,operation_id:operation,status:'COMMITTED',created_at:stamp,updated_at:stamp,total_cost:totalCost,lines:receiptLines};
            const outbox=makeOutbox({operationId:operation,eventId:uuid(),entityType:'inventory_document',entityId:docId,action:kind,version:1,deviceId:identity.device_id,registerId:identity.register_id,type:`inventory_document.${kind}`,createdAt:stamp,payload:{document,inventory_movements:movements}});
            nextProducts.forEach(row=>stores.products.put(row)); nextLevels.forEach(row=>stores.levels.put(row)); movements.forEach(row=>stores.movements.put(row)); stores.purchase_receipts.put(document); stores.outbox.put(outbox); result=document;
          }catch(error){context.abort(error);}
        };
      };
    };
  });
  return result;
}
export async function createTransfer({productId,fromWarehouseId,toWarehouseId,qty,lines,note='',transferId='',operationId=''}){
  if(!fromWarehouseId||!toWarehouseId) throw new Error('Hãy chọn kho đi và kho nhận.');
  if(fromWarehouseId===toWarehouseId) throw new Error('Kho đi và kho nhận phải khác nhau.');
  const rawLines=Array.isArray(lines)&&lines.length?lines:[{productId,qty:Number(qty)}];
  const transferLines=rawLines.map(l=>({productId:String(l.productId||''),qty:Number(l.qty)}));
  if(!transferLines.length) throw new Error('Phiếu chuyển cần ít nhất một mặt hàng.');
  for(const l of transferLines){
    if(!l.productId) throw new Error('Mặt hàng chuyển không hợp lệ.');
    if(!(l.qty>0)) throw new Error('Số lượng chuyển phải lớn hơn 0.');
  }
  const id=transferId||uid('tr'); const op=operationId||uuid(); const identity=await localIdentity(); let result;
  await runTransaction(['levels','movements','transfers','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(op); existingReq.onerror=()=>context.abort(existingReq.error); existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.transfer||null;return;}
      const levelsReq=stores.levels.getAll(); levelsReq.onerror=()=>context.abort(levelsReq.error); levelsReq.onsuccess=()=>{
        try{
          const levelMap=new Map((levelsReq.result||[]).map(x=>[x.id,x]));
          const nextLevels=[]; const movements=[];
          for(const l of transferLines){
            const lid=`${l.productId}:${fromWarehouseId}`;
            const cur=levelMap.get(lid)||{id:lid,productId:l.productId,warehouseId:fromWarehouseId,onHand:0,reserved:0,damaged:0,version:0};
            if(available(cur)<l.qty) throw new Error(`Kho đi chỉ còn ${available(cur)} sản phẩm có thể chuyển cho mã ${l.productId}.`);
            const next={...cur,onHand:cur.onHand-l.qty,version:Number(cur.version||0)+1,updatedAt:now()};
            if(next.reserved+next.damaged>next.onHand) throw new Error('Số đã giữ/hỏng vượt quá tồn thực tế.');
            const eventId=uuid();
            const mv={id:`${op}:movement:${l.productId}`,groupId:id,type:'transfer_out',productId:l.productId,warehouseId:fromWarehouseId,qty:-l.qty,reason:'Chuyển kho',reference:id,reference_type:'transfer',reference_id:id,operation_id:op,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:now(),after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}};
            nextLevels.push(next); movements.push(mv); levelMap.set(lid,next);
          }
          const tr={
            id,
            productId:transferLines.length===1?transferLines[0].productId:'',
            qty:transferLines.length===1?transferLines[0].qty:transferLines.reduce((s,x)=>s+x.qty,0),
            lines:transferLines,
            fromWarehouseId,
            toWarehouseId,
            note,
            status:'in_transit',
            operation_id:op,
            version:1,
            createdAt:now(),
            receivedAt:null
          };
          const outbox=makeOutbox({operationId:op,eventId:uuid(),entityType:'transfer',entityId:id,action:'create',version:tr.version,deviceId:identity.device_id,registerId:identity.register_id,type:'transfer.create',payload:{transfer:tr,inventory_movements:movements}});
          nextLevels.forEach(lv=>stores.levels.put(lv));
          movements.forEach(m=>stores.movements.put(m));
          stores.transfers.put(tr);
          stores.outbox.put(outbox);
          result=tr;
        }catch(error){context.abort(error);}
      };
    };
  }); return result;
}
export async function receiveTransfer(id,operationId=''){
  const op=operationId||uuid(); const identity=await localIdentity(); let result;
  await runTransaction(['levels','movements','transfers','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(op); existingReq.onerror=()=>context.abort(existingReq.error); existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.transfer||null;return;}
      const trReq=stores.transfers.get(id); trReq.onerror=()=>context.abort(trReq.error); trReq.onsuccess=()=>{
        try{
          const tr=trReq.result;
          if(!tr) throw new Error('Không tìm thấy phiếu chuyển.');
          if(tr.status==='received'){result=tr;return;}
          if(tr.status!=='in_transit') throw new Error('Phiếu chuyển này đã được xử lý.');
          const transferLines=Array.isArray(tr.lines)&&tr.lines.length?tr.lines:[{productId:tr.productId,qty:tr.qty}];
          const levelsReq=stores.levels.getAll(); levelsReq.onerror=()=>context.abort(levelsReq.error); levelsReq.onsuccess=()=>{
            try{
              const levelMap=new Map((levelsReq.result||[]).map(x=>[x.id,x]));
              const nextLevels=[]; const movements=[];
              for(const l of transferLines){
                const lid=`${l.productId}:${tr.toWarehouseId}`;
                const cur=levelMap.get(lid)||{id:lid,productId:l.productId,warehouseId:tr.toWarehouseId,onHand:0,reserved:0,damaged:0,version:0};
                const next={...cur,onHand:cur.onHand+l.qty,version:Number(cur.version||0)+1,updatedAt:now()};
                const eventId=uuid();
                const mv={id:`${op}:movement:${l.productId}`,groupId:id,type:'transfer_in',productId:l.productId,warehouseId:tr.toWarehouseId,qty:l.qty,reason:'Nhận chuyển kho',reference:id,reference_type:'transfer',reference_id:id,operation_id:op,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:now(),after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}};
                nextLevels.push(next); movements.push(mv); levelMap.set(lid,next);
              }
              const updated={...tr,status:'received',receivedAt:now(),operation_id:op,version:Number(tr.version||1)+1};
              const outbox=makeOutbox({operationId:op,eventId:uuid(),entityType:'transfer',entityId:id,action:'receive',version:updated.version,deviceId:identity.device_id,registerId:identity.register_id,type:'transfer.receive',payload:{transfer:updated,inventory_movements:movements}});
              nextLevels.forEach(lv=>stores.levels.put(lv));
              movements.forEach(m=>stores.movements.put(m));
              stores.transfers.put(updated);
              stores.outbox.put(outbox);
              result=updated;
            }catch(error){context.abort(error);}
          };
        }catch(error){context.abort(error);}
      };
    };
  }); return result;
}
export async function cancelTransfer(id,{reason='Hủy chuyển kho',operationId=''}={}){
  const op=operationId||uuid(); const identity=await localIdentity(); let result;
  await runTransaction(['levels','movements','transfers','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(op); existingReq.onerror=()=>context.abort(existingReq.error); existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.transfer||null;return;}
      const trReq=stores.transfers.get(id); trReq.onerror=()=>context.abort(trReq.error); trReq.onsuccess=()=>{
        try{
          const tr=trReq.result;
          if(!tr) throw new Error('Không tìm thấy phiếu chuyển.');
          if(tr.status==='cancelled'){result=tr;return;}
          if(tr.status==='received') throw new Error('Không thể hủy phiếu chuyển đã nhận hàng. Hãy tạo phiếu chuyển ngược lại nếu cần.');
          if(tr.status!=='in_transit') throw new Error('Phiếu chuyển không ở trạng thái đang chuyển.');
          const transferLines=Array.isArray(tr.lines)&&tr.lines.length?tr.lines:[{productId:tr.productId,qty:tr.qty}];
          const levelsReq=stores.levels.getAll(); levelsReq.onerror=()=>context.abort(levelsReq.error); levelsReq.onsuccess=()=>{
            try{
              const levelMap=new Map((levelsReq.result||[]).map(x=>[x.id,x]));
              const nextLevels=[]; const movements=[];
              for(const l of transferLines){
                const lid=`${l.productId}:${tr.fromWarehouseId}`;
                const cur=levelMap.get(lid)||{id:lid,productId:l.productId,warehouseId:tr.fromWarehouseId,onHand:0,reserved:0,damaged:0,version:0};
                const next={...cur,onHand:cur.onHand+l.qty,version:Number(cur.version||0)+1,updatedAt:now()};
                const eventId=uuid();
                const mv={id:`${op}:movement:${l.productId}`,groupId:id,type:'transfer_cancel',productId:l.productId,warehouseId:tr.fromWarehouseId,qty:l.qty,reason:reason||'Hủy chuyển kho - hoàn lại kho xuất',reference:id,reference_type:'transfer',reference_id:id,operation_id:op,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:now(),after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}};
                nextLevels.push(next); movements.push(mv); levelMap.set(lid,next);
              }
              const updated={...tr,status:'cancelled',cancelledAt:now(),cancel_reason:reason,operation_id:op,version:Number(tr.version||1)+1};
              const outbox=makeOutbox({operationId:op,eventId:uuid(),entityType:'transfer',entityId:id,action:'cancel',version:updated.version,deviceId:identity.device_id,registerId:identity.register_id,type:'transfer.cancel',payload:{transfer:updated,inventory_movements:movements}});
              nextLevels.forEach(lv=>stores.levels.put(lv));
              movements.forEach(m=>stores.movements.put(m));
              stores.transfers.put(updated);
              stores.outbox.put(outbox);
              result=updated;
            }catch(error){context.abort(error);}
          };
        }catch(error){context.abort(error);}
      };
    };
  }); return result;
}
export async function reserve({productId,warehouseId,qty,reference=''}){
  qty=Number(qty); if(!(qty>0)) throw new Error('Số lượng phải lớn hơn 0.');
  return changeLevel({productId,warehouseId,reservedDelta:qty,type:'reserve',qty,reason:'Giữ cho đơn hàng',reference,validate:cur=>{if(available(cur)<qty)throw new Error(`Chỉ còn ${available(cur)} sản phẩm có thể giữ.`);}});
}
export async function release({productId,warehouseId,qty,reference='',operationId=''}){
  qty=Number(qty); if(!(qty>0)) throw new Error('Số lượng phải lớn hơn 0.');
  return changeLevel({productId,warehouseId,reservedDelta:-qty,type:'release',qty:-qty,reason:'Trả giữ hàng',reference,operationId,validate:cur=>{if((cur?.reserved||0)<qty)throw new Error('Số cần trả giữ lớn hơn số đang giữ.');}});
}
export async function createSale({items,warehouseId,paymentMethod='cash',discount=0,note='',customerLabel='Khách lẻ',saleId='',operationId:requestedOperationId=''}){
  if(!Array.isArray(items)||!items.length) throw new Error('Giỏ hàng đang trống.');
  if(!warehouseId) throw new Error('Hãy chọn kho bán hàng.');
  const saleUuid=saleId||uuid(); const id=saleUuid;
  const products=await getAll('products'); const source=new Map(products.map(p=>[p.id,p]));
  const mergedItems=new Map();
  for(const raw of items){const itemId=raw?.itemId;if(!itemId)throw new Error('Không tìm thấy mặt hàng trong giỏ.');const quantity=Math.floor(Number(raw.quantity));if(!(quantity>0))throw new Error('Số lượng phải là số nguyên lớn hơn 0.');const previous=mergedItems.get(itemId);if(previous){previous.quantity+=quantity;previous.discount=(Number(previous.discount)||0)+(Number(raw.discount)||0);previous.tax_amount=(Number(previous.tax_amount)||0)+(Number(raw.tax_amount)||0);}else mergedItems.set(itemId,{...raw,quantity});}
  const saleItems=[...mergedItems.values()].map(line=>{const p=source.get(line.itemId); if(!p) throw new Error('Không tìm thấy mặt hàng trong giỏ.'); const quantity=Math.floor(Number(line.quantity)); const unitPrice=Math.max(0,Number(line.unitPrice)||0); const lineDiscount=Math.max(0,Number(line.discount)||0); const lineSubtotal=Math.max(0,quantity*unitPrice-lineDiscount); const taxAmount=Math.max(0,Number(line.tax_amount)||0); const taxInclusive=Boolean(line.tax_inclusive); return {item_id:p.id,type:p.type||'PRODUCT',name:p.name,sku:p.sku||'',quantity,unit_price:unitPrice,discount:lineDiscount,tax_code:line.tax_code||'',tax_category:line.tax_category||'',tax_rate:line.tax_rate===''||line.tax_rate==null?null:Number(line.tax_rate),tax_amount:taxAmount,tax_inclusive:taxInclusive,line_subtotal:lineSubtotal,line_total:taxInclusive?lineSubtotal:lineSubtotal+taxAmount};});
  const totals=new Map();
  for(const line of saleItems){ if(line.type==='PRODUCT' && source.get(line.item_id).trackInventory!==false) totals.set(line.item_id,(totals.get(line.item_id)||0)+line.quantity); }
  const operationId=requestedOperationId||uuid(); const eventId=uuid(); const subtotal=Math.round(saleItems.reduce((sum,line)=>sum+line.line_subtotal,0)); const discountTotal=Math.round(Math.max(0,Math.min(subtotal,Number(discount)||0))); const taxTotal=Math.round(saleItems.reduce((sum,line)=>sum+line.tax_amount,0)); const grandTotal=Math.round(Math.max(0,subtotal-discountTotal+taxTotal)); const method=['cash','transfer','qr'].includes(paymentMethod)?paymentMethod:'cash'; const paymentStatus=method==='cash'?'PAID':'PENDING';  const identity=await localIdentity(); const deviceId=identity.device_id; const registerId=identity.register_id;
  const activeShiftBefore=openShiftFor(await getAll('shifts'),{device_id:deviceId,register_id:registerId});
  if(!activeShiftBefore || activeShiftBefore.status !== 'OPEN'){
    throw new Error('Chưa mở ca. Hãy mở ca trước khi thanh toán.');
  }
  const localSequence=await nextLocalSequence(`sale_sequence:${deviceId}:${registerId}`); const stamp=now();
  const sale={id,sale_uuid:saleUuid,device_id:deviceId,register_id:registerId,shift_id:activeShiftBefore.id,local_sequence:localSequence,operation_id:operationId,version:1,code:`POS-${localSequence.toString().padStart(6,'0')}`,status:'COMPLETED',created_at:stamp,createdAt:stamp,warehouseId,location_id:warehouseId,channel:'POS',customer_label:customerLabel||'Khách lẻ',note,subtotal,discount_total:discountTotal,tax_total:taxTotal,grand_total:grandTotal,discount:discountTotal,total:grandTotal,payments:[{id:uuid(),method,amount:grandTotal,status:paymentStatus,reference:'',shift_id:activeShiftBefore.id}],payment_method:method,payment_status:paymentStatus,items:saleItems};
  let result;
  await runTransaction(['sales','levels','movements','outbox','settings','shifts'],(stores,tx,context)=>{
    const operationReq=stores.outbox.get(operationId);
    operationReq.onerror=()=>context.abort(operationReq.error);
    operationReq.onsuccess=()=>{
      if(operationReq.result){result=operationReq.result.payload?.sale||null;return;}
      const saleReq=stores.sales.get(id);
      saleReq.onerror=()=>context.abort(saleReq.error);
      saleReq.onsuccess=()=>{
        if(saleReq.result){
          if(saleReq.result.status==='COMPLETED'){result=saleReq.result;return;}
          context.abort(new Error('Phiếu bán này đang được xử lý, hãy thử lại sau.'));return;
        }
        const levelOps=[]; const movementOps=[]; const entries=[...totals.entries()];
        const finish=()=>{
          try{
            const outboxEvent=makeOutbox({operationId,eventId,entityType:'sale',entityId:saleUuid,action:'create',version:1,deviceId,registerId,type:'sale.create',createdAt:stamp,payload:{sale,inventory_movements:movementOps}});
            stores.sales.put(sale); levelOps.forEach(x=>stores.levels.put(x)); movementOps.forEach(x=>stores.movements.put(x)); stores.outbox.put(outboxEvent); stores.settings.put({id:'sale_local_sequence',value:localSequence}); stores.settings.put({id:'device_id',value:deviceId}); result=sale;
          }catch(error){context.abort(error);}
        };
        const shiftsReq=stores.shifts.getAll(); shiftsReq.onerror=()=>context.abort(shiftsReq.error); shiftsReq.onsuccess=()=>{
          const active=openShiftFor(shiftsReq.result,{device_id:deviceId,register_id:registerId});
          if(!active || active.status !== 'OPEN'){
            context.abort(new Error('Chưa mở ca. Hãy mở ca trước khi thanh toán.'));
            return;
          }
          sale.shift_id=active.id;
          (sale.payments||[]).forEach(p=>{ p.shift_id = active.id; });
          const levelsReq=stores.levels.getAll(); levelsReq.onerror=()=>context.abort(levelsReq.error); levelsReq.onsuccess=()=>{try{
          const levelMap=new Map((levelsReq.result||[]).map(x=>[x.id,x]));
          for(const [productId,quantity] of entries){const levelId=`${productId}:${warehouseId}`;const cur=levelMap.get(levelId)||{id:levelId,productId,warehouseId,onHand:0,reserved:0,damaged:0,version:0};if(available(cur)<quantity)throw new Error(`Không đủ tồn để bán ${source.get(productId).name}.`);const next={...cur,onHand:cur.onHand-quantity,version:Number(cur.version||0)+1,updatedAt:now()};if(next.reserved+next.damaged>next.onHand)throw new Error('Số đã giữ/hỏng vượt quá tồn thực tế.');const movement={id:`${operationId}:movement:${productId}`,groupId:id,type:'sale',productId,warehouseId,qty:-quantity,reason:'Bán hàng',reference:id,reference_type:'sale',reference_id:id,sale_uuid:saleUuid,operation_id:operationId,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:now(),after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}};levelOps.push(next);movementOps.push(movement);}
          finish();
        }catch(error){context.abort(error);}};};
      };
    };
  });
  return result;
}

export async function createReturn({saleId,lines,reason='Khách trả hàng',refundMethod='original',refundAmount=null,returnId='',operationId=''}){
  if(!saleId||!Array.isArray(lines)||!lines.length) throw new Error('Phiếu trả cần giao dịch gốc và ít nhất một dòng.');
  const id=returnId||uid('ret'); const operation=operationId||uuid(); const identity=await localIdentity();
  const shiftsBefore=await getAll('shifts');
  const activeShiftBefore=openShiftFor(shiftsBefore,{device_id:identity.device_id,register_id:identity.register_id});
  if(!activeShiftBefore || activeShiftBefore.status !== 'OPEN'){
    throw new Error('Chưa mở ca. Hãy mở ca trước khi nhận trả hàng và hoàn tiền.');
  }
  let result;
  await runTransaction(['sales','levels','movements','returns','refunds','outbox','shifts'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(operation);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.return||null;return;}
      const shiftsReq=stores.shifts.getAll();
      shiftsReq.onerror=()=>context.abort(shiftsReq.error);
      shiftsReq.onsuccess=()=>{
        const activeShift=openShiftFor(shiftsReq.result,{device_id:identity.device_id,register_id:identity.register_id});
        if(!activeShift || activeShift.status !== 'OPEN'){
          context.abort(new Error('Chưa mở ca. Hãy mở ca trước khi nhận trả hàng và hoàn tiền.'));
          return;
        }
        const saleReq=stores.sales.get(saleId);
        saleReq.onerror=()=>context.abort(saleReq.error);
        saleReq.onsuccess=()=>{
          const returnsReq=stores.returns.getAll();
          returnsReq.onerror=()=>context.abort(returnsReq.error);
          returnsReq.onsuccess=()=>{
            const refundsReq=stores.refunds.getAll();
            refundsReq.onerror=()=>context.abort(refundsReq.error);
            refundsReq.onsuccess=()=>{
              try{
                const sale=saleReq.result;
                if(!sale) throw new Error('Không tìm thấy giao dịch gốc.');
                const prior=new Map();
                for(const row of returnsReq.result||[]) if(row.sale_id===saleId) for(const line of row.lines||[]) prior.set(line.item_id,(prior.get(line.item_id)||0)+Number(line.quantity||0));
                const priorRefundTotal=(refundsReq.result||[]).filter(r=>r.sale_id===saleId).reduce((n,r)=>n+Number(r.amount||0),0);
                const maxRefundable=Math.max(0,Number(sale.grand_total??sale.total??0)-priorRefundTotal);
                const saleLines=new Map((sale.items||[]).map(line=>[line.item_id||line.itemId,line]));
                const discountRatio=Math.max(0,1-Math.min(1,Number(sale.discount_total||sale.discount||0)/Math.max(1,Number(sale.subtotal||1))));
                const normalized=[]; const levelOps=[]; const movements=[]; let computedRefund=0; let expectedInventory=0; let completedInventory=0;
                for(const raw of lines){
                  const itemId=String(raw?.item_id||raw?.itemId||''); const qty=Math.floor(Number(raw?.quantity||0)); const condition=String(raw?.condition||'SELLABLE').toUpperCase();
                  if(!itemId||!(qty>0)||!['SELLABLE','DAMAGED','NO_RESTOCK'].includes(condition)) throw new Error('Dòng trả hàng không hợp lệ.');
                  const sold=saleLines.get(itemId); if(!sold) throw new Error('Sản phẩm không thuộc giao dịch gốc.');
                  const remaining=Math.max(0,Number(sold.quantity||0)-(prior.get(itemId)||0)); if(qty>remaining) throw new Error(`Số lượng trả vượt quá số đã bán của ${sold.name||'sản phẩm'}.`);
                  const defaultUnitPaid=(Number(sold.line_total||sold.lineTotal||0)/Math.max(1,Number(sold.quantity||1)))*discountRatio;
                  const lineRefund=Math.max(0,Number(raw.refund_amount??(defaultUnitPaid*qty))||0); computedRefund+=lineRefund;
                  const warehouseId=raw.warehouse_id||sold.warehouse_id||sale.warehouseId||sale.warehouse_id||'';
                  normalized.push({item_id:itemId,quantity:qty,condition,reason:raw.reason||reason,warehouse_id:warehouseId,refund_amount:lineRefund});
                  if(condition==='NO_RESTOCK'||sold.type==='SERVICE'||sold.track_inventory===false) continue;
                  expectedInventory++;
                  if(!warehouseId) throw new Error(`Thiếu kho cho ${sold.name||'sản phẩm'}.`);
                  const levelId=`${itemId}:${warehouseId}`; const levelReq=stores.levels.get(levelId);
                  levelReq.onerror=()=>context.abort(levelReq.error);
                  levelReq.onsuccess=()=>{
                    const current=levelReq.result||{id:levelId,productId:itemId,warehouseId,onHand:0,reserved:0,damaged:0,version:0};
                    const next={...current,onHand:Number(current.onHand||0)+qty,damaged:Number(current.damaged||0)+(condition==='DAMAGED'?qty:0),version:Number(current.version||0)+1,updatedAt:now()};
                    const eventId=uuid(); const movement={id:`${operation}:movement:${itemId}`,groupId:id,type:'return',productId:itemId,warehouseId,qty,reason:condition==='DAMAGED'?'Trả hàng lỗi':condition==='SELLABLE'?'Trả hàng bán lại được':'Trả hàng không nhập lại',reference:id,reference_type:'return',reference_id:id,sale_uuid:sale.sale_uuid||sale.id,operation_id:operation,event_id:eventId,source_event_id:eventId,source:SYNC_SOURCE,version:next.version,createdAt:now(),after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}};
                    levelOps.push({next,movement}); completedInventory++; if(completedInventory===expectedInventory) finish();
                  };
                }
                const finish=()=>{
                  const stamp=now();
                  const actualRefundAmount=Math.round(Math.min(maxRefundable,refundAmount==null?computedRefund:Number(refundAmount||0)));
                  const refund={id:`${id}:refund`,return_id:id,sale_id:saleId,shift_id:activeShift.id,method:refundMethod,amount:actualRefundAmount,status:'RECORDED',created_at:stamp,operation_id:operation};
                  const doc={id,return_id:id,sale_id:saleId,shift_id:activeShift.id,warehouse_id:sale.warehouseId||sale.warehouse_id||'',reason,status:'CONFIRMED',refund_method:refundMethod,refund_amount:refund.amount,created_at:stamp,updated_at:stamp,operation_id:operation,lines:normalized};
                  const movementRows=levelOps.map(x=>x.movement); const outbox=makeOutbox({operationId:operation,eventId:uuid(),entityType:'return',entityId:id,action:'create',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'return.create',createdAt:stamp,payload:{return:doc,refund,inventory_movements:movementRows}});
                  levelOps.forEach(x=>stores.levels.put(x.next)); movementRows.forEach(x=>stores.movements.put(x)); stores.returns.put(doc); stores.refunds.put(refund); stores.outbox.put(outbox); result=doc;
                };
                if(expectedInventory===0) finish();
              }catch(error){context.abort(error);}
            };
          };
        };
      };
    };
  });
  return result;
}

const ORDER_STATUS=['NEW','CONFIRMED','PROCESSING','COMPLETED','CANCELLED'];
const orderNow=()=>new Date().toISOString();
function orderTotals(items,discount=0){const subtotal=items.reduce((s,x)=>s+x.line_total,0);const discountTotal=Math.max(0,Math.min(subtotal,Number(discount)||0));return {subtotal,discount_total:discountTotal,tax_total:0,grand_total:Math.max(0,subtotal-discountTotal)};}
export async function createOrder({items,warehouseId,source='DIRECT',channel='DIRECT',customerLabel='Khách lẻ',note='',discount=0,orderId=''}){
  if(!Array.isArray(items)||!items.length) throw new Error('Đơn hàng cần ít nhất một mặt hàng.');
  if(!warehouseId) throw new Error('Hãy chọn kho cho đơn hàng.');
  const orderUuid=orderId||uuid(); const existing=await getOne('orders',orderUuid); if(existing) return existing;
  const sourceItems=new Map((await getAll('products')).map(x=>[x.id,x]));
  const snapshots=items.map(line=>{const p=sourceItems.get(line.itemId);if(!p)throw new Error('Không tìm thấy mặt hàng trong đơn.');const quantity=Math.floor(Number(line.quantity));if(!(quantity>0))throw new Error('Số lượng phải là số nguyên lớn hơn 0.');const unitPrice=Math.max(0,Number(line.unitPrice??p.price)||0);return {item_id:p.id,type:p.type||'PRODUCT',track_inventory:p.trackInventory!==false, name:p.name,sku:p.sku||'',quantity,unit_price:unitPrice,discount:Math.max(0,Number(line.discount)||0),line_total:Math.max(0,quantity*unitPrice-Math.max(0,Number(line.discount)||0)),warehouse_id:warehouseId,location_id:warehouseId,reserved_qty:0,reservation_id:''};});
  const totals=orderTotals(snapshots,discount);const stamp=orderNow();
  const identity=await localIdentity();const operationId=uuid();const deviceId=identity.device_id;const registerId=identity.register_id;const localSequence=source==='local'||source==='DIRECT'?await nextLocalSequence(`order_sequence:${deviceId}:${registerId}`):null;
  const code=localSequence?`DH-${localSequence.toString().padStart(6,'0')}`:`DH-${stamp.replace(/\D/g,'').slice(-10)}`;
  const order={id:orderUuid,order_uuid:orderUuid,operation_id:operationId,version:1,device_id:deviceId,register_id:registerId,local_sequence:localSequence,code,source,channel,status:'NEW',payment_status:'UNPAID',warehouseId,location_id:warehouseId,customer_label:customerLabel||'Khách lẻ',note,items:snapshots,...totals,created_at:stamp,updated_at:stamp};
  const outboxEvent=makeOutbox({operationId,entityType:'order',entityId:orderUuid,action:'create',version:order.version,deviceId,registerId,type:'order.create',createdAt:stamp,payload:{order}});
  await runTransaction(['orders','outbox','settings'],stores=>{stores.orders.put(order);stores.outbox.put(outboxEvent);stores.settings.put({id:'device_id',value:deviceId});if(localSequence)stores.settings.put({id:'order_local_sequence',value:localSequence});});return order;
}
async function mutateOrder(orderId,nextStatus,requestedOperationId=''){
  const operationId=requestedOperationId||uuid();const eventId=uuid();const identity=await localIdentity();const deviceId=identity.device_id;const registerId=identity.register_id;let result;
  await runTransaction(['orders','levels','movements','outbox'],(stores,tx,context)=>{
    const operationReq=stores.outbox.get(operationId);operationReq.onerror=()=>context.abort(operationReq.error);operationReq.onsuccess=()=>{
      if(operationReq.result){result=operationReq.result.payload?.order||null;return;}
      const orderReq=stores.orders.get(orderId);orderReq.onerror=()=>context.abort(orderReq.error);orderReq.onsuccess=()=>{
        try{
          const order=orderReq.result;if(!order)throw new Error('Không tìm thấy đơn hàng.');if(order.status===nextStatus){result=order;return;}
          const allowed={NEW:['CONFIRMED','PROCESSING','COMPLETED','CANCELLED'],CONFIRMED:['PROCESSING','COMPLETED','CANCELLED'],PROCESSING:['COMPLETED','CANCELLED'],COMPLETED:[],CANCELLED:[]};if(!allowed[order.status]?.includes(nextStatus))throw new Error(`Không thể chuyển đơn từ ${order.status} sang ${nextStatus}.`);
          const isItemTracked = (line) => {
            const isProduct = line.type ? String(line.type).toUpperCase() !== 'SERVICE' : true;
            const isTracked = line.track_inventory !== false && line.trackInventory !== false;
            return isProduct && isTracked;
          };
          const getItemId = (line) => line.item_id || line.itemId || line.productId || line.id;
          const productTotals=new Map();
          for(const line of order.items||[]){
            if(isItemTracked(line)){
              const itemId = getItemId(line);
              const qty = Number(line.quantity || 0);
              if(itemId && qty > 0){
                productTotals.set(itemId,(productTotals.get(itemId)||0)+qty);
              }
            }
          }
          const levelOps=[],movementOps=[];const reservationType=nextStatus==='CONFIRMED'?'reserve':nextStatus==='CANCELLED'&&(order.status==='CONFIRMED'||order.status==='PROCESSING')?'release':nextStatus==='COMPLETED'?'sale':null;const entries=reservationType?[...productTotals.entries()]:[];let index=0;
          const whId=order.warehouseId||order.warehouse_id||order.location_id||'wh_retail_main';
          const reservationIdFor=(line)=>`${order.order_uuid||order.id}:${getItemId(line)}:${whId}`;
          const nextItems=(order.items||[]).map(line=>{
            const itemId = getItemId(line);
            if(!isItemTracked(line)||!itemId)return {...line,reserved_qty:0};
            const held=Number(line.reserved_qty||(order.status==='CONFIRMED'||order.status==='PROCESSING'?line.quantity:0));
            const reservedQty=(nextStatus==='CONFIRMED'||nextStatus==='PROCESSING')?(Number(line.reserved_qty)||Number(line.quantity)||0):0;
            return {...line,item_id:itemId,type:line.type||'PRODUCT',track_inventory:true,reserved_qty:reservedQty,reservation_id:reservationIdFor({...line,item_id:itemId}),warehouse_id:whId,location_id:whId};
          });
          const finish=()=>{
            const stamp=orderNow();
            const next={...order,device_id:deviceId,register_id:registerId,operation_id:operationId,version:Number(order.version||1)+1,items:nextItems,status:nextStatus,updated_at:stamp};
            const action=nextStatus==='CONFIRMED'?'reserve':nextStatus==='PROCESSING'?'process':nextStatus==='COMPLETED'?'complete':'cancel';
            const outboxEvent=makeOutbox({operationId,eventId,entityType:'order',entityId:order.order_uuid||order.id,action,version:next.version,deviceId,registerId,type:`order.${nextStatus.toLowerCase()}`,createdAt:stamp,payload:{order:next,inventory_movements:movementOps}});
            stores.orders.put(next);
            levelOps.forEach(x=>stores.levels.put(x));
            movementOps.forEach(x=>stores.movements.put(x));
            stores.outbox.put(outboxEvent);
            result=next;
          };
          const readNext=()=>{
            if(index>=entries.length){finish();return;}
            const [productId,quantity]=entries[index++];
            const levelId=`${productId}:${whId}`;
            const levelReq=stores.levels.get(levelId);
            levelReq.onerror=()=>context.abort(levelReq.error);
            levelReq.onsuccess=()=>{
              try{
                const cur=levelReq.result||{id:levelId,productId,warehouseId:whId,onHand:0,reserved:0,damaged:0,version:0};
                const heldReserved=(order.items||[]).filter(x=>getItemId(x)===productId).reduce((s,x)=>s+Number(x.reserved_qty||0),0);
                let reservedDelta=0,onHandDelta=0;
                if(reservationType==='reserve'){
                  if(available(cur)<quantity)throw new Error(`Không đủ tồn để giữ ${order.items.find(x=>getItemId(x)===productId)?.name||'sản phẩm'}.`);
                  reservedDelta=quantity;
                }else if(reservationType==='release'){
                  reservedDelta=-Math.min(cur.reserved||0,heldReserved||quantity);
                }else if(reservationType==='sale'){
                  if(cur.onHand<quantity)throw new Error(`Không đủ tồn kho để hoàn tất đơn hàng ${order.code||order.id}.`);
                  onHandDelta=-quantity;
                  if(heldReserved>0||order.status==='CONFIRMED'||order.status==='PROCESSING'){
                    reservedDelta=-Math.min(cur.reserved||0,heldReserved||quantity);
                  }
                }
                const next={...cur,onHand:cur.onHand+onHandDelta,reserved:Math.max(0,(cur.reserved||0)+reservedDelta),version:Number(cur.version||0)+1,updatedAt:orderNow()};
                if(next.onHand<0||next.reserved<0||(next.reserved+next.damaged>next.onHand))throw new Error('Tồn kho không hợp lệ cho đơn hàng.');
                const reservationId=`${order.order_uuid||order.id}:${productId}:${whId}`;
                const movement={
                  id:`${operationId}:movement:${productId}`,
                  groupId:order.order_uuid||order.id,
                  type:reservationType==='sale'?'sale':reservationType,
                  productId,
                  warehouseId:whId,
                  qty:reservationType==='reserve'?quantity:-quantity,
                  reason:reservationType==='reserve'?'Giữ cho đơn hàng':reservationType==='release'?'Hủy đơn - trả giữ':'Hoàn tất đơn hàng - xuất kho',
                  reference:order.code||order.id,
                  reference_type:'order',
                  reference_id:order.id,
                  order_uuid:order.order_uuid||order.id,
                  source:order.source||SYNC_SOURCE,
                  channel:order.channel||'DIRECT',
                  reservation_id:reservationId,
                  reserved_qty:quantity,
                  operation_id:operationId,
                  event_id:eventId,
                  source_event_id:eventId,
                  version:next.version,
                  createdAt:orderNow(),
                  after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}
                };
                levelOps.push(next);
                movementOps.push(movement);
                readNext();
              }catch(error){context.abort(error);}
            };
          };
          readNext();
        }catch(error){context.abort(error);}
      };
    };
  });
  return result;
}
export async function confirmOrder(id,operationId=''){return mutateOrder(id,'CONFIRMED',operationId);}
export async function processOrder(id,operationId=''){return mutateOrder(id,'PROCESSING',operationId);}
export async function completeOrder(id,operationId=''){return mutateOrder(id,'COMPLETED',operationId);}
export async function cancelOrder(id,operationId=''){return mutateOrder(id,'CANCELLED',operationId);}
export async function createProduct({name,sku,barcode='',lowStock=CONFIG.DEFAULT_LOW_STOCK,image='',images=[],categoryId='',price=null,active=true,websiteVisibility=false,variants=[],trackInventory=true,operationId=''}){
  if(!name?.trim()||!sku?.trim()) throw new Error('Tên và SKU là bắt buộc.');
  const all=await getAll('products');
  if(all.some(p=>String(p.sku||'').toLowerCase()===sku.trim().toLowerCase())) throw new Error('SKU đã tồn tại.');
  const cleanBarcode=String(barcode||'').trim();
  if(cleanBarcode&&all.some(p=>String(p.barcode||'').trim().toLowerCase()===cleanBarcode.toLowerCase())) throw new Error('Mã vạch (Barcode) này đã được dùng cho sản phẩm khác.');
  const gallery=Array.isArray(images)?images.filter(Boolean):[];
  const identity=await localIdentity();const op=operationId||uuid();const stamp=now();const product=asItem({id:uid('p'),name:name.trim(),sku:sku.trim(),barcode:barcode.trim(),categoryId,price:price===null||price===''?null:Number(price),active,websiteVisibility,variants,trackInventory,lowStock:Number(lowStock)||0,image:image||gallery[0]||'',images:gallery,operation_id:op,version:1,source:SYNC_SOURCE});const outbox=makeOutbox({operationId:op,entityType:'item',entityId:product.id,action:'create',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'item.create',createdAt:stamp,payload:{item:product}});await runTransaction(['products','outbox'],stores=>{stores.products.put(product);stores.outbox.put(outbox);});return product;
}
export async function createService({name,price=null,categoryId='',images=[],active=true,websiteVisibility=false,durationMinutes=null,staffRequired=false,bookingEnabled=false,operationId=''}){
  if(!name?.trim()) throw new Error('Tên dịch vụ là bắt buộc.');
  const gallery=images.filter(Boolean);const identity=await localIdentity();const op=operationId||uuid();const stamp=now();const service={id:uid('s'),type:'SERVICE',name:name.trim(),categoryId,price:price===null||price===''?null:Number(price),image:gallery[0]||'',images:gallery,active,websiteVisibility,variants:[],duration_minutes:durationMinutes===null||durationMinutes===''?null:Number(durationMinutes),staff_required:staffRequired,booking_enabled:bookingEnabled,trackInventory:false,operation_id:op,version:1,source:SYNC_SOURCE};const outbox=makeOutbox({operationId:op,entityType:'item',entityId:service.id,action:'create',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'item.create',createdAt:stamp,payload:{item:service}});await runTransaction(['products','outbox'],stores=>{stores.products.put(service);stores.outbox.put(outbox);});return service;
}
export async function createCategory({name,parentId='',type='PRODUCT',image=''}){
  const clean=String(name||'').trim(); if(!clean) throw new Error('Tên danh mục là bắt buộc.');
  const categories=await getAll('categories');
  const parent=parentId?categories.find(c=>c.id===parentId):null;
  if(parent&&parent.type!==type) throw new Error('Danh mục con phải cùng loại với danh mục cha.');
  if(categories.some(c=>c.type===type&&(c.parentId||'')===(parentId||'')&&String(c.name).toLowerCase()===clean.toLowerCase())) throw new Error('Danh mục này đã tồn tại ở cùng cấp.');
  const identity=await localIdentity();const op=uuid();const stamp=now(); const category={id:uid('cat'),name:clean,parentId:parentId||'',parent_id:parentId||'',type,image:image||'',created_at:stamp,updated_at:stamp,operation_id:op,version:1,source:SYNC_SOURCE};const outbox=makeOutbox({operationId:op,entityType:'category',entityId:category.id,action:'create',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'category.create',createdAt:stamp,payload:{category}});
  await runTransaction(['categories','outbox'],stores=>{stores.categories.put(category);stores.outbox.put(outbox);}); return category;
}
export async function updateItem(item,requestedOperationId=''){
  if(!item?.id||!item.name?.trim()) throw new Error('Mục không hợp lệ.');
  const all=await getAll('products');
  if(item.sku?.trim()&&all.some(p=>p.id!==item.id&&String(p.sku||'').trim().toLowerCase()===item.sku.trim().toLowerCase())) throw new Error('SKU đã tồn tại trên sản phẩm khác.');
  const cleanBc=String(item.barcode||'').trim().toLowerCase();
  if(cleanBc&&all.some(p=>p.id!==item.id&&String(p.barcode||'').trim().toLowerCase()===cleanBc)) throw new Error('Mã vạch (Barcode) này đã được dùng cho sản phẩm khác.');
  const identity=await localIdentity();const operationId=requestedOperationId||uuid();const next={...item,name:item.name.trim(),operation_id:operationId,version:Number(item.version||0)+1,source:item.source||SYNC_SOURCE,updated_at:now()};const outbox=makeOutbox({operationId,entityType:'item',entityId:next.id,action:'update',version:next.version,deviceId:identity.device_id,registerId:identity.register_id,type:'item.update',payload:{item:next}});await runTransaction(['products','outbox'],stores=>{stores.products.put(next);stores.outbox.put(outbox);});return next;
}
export async function createWarehouse(name){ if(!name?.trim()) throw new Error('Tên kho là bắt buộc.');const identity=await localIdentity();const operationId=uuid();const w={id:uid('wh'),name:name.trim(),operation_id:operationId,version:1,source:SYNC_SOURCE};const outbox=makeOutbox({operationId,entityType:'warehouse',entityId:w.id,action:'create',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'warehouse.create',payload:{warehouse:w}});await runTransaction(['warehouses','outbox'],stores=>{stores.warehouses.put(w);stores.outbox.put(outbox);});return w; }

function normalizeSupplierInput(input={}){
  const name=String(input.name||'').trim();
  if(!name) throw new Error('Tên nhà cung cấp là bắt buộc.');
  return {
    name,
    code:String(input.code||'').trim(),
    phone:String(input.phone||'').trim(),
    email:String(input.email||'').trim(),
    address:String(input.address||'').trim(),
    tax_code:String(input.tax_code??input.taxCode??'').trim(),
    note:String(input.note||'').trim(),
    status:String(input.status||'active')==='inactive'?'inactive':'active'
  };
}

export async function createSupplier(input={},requestedSupplierId='',requestedOperationId=''){
  const fields=normalizeSupplierInput(input);
  const identity=await localIdentity();
  const operationId=requestedOperationId||uuid();
  const id=requestedSupplierId||uid('sup');
  const stamp=now();
  let result;
  await runTransaction(['suppliers','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(operationId);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.supplier||null;return;}
      const allReq=stores.suppliers.getAll();
      allReq.onerror=()=>context.abort(allReq.error);
      allReq.onsuccess=()=>{
        try{
          const rows=allReq.result||[];
          if(fields.code&&rows.some(row=>row.code===fields.code&&row.id!==id)) throw new Error('Mã nhà cung cấp đã tồn tại.');
          if(rows.some(row=>String(row.name||'').toLowerCase()===fields.name.toLowerCase()&&row.id!==id)) throw new Error('Nhà cung cấp này đã tồn tại.');
          const supplier={id,...fields,created_at:stamp,updated_at:stamp,version:1,operation_id:operationId,source:SYNC_SOURCE};
          const outbox=makeOutbox({operationId,entityType:'supplier',entityId:id,action:'create',version:1,deviceId:identity.device_id,registerId:identity.register_id,type:'supplier.create',payload:{supplier}});
          stores.suppliers.put(supplier);stores.outbox.put(outbox);result=supplier;
        }catch(error){context.abort(error);}
      };
    };
  });
  return result;
}

export async function updateSupplier(input={},requestedOperationId=''){
  if(!input?.id) throw new Error('Nhà cung cấp không hợp lệ.');
  const fields=normalizeSupplierInput(input);
  const identity=await localIdentity();
  const operationId=requestedOperationId||uuid();
  let result;
  await runTransaction(['suppliers','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(operationId);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.supplier||null;return;}
      const currentReq=stores.suppliers.get(input.id);
      currentReq.onerror=()=>context.abort(currentReq.error);
      currentReq.onsuccess=()=>{
        const current=currentReq.result;
        if(!current){context.abort(new Error('Không tìm thấy nhà cung cấp.'));return;}
        const allReq=stores.suppliers.getAll();
        allReq.onerror=()=>context.abort(allReq.error);
        allReq.onsuccess=()=>{
          try{
            const rows=allReq.result||[];
            if(fields.code&&rows.some(row=>row.code===fields.code&&row.id!==input.id)) throw new Error('Mã nhà cung cấp đã tồn tại.');
            if(rows.some(row=>String(row.name||'').toLowerCase()===fields.name.toLowerCase()&&row.id!==input.id)) throw new Error('Nhà cung cấp này đã tồn tại.');
            const supplier={...current,...fields,updated_at:now(),version:Number(current.version||0)+1,operation_id:operationId,source:current.source||SYNC_SOURCE};
            const outbox=makeOutbox({operationId,entityType:'supplier',entityId:supplier.id,action:'update',version:supplier.version,deviceId:identity.device_id,registerId:identity.register_id,type:'supplier.update',payload:{supplier}});
            stores.suppliers.put(supplier);stores.outbox.put(outbox);result=supplier;
          }catch(error){context.abort(error);}
        };
      };
    };
  });
  return result;
}

export async function markSalePaid(saleId,{operationId='',reference='',amount=null}={}){
  if(!saleId) throw new Error('Thiếu mã phiếu bán.');
  const op=operationId||uuid();
  const identity=await localIdentity();
  let result;
  await runTransaction(['sales','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(op);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.sale||null;return;}
      const saleReq=stores.sales.get(saleId);
      saleReq.onerror=()=>context.abort(saleReq.error);
      saleReq.onsuccess=()=>{
        try{
          const sale=saleReq.result;
          if(!sale) throw new Error('Không tìm thấy phiếu bán.');
          if(sale.payment_status==='PAID'){result=sale;return;}
          const pendingPayments=(sale.payments||[]).filter(p=>p.status==='PENDING');
          const pendingTotal=pendingPayments.reduce((s,p)=>s+Number(p.amount||0),0);
          if(amount!==null && amount!==undefined){
            const numAmount=Number(amount);
            if(numAmount < pendingTotal){
              throw new Error('NOT_SUPPORTED: Thu tiền từng phần (partial collection) chưa được hỗ trợ trên phiếu bán.');
            }
          }
          const stamp=now();
          const payments=(sale.payments||[]).map(p=>{
            if(p.status==='PENDING'){
              return {...p,status:'PAID',paid_at:stamp,reference:reference||p.reference||''};
            }
            return p;
          });
          if(!payments.length){
            payments.push({
              id:uuid(),
              method:sale.payment_method||'transfer',
              amount:sale.grand_total??sale.total??0,
              status:'PAID',
              paid_at:stamp,
              reference
            });
          }
          const updated={
            ...sale,
            payment_status:'PAID',
            payments,
            version:Number(sale.version||1)+1,
            updated_at:stamp,
            operation_id:op
          };
          const outbox=makeOutbox({
            operationId:op,
            eventId:uuid(),
            entityType:'sale',
            entityId:sale.id,
            action:'mark_paid',
            version:updated.version,
            deviceId:identity.device_id,
            registerId:identity.register_id,
            type:'sale.mark_paid',
            createdAt:stamp,
            payload:{sale:updated}
          });
          stores.sales.put(updated);
          stores.outbox.put(outbox);
          result=updated;
        }catch(error){context.abort(error);}
      };
    };
  });
  return result;
}

export async function markOrderPaid(orderId,{operationId='',paymentMethod='transfer'}={}){
  if(!orderId) throw new Error('Thiếu mã đơn hàng.');
  const op=operationId||uuid();
  const identity=await localIdentity();
  let result;
  await runTransaction(['orders','outbox'],(stores,tx,context)=>{
    const existingReq=stores.outbox.get(op);
    existingReq.onerror=()=>context.abort(existingReq.error);
    existingReq.onsuccess=()=>{
      if(existingReq.result){result=existingReq.result.payload?.order||null;return;}
      const orderReq=stores.orders.get(orderId);
      orderReq.onerror=()=>context.abort(orderReq.error);
      orderReq.onsuccess=()=>{
        try{
          const order=orderReq.result;
          if(!order) throw new Error('Không tìm thấy đơn hàng.');
          const stamp=now();
          const updated={
            ...order,
            payment_status:'PAID',
            payment_method:paymentMethod||order.payment_method||'transfer',
            version:Number(order.version||1)+1,
            updated_at:stamp,
            operation_id:op
          };
          const outbox=makeOutbox({
            operationId:op,
            eventId:uuid(),
            entityType:'order',
            entityId:order.id,
            action:'mark_paid',
            version:updated.version,
            deviceId:identity.device_id,
            registerId:identity.register_id,
            type:'order.mark_paid',
            createdAt:stamp,
            payload:{order:updated}
          });
          stores.orders.put(updated);
          stores.outbox.put(outbox);
          result=updated;
        }catch(error){context.abort(error);}
      };
    };
  });
  return result;
}

export async function createExchange({saleId,returnLines,returnReason='Đổi hàng',newItems,warehouseId,paymentMethod='cash',operationId=''}={}){
  if(!saleId) throw new Error('Đổi hàng cần giao dịch gốc.');
  if(!Array.isArray(returnLines)||!returnLines.length) throw new Error('Chọn ít nhất một mặt hàng để trả/đổi.');
  if(!Array.isArray(newItems)||!newItems.length) throw new Error('Chọn ít nhất một mặt hàng mới để đổi lấy.');
  const op=operationId||uuid();
  const identity=await localIdentity();
  const deviceId=identity.device_id;
  const registerId=identity.register_id;
  const returnId=uid('ret');
  const saleUuid=uuid();
  const newSaleId=saleUuid;
  const products=await getAll('products');
  const productSource=new Map(products.map(p=>[p.id,p]));

  const mergedItems=new Map();
  for(const raw of newItems){
    const itemId=raw?.itemId||raw?.item_id;
    if(!itemId) throw new Error('Không tìm thấy mặt hàng trong giỏ.');
    const quantity=Math.floor(Number(raw.quantity));
    if(!(quantity>0)) throw new Error('Số lượng phải là số nguyên lớn hơn 0.');
    const previous=mergedItems.get(itemId);
    if(previous){
      previous.quantity+=quantity;
    }else mergedItems.set(itemId,{...raw,itemId,quantity});
  }

  const saleItems=[...mergedItems.values()].map(line=>{
    const p=productSource.get(line.itemId);
    if(!p) throw new Error('Không tìm thấy mặt hàng trong giỏ.');
    const quantity=Math.floor(Number(line.quantity));
    const unitPrice=Math.max(0,Number(line.unitPrice??p.price)||0);
    const lineDiscount=Math.max(0,Number(line.discount)||0);
    const lineSubtotal=Math.max(0,quantity*unitPrice-lineDiscount);
    const taxAmount=Math.max(0,Number(line.tax_amount)||0);
    const taxInclusive=Boolean(line.tax_inclusive);
    return {
      item_id:p.id,
      type:p.type||'PRODUCT',
      name:p.name,
      sku:p.sku||'',
      quantity,
      unit_price:unitPrice,
      discount:lineDiscount,
      tax_code:line.tax_code||'',
      tax_category:line.tax_category||'',
      tax_rate:line.tax_rate===''||line.tax_rate==null?null:Number(line.tax_rate),
      tax_amount:taxAmount,
      tax_inclusive:taxInclusive,
      line_subtotal:lineSubtotal,
      line_total:taxInclusive?lineSubtotal:lineSubtotal+taxAmount
    };
  });

  const subtotal=saleItems.reduce((sum,line)=>sum+line.line_subtotal,0);
  const taxTotal=saleItems.reduce((sum,line)=>sum+line.tax_amount,0);
  const newSaleTotal=Math.max(0,subtotal+taxTotal);

  const localSequence=await nextLocalSequence(`sale_sequence:${deviceId}:${registerId}`);
  const newSaleCode=`POS-${localSequence.toString().padStart(6,'0')}`;
  const stamp=now();

  let exchangeResult;

  await runTransaction(['sales','levels','movements','returns','refunds','outbox','settings','shifts'],(stores,tx,context)=>{
    const opReq=stores.outbox.get(op);
    opReq.onerror=()=>context.abort(opReq.error);
    opReq.onsuccess=()=>{
      if(opReq.result){
        exchangeResult=opReq.result.payload?.exchange||null;
        return;
      }
      const origSaleReq=stores.sales.get(saleId);
      origSaleReq.onerror=()=>context.abort(origSaleReq.error);
      origSaleReq.onsuccess=()=>{
        const origSale=origSaleReq.result;
        if(!origSale){context.abort(new Error('Không tìm thấy giao dịch gốc.'));return;}

        const targetWarehouse=warehouseId||origSale.warehouseId||origSale.warehouse_id;
        if(!targetWarehouse){context.abort(new Error('Hãy chọn kho xử lý.'));return;}

        const returnsReq=stores.returns.getAll();
        returnsReq.onerror=()=>context.abort(returnsReq.error);
        returnsReq.onsuccess=()=>{
          const refundsReq=stores.refunds.getAll();
          refundsReq.onerror=()=>context.abort(refundsReq.error);
          refundsReq.onsuccess=()=>{
            const shiftsReq=stores.shifts.getAll();
            shiftsReq.onerror=()=>context.abort(shiftsReq.error);
            shiftsReq.onsuccess=()=>{
              const levelsReq=stores.levels.getAll();
              levelsReq.onerror=()=>context.abort(levelsReq.error);
              levelsReq.onsuccess=()=>{
                try{
                  const activeShift=openShiftFor(shiftsReq.result,{device_id:deviceId,register_id:registerId});
                  if(!activeShift || activeShift.status !== 'OPEN'){
                    context.abort(new Error('Chưa mở ca. Hãy mở ca trước khi đổi hàng.'));
                    return;
                  }
                  const levelMap=new Map((levelsReq.result||[]).map(x=>[x.id,{...x}]));

                  const prior=new Map();
                  for(const row of returnsReq.result||[]){
                    if(row.sale_id===saleId){
                      for(const line of row.lines||[]) prior.set(line.item_id,(prior.get(line.item_id)||0)+Number(line.quantity||0));
                    }
                  }
                  const priorRefundTotal=(refundsReq.result||[]).filter(r=>r.sale_id===saleId).reduce((n,r)=>n+Number(r.amount||0),0);
                  const maxRefundable=Math.max(0,Number(origSale.grand_total??origSale.total??0)-priorRefundTotal);
                  const saleLines=new Map((origSale.items||[]).map(line=>[line.item_id||line.itemId,line]));
                  const discountRatio=Math.max(0,1-Math.min(1,Number(origSale.discount_total||origSale.discount||0)/Math.max(1,Number(origSale.subtotal||1))));

                  const normalizedReturns=[];
                  const returnMovements=[];
                  let computedRefund=0;

                  for(const raw of returnLines){
                    const itemId=String(raw?.item_id||raw?.itemId||'');
                    const qty=Math.floor(Number(raw?.quantity||0));
                    const condition=String(raw?.condition||'SELLABLE').toUpperCase();
                    if(!itemId||!(qty>0)||!['SELLABLE','DAMAGED','NO_RESTOCK'].includes(condition)) throw new Error('Dòng trả hàng không hợp lệ.');
                    const sold=saleLines.get(itemId);
                    if(!sold) throw new Error('Sản phẩm không thuộc giao dịch gốc.');
                    const remaining=Math.max(0,Number(sold.quantity||0)-(prior.get(itemId)||0));
                    if(qty>remaining) throw new Error(`Số lượng trả vượt quá số đã bán của ${sold.name||'sản phẩm'}.`);
                    const defaultUnitPaid=(Number(sold.line_total||sold.lineTotal||0)/Math.max(1,Number(sold.quantity||1)))*discountRatio;
                    const lineRefund=Math.max(0,Number(raw.refund_amount??(defaultUnitPaid*qty))||0);
                    computedRefund+=lineRefund;
                    const itemWh=raw.warehouse_id||sold.warehouse_id||targetWarehouse;
                    normalizedReturns.push({item_id:itemId,quantity:qty,condition,reason:raw.reason||returnReason,warehouse_id:itemWh,refund_amount:lineRefund});

                    if(condition!=='NO_RESTOCK'&&sold.type!=='SERVICE'&&sold.track_inventory!==false){
                      const lid=`${itemId}:${itemWh}`;
                      const cur=levelMap.get(lid)||{id:lid,productId:itemId,warehouseId:itemWh,onHand:0,reserved:0,damaged:0,version:0};
                      const next={
                        ...cur,
                        onHand:cur.onHand+qty,
                        damaged:cur.damaged+(condition==='DAMAGED'?qty:0),
                        version:Number(cur.version||0)+1,
                        updatedAt:stamp
                      };
                      const mvEventId=uuid();
                      const mv={
                        id:`${op}:ret_mv:${itemId}`,
                        groupId:returnId,
                        type:'return',
                        productId:itemId,
                        warehouseId:itemWh,
                        qty:qty,
                        reason:`Đổi hàng: hoàn kho`,
                        reference:returnId,
                        reference_type:'return',
                        reference_id:returnId,
                        sale_uuid:origSale.sale_uuid||saleId,
                        operation_id:op,
                        event_id:mvEventId,
                        source_event_id:mvEventId,
                        source:SYNC_SOURCE,
                        version:next.version,
                        createdAt:stamp,
                        after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}
                      };
                      returnMovements.push(mv);
                      levelMap.set(lid,next);
                    }
                  }

                  const returnRefund=Math.round(Math.min(maxRefundable,computedRefund));
                  const diff=Math.round(newSaleTotal-returnRefund);

                  const saleMovements=[];
                  const totals=new Map();
                  for(const line of saleItems){
                    if(line.type==='PRODUCT'&&productSource.get(line.item_id)?.trackInventory!==false){
                      totals.set(line.item_id,(totals.get(line.item_id)||0)+line.quantity);
                    }
                  }

                  for(const [productId,quantity] of totals.entries()){
                    const levelId=`${productId}:${targetWarehouse}`;
                    const cur=levelMap.get(levelId)||{id:levelId,productId,warehouseId:targetWarehouse,onHand:0,reserved:0,damaged:0,version:0};
                    if(available(cur)<quantity){
                      throw new Error(`Không đủ tồn để bán ${productSource.get(productId)?.name||productId}.`);
                    }
                    const next={
                      ...cur,
                      onHand:cur.onHand-quantity,
                      version:Number(cur.version||0)+1,
                      updatedAt:stamp
                    };
                    if(next.reserved+next.damaged>next.onHand) throw new Error('Số đã giữ/hỏng vượt quá tồn thực tế.');
                    const mvEventId=uuid();
                    const mv={
                      id:`${op}:sale_mv:${productId}`,
                      groupId:newSaleId,
                      type:'sale',
                      productId,
                      warehouseId:targetWarehouse,
                      qty:-quantity,
                      reason:'Bán hàng đổi',
                      reference:newSaleId,
                      reference_type:'sale',
                      reference_id:newSaleId,
                      sale_uuid:saleUuid,
                      operation_id:op,
                      event_id:mvEventId,
                      source_event_id:mvEventId,
                      source:SYNC_SOURCE,
                      version:next.version,
                      createdAt:stamp,
                      after:{onHand:next.onHand,reserved:next.reserved,damaged:next.damaged}
                    };
                    saleMovements.push(mv);
                    levelMap.set(levelId,next);
                  }

                  const refundRecord={
                    id:`${returnId}:refund`,
                    return_id:returnId,
                    sale_id:saleId,
                    shift_id:activeShift.id,
                    method:'exchange',
                    amount:returnRefund,
                    status:'RECORDED',
                    created_at:stamp,
                    operation_id:op
                  };
                  const returnDoc={
                    id:returnId,
                    return_id:returnId,
                    sale_id:saleId,
                    shift_id:activeShift.id,
                    warehouse_id:targetWarehouse,
                    reason:`Đổi hàng: ${returnReason}`,
                    status:'CONFIRMED',
                    refund_method:'exchange',
                    refund_amount:returnRefund,
                    created_at:stamp,
                    updated_at:stamp,
                    operation_id:op,
                    lines:normalizedReturns,
                    exchange_sale_id:newSaleId,
                    exchange_sale_code:newSaleCode,
                    exchange_diff:diff
                  };

                  const method=['cash','transfer','qr'].includes(paymentMethod)?paymentMethod:'cash';
                  const paymentStatus=method==='cash'?'PAID':'PENDING';

                  // Build proper payment breakdown:
                  // 1. Exchange credit voucher covers up to min(newSaleTotal, returnRefund)
                  // 2. If newSaleTotal > returnRefund (diff > 0): customer pays diff
                  // 3. If newSaleTotal < returnRefund (diff < 0): excess is refunded to customer
                  const exchangePayments=[];
                  if(returnRefund > 0){
                    exchangePayments.push({
                      id:uuid(),
                      method:'exchange',
                      amount:Math.min(newSaleTotal, returnRefund),
                      status:'PAID',
                      reference:`Khấu trừ từ phiếu trả ${returnId}`,
                      shift_id:activeShift.id
                    });
                  }
                  if(diff > 0){
                    exchangePayments.push({
                      id:uuid(),
                      method,
                      amount:diff,
                      status:paymentStatus,
                      reference:'',
                      shift_id:activeShift.id
                    });
                  }

                  if(diff < 0){
                    const cashToRefund=Math.abs(diff);
                    const excessRefundRecord={
                      id:`${returnId}:excess_refund`,
                      return_id:returnId,
                      sale_id:saleId,
                      shift_id:activeShift.id,
                      method:method==='transfer'?'transfer':'cash',
                      amount:cashToRefund,
                      status:'RECORDED',
                      created_at:stamp,
                      operation_id:`${op}:excess_refund`
                    };
                    stores.refunds.put(excessRefundRecord);
                  }

                  const newSale={
                    id:newSaleId,
                    sale_uuid:saleUuid,
                    device_id:deviceId,
                    register_id:registerId,
                    shift_id:activeShift.id,
                    local_sequence:localSequence,
                    operation_id:op,
                    code:newSaleCode,
                    status:'COMPLETED',
                    created_at:stamp,
                    createdAt:stamp,
                    warehouseId:targetWarehouse,
                    location_id:targetWarehouse,
                    channel:'POS',
                    customer_label:origSale.customer_label||'Khách lẻ',
                    note:`Đổi hàng từ phiếu ${origSale.code||saleId}`,
                    subtotal,
                    discount_total:0,
                    tax_total:taxTotal,
                    grand_total:newSaleTotal,
                    discount:0,
                    total:newSaleTotal,
                    payments:exchangePayments.length ? exchangePayments : [{
                      id:uuid(),
                      method:'exchange',
                      amount:0,
                      status:'PAID',
                      reference:'',
                      shift_id:activeShift.id
                    }],
                    payment_method:diff > 0 ? method : 'exchange',
                    payment_status:diff > 0 ? paymentStatus : 'PAID',
                    items:saleItems,
                    exchange_return_id:returnId,
                    original_sale_id:saleId,
                    original_sale_code:origSale.code||saleId,
                    exchange_diff:diff,
                    updated_at:stamp
                  };

                  const returnOutbox=makeOutbox({
                    operationId:`${op}:return`,
                    eventId:uuid(),
                    entityType:'return',
                    entityId:returnId,
                    action:'create',
                    version:1,
                    deviceId,
                    registerId,
                    type:'return.create',
                    createdAt:stamp,
                    payload:{return:returnDoc,refund:refundRecord,inventory_movements:returnMovements}
                  });

                  const saleOutbox=makeOutbox({
                    operationId:`${op}:sale`,
                    eventId:uuid(),
                    entityType:'sale',
                    entityId:saleUuid,
                    action:'create',
                    version:1,
                    deviceId,
                    registerId,
                    type:'sale.create',
                    createdAt:stamp,
                    payload:{sale:newSale,inventory_movements:saleMovements}
                  });

                  const exchangeOutbox=makeOutbox({
                    operationId:op,
                    eventId:uuid(),
                    entityType:'exchange',
                    entityId:returnId,
                    action:'create',
                    version:1,
                    deviceId,
                    registerId,
                    type:'exchange.create',
                    createdAt:stamp,
                    payload:{exchange:{returnDoc,newSale,returnRefund,newSaleTotal,diff}}
                  });

                  levelMap.forEach(lv=>stores.levels.put(lv));
                  returnMovements.forEach(m=>stores.movements.put(m));
                  saleMovements.forEach(m=>stores.movements.put(m));
                  stores.returns.put(returnDoc);
                  stores.refunds.put(refundRecord);
                  stores.sales.put(newSale);
                  stores.outbox.put(returnOutbox);
                  stores.outbox.put(saleOutbox);
                  stores.outbox.put(exchangeOutbox);
                  stores.settings.put({id:'sale_local_sequence',value:localSequence});
                  stores.settings.put({id:'device_id',value:deviceId});

                  exchangeResult={returnDoc,newSale,returnRefund,newSaleTotal,diff};
                }catch(err){
                  context.abort(err);
                }
              };
            };
          };
        };
      };
    };
  });

  return exchangeResult;
}

export function calculateSalesMetrics({
  sales = [],
  orders = [],
  refunds = [],
  products = [],
  range = 'today',
  customStart = null,
  customEnd = null,
  startDate = null,
  endDate = null
} = {}) {
  let start, end;
  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else {
    const now = new Date();
    start = new Date(now);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const rNorm = String(range || 'today').toLowerCase().trim();

    if (rNorm === 'today' || rNorm === 'hom nay' || rNorm === 'nay' || rNorm === 'ngay hom nay') {
      start.setHours(0, 0, 0, 0);
    } else if (rNorm === 'yesterday' || rNorm === 'hom qua') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (
      rNorm === '2_days' || rNorm === '2d' ||
      rNorm.includes('hai ngay') || rNorm.includes('2 ngay') ||
      rNorm.includes('hom qua den nay') || rNorm.includes('hom qua den gio') ||
      rNorm.includes('tu hom qua')
    ) {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
    } else if (
      rNorm === '3_days' || rNorm === '3d' ||
      rNorm.includes('3 ngay') || rNorm.includes('ba ngay')
    ) {
      start.setDate(now.getDate() - 2);
      start.setHours(0, 0, 0, 0);
    } else if (
      rNorm === '7d' || rNorm === 'week' ||
      rNorm.includes('tuan nay') || rNorm.includes('7 ngay')
    ) {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (rNorm === 'last_week' || rNorm.includes('tuan truoc')) {
      start.setDate(now.getDate() - 13);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 7);
      end.setHours(23, 59, 59, 999);
    } else if (rNorm === '30d' || rNorm.includes('30 ngay')) {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    } else if (
      rNorm === 'month' || rNorm.includes('thang nay') ||
      rNorm.includes('tu dau thang') || rNorm.includes('dau thang den nay') ||
      rNorm.includes('thang hien tai')
    ) {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (rNorm === 'last_month' || rNorm === 'lastmonth' || rNorm.includes('thang truoc')) {
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    } else if (rNorm === 'custom' || customStart) {
      if (customStart) start.setTime(new Date(`${customStart}T00:00:00`).getTime());
      else start.setFullYear(2000);
      if (customEnd) end.setTime(new Date(`${customEnd}T23:59:59.999`).getTime());
    } else {
      start.setHours(0, 0, 0, 0);
    }
  }

  const relevantSales = (sales || []).filter(s => {
    const dt = new Date(s.created_at || s.createdAt || s.date || 0);
    return ['COMPLETED', 'PAID'].includes(String(s.status || '').toUpperCase()) && dt >= start && dt <= end;
  });

  const saleCodes = new Set(relevantSales.flatMap(s => [s.code, s.id, s.sale_uuid, s.order_id, s.order_code, s.reference, s.reference_id].filter(Boolean)));

  const relevantOrders = (orders || []).filter(o => {
    if (String(o.status || '').toUpperCase() !== 'COMPLETED') return false;
    const dt = new Date(o.created_at || o.createdAt || o.updated_at || 0);
    if (dt < start || dt > end) return false;
    if (saleCodes.has(o.code) || saleCodes.has(o.id) || saleCodes.has(o.order_uuid)) return false;
    if (o.sale_id && relevantSales.some(s => s.id === o.sale_id || s.sale_uuid === o.sale_id)) return false;
    return true;
  }).map(o => ({
    id: o.id,
    code: o.code || o.id,
    customer_label: o.customer_label || 'Khách lẻ',
    created_at: o.created_at || o.createdAt || o.updated_at,
    subtotal: Number(o.subtotal || o.grand_total || 0),
    discount_total: Number(o.discount_total || 0),
    tax_total: Number(o.tax_total || 0),
    grand_total: Number(o.grand_total || 0),
    total: Number(o.grand_total || 0),
    status: 'COMPLETED',
    payment_status: o.payment_status || 'UNPAID',
    payment_method: o.payment_method || 'transfer',
    payments: o.payment_status === 'PAID'
      ? [{ method: o.payment_method || 'transfer', amount: Number(o.grand_total || 0), status: 'PAID' }]
      : [{ method: o.payment_method || 'transfer', amount: Number(o.grand_total || 0), status: 'PENDING' }],
    items: (o.items || []).map(i => ({
      item_id: i.item_id || i.itemId,
      name: i.name || 'Sản phẩm',
      quantity: Number(i.quantity || 0),
      line_total: Number(i.line_total ?? (Number(i.quantity || 0) * Number(i.unit_price || 0)) ?? 0)
    })),
    is_order: true
  }));

  const allSales = [...relevantSales, ...relevantOrders];
  const gross = allSales.reduce((n, s) => n + Number(s.subtotal || (s.grand_total ?? s.total ?? 0)), 0);
  const discount = allSales.reduce((n, s) => n + Number(s.discount_total || 0), 0);
  const tax = allSales.reduce((n, s) => n + Number(s.tax_total || 0), 0);
  const grandTotalGross = allSales.reduce((n, s) => n + Number(s.grand_total ?? s.total ?? 0), 0);

  const relevantRefunds = (refunds || []).filter(r => {
    const rDate = new Date(r.created_at || r.createdAt || 0);
    return rDate >= start && rDate <= end;
  });
  const refundTotal = relevantRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const net = Math.max(0, gross - discount - refundTotal);

  const prodMap = new Map((products || []).map(p => [p.id, p]));
  const costTotal = allSales.reduce((sumCost, s) => {
    const saleCost = (s.items || []).reduce((itemSum, item) => {
      const prod = prodMap.get(item.item_id || item.itemId || item.productId || item.id);
      const unitCost = Number(item.cost_price ?? prod?.cost_price ?? prod?.cost ?? prod?.purchase_price ?? 0);
      return itemSum + (unitCost * Number(item.quantity || 1));
    }, 0);
    return sumCost + saleCost;
  }, 0);

  const hasCost = costTotal > 0;
  const profit = hasCost ? Math.max(0, net - costTotal) : 0;

  const paymentRows = allSales.flatMap(s => (s.payments || []).map(p => ({ ...p, sale: s })));
  const collected = Math.max(0, paymentRows.filter(p => p.status === 'PAID').reduce((n, p) => n + Number(p.amount || 0), 0) - refundTotal);
  const receivable = paymentRows.filter(p => p.status === 'PENDING').reduce((n, p) => n + Number(p.amount || 0), 0);

  const paymentMethods = { cash: 0, transfer: 0, qr: 0 };
  let paidCount = 0;
  let unpaidCount = 0;
  let unpaidTotal = 0;

  for (const s of allSales) {
    const amt = Number(s.grand_total ?? s.total ?? 0);
    const isPaid = s.payment_status === 'PAID' || s.status === 'PAID';
    if (isPaid) {
      paidCount++;
      const method = s.payment_method || 'cash';
      if (paymentMethods[method] !== undefined) paymentMethods[method] += amt;
      else paymentMethods.cash += amt;
    } else {
      unpaidCount++;
      unpaidTotal += amt;
    }
  }

  return {
    start,
    end,
    sales: allSales,
    relevantSales,
    completedOrders: relevantOrders,
    refunds: relevantRefunds,
    ticketCount: allSales.length,
    paidCount,
    unpaidCount,
    unpaidTotal,
    paymentMethods,
    paymentRows,
    gross,
    discount,
    tax,
    grandTotalGross,
    refundTotal,
    net,
    cost: costTotal,
    profit,
    hasCost,
    collected,
    receivable
  };
}


