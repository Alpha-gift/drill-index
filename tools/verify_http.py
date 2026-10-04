# -*- coding: utf-8 -*-
"""drill-app 验收：路由 + 交互链路。

用 HTTP 托管（最接近真实部署），页面把检查结果 POST 回来，
最后读**纯文本**做断言 —— 不读截图。

两条重要设计决定：
  1. **每条用例独立冷启动**（单独开一个浏览器实例 + 全新 profile）。
     否则导航高亮会从前一条用例带过来（比如先访问 #/me 再访问 #/g/arcaea，
     高亮合理地停在「我的」），让期望值变得不确定。
  2. 不读截图。无头浏览器的截图有缩放/裁切问题（请求 390 宽时真实排版
     视口可能是 496，截图却按 390 裁），缩略后数字也容易看错。

依赖：web-ui-headless-verify 技能里的 report_server.py（仅标准库）。
用法：
    python tools/verify_http.py [--keep] [--only route]
"""
import argparse, io, json, os, shutil, socket, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'drill-app')
TMP = os.path.join(os.environ.get('TEMP', r'C:\Windows\Temp'), 'drill-verify')
PORT = 8791
BASE = 'http://127.0.0.1:%d' % PORT
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
SERVER = r'C:\Users\Andy\.workbuddy\skills\web-ui-headless-verify\scripts\report_server.py'
PY = sys.executable

# ---------------- 用例 ----------------
# routes：(名称, 路由, 期望的导航高亮)  —— 都从冷启动访问
ROUTES = [
    ('home',    '#/',                     'home'),
    ('train',   '#/train',                'train'),
    ('goal',    '#/t/tapflick',           'train'),
    ('codex',   '#/codex',                'codex'),
    ('family',  '#/k/hold',               'codex'),
    ('me',      '#/me',                   'me'),
    ('game',    '#/g/arcaea',             'home'),
    ('module',  '#/m/arcaea-01',          'home'),
    ('search',  '#/s/%E5%8F%8C%E6%8A%BC', 'home'),
    ('bogus',   '#/t/does-not-exist',     'home'),   # 无效 id 必须优雅降级
]

# flows：(名称, 步骤, 期望导航, 期望最终 hash, 期望收藏数)
# 步骤写法：'#/路由' 设置 hash；'click:选择器' 点击；'back' 后退
FLOWS = [
    ('点音游卡进详情',    ['#/', 'click:#view .gamecard'],                    'home',  '#/g/phigros',   0),
    ('图鉴判定行进音游',   ['#/codex', 'click:#view .jrow'],                  'codex', '#/g/phigros',   0),
    ('切标签到图鉴',      ['#/', 'click:.tab[data-tab="codex"]'],             'codex', '#/codex',       0),
    ('训练点目标再点模块',  ['#/train', 'click:#view .goal', 'click:#view .modcard'], 'train', '#/m/phigros-01', 0),
    ('模块页按返回',      ['#/g/phigros', 'click:#view .modcard', 'back'],     'home',  '#/g/phigros',   0),
    ('模块页加收藏',      ['#/m/phigros-01', 'click:[data-fav]'],             'home',  '#/m/phigros-01', 1),
    ('收藏后回我的看列表',  ['#/m/arcaea-01', 'click:[data-fav]', '#/me'],       'me',    '#/me',          1),
    ('拨动效开关',        ['#/me', 'click:[data-act="toggle-motion"]'],       'me',    '#/me',          0),
    ('拨大字号开关',      ['#/me', 'click:[data-act="toggle-bigtype"]'],      'me',    '#/me',          0),
]

REPORTER = """
<script>
(function(){
  var c = CASES[parseInt((location.search.match(/[?&]c=(\\d+)/) || [0,0])[1], 10)];
  var errs = [];
  window.addEventListener('error', function(e){ errs.push(String(e.message)); });
  try { localStorage.clear(); } catch(e){}          // 每条用例独立，避免互相污染

  function state(){
    var on = document.querySelectorAll('.tab.on');
    var h = document.querySelector('#view .section-title, #view h1, #view h2');
    var favs = [];
    try { favs = JSON.parse(localStorage.getItem('drill.favs') || '[]'); } catch(e){}
    return {
      tag: c.tag,
      hash: decodeURIComponent(location.hash || '#/'),
      activeTab: on.length ? on[0].dataset.tab : null,
      activeTabCount: on.length,
      modcards: document.querySelectorAll('#view .modcard').length,
      gamecards: document.querySelectorAll('#view .gamecard').length,
      goalcards: document.querySelectorAll('#view .goal').length,
      firstHeading: h ? h.textContent.trim().slice(0, 30) : '(空)',
      favCount: favs.length,
      noAnim: document.documentElement.classList.contains('no-anim'),
      bigType: document.documentElement.classList.contains('big-type'),
      errors: errs.slice()
    };
  }

  var k = 0;
  (function step(){
    if (k >= c.steps.length) {
      setTimeout(function(){
        fetch('/__report?tag=' + encodeURIComponent(c.tag),
              {method:'POST', body: JSON.stringify(state(), null, 2)});
      }, 400);
      return;
    }
    var s = c.steps[k++];
    try {
      if (s.indexOf('click:') === 0) {
        var el = document.querySelector(s.slice(6));
        if (!el) { errs.push('找不到元素 ' + s.slice(6)); }
        else { el.click(); }
      } else if (s === 'back') {
        history.back();
      } else {
        location.hash = s;
      }
    } catch (e) { errs.push('步骤抛错: ' + e.message); }
    setTimeout(step, 380);
  })();
})();
</script>
"""


def wait_port(port, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        s = socket.socket(); s.settimeout(0.4)
        ok = s.connect_ex(('127.0.0.1', port)) == 0
        s.close()
        if ok:
            return True
        time.sleep(0.25)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['route', 'flow'], help='只跑其中一类')
    ap.add_argument('--keep', action='store_true', help='保留临时目录便于排查')
    a = ap.parse_args()

    if not os.path.isfile(SERVER):
        sys.exit('找不到 report_server.py：' + SERVER)
    if not os.path.isfile(EDGE):
        sys.exit('找不到 Edge：' + EDGE)

    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP, exist_ok=True)
    reports = os.path.join(TMP, 'reports')
    os.makedirs(reports, exist_ok=True)

    # 组装用例
    cases, expect = [], {}
    if a.only != 'flow':
        for n, h, w in ROUTES:
            cases.append({'tag': 'route-' + n, 'steps': [h]})
            expect['route-' + n] = dict(nav=w, hash=None, fav=None, bigType=None, noAnim=None)
    if a.only != 'route':
        for i, (label, st, w, eh, fav) in enumerate(FLOWS):
            tag = 'flow-%d' % (i + 1)
            cases.append({'tag': tag, 'steps': st})
            expect[tag] = dict(nav=w, hash=eh, fav=fav, label=label,
                               noAnim=True if 'toggle-motion' in ' '.join(st) else None,
                               bigType=True if 'toggle-bigtype' in ' '.join(st) else None)

    # 托管 + 报告收集
    srv = subprocess.Popen([PY, SERVER, '--root', APP, '--port', str(PORT),
                            '--out', reports, '--quiet'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not wait_port(PORT):
        srv.terminate()
        sys.exit('本地服务启动失败（端口 %d）' % PORT)

    # 生成单页（用例由 ?c=N 选择；CASES 在应用脚本之前声明）
    page = os.path.join(APP, '__verify.html')
    html = io.open(os.path.join(APP, 'index.html'), encoding='utf-8').read()
    io.open(page, 'w', encoding='utf-8').write(
        html.replace('<script src="src/data/games.js"></script>',
                     '<script>var CASES = %s;</script>\n<script src="src/data/games.js"></script>'
                     % json.dumps(cases))
            .replace('</body>', REPORTER + '</body>'))

    print('用例 %d 条，逐条冷启动浏览器\n' % len(cases))

    fails = []
    try:
        for i, c in enumerate(cases):
            tag = c['tag']
            prof = os.path.join(TMP, 'prof%d' % i)
            out = os.path.join(reports, tag + '.txt')
            if os.path.exists(out):
                os.remove(out)

            proc = subprocess.Popen(
                [EDGE, '--headless=new', '--disable-gpu', '--no-first-run',
                 '--hide-scrollbars', '--user-data-dir=' + prof,
                 '--window-size=520,900',
                 '%s/__verify.html?c=%d' % (BASE, i)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            deadline = time.time() + 24
            while time.time() < deadline and not os.path.exists(out):
                time.sleep(0.35)
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
            shutil.rmtree(prof, ignore_errors=True)

            if not os.path.exists(out):
                fails.append((tag, '超时，没有收到报告'))
                print('%-14s ✗ 没有报告' % tag)
                continue

            d = json.loads(io.open(out, encoding='utf-8').read().split('\n', 1)[1])
            e = expect[tag]
            bad = []
            if d['activeTab'] != e['nav']:
                bad.append('导航=%s 期望=%s' % (d['activeTab'], e['nav']))
            if d['activeTabCount'] != 1:
                bad.append('高亮数=%d 期望=1' % d['activeTabCount'])
            if e['hash'] and d['hash'] != e['hash']:
                bad.append('hash=%s 期望=%s' % (d['hash'], e['hash']))
            if e['fav'] is not None and d['favCount'] != e['fav']:
                bad.append('收藏数=%d 期望=%d' % (d['favCount'], e['fav']))
            if e['noAnim'] and not d['noAnim']:
                bad.append('动效开关没生效')
            if e['bigType'] and not d['bigType']:
                bad.append('大字号开关没生效')
            if d['errors']:
                bad.append('JS 报错：%s' % d['errors'])

            label = e.get('label') or tag
            if bad:
                fails.append((tag, '；'.join(bad)))
            print('%-14s %-18s nav=%-6s 高亮=%d 模块卡=%-2d 游戏卡=%-2d 目标卡=%-2d 收藏=%-2d 报错=%-5s %s'
                  % (tag, label, d['activeTab'], d['activeTabCount'], d['modcards'],
                     d['gamecards'], d['goalcards'], d['favCount'],
                     d['errors'] or '无', '✓' if not bad else '✗'))
    finally:
        srv.terminate()
        if os.path.exists(page):
            os.remove(page)
        shutil.rmtree(os.path.join(TMP, 'reports'), ignore_errors=True)
        if not a.keep:
            shutil.rmtree(TMP, ignore_errors=True)

    print()
    if fails:
        print('❌ %d 项不通过：' % len(fails))
        for t, why in fails:
            print('   %-14s %s' % (t, why))
    else:
        print('✅ 全部通过（%d 条用例），全程零 JS 报错' % len(cases))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
