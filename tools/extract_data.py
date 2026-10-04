# -*- coding: utf-8 -*-
"""把 drill-index-prototype.html 的内容抽取成数据驱动的 JS 数据文件。

产物: drill-app/src/data/games.js
"""
import io, os, re, html, json

BASE = r'D:\闲暇时的创意空间'
SRC = os.path.join(BASE, 'drill-index-prototype.html')
OUT_DIR = os.path.join(BASE, 'drill-app', 'src', 'data')
os.makedirs(OUT_DIR, exist_ok=True)


def clean(s):
    """去标签 + 还原实体 + 压缩空白"""
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    s = s.replace('\u2002', ' ').replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def find_all(pattern, text, flags=re.S):
    return [m.group(1) for m in re.finditer(pattern, text, flags)]


src = io.open(SRC, encoding='utf-8').read()

# ---------- 游戏卡片（提供顺序与主题色） ----------
cards = []
for m in re.finditer(
        r'<button class="game(?: on)?" data-g="([a-z]+)" style="--ga:(#[0-9A-Fa-f]{6})">(.*?)</button>',
        src, re.S):
    gid, accent, inner = m.group(1), m.group(2), m.group(3)
    name = clean(re.search(r'<span class="gname">(.*?)</span>', inner, re.S).group(1))
    em = re.search(r'<em>(.*?)</em>', inner, re.S)
    alias = clean(em.group(1)) if em else ''
    name = name.replace(alias, '').strip()
    desc = clean(re.search(r'<span class="gdesc">(.*?)</span>', inner, re.S).group(1))
    tags = [clean(t) for t in find_all(r'<span>([^<]+)</span>', inner)]
    tags = [t for t in tags if t and t not in (name, alias)]
    cards.append(dict(id=gid, name=name, alias=alias, accent=accent.upper(),
                      desc=desc, tags=tags))

# ---------- 各游戏面板 ----------
order = [c['id'] for c in cards]
panels = {}
for m in re.finditer(
        r'<section class="gamepanel(?: on)?" id="g-([a-z]+)" style="--acc:(#[0-9A-Fa-f]{6})">(.*?)</section>',
        src, re.S):
    panels[m.group(1)] = m.group(3)

games = []
for c in cards:
    gid = c['id']
    body = panels.get(gid, '')
    head = re.search(r'<div class="ghead">(.*?)</div>\s*(?=<article)', body, re.S)
    head = head.group(1) if head else ''
    title = clean(re.search(r'<div class="gtitle">(.*?)</div>', head, re.S).group(1))
    em = re.search(r'<em>(.*?)</em>', head, re.S)
    full_alias = clean(em.group(1)) if em else c['alias']
    title = title.replace(full_alias, '').strip()
    gdesc = clean(re.search(r'<p class="gdesc">(.*?)</p>', head, re.S).group(1))
    gmeta = [clean(x) for x in find_all(r'<span>(.*?)</span>', head)]
    gmeta = [x for x in gmeta if x]

    # ---- 模块 ----
    mods = []
    for mm in re.finditer(r'<article class="module" data-k="([^"]*)">(.*?)</article>', body, re.S):
        keys, blk = mm.group(1), mm.group(2)
        num = clean(re.search(r'<div class="mnum">(.*?)</div>', blk, re.S).group(1))
        mt = re.search(r'<div class="mtitle">(.*?)</div>', blk, re.S).group(1)
        span = re.search(r'<span>(.*?)</span>', mt, re.S)
        malias = clean(span.group(1)) if span else ''
        malias = re.sub(r'^别名[:：]\s*', '', malias)
        mtxt = clean(re.sub(r'<span>.*?</span>', '', mt, flags=re.S))
        parts = mtxt.split(' ', 1)
        mname = parts[0]
        men = parts[1] if len(parts) > 1 else ''
        mdesc = clean(re.search(r'<p class="mdesc">(.*?)</p>', blk, re.S).group(1))
        mmeta = clean(re.search(r'<div class="mmeta">(.*?)</div>', blk, re.S).group(1))
        mmeta = mmeta.replace(' · ', ' · ')

        vid = re.search(r'<video class="demo" src="([^"]+)"', blk)
        video = vid.group(1) if vid else ''
        video = video.replace('generated-images/videos/', 'media/videos/') \
                     .replace('generated-images/games/', 'media/videos/')
        dur = re.search(r'<div class="player" data-dur="([0-9.]+)"', blk)

        segs = [dict(t=float(t), label=clean(l)) for t, l in
                re.findall(r'<button class="pseg" data-t="([0-9.]+)">(.*?)</button>', blk, re.S)]

        legend = []
        for kind, inner in re.findall(
                r'<span class="k-(hit|miss)"><i></i>(.*?)</span>', blk, re.S):
            legend.append(dict(kind=kind, text=clean(inner)))

        bp = re.search(r'<div class="body">(.*?)</div>\s*</article>', blk, re.S)
        bp = bp.group(1) if bp else blk
        para = re.search(r'<p[^>]*>(.*?)</p>', bp, re.S)
        para = clean(para.group(1)) if para else ''
        points = [clean(x) for x in find_all(r'<li[^>]*>(.*?)</li>', bp)]
        warn = re.search(r'<div class="warn">(.*?)</div>', bp, re.S)
        if warn:
            wi = warn.group(1)
            wb = re.search(r'<b[^>]*>(.*?)</b>', wi, re.S)
            wlabel = clean(wb.group(1)) if wb else '常见错误'
            wtext = clean(re.sub(r'<b[^>]*>.*?</b>', '', wi, flags=re.S))
        else:
            wlabel, wtext = '', ''

        mods.append(dict(
            id='%s-%s' % (gid, num), num=num, name=mname, en=men, alias=malias,
            desc=mdesc, meta=mmeta, video=video,
            dur=float(dur.group(1)) if dur else 0,
            segs=segs, legend=legend, keys=keys,
            para=para, points=points, warnLabel=wlabel, warn=wtext,
        ))

    c.update(title=title, fullAlias=full_alias, gdesc=gdesc, gmeta=gmeta, modules=mods)
    games.append(c)

total = sum(len(g['modules']) for g in games)
js = ['// 由 tools/extract_data.py 从 drill-index-prototype.html 自动抽取，请勿手改。',
      '// 增删音游 / 模块只需编辑本文件。',
      '// 使用经典脚本（非 ES 模块），以便 file:// 直接打开也能运行。', '',
      'window.DRILL_DATA = ' + json.dumps(games, ensure_ascii=False, indent=2) + ';', '']
io.open(os.path.join(OUT_DIR, 'games.js'), 'w', encoding='utf-8').write('\n'.join(js))

print('games: %d   modules: %d' % (len(games), total))
for g in games:
    print('  %-10s %-9s %-8s %d 模块  %s' % (g['id'], g['title'], g['fullAlias'],
                                              len(g['modules']), g['accent']))
