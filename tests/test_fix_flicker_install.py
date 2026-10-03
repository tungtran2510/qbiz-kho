# -*- coding: utf-8 -*-
import sys, time
from playwright.sync_api import sync_playwright
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

URL = "http://127.0.0.1:4180"
OBS = """
() => { window.__mut=[]; const t0=performance.now();
 new MutationObserver(l=>{ if(l.some(m=>m.type==='childList'&&['content','desktopNav','mobileNav','topActions'].includes(m.target.id))) window.__mut.push(Math.round(performance.now()-t0)); })
 .observe(document.body,{childList:true,subtree:true}); }
"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    page.add_init_script("window.addEventListener('DOMContentLoaded',()=>{(" + OBS.strip() + ")()})")
    page.goto(URL)
    page.wait_for_selector("#pageTitle", timeout=15000)
    time.sleep(6)
    n = page.evaluate("() => window.__mut.length")
    print("re-renders in 6s after boot:", n)
    assert n <= 8, f"Still flickering: {n} re-renders"

    # Install button: with a (simulated) native prompt event -> must call prompt(), NOT open the guide modal
    page.evaluate("""() => {
      window.__promptCalled = false;
      const ev = new Event('beforeinstallprompt');
      ev.prompt = () => { window.__promptCalled = true; return Promise.resolve(); };
      ev.userChoice = Promise.resolve({outcome:'dismissed'});
      window.dispatchEvent(ev);
    }""")
    page.wait_for_selector('.entry-install-link', timeout=5000)
    page.click('.entry-install-link')
    time.sleep(0.8)
    called = page.evaluate("() => window.__promptCalled")
    modal = page.evaluate("() => !!document.querySelector('#modalRoot .modal')")
    print("native prompt called:", called, "| guide modal opened:", modal)
    assert called and not modal, "Install button must trigger native prompt directly"

    # Fallback: no prompt available -> guide modal opens
    page2 = ctx.new_page()
    page2.goto(URL); page2.wait_for_selector("#pageTitle", timeout=15000)
    page2.wait_for_selector('.entry-install-link', timeout=5000)
    page2.click('.entry-install-link')
    time.sleep(0.6)
    print("fallback modal when no prompt:", page2.evaluate("() => !!document.querySelector('#modalRoot .modal')"))

    # Installability check from Chrome itself
    cdp = ctx.new_cdp_session(page2)
    try:
        r = cdp.send("Page.getInstallabilityErrors")
        print("installability errors:", r.get("installabilityErrors"))
    except Exception as e:
        print("installability check unavailable:", e)
    print("TEST_FIX_FLICKER_INSTALL: PASS")
    b.close()


