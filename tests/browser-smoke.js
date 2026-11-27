/*
 * End-to-end test in headless Chromium (Playwright).
 * Usage: node tests/browser-smoke.js [--shots dir]
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Smoke Test Patch' : undefined));
  let ok = true;
  const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) ok = false; };

  await page.goto(url);
  await page.waitForFunction(() => window.MasterApp && window.MasterApp.ui);
  check(await page.locator('.mod').count() === 26, 'rack has 26 modules');
  const nPresets = await page.evaluate(() => document.querySelectorAll('#presetSel option').length);
  check(nPresets >= 30, `preset menu lists ${nPresets} presets`);
  if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, 'splash.png') }); }

  await page.click('#splashPower');
  await page.waitForFunction(() => window.MasterApp.ready && window.MasterApp.lastReport, null, { timeout: 15000 });
  check(true, 'audio engine running');

  // cycle all factory presets
  const refs = await page.evaluate(() => Array.from(document.querySelectorAll('#presetSel option')).map(o => o.value));
  const quiet = [];
  for (const ref of refs) {
    await page.selectOption('#presetSel', ref);
    await page.waitForTimeout(150);
    // play a few notes for keyboard presets
    await page.evaluate(() => { const a = window.MasterApp; a.noteOn(60, 0.8); setTimeout(() => a.noteOff(60), 500); a.noteOn(67, 0.8); setTimeout(() => a.noteOff(67), 700); });
    let peak = 0, gr = 1;
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => { const r = window.MasterApp.lastReport; return { pk: Math.max(r.pkL, r.pkR), gr: r.gr }; });
      peak = Math.max(peak, r.pk); gr = Math.min(gr, r.gr);
    }
    const name = await page.evaluate(() => window.MasterApp.state.name);
    if (peak < 0.003) quiet.push(name);
    if (peak > 0.9441) { ok = false; console.log('  FAIL clipping in ' + name + ' peak ' + peak); }
  }
  check(quiet.length === 0, 'every preset makes sound within 1.5 s' + (quiet.length ? ' — silent: ' + quiet.join(', ') : ''));

  // patch a cable by dragging
  await page.selectOption('#presetSel', refs.find(r => r.startsWith('f:')) );
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.MasterApp.state.cables.length);
  // source near the top, target far below the fold: exercises auto-scroll while dragging
  await page.evaluate(() => { document.getElementById('rackWrap').scrollTop = 0; });
  const src = page.locator('[data-jack="arp.gate"] .hole'), dst = page.locator('[data-jack="lpg.ping2"] .hole');
  const a = await src.boundingBox();
  const wrapBox = await page.locator('#rackWrap').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, wrapBox.y + wrapBox.height - 8, { steps: 8 });
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(25);
    const bb = await dst.boundingBox();
    if (bb && bb.y + bb.height < wrapBox.y + wrapBox.height - 60) break;
  }
  await page.mouse.move(a.x + 40, wrapBox.y + wrapBox.height / 2, { steps: 4 });
  const b = await dst.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.MasterApp.state.cables.some(c => c[0] === 'arp.gate' && c[1] === 'lpg.ping2'));
  check(after, 'drag-patch ARP.GATE → LPG.PING2 (auto-scrolling past the fold) creates a cable');
  check((await page.locator('#cables path.c').count()) === before + 1, 'cable is drawn');

  // knob drag changes a parameter
  const knob = page.locator('[data-key="cplx.pfreq"]');
  await knob.scrollIntoViewIfNeeded();
  const kb = await knob.boundingBox();
  const v0 = await page.evaluate(() => window.MasterApp.state.params.cplx.pfreq);
  await page.mouse.move(kb.x + kb.width / 2, kb.y + 15); await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, kb.y - 40, { steps: 6 }); await page.mouse.up();
  const v1 = await page.evaluate(() => window.MasterApp.state.params.cplx.pfreq);
  check(v1 > v0, `knob drag raises PRINCIPAL ${v0.toFixed(1)} → ${v1.toFixed(1)} Hz`);

  // sequencer cell edit
  const cellBefore = await page.evaluate(() => window.MasterApp.state.sq.subs[MasterPatch.idx(Math.round(MasterApp.state.params.sqncr.pattern), 0, 1)]);
  await page.locator('.sq-grid .cell').nth(1).click();
  const cellAfter = await page.evaluate(() => window.MasterApp.state.sq.subs[MasterPatch.idx(Math.round(MasterApp.state.params.sqncr.pattern), 0, 1)]);
  check(cellBefore !== cellAfter, 'clicking a SQNCR step edits the pattern');

  // save a user preset
  await page.click('#save');
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('master-of-all.user-presets') || '[]').map(p => p.name));
  check(saved.includes('Smoke Test Patch'), 'SAVE stores a user preset');
  check(await page.evaluate(() => !!document.querySelector('#presetSel optgroup[label="My presets"]')), 'user preset appears in the menu');

  // export
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const exp = JSON.parse(fs.readFileSync(await dl1.path(), 'utf8'));
  check(exp.format === 'master-of-all/1' && exp.cables.length > 0, 'EXPORT downloads a preset JSON');

  // record 2 s and check the WAV
  await page.selectOption('#presetSel', refs.find(r => r.startsWith('f:')));
  await page.waitForTimeout(400);
  await page.click('#rec');
  await page.waitForTimeout(2000);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#rec')]);
  const wav = fs.readFileSync(await dl.path());
  const bits = wav.readUInt16LE(34), ch = wav.readUInt16LE(22), sr = wav.readUInt32LE(24), dataLen = wav.readUInt32LE(40);
  const frames = dataLen / 6;
  let maxv = 0;
  for (let o = 44; o + 2 < wav.length; o += 3) { let v = wav.readIntLE(o, 3); maxv = Math.max(maxv, Math.abs(v)); }
  check(wav.toString('ascii', 0, 4) === 'RIFF' && bits === 24 && ch === 2, `WAV is 24-bit stereo @ ${sr} Hz`);
  check(frames / sr > 1.7 && frames / sr < 2.6, `WAV length ${(frames / sr).toFixed(2)} s`);
  check(maxv > 1000 && maxv <= Math.round(0.9441 * 8388607) + 2, `WAV has audio and never exceeds the ceiling (peak ${(maxv / 8388607).toFixed(3)})`);

  const load = await page.evaluate(() => window.MasterApp.lastReport.load);
  check(load < 0.5, `DSP load ${(load * 100).toFixed(1)}% of the audio budget`);
  if (shots) {
    await page.selectOption('#presetSel', refs[1]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(shots, 'rack.png'), fullPage: false });
    await page.locator('.mod[data-id="sqncr"]').screenshot({ path: path.join(shots, 'sqncr.png') });
  }
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(ok ? '\nBROWSER SMOKE TEST PASSED' : '\nBROWSER SMOKE TEST FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
