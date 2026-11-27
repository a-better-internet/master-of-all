/*
 * Offline render of every factory preset through the real DSP engine.
 * Usage: node tests/render-presets.js [seconds] [--wav outdir] [--only substring] [--random N]
 *   --random N also renders N randomized patches (seeds 1..N) and a mutation of each
 *
 * Checks per preset:
 *   - no NaN / Infinity
 *   - true peak never exceeds the limiter ceiling (no clipping)
 *   - audible (RMS above −50 dBFS) and not pinned by the limiter
 *   - DC offset small
 *   - real-time CPU factor (render time / audio time) well below 1
 * Exit code 1 on failure.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const seconds = +(args.find(a => /^\d+(\.\d+)?$/.test(a)) || 8);
const wavDir = args.includes('--wav') ? args[args.indexOf('--wav') + 1] : null;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const nRandom = args.includes('--random') ? +args[args.indexOf('--random') + 1] : 0;
const SR = +(process.env.SR || 48000);

const root = path.join(__dirname, '..', 'js');
globalThis.sampleRate = SR;
for (const f of ['specs.js', 'patch.js', 'presets.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const MASTER_DSP = require(path.join(root, 'dsp.js'));
const { Engine } = MASTER_DSP();

function writeWav24(file, L, R, sr) {
  const n = L.length, buf = Buffer.alloc(44 + n * 6);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 6, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 6, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (const ch of [L, R]) {
    let v = Math.round(Math.max(-1, Math.min(1, ch[i])) * 8388607);
    buf.writeIntLE(v, o, 3); o += 3;
  }
  fs.writeFileSync(file, buf);
}

const CEIL = 0.944;
let failures = 0;
const rows = [];
const presets = MASTER_PRESETS.filter(p => !only || p.name.toLowerCase().includes(only.toLowerCase()));

// validate preset keys
for (const pr of presets) {
  for (const k of Object.keys(pr.p || {})) {
    const [m, key] = k.split('.');
    const s = MASTER_SPEC_BY_ID[m];
    if (!s || !s.params.find(q => q.k === key)) { console.log(`  !! ${pr.name}: unknown param ${k}`); failures++; }
  }
  for (const c of pr.c || []) if (!MasterPatch.validCable(c)) { console.log(`  !! ${pr.name}: bad cable ${c}`); failures++; }
}

const items = presets.map(p => ({ name: p.name, keys: p.keys, st: MasterPatch.fromPreset(p) }));
for (let i = 1; i <= nRandom; i++) {
  const st = MasterPatch.randomize(i);
  items.push({ name: st.name, keys: true, st });
  const mu = MasterPatch.mutate(st, 0.15, i * 7919);
  items.push({ name: 'Random #' + i + ' mutated', keys: true, st: mu });
}
for (const pr of items) {
  const msgs = [];
  const port = { postMessage: (m) => msgs.push(m) };
  const eng = new Engine(port);
  const st = pr.st;
  eng.msg(MasterPatch.toMessage(st));
  const total = Math.round(seconds * SR), B = 128;
  const L = new Float32Array(total), R = new Float32Array(total);
  const bl = new Float32Array(B), br = new Float32Array(B);
  // played presets get a little performance on the keys
  const perf = [];
  if (pr.keys) {
    const notes = [60, 63, 67, 70, 65, 72, 58, 62];
    for (let i = 0; i < 16; i++) perf.push({ at: 0.3 + i * 0.45, n: notes[i % notes.length], dur: 0.35 });
  }
  let t0 = process.hrtime.bigint();
  let nan = 0;
  for (let pos = 0; pos < total; pos += B) {
    const t = pos / SR;
    for (const e of perf) {
      if (!e.on && t >= e.at) { e.on = true; eng.msg({ t: 'noteOn', n: e.n, v: 0.8 }); eng.msg({ t: 'press', v: 0.7 }); }
      if (e.on && !e.off && t >= e.at + e.dur) { e.off = true; eng.msg({ t: 'noteOff', n: e.n }); }
    }
    eng.render(bl, br);
    for (let i = 0; i < B && pos + i < total; i++) {
      const a = bl[i], b = br[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) nan++;
      L[pos + i] = a; R[pos + i] = b;
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const rtf = ms / (seconds * 1000);
  // metrics, skipping the first 0.25 s (preset fade-in)
  let peak = 0, sum = 0, dc = 0, n = 0, pinned = 0, silentBlocks = 0, blocks = 0, blk = 0, blkN = 0;
  for (let i = Math.round(0.25 * SR); i < total; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    peak = Math.max(peak, a, b);
    sum += L[i] * L[i] + R[i] * R[i]; dc += L[i] + R[i]; n += 2;
    if (a > CEIL * 0.995) pinned++;
    blk += L[i] * L[i]; blkN++;
    if (blkN === 4800) { blocks++; if (blk / blkN < 1e-9) silentBlocks++; blk = 0; blkN = 0; }
  }
  const rms = Math.sqrt(sum / n), rmsDb = 20 * Math.log10(rms + 1e-12);
  const errs = msgs.filter(m => m.t === 'error' || m.t === 'panic');
  const problems = [];
  if (nan) problems.push(`NaN×${nan}`);
  if (peak > CEIL + 1e-6) problems.push(`peak ${peak.toFixed(4)} > ceiling`);
  if (rmsDb < -50) problems.push(`too quiet ${rmsDb.toFixed(1)} dB`);
  if (Math.abs(dc / n) > 0.02) problems.push(`DC ${(dc / n).toFixed(3)}`);
  if (pinned / (n / 2) > 0.01) problems.push(`limiter pinned ${(100 * pinned / (n / 2)).toFixed(1)}%`);
  if (silentBlocks / blocks > 0.5) problems.push(`mostly silent (${silentBlocks}/${blocks} blocks)`);
  if (errs.length) problems.push(`engine: ${errs.map(e => e.t + ' ' + (e.msg || '')).join('; ')}`);
  if (rtf > 0.35) problems.push(`slow rtf ${rtf.toFixed(3)}`);
  if (problems.length) failures++;
  const active = eng.active.length;
  rows.push({ name: pr.name, peak: peak.toFixed(3), rms: rmsDb.toFixed(1), pinned: (100 * pinned / (n / 2)).toFixed(2) + '%', rtf: rtf.toFixed(3), mods: active, ok: problems.length ? 'FAIL ' + problems.join(', ') : 'ok' });
  if (wavDir) {
    fs.mkdirSync(wavDir, { recursive: true });
    writeWav24(path.join(wavDir, pr.name.replace(/[^\w]+/g, '_') + '.wav'), L, R, SR);
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('preset', 40), pad('peak', 7), pad('rms dB', 8), pad('pinned', 8), pad('cpu×rt', 7), pad('mods', 5), 'status');
for (const r of rows) console.log(pad(r.name, 40), pad(r.peak, 7), pad(r.rms, 8), pad(r.pinned, 8), pad(r.rtf, 7), pad(r.mods, 5), r.ok);
console.log(`\n${items.length} patches, ${failures} failure(s), ${seconds}s each @ ${SR} Hz`);
process.exit(failures ? 1 : 0);
