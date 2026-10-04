/* ============================================================
   站内播放器 · 移动端
   - 进入模块页面自动播放（静音，符合移动端自动播放策略）
   - 可拖动进度、组合分段跳转、全屏播放（尝试锁定横屏）
   经典脚本，挂到 window.DrillPlayer。
   ============================================================ */
(function () {
  'use strict';

  var ICON = {
    play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5.5" width="3.6" height="13" rx="1"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1"/></svg>',
    expand:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  function fmt(s) {
    s = Math.max(0, s | 0);
    return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function buildStage(mod) {
    var el = document.createElement('div');
    el.className = 'stage anim';

    var segs = (mod.segs || []).map(function (s) {
      return '<button class="seg" data-t="' + s.t + '">' + esc(s.label) + '</button>';
    }).join('');

    var legend = (mod.legend || []).map(function (l) {
      var i = l.text.indexOf('：');
      var head = i >= 0 ? l.text.slice(0, i) : l.text;
      var tail = i >= 0 ? l.text.slice(i) : '';
      return '<span class="' + (l.kind === 'hit' ? 'hit' : 'miss') + '"><i></i>' +
             '<span><b>' + esc(head) + '</b>' + esc(tail) + '</span></span>';
    }).join('');

    el.innerHTML =
      '<div class="vwrap">' +
        '<video src="' + mod.video + '" poster="media/posters/' + mod.id + '.jpg" muted loop ' +
               'playsinline preload="metadata" disablepictureinpicture></video>' +
        '<button class="expand" aria-label="全屏播放">' + ICON.expand + '</button>' +
      '</div>' +
      '<div class="pscrub">' +
        '<button class="playbtn" aria-label="播放或暂停">' + ICON.play + '</button>' +
        '<div class="track"><span class="rail"></span><span class="fill"></span><span class="knob"></span></div>' +
        '<span class="ptime">0:00</span>' +
      '</div>' +
      (segs ? '<div class="segs">' + segs + '</div>' : '') +
      (legend ? '<div class="legend">' + legend + '</div>' : '');

    var v = el.querySelector('video');
    var btn = el.querySelector('.playbtn');
    var track = el.querySelector('.track');
    var fill = el.querySelector('.fill');
    var knob = el.querySelector('.knob');
    var time = el.querySelector('.ptime');
    var segEls = [].slice.call(el.querySelectorAll('.seg'));

    function toggle() { v.paused ? v.play() : v.pause(); }
    btn.addEventListener('click', toggle);
    v.addEventListener('click', toggle);

    function sync() {
      var d = v.duration || mod.dur || 0;
      var r = d ? Math.min(1, v.currentTime / d) : 0;
      fill.style.width = knob.style.left = (r * 100) + '%';
      time.textContent = fmt(v.currentTime);
      btn.innerHTML = v.paused ? ICON.play : ICON.pause;
      var active = -1;
      segEls.forEach(function (b, i) {
        if (v.currentTime >= parseFloat(b.dataset.t)) active = i;
      });
      segEls.forEach(function (b, i) { b.classList.toggle('on', i === active); });
    }
    v.addEventListener('timeupdate', sync);
    v.addEventListener('loadedmetadata', sync);
    sync();

    var dragging = false;
    function seek(clientX) {
      var r = track.getBoundingClientRect();
      var x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      var d = v.duration || mod.dur || 0;
      if (d) v.currentTime = x * d;
      sync();
    }
    track.addEventListener('pointerdown', function (e) {
      dragging = true;
      if (track.setPointerCapture) { try { track.setPointerCapture(e.pointerId); } catch (_) {} }
      seek(e.clientX);
    });
    track.addEventListener('pointermove', function (e) { if (dragging) seek(e.clientX); });
    track.addEventListener('pointerup', function () { dragging = false; });
    track.addEventListener('pointercancel', function () { dragging = false; });

    segEls.forEach(function (b) {
      b.addEventListener('click', function () {
        v.currentTime = parseFloat(b.dataset.t);
        v.play();
      });
    });

    /* ---- 全屏 ---- */
    var fs = null;
    el.querySelector('.expand').addEventListener('click', function () {
      fs = document.createElement('div');
      fs.className = 'fsplayer open';
      fs.innerHTML =
        '<video src="' + mod.video + '" controls autoplay muted playsinline></video>' +
        '<button class="close" aria-label="关闭">' + ICON.close + '</button>' +
        '<span class="rotate-hint">横屏观看效果更佳</span>';
      document.body.appendChild(fs);
      var fv = fs.querySelector('video');
      fv.currentTime = v.currentTime;

      function close() {
        v.currentTime = fv.currentTime;
        try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (_) {}
        if (fs) { fs.remove(); fs = null; }
        v.pause();
      }
      fs.querySelector('.close').addEventListener('click', close);
      document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
      });
      try {
        if (screen.orientation && screen.orientation.lock) {
          var p = screen.orientation.lock('landscape');
          if (p && p.catch) p.catch(function () {});
        }
      } catch (_) {}
    });

    return {
      el: el,
      start: function () {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      },
      stop: function () {
        v.pause();
        if (fs) { fs.remove(); fs = null; }
      }
    };
  }

  window.DrillPlayer = { buildStage: buildStage, esc: esc };
})();
