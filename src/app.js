/* ============================================================
   DRILL INDEX · 移动端应用主逻辑
   底部导航四大分区：首页 / 训练 / 图鉴 / 我的

   路由（hash）：
     #/            首页 —— Phigros 入口
     #/train       训练 —— 按「训练目标」横向聚合
     #/t/:id       某个训练目标下的全部模块
     #/codex       图鉴 —— 判定系统速查 + 键型族索引
     #/k/:id       某个键型族下的全部模块
     #/me          我的 —— 收藏 / 偏好 / 存储 / 关于
     #/g/:id       某款音游
     #/m/:id       某个模块详情
     #/play/:id    打歌练习（仅 DRILL_PLAY 注册表支持的模块）
     #/s/:kw       跨音游检索

   经典脚本，无构建步骤。
   ============================================================ */
(function () {
  'use strict';

  var GAMES = window.DRILL_DATA || [];
  var esc = window.DrillPlayer.esc;
  var VERSION = '0.3.0';

  /* ---------- 摊平所有模块，并预生成检索用小写串 ---------- */
  function haystack(g, m) {
    return [m.keys, m.name, m.en, m.alias, m.desc, m.meta,
            g.title, g.alias, g.fullAlias].filter(Boolean).join(' ').toLowerCase();
  }
  var FLAT = [];
  GAMES.forEach(function (g) {
    (g.modules || []).forEach(function (m) {
      FLAT.push({ g: g, m: m, hay: haystack(g, m) });
    });
  });

  /* ============================================================
     横切分类：训练目标 + 键型族
     条目定义在 src/data/topics.js —— 显式维护，可自由增删。
     这里把条目里的模块 id 解析成 {g, m}，并丢弃找不到的 id。
     ============================================================ */
  var TOPICS = window.DRILL_TOPICS || { train: [], family: [] };

  var BY_MOD_ID = {};
  FLAT.forEach(function (it) { BY_MOD_ID[it.m.id] = it; });

  function resolveTopics(list) {
    return (list || []).map(function (t) {
      var hits = [], missing = [];
      (t.mods || []).forEach(function (id) {
        if (BY_MOD_ID[id]) { hits.push(BY_MOD_ID[id]); } else { missing.push(id); }
      });
      if (missing.length && window.console) {
        console.warn('[DRILL INDEX] 分类「' + t.name + '」里有不存在的模块 id：' + missing.join('、'));
      }
      return { id: t.id, name: t.name, en: t.en, accent: t.accent, desc: t.desc, hits: hits };
    });
  }

  var TRAIN = resolveTopics(TOPICS.train);
  var FAMILY = resolveTopics(TOPICS.family);

  /* ============================================================
     偏好与收藏（localStorage）
     ============================================================ */
  var K_FAV = 'drill.favs';
  var K_MOTION = 'drill.motion';
  var K_BIG = 'drill.bigtype';

  function getJSON(key, dflt) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? dflt : JSON.parse(v);
    } catch (e) { return dflt; }
  }
  function setJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function getFavs() { var a = getJSON(K_FAV, []); return Object.prototype.toString.call(a) === '[object Array]' ? a : []; }
  function isFav(id) { return getFavs().indexOf(id) !== -1; }
  function toggleFav(id) {
    var a = getFavs();
    var i = a.indexOf(id);
    if (i < 0) { a.push(id); } else { a.splice(i, 1); }
    setJSON(K_FAV, a);
    return i < 0;
  }

  function applyPrefs() {
    var motion = getJSON(K_MOTION, true);
    var big = getJSON(K_BIG, false);
    document.documentElement.classList.toggle('no-anim', motion === false);
    document.documentElement.classList.toggle('big-type', big === true);
  }

  /* ============================================================
     图标
     ============================================================ */
  var ICONS = {
    back:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    close:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    play:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 6.5v11l9-5.5z"/></svg>',
    heart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.2s-7.3-4.5-7.3-9.6A4.5 4.5 0 0 1 12 7.5a4.5 4.5 0 0 1 7.3 3.1c0 5.1-7.3 9.6-7.3 9.6z"/></svg>',
    grid:   '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.6"/><rect x="3" y="13" width="8" height="8" rx="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.6"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r=".7" fill="currentColor" stroke="none"/></svg>',
    book:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.6C10.4 5.1 8.4 4.3 5.8 4.3v13.5c2.6 0 4.6.8 6.2 2.3 1.6-1.5 3.6-2.3 6.2-2.3V4.3c-2.6 0-4.6.8-6.2 2.3z"/><path d="M12 6.6v13.5"/></svg>',
    user:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8.2" r="3.7"/><path d="M4.9 20.2c0-3.5 3.2-5.9 7.1-5.9s7.1 2.4 7.1 5.9"/></svg>'
  };
  var MARKS = { home: ICONS.grid, train: ICONS.target, codex: ICONS.book, me: ICONS.user };

  /* ============================================================
     DOM 引用
     ============================================================ */
  var barTitle = document.getElementById('barTitle');
  var barLeft = document.getElementById('barLeft');
  var barRight = document.getElementById('barRight');
  var view = document.getElementById('view');
  var searchwrap = document.getElementById('searchwrap');
  var tabbar = document.getElementById('tabbar');
  var q = document.getElementById('q');
  var activePlayer = null;
  var activeTab = 'home';

  var TAB_EL = {};
  [].slice.call(tabbar.querySelectorAll('.tab')).forEach(function (b) { TAB_EL[b.dataset.tab] = b; });

  /* ---------- 通用 ---------- */
  function setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex || '#9EFF00');
  }
  function setTab(id) {
    activeTab = id;
    Object.keys(TAB_EL).forEach(function (k) { TAB_EL[k].classList.toggle('on', k === id); });
  }
  function clearPlayer() {
    if (activePlayer) { activePlayer.stop(); activePlayer = null; }
  }
  /* 打歌练习页离开时完整销毁（rAF / 计时器 / AudioContext / 监听） */
  function clearPlay() {
    if (window.DrillPlay && window.DrillPlay.clear) window.DrillPlay.clear();
  }
  function setBar(title, sub, showBack, mark) {
    barTitle.innerHTML = esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    barLeft.innerHTML = '';
    if (showBack) {
      var b = document.createElement('button');
      b.className = 'iconbtn';
      b.setAttribute('aria-label', '返回');
      b.innerHTML = ICONS.back;
      b.addEventListener('click', function () { history.back(); });
      barLeft.appendChild(b);
    } else {
      var m = document.createElement('span');
      m.className = 'iconbtn accent';
      m.style.pointerEvents = 'none';
      m.innerHTML = mark || ICONS.grid;
      barLeft.appendChild(m);
    }
  }
  function groupByGame(hits) {
    var by = {}, order = [];
    hits.forEach(function (it) {
      if (!by[it.g.id]) { by[it.g.id] = { g: it.g, list: [] }; order.push(it.g.id); }
      by[it.g.id].list.push(it.m);
    });
    return order.map(function (id) { return by[id]; });
  }
  function dots(hits) {
    var seen = {}, out = [];
    hits.forEach(function (it) {
      if (seen[it.g.id]) return;
      seen[it.g.id] = 1;
      out.push('<span class="gdot" style="--gc:' + it.g.accent + '"><i></i>' +
               esc(it.g.title) + '</span>');
    });
    return out.join('');
  }
  function groupedMods(hits, emptyMsg) {
    var grps = groupByGame(hits);
    if (!grps.length) {
      return '<div class="empty"><b>暂无对应模块</b>' + esc(emptyMsg || '') + '</div>';
    }
    return grps.map(function (grp) {
      return '<div class="section-title" style="color:' + grp.g.accent + '">' +
               esc(grp.g.title) + ' <em>' + grp.list.length + ' 项</em></div>' +
             '<div class="mods">' + grp.list.map(function (m) {
               return modCard(grp.g, m);
             }).join('') + '</div>';
    }).join('');
  }

  /* ---------- 卡片片段 ---------- */
  function tagsHtml(g) {
    return '<span class="tags">' + (g.tags || []).map(function (t) {
      return '<span class="tag" style="color:' + g.accent + '">' + esc(t) + '</span>';
    }).join('') + '</span>';
  }

  function gameCard(g) {
    var n = (g.modules || []).length;
    return '<button class="gamecard" style="--ga:' + g.accent + '" data-go="#/g/' + g.id + '">' +
      '<span class="gc-top">' +
        '<span class="gc-name">' + esc(g.title) + '</span>' +
        '<span class="gc-alias">' + esc(g.alias || '') + '</span>' +
      '</span>' +
      '<span class="gc-desc">' + esc(g.desc) + '</span>' +
      '<span class="gc-foot">' + tagsHtml(g) +
        '<span class="gc-count" style="color:' + g.accent + '">' + n + ' 模块</span>' +
      '</span>' +
    '</button>';
  }

  function modCard(g, m) {
    return '<button class="modcard" data-go="#/m/' + m.id + '">' +
      '<span class="thumb" style="background-image:url(media/posters/' + m.id + '.jpg)">' +
        '<span class="play">' + ICONS.play + '</span>' +
      '</span>' +
      '<span class="mc-body">' +
        '<span class="mc-num" style="color:' + g.accent + '">' + esc(m.num) + '</span>' +
        '<span class="mc-name">' + esc(m.name) +
          (m.en ? ' <span class="mc-en">' + esc(m.en) + '</span>' : '') + '</span>' +
        '<span class="mc-desc">' + esc(m.desc) + '</span>' +
      '</span>' +
    '</button>';
  }

  /* 训练目标 / 键型族 通用卡片 */
  function topicCard(item, href, accent) {
    return '<button class="goal" style="--accent:' + (accent || '#9EFF00') + '" data-go="' + href + '">' +
      '<span class="goal-top">' +
        '<span class="goal-name">' + esc(item.name) + '</span>' +
        '<span class="goal-en">' + esc(item.en) + '</span>' +
        '<span class="goal-count">' + item.hits.length + ' 项</span>' +
      '</span>' +
      '<span class="goal-desc">' + esc(item.desc) + '</span>' +
      '<span class="goal-from">' + dots(item.hits) + '</span>' +
    '</button>';
  }

  /* ============================================================
     首页
     ============================================================ */
  function viewHome() {
    setTab('home');
    setAccent('#9EFF00');
    setBar('DRILL INDEX', '音游键型训练库', false, ICONS.grid);

    view.className = 'view';
    view.innerHTML =
      '<div class="hero anim">' +
        '<div class="kicker">KEY TYPE DRILLS</div>' +
        '<h1>Phigros 键型<br>训练库</h1>' +
        '<p>以 Phigros 为基准，拆解判定系统、标志性键型与训练要点。</p>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + FLAT.length + '</b><span>键型模块</span></div>' +
          '<div class="stat"><b>' + TRAIN.length + '</b><span>训练目标</span></div>' +
          '<div class="stat"><b>' + FAMILY.length + '</b><span>键型族</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="section-title anim anim-d1">SELECT A GAME <em>选择音游</em></div>' +
      '<div class="games anim anim-d2">' + GAMES.map(gameCard).join('') + '</div>';
  }

  /* ============================================================
     训练
     ============================================================ */
  function viewTrain() {
    setTab('train');
    setAccent('#9EFF00');
    setBar('训练', 'TRAINING GOALS', false, ICONS.target);

    var covered = 0;
    TRAIN.forEach(function (t) { if (t.hits.length) covered++; });

    view.className = 'view';
    view.innerHTML =
      '<div class="hero anim">' +
        '<div class="kicker">TRAINING GOALS</div>' +
        '<h1>按目标<br>横向聚合</h1>' +
        '<p>把 Phigros 的核心训练目标拆成 ' + TRAIN.length +
          ' 类，每类对应库里的键型模块，逐类攻克。</p>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + TRAIN.length + '</b><span>训练目标</span></div>' +
          '<div class="stat"><b>' + covered + '</b><span>已有对应</span></div>' +
          '<div class="stat"><b>' + FLAT.length + '</b><span>可用模块</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="section-title anim anim-d1">' + TRAIN.length + ' GOALS <em>训练目标</em></div>' +
      '<div class="goals anim anim-d2">' + TRAIN.map(function (t) {
        return topicCard(t, '#/t/' + t.id, t.accent);
      }).join('') + '</div>';
  }

  /* ============================================================
     训练目标 / 键型族 的模块列表（同一套渲染）
     ============================================================ */
  function viewCollection(kind, id) {
    var src = kind === 't' ? TRAIN : FAMILY;
    var item = null;
    for (var i = 0; i < src.length; i++) { if (src[i].id === id) item = src[i]; }
    if (!item) { viewHome(); return; }

    var isTrain = kind === 't';
    setTab(isTrain ? 'train' : 'codex');
    setAccent(item.accent);
    setBar(item.name, item.en, true, isTrain ? ICONS.target : ICONS.book);

    var grps = groupByGame(item.hits);

    view.className = 'view';
    view.innerHTML =
      '<div class="gamehead anim">' +
        '<h2 style="color:' + item.accent + '">' + esc(item.name) + '</h2>' +
        '<span class="alias">' + esc(item.en) + '</span>' +
        '<p>' + esc(item.desc) + '</p>' +
        '<div class="metachips">' +
          '<span class="metachip">命中 <b>' + item.hits.length + '</b></span>' +
          '<span class="metachip">覆盖音游 <b>' + grps.length + '</b></span>' +
        '</div>' +
      '</div>' +
      '<div class="anim anim-d1">' + groupedMods(item.hits) + '</div>';
  }

  /* ============================================================
     图鉴
     ============================================================ */
  function tiersOf(g) {
    var meter = (g.gmeta || []).filter(function (s) { return s.indexOf('判定') === 0; })[0] || '';
    return meter.replace(/^判定\s*/, '').split('/')
      .map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function jrow(g) {
    var ts = tiersOf(g);
    var feat = ((g.gmeta || [])[1] || '').replace(/^特色\s*/, '');
    return '<button class="jrow" style="--gc:' + g.accent + '" data-go="#/g/' + g.id + '">' +
      '<span class="jname"><i></i>' + esc(g.title) + '</span>' +
      '<span class="jtiers">' + ts.map(function (t, i) {
        return '<span class="jtier' + (i === 0 ? ' top' : '') + '">' + esc(t) + '</span>';
      }).join('') + '</span>' +
      (feat ? '<span class="jnote">' + esc(feat) + '</span>' : '') +
    '</button>';
  }

  function viewCodex() {
    setTab('codex');
    setAccent('#9EFF00');
    setBar('图鉴', '判定 · 键型', false, ICONS.book);

    view.className = 'view';
    view.innerHTML =
      '<div class="hero anim">' +
        '<div class="kicker">CODEX</div>' +
        '<h1>判定与键型<br>速查</h1>' +
        '<p>先看清 Phigros 的判定档位怎么划、宽容度多少，再按「键型族」对照同一类音符的不同叫法与打法。</p>' +
      '</div>' +
      '<div class="section-title anim anim-d1">JUDGMENT <em>判定系统速查</em></div>' +
      '<div class="anim anim-d2">' + GAMES.map(jrow).join('') + '</div>' +
      '<div class="section-title anim anim-d1">KEY FAMILIES <em>键型族</em></div>' +
      '<div class="goals anim anim-d2">' + FAMILY.map(function (f) {
        return topicCard(f, '#/k/' + f.id, f.accent);
      }).join('') + '</div>';
  }

  /* ============================================================
     我的
     ============================================================ */
  function setrow(act, label, sub, on, valueText) {
    return '<button class="setrow" data-act="' + act + '">' +
      '<span class="slabel"><b>' + esc(label) + '</b><span>' + esc(sub) + '</span></span>' +
      (valueText != null
        ? '<span class="sval">' + esc(valueText) + '</span>'
        : '<span class="switch' + (on ? ' on' : '') + '"></span>') +
    '</button>';
  }

  function viewMine() {
    setTab('me');
    setAccent('#9EFF00');
    setBar('我的', '收藏 · 偏好 · 存储', false, ICONS.user);

    var favItems = getFavs().map(function (id) {
      var hit = null;
      for (var i = 0; i < FLAT.length; i++) { if (FLAT[i].m.id === id) hit = FLAT[i]; }
      return hit;
    }).filter(Boolean);

    view.className = 'view';
    view.innerHTML =
      '<div class="mecard anim">' +
        '<img src="assets/icons/icon-192.png" alt="应用图标">' +
        '<span class="mtxt"><b>DRILL INDEX</b>' +
          '<span>v' + VERSION + ' · Phigros 专项 · ' + FLAT.length + ' 个模块</span>' +
        '</span>' +
      '</div>' +

      '<div class="section-title anim anim-d1">FAVORITES <em>收藏的模块</em></div>' +
      '<div class="anim anim-d1">' +
        (favItems.length
          ? groupedMods(favItems)
          : '<div class="empty"><b>还没有收藏</b>在任意模块详情页点「收藏」，就会收到这里。</div>') +
      '</div>' +

      '<div class="section-title anim anim-d2">PREFERENCES <em>偏好</em></div>' +
      '<div class="anim anim-d2">' +
        setrow('toggle-motion', '界面动效', '关闭后不再播放入场与过渡动画',
               getJSON(K_MOTION, true) !== false, null) +
        setrow('toggle-bigtype', '大字号', '放大正文与标题，方便近距离阅读',
               getJSON(K_BIG, false) === true, null) +
      '</div>' +

      '<div class="section-title anim anim-d2">STORAGE <em>存储</em></div>' +
      '<div class="anim anim-d2">' +
        setrow('clearcache', '清除离线缓存', '清掉后需重新联网加载外壳与视频', false, '查看中…') +
      '</div>' +

      '<div class="section-title anim anim-d2">ABOUT <em>关于</em></div>' +
      '<div class="warn anim anim-d2">' +
        '<b>数据说明</b>演示视频由本项目按各游戏机制重绘渲染，仅用于键型形态与判定节奏示意，非游戏内实录。' +
      '</div>';

    /* 异步统计缓存条目数 */
    if ('caches' in window) {
      caches.keys().then(function (keys) {
        var n = 0;
        return Promise.all(keys.map(function (k) {
          return caches.open(k).then(function (c) { return c.keys(); })
            .then(function (a) { n += a.length; });
        })).then(function () { return n; });
      }).then(function (n) {
        var el = view.querySelector('[data-act="clearcache"] .sval');
        if (el) el.textContent = n + ' 项';
      }).catch(function () {
        var el = view.querySelector('[data-act="clearcache"] .sval');
        if (el) el.textContent = '—';
      });
    } else {
      var el0 = view.querySelector('[data-act="clearcache"] .sval');
      if (el0) el0.textContent = '不支持';
    }
  }

  /* ============================================================
     某款音游
     ============================================================ */
  function viewGame(g) {
    setAccent(g.accent);
    setBar(g.title, g.alias || '', true);

    view.className = 'view';
    view.innerHTML =
      '<div class="gamehead anim">' +
        '<h2 style="color:' + g.accent + '">' + esc(g.title) + '</h2>' +
        '<span class="alias">' + esc(g.fullAlias || '') + '</span>' +
        '<p>' + esc(g.gdesc) + '</p>' +
        '<div class="metachips">' + (g.gmeta || []).map(function (x) {
          var i = x.indexOf(' ');
          var k = i > 0 ? x.slice(0, i) : '';
          var v = i > 0 ? x.slice(i + 1) : x;
          return '<span class="metachip">' + esc(k) + ' <b>' + esc(v) + '</b></span>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="section-title anim anim-d1">' + g.modules.length + ' MODULES <em>键型模块</em></div>' +
      '<div class="mods anim anim-d2">' + g.modules.map(function (m) {
        return modCard(g, m);
      }).join('') + '</div>';
  }

  /* ============================================================
     打歌练习（全屏，仅 DRILL_PLAY 注册表支持的模块）
     ============================================================ */
  function viewPlay(id) {
    var found = FLAT.filter(function (x) { return x.m.id === id; })[0];
    var ok = found && window.DrillPlay && window.DrillPlay.has && window.DrillPlay.has(id);
    if (!ok) {           // 未登记练习的模块：回落到模块详情页或首页
      if (found) { viewModule(found.g, found.m); } else { viewHome(); }
      return;
    }
    setAccent(found.g.accent);
    view.className = 'view';
    view.innerHTML = '';
    /* 打歌页是固定定位的全屏覆盖层，会遮住顶栏与底部导航 */
    window.DrillPlay.start(view, id, { title: found.m.name, gameTitle: found.g.title });
  }

  /* ============================================================
     模块详情
     ============================================================ */
  function viewModule(g, m) {
    setAccent(g.accent);
    setBar(m.name, g.title, true);

    var fav = isFav(m.id);
    /* 该模块是否已登记可玩练习（见 src/play.js 的 DRILL_PLAY 注册表） */
    var playable = window.DRILL_PLAY && window.DRILL_PLAY[m.id];
    view.className = 'view';
    view.innerHTML =
      '<div class="detail-head anim">' +
        '<div class="num" style="color:' + g.accent + '">' + esc(g.title) + ' · ' + esc(m.num) + '</div>' +
        '<h2>' + esc(m.name) + ' <span class="en">' + esc(m.en || '') + '</span></h2>' +
        (m.alias ? '<div class="alias">别名：' + esc(m.alias) + '</div>' : '') +
        '<div class="alias">' + esc(m.meta) + '</div>' +
        '<button class="favbtn' + (fav ? ' on' : '') + '" data-fav="' + esc(m.id) + '">' +
          ICONS.heart + '<span>' + (fav ? '已收藏' : '收藏') + '</span>' +
        '</button>' +
      '</div>' +
      (playable
        ? '<button class="playstart anim" data-go="#/play/' + esc(m.id) + '">' +
            '<span class="ps-ic">' + ICONS.play + '</span>' +
            '<span class="ps-t"><b>开始练习</b>' +
            '<span class="ps-sub">' + esc(playable.subtitle || playable.title) + '</span></span>' +
            '<span class="ps-go">PLAY</span>' +
          '</button>'
        : '');

    var stage = window.DrillPlayer.buildStage(m);
    view.appendChild(stage.el);
    activePlayer = stage;

    var body = document.createElement('div');
    body.className = 'prose anim anim-d1';
    body.innerHTML =
      (m.para && m.para !== m.desc ? '<p>' + esc(m.para) + '</p>' : '') +
      (m.points && m.points.length
        ? '<ul class="points">' + m.points.map(function (p, i) {
            return '<li data-n="' + String(i + 1).padStart(2, '0') + '">' + esc(p) + '</li>';
          }).join('') + '</ul>'
        : '') +
      (m.warn ? '<div class="warn"><b>' + esc(m.warnLabel || '常见错误') + '</b>' + esc(m.warn) + '</div>' : '');
    view.appendChild(body);

    /* 相关训练目标：从当前模块反查它属于哪几类 */
    var related = TRAIN.filter(function (t) {
      return t.hits.some(function (it) { return it.m.id === m.id; });
    });
    if (related.length) {
      var rel = document.createElement('div');
      rel.className = 'anim anim-d2';
      rel.innerHTML = '<div class="section-title">RELATED <em>相关训练目标</em></div>' +
        '<div class="goal-from">' + related.map(function (t) {
          return '<button class="gdot" style="--gc:' + t.accent + '" data-go="#/t/' + t.id + '">' +
                   '<i></i>' + esc(t.name) + '</button>';
        }).join('') + '</div>';
      view.appendChild(rel);
    }

    stage.start();
  }

  /* ============================================================
     检索
     ============================================================ */
  function viewSearch(kw) {
    setAccent('#9EFF00');
    setBar('检索', kw ? '“' + kw + '”' : '跨全部音游', true);

    var k = kw.toLowerCase();
    var hits = FLAT.filter(function (it) { return it.hay.indexOf(k) !== -1; });

    view.className = 'view searching';
    if (!hits.length) {
      view.innerHTML = '<div class="empty"><b>没有匹配的模块</b>换个关键词试试，比如「双押」「蛇」「滑键」。</div>';
      return;
    }
    view.innerHTML = '<div class="section-title">' + hits.length + ' RESULTS <em>命中模块</em></div>' +
      groupedMods(hits);
  }

  /* ============================================================
     路由
     ============================================================ */
  function route() {
    clearPlayer();
    clearPlay();
    setTab(activeTab);          // 深链直达时也保证底部导航有正确的高亮
    var h = decodeURIComponent(location.hash || '#/');
    var m;

    if (/^#\/train$/.test(h)) { viewTrain(); return; }
    if ((m = h.match(/^#\/t\/([\w-]+)$/))) { viewCollection('t', m[1]); return; }
    if (/^#\/codex$/.test(h)) { viewCodex(); return; }
    if ((m = h.match(/^#\/k\/([\w-]+)$/))) { viewCollection('k', m[1]); return; }
    if (/^#\/me$/.test(h)) { viewMine(); return; }

    if ((m = h.match(/^#\/g\/([\w-]+)$/))) {
      var g = GAMES.filter(function (x) { return x.id === m[1]; })[0];
      if (g) { viewGame(g); return; }
    }
    if ((m = h.match(/^#\/m\/([\w-]+)$/))) {
      var found = FLAT.filter(function (x) { return x.m.id === m[1]; })[0];
      if (found) { viewModule(found.g, found.m); return; }
    }
    if ((m = h.match(/^#\/play\/([\w-]+)$/))) { viewPlay(m[1]); return; }
    if ((m = h.match(/^#\/s\/(.*)$/))) {
      var kw = m[1] || '';
      if (q.value !== kw) q.value = kw;
      if (!searchwrap.classList.contains('open')) openSearch(true);
      viewSearch(kw);
      return;
    }

    if (searchwrap.classList.contains('open')) openSearch(false);
    viewHome();
  }

  /* ============================================================
     检索交互
     ============================================================ */
  function openSearch(open) {
    searchwrap.classList.toggle('open', open);
    barRight.innerHTML = '';
    var b = document.createElement('button');
    b.className = 'iconbtn';
    b.setAttribute('aria-label', open ? '关闭检索' : '检索');
    b.innerHTML = open ? ICONS.close : ICONS.search;
    b.addEventListener('click', function () {
      if (searchwrap.classList.contains('open')) {
        openSearch(false);
        if (location.hash.indexOf('#/s/') === 0) location.hash = '#/';
      } else {
        openSearch(true);
        q.focus();
      }
    });
    barRight.appendChild(b);
  }

  var searchTimer = null;
  q.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var v = q.value.trim();
      if (!v) { if (location.hash.indexOf('#/s/') === 0) location.hash = '#/'; return; }
      location.hash = '#/s/' + encodeURIComponent(v);
    }, 180);
  });

  /* ---------- 视图内事件委托（兼容动态渲染） ---------- */
  view.addEventListener('click', function (e) {
    /* 收藏 */
    var fav = e.target.closest('[data-fav]');
    if (fav) {
      var on = toggleFav(fav.dataset.fav);
      fav.classList.toggle('on', on);
      fav.querySelector('span').textContent = on ? '已收藏' : '收藏';
      return;
    }

    /* 设置项 */
    var act = e.target.closest('[data-act]');
    if (act) {
      var a = act.dataset.act;
      if (a === 'toggle-motion') {
        setJSON(K_MOTION, !(getJSON(K_MOTION, true) !== false));
        applyPrefs();
        var sw = act.querySelector('.switch');
        if (sw) sw.classList.toggle('on', getJSON(K_MOTION, true) !== false);
      } else if (a === 'toggle-bigtype') {
        setJSON(K_BIG, !(getJSON(K_BIG, false) === true));
        applyPrefs();
        var sw2 = act.querySelector('.switch');
        if (sw2) sw2.classList.toggle('on', getJSON(K_BIG, false) === true);
      } else if (a === 'clearcache') {
        var val = act.querySelector('.sval');
        if (val) val.textContent = '清除中…';
        if ('caches' in window) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (kk) { return caches.delete(kk); }));
          }).then(function () {
            if (val) val.textContent = '已清除';
          }).catch(function () {
            if (val) val.textContent = '清除失败';
          });
        } else if (val) {
          val.textContent = '不支持';
        }
      }
      return;
    }

    /* 跳转 */
    var go = e.target.closest('[data-go]');
    if (go) { location.hash = go.dataset.go; }
  });

  /* ---------- 底部导航 ---------- */
  tabbar.addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    var go = b.dataset.go;
    if (decodeURIComponent(location.hash || '#/') === go) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    location.hash = go;
  });

  window.addEventListener('hashchange', function () {
    route();
    window.scrollTo(0, 0);
  });

  /* ---------- 启动 ---------- */
  applyPrefs();
  openSearch(false);
  if (!location.hash) location.hash = '#/';
  route();

  /* 离线支持：仅在 http(s) 下注册（file:// 打开时自动跳过） */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
