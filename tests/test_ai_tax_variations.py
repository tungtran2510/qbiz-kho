import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_tax_variations_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
        page.evaluate("() => window.__qbiz_app__.previewDemo('fashion')")

        test_cases = [
            # 1. Nhóm Sàn TMĐT (Shopee, TikTok, Lazada, NĐ 91)
            ("ban shopee co phai nop thue khong", "TAX_ECOMMERCE_POLICY", ["Nghị định 91/2022/NĐ-CP", "khấu trừ", "trùng thuế"]),
            ("Ban tren shopee voi tiktok thi thue tinh sao", "TAX_ECOMMERCE_POLICY", ["Shopee", "TikTok Shop", "khấu trừ"]),
            ("don hang shopee co bi tinh trung thue ko", "TAX_ECOMMERCE_POLICY", ["trùng thuế", "loại trừ"]),
            ("Don lazada co tinh thue k", "TAX_ECOMMERCE_POLICY", ["Lazada", "sàn TMĐT"]),
            ("ban hang tiktok shop co phai dong thue ko bot", "TAX_ECOMMERCE_POLICY", ["TikTok Shop", "Nghị định 91"]),
            ("Nghi dinh 91 quy dinh ve thue san the nao", "TAX_ECOMMERCE_POLICY", ["Nghị định 91", "khấu trừ thuế"]),
            ("tai sao doanh thu shopee lai duoc tru ra tren bao cao thue", "TAX_ECOMMERCE_POLICY", ["Shopee", "loại trừ"]),
            ("ban hang online co phai nop thue khong", "TAX_ECOMMERCE_POLICY", ["sàn TMĐT", "trực tiếp"]),

            # 2. Nhóm Biểu thuế Hộ kinh doanh theo Thông tư 40/2021
            ("Ho kinh doanh ban le nop bao nhieu phan tram thue", "TAX_HKD_RATES", ["1.5%", "1.0%", "0.5%"]),
            ("ban tap hoa nop thue may %", "TAX_HKD_RATES", ["1.5%", "GTGT", "TNCN"]),
            ("shop thoi trang quan ao nop thue bao nhieu phan tram", "TAX_HKD_RATES", ["1.5%", "Bán buôn, bán lẻ"]),
            ("kinh doanh an uong nha hang thi thue suat the nao", "TAX_HKD_RATES", ["4.5%", "3.0%", "1.5%"]),
            ("mo quan cafe quan an nop thue bao nhieu", "TAX_HKD_RATES", ["4.5%", "ăn uống"]),
            ("dich vu sua chua cat toc spa nop thue bao nhieu %", "TAX_HKD_RATES", ["7.0%", "5.0%", "2.0%"]),
            ("bieu thue theo thong tu 40 2021 la bao nhieu", "TAX_HKD_RATES", ["Thông tư 40/2021/TT-BTC", "1.5%", "4.5%", "7.0%"]),
            ("thue ho kinh doanh gom nhung thue gi", "TAX_HKD_RATES", ["Thuế GTGT", "Thuế TNCN"]),
            ("thue vat cua shop quan ao la bao nhieu", "TAX_HKD_RATES", ["1.0%", "GTGT"]),
            ("thue tncn ho kinh doanh tinh nhu the nao", "TAX_HKD_RATES", ["TNCN", "0.5%"]),
            ("ban my pham nop thue bao nhieu %", "TAX_HKD_RATES", ["1.5%"]),
            ("mo quan bun pho dong thue the nao", "TAX_HKD_RATES", ["4.5%"]),
            ("tiem toc goi dau spa tinh thue bao nhieu", "TAX_HKD_RATES", ["7.0%"]),

            # 3. Nhóm Ngưỡng miễn thuế 100 triệu VNĐ/năm
            ("Doanh thu duoi 100 trieu co phai nop thue khong", "TAX_EXEMPTION_THRESHOLD", ["100 triệu", "KHÔNG PHẢI nộp thuế"]),
            ("Ban duoi 100 cu mot nam co can dong thue ko", "TAX_EXEMPTION_THRESHOLD", ["100 triệu", "Điều 4 Thông tư 40/2021"]),
            ("shop moi mo ban e nam nay chua toi 100 trieu thi thue tinh sao", "TAX_EXEMPTION_THRESHOLD", ["100 triệu", "Miễn thuế"]),
            ("doanh thu bao nhieu mot nam thi bat dau phai nop thue", "TAX_EXEMPTION_THRESHOLD", ["100 triệu"]),
            ("nam nay ban chua duoc 100 cu co can dong thue khong", "TAX_EXEMPTION_THRESHOLD", ["100 triệu"]),
            ("moi mo tiem chua toi 100tr co phai nop thue ko", "TAX_EXEMPTION_THRESHOLD", ["100 triệu"]),

            # 4. Nhóm Cài đặt và cấu hình thuế trên phần mềm QBiz
            ("cai dat thue o dau", "TAX_SETTINGS_GUIDE", ["Báo cáo", "Cài đặt thuế"]),
            ("lam sao de cau hinh thue cho shop", "TAX_SETTINGS_GUIDE", ["Cài đặt thuế", "Mô hình kinh doanh"]),
            ("chinh ty le thue sang ho kinh doanh 1.5% o cho nao", "TAX_SETTINGS_GUIDE", ["Cài đặt thuế", "Bán lẻ (1.5%)"]),
            ("bat tu dong mien thue don san shopee o dau", "TAX_SETTINGS_GUIDE", ["Cài đặt thuế", "Sàn TMĐT"]),
            ("nhap ma so thue mst cua shop o dau", "TAX_SETTINGS_GUIDE", ["Mã số thuế", "Cài đặt thuế"]),

            # 5. Nhóm Hóa đơn điện tử & Xuất hóa đơn VAT (Nghị định 123 / Thông tư 78)
            ("xuat hoa don dien tu cho don vua ban", "INVOICE_GUIDE_AND_POLICY", ["Hóa đơn điện tử", "Nghị định 123", "Mã số thuế"]),
            ("lam sao xuat hoa don vat", "INVOICE_GUIDE_AND_POLICY", ["Hóa đơn điện tử", "VAT"]),
            ("huong dan xuat hoa don do", "INVOICE_GUIDE_AND_POLICY", ["Hóa đơn", "công ty"]),
            ("muon xuat hoa don cho cong ty thi lam the nao", "INVOICE_GUIDE_AND_POLICY", ["Mã số thuế", "Tên đơn vị"]),
            ("hoa don dien tu tren app lam o dau", "INVOICE_GUIDE_AND_POLICY", ["Hóa đơn điện tử", "Phiếu bán hàng"]),

            # 6. Nhóm Giải thích Mối quan hệ Doanh thu - Giá vốn - Thuế - Lợi nhuận (Tại sao thuế và lợi nhuận)
            ("tai sao loi nhuan sau thue lai thap hon loi nhuan gop", "TAX_PROFIT_EXPLANATION", ["Lợi nhuận gộp", "Lợi nhuận thực sau thuế", "nghĩa vụ thuế"]),
            ("cong thuc tinh loi nhuan sau thue la gi", "TAX_PROFIT_EXPLANATION", ["Lợi nhuận gộp − Thuế"]),
            ("tai sao thue lai tru vao loi nhuan", "TAX_PROFIT_EXPLANATION", ["Lợi nhuận thực sau thuế", "bỏ túi an toàn"]),
            ("thue anh huong the nao den loi nhuan cua shop", "TAX_PROFIT_EXPLANATION", ["Lợi nhuận gộp", "Thuế"]),
            ("sao doanh thu cao ma loi nhuan sau thue lai nhu vay", "TAX_PROFIT_EXPLANATION", ["giá vốn", "thuế"]),
            ("doanh thu gia von thue va loi nhuan lien quan voi nhau the nao", "TAX_PROFIT_EXPLANATION", ["Doanh thu thuần", "Giá vốn", "Lợi nhuận gộp"]),

            # 7. Nhóm Tính toán thuế & Ra lệnh Báo cáo thuế thực tế (Live Query)
            ("Thang nay shop phai nop bao nhieu thue", "TAX_CALCULATION_AND_PROFIT", ["tháng này", "Thuế ước tính", "Doanh thu"]),
            ("Tinh tien thue thang nay cho toi", "TAX_CALCULATION_AND_PROFIT", ["tháng này", "Doanh thu ngoài sàn"]),
            ("tinh gium tien thue thang nay", "TAX_CALCULATION_AND_PROFIT", ["tháng này", "Thuế ước tính"]),
            ("hom nay thue het bao nhieu", "TAX_CALCULATION_AND_PROFIT", ["hôm nay", "Thuế ước tính"]),
            ("Loi nhuan sau thue cua cua hang thang nay la bao nhieu", "TAX_CALCULATION_AND_PROFIT", ["Lợi nhuận thực sau thuế", "tháng này"]),
            ("lai sau thue thang nay the nao", "TAX_CALCULATION_AND_PROFIT", ["Lợi nhuận thực sau thuế"]),
            ("thang nay lai sau thue bao nhieu", "TAX_CALCULATION_AND_PROFIT", ["Lợi nhuận thực sau thuế"]),
            ("shop lai duoc bao nhieu sau khi tru thue thang nay", "TAX_CALCULATION_AND_PROFIT", ["Lợi nhuận thực sau thuế"]),
            ("doanh thu ngoai san chiu thue thang nay la bao nhieu", "TAX_CALCULATION_AND_PROFIT", ["Doanh thu ngoài sàn chịu thuế"]),
            ("bao cao thue thang nay", "TAX_CALCULATION_AND_PROFIT", ["tháng này", "Đối soát Thuế & Lợi nhuận"]),
            ("cho xem bao cao thue", "TAX_CALCULATION_AND_PROFIT", ["Đối soát Thuế & Lợi nhuận"]),
            ("mo bao cao thue", "TAX_CALCULATION_AND_PROFIT", ["Đối soát Thuế & Lợi nhuận"]),
            ("xem nghia vu thue", "TAX_CALCULATION_AND_PROFIT", ["Đối soát Thuế & Lợi nhuận"]),
            ("tong hop thue thang nay", "TAX_CALCULATION_AND_PROFIT", ["Đối soát Thuế & Lợi nhuận"]),

            # 8. Nhóm Doanh nghiệp / Công ty
            ("cong ty phuong phap khau tru nop thue the nao", "TAX_COMPANY_POLICY", ["Phương pháp Khấu trừ", "20%"]),
            ("thue tndn tinh bao nhieu phan tram", "TAX_COMPANY_POLICY", ["20%", "TNDN"]),
            ("doanh nghiep dong thue tndn bao nhieu %", "TAX_COMPANY_POLICY", ["20%"]),

            # 9. Nhóm Tổng quan thuế
            ("thue mon bai nop bao nhieu", "TAX_GENERAL_OVERVIEW", ["môn bài"]),
            ("thue ma dao nay the nao", "TAX_GENERAL_OVERVIEW", ["Lệ phí môn bài", "Thuế GTGT"]),

            # 10. Nhóm Xuất file bảng kê thuế TT88
            ("xuat bang ke thue thong tu 88", "EXPORT_REPORT", [".csv"]),
            ("tai file bang ke thue s2b", "EXPORT_REPORT", [".csv"]),
        ]

        print(f"{'QUERY':<44} | {'EXPECTED INTENT':<25} | {'ACTUAL':<25} | {'STATUS':<7} | KEYWORDS")
        print("-" * 135)

        passed = 0
        failed = 0

        for q, expected_intent, expected_keywords in test_cases:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => ({
                    tier: r.tier,
                    intent: r.intent,
                    text: r.text || ''
                }));
            }''', q)

            actual_intent = res.get('intent')
            actual_text = res.get('text', '')

            intent_ok = (actual_intent == expected_intent)
            missing_keywords = [kw for kw in expected_keywords if kw.lower() not in actual_text.lower()]
            keywords_ok = (len(missing_keywords) == 0)

            is_ok = intent_ok and keywords_ok

            if is_ok:
                passed += 1
                status = "PASS"
            else:
                failed += 1
                status = "FAIL"

            kw_note = "OK" if keywords_ok else f"Missing: {missing_keywords}"
            print(f"{q[:42]:<44} | {expected_intent:<25} | {actual_intent:<25} | {status:<7} | {kw_note}")

        print("-" * 135)
        print(f"TOTAL: {len(test_cases)} | PASSED: {passed} | FAILED: {failed} | SUCCESS RATE: {(passed/len(test_cases))*100:.1f}%")

        browser.close()

        if failed > 0:
            sys.exit(1)
        else:
            print("ALL 58 AI TAX VARIATIONS TESTS PASSED 100%!")

if __name__ == '__main__':
    run_tax_variations_test()
