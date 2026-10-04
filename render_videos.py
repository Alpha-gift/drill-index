from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
from collections import defaultdict
import numpy as np
import imageio.v2 as imageio
import os, math, random

BASE = r'D:\闲暇时的创意空间'
IMG = os.path.join(BASE, 'generated-images')
OUT = os.path.join(IMG, 'videos')
os.makedirs(OUT, exist_ok=True)

W, H = 1048, 320
FPS = 30
LEAD = 1.0                      # seconds from top to judgment line
V = (H - 62) / LEAD
FADE_DIST = 40                  # 越过判定线后，行进多少像素内淡出到 0
random.seed(11)

def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

F_CN   = font(r'C:\Windows\Fonts\msyh.ttc', 20)
F_CN_B = font(r'C:\Windows\Fonts\msyhbd.ttc', 22)
F_CN_S = font(r'C:\Windows\Fonts\msyh.ttc', 14)
F_MONO = font(r'C:\Windows\Fonts\consola.ttf', 16)

def load(name):
    return Image.open(os.path.join(IMG, name)).convert('RGBA')

def fit_w(spr, w):
    h = max(1, int(round(w * spr.height / spr.width)))
    return spr.resize((w, h), Image.LANCZOS)

tap_s   = fit_w(load('tap.png'), 112)
drag_s  = fit_w(load('drag.png'), 112)
flick_s = fit_w(load('flick.png'), 112)

hold_raw = load('hold.png')
hold_darktop = hold_raw.copy()
hold_darkbot = hold_raw.transpose(Image.FLIP_TOP_BOTTOM)
HOLD_W = 56

GOLD = (255, 205, 80)

def gold_frame(spr, grow=4, th=3):
    """一圈包裹音符的金色描边（多押辅助）"""
    pad = grow + 2
    big = Image.new('RGBA', (spr.width + 2 * pad, spr.height + 2 * pad), (0, 0, 0, 0))
    big.paste(spr, (pad, pad), spr)
    a = big.getchannel('A')
    dil = a.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    ring = ImageChops.subtract(dil, a)
    gold = Image.new('RGBA', big.size, GOLD + (235,))
    gold.putalpha(ring)
    gold = gold.filter(ImageFilter.GaussianBlur(1.0))
    return Image.alpha_composite(gold, big)

gold_tap   = gold_frame(tap_s)
gold_drag  = gold_frame(drag_s)
gold_flick = gold_frame(flick_s)

def u_cap(W, H, open_up=True, th=3):
    """长条头部 + 两小段侧边的金色区间（U 形）；open_up=True 时开口朝上"""
    pad = 3
    w, h = W + 2 * pad, H + 2 * pad
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    x0, x1 = pad, w - pad - 1
    rad = (x1 - x0) / 2
    col = GOLD + (240,)
    if open_up:
        yb = h - pad - 1
        dr.line([(x0, pad), (x0, yb - rad)], fill=col, width=th)
        dr.line([(x1, pad), (x1, yb - rad)], fill=col, width=th)
        dr.arc([x0, yb - 2 * rad, x1, yb], start=0, end=180, fill=col, width=th)
    else:
        yt = pad
        dr.line([(x0, h - pad - 1), (x0, yt + rad)], fill=col, width=th)
        dr.line([(x1, h - pad - 1), (x1, yt + rad)], fill=col, width=th)
        dr.arc([x0, yt, x1, yt + 2 * rad], start=180, end=360, fill=col, width=th)
    return img.filter(ImageFilter.GaussianBlur(0.7))


# ---------- 击打特效：Phigros 风格「判定环」+ 扩散白闪 ----------
# Phigros 命中时在判定线上是常见的圆环扩散（白/彩色圈迅速放大淡出），
# 长条尾部收束时会有一个明亮的收口闪光。
PHI_WHITE = (255, 255, 255)
PHI_CYAN  = (150, 232, 255)
HIT_TAP   = 0.30      # 普通键特效时长（秒）
HIT_HOLD  = 0.34      # 长条尾部收束特效时长

hit_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))


def draw_hit(od, cx, cy, k, kind, chord=False):
    """在 k∈[0,1] 的进度上画一帧 Phigros 风格判定特效"""
    if k < 0:
        return
    ease = 1 - (1 - k) ** 2.4           # 先快后慢的扩散
    fade = (1 - k) ** 1.8

    if kind == 'hold':
        # 长条收束：实心亮环 + 中心白点，收得比普通键更干脆
        r = 10 + 30 * ease
        a = int(225 * fade)
        od.ellipse([cx - r, cy - r, cx + r, cy + r],
                   outline=(255, 255, 255, a), width=3)
        rr = 4 + 11 * ease
        od.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                   outline=PHI_CYAN + (int(190 * fade),), width=2)
        core = max(0, 7 * (1 - k * 1.55))
        if core > 0.6:
            od.ellipse([cx - core, cy - core, cx + core, cy + core],
                       fill=(255, 255, 255, int(230 * fade)))
        return

    # 普通键：外环扩散 + 内环（描边）+ 中心白闪
    r = 9 + 27 * ease
    a = int(210 * fade)
    od.ellipse([cx - r, cy - r, cx + r, cy + r],
               outline=(255, 255, 255, a), width=3)
    r2 = 5 + 15 * ease
    if kind == 'flick':                  # 划键用暖粉圈，和红键呼应
        col2 = (255, 190, 210)
    elif kind == 'drag':                 # 黄键用暖黄圈
        col2 = (255, 236, 150)
    else:
        col2 = PHI_CYAN
    od.ellipse([cx - r2, cy - r2, cx + r2, cy + r2],
               outline=col2 + (int(190 * fade),), width=2)

    core = max(0, 6.5 * (1 - k * 1.7))
    if core > 0.6:
        od.ellipse([cx - core, cy - core, cx + core, cy + core],
                   fill=(255, 255, 255, int(225 * fade)))

    if chord:                            # 多押的环更亮更大一圈
        r3 = 14 + 40 * ease
        od.ellipse([cx - r3, cy - r3, cx + r3, cy + r3],
                   outline=GOLD + (int(150 * fade),), width=2)


# ---------- background ----------
bg = Image.new('RGB', (W, H), (31, 31, 31))
d = ImageDraw.Draw(bg)
for yy in range(0, H, 28):
    for xx in range(0, W, 28):
        d.ellipse([xx, yy, xx + 2, yy + 2], fill=(46, 46, 46))

LANES = [250, 430, 610, 790]
def xr():
    return random.randint(90, W - 90)

# ---------- chart helpers ----------
def add(notes, t, x, ty='tap', dur=0.0, hit=True):
    """hit=True 表示被击中：过线后立即消失；hit=False 表示 Miss：过线后渐隐飘走"""
    notes.append((round(t, 4), x, ty, dur, hit))

def mixed_scatter(notes, t0, t1, lo, hi, types):
    """irregular, spaced-out scatter — the point of 散打"""
    t = t0
    while t < t1:
        add(notes, t, xr(), random.choice(types))
        t += random.uniform(lo, hi)

def trill(notes, t0, t1, step, a=None, b=None, mix=0.0):
    a = LANES[0] if a is None else a
    b = LANES[3] if b is None else b
    t = t0; i = 0
    while t < t1:
        ty = random.choice(('flick', 'drag')) if random.random() < mix else 'tap'
        add(notes, t, a if i % 2 == 0 else b, ty)
        t += step; i += 1

def groups3(notes, t0, t1, step, a=None, b=None):
    a = LANES[0] if a is None else a
    b = LANES[3] if b is None else b
    t = t0; i = 0
    while t < t1:
        seq = [a, b, a] if (i // 3) % 2 == 0 else [b, a, b]
        for k, lx in enumerate(seq):
            add(notes, t + k * step, lx, 'tap')
        t += 3 * step; i += 3

def axis(notes, t0, t1, step, fixed, moving):
    t = t0; j = 0
    while t < t1:
        add(notes, t, fixed, 'tap')
        add(notes, t + step, moving[j % len(moving)], 'tap')
        t += 2 * step; j += 1

def chords(notes, t0, t1, step, size, mix=0.0):
    t = t0
    while t < t1:
        for lx in LANES[:size]:
            ty = random.choice(('drag', 'flick')) if random.random() < mix else 'tap'
            add(notes, t, lx, ty)
        t += step

def jumptrill(notes, t0, t1, step):
    t = t0; i = 0
    pair = [(LANES[0], LANES[1]), (LANES[2], LANES[3])]
    while t < t1:
        for lx in pair[i % 2]:
            add(notes, t, lx, 'tap')
        t += step; i += 1

def jack(notes, t0, t1, step, x, n=4):
    """纵连: a run of n on one lane, then a rest — not an endless stream"""
    t = t0
    while t < t1:
        for k in range(n):
            add(notes, t + k * step, x, 'tap')
        t += (n + 3) * step

def stairs(notes, t0, t1, step, up=True, run=5, keep=2, flick_end=False):
    xs = LANES + [LANES[3] + 170]
    t = t0; i = 0
    while t < t1:
        for k in range(run):
            idx = (i + k) % len(xs) if up else (len(xs) - 1 - ((i + k) % len(xs)))
            ty = 'flick' if (flick_end and k == run - 1) else 'tap'
            add(notes, t + k * step, xs[idx], ty)
        t += (run + keep) * step
        i += run

def tapflow(notes, t0, t1, step):
    """倒打用：无结构的单点流（纯 Tap），位置在 5 个落点间随机游走"""
    xs = LANES + [LANES[3] + 170]
    i = random.randrange(len(xs)); t = t0
    while t < t1:
        add(notes, t, xs[i], 'tap')
        i = min(max(i + random.choice((-2, -1, 1, 2)), 0), len(xs) - 1)
        t += step


def hold(notes, t, x, dur, hit=True):
    add(notes, t, x, 'hold', dur, hit)


def mark_miss(notes, t0, t1, ratio=0.35, every=2, offset=1):
    """把 [t0,t1) 区间内固定节奏上的部分音符标成 Miss（过线后渐隐飘走），
    其余保持命中（过线立刻消失）。用「每 every 颗里漏 offset 颗」制造稳定可读的对比。"""
    idx = 0
    for i, n in enumerate(notes):
        if not (t0 <= n[0] < t1):
            continue
        if idx % every == offset:
            notes[i] = n[:4] + (False,)
        idx += 1

# ---------- render ----------
def render(name, notes, dur, title, segs, reverse=False):
    path = os.path.join(OUT, name)
    writer = imageio.get_writer(path, fps=FPS, codec='libx264', quality=8,
                                macro_block_size=1,
                                ffmpeg_params=['-pix_fmt', 'yuv420p'])
    frames = int(dur * FPS)
    jyl = 70 if reverse else H - 62

    def label_at(t):
        for s in segs:
            if s[0] <= t < s[1]:
                return s[2]
        return ''

    notes = sorted(notes, key=lambda n: n[0])
    grp = defaultdict(int)                     # 同一时刻的音符数 → 判断双押/多押
    for n in notes:
        grp[round(n[0], 3)] += 1

    for fi in range(frames):
        t = fi / FPS
        frame = bg.copy()
        for (tn, x, ty, hd, hit) in notes:
            dt = tn - t
            if dt > LEAD + 0.2:
                continue
            # 越线后的存活时长交给下面的像素级渐隐决定，这里只做宽松兜底
            if dt < -(hd + FADE_DIST / V + 0.2):
                continue
            y = jyl - V * dt if not reverse else jyl + V * dt
            is_chord = grp[round(tn, 3)] >= 2   # 多押辅助：需要一起打的音符
            # 判定延迟为 +（即越过判定线）之后：
            #   击中 → 立即消失；未击中(Miss) → 沿 FADE_DIST 渐隐飘走
            # 正打 y 自上而下递增（>jyl 表示已越线向下）；倒打则相反（<jyl 表示已越线向上）
            over = (y - jyl) if not reverse else (jyl - y)
            alpha = 1.0
            if over > 0:
                if hit:
                    continue                     # 命中：过线即刻消失
                alpha = max(0.0, 1.0 - over / FADE_DIST)
                if alpha <= 0.02:
                    continue
            if ty == 'hold':
                barh = max(46, int(V * hd))
                # 深色端朝远离判定线的一侧（正打：深色在上；倒打：深色在下）
                spr = hold_darkbot if reverse else hold_darktop
                s = spr.resize((HOLD_W, barh), Image.LANCZOS)
                top = int(y) if reverse else int(y - barh)
                if alpha < 1.0:
                    s = s.copy()
                    s.putalpha(s.getchannel('A').point(lambda a: int(a * alpha)))
                frame.paste(s, (int(x - HOLD_W / 2), top), s)
                if is_chord:
                    # 长条只包头部 + 一小段侧边
                    cap = u_cap(HOLD_W, 30, open_up=not reverse)
                    if alpha < 1.0:
                        cap = cap.copy()
                        cap.putalpha(cap.getchannel('A').point(lambda a: int(a * alpha)))
                    cy = int(y - 2) if reverse else int(y + 2 - cap.height)
                    frame.paste(cap, (int(x - cap.width / 2), cy), cap)
            else:
                base = {'tap': tap_s, 'drag': drag_s, 'flick': flick_s}[ty]
                if is_chord:
                    spr = {'tap': gold_tap, 'drag': gold_drag, 'flick': gold_flick}[ty]
                else:
                    spr = base
                if alpha < 1.0:
                    spr = spr.copy()
                    spr.putalpha(spr.getchannel('A').point(lambda a: int(a * alpha)))
                frame.paste(spr, (int(x - spr.width / 2), int(y - spr.height / 2)), spr)

        ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(ov)
        pulse = 0.35 + 0.35 * (0.5 + 0.5 * math.sin(t * 4.0))
        od.line([(0, jyl), (W, jyl)], fill=(90, 90, 90, 220), width=2)
        od.line([(0, jyl), (W, jyl)], fill=(158, 255, 0, int(140 * pulse)), width=2)

        # ---- Phigros 风格击打特效（仅命中的音符触发）----
        for (tn, x, ty, hd, hit) in notes:
            if not hit:
                continue
            is_chord = grp[round(tn, 3)] >= 2
            age = t - tn
            if ty == 'hold':                 # 长条：尾部（on 时刻）收束闪光
                if 0 <= age <= HIT_HOLD:
                    draw_hit(od, x, jyl, age / HIT_HOLD, 'hold', is_chord)
            else:
                if 0 <= age <= HIT_TAP:
                    draw_hit(od, x, jyl, age / HIT_TAP, ty, is_chord)
        frame = Image.alpha_composite(frame.convert('RGBA'), ov).convert('RGB')

        dd = ImageDraw.Draw(frame)
        dd.text((16, 12), title, font=F_CN_B, fill=(240, 240, 240))
        lab = label_at(t)
        if lab:
            dd.text((W - 20 - dd.textlength(lab, font=F_CN), 14), lab,
                    font=F_CN, fill=(158, 255, 0))
        dd.text((16, H - 30), 'BPM 120', font=F_MONO, fill=(120, 120, 120))
        rev = '倒打 · 判定线在上' if reverse else '判定线在下'
        dd.text((W - 20 - dd.textlength(rev, font=F_CN_S), H - 30), rev,
                font=F_CN_S, fill=(120, 120, 120))
        writer.append_data(np.array(frame))
    writer.close()
    print('DONE', path, frames)

E4, E8, E16 = 0.5, 0.25, 0.125

# ===== 01 散点 Scatter（真正「散」：不规则间隔 + 留白，纯 Tap）=====
notes = []
segs = [(0, 5.0, '全部命中 · 过线即消失'), (5.0, 9.6, '混 Miss · 漏掉的渐隐'), (9.6, 13, '全部命中')]
mixed_scatter(notes, 0.8, 4.6, 0.55, 0.95, ('tap',))
mixed_scatter(notes, 5.2, 9.2, 0.4, 0.62, ('tap',))
mixed_scatter(notes, 9.8, 12.4, 0.34, 0.5, ('tap',))
mark_miss(notes, 5.2, 9.2, every=3, offset=2)     # 中段每 3 颗漏 1 颗
render('01-scatter.mp4', notes, 13, '01 散点 Scatter', segs)

# ===== 02 交互 Trill（8分为主，段落间留白，纯 Tap：交互/三角/轴）=====
notes = []
segs = [(0, 4.6, '全部命中 · 过线即消失'), (4.6, 8.2, '混 Miss · 三角漏一手'),
        (8.2, 12.5, '全部命中')]
trill(notes, 0.8, 4.2, E8)
groups3(notes, 4.8, 8.0, E8)
axis(notes, 8.4, 11.2, E8, LANES[0], [LANES[1], LANES[2], LANES[3]])
add(notes, 11.6, LANES[3], 'tap')
add(notes, 11.9, LANES[0], 'tap')
mark_miss(notes, 5.4, 8.0, every=4, offset=3)     # 三角段漏掉部分
render('02-trill.mp4', notes, 12.5, '02 交互 Trill', segs)

# ===== 03 多K Chord（纯多押：双/三/全押 + 对拍 + 混合押收尾，无纵连/长押/变键）=====
notes = []
segs = [(0, 3.6, '双押 · 全中'), (3.6, 6.0, '三押 · 混 Miss'),
        (6.0, 8.8, '全押 · 全中'), (8.8, 11.6, '对拍'),
        (11.6, 14.8, '混合押 · 混 Miss'), (14.8, 18, '全押收尾')]
chords(notes, 0.8, 3.2, E4, 2)
chords(notes, 3.8, 5.6, E4, 3)
chords(notes, 6.2, 8.2, 1.0, 4)
jumptrill(notes, 9.0, 11.2, E8)          # 对拍：双押左右交替，仍属多K
t = 11.8; i = 0                          # 混合押：双押三押交替
while t < 14.4:
    for lx in LANES[:2 if i % 2 == 0 else 3]:
        add(notes, t, lx, 'tap')
    t += E4; i += 1
chords(notes, 14.9, 17.4, 1.2, 4)        # 全押慢速收尾
mark_miss(notes, 3.8, 5.6, every=3, offset=1)     # 三押段漏一手
mark_miss(notes, 11.8, 14.4, every=3, offset=2)   # 混合押段漏几颗
render('03-chord.mp4', notes, 18, '03 多K Chord', segs)

# ===== 04 倒打 Reverse（本体是方向：纯 Tap 单点流，无散打/交互结构、无长押划键）=====
notes = []
segs = [(0, 4.6, '倒打 · 全部命中'), (4.6, 8.2, '倒打 · 混 Miss'),
        (8.2, 13, '倒打 · 加快')]
tapflow(notes, 0.8, 4.2, E8 * 1.5)
tapflow(notes, 4.8, 7.8, E8 * 1.5)
tapflow(notes, 8.4, 12.2, E8)
mark_miss(notes, 4.8, 7.8, every=4, offset=2)     # 中段漏几颗（验证上方判定线渐隐）
render('04-reverse.mp4', notes, 13, '04 倒打 Reverse', segs, reverse=True)

# ===== 05 楼梯 Stairs（纯 Tap：上楼梯 / 下楼梯，无划键、无钢琴押）=====
notes = []
segs = [(0, 4.6, '上楼梯 · 全中'), (4.6, 8.2, '上楼梯 · 混 Miss'),
        (8.2, 12.5, '下楼梯')]
stairs(notes, 0.8, 4.2, E8, up=True, run=5, keep=2)
stairs(notes, 4.8, 8.0, E8, up=True, run=5, keep=2)
stairs(notes, 8.4, 12.0, E8, up=False, run=5, keep=2)
mark_miss(notes, 4.8, 8.0, every=5, offset=2)     # 楼梯中段漏级
render('05-stairs.mp4', notes, 12.5, '05 楼梯 Stairs', segs)

# ===== 06 点划 Tap+Flick（纯点划：同时叠加 / 错位，无 Drag 黄键）=====
notes = []
segs = [(0, 4.6, '点划叠加 · 全中'), (4.6, 8.2, '点划 · 混 Miss'),
        (8.2, 12.5, '点划错位')]
t = 0.8
while t < 4.2:
    x = xr(); add(notes, t, x, 'tap'); add(notes, t, x, 'flick'); t += E4
t = 4.8
while t < 7.8:
    x = xr(); add(notes, t, x, 'tap'); add(notes, t, x, 'flick'); t += E4 * 1.5
t = 8.4
while t < 12.0:
    x = xr(); add(notes, t, x, 'tap'); add(notes, t + E8, x, 'flick'); t += E4
mark_miss(notes, 4.8, 7.8, every=3, offset=2)     # 中段漏几颗
render('06-tapflick.mp4', notes, 12.5, '06 点划 Tap+Flick', segs)

# remux with +faststart so browsers can start playback before the whole file downloads
import imageio_ffmpeg, subprocess
_ff = imageio_ffmpeg.get_ffmpeg_exe()
for f in sorted(os.listdir(OUT)):
    if not f.endswith('.mp4'):
        continue
    src = os.path.join(OUT, f); tmp = os.path.join(OUT, '_fast_' + f)
    subprocess.run([_ff, '-y', '-loglevel', 'error', '-i', src, '-c', 'copy',
                    '-movflags', '+faststart', tmp], check=True)
    os.replace(tmp, src)
    print('faststart', f)

print('ALL DONE')
