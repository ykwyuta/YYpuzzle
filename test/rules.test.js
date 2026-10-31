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
  let rb = 0;
  for (let i = 0; i < 400; i++) for (const c of a.at(i)) { if (c === E.RAINBOW) rb++; else assert.ok(a.colors.includes(c)); }
  assert.ok(rb > 10 && rb < 60, 'にじあわ は ときどき まざる ' + rb);
  for (let i = 0; i < 3; i++) assert.ok(!a.at(i).includes(E.RAINBOW), 'さいしょの 3くみ には まざらない');
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

// にじあわ：どの いろとも つながる・ふたいろ いっしょに はじけさせる・にじあわ だけ では はじけない
{
  let r = E.resolve(E.parse(['RR*R..']));
  assert.strictEqual(r.chain, 1, 'にじあわ が あか の なかまに なる');
  assert.strictEqual(r.steps[0].popped.length, 4);
  r = E.resolve(E.parse(['RR*BB.', 'R..B..']));
  assert.strictEqual(r.chain, 1);
  assert.strictEqual(r.steps[0].groups.length, 2, 'あか と あお が にじあわ で いっしょに はじける');
  assert.strictEqual(r.steps[0].popped.length, 7, 'にじあわ は 1かい だけ かぞえる');
  assert.strictEqual(E.resolve(E.parse(['****..'])).chain, 0, 'にじあわ だけ では はじけない');
  assert.strictEqual(E.resolve(E.parse(['R*G*B.'])).chain, 0);
  console.log('rainbow OK');
}

// フルーツパワー
{
  const P = (id, rows, ctx) => E.power(id, E.parse(rows), ctx);
  // いちご：くもりあわ が あか に
  let o = P('ichigo', ['oo....', 'oRR...']);
  assert.strictEqual(o.recolor.length, 3);
  assert.strictEqual(E.resolve(o.field).chain, 1, 'あかく なって 5こ つながる');
  // にんじん：いちばん ながい れつ を けす
  o = P('ninjin', ['.G....', '.G....', 'RG....', 'RG..Y.']);
  assert.strictEqual(o.cleared.length, 4);
  assert.deepStrictEqual(E.heights(o.field), [2, 0, 0, 0, 1, 0]);
  for (const i of o.cleared) assert.ok(o.before[i], 'before には けす まえの あわが ある');
  // トマト：いちばん おおい いろ が ぜんぶ はじける（はなれていても）
  o = P('tomato', ['B...B.', 'GY.BGY']);
  assert.strictEqual(o.force.color, 3);
  const r = E.resolve(o.field, o.force);
  assert.strictEqual(r.steps[0].popped.length, 3);
  assert.ok(r.points > 0);
  // バナナ・なす：つぎの ふたつぐみ を かえる
  assert.deepStrictEqual(P('banana', ['R.....']).over, { kind: 'rainbow', n: 2 });
  assert.deepStrictEqual(P('nasu', ['R.....']).over, { kind: 'same', n: 3 });
  assert.deepStrictEqual(E.overPair('same', [2, 4]), [2, 2]);
  assert.deepStrictEqual(E.overPair('same', [E.RAINBOW, 4]), [4, 4]);
  assert.deepStrictEqual(E.overPair('rainbow', [2, 4]), [E.RAINBOW, E.RAINBOW]);
  // ブロッコリー：くもりあわ が きえて、うえの あわが おちる
  o = P('broccoli', ['R.....', 'o.....', 'oG....']);
  assert.ok(o.cancel);
  assert.strictEqual(o.cleared.length, 2);
  assert.strictEqual(o.field[E.at(0, 12)], 1, 'あか が したまで おちる');
  // ぶどう：いちばん すくない いろ（G）が となりの いろ に そまる
  o = P('budou', ['RRR...', 'RRRG..', 'BBBB.Y', 'BBBBYY']);
  assert.strictEqual(o.field[E.at(3, 10)], 1, 'G は となりの あか に');
  // かぼちゃ：でてくる ところ の まわり を ふきとばす
  o = P('kabocha', Array(10).fill('RGBYPR'));
  assert.deepStrictEqual(E.heights(o.field), [10, 5, 5, 5, 10, 10]);
  assert.ok(E.powerUseful('kabocha', E.parse(Array(10).fill('RGBYPR')), 0));
  assert.ok(!E.powerUseful('broccoli', E.newField(), 0));
  for (const id of Object.keys(E.POWERS)) assert.ok(E.power(id, E.newField()).field, 'からっぽ でも つかえる ' + id);
  console.log('power OK');
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
