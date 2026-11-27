/*
 * MASTER OF ALL — DSP engine (runs inside an AudioWorklet)
 *
 * The whole rack is evaluated sample-by-sample in a single AudioWorkletProcessor:
 *  - every output jack owns one slot of a shared Float64 "bus"
 *  - every input jack reads one bus slot (a cable, a normalled source or zero)
 *  - modules are processed in topological order (sources first), so most
 *    patches have zero added latency; feedback loops get a 1-sample delay
 *  - only modules that can reach the OUTPUT (plus a few cheap control modules
 *    that drive the UI) are computed, which keeps the CPU budget low
 *
 * Algorithms ported/adapted from the Bastl Instruments library (CC BY-SA 3.0,
 * Vaclav Pelousek, Martin Baar et al.) and Nigel Redmon's EarLevel ADSR.
 *
 * This function is stringified and loaded as a Blob module, so it must be
 * self-contained. It expects `MASTER_SPECS` to exist in the global scope.
 */
function MASTER_DSP() {
  'use strict';

  var SPECS = globalThis.MASTER_SPECS;
  var SR = sampleRate;
  var ISR = 1 / SR;
  var PI = Math.PI;
  var TAU = 2 * Math.PI;
  var DN = 1e-24; // anti-denormal bias

  // ─────────────────────────────── helpers ───────────────────────────────

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  function tanh3(x) { // rational tanh approximation, exact ±1 beyond ±3
    if (x > 3) return 1;
    if (x < -3) return -1;
    var x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  function blep(t, dt) { // PolyBLEP residual
    if (dt <= 0) return 0;
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }

  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function ms(x) { return x * 0.001 * SR; }
  function tc(seconds) { return 1 - Math.exp(-1 / Math.max(1, seconds * SR)); } // one-pole coef

  var rngState = 0x2545F491;
  function rnd() { // xorshift32 → [0,1)
    var x = rngState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    rngState = x;
    return (x >>> 0) / 4294967296;
  }
  function brnd() { return rnd() * 2 - 1; }

  // bastlRandom::byte() — 16-bit xorshift exactly as in random.cpp
  var bastlSeed = 42;
  function bastlByte() {
    var s = bastlSeed;
    s ^= (s << 7) & 0xffff;
    s ^= s >> 11;
    s ^= (s << 2) & 0xffff;
    bastlSeed = s;
    return s >> 8;
  }
  // bastlRandom::range() — "not equally distributed", kept as in the original
  function bastlRange(min, max) {
    var n = max - min + 1;
    return ((Math.min(bastlByte(), 254) * n) >> 8) + min;
  }

  function Trig() { this.h = 0; }
  Trig.prototype.rise = function (x) {
    if (this.h) { if (x < 0.2) this.h = 0; return false; }
    if (x > 0.4) { this.h = 1; return true; }
    return false;
  };

  function Gate() { this.h = 0; this.r = 0; this.f = 0; }
  Gate.prototype.run = function (x) {
    this.r = 0; this.f = 0;
    if (this.h) { if (x < 0.2) { this.h = 0; this.f = 1; } }
    else if (x > 0.4) { this.h = 1; this.r = 1; }
  };

  // TPT / ZDF state variable filter (Cytomic)
  function SVF() { this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.a1 = 1; this.a2 = 0; this.a3 = 0; this.k = 2; this.lf = -1; this.lk = -1; }
  SVF.prototype.set = function (fc, k) {
    if (fc === this.lf && k === this.lk) return;
    this.lf = fc; this.lk = k;
    fc = clamp(fc, 5, SR * 0.47);
    var g = Math.tan(PI * fc * ISR);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  };
  SVF.prototype.run = function (v0) {
    v0 += DN;
    var v3 = v0 - this.ic2;
    var v1 = this.a1 * this.ic1 + this.a2 * v3;
    var v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2;
    return v2;
  };
  SVF.prototype.reset = function () { this.ic1 = this.ic2 = this.lp = this.bp = this.hp = 0; };

  function Biquad(c) { this.b0 = c[0]; this.b1 = c[1]; this.b2 = c[2]; this.a1 = c[3]; this.a2 = c[4]; this.z1 = 0; this.z2 = 0; }
  Biquad.prototype.run = function (x) {
    var y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2 + DN;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  };
  Biquad.prototype.reset = function () { this.z1 = this.z2 = 0; };
  function lpCoefs(fc, fs, q) {
    var w = TAU * fc / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
    return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
  }
  var DEC_C1 = lpCoefs(Math.min(0.43 * SR, 20500), 2 * SR, 0.5412);
  var DEC_C2 = lpCoefs(Math.min(0.43 * SR, 20500), 2 * SR, 1.3066);
  // 2× oversampling decimator (4th-order Butterworth at the original Nyquist)
  function Decim2() { this.f1 = new Biquad(DEC_C1); this.f2 = new Biquad(DEC_C2); }
  Decim2.prototype.run = function (a, b) {
    this.f2.run(this.f1.run(a));
    return this.f2.run(this.f1.run(b));
  };
  Decim2.prototype.reset = function () { this.f1.reset(); this.f2.reset(); };

  function DCBlock() { this.x1 = 0; this.y1 = 0; this.R = 1 - TAU * 6 / SR; }
  DCBlock.prototype.run = function (x) {
    var y = x - this.x1 + this.R * this.y1 + DN;
    this.x1 = x; this.y1 = y;
    return y;
  };
  DCBlock.prototype.reset = function () { this.x1 = this.y1 = 0; };

  // EarLevel exponential ADSR with Bastl's HOLD and LOOP extensions (expADSR.cpp)
  function ADSR() {
    this.state = 0; this.out = 0; this.hold = false; this.holdVal = 0; this.holdCnt = 0; this.loop = false;
    this.tA = 0.3; this.tDR = 0.0001; this.aR = 1; this.dR = 1; this.rR = 1; this.sus = 1; this.ev = 0;
    this.calc();
  }
  ADSR.prototype.coef = function (rate, r) { if (rate < 1) rate = 1; return Math.exp(-Math.log((1 + r) / r) / rate); };
  ADSR.prototype.calc = function () {
    this.aC = this.coef(this.aR, this.tA); this.aB = (1 + this.tA) * (1 - this.aC);
    this.dC = this.coef(this.dR, this.tDR); this.dB = (this.sus - this.tDR) * (1 - this.dC);
    this.rC = this.coef(this.rR, this.tDR); this.rB = -this.tDR * (1 - this.rC);
  };
  ADSR.prototype.set = function (aS, dS, sus, rS, tA, tDR) {
    this.aR = aS; this.dR = dS; this.sus = sus; this.rR = rS;
    this.tA = Math.max(tA, 1e-9); this.tDR = Math.max(tDR, 1e-9);
    this.calc();
  };
  ADSR.prototype.gate = function (on) {
    if (on) this.state = 1;
    else if (this.state !== 0) this.state = 4;
  };
  ADSR.prototype.process = function () {
    switch (this.state) {
      case 5: // hold
        this.holdCnt++;
        if (this.holdCnt >= this.holdVal) { this.holdCnt = 0; this.state = this.loop ? 4 : 2; }
        this.out = 1;
        break;
      case 0: // idle
        if (this.loop) this.state = 1;
        break;
      case 1: // attack
        this.out = this.aB + this.out * this.aC;
        if (this.out >= 1) {
          this.out = 1; this.ev |= 1;
          if (this.hold) { this.state = 5; this.holdCnt = 0; }
          else if (this.loop) this.state = 4;
          else this.state = 2;
        }
        break;
      case 2: // decay
        this.out = this.dB + this.out * this.dC;
        if (this.out <= this.sus) { this.out = this.sus; this.state = 3; }
        break;
      case 3: break; // sustain
      case 4: // release
        this.out = this.rB + this.out * this.rC;
        if (this.out <= 0) { this.out = 0; this.ev |= 2; this.state = this.loop ? 1 : 0; }
        break;
    }
    return this.out;
  };
  ADSR.prototype.reset = function () { this.state = 0; this.out = 0; this.ev = 0; };

  // ─────────────────────────────── module base ───────────────────────────────

  function Mod(spec, eng) {
    this.id = spec.id; this.spec = spec; this.eng = eng; this.b = eng.bus;
    var ps = spec.params || [];
    this.np = ps.length;
    this.p = new Float64Array(this.np);
    this.pt = new Float64Array(this.np);
    var sm = [];
    this.I = {};
    for (var i = 0; i < ps.length; i++) {
      this.I[ps[i].k] = i;
      this.p[i] = this.pt[i] = ps[i].def;
      if (ps[i].smooth) sm.push(i);
    }
    this.smIdx = Int32Array.from(sm);
    this.moving = 0;
    this.dirty = 1;
    this.smC = tc(0.012);
    var ins = spec.ins || [];
    this.J = {};
    this.ii = new Int32Array(ins.length);
    this.pat = new Uint8Array(ins.length);
    for (i = 0; i < ins.length; i++) this.J[ins[i]] = i;
    this.O = {};
    var outs = spec.outs || [];
    for (i = 0; i < outs.length; i++) this.O[outs[i]] = eng.allocSlot(this.id + '.' + outs[i], this);
  }
  Mod.prototype.set = function (k, v, immediate) {
    var i = this.I[k];
    if (i === undefined) return;
    v = +v;
    if (!isFinite(v)) return;
    var q = this.spec.params[i];
    v = clamp(v, q.min, q.max);
    if (q.curve === 'int' || q.curve === 'enum' || q.curve === 'bool') v = Math.round(v);
    this.pt[i] = v;
    if (immediate || !q.smooth) this.p[i] = v;
    else this.moving = 1;
    this.dirty = 1;
    this.onSet(k, v);
  };
  Mod.prototype.onSet = function () { };
  Mod.prototype.smooth = function () {
    var p = this.p, pt = this.pt, ix = this.smIdx, c = this.smC, mv = 0;
    for (var j = 0; j < ix.length; j++) {
      var i = ix[j], d = pt[i] - p[i];
      if (d !== 0) {
        if (Math.abs(d) < 1e-6 * (1e-3 + Math.abs(pt[i]))) p[i] = pt[i];
        else { p[i] += d * c; mv = 1; }
      }
    }
    this.moving = mv;
    this.dirty = 1;
  };
  Mod.prototype.inp = function (name) { return this.b[this.ii[this.J[name]]]; };
  Mod.prototype.reset = function () { };
  Mod.prototype.tick = function () { };
  Mod.prototype.report = function () { return null; };

  function inherit(C) { C.prototype = Object.create(Mod.prototype); C.prototype.constructor = C; return C; }

  // ─────────────────────────────── CLOCK ───────────────────────────────
  // BastlMetronome (16 bastl steps per beat), Tapper (4-tap moving average with
  // relative-deviation reset), MIDIStepper (external clock drives the steps and
  // the metronome stops after the next step until the next pulse arrives).

  var Clock = inherit(function Clock(s, e) {
    Mod.call(this, s, e);
    this.pos = 0; this.last = -1; this.mlast = -1;
    this.tm = new Float64Array(5); // q, mult, s16, bar, rst pulse timers
    this.ext = new Trig(); this.rst = new Trig();
    this.since = 1e9; this.extInc = 0; this.extMode = 0; this.extPending = 0; this.midiCount = 0; this.midiSeen = 1e12;
    this.wasRun = 0; this.fr = 0;
    // Tapper
    this.hist = new Float64Array(4); this.hHead = 0; this.hFill = 0; this.lastTap = 0; this.firstTap = true;
    this.beat = 0;
  });
  Clock.prototype.tap = function () {
    var t = this.fr, diff = t - this.lastTap, maxLen = SR * 2.5;
    if (this.hFill > 0) {
      var last = this.hist[this.hHead], avg = this.tapAvg();
      var dev = Math.abs(diff - last) / (avg / 64);
      if (dev < 20) this.tapAdd(diff);
      else { this.hFill = 0; this.tapReset(); }
    } else {
      if (!this.firstTap && diff < maxLen) this.tapAdd(diff);
      else { this.firstTap = false; this.tapReset(); }
    }
    this.lastTap = t;
    if (this.hFill > 0) {
      var bpm = clamp(60 * SR / this.tapAvg(), 20, 300);
      this.set('bpm', bpm, true);
      this.eng.post({ t: 'param', m: 'clock', k: 'bpm', v: bpm });
    }
  };
  Clock.prototype.tapAdd = function (v) {
    this.hHead = (this.hHead + 1) & 3; this.hist[this.hHead] = v;
    if (this.hFill < 4) this.hFill++;
  };
  Clock.prototype.tapAvg = function () {
    var s = 0, pos = this.hHead;
    for (var i = 0; i < this.hFill; i++) { s += this.hist[pos]; pos = (pos + 3) & 3; }
    return s / this.hFill;
  };
  Clock.prototype.tapReset = function () { // resetCallback: start a new beat right now
    this.pos = Math.ceil(this.pos / 4 - 1e-9) * 4;
    this.last = this.pos - 1;
    this.mlast = -1 + Math.floor(this.pos * [1, 2, 4, 8][this.p[this.I.mult] | 0] / 4 - 1e-9);
  };
  Clock.prototype.midiClock = function () {
    this.midiSeen = 0;
    if (this.midiCount++ % 6 === 0) this.extPending = 1;
  };
  Clock.prototype.midiStart = function () { this.midiCount = 0; this.doReset(); this.set('run', 1); };
  Clock.prototype.doReset = function () {
    this.pos = 0; this.last = -1; this.mlast = -1; this.tm[4] = ms(3);
  };
  Clock.prototype.reset = function () { this.tm.fill(0); };
  Clock.prototype.tick = function () {
    var b = this.b, p = this.p, I = this.I, O = this.O, ii = this.ii, J = this.J, tm = this.tm;
    this.fr++; this.since++; this.midiSeen++;
    var extEdge = (this.pat[J.ext] && this.ext.rise(b[ii[J.ext]])) || this.extPending === 1;
    this.extPending = 0;
    var external = this.pat[J.ext] || this.midiSeen < SR;
    if (this.pat[J.rst] && this.rst.rise(b[ii[J.rst]])) this.doReset();
    var run = p[I.run] > 0.5;
    if (!run) {
      this.wasRun = 0; this.pos = 0; this.last = -1; this.mlast = -1;
    } else {
      if (!this.wasRun) { this.wasRun = 1; this.doReset(); }
      var inc;
      if (external) {
        if (extEdge) {
          if (this.since > 16 && this.since < SR * 4) this.extInc = 1 / this.since;
          this.since = 0;
          this.pos = this.last + 1;
          inc = 0;
        } else inc = this.extInc;
      } else inc = p[I.bpm] / 15 * ISR; // 16ths per sample
      this.pos += inc;
      if (external && this.pos > this.last + 1 - 1e-7) this.pos = this.last + 1 - 1e-7; // wait for next pulse
      var per16 = inc > 0 ? 1 / inc : SR * 0.125;
      var w = p[I.width], minP = ms(1.5);
      var sw = p[I.swing] / 110;
      var n = this.last + 1;
      if (this.pos >= n + ((n & 1) ? sw : 0) || (external && extEdge)) {
        this.last = n;
        tm[2] = Math.max(minP, w * per16);
        if ((n & 3) === 0) { tm[0] = Math.max(minP, w * per16 * 4); this.beat ^= 1; }
        if ((n & 15) === 0) tm[3] = Math.max(minP, w * per16 * 16);
      }
      var m = [1, 2, 4, 8][p[I.mult] | 0];
      var mpos = this.pos * m / 4;
      if (mpos >= this.mlast + 1) {
        this.mlast = Math.floor(mpos);
        tm[1] = Math.max(minP, w * per16 * 4 / m);
      }
    }
    b[O.q] = tm[0] > 0 ? 1 : 0; b[O.mult] = tm[1] > 0 ? 1 : 0; b[O.s16] = tm[2] > 0 ? 1 : 0;
    b[O.bar] = tm[3] > 0 ? 1 : 0; b[O.rst] = tm[4] > 0 ? 1 : 0;
    for (var i = 0; i < 5; i++) if (tm[i] > 0) tm[i]--;
  };
  Clock.prototype.report = function () { return { q: this.b[this.O.q], step: this.last }; };

  // ─────────────────────────────── SQNCR ───────────────────────────────
  // 6 instruments × 8 patterns × 64 steps × 4 substeps. Per step: substep
  // velocities (OFF/NORMAL/ACCENT/SOFT), mute flag, active flag (inactive steps
  // are skipped, as getNextActiveDrumStep). Per instrument: TRIGGER or GATE
  // event type, independent length (polymeter). LOOP repeats the current step
  // (Player::startLoop). Live recording with record quantization (StepRecorder).

  var VELS = [0, 0.8, 1.0, 0.45];
  var Sqncr = inherit(function Sqncr(s, e) {
    Mod.call(this, s, e);
    this.subs = new Uint8Array(8 * 6 * 64);
    this.mute = new Uint8Array(8 * 6 * 64);
    this.act = new Uint8Array(8 * 6 * 64).fill(1);
    this.gmode = new Uint8Array(6);
    this.cur = new Int32Array(6);
    this.loopStep = new Int32Array(6);
    this.playing = new Uint8Array(6);
    this.vel = new Float64Array(6);
    this.pulse = new Float64Array(6);
    this.gap = new Int32Array(6);
    this.held = new Uint8Array(6);
    this.clk = new Trig(); this.rst = new Trig();
    this.since = 0; this.interval = SR / 8; this.subLeft = 0; this.subTimer = 0;
    this.stopped = 1; this.g = 0; this.inLoop = 0; this.curPat = 0;
    this.edits = []; this.sinceSub = 0;
    this.tOut = [this.O.t1, this.O.t2, this.O.t3, this.O.t4, this.O.t5, this.O.t6];
  });
  Sqncr.prototype.idx = function (pt, tr, st) { return (pt * 6 + tr) * 64 + st; };
  Sqncr.prototype.len = function (tr) { return this.p[this.I.l1 + tr] | 0; };
  Sqncr.prototype.onSet = function (k, v) {
    if (k.length === 2 && k[0] === 'l') { // changeActivesForCurrentStep → StepSynchronizer
      var tr = (+k[1]) - 1, len = v | 0;
      if (tr >= 0 && tr < 6 && (this.cur[tr] >> 2) >= len) this.cur[tr] = ((((this.g >> 2) % len) + len) % len) * 4 + (this.cur[tr] & 3);
    }
  };
  Sqncr.prototype.load = function (d) {
    if (d.subs) this.subs.set(d.subs.subarray ? d.subs : Uint8Array.from(d.subs));
    if (d.mute) this.mute.set(d.mute.subarray ? d.mute : Uint8Array.from(d.mute));
    if (d.act) this.act.set(d.act.subarray ? d.act : Uint8Array.from(d.act));
    if (d.gate) for (var i = 0; i < 6; i++) this.gmode[i] = d.gate[i] ? 1 : 0;
  };
  Sqncr.prototype.edit = function (m) {
    var i = this.idx(m.p, m.tr, m.st);
    if (m.subs !== undefined) this.subs[i] = m.subs;
    if (m.mute !== undefined) this.mute[i] = m.mute;
    if (m.act !== undefined) this.act[i] = m.act;
  };
  Sqncr.prototype.reset = function () {
    this.cur.fill(0); this.stopped = 1; this.subLeft = 0; this.g = 0;
    this.playing.fill(0); this.pulse.fill(0); this.gap.fill(0);
  };
  Sqncr.prototype.fire = function (tr, v) {
    var vel = VELS[v];
    if (this.gmode[tr]) {
      if (!this.playing[tr]) this.gap[tr] = 0;
      this.playing[tr] = 1; this.vel[tr] = vel;
    } else {
      if (this.pulse[tr] > 0) this.gap[tr] = 2; // guarantee a low edge between hits
      var tl = ms(1 + (this.p[this.I.tlen] | 0) * 2);
      this.pulse[tr] = Math.max(8, Math.min(tl, this.interval / 4 * 0.5));
      this.vel[tr] = vel;
    }
  };
  Sqncr.prototype.off = function (tr) { this.playing[tr] = 0; };
  Sqncr.prototype.findActive = function (tr, s, len) {
    var pt = this.curPat;
    for (var k = 0; k < len; k++) {
      var c = (s + k) % len;
      if (this.act[this.idx(pt, tr, c)]) return c;
    }
    return -1;
  };
  Sqncr.prototype.stepFourth = function () { // Player::stepDrumInstruments
    var pt = this.curPat;
    for (var tr = 0; tr < 6; tr++) {
      var len = this.len(tr);
      var next = this.stopped ? this.cur[tr] : ((this.cur[tr] + 1) & 255);
      var st = next >> 2, exists = true;
      if (st >= len) { next = 0; st = 0; }
      if ((next & 3) !== 0) {
        // inside a step: play its substep
      } else if (this.inLoop) {
        st = this.loopStep[tr] % len; next = st * 4;
      } else {
        var f = this.findActive(tr, st, len);
        if (f < 0) exists = false; else { st = f; next = st * 4; }
      }
      var i = this.idx(pt, tr, st);
      var v = exists ? (this.subs[i] >> ((next & 3) * 2)) & 3 : 0;
      if (exists && !this.mute[i] && v) this.fire(tr, v);
      else this.off(tr);
      if (exists) this.cur[tr] = next;
      // gate-mode live recording: keep writing while the pad is held
      if (this.held[tr] && this.p[this.I.rec] > 0.5 && this.gmode[tr]) this.record(tr, false);
    }
    this.stopped = 0; this.sinceSub = 0;
    this.g = (this.g + 1) & 255;
  };
  Sqncr.prototype.quantSize = function () { return [1, 2, 4, 8][this.p[this.I.quant] | 0]; };
  Sqncr.prototype.record = function (tr, useFrac) { // StepRecorder::getCurrentQuantizedSubstep + recordSubsteps
    var q = this.quantSize(), len = this.len(tr);
    var subLen = this.interval / 4;
    var frac = clamp(this.sinceSub / subLen, 0, 1);
    var pos = this.cur[tr] + (useFrac ? frac : 0);
    var qp = Math.round(pos / q) * q;
    qp = ((qp % (len * 4)) + len * 4) % (len * 4);
    var st = qp >> 2, sb = qp & 3, pt = this.curPat, i = this.idx(pt, tr, st);
    if (this.mute[i]) { this.mute[i] = 0; this.subs[i] = 0; }
    var cleared = this.subs[i] & ~(3 << (sb * 2));
    this.subs[i] = cleared | (1 << (sb * 2));
    this.act[i] = 1;
    this.edits.push(pt, tr, st, this.subs[i], this.mute[i], this.act[i]);
  };
  Sqncr.prototype.pad = function (tr, on) {
    if (tr < 0 || tr > 5) return;
    if (on) {
      this.held[tr] = 1;
      this.fire(tr, 1);
      if (this.p[this.I.rec] > 0.5) this.record(tr, true);
    } else {
      this.held[tr] = 0;
      if (this.gmode[tr]) this.off(tr);
    }
  };
  Sqncr.prototype.tick = function () {
    var b = this.b, p = this.p, I = this.I, O = this.O, ii = this.ii, J = this.J;
    var pat = (p[I.pattern] | 0) + (this.pat[J.pat] ? Math.floor(clamp(b[ii[J.pat]], 0, 0.999) * 8) : 0);
    this.curPat = pat & 7;
    if (this.rst.rise(b[ii[J.rst]])) this.reset();
    var loop = p[I.loop] > 0.5 || (this.pat[J.loop] && b[ii[J.loop]] > 0.4);
    if (loop && !this.inLoop) { this.inLoop = 1; for (var t = 0; t < 6; t++) this.loopStep[t] = this.cur[t] >> 2; }
    else if (!loop) this.inLoop = 0;
    this.since++; this.sinceSub++;
    if (this.clk.rise(b[ii[J.clk]])) {
      if (this.since > 16) this.interval = Math.min(this.since, SR * 4);
      this.since = 0;
      // MIDIStepper-style re-sync: a new clock always starts a new step
      if (!this.stopped) for (var a = 0; a < 6; a++) this.cur[a] |= 3;
      this.stepFourth();
      this.subLeft = 3; this.subTimer = this.interval / 4;
    } else if (this.subLeft > 0) {
      this.subTimer -= 1;
      if (this.subTimer <= 0) { this.stepFourth(); this.subLeft--; this.subTimer += this.interval / 4; }
    }
    var any = 0;
    for (var tr = 0; tr < 6; tr++) {
      var v;
      if (this.gap[tr] > 0) { this.gap[tr]--; v = 0; }
      else if (this.gmode[tr]) v = this.playing[tr] ? this.vel[tr] : 0;
      else v = this.pulse[tr] > 0 ? this.vel[tr] : 0;
      if (this.pulse[tr] > 0 && this.gap[tr] === 0) this.pulse[tr]--;
      b[this.tOut[tr]] = v;
      if (v > any) any = v;
    }
    b[O.any] = any;
  };
  Sqncr.prototype.report = function () {
    var r = { cur: Array.from(this.cur), pat: this.curPat };
    if (this.edits.length) { r.edits = this.edits; this.edits = []; }
    return r;
  };

  // ─────────────────────────────── TOUCH PLATE ───────────────────────────────
  // Shared note buffer with last-note priority (MIDInoteBuffer::addNoteToBuffer)

  var Touch = inherit(function Touch(s, e) {
    Mod.call(this, s, e);
    this.notes = []; this.vels = [];
    this.pitch = 0; this.target = 0; this.press = 0; this.pressT = 0; this.velo = 0; this.pos = 0;
  });
  Touch.prototype.noteOn = function (n, v) {
    this.noteOff(n);
    this.notes.unshift(n); this.vels.unshift(v);
    if (this.notes.length > 64) { this.notes.pop(); this.vels.pop(); }
    this.velo = v; this.pressT = v; this.pos = ((n % 12) + 12) % 12 / 12;
  };
  Touch.prototype.noteOff = function (n) {
    var i = this.notes.indexOf(n);
    if (i >= 0) { this.notes.splice(i, 1); this.vels.splice(i, 1); }
    if (!this.notes.length) this.pressT = 0;
  };
  Touch.prototype.allOff = function () { this.notes.length = 0; this.vels.length = 0; this.pressT = 0; };
  Touch.prototype.tick = function () {
    var b = this.b, O = this.O, p = this.p, I = this.I;
    if (this.notes.length) this.target = (this.notes[0] + 12 * p[I.oct] - 60) / 12;
    var gl = p[I.glide];
    if (gl > 0.0005) this.pitch += (this.target - this.pitch) * tc(gl * 1.2);
    else this.pitch = this.target;
    this.press += (this.pressT - this.press) * 0.002;
    b[O.pitch] = this.pitch;
    b[O.gate] = this.notes.length ? 1 : 0;
    b[O.press] = this.press;
    b[O.vel] = this.velo;
    b[O.pos] = this.pos;
  };
  Touch.prototype.report = function () { return { n: this.notes[0] === undefined ? -1 : this.notes[0], held: this.notes.slice(0, 16) }; };

  // ─────────────────────────────── ARP ───────────────────────────────
  // Arpeggiator.cpp: notes kept in insertion order; UP/DOWN/UP_DOWN walk that
  // order, SORTED walks ascending pitch, RANDOM picks within the window of the
  // last `windowSize` added notes.

  var Arp = inherit(function Arp(s, e) {
    Mod.call(this, s, e);
    this.notes = []; this.held = 0; this.started = false; this.idx = 0; this.up = true; this.octv = 0;
    this.clk = new Trig(); this.rst = new Trig(); this.since = SR; this.interval = SR / 4;
    this.gateT = 0; this.trigT = 0; this.note = 60; this.pitch = 0;
  });
  Arp.prototype.noteOn = function (n) {
    var latch = this.p[this.I.latch] > 0.5;
    if (latch && this.held === 0) { this.notes.length = 0; this.started = false; }
    this.held++;
    if (this.notes.indexOf(n) < 0 && this.notes.length < 20) this.notes.push(n);
  };
  Arp.prototype.noteOff = function (n) {
    this.held = Math.max(0, this.held - 1);
    if (this.p[this.I.latch] > 0.5) return;
    var i = this.notes.indexOf(n);
    if (i >= 0) { this.notes.splice(i, 1); if (this.idx >= this.notes.length) this.idx = 0; }
  };
  Arp.prototype.onSet = function (k, v) {
    if (k === 'latch' && v < 0.5 && this.held === 0) { this.notes.length = 0; }
    if (k === 'algo') this.up = true;
  };
  Arp.prototype.clear = function () { this.notes.length = 0; this.started = false; this.held = 0; };
  Arp.prototype.setNotes = function (list) { this.notes = list.slice(0, 20); this.started = false; this.held = 0; };
  Arp.prototype.next = function () {
    var n = this.notes.length;
    if (!n) return -1;
    var win = Math.min(n, this.p[this.I.win] | 0), lo = n - win, algo = this.p[this.I.algo] | 0;
    var maxOct = this.p[this.I.oct] | 0, wrapped = false;
    var list = this.notes;
    if (algo === 3) list = this.notes.slice(lo).sort(function (a, b) { return a - b; }), lo = 0, n = list.length;
    if (!this.started) {
      this.started = true; this.octv = 0; this.up = true;
      this.idx = (algo === 1) ? n - 1 : lo;
    } else {
      if (this.idx < lo || this.idx >= n) this.idx = lo;
      switch (algo) {
        case 0: case 3: this.idx++; if (this.idx >= n) { this.idx = lo; wrapped = true; } break;
        case 1: this.idx--; if (this.idx < lo) { this.idx = n - 1; wrapped = true; } break;
        case 2:
          if (n - lo < 2) { wrapped = true; break; }
          if (this.up) { if (this.idx + 1 >= n) { this.up = false; this.idx--; } else this.idx++; }
          else { if (this.idx - 1 < lo) { this.up = true; this.idx++; wrapped = true; } else this.idx--; }
          break;
        case 4: this.idx = bastlRange(lo, n - 1); if (bastlByte() < 64) wrapped = true; break;
      }
      if (wrapped) this.octv = (this.octv + 1) % maxOct;
    }
    return list[clamp(this.idx, 0, n - 1)] + 12 * this.octv;
  };
  Arp.prototype.reset = function () { this.started = false; this.gateT = 0; this.trigT = 0; };
  Arp.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    this.since++;
    if (this.rst.rise(b[ii[J.rst]])) this.started = false;
    if (this.clk.rise(b[ii[J.clk]])) {
      if (this.since > 16) this.interval = Math.min(this.since, SR * 4);
      this.since = 0;
      var n = this.next();
      if (n >= 0) {
        this.note = n;
        this.gateT = Math.max(ms(2), this.interval * p[I.gate] - 2);
        this.trigT = ms(2);
        this.eng.arpNote(n, this.gateT);
      }
    }
    var tr = this.pat[J.trans] ? b[ii[J.trans]] : 0;
    b[O.pitch] = (this.note - 60) / 12 + tr;
    b[O.gate] = this.gateT > 0 ? 1 : 0;
    b[O.trig] = this.trigT > 0 ? 1 : 0;
    if (this.gateT > 0) this.gateT--;
    if (this.trigT > 0) this.trigT--;
  };
  Arp.prototype.report = function () { return { notes: this.notes.slice(), note: this.gateT > 0 ? this.note : -1 }; };

  // ─────────────────────────────── SEQUENTIAL VOLTAGE SOURCE ───────────────────────────────

  var SCALES = [
    null,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 2, 4, 5, 7, 9, 11],
    [0, 2, 3, 5, 7, 8, 10],
    [0, 2, 3, 5, 7, 9, 10],
    [0, 1, 4, 5, 7, 8, 10], // phrygian dominant
    [0, 3, 5, 7, 10],       // minor pentatonic (Andean)
    [0, 2, 4, 6, 8, 10]
  ];
  function quantize(semis, scale) {
    if (!scale) return semis;
    var oct = Math.floor(semis / 12), r = semis - oct * 12, best = scale[0], bd = 99;
    for (var i = 0; i < scale.length; i++) { var d = Math.abs(r - scale[i]); if (d < bd) { bd = d; best = scale[i]; } }
    if (Math.abs(r - 12) < bd) best = 12;
    return oct * 12 + best;
  }

  var Seq = inherit(function Seq(s, e) {
    Mod.call(this, s, e);
    this.step = 0; this.cnt = 0; this.dirUp = true; this.clk = new Trig(); this.rst = new Trig();
    this.since = SR; this.interval = SR / 4; this.gateT = 0; this.trigT = 0; this.eocT = 0; this.cv = 0; this.pend = false;
  });
  Seq.prototype.reset = function () { this.step = 0; this.cnt = 0; this.gateT = 0; this.trigT = 0; this.pend = true; };
  Seq.prototype.fireStep = function () {
    var p = this.p, I = this.I;
    if (p[I.g1 + this.step] > 0.5) { this.gateT = Math.max(ms(2), this.interval * 0.5); this.trigT = ms(2); }
  };
  Seq.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var steps = p[I.steps] | 0;
    this.since++;
    if (this.rst.rise(b[ii[J.rst]])) { this.step = 0; this.cnt = 0; this.pend = true; this.dirUp = true; }
    if (this.pat[J.addr]) { // voltage addressed (Buchla 245 style)
      var a = clamp(Math.floor(clamp(b[ii[J.addr]], 0, 0.9999) * steps), 0, steps - 1);
      if (a !== this.step) { this.step = a; this.fireStep(); }
      if (this.clk.rise(b[ii[J.clk]])) { this.interval = Math.min(Math.max(16, this.since), SR * 4); this.since = 0; this.fireStep(); }
    } else if (this.clk.rise(b[ii[J.clk]])) {
      if (this.since > 16) this.interval = Math.min(this.since, SR * 4);
      this.since = 0;
      if (++this.cnt >= (p[I.div] | 0)) {
        this.cnt = 0;
        if (this.pend) { this.pend = false; this.step = 0; }
        else {
          var dir = p[I.dir] | 0, prev = this.step;
          if (dir === 0) this.step = (this.step + 1) % steps;
          else if (dir === 1) this.step = (this.step - 1 + steps) % steps;
          else if (dir === 2) {
            if (this.dirUp) { if (this.step + 1 >= steps) { this.dirUp = false; this.step = Math.max(0, this.step - 1); } else this.step++; }
            else { if (this.step - 1 < 0) { this.dirUp = true; this.step = Math.min(steps - 1, 1); } else this.step--; }
          } else this.step = bastlRange(0, steps - 1);
          if ((dir === 0 && this.step === 0) || (dir === 1 && this.step === steps - 1) || (dir === 2 && this.step === 0 && prev !== 0)) this.eocT = ms(3);
        }
        if (this.step >= steps) this.step = 0;
        this.fireStep();
      }
    }
    if (this.step >= steps) this.step = steps - 1;
    var raw = p[I.s1 + this.step];
    var semis = raw * p[I.range] * 12;
    var qs = SCALES[p[I.quant] | 0];
    var target = (qs ? quantize(Math.round(semis * 1000) / 1000, qs) : semis) / 12 + (this.pat[J.trans] ? b[ii[J.trans]] : 0);
    var sl = p[I.slew];
    if (sl > 0.0005) this.cv += (target - this.cv) * tc(sl * 0.4); else this.cv = target;
    b[O.cv] = this.cv; b[O.raw] = raw;
    b[O.gate] = this.gateT > 0 ? 1 : 0; b[O.trig] = this.trigT > 0 ? 1 : 0; b[O.eoc] = this.eocT > 0 ? 1 : 0;
    if (this.gateT > 0) this.gateT--; if (this.trigT > 0) this.trigT--; if (this.eocT > 0) this.eocT--;
  };
  Seq.prototype.report = function () { return { step: this.step }; };

  // ─────────────────────────────── COMPLEX OSC ───────────────────────────────
  // Modulation oscillator (sine→tri→saw→square, PolyBLEP) cross-modulating a
  // principal oscillator (linear through-zero FM + AM) followed by a 2×
  // oversampled sine wavefolder with symmetry (Buchla 259 "timbre").

  function modWave(ph, dt, shape) {
    var s;
    var x = shape * 3, seg = Math.min(2, Math.floor(x)), f = x - seg;
    var sine = Math.sin(TAU * ph);
    var tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    var saw = 2 * ph - 1 - blep(ph, dt);
    var sq = (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt);
    if (seg === 0) s = sine + (tri - sine) * f;
    else if (seg === 1) s = tri + (saw - tri) * f;
    else s = saw + (sq - saw) * f;
    return s;
  }
  function foldSin(x, g, sym) { return Math.sin(PI * 0.5 * g * (x + sym)); }

  var Cplx = inherit(function Cplx(s, e) {
    Mod.call(this, s, e);
    this.mph = 0; this.pph = 0; this.dec = new Decim2(); this.dc = new DCBlock();
  });
  Cplx.prototype.reset = function () { this.dec.reset(); this.dc.reset(); };
  Cplx.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var pitch = b[ii[J.pitch]];
    var fP = p[I.pfreq] * Math.pow(2, pitch + p[I.fine] / 12);
    var fM = p[I.mfreq] * Math.pow(2, b[ii[J.mpitch]] + (p[I.mtrack] > 0.5 ? pitch : 0));
    fP = clamp(fP, 0.01, SR * 0.45); fM = clamp(fM, 0.001, SR * 0.45);
    var mdt = fM * ISR;
    var m = modWave(this.mph, mdt, p[I.mshape]);
    this.mph += mdt; if (this.mph >= 1) this.mph -= 1;
    var fmI = p[I.fm]; fmI = fmI * 6;
    var ext = b[ii[J.fm]] * p[I.fmx] * 4;
    var inc = fP * (1 + fmI * m + ext) * ISR * 0.5;
    inc = clamp(inc, -0.24, 0.24);
    var t = clamp(p[I.timbre] + b[ii[J.timb]] * p[I.tAmt], 0, 1);
    var sym = clamp(p[I.sym] + b[ii[J.sym]], -1, 1) * 0.5;
    var g = 1 + 9 * t * t;
    var wet = Math.min(1, t * 6);
    this.pph += inc; this.pph -= Math.floor(this.pph);
    var s1 = Math.sin(TAU * this.pph);
    this.pph += inc; this.pph -= Math.floor(this.pph);
    var s2 = Math.sin(TAU * this.pph);
    var y1 = s1 + (foldSin(s1, g, sym * wet) - s1) * wet;
    var y2 = s2 + (foldSin(s2, g, sym * wet) - s2) * wet;
    var y = this.dec.run(y1, y2);
    var am = p[I.am];
    var amg = 1 - am * (0.5 - 0.5 * m);
    b[O.mod] = m;
    b[O.sine] = s2 * amg * 0.85;
    b[O.out] = this.dc.run(y * amg) * 0.85;
  };

  // ─────────────────────────────── MONO FM ───────────────────────────────

  var Fmv = inherit(function Fmv(s, e) {
    Mod.call(this, s, e);
    this.cph = 0; this.mph = 0; this.m1 = 0; this.m2 = 0; this.dec = new Decim2();
  });
  Fmv.prototype.reset = function () { this.m1 = this.m2 = 0; this.dec.reset(); };
  Fmv.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var f = clamp(p[I.freq] * Math.pow(2, b[ii[J.pitch]]), 1, SR * 0.4);
    var r = p[I.ratio];
    if (p[I.snap] > 0.5) r = r < 1 ? Math.max(0.25, Math.round(r * 4) / 4) : Math.round(r * 2) / 2;
    var idx = clamp(p[I.index] + b[ii[J.idx]] * p[I.iAmt] * 10, 0, 16);
    var fb = p[I.fb] * 1.6;
    var ci = f * ISR * 0.5, mi = Math.min(f * r, SR * 0.45) * ISR * 0.5;
    var out2 = 0, out1 = 0, mo = 0;
    for (var k = 0; k < 2; k++) {
      this.mph += mi; this.mph -= Math.floor(this.mph);
      var m = Math.sin(TAU * this.mph + fb * 0.5 * (this.m1 + this.m2));
      this.m2 = this.m1; this.m1 = m;
      this.cph += ci; this.cph -= Math.floor(this.cph);
      var y = Math.sin(TAU * this.cph + idx * m);
      if (k === 0) out1 = y; else out2 = y;
      mo = m;
    }
    b[O.out] = this.dec.run(out1, out2) * 0.8;
    b[O.mod] = mo;
  };

  // ─────────────────────────────── POLY ───────────────────────────────
  // 4 voices allocated from the note buffer; when a voice is freed while more
  // notes are held than polyphony allows, it takes the "note to be played again"

  var POLYN = 4;
  var Poly = inherit(function Poly(s, e) {
    Mod.call(this, s, e);
    this.v = [];
    for (var i = 0; i < POLYN; i++) this.v.push({ note: -1, ph1: rnd(), ph2: rnd(), env: new ADSR(), age: 0, timer: -1, vel: 1, on: false });
    this.held = []; this.filt = new SVF(); this.age = 0; this.dc = new DCBlock();
  });
  Poly.prototype.reset = function () { this.v.forEach(function (v) { v.env.reset(); v.on = false; v.note = -1; v.timer = -1; }); this.filt.reset(); this.held.length = 0; };
  Poly.prototype.alloc = function (n, vel, timer) {
    var best = null, i, v;
    for (i = 0; i < POLYN; i++) { v = this.v[i]; if (v.note === n) { best = v; break; } }
    if (!best) for (i = 0; i < POLYN; i++) { v = this.v[i]; if (!v.on && v.env.state === 0) { best = v; break; } }
    if (!best) for (i = 0; i < POLYN; i++) { v = this.v[i]; if (!v.on && (!best || v.env.out < best.env.out)) best = v; }
    if (!best) for (i = 0; i < POLYN; i++) { v = this.v[i]; if (!best || v.age < best.age) best = v; }
    best.note = n; best.vel = vel; best.on = true; best.age = ++this.age; best.timer = timer; best.env.gate(1);
  };
  Poly.prototype.release = function (n) {
    for (var i = 0; i < POLYN; i++) {
      var v = this.v[i];
      if (v.note === n && v.on) {
        v.on = false; v.env.gate(0);
        // getNoteToBePlayedAgain: an older held note that had lost its voice
        for (var j = 0; j < this.held.length; j++) {
          var hn = this.held[j], used = false;
          for (var k = 0; k < POLYN; k++) if (this.v[k].on && this.v[k].note === hn) used = true;
          if (!used && hn !== n) { this.alloc(hn, 0.8, -1); break; }
        }
      }
    }
  };
  Poly.prototype.noteOn = function (n, vel) {
    if ((this.p[this.I.src] | 0) !== 0) return;
    var i = this.held.indexOf(n); if (i >= 0) this.held.splice(i, 1);
    this.held.unshift(n);
    this.alloc(n, vel, -1);
  };
  Poly.prototype.noteOff = function (n) {
    if ((this.p[this.I.src] | 0) !== 0) return;
    var i = this.held.indexOf(n); if (i >= 0) this.held.splice(i, 1);
    this.release(n);
  };
  Poly.prototype.arpNote = function (n, dur) {
    if ((this.p[this.I.src] | 0) !== 1) return;
    this.alloc(n, 0.85, dur);
  };
  Poly.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    if (this.dirty) {
      this.dirty = 0;
      for (var q = 0; q < POLYN; q++) this.v[q].env.set(ms(p[I.atk]), ms(p[I.dec]), p[I.sus], ms(p[I.rel]), 0.3, 0.0001);
    }
    var tr = p[I.trans] + 12 * b[ii[J.pitch]];
    var det = p[I.detune] * 0.25, w = p[I.wave], sum = 0, anyGate = 0;
    for (var i = 0; i < POLYN; i++) {
      var v = this.v[i];
      if (v.timer >= 0) { if (v.timer-- <= 0) { v.timer = -1; v.on = false; v.env.gate(0); } }
      if (v.on) anyGate = 1;
      if (v.env.state === 0 && v.env.out === 0) continue;
      var e = v.env.process();
      var f = mtof(v.note + tr);
      var dt1 = Math.min(f * Math.pow(2, det / 12) * ISR, 0.45), dt2 = Math.min(f * Math.pow(2, -det / 12) * ISR, 0.45);
      v.ph1 += dt1; if (v.ph1 >= 1) v.ph1 -= 1;
      v.ph2 += dt2; if (v.ph2 >= 1) v.ph2 -= 1;
      var sa = (2 * v.ph1 - 1 - blep(v.ph1, dt1)) + (2 * v.ph2 - 1 - blep(v.ph2, dt2));
      var pw = 0.5 - 0.35 * Math.max(0, w - 0.5) * 2;
      var sq1 = (v.ph1 < pw ? 1 : -1) + blep(v.ph1, dt1) - blep((v.ph1 + 1 - pw) % 1, dt1);
      var sq2 = (v.ph2 < pw ? 1 : -1) + blep(v.ph2, dt2) - blep((v.ph2 + 1 - pw) % 1, dt2);
      var sqs = sq1 + sq2;
      var mixw = Math.min(1, w * 2);
      sum += (sa + (sqs - sa) * mixw) * e * (0.4 + 0.6 * v.vel);
    }
    var fc = p[I.cut] * Math.pow(2, b[ii[J.cut]] * 2.5);
    this.filt.set(Math.min(fc, SR * 0.45), 2 - 1.85 * p[I.res]);
    var y = this.filt.run(sum * 0.5);
    b[O.out] = this.dc.run(tanh3(y * 0.9)) * p[I.level];
    b[O.gate] = anyGate;
  };

  // ─────────────────────────────── DRUM ───────────────────────────────
  // 6 synthesized voices: KICK, SNARE, HAT (6-square metal), CLAP (burst),
  // TOM (conga/timbal, pitch CV), BELL (clave ↔ cowbell morph)

  var HATF = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
  var Drum = inherit(function Drum(s, e) {
    Mod.call(this, s, e);
    this.tg = []; for (var i = 0; i < 6; i++) this.tg.push(new Trig());
    this.k = { ph: 0, env: 0, pe: 0, cl: 0, dcl: 0, last: 0 };
    this.s = { p1: 0, p2: 0, te: 0, ne: 0, bp: new SVF(), hp: new SVF() };
    this.h = { ph: new Float64Array(6), env: 0, bp: new SVF(), hp: 0, hx: 0 };
    this.c = { t: 1e9, env: 0, bp: new SVF(), v: 0 };
    this.t = { ph: 0, env: 0, pe: 0, dcl: 0, last: 0 };
    this.bl = { ph: 0, p1: 0, p2: 0, env: 0, env2: 0, bp: new SVF(), dcl: 0, last: 0 };
    this.vel = new Float64Array(6);
    this.dc = new DCBlock();
  });
  Drum.prototype.reset = function () {
    this.k.env = this.k.pe = this.k.cl = this.k.dcl = 0;
    this.s.te = this.s.ne = 0; this.s.bp.reset(); this.s.hp.reset();
    this.h.env = 0; this.h.bp.reset(); this.c.env = 0; this.c.t = 1e9; this.c.bp.reset();
    this.t.env = 0; this.bl.env = this.bl.env2 = 0; this.bl.bp.reset(); this.dc.reset();
  };
  Drum.prototype.trigger = function (i, v) {
    if (i === 0) { var k = this.k; k.dcl = k.last; k.ph = 0; k.env = v; k.pe = 1; k.cl = v; }
    else if (i === 1) { this.s.te = v; this.s.ne = v; }
    else if (i === 2) { this.h.env = v; }
    else if (i === 3) { this.c.t = 0; this.c.v = v; }
    else if (i === 4) { var t = this.t; t.dcl = t.last; t.ph = 0; t.env = v; t.pe = 1; }
    else { var bl = this.bl; bl.dcl = bl.last; bl.ph = 0; bl.env = v; bl.env2 = v; }
  };
  Drum.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    for (var i = 0; i < 6; i++) {
      var x = b[ii[i]];
      if (this.tg[i].rise(x)) this.trigger(i, clamp(x, 0.2, 1));
    }
    if (this.dirty) {
      this.dirty = 0;
      this.kd = Math.exp(-6.9 / (SR * (0.06 + 1.6 * p[I.kd] * p[I.kd])));
      this.kpd = Math.exp(-1 / (SR * (0.006 + 0.03 * p[I.kd])));
      this.kf = 32 * Math.pow(2, p[I.kt] * 2);
      this.sd1 = Math.exp(-6.9 / (SR * (0.03 + 0.25 * p[I.sd])));
      this.sd2 = Math.exp(-6.9 / (SR * (0.05 + 0.6 * p[I.sd] * p[I.sd])));
      this.sf = Math.pow(2, (p[I.st] - 0.5) * 1.5);
      this.s.bp.set(1800 * this.sf, 1.2); this.s.hp.set(900 * this.sf, 1.4);
      this.hd = Math.exp(-6.9 / (SR * (0.015 + 1.2 * p[I.hd] * p[I.hd])));
      this.hf = Math.pow(2, (p[I.ht] - 0.5) * 2);
      this.h.bp.set(Math.min(9500 * Math.pow(2, (p[I.ht] - 0.5)), SR * 0.42), 1.2);
      this.cdec = Math.exp(-6.9 / (SR * (0.08 + 0.9 * p[I.cd] * p[I.cd])));
      this.c.bp.set(1150 * Math.pow(2, (p[I.ct] - 0.5) * 1.5), 1.0);
      this.td = Math.exp(-6.9 / (SR * (0.06 + 1.4 * p[I.td] * p[I.td])));
      this.bd1 = Math.exp(-6.9 / (SR * (0.02 + 0.25 * p[I.bd])));
      this.bd2 = Math.exp(-6.9 / (SR * (0.04 + 1.2 * p[I.bd] * p[I.bd])));
      this.bf = Math.pow(2, (p[I.bt] - 0.5) * 2);
      this.bl.bp.set(Math.min(2600 * this.bf, SR * 0.42), 0.8);
      this.drv = 1 + p[I.drive] * 5;
    }
    // KICK
    var k = this.k;
    var kf = this.kf * (1 + 3.5 * k.pe);
    k.ph += kf * ISR; if (k.ph >= 1) k.ph -= 1;
    var ky = Math.sin(TAU * k.ph) * k.env + brnd() * k.cl * 0.35;
    k.env *= this.kd; k.pe *= this.kpd; k.cl *= 0.992;
    if (k.env < 1e-5) k.env = 0; if (k.pe < 1e-6) k.pe = 0; if (k.cl < 1e-5) k.cl = 0;
    ky = tanh3(ky * this.drv) + k.dcl; k.dcl *= 0.985; if (Math.abs(k.dcl) < 1e-6) k.dcl = 0;
    k.last = ky;
    // SNARE
    var s = this.s, sf = this.sf;
    s.p1 += 185 * sf * ISR; if (s.p1 >= 1) s.p1 -= 1;
    s.p2 += 330 * sf * ISR; if (s.p2 >= 1) s.p2 -= 1;
    var tone = (Math.sin(TAU * s.p1) + 0.6 * Math.sin(TAU * s.p2)) * s.te;
    s.bp.run(brnd()); s.hp.run(s.bp.bp + s.bp.hp * 0.6);
    var nz = s.hp.hp * s.ne * 1.6;
    var snap = p[I.snap];
    var sy = tanh3((tone * (1 - snap * 0.6) + nz * (0.4 + snap)) * this.drv * 0.8);
    s.te *= this.sd1; s.ne *= this.sd2; if (s.te < 1e-5) s.te = 0; if (s.ne < 1e-5) s.ne = 0;
    // HAT
    var h = this.h, hs = 0;
    if (h.env > 0) {
      for (var j = 0; j < 6; j++) { h.ph[j] += HATF[j] * this.hf * 1.7 * ISR; if (h.ph[j] >= 1) h.ph[j] -= 1; hs += h.ph[j] < 0.5 ? 1 : -1; }
      h.bp.run(hs * 0.18);
      var hh = h.bp.bp - h.hx; h.hx = h.bp.bp; // differentiator = gentle HP
      hs = hh * h.env * 4.5;
      h.env *= this.hd; if (h.env < 1e-5) h.env = 0;
    }
    var hy = hs;
    // CLAP
    var c = this.c, cy = 0;
    if (c.t < SR * 3) {
      var tt = c.t * ISR, burst = 0;
      if (tt < 0.03) burst = Math.exp(-((tt % 0.0095) / 0.0022));
      c.env = (tt < 0.03 ? 0 : c.env * this.cdec);
      if (tt >= 0.03 && tt - ISR < 0.03) c.env = 0.7;
      c.bp.run(brnd());
      cy = c.bp.bp * (burst + c.env) * c.v * 1.6;
      c.t++;
      if (tt > 0.03 && c.env < 1e-5) c.t = 1e9;
    }
    // TOM / CONGA
    var t = this.t;
    var tf = 70 * Math.pow(2, p[I.tt] * 3 + b[ii[J.pitch]]) * (1 + 0.45 * t.pe);
    t.ph += Math.min(tf, SR * 0.4) * ISR; if (t.ph >= 1) t.ph -= 1;
    var ty = (Math.sin(TAU * t.ph) + 0.18 * Math.sin(2 * TAU * t.ph)) * t.env;
    t.env *= this.td; t.pe *= 0.9985; if (t.env < 1e-5) t.env = 0;
    ty = tanh3(ty * 1.3) + t.dcl; t.dcl *= 0.985; if (Math.abs(t.dcl) < 1e-6) t.dcl = 0; t.last = ty;
    // BELL : clave (sine ping) ↔ cowbell (two pulse squares through BP)
    var bl = this.bl, mo = p[I.morph], by = 0;
    if (bl.env > 0 || bl.env2 > 0) {
      bl.ph += 2350 * this.bf * ISR; if (bl.ph >= 1) bl.ph -= 1;
      var clave = Math.sin(TAU * bl.ph) * bl.env;
      var d1 = 540 * this.bf * ISR, d2 = 800 * this.bf * ISR;
      bl.p1 += d1; if (bl.p1 >= 1) bl.p1 -= 1; bl.p2 += d2; if (bl.p2 >= 1) bl.p2 -= 1;
      var sqb = (bl.p1 < 0.5 ? 1 : -1) + blep(bl.p1, d1) - blep((bl.p1 + 0.5) % 1, d1) + (bl.p2 < 0.5 ? 1 : -1) + blep(bl.p2, d2) - blep((bl.p2 + 0.5) % 1, d2);
      bl.bp.run(sqb * 0.5);
      var cow = bl.bp.bp * (0.6 * bl.env + 0.4 * bl.env2) * 2.2;
      by = clave * (1 - mo) + cow * mo;
      bl.env *= this.bd1; bl.env2 *= this.bd2; if (bl.env < 1e-5) bl.env = 0; if (bl.env2 < 1e-5) bl.env2 = 0;
    }
    by += bl.dcl; bl.dcl *= 0.985; if (Math.abs(bl.dcl) < 1e-6) bl.dcl = 0; bl.last = by;
    var kl = p[I.kl], sl = p[I.sl], hl = p[I.hl], cl = p[I.cl], tl = p[I.tl], bll = p[I.bl];
    b[O.kick] = ky * kl; b[O.snare] = sy * sl; b[O.hat] = hy * hl; b[O.clap] = cy * cl; b[O.tom] = ty * tl; b[O.bell] = by * bll;
    var mix = (ky * kl + sy * sl + hy * hl + cy * cl + ty * tl + by * bll) * 0.7;
    b[O.mix] = this.dc.run(tanh3(mix) * 0.95);
  };

  // ─────────────────────────────── NOISE ───────────────────────────────

  var Noise = inherit(function Noise(s, e) {
    Mod.call(this, s, e);
    this.b0 = this.b1 = this.b2 = 0; this.ph = 0; this.bv = 0; this.cr = 0;
  });
  Noise.prototype.tick = function () {
    var b = this.b, O = this.O, p = this.p, I = this.I;
    var w = brnd();
    this.b0 = 0.99765 * this.b0 + w * 0.0990460;
    this.b1 = 0.96300 * this.b1 + w * 0.2965164;
    this.b2 = 0.57000 * this.b2 + w * 1.0526913;
    var pink = (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.22;
    this.ph += p[I.rate] * ISR;
    if (this.ph >= 1) { this.ph -= Math.floor(this.ph); this.bv = bastlByte() / 127.5 - 1; }
    if (rnd() < p[I.dens] * ISR) this.cr = brnd() > 0 ? 1 : -1;
    var cr = this.cr; this.cr *= 0.82; if (Math.abs(this.cr) < 1e-5) this.cr = 0;
    b[O.white] = w * 0.7; b[O.pink] = clamp(pink, -1, 1); b[O.bastl] = this.bv * 0.7; b[O.crack] = cr;
  };

  // ─────────────────────────────── LFO (lfoExtended) ───────────────────────────────
  // 8-bit output domain like the original: SAW/TRIANGLE, RANDOM (random slopes
  // that fold at the threshold), SMOOTH (LFORandom: one random value per period
  // smoothed through a 32-element moving buffer). Then FLOP (output zero when
  // step & flopBits), RESOLUTION (sample & hold steps per period), THRESHOLD
  // fold/overflow and XOR bits.

  function mappedBufferLen(v) {
    if (v < 5) return 31; if (v < 7) return 25; if (v < 10) return 15; if (v < 20) return 10; if (v < 30) return 5; return 0;
  }
  var Lfo = inherit(function Lfo(s, e) {
    Mod.call(this, s, e);
    this.ph = 0; this.out = 0; this.lastStep = 0; this.lastUnsk = 0; this.slope = 0; this.until = 0; this.rw = 128;
    this.buf = new Float64Array(32); this.bpos = 0; this.rst = new Trig(); this.eocT = 0;
    this.target = (bastlByte() << 8) | bastlByte(); this.buf.fill(this.target);
  });
  Lfo.prototype.bufAvg = function (sm) {
    var n = 32 - mappedBufferLen(sm), idx = this.bpos - 1, sum = 0;
    for (var c = 0; c < n; c++, idx--) { if (idx < 0) idx = 31; sum += this.buf[idx]; }
    return sum / n;
  };
  Lfo.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var rate = clamp(p[I.rate] * Math.pow(2, b[ii[J.rate]] * 2), 0.001, SR * 0.2);
    if (this.pat[J.reset] && this.rst.rise(b[ii[J.reset]])) { this.ph = 0; this.lastUnsk = 0; this.lastStep = 0; }
    this.ph += rate * ISR;
    var wrapped = false;
    if (this.ph >= 1) { this.ph -= Math.floor(this.ph); wrapped = true; this.eocT = Math.max(ms(2), 1); }
    var wave = p[I.wave] | 0, thres = p[I.thres] | 0, fold = (p[I.tmode] | 0) === 0;
    var step = Math.floor(this.ph * 256) & 255;
    var since = (step - this.lastStep) & 255;
    var o;
    var flop = p[I.flop] | 0;
    if (wave === 3 && wrapped) this.target = (bastlByte() << 8) | bastlByte();
    // random slope / smooth random evolve once per 8-bit step (as their getValue() calls)
    if (since) {
      this.lastStep = step;
      if (wave === 2) {
        this.until -= since;
        if (this.until <= 0) {
          var mx = 3;
          this.slope = bastlRange(0, 2 * mx) - mx;
          this.until = bastlRange(10, 40);
        }
        var nv = this.rw + this.slope * since;
        if (fold) { if (nv > thres || nv < 0) { this.slope = -this.slope; nv = clamp(nv, 0, thres); } }
        else nv = ((nv % 256) + 256) % 256;
        this.rw = nv;
      } else if (wave === 3) {
        var sm = p[I.smooth] | 0, reps = Math.min(since, 32);
        for (var r = 0; r < reps; r++) {
          var avg = this.bufAvg(sm);
          this.buf[this.bpos] = (avg * sm + this.target * (255 - sm)) / 255;
          this.bpos = (this.bpos + 1) & 31;
        }
      }
    }
    if (step & flop) o = 0;
    else {
      var res = p[I.res] | 0;
      var d = this.ph - this.lastUnsk; if (d < 0) d += 1;
      if (res > 0 && d < 1 / res - 2 / 65536) o = this.out;
      else {
        if (res > 0) this.lastUnsk = (this.ph - (d % (1 / res)) + 1) % 1;
        if (wave === 0) o = step;
        else if (wave === 1) o = step < 128 ? step * 2 : 510 - step * 2;
        else if (wave === 2) o = Math.round(this.rw) & 255;
        else o = Math.floor(this.bufAvg(p[I.smooth] | 0) / 256) & 255;
        if (o > thres) {
          if (!fold) o = o % thres;
          else { var sec = Math.floor(o / thres); o = (sec & 1) ? thres - (o % thres) : o % thres; }
        }
        var xb = ((p[I.xor] | 0) + (this.pat[J.xor] ? Math.floor(clamp(b[ii[J.xor]], 0, 1) * 255) : 0)) & 255;
        o = (o ^ xb) & 255;
        this.out = o;
      }
    }
    var u = o / 255;
    b[O.uni] = u; b[O.bi] = u * 2 - 1; b[O.inv] = 1 - u; b[O.sq] = this.ph < 0.5 ? 1 : 0; b[O.eoc] = this.eocT > 0 ? 1 : 0;
    if (this.eocT > 0) this.eocT--;
  };
  Lfo.prototype.report = function () { return { v: this.b[this.O.uni] }; };

  // ─────────────────────────────── FUNCTION GENERATOR (expADSR) ───────────────────────────────

  var Func = inherit(function Func(s, e) {
    Mod.call(this, s, e);
    this.env = new ADSR(); this.g = new Gate(); this.tr = new Trig(); this.auto = false; this.eorT = 0; this.eocT = 0; this.cnt = 0; this.lastTime = 0;
  });
  Func.prototype.reset = function () { this.env.reset(); this.auto = false; };
  Func.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I, env = this.env;
    var tcv = this.pat[J.time] ? b[ii[J.time]] : 0;
    if (this.dirty || (++this.cnt >= 16 && Math.abs(tcv - this.lastTime) > 1e-4)) {
      this.dirty = 0; this.cnt = 0; this.lastTime = tcv;
      var sc = Math.pow(2, -clamp(tcv, -4, 4) * 2);
      env.set(ms(p[I.atk] * sc), ms(p[I.dec] * sc), p[I.sus], ms(p[I.rel] * sc), p[I.cA], p[I.cDR]);
      env.hold = p[I.hold] > 0.5; env.holdVal = ms(p[I.hold] * sc);
      env.loop = p[I.loop] > 0.5;
    }
    this.g.run(b[ii[J.gate]]);
    if (this.g.r) { env.gate(1); this.auto = false; }
    else if (this.g.f && !this.auto) env.gate(0);
    if (this.tr.rise(b[ii[J.trig]])) { env.state = 1; this.auto = true; }
    if (this.auto && (env.state === 2 || env.state === 3)) { env.state = 4; }
    var y = env.process();
    if (env.ev & 1) this.eorT = ms(3);
    if (env.ev & 2) { this.eocT = ms(3); this.auto = false; }
    env.ev = 0;
    b[O.env] = y; b[O.inv] = 1 - y; b[O.eor] = this.eorT > 0 ? 1 : 0; b[O.eoc] = this.eocT > 0 ? 1 : 0;
    if (this.eorT > 0) this.eorT--; if (this.eocT > 0) this.eocT--;
  };
  Func.prototype.report = function () { return { v: this.env.out }; };

  // ─────────────────────────────── UNCERTAINTY (interpolatingBuffer) ───────────────────────────────

  var Rand = inherit(function Rand(s, e) {
    Mod.call(this, s, e);
    this.buf = new Float64Array(32); for (var i = 0; i < 32; i++) this.buf[i] = bastlByte();
    this.clk = new Trig(); this.since = SR; this.period = SR / 2;
    this.from = 128; this.to = 128; this.n = 0; this.nTot = 1;
    this.sbuf = new Float64Array(32); this.ssum = 0; this.spos = 0; this.scnt = 0;
    this.gateT = 0; this.fph = 0; this.f0 = rnd(); this.f1 = rnd();
  });
  Rand.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    this.since++;
    if (this.clk.rise(b[ii[J.clk]])) {
      this.sfill = -1;
      if (this.since > 16) this.period = Math.min(this.since, SR * 8);
      this.since = 0;
      var len = p[I.len] | 0, buf = this.buf;
      var tmp = buf[len - 1];
      for (var i = len - 1; i > 0; i--) buf[i] = buf[i - 1];
      buf[0] = tmp; // rotateBuffer (loop)
      var chg = clamp(p[I.chg] + (this.pat[J.chg] ? b[ii[J.chg]] : 0), 0, 1);
      if (rnd() < chg) { // addRandomStep: random walk from the previous value
        var wv = Math.round(p[I.walk] * 127);
        buf[0] = clamp(buf[1] + (Math.floor(rnd() * (2 * wv + 1)) - wv), 0, 255);
      }
      this.from = this.cur === undefined ? buf[0] : this.cur;
      this.to = buf[0];
      this.nTot = Math.max(1, p[I.interp] * this.period);
      this.n = 0;
      if (rnd() < p[I.gprob]) this.gateT = Math.max(ms(2), this.period * 0.5);
    }
    var stepped = this.to;
    var cur = stepped;
    if (p[I.interp] > 0.001 && this.n < this.nTot) { this.n++; var f = this.n / this.nTot; cur = this.from + (this.to - this.from) * f; }
    this.cur = cur;
    var sm = p[I.smooth];
    var sOut = cur;
    if (sm > 0.001) {
      var skip = Math.max(1, Math.floor(sm * this.period / 16));
      if (++this.scnt >= skip) {
        this.scnt = 0;
        this.ssum -= this.sbuf[this.spos]; this.sbuf[this.spos] = cur; this.ssum += cur; this.spos = (this.spos + 1) & 31;
      }
      sOut = this.ssum / 32;
    } else if (this.sfill !== cur) { this.sfill = cur; this.sbuf.fill(cur); this.ssum = cur * 32; }
    // FLUX: cosine-interpolated smooth random
    this.fph += p[I.flux] * ISR;
    if (this.fph >= 1) { this.fph -= 1; this.f0 = this.f1; this.f1 = rnd(); }
    var fx = this.f0 + (this.f1 - this.f0) * (0.5 - 0.5 * Math.cos(PI * this.fph));
    b[O.step] = stepped / 255; b[O.smooth] = sOut / 255; b[O.gate] = this.gateT > 0 ? 1 : 0; b[O.flux] = fx;
    if (this.gateT > 0) this.gateT--;
  };

  // ─────────────────────────────── SLEW / follower (MovingAverageLinear) ───────────────────────────────

  var Slew = inherit(function Slew(s, e) {
    Mod.call(this, s, e);
    this.y = 0; this.env = 0; this.ma = new Float64Array(32); this.maFill = 0; this.cnt = 0; this.avg = 0;
  });
  Slew.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var x = b[ii[J.in]], mode = p[I.mode] | 0;
    var rise = p[I.rise] * 0.001, fall = p[I.fall] * 0.001;
    if (mode === 0) this.y += (x - this.y) * tc(x > this.y ? rise : fall);
    else if (mode === 1) {
      var mx = ISR / (x > this.y ? rise : fall) * 2;
      var d = x - this.y; this.y += d > mx ? mx : (d < -mx ? -mx : d);
    } else {
      // linearly weighted moving average of 32 decimated values (weights 255 - i*linearDecrease)
      var kdec = Math.max(1, Math.floor(rise * SR / 32));
      if (++this.cnt >= kdec) {
        this.cnt = 0;
        for (var i = 31; i >= 1; i--) this.ma[i] = this.ma[i - 1];
        this.ma[0] = x; if (this.maFill < 32) this.maFill++;
        var lin = Math.floor(255 / 32), tv = 0, tw = 0;
        for (i = 0; i < this.maFill; i++) { var wgt = 255 - i * lin; tv += this.ma[i] * wgt; tw += wgt; }
        this.avg = tv / tw;
      }
      this.y += (this.avg - this.y) * tc(fall * 0.05 + 0.0005);
    }
    var ax = Math.abs(x);
    this.env += (ax - this.env) * tc(ax > this.env ? rise * 0.3 + 0.0002 : fall);
    b[O.out] = this.y; b[O.env] = Math.min(this.env * 1.4, 2);
  };

  // ─────────────────────────────── ATTENUVERTER ───────────────────────────────

  var Util = inherit(function Util(s, e) { Mod.call(this, s, e); });
  Util.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var a = b[ii[J.in1]] * p[I.a1] + p[I.o1];
    var c = b[ii[J.in2]] * p[I.a2] + p[I.o2];
    b[O.out1] = a; b[O.out2] = c; b[O.sum] = a + c;
  };

  // ─────────────────────────────── DUAL LOW PASS GATE ───────────────────────────────
  // Vactrol model: fast rise, slow level-dependent fall. PING input strikes the
  // vactrol for the classic "bongo" response.

  function LpgCh() { this.v = 0; this.ping = 0; this.f = new SVF(); this.tg = new Trig(); this.dc = new DCBlock(); }
  var Lpg = inherit(function Lpg(s, e) {
    Mod.call(this, s, e);
    this.ch = [new LpgCh(), new LpgCh()];
    this.rise = tc(0.0015); this.pingC = Math.exp(-1 / (0.004 * SR));
  });
  Lpg.prototype.reset = function () { this.ch.forEach(function (c) { c.v = 0; c.ping = 0; c.f.reset(); c.dc.reset(); }); };
  Lpg.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, p = this.p, I = this.I;
    for (var k = 0; k < 2; k++) {
      var c = this.ch[k], base = k * 3, pb = k * 5;
      var x = b[ii[base]], cv = b[ii[base + 1]], pg = b[ii[base + 2]];
      if (c.tg.rise(pg)) c.ping = clamp(pg, 0.3, 1) * 1.35;
      var ctrl = clamp(p[pb] + cv * p[pb + 1], 0, 1) + c.ping;
      c.ping *= this.pingC; if (c.ping < 1e-4) c.ping = 0;
      ctrl = Math.min(ctrl, 1.15);
      var vac = p[pb + 4];
      if (ctrl > c.v) c.v += (ctrl - c.v) * this.rise;
      else {
        var tau = (0.025 + vac * 0.7) * (1 + 3 * (1 - Math.min(c.v, 1)));
        c.v += (ctrl - c.v) * (ISR / tau);
      }
      if (c.v < 1e-6) c.v = 0;
      var v = Math.min(c.v, 1.1), mode = p[pb + 2] | 0, y;
      if (mode === 0) y = x * v * v;
      else {
        var fc = 18 * Math.pow(2, v * 10.1);
        c.f.set(fc, 2 - 1.7 * p[pb + 3]);
        var lp = c.f.run(x);
        y = mode === 1 ? lp * Math.min(1, v * 1.6) * Math.min(1, v * 1.25) : lp;
      }
      b[k === 0 ? O.out1 : O.out2] = y;
    }
  };
  Lpg.prototype.report = function () { return { v1: this.ch[0].v, v2: this.ch[1].v }; };

  // ─────────────────────────────── WAVEFOLDER ───────────────────────────────

  var Fold = inherit(function Fold(s, e) {
    Mod.call(this, s, e); this.x1 = 0; this.dec = new Decim2(); this.dc = new DCBlock();
  });
  Fold.prototype.reset = function () { this.dec.reset(); this.dc.reset(); };
  Fold.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var x = b[ii[J.in]];
    var gk = clamp(p[I.gain] + b[ii[J.cv]] * p[I.amt], 0, 1);
    var g = 1 + 11 * gk * gk, sym = p[I.sym] * 0.5;
    var xm = (this.x1 + x) * 0.5; this.x1 = x;
    var y = this.dec.run(Math.sin(PI * 0.5 * g * (clamp(xm, -2, 2) + sym)), Math.sin(PI * 0.5 * g * (clamp(x, -2, 2) + sym)));
    y = this.dc.run(y);
    var mx = p[I.mix];
    b[O.out] = x * (1 - mx) + y * mx * 0.9;
  };

  // ─────────────────────────────── FILTER ───────────────────────────────

  var Filt = inherit(function Filt(s, e) { Mod.call(this, s, e); this.f = new SVF(); });
  Filt.prototype.reset = function () { this.f.reset(); };
  Filt.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var x = b[ii[J.in]], dr = p[I.drive];
    if (dr > 0.001) x = tanh3(x * (1 + 4 * dr)) / (1 + dr * 1.2);
    var fc = p[I.cut] * Math.pow(2, b[ii[J.voct]] + b[ii[J.cv]] * p[I.amt] * 5);
    this.f.set(fc, 2 - 1.96 * p[I.res]);
    this.f.run(x);
    b[O.lp] = clamp(this.f.lp, -4, 4); b[O.bp] = clamp(this.f.bp, -4, 4); b[O.hp] = clamp(this.f.hp, -4, 4);
  };

  // ─────────────────────────────── RING MOD ───────────────────────────────

  var Ring = inherit(function Ring(s, e) { Mod.call(this, s, e); this.ph = 0; });
  Ring.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var f = clamp(p[I.freq] * Math.pow(2, b[ii[J.pitch]]), 0.1, SR * 0.45);
    this.ph += f * ISR; if (this.ph >= 1) this.ph -= 1;
    var bb = this.pat[J.b] ? b[ii[J.b]] : Math.sin(TAU * this.ph);
    var a = b[ii[J.a]], mx = p[I.mix];
    var ring = a * bb, am = a * (0.5 + 0.5 * bb);
    b[O.out] = (ring * (1 - mx) + am * mx) * p[I.level];
  };

  // ─────────────────────────────── MIXER ───────────────────────────────

  var Mix = inherit(function Mix(s, e) { Mod.call(this, s, e); });
  Mix.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, p = this.p, I = this.I;
    var y = (b[ii[0]] * p[I.l1] + b[ii[1]] * p[I.l2] + b[ii[2]] * p[I.l3] + b[ii[3]] * p[I.l4]) * p[I.master];
    b[O.out] = y; b[O.inv] = -y;
  };

  // ─────────────────────────────── MOZZI LO-FI ───────────────────────────────

  var Bits = inherit(function Bits(s, e) { Mod.call(this, s, e); this.ph = 0; this.hold = 0; });
  Bits.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var x = b[ii[J.in]];
    this.ph += clamp(p[I.rate] * Math.pow(2, b[ii[J.rate]] * 3), 20, SR) * ISR;
    if (this.ph >= 1) {
      this.ph -= Math.floor(this.ph);
      var q = Math.pow(2, p[I.bits] - 1);
      this.hold = Math.round(clamp(x, -1, 1) * q) / q;
    }
    var m = p[I.mix];
    b[O.out] = x * (1 - m) + this.hold * m;
  };

  // ─────────────────────────────── TAPE ECHO ───────────────────────────────

  var Delay = inherit(function Delay(s, e) {
    Mod.call(this, s, e);
    var n = 1; while (n < SR * 2.6) n <<= 1;
    this.buf = new Float32Array(n); this.mask = n - 1; this.w = 0;
    this.d = 0.35 * SR; this.lp = 0; this.hp = 0; this.wph = 0; this.fph = 0; this.drift = 0; this.driftT = 0;
    this.cT = tc(0.12);
  });
  Delay.prototype.reset = function () { this.buf.fill(0); this.lp = 0; this.hp = 0; this.d = this.p[this.I.time] * SR; };
  Delay.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var x = b[ii[J.in]];
    var target = clamp(p[I.time] * Math.pow(2, -b[ii[J.time]]), 0.001, 2.45) * SR;
    this.d += (target - this.d) * this.cT;
    var wow = p[I.wow];
    this.wph += 0.55 * ISR; if (this.wph >= 1) this.wph -= 1;
    this.fph += 6.3 * ISR; if (this.fph >= 1) this.fph -= 1;
    if (--this.driftT <= 0) { this.driftT = SR * 0.25; this.driftTo = brnd(); }
    this.drift += ((this.driftTo || 0) - this.drift) * 0.00005;
    var mod = wow * (SR * 0.0035 * (Math.sin(TAU * this.wph) + 0.6 * this.drift) + SR * 0.00035 * Math.sin(TAU * this.fph));
    var dd = clamp(this.d + mod, 2, this.mask - 4);
    var rp = this.w - dd, ri = Math.floor(rp), fr = rp - ri, m = this.mask, buf = this.buf;
    var y0 = buf[(ri - 1) & m], y1 = buf[ri & m], y2 = buf[(ri + 1) & m], y3 = buf[(ri + 2) & m];
    var c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    var wet = ((c3 * fr + c2) * fr + c1) * fr + y1;
    var wr;
    if (p[I.freeze] > 0.5) wr = wet; // tape loop: recirculate untouched
    else {
      var fcut = 500 * Math.pow(2, p[I.tone] * 5.2);
      var a = 1 - Math.exp(-TAU * Math.min(fcut, SR * 0.45) * ISR);
      this.lp += (wet - this.lp) * a + DN;
      this.hp += (this.lp - this.hp) * 0.004 + DN;
      var fbs = (this.lp - this.hp) * p[I.fb];
      wr = x + tanh3(fbs * 0.9) * 1.1111;
    }
    buf[this.w & m] = clamp(wr, -3, 3);
    this.w = (this.w + 1) & m;
    var mx = p[I.mix];
    b[O.wet] = wet; b[O.out] = x * (1 - mx) + wet * mx;
  };

  // ─────────────────────────────── REVERB (8-line FDN) ───────────────────────────────

  var VLEN = [1009, 1153, 1283, 1427, 1559, 1693, 1811, 1949];
  var APL = [142, 107, 379, 277];
  var Verb = inherit(function Verb(s, e) {
    Mod.call(this, s, e);
    var sc = SR / 48000;
    this.lines = []; this.len = new Float64Array(8); this.lp = new Float64Array(8); this.w = 0;
    var n = 1; while (n < 1949 * 1.7 * sc + 64) n <<= 1;
    this.mask = n - 1;
    for (var i = 0; i < 8; i++) this.lines.push(new Float32Array(n));
    this.ap = []; this.apw = 0;
    for (i = 0; i < 4; i++) { var L = Math.round(APL[i] * sc); this.ap.push({ b: new Float32Array(L), i: 0 }); }
    this.mph = 0; this.y = new Float64Array(8);
  });
  Verb.prototype.reset = function () { this.lines.forEach(function (l) { l.fill(0); }); this.ap.forEach(function (a) { a.b.fill(0); }); this.lp.fill(0); };
  Verb.prototype.tick = function () {
    var b = this.b, O = this.O, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var inL = b[ii[J.inL]], inR = this.pat[J.inR] ? b[ii[J.inR]] : inL;
    if (this.dirty) {
      this.dirty = 0;
      var sc = (0.35 + p[I.size] * 1.3) * SR / 48000;
      var rt = 0.3 * Math.pow(2, p[I.decay] * 6);
      this.g = [];
      for (var i = 0; i < 8; i++) { this.len[i] = VLEN[i] * sc; this.g.push(Math.pow(10, -3 * this.len[i] / (rt * SR))); }
      this.damp = 0.05 + p[I.damp] * 0.85;
    }
    // input diffusion
    var x = (inL + inR) * 0.5;
    for (var a = 0; a < 4; a++) {
      var ap = this.ap[a], d = ap.b[ap.i], v = x + d * 0.6;
      ap.b[ap.i] = v; ap.i = (ap.i + 1) % ap.b.length; x = d - v * 0.6;
    }
    this.mph += 0.31 * ISR; if (this.mph >= 1) this.mph -= 1;
    var md = Math.sin(TAU * this.mph) * 6 * SR / 48000;
    var y = this.y, m = this.mask, w = this.w, sum = 0, damp = this.damp;
    for (i = 0; i < 8; i++) {
      var dl = this.len[i] + ((i === 0) ? md : (i === 5 ? -md : 0));
      var rp = w - dl, ri = Math.floor(rp), fr = rp - ri, ln = this.lines[i];
      var s = ln[ri & m] + (ln[(ri + 1) & m] - ln[ri & m]) * fr;
      this.lp[i] = s + (this.lp[i] - s) * damp + DN;
      y[i] = this.lp[i];
      sum += y[i];
    }
    sum *= 0.25; // Householder 2/N
    for (i = 0; i < 8; i++) {
      var inj = (i & 1) ? inR : inL;
      this.lines[i][w & m] = (y[i] - sum) * this.g[i] + (x * 0.35 + inj * 0.15) * ((i & 2) ? -1 : 1);
    }
    this.w = (w + 1) & m;
    var wl = (y[0] - y[2] + y[4] - y[6]) * 0.42, wrr = (y[1] - y[3] + y[5] - y[7]) * 0.42;
    var mx = p[I.mix];
    b[O.L] = inL * (1 - mx) + wl * mx;
    b[O.R] = inR * (1 - mx) + wrr * mx;
  };

  // ─────────────────────────────── OUTPUT ───────────────────────────────
  // DC blocker → level → true look-ahead peak limiter (sliding-min hold +
  // box smoothing guarantees the ceiling, slow release) → final clamp.

  var CEIL = 0.944; // −0.5 dBFS
  var Out = inherit(function Out(s, e) {
    Mod.call(this, s, e);
    this.N = clamp(Math.round(SR * 0.0015), 32, 256);
    this.dl = new Float64Array(this.N); this.dr = new Float64Array(this.N); this.di = 0;
    this.req = new Float64Array(this.N).fill(1); this.held = new Float64Array(this.N).fill(1); this.hsum = this.N; this.ri = 0;
    this.g = 1; this.rel = tc(0.18);
    this.dcl = new DCBlock(); this.dcr = new DCBlock();
    this.yl = 0; this.yr = 0; this.fade = 1; this.fadeT = 1; this.fadeC = tc(0.008);
    this.pkL = 0; this.pkR = 0; this.grMin = 1; this.bad = false;
  });
  Out.prototype.reset = function () {
    this.dl.fill(0); this.dr.fill(0); this.req.fill(1); this.held.fill(1); this.hsum = this.N; this.g = 1; this.dcl.reset(); this.dcr.reset();
  };
  Out.prototype.tick = function () {
    var b = this.b, ii = this.ii, J = this.J, p = this.p, I = this.I;
    var l = b[ii[J.L]], r = this.pat[J.R] ? b[ii[J.R]] : l;
    if (!(l === l && r === r && Math.abs(l) < 1e6 && Math.abs(r) < 1e6)) { l = 0; r = 0; this.bad = true; }
    this.fade += (this.fadeT - this.fade) * this.fadeC;
    var lv = p[I.level] * this.fade;
    l = this.dcl.run(l) * lv; r = this.dcr.run(r) * lv;
    var pk = Math.max(Math.abs(l), Math.abs(r));
    var N = this.N, ri = this.ri;
    this.req[ri] = pk > CEIL ? CEIL / pk : 1;
    var mn = 1, rq = this.req;
    for (var i = 0; i < N; i++) if (rq[i] < mn) mn = rq[i];
    this.hsum += mn - this.held[ri]; this.held[ri] = mn;
    this.ri = (ri + 1) % N;
    if (this.ri === 0) { var hs = 0; for (i = 0; i < N; i++) hs += this.held[i]; this.hsum = hs; }
    var sm = this.hsum / N;
    if (sm < this.g) this.g = sm; else this.g += (sm - this.g) * this.rel;
    var di = this.di, ol = this.dl[di], or = this.dr[di];
    this.dl[di] = l; this.dr[di] = r; this.di = (di + 1) % (N - 1);
    var g = this.g;
    ol *= g; or *= g;
    if (ol > CEIL) ol = CEIL; else if (ol < -CEIL) ol = -CEIL;
    if (or > CEIL) or = CEIL; else if (or < -CEIL) or = -CEIL;
    this.yl = ol; this.yr = or;
    var al = ol < 0 ? -ol : ol, ar = or < 0 ? -or : or;
    if (al > this.pkL) this.pkL = al; if (ar > this.pkR) this.pkR = ar; if (g < this.grMin) this.grMin = g;
  };

  // ─────────────────────────────── ENGINE ───────────────────────────────

  var CLASSES = {
    clock: Clock, sqncr: Sqncr, touch: Touch, arp: Arp, seq: Seq, cplx: Cplx, fmv: Fmv, poly: Poly, drum: Drum,
    noise: Noise, lfo: Lfo, func: Func, rand: Rand, slew: Slew, util: Util, lpg: Lpg, fold: Fold, filt: Filt,
    ring: Ring, mix: Mix, bits: Bits, delay: Delay, verb: Verb, out: Out
  };
  var ALWAYS = ['clock', 'sqncr', 'touch', 'arp', 'seq'];

  function Engine(port) {
    this.port = port;
    var total = 1;
    SPECS.forEach(function (s) { total += (s.outs || []).length; });
    this.bus = new Float64Array(total);
    this.slotName = ['zero']; this.slotOwner = [null]; this.slotIdx = {};
    this.mods = []; this.by = {};
    for (var i = 0; i < SPECS.length; i++) {
      var s = SPECS[i], M = CLASSES[s.type];
      var m = new M(s, this);
      this.mods.push(m); this.by[s.id] = m;
    }
    this.out = this.by.out;
    this.cables = [];
    this.setCables([]);
    this.frames = 0; this.repCnt = 0; this.repEvery = Math.round(SR / 24);
    this.scope = new Float32Array(512); this.scI = 0;
    this.rec = false; this.recL = null; this.recR = null; this.recPos = 0; this.recN = 8192;
    this.pending = null; this.busyMs = 0; this.blocks = 0;
  }
  Engine.prototype.allocSlot = function (name, owner) {
    var i = this.slotName.length;
    this.slotName.push(name); this.slotOwner.push(owner); this.slotIdx[name] = i;
    return i;
  };
  Engine.prototype.post = function (m) { if (this.port) this.port.postMessage(m); };
  Engine.prototype.setCables = function (list) {
    var self = this;
    this.mods.forEach(function (m) {
      var ins = m.spec.ins || [];
      for (var i = 0; i < ins.length; i++) {
        var nn = m.spec.normals[ins[i]];
        m.ii[i] = nn && self.slotIdx[nn] ? self.slotIdx[nn] : 0;
        m.pat[i] = 0;
      }
    });
    var ok = [];
    (list || []).forEach(function (c) {
      var from = self.slotIdx[c[0]];
      var t = String(c[1]).split('.'), m = self.by[t[0]];
      if (!from || !m || m.J[t[1]] === undefined) return;
      m.ii[m.J[t[1]]] = from; m.pat[m.J[t[1]]] = 1;
      ok.push([c[0], c[1]]);
    });
    this.cables = ok;
    this.computeOrder();
  };
  Engine.prototype.computeOrder = function () {
    var order = [], st = new Map(), self = this;
    function visit(m) {
      if (st.get(m)) return;
      st.set(m, 1);
      for (var i = 0; i < m.ii.length; i++) {
        var sl = m.ii[i];
        if (sl) { var src = self.slotOwner[sl]; if (src && src !== m) visit(src); }
      }
      if (m.type === 'poly' || m.spec.type === 'poly') visit(self.by.arp);
      order.push(m); st.set(m, 2);
    }
    ALWAYS.forEach(function (id) { visit(self.by[id]); });
    visit(this.out);
    // make sure OUTPUT is last
    var oi = order.indexOf(this.out); order.splice(oi, 1); order.push(this.out);
    this.order = order;
    this.active = order.map(function (m) { return m.id; });
  };
  Engine.prototype.noteOn = function (n, v) {
    this.by.touch.noteOn(n, v); this.by.poly.noteOn(n, v); this.by.arp.noteOn(n);
  };
  Engine.prototype.noteOff = function (n) {
    this.by.touch.noteOff(n); this.by.poly.noteOff(n); this.by.arp.noteOff(n);
  };
  Engine.prototype.allNotesOff = function () {
    var t = this.by.touch, self = this;
    t.notes.slice().forEach(function (n) { self.noteOff(n); });
    t.allOff();
  };
  Engine.prototype.arpNote = function (n, dur) { this.by.poly.arpNote(n, dur); };
  function sanitize(o, depth) {
    if (!o || depth > 3) return;
    if (ArrayBuffer.isView(o)) { for (var i = 0; i < o.length; i++) if (!isFinite(o[i])) o[i] = 0; return; }
    if (Array.isArray(o)) { for (var j = 0; j < o.length; j++) { if (typeof o[j] === 'number') { if (!isFinite(o[j])) o[j] = 0; } else if (typeof o[j] === 'object') sanitize(o[j], depth + 1); } return; }
    for (var k in o) {
      if (k === 'eng' || k === 'spec' || k === 'b' || k === 'port') continue;
      var v = o[k];
      if (typeof v === 'number') { if (!isFinite(v)) o[k] = 0; }
      else if (v && typeof v === 'object') sanitize(v, depth + 1);
    }
  }
  Engine.prototype.resetAll = function () {
    this.mods.forEach(function (m) { m.reset(); sanitize(m, 0); });
    this.bus.fill(0);
  };
  Engine.prototype.applyLoad = function (d) {
    var self = this;
    this.resetAll();
    if (d.params) {
      Object.keys(d.params).forEach(function (mid) {
        var m = self.by[mid]; if (!m) return;
        var ps = d.params[mid];
        Object.keys(ps).forEach(function (k) { m.set(k, ps[k], true); });
      });
    }
    if (d.sq) this.by.sqncr.load(d.sq);
    this.by.arp.clear();
    this.by.poly.reset();
    this.allNotesOff();
    if (d.arp && d.arp.length) this.by.arp.setNotes(d.arp);
    this.setCables(d.cables || []);
    this.by.clock.doReset(); this.by.sqncr.reset(); this.by.seq.reset();
  };
  Engine.prototype.msg = function (d) {
    var m;
    switch (d.t) {
      case 'param': m = this.by[d.m]; if (m) m.set(d.k, d.v, !!d.now); break;
      case 'cables': this.setCables(d.list); break;
      case 'load': this.pending = d; this.out.fadeT = 0; break;
      case 'noteOn': this.noteOn(d.n, d.v === undefined ? 0.8 : d.v); break;
      case 'noteOff': this.noteOff(d.n); break;
      case 'allOff': this.allNotesOff(); break;
      case 'press': this.by.touch.pressT = clamp(d.v, 0, 1); if (d.pos !== undefined) this.by.touch.pos = clamp(d.pos, 0, 1); break;
      case 'tap': this.by.clock.tap(); break;
      case 'midiClock': this.by.clock.midiClock(); break;
      case 'midiStart': this.by.clock.midiStart(); break;
      case 'midiStop': this.by.clock.set('run', 0); break;
      case 'sqEdit': this.by.sqncr.edit(d); break;
      case 'sqData': this.by.sqncr.load(d); break;
      case 'sqGate': this.by.sqncr.gmode[d.tr] = d.v ? 1 : 0; break;
      case 'pad': this.by.sqncr.pad(d.tr, d.on); break;
      case 'arpClear': this.by.arp.clear(); break;
      case 'arpNotes': this.by.arp.setNotes(d.notes || []); break;
      case 'rec':
        this.rec = !!d.on;
        if (this.rec) { this.recL = new Float32Array(this.recN); this.recR = new Float32Array(this.recN); this.recPos = 0; }
        else this.flushRec(true);
        break;
      case 'panic': this.resetAll(); this.allNotesOff(); break;
    }
  };
  Engine.prototype.flushRec = function (final) {
    if (this.recL && this.recPos > 0) {
      var l = this.recL.slice(0, this.recPos), r = this.recR.slice(0, this.recPos);
      this.port.postMessage({ t: 'rec', l: l, r: r, final: !!final }, [l.buffer, r.buffer]);
    } else if (final) this.port.postMessage({ t: 'rec', l: new Float32Array(0), r: new Float32Array(0), final: true });
    this.recPos = 0;
    if (final) { this.recL = this.recR = null; }
  };
  Engine.prototype.render = function (L, R) {
    var t0 = Date.now();
    var n = L.length, order = this.order, no = order.length, om = this.out;
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < no; k++) { var m = order[k]; if (m.moving) m.smooth(); m.tick(); }
      var yl = om.yl, yr = om.yr;
      L[i] = yl; R[i] = yr;
      if (this.rec) {
        this.recL[this.recPos] = yl; this.recR[this.recPos] = yr;
        if (++this.recPos >= this.recN) { this.flushRec(false); this.recL = new Float32Array(this.recN); this.recR = new Float32Array(this.recN); }
      }
      this.scope[this.scI] = yl; this.scI = (this.scI + 1) & 511;
      if (this.pending && om.fade < 0.002) {
        var d = this.pending; this.pending = null;
        this.applyLoad(d);
        om.fadeT = 1;
        order = this.order; no = order.length;
        this.post({ t: 'loaded', active: this.active });
      }
    }
    if (om.bad) { om.bad = false; this.resetAll(); this.post({ t: 'panic' }); }
    this.frames += n;
    this.busyMs += Date.now() - t0; this.blocks++;
    this.repCnt += n;
    if (this.repCnt >= this.repEvery) { this.repCnt = 0; this.report(); }
  };
  Engine.prototype.report = function () {
    var r = { t: 'state', frames: this.frames, mods: {} };
    for (var i = 0; i < this.order.length; i++) {
      var m = this.order[i], x = m.report();
      if (x) r.mods[m.id] = x;
    }
    var om = this.out;
    r.pkL = om.pkL; r.pkR = om.pkR; r.gr = om.grMin; om.pkL = om.pkR = 0; om.grMin = 1;
    var sc = new Float32Array(512);
    for (i = 0; i < 512; i++) sc[i] = this.scope[(this.scI + i) & 511];
    r.scope = sc;
    // Date.now() has 1 ms resolution; summed per block it is unbiased, so average over ~1 s
    var audioMs = this.blocks * 128 / SR * 1000;
    if (audioMs >= 1000 || this.load === undefined) {
      this.load = audioMs > 0 ? this.busyMs / audioMs : 0;
      this.busyMs = 0; this.blocks = 0;
    }
    r.load = this.load;
    r.active = this.active;
    this.post(r);
  };

  if (typeof AudioWorkletProcessor === 'undefined') return { Engine: Engine };

  class MasterProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      var self = this;
      this.eng = new Engine(this.port);
      this.port.onmessage = function (e) { try { self.eng.msg(e.data); } catch (err) { self.port.postMessage({ t: 'error', msg: String(err && err.stack || err) }); } };
      this.port.postMessage({ t: 'ready', sr: sampleRate });
    }
    process(inputs, outputs) {
      var o = outputs[0];
      if (!o || !o[0]) return true;
      var L = o[0], R = o[1] || o[0];
      try { this.eng.render(L, R); }
      catch (err) {
        L.fill(0); if (R !== L) R.fill(0);
        if (!this.errSent) { this.errSent = true; this.port.postMessage({ t: 'error', msg: String(err && err.stack || err) }); }
      }
      return true;
    }
  }
  registerProcessor('master-of-all', MasterProcessor);
  return { Engine: Engine };
}

if (typeof module !== 'undefined' && module.exports) module.exports = MASTER_DSP;
