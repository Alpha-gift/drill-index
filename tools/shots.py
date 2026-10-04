# -*- coding: utf-8 -*-
"""按真实视口宽度渲染应用的各个界面，用于人工核对。

要点（踩过的坑）：
  这个无头环境把排版视口固定得比 --window-size 小，
  如果请求 390 就只截到 390 而排版按 496 算 → 看起来像"内容溢出"。
  所以统一请求 520，并且用 file:// 打开（页面内服务不注册 SW，避免缓存旧文件）。
"""
import io, os, subprocess, shutil
from PIL import Image

APP = r'D:\闲暇时的创意空间\drill-app'
D = r'C:\Users\Andy\_drillshot'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
os.makedirs(D, exist_ok=True)

SHOT_W = 520
SHOT_H = 1040

shots = [
    ('01-home',    '',                          '首页'),
    ('02-train',   '#/train',                   '训练'),
    ('03-goal',    '#/t/tapflick',              '训练目标详情'),
    ('04-codex',   '#/codex',                   '图鉴'),
    ('05-family',  '#/k/hold',                  '键型族详情'),
    ('06-me',      '#/me',                      '我的'),
    ('07-game',    '#/g/phigros',               '音游详情'),
    ('08-module',  '#/m/phigros-01',            '模块详情'),
]

for name, hash_, label in shots:
    dbg = os.path.join(APP, '_shot.html')
    html = io.open(os.path.join(APP, 'index.html'), encoding='utf-8').read()
    if hash_:
        html = html.replace('</body>',
                            "<script>location.hash='%s';</script>\n</body>" % hash_)
    io.open(dbg, 'w', encoding='utf-8').write(html)

    prof = os.path.join(D, 'p_' + name)
    shutil.rmtree(prof, ignore_errors=True)
    out = os.path.join(D, name + '.png')
    if os.path.exists(out):
        os.remove(out)

    url = 'file:///' + dbg.replace('\\', '/') + hash_
    subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-first-run',
                    '--hide-scrollbars', '--user-data-dir=' + prof,
                    '--window-size=%d,%d' % (SHOT_W, SHOT_H),
                    '--virtual-time-budget=7000',
                    '--screenshot=' + out, url],
                   capture_output=True, timeout=180)

    if os.path.exists(out):
        print('%-10s %-10s -> %s' % (name, label, Image.open(out).size))
    else:
        print('%-10s %-10s -> FAILED' % (name, label))

if os.path.exists(os.path.join(APP, '_shot.html')):
    os.remove(os.path.join(APP, '_shot.html'))
