# -*- coding: utf-8 -*-
"""
DRILL INDEX 应用图标生成器
--------------------------
视觉方向：霓虹信号 —— 暗底 + 下落音符 + 判定线 + 命中辉光
延续 App 内视觉（底色 #111、信号绿 #9EFF00）

输出：
  assets/icons/icon-512.png          圆角方形，用于 manifest / 高分辨率
  assets/icons/icon-192.png          圆角方形，主图标
  assets/icons/apple-touch-icon.png  iOS 用，满幅方形（系统自己切圆角）
  assets/icons/maskable-512.png      Android 自适应图标，满幅底 + 内容收进安全区
  assets/icons/favicon-32.png        浏览器标签页

所有绘制先在 512 逻辑空间里描述，再乘以 SS 超采样，最后 LANCZOS 缩放。
"""
import os
from PIL import Image, ImageDraw, ImageFilter

SS = 4                       # 超采样倍率
BASE = 512                   # 逻辑画布尺寸
S = BASE * SS                # 实际绘制尺寸

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'drill-app', 'assets', 'icons')

# ---- 配色 ----
NEON = (158, 255, 0)         # 信号绿（与 App 内 --accent 一致）
NEON_HI = (232, 255, 190)    # 音符顶端亮部
BG_TOP = (32, 32, 32)
BG_BOT = (10, 10, 10)

# ---- 元素坐标（512 逻辑空间）----
LINE = dict(x0=72, x1=440, y0=348, y1=364)      # 判定线
NOTES = [                                       # (中心 x, 顶端 y)，底端统一
    (158, 176),
    (256,  88),
    (354, 228),
]
NOTE_W = 34
NOTE_BOT = 318
NOTE_R = NOTE_W // 2
RING = dict(cx=256, cy=356, r=78, w=9)          # 判定环：击中瞬间的扩散圈


def k(v):
    """逻辑坐标 → 绘制坐标"""
    return int(round(v * SS))


def vgrad(size, top, bot):
    """整幅垂直渐变 RGB"""
    w, h = size
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)],
               fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img


def bar_sprite(w, h, top, bot, r):
    """一根圆角竖条，内部垂直渐变（顶端亮）"""
    w, h, r = max(1, int(w)), max(1, int(h)), int(r)
    img = vgrad((w, h), top, bot).convert('RGBA')
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    img.putalpha(mask)
    return img


def content_layer(scale=1.0):
    """音符 + 判定线（透明底）。scale<1 时整体向中心收缩，用于 maskable 安全区。"""
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx = cy = S / 2

    def tx(x):
        return cx + (x - BASE / 2) * scale * SS

    def ty(y):
        return cy + (y - BASE / 2) * scale * SS

    # 判定线（横条，两端圆角）
    lx0, lx1 = tx(LINE['x0']), tx(LINE['x1'])
    ly0, ly1 = ty(LINE['y0']), ty(LINE['y1'])
    lw, lh = int(lx1 - lx0), int(ly1 - ly0)
    line = bar_sprite(lw, lh, (214, 255, 140), NEON, lh // 2)
    layer.alpha_composite(line, (int(lx0), int(ly0)))

    # 判定环（击中瞬间扩散的圈）—— 跨在判定线上，点明"音游"而不是"数据图表"
    rw = max(1, int(RING['w'] * scale * SS))
    rr = RING['r'] * scale * SS
    rcx, rcy = tx(RING['cx']), ty(RING['cy'])
    ring = Image.new('RGBA', (int(rr * 2 + rw * 2), int(rr * 2 + rw * 2)), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse(
        [rw / 2, rw / 2, ring.width - rw / 2 - 1, ring.height - rw / 2 - 1],
        outline=(196, 255, 96, 205), width=rw)
    layer.alpha_composite(ring, (int(rcx - ring.width / 2), int(rcy - ring.height / 2)))

    # 下落音符（画在判定环之上，保证主体不被环压住）
    nw = int(NOTE_W * scale * SS)
    nr = NOTE_R * scale * SS
    for nx, ntop in NOTES:
        x = tx(nx) - nw / 2
        y0, y1 = ty(ntop), ty(NOTE_BOT)
        note = bar_sprite(nw, int(y1 - y0), NEON_HI, NEON, nr)
        layer.alpha_composite(note, (int(x), int(y0)))
    return layer


def glow(content, radius, color, strength):
    """由内容的 alpha 生成一圈外发光"""
    a = content.getchannel('A').filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: min(255, int(v * strength)))
    g = Image.new('RGBA', content.size, color + (0,))
    g.putalpha(a)
    return g


def render(size, maskable=False, content_scale=None):
    """maskable=True → 满幅方形底 + 内容收进安全区（中心 72%）"""
    scale = content_scale if content_scale else (0.72 if maskable else 1.0)

    # --- 底 ---
    bg = vgrad((S, S), BG_TOP, BG_BOT).convert('RGBA')
    if not maskable:
        # 圆角方形；半径约 22%，接近 Android / iOS 的观感
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1],
                                              radius=k(BASE * 0.222), fill=255)
        bg.putalpha(mask)

    # --- 环境光：判定线附近一小团弥散绿光，克制一点，避免整幅发浑 ---
    amb = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ad = ImageDraw.Draw(amb)
    gx, gy = S / 2, S * 0.695
    gw, gh = S * 0.42, S * 0.16
    ad.ellipse([gx - gw, gy - gh, gx + gw, gy + gh], fill=NEON + (46,))
    amb = amb.filter(ImageFilter.GaussianBlur(S * 0.055))
    bg = Image.alpha_composite(bg, amb)

    # --- 内容 + 辉光：两段式（贴身亮边 + 短程柔光），收紧不糊 ---
    content = content_layer(scale)
    out = bg
    out = Image.alpha_composite(out, glow(content, S * 0.017, NEON, 0.40))
    out = Image.alpha_composite(out, glow(content, S * 0.006, NEON, 1.0))
    out = Image.alpha_composite(out, content)                                # 本体

    return out.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-512.png', 512, dict(maskable=False)),
        ('icon-192.png', 192, dict(maskable=False)),
        ('apple-touch-icon.png', 180, dict(maskable=True, content_scale=0.80)),
        ('maskable-512.png', 512, dict(maskable=True)),
        ('favicon-32.png', 32, dict(maskable=False)),
    ]
    for name, size, kw in jobs:
        img = render(size, **kw)
        img.save(os.path.join(OUT, name))
        print('  %-24s %3dpx  %6d B' % (name, size, os.path.getsize(os.path.join(OUT, name))))

    # 验收用接触表：多种尺寸 + 深/浅底，另存到 _icon_preview.png（非交付物）
    prev = Image.new('RGB', (760, 300), (24, 24, 24))
    d = ImageDraw.Draw(prev)
    d.rectangle([0, 0, 759, 149], fill=(238, 238, 238))          # 浅底一行
    big = render(512)
    prev.paste(big.resize((128, 128), Image.LANCZOS), (18, 11), big.resize((128, 128), Image.LANCZOS))
    prev.paste(big.resize((128, 128), Image.LANCZOS), (18, 161), big.resize((128, 128), Image.LANCZOS))
    prev.paste(render(512, maskable=True).resize((128, 128), Image.LANCZOS), (162, 161),
               render(512, maskable=True).resize((128, 128), Image.LANCZOS))
    x = 306
    for s in (96, 72, 56, 40, 32, 24):
        ic = render(s)
        prev.paste(ic, (x, 11 + (128 - s) // 2), ic)
        ic2 = render(s, maskable=True)
        prev.paste(ic2, (x, 161 + (128 - s) // 2), ic2)
        x += s + 16
    prev.save(os.path.join(ROOT, 'icon-preview.png'))
    print('  preview -> icon-preview.png')


if __name__ == '__main__':
    main()
