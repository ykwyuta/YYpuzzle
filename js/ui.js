/*
 * はじけるのがみえる あわパズル — 画面表示と操作
 *
 * プレイヤーごとに じょうたいを もつ：
 *   ready（よーい）→ spawn（ふたつぐみが でる）→ fall（おちている・うごかせる）→ anim（おく・はじける・おちる・くもりあわ）→ spawn …
 *   dead（まけ）/ idle（かった あと とまる）
 */
(function () {
  'use strict';
  const E = window.Engine;
  const AI = window.AI;
  const CH = window.Chars;
  const $ = id => document.getElementById(id);
  const STORE = 'yypuzzle.v1';

  const SPEED = { slow: 1000, normal: 640, fast: 380 };
  const LOCK = 520, SOFT = 42, VIS = 12.5;

  const COL = [
    null,
    { base: '#f2325b', mid: '#ff9cb2', rim: '#b8133b' },
    { base: '#1fb35a', mid: '#94eab5', rim: '#0e7a3a' },
    { base: '#1f7ef0', mid: '#98caff', rim: '#0d55b0' },
    { base: '#f5b400', mid: '#ffe68a', rim: '#b37f00' },
    { base: '#9146ff', mid: '#d4b0ff', rim: '#6020c0' },
    { base: '#8b9bb0', mid: '#e8eef5', rim: '#64748b' },
    { base: '#ff7ab6', mid: '#fff3b0', rim: '#a855f7' },
  ];

  const app = {
    settings: { ghost: true, preview: true, faces: true, marks: false, sound: true, vibrate: true },
    opts: { mode: 'vs', opp: 'ichigo', colors: 4, speed: 'normal', me: 'tomato' },
    beaten: {},
    best: 0,
    players: [],
    queue: null,
    running: false,
    paused: false,
    over: false,
    token: 0,
    oppMood: 'normal', oppMoodT: 0,
  };

  // ---------- 保存 ----------

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ settings: app.settings, opts: app.opts, beaten: app.beaten, best: app.best })); } catch (e) { /* 保存できなくても あそべる */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }

  // ---------- プレイヤー ----------

  function newPlayer(side, ctrl, char) {
    return {
      side, ctrl, char,
      cv: $('cv-' + side), ctx: $('cv-' + side).getContext('2d'), cell: 30,
      field: E.newField(), piece: null, qi: 0, count: 0,
      state: 'ready', readyT: 0, gT: 0, lockT: 0, lockN: 0, soft: false,
      anim: [], cur: null, animT: 0, after: null,
      score: 0, maxChain: 0, pend: 0, carry: 0,
      history: [], plan: null, planT: 0, stepT: 0, tok: 0,
      pv: null, pvKey: '', hint: null, fx: [], deadT: 0, land: new Map(), shake: null,
      power: 0, over: {},
      rng: E.rng((Math.random() * 4294967296) >>> 0),
    };
  }
  // その プレイヤーに くる i ばんめの ふたつぐみ（パワーで かわって いる ことも ある）
  const pairAt = (p, i) => p.over[i] || app.queue.at(i);
  const me = () => app.players[0];
  const opp = () => app.players[1];

  function gravityMs(p) {
    const base = SPEED[app.opts.speed] || SPEED.normal;
    return base * Math.max(0.5, 1 - p.count / 240);
  }

  // ---------- ゲームの はじまり ----------

  function startGame(o) {
    app.opts = Object.assign({}, app.opts, o || {});
    save();
    const vs = app.opts.mode === 'vs';
    document.body.classList.toggle('vs', vs);
    document.body.classList.toggle('solo', !vs);
    const seed = (Math.random() * 4294967296) >>> 0;
    app.queue = E.makeQueue(seed, vs ? 4 : +app.opts.colors);
    app.token++;
    app.players = [newPlayer(0, 'human', CH.BY[app.opts.me])];
    if (vs) app.players.push(newPlayer(1, 'cpu', CH.BY[app.opts.opp]));
    app.running = true; app.over = false; app.paused = false;
    powShown[0] = powShown[1] = -1;
    syncPause();
    renderHeads();
    layout();
    setTimeout(showZones, vs ? 1500 : 0);
    if (vs) {
      setOppMood('normal');
      splash();
      setTimeout(() => { if (app.players[1] && app.running) speak(pickLine(opp().char.lines.start), 2400); }, 1500);
    } else {
      $('speech').classList.remove('show');
    }
    renderSide();
  }

  // たいせんの はじめの「VS」がめん
  function splash() {
    const el = $('splash'), P = me(), O = opp();
    $('sp-me').innerHTML = CH.svg(P.char.id, 'happy');
    $('sp-opp').innerHTML = CH.svg(O.char.id, 'normal');
    $('sp-me').style.setProperty('--cc', P.char.color);
    $('sp-opp').style.setProperty('--cc', O.char.color);
    $('sp-opp-name').textContent = O.char.name;
    for (const p of app.players) p.readyT = -1500;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    sound('vs');
    clearTimeout(splash.t);
    splash.t = setTimeout(() => el.classList.remove('show'), 1550);
  }

  function pickLine(a) { return Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a; }

  // ---------- 1こま ごとの うごき ----------

  let last = 0;
  function frame(t) {
    const dt = Math.min(50, last ? t - last : 16);
    last = t;
    const stop = app.paused || !!document.querySelector('dialog[open]');
    if (app.running && !stop) {
      for (const p of app.players) update(p, dt);
      if (app.oppMoodT > 0 && (app.oppMoodT -= dt) <= 0) setOppMood('normal');
    }
    for (const p of app.players) draw(p, t, stop);
    if (app.players.length) renderPowers();
    drawNext(t);
    renderStatus();
    requestAnimationFrame(frame);
  }

  function update(p, dt) {
    switch (p.state) {
      case 'ready':
        if ((p.readyT += dt) >= 1100) p.state = 'spawn';
        break;
      case 'spawn': spawnPiece(p); break;
      case 'fall': fall(p, dt); break;
      case 'anim': runAnim(p, dt); break;
      case 'dead': p.deadT += dt; break;
      default: break;
    }
  }

  function spawnPiece(p) {
    if (E.isDead(p.field)) return lose(p);
    if (p.ctrl === 'cpu' && p.power >= E.POWER_MAX && E.powerUseful(p.char.id, p.field, p.pend) && (p.char.level > 1 || Math.random() < 0.3)) return usePower(p);
    const pair = pairAt(p, p.qi);
    p.piece = E.spawn(pair);
    p.qi++;
    p.state = 'fall';
    p.gT = 0; p.lockT = 0; p.lockN = 0;
    p.hint = null; p.pvKey = '';
    if (p.ctrl === 'cpu') requestPlan(p);
    else { p.soft = held.D; renderSide(); }
  }

  function fall(p, dt) {
    if (p.ctrl === 'cpu') cpuStep(p, dt);
    if (p.state !== 'fall') return;
    const below = E.moved(p.field, p.piece, 0, 1);
    if (below) {
      p.lockT = 0;
      p.gT += dt;
      if (p.gT >= (p.soft ? SOFT : gravityMs(p))) { p.gT = 0; p.piece = below; if (p.soft && p.ctrl === 'human') p.score += 1; }
    } else {
      p.lockT += dt;
      if (p.lockT >= (p.soft ? 140 : LOCK)) lock(p);
    }
  }

  // ---------- そうさ ----------

  function act(p, a) {
    if (!p || p.state !== 'fall' || !p.piece) return false;
    let q = null;
    if (a === 'L') q = E.moved(p.field, p.piece, -1, 0);
    else if (a === 'R') q = E.moved(p.field, p.piece, 1, 0);
    else if (a === 'C') q = E.rotated(p.field, p.piece, 1);
    else if (a === 'A') q = E.rotated(p.field, p.piece, -1);
    else if (a === 'H') { hardDrop(p); return true; }
    if (!q) { if (p.ctrl === 'human') sound('bump'); return false; }
    p.piece = q;
    if (!E.moved(p.field, q, 0, 1) && p.lockN < 15) { p.lockT = 0; p.lockN++; }
    if (p.ctrl === 'human') sound(a === 'C' || a === 'A' ? 'rotate' : 'move');
    return true;
  }
  function hardDrop(p) {
    const d = E.dropped(p.field, p.piece);
    if (p.ctrl === 'human') p.score += 2 * (d.y - p.piece.y);
    p.piece = d;
    lock(p);
  }

  function lock(p) {
    if (app.opts.mode === 'solo') {
      p.history.push({ field: p.field, qi: p.qi - 1, score: p.score, maxChain: p.maxChain, count: p.count, power: p.power, over: Object.assign({}, p.over) });
      if (p.history.length > 60) p.history.shift();
    }
    const pl = E.place(p.field, p.piece);
    p.piece = null; p.hint = null; p.count++;
    for (const g of pl.gone) p.fx.push({ kind: 'fly', x: g.x, y: 0.5, c: g.c, t0: performance.now(), dur: 900 });
    const res = E.resolve(pl.field);
    p.anim = [{ type: 'fall', field: pl.field, moves: pl.moves, dur: fallDur(pl.moves), land: true }];
    for (const st of res.steps) {
      p.anim.push({ type: 'pop', step: st, dur: 520 });
      p.anim.push({ type: 'fall', field: st.after, moves: st.moves, dur: fallDur(st.moves) });
    }
    p.after = () => afterResolve(p, res);
    p.state = 'anim'; p.cur = null;
    if (p.ctrl === 'human') renderSide();
  }
  function fallDur(moves) {
    let d = 0;
    for (const m of moves) d = Math.max(d, m.to - m.from);
    return d <= 0 ? 0 : Math.min(520, 70 + d * 30);
  }

  function runAnim(p, dt) {
    if (!p.cur) {
      p.cur = p.anim.shift();
      p.animT = 0;
      if (!p.cur) { const f = p.after; p.after = null; if (f) f(); else p.state = 'spawn'; return; }
      startAnim(p, p.cur);
    }
    p.animT += dt;
    if (p.animT >= p.cur.dur) {
      if (p.cur.field) p.field = p.cur.field;
      if (p.cur.type === 'fall') { const t = performance.now(); for (const m of p.cur.moves) p.land.set(E.at(m.x, m.to), t); }
      if (p.cur.end) p.cur.end();
      p.cur = null;
    }
  }

  function startAnim(p, a) {
    if (a.type === 'fall' && a.land && p.ctrl === 'human') sound('land');
    if (a.type === 'power') { startPowerAnim(p, a); return; }
    if (a.type !== 'pop') return;
    const st = a.step, now = performance.now();
    let sx = 0, sy = 0;
    for (const i of st.popped) { sx += i % E.W; sy += (i / E.W) | 0; }
    sx /= st.popped.length; sy /= st.popped.length;
    if (!a.zap) p.fx.push({ kind: 'label', text: st.chain === 1 ? 'ぱちん！' : st.chain + 'れんさ！', x: sx + 0.5, y: sy, chain: st.chain, t0: now + 180, dur: 1100 });
    const t1 = now + 200;
    for (const i of st.popped.concat(st.clouds)) {
      const x = i % E.W, y = (i / E.W) | 0, c = st.before[i];
      p.fx.push({ kind: 'wave', x, y, t0: t1, dur: 420 });
      for (let k = 0; k < 5; k++) {
        const ang = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
        p.fx.push({ kind: 'mini', x, y, c, s: 0.18 + Math.random() * 0.16, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.5, t0: t1, dur: 650 + Math.random() * 250 });
      }
      p.fx.push({ kind: 'star', x, y, col: ['#fff59d', '#ffffff', '#ffd1f0'][Math.floor(Math.random() * 3)], vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 2, t0: t1, dur: 700 });
    }
    if (st.chain >= 2) p.shake = { t0: t1, dur: 260 + st.chain * 60, amp: Math.min(9, 2 + st.chain * 1.5) * (p.cell / 40) };
    if (a.zap) { sound('cloud', 0.6); return; }
    sound('pop', st.chain);
    p.power = Math.min(E.POWER_MAX, p.power + st.popped.filter(i => st.before[i] !== E.CLOUD).length);
    p.score += st.points;
    p.maxChain = Math.max(p.maxChain, st.chain);
    sendAttack(p, st.points);
    if (p.side === 1 && st.chain >= 2) { setOppMood('happy', 1500); speak(pickLine(p.char.lines.chain), 1600); }
    if (p.side === 0 && opp() && st.chain >= 2) setOppMood('wow', 1300);
    if (p.ctrl === 'human') renderSide();
  }

  function sendAttack(p, points) {
    if (app.opts.mode !== 'vs') return;
    const a = E.attack(points, p.carry);
    p.carry = a.carry;
    let n = a.n;
    if (!n) return;
    const off = Math.min(n, p.pend);
    if (off) { p.pend -= off; n -= off; if (p.ctrl === 'human') toast('はねかえした！', ''); }
    const o = app.players[1 - p.side];
    if (n > 0 && o && o.state !== 'dead') {
      o.pend += n;
      if (o.ctrl === 'human') sound('warn');
    }
    renderPend();
  }

  // ---------- フルーツパワー ----------

  function usePower(p) {
    if (!p || p.power < E.POWER_MAX || !(p.state === 'fall' || p.state === 'spawn') || app.over) return;
    if (p.piece) { p.qi--; p.piece = null; }  // いまの ふたつぐみは あとで もういちど でてくる
    if (app.opts.mode === 'solo') p.history.push({ field: p.field, qi: p.qi, score: p.score, maxChain: p.maxChain, count: p.count, power: p.power, over: Object.assign({}, p.over) });
    p.power = 0; p.hint = null; p.soft = false; p.tok++;
    const before = p.field;
    const e = E.power(p.char.id, before, {});
    if (e.over) for (let k = 0; k < e.over.n; k++) p.over[p.qi + k] = E.overPair(e.over.kind, pairAt(p, p.qi + k));
    if (e.cancel && p.pend) { p.pend = 0; renderPend(); }
    p.anim = [{ type: 'power', dur: 1100, field: e.cleared.length ? null : e.field, info: e, before }];
    if (e.cleared.length) {
      p.anim.push({ type: 'pop', zap: true, dur: 420, step: { chain: 0, popped: e.cleared, clouds: [], before: e.before, after: e.field, points: 0 } });
      p.anim.push({ type: 'fall', field: e.field, moves: e.moves, dur: fallDur(e.moves) });
    }
    const res = E.resolve(e.field, e.force);
    for (const st of res.steps) {
      p.anim.push({ type: 'pop', step: st, dur: 520 });
      p.anim.push({ type: 'fall', field: st.after, moves: st.moves, dur: fallDur(st.moves) });
    }
    p.after = () => afterResolve(p, res, true);
    p.state = 'anim'; p.cur = null;
    renderSide();
  }
  function startPowerAnim(p, a) {
    const P = E.POWERS[p.char.id];
    sound('power');
    p.fx.push({ kind: 'power', name: P.name, id: p.char.id, t0: performance.now(), dur: a.dur, cells: a.info.recolor.concat(a.info.cleared) });
    if (p.side === 1) { setOppMood('happy', 1600); speak(`${P.name}！`, 1600); }
  }
  const charImgs = {};
  function charImg(id) {
    if (!charImgs[id]) { const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CH.svg(id, 'happy')); charImgs[id] = im; }
    return charImgs[id];
  }

  function afterResolve(p, res, fromPower) {
    if (res.allClear) {
      p.score += E.ALL_CLEAR;
      sendAttack(p, E.ALL_CLEAR);
      if (p.ctrl === 'human') { toast('ぜんぶ きえた！ ボーナス！', 'big'); sound('fanfare'); }
    }
    if (p.pend > 0 && !res.chain && !fromPower) {
      const d = E.dropClouds(p.field, p.pend, p.rng);
      p.pend -= d.dropped;
      renderPend();
      if (d.moves.length) {
        p.anim = [{ type: 'fall', field: d.field, moves: d.moves, dur: 600, clouds: true }];
        p.after = null;
        p.cur = null;
        sound('cloud', p.ctrl === 'human' ? 1 : 0.5);
        if (p.side === 0) { if (app.settings.vibrate && navigator.vibrate) try { navigator.vibrate(d.dropped >= 12 ? [60, 40, 90] : 50); } catch (e) { /* なし */ } }
        else if (d.dropped >= 6) { setOppMood('wow', 1400); speak(pickLine(p.char.lines.ouch), 1500); }
        return;
      }
    }
    p.state = 'spawn';
  }

  // ---------- かち・まけ ----------

  function lose(p) {
    p.state = 'dead'; p.deadT = 0; p.piece = null;
    app.over = true;
    for (const o of app.players) if (o !== p && o.state !== 'dead') { o.state = 'idle'; o.piece = null; }
    const vs = app.opts.mode === 'vs';
    const tok = app.token;
    if (!vs) {
      sound('lose');
      const nb = p.score > app.best;
      if (nb) { app.best = p.score; save(); }
      setTimeout(() => { if (tok === app.token) showResult('solo', nb); }, 1300);
      return;
    }
    const win = p.side === 1;
    if (win) {
      setOppMood('sad'); speak(opp().char.lines.lose, 3000);
      app.beaten[opp().char.id] = true; save();
      sound('win'); bubbles();
    } else {
      setOppMood('happy'); speak(opp().char.lines.win, 3000);
      sound('lose');
    }
    setTimeout(() => { if (tok === app.token) showResult(win ? 'win' : 'lose'); }, 1500);
  }

  function showResult(kind, newBest) {
    const P = me(), O = opp();
    const t = $('result-title');
    t.className = kind === 'lose' ? 'lose' : 'win';
    if (kind === 'solo') {
      t.textContent = 'おしまい！';
      $('result-face').innerHTML = CH.svg(app.opts.me, P.maxChain >= 3 ? 'happy' : 'wow');
      $('result-text').textContent = P.maxChain >= 2 ? `さいだい ${P.maxChain}れんさ！ よく がんばったね。` : 'つぎは れんさ に チャレンジ してみよう！';
      $('result-score').innerHTML = `<table class="score-table">
        <tr><td>てんすう</td><td><b>${P.score}</b></td></tr>
        <tr><td>さいだい れんさ</td><td>${P.maxChain}</td></tr>
        <tr><td>おいた かず</td><td>${P.count}</td></tr>
        <tr><td>さいこう きろく</td><td class="${newBest ? 'newbest' : ''}">${app.best}${newBest ? '（しんきろく！）' : ''}</td></tr></table>`;
    } else {
      const win = kind === 'win';
      t.textContent = win ? 'かった！' : 'まけちゃった…';
      $('result-face').innerHTML = CH.svg(O.char.id, win ? 'sad' : 'happy');
      $('result-text').textContent = `${O.char.name}「${win ? O.char.lines.lose : O.char.lines.win}」`;
      $('result-score').innerHTML = `<table class="score-table">
        <tr><th></th><th>あなた</th><th>${O.char.name}</th></tr>
        <tr><td>てんすう</td><td>${P.score}</td><td>${O.score}</td></tr>
        <tr><td>さいだい れんさ</td><td>${P.maxChain}</td><td>${O.maxChain}</td></tr></table>`;
    }
    const nextChar = CH.LIST[(CH.BY[app.opts.opp].index + 1)];
    $('btn-result-next').hidden = !(kind === 'win' && nextChar);
    if (nextChar) $('btn-result-next').textContent = `つぎの あいて（${nextChar.name}）`;
    $('btn-result-undo').hidden = !(kind === 'solo' && P.history.length);
    $('btn-result-retry').className = kind === 'win' && nextChar ? '' : 'primary';
    $('dlg-result').showModal();
  }

  function onUndo() {
    const p = me();
    if (!p || app.opts.mode !== 'solo' || !p.history.length) return;
    if (!(p.state === 'fall' || p.state === 'spawn' || p.state === 'dead' || p.state === 'ready')) return;
    const h = p.history.pop();
    Object.assign(p, { field: h.field, qi: h.qi, score: h.score, maxChain: h.maxChain, count: h.count, power: h.power || 0, over: h.over || {}, piece: null, state: 'spawn', fx: [], deadT: 0 });
    app.over = false; app.running = true;
    sound('undo');
    renderSide();
  }

  // ---------- CPU ----------

  let worker = null, workerOK = typeof Worker !== 'undefined', reqId = 0;
  const jobs = new Map();
  function runLocal(job) {
    setTimeout(() => job.resolve(AI.choose(Int8Array.from(job.msg.field), job.msg.pairs, AI.LEVELS[job.msg.level], job.msg.ctx)), 10);
  }
  function getWorker() {
    if (!workerOK) return null;
    if (!worker) {
      try {
        worker = new Worker('js/worker.js');
        worker.onmessage = e => { const j = jobs.get(e.data.id); jobs.delete(e.data.id); if (j) j.resolve(e.data.result); };
        worker.onerror = () => {
          // file:// などで Worker が つかえない ときは 画面がわで かんがえる
          workerOK = false; worker = null;
          for (const j of jobs.values()) runLocal(j);
          jobs.clear();
        };
      } catch (e) { workerOK = false; worker = null; }
    }
    return worker;
  }
  function ask(msg) {
    return new Promise(resolve => {
      const job = { msg, resolve };
      const w = getWorker();
      if (!w) return runLocal(job);
      const id = ++reqId;
      jobs.set(id, job);
      w.postMessage(Object.assign({ id }, msg));
    });
  }
  function requestPlan(p) {
    p.plan = null; p.planT = 0; p.stepT = 0; p.soft = false;
    const tok = ++p.tok, gtok = app.token;
    ask({
      field: Array.from(p.field),
      pairs: [pairAt(p, p.qi - 1), pairAt(p, p.qi)],
      level: p.char.level,
      ctx: { pend: p.pend, colors: app.queue.colors },
    }).then(r => {
      if (tok !== p.tok || gtok !== app.token) return;
      p.plan = r || { x: p.piece ? p.piece.x : 2, rot: 0 };
    });
  }
  function cpuStep(p, dt) {
    p.planT += dt;
    if (!p.plan || p.planT < p.char.think) return;
    p.stepT += dt;
    if (p.stepT < p.char.step) return;
    p.stepT = 0;
    const path = AI.pathTo(p.field, p.piece, p.plan);
    if (path === null) { hardDrop(p); return; }
    if (path.length) { if (!act(p, path[0])) hardDrop(p); return; }
    if (p.char.drop === 'hard') hardDrop(p);
    else p.soft = true;
  }

  // ---------- ヒント ----------

  function onHint() {
    const p = me();
    if (!p || p.state !== 'fall') return;
    const mv = AI.choose(p.field, [[p.piece.a, p.piece.b], pairAt(p, p.qi)], AI.LEVELS.hint, { colors: app.queue.colors, pend: p.pend });
    if (!mv) return;
    let q = { x: mv.x, y: p.piece.y, rot: mv.rot, a: p.piece.a, b: p.piece.b };
    if (!E.fits(p.field, q)) q = { x: mv.x, y: E.SPAWN_Y, rot: mv.rot, a: p.piece.a, b: p.piece.b };
    if (!E.fits(p.field, q)) return;
    const pl = E.place(p.field, E.dropped(p.field, q));
    p.hint = { x: mv.x, rot: mv.rot, cells: pl.moves.map(m => ({ x: m.x, y: m.to, c: m.c })) };
    sound('hint');
  }

  // ---------- 大きさ ----------

  const DPR = () => Math.min(3, window.devicePixelRatio || 1);
  function layout() {
    if (!app.players.length) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const vs = app.opts.mode === 'vs';
    const top = $('layout').getBoundingClientRect().top + window.scrollY;
    const below = $('status').offsetHeight + $('pad').offsetHeight + document.querySelector('.controls').offsetHeight + 6 * 3 + 14;
    const ah = vh - top - below - ($('head-0').offsetHeight || 40) - 18 - 8 - 12 - 12;
    const aw = Math.min(vw, 980) - 24;
    let c;
    if (vs) c = Math.min(ah / VIS, (aw - 16) / (6 + 6 * 0.45), 46);
    else c = Math.min(ah / VIS, (aw - 16 - 92) / 6, 48);
    c = Math.max(18, Math.floor(c));
    sizeCanvas(me(), c);
    if (vs) {
      const room = aw - 16 - 6 * c;
      let co = Math.min(room / 6, c * 0.8);
      const roomH = 12.5 * c + 56 - (vw >= 760 ? 104 : 78) - 18 - 14 - 30 - c * 0.62 * 2 - 40;
      co = Math.max(12, Math.floor(Math.min(co, roomH / VIS)));
      sizeCanvas(opp(), co);
    }
    const nc = Math.floor(vs ? Math.min(c * 0.62, 30) : Math.min(c * 0.85, 40));
    app.nextCell = nc;
    const nv = $('cv-next'), d = DPR();
    nv.width = Math.round(nc * 2.0 * d); nv.height = Math.round(nc * 2.0 * d);
    nv.style.width = nc * 2.0 + 'px'; nv.style.height = nc * 2.0 + 'px';
    $('solo-info').style.width = Math.max(84, nc * 2.2) + 'px';
    sprites.clear();
  }
  function sizeCanvas(p, c) {
    const d = DPR();
    p.cell = c;
    p.cv.width = Math.round(E.W * c * d); p.cv.height = Math.round(VIS * c * d);
    p.cv.style.width = E.W * c + 'px'; p.cv.style.height = VIS * c + 'px';
    p.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  // ---------- あわの え ----------

  const POPFONT = "'Mochiy Pop One', 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', sans-serif";
  const sprites = new Map();
  // face：n ふつう / b まばたき / h にっこり（はじける まえ）/ w こまった（あぶない）/ - かお なし
  function sprite(c, r, face) {
    const d = DPR(), f = app.settings.faces ? (face || 'n') : '-';
    const key = c + ':' + r + ':' + f + ':' + (app.settings.marks ? 1 : 0);
    let s = sprites.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    const R = Math.ceil(r * d), pad = Math.ceil(3 * d);
    s.width = s.height = 2 * (R + pad);
    const g = s.getContext('2d'), x = R + pad, y = R + pad;
    const col = COL[c];
    if (c === E.CLOUD) {
      const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.05, x, y, R);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#dde4ee'); gr.addColorStop(1, '#9aa8bd');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y + R * 0.1, R * 0.84, 0, Math.PI * 2);
      g.arc(x - R * 0.45, y - R * 0.28, R * 0.44, 0, Math.PI * 2);
      g.arc(x + R * 0.45, y - R * 0.28, R * 0.44, 0, Math.PI * 2);
      g.arc(x, y - R * 0.5, R * 0.46, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = R * 0.07; g.stroke();
      g.strokeStyle = '#475569'; g.lineWidth = R * 0.1; g.lineCap = 'round';
      // ねむそうな かお
      for (const k of [-1, 1]) { g.beginPath(); g.arc(x + k * R * 0.32, y + R * 0.02, R * 0.12, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
      g.beginPath(); g.ellipse(x, y + R * 0.36, R * 0.09, R * 0.06, 0, 0, Math.PI * 2); g.fillStyle = '#475569'; g.fill();
      s.R = R + pad; s.d = d;
      sprites.set(key, s);
      return s;
    }
    // そとがわの しろい ふち（くらい みずの なかで くっきり みえる）
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(x, y, R * 1.0, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(x - R * 0.32, y - R * 0.38, R * 0.04, x, y + R * 0.1, R * 1.05);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.35, col.mid);
    gr.addColorStop(0.85, col.base);
    gr.addColorStop(1, col.rim);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, R * 0.92, 0, Math.PI * 2); g.fill();
    if (c === E.RAINBOW) {
      // にじあわ：にじいろ の しま
      const cg = g.createConicGradient ? g.createConicGradient(-Math.PI / 2, x, y) : g.createLinearGradient(x - R, y, x + R, y);
      ['#ff4d6d', '#ffb000', '#ffe14d', '#3ddc84', '#3aa0ff', '#a463ff', '#ff4d6d'].forEach((cc, k, arr) => cg.addColorStop(k / (arr.length - 1), cc));
      g.globalAlpha = 0.75; g.fillStyle = cg;
      g.beginPath(); g.arc(x, y, R * 0.92, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      const wg = g.createRadialGradient(x - R * 0.25, y - R * 0.3, 0, x, y, R * 0.95);
      wg.addColorStop(0, 'rgba(255,255,255,0.95)'); wg.addColorStop(0.45, 'rgba(255,255,255,0.35)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = wg; g.beginPath(); g.arc(x, y, R * 0.92, 0, Math.PI * 2); g.fill();
    }
    if (app.settings.marks) { g.fillStyle = 'rgba(255,255,255,0.5)'; mark(g, c, x + R * 0.42, y + R * 0.46, R * 0.2); }
    // しゃぼんの にじいろ
    const rb = g.createLinearGradient(x - R, y + R, x + R, y - R);
    rb.addColorStop(0, 'rgba(255,120,200,0)'); rb.addColorStop(0.45, 'rgba(255,255,255,0.0)');
    rb.addColorStop(0.6, 'rgba(120,255,240,0.35)'); rb.addColorStop(0.8, 'rgba(255,240,120,0.35)'); rb.addColorStop(1, 'rgba(255,120,200,0)');
    g.strokeStyle = rb; g.lineWidth = R * 0.12;
    g.beginPath(); g.arc(x, y, R * 0.8, 0, Math.PI * 2); g.stroke();
    if (f !== '-') face4(g, x, y, R, f);
    // ひかり
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.ellipse(x - R * 0.42, y - R * 0.48, R * 0.24, R * 0.13, -0.75, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x - R * 0.12, y - R * 0.7, R * 0.07, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = R * 0.08; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y, R * 0.72, Math.PI * 0.08, Math.PI * 0.38); g.stroke();
    s.R = R + pad; s.d = d;
    sprites.set(key, s);
    return s;
  }
  function face4(g, x, y, R, f) {
    const ex = R * 0.3, ey = y + R * 0.06, ink = '#24123f';
    g.fillStyle = 'rgba(255,110,160,0.5)';
    for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * R * 0.56, ey + R * 0.2, R * 0.13, R * 0.08, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
    if (f === 'n' || f === 'w') {
      const ry = f === 'w' ? R * 0.13 : R * 0.17;
      for (const k of [-1, 1]) {
        g.fillStyle = ink;
        g.beginPath(); g.ellipse(x + k * ex, ey, R * 0.11, ry, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(x + k * ex + R * 0.035, ey - ry * 0.45, R * 0.05, 0, Math.PI * 2); g.fill();
      }
    } else if (f === 'b') {
      g.lineWidth = R * 0.08;
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(x + k * ex - R * 0.11, ey + R * 0.02); g.quadraticCurveTo(x + k * ex, ey + R * 0.08, x + k * ex + R * 0.11, ey + R * 0.02); g.stroke(); }
    } else if (f === 'h') {
      g.lineWidth = R * 0.085;
      for (const k of [-1, 1]) { g.beginPath(); g.arc(x + k * ex, ey + R * 0.06, R * 0.12, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    }
    g.lineWidth = R * 0.065;
    if (f === 'h') {
      g.fillStyle = '#c2185b';
      g.beginPath(); g.moveTo(x - R * 0.15, ey + R * 0.2); g.quadraticCurveTo(x, ey + R * 0.48, x + R * 0.15, ey + R * 0.2); g.closePath(); g.fill(); g.stroke();
    } else if (f === 'w') {
      g.beginPath(); g.moveTo(x - R * 0.13, ey + R * 0.32); g.quadraticCurveTo(x - R * 0.06, ey + R * 0.24, x, ey + R * 0.32); g.quadraticCurveTo(x + R * 0.06, ey + R * 0.4, x + R * 0.13, ey + R * 0.32); g.stroke();
      g.lineWidth = R * 0.06;
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(x + k * (ex - R * 0.12), ey - R * 0.27); g.lineTo(x + k * (ex + R * 0.1), ey - R * 0.2); g.stroke(); }
    } else {
      g.beginPath(); g.arc(x, ey + R * 0.2, R * 0.1, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
  }
  function mark(g, c, x, y, s) {
    g.beginPath();
    if (c === 1) { // ハート
      g.moveTo(x, y + s * 0.85);
      g.bezierCurveTo(x - s * 1.5, y - s * 0.15, x - s * 0.55, y - s * 1.15, x, y - s * 0.35);
      g.bezierCurveTo(x + s * 0.55, y - s * 1.15, x + s * 1.5, y - s * 0.15, x, y + s * 0.85);
    } else if (c === 2) { // はっぱ
      g.ellipse(x, y, s * 1.0, s * 0.5, -Math.PI / 4, 0, Math.PI * 2);
    } else if (c === 3) { // しずく
      g.moveTo(x - s * 0.62, y + s * 0.2); g.lineTo(x, y - s * 1.0); g.lineTo(x + s * 0.62, y + s * 0.2);
      g.arc(x, y + s * 0.2, s * 0.62, 0, Math.PI);
    } else if (c === 4) { // ほし
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.45 : s * 1.05;
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    } else { // ダイヤ
      g.moveTo(x, y - s); g.lineTo(x + s * 0.75, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.75, y);
    }
    g.closePath(); g.fill();
  }
  // o：{ alpha, sx, sy（よこ・たての のび。したを じめんに つける）, face, flash（しろく ひかる 0〜1） }
  function bubble(ctx, c, cx, cy, r, o) {
    o = o || {};
    const s = sprite(c, r, o.face);
    const sx = o.sx || 1, sy = o.sy || 1, k = 1 / s.d;
    const Rw = s.R * k * sx, Rh = s.R * k * sy;
    const yy = cy + r * (1 - sy);
    if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = Math.max(0, o.alpha);
    ctx.drawImage(s, cx - Rw, yy - Rh, 2 * Rw, 2 * Rh);
    if (o.flash > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, o.flash)) * (o.alpha === undefined ? 1 : o.alpha);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(cx, yy, r * 0.92 * sx, r * 0.92 * sy, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function star(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = rot + k * Math.PI / 4, rr = k % 2 ? r * 0.38 : r;
      ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  function hash(i) { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

  // ---------- ばめんを かく ----------

  function drawBack(ctx, p, Wd, Hd, c, now, danger) {
    const bg = ctx.createLinearGradient(0, 0, 0, Hd);
    bg.addColorStop(0, '#3b3a9e'); bg.addColorStop(0.55, '#2a2873'); bg.addColorStop(1, '#1a1a4f');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, Wd, Hd);
    // チェックの もよう
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < 13; y++) for (let x = 0; x < E.W; x++) if ((x + y) % 2) ctx.fillRect(x * c, (y - 0.5) * c, c, c);
    // ひかりの すじ
    ctx.save();
    ctx.globalAlpha = 0.09 + 0.03 * Math.sin(now / 1500);
    ctx.fillStyle = '#bfe9ff';
    for (let k = 0; k < 3; k++) {
      const x0 = (k * 0.38 + 0.08) * Wd + Math.sin(now / 2400 + k) * c * 0.4;
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + c * 0.9, 0); ctx.lineTo(x0 + c * 2.4, Hd); ctx.lineTo(x0 + c * 1.1, Hd); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // のぼっていく ちいさな あわ
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 9; k++) {
      const bx = hash(k + 3) * Wd, by = Hd - ((now / (30 + k * 7) + k * 140) % (Hd + 40)) + 20;
      ctx.beginPath(); ctx.arc(bx + Math.sin(now / 600 + k) * 5, by, c * (0.05 + hash(k) * 0.07), 0, Math.PI * 2); ctx.stroke();
    }
    // まけ の しるし
    const dx = (E.SPAWN_X + 0.5) * c, dy = E.SPAWN_Y * c;
    ctx.strokeStyle = danger ? `rgba(255,90,90,${0.65 + 0.35 * Math.sin(now / 130)})` : 'rgba(255,120,120,0.45)';
    ctx.lineWidth = c * 0.11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dx - c * 0.24, dy - c * 0.24); ctx.lineTo(dx + c * 0.24, dy + c * 0.24);
    ctx.moveTo(dx + c * 0.24, dy - c * 0.24); ctx.lineTo(dx - c * 0.24, dy + c * 0.24); ctx.stroke();
    if (danger) {
      const vg = ctx.createLinearGradient(0, 0, 0, Hd * 0.4);
      vg.addColorStop(0, `rgba(255,40,80,${0.28 + 0.12 * Math.sin(now / 130)})`); vg.addColorStop(1, 'rgba(255,40,80,0)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, Wd, Hd * 0.4);
    }
  }

  function draw(p, now, stopped) {
    const ctx = p.ctx, c = p.cell, Wd = E.W * c, Hd = VIS * c;
    // x れつ・y 行の まんなか。みえない列（y=0）は うえに はんぶん だけ のぞく
    const X = x => (x + 0.5) * c, cy = y => y * c;
    const danger = p.state !== 'dead' && E.heights(p.field)[E.SPAWN_X] >= 10;
    ctx.clearRect(0, 0, Wd, Hd);
    drawBack(ctx, p, Wd, Hd, c, now, danger);
    // ゆれ（おおきな れんさ）
    ctx.save();
    if (p.shake && now < p.shake.t0 + p.shake.dur) {
      const u = (now - p.shake.t0) / p.shake.dur, amp = p.shake.amp * (1 - u);
      ctx.translate(Math.sin(now / 18) * amp, Math.cos(now / 23) * amp * 0.6);
    }

    // どの 盤を かくか（アニメーション中は とちゅうの ようす）
    const a = p.cur;
    let F = p.field, moving = null, popping = null, au = 0;
    if (a && a.type === 'fall') {
      F = a.field; au = a.dur ? Math.min(1, p.animT / a.dur) : 1;
      moving = new Map();
      for (const m of a.moves) moving.set(E.at(m.x, m.to), m);
    } else if (a && a.type === 'pop') {
      F = a.step.before; au = Math.min(1, p.animT / a.dur);
      popping = new Set(a.step.popped.concat(a.step.clouds));
    }
    const glow = p.ctrl === 'human' && p.state === 'fall' && app.settings.preview ? previewOf(p) : null;
    const glowSet = glow && glow.res.chain ? new Set(glow.res.steps[0].popped.concat(glow.res.steps[0].clouds)) : null;

    const r = c * 0.5;
    const deadOff = p.state === 'dead' ? i => Math.pow(p.deadT / 1000, 2) * c * (6 + ((i * 7) % 5)) : null;
    // ちゃくちの ぷるん（おちて すぐは つぶれて もどる）
    for (const [i, t0] of p.land) if (now - t0 > 420) p.land.delete(i);
    const squash = i => {
      const t0 = p.land.get(i);
      if (t0 === undefined) return 0;
      const u = (now - t0) / 420;
      return Math.exp(-u * 4) * Math.cos(u * 14) * 0.26;
    };
    const faceOf = (i, v) => {
      if (deadOff || danger) return 'w';
      if ((popping && popping.has(i)) || (glowSet && glowSet.has(i))) return 'h';
      const ph = (now / 1000 + hash(i) * 9) % 4.2;
      return ph < 0.13 ? 'b' : 'n';
    };
    // つながり（おなじ いろが となりあうと くっつく）
    for (let y = 1; y < E.H; y++) for (let x = 0; x < E.W; x++) {
      const i = E.at(x, y), v = F[i];
      if (!v || v === E.CLOUD || (moving && moving.has(i)) || deadOff) continue;
      const pa = popping && popping.has(i);
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        if (nx >= E.W || ny >= E.H) continue;
        const j = E.at(nx, ny);
        const u2 = F[j];
        if (!u2 || u2 === E.CLOUD || (moving && moving.has(j))) continue;
        if (u2 !== v && v !== E.RAINBOW && u2 !== E.RAINBOW) continue;
        if (v === E.RAINBOW && u2 === E.RAINBOW) continue;
        const bc = v === E.RAINBOW ? u2 : v;
        const pb = popping && popping.has(j);
        if ((pa || pb) && au > 0.4) continue;
        const w = c * 0.6, x1 = X(x), y1 = cy(y), x2 = X(nx), y2 = cy(ny);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        if (nx > x) { ctx.fillRect(x1, y1 - w / 2 - 1.5, c, w + 3); } else { ctx.fillRect(x1 - w / 2 - 1.5, y1, w + 3, c); }
        const gr = nx > x ? ctx.createLinearGradient(0, y1 - w / 2, 0, y1 + w / 2) : ctx.createLinearGradient(x1 - w / 2, 0, x1 + w / 2, 0);
        gr.addColorStop(0, COL[bc].mid); gr.addColorStop(1, COL[bc].base);
        ctx.fillStyle = gr;
        if (nx > x) ctx.fillRect(x1, y1 - w / 2, x2 - x1, w); else ctx.fillRect(x1 - w / 2, y1, w, y2 - y1);
      }
    }
    // あわ
    for (let y = 0; y < E.H; y++) for (let x = 0; x < E.W; x++) {
      const i = E.at(x, y), v = F[i];
      if (!v || (moving && moving.has(i))) continue;
      const breath = 0.025 * Math.sin(now / 420 + hash(i) * 6.3);
      const sq = squash(i);
      let px = X(x), py = cy(y), sx = 1 + sq - breath * 0.6, sy = 1 - sq + breath, al = 1, flash = 0;
      if (deadOff) { py += deadOff(i); px += Math.sin(i) * p.deadT / 60; }
      if (popping && popping.has(i)) {
        if (au < 0.4) { const w = Math.sin(au * 40); sx = 1 + 0.1 * w; sy = 1 - 0.1 * w; flash = 0.25 + 0.35 * Math.abs(Math.sin(au * 24)); }
        else { const v2 = (au - 0.4) / 0.6; sx = sy = 1 + 0.6 * v2; al = 1 - v2; flash = 0.6 * (1 - v2); }
      }
      if (glowSet && glowSet.has(i)) { const g2 = 0.07 * Math.sin(now / 110); sx += g2; sy -= g2; }
      bubble(ctx, v, px, py, r, { alpha: al, sx, sy, face: faceOf(i, v), flash });
      if (glowSet && glowSet.has(i)) ring(ctx, px, py, r, now);
    }
    if (moving) for (const m of moving.values()) {
      const e = ease(au), yy = m.from + (m.to - m.from) * e;
      const st = au < 1 ? 0.12 * Math.min(1, (m.to - m.from) / 3) : 0;
      bubble(ctx, m.c, X(m.x), cy(yy), r, { sx: 1 - st, sy: 1 + st, face: m.c === E.CLOUD ? 'n' : 'w' });
    }
    // おちる ばしょ・ヒント・いま うごかしている ふたつぐみ
    if (p.state === 'fall' && p.piece) {
      if (p.ctrl === 'human' && app.settings.ghost && glow) {
        for (const li of glow.landing) {
          const gx = li % E.W, gy = (li / E.W) | 0;
          bubble(ctx, glow.placed[li], X(gx), cy(gy), r * 0.9, { alpha: 0.42, face: glowSet && glowSet.has(li) ? 'h' : 'n' });
          if (glowSet && glowSet.has(li)) ring(ctx, X(gx), cy(gy), r, now);
          else { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(X(gx), cy(gy), r * 0.9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        }
      }
      if (p.hint) {
        ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3.5; ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -now / 40;
        for (const h of p.hint.cells) { ctx.beginPath(); ctx.arc(X(h.x), cy(h.y), r * 0.95, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      // じく（まわる 中心）の まわりが ほんのり ひかる
      const ax = X(p.piece.x), ay = cy(p.piece.y);
      const halo = ctx.createRadialGradient(ax, ay, r * 0.6, ax, ay, r * 1.35);
      halo.addColorStop(0, 'rgba(255,255,255,0.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(ax, ay, r * 1.35, 0, Math.PI * 2); ctx.fill();
      const wig = 0.04 * Math.sin(now / 150);
      for (const [x, y, v] of E.cells(p.piece)) {
        bubble(ctx, v, X(x), cy(y), r, { sx: 1 + wig, sy: 1 - wig, face: danger ? 'w' : ((now / 1000 + x) % 3.5 < 0.12 ? 'b' : 'n') });
      }
    }
    // こうか（はじける つぶ・ほし・とんでいく あわ・れんさ の もじ）
    p.fx = p.fx.filter(f => now < f.t0 + f.dur);
    for (const f of p.fx) {
      const u = (now - f.t0) / f.dur;
      if (u < 0) continue;
      const t = (now - f.t0) / 1000;
      if (f.kind === 'mini') {
        const fx = X(f.x) + f.vx * t * c, fy = cy(f.y) + (f.vy * t + 7 * t * t) * c;
        bubble(ctx, f.c, fx, fy, r * f.s, { alpha: 1 - u * u, face: '-' });
      } else if (f.kind === 'star') {
        ctx.fillStyle = f.col; ctx.globalAlpha = 1 - u;
        star(ctx, X(f.x) + f.vx * t * c, cy(f.y) + (f.vy * t + 4 * t * t) * c, c * 0.18 * (1 - u * 0.4), u * 6 + f.x);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'wave') {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - u)})`; ctx.lineWidth = 3 * (1 - u) + 1;
        ctx.beginPath(); ctx.arc(X(f.x), cy(f.y), r * (0.8 + u * 1.6), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'fly') {
        bubble(ctx, f.c, X(f.x) + Math.sin(u * 8) * c * 0.2, cy(f.y) - u * c * 2, r * 0.9, { alpha: 1 - u });
      } else if (f.kind === 'label') {
        chainText(ctx, f, u, now, Wd, c, X, cy);
      } else if (f.kind === 'power') {
        powerFx(ctx, f, u, now, Wd, Hd, c, r, X, cy);
      }
    }
    ctx.restore();
    // おおう もじ
    let cover = null, style = 'blue';
    if (p.state === 'ready' && p.readyT >= 0) { cover = p.readyT < 650 ? 'よーい' : 'スタート！'; style = p.readyT < 650 ? 'blue' : 'pink'; }
    else if (stopped && app.paused && app.running) cover = 'ひとやすみ';
    else if (p.state === 'dead' && p.deadT > 500) { cover = app.opts.mode === 'vs' ? 'まけ…' : 'おしまい'; style = 'gray'; }
    else if (p.state === 'idle' && app.over) { cover = 'かち！'; style = 'gold'; }
    if (cover) banner(ctx, cover, style, Wd, Hd, c, now, p.state === 'ready' ? (p.readyT < 650 ? p.readyT : p.readyT - 650) : 999);
  }

  // フルーツパワー：キャラクターが とびこんで きて、わざの なまえ。かわる あわが ひかる
  function powerFx(ctx, f, u, now, Wd, Hd, c, r, X, cy) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.25 * Math.sin(Math.min(1, u) * Math.PI)})`;
    ctx.fillRect(0, 0, Wd, Hd);
    for (const i of f.cells) {
      const x = X(i % E.W), y = cy((i / E.W) | 0);
      ctx.fillStyle = '#fff59d'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 70);
      star(ctx, x, y, r * (0.9 + 0.3 * Math.sin(now / 90 + i)), now / 200 + i);
    }
    ctx.globalAlpha = u > 0.8 ? (1 - u) / 0.2 : 1;
    const t = Math.min(1, u / 0.25), back = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
    const im = charImg(f.id), sz = Math.min(Wd * 0.62, c * 3.6);
    const cx0 = Wd / 2 + (1 - back) * Wd, cy0 = Hd * 0.34;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(cx0, cy0, sz * 0.56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 4; ctx.stroke();
    if (im.complete) ctx.drawImage(im, cx0 - sz / 2, cy0 - sz / 2, sz, sz);
    const fs = Math.round(Math.min(c * 0.8, Wd / (f.name.length * 1.05 + 0.5)));
    ctx.font = `${fs}px ${POPFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const ty = cy0 + sz * 0.7;
    ctx.translate(Wd / 2, ty); ctx.scale(back, back); ctx.rotate(-0.05);
    ctx.lineWidth = fs * 0.32; ctx.strokeStyle = '#2b1660'; ctx.strokeText(f.name + '！', 0, 0);
    const gr = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2); gr.addColorStop(0, '#ffe14d'); gr.addColorStop(1, '#ff8a00');
    ctx.fillStyle = gr; ctx.fillText(f.name + '！', 0, 0);
    ctx.restore();
  }

  function chainText(ctx, f, u, now, Wd, c, X, cy) {
    const big = f.chain >= 2;
    const fs = Math.round(c * (big ? 0.7 + Math.min(5, f.chain) * 0.08 : 0.6));
    const tin = Math.min(1, u / 0.22);
    const back = 1 + 2.7 * Math.pow(tin - 1, 3) + 1.7 * Math.pow(tin - 1, 2);
    const sc = 0.3 + 0.7 * back;
    const lx = Math.min(Wd - fs * 2.3, Math.max(fs * 2.3, X(f.x - 0.5))), ly = cy(f.y) - u * c * 1.0;
    ctx.save();
    ctx.translate(lx, ly); ctx.scale(sc, sc); ctx.rotate(-0.06 + 0.03 * Math.sin(now / 90));
    ctx.globalAlpha = u > 0.8 ? (1 - u) / 0.2 : 1;
    if (big) {
      // ほしがた の ひかり
      ctx.fillStyle = f.chain >= 4 ? 'rgba(255,214,0,0.85)' : 'rgba(255,236,120,0.75)';
      ctx.beginPath();
      const n = 14, R1 = fs * 1.9, R2 = fs * 1.2, rot = now / 400;
      for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, rr = k % 2 ? R2 : R1; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.62); }
      ctx.closePath(); ctx.fill();
    }
    ctx.font = `${fs}px ${POPFONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.34; ctx.strokeStyle = '#2b1660'; ctx.strokeText(f.text, 0, 0);
    ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, 0, 0);
    const gr = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    const pal = f.chain >= 4 ? ['#ff3d7f', '#ff9a00'] : f.chain === 3 ? ['#ff8a00', '#ffd000'] : f.chain === 2 ? ['#ff4fa3', '#ff86c8'] : ['#2f9bff', '#7fd0ff'];
    gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]);
    ctx.fillStyle = gr; ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }

  function banner(ctx, text, style, Wd, Hd, c, now, t) {
    const cyb = Hd * 0.44, bh = c * 1.7;
    const tin = Math.min(1, t / 260);
    const back = 1 + 2.7 * Math.pow(tin - 1, 3) + 1.7 * Math.pow(tin - 1, 2);
    ctx.save();
    if (style === 'gold') {
      // くるくる まわる ひかり
      ctx.save();
      ctx.translate(Wd / 2, cyb);
      ctx.rotate(now / 1500);
      for (let k = 0; k < 12; k++) {
        ctx.fillStyle = k % 2 ? 'rgba(255,230,120,0.35)' : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Hd, k * Math.PI / 6, (k + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    const cols = { blue: ['#38bdf8', '#2563eb'], pink: ['#ff7ab6', '#ff3d7f'], gray: ['#94a3b8', '#475569'], gold: ['#ffd43b', '#ff9500'] }[style];
    const gr = ctx.createLinearGradient(0, cyb - bh / 2, 0, cyb + bh / 2);
    gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
    ctx.fillStyle = gr;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, cyb - bh / 2, Wd, bh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, cyb - bh / 2, Wd, 3); ctx.fillRect(0, cyb + bh / 2 - 3, Wd, 3);
    const fs = Math.round(Math.min(c * 1.0, Wd / (text.length * 1.05 + 0.6)));
    ctx.translate(Wd / 2, cyb);
    ctx.scale(0.2 + 0.8 * back, 0.2 + 0.8 * back);
    ctx.font = `${fs}px ${POPFONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.3; ctx.strokeStyle = '#2b1660'; ctx.strokeText(text, 0, 2);
    ctx.fillStyle = '#fff'; ctx.fillText(text, 0, 2);
    ctx.restore();
  }

  function ring(ctx, x, y, r, now) {
    ctx.strokeStyle = `rgba(255,240,140,${0.75 + 0.25 * Math.sin(now / 110)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * (1.02 + 0.06 * Math.sin(now / 110)), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff59d';
    star(ctx, x + r * 0.75, y - r * 0.75, r * 0.28 * (0.8 + 0.3 * Math.sin(now / 90)), now / 300);
  }
  function ease(u) {
    // おちる ものは だんだん はやく
    return u >= 1 ? 1 : u * u;
  }

  function previewOf(p) {
    const k = p.piece.x + ',' + p.piece.y + ',' + p.piece.rot;
    if (k !== p.pvKey) { p.pvKey = k; p.pv = E.preview(p.field, p.piece); }
    return p.pv;
  }

  function drawNext(now) {
    const p = me();
    if (!p) return;
    const cv = $('cv-next'), ctx = cv.getContext('2d'), d = DPR(), c = app.nextCell || 24;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, c * 2, c * 2);
    const n1 = pairAt(p, p.qi), n2 = pairAt(p, p.qi + 1);
    const bob = Math.sin(now / 300) * c * 0.04;
    bubble(ctx, n1[1], c * 0.55, c * 0.5 + bob, c * 0.48);
    bubble(ctx, n1[0], c * 0.55, c * 1.48 + bob, c * 0.48);
    bubble(ctx, n2[1], c * 1.55, c * 0.85 - bob, c * 0.34, { alpha: 0.9 });
    bubble(ctx, n2[0], c * 1.55, c * 1.55 - bob, c * 0.34, { alpha: 0.9 });
  }

  // ---------- まわりの ひょうじ ----------

  function renderHeads() {
    const P = me();
    $('head-0').style.setProperty('--cc', P.char.color);
    $('head-0').innerHTML = `<span class="ava">${CH.svg(P.char.id, 'normal')}</span><b>あなた</b><span class="score" id="score-0"><small>てん</small>0</span>`;
    if (opp()) {
      const O = opp();
      $('opp-name').innerHTML = `${O.char.name}<br><small>（${O.char.food}）</small>`;
      $('opp-face').style.setProperty('--cc', O.char.color);
      $('opp-name').style.setProperty('--cc-name', O.char.color);
      setOppMood('normal');
    }
    renderPend();
  }
  function setOppMood(m, ms) {
    if (!opp()) return;
    app.oppMood = m; app.oppMoodT = ms || 0;
    const el = $('opp-face');
    el.innerHTML = CH.svg(opp().char.id, m);
    el.classList.remove('bounce'); void el.offsetWidth;
    if (m !== 'normal') el.classList.add('bounce');
  }
  let speechTimer = 0;
  function speak(text, ms) {
    const el = $('speech');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => el.classList.remove('show'), ms || 2000);
  }
  function pendHTML(n) {
    let h = '';
    const big = Math.floor(n / 30); n %= 30;
    const mid = Math.floor(n / 6); n %= 6;
    for (let k = 0; k < Math.min(big, 4); k++) h += '<i class="s30"></i>';
    for (let k = 0; k < mid; k++) h += '<i class="s6"></i>';
    for (let k = 0; k < n; k++) h += '<i class="s1"></i>';
    return h;
  }
  const pendShown = [-1, -1];
  function renderPend() {
    for (const p of app.players) {
      if (pendShown[p.side] === p.pend) continue;
      const el = $('pend-' + p.side);
      el.innerHTML = pendHTML(p.pend);
      if (p.pend > pendShown[p.side] && pendShown[p.side] >= 0) { el.classList.remove('warn'); void el.offsetWidth; el.classList.add('warn'); }
      pendShown[p.side] = p.pend;
    }
  }
  function renderSide() {
    const P = me();
    if (!P) return;
    const sc = $('score-0');
    if (sc) sc.innerHTML = `<small>てん</small>${P.score}`;
    if (app.opts.mode === 'solo') {
      $('solo-info').innerHTML = `<div>れんさ<b>${P.maxChain}</b></div><div>おいた<b>${P.count}</b></div><div>さいこう<b>${Math.max(app.best, P.score)}</b></div>`;
    }
    $('btn-undo').disabled = !(P.history.length && (P.state === 'fall' || P.state === 'dead'));
    $('btn-hint').disabled = P.state !== 'fall' && P.state !== 'anim';
    renderPowers();
  }

  const powShown = [-1, -1];
  function renderPowers() {
    for (const p of app.players) {
      const v = p.power + (p.power >= E.POWER_MAX ? 1000 : 0);
      if (powShown[p.side] === v) continue;
      powShown[p.side] = v;
      const pct = Math.round(100 * p.power / E.POWER_MAX) + '%';
      const full = p.power >= E.POWER_MAX;
      if (p.side === 0) {
        $('pw-fill').style.width = pct;
        $('btn-power').classList.toggle('full', full);
        $('pw-label').textContent = full ? E.POWERS[p.char.id].name + '！' : 'パワー';
        $('btn-power').disabled = !full;
      } else {
        $('pg-1').querySelector('i').style.width = pct;
        $('pg-1').classList.toggle('full', full);
      }
    }
  }

  let statusShown = '';
  function renderStatus() {
    const P = me();
    let txt = '', cls = '';
    if (!P) txt = '「メニュー」から あたらしく はじめよう';
    else if (app.paused && app.running) { txt = 'とまっているよ。「つづける」で また うごくよ'; }
    else if (P.state === 'ready') txt = 'おなじ いろの あわを 4つ つなげよう！';
    else if (P.state === 'dead') txt = app.opts.mode === 'vs' ? 'つまっちゃった… もういちど やってみよう' : (P.history.length ? 'つまっちゃった！「まった」で もどれるよ' : 'つまっちゃった！');
    else if (P.state === 'idle') { txt = 'やったね！ あいてが うえまで つまったよ！'; cls = 'pop'; }
    else if (P.hint && P.state === 'fall') { txt = 'てんせんの ところが おすすめ だよ'; cls = 'hint'; }
    else if (P.state === 'fall' && app.settings.preview && P.pv && P.pv.res.chain) {
      const n = P.pv.res.chain;
      txt = n === 1 ? 'ここに おくと ぱちん！ と はじけるよ' : `ここに おくと ${n}れんさ に なるよ！`;
      cls = 'pop';
    } else if (P.power >= E.POWER_MAX && P.state === 'fall') { txt = `パワー いっぱい！「${E.POWERS[P.char.id].name}」：${E.POWERS[P.char.id].text}`; cls = 'hint'; }
    else if (P.state === 'fall' && P.piece && (P.piece.a === E.RAINBOW || P.piece.b === E.RAINBOW)) { txt = 'にじあわ だ！ どの いろの なかまにも なれるよ'; cls = 'pop'; }
    else if (P.cur && P.cur.type === 'power') { txt = `${E.POWERS[P.char.id].name}！`; cls = 'pop'; }
    else if (P.pend > 0) { txt = `くもりあわが ${P.pend}こ くるよ！ はじけさせて はねかえそう`; cls = 'danger'; }
    else if (E.heights(P.field)[E.SPAWN_X] >= 9) { txt = 'まんなかが たかいよ！ ✕ まで つまると まけ'; cls = 'danger'; }
    else if (P.cur && P.cur.type === 'pop') { txt = P.cur.step.chain >= 2 ? `${P.cur.step.chain}れんさ！ すごい！` : 'ぱちん！'; cls = 'pop'; }
    else txt = 'おなじ いろの あわを 4つ つなげよう';
    const key = cls + '|' + txt;
    if (key === statusShown) return;
    statusShown = key;
    const el = $('status');
    el.className = 'status ' + cls;
    el.textContent = txt;
    renderSide();
  }

  let toastTimer = 0;
  function toast(html, cls) {
    const el = $('toast');
    el.innerHTML = html;
    el.className = 'toast show ' + (cls || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 1100);
  }

  function bubbles() {
    const box = $('confetti');
    box.innerHTML = '';
    const cs = ['#ff9cb2', '#94eab5', '#98caff', '#ffe68a', '#d4b0ff'];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('i');
      const sz = 14 + Math.random() * 30;
      s.style.left = Math.random() * 100 + '%';
      s.style.width = s.style.height = sz + 'px';
      s.style.setProperty('--c', cs[i % cs.length]);
      s.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
      s.style.animationDelay = Math.random() * 0.8 + 's';
      s.style.animationDuration = 2 + Math.random() * 1.5 + 's';
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 4500);
  }

  // ---------- おと ----------

  // スマホ（とくに iPhone・iPad）は、ゆびを はなした とき・タップ・キーの なかで ないと おとを だせない。
  // そこで、そういう そうさの たびに おとの しくみを おこす（いちど うごけば あとは そのまま なる）。
  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    return actx;
  }
  function unlockAudio() {
    if (!app.settings.sound) return;
    try {
      // iPhone の マナースイッチが オンでも ゲームの おとを ならす（おとを けすのは「せってい」で）
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
      const c = audio();
      if (!c || c.state === 'running') return;
      const pr = c.resume();
      if (pr && pr.catch) pr.catch(() => {});
      // むおんの おとを 1かい ならすと、iPhone でも うごきだす
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch (e) { /* おとが でない かんきょう では なにもしない */ }
  }
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

  function tone(freq, start, dur, type, vol, slide) {
    const t0 = actx.currentTime + start;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sound(kind, k) {
    if (!app.settings.sound) return;
    try {
      const c = audio();
      if (!c) return;
      // まだ おとが うごいていない ときは ならさない（あとで まとめて なりださない ように）
      if (c.state !== 'running') { const pr = c.resume(); if (pr && pr.catch) pr.catch(() => {}); return; }
      if (kind === 'move') tone(660, 0, 0.04, 'triangle', 0.06);
      else if (kind === 'rotate') tone(880, 0, 0.06, 'triangle', 0.07, 1200);
      else if (kind === 'bump') tone(180, 0, 0.05, 'square', 0.03);
      else if (kind === 'land') tone(300, 0, 0.09, 'sine', 0.16, 160);
      else if (kind === 'pop') {
        const base = 520 * Math.pow(1.122, Math.min(12, (k || 1) - 1) * 2);
        tone(base, 0.2, 0.12, 'sine', 0.22, base * 2.2);
        tone(base * 1.5, 0.27, 0.1, 'sine', 0.12, base * 3);
      } else if (kind === 'cloud') { tone(140, 0, 0.25, 'triangle', 0.25 * (k || 1), 70); tone(100, 0.12, 0.25, 'triangle', 0.2 * (k || 1), 60); }
      else if (kind === 'warn') { tone(760, 0, 0.08, 'square', 0.05); tone(760, 0.12, 0.08, 'square', 0.05); }
      else if (kind === 'vs') { tone(330, 0, 0.12, 'square', 0.06); tone(494, 0.12, 0.12, 'square', 0.06); tone(659, 0.24, 0.3, 'square', 0.07); }
      else if (kind === 'power') [523, 784, 1047, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.2, 'triangle', 0.13));
      else if (kind === 'hint') tone(990, 0, 0.12, 'sine', 0.12, 1320);
      else if (kind === 'undo') tone(700, 0, 0.12, 'triangle', 0.1, 400);
      else if (kind === 'fanfare') [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.08, 0.18, 'triangle', 0.14));
      else if (kind === 'win') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.2));
      else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.35, 'sine', 0.18));
    } catch (e) { /* おとが でない かんきょう では ならさない */ }
  }

  // ---------- ルールの 図 ----------

  // rows：R G B Y P = あわ、小文字 = はじける（ひかる）、o = くもりあわ、O = きえる くもりあわ、x = まけの しるし、. = なし
  function miniSVG(rows) {
    const h = rows.length, w = rows[0].length, u = 16, W = w * u, H = h * u;
    const fill = { R: COL[1], G: COL[2], B: COL[3], Y: COL[4], P: COL[5] };
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="rbw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d6d"/><stop offset="0.35" stop-color="#ffe14d"/><stop offset="0.65" stop-color="#3ddc84"/><stop offset="1" stop-color="#a463ff"/></linearGradient></defs><rect width="${W}" height="${H}" fill="#2f2c80"/>`;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x], cx = x * u + u / 2, cy = y * u + u / 2;
      const up = ch.toUpperCase();
      if (fill[up]) {
        const cl = fill[up];
        for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
          const o = rows[ny] && rows[ny][nx];
          if (o && o.toUpperCase() === up) s += nx > x ? `<rect x="${cx}" y="${cy - 4}" width="${u}" height="8" fill="${cl.base}" opacity="0.55"/>` : `<rect x="${cx - 4}" y="${cy}" width="8" height="${u}" fill="${cl.base}" opacity="0.55"/>`;
        }
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x], cx = x * u + u / 2, cy = y * u + u / 2;
      const up = ch.toUpperCase();
      if (fill[up]) {
        const cl = fill[up];
        s += `<circle cx="${cx}" cy="${cy}" r="7.2" fill="${cl.base}" stroke="${cl.rim}" stroke-width="1"/><ellipse cx="${cx - 2.5}" cy="${cy - 3}" rx="2.2" ry="1.3" fill="#fff" opacity="0.9"/>`;
        if (ch !== up) s += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#facc15" stroke-width="2"/>`;
      } else if (ch === '*' || ch === '+') {
        s += `<circle cx="${cx}" cy="${cy}" r="7.2" fill="url(#rbw)" stroke="#a855f7" stroke-width="1"/><ellipse cx="${cx - 2.5}" cy="${cy - 3}" rx="2.2" ry="1.3" fill="#fff" opacity="0.9"/>`;
        if (ch === '+') s += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#facc15" stroke-width="2"/>`;
      } else if (ch === 'o' || ch === 'O') {
        s += `<circle cx="${cx}" cy="${cy}" r="7" fill="#dbe3ec" stroke="#94a3b8" stroke-width="1"/><path d="M${cx - 4},${cy} h2 M${cx + 2},${cy} h2" stroke="#475569" stroke-width="1.3" stroke-linecap="round"/>`;
        if (ch === 'O') s += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#facc15" stroke-width="2"/>`;
      } else if (ch === 'x') {
        s += `<path d="M${cx - 4},${cy - 4} L${cx + 4},${cy + 4} M${cx + 4},${cy - 4} L${cx - 4},${cy + 4}" stroke="#ef4444" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`;
      }
    }
    return s + '</svg>';
  }
  const GUIDE = [
    { t: '4つ つなげて ぱちん', figs: [['......', '......', '..r...', '.rrG..', '.GrBB.', 'GBBYY.']], p: 'おなじ いろの あわが たて・よこに 4つ いじょう つながると、ぱちんと はじけて きえるよ。' },
    { t: 'ななめは つながらない', figs: [['......', '......', '...R..', '..R...', '.R....', 'RGGB..']], p: 'つながるのは たて と よこ だけ。ななめに ならんでも はじけないよ。' },
    { t: 'れんさ', figs: [['......', 'G.....', 'b.....', 'b.....', 'bGG...', 'bYYR..'], ['......', '......', '......', '......', 'gGG...', 'gYYR..']], p: 'はじけて あいた ところに うえの あわが おちて、また 4つ つながると「れんさ」。れんさが ながいほど てんすうが ぐんと ふえるよ。' },
    { t: 'にじあわ', figs: [['......', '......', '......', '......', 'rr+bb.', 'r..b..']], p: 'ときどき くる にじいろの あわ。となりの どの いろの なかまにも なるよ。2つの いろの あいだに おけば、りょうほう いっしょに はじけさせられる！' },
    { t: 'フルーツパワー', figs: [], p: 'あわを はじけさせると「パワー」が たまるよ。いっぱいに なったら ボタンを おそう。いちご は くもりあわを あかい あわに、にんじん は ながい れつを けす … キャラクター ごとに ちがう わざ が でるよ。' },
    { t: 'くもりあわ', figs: [['......', '......', 'oO....', 'Orr...', 'Orro..', 'oYYG..']], p: 'たいせんで あいてが はじけさせると ふってくる、はじけない あわ。となりで あわが はじけると いっしょに きえるよ。' },
    { t: 'はねかえす', figs: [['......', '......', '......', '..b...', '.bbbY.', 'GRRYY.']], p: 'くもりあわが くる まえに じぶんも はじけさせると、くる かずを へらせるよ。たくさん はじけさせれば ぎゃくに あいてに おくれる！' },
    { t: 'まけ', figs: [['..x...', 'R.Y...', 'G.B.R.', 'B.R.Y.', 'Y.G.G.', 'P.B.R.']], p: 'ひだりから 3れつめ の いちばん うえ（✕ の ところ）まで つまったら まけ。まんなかは ひくく しておこう。' },
    { t: 'ぜんぶ けすと ボーナス', figs: [['......', '......', '......', '......', 'yyyy..', '......']], p: 'ばめんの あわを ぜんぶ けすと ボーナス てん。たいせんなら あいてに どっさり くもりあわ！' },
    { t: 'うえに はみだすと', figs: [['.R....', 'xB....', 'GG....', 'YB....', 'RY....', 'BG....']], p: 'みえる ところより うえに のこった あわは、ふわっと とんでいって きえちゃうよ。' },
  ];
  function fillGuide() {
    $('guide-list').innerHTML = GUIDE.map(g => `<div class="g-item"><div class="g-figs">${g.figs.length ? g.figs.map(miniSVG).join('<span class="arr">→</span>') : `<span class="pw-icon">⚡</span>`}</div><div class="g-body"><b>${g.t}</b><p>${g.p}</p></div></div>`).join('')
      + `<div class="g-item pw-list"><div class="g-body"><b>フルーツパワー いちらん</b><ul>${CH.LIST.map(c => `<li><span class="pw-pic">${CH.svg(c.id, 'normal')}</span><span><b>${E.POWERS[c.id].name}</b><small>（${c.food}）</small><br>${E.POWERS[c.id].text}</span></li>`).join('')}</ul></div></div>`;
  }

  // ---------- あたらしい ゲームの えらぶ 画面 ----------

  function charCards(name, mini) {
    return CH.LIST.map(c => `<label><input type="radio" name="${name}" value="${c.id}"><span class="char-card" style="--cc:${c.color}"><span class="pic">${CH.svg(c.id, 'normal')}</span>${mini ? '' : `<b>${c.name}</b><small>${c.food}</small><span class="stars">${'★'.repeat(c.level)}</span>${app.beaten[c.id] ? '<span class="beat">✓</span>' : ''}`}</span></label>`).join('');
  }
  function openNew(first) {
    const f = $('dlg-new').querySelector('form');
    $('opp-grid').innerHTML = charCards('opp', false);
    $('me-grid').innerHTML = charCards('me', true);
    const o = app.opts;
    for (const [n, v] of [['mode', o.mode], ['opp', o.opp], ['colors', String(o.colors)], ['speed', o.speed], ['me', o.me]]) {
      const el = f.querySelector(`input[name="${n}"][value="${v}"]`);
      if (el) el.checked = true;
    }
    $('welcome').hidden = !first;
    $('btn-new-cancel').hidden = !app.players.length;
    syncNewForm();
    $('dlg-new').showModal();
  }
  function syncNewForm() {
    const f = $('dlg-new').querySelector('form');
    const mode = (f.querySelector('input[name="mode"]:checked') || {}).value || 'vs';
    document.body.classList.toggle('solo-form', mode === 'solo');
    document.body.classList.toggle('vs-form', mode === 'vs');
    const oid = (f.querySelector('input[name="opp"]:checked') || {}).value;
    const c = CH.BY[oid];
    $('opp-intro').textContent = c ? `${c.name}（${c.food}）：${c.intro}　パワー「${E.POWERS[c.id].name}」：${E.POWERS[c.id].text}` : '';
    const mid = (f.querySelector('input[name="me"]:checked') || {}).value;
    const m = CH.BY[mid];
    $('me-intro').textContent = m ? `${m.name} の パワー「${E.POWERS[m.id].name}」：${E.POWERS[m.id].text}` : '';
  }
  function readNewForm() {
    const f = $('dlg-new').querySelector('form');
    const v = n => (f.querySelector(`input[name="${n}"]:checked`) || {}).value;
    return { mode: v('mode') || 'vs', opp: v('opp') || 'ichigo', colors: +(v('colors') || 4), speed: v('speed') || 'normal', me: v('me') || 'tomato' };
  }

  function openSettings() {
    const f = $('dlg-settings').querySelector('form');
    for (const k in app.settings) if (f.elements[k]) f.elements[k].checked = app.settings[k];
    $('dlg-settings').showModal();
  }

  function syncPause() {
    const b = $('btn-pause');
    b.textContent = app.paused ? 'つづける' : 'とめる';
    b.classList.toggle('on', app.paused);
  }

  // ---------- にゅうりょく ----------

  const held = { L: false, R: false, D: false };
  const rep = {};
  function press(a) {
    const p = me();
    if (a === 'D') { held.D = true; if (p) p.soft = true; return; }
    if (a === 'L' || a === 'R') {
      held[a] = true;
      act(p, a);
      clearTimeout(rep[a]); clearInterval(rep[a + 'i']);
      rep[a] = setTimeout(() => { rep[a + 'i'] = setInterval(() => { if (held[a]) act(me(), a); }, 75); }, 190);
      return;
    }
    act(p, a);
  }
  function release(a) {
    if (a === 'D') { held.D = false; if (me()) me().soft = false; return; }
    if (a === 'L' || a === 'R') { held[a] = false; clearTimeout(rep[a]); clearInterval(rep[a + 'i']); }
  }
  function setupPad() {
    for (const b of document.querySelectorAll('#pad button')) {
      const a = b.dataset.act;
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (x) { /* なし */ } press(a); });
      const up = () => { b.classList.remove('down'); release(a); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }
    document.addEventListener('keydown', e => {
      if (document.querySelector('dialog[open]')) return;
      const k = e.key;
      const map = { ArrowLeft: 'L', ArrowRight: 'R', ArrowDown: 'D', ArrowUp: 'C', x: 'C', X: 'C', z: 'C', Z: 'C', ' ': 'H' };
      if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); e.preventDefault(); return; }
      if (k === 'Enter' || k === 's' || k === 'S') { usePower(me()); e.preventDefault(); return; }
      const a = map[k];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      press(a);
    });
    document.addEventListener('keyup', e => {
      const map = { ArrowLeft: 'L', ArrowRight: 'R', ArrowDown: 'D' };
      if (map[e.key]) release(map[e.key]);
    });
    // がめんを タップ：ひだりがわ = ひだりへ、みぎがわ = みぎへ、まんなか = まわす、した = すとん
    // （ひだり・みぎ は おしたままに すると つづけて うごく）
    const arena = $('arena');
    const touching = new Map();
    arena.addEventListener('pointerdown', e => {
      if (!app.running || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      const a = zoneAt(e.clientX, e.clientY);
      try { arena.setPointerCapture(e.pointerId); } catch (x) { /* なし */ }
      touching.set(e.pointerId, a);
      flashZone(a);
      press(a);
    });
    const up = e => {
      const a = touching.get(e.pointerId);
      if (!a) return;
      touching.delete(e.pointerId);
      release(a);
    };
    arena.addEventListener('pointerup', up);
    arena.addEventListener('pointercancel', up);
    arena.addEventListener('lostpointercapture', up);
    arena.addEventListener('contextmenu', e => e.preventDefault());
  }
  function zoneAt(x, y) {
    const r = $('arena').getBoundingClientRect();
    if (y > r.top + r.height * 0.75) return 'H';
    const u = (x - r.left) / r.width;
    return u < 1 / 3 ? 'L' : u > 2 / 3 ? 'R' : 'C';
  }
  function flashZone(a) {
    const el = document.querySelector(`#zones [data-z="${a}"]`);
    if (!el) return;
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  }
  function showZones() {
    const el = $('zones');
    for (const d of el.children) d.classList.remove('hit');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  function togglePause() {
    if (!app.running || app.over) return;
    app.paused = !app.paused;
    syncPause();
  }

  // ---------- はじめ ----------

  function init() {
    const saved = load();
    if (saved) {
      Object.assign(app.settings, saved.settings || {});
      Object.assign(app.opts, saved.opts || {});
      app.beaten = saved.beaten || {};
      app.best = saved.best || 0;
    }
    if (!CH.BY[app.opts.opp]) app.opts.opp = 'ichigo';
    if (!CH.BY[app.opts.me]) app.opts.me = 'tomato';
    fillGuide();
    setupPad();
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-guide').addEventListener('click', () => $('dlg-guide').showModal());
    $('btn-menu').addEventListener('click', () => {
      $('btn-giveup').hidden = !(app.running && !app.over);
      $('dlg-menu').querySelector('button[value="retry"]').textContent = app.opts.mode === 'vs' ? 'おなじ あいてと もういちど' : 'もういちど はじめる';
      $('dlg-menu').showModal();
    });
    $('btn-hint').addEventListener('click', onHint);
    $('btn-undo').addEventListener('click', onUndo);
    $('btn-power').addEventListener('click', () => usePower(me()));
    $('dlg-menu').addEventListener('close', () => {
      const v = $('dlg-menu').returnValue;
      if (v === 'new') openNew(false);
      else if (v === 'retry') startGame();
      else if (v === 'howto') $('dlg-howto').showModal();
      else if (v === 'guide') $('dlg-guide').showModal();
      else if (v === 'settings') openSettings();
      else if (v === 'giveup' && app.running && !app.over) lose(me());
    });
    const fNew = $('dlg-new').querySelector('form');
    fNew.addEventListener('change', syncNewForm);
    $('dlg-new').addEventListener('close', () => {
      if ($('dlg-new').returnValue === 'ok') startGame(readNewForm());
      else if (!app.players.length) startGame();
    });
    $('dlg-settings').addEventListener('close', () => {
      const f = $('dlg-settings').querySelector('form');
      for (const k in app.settings) if (f.elements[k]) app.settings[k] = f.elements[k].checked;
      sprites.clear();
      save();
    });
    $('dlg-result').addEventListener('close', () => {
      const v = $('dlg-result').returnValue;
      if (v === 'retry') startGame();
      else if (v === 'next') {
        const n = CH.LIST[CH.BY[app.opts.opp].index + 1];
        if (n) startGame({ opp: n.id });
      } else if (v === 'undo') onUndo();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && app.running && !app.over && !app.paused) { app.paused = true; syncPause(); }
    });
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 80); });
    requestAnimationFrame(frame);
    openNew(!saved);
  }

  // テスト用に のぞける ように する
  window.__app = app;
  document.addEventListener('DOMContentLoaded', init);
})();
