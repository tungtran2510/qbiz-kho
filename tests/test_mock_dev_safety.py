import sys
import json
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

APP_URL = "http://localhost:4180"

def test_mock_dev_safety():
    print("\n=======================================================")
    print("  QBIZ KHO AI — STRICT MOCK DEV CONDITION (A -> F)")
    print("=======================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(APP_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)

        results = page.evaluate("""async () => {
            const { routeIntent } = await import('/src/ai/router.js');
            const { setProviderConfig, getProviderConfig, AIProviderAdapter, PROVIDER_MODES } = await import('/src/ai/providers.js');
            const state = window.__qbiz_app__?.state || {};

            const out = {
                testA_production_no_provider: null,
                testB_production_session_bypass: null,
                testC_production_global_flag_bypass: null,
                testD_test_env_no_mock_flag: null,
                testE_test_env_explicit_mock_flag: null,
                testF_invalid_gemini_key: null,
                tier0_deterministic_check: null,
            };

            // Helper to clean environment
            const resetAll = () => {
                delete window.__QBIZ_ENVIRONMENT__;
                delete window.__QBIZ_ENV__;
                delete window.__QBIZ_TEST_ENVIRONMENT__;
                delete window.__QBIZ_ALLOW_MOCK_DEV__;
                delete window.__QBIZ_EXPLICIT_MOCK_FLAG__;
                sessionStorage.clear();
                setProviderConfig({
                    mode: PROVIDER_MODES.DETERMINISTIC,
                    allowMockDev: false,
                    geminiKey: '',
                    openaiKey: ''
                });
            };

            // TIER 0 CHECK: Tier 0 deterministic remains functional in all cases
            resetAll();
            const tier0Res = await routeIntent('Còn bao nhiêu ghế 135?', { current_route: 'products' }, state);
            out.tier0_deterministic_check = {
                tier: tier0Res.tier,
                provider: tier0Res.provider,
                hasProduct: Boolean(tier0Res.product),
                text: tier0Res.text
            };

            // TEST A: Production + no provider -> AI_PROVIDER_NOT_CONFIGURED
            resetAll();
            window.__QBIZ_ENVIRONMENT__ = 'production';
            const resA = await routeIntent('Thời tiết hôm nay thế nào?', { current_route: 'dashboard' }, state);
            out.testA_production_no_provider = {
                status: resA.status,
                tier: resA.tier,
                provider: resA.provider,
                isMockGenerated: resA.text.includes('[MOCK_DEV]') || resA.provider === 'MOCK_DEV',
                text: resA.text
            };

            // TEST B: Production + manually inject sessionStorage allowMockDev=true -> AI_PROVIDER_NOT_CONFIGURED (DENY)
            resetAll();
            window.__QBIZ_ENVIRONMENT__ = 'production';
            sessionStorage.setItem('qbiz_allow_mock_dev', 'true');
            sessionStorage.setItem('qbiz_ai_provider_mode', 'MOCK_DEV');
            setProviderConfig({ mode: PROVIDER_MODES.MOCK_DEV });
            const resB = await routeIntent('Thời tiết hôm nay thế nào?', { current_route: 'dashboard' }, state);
            out.testB_production_session_bypass = {
                status: resB.status,
                tier: resB.tier,
                isMockGenerated: resB.text.includes('[MOCK_DEV]') || resB.provider === 'MOCK_DEV',
                denied: resB.status === 'AI_PROVIDER_NOT_CONFIGURED' && !resB.text.includes('[MOCK_DEV]')
            };

            // TEST C: Production + manually inject __QBIZ_ALLOW_MOCK_DEV__=true -> AI_PROVIDER_NOT_CONFIGURED (DENY)
            resetAll();
            window.__QBIZ_ENVIRONMENT__ = 'production';
            window.__QBIZ_ALLOW_MOCK_DEV__ = true;
            setProviderConfig({ mode: PROVIDER_MODES.MOCK_DEV });
            const resC = await routeIntent('Thời tiết hôm nay thế nào?', { current_route: 'dashboard' }, state);
            out.testC_production_global_flag_bypass = {
                status: resC.status,
                tier: resC.tier,
                isMockGenerated: resC.text.includes('[MOCK_DEV]') || resC.provider === 'MOCK_DEV',
                denied: resC.status === 'AI_PROVIDER_NOT_CONFIGURED' && !resC.text.includes('[MOCK_DEV]')
            };

            // TEST D: Test environment + no mock flag -> MOCK DENIED
            resetAll();
            window.__QBIZ_ENVIRONMENT__ = 'test';
            let testDRejected = false;
            let testDError = '';
            try {
                const adapterD = new AIProviderAdapter({ mode: PROVIDER_MODES.MOCK_DEV, allowMockDev: false });
                adapterD.config.allowMockDev = false;
                await adapterD.parseStructuredIntent({
                    prompt: 'Nhập thêm 10 chai nước',
                    context: {},
                    state
                });
            } catch (err) {
                testDRejected = true;
                testDError = err.message;
            }
            out.testD_test_env_no_mock_flag = {
                rejected: testDRejected,
                error: testDError,
                isMockDenied: testDRejected && testDError.includes('AI_PROVIDER_NOT_CONFIGURED')
            };

            // TEST E: Test environment + explicit mock flag -> MOCK ALLOWED
            resetAll();
            window.__QBIZ_ENVIRONMENT__ = 'test';
            let testEAllowed = false;
            let testEStructured = null;
            try {
                const adapterE = new AIProviderAdapter({ mode: PROVIDER_MODES.MOCK_DEV, allowMockDev: true });
                testEStructured = await adapterE.parseStructuredIntent({
                    prompt: 'Nhập thêm 10 gối F1 vào kho chính',
                    context: {},
                    state
                });
                testEAllowed = (testEStructured && testEStructured.provider === 'MOCK_DEV' && testEStructured.intent === 'RECEIVE_STOCK');
            } catch (err) {
                testEAllowed = false;
            }
            out.testE_test_env_explicit_mock_flag = {
                allowed: testEAllowed,
                intent: testEStructured?.intent,
                provider: testEStructured?.provider
            };

            // TEST F: Invalid Gemini key -> real provider error -> NO MOCK FALLBACK
            resetAll();
            window.__QBIZ_ENVIRONMENT__ = 'test';
            setProviderConfig({ mode: PROVIDER_MODES.GEMINI, geminiKey: 'AIzaSyFakeInvalidKeyForRealityCheck' });
            let testFSurfacedRealError = false;
            let testFResult = null;
            try {
                const adapterF = new AIProviderAdapter({ mode: PROVIDER_MODES.GEMINI, geminiKey: 'AIzaSyFakeInvalidKeyForRealityCheck' });
                await adapterF.parseStructuredIntent({
                    prompt: 'Còn bao nhiêu ghế 135 trong kho chính?',
                    context: {},
                    state
                });
            } catch (err) {
                testFSurfacedRealError = err.message.includes('PROVIDER_HTTP_ERROR') || err.message.includes('Gemini 400') || err.message.includes('API_KEY_INVALID');
                testFResult = err.message;
            }
            out.testF_invalid_gemini_key = {
                surfacedRealError: testFSurfacedRealError,
                error: testFResult,
                noMockFallback: testFSurfacedRealError && !String(testFResult).includes('mock-dev')
            };

            return out;
        }""")

        browser.close()

        print(json.dumps(results, indent=2, ensure_ascii=False))

        # Assertions
        assert results["tier0_deterministic_check"]["hasProduct"] == True, "Tier 0 check failed"
        print("[PASS] Tier 0 deterministic check: tools work as expected")

        assert results["testA_production_no_provider"]["status"] == "AI_PROVIDER_NOT_CONFIGURED", "Test A failed"
        assert results["testA_production_no_provider"]["isMockGenerated"] == False, "Test A failed"
        print("[PASS] Test A: Production + no provider -> AI_PROVIDER_NOT_CONFIGURED (No mock)")

        assert results["testB_production_session_bypass"]["denied"] == True, "Test B failed"
        print("[PASS] Test B: Production + sessionStorage allowMockDev=true -> AI_PROVIDER_NOT_CONFIGURED (Mock Denied)")

        assert results["testC_production_global_flag_bypass"]["denied"] == True, "Test C failed"
        print("[PASS] Test C: Production + global mock flag -> AI_PROVIDER_NOT_CONFIGURED (Mock Denied)")

        assert results["testD_test_env_no_mock_flag"]["isMockDenied"] == True, "Test D failed"
        print("[PASS] Test D: Test environment + no mock flag -> MOCK DENIED")

        assert results["testE_test_env_explicit_mock_flag"]["allowed"] == True, "Test E failed"
        print("[PASS] Test E: Test environment + explicit mock flag -> MOCK ALLOWED")

        assert results["testF_invalid_gemini_key"]["noMockFallback"] == True, "Test F failed"
        print("[PASS] Test F: Invalid Gemini key -> Real provider error (NO MOCK FALLBACK)")

        print("\n>>> ALL TESTS A -> F PASSED CLEANLY! <<<\n")

if __name__ == "__main__":
    test_mock_dev_safety()
