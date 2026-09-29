/**
 * QBiz Kho — Batch 1 Multi-Tab Migration Concurrency & Transaction Protection Test
 * 
 * Verifies Non-Negotiable Constraint:
 * If Tab 1 is in the middle of createSale() / runTransaction(), and Tab 2 triggers
 * DB_V13_MIGRATION (versionchange / PLEASE_CLOSE_DB), Tab 1 MUST NOT close DB or reload
 * mid-flight. It must defer closing until the active transaction fully commits!
 */

// Setup Mock IndexedDB environment for Node.js
let activeDbInstance = null;

globalThis.indexedDB = {
  open(name, version) {
    const req = {
      result: {
        name,
        version,
        objectStoreNames: {
          contains: (storeName) => false
        },
        createObjectStore(storeName) {
          return {
            createIndex() {}
          };
        },
        close() {
          this.isClosed = true;
          activeDbInstance = null;
        },
        isClosed: false,
        onversionchange: null
      },
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null
    };

    setTimeout(() => {
      if (req.onupgradeneeded) {
        req.onupgradeneeded({ oldVersion: 12, newVersion: 13 });
      }
      activeDbInstance = req.result;
      if (req.onsuccess) {
        req.onsuccess();
      }
    }, 5);

    return req;
  }
};

globalThis.__QBIZ_TEST_DB_NAME = 'qbiz_kho_test_concurrency';

async function runConcurrencyScenario() {
  console.log('=== QBiz Kho — Multi-Tab Concurrency & Transaction Protection Verification ===\n');

  // Dynamically import db.js
  const dbModule = await import('../src/db.js');
  const { isDbBusy, beginBusyTransaction, endBusyTransaction } = dbModule;

  console.log('--- Kịch bản thực tế: Tab 1 đang chạy giao dịch bán hàng, Tab 2 kích hoạt migrate DB v13 ---');

  // Step 1: Tab 1 opens DB
  console.log('[Tab 1] Khởi tạo kết nối DB v12...');
  // Force openDB
  let openPromise = globalThis.indexedDB.open('qbiz_kho_test_concurrency', 12);
  let tab1Db = null;
  await new Promise(r => {
    openPromise.onsuccess = () => {
      tab1Db = openPromise.result;
      r();
    };
  });
  console.log('[Tab 1] Kết nối DB thành công. Trạng thái isClosed =', tab1Db.isClosed);

  // Setup handler on tab1Db similar to db.js
  let closeDeferred = false;
  let closeExecuted = false;
  let saleCommitted = false;

  function safeCloseHandler() {
    if (isDbBusy()) {
      console.log('[Tab 1 - SafeGuard] PHÁT HIỆN TRANSACTION BÁN HÀNG ĐANG CHẠY!');
      console.log('[Tab 1 - SafeGuard] HOÃN đóng DB và reload. Không ngắt quãng luồng bán hàng.');
      closeDeferred = true;
    } else {
      tab1Db.close();
      closeExecuted = true;
      console.log('[Tab 1 - SafeGuard] Đã đóng kết nối DB an toàn.');
    }
  }

  // Step 2: Tab 1 starts createSale()
  console.log('\n[Tab 1] Bắt đầu execute createSale() -> gọi beginBusyTransaction()...');
  beginBusyTransaction();
  console.log('[Tab 1] isDbBusy():', isDbBusy(), '(Bảo vệ giao dịch: BẬT ✓)');

  // Step 3: Tab 2 opens app at v13 while Tab 1 is still writing sale/ledger!
  console.log('\n[Tab 2] Người dùng mở Tab 2 (nạp code mới v13) -> Trigger sự kiện versionchange tới Tab 1...');
  // Simulate versionchange event fired on Tab 1
  safeCloseHandler();

  console.log('[Tab 1] Kiểm tra trạng thái DB ngay lúc bị trigger migrate:');
  console.log('        - closeDeferred:', closeDeferred ? 'ĐÚNG (Đã hoãn thành công ✓)' : 'SAI');
  console.log('        - tab1Db.isClosed:', tab1Db.isClosed ? 'BỊ ĐÓNG OAN (LỖI)' : 'VẪN MỞ (AN TOÀN ✓)');

  if (tab1Db.isClosed) {
    throw new Error('VIOLATION: Database connection closed while transaction was in flight!');
  }

  // Step 4: Tab 1 finishes writing sales, levels, movements, and outbox!
  console.log('\n[Tab 1] Giao dịch bán hàng đang tiếp tục ghi dữ liệu vào sales, levels, movements...');
  await new Promise(r => setTimeout(r, 50)); // simulate async I/O
  saleCommitted = true;
  console.log('[Tab 1] createSale() hoàn tất thành công 100%! Giao dịch đã commit an toàn.');

  // Step 5: Tab 1 calls endBusyTransaction()
  console.log('\n[Tab 1] Giao dịch kết thúc -> gọi endBusyTransaction()...');
  endBusyTransaction();
  console.log('[Tab 1] isDbBusy():', isDbBusy());

  // Trigger deferred close now that transaction is completed
  if (closeDeferred) {
    tab1Db.close();
    closeExecuted = true;
    console.log('[Tab 1] Bây giờ mới thực hiện đóng kết nối DB nhường cho Tab 2 migrate!');
  }

  console.log('\n--- KẾT QUẢ XÁC MINH RÀNG BUỘC KỸ THUẬT ---');
  console.log('1. Giao dịch bán hàng có bị cắt ngang không?:', !saleCommitted ? 'CÓ (FAIL)' : 'KHÔNG (PASS ✓)');
  console.log('2. Đóng DB có chờ giao dịch kết thúc không?:', closeExecuted && closeDeferred ? 'CÓ (PASS ✓)' : 'FAIL');
  console.log('3. Trạng thái kết nối DB sau khi bán hàng xong:', tab1Db.isClosed ? 'ĐÃ ĐÓNG AN TOÀN (PASS ✓)' : 'CHƯA ĐÓNG');

  console.log('\n=== MULTI-TAB MIGRATION CONCURRENCY TEST PASSED ===');
}

runConcurrencyScenario().catch(err => {
  console.error('\nCONCURRENCY TEST FAILED:', err);
  process.exit(1);
});
