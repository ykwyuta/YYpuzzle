/*
 * はじけるのがみえる あわパズル — CPU の かんがえを 別スレッドで うごかす（画面が かたまらないように）
 */
/* global importScripts, AI */
importScripts('rules.js', 'ai.js');
self.onmessage = e => {
  const { id, field, pairs, level, ctx } = e.data;
  const lv = typeof level === 'object' ? level : AI.LEVELS[level];
  self.postMessage({ id, result: AI.choose(Int8Array.from(field), pairs, lv, ctx) });
};
