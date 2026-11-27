/*
 * MASTER OF ALL — patch state helpers (no DOM; shared by the app and tests)
 *
 * A patch ("state") is:
 *   { name, cat, params: {mod: {key: value}}, cables: [[from, to], ...],
 *     sq: {subs: Uint8Array, mute: Uint8Array, act: Uint8Array, gate: [6]},
 *     arp: [notes] }
 *
 * Factory presets use a compact form (see presets.js):
 *   p:   {'mod.key': value}            overrides of the defaults
 *   c:   [['mod.out', 'mod.in'], ...]  cables
 *   sq:  {k:'x...x...', s:'....x...', h:..., c:..., t:..., b:...}  or an array of such (patterns)
 *   sqg: 'kh'                          tracks in GATE mode
 *   arp: [60, 63, 67]                  notes latched in the arpeggiator
 *
 * Step characters:
 *   .  off                x  hit            X  accent        o  soft
 *   2  ratchet ×2         3  ratchet ×3     4  ratchet ×4    f  flam (soft+hit)
 *   l  late (32nd)        L  late accent    d  drag (last 64th, soft)
 *   _  muted step         -  skipped (inactive) step
 */
(function (root) {
  'use strict';
  var SPECS = root.MASTER_SPECS;
  var BY_ID = root.MASTER_SPEC_BY_ID;
  var TRK = { k: 0, s: 1, h: 2, c: 3, t: 4, b: 5 };
  var STEPS = 64, TRACKS = 6, PATS = 8, SIZE = PATS * TRACKS * STEPS;

  // velocity codes per substep: 0 off, 1 normal, 2 accent, 3 soft
  function sub(a, b, c, d) { return (a & 3) | ((b & 3) << 2) | ((c & 3) << 4) | ((d & 3) << 6); }
  var CHAR = {
    '.': 0, 'x': sub(1, 0, 0, 0), 'X': sub(2, 0, 0, 0), 'o': sub(3, 0, 0, 0),
    '2': sub(1, 0, 1, 0), '3': sub(1, 1, 1, 0), '4': sub(1, 1, 1, 1), 'f': sub(3, 1, 0, 0),
    'l': sub(0, 0, 1, 0), 'L': sub(0, 0, 2, 0), 'd': sub(0, 0, 0, 3), '_': sub(1, 0, 0, 0), '-': 0
  };

  function defaults() {
    var params = {};
    SPECS.forEach(function (s) {
      var o = {};
      (s.params || []).forEach(function (q) { o[q.k] = q.def; });
      params[s.id] = o;
    });
    return params;
  }

  function emptySq() {
    var act = new Uint8Array(SIZE); act.fill(1);
    return { subs: new Uint8Array(SIZE), mute: new Uint8Array(SIZE), act: act, gate: [0, 0, 0, 0, 0, 0] };
  }

  function idx(pt, tr, st) { return (pt * TRACKS + tr) * STEPS + st; }

  function parseTracks(sq, pt, obj, params) {
    Object.keys(obj).forEach(function (key) {
      var tr = TRK[key];
      if (tr === undefined) return;
      var str = String(obj[key]).replace(/\s|\|/g, '').slice(0, STEPS);
      for (var st = 0; st < str.length; st++) {
        var ch = str[st], i = idx(pt, tr, st);
        sq.subs[i] = CHAR[ch] !== undefined ? CHAR[ch] : 0;
        sq.mute[i] = ch === '_' ? 1 : 0;
        sq.act[i] = ch === '-' ? 0 : 1;
      }
      if (pt === 0 && params && str.length) params.sqncr['l' + (tr + 1)] = str.length;
    });
  }

  function fromPreset(pr) {
    var st = { name: pr.name || 'Untitled', cat: pr.cat || 'User', notes: pr.notes || '', params: defaults(), cables: [], sq: emptySq(), arp: [] };
    // sequencer first (lengths come from the strings, explicit params may override)
    if (pr.sq) {
      var list = Array.isArray(pr.sq) ? pr.sq : [pr.sq];
      list.slice(0, PATS).forEach(function (o, pt) { parseTracks(st.sq, pt, o, st.params); });
    }
    if (pr.sqg) String(pr.sqg).split('').forEach(function (ch) { if (TRK[ch] !== undefined) st.sq.gate[TRK[ch]] = 1; });
    var p = pr.p || {};
    Object.keys(p).forEach(function (key) {
      var d = key.indexOf('.'), m = key.slice(0, d), k = key.slice(d + 1);
      if (st.params[m] && st.params[m][k] !== undefined) st.params[m][k] = p[key];
    });
    (pr.c || []).forEach(function (c) { if (validCable(c)) st.cables.push([c[0], c[1]]); });
    st.arp = (pr.arp || []).slice(0, 20);
    return st;
  }

  function validCable(c) {
    if (!c || c.length < 2) return false;
    var a = String(c[0]).split('.'), b = String(c[1]).split('.');
    var sa = BY_ID[a[0]], sb = BY_ID[b[0]];
    return !!(sa && sb && sa.outs.indexOf(a[1]) >= 0 && sb.ins.indexOf(b[1]) >= 0);
  }

  function toMessage(st) {
    return {
      t: 'load', params: st.params, cables: st.cables,
      sq: { subs: st.sq.subs, mute: st.sq.mute, act: st.sq.act, gate: st.sq.gate },
      arp: st.arp, autoLevel: st.autoLevel || 0
    };
  }

  // ── serialization for user presets (localStorage / .json export) ──
  function b64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return (typeof btoa !== 'undefined') ? btoa(s) : Buffer.from(u8).toString('base64');
  }
  function unb64(str, n) {
    var bin = (typeof atob !== 'undefined') ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    var u = new Uint8Array(n);
    for (var i = 0; i < Math.min(n, bin.length); i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function serialize(st) {
    return {
      format: 'master-of-all/1', name: st.name, cat: st.cat || 'User', notes: st.notes || '',
      params: st.params, cables: st.cables, arp: st.arp,
      sq: { subs: b64(st.sq.subs), mute: b64(st.sq.mute), act: b64(st.sq.act), gate: st.sq.gate.slice() }
    };
  }
  function deserialize(o) {
    if (!o || typeof o !== 'object') throw new Error('Not a preset');
    if (o.format !== 'master-of-all/1') {
      if (o.p || o.c || o.sq) return fromPreset(o); // compact factory format
      throw new Error('Unknown preset format');
    }
    var st = { name: String(o.name || 'Imported'), cat: o.cat || 'User', notes: o.notes || '', params: defaults(), cables: [], sq: emptySq(), arp: [] };
    Object.keys(o.params || {}).forEach(function (m) {
      if (!st.params[m]) return;
      Object.keys(o.params[m]).forEach(function (k) {
        var v = +o.params[m][k];
        if (st.params[m][k] !== undefined && isFinite(v)) st.params[m][k] = v;
      });
    });
    (o.cables || []).forEach(function (c) { if (validCable(c)) st.cables.push([c[0], c[1]]); });
    if (o.sq) {
      st.sq.subs = unb64(o.sq.subs || '', SIZE);
      st.sq.mute = unb64(o.sq.mute || '', SIZE);
      st.sq.act = o.sq.act ? unb64(o.sq.act, SIZE) : st.sq.act;
      st.sq.gate = (o.sq.gate || [0, 0, 0, 0, 0, 0]).map(function (x) { return x ? 1 : 0; });
    }
    st.arp = (o.arp || []).filter(function (n) { return isFinite(n); }).slice(0, 20);
    return st;
  }
  function clone(st) { return deserialize(JSON.parse(JSON.stringify(serialize(st)))); }


  // ─────────────────────────────── RANDOMIZE / MUTATE ───────────────────────────────
  // randomize(seed): builds a complete, always-audible patch. A voice is chosen
  // and given a pitch source, optionally run through processors, struck or
  // enveloped by a low pass gate, mixed with an optional second layer, sent to
  // optional echo/reverb and the OUTPUT; then 2–5 modulation cables are added.
  // Every knob is randomized inside musically safe limits. Same seed = same patch.

  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function toNorm(q, v) {
    if (q.curve === 'exp') return Math.log(v / q.min) / Math.log(q.max / q.min);
    if (q.curve === 'pow') return Math.pow((v - q.min) / (q.max - q.min), 1 / 3);
    return (v - q.min) / (q.max - q.min);
  }
  function fromNorm(q, n) {
    n = Math.max(0, Math.min(1, n));
    var v;
    if (q.curve === 'exp') v = q.min * Math.pow(q.max / q.min, n);
    else if (q.curve === 'pow') v = q.min + (q.max - q.min) * n * n * n;
    else v = q.min + (q.max - q.min) * n;
    if (q.curve === 'int' || q.curve === 'enum' || q.curve === 'bool') v = Math.round(v);
    return +(+v).toPrecision(5);
  }
  // knobs that must stay put or follow explicit rules below
  var KEEP = { 'clock.run': 1, 'sqncr.rec': 1, 'sqncr.loop': 1, 'sqncr.mom': 1, 'sqncr.pattern': 1, 'delay.freeze': 1, 'out.level': 1, 'touch.oct': 1, 'arp.latch': 1, 'poly.src': 1, 'poly.level': 1, 'mix.master': 1 };
  var SCALE_NOTES = [[0, 3, 5, 7, 10], [0, 2, 3, 5, 7, 8, 10], [0, 1, 4, 5, 7, 8, 10], [0, 2, 4, 7, 9], [0, 2, 4, 6, 8, 10], [0, 1, 3, 6, 7, 10]];

  function randomize(seed) {
    seed = (seed === undefined ? Math.floor(Math.random() * 1e9) : seed) >>> 0;
    var r = prng(seed);
    function pick(a) { return a[Math.floor(r() * a.length)]; }
    function rr(a, b) { return a + (b - a) * r(); }
    function ch(p) { return r() < p; }
    var st = { name: 'Random #' + seed, cat: 'Random', notes: '', params: defaults(), cables: [], sq: emptySq(), arp: [], seed: seed };
    var P = st.params, used = {}, story = [];
    function set(key, v) { var d = key.indexOf('.'); P[key.slice(0, d)][key.slice(d + 1)] = v; }
    function cab(from, to) { if (used[to] || !validCable([from, to])) return false; used[to] = 1; st.cables.push([from, to]); return true; }

    // 1. every knob, anywhere in a safe range
    SPECS.forEach(function (s) {
      (s.params || []).forEach(function (q) {
        var key = s.id + '.' + q.k;
        if (KEEP[key]) return;
        if (q.curve === 'bool') P[s.id][q.k] = ch(0.5) ? 1 : 0;
        else if (q.curve === 'enum') P[s.id][q.k] = Math.floor(r() * q.options.length);
        else P[s.id][q.k] = fromNorm(q, rr(0.05, 0.95));
      });
    });
    // 2. musical / safety limits
    set('clock.bpm', Math.round(rr(66, 160))); set('clock.mult', pick([1, 1, 2, 2, 3])); set('clock.swing', ch(0.4) ? Math.round(rr(5, 30)) : 0); set('clock.width', rr(0.2, 0.5));
    set('seq.range', +rr(0.5, 2).toFixed(2)); set('seq.quant', pick([1, 2, 3, 5, 6, 6, 7])); set('seq.div', pick([1, 1, 1, 2, 4])); set('seq.slew', ch(0.3) ? rr(0.05, 0.3) : 0);
    set('seq.steps', pick([4, 5, 6, 7, 8, 8]));
    for (var g = 1; g <= 8; g++) set('seq.g' + g, ch(0.8) ? 1 : 0);
    set('arp.win', 20); set('arp.oct', pick([1, 1, 2, 3])); set('arp.gate', rr(0.3, 0.8));
    set('touch.glide', ch(0.3) ? rr(0, 0.3) : 0);
    set('cplx.pfreq', +(55 * Math.pow(2, Math.floor(rr(0, 3.99)))).toFixed(1)); set('cplx.fine', 0);
    set('cplx.fm', rr(0, 0.6)); set('cplx.timbre', rr(0, 0.6)); set('cplx.am', ch(0.3) ? rr(0, 0.6) : 0); set('cplx.fmx', rr(-0.4, 0.4));
    set('fmv.freq', +(55 * Math.pow(2, Math.floor(rr(0, 3.99)))).toFixed(1)); set('fmv.index', rr(0.3, 4)); set('fmv.fb', rr(0, 0.5));
    set('poly.atk', rr(2, 300)); set('poly.rel', rr(80, 1500)); set('poly.cut', rr(600, 6000)); set('poly.res', rr(0, 0.6)); set('poly.trans', 0); set('poly.level', 0.9);
    ['lfo1', 'lfo2'].forEach(function (l) { set(l + '.rate', +Math.pow(2, rr(-4, 3)).toFixed(3)); if (ch(0.6)) { set(l + '.flop', 0); } if (ch(0.6)) set(l + '.xor', 0); if (ch(0.5)) set(l + '.res', 0); if (ch(0.6)) set(l + '.thres', 255); });
    ['func1', 'func2'].forEach(function (f) { set(f + '.atk', rr(0.5, 60)); set(f + '.dec', rr(40, 900)); set(f + '.rel', rr(60, 1500)); set(f + '.hold', ch(0.3) ? rr(5, 200) : 0); set(f + '.loop', 0); set(f + '.sus', rr(0, 0.7)); });
    set('rand.gprob', rr(0.35, 0.85));
    set('lpg.r1', rr(0, 0.7)); set('lpg.r2', rr(0, 0.7)); set('lpg.o1', 0); set('lpg.o2', 0); set('lpg.a1', rr(0.7, 1)); set('lpg.a2', rr(0.7, 1));
    set('lpg.m1', pick([1, 1, 1, 0, 2])); set('lpg.m2', pick([1, 1, 0])); set('lpg.v1', rr(0.05, 0.7)); set('lpg.v2', rr(0.05, 0.7));
    set('fold.gain', rr(0.1, 0.6)); set('fold.mix', rr(0.6, 1)); set('filt.res', rr(0, 0.85)); set('filt.cut', +Math.pow(2, rr(8, 13)).toFixed(0)); set('filt.drive', rr(0, 0.6));
    set('ring.level', 0.9); set('bits.bits', rr(5, 12)); set('bits.rate', +Math.pow(2, rr(11.5, 14.5)).toFixed(0)); set('bits.mix', rr(0.4, 1));
    set('delay.fb', rr(0.15, 0.75)); set('delay.mix', rr(0.15, 0.45)); set('delay.time', rr(0.08, 0.9));
    set('verb.mix', rr(0.15, 0.45)); set('verb.decay', rr(0.3, 0.8));
    for (var m = 1; m <= 4; m++) set('mix.l' + m, rr(0.55, 0.9));
    set('util.a1', rr(0.3, 1)); set('util.o1', rr(-0.3, 0.3)); set('util.a2', rr(-1, 1)); set('util.o2', 0);
    ['k', 's', 'h', 'c', 't', 'b'].forEach(function (v) { set('drum.' + v + 'l', rr(0.45, 0.9)); });
    set('drum.drive', rr(0, 0.7)); set('sqncr.tlen', 2);

    // 3. drum patterns (pattern 1), random density per instrument and optional polymeter
    var dens = [0.28, 0.16, 0.5, 0.1, 0.22, 0.2], chars = ['x', 'x', 'x', 'X', 'o', '2', 'l', '4', 'f'];
    for (var tr = 0; tr < 6; tr++) {
      var len = ch(0.25) ? pick([5, 7, 9, 10, 12, 13]) : 16;
      P.sqncr['l' + (tr + 1)] = len;
      for (var s2 = 0; s2 < len; s2++) {
        var on = r() < dens[tr] || (tr === 0 && s2 % 4 === 0 && ch(0.6)) || (tr === 1 && s2 % 8 === 4 && ch(0.7));
        st.sq.subs[idx(0, tr, s2)] = on ? CHAR[pick(chars)] : 0;
      }
    }

    // 4. the audio path
    var pitchSrc = pick(['seq.cv', 'seq.cv', 'arp.pitch', 'rand.step']);
    var trigFor = { 'seq.cv': 'seq.trig', 'arp.pitch': 'arp.trig', 'rand.step': 'rand.gate' };
    if (pitchSrc === 'arp.pitch' || ch(0.3)) {
      var sc = pick(SCALE_NOTES), root = 48 + Math.floor(rr(0, 12)), n = 3 + Math.floor(rr(0, 3));
      for (var i = 0; i < n; i++) st.arp.push(root + sc[Math.floor(r() * sc.length)] + 12 * Math.floor(rr(0, 2)));
      st.arp = st.arp.filter(function (x, j, a) { return a.indexOf(x) === j; });
      set('arp.latch', 1);
    }
    var voice = pick(['cplx.out', 'cplx.out', 'cplx.sine', 'cplx.mod', 'fmv.out', 'fmv.out', 'poly.out', 'lfo1.bi', 'noise.bastl']);
    story.push(voice.split('.')[0].toUpperCase());
    if (voice.indexOf('cplx') === 0) { cab(pitchSrc, 'cplx.pitch'); if (voice === 'cplx.mod') { set('cplx.mtrack', 1); set('cplx.mfreq', P.cplx.pfreq * pick([0.5, 1, 1, 2])); } }
    if (voice === 'fmv.out') cab(pitchSrc, 'fmv.pitch');
    if (voice === 'poly.out') { set('poly.src', 1); set('arp.latch', 1); if (!st.arp.length) st.arp = [57, 60, 64, 67]; pitchSrc = 'arp.pitch'; set('poly.atk', rr(2, 40)); }
    if (voice === 'lfo1.bi') { set('lfo1.rate', +rr(60, 400).toFixed(1)); set('lfo1.wave', pick([0, 1])); cab(pitchSrc, 'lfo1.rate'); }
    if (voice === 'noise.bastl') { set('noise.rate', +rr(800, 12000).toFixed(0)); }
    var trig = trigFor[pitchSrc] || 'seq.trig';
    if (ch(0.25)) trig = pick(['rand.gate', 'sqncr.t' + (1 + Math.floor(rr(0, 6))), 'clock.mult', 'seq.gate']);
    var node = voice;
    var procs = ['fold', 'filt', 'ring', 'bits'].filter(function () { return ch(0.3); });
    if (voice === 'noise.bastl' && procs.indexOf('filt') < 0) procs.unshift('filt');
    procs.forEach(function (pm) {
      var ins = { fold: 'fold.in', filt: 'filt.in', ring: 'ring.a', bits: 'bits.in' }[pm];
      var outs = { fold: 'fold.out', filt: pick(['filt.lp', 'filt.lp', 'filt.lp', 'filt.bp']), ring: 'ring.out', bits: 'bits.out' }[pm];
      if (pm === 'filt' && voice === 'noise.bastl') { set('filt.res', rr(0.8, 0.95)); cab(pitchSrc, 'filt.voct'); outs = 'filt.bp'; }
      if (cab(node, ins)) { node = outs; story.push(pm.toUpperCase()); }
    });
    cab(node, 'lpg.in1');
    if (voice === 'poly.out') { set('lpg.m1', 2); set('lpg.o1', 0.85); set('lpg.a1', 0); }
    else if (ch(0.5)) cab(trig, 'lpg.ping1');
    else { var fn = pick(['func1', 'func2']); cab(trig, fn + '.trig'); cab(fn + '.env', 'lpg.cv1'); set(fn + '.atk', rr(0.5, 15)); }
    story.push('LPG');
    // second layer
    var layer2 = null;
    if (ch(0.6)) {
      layer2 = pick(['drum.mix', 'drum.mix', 'noise.pink', 'cplx.out', 'fmv.out', 'noise.crack']);
      if (layer2 === voice || (layer2 === 'cplx.out' && voice.indexOf('cplx') === 0) || (layer2 === 'fmv.out' && voice === 'fmv.out')) layer2 = 'drum.mix';
      if (layer2 === 'drum.mix') { cab('drum.mix', 'mix.in2'); }
      else {
        if (layer2 === 'cplx.out') cab(pick(['seq.cv', 'rand.step', 'arp.pitch']), 'cplx.pitch');
        if (layer2 === 'fmv.out') cab(pick(['seq.cv', 'rand.step', 'arp.pitch']), 'fmv.pitch');
        cab(layer2, 'lpg.in2');
        cab(pick(['rand.gate', 'seq.gate', 'sqncr.t6', 'sqncr.t3', 'clock.q']), 'lpg.ping2');
        cab('lpg.out2', 'mix.in2');
      }
      story.push('+ ' + layer2.split('.')[0].toUpperCase());
    }
    cab('lpg.out1', 'mix.in1');
    var bus = 'mix.out';
    if (ch(0.7)) { cab(bus, 'delay.in'); bus = 'delay.out'; story.push('ECHO'); }
    if (ch(0.75)) { cab(bus, 'verb.inL'); cab('verb.L', 'out.L'); cab('verb.R', 'out.R'); story.push('VERB'); }
    else cab(bus, 'out.L');

    // 5. modulation cables
    var lfoAudio = voice === 'lfo1.bi';
    var srcs = ['lfo2.uni', 'lfo2.bi', 'func2.env', 'rand.flux', 'rand.smooth', 'seq.raw'].concat(lfoAudio ? [] : ['lfo1.uni', 'lfo1.bi']);
    var dests = ['cplx.timb', 'cplx.sym', 'fmv.idx', 'filt.cv', 'fold.cv', 'bits.rate', 'delay.time', 'poly.cut', 'ring.pitch', 'drum.pitch', 'lfo1.xor', 'cplx.mpitch'];
    var nMod = 2 + Math.floor(rr(0, 4));
    for (var k = 0; k < nMod * 3 && nMod > 0; k++) {
      var d = pick(dests), sname = pick(srcs);
      if (d === 'lfo1.xor' && !lfoAudio) continue;
      if (d === 'delay.time') { set('lfo2.rate', Math.min(P.lfo2.rate, 0.5)); if (sname.indexOf('lfo1') === 0) continue; }
      if (sname.indexOf('func2') === 0 && !st.cables.some(function (c) { return c[1] === 'func2.trig' || c[1] === 'func2.gate'; })) { cab(trig, 'func2.trig'); }
      if (cab(sname, d)) nMod--;
    }
    // make sure func1 (normalled to the touch plate) still responds to the keys
    st.notes = 'Randomized patch: ' + story.join(' → ') + '. Shift-click RANDOM to mutate it.';
    st.autoLevel = 2.5;
    return st;
  }

  // mutate(state, amount, seed): nudges ~30% of the knobs by ±amount (in knob travel)
  function mutate(st0, amount, seed) {
    var st = clone(st0);
    var r = prng(seed === undefined ? Math.floor(Math.random() * 1e9) : seed);
    amount = amount === undefined ? 0.12 : amount;
    SPECS.forEach(function (s) {
      (s.params || []).forEach(function (q) {
        var key = s.id + '.' + q.k;
        if (KEEP[key] || q.curve === 'bool' || q.curve === 'enum' || r() > 0.3) return;
        if (/^sqncr\.l\d$/.test(key) || key === 'sqncr.tlen') return;
        var v = fromNorm(q, toNorm(q, st.params[s.id][q.k]) + (r() * 2 - 1) * amount);
        if (key === 'delay.fb') v = Math.min(v, 0.95);
        if (key === 'filt.res' || /^lpg\.r\d$/.test(key)) v = Math.min(v, 0.92);
        st.params[s.id][q.k] = v;
      });
    });
    var base = String(st0.name || 'Patch').replace(/ \(mutation \d+\)$/, '');
    var gen = /\(mutation (\d+)\)$/.exec(st0.name || '');
    st.name = base + ' (mutation ' + (gen ? +gen[1] + 1 : 1) + ')';
    st.cat = st0.cat || 'Random';
    st.autoLevel = 2.5;
    return st;
  }

  root.MasterPatch = {
    defaults: defaults, emptySq: emptySq, fromPreset: fromPreset, toMessage: toMessage,
    serialize: serialize, deserialize: deserialize, clone: clone, validCable: validCable,
    idx: idx, CHAR: CHAR, SIZE: SIZE, STEPS: STEPS, TRACKS: TRACKS, PATS: PATS,
    randomize: randomize, mutate: mutate, prng: prng
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
