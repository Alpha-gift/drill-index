# -*- coding: utf-8 -*-
"""准备移动端应用资源：拷贝媒体、生成图标与视频封面。"""
import os, shutil, io, json
from PIL import Image, ImageDraw
import imageio.v2 as imageio

BASE = r'D:\闲暇时的创意空间'
APP = os.path.join(BASE, 'drill-app')
MEDIA = os.path.join(APP, 'media')
VID = os.path.join(MEDIA, 'videos')
ICO = os.path.join(APP, 'assets', 'icons')
POS = os.path.join(MEDIA, 'posters')
for d in (VID, ICO, POS):
    os.makedirs(d, exist_ok=True)

ACC = (158, 255, 0)
BG = (18, 18, 18)

# ---------- 1. 拷贝视频 ----------
n = 0
for src_dir in [os.path.join(BASE, 'generated-images', 'videos'),
                os.path.join(BASE, 'generated-images', 'games')]:
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith('.mp4'):
            continue
        shutil.copy2(os.path.join(src_dir, f), os.path.join(VID, f))
        n += 1
print('copied videos:', n)


# ---------- 2. 应用图标（logo：2x2 方块） ----------
def make_icon(size, maskable=False):
    img = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(img)
    # 圆角矩形主色块
    inset = size * (0.22 if maskable else 0.16)
    box = [inset, inset, size - inset, size - inset]
    d.rounded_rectangle(box, radius=(size - 2 * inset) * 0.22, fill=ACC)
    # 四方块镂空
    pad = (size - 2 * inset) * 0.20
    gx0, gy0 = inset + pad, inset + pad
    gx1, gy1 = size - inset - pad, size - inset - pad
    gap = (gx1 - gx0) * 0.12
    cx = (gx0 + gx1) / 2
    cy = (gy0 + gy1) / 2
    cells = [(gx0, gy0, cx - gap / 2, cy - gap / 2), (cx + gap / 2, gy0, gx1, cy - gap / 2),
             (gx0, cy + gap / 2, cx - gap / 2, gy1), (cx + gap / 2, cy + gap / 2, gx1, gy1)]
    r = max(1, int((cx - gx0) * 0.14))
    for c in cells:
        d.rounded_rectangle(c, radius=r, fill=BG)
    return img


for s in (192, 512):
    make_icon(s).save(os.path.join(ICO, 'icon-%d.png' % s))
make_icon(512, maskable=True).save(os.path.join(ICO, 'maskable-512.png'))
make_icon(180).save(os.path.join(ICO, 'apple-touch-icon.png'))
print('icons: 4')

# ---------- 3. 视频封面（取首帧有内容处） ----------
js = io.open(os.path.join(APP, 'src', 'data', 'games.js'), encoding='utf-8').read()
GAMES = json.loads(js[js.index('['):js.rindex(']') + 1])
made = 0
for g in GAMES:
    for m in g['modules']:
        vp = os.path.join(VID, os.path.basename(m['video']))
        if not os.path.exists(vp):
            continue
        try:
            rd = imageio.get_reader(vp)
            fps = rd.get_meta_data()['fps']
            frame = rd.get_data(int(min(1.4, rd.count_frames() / fps * 0.15) * fps))
            rd.close()
            im = Image.fromarray(frame)
            im.thumbnail((520, 520), Image.LANCZOS)
            out = os.path.join(POS, m['id'] + '.jpg')
            im.convert('RGB').save(out, quality=76, optimize=True)
            made += 1
        except Exception as e:
            print('  poster FAIL', m['id'], e)
print('posters:', made)

tot = sum(os.path.getsize(os.path.join(dp, f))
          for dp, _, fs in os.walk(APP) for f in fs)
print('app 目录总大小 %.1f MB' % (tot / 1e6))
