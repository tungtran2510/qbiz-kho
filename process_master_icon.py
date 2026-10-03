import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image, ImageDraw

SRC_IMG = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424\qbiz_classic_modern_v2_1791034178520.jpg"
APP_DIR = r"d:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app"
ICONS_DIR = os.path.join(APP_DIR, "icons")
ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

def make_squircle_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask

def process():
    img = Image.open(SRC_IMG).convert("RGB")
    size = img.size[0] # 1024

    # The image has white corners outside the squircle
    # Let's crop slightly if needed or apply smooth rounded mask
    # Let's find squircle bounds: the squircle touches roughly ~8px from border
    mask = make_squircle_mask(size, int(size * 0.225))
    
    rgba = img.convert("RGBA")
    rgba.putalpha(mask)

    # 1. Save 512
    img_512 = rgba.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save(os.path.join(ICONS_DIR, "icon-512.png"), format="PNG")
    img_512.save(os.path.join(ARTIFACT_DIR, "evidence_final_app_icon_512.png"), format="PNG")
    print("Saved 512x512")

    # 2. Save 192
    img_192 = rgba.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save(os.path.join(ICONS_DIR, "icon-192.png"), format="PNG")
    print("Saved 192x192")

    # 3. Save 180 (apple-touch-icon)
    img_180 = rgba.resize((180, 180), Image.Resampling.LANCZOS)
    img_180.save(os.path.join(ICONS_DIR, "apple-touch-icon.png"), format="PNG")
    print("Saved 180x180")

    # 4. Save 64
    img_64 = rgba.resize((64, 64), Image.Resampling.LANCZOS)
    img_64.save(os.path.join(ICONS_DIR, "icon-64.png"), format="PNG")
    print("Saved 64x64")

    # 5. Save 32
    img_32 = rgba.resize((32, 32), Image.Resampling.LANCZOS)
    img_32.save(os.path.join(ICONS_DIR, "favicon-32x32.png"), format="PNG")
    print("Saved 32x32")

    # 6. Save 16
    img_16 = rgba.resize((16, 16), Image.Resampling.LANCZOS)
    img_16.save(os.path.join(ICONS_DIR, "favicon-16x16.png"), format="PNG")
    print("Saved 16x16")

    # 7. ICO files
    img_32.save(os.path.join(APP_DIR, "favicon.ico"), format="ICO", sizes=[(32, 32)])
    img_64.save(os.path.join(ICONS_DIR, "qbiz_kho.ico"), format="ICO", sizes=[(32, 32), (64, 64)])
    print("Saved ICO files")

    # 8. Create logo-master.svg with embedded clean PNG
    import base64
    import io
    buf = io.BytesIO()
    img_512.save(buf, format="PNG")
    b64_data = base64.b64encode(buf.getvalue()).decode('utf-8')

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,{b64_data}" x="0" y="0" width="512" height="512" />
</svg>'''
    with open(os.path.join(ICONS_DIR, "logo-master.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)
    print("Saved logo-master.svg")

if __name__ == "__main__":
    process()
