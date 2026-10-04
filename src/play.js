/* ============================================================
   打歌练习 · 核心（Phigros 判定规则 + 程序实时生成谱面）

   - window.DRILL_PLAY：可玩模块注册表。
     以后要把练习推广到其他模块，只需在这里按模块 id 登记一份
     配置（轨道数 / 按键 / 难度档 / 生成器类型），模块详情页会
     自动出现「开始练习」入口，路由 #/play/:id 即可进入。
   - window.DrillPlay.start(container, modId, meta)：进入打歌页
   - window.DrillPlay.clear()：离开路由时完整销毁
     （rAF / 计时器 / AudioContext / 事件监听 / DOM），
     由 app.js 的 clearPlay() 在每次 route() 开头调用。

   经典脚本，无构建步骤，file:// 直接打开可运行。
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     可玩模块注册表
     ============================================================ */
  var DRILL_PLAY = {
    /* 楼梯（phigros-05） */
    'phigros-05': {
      kind: 'stairs',                    // 谱面生成器类型（见 CHARTERS）
      title: '楼梯 · 实战练习',
      subtitle: '程序实时生成谱面',
      lanes: 5,                          // 轨道数
      keys: ['d', 'f', 'j', 'k', 'l'],   // 键盘映射（KeyboardEvent.key，小写）
      keyLabels: ['D', 'F', 'J', 'K', 'L'],
      seed: 20240505,                    // 随机种子：同一难度谱面固定，便于反复练习
      judge: { perfect: 80, good: 150 }, // 判定窗（毫秒，仿 Phigros）
      levels: [
        { name: '入门', lv: 'LV.4',  bpm: 96,  div: 2, seconds: 40, approach: 1200 },
        { name: '标准', lv: 'LV.9',  bpm: 132, div: 2, seconds: 50, approach: 1050 },
        { name: '进阶', lv: 'LV.13', bpm: 150, div: 4, seconds: 50, approach: 900 }
      ]
    }
  };

  /* ============================================================
     带种子伪随机（mulberry32）：同一 seed 产出同一序列
     ============================================================ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ============================================================
     谱面生成器注册表
     约定：返回按时间升序的 [{ t, lane, judged, result }]，
     t 为相对打歌开始的毫秒数。
     ============================================================ */
  var CHARTERS = {
    /* 楼梯：音符依次落在相邻轨道（上行 / 下行 / 到边折返成锯齿），
       由种子决定每段方向与起始轨，偶尔休止一步并重起一段。 */
    stairs: function (cfg, level, levelIdx) {
      var rand = mulberry32(cfg.seed + levelIdx * 9973);
      var step = 60000 / level.bpm / level.div;         // div: 2=八分 4=十六分
      var total = Math.max(8, Math.round(level.seconds * 1000 / step));
      var notes = [];
      var lane = Math.floor(rand() * cfg.lanes);
      var dir = rand() < 0.5 ? -1 : 1;
      var LEAD = 2000;                                   // 谱面开头留白（毫秒）
      for (var i = 0; i < total; i++) {
        notes.push({ t: LEAD + i * step, lane: lane, judged: false, result: null });
        if (rand() < 0.10) {                             // 休止一步，之后可能换起点重起
          i++;
          if (rand() < 0.65) {
            lane = Math.floor(rand() * cfg.lanes);
            dir = rand() < 0.5 ? -1 : 1;
          }
        } else {                                         // 前进一级，撞墙即折返
          lane += dir;
          if (lane < 0 || lane >= cfg.lanes) { dir = -dir; lane += dir * 2; }
        }
      }
      return notes;
    }
  };

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function hexA(hex, a) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) || 0;
    var g = parseInt(h.slice(2, 4), 16) || 0;
    var b = parseInt(h.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  var MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

  /* ============================================================
     会话管理（同时只允许一个打歌会话）
     ============================================================ */
  var session = null;

  function clear() {
    if (session) { session.destroy(); session = null; }
  }
  function has(id) { return !!DRILL_PLAY[id]; }

  /* ============================================================
     开启一局打歌
     container：挂载点（app.js 传入 #view）
     modId：模块 id（查 DRILL_PLAY 注册表）
     meta：{ title, gameTitle } 展示用
     ============================================================ */
  function start(container, modId, meta) {
    clear();                                             // 保底：先销毁残留会话
    var cfg = DRILL_PLAY[modId];
    if (!cfg) return null;
    meta = meta || {};
    var J = cfg.judge;

    /* ---------- DOM ---------- */
    var root = document.createElement('div');
    root.className = 'playscreen';
    root.innerHTML =
      '<canvas class="playcv"></canvas>' +
      '<div class="play-top">' +
        '<button class="pt-back" aria-label="返回">' + ICON_BACK + '</button>' +
        '<span class="pt-title">' + esc(meta.gameTitle || '') + ' · ' + esc(meta.title || cfg.title) + '</span>' +
      '</div>' +
      '<div class="play-ov" data-ov="start"></div>' +
      '<div class="play-ov" data-ov="result"></div>';
    container.appendChild(root);

    var cv = root.querySelector('.playcv');
    var ctx = cv.getContext('2d');
    var topBar = root.querySelector('.play-top');
    var ovStart = root.querySelector('[data-ov="start"]');
    var ovResult = root.querySelector('[data-ov="result"]');

    /* ---------- 状态 ---------- */
    var W = 0, H = 0, DPR = 1;
    var state = 'ready';            // ready | count | run | done
    var levelIdx = 0;
    var notes = [];
    var totalNotes = 0;
    var scanIdx = 0;                // 判定/绘制扫描起点（音符按时间升序）
    var runT0 = 0;                  // 打歌开始时刻（performance.now）
    var countT0 = 0;                // 倒计时开始时刻
    var raf = 0;
    var timers = [];
    var combo = 0, maxCombo = 0;
    var nPerfect = 0, nGood = 0, nMiss = 0;
    var judged = 0, judgeSum = 0;   // judgeSum：Perfect=1 / Good=.65 / Miss=0
    var rings = [];                 // 判定环特效 [{lane,t0,kind}]
    var texts = [];                 // 判定文字特效 [{lane,t0,kind}]
    var presses = {};               // 轨道按下高亮 {lane: 高亮截止时刻}
    var destroyed = false;
    var exited = false;
    var accent = getAccent();

    function getAccent() {
      var v = '';
      try {
        v = getComputedStyle(document.documentElement).getPropertyValue('--accent');
      } catch (e) {}
      return (v || '').trim() || '#9EFF00';
    }

    /* ---------- 音频：WebAudio 现场合成，不引外部文件 ---------- */
    var AC = null;
    function ensureAudio() {
      if (!AC) {
        try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { AC = null; }
      }
      /* 无用户手势时可能被挂起，首次交互时恢复 */
      if (AC && AC.state === 'suspended' && AC.resume) { AC.resume(); }
    }
    function blip(freq, dur, vol, type) {
      if (!AC) return;
      try {
        var t = AC.currentTime;
        var o = AC.createOscillator();
        var g = AC.createGain();
        o.type = type || 'triangle';
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(AC.destination);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    }
    function hitSound(lane, kind) {
      var base = 620 + lane * 90;
      if (kind === 'perfect') blip(base * 1.5, 0.09, 0.22, 'triangle');
      else if (kind === 'good') blip(base, 0.08, 0.16, 'triangle');
      else blip(130, 0.12, 0.16, 'sawtooth');
    }
    function tapSound(lane) { blip(480 + lane * 60, 0.05, 0.07, 'square'); }

    /* ---------- 尺寸 ---------- */
    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = root.clientWidth; H = root.clientHeight;
      cv.width = Math.max(1, Math.round(W * DPR));
      cv.height = Math.max(1, Math.round(H * DPR));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function laneW() { return W / cfg.lanes; }
    function judgeY() { return Math.round(H * 0.86); }   // 判定线在底部约 14% 处
    function hudY() { return topBar.offsetHeight + 26; } // HUD 顶行，避开返回栏
    function laneFromX(x) {
      var l = Math.floor(x / laneW());
      return Math.max(0, Math.min(cfg.lanes - 1, l));
    }

    /* ---------- 覆盖层 ---------- */
    function showOv(el) { el.classList.add('show'); }
    function hideOv(el) { el.classList.remove('show'); }

    function renderStart() {
      ovStart.innerHTML =
        '<div class="play-panel">' +
          '<div class="pp-kicker">PRACTICE</div>' +
          '<h2 class="pp-title">' + esc(cfg.title) + '</h2>' +
          '<p class="pp-desc">音符沿相邻轨道逐级跑动，落到判定线时击键。' +
            'Perfect ±' + J.perfect + 'ms · Good ±' + J.good + 'ms，超窗或漏击记 Miss。</p>' +
          '<div class="pp-levels">' +
            cfg.levels.map(function (lv, i) {
              return '<button class="pp-lv' + (i === levelIdx ? ' on' : '') + '" data-lv="' + i + '">' +
                '<b>' + esc(lv.name) + '</b><span>' + esc(lv.lv) + ' · ' + lv.bpm + ' BPM</span></button>';
            }).join('') +
          '</div>' +
          '<div class="pp-keys">触屏：直接点按轨道 · 键盘：' +
            cfg.keyLabels.join(' ') + '（或数字 1-' + cfg.lanes + '）</div>' +
          '<button class="pp-go">开始练习</button>' +
        '</div>';
      showOv(ovStart);
    }

    function renderResult() {
      var acc = totalNotes ? judgeSum / totalNotes : 0;
      var score = totalNotes
        ? Math.round(900000 * acc + 100000 * (maxCombo / totalNotes))
        : 0;
      var rank =
        acc >= 1 ? 'φ' :
        acc >= 0.96 ? 'V' :
        acc >= 0.92 ? 'S' :
        acc >= 0.88 ? 'A' :
        acc >= 0.80 ? 'B' :
        acc >= 0.70 ? 'C' : 'F';
      ovResult.innerHTML =
        '<div class="play-panel">' +
          '<div class="pp-kicker">RESULT</div>' +
          '<div class="pp-rank">' + rank + '</div>' +
          '<div class="pp-score">' + String(score).padStart(7, '0') + '</div>' +
          '<div class="pp-acc">ACC ' + (acc * 100).toFixed(2) + '% · 最大连击 ' + maxCombo +
            (nMiss === 0 ? ' · <em class="pp-fc">FULL COMBO</em>' : '') + '</div>' +
          '<div class="pp-grid">' +
            '<div class="cell"><b style="color:var(--accent)">' + nPerfect + '</b><span>PERFECT</span></div>' +
            '<div class="cell"><b>' + nGood + '</b><span>GOOD</span></div>' +
            '<div class="cell"><b style="color:var(--fg-3)">' + nMiss + '</b><span>MISS</span></div>' +
          '</div>' +
          '<button class="pp-go" data-retry>再来一次</button>' +
          '<div class="pp-row">' +
            '<button class="pp-ghost" data-change>换难度</button>' +
            '<button class="pp-ghost" data-exit>返回</button>' +
          '</div>' +
        '</div>';
      showOv(ovResult);
    }

    /* ---------- 流程 ---------- */
    function resetState() {
      var gen = CHARTERS[cfg.kind] || CHARTERS.stairs;
      notes = gen(cfg, cfg.levels[levelIdx], levelIdx);
      totalNotes = notes.length;
      scanIdx = 0;
      combo = 0; maxCombo = 0;
      nPerfect = 0; nGood = 0; nMiss = 0;
      judged = 0; judgeSum = 0;
      rings.length = 0; texts.length = 0;
      for (var k in presses) delete presses[k];
    }

    function beginCountdown() {
      ensureAudio();
      hideOv(ovStart); hideOv(ovResult);
      timers.forEach(clearTimeout); timers.length = 0;
      resetState();
      state = 'count';
      countT0 = performance.now();
      for (var i = 0; i < 3; i++) {
        (function (i) {
          timers.push(setTimeout(function () { blip(880, 0.07, 0.18, 'square'); }, i * 800));
        })(i);
      }
      timers.push(setTimeout(function () {
        blip(1320, 0.1, 0.22, 'square');
        state = 'run';
        runT0 = performance.now();
      }, 2400));
    }

    function finish() {
      state = 'done';
      renderResult();
      blip(660, 0.16, 0.18, 'triangle');
      timers.push(setTimeout(function () { blip(990, 0.2, 0.18, 'triangle'); }, 140));
    }

    function exit() {
      if (exited) return;
      exited = true;
      /* 由 hash 变化触发 route() → clearPlay() 完成销毁 */
      if (history.length > 1) history.back();
      else location.hash = '#/m/' + modId;
    }

    /* ---------- 判定 ---------- */
    function applyJudge(n, kind, lane, silent) {
      n.judged = true; n.result = kind;
      judged++;
      if (kind === 'perfect') { nPerfect++; judgeSum += 1; combo++; }
      else if (kind === 'good') { nGood++; judgeSum += 0.65; combo++; }
      else { nMiss++; combo = 0; }
      if (combo > maxCombo) maxCombo = combo;
      texts.push({ lane: lane, t0: performance.now(), kind: kind });
      if (kind !== 'miss') rings.push({ lane: lane, t0: performance.now(), kind: kind });
      if (!silent) hitSound(lane, kind);
    }

    function press(lane) {
      if (state !== 'run') return;
      presses[lane] = performance.now() + 120;
      var t = performance.now() - runT0;
      /* 找该轨道内判定窗中最近的未判定音符 */
      var best = -1, bestD = Infinity;
      for (var i = scanIdx; i < notes.length; i++) {
        var n = notes[i];
        if (n.t - t > J.good) break;                     // 后面的更远，提前退出
        if (n.judged || n.lane !== lane) continue;
        var d = Math.abs(t - n.t);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0 && bestD <= J.good) {
        applyJudge(notes[best], bestD <= J.perfect ? 'perfect' : 'good', lane, false);
      } else {
        tapSound(lane);                                  // 空击：只给反馈音，不罚分
      }
    }

    /* ---------- 每帧更新 ---------- */
    function update(now) {
      if (state === 'run') {
        var t = now - runT0;
        while (scanIdx < notes.length && notes[scanIdx].judged) scanIdx++;
        /* 漏击：越过 Good 窗仍未击中 */
        for (var i = scanIdx; i < notes.length; i++) {
          var n = notes[i];
          if (t - n.t <= J.good) break;
          if (!n.judged) applyJudge(n, 'miss', n.lane, true);
        }
        while (scanIdx < notes.length && notes[scanIdx].judged) scanIdx++;
        var last = notes[notes.length - 1];
        if (last && t > last.t + 1200) finish();
      }
      /* 清理过期特效与按下高亮 */
      rings = rings.filter(function (r) { return now - r.t0 < 450; });
      texts = texts.filter(function (x) { return now - x.t0 < 600; });
      for (var k in presses) { if (presses[k] < now) delete presses[k]; }
    }

    /* ---------- 绘制 ---------- */
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawNote(lane, y, lw) {
      var pad = Math.max(6, lw * 0.08);
      var x = lane * lw + pad;
      var w = lw - pad * 2;
      var h = 14;
      ctx.save();
      ctx.shadowColor = accent; ctx.shadowBlur = 14;
      ctx.fillStyle = accent;
      roundRect(x, y - h / 2, w, h, 6);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      roundRect(x + 2, y - h / 2 + 2, w - 4, 3, 1.5);
      ctx.fill();
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var lw = laneW();
      var jy = judgeY();
      var i;

      /* 轨道分隔线 */
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 1;
      for (i = 1; i < cfg.lanes; i++) {
        ctx.beginPath();
        ctx.moveTo(i * lw + 0.5, 0);
        ctx.lineTo(i * lw + 0.5, H);
        ctx.stroke();
      }

      /* 按下高亮（判定线上方的渐变光带） */
      for (i = 0; i < cfg.lanes; i++) {
        if (presses[i]) {
          var g = ctx.createLinearGradient(0, jy - 150, 0, jy + 20);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(1, hexA(accent, 0.22));
          ctx.fillStyle = g;
          ctx.fillRect(i * lw + 1, jy - 150, lw - 2, 170);
        }
      }

      /* 判定线（霓虹发光） */
      ctx.save();
      ctx.shadowColor = accent; ctx.shadowBlur = 12;
      ctx.fillStyle = accent;
      ctx.fillRect(0, jy - 1.5, W, 3);
      ctx.restore();

      /* 音符（匀速下落，t 时刻正好触线） */
      if (state === 'run' || state === 'done') {
        var t = now - runT0;
        var approach = cfg.levels[levelIdx].approach;
        for (i = scanIdx; i < notes.length; i++) {
          var n = notes[i];
          var dt = n.t - t;
          if (dt > approach) break;
          if (n.judged) continue;
          var y = jy - (dt / approach) * (jy + 24);
          if (y < -20) continue;
          drawNote(n.lane, y, lw);
        }
      }

      /* 判定环 */
      rings.forEach(function (r) {
        var p = (now - r.t0) / 450;
        var cx = r.lane * lw + lw / 2;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1 + 3 * (1 - p);
        ctx.beginPath();
        ctx.arc(cx, jy, 12 + p * 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      /* 判定文字 */
      texts.forEach(function (x) {
        var p = (now - x.t0) / 600;
        var cx = x.lane * lw + lw / 2;
        var label = x.kind === 'perfect' ? 'PERFECT' : x.kind === 'good' ? 'GOOD' : 'MISS';
        ctx.save();
        ctx.globalAlpha = p < 0.7 ? 1 : Math.max(0, (1 - p) / 0.3);
        ctx.fillStyle = x.kind === 'perfect' ? accent : x.kind === 'good' ? '#9ECBFF' : '#8A8A8A';
        ctx.font = '700 ' + Math.max(13, Math.round(lw * 0.11)) + 'px ' + MONO;
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, jy - 34 - p * 26);
        ctx.restore();
      });

      /* HUD：分数 / 准确率 / 连击 / 进度 */
      if (state === 'run' || state === 'done') {
        var hy = hudY();
        var accNow = judged ? judgeSum / judged : 1;
        var scoreNow = totalNotes
          ? Math.round(900000 * (judgeSum / totalNotes) + 100000 * (maxCombo / totalNotes))
          : 0;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 20px ' + MONO;
        ctx.fillText(String(scoreNow).padStart(7, '0'), 14, hy);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.font = '600 14px ' + MONO;
        ctx.fillText((accNow * 100).toFixed(2) + '%', W - 14, hy);
        if (combo >= 3) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 32px ' + MONO;
          ctx.fillText(String(combo), W / 2, hy + 36);
          ctx.fillStyle = 'rgba(255,255,255,.5)';
          ctx.font = '600 10px ' + MONO;
          ctx.fillText('COMBO', W / 2, hy + 50);
        }
        var last = notes[notes.length - 1];
        var prog = last ? Math.min(1, Math.max(0, (now - runT0) / (last.t + 200))) : 0;
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(0, 0, W, 3);
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, W * prog, 3);
      }

      /* 倒计时 3-2-1 */
      if (state === 'count') {
        var el = now - countT0;
        var n = 3 - Math.floor(el / 800);
        if (n >= 1) {
          var frac = (el % 800) / 800;
          ctx.save();
          ctx.globalAlpha = 1 - frac * 0.8;
          ctx.fillStyle = accent;
          ctx.font = '800 84px ' + MONO;
          ctx.textAlign = 'center';
          ctx.fillText(String(n), W / 2, H / 2);
          ctx.restore();
        }
      }

      /* 底部键位提示 */
      ctx.font = '600 11px ' + MONO;
      ctx.textAlign = 'center';
      for (i = 0; i < cfg.lanes; i++) {
        ctx.fillStyle = presses[i] ? accent : 'rgba(255,255,255,.28)';
        ctx.fillText(cfg.keyLabels[i], i * lw + lw / 2, Math.min(H - 14, jy + 44));
      }
    }

    /* ---------- 主循环 ---------- */
    function frame(now) {
      if (destroyed) return;
      update(now);
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    /* ---------- 输入：触屏 / 鼠标 / 键盘 ---------- */
    function onTouch(e) {
      e.preventDefault();                                // 阻止滚动与鼠标事件仿真
      ensureAudio();
      var rect = cv.getBoundingClientRect();
      for (var i = 0; i < e.changedTouches.length; i++) {
        press(laneFromX(e.changedTouches[i].clientX - rect.left));
      }
    }
    function onMouse(e) {
      ensureAudio();
      var rect = cv.getBoundingClientRect();
      press(laneFromX(e.clientX - rect.left));
    }
    cv.addEventListener('touchstart', onTouch, { passive: false });
    cv.addEventListener('mousedown', onMouse);

    var keyMap = {};
    cfg.keys.forEach(function (k, i) { keyMap[k] = i; });
    for (var d = 1; d <= cfg.lanes; d++) keyMap[String(d)] = d - 1;
    function onKey(e) {
      if (e.key === 'Escape') { exit(); return; }
      if (e.repeat) return;
      var lane = keyMap[(e.key || '').toLowerCase()];
      if (lane == null) return;
      ensureAudio();
      press(lane);
    }
    window.addEventListener('keydown', onKey);

    /* ---------- 覆盖层按钮（事件委托在 root 上，随 DOM 一起销毁） ---------- */
    root.addEventListener('click', function (e) {
      var lvBtn = e.target.closest('[data-lv]');
      if (lvBtn) {
        levelIdx = parseInt(lvBtn.dataset.lv, 10) || 0;
        ensureAudio();
        tapSound(levelIdx);
        renderStart();
        return;
      }
      if (e.target.closest('.pp-go') && !e.target.closest('[data-retry]')) { beginCountdown(); return; }
      if (e.target.closest('[data-retry]')) { beginCountdown(); return; }
      if (e.target.closest('[data-change]')) { hideOv(ovResult); renderStart(); return; }
      if (e.target.closest('[data-exit]')) { exit(); return; }
      if (e.target.closest('.pt-back')) { exit(); return; }
    });

    /* ---------- 销毁：路由离开时由 clear() 调用 ---------- */
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout); timers.length = 0;
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      if (AC) { try { AC.close(); } catch (e) {} AC = null; }
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    session = { destroy: destroy };
    renderStart();
    return session;
  }

  /* ---------- 导出 ---------- */
  window.DRILL_PLAY = DRILL_PLAY;
  window.DrillPlay = { start: start, clear: clear, has: has };
})();
