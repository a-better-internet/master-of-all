/*
 * MASTER OF ALL — rack user interface
 * Builds every module panel from MASTER_SPECS, handles knobs, buttons,
 * patch cables (drag jack → jack), the drum sequencer grid, the sequential
 * voltage source and the touch plate.
 */
(function (root) {
  'use strict';
  var SPECS = root.MASTER_SPECS, BY_ID = root.MASTER_SPEC_BY_ID, TRACKS = root.MASTER_TRACKS;
  var MP = root.MasterPatch;
  var NS = 'http://www.w3.org/2000/svg';
  var KNOB_COLORS = ['#e4572e', '#3e8ede', '#f3c63f', '#5bb98c', '#9b72cf', '#ec6fa9', '#4fc6d8', '#f2a541'];
  var MOD_COLOR = {
    clock: '#f3c63f', sqncr: '#ec6fa9', touch: '#f2a541', arp: '#9b72cf', seq: '#5bb98c', cplx: '#e4572e', fmv: '#3e8ede',
    poly: '#9b72cf', drum: '#ec6fa9', noise: '#a9a493', lfo1: '#4fc6d8', lfo2: '#3e8ede', func1: '#5bb98c', func2: '#7bd389',
    rand: '#f3c63f', slew: '#4fc6d8', util: '#a9a493', lpg: '#f2a541', fold: '#e4572e', filt: '#3e8ede', ring: '#9b72cf',
    mix: '#a9a493', bits: '#ec6fa9', delay: '#5bb98c', verb: '#4fc6d8', out: '#f2a541'
  };
  var ROW_NAMES = ['control', 'sources', 'modulation', 'processing'];
  var GATE_RX = /^(gate|trig|ping\d?|clk|rst|reset|q|mult|s16|bar|eoc|eor|t\d|any|loop|ext|sq)$/;
  var PITCH_RX = /^(pitch|voct|mpitch|trans)$/;
  var AUDIO_IN = { in: 1, in1: 1, in2: 1, in3: 1, in4: 1, a: 1, b: 1, L: 1, R: 1, inL: 1, inR: 1, fm: 1 };
  var AUDIO_OUT = { out: 1, sine: 1, mod: 1, white: 1, pink: 1, bastl: 1, crack: 1, mix: 1, kick: 1, snare: 1, hat: 1, clap: 1, tom: 1, bell: 1, wet: 1, lp: 1, bp: 1, hp: 1, L: 1, R: 1, out1: 1, out2: 1, inv: 1 };
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function jackKind(mid, name, isOut) {
    if (mid === 'seq' && name === 'cv') return 'pitch';
    if (GATE_RX.test(name)) return 'gate';
    if (PITCH_RX.test(name)) return 'pitch';
    if (isOut ? AUDIO_OUT[name] : AUDIO_IN[name]) {
      if (mid === 'util' || (mid === 'mix' && !isOut)) return 'cv';
      return 'audio';
    }
    return 'cv';
  }
  function fmt(q, v) {
    if (q.curve === 'enum') return q.options[Math.round(v)] || String(v);
    if (q.curve === 'bool') return v > 0.5 ? 'ON' : 'OFF';
    if (q.curve === 'int') return String(Math.round(v)) + (q.unit || '');
    var d = q.dec;
    if (d === undefined) d = Math.abs(v) >= 100 ? 0 : (Math.abs(v) >= 10 ? 1 : 2);
    if (q.unit === ' Hz' && v >= 1000) return (v / 1000).toFixed(2) + ' kHz';
    if (q.unit === ' ms' && v >= 1000) return (v / 1000).toFixed(2) + ' s';
    return (+v).toFixed(d) + (q.unit || '');
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
    return v;
  }
  function arcPath(cx, cy, r, a0, a1) {
    var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }

  // ─────────────────────────────── UI object ───────────────────────────────

  function UI(rack, app) {
    this.rack = rack; this.app = app;
    this.ctrls = {};   // 'mod.key' → control {update(v)}
    this.jacks = {};   // 'mod.jack' → element
    this.mods = {};
    this.sqMode = 'hit'; this.sqPage = 0; this.sqTrack = 0; this.sqClip = null;
    this.colorIdx = 0;
    this.build();
  }

  UI.prototype.build = function () {
    var self = this, rows = [];
    for (var r = 0; r < 4; r++) {
      var row = el('div', 'row', this.rack);
      el('div', 'row-label', row, ROW_NAMES[r]);
      rows.push(row);
    }
    SPECS.forEach(function (s) { self.buildModule(s, rows[s.row]); });
    this.svg = svg('svg', { id: 'cables' }, this.rack);
    this.cableLayer = svg('g', {}, this.svg);
    this.tempLayer = svg('g', {}, this.svg);
    var redraw = function () { self.redrawCables(); };
    if (root.ResizeObserver) new ResizeObserver(redraw).observe(this.rack);
    root.addEventListener('resize', redraw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  };

  UI.prototype.buildModule = function (s, row) {
    var m = el('div', 'mod', row);
    m.style.setProperty('--w', s.w);
    m.dataset.id = s.id;
    var head = el('div', 'mod-head', m);
    var t = el('span', 'title', head, s.title);
    t.style.color = MOD_COLOR[s.id] || '#fff';
    el('span', 'lib', head, s.lib).title = 'Bastl library origin: ' + s.lib;
    var body = el('div', 'mod-body', m);
    this.mods[s.id] = { el: m, body: body };
    var custom = this['build_' + (s.custom || '')];
    if (custom) custom.call(this, s, body);
    else this.buildKnobs(s, body, s.params);
    this.buildJacks(s, m);
  };

  UI.prototype.buildKnobs = function (s, parent, list, cls) {
    var wrap = el('div', 'knobs' + (cls ? ' ' + cls : ''), parent), self = this;
    list.forEach(function (q) { self.control(s, q, wrap); });
    return wrap;
  };

  UI.prototype.control = function (s, q, parent, opts) {
    if (q.curve === 'enum' || q.curve === 'bool') return this.pill(s, q, parent, opts);
    return this.knob(s, q, parent, opts);
  };

  UI.prototype.knob = function (s, q, parent, opts) {
    opts = opts || {};
    var self = this, key = s.id + '.' + q.k;
    var k = el('div', 'knob' + (q.small || opts.small ? ' small' : ''), parent);
    k.dataset.key = key;
    var color = opts.color || KNOB_COLORS[(this.colorIdx++) % KNOB_COLORS.length];
    var sv = svg('svg', { viewBox: '0 0 40 40' }, k);
    var A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    svg('path', { class: 'track', d: arcPath(20, 20, 16, A0, A1) }, sv);
    var arc = svg('path', { class: 'arc', stroke: color }, sv);
    svg('circle', { class: 'cap', cx: 20, cy: 20, r: 11.5, fill: color }, sv);
    svg('circle', { cx: 20, cy: 20, r: 8.5, fill: '#00000030' }, sv);
    var ptr = svg('line', { class: 'ptr', x1: 20, y1: 20, x2: 20, y2: 10 }, sv);
    el('label', '', k, opts.label || q.label);
    var val = el('span', 'val', k);
    var cur = q.def;
    var bip = q.min < 0 && q.max > 0;
    function draw(v) {
      cur = v;
      var n = Math.max(0, Math.min(1, toNorm(q, v)));
      var a = A0 + (A1 - A0) * n;
      var from = bip ? A0 + (A1 - A0) * toNorm(q, 0) : A0;
      arc.setAttribute('d', Math.abs(a - from) < 0.01 ? '' : (a > from ? arcPath(20, 20, 16, from, a) : arcPath(20, 20, 16, a, from)));
      ptr.setAttribute('x2', (20 + 9.5 * Math.cos(a)).toFixed(2));
      ptr.setAttribute('y2', (20 + 9.5 * Math.sin(a)).toFixed(2));
      val.textContent = fmt(q, v);
    }
    draw(q.def);
    var startY = 0, startN = 0, moved = false;
    k.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      k.setPointerCapture(e.pointerId);
      startY = e.clientY; startN = toNorm(q, cur); moved = false;
      k.classList.add('drag');
      self.app.status(s.title + ' · ' + q.label + ' = ' + fmt(q, cur));
    });
    k.addEventListener('pointermove', function (e) {
      if (!k.hasPointerCapture(e.pointerId)) return;
      var range = e.shiftKey ? 900 : 180;
      var n = startN + (startY - e.clientY) / range;
      var v = fromNorm(q, n);
      if (v !== cur) { moved = true; draw(v); self.app.onParam(s.id, q.k, v); self.app.status(s.title + ' · ' + q.label + ' = ' + fmt(q, v)); }
    });
    var end = function (e) { if (k.hasPointerCapture(e.pointerId)) k.releasePointerCapture(e.pointerId); k.classList.remove('drag'); };
    k.addEventListener('pointerup', end);
    k.addEventListener('pointercancel', end);
    k.addEventListener('dblclick', function () { draw(q.def); self.app.onParam(s.id, q.k, q.def); });
    k.addEventListener('wheel', function (e) {
      e.preventDefault();
      var step = (q.curve === 'int') ? 1 / (q.max - q.min) : (e.shiftKey ? 0.002 : 0.01);
      var v = fromNorm(q, toNorm(q, cur) + (e.deltaY < 0 ? step : -step));
      draw(v); self.app.onParam(s.id, q.k, v); self.app.status(s.title + ' · ' + q.label + ' = ' + fmt(q, v));
    }, { passive: false });
    k.title = q.label + ' — drag up/down (Shift = fine), wheel, double-click resets';
    this.ctrls[key] = { update: draw, el: k };
    return k;
  };

  UI.prototype.pill = function (s, q, parent, opts) {
    opts = opts || {};
    var self = this, key = s.id + '.' + q.k;
    var p = el('div', 'pill', parent);
    var b = el('button', '', p);
    el('label', '', p, opts.label || q.label);
    var cur = q.def;
    function draw(v) {
      cur = Math.round(v);
      b.textContent = q.curve === 'bool' ? (cur ? 'ON' : 'OFF') : q.options[cur];
      b.classList.toggle('on', q.curve === 'bool' ? !!cur : false);
    }
    draw(q.def);
    b.addEventListener('click', function (e) {
      var n = q.max - q.min + 1;
      var v = q.curve === 'bool' ? (cur ? 0 : 1) : ((cur - q.min + (e.shiftKey ? n - 1 : 1)) % n) + q.min;
      draw(v); self.app.onParam(s.id, q.k, v); self.app.status(s.title + ' · ' + q.label + ' = ' + fmt(q, v));
    });
    b.addEventListener('contextmenu', function (e) {
      if (q.curve !== 'enum') return;
      e.preventDefault();
      var n = q.max - q.min + 1, v = ((cur - q.min + n - 1) % n) + q.min;
      draw(v); self.app.onParam(s.id, q.k, v);
    });
    this.ctrls[key] = { update: draw, el: p };
    return p;
  };

  UI.prototype.param = function (s, k) { return s.params.filter(function (q) { return q.k === k; })[0]; };

  UI.prototype.buildJacks = function (s, m) {
    var self = this, j = el('div', 'jacks', m);
    (s.ins || []).forEach(function (n) { self.jack(s, n, false, j); });
    (s.outs || []).forEach(function (n) { self.jack(s, n, true, j); });
  };

  UI.prototype.jack = function (s, name, isOut, parent) {
    var self = this, id = s.id + '.' + name;
    var kind = jackKind(s.id, name, isOut);
    var j = el('div', 'jack ' + (isOut ? 'out ' : 'in ') + 'k-' + kind, parent);
    el('div', 'hole', j);
    el('div', 'jl', j, name);
    j.dataset.jack = id; j.dataset.dir = isOut ? 'out' : 'in'; j.dataset.kind = kind;
    if (!isOut && s.normals[name]) { j.classList.add('normal'); j.title = 'normalled from ' + s.normals[name].toUpperCase(); }
    else j.title = (isOut ? 'output ' : 'input ') + id.toUpperCase();
    this.jacks[id] = j;
    j.addEventListener('pointerdown', function (e) { self.startPatch(e, j); });
    return j;
  };

  // ─────────────────────────────── cables ───────────────────────────────

  UI.prototype.center = function (j) {
    var r = j.querySelector('.hole').getBoundingClientRect(), R = this.rack.getBoundingClientRect();
    return { x: r.left + r.width / 2 - R.left, y: r.top + r.height / 2 - R.top };
  };
  UI.prototype.cablePath = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    var sag = Math.min(160, 24 + dist * 0.28);
    return 'M' + a.x + ' ' + a.y + ' C' + a.x + ' ' + (a.y + sag) + ' ' + b.x + ' ' + (b.y + sag) + ' ' + b.x + ' ' + b.y;
  };
  UI.prototype.cableColor = function (from, i) {
    var kind = this.jacks[from] ? this.jacks[from].dataset.kind : 'cv';
    var base = { audio: [36, 88, 60], cv: [188, 62, 56], gate: [330, 75, 66], pitch: [130, 50, 62] }[kind];
    var h = base[0] + ((i * 23) % 40) - 20;
    return 'hsl(' + h + ',' + base[1] + '%,' + base[2] + '%)';
  };
  UI.prototype.redrawCables = function () {
    var self = this, st = this.app.state;
    if (!st) return;
    this.svg.setAttribute('width', this.rack.scrollWidth);
    this.svg.setAttribute('height', this.rack.scrollHeight);
    while (this.cableLayer.firstChild) this.cableLayer.removeChild(this.cableLayer.firstChild);
    Object.keys(this.jacks).forEach(function (k) { self.jacks[k].classList.remove('patched'); });
    st.cables.forEach(function (c, i) {
      var ja = self.jacks[c[0]], jb = self.jacks[c[1]];
      if (!ja || !jb) return;
      ja.classList.add('patched'); jb.classList.add('patched');
      var a = self.center(ja), b = self.center(jb), d = self.cablePath(a, b), col = self.cableColor(c[0], i);
      svg('path', { class: 'sh', d: d, 'stroke-width': 7 }, self.cableLayer);
      var p = svg('path', { class: 'c', d: d, stroke: col, 'stroke-width': 4.5 }, self.cableLayer);
      p.addEventListener('click', function () { self.app.removeCable(c[1]); });
      var title = svg('title', {}, p); title.textContent = c[0].toUpperCase() + ' → ' + c[1].toUpperCase() + ' (click to remove)';
      svg('circle', { class: 'plug', cx: a.x, cy: a.y, r: 6, fill: col }, self.cableLayer);
      svg('circle', { class: 'plug', cx: b.x, cy: b.y, r: 6, fill: col }, self.cableLayer);
    });
  };
  UI.prototype.startPatch = function (e, j) {
    if (e.button !== 0) return;
    e.preventDefault();
    var self = this, st = this.app.state, id = j.dataset.jack, isOut = j.dataset.dir === 'out';
    var origin = j, originId = id, existing = null;
    if (!isOut) {
      existing = st.cables.filter(function (c) { return c[1] === id; })[0];
      if (existing) { // pull the cable out of this input and carry it
        origin = this.jacks[existing[0]]; originId = existing[0];
      }
    }
    var a = this.center(origin), moved = false, startX = e.clientX, startY = e.clientY, over = null;
    var col = this.cableColor(originId, st.cables.length);
    var temp = svg('path', { class: 'temp', stroke: col }, this.tempLayer);
    var R = this.rack.getBoundingClientRect();
    if (existing) { self.app.removeCable(id, true); }
    var wrap = this.rack.parentNode, lastEv = e, raf = 0;
    function edgeScroll() {
      var W = wrap.getBoundingClientRect(), dx = 0, dy = 0, m = 48;
      if (lastEv.clientY > W.bottom - m) dy = Math.min(24, (lastEv.clientY - (W.bottom - m)) / 2);
      else if (lastEv.clientY < W.top + m) dy = -Math.min(24, ((W.top + m) - lastEv.clientY) / 2);
      if (lastEv.clientX > W.right - m) dx = Math.min(24, (lastEv.clientX - (W.right - m)) / 2);
      else if (lastEv.clientX < W.left + m) dx = -Math.min(24, ((W.left + m) - lastEv.clientX) / 2);
      if (dx || dy) { wrap.scrollTop += dy; wrap.scrollLeft += dx; move(lastEv); }
      raf = requestAnimationFrame(edgeScroll);
    }
    raf = requestAnimationFrame(edgeScroll);
    function move(ev) {
      lastEv = ev;
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
      R = self.rack.getBoundingClientRect();
      var b = { x: ev.clientX - R.left, y: ev.clientY - R.top };
      temp.setAttribute('d', self.cablePath(a, b));
      var t = document.elementFromPoint(ev.clientX, ev.clientY);
      var tj = t && t.closest ? t.closest('.jack') : null;
      if (over && over !== tj) over.classList.remove('dropok');
      over = null;
      if (tj && tj !== origin && tj.dataset.dir !== origin.dataset.dir) { tj.classList.add('dropok'); over = tj; }
    }
    function up(ev) {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (temp.parentNode) temp.parentNode.removeChild(temp);
      if (over) over.classList.remove('dropok');
      if (over) {
        var from = origin.dataset.dir === 'out' ? originId : over.dataset.jack;
        var to = origin.dataset.dir === 'out' ? over.dataset.jack : originId;
        self.app.addCable(from, to);
      } else if (existing && !moved) {
        self.app.status('removed ' + existing[0].toUpperCase() + ' → ' + existing[1].toUpperCase());
      } else if (!moved && isOut) {
        self.app.status(id.toUpperCase() + ': drag to an input to patch');
      }
      self.app.commitCables();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    move(e);
  };

  // ─────────────────────────────── custom panels ───────────────────────────────

  UI.prototype.build_clock = function (s, body) {
    var self = this, top = el('div', 'clock-top', body);
    var tap = el('button', 'tap', top, 'TAP');
    tap.title = 'Tap tempo (Enter key). 4-tap moving average, resets when you change tempo.';
    tap.addEventListener('pointerdown', function (e) { e.preventDefault(); self.app.tap(); });
    var info = el('div', '', top);
    this.clockLed = el('span', 'led', info);
    this.bpmRead = el('span', 'readout', info, ' 112.0');
    this.buildKnobs(s, body, s.params);
  };

  UI.prototype.build_sqncr = function (s, body) {
    var self = this, P = function (k) { return self.param(s, k); };
    var bar = el('div', 'sq-bar', body);
    el('span', 'lbl', bar, 'pattern');
    this.patBtns = [];
    for (var i = 0; i < 8; i++) (function (i) {
      var b = el('button', 'mini', bar, String(i + 1));
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        var st = self.app.state;
        if (st.params.sqncr.mom > 0.5) self.momPrev = st.params.sqncr.pattern;
        self.app.onParam('sqncr', 'pattern', i); self.setParamUI('sqncr', 'pattern', i);
      });
      b.addEventListener('pointerup', function () {
        if (self.momPrev !== undefined && self.momPrev !== null) {
          var pv = self.momPrev; self.momPrev = null;
          self.app.onParam('sqncr', 'pattern', pv); self.setParamUI('sqncr', 'pattern', pv);
        }
      });
      self.patBtns.push(b);
    })(i);
    var mom = el('button', 'mini', bar, 'MOM');
    mom.title = 'Momentary pattern: hold a pattern button to jump, release to return';
    this.ctrls['sqncr.mom'] = { update: function (v) { mom.classList.toggle('on', v > 0.5); } };
    mom.addEventListener('click', function () { var v = self.app.state.params.sqncr.mom > 0.5 ? 0 : 1; self.app.onParam('sqncr', 'mom', v); self.setParamUI('sqncr', 'mom', v); });
    var copy = el('button', 'mini', bar, 'COPY'), paste = el('button', 'mini', bar, 'PASTE');
    copy.addEventListener('click', function () { self.sqClip = self.app.sqCopy(); self.app.status('pattern copied'); });
    paste.addEventListener('click', function () { if (self.sqClip) { self.app.sqPaste(self.sqClip); self.app.status('pattern pasted'); } });
    el('span', 'lbl', bar, 'page');
    this.pageBtns = [];
    for (i = 0; i < 4; i++) (function (i) {
      var b = el('button', 'mini', bar, (i * 16 + 1) + '–' + (i * 16 + 16));
      b.addEventListener('click', function () { self.sqPage = i; self.drawSq(); });
      self.pageBtns.push(b);
    })(i);

    var bar2 = el('div', 'sq-bar', body);
    el('span', 'lbl', bar2, 'edit');
    var modes = [['hit', 'HIT'], ['accent', 'ACC'], ['soft', 'SOFT'], ['ratchet', 'RATCH'], ['late', 'SHIFT'], ['mute', 'MUTE'], ['skip', 'SKIP']];
    this.modeBtns = {};
    modes.forEach(function (md) {
      var b = el('button', 'mini mode', bar2, md[1]);
      b.title = {
        hit: 'Toggle a hit', accent: 'Accent (UP velocity)', soft: 'Soft (DOWN velocity)', ratchet: 'Cycle 64th ratchets ×2/×3/×4',
        late: 'Cycle micro-timing: late 32nd, drag 64th, flam', mute: 'Mute step (keeps its notes)', skip: 'Skip step (inactive → pattern shortens)'
      }[md[0]];
      b.addEventListener('click', function () { self.sqMode = md[0]; self.drawSqModes(); });
      self.modeBtns[md[0]] = b;
    });
    var rec = el('button', 'mini rec', bar2, 'REC');
    rec.title = 'Live record: tap the pads (or keys 1–6) while the clock runs';
    this.ctrls['sqncr.rec'] = { update: function (v) { rec.classList.toggle('on', v > 0.5); } };
    rec.addEventListener('click', function () { var v = self.app.state.params.sqncr.rec > 0.5 ? 0 : 1; self.app.onParam('sqncr', 'rec', v); self.setParamUI('sqncr', 'rec', v); });
    var q = el('button', 'mini', bar2, '1/64');
    q.title = 'Record quantization';
    this.ctrls['sqncr.quant'] = { update: function (v) { q.textContent = 'Q ' + P('quant').options[Math.round(v)]; } };
    q.addEventListener('click', function () { var v = (Math.round(self.app.state.params.sqncr.quant) + 1) % 4; self.app.onParam('sqncr', 'quant', v); self.setParamUI('sqncr', 'quant', v); });
    var loop = el('button', 'mini', bar2, 'LOOP');
    loop.title = 'Hold to repeat the current step (Player::startLoop)';
    this.ctrls['sqncr.loop'] = { update: function (v) { loop.classList.toggle('on', v > 0.5); } };
    loop.addEventListener('pointerdown', function (e) { e.preventDefault(); self.app.onParam('sqncr', 'loop', 1); self.setParamUI('sqncr', 'loop', 1); });
    var lu = function () { if (self.app.state.params.sqncr.loop > 0.5) { self.app.onParam('sqncr', 'loop', 0); self.setParamUI('sqncr', 'loop', 0); } };
    loop.addEventListener('pointerup', lu); loop.addEventListener('pointerleave', lu);
    var clr = el('button', 'mini', bar2, 'CLR TRK'), clra = el('button', 'mini', bar2, 'CLR ALL');
    clr.addEventListener('click', function () { self.app.sqClear(self.sqTrack); });
    clra.addEventListener('click', function () { self.app.sqClear(-1); });
    var tl = el('div', '', bar2); tl.style.marginLeft = 'auto';
    this.knob(s, P('tlen'), tl, { small: true });

    var grid = el('div', 'sq-grid', body);
    this.sqCells = []; this.sqNames = []; this.sqLens = [];
    for (var tr = 0; tr < 6; tr++) (function (tr) {
      var nm = el('div', 'sq-name', grid);
      el('span', '', nm, TRACKS[tr]);
      var tg = el('span', 'tg', nm, 'T');
      tg.title = 'Click: TRIGGER ↔ GATE event type';
      tg.addEventListener('click', function (e) { e.stopPropagation(); self.app.sqGate(tr); });
      nm.addEventListener('click', function () { self.sqTrack = tr; self.drawSq(); });
      self.sqNames.push({ el: nm, tg: tg });
      var cells = [];
      for (var c = 0; c < 16; c++) (function (c) {
        var cell = el('div', 'cell' + (c % 4 === 0 ? ' beat' : ''), grid);
        for (var b = 0; b < 4; b++) el('i', '', cell);
        cell.addEventListener('click', function () { self.app.sqCell(tr, self.sqPage * 16 + c, self.sqMode); });
        cells.push(cell);
      })(c);
      self.sqCells.push(cells);
      var ln = el('div', 'sq-len', grid, '16');
      ln.title = TRACKS[tr] + ' length (drag / wheel)';
      self.lenDrag(ln, s, 'l' + (tr + 1));
      self.sqLens.push(ln);
      var pad = el('button', 'padb', grid, String(tr + 1));
      pad.title = 'Play ' + TRACKS[tr] + ' (key ' + (tr + 1) + '); records when REC is on';
      pad.addEventListener('pointerdown', function (e) { e.preventDefault(); self.app.pad(tr, true); pad.classList.add('hit'); });
      var pu = function () { self.app.pad(tr, false); pad.classList.remove('hit'); };
      pad.addEventListener('pointerup', pu); pad.addEventListener('pointerleave', function () { if (pad.classList.contains('hit')) pu(); });
    })(tr);
    this.drawSqModes();
  };

  UI.prototype.lenDrag = function (ln, s, k) {
    var self = this, q = this.param(s, k), y0 = 0, v0 = 0;
    ln.addEventListener('pointerdown', function (e) { e.preventDefault(); ln.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = self.app.state.params.sqncr[k]; });
    ln.addEventListener('pointermove', function (e) {
      if (!ln.hasPointerCapture(e.pointerId)) return;
      var v = Math.max(1, Math.min(64, Math.round(v0 + (y0 - e.clientY) / 6)));
      if (v !== self.app.state.params.sqncr[k]) { self.app.onParam('sqncr', k, v); self.setParamUI('sqncr', k, v); }
    });
    ln.addEventListener('wheel', function (e) {
      e.preventDefault();
      var v = Math.max(1, Math.min(64, self.app.state.params.sqncr[k] + (e.deltaY < 0 ? 1 : -1)));
      self.app.onParam('sqncr', k, v); self.setParamUI('sqncr', k, v);
    }, { passive: false });
    this.ctrls['sqncr.' + k] = { update: function (v) { ln.textContent = String(Math.round(v)); self.drawSq(); } };
  };

  UI.prototype.drawSqModes = function () {
    for (var k in this.modeBtns) this.modeBtns[k].classList.toggle('on', k === this.sqMode);
  };

  UI.prototype.drawSq = function () {
    var st = this.app.state;
    if (!st || !this.sqCells) return;
    var pt = Math.round(st.params.sqncr.pattern), sq = st.sq;
    if (this.runPat !== undefined) pt = this.runPat;
    for (var i = 0; i < 8; i++) this.patBtns[i].classList.toggle('on', i === Math.round(st.params.sqncr.pattern));
    for (i = 0; i < 4; i++) this.pageBtns[i].classList.toggle('on', i === this.sqPage);
    for (var tr = 0; tr < 6; tr++) {
      var len = Math.round(st.params.sqncr['l' + (tr + 1)]);
      this.sqNames[tr].el.classList.toggle('sel', tr === this.sqTrack);
      this.sqNames[tr].tg.textContent = sq.gate[tr] ? 'G' : 'T';
      this.sqNames[tr].tg.classList.toggle('g', !!sq.gate[tr]);
      for (var c = 0; c < 16; c++) {
        var stp = this.sqPage * 16 + c, idx = MP.idx(pt, tr, stp), cell = this.sqCells[tr][c];
        var subs = sq.subs[idx], bars = cell.children;
        for (var b = 0; b < 4; b++) bars[b].className = 'v' + ((subs >> (b * 2)) & 3);
        cell.classList.toggle('muted', !!sq.mute[idx]);
        cell.classList.toggle('skip', !sq.act[idx]);
        cell.classList.toggle('beyond', stp >= len);
      }
    }
    this.drawPlayheads();
  };

  UI.prototype.drawPlayheads = function () {
    if (!this.sqCells) return;
    var cur = this.sqCur || [];
    for (var tr = 0; tr < 6; tr++) {
      var stp = cur[tr] === undefined ? -1 : (cur[tr] >> 2);
      for (var c = 0; c < 16; c++) this.sqCells[tr][c].classList.toggle('play', this.sqPage * 16 + c === stp && this.running);
    }
  };

  UI.prototype.build_seq = function (s, body) {
    var self = this, cols = el('div', 'seq-cols', body);
    this.seqLeds = [];
    for (var i = 0; i < 8; i++) {
      var col = el('div', 'seq-col', cols);
      this.seqLeds.push(el('span', 'led g', col));
      this.knob(s, this.param(s, 's' + (i + 1)), col, { small: true, color: '#5bb98c' });
      var gq = this.param(s, 'g' + (i + 1));
      (function (gq, i) {
        var g = el('button', 'gbtn', col);
        g.title = 'Gate on step ' + (i + 1);
        g.addEventListener('click', function () { var v = self.app.state.params.seq[gq.k] > 0.5 ? 0 : 1; self.app.onParam('seq', gq.k, v); self.setParamUI('seq', gq.k, v); });
        self.ctrls['seq.' + gq.k] = { update: function (v) { g.classList.toggle('on', v > 0.5); } };
      })(gq, i);
    }
    var rest = s.params.filter(function (q) { return !/^[sg]\d$/.test(q.k); });
    this.buildKnobs(s, body, rest, 'tight');
  };

  UI.prototype.build_touch = function (s, body) {
    var self = this, pads = el('div', 'pads', body);
    this.tpads = [];
    for (var i = 0; i < 13; i++) (function (i) {
      var sharp = [1, 3, 6, 8, 10].indexOf(i % 12) >= 0;
      var p = el('div', 'tpad' + (sharp ? ' sharp' : ''), pads, NOTE_NAMES[i % 12] + (i === 12 ? '' : ''));
      var note = function () { return 60 + i + self.app.keyOct * 12; };
      var active = null;
      var pres = function (e) { var r = p.getBoundingClientRect(); return Math.max(0.15, Math.min(1, (e.clientY - r.top) / r.height)); };
      p.addEventListener('pointerdown', function (e) {
        e.preventDefault(); p.setPointerCapture(e.pointerId);
        active = note(); var pr = pres(e);
        self.app.noteOn(active, 0.4 + 0.6 * pr, true);
        self.app.press(pr, i / 12);
        p.classList.add('on');
      });
      p.addEventListener('pointermove', function (e) { if (active !== null && p.hasPointerCapture(e.pointerId)) self.app.press(pres(e), i / 12); });
      var up = function () { if (active !== null) { self.app.noteOff(active, true); active = null; p.classList.remove('on'); } };
      p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
      self.tpads.push(p);
    })(i);
    var row = el('div', 'touch-row', body);
    this.buildKnobs(s, row, s.params);
    el('div', 'hint', row, 'Keys: A W S E D F T G Y H U J K · Z/X octave · press lower on a pad = more pressure · MIDI in supported');
  };

  UI.prototype.build_arp = function (s, body) {
    var self = this;
    this.buildKnobs(s, body, s.params, 'tight');
    this.arpNotes = el('div', 'arp-notes', body, '—');
    var b = el('button', 'mini', body, 'CLEAR NOTES');
    b.style.marginLeft = '2px';
    b.addEventListener('click', function () { self.app.arpClear(); });
  };

  UI.prototype.build_drum = function (s, body) {
    var self = this, g = el('div', 'drum-grid', body), keys = ['k', 's', 'h', 'c', 't', 'b'];
    this.drumLeds = [];
    keys.forEach(function (v, i) {
      var col = el('div', 'drum-col', g);
      var h = el('h4', '', col, TRACKS[i]);
      self.drumLeds.push(el('span', 'led r', h));
      ['t', 'd', 'l'].forEach(function (x) { self.knob(s, self.param(s, v + x), col, { small: true }); });
    });
    var gl = el('div', 'drum-glob', body);
    ['snap', 'morph', 'drive'].forEach(function (k) { self.knob(s, self.param(s, k), gl); });
  };

  UI.prototype.build_lpg = function (s, body) {
    var self = this;
    this.vacs = [];
    [1, 2].forEach(function (n) {
      var row = el('div', 'lpg-ch', body);
      var cn = el('div', 'chn', row, String(n));
      var vac = el('div', 'vac', cn); var vi = el('i', '', vac);
      self.vacs.push(vi);
      ['o', 'a', 'm', 'r', 'v'].forEach(function (x) { self.control(s, self.param(s, x + n), row); });
    });
  };

  UI.prototype.build_out = function (s, body) {
    var self = this, w = el('div', 'out-wrap', body);
    this.knob(s, s.params[0], w);
    var ms = el('div', 'meters', w);
    function meter(lbl, cls) { var c = el('div', '', ms); var m = el('div', 'meter ' + (cls || ''), c); m.style.height = '72px'; var i = el('i', '', m); el('div', 'meter-l', c, lbl); return i; }
    this.mL = meter('L'); this.mR = meter('R'); this.mG = meter('GR', 'gr');
    var rb = el('div', '', w);
    rb.style.display = 'flex'; rb.style.flexDirection = 'column'; rb.style.gap = '4px';
    this.outRec = el('button', 'btn rec', rb, '● REC');
    this.outRec.addEventListener('click', function () { self.app.toggleRec(); });
    this.outRecT = el('span', 'readout', rb, '24-bit WAV');
    this.scope = el('canvas', '', body); this.scope.id = 'scope';
  };

  // ─────────────────────────────── refresh from state / runtime ───────────────────────────────

  UI.prototype.setParamUI = function (m, k, v) {
    var c = this.ctrls[m + '.' + k];
    if (c) c.update(v);
    if (m === 'sqncr' && k === 'pattern') this.drawSq();
    if (m === 'clock' && k === 'bpm' && this.bpmRead) this.bpmRead.textContent = ' ' + (+v).toFixed(1);
  };
  UI.prototype.refresh = function () {
    var st = this.app.state, self = this;
    Object.keys(st.params).forEach(function (m) {
      Object.keys(st.params[m]).forEach(function (k) { self.setParamUI(m, k, st.params[m][k]); });
    });
    this.drawSq();
    this.drawArp(st.arp);
    this.redrawCables();
  };
  UI.prototype.drawArp = function (notes, playing) {
    if (!this.arpNotes) return;
    if (!notes || !notes.length) { this.arpNotes.textContent = 'hold keys (or LATCH) to arpeggiate'; return; }
    var h = notes.map(function (n) { var s = NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); return n === playing ? '<b>' + s + '</b>' : s; });
    this.arpNotes.innerHTML = h.join(' ');
  };
  UI.prototype.runtime = function (r) {
    var M = r.mods || {}, self = this;
    if (M.clock && this.clockLed) this.clockLed.classList.toggle('on', M.clock.q > 0.5);
    this.running = this.app.state.params.clock.run > 0.5;
    if (M.sqncr) {
      this.sqCur = M.sqncr.cur;
      if (M.sqncr.edits) this.app.sqApplyEdits(M.sqncr.edits);
      this.drawPlayheads();
    }
    if (M.seq && this.seqLeds) this.seqLeds.forEach(function (l, i) { l.classList.toggle('on', i === M.seq.step); });
    if (M.arp) this.drawArp(M.arp.notes, M.arp.note);
    if (M.touch && this.tpads) {
      var held = M.touch.held || [];
      this.tpads.forEach(function (p, i) { p.classList.toggle('on', held.indexOf(60 + i + self.app.keyOct * 12) >= 0); });
    }
    if (M.lpg && this.vacs) { this.vacs[0].style.height = Math.min(100, M.lpg.v1 * 100) + '%'; this.vacs[1].style.height = Math.min(100, M.lpg.v2 * 100) + '%'; }
    if (this.mL) {
      var db = function (x) { return Math.max(0, Math.min(100, (20 * Math.log10(x + 1e-9) + 48) / 48 * 100)); };
      this.mL.style.height = db(r.pkL) + '%'; this.mR.style.height = db(r.pkR) + '%';
      this.mG.style.height = Math.min(100, -20 * Math.log10(r.gr + 1e-9) / 12 * 100) + '%';
    }
    if (r.scope && this.scope) this.drawScope(r.scope);
    if (r.active) {
      var act = {};
      r.active.forEach(function (id) { act[id] = 1; });
      Object.keys(this.mods).forEach(function (id) { self.mods[id].el.classList.toggle('idle', !act[id]); });
    }
  };
  UI.prototype.drawScope = function (data) {
    var c = this.scope, w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    var dpr = root.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#2e3446'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    // trigger on rising zero crossing for a stable picture
    var start = 0;
    for (var i = 1; i < 256; i++) if (data[i - 1] <= 0 && data[i] > 0) { start = i; break; }
    g.strokeStyle = '#f2a541'; g.lineWidth = 1.4; g.beginPath();
    for (i = 0; i < 256; i++) {
      var x = i / 255 * w, y = h / 2 - data[start + i] * h * 0.46;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  };

  root.MasterUI = UI;
  root.MasterUIUtil = { fmt: fmt, toNorm: toNorm, fromNorm: fromNorm, NOTE_NAMES: NOTE_NAMES };
})(window);
