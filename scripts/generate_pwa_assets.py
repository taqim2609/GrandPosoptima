import os
import zlib
import struct
import math

def write_png(filename, width, height, rgba_data):
    """Write an RGBA bytearray as a standard valid PNG file."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    raw_scanlines = bytearray()
    row_bytes = width * 4
    for y in range(height):
        raw_scanlines.append(0)  # Filter type 0 (None)
        start = y * row_bytes
        raw_scanlines.extend(rgba_data[start:start + row_bytes])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_scanlines), 9)

    os.makedirs(os.path.dirname(os.path.abspath(filename)), exist_ok=True)
    with open(filename, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))
    print(f"Created PNG: {filename} ({width}x{height})")

def render_pos_icon(size=512, maskable=False):
    """Renders high-quality Grand Aceh Kuliner POS icon in RGBA."""
    w, h = size, size
    buf = bytearray(w * h * 4)

    cx, cy = w / 2.0, h / 2.0
    corner_radius = size * 0.22 if not maskable else 0.0

    # Colors
    bg_top = (230, 57, 70, 255)     # #E63946 Crimson Red
    bg_bot = (185, 28, 48, 255)     # #B91C30 Deep Crimson
    border_col = (255, 255, 255, 30) # Subtle white border
    gold_col = (255, 214, 102, 255) # Gold accent for star/crown
    white = (255, 255, 255, 255)

    # Safe zone scale for maskable (safe content inside 80% circle)
    scale = 0.72 if maskable else 0.88

    for y in range(h):
        for x in range(w):
            idx = (y * w + x) * 4
            
            # Distance from center
            dx = x - cx
            dy = y - cy
            
            # Check rounded rectangle boundaries for non-maskable
            in_shape = True
            alpha_edge = 1.0
            
            if not maskable:
                # Rounded rect distance test
                ax = abs(dx) - (w / 2.0 - corner_radius)
                ay = abs(dy) - (h / 2.0 - corner_radius)
                
                if ax > 0 and ay > 0:
                    dist = math.sqrt(ax * ax + ay * ay)
                    if dist > corner_radius:
                        in_shape = False
                    elif dist > corner_radius - 1.0:
                        alpha_edge = max(0.0, corner_radius - dist)
                elif ax > corner_radius or ay > corner_radius:
                    in_shape = False

            if not in_shape:
                buf[idx] = 0
                buf[idx + 1] = 0
                buf[idx + 2] = 0
                buf[idx + 3] = 0
                continue

            # Background gradient
            t = y / float(h)
            r = int(bg_top[0] * (1.0 - t) + bg_bot[0] * t)
            g = int(bg_top[1] * (1.0 - t) + bg_bot[1] * t)
            b = int(bg_top[2] * (1.0 - t) + bg_bot[2] * t)
            a = int(255 * alpha_edge)

            # Subtly lighter center glow
            glow = max(0.0, 1.0 - (math.sqrt(dx*dx + dy*dy) / (size * 0.7)))
            r = min(255, int(r + 20 * glow))
            g = min(255, int(g + 10 * glow))

            # Draw the Monogram "G" + POS Emblem
            # Scaled coordinates:
            sx = dx / scale
            sy = dy / scale

            # Outer ring of "G": radius between R_in and R_out
            r_out = size * 0.36
            r_in = size * 0.22
            r_dist = math.sqrt(sx * sx + sy * sy)

            angle = math.atan2(sy, sx) # -pi to pi

            is_g = False
            # Main circular arc of G: from -pi*0.75 down to +0.25*pi (leaving opening at top-right/right)
            if r_in <= r_dist <= r_out:
                # Gap on the right side between -35 deg and +20 deg
                gap_low = -0.25 * math.pi
                gap_high = 0.05 * math.pi
                if not (gap_low <= angle <= gap_high):
                    is_g = True

            # Horizontal crossbar of G (from center towards right)
            bar_y_min = -size * 0.04
            bar_y_max = size * 0.04
            bar_x_min = 0.0
            bar_x_max = r_out * 0.95
            if (bar_y_min <= sy <= bar_y_max) and (bar_x_min <= sx <= bar_x_max):
                is_g = True

            # Vertical serif / pillar on the right of the crossbar
            pillar_x_min = r_out * 0.82
            pillar_x_max = r_out * 0.98
            pillar_y_min = -size * 0.04
            pillar_y_max = size * 0.16
            if (pillar_x_min <= sx <= pillar_x_max) and (pillar_y_min <= sy <= pillar_y_max):
                is_g = True

            # Aceh Golden Crescent & Star Accent at Top Right
            is_gold = False
            # Star / diamond at top-right: sx ~ r_out*0.6, sy ~ -r_out*0.6
            star_cx = r_out * 0.65
            star_cy = -r_out * 0.65
            dist_star = abs(sx - star_cx) + abs(sy - star_cy)
            if dist_star <= size * 0.065:
                is_gold = True

            # Point of Sale Dot accent in the center
            dot_dist = math.sqrt((sx - (size * 0.08))**2 + (sy - (size * 0.08))**2)
            if dot_dist <= size * 0.035:
                is_gold = True

            if is_g:
                buf[idx] = white[0]
                buf[idx + 1] = white[1]
                buf[idx + 2] = white[2]
                buf[idx + 3] = int(white[3] * alpha_edge)
            elif is_gold:
                buf[idx] = gold_col[0]
                buf[idx + 1] = gold_col[1]
                buf[idx + 2] = gold_col[2]
                buf[idx + 3] = int(gold_col[3] * alpha_edge)
            else:
                buf[idx] = r
                buf[idx + 1] = g
                buf[idx + 2] = b
                buf[idx + 3] = a

    return buf

def render_desktop_screenshot():
    """Generates a clean 1280x720 desktop preview screenshot for PWA install dialog."""
    w, h = 1280, 720
    buf = bytearray(w * h * 4)

    # Theme colors
    c_sidebar = (10, 10, 10, 255)       # #0A0A0A
    c_topbar = (255, 255, 255, 255)     # #FFFFFF
    c_bg = (244, 245, 247, 255)         # #F4F5F7
    c_primary = (230, 57, 70, 255)      # #E63946
    c_card = (255, 255, 255, 255)       # #FFFFFF
    c_border = (228, 228, 231, 255)     # #E4E4E7
    c_text_dark = (24, 24, 27, 255)     # #18181B
    c_text_muted = (113, 113, 122, 255) # #71717A
    c_green = (4, 120, 87, 255)         # #047857

    sidebar_w = 240
    topbar_h = 56
    cart_w = 340

    for y in range(h):
        for x in range(w):
            idx = (y * w + x) * 4

            if x < sidebar_w:
                # Sidebar area
                if y < 64:
                    # Sidebar header
                    buf[idx:idx+4] = bytearray([230, 57, 70, 255]) if (x < 60 and 16 < y < 48) else bytearray(c_sidebar)
                else:
                    # Sidebar menu items (highlight one active menu item)
                    if 80 <= y <= 120:
                        buf[idx:idx+4] = bytearray([230, 57, 70, 255]) # Active tab
                    elif 130 <= y <= 165 or 175 <= y <= 210 or 220 <= y <= 255 or 265 <= y <= 300:
                        buf[idx:idx+4] = bytearray([25, 25, 25, 255]) # Inactive tabs
                    else:
                        buf[idx:idx+4] = bytearray(c_sidebar)
            elif y < topbar_h:
                # Top header bar
                if y == topbar_h - 1:
                    buf[idx:idx+4] = bytearray(c_border)
                else:
                    buf[idx:idx+4] = bytearray(c_topbar)
            else:
                # Main workspace area
                if x > w - cart_w:
                    # Cart summary panel on right
                    if x == w - cart_w:
                        buf[idx:idx+4] = bytearray(c_border)
                    elif y > h - 100:
                        # Big green pay button
                        if (w - cart_w + 20) <= x <= (w - 20) and (h - 85) <= y <= (h - 35):
                            buf[idx:idx+4] = bytearray(c_primary)
                        else:
                            buf[idx:idx+4] = bytearray(c_card)
                    else:
                        buf[idx:idx+4] = bytearray(c_card)
                else:
                    # Catalog product grid
                    # Draw neat simulated cards
                    mx = x - sidebar_w
                    my = y - topbar_h
                    
                    # 4 columns of cards
                    card_col = mx // 160
                    card_row = my // 190
                    rx = mx % 160
                    ry = my % 190

                    if 12 <= rx <= 148 and 12 <= ry <= 178:
                        if ry < 95:
                            # Product image area
                            tint = (card_col * 40 + card_row * 30) % 60
                            buf[idx:idx+4] = bytearray([220 + tint//2, 225 - tint//3, 230, 255])
                        else:
                            # Card text area
                            buf[idx:idx+4] = bytearray(c_card)
                    else:
                        buf[idx:idx+4] = bytearray(c_bg)

    return buf

def main():
    print("Generating crisp, production-grade PWA icons and assets...")

    # 1. 512x512 standard icon (purpose: any)
    icon_512 = render_pos_icon(size=512, maskable=False)
    # 2. 192x192 standard icon (purpose: any)
    icon_192 = render_pos_icon(size=192, maskable=False)
    # 3. 512x512 maskable icon (purpose: maskable)
    icon_maskable = render_pos_icon(size=512, maskable=True)
    # 4. 180x180 Apple touch icon
    icon_apple = render_pos_icon(size=180, maskable=False)
    # 5. Desktop preview screenshot (1280x720)
    screenshot_desktop = render_desktop_screenshot()

    dest_dirs = ["/public", "/project/frontend/public"]

    for d in dest_dirs:
        write_png(os.path.join(d, "icon-512.png"), 512, 512, icon_512)
        write_png(os.path.join(d, "icon-192.png"), 192, 192, icon_192)
        write_png(os.path.join(d, "icon-maskable-512.png"), 512, 512, icon_maskable)
        write_png(os.path.join(d, "apple-touch-icon.png"), 180, 180, icon_apple)
        write_png(os.path.join(d, "screenshot-desktop.png"), 1280, 720, screenshot_desktop)

    # 6. Generate SVG vector icon
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#E63946"/>
      <stop offset="100%" stop-color="#B91C1C"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <path d="M 360 170 C 330 130 290 115 245 115 C 165 115 105 175 105 256 C 105 337 165 397 245 397 C 330 397 385 340 385 256 L 245 256 L 245 210 L 435 210 C 438 225 440 242 440 258 C 440 370 355 452 245 452 C 135 452 50 365 50 256 C 50 147 135 60 245 60 C 310 60 365 85 405 125 Z" fill="#FFFFFF" filter="url(#shadow)"/>
  <circle cx="365" cy="155" r="22" fill="#FFD166"/>
  <path d="M 285 285 L 315 315 L 375 255" fill="none" stroke="#FFD166" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>"""

    for d in dest_dirs:
        svg_path = os.path.join(d, "icon.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)
        print(f"Created SVG: {svg_path}")

    print("All PWA assets generated successfully!")

if __name__ == "__main__":
    main()
