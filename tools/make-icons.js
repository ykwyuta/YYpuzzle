// icons/icon.svg から PNG アイコンを つくる：node tools/make-icons.js
// （Playwright の Chromium を つかう）
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../icons/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(__dirname, '../icons', name), omitBackground: true, clip: { x: pad, y: pad, width: size, height: size } });
    console.log(name);
  }
  await browser.close();
})();
