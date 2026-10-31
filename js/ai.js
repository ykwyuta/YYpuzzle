/*
 * はじけるのがみえる あわパズル — CPU の かんがえ
 *
 * おける ところ（よこ 6 × むき 4、さいだい 22とおり）を ぜんぶ ためして、
 *   ・はじけて あいてに おくれる てんすう（れんさを ためるか、いま うつか）
 *   ・おなじ いろの つながり
 *   ・つみあがりの たかさ（とくに でてくる ところ）
 *   ・「れんさの たね」：あと 1〜2こ おけば なんれんさ に なるか
 * を てんすうに して いちばん いい 手を えらぶ。つよい CPU は つぎの ふたつぐみ まで よむ。
 */
(function (global) {
  'use strict';
  const E = global.Engine;
  const { W, H, at } = E;

  // れんさの かず → そのくらいの れんさで でる てんすうの めやす
  const CUM = [0, 40, 200, 520, 1000, 1640, 2440, 3400, 4520, 5800, 7240, 8840, 10600];

  // ---------- おける ところ ----------

  const ACT = {
    L: (f, p) => E.moved(f, p, -1, 0),
    R: (f, p) => E.moved(f, p, 1, 0),
    C: (f, p) => E.rotated(f, p, 1),
    A: (f, p) => E.rotated(f, p, -1),
  };
  const key = p => p.x * 64 + p.y * 4 + p.rot;

  // いまの いちから うごかせる ところを ぜんぶ さがす（はばゆうせん）。おなじ (x, むき) は いちばん みじかい てじゅん だけ。
  function reach(f, start) {
    const out = new Map(), seen = new Set([key(start)]);
    let layer = [{ p: start, path: [] }];
    while (layer.length) {
      const nx = [];
      for (const { p, path } of layer) {
        const k2 = p.x * 4 + p.rot;
        if (!out.has(k2)) out.set(k2, { x: p.x, rot: p.rot, path, p });
        if (path.length >= 8) continue;
        for (const a of 'LRCA') {
          const q = ACT[a](f, p);
          if (!q || seen.has(key(q))) continue;
          seen.add(key(q));
          nx.push({ p: q, path: path.concat(a) });
        }
      }
      layer = nx;
    }
    return [...out.values()];
  }

  // ふたつぐみ pair を おける ところの いちらん：[{ x, rot, path, res, field }]（おなじ けっかに なるものは まとめる）
  function placements(f, pair) {
    const start = E.spawn(pair);
    if (!E.fits(f, start)) return [];
    const seen = new Set(), out = [];
    for (const r of reach(f, start)) {
      const d = E.dropped(f, r.p);
      const pl = E.place(f, d);
      const k = pl.field.join('');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ x: r.x, rot: r.rot, path: r.path, piece: d, placed: pl.field });
    }
    return out;
  }

  // いまの いちから めあての (x, むき) まで、つぎに どう うごかすか（なければ null）
  function pathTo(f, piece, target) {
    if (piece.x === target.x && piece.rot === target.rot) return [];
    for (const r of reach(f, piece)) if (r.x === target.x && r.rot === target.rot) return r.path;
    return null;
  }

  // ---------- ひょうか ----------

  function seeds(f, colors, h) {
    // あと 1こ／たてに 2こ おいたら なんれんさ になるか（いちばん おおきい れんさ）
    let best = 0;
    for (let x = 0; x < W; x++) {
      if (h[x] >= H - 3) continue;
      const y = H - 1 - h[x];
      for (const c of colors) {
        // となりに おなじ いろが ない ところは ためさない（はやく する）
        let near = false;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y + 1]]) if (nx >= 0 && nx < W && ny < H && f[at(nx, ny)] === c) near = true;
        if (!near) continue;
        for (let k = 1; k <= 2; k++) {
          const g = E.clone(f);
          g[at(x, y)] = c;
          if (k === 2) g[at(x, y - 1)] = c;
          const r = E.resolve(g);
          if (r.chain) { if (r.chain > best) best = r.chain; break; }
        }
      }
    }
    return best;
  }

  function evalField(f, lv, colors) {
    if (E.isDead(f)) return -1e9;
    const h = E.heights(f);
    let s = 0;
    for (const g of E.groups(f)) {
      const n = g.cells.length;
      if (n === 2) s += 6 * lv.link;
      else if (n === 3) s += 16 * lv.link;
    }
    let sum = 0, max = 0;
    for (let x = 0; x < W; x++) { sum += h[x] * h[x]; if (h[x] > max) max = h[x]; }
    s -= sum * 0.6;
    if (h[2] >= 9) s -= 400 * (h[2] - 8);
    if (h[3] >= 10) s -= 200 * (h[3] - 9);
    if (max >= 11) s -= 300;
    // でこぼこ（はしが たかく まんなかが ひくい U の かたちは わるくない）
    for (let x = 0; x + 1 < W; x++) { const d = Math.abs(h[x] - h[x + 1]); if (d > 2) s -= (d - 2) * 8; }
    if (lv.seed) s += CUM[Math.min(12, seeds(f, colors, h))] * 0.6 * lv.seed;
    return s;
  }

  function fireValue(res, lv, ctx) {
    if (!res.chain) return 0;
    const danger = (ctx.pend || 0) >= 6 || Math.max(...E.heights(res.steps[0].before)) >= 10;
    if (res.chain >= lv.fire || danger || res.allClear) return res.points * 1.2 + 120;
    return res.points * lv.waste - 40;
  }

  // ---------- えらぶ ----------

  function choose(f, pairs, lv, ctx, rand) {
    rand = rand || Math.random;
    ctx = ctx || {};
    const colors = ctx.colors || [1, 2, 3, 4];
    const list = placements(f, pairs[0]);
    if (!list.length) return null;
    const scored = list.map(m => {
      const res = E.resolve(m.placed);
      const fv = fireValue(res, lv, ctx);
      const dead = E.isDead(res.field);
      return { m, res, fv, dead, v: dead ? -1e9 : fv + evalField(res.field, lv, colors) };
    });
    const alive = scored.filter(s => !s.dead);
    if (!alive.length) return pick(scored[0]);
    if (lv.random && rand() < lv.random) return pick(alive[Math.floor(rand() * alive.length)]);
    if (lv.depth >= 2 && pairs[1]) {
      alive.sort((a, b) => b.v - a.v);
      const top = alive.slice(0, lv.width || 8);
      for (const s of top) {
        let best = -1e9;
        for (const m2 of placements(s.res.field, pairs[1])) {
          const r2 = E.resolve(m2.placed);
          if (E.isDead(r2.field)) continue;
          const v2 = fireValue(r2, lv, ctx) + evalField(r2.field, lv, colors);
          if (v2 > best) best = v2;
        }
        // いま うつ れんさは、つぎを まつより すこし だいじ
        s.v = s.fv > 0 ? Math.max(s.fv + evalField(s.res.field, lv, colors), s.fv + best * 0.9) : best * 0.95 + s.v * 0.05;
      }
      for (const s of alive.slice(lv.width || 8)) s.v -= 1e6;
    }
    let bestS = null, bv = -Infinity;
    for (const s of alive) {
      const v = s.v + (lv.noise ? (rand() - 0.5) * lv.noise : 0);
      if (v > bv) { bv = v; bestS = s; }
    }
    return pick(bestS);
  }
  function pick(s) {
    return { x: s.m.x, rot: s.m.rot, path: s.m.path, chain: s.res.chain, points: s.res.points };
  }

  // つよさ（キャラクターごとに ちがう）
  const LEVELS = {
    1: { depth: 1, random: 0.45, noise: 400, link: 0.6, seed: 0, fire: 1, waste: 1 },
    2: { depth: 1, random: 0.2, noise: 200, link: 1, seed: 0, fire: 1, waste: 1 },
    3: { depth: 1, random: 0.08, noise: 120, link: 1, seed: 0.5, fire: 2, waste: 0.5 },
    4: { depth: 1, random: 0.03, noise: 60, link: 1, seed: 1, fire: 3, waste: 0.3 },
    5: { depth: 2, random: 0.02, noise: 80, link: 1, seed: 0.8, fire: 3, waste: 0.3, width: 4 },
    6: { depth: 2, random: 0, noise: 30, link: 1, seed: 1, fire: 3, waste: 0.3, width: 6 },
    7: { depth: 2, random: 0, noise: 10, link: 1, seed: 1, fire: 4, waste: 0.2, width: 8 },
    8: { depth: 2, random: 0, noise: 0, link: 1, seed: 1, fire: 4, waste: 0.2, width: 10 },
    hint: { depth: 1, random: 0, noise: 0, link: 1, seed: 1, fire: 2, waste: 0.6 },
  };

  global.AI = { CUM, LEVELS, reach, placements, pathTo, seeds, evalField, fireValue, choose };
})(typeof window !== 'undefined' ? window : globalThis);
