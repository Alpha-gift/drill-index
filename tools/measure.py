# -*- coding: utf-8 -*-
"""渲染移动端应用并输出真实布局数值（诊断横向溢出）。"""
import io, os, subprocess, shutil, sys

APP = r'D:\闲暇时的创意空间\drill-app'
D = r'C:\Users\Andy\_drillshot'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
os.makedirs(D, exist_ok=True)

WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 430

html = io.open(os.path.join(APP, 'index.html'), encoding='utf-8').read()

probe = """
<script>
(function(){
  function line(k, v){ return k + ' = ' + v + '\\n'; }
  var out = '';
  var vw = document.documentElement.clientWidth;
  out += line('viewport CSS', vw);
  out += line('dpr', window.devicePixelRatio);
  out += line('body.scrollWidth', document.body.scrollWidth);
  out += line('html.scrollWidth', document.documentElement.scrollWidth);
  var view = document.getElementById('view');
  var cs = getComputedStyle(view);
  out += line('view.clientWidth', view.clientWidth);
  out += line('view padding L/R', cs.paddingLeft + ' / ' + cs.paddingRight);
  var card = document.querySelector('.gamecard');
  if (card) {
    var r = card.getBoundingClientRect();
    out += line('gamecard w / right', Math.round(r.width) + ' / ' + Math.round(r.right));
  }
  var stats = document.querySelector('.stats');
  if (stats) {
    var sr = stats.getBoundingClientRect();
    out += line('stats w / right', Math.round(sr.width) + ' / ' + Math.round(sr.right));
    out += line('stat1 w', Math.round(stats.children[0].getBoundingClientRect().width));
    out += line('stat3 right', Math.round(stats.children[2].getBoundingClientRect().right));
    out += line('stats paddingR', getComputedStyle(stats).paddingRight);
  }
  var wide = [];
  var all = document.body.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var b = all[i].getBoundingClientRect();
    if (b.width > 0 && b.right > vw + 1) {
      wide.push((all[i].className || all[i].tagName) + ' right=' + Math.round(b.right) + ' w=' + Math.round(b.width));
    }
  }
  out += line('OVERFLOW COUNT', wide.length);
  out += wide.slice(0, 10).join('\\n');
  var pre = document.createElement('pre');
  pre.setAttribute('id', 'probe');
  pre.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:2147483647;background:#000;' +
    'color:#0f0;font:10px/1.35 monospace;padding:5px;margin:0;white-space:pre-wrap;';
  pre.textContent = out;
  document.body.appendChild(pre);
})();
</script>
"""

dbg = os.path.join(APP, '_dbg.html')
io.open(dbg, 'w', encoding='utf-8').write(html.replace('</body>', probe + '</body>'))

prof = os.path.join(D, 'prof_' + str(WIDTH))
shutil.rmtree(prof, ignore_errors=True)
out_png = os.path.join(D, 'm%d.png' % WIDTH)
if os.path.exists(out_png):
    os.remove(out_png)

subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
                '--user-data-dir=' + prof, '--window-size=%d,900' % WIDTH,
                '--virtual-time-budget=5000', '--screenshot=' + out_png,
                'file:///' + dbg.replace('\\', '/')],
               capture_output=True, timeout=150)

from PIL import Image
im = Image.open(out_png)
print('viewport target %d  ->  screenshot %s' % (WIDTH, im.size))
im.crop((0, 0, im.size[0], min(320, im.size[1]))).resize(
    (im.size[0] * 2, min(320, im.size[1]) * 2), Image.LANCZOS).save(os.path.join(D, 'm%d_zoom.png' % WIDTH))
print('zoom saved:', os.path.join(D, 'm%d_zoom.png' % WIDTH))
