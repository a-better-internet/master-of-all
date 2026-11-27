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
      arp: st.arp
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

  root.MasterPatch = {
    defaults: defaults, emptySq: emptySq, fromPreset: fromPreset, toMessage: toMessage,
    serialize: serialize, deserialize: deserialize, clone: clone, validCable: validCable,
    idx: idx, CHAR: CHAR, SIZE: SIZE, STEPS: STEPS, TRACKS: TRACKS, PATS: PATS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
