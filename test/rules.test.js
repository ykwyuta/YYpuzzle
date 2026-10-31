// ルールエンジンと CPU の テスト：node test/rules.test.js
'use strict';
require('../js/rules.js');
require('../js/ai.js');
const E = globalThis.Engine, AI = globalThis.AI;
const assert = require('assert');
const { match } = require('./match.js');

// ならびは たねで きまる
{
  const a = E.makeQueue(7, 4), b = E.makeQueue(7, 4);
  for (let i = 0; i < 50; i++) assert.deepStrictEqual(a.at(i), b.at(i));
  assert.strictEqual(a.colors.length, 4);
  const first = new Set([...a.at(0), ...a.at(1)]);
  assert.ok(first.size <= 3, 'さいしょの 2くみは 3しょく まで');
  for (let i = 0; i < 200; i++) for (const c of a.at(i)) assert.ok(a.colors.includes(c));
  console.log('queue OK');
}

// うごく・まわす・かべで ずれる・はさまれたら いれかわる
{
  const f = E.newField();
  let p = E.spawn([1, 2]);
  assert.deepStrictEqual(E.cells(p), [[2, 1, 1], [2, 0, 2]]);
  p = E.rotated(f, p, 1);
  assert.strictEqual(p.rot, 1);
  for (let i = 0; i < 5; i++) p = E.moved(f, p, 1, 0) || p;
  assert.strictEqual(p.x, 4, 'こどもが みぎに あるので じくは 4 まで');
  p = E.rotated(f, E.rotated(f, p, -1), 1);  // かべぎわで まわしても ずれて まわれる
  assert.ok(p && E.fits(f, p));
  const q = E.rotated(f, { x: 5, y: 5, rot: 0, a: 1, b: 2 }, 1);
  assert.deepStrictEqual([q.x, q.rot], [4, 1], 'みぎの かべで ひだりに ずれる');
  // 1れつの すきまで よこに まわせないときは うえと したが いれかわる
  const g = E.parse(['P.P...', 'P.P...', 'P.P...', 'P.P...', 'P.P...', 'P.P...', 'P.P...', 'P.P...', 'P.P...', 'P.P...']);
  const r = E.rotated(g, { x: 1, y: 5, rot: 0, a: 1, b: 2 }, 1);
  assert.strictEqual(r.rot, 2);
  // したが ふさがっているときは うえに ずれる
  const d = E.rotated(E.parse(['RRRRRR']), { x: 0, y: 11, rot: 1, a: 1, b: 2 }, 1);
  assert.deepStrictEqual([d.y, d.rot], [10, 2]);
  console.log('move OK');
}

// おくと ひとつずつ おちる（はなれる）。みえない列に のこった あわは とんでいく
{
  const f = E.parse(['G.....']);
  const p = E.dropped(f, { x: 0, y: 1, rot: 1, a: 1, b: 2 });
  const pl = E.place(f, p);
  assert.strictEqual(pl.field[E.at(0, 11)], 1);
  assert.strictEqual(pl.field[E.at(1, 12)], 2, 'みぎの あわは したまで おちる');
  const full = E.parse(Array(12).fill('Y.....'));
  const pl2 = E.place(full, { x: 0, y: 0, rot: 1, a: 1, b: 2 });
  assert.strictEqual(pl2.field[E.at(0, 0)], 0);
  assert.strictEqual(pl2.gone.length, 1);
  console.log('place OK');
}

// 4つで はじける・ななめは つながらない・くもりあわ も きえる
{
  let r = E.resolve(E.parse(['RRR...', 'GGGR..']));
  assert.strictEqual(r.chain, 0, '3つと ななめ では はじけない');
  r = E.resolve(E.parse(['o.....', 'RR....', 'RRo...']));
  assert.strictEqual(r.chain, 1);
  assert.strictEqual(r.steps[0].points, 40);
  assert.strictEqual(r.steps[0].clouds.length, 2);
  assert.strictEqual(r.points, 40 + E.ALL_CLEAR, 'くもりあわ も きえて からっぽ');
  assert.ok(r.allClear);
  console.log('pop OK');
}

// れんさ と てんすう
{
  // B が はじけると R が おちて 2れんさ
  const f = E.parse([
    'R.....',
    'B.....',
    'B.....',
    'B.....',
    'BRRR..',
    'GYYY..',
  ]);
  const r = E.resolve(f);
  assert.strictEqual(r.chain, 2);
  assert.strictEqual(r.steps[0].points, 40);
  assert.strictEqual(r.steps[1].points, 10 * 4 * E.chainBonus(2));
  assert.strictEqual(r.points, 40 + 160);
  assert.ok(!r.allClear);
  assert.deepStrictEqual(E.attack(r.points, 0), { n: 3, carry: 20 });
  assert.deepStrictEqual(E.attack(40, 20), { n: 1, carry: 0 });
  // ふたいろ どうじ・5こ いじょう は ボーナス
  assert.strictEqual(E.stepPoints(1, [{ color: 1, cells: [1, 2, 3, 4] }, { color: 2, cells: [5, 6, 7, 8] }]), 10 * 8 * 3);
  assert.strictEqual(E.stepPoints(1, [{ color: 1, cells: [1, 2, 3, 4, 5, 6] }]), 10 * 6 * 2);
  // ぜんぶ けすと ボーナス
  const ac = E.resolve(E.parse(['RRRR..']));
  assert.ok(ac.allClear);
  assert.strictEqual(ac.points, 40 + E.ALL_CLEAR);
  console.log('chain OK');
}

// よそう（おく まえに みえる）
{
  const f = E.parse(['R.....', 'RR....']);
  const pv = E.preview(f, { x: 1, y: 1, rot: 0, a: 1, b: 3 });
  assert.strictEqual(pv.res.chain, 1);
  assert.deepStrictEqual(pv.res.steps[0].popped.slice().sort((a, b) => a - b), [E.at(0, 11), E.at(0, 12), E.at(1, 11), E.at(1, 12)].sort((a, b) => a - b));
  assert.ok(pv.landing.includes(E.at(1, 11)));
  console.log('preview OK');
}

// くもりあわ が ふる
{
  const r = E.rng(1);
  const d = E.dropClouds(E.newField(), 8, r);
  assert.strictEqual(d.dropped, 8);
  assert.deepStrictEqual(E.heights(d.field).reduce((a, b) => a + b, 0), 8);
  assert.ok(E.heights(d.field).every(h => h === 1 || h === 2));
  const d2 = E.dropClouds(E.newField(), 50, r);
  assert.strictEqual(d2.dropped, E.MAX_DROP);
  assert.ok(E.heights(d2.field).every(h => h === 5));
  // あふれた ぶんは きえる・でてくる ところが うまると まけ
  const tall = E.parse(Array(11).fill('......').concat(['......']));
  assert.ok(!E.isDead(tall));
  const d3 = E.dropClouds(E.parse(Array(10).fill('YRYRYR')), 30, r);
  assert.ok(E.isDead(d3.field));
  assert.strictEqual(d3.field[E.at(0, 0)], 0);
  console.log('clouds OK');
}

// CPU：おける ところ・れんさを みつける・まけない
{
  const f = E.newField();
  const ps = AI.placements(f, [1, 2]);
  assert.strictEqual(ps.length, 22, 'からっぽの 盤では 22とおり');
  assert.strictEqual(AI.placements(f, [1, 1]).length, 11, 'おなじ いろなら 11とおり');
  // あと 1こ おけば 2れんさ。CPU は それを みつける
  const g = E.parse([
    'B.....',
    'R.....',
    'RYY...',
    'RYY...',
  ]);
  const mv = AI.choose(g, [[1, 3], [4, 4]], AI.LEVELS.hint, { colors: [1, 2, 3, 4] }, E.rng(3));
  assert.ok(mv.chain >= 1);
  // とどかない ところには いかない
  const wall = E.parse(Array(12).fill('.R.R..'));
  const wp = AI.placements(wall, [1, 2]);
  assert.ok(wp.length > 0 && wp.every(p => p.x === 2), 'かべに はさまれたら まんなかの れつ だけ');
  assert.ok(AI.placements(E.parse(Array(11).fill('.R.R..')), [1, 2]).some(p => p.x === 5), 'かべが ひくければ こえられる');
  // てじゅんの とおりに うごかすと めあての ばしょに つく
  for (const p of ps) {
    let q = E.spawn([1, 2]);
    for (const a of p.path) q = ({ L: () => E.moved(f, q, -1, 0), R: () => E.moved(f, q, 1, 0), C: () => E.rotated(f, q, 1), A: () => E.rotated(f, q, -1) })[a]();
    assert.deepStrictEqual([q.x, q.rot], [p.x, p.rot]);
    assert.deepStrictEqual(AI.pathTo(f, E.spawn([1, 2]), p).length, p.path.length);
  }
  console.log('ai OK');
}

// つよい CPU は よわい CPU に かちこす
{
  let w = 0;
  for (let i = 0; i < 4; i++) if (match(AI.LEVELS[6], AI.LEVELS[2], 500 + i).winner === 0) w++;
  assert.ok(w >= 3, `つよさ6 が ${w}/4`);
  console.log('strength OK');
}
console.log('ALL OK');
