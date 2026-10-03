import os
from PIL import Image
from playwright.sync_api import sync_playwright

SVG_MASTER = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Deep Midnight Sapphire Base Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071120" />
      <stop offset="45%" stop-color="#0f224a" />
      <stop offset="100%" stop-color="#050a14" />
    </linearGradient>

    <!-- Top Left Ambient Light Glow -->
    <radialGradient id="ambientLight" cx="22%" cy="18%" r="65%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.36" />
      <stop offset="45%" stop-color="#1d4ed8" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#071120" stop-opacity="0" />
    </radialGradient>

    <!-- 3D Cube Top Face (Perspective Sky Blue / Electric Cyan) -->
    <linearGradient id="cubeTop" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <!-- 3D Cube Left Face (Deep Cobalt Warehouse Storage) -->
    <linearGradient id="cubeLeft" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e40af" />
      <stop offset="100%" stop-color="#0d1b3e" />
    </linearGradient>

    <!-- 3D Cube Right Face (Ultramarine Retail Sales & Growth) -->
    <linearGradient id="cubeRight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#172e6b" />
    </linearGradient>

    <!-- Luminous Q Orbital Ring Gradient -->
    <linearGradient id="qRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="85%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>

    <!-- Golden Accent Gradient (Revenue, Prosperity, Verified) -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="35%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>

    <!-- Shadow & Glow Filters -->
    <filter id="hubShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0284c7" flood-opacity="0.32" />
      <feDropShadow dx="0" dy="32" stdDeviation="32" flood-color="#000000" flood-opacity="0.7" />
    </filter>

    <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#f59e0b" flood-opacity="0.8" />
    </filter>

    <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="7" flood-color="#38bdf8" flood-opacity="0.7" />
    </filter>
  </defs>

  <!-- App Rounded Squircle Container -->
  <rect width="512" height="512" rx="116" ry="116" fill="url(#bgGrad)" />
  <rect width="512" height="512" rx="116" ry="116" fill="url(#ambientLight)" />

  <!-- Premium Subtle Bevel Rim Light -->
  <rect x="3.5" y="3.5" width="505" height="505" rx="113" ry="113" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-opacity="0.25" />

  <!-- MAIN 3D EMBLEM GROUP -->
  <g filter="url(#hubShadow)">

    <!-- LUMINOUS "Q" ORBITAL MONOGRAM RING -->
    <!-- The outer ring of the Q wraps dynamically around the 3D warehouse cube -->
    <path d="M 125,230 C 125,125 198,72 272,72 C 362,72 422,132 422,230 C 422,282 396,330 352,360" 
          fill="none" stroke="url(#qRingGrad)" stroke-width="13" stroke-linecap="round" filter="url(#cyanGlow)" />
    
    <path d="M 125,230 C 125,328 185,386 268,386 C 304,386 338,374 362,352" 
          fill="none" stroke="url(#qRingGrad)" stroke-width="13" stroke-linecap="round" filter="url(#cyanGlow)" />

    <!-- THE DYNAMIC "Q" TAIL: Sleek Golden Ribbon extending outward like an arrow -->
    <path d="M 334,332 L 396,394 C 405,403 420,398 422,386 L 424,352" 
          fill="none" stroke="url(#goldGrad)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" filter="url(#goldGlow)" />
    <polygon points="418,340 436,364 406,364" fill="url(#goldGrad)" filter="url(#goldGlow)" />

    <!-- 3D ISOMETRIC WAREHOUSE & SALES CUBE -->
    <!-- Top Face (Warehouse Roof / POS Checkout Surface) -->
    <polygon points="256,118 382,188 256,258 130,188" fill="url(#cubeTop)" />
    
    <!-- Left Face (Warehouse Inventory Storage) -->
    <polygon points="130,188 256,258 256,400 130,330" fill="url(#cubeLeft)" />
    
    <!-- Right Face (Retail Sales Fulfillment) -->
    <polygon points="256,258 382,188 382,330 256,400" fill="url(#cubeRight)" />

    <!-- Isometric Highlight Edges for Crystal-Clear Depth -->
    <polyline points="130,188 256,258 382,188" fill="none" stroke="#e0f2fe" stroke-width="2.5" stroke-opacity="0.65" />
    <line x1="256" y1="258" x2="256" y2="400" stroke="#38bdf8" stroke-width="2.5" stroke-opacity="0.45" />

    <!-- LEFT FACE: Organized Warehouse Storage Racks & Tiers -->
    <line x1="152" y1="230" x2="236" y2="276" stroke="#60a5fa" stroke-width="5" stroke-linecap="round" stroke-opacity="0.65" />
    <line x1="152" y1="266" x2="236" y2="312" stroke="#60a5fa" stroke-width="5" stroke-linecap="round" stroke-opacity="0.65" />
    <line x1="152" y1="302" x2="236" y2="348" stroke="#60a5fa" stroke-width="5" stroke-linecap="round" stroke-opacity="0.65" />

    <!-- Inventory Stock Pallets & Goods on Shelves -->
    <polygon points="164,246 186,258 186,271 164,259" fill="#93c5fd" opacity="0.9" />
    <polygon points="194,263 218,276 218,289 194,276" fill="#67e8f9" opacity="0.9" />
    <polygon points="164,282 196,300 196,313 164,295" fill="#60a5fa" opacity="0.85" />
    <polygon points="204,304 224,315 224,328 204,317" fill="#93c5fd" opacity="0.9" />

    <!-- TOP FACE: Crisp Retail POS Shopping Cart Emblem with Verified Gold Package -->
    <g transform="translate(256, 188) scale(1.05, 0.58) rotate(-45)">
      <!-- Cart Handle & Basket Frame -->
      <path d="M -50,-34 L -34,-34 L -12,20 L 40,20 L 55,-20 L -22,-20" 
            fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Cart Wheels -->
      <circle cx="-5" cy="38" r="9" fill="#ffffff" />
      <circle cx="36" cy="38" r="9" fill="#ffffff" />
      <!-- Golden Verified Package Inside Basket -->
      <path d="M -4,-2 L 10,12 L 34,-12" fill="none" stroke="url(#goldGrad)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#goldGlow)" />
    </g>

    <!-- RIGHT FACE: POS Sales Growth Trendline & Revenue Lightning -->
    <path d="M 276,346 L 316,306 L 336,322 L 366,268" 
          fill="none" stroke="url(#goldGrad)" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#goldGlow)" />
    <polygon points="368,256 368,276 348,270" fill="url(#goldGrad)" filter="url(#goldGlow)" />

    <!-- Sparkling Golden Star / Retail Excellence Beacon (Top Right) -->
    <g transform="translate(398, 120)" filter="url(#goldGlow)">
      <path d="M 0,-22 Q 0,0 22,0 Q 0,0 0,22 Q 0,0 -22,0 Q 0,0 0,-22 Z" fill="url(#goldGrad)" />
      <circle cx="0" cy="0" r="5" fill="#ffffff" />
    </g>

  </g>

  <!-- Bottom Brand Ribbon Badge: 'QBIZ · BÁN HÀNG & KHO' -->
  <g transform="translate(256, 452)">
    <rect x="-115" y="-19" width="230" height="38" rx="19" fill="#071120" fill-opacity="0.95" stroke="url(#qRingGrad)" stroke-width="1.8" />
    <text x="0" y="6" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="13.5" font-weight="900" letter-spacing="2.8">QBIZ · BÁN HÀNG &amp; KHO</text>
  </g>
</svg>'''

def generate_icons():
    os.makedirs('icons', exist_ok=True)
    svg_path = 'icons/logo-master.svg'
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(SVG_MASTER)
    print("[OK] Created master SVG: icons/logo-master.svg")

    # Render via Playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 512, 'height': 512}, device_scale_factor=1)
        
        # Load SVG
        page.set_content(f"""
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {{ margin: 0; padding: 0; background: transparent; overflow: hidden; }}
            svg {{ display: block; width: 100vw; height: 100vh; }}
          </style>
        </head>
        <body>
          {SVG_MASTER}
        </body>
        </html>
        """)
        page.wait_for_timeout(500)

        # 512x512 PNG
        png_512 = 'icons/icon-512.png'
        page.screenshot(path=png_512, omit_background=True)
        print(f"[OK] Rendered 512x512: {png_512}")

        # 192x192 PNG
        page.set_viewport_size({'width': 192, 'height': 192})
        page.wait_for_timeout(300)
        png_192 = 'icons/icon-192.png'
        page.screenshot(path=png_192, omit_background=True)
        print(f"[OK] Rendered 192x192: {png_192}")

        # Apple Touch Icon (180x180)
        page.set_viewport_size({'width': 180, 'height': 180})
        page.wait_for_timeout(300)
        png_apple = 'icons/apple-touch-icon.png'
        page.screenshot(path=png_apple, omit_background=True)
        print(f"[OK] Rendered Apple Touch Icon: {png_apple}")

        # Favicon 32x32
        page.set_viewport_size({'width': 32, 'height': 32})
        page.wait_for_timeout(300)
        png_fav = 'icons/favicon-32x32.png'
        page.screenshot(path=png_fav, omit_background=True)

        browser.close()

    # Generate multi-resolution favicon.ico via PIL
    img_512 = Image.open('icons/icon-512.png')
    img_512.save('favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("[OK] Generated multi-size favicon.ico")

    # Copy to evidence / artifact directory
    art_dir = 'C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424'
    if os.path.exists(art_dir):
        img_512.save(os.path.join(art_dir, 'evidence_new_app_logo_512.png'))
        print(f"[OK] Copied artifact to {art_dir}")

    print("\nALL ICONS SUCCESSFULLY GENERATED!\n")

if __name__ == '__main__':
    generate_icons()
