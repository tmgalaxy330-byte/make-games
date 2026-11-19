// 説明書 PDF を作る： node tools/build_manual.js
// docs/manual/manual.html を Chromium で開き、A4 の PDF（docs/manual.pdf）にする。
// ページごとの画像を確かめたいときは、引数に --png をつける。
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const html = 'file://' + path.join(root, 'docs/manual/manual.html');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(html);
  await page.waitForFunction(() => window.MANUAL_READY === true);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(root, 'docs/manual.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (process.argv.includes('--png')) {
    await page.setViewportSize({ width: 794, height: 1123 });
    const n = await page.locator('section.page').count();
    for (let i = 0; i < n; i++) {
      await page.locator('section.page').nth(i).screenshot({ path: path.join(process.argv[process.argv.indexOf('--png') + 1] || '/tmp', `manual-${i + 1}.png`) });
    }
  }
  await browser.close();
  console.log('docs/manual.pdf を作りました');
})();
