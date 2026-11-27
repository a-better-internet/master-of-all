/*
 * MASTER OF ALL — application glue: audio engine boot, preset browser,
 * user presets (localStorage + JSON import/export), 24-bit recording,
 * Web MIDI, computer keyboard.
 */
(function () {
  'use strict';
  var MP = window.MasterPatch, SPECS = window.MASTER_SPECS, PRESETS = window.MASTER_PRESETS;
  var LS_USER = 'master-of-all.user-presets', LS_SESSION = 'master-of-all.session', LS_PREFS = 'master-of-all.prefs';
  var $ = function (id) { return document.getElementById(id); };

  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var app = {
    state: null, ctx: null, node: null, ready: false, keyOct: 0, dirty: false, current: null,
    user: [], takes: [], rec: null, lastArp: [], prefs: lsGet(LS_PREFS, { latency: 'balanced', cables: 0 })
  };
  window.MasterApp = app;

  // ─────────────────────────────── messaging ───────────────────────────────
  app.post = function (m, transfer) { if (app.node && app.ready) app.node.port.postMessage(m, transfer || []); };
  var toastT = 0;
  app.toast = function (msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };
  var statusT = 0;
  app.status = function (msg) {
    $('status').textContent = msg;
    clearTimeout(statusT); statusT = setTimeout(function () { $('status').textContent = ''; }, 2500);
  };

  // ─────────────────────────────── state changes from the UI ───────────────────────────────
  var saveT = 0;
  function touched() {
    if (!app.dirty) { app.dirty = true; showInfo(); }
    clearTimeout(saveT);
    saveT = setTimeout(saveSession, 700);
  }
  function saveSession() {
    if (!app.state) return;
    syncArp();
    var o = MP.serialize(app.state); o.current = app.current; o.dirty = app.dirty;
    lsSet(LS_SESSION, o);
  }
  function syncArp() { if (app.state.params.arp.latch > 0.5 && app.lastArp) app.state.arp = app.lastArp.slice(); }

  app.onParam = function (m, k, v) {
    app.state.params[m][k] = v;
    app.post({ t: 'param', m: m, k: k, v: v });
    if (m === 'clock' && k === 'bpm') app.ui.setParamUI('clock', 'bpm', v);
    touched();
  };
  app.addCable = function (from, to) {
    if (!MP.validCable([from, to])) return;
    app.state.cables = app.state.cables.filter(function (c) { return c[1] !== to; });
    app.state.cables.push([from, to]);
    app.status('patched ' + from.toUpperCase() + ' → ' + to.toUpperCase());
    app.ui.redrawCables();
    touched();
  };
  app.removeCable = function (to, silent) {
    var n = app.state.cables.length;
    app.state.cables = app.state.cables.filter(function (c) { return c[1] !== to; });
    app.ui.redrawCables();
    if (!silent && n !== app.state.cables.length) { app.commitCables(); app.status('cable removed'); }
    touched();
  };
  app.commitCables = function () { app.post({ t: 'cables', list: app.state.cables }); };

  // sequencer
  var CH = MP.CHAR;
  var RATCH = [CH.x, CH['2'], CH['3'], CH['4']];
  var SHIFT = [CH.x, CH.l, CH.d, CH.f];
  app.sqCell = function (tr, st, mode) {
    var sq = app.state.sq, pt = Math.round(app.state.params.sqncr.pattern), i = MP.idx(pt, tr, st);
    var s = sq.subs[i];
    switch (mode) {
      case 'hit': if (s) { sq.subs[i] = 0; sq.mute[i] = 0; } else sq.subs[i] = CH.x; sq.act[i] = 1; break;
      case 'accent': sq.subs[i] = s === CH.X ? CH.x : CH.X; sq.act[i] = 1; break;
      case 'soft': sq.subs[i] = s === CH.o ? CH.x : CH.o; sq.act[i] = 1; break;
      case 'ratchet': var r = RATCH.indexOf(s); sq.subs[i] = RATCH[(r + 1) % RATCH.length]; sq.act[i] = 1; break;
      case 'late': var l = SHIFT.indexOf(s); sq.subs[i] = SHIFT[(l + 1) % SHIFT.length]; sq.act[i] = 1; break;
      case 'mute': sq.mute[i] = sq.mute[i] ? 0 : 1; break;
      case 'skip': sq.act[i] = sq.act[i] ? 0 : 1; break;
    }
    app.post({ t: 'sqEdit', p: pt, tr: tr, st: st, subs: sq.subs[i], mute: sq.mute[i], act: sq.act[i] });
    app.ui.drawSq(); touched();
  };
  app.sqGate = function (tr) {
    var g = app.state.sq.gate; g[tr] = g[tr] ? 0 : 1;
    app.post({ t: 'sqGate', tr: tr, v: g[tr] });
    app.ui.drawSq(); touched();
  };
  app.sqClear = function (tr) {
    var sq = app.state.sq, pt = Math.round(app.state.params.sqncr.pattern);
    for (var t = 0; t < 6; t++) {
      if (tr >= 0 && t !== tr) continue;
      for (var s = 0; s < 64; s++) { var i = MP.idx(pt, t, s); sq.subs[i] = 0; sq.mute[i] = 0; sq.act[i] = 1; }
    }
    sendSq(); app.ui.drawSq(); touched();
  };
  function sendSq() { var sq = app.state.sq; app.post({ t: 'sqData', subs: sq.subs, mute: sq.mute, act: sq.act, gate: sq.gate }); }
  app.sqCopy = function () {
    var sq = app.state.sq, pt = Math.round(app.state.params.sqncr.pattern), a = pt * 6 * 64, b = a + 6 * 64;
    return { subs: sq.subs.slice(a, b), mute: sq.mute.slice(a, b), act: sq.act.slice(a, b) };
  };
  app.sqPaste = function (c) {
    var sq = app.state.sq, pt = Math.round(app.state.params.sqncr.pattern), a = pt * 6 * 64;
    sq.subs.set(c.subs, a); sq.mute.set(c.mute, a); sq.act.set(c.act, a);
    sendSq(); app.ui.drawSq(); touched();
  };
  app.sqApplyEdits = function (e) {
    var sq = app.state.sq;
    for (var k = 0; k + 5 < e.length; k += 6) { var i = MP.idx(e[k], e[k + 1], e[k + 2]); sq.subs[i] = e[k + 3]; sq.mute[i] = e[k + 4]; sq.act[i] = e[k + 5]; }
    app.ui.drawSq(); touched();
  };
  app.pad = function (tr, on) { app.post({ t: 'pad', tr: tr, on: on }); };

  // notes
  var held = {};
  app.noteOn = function (n, v) { if (held[n]) return; held[n] = 1; app.post({ t: 'noteOn', n: n, v: v }); };
  app.noteOff = function (n) { if (!held[n]) return; delete held[n]; app.post({ t: 'noteOff', n: n }); };
  app.press = function (v, pos) { app.post({ t: 'press', v: v, pos: pos }); };
  app.allOff = function () { held = {}; app.post({ t: 'allOff' }); };
  app.tap = function () { app.post({ t: 'tap' }); app.status('tap'); };
  app.arpClear = function () { app.post({ t: 'arpClear' }); app.state.arp = []; app.lastArp = []; touched(); };

  // ─────────────────────────────── presets ───────────────────────────────
  function loadState(st, ref, dirty) {
    app.state = st; app.current = ref || null; app.dirty = !!dirty;
    app.lastArp = (st.arp || []).slice();
    held = {};
    app.ui.refresh();
    app.post(MP.toMessage(st));
    showInfo(); syncSelect();
    saveSession();
  }
  function showInfo() {
    var st = app.state;
    $('pcat').textContent = st.cat || '';
    $('pname').textContent = (st.name || 'Untitled') + (app.dirty ? ' *' : '');
    $('pnotes').textContent = st.notes || '';
    $('pnotes').title = st.notes || '';
  }
  function presetList() {
    var list = [];
    app.user.forEach(function (u, i) { list.push({ ref: 'u:' + i, name: u.name, cat: 'My presets' }); });
    PRESETS.forEach(function (p, i) { list.push({ ref: 'f:' + i, name: p.name + (p.keys ? '' : ''), cat: p.cat }); });
    return list;
  }
  function buildSelect() {
    var sel = $('presetSel'); sel.innerHTML = '';
    var groups = {}, order = [];
    presetList().forEach(function (it) {
      if (!groups[it.cat]) { groups[it.cat] = document.createElement('optgroup'); groups[it.cat].label = it.cat; order.push(it.cat); }
      var o = document.createElement('option'); o.value = it.ref; o.textContent = it.name; groups[it.cat].appendChild(o);
    });
    order.forEach(function (c) { sel.appendChild(groups[c]); });
    syncSelect();
  }
  function syncSelect() {
    var sel = $('presetSel');
    if (app.current && sel.querySelector('option[value="' + app.current + '"]')) sel.value = app.current;
    $('del').disabled = !(app.current && app.current[0] === 'u');
  }
  function loadRef(ref) {
    var t = ref[0], i = +ref.slice(2), st;
    try {
      if (t === 'f') st = MP.fromPreset(PRESETS[i]);
      else st = MP.deserialize(app.user[i]);
    } catch (e) { app.toast('Could not load preset: ' + e.message); return; }
    loadState(st, ref, false);
    app.status('loaded ' + st.name);
  }
  function step(d) {
    var list = presetList(), idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].ref === app.current) idx = i;
    idx = (idx + d + list.length) % list.length;
    loadRef(list[idx].ref);
  }
  var randCount = 0;
  function randomPatch(mutateIt) {
    syncArp();
    var seed = (Date.now() ^ Math.floor(Math.random() * 1e9) ^ (++randCount * 2654435761)) >>> 0;
    var st = mutateIt ? MP.mutate(app.state, 0.15, seed) : MP.randomize(seed);
    loadState(st, null, true);
    app.status(mutateIt ? 'mutated · auto-leveling…' : 'new random patch · auto-leveling…');
    app.toast(mutateIt ? 'Mutated: ' + st.name : st.name + ' — Shift-click RANDOM to mutate, SAVE to keep');
  }
  app.randomPatch = randomPatch;
  function saveUser() {
    syncArp();
    var name = prompt('Preset name:', (app.state.name || 'My patch').replace(/ \*$/, ''));
    if (!name) return;
    name = name.slice(0, 64);
    var o = MP.serialize(app.state); o.name = name; o.cat = 'My presets';
    var existing = -1;
    app.user.forEach(function (u, i) { if (u.name === name) existing = i; });
    if (existing >= 0) {
      if (!confirm('Overwrite "' + name + '"?')) return;
      app.user[existing] = o;
    } else { app.user.push(o); existing = app.user.length - 1; }
    if (!lsSet(LS_USER, app.user)) { app.toast('Browser storage is unavailable — use EXPORT to keep this preset.'); }
    app.state.name = name; app.state.cat = 'My presets';
    app.current = 'u:' + existing; app.dirty = false;
    buildSelect(); showInfo(); saveSession();
    app.toast('Saved "' + name + '"');
  }
  function deleteUser() {
    if (!app.current || app.current[0] !== 'u') return;
    var i = +app.current.slice(2), u = app.user[i];
    if (!u || !confirm('Delete preset "' + u.name + '"?')) return;
    app.user.splice(i, 1); lsSet(LS_USER, app.user);
    app.current = null; app.dirty = true; buildSelect(); showInfo();
    app.toast('Deleted "' + u.name + '"');
  }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  function safeName(s) { return String(s || 'patch').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'patch'; }
  function exportPreset() {
    syncArp();
    var o = MP.serialize(app.state);
    download(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }), safeName(o.name) + '.master.json');
  }
  function importFiles(files) {
    var n = 0, pending = files.length, lastRef = null;
    Array.prototype.forEach.call(files, function (f) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result), list = Array.isArray(data) ? data : [data];
          list.forEach(function (o) {
            var st = MP.deserialize(o), s = MP.serialize(st); s.cat = 'My presets';
            app.user.push(s); n++; lastRef = 'u:' + (app.user.length - 1);
          });
        } catch (e) { app.toast(f.name + ': ' + e.message); }
        if (--pending === 0) {
          lsSet(LS_USER, app.user); buildSelect();
          if (lastRef) { loadRef(lastRef); app.toast('Imported ' + n + ' preset' + (n === 1 ? '' : 's')); }
        }
      };
      r.readAsText(f);
    });
  }

  // ─────────────────────────────── audio ───────────────────────────────
  function workletSource() {
    return 'globalThis.MASTER_SPECS = ' + JSON.stringify(SPECS) + ';\n(' + window.MASTER_DSP.toString() + ')();\n';
  }
  async function power() {
    if (app.ctx) {
      if (app.ctx.state === 'running') { await app.ctx.suspend(); setPower(false); }
      else { await app.ctx.resume(); setPower(true); }
      return;
    }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !window.AudioWorkletNode) throw new Error('This browser has no AudioWorklet support. Use a current Chrome, Edge, Firefox or Safari.');
      app.ctx = new Ctx({ latencyHint: app.prefs.latency || 'balanced' });
      var url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' }));
      await app.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      app.node = new AudioWorkletNode(app.ctx, 'master-of-all', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      app.node.port.onmessage = onMessage;
      app.node.onprocessorerror = function () { app.toast('Audio engine error — press PANIC or reload'); };
      app.node.connect(app.ctx.destination);
      if (app.ctx.state !== 'running') await app.ctx.resume();
      setPower(true);
      initMIDI();
    } catch (e) {
      console.error(e);
      app.toast('Audio could not start: ' + e.message);
      app.ctx = null;
    }
  }
  async function restartAudio() {
    if (!app.ctx) return;
    if (app.rec) stopRec();
    try { app.node.disconnect(); await app.ctx.close(); } catch (e) { }
    app.ctx = null; app.node = null; app.ready = false;
    await power();
  }
  function setPower(on) {
    $('power').classList.toggle('on', on);
    $('power').textContent = on ? '■ ON' : '▶ POWER';
    $('splash').style.display = 'none';
  }
  var lastUi = 0;
  function onMessage(e) {
    var d = e.data;
    switch (d.t) {
      case 'ready':
        app.ready = true;
        app.post(MP.toMessage(app.state));
        app.status('engine ready · ' + d.sr + ' Hz');
        break;
      case 'state':
        app.lastReport = d;
        var now = performance.now();
        if (now - lastUi < 30) return;
        lastUi = now;
        app.ui.runtime(d);
        if (d.mods && d.mods.arp && app.state.params.arp.latch > 0.5) app.lastArp = d.mods.arp.notes;
        var load = Math.min(1, d.load || 0);
        $('loadMeter').firstChild.style.width = (load * 100).toFixed(0) + '%';
        $('loadMeter').firstChild.style.background = load > 0.7 ? 'var(--red)' : load > 0.45 ? 'var(--yellow)' : 'var(--green)';
        $('loadTxt').textContent = (load * 100).toFixed(0) + '%';
        break;
      case 'param':
        app.state.params[d.m][d.k] = d.v;
        app.ui.setParamUI(d.m, d.k, d.v);
        break;
      case 'rec': onRecChunk(d); break;
      case 'panic': app.toast('Engine reset (unstable patch was caught)'); break;
      case 'error': console.error('DSP:', d.msg); app.toast('DSP error: ' + String(d.msg).split('\n')[0]); break;
    }
  }

  // ─────────────────────────────── recording ───────────────────────────────
  var recTimer = 0;
  app.toggleRec = function () { if (app.rec) stopRec(); else startRec(); };
  function startRec() {
    if (!app.ctx || !app.ready) { app.toast('Power on first'); return; }
    app.rec = { L: [], R: [], frames: 0, t0: performance.now(), sr: app.ctx.sampleRate, stopping: false };
    app.post({ t: 'rec', on: true });
    $('rec').classList.add('on'); if (app.ui.outRec) app.ui.outRec.classList.add('on');
    recTimer = setInterval(function () {
      if (!app.rec) return;
      var s = app.rec.frames / app.rec.sr, mm = Math.floor(s / 60), ss = Math.floor(s % 60);
      var t = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
      $('recTime').textContent = t; if (app.ui.outRecT) app.ui.outRecT.textContent = t + ' · ' + (app.rec.frames * 6 / 1048576).toFixed(1) + ' MB';
      if (s > 3600) { app.toast('Recording reached 60 minutes — stopped'); stopRec(); }
    }, 250);
    app.status('recording 24-bit stereo @ ' + app.rec.sr + ' Hz');
  }
  function stopRec() {
    if (!app.rec || app.rec.stopping) return;
    app.rec.stopping = true;
    app.post({ t: 'rec', on: false });
    clearInterval(recTimer);
    $('rec').classList.remove('on'); if (app.ui.outRec) app.ui.outRec.classList.remove('on');
  }
  function onRecChunk(d) {
    if (!app.rec) return;
    if (d.l && d.l.length) { app.rec.L.push(d.l); app.rec.R.push(d.r); app.rec.frames += d.l.length; }
    if (d.final) {
      var r = app.rec; app.rec = null;
      if (!r.frames) { app.toast('Nothing recorded'); return; }
      var blob = window.encodeWav24(r.L, r.R, r.sr);
      var dur = r.frames / r.sr;
      var name = 'master-of-all_' + safeName(app.state.name) + '_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.wav';
      app.takes.unshift({ name: name, blob: blob, url: URL.createObjectURL(blob), dur: dur });
      drawTakes();
      download(blob, name);
      $('recTime').textContent = fmtDur(dur);
      if (app.ui.outRecT) app.ui.outRecT.textContent = '24-bit WAV';
      app.toast('Saved ' + fmtDur(dur) + ' · 24-bit WAV · ' + (blob.size / 1048576).toFixed(1) + ' MB');
    }
  }
  function fmtDur(s) { var m = Math.floor(s / 60), x = (s % 60).toFixed(1); return (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function drawTakes() {
    var l = $('takesList'); l.innerHTML = '';
    $('takesN').textContent = app.takes.length;
    if (!app.takes.length) { l.innerHTML = '<div class="empty">No recordings yet</div>'; return; }
    app.takes.forEach(function (t) {
      var a = document.createElement('a'); a.href = t.url; a.download = t.name;
      a.textContent = '⬇ ' + fmtDur(t.dur) + '  ' + t.name.replace('master-of-all_', '');
      l.appendChild(a);
    });
  }

  // ─────────────────────────────── MIDI ───────────────────────────────
  function initMIDI() {
    if (!navigator.requestMIDIAccess) { $('midiTxt').textContent = 'MIDI n/a'; return; }
    navigator.requestMIDIAccess({ sysex: false }).then(function (acc) {
      function bind() {
        var n = 0;
        acc.inputs.forEach(function (inp) { inp.onmidimessage = onMidi; n++; });
        $('midiTxt').textContent = 'MIDI ' + n + ' in';
      }
      bind(); acc.onstatechange = bind;
    }, function () { $('midiTxt').textContent = 'MIDI off'; });
  }
  function onMidi(e) {
    var d = e.data, st = d[0] & 0xf0;
    if (d[0] === 0xF8) return app.post({ t: 'midiClock' });
    if (d[0] === 0xFA || d[0] === 0xFB) { app.post({ t: 'midiStart' }); app.state.params.clock.run = 1; app.ui.setParamUI('clock', 'run', 1); return; }
    if (d[0] === 0xFC) { app.post({ t: 'midiStop' }); app.state.params.clock.run = 0; app.ui.setParamUI('clock', 'run', 0); return; }
    if (st === 0x90 && d[2] > 0) app.post({ t: 'noteOn', n: d[1], v: d[2] / 127 });
    else if (st === 0x80 || (st === 0x90 && d[2] === 0)) app.post({ t: 'noteOff', n: d[1] });
    else if (st === 0xB0 && d[1] === 1) app.post({ t: 'press', v: d[2] / 127 });
    else if (st === 0xB0 && (d[1] === 123 || d[1] === 120)) app.allOff();
  }

  // ─────────────────────────────── keyboard ───────────────────────────────
  var KEYS = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  var down = {};
  function typing(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  document.addEventListener('keydown', function (e) {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down[k]) { if (k === ' ' || KEYS[k] !== undefined) e.preventDefault(); return; }
    down[k] = true;
    if (KEYS[k] !== undefined) { var n = 60 + KEYS[k] + app.keyOct * 12; down[k] = n; app.noteOn(n, 0.8); e.preventDefault(); return; }
    if (k === 'z') { app.keyOct = Math.max(-3, app.keyOct - 1); app.status('keyboard octave ' + app.keyOct); }
    else if (k === 'x') { app.keyOct = Math.min(3, app.keyOct + 1); app.status('keyboard octave ' + app.keyOct); }
    else if (k >= '1' && k <= '6') { app.pad(+k - 1, true); }
    else if (k === ' ') { e.preventDefault(); var v = app.state.params.clock.run > 0.5 ? 0 : 1; app.onParam('clock', 'run', v); app.ui.setParamUI('clock', 'run', v); app.status(v ? 'run' : 'stop'); }
    else if (k === 'Enter') { e.preventDefault(); app.tap(); }
    else if (k === 'r') { randomPatch(e.shiftKey); }
    else if (k === 'Escape') { panic(); }
  });
  document.addEventListener('keyup', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var v = down[k]; delete down[k];
    if (KEYS[k] !== undefined && typeof v === 'number') app.noteOff(v);
    else if (k >= '1' && k <= '6') app.pad(+k - 1, false);
  });
  window.addEventListener('blur', function () { Object.keys(down).forEach(function (k) { if (typeof down[k] === 'number') app.noteOff(down[k]); }); down = {}; });

  function panic() { app.allOff(); app.post({ t: 'panic' }); app.status('panic: all notes off, states reset'); }

  // ─────────────────────────────── boot ───────────────────────────────
  function boot() {
    app.ui = new window.MasterUI($('rack'), app);
    var u = lsGet(LS_USER, []);
    app.user = Array.isArray(u) ? u.filter(function (x) { return x && x.format; }) : [];
    buildSelect();
    var sess = lsGet(LS_SESSION, null), st = null;
    if (sess) { try { st = MP.deserialize(sess); } catch (e) { st = null; } }
    if (st) loadState(st, sess.current, sess.dirty);
    else loadRef('f:0');
    // header
    $('power').onclick = power; $('splashPower').onclick = power;
    $('panic').onclick = panic;
    $('prev').onclick = function () { step(-1); };
    $('next').onclick = function () { step(1); };
    $('random').onclick = function (e) { randomPatch(e.shiftKey); e.currentTarget.blur(); };
    $('presetSel').onchange = function (e) { loadRef(e.target.value); e.target.blur(); };
    $('save').onclick = saveUser; $('del').onclick = deleteUser; $('export').onclick = exportPreset;
    $('import').onclick = function () { $('importFile').click(); };
    $('importFile').onchange = function (e) { if (e.target.files.length) importFiles(e.target.files); e.target.value = ''; };
    $('rec').onclick = app.toggleRec;
    $('takesBtn').onclick = function () { $('takesList').classList.toggle('show'); };
    document.addEventListener('click', function (e) { if (!e.target.closest('.takes')) $('takesList').classList.remove('show'); });
    var cmodes = ['', 'dim', 'hide'], cl = ['CABLES', 'CABLES · DIM', 'CABLES · OFF'];
    function setCables(i) { app.prefs.cables = i; $('cables').setAttribute('class', cmodes[i]); $('cablesBtn').textContent = cl[i]; lsSet(LS_PREFS, app.prefs); }
    $('cablesBtn').onclick = function () { setCables((app.prefs.cables + 1) % 3); };
    setCables(app.prefs.cables || 0);
    $('latency').value = app.prefs.latency || 'balanced';
    $('latency').onchange = function (e) { app.prefs.latency = e.target.value; lsSet(LS_PREFS, app.prefs); restartAudio(); e.target.blur(); };
    $('helpBtn').onclick = function () { $('help').classList.add('show'); };
    $('helpClose').onclick = function () { $('help').classList.remove('show'); };
    var tb = $('libTable');
    SPECS.forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + s.title + '</td><td>' + s.lib + '</td>';
      tb.appendChild(tr);
    });
    window.addEventListener('beforeunload', saveSession);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
