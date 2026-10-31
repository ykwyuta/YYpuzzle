/*
 * はじけるのがみえる あわパズル — ルールエンジン
 * 盤面は Int8Array のデータとして扱い、関数は常に新しい盤を返す（もとの盤は かえない）。
 *
 * 座標：x は左から 0〜W-1、y は上から 0〜H-1。マス i = y * W + x。
 *   y = 0 は「みえない列」（画面の外）。ここに のこった あわは ふわっと とんでいく（きえる）。
 *   y = 1〜12 が みえる ところ。
 * あわ：0 = なし、1〜5 = いろ、6 = くもりあわ（あいてから とどく じゃまもの）。
 * ふたつぐみ：{ x, y, rot, a, b }。a が じく（まわる中心）、b が こども。
 *   rot 0 = こどもが うえ、1 = みぎ、2 = した、3 = ひだり。
 * はじける：おなじ いろが たて・よこに 4つ いじょう つながると はじける。
 *   となりの くもりあわも いっしょに きえる。きえたら うえの あわが おちて、また つながれば れんさ。
 * まけ：あたらしい ふたつぐみが でてくる ところ（ひだりから 3れつめ の いちばん うえ）が うまったら まけ。
 */
(function (global) {
  'use strict';

  const W = 6, H = 13, ROWS = 12;
  const EMPTY = 0, CLOUD = 6;
  const SPAWN_X = 2, SPAWN_Y = 1;
  const POP = 4;               // いくつ つながると はじけるか
  const UNIT = 60;             // てんすう 60 で くもりあわ 1こ
  const MAX_DROP = 30;         // 1回に ふってくる くもりあわは 30こ（5だん）まで
  const ALL_CLEAR = 900;       // ぜんぶ けしたときの ボーナス てんすう
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

  const COLORS = [
    null,
    { name: 'あか', mark: 'ハート' },
    { name: 'みどり', mark: 'はっぱ' },
    { name: 'あお', mark: 'しずく' },
    { name: 'きいろ', mark: 'ほし' },
    { name: 'むらさき', mark: 'ダイヤ' },
  ];

  const at = (x, y) => y * W + x;

  // ---------- たね から きまる ふたつぐみの ならび ----------

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // おなじ たね なら、どちらの プレイヤーにも おなじ ならびが くる（こうへい）。
  // さいしょの 2くみは 3しょく だけに して、はじめやすく する。
  function makeQueue(seed, colors) {
    const r = rng(seed), list = [];
    const pal = [];
    for (let c = 1; c <= 5; c++) pal.push(c);
    for (let i = pal.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pal[i], pal[j]] = [pal[j], pal[i]]; }
    const use = pal.slice(0, colors);
    return {
      colors: use.slice().sort(),
      at(i) {
        while (list.length <= i) {
          const n = list.length < 2 ? Math.min(3, colors) : colors;
          list.push([use[Math.floor(r() * n)], use[Math.floor(r() * n)]]);
        }
        return list[i];
      },
    };
  }

  // ---------- 盤 ----------

  function newField() { return new Int8Array(W * H); }
  function clone(f) { return Int8Array.from(f); }
  function isEmpty(f) { for (let i = 0; i < f.length; i++) if (f[i]) return false; return true; }
  function parse(rows) {
    // rows：うえから みえる 12だん（みじかければ したづめ）。R G B Y P = いろ 1〜5、o = くもりあわ、. = なし
    const f = newField(), off = H - rows.length;
    rows.forEach((row, r) => {
      for (let x = 0; x < W; x++) {
        const ch = row[x] || '.';
        const v = 'RGBYP'.indexOf(ch) + 1 || (ch === 'o' ? CLOUD : 0);
        f[at(x, r + off)] = v;
      }
    });
    return f;
  }
  function show(f) {
    const out = [];
    for (let y = 0; y < H; y++) {
      let s = '';
      for (let x = 0; x < W; x++) s += '.RGBYPo'[f[at(x, y)]];
      out.push(s);
    }
    return out.join('\n');
  }
  function heights(f) {
    const h = [];
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H && !f[at(x, y)]) y++;
      h.push(H - y);
    }
    return h;
  }
  function isDead(f) { return f[at(SPAWN_X, SPAWN_Y)] !== EMPTY; }

  // ---------- ふたつぐみの うごき ----------

  function spawn(pair) { return { x: SPAWN_X, y: SPAWN_Y, rot: 0, a: pair[0], b: pair[1] }; }
  function cells(p) { return [[p.x, p.y, p.a], [p.x + DX[p.rot], p.y + DY[p.rot], p.b]]; }
  function free(f, x, y) { return x >= 0 && x < W && y >= 0 && y < H && f[at(x, y)] === EMPTY; }
  function fits(f, p) {
    return free(f, p.x, p.y) && free(f, p.x + DX[p.rot], p.y + DY[p.rot]);
  }
  function moved(f, p, dx, dy) {
    const q = { x: p.x + dx, y: p.y + dy, rot: p.rot, a: p.a, b: p.b };
    return fits(f, q) ? q : null;
  }
  // まわす。かべや あわに ぶつかるときは、はんたいがわに ずらす。
  // りょうがわが ふさがっていて よこに できないときは、くるっと うえと したを いれかえる。
  function rotated(f, p, dir) {
    const rot = (p.rot + dir + 4) % 4;
    const q = { x: p.x, y: p.y, rot, a: p.a, b: p.b };
    if (fits(f, q)) return q;
    const k = { x: p.x - DX[rot], y: p.y - DY[rot], rot, a: p.a, b: p.b };
    if (fits(f, k)) return k;
    if (rot % 2 === 1) {
      const r2 = (p.rot + 2) % 4;
      const fl = { x: p.x, y: p.y, rot: r2, a: p.a, b: p.b };
      if (fits(f, fl)) return fl;
      const fk = { x: p.x - DX[r2], y: p.y - DY[r2], rot: r2, a: p.a, b: p.b };
      if (fits(f, fk)) return fk;
    }
    return null;
  }
  function dropped(f, p) {
    let q = p, n;
    while ((n = moved(f, q, 0, 1))) q = n;
    return q;
  }

  // ---------- おちる ----------

  // うえに すきまが あれば おとす。moves = [{ x, from, to, c }]（アニメーション用）
  function gravity(f) {
    const g = clone(f), moves = [];
    for (let x = 0; x < W; x++) {
      let w = H - 1;
      for (let y = H - 1; y >= 0; y--) {
        const c = g[at(x, y)];
        if (!c) continue;
        if (y !== w) { g[at(x, w)] = c; g[at(x, y)] = 0; moves.push({ x, from: y, to: w, c }); }
        w--;
      }
    }
    return { field: g, moves };
  }
  // みえない列に のこった あわは とんでいく
  function flyAway(f) {
    const gone = [];
    for (let x = 0; x < W; x++) if (f[at(x, 0)]) { gone.push({ x, c: f[at(x, 0)] }); f[at(x, 0)] = 0; }
    return gone;
  }

  // ふたつぐみを おく。ひとつずつ したまで おちる（はなれることもある）。
  function place(f, p) {
    const g = clone(f), moves = [];
    const cs = cells(p).sort((u, v) => v[1] - u[1]);  // したの あわから
    for (const [x, y, c] of cs) {
      let ty = y;
      while (ty + 1 < H && !g[at(x, ty + 1)]) ty++;
      g[at(x, ty)] = c;
      moves.push({ x, from: y, to: ty, c });
    }
    const gone = flyAway(g);
    return { field: g, moves: moves.filter(m => m.to > 0), gone };
  }

  // ---------- はじける ----------

  function groups(f) {
    const seen = new Uint8Array(W * H), out = [];
    for (let i = W; i < W * H; i++) {
      const c = f[i];
      if (!c || c === CLOUD || seen[i]) continue;
      const list = [i], st = [i];
      seen[i] = 1;
      while (st.length) {
        const j = st.pop(), x = j % W, y = (j / W) | 0;
        if (x > 0 && !seen[j - 1] && f[j - 1] === c) { seen[j - 1] = 1; st.push(j - 1); list.push(j - 1); }
        if (x < W - 1 && !seen[j + 1] && f[j + 1] === c) { seen[j + 1] = 1; st.push(j + 1); list.push(j + 1); }
        if (y > 1 && !seen[j - W] && f[j - W] === c) { seen[j - W] = 1; st.push(j - W); list.push(j - W); }
        if (y < H - 1 && !seen[j + W] && f[j + W] === c) { seen[j + W] = 1; st.push(j + W); list.push(j + W); }
      }
      out.push({ color: c, cells: list });
    }
    return out;
  }

  // れんさの ばいりつ：1れんさめ 0、2れんさめ 4、3れんさめ 8 …（てんすう = 10 × きえた かず × ばいりつ（さいてい 1））
  function chainBonus(k) { return k <= 1 ? 0 : (k - 1) * 4; }
  function sizeBonus(n) { return Math.min(10, n - POP); }
  function colorBonus(k) { return (k - 1) * 3; }
  function stepPoints(chain, gs) {
    let n = 0, mult = chainBonus(chain) + colorBonus(new Set(gs.map(g => g.color)).size);
    for (const g of gs) { n += g.cells.length; mult += sizeBonus(g.cells.length); }
    return 10 * n * Math.max(1, mult);
  }

  // つながった あわを はじけさせて、おちて、また はじけて … を ぜんぶ やる。
  // steps[k] = { chain, groups, popped, clouds, points, before, after, moves }
  function resolve(f) {
    const steps = [];
    let cur = f, total = 0;
    for (let chain = 1; ; chain++) {
      const gs = groups(cur).filter(g => g.cells.length >= POP);
      if (!gs.length) break;
      const mid = clone(cur), popped = [], clouds = [];
      for (const g of gs) for (const i of g.cells) { mid[i] = 0; popped.push(i); }
      for (const i of popped) {
        const x = i % W, y = (i / W) | 0;
        const nb = [];
        if (x > 0) nb.push(i - 1);
        if (x < W - 1) nb.push(i + 1);
        if (y > 1) nb.push(i - W);
        if (y < H - 1) nb.push(i + W);
        for (const j of nb) if (mid[j] === CLOUD) { mid[j] = 0; clouds.push(j); }
      }
      const points = stepPoints(chain, gs);
      const gr = gravity(mid);
      steps.push({ chain, groups: gs, popped, clouds, points, before: cur, after: gr.field, moves: gr.moves });
      total += points;
      cur = gr.field;
    }
    const allClear = steps.length > 0 && isEmpty(cur);
    if (allClear) total += ALL_CLEAR;
    return { field: cur, steps, chain: steps.length, points: total, allClear };
  }

  // ふたつぐみを おいたら どうなるか（「みえる」ための よそう）
  function preview(f, p) {
    const d = dropped(f, p);
    const pl = place(f, d);
    const res = resolve(pl.field);
    return { piece: d, landing: pl.moves.map(m => at(m.x, m.to)), placed: pl.field, res };
  }

  // ---------- くもりあわ ----------

  // てんすう → くもりあわ の かず（あまりは つぎに もちこす）
  function attack(points, carry) {
    const t = points + (carry || 0);
    return { n: Math.floor(t / UNIT), carry: t % UNIT };
  }

  // くもりあわを ふらせる。6こ ごとに 1だん、あまりは ばらばらの れつに。
  function dropClouds(f, count, r) {
    const n = Math.min(count, MAX_DROP);
    const per = new Array(W).fill(Math.floor(n / W));
    const rest = n % W;
    if (rest) {
      const cols = [0, 1, 2, 3, 4, 5];
      for (let i = W - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
      for (let k = 0; k < rest; k++) per[cols[k]]++;
    }
    const g = clone(f), moves = [];
    for (let x = 0; x < W; x++) {
      let ty = H - 1;
      while (ty >= 0 && g[at(x, ty)]) ty--;
      for (let k = 0; k < per[x]; k++, ty--) {
        if (ty < 1) break;  // あふれた ぶんは とんでいく
        g[at(x, ty)] = CLOUD;
        moves.push({ x, from: ty - H, to: ty, c: CLOUD });  // 画面の うえの そとから ふってくる
      }
    }
    return { field: g, moves, dropped: n };
  }

  global.Engine = {
    W, H, ROWS, EMPTY, CLOUD, SPAWN_X, SPAWN_Y, POP, UNIT, MAX_DROP, ALL_CLEAR, DX, DY, COLORS,
    at, rng, makeQueue, newField, clone, isEmpty, parse, show, heights, isDead,
    spawn, cells, fits, moved, rotated, dropped,
    gravity, place, groups, chainBonus, stepPoints, resolve, preview, attack, dropClouds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
