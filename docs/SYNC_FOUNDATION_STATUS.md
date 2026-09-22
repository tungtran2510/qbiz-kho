# QBIZ KHO — SYNC-00 FOUNDATION STATUS

Date: 2026-09-20

## CONTRACT LOCKED

- Product / Service / Category / Media thuộc owner QBiz Platform.
- Inventory thuộc Inventory Core / movement ledger; `products.stock` không được dùng làm nguồn ghi tồn.
- Mọi biến động tồn phải đi qua business operation và sinh movement.
- Sync identity production: `shop_id + external_id`; SKU chỉ dùng để reconciliation nghiệp vụ.
- Mọi mutation chuẩn bị `operation_id`; event chuẩn bị `event_id`, `source_event_id`, `version`.
- Retry giữ nguyên `operation_id` và phải idempotent.
- Website, Kho, POS và Order dùng cùng Item; không tạo bản Product thứ hai.
- COD reconciliation, HĐĐT production, split payment và cash-change persistence chưa có contract; không implement.

## CURRENT ARCHITECTURE

- IndexedDB local working store: `qbiz_kho_v1`, DB version 8, các store chính gồm `products`, `levels`, `movements`, `orders`, `sales`, `transfers`, `outbox` (`src/db.js`, `src/config.js`). Baseline migration thực tế được kiểm tra là v6 → v8.
- Inventory runtime dùng `levels.onHand/reserved/damaged`; `available` được tính từ ledger level (`src/engine.js:66-68`).
- Mutation tồn local đi qua engine (`receive`, `issue`, `countAdjust`, `reserve`, `release`, transfer). Inventory helper, Sale và Order đều có local transaction boundary; production multi-device atomicity vẫn chưa có.
- Outbox là delivery queue local. `SYNC_MODE` hiện là `local`; API endpoint chỉ là skeleton (`src/config.js:5-7`, `src/sync.js:21-34`).
- Sale/Order đã có snapshot, UUID, version và movement reference; backend Action API chưa kết nối.
- Catalog local chưa có đầy đủ `shop_id`/`external_id` mapping của QBiz Platform; đây là boundary backend/migration, không tự suy diễn trong prototype.

## CURRENT → CONTRACT → GAP

| Current | Contract | Gap / classification |
|---|---|---|
| `levels` + `movements` là nguồn tồn runtime; không ghi `products.stock` trong mutation | Inventory Core/ledger là owner | KEEP; local ledger phù hợp contract |
| Mutation cơ bản trước đây đọc/ghi rời rạc | Level + movement + outbox phải atomic | FIX-NOW: `changeLevel`, transfer create/receive dùng transaction |
| Outbox cũ dùng event ngẫu nhiên và thiếu metadata ở một số mutation | `operation_id`, `event_id`, `source_event_id`, `version` ổn định | FIX-NOW: chuẩn hóa envelope, movement metadata và idempotency key |
| `operation_id` mới có ở Sale/Order | Mọi business mutation phải có operation | FIX-NOW: item/service/category/warehouse và inventory mutation đều tạo operation |
| `version` thiếu ở level/movement | Version để phát hiện stale/out-of-order | FIX-NOW local version; NEED-BACKEND cho inbound gate |
| `sync.js` có retry/backoff nhưng stale SYNCING cần recovery | Queue độc lập, giữ history, retry cùng operation | FIX-NOW: normalize, queue isolation, stale retry ngay |
| Product/Service/Category dùng store local, chưa có `shop_id + external_id` | QBiz Platform là owner, identity theo shop/external | NEED-MIGRATION / NEED-BACKEND; chưa nối production |
| Không có inbound event consumer/version gate | Dedupe `source_event_id`, bỏ version cũ | NEED-BACKEND |
| Transfer hiện nhận toàn bộ | Partial receipt phải giữ remainder in-transit | NEED-CONTRACT |
| Chưa có Return/DAMAGE operation | Damaged tăng, available không tăng | NEED-CONTRACT |

## DELTA APPLIED

- Chuẩn DB từ version 6 lên 8, không thêm store mới.
- `runTransaction` nhận context abort để validation lỗi trong callback có thể rollback đúng transaction (`src/db.js:61-72`).
- Migration additive backfill `version` cho levels; `operation_id`, `event_id`, `source_event_id`, `version`, `sync_status` và retry metadata cho movements/outbox (`src/db.js:10-32`). Field `status` legacy được giữ để tương thích; code mới dùng `sync_status` làm nguồn chính.
- Thêm outbox envelope dùng `id = operation_id`, `source`, `provider`, metadata event/version (`src/engine.js:8`).
- `changeLevel` kiểm tra duplicate operation trong cùng transaction và ghi level + movement + outbox cùng operation.
- Transfer create/receive ghi level + movement + transfer + outbox atomic và idempotent (`src/engine.js:113-131`).
- `createSale` và `mutateOrder` đọc/validate levels trong cùng transaction với sale/order + movement + outbox; duplicate operation và concurrent last-item reserve/sale được khóa ở local IndexedDB transaction.
- Create/update Product, Service, Category và Warehouse chuẩn bị operation/outbox; Service không bị ép SKU (`src/engine.js:180-200`).
- `flushOutbox` chuẩn hóa legacy row, giữ event identity, dùng `Idempotency-Key = operation_id`, xử lý từng operation độc lập và recover stale `SYNCING` (`src/sync.js:12-34`).
- Sửa guard SKU null-safe để Product vẫn tạo được khi store có Service hợp lệ không có SKU (`src/engine.js:182`).

## DB/MIGRATION CHANGES

- `CONFIG.DB_VERSION`: 6 baseline → 8.
- Không xóa store, không reset dữ liệu, không thay đổi contract Product/Service đã dùng bởi UI.
- Migration v6 → v8 chỉ bổ sung metadata thiếu cho record cũ; dữ liệu legacy vẫn giữ nguyên field cũ.
- Record mới dùng outbox key theo `operation_id`, giúp retry/duplicate operation không tạo movement thứ hai local.

## TEST RESULT

Evidence harness: `evidence/sync-00-local-test.html` và `evidence/sync-00-migration-test.html` trên origin test riêng.

| Test | Result | Evidence |
|---|---|---|
| SYNC-T01 Duplicate operation | PASS local | Cùng operation tạo 1 movement, 1 outbox; tồn tăng đúng 1 lần |
| SYNC-T02 Duplicate webhook | NEED-BACKEND | Chưa có inbound webhook consumer |
| SYNC-T03 Out-of-order version | NEED-BACKEND | Chưa có server apply/version gate |
| SYNC-T04 Last-item race | PASS local | Hai `createSale` đồng thời trên available=1: 1 success, 1 reject, 1 Sale, 1 movement, tồn cuối 0; reserve Order race cũng 1 success/1 reject |
| SYNC-T05 Offline retry | PASS local foundation | Mock API thật: fail → ERROR/queue giữ nguyên → retry cùng operation_id và Idempotency-Key → SYNCED; movement không tăng, history không bị xóa |
| SYNC-T06 Partial transfer receipt | NEED-CONTRACT | Local mới hỗ trợ receive toàn bộ |
| SYNC-T07 Cancel after reserve | PASS local | Product reserve/release đúng; Service không movement |
| SYNC-T08 Damaged return | NEED-CONTRACT | Chưa có Return/DAMAGE operation |
| DB v6 → v8 migration | PASS | DB populated đủ stores → v8, metadata backfill không mất record |
| Fresh install v8 / reopen v8 | PASS | Dedicated test DB mở mới ở v8 và reopen giữ dữ liệu |
| Destructive harness guard | PASS | `clearAll()` chỉ chạy origin `127.0.0.1:4192` + DB `qbiz_kho_sync_test`; app origin 4180 bị từ chối |
| Main app smoke | PASS | Dashboard mở, console errors = 0 |

Syntax check:

```text
node --check src/db.js
node --check src/engine.js
node --check src/sync.js
node --check src/config.js
```

Syntax checks PASS.

Atomicity classification:

- `INVENTORY_HELPER_LOCAL_ATOMIC = PASS`: helper/transfer local đọc–validate–ghi trong transaction.
- `SALE_LOCAL_ATOMIC = PASS`: `createSale` đọc/validate tất cả level trong transaction cùng Sale/movement/outbox; race available=1 đã kiểm chứng.
- `ORDER_LOCAL_ATOMIC = PASS`: reserve/release/complete của Order đọc/validate tất cả level trong transaction cùng Order/movement/outbox; reserve race đã kiểm chứng.
- `PRODUCTION_MULTI_DEVICE_ATOMIC = NEED_BACKEND`: chưa có backend lock/transaction cho nhiều thiết bị.

## REMAINING BACKEND WORK

- Chốt Action API và server transaction/lock cho reserve, issue, receive, transfer.
- Enforce tenant/permission, `shop_id + external_id`, SKU reconciliation và Product/Service/Category/Media ownership.
- Backend dedupe `operation_id`, `event_id`, `source_event_id`; reject stale/out-of-order `version`.
- Reconciliation sau reconnect; backend DB là source of truth, realtime chỉ báo thay đổi.
- Contract riêng cho partial transfer, Return/DAMAGE, COD/HĐĐT/split payment/cash-change.
- Không coi mocked flush local là kết nối QBiz production.

## READY_FOR_SYNC_01

`NO`

Lý do: local foundation đã sync-compatible cho outbound operation/outbox và các invariant local đã kiểm chứng, nhưng backend owner/mapping, inbound dedupe/version gate, partial transfer và damaged return contract vẫn chưa được chốt/triển khai. Chưa kết nối API QBiz thật.
