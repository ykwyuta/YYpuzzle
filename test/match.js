// CPU どうしの たいせんを、じかんを つかわずに ためす（1手ずつ こうたいで おく）
'use strict';
require('../js/rules.js');
require('../js/ai.js');
const E = globalThis.Engine, AI = globalThis.AI;

// ids：キャラクター（フルーツパワー）。なければ パワーは つかわない
function match(lvA, lvB, seed, maxPieces = 400, ids) {
  const q = E.makeQueue(seed, 4);
  const r = E.rng(seed ^ 0x9e3779b9);
  const P = [lvA, lvB].map((lv, k) => ({ lv, id: ids && ids[k], f: E.newField(), qi: 0, pend: 0, carry: 0, maxChain: 0, power: 0, over: {}, powers: 0 }));
  const pairAt = (p, i) => p.over[i] || q.at(i);
  for (let t = 0; t < maxPieces; t++) {
    for (let s = 0; s < 2; s++) {
      const me = P[s], op = P[1 - s];
      if (E.isDead(me.f)) return { winner: 1 - s, pieces: t, P };
      if (me.id && me.power >= E.POWER_MAX && E.powerUseful(me.id, me.f, me.pend)) {
        const e = E.power(me.id, me.f, {});
        me.power = 0; me.powers++;
        if (e.over) for (let k = 0; k < e.over.n; k++) me.over[me.qi + k] = E.overPair(e.over.kind, pairAt(me, me.qi + k));
        if (e.cancel) me.pend = 0;
        const pr = E.resolve(e.field, e.force);
        me.f = pr.field;
        if (pr.points) { const a = E.attack(pr.points, me.carry); me.carry = a.carry; let n = a.n; const off = Math.min(n, me.pend); me.pend -= off; op.pend += n - off; }
      }
      const pairs = [pairAt(me, me.qi), pairAt(me, me.qi + 1)];
      me.qi++;
      const mv = AI.choose(me.f, pairs, me.lv, { pend: me.pend, colors: q.colors }, r);
      if (!mv) return { winner: 1 - s, pieces: t, P };
      let p = E.spawn(pairs[0]);
      for (const a of mv.path) p = ({ L: () => E.moved(me.f, p, -1, 0), R: () => E.moved(me.f, p, 1, 0), C: () => E.rotated(me.f, p, 1), A: () => E.rotated(me.f, p, -1) })[a]() || p;
      const res = E.resolve(E.place(me.f, E.dropped(me.f, p)).field);
      me.f = res.field;
      me.maxChain = Math.max(me.maxChain, res.chain);
      for (const st of res.steps) me.power = Math.min(E.POWER_MAX, me.power + st.popped.filter(i => st.before[i] !== E.CLOUD).length);
      if (res.points) {
        const a = E.attack(res.points, me.carry);
        me.carry = a.carry;
        let n = a.n;
        const off = Math.min(n, me.pend);
        me.pend -= off; n -= off;
        op.pend += n;
      }
      if (me.pend && !res.chain) {
        const d = E.dropClouds(me.f, me.pend, r);
        me.f = d.field; me.pend -= d.dropped;
      }
    }
  }
  return { winner: -1, pieces: maxPieces, P };
}
module.exports = { match };
