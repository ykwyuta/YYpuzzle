/*
 * はじけるのがみえる あわパズル — くだもの と やさいの キャラクター
 * svg(id, mood)：mood = 'normal' | 'happy' | 'sad' | 'wow'
 */
(function (global) {
  'use strict';

  const LIST = [
    {
      id: 'ichigo', name: 'イチカ', food: 'いちご', level: 1, color: '#ff4d6d',
      think: 1100, step: 380, drop: 'soft',
      intro: 'あまずっぱい いちごの イチカだよ。いっしょに あそぼ！',
      lines: {
        start: ['よろしくね！', 'あわあわ たのしいね！', 'ゆっくり いこうね〜'],
        chain: ['わぁ、はじけた！', 'やったぁ！'],
        ouch: ['きゃっ！ もくもく きた〜', 'まって まって〜'],
        win: 'えへへ、かっちゃった！ また あそぼうね。',
        lose: 'まけちゃった〜。きみ、じょうずだね！',
      },
    },
    {
      id: 'ninjin', name: 'ニンタ', food: 'にんじん', level: 2, color: '#ff8c2a',
      think: 850, step: 300, drop: 'soft',
      intro: 'はたけ そだちの にんじん、ニンタ だぞ。げんきが とりえ！',
      lines: {
        start: ['よーし、まけないぞ！', 'ニンタ、いっきまーす！'],
        chain: ['どうだ！', 'ぽこぽこ〜っと！'],
        ouch: ['うわっ、もくもく だ！', 'ぐぬぬ…'],
        win: 'ニンタの かち！ はたけで きたえてるからね！',
        lose: 'くやしい〜！ つぎは まけないぞ！',
      },
    },
    {
      id: 'tomato', name: 'トマリ', food: 'トマト', level: 3, color: '#ff4b3e',
      think: 650, step: 230, drop: 'soft',
      intro: 'まっかな トマトの トマリ。れんさの おけいこ ちゅう！',
      lines: {
        start: ['おてやわらかに♪', 'まっかに もえるわよ！'],
        chain: ['れんさ、きまった！', 'ふふっ、みてた？'],
        ouch: ['きゃー！ まっかっか！', 'もう、もくもく いや〜'],
        win: 'トマリの かち♪ れんさの れんしゅう、がんばってね！',
        lose: 'すごい！ トマリ、かおが まっかに なっちゃった。',
      },
    },
    {
      id: 'banana', name: 'バナオ', food: 'バナナ', level: 4, color: '#f7c600',
      think: 520, step: 190, drop: 'soft',
      intro: 'みなみの しまから きた バナナの バナオ。3れんさ が とくい！',
      lines: {
        start: ['バナナっと いくぜ！', 'すべらないように きをつけな！'],
        chain: ['ナイス れんさ！', 'バナ〜ナ！'],
        ouch: ['おっとっと、すべる〜！', 'うわっ、こりゃ たいへん！'],
        win: 'バナオの かち！ つるっと きめたぜ！',
        lose: 'まいった！ きみの れんさ、あまくて おいしかったぜ。',
      },
    },
    {
      id: 'nasu', name: 'ナスミ', food: 'なす', level: 5, color: '#7b3fb3',
      think: 420, step: 160, drop: 'hard',
      intro: 'しずかな なすの ナスミ。さきの さきまで よんでいるの。',
      lines: {
        start: ['…はじめましょう。', 'つぎの つぎ まで みえてるの。'],
        chain: ['よそうどおり。', 'しずかに、ぱちん。'],
        ouch: ['…あら。', 'ちょっと よそうがい…'],
        win: 'ナスミの かち。つぎの ふたつぐみ も みてね。',
        lose: '…まけたわ。あなた、なかなか やるのね。',
      },
    },
    {
      id: 'broccoli', name: 'ブロッコ', food: 'ブロッコリー', level: 6, color: '#2f9e44',
      think: 340, step: 130, drop: 'hard',
      intro: 'もりもり ブロッコリーの ブロッコ。こつこつ つんで ドカンと はじけさせる！',
      lines: {
        start: ['もりもり いくぞ！', 'えいようまんてん、ブロッコさま だ！'],
        chain: ['もりもり れんさ！', 'ドカーン！'],
        ouch: ['むむっ、やるな！', 'もりが くもった…'],
        win: 'ブロッコの かち！ やさいを たべて つよくなれ！',
        lose: 'みごとだ！ きみは もりの おうじゃ だ！',
      },
    },
    {
      id: 'budou', name: 'グレタ', food: 'ぶどう', level: 7, color: '#8e44ad',
      think: 270, step: 105, drop: 'hard',
      intro: 'ぶどうの グレタ。ひとつぶ ひとつぶ つなげて、おおきな れんさ に するの。',
      lines: {
        start: ['ひとふさ ぶんの ちから、みせてあげる。', 'じゅくした れんさ、いくわよ。'],
        chain: ['つぶぞろいの れんさ！', 'うふふ、まだまだ！'],
        ouch: ['あら、つぶれちゃう！', 'やるじゃない。'],
        win: 'グレタの かち。もっと ながい れんさ を ねらってね。',
        lose: 'まあ…！ あなたの れんさ、とっても あまいわ。',
      },
    },
    {
      id: 'kabocha', name: 'パンプ だいおう', food: 'かぼちゃ', level: 8, color: '#ff9b2f',
      think: 220, step: 85, drop: 'hard',
      intro: 'はたけの おうさま、かぼちゃの パンプ だいおう。いちばん つよいぞ！',
      lines: {
        start: ['わがはいに いどむとは、よい こころがけ じゃ！', 'ハッハッハ！ かかってまいれ！'],
        chain: ['これが おうさまの れんさ じゃ！', 'ハッハッハ！'],
        ouch: ['ぬぬっ！', 'なかなか やりおる！'],
        win: 'わがはいの かち じゃ！ また いどむが よい！',
        lose: 'まいった！ きょうから きみが はたけの おうさま じゃ！',
      },
    },
  ];
  const BY = {};
  LIST.forEach((c, i) => { c.index = i; BY[c.id] = c; });

  // ---------- かお ----------

  function face(cx, cy, s, mood, o) {
    o = o || {};
    const ex = 11 * s, ey = cy - 2 * s, ink = o.ink || '#3a1a10';
    let eyes = '', mouth = '';
    if (mood === 'happy') {
      eyes = [-1, 1].map(k => `<path d="M${cx + k * ex - 5 * s},${ey + 2 * s} q${5 * s},${-7 * s} ${10 * s},0" fill="none" stroke="${ink}" stroke-width="${2.6 * s}" stroke-linecap="round"/>`).join('');
      mouth = `<path d="M${cx - 7 * s},${cy + 7 * s} q${7 * s},${10 * s} ${14 * s},0 z" fill="#c2253f" stroke="${ink}" stroke-width="${1.6 * s}" stroke-linejoin="round"/>`;
    } else if (mood === 'sad') {
      eyes = [-1, 1].map(k => `<path d="M${cx + k * ex - 5 * s},${ey - 1 * s} q${5 * s},${6 * s} ${10 * s},0" fill="none" stroke="${ink}" stroke-width="${2.6 * s}" stroke-linecap="round"/>`).join('')
        + `<path d="M${cx + ex + 4 * s},${ey + 4 * s} q${2 * s},${5 * s} 0,${6 * s} q${-2 * s},${-1 * s} 0,${-6 * s}" fill="#7cc6ff"/>`;
      mouth = `<path d="M${cx - 6 * s},${cy + 11 * s} q${6 * s},${-7 * s} ${12 * s},0" fill="none" stroke="${ink}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
    } else if (mood === 'wow') {
      eyes = [-1, 1].map(k => `<circle cx="${cx + k * ex}" cy="${ey}" r="${5 * s}" fill="#fff" stroke="${ink}" stroke-width="${1.6 * s}"/><circle cx="${cx + k * ex}" cy="${ey}" r="${2.4 * s}" fill="${ink}"/>`).join('');
      mouth = `<ellipse cx="${cx}" cy="${cy + 9 * s}" rx="${4 * s}" ry="${5 * s}" fill="#c2253f" stroke="${ink}" stroke-width="${1.6 * s}"/>`;
    } else {
      eyes = [-1, 1].map(k => `<ellipse cx="${cx + k * ex}" cy="${ey}" rx="${3.4 * s}" ry="${4.6 * s}" fill="${ink}"/><circle cx="${cx + k * ex + 1.2 * s}" cy="${ey - 1.8 * s}" r="${1.3 * s}" fill="#fff"/>`).join('');
      mouth = `<path d="M${cx - 6 * s},${cy + 7 * s} q${6 * s},${7 * s} ${12 * s},0" fill="none" stroke="${ink}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
    }
    const brows = o.brows ? [-1, 1].map(k => `<path d="M${cx + k * (ex + 6 * s)},${ey - 10 * s} L${cx + k * (ex - 5 * s)},${ey - 7 * s}" stroke="${ink}" stroke-width="${2.6 * s}" stroke-linecap="round"/>`).join('') : '';
    const cheeks = o.noCheeks ? '' : [-1, 1].map(k => `<ellipse cx="${cx + k * (ex + 6 * s)}" cy="${cy + 5 * s}" rx="${4.5 * s}" ry="${3 * s}" fill="#ff7aa2" opacity="0.55"/>`).join('');
    return cheeks + eyes + brows + mouth;
  }

  // ---------- からだ ----------

  const BODY = {
    ichigo(m) {
      const seeds = [[36, 46], [50, 42], [64, 46], [30, 60], [70, 60], [40, 76], [60, 76], [50, 86]]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.6" fill="#ffe08a"/>`).join('');
      return `<path d="M50,95 C24,82 10,56 16,40 C22,26 38,26 50,32 C62,26 78,26 84,40 C90,56 76,82 50,95 Z" fill="#ff4d6d" stroke="#c9184a" stroke-width="2.5"/>
        <path d="M24,40 C28,32 36,31 42,33" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
        ${seeds}
        <path d="M50,32 L36,20 L46,24 L50,12 L54,24 L64,20 Z" fill="#40c057" stroke="#2b8a3e" stroke-width="2" stroke-linejoin="round"/>
        <path d="M50,14 q2,-8 8,-10" fill="none" stroke="#2b8a3e" stroke-width="3" stroke-linecap="round"/>
        ${face(50, 58, 0.95, m)}`;
    },
    ninjin(m) {
      return `<path d="M44,22 Q36,4 30,8 Q38,14 42,24 Z M50,22 Q50,0 56,2 Q54,12 54,22 Z M56,24 Q66,6 72,10 Q62,16 60,26 Z" fill="#51cf66" stroke="#2b8a3e" stroke-width="2" stroke-linejoin="round"/>
        <path d="M26,30 Q50,16 74,30 Q72,58 56,92 Q50,99 44,92 Q28,58 26,30 Z" fill="#ff8c2a" stroke="#d9480f" stroke-width="2.5"/>
        <path d="M34,62 h8 M58,70 h7 M44,82 h6" stroke="#d9480f" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M33,34 Q38,30 44,30" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
        ${face(50, 46, 0.85, m)}`;
    },
    tomato(m) {
      return `<circle cx="50" cy="58" r="36" fill="#ff4b3e" stroke="#c92a2a" stroke-width="2.5"/>
        <path d="M24,46 Q28,34 40,30" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
        <path d="M50,30 L36,26 L45,22 L40,12 L50,19 L60,12 L55,22 L64,26 Z" fill="#40c057" stroke="#2b8a3e" stroke-width="2" stroke-linejoin="round"/>
        <path d="M50,19 q0,-9 6,-12" fill="none" stroke="#2b8a3e" stroke-width="3.5" stroke-linecap="round"/>
        ${face(50, 62, 1, m)}`;
    },
    banana(m) {
      return `<path d="M50,10 q-3,0 -3,6 l1,6 h4 l1,-6 q0,-6 -3,-6 z" fill="#7a4a1c"/>
        <path d="M48,20 C26,24 22,52 26,74 C28,86 40,92 52,92 C66,92 76,82 76,66 C76,40 66,22 48,20 Z" fill="#ffe066" stroke="#e0a800" stroke-width="2.5"/>
        <path d="M34,34 C30,44 30,56 32,66" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.6"/>
        <path d="M26,74 Q14,82 12,96 Q28,92 38,86 Z M76,70 Q88,80 90,96 Q74,92 64,86 Z" fill="#fcc419" stroke="#e0a800" stroke-width="2" stroke-linejoin="round"/>
        ${face(50, 56, 0.95, m)}`;
    },
    nasu(m) {
      return `<path d="M50,26 C80,26 86,60 78,78 C70,96 30,96 22,78 C14,60 20,26 50,26 Z" fill="#7b3fb3" stroke="#5a2a87" stroke-width="2.5"/>
        <path d="M28,48 Q30,38 38,34" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.4"/>
        <path d="M28,32 Q50,16 72,32 L64,38 L58,32 L50,40 L42,32 L36,38 Z" fill="#37b24d" stroke="#2b8a3e" stroke-width="2" stroke-linejoin="round"/>
        <path d="M50,24 q-1,-12 6,-18" fill="none" stroke="#2b8a3e" stroke-width="5" stroke-linecap="round"/>
        ${face(50, 64, 0.95, m, { ink: '#1b0b2a' })}`;
    },
    broccoli(m) {
      const fl = [[28, 40, 16], [72, 40, 16], [40, 26, 16], [60, 26, 16], [50, 40, 18]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2f9e44" stroke="#1e6b2e" stroke-width="2.5"/>`).join('');
      const dots = [[32, 34], [44, 22], [58, 20], [70, 34], [50, 34], [40, 42], [62, 44]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#51cf66"/>`).join('');
      return `<path d="M34,52 L66,52 Q68,80 62,94 L38,94 Q32,80 34,52 Z" fill="#b2f2bb" stroke="#2b8a3e" stroke-width="2.5" stroke-linejoin="round"/>
        ${fl}${dots}
        ${face(50, 72, 0.75, m, { noCheeks: false })}`;
    },
    budou(m) {
      const g = [[30, 44], [70, 44], [38, 70], [62, 70], [50, 88]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#9c55c9" stroke="#6a2c91" stroke-width="2.2"/><circle cx="${x - 4}" cy="${y - 5}" r="3" fill="#fff" opacity="0.45"/>`).join('');
      return `<path d="M50,24 q2,-10 10,-14" fill="none" stroke="#7a4a1c" stroke-width="4" stroke-linecap="round"/>
        <path d="M54,22 Q68,6 84,14 Q74,28 56,26 Z" fill="#51cf66" stroke="#2b8a3e" stroke-width="2" stroke-linejoin="round"/>
        ${g}
        <circle cx="50" cy="54" r="24" fill="#a55ed6" stroke="#6a2c91" stroke-width="2.5"/>
        <path d="M34,46 Q36,38 44,34" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.45"/>
        ${face(50, 56, 0.85, m, { ink: '#2a0c3d' })}`;
    },
    kabocha(m) {
      return `<path d="M48,30 q-2,-14 8,-18 l4,4 q-6,4 -4,14 z" fill="#5c940d" stroke="#3b5e08" stroke-width="2"/>
        <ellipse cx="28" cy="62" rx="22" ry="30" fill="#ff9b2f" stroke="#d9480f" stroke-width="2.5"/>
        <ellipse cx="72" cy="62" rx="22" ry="30" fill="#ff9b2f" stroke="#d9480f" stroke-width="2.5"/>
        <ellipse cx="50" cy="62" rx="26" ry="32" fill="#ffa94d" stroke="#d9480f" stroke-width="2.5"/>
        <path d="M30,42 Q34,36 40,34" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.5"/>
        <path d="M30,24 L36,10 L44,20 L50,6 L56,20 L64,10 L70,24 Z" fill="#ffd43b" stroke="#e67700" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="50" cy="16" r="2.6" fill="#fa5252"/><circle cx="36" cy="18" r="2" fill="#4dabf7"/><circle cx="64" cy="18" r="2" fill="#4dabf7"/>
        ${face(50, 64, 1, m, { brows: true })}`;
    },
  };

  function svg(id, mood) {
    const f = BODY[id] || BODY.tomato;
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${f(mood || 'normal')}</svg>`;
  }

  global.Chars = { LIST, BY, svg };
})(typeof window !== 'undefined' ? window : globalThis);
