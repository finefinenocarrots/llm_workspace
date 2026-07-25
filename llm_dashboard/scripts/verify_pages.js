/* 无头浏览器验证看板页面：控制台错误 + 截图 */
const puppeteer = require('puppeteer-core');

(async () => {
  const os = require('os'), path = require('path'), fs = require('fs');
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'pptr-edge-'));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    userDataDir: udd,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions', '--disable-background-networking'],
  });
  const pages = [
    { url: 'http://localhost:8765/index.html', shot: 'D:/workspace/llm_dashboard/scripts/shot_index.png' },
    { url: 'http://localhost:8765/target.html', shot: 'D:/workspace/llm_dashboard/scripts/shot_target.png' },
  ];
  let hasError = false;
  for (const p of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 2200 });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto(p.url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    // 交互测试：点击日期预设按钮
    const segBtns = await page.$$('.seg button');
    if (segBtns.length > 2) { await segBtns[2].click(); await new Promise(r => setTimeout(r, 1200)); }
    // 打开一个多选下拉并勾选第一项
    const mselBtn = await page.$('.msel-btn');
    if (mselBtn) {
      await mselBtn.click();
      await new Promise(r => setTimeout(r, 400));
      const opt = await page.$('.msel-opt input');
      if (opt) { await opt.click(); await new Promise(r => setTimeout(r, 1000)); }
    }
    await page.screenshot({ path: p.shot, fullPage: true });
    console.log('== ' + p.url);
    console.log('  console errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'NONE'));
    if (errors.length) hasError = true;
    // 检查关键元素
    const kpiCount = await page.$$eval('#kpi-row .kpi', els => els.length).catch(() => 0);
    const chartCanvas = await page.$$eval('canvas', els => els.length).catch(() => 0);
    console.log(`  kpi cards: ${kpiCount}, canvas: ${chartCanvas}`);
    await page.close();
  }
  await browser.close();
  process.exit(hasError ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
