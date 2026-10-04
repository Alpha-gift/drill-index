/* ============================================================
   DRILL INDEX · 横切分类数据（Phigros 专项）
   ------------------------------------------------------------
   当前训练库以 Phigros 为唯一基准（2026-09-28 起），
   「训练目标」和「键型族」只聚合 Phigros 的六个模块。

   mods 里填模块 id（可对照 src/data/games.js）：
     phigros-01 散点   phigros-02 交互   phigros-03 多K
     phigros-04 倒打   phigros-05 楼梯   phigros-06 点划

   改这一个文件即可调整「训练」「图鉴」两个分区的内容，不用碰页面代码。
   新增模块后，记得回来把它挂到对应的分类下。
   ============================================================ */
window.DRILL_TOPICS = {

  /* ---------------- 训练目标：按「要练什么」横向聚合 ---------------- */
  train: [
    {
      id: 'scatter', name: '散点', en: 'Scatter', accent: '#9EFF00',
      desc: '无规律、无并列的散落单点。练的是在杂乱谱面里快速读谱、随机锁定下一个出手目标，是所有键型的基本功。',
      mods: ['phigros-01']
    },
    {
      id: 'trill', name: '交互', en: 'Trill', accent: '#38BDF8',
      desc: '左右手交替连打的对称结构。练双手独立与节奏稳定，是高速段落的地基。',
      mods: ['phigros-02']
    },
    {
      id: 'chord', name: '多K', en: 'Chord', accent: '#FACC15',
      desc: '同一时刻多个音符一起落到判定线上。练多指分工与「同时出手」的准度，几乎每首高难谱都绕不开。',
      mods: ['phigros-03']
    },
    {
      id: 'reverse', name: '倒打', en: 'Reverse', accent: '#A78BFA',
      desc: '判定线在上、音符由下往上走，相当于把设备转 180° 打。练反向读谱与反直觉的出手顺序。',
      mods: ['phigros-04']
    },
    {
      id: 'stairs', name: '楼梯', en: 'Stairs', accent: '#FB7185',
      desc: '音符沿相邻位置逐级递进。练手指按顺序滚动，避免粘连与漏级。',
      mods: ['phigros-05']
    },
    {
      id: 'tapflick', name: '点划', en: 'Tap + Flick', accent: '#F97316',
      desc: '点与滑叠在一起，要同时完成点击和划动。练手指分工与复合手势的触发时机。',
      mods: ['phigros-06']
    }
  ],

  /* ---------------- 键型族：按「怎么操作」归类 ---------------- */
  family: [
    {
      id: 'tap', name: '点击类', en: 'Tap', accent: '#38BDF8',
      desc: '落到判定线上点一下即可。最基础的键型，也最能拉开准度差距。散点、交互、多K、倒打、楼梯都以 Tap 为主体。',
      mods: ['phigros-01', 'phigros-02', 'phigros-03', 'phigros-04', 'phigros-05']
    },
    {
      id: 'slide', name: '滑动类', en: 'Flick / Drag', accent: '#FACC15',
      desc: '在屏幕上划动或拖动。对落点精度的要求比点击低，但方向和连贯性不能错。点划里的 Flick 就是典型。',
      mods: ['phigros-06']
    }
  ]
};
