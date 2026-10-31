// CPU どうしの たいせん：node test/selfplay.js 8 4 10   （つよさ8 と つよさ4 で 10きょく）
'use strict';
const { match } = require('./match.js');
const AI = globalThis.AI;
const a = process.argv[2] || '8', b = process.argv[3] || '4', n = +(process.argv[4] || 10);
const win = [0, 0, 0];
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const C = globalThis.Chars ? null : require('../js/chars.js');
  const id = l => (globalThis.Chars.LIST.find(c => String(c.level) === l) || {}).id;
  const m = match(AI.LEVELS[a], AI.LEVELS[b], 1000 + i, 400, [id(a), id(b)]);
  win[m.winner < 0 ? 2 : m.winner]++;
  console.log(`#${i + 1} ${m.winner === 0 ? a : m.winner === 1 ? b : 'ひきわけ'} のかち（${m.pieces}て、さいだいれんさ ${m.P[0].maxChain} / ${m.P[1].maxChain}、パワー ${m.P[0].powers} / ${m.P[1].powers}）`);
}
console.log(`つよさ${a} ${win[0]}かち / つよさ${b} ${win[1]}かち / ひきわけ ${win[2]}  (${((Date.now() - t0) / 1000).toFixed(1)}びょう)`);
