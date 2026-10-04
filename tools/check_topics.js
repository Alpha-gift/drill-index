/* ============================================================
   DRILL INDEX · 分类数据校验
   ------------------------------------------------------------
   检查 src/data/topics.js 里引用的模块 id 是否都存在、
   有没有重复挂载、有没有空分类。

   用法：
     node tools/check_topics.js
   （在项目根目录执行）
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'drill-app');

// 两个数据文件都挂在 window 上，这里造一个假的 window 来加载
const win = {};
global.window = win;
for (const f of ['src/data/games.js', 'src/data/topics.js']) {
  const p = path.join(APP, f);
  if (!fs.existsSync(p)) {
    console.error('缺少文件：' + p);
    process.exit(1);
  }
  new Function('window', fs.readFileSync(p, 'utf8'))(win);
}

const GAMES = win.DRILL_DATA || [];
const TOPICS = win.DRILL_TOPICS || {};

/* 模块 id → {game, module} */
const byId = new Map();
for (const g of GAMES) {
  for (const m of (g.modules || [])) {
    if (byId.has(m.id)) console.warn('⚠️  模块 id 重复：' + m.id);
    byId.set(m.id, { g, m });
  }
}

let problems = 0;
const allIds = new Set(byId.keys());
const usedIds = new Set();

for (const group of ['train', 'family']) {
  const list = TOPICS[group] || [];
  const label = group === 'train' ? '训练目标' : '键型族';
  console.log(`\n===== ${label}（${list.length} 类）=====`);

  if (!list.length) {
    console.error(`❌ ${label} 为空`);
    problems++;
  }

  for (const t of list) {
    const mods = t.mods || [];
    const missing = mods.filter((id) => !byId.has(id));
    const dup = mods.filter((id, i) => mods.indexOf(id) !== i);

    const games = [];
    for (const id of mods) {
      const hit = byId.get(id);
      if (hit && !games.includes(hit.g.title)) games.push(hit.g.title);
      if (hit) usedIds.add(id);
    }

    const flag = missing.length ? ' ❌' : (mods.length ? '' : ' ⚠️');
    console.log(
      `  ${t.name.padEnd(6)} ${String(mods.length).padStart(2)} 项 / ${games.length} 款${flag}`
    );
    console.log(`         ${games.join('、') || '（无）'}`);

    if (missing.length) {
      console.error(`         ❌ 不存在的模块 id：${missing.join('、')}`);
      problems++;
    }
    if (dup.length) {
      console.error(`         ⚠️  重复挂载：${[...new Set(dup)].join('、')}`);
      problems++;
    }
    if (!mods.length) {
      console.error('         ⚠️  空分类');
      problems++;
    }
  }
}

/* 有没有模块从没被任何分类引用到 */
const orphans = [...allIds].filter((id) => !usedIds.has(id));

console.log('\n===== 汇总 =====');
console.log(`音游 ${GAMES.length} 款 · 模块 ${allIds.size} 个`);
console.log(`未被任何分类引用：${orphans.length ? orphans.join('、') : '无'}`);
if (orphans.length) {
  console.log('  （不一定算错 —— 有些模块就是独立成篇，不归属任何横切分类）');
}
console.log(problems ? `\n❌ 有 ${problems} 处问题需要处理` : '\n✅ 分类数据无问题');
process.exit(problems ? 1 : 0);
