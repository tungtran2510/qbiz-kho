import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Script to generate a world-class, ultra-premium app icon for "QBiz Kho & Bán Hàng"
# Concept:
# - Apple iOS / macOS superellipse squircle with luxury sapphire cobalt gradient
# - Isometric 3D Masterpiece:
#   * Warehouse Storage Cube: precision bevels, tiered shelf bays (Kho hàng đa tầng)
#   * POS Retail Fusion: luminous shopping cart / checkout basket emblazoned on the top face
#   * Luminous "Q" Momentum Ring: elegant orbital band encircling the warehouse cube
#   * Golden Success Accent: glowing growth vector & verified status star
# - Zero cluttered text on the icon, absolute vector perfection at any size

SVG_CONTENT = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="40%" stop-color="#1e3a8a"/>
      <stop offset="85%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <radialGradient id="ambientGlow" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>
      <stop offset="50%" stop-color="#1d4ed8" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rimStroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="50%" stop-color="#93c5fd" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#1e40af" stop-opacity="0.6"/>
    </linearGradient>

    <!-- Cube Top Facet (Retail / POS Plane) -->
    <linearGradient id="topFacet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="50%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>

    <!-- Cube Left Facet (Warehouse Rack / Shelving Tier) -->
    <linearGradient id="leftFacet" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="60%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#0f2b5c"/>
    </linearGradient>

    <!-- Cube Right Facet (Growth & Analytics Plane) -->
    <linearGradient id="rightFacet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="50%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#172554"/>
    </linearGradient>

    <!-- Golden POS Cart & Success Ray -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="40%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>

    <!-- Cyan Neon Q-Orbit -->
    <linearGradient id="cyanOrbit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a5f3fc"/>
      <stop offset="45%" stop-color="#38bdf8"/>
      <stop offset="80%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>

    <!-- Drop Shadows -->
    <filter id="cubeShadow" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#050b14" flood-opacity="0.65"/>
    </filter>
    <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#f59e0b" flood-opacity="0.5"/>
    </filter>
    <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#38bdf8" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- 1. BASE CONTAINER: Apple iOS squircle (radius 112px on 512px canvas) -->
  <rect x="12" y="12" width="488" height="488" rx="112" ry="112" fill="url(#bgGrad)"/>
  <rect x="12" y="12" width="488" height="488" rx="112" ry="112" fill="url(#ambientGlow)"/>
  <rect x="12" y="12" width="488" height="488" rx="112" ry="112" fill="none" stroke="url(#rimStroke)" stroke-width="3"/>

  <!-- 2. BACKGROUND SUBTLE GRID ACCENT (Warehouse Logistics Coordinate Motif) -->
  <g opacity="0.08" stroke="#ffffff" stroke-width="1.5">
    <circle cx="256" cy="256" r="190" fill="none" stroke-dasharray="6 8"/>
    <circle cx="256" cy="256" r="140" fill="none"/>
    <line x1="256" y1="50" x2="256" y2="462" stroke-dasharray="4 6"/>
    <line x1="50" y1="256" x2="462" y2="256" stroke-dasharray="4 6"/>
  </g>

  <!-- 3. LUMINOUS "Q" ORBITAL RING (Back Arc) -->
  <path d="M 120 280 A 170 85 35 0 1 405 205" fill="none" stroke="url(#cyanOrbit)" stroke-width="8" stroke-linecap="round" opacity="0.5" filter="url(#cyanGlow)"/>

  <!-- 4. ISOMETRIC 3D WAREHOUSE & POS MASTER CUBE (Center (256, 258)) -->
  <g filter="url(#cubeShadow)">
    <!-- TOP FACET (Retail POS Checkout Deck) -->
    <!-- Center top vertex: (256, 138), Right vertex: (386, 206), Center vertex: (256, 274), Left vertex: (126, 206) -->
    <polygon points="256,138 386,206 256,274 126,206" fill="url(#topFacet)"/>
    <!-- Top facet inner highlight border -->
    <polygon points="256,142 380,206 256,270 132,206" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.6"/>

    <!-- LEFT FACET (Warehouse Storage Racks & Tiers) -->
    <!-- Left vertex: (126, 206), Center: (256, 274), Center bottom: (256, 400), Left bottom: (126, 332) -->
    <polygon points="126,206 256,274 256,400 126,332" fill="url(#leftFacet)"/>
    <polygon points="126,206 256,274 256,400 126,332" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>

    <!-- Warehouse Tier 1 (Storage Bays / Pallets) -->
    <g opacity="0.85">
      <!-- Shelf Tier 1 (Top) -->
      <polygon points="144,232 238,281 238,295 144,246" fill="#3b82f6" opacity="0.4"/>
      <rect x="156" y="240" width="28" height="14" rx="3" fill="#60a5fa" opacity="0.85" transform="skewY(27.5) scale(1, 0.88)"/>
      <rect x="194" y="220" width="28" height="14" rx="3" fill="#93c5fd" opacity="0.9" transform="skewY(27.5) scale(1, 0.88)"/>

      <!-- Shelf Divider Line -->
      <line x1="140" y1="262" x2="242" y2="315" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" opacity="0.6"/>

      <!-- Shelf Tier 2 (Bottom Storage Bays) -->
      <polygon points="144,292 238,341 238,355 144,306" fill="#1d4ed8" opacity="0.4"/>
      <rect x="156" y="296" width="30" height="15" rx="3" fill="#38bdf8" opacity="0.8" transform="skewY(27.5) scale(1, 0.88)"/>
      <rect x="196" y="275" width="28" height="15" rx="3" fill="#60a5fa" opacity="0.85" transform="skewY(27.5) scale(1, 0.88)"/>
    </g>

    <!-- RIGHT FACET (Analytics, Sales Growth & Cash Pulse) -->
    <!-- Center: (256, 274), Right: (386, 206), Right bottom: (386, 332), Center bottom: (256, 400) -->
    <polygon points="256,274 386,206 386,332 256,400" fill="url(#rightFacet)"/>
    <polygon points="256,274 386,206 386,332 256,400" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>

    <!-- Barcode / Digital POS Scanner Laser Beams on Right Facet -->
    <g opacity="0.75">
      <line x1="274" y1="288" x2="368" y2="238" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="14 6 8 4 12 5"/>
      <line x1="274" y1="305" x2="368" y2="255" stroke="#60a5fa" stroke-width="2" stroke-dasharray="6 8 16 4 10 6"/>
      <line x1="274" y1="322" x2="368" y2="272" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="10 5 12 6 8 4"/>
      <line x1="274" y1="339" x2="368" y2="289" stroke="#93c5fd" stroke-width="2" stroke-dasharray="8 6 10 5 14 6"/>
    </g>
  </g>

  <!-- 5. POS RETAIL EMBLEM ON TOP FACET (Pristine Golden Shopping Cart & Inventory Box) -->
  <g transform="translate(256, 206) scale(1.15)" filter="url(#goldGlow)">
    <!-- Isometric Top-Projected Modern Shopping Cart -->
    <!-- Cart Basket Outline -->
    <path d="M -38 -8 L -24 -8 L -10 16 L 24 16 L 36 -6 L -16 -6" fill="none" stroke="url(#goldGrad)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Cart Grid Lines -->
    <line x1="-15" y1="2" x2="28" y2="2" stroke="url(#goldGrad)" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="-5" y1="-6" x2="-2" y2="16" stroke="url(#goldGrad)" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="12" y1="-6" x2="10" y2="16" stroke="url(#goldGrad)" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Cart Wheels -->
    <circle cx="-5" cy="24" r="4.5" fill="#fef08a"/>
    <circle cx="19" cy="24" r="4.5" fill="#fef08a"/>
    <!-- Glowing Golden Package inside Cart -->
    <polygon points="5,-14 20,-6 6,2 -9,-6" fill="#fef08a" opacity="0.95"/>
  </g>

  <!-- 6. LUMINOUS "Q" ORBITAL RING (Front Dynamic Arc & Q Tail) -->
  <!-- Encircles the cube and sweeps down into the classic "Q" loop tail -->
  <g filter="url(#cyanGlow)">
    <!-- Orbit front sweeping band -->
    <path d="M 405 205 A 170 85 35 0 1 120 280" fill="none" stroke="url(#cyanOrbit)" stroke-width="10" stroke-linecap="round"/>
    <!-- Elegant Q Tail extending out dynamically to bottom right with golden spark -->
    <path d="M 320 320 C 350 345, 385 375, 412 398" fill="none" stroke="url(#cyanOrbit)" stroke-width="11" stroke-linecap="round"/>
    <circle cx="414" cy="400" r="7" fill="#a5f3fc"/>
  </g>

  <!-- 7. REVENUE GROWTH VECTOR ARROW (Ascending seamlessly from front corner) -->
  <g filter="url(#goldGlow)">
    <path d="M 230 365 L 265 340 L 295 355 L 350 300" fill="none" stroke="url(#goldGrad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Arrow Head -->
    <polygon points="350,300 334,302 344,316" fill="url(#goldGrad)"/>
  </g>

  <!-- 8. REFINED LUXURY CORNER SPARK (Apple/Fintech signature shine) -->
  <g transform="translate(390, 115) scale(0.9)" filter="url(#goldGlow)">
    <path d="M 0 -22 Q 0 0 -22 0 Q 0 0 0 22 Q 0 0 22 0 Q 0 0 0 -22 Z" fill="url(#goldGrad)"/>
    <circle cx="0" cy="0" r="4" fill="#ffffff"/>
  </g>
</svg>'''

def generate_logo_files():
    import playwright.sync_api as pw

    app_dir = r"d:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app"
    icons_dir = os.path.join(app_dir, "icons")
    os.makedirs(icons_dir, exist_ok=True)

    svg_path = os.path.join(icons_dir, "logo-master.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(SVG_CONTENT)
    print(f"Written: {svg_path}")

    # Use Playwright to render ultra-sharp PNGs
    with pw.sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for size in [512, 192, 180, 64, 32, 16]:
            page = browser.new_page(viewport={"width": size, "height": size})
            html_content = f'''<!DOCTYPE html>
<html>
<head>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ width: {size}px; height: {size}px; overflow: hidden; background: transparent; display: grid; place-items: center; }}
    svg {{ width: {size}px; height: {size}px; display: block; }}
  </style>
</head>
<body>
  {SVG_CONTENT}
</body>
</html>'''
            page.set_content(html_content)
            page.wait_for_timeout(100)

            if size == 512:
                out_name = "icon-512.png"
            elif size == 192:
                out_name = "icon-192.png"
            elif size == 180:
                out_name = "apple-touch-icon.png"
            elif size == 32:
                out_name = "favicon-32x32.png"
            elif size == 16:
                out_name = "favicon-16x16.png"
            else:
                out_name = f"icon-{size}.png"

            target_png = os.path.join(icons_dir, out_name)
            page.screenshot(path=target_png, omit_background=True)
            print(f"Generated: {target_png} ({size}x{size})")

            # Also copy to root favicon using PIL
            if size == 32:
                from PIL import Image
                img_32 = Image.open(target_png)
                root_fav = os.path.join(app_dir, "favicon.ico")
                img_32.save(root_fav, format="ICO", sizes=[(32, 32)])
                print(f"Updated: {root_fav}")
                kho_ico = os.path.join(icons_dir, "qbiz_kho.ico")
                img_32.save(kho_ico, format="ICO", sizes=[(32, 32), (64, 64)])
                print(f"Updated: {kho_ico}")

            # Also save 512 to artifacts for visual verification
            if size == 512:
                artifact_path = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424\evidence_premium_logo_512.png"
                page.screenshot(path=artifact_path, omit_background=True)
                print(f"Saved artifact: {artifact_path}")

        browser.close()

if __name__ == "__main__":
    generate_logo_files()
