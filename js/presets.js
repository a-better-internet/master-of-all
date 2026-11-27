/*
 * MASTER OF ALL — factory presets
 *
 * Compact format (see patch.js): p = knob overrides, c = cables, sq = drum
 * patterns (one char per step), sqg = gate-mode tracks, arp = latched notes.
 * keys: true marks presets that are meant to be PLAYED (touch plate, computer
 * keyboard or MIDI) — everything else runs on its own as soon as it loads.
 *
 * The "Latin Noise" bank pays homage to the Latin American electronic,
 * electroacoustic and underground noise scenes of the 1970s and 80s. These are
 * impressions of the techniques and textures of those scenes, made with this
 * rack. They do not reproduce any recording.
 */
(function (root) {
  'use strict';

  var LATIN = 'Latin Noise 70s/80s', WEST = 'West Coast', BASTL = 'Bastl / Trinity', NOISE = 'Noise & Experimental';

  var P = [
    // ═══════════════════════════════ LATIN NOISE 70s/80s ═══════════════════════════════
    {
      name: 'Di Tella ’69 · Laboratorio', cat: LATIN,
      notes: 'Buenos Aires, CLAEM studio: ring-modulated sine generators stepping through whole tones under random voltage control, into tape echo.',
      p: {
        'clock.bpm': 72, 'clock.mult': 1,
        'rand.chg': 0.8, 'rand.walk': 0.55, 'rand.len': 7,
        'seq.quant': 7, 'seq.range': 2, 'seq.s1': 0.1, 'seq.s2': 0.62, 'seq.s3': 0.35, 'seq.s4': 0.9, 'seq.s5': 0.2, 'seq.s6': 0.75, 'seq.s7': 0.48, 'seq.s8': 0.05,
        'cplx.pfreq': 220, 'cplx.mfreq': 0.7, 'cplx.fm': 0.12, 'cplx.am': 0.3,
        'ring.freq': 331, 'ring.mix': 0.35, 'ring.level': 0.9,
        'func1.atk': 3, 'func1.rel': 700, 'func1.cA': 0.5,
        'lpg.m1': 1, 'lpg.r1': 0.35, 'lpg.v1': 0.45,
        'delay.time': 0.42, 'delay.fb': 0.55, 'delay.wow': 0.3, 'delay.mix': 0.45, 'delay.tone': 0.55,
        'verb.size': 0.7, 'verb.decay': 0.55, 'verb.mix': 0.3, 'out.level': 1.13
      },
      c: [['rand.step', 'seq.addr'], ['seq.cv', 'cplx.pitch'], ['cplx.sine', 'ring.a'], ['seq.trig', 'func1.trig'],
        ['func1.env', 'lpg.cv1'], ['ring.out', 'lpg.in1'], ['lpg.out1', 'delay.in'], ['delay.out', 'verb.inL'],
        ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Convertidor Gráfico · Reichenbach', cat: LATIN,
      notes: 'Hand-drawn curves as control voltage: slow smooth-random glissandi steer a complex oscillator drone whose timbre opens and closes like a pen line.',
      p: {
        'lfo1.wave': 3, 'lfo1.rate': 0.22, 'lfo1.smooth': 230,
        'lfo2.wave': 1, 'lfo2.rate': 0.07,
        'util.a1': 0.9, 'util.o1': -0.2,
        'cplx.pfreq': 196, 'cplx.mfreq': 98, 'cplx.mtrack': 1, 'cplx.fm': 0.32, 'cplx.timbre': 0.15, 'cplx.tAmt': 0.6, 'cplx.sym': 0.2,
        'rand.flux': 0.3,
        'lpg.o1': 0.62, 'lpg.a1': 0.35, 'lpg.m1': 1, 'lpg.r1': 0.3,
        'delay.time': 0.8, 'delay.fb': 0.35, 'delay.mix': 0.25, 'delay.wow': 0.4,
        'verb.size': 0.9, 'verb.decay': 0.72, 'verb.mix': 0.45, 'out.level': 0.53
      },
      c: [['lfo1.uni', 'util.in1'], ['util.out1', 'cplx.pitch'], ['lfo2.uni', 'cplx.timb'], ['rand.flux', 'lpg.cv1'],
        ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'COMDASUAR · Santiago ’78', cat: LATIN,
      notes: 'An early home-built computer music system: 8-bit wavetables made of XOR bit patterns, the pattern itself sequenced step by step, through a lo-fi DAC.',
      p: {
        'clock.bpm': 128, 'clock.mult': 2,
        'seq.dir': 3, 'seq.quant': 3, 'seq.range': 1, 'seq.s1': 0.0, 'seq.s2': 0.5, 'seq.s3': 0.25, 'seq.s4': 0.83, 'seq.s5': 0.58, 'seq.s6': 0.33, 'seq.s7': 1.0, 'seq.s8': 0.42,
        'lfo1.rate': 196, 'lfo1.wave': 0, 'lfo1.xor': 85, 'lfo1.res': 0,
        'bits.bits': 6, 'bits.rate': 11025, 'bits.mix': 1,
        'func1.atk': 1, 'func1.rel': 180,
        'lpg.m1': 0, 'lpg.v1': 0.05,
        'filt.cut': 5200, 'filt.res': 0.1,
        'delay.time': 0.234, 'delay.fb': 0.38, 'delay.mix': 0.3, 'delay.wow': 0.05,
        'verb.mix': 0.15, 'out.level': 0.97
      },
      c: [['seq.cv', 'lfo1.rate'], ['seq.raw', 'lfo1.xor'], ['lfo1.bi', 'bits.in'], ['bits.out', 'filt.in'], ['filt.lp', 'lpg.in1'],
        ['seq.trig', 'func1.trig'], ['func1.env', 'lpg.cv1'], ['lpg.out1', 'delay.in'], ['delay.out', 'verb.inL'],
        ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Nova · Creación de la Tierra', cat: LATIN,
      notes: 'Bogotá, 1972: chant-like resonant band-pass voices carved from pink noise over a subterranean complex drone, in a very large space.',
      p: {
        'clock.bpm': 60, 'clock.mult': 0,
        'seq.div': 3, 'seq.quant': 6, 'seq.range': 2, 'seq.slew': 0.35, 'seq.dir': 2,
        'filt.cut': 330, 'filt.res': 0.93, 'filt.amt': 0.25,
        'lfo1.wave': 3, 'lfo1.rate': 0.15, 'lfo1.smooth': 200,
        'cplx.pfreq': 55, 'cplx.mfreq': 27.6, 'cplx.fm': 0.25, 'cplx.timbre': 0.25, 'cplx.tAmt': 0.5,
        'lfo2.rate': 0.05,
        'lpg.o2': 0.55, 'lpg.m2': 1, 'lpg.r2': 0.4,
        'noise.dens': 6,
        'mix.l1': 1.0, 'mix.l2': 0.7, 'mix.l3': 0.15, 'mix.master': 1,
        'verb.size': 0.98, 'verb.decay': 0.86, 'verb.damp': 0.55, 'verb.mix': 0.5, 'out.level': 0.49
      },
      c: [['noise.pink', 'filt.in'], ['seq.cv', 'filt.voct'], ['lfo1.bi', 'filt.cv'], ['filt.bp', 'mix.in1'],
        ['cplx.out', 'lpg.in2'], ['lfo2.uni', 'cplx.timb'], ['lpg.out2', 'mix.in2'], ['noise.crack', 'mix.in3'],
        ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Antunes · Cromoplastofonia', cat: LATIN,
      notes: 'Brasília colour-music: inharmonic FM bells in a ping-pong scale, brightness falling with each strike, smeared by tape echo.',
      p: {
        'clock.bpm': 84, 'clock.mult': 1,
        'seq.dir': 2, 'seq.quant': 5, 'seq.range': 2, 'seq.steps': 7,
        'fmv.freq': 220, 'fmv.ratio': 3.5, 'fmv.index': 1.5, 'fmv.iAmt': 0.5, 'fmv.fb': 0.1,
        'func2.atk': 1, 'func2.rel': 1600, 'func2.cDR': 0.01,
        'lpg.m1': 1, 'lpg.v1': 0.65, 'lpg.r1': 0.15,
        'delay.time': 0.66, 'delay.fb': 0.5, 'delay.mix': 0.38, 'delay.tone': 0.5,
        'verb.size': 0.8, 'verb.decay': 0.65, 'verb.mix': 0.35, 'out.level': 0.61
      },
      c: [['seq.cv', 'fmv.pitch'], ['seq.trig', 'func2.trig'], ['func2.env', 'fmv.idx'], ['func2.env', 'lpg.cv1'],
        ['fmv.out', 'lpg.in1'], ['lpg.out1', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Quanta · Electrónica en Vivo', cat: LATIN,
      notes: 'Mexico City live-electronics: a feedback network where the echo’s own energy rewrites the oscillator timbre while random gates strike the vactrol.',
      p: {
        'clock.bpm': 96,
        'rand.chg': 0.7, 'rand.walk': 0.5, 'rand.gprob': 0.6, 'rand.len': 11,
        'cplx.pfreq': 330, 'cplx.mfreq': 211, 'cplx.fm': 0.45, 'cplx.timbre': 0.3, 'cplx.tAmt': 0.8,
        'lpg.m1': 1, 'lpg.v1': 0.3, 'lpg.r1': 0.5,
        'slew.rise': 30, 'slew.fall': 600,
        'ring.freq': 87, 'ring.level': 0.6,
        'delay.time': 0.31, 'delay.fb': 0.72, 'delay.wow': 0.35, 'delay.mix': 0.5, 'delay.tone': 0.5,
        'mix.l1': 0.9, 'mix.l2': 0.45,
        'verb.mix': 0.3, 'verb.size': 0.7, 'out.level': 1.79
      },
      c: [['rand.step', 'cplx.pitch'], ['rand.gate', 'lpg.ping1'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'],
        ['delay.wet', 'slew.in'], ['slew.env', 'cplx.timb'], ['delay.wet', 'ring.a'], ['delay.out', 'mix.in1'], ['ring.out', 'mix.in2'],
        ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Poeta del Ruido · DF 1980', cat: LATIN,
      notes: 'Mexican art-noise rock: an overdriven drum machine, a folded inharmonic bass that the TOM track triggers, crackle and a crushed DAC.',
      p: {
        'clock.bpm': 132,
        'drum.drive': 0.85, 'drum.kd': 0.45, 'drum.hd': 0.12, 'drum.sl': 0.8, 'drum.tl': 0,
        'cplx.pfreq': 55, 'cplx.mfreq': 41, 'cplx.fm': 0.55, 'cplx.tAmt': 0.9, 'cplx.sym': 0.4,
        'lfo1.wave': 2, 'lfo1.rate': 3,
        'fold.gain': 0.55,
        'func1.atk': 2, 'func1.rel': 260,
        'lpg.m1': 1, 'lpg.v1': 0.15, 'lpg.r1': 0.45,
        'noise.dens': 35,
        'mix.l1': 0.75, 'mix.l2': 0.7, 'mix.l3': 0.35,
        'bits.bits': 7, 'bits.rate': 12000, 'bits.mix': 0.6,
        'delay.time': 0.18, 'delay.fb': 0.3, 'delay.mix': 0.18, 'out.level': 0.66
      },
      sq: { k: 'x..x..x.x...x...', s: '....X.......X..o', h: '4.x.4.x.4.x.4.x.', c: '............x...', t: 'x.....x...x.x...', b: '................' },
      c: [['lfo1.uni', 'cplx.timb'], ['cplx.out', 'fold.in'], ['fold.out', 'lpg.in1'], ['sqncr.t5', 'func1.trig'], ['func1.env', 'lpg.cv1'],
        ['drum.mix', 'mix.in1'], ['lpg.out1', 'mix.in2'], ['noise.crack', 'mix.in3'], ['mix.out', 'bits.in'], ['bits.out', 'delay.in'],
        ['delay.out', 'out.L']]
    },
    {
      name: 'Electrodomésticos · Viva Chile ’86', cat: LATIN,
      notes: 'Santiago tape collage: drum machine with a son clave, a plucked FM bass, and short-wave radio hiss, all bounced through a wobbling tape echo.',
      p: {
        'clock.bpm': 104, 'clock.mult': 1,
        'drum.morph': 0, 'drum.bt': 0.45, 'drum.bl': 0.55, 'drum.hd': 0.15,
        'seq.quant': 3, 'seq.range': 1, 'seq.s1': 0, 'seq.s2': 0, 'seq.s3': 0.58, 'seq.s4': 0.25, 'seq.s5': 0, 'seq.s6': 0.83, 'seq.s7': 0.58, 'seq.s8': 0.42,
        'seq.g2': 0, 'seq.g6': 1,
        'fmv.freq': 55, 'fmv.ratio': 1, 'fmv.index': 1.6, 'fmv.fb': 0.25,
        'lpg.m2': 1, 'lpg.v2': 0.25, 'lpg.r2': 0.3,
        'filt.cut': 1800, 'filt.res': 0.75, 'filt.amt': 0.6,
        'lfo2.wave': 3, 'lfo2.rate': 0.4,
        'mix.l1': 0.75, 'mix.l2': 0.85, 'mix.l3': 0.22,
        'delay.time': 0.53, 'delay.fb': 0.6, 'delay.wow': 0.6, 'delay.tone': 0.45, 'delay.mix': 0.42, 'out.level': 0.93
      },
      sq: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.', b: 'x..x..x...x.x...' },
      c: [['seq.cv', 'fmv.pitch'], ['seq.trig', 'lpg.ping2'], ['fmv.out', 'lpg.in2'], ['noise.white', 'filt.in'], ['lfo2.bi', 'filt.cv'],
        ['drum.mix', 'mix.in1'], ['lpg.out2', 'mix.in2'], ['filt.bp', 'mix.in3'], ['mix.out', 'delay.in'], ['delay.out', 'out.L']]
    },
    {
      name: 'Akira S · São Paulo Industrial', cat: LATIN,
      notes: 'Paulista industrial post-punk: ring-modulated metallic bass in phrygian dominant, hammering hats, a snare thrown into a cold room.',
      p: {
        'clock.bpm': 118, 'clock.mult': 2,
        'drum.drive': 0.6, 'drum.ht': 0.8, 'drum.hd': 0.1, 'drum.sd': 0.55, 'drum.kt': 0.35,
        'seq.quant': 5, 'seq.range': 1, 'seq.s1': 0, 'seq.s2': 0, 'seq.s3': 0.09, 'seq.s4': 0, 'seq.s5': 0.42, 'seq.s6': 0, 'seq.s7': 0.33, 'seq.s8': 0.09,
        'cplx.pfreq': 41.2, 'cplx.mshape': 0.66, 'cplx.mfreq': 2, 'cplx.timbre': 0.35,
        'ring.freq': 77, 'ring.mix': 0.55,
        'func1.atk': 1, 'func1.rel': 160,
        'lpg.m1': 1, 'lpg.v1': 0.1, 'lpg.r1': 0.55,
        'mix.l1': 0.75, 'mix.l2': 0.8,
        'verb.size': 0.55, 'verb.decay': 0.4, 'verb.damp': 0.2, 'verb.mix': 0.22, 'out.level': 0.8
      },
      sq: { k: 'X...x...X...x.x.', s: '....X.......X...', h: 'x.xxx.xxx.xxx.x.', c: '....x.......x..x' },
      c: [['seq.cv', 'cplx.pitch'], ['cplx.sine', 'ring.a'], ['ring.out', 'lpg.in1'], ['seq.trig', 'func1.trig'], ['func1.env', 'lpg.cv1'],
        ['drum.mix', 'mix.in1'], ['lpg.out1', 'mix.in2'], ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Toque de Queda', cat: LATIN,
      notes: 'Curfew-era underground: a distant siren glide, a heart-slow kick, a 13-step tom out of phase, and wind made of filtered noise.',
      p: {
        'clock.bpm': 64,
        'lfo1.rate': 0.08, 'lfo1.wave': 1,
        'cplx.pfreq': 440, 'cplx.timbre': 0.18, 'cplx.mfreq': 5.5, 'cplx.fm': 0.08,
        'lpg.o1': 0.32, 'lpg.a1': 0, 'lpg.m1': 1,
        'drum.kt': 0.15, 'drum.kd': 0.95, 'drum.kl': 1, 'drum.tt': 0.2, 'drum.td': 0.8, 'drum.tl': 0.6, 'drum.drive': 0.3,
        'filt.cut': 520, 'filt.res': 0.5, 'filt.amt': 0.7,
        'rand.flux': 0.12,
        'mix.l1': 0.35, 'mix.l2': 0.8, 'mix.l3': 0.7,
        'verb.size': 0.92, 'verb.decay': 0.8, 'verb.mix': 0.52, 'out.level': 0.87
      },
      sq: { k: 'x...............', t: '......x......' },
      c: [['lfo1.uni', 'cplx.pitch'], ['cplx.out', 'lpg.in1'], ['noise.pink', 'filt.in'], ['rand.flux', 'filt.cv'],
        ['lpg.out1', 'mix.in1'], ['drum.mix', 'mix.in2'], ['filt.lp', 'mix.in3'], ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Lima Subterráneo ’85', cat: LATIN,
      notes: 'Lima’s underground punk: a fast, blown-out beat with a folded “guitar” built from a complex oscillator at full FM, pushed through a driven filter.',
      p: {
        'clock.bpm': 176, 'clock.mult': 1,
        'drum.drive': 1, 'drum.hd': 0.08, 'drum.sl': 0.85, 'drum.kd': 0.35,
        'seq.steps': 4, 'seq.quant': 3, 'seq.range': 1, 'seq.s1': 0, 'seq.s2': 0, 'seq.s3': 0.25, 'seq.s4': 0.42,
        'cplx.pfreq': 82.4, 'cplx.mfreq': 82.4, 'cplx.mtrack': 1, 'cplx.mshape': 0.7, 'cplx.fm': 0.6, 'cplx.timbre': 0.7,
        'fold.gain': 0.5,
        'filt.cut': 2400, 'filt.res': 0.25, 'filt.drive': 0.9,
        'lpg.m1': 2, 'lpg.o1': 0.6, 'lpg.a1': 0.4,
        'mix.l1': 0.75, 'mix.l2': 0.55,
        'bits.bits': 10, 'bits.rate': 22050, 'bits.mix': 0.5, 'out.level': 0.65
      },
      sq: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', c: '....x.......x...' },
      c: [['seq.cv', 'cplx.pitch'], ['cplx.out', 'fold.in'], ['fold.out', 'filt.in'], ['filt.lp', 'lpg.in1'], ['clock.mult', 'lpg.cv1'],
        ['drum.mix', 'mix.in1'], ['lpg.out1', 'mix.in2'], ['mix.out', 'bits.in'], ['bits.out', 'out.L']]
    },
    {
      name: 'Chicha Psicodélica ’72', cat: LATIN,
      notes: 'Amazonian/Lima cumbia psicodélica: güiro-scrape hats, conga and son clave under a wobbly echo-drenched arpeggio played on the complex oscillator.',
      p: {
        'clock.bpm': 96, 'clock.swing': 14, 'clock.mult': 2,
        'drum.ht': 0.35, 'drum.hd': 0.3, 'drum.hl': 0.4, 'drum.tt': 0.55, 'drum.td': 0.35, 'drum.tl': 0.75, 'drum.morph': 0.85, 'drum.bt': 0.5, 'drum.bl': 0.35, 'drum.kl': 0.75,
        'arp.algo': 2, 'arp.latch': 1, 'arp.gate': 0.4,
        'cplx.pfreq': 261.6, 'cplx.fm': 0.15, 'cplx.mfreq': 523, 'cplx.timbre': 0.22,
        'lpg.m1': 1, 'lpg.v1': 0.3, 'lpg.r1': 0.25,
        'delay.time': 0.47, 'delay.fb': 0.45, 'delay.wow': 0.55, 'delay.mix': 0.4,
        'mix.l1': 0.75, 'mix.l2': 0.8,
        'verb.mix': 0.25, 'out.level': 0.52
      },
      arp: [57, 60, 64, 65, 67, 64],
      sq: { k: 'x.......x.......', h: '2.x.2.x.2.x.2.x.', t: '..x...xx..x...x.', b: 'x.x.x.x.x.x.x.x.' },
      c: [['arp.pitch', 'cplx.pitch'], ['arp.trig', 'lpg.ping1'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'],
        ['drum.mix', 'mix.in1'], ['delay.out', 'mix.in2'], ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Russek · Concreta DF', cat: LATIN,
      notes: 'Mexican musique concrète: crackle grains and struck metal recirculating in a tape loop whose speed drifts under smooth random control.',
      p: {
        'clock.bpm': 90,
        'noise.dens': 110,
        'cplx.pfreq': 610, 'cplx.mfreq': 0.9, 'cplx.fm': 0.7, 'cplx.timbre': 0.6,
        'lpg.m2': 1, 'lpg.v2': 0.2, 'lpg.r2': 0.7,
        'lfo1.wave': 3, 'lfo1.rate': 0.18, 'lfo1.smooth': 240,
        'delay.time': 0.12, 'delay.fb': 0.88, 'delay.tone': 0.4, 'delay.wow': 0.85, 'delay.mix': 0.55,
        'mix.l1': 0.5, 'mix.l2': 0.8,
        'verb.size': 0.75, 'verb.mix': 0.35, 'out.level': 2.0
      },
      sq: { b: 'x..x.x...x..x' },
      c: [['noise.crack', 'mix.in1'], ['cplx.out', 'lpg.in2'], ['sqncr.t6', 'lpg.ping2'], ['lpg.out2', 'mix.in2'],
        ['mix.out', 'delay.in'], ['lfo1.bi', 'delay.time'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Brnčić · Tape Splice', cat: LATIN,
      notes: 'Splicing-block music: two sources chopped by gate-mode sequencer tracks through VCA gates, like razor-cut tape joined end to end.',
      p: {
        'clock.bpm': 90,
        'cplx.pfreq': 180, 'cplx.mfreq': 72, 'cplx.fm': 0.4, 'cplx.timbre': 0.45,
        'rand.chg': 0.6, 'rand.walk': 0.7,
        'lpg.m1': 0, 'lpg.v1': 0, 'lpg.m2': 0, 'lpg.v2': 0,
        'ring.freq': 1250, 'ring.mix': 0.2,
        'mix.l1': 0.8, 'mix.l2': 0.6,
        'delay.time': 0.25, 'delay.fb': 0.2, 'delay.mix': 0.2,
        'verb.mix': 0.2, 'out.level': 1.67
      },
      sqg: 'ks',
      sq: { k: 'xxxx..xx.x..xxx.', s: '....xx..x.xx...x' },
      c: [['rand.step', 'cplx.pitch'], ['cplx.out', 'lpg.in1'], ['sqncr.t1', 'lpg.cv1'], ['noise.pink', 'ring.a'], ['ring.out', 'lpg.in2'], ['sqncr.t2', 'lpg.cv2'],
        ['lpg.out1', 'mix.in1'], ['lpg.out2', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Bolaños · Intensidad y Altura', cat: LATIN,
      notes: 'Lima/Buenos Aires, 1964 and after: a study of intensity and pitch — sine glissandi whose loudness and height are drawn by two slow function generators.',
      p: {
        'func1.atk': 2200, 'func1.dec': 10, 'func1.rel': 3100, 'func1.loop': 1, 'func1.cA': 2,
        'func2.atk': 700, 'func2.rel': 5200, 'func2.loop': 1, 'func2.cA': 0.05,
        'util.a1': 1, 'util.o1': -0.3,
        'cplx.pfreq': 330, 'cplx.mfreq': 4.4, 'cplx.fm': 0.05, 'cplx.am': 0.55,
        'lpg.m1': 0,
        'delay.time': 0.95, 'delay.fb': 0.45, 'delay.mix': 0.3,
        'verb.size': 0.85, 'verb.decay': 0.7, 'verb.mix': 0.45, 'out.level': 1.48
      },
      c: [['func2.env', 'util.in1'], ['util.out1', 'cplx.pitch'], ['func1.env', 'lpg.cv1'], ['cplx.sine', 'lpg.in1'],
        ['lpg.out1', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },

    // ═══════════════════════════════ WEST COAST ═══════════════════════════════
    {
      name: 'Bongo Pings', cat: WEST,
      notes: 'The classic: a pentatonic sequence and random gates strike the low pass gate; the vactrol’s slow fall makes every note a wooden bongo.',
      p: {
        'clock.bpm': 108, 'clock.mult': 2,
        'seq.quant': 6, 'seq.range': 2, 'seq.dir': 3,
        'cplx.pfreq': 130.8, 'cplx.mfreq': 261.6, 'cplx.mtrack': 1, 'cplx.fm': 0.18, 'cplx.timbre': 0.2,
        'lpg.m1': 1, 'lpg.v1': 0.35, 'lpg.r1': 0.4,
        'rand.gprob': 0.7,
        'delay.time': 0.278, 'delay.fb': 0.4, 'delay.mix': 0.3,
        'verb.mix': 0.28, 'out.level': 0.49
      },
      c: [['seq.cv', 'cplx.pitch'], ['seq.trig', 'lpg.ping1'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'],
        ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Timbre Lead · play me', cat: WEST, keys: true,
      notes: 'Keyboard voice: the function generator opens the gate and sweeps the wavefolder at once; glide on the touch plate. Play with the keys or MIDI.',
      p: {
        'touch.glide': 0.18,
        'cplx.pfreq': 261.6, 'cplx.mfreq': 1.5, 'cplx.mtrack': 1, 'cplx.fm': 0.2, 'cplx.timbre': 0.05, 'cplx.tAmt': 0.75, 'cplx.sym': 0.15,
        'func1.atk': 8, 'func1.dec': 600, 'func1.sus': 0.45, 'func1.rel': 450,
        'lpg.m1': 1, 'lpg.r1': 0.3, 'lpg.v1': 0.2,
        'delay.time': 0.36, 'delay.fb': 0.35, 'delay.mix': 0.25,
        'verb.mix': 0.25, 'out.level': 0.53
      },
      c: [['func1.env', 'cplx.timb'], ['func1.env', 'lpg.cv1'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'],
        ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Easel Drone', cat: WEST,
      notes: 'Music-Easel style drone: the modulation oscillator crawls under the principal, timbre and symmetry breathe from two LFOs.',
      p: {
        'cplx.pfreq': 73.4, 'cplx.mfreq': 0.35, 'cplx.mshape': 0.4, 'cplx.fm': 0.28, 'cplx.timbre': 0.3, 'cplx.tAmt': 0.4,
        'lfo1.rate': 0.11, 'lfo1.wave': 1, 'lfo2.rate': 0.043, 'lfo2.wave': 3,
        'lpg.o1': 0.7, 'lpg.a1': 0, 'lpg.m1': 1, 'lpg.r1': 0.25,
        'delay.time': 1.1, 'delay.fb': 0.45, 'delay.mix': 0.3, 'delay.wow': 0.3,
        'verb.size': 0.85, 'verb.decay': 0.7, 'verb.mix': 0.4, 'out.level': 0.58
      },
      c: [['lfo1.uni', 'cplx.timb'], ['lfo2.bi', 'cplx.sym'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'],
        ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Uncertainty Garden', cat: WEST,
      notes: 'Source of uncertainty: a looping-but-mutating random buffer addresses the sequencer, interpolated random steers a second voice.',
      p: {
        'clock.bpm': 100, 'clock.mult': 2,
        'rand.chg': 0.3, 'rand.walk': 0.4, 'rand.len': 8, 'rand.interp': 0.6, 'rand.smooth': 0.2,
        'seq.quant': 2, 'seq.range': 2,
        'cplx.pfreq': 196, 'cplx.mfreq': 392, 'cplx.mtrack': 1, 'cplx.fm': 0.12, 'cplx.timbre': 0.15,
        'fmv.freq': 392, 'fmv.ratio': 2, 'fmv.index': 1.2,
        'lpg.m1': 1, 'lpg.v1': 0.4, 'lpg.o2': 0.18, 'lpg.a2': 0.4, 'lpg.m2': 1,
        'mix.l1': 0.85, 'mix.l2': 0.5,
        'delay.time': 0.45, 'delay.fb': 0.45, 'delay.mix': 0.35,
        'verb.mix': 0.35, 'out.level': 0.52
      },
      c: [['rand.step', 'seq.addr'], ['seq.cv', 'cplx.pitch'], ['seq.trig', 'lpg.ping1'], ['cplx.out', 'lpg.in1'],
        ['rand.smooth', 'fmv.pitch'], ['fmv.out', 'lpg.in2'], ['rand.flux', 'lpg.cv2'],
        ['lpg.out1', 'mix.in1'], ['lpg.out2', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Vactrol Rain', cat: WEST,
      notes: 'Both gates pinged by different random sources with high emphasis: resonant droplets of filtered pink noise and folded sine.',
      p: {
        'clock.bpm': 140, 'clock.mult': 3,
        'rand.gprob': 0.35,
        'lpg.m1': 2, 'lpg.r1': 0.9, 'lpg.v1': 0.15, 'lpg.m2': 1, 'lpg.r2': 0.8, 'lpg.v2': 0.5,
        'cplx.pfreq': 880, 'cplx.timbre': 0.4, 'cplx.mfreq': 1320, 'cplx.fm': 0.2,
        'sqncr.l6': 13,
        'mix.l1': 0.7, 'mix.l2': 0.7,
        'verb.size': 0.8, 'verb.decay': 0.6, 'verb.mix': 0.45, 'out.level': 0.86
      },
      sq: { b: 'x..x.xx..x.x.' },
      c: [['noise.pink', 'lpg.in1'], ['rand.gate', 'lpg.ping1'], ['rand.step', 'cplx.pitch'], ['cplx.out', 'lpg.in2'], ['sqncr.t6', 'lpg.ping2'],
        ['lpg.out1', 'mix.in1'], ['lpg.out2', 'mix.in2'], ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Mod Osc Growl · play me', cat: WEST, keys: true,
      notes: 'Bass for the keys: through-zero FM from a tracking sub-oscillator, folded, with the function generator on the gate.',
      p: {
        'touch.oct': -2,
        'cplx.pfreq': 261.6, 'cplx.mfreq': 0.5, 'cplx.mtrack': 1, 'cplx.mshape': 0.33, 'cplx.fm': 0.55, 'cplx.timbre': 0.35, 'cplx.tAmt': 0.4,
        'func1.atk': 2, 'func1.dec': 350, 'func1.sus': 0.6, 'func1.rel': 200,
        'lpg.m1': 1, 'lpg.r1': 0.5, 'lpg.v1': 0.1,
        'verb.mix': 0.12, 'out.level': 0.38
      },
      c: [['func1.env', 'cplx.timb'], ['func1.env', 'lpg.cv1'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Pressure Plate Pad · play me', cat: WEST, keys: true,
      notes: 'Four-voice pad on the POLY engine; touch pressure (vertical position on the pads) and a slow LFO open the filter.',
      p: {
        'poly.wave': 0.35, 'poly.detune': 0.55, 'poly.atk': 700, 'poly.dec': 1200, 'poly.sus': 0.8, 'poly.rel': 2600, 'poly.cut': 900, 'poly.res': 0.3, 'poly.level': 0.8,
        'lfo2.rate': 0.12,
        'mix.l1': 1, 'mix.l2': 0.3,
        'delay.time': 0.6, 'delay.fb': 0.4, 'delay.mix': 0.3, 'delay.wow': 0.25,
        'verb.size': 0.9, 'verb.decay': 0.75, 'verb.mix': 0.45, 'out.level': 2.0
      },
      c: [['touch.press', 'mix.in1'], ['lfo2.uni', 'mix.in2'], ['mix.out', 'poly.cut'], ['poly.out', 'delay.in'],
        ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Cross-Mod Bells', cat: WEST,
      notes: 'Two oscillators frequency-modulate each other at audio rate; a sequencer moves the pitch and the gates strike both.',
      p: {
        'clock.bpm': 92, 'clock.mult': 1,
        'seq.quant': 7, 'seq.range': 1.5, 'seq.dir': 2,
        'cplx.pfreq': 220, 'cplx.fmx': 0.35, 'cplx.timbre': 0.1,
        'fmv.freq': 329.6, 'fmv.ratio': 1.5, 'fmv.index': 0.5, 'fmv.iAmt': 0.3,
        'lpg.m1': 1, 'lpg.v1': 0.6, 'lpg.m2': 1, 'lpg.v2': 0.45,
        'mix.l1': 0.7, 'mix.l2': 0.55,
        'delay.time': 0.65, 'delay.fb': 0.4, 'delay.mix': 0.3,
        'verb.mix': 0.35, 'out.level': 0.72
      },
      c: [['seq.cv', 'cplx.pitch'], ['seq.cv', 'fmv.pitch'], ['fmv.out', 'cplx.fm'], ['cplx.out', 'fmv.idx'],
        ['seq.trig', 'lpg.ping1'], ['seq.gate', 'lpg.ping2'], ['cplx.out', 'lpg.in1'], ['fmv.out', 'lpg.in2'],
        ['lpg.out1', 'mix.in1'], ['lpg.out2', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },

    // ═══════════════════════════════ BASTL / TRINITY ═══════════════════════════════
    {
      name: 'Trinity DRUM · Basic Beat', cat: BASTL,
      notes: 'The DRUM engine played by the SQNCR as on the original Trinity: accents, soft notes, 64th ratchets and swing.',
      p: { 'clock.bpm': 112, 'clock.swing': 20, 'drum.drive': 0.25, 'verb.mix': 0.12, 'out.level': 1.16 },
      sq: { k: 'X.....x...X..o..', s: '....X.......X..2', h: 'x.o.x.ox.ox.x.o4', c: '............x...', t: '..........x..x..', b: '.......o........' },
      c: [['drum.mix', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'SQNCR · Ratchets & Skips', cat: BASTL,
      notes: 'Polymeter from per-instrument lengths (16/12/10/7/5/13), skipped steps, flams, late 32nds and ratchets ×2/×3/×4.',
      p: { 'clock.bpm': 104, 'drum.morph': 0.4, 'drum.tt': 0.65, 'drum.drive': 0.3, 'delay.time': 0.21, 'delay.fb': 0.3, 'delay.mix': 0.15, 'out.level': 0.9 },
      sq: { k: 'x...x..-x...x.2.', s: '..f...X.l..3', h: '4.x.2x.x-x', c: '..x.L..', t: 'x.l.o', b: 'x..d..x.-..x.' },
      c: [['drum.mix', 'delay.in'], ['delay.out', 'out.L']]
    },
    {
      name: 'MONO FM · Acid Bass', cat: BASTL,
      notes: 'The MONO FM engine as a bassline: index swept by the function generator, feedback for grit, with a light beat.',
      p: {
        'clock.bpm': 124, 'clock.mult': 2,
        'seq.quant': 3, 'seq.range': 1, 'seq.s1': 0, 'seq.s2': 0, 'seq.s3': 0.58, 'seq.s4': 0, 'seq.s5': 0.25, 'seq.s6': 0.83, 'seq.s7': 0, 'seq.s8': 0.42,
        'seq.g4': 0, 'seq.g7': 0,
        'fmv.freq': 55, 'fmv.ratio': 1, 'fmv.index': 0.8, 'fmv.iAmt': 0.6, 'fmv.fb': 0.35,
        'func1.atk': 1, 'func1.rel': 220, 'func2.atk': 1, 'func2.rel': 160,
        'lpg.m1': 1, 'lpg.v1': 0.05, 'lpg.r1': 0.6,
        'drum.kl': 0.85, 'drum.hl': 0.35,
        'mix.l1': 0.65, 'mix.l2': 0.85,
        'delay.time': 0.363, 'delay.fb': 0.3, 'delay.mix': 0.15, 'out.level': 0.62
      },
      sq: { k: 'x...x...x...x...', h: '..x...x...x...x.', s: '....x.......x...' },
      c: [['seq.cv', 'fmv.pitch'], ['seq.trig', 'func1.trig'], ['seq.trig', 'func2.trig'], ['func2.env', 'fmv.idx'], ['func1.env', 'lpg.cv1'], ['fmv.out', 'lpg.in1'],
        ['drum.mix', 'mix.in1'], ['lpg.out1', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'out.L']]
    },
    {
      name: 'POLY · Arp Strings', cat: BASTL,
      notes: 'A latched chord in the Arpeggiator (SORTED order, two octaves) plays the 4-voice POLY engine directly.',
      p: {
        'clock.bpm': 96, 'clock.mult': 2,
        'arp.algo': 3, 'arp.oct': 2, 'arp.latch': 1, 'arp.gate': 0.7,
        'poly.src': 1, 'poly.wave': 0.1, 'poly.detune': 0.45, 'poly.atk': 25, 'poly.dec': 500, 'poly.sus': 0.6, 'poly.rel': 900, 'poly.cut': 3200, 'poly.res': 0.25, 'poly.level': 1,
        'lfo1.rate': 0.15, 'lfo1.wave': 1,
        'delay.time': 0.47, 'delay.fb': 0.42, 'delay.mix': 0.3,
        'verb.size': 0.8, 'verb.mix': 0.35, 'out.level': 2.0
      },
      arp: [62, 57, 65, 69, 64],
      c: [['lfo1.bi', 'poly.cut'], ['poly.out', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'LFO · XOR Glitch', cat: BASTL,
      notes: 'lfoExtended at audio rate: XOR bits swept by a second LFO, resolution steps and fold threshold make shifting 8-bit waveforms.',
      p: {
        'lfo1.rate': 110, 'lfo1.wave': 1, 'lfo1.thres': 190, 'lfo1.tmode': 0, 'lfo1.res': 24,
        'lfo2.rate': 0.21, 'lfo2.wave': 2,
        'filt.cut': 3500, 'filt.res': 0.35,
        'lpg.o1': 0.55, 'lpg.a1': 0.4, 'lpg.m1': 1,
        'func2.atk': 400, 'func2.rel': 1300, 'func2.loop': 1,
        'delay.time': 0.3, 'delay.fb': 0.4, 'delay.mix': 0.25,
        'verb.mix': 0.2, 'out.level': 0.37
      },
      c: [['lfo2.uni', 'lfo1.xor'], ['lfo1.bi', 'filt.in'], ['filt.lp', 'lpg.in1'], ['func2.env', 'lpg.cv1'],
        ['lpg.out1', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'LFO · Flop Rhythms', cat: BASTL,
      notes: 'FLOP bits zero the LFO on chosen steps, turning one LFO into a rhythm of gates that strikes the LPG; the beat keeps time underneath.',
      p: {
        'clock.bpm': 110,
        'lfo1.rate': 0.458, 'lfo1.wave': 0, 'lfo1.flop': 36,
        'lfo2.rate': 0.229, 'lfo2.wave': 1, 'lfo2.flop': 9,
        'cplx.pfreq': 98, 'cplx.mfreq': 196, 'cplx.fm': 0.3, 'cplx.timbre': 0.3,
        'lpg.m1': 1, 'lpg.v1': 0.15, 'lpg.r1': 0.45,
        'drum.kl': 0.8, 'drum.hl': 0.4,
        'mix.l1': 0.6, 'mix.l2': 0.9,
        'delay.time': 0.273, 'delay.fb': 0.35, 'delay.mix': 0.2, 'out.level': 0.93
      },
      sq: { k: 'x.......x.......', h: '..x...x...x...x.' },
      c: [['clock.bar', 'lfo1.reset'], ['clock.bar', 'lfo2.reset'], ['lfo1.uni', 'lpg.cv1'], ['lfo2.uni', 'cplx.timb'], ['cplx.out', 'lpg.in1'],
        ['drum.mix', 'mix.in1'], ['lpg.out1', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'out.L']]
    },
    {
      name: 'Tap Tempo Dub', cat: BASTL,
      notes: 'Tap the tempo (TAP button or T key): the Tapper averages your taps, and the dub stabs and echoes follow.',
      p: {
        'clock.bpm': 76, 'clock.mult': 1,
        'drum.kt': 0.3, 'drum.kd': 0.6, 'drum.sd': 0.6, 'drum.hl': 0.3,
        'seq.steps': 4, 'seq.quant': 3, 'seq.range': 1, 'seq.s1': 0.25, 'seq.s2': 0.25, 'seq.s3': 0.42, 'seq.s4': 0.17, 'seq.div': 2,
        'fmv.freq': 220, 'fmv.ratio': 2, 'fmv.index': 1.2,
        'lpg.m1': 1, 'lpg.v1': 0.05, 'lpg.r1': 0.3,
        'mix.l1': 0.7, 'mix.l2': 0.7,
        'delay.time': 0.59, 'delay.fb': 0.7, 'delay.tone': 0.35, 'delay.wow': 0.3, 'delay.mix': 0.45,
        'verb.mix': 0.25, 'out.level': 2.0
      },
      sq: { k: 'x.........x.....', s: '........x.......', h: '..x...x...x...x.' },
      c: [['seq.cv', 'fmv.pitch'], ['clock.q', 'lpg.ping1'], ['fmv.out', 'lpg.in1'],
        ['drum.mix', 'mix.in1'], ['lpg.out1', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Mozzi 8-bit Chip', cat: BASTL,
      notes: 'Trinity’s Mozzi heritage: square-wave arpeggios at 16384 Hz and 4 bits, with a crunchy kit.',
      p: {
        'clock.bpm': 140, 'clock.mult': 2,
        'arp.algo': 0, 'arp.oct': 2, 'arp.latch': 1, 'arp.gate': 0.6,
        'cplx.pfreq': 261.6, 'cplx.mshape': 1, 'cplx.mfreq': 261.6, 'cplx.mtrack': 1,
        'func1.atk': 1, 'func1.rel': 120,
        'lpg.m1': 0, 'lpg.v1': 0,
        'mix.l1': 0.6, 'mix.l2': 0.6,
        'bits.bits': 4, 'bits.rate': 16384,
        'out.level': 0.76
      },
      arp: [60, 64, 67, 71],
      sq: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' },
      c: [['arp.pitch', 'cplx.pitch'], ['arp.trig', 'func1.trig'], ['func1.env', 'lpg.cv1'], ['cplx.mod', 'lpg.in1'],
        ['lpg.out1', 'mix.in1'], ['drum.mix', 'mix.in2'], ['mix.out', 'bits.in'], ['bits.out', 'out.L']]
    },

    // ═══════════════════════════════ NOISE & EXPERIMENTAL ═══════════════════════════════
    {
      name: 'Xorshift Choir', cat: NOISE,
      notes: 'The 16-bit xorshift of bastlRandom has a short cycle — at audio rates it sings. Resonant filters pick out a slow chord.',
      p: {
        'clock.bpm': 50, 'clock.mult': 0,
        'noise.rate': 9000,
        'seq.div': 2, 'seq.quant': 2, 'seq.range': 1.5, 'seq.slew': 0.5,
        'filt.cut': 440, 'filt.res': 0.95,
        'lpg.o1': 0.5, 'lpg.a1': 0.5, 'lpg.m1': 2, 'lpg.r1': 0.6,
        'lfo1.wave': 3, 'lfo1.rate': 0.3,
        'mix.l1': 0.9, 'mix.l2': 0.4,
        'verb.size': 0.9, 'verb.decay': 0.75, 'verb.mix': 0.45, 'out.level': 0.47
      },
      c: [['noise.bastl', 'filt.in'], ['seq.cv', 'filt.voct'], ['filt.bp', 'mix.in1'], ['noise.bastl', 'lpg.in1'], ['lfo1.uni', 'lpg.cv1'], ['lpg.out1', 'mix.in2'],
        ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Feedback Cathedral', cat: NOISE,
      notes: 'Tape echo past unity gain: the soft-saturating loop sustains forever without clipping; a slow folder drone feeds it.',
      p: {
        'cplx.pfreq': 110, 'cplx.mfreq': 0.21, 'cplx.fm': 0.2, 'cplx.timbre': 0.25, 'cplx.tAmt': 0.5,
        'lfo1.rate': 0.05, 'lfo1.wave': 3,
        'lpg.o1': 0.25, 'lpg.a1': 0.45, 'lpg.m1': 1,
        'delay.time': 1.7, 'delay.fb': 1.04, 'delay.tone': 0.35, 'delay.wow': 0.45, 'delay.mix': 0.55,
        'verb.size': 1, 'verb.decay': 0.9, 'verb.damp': 0.6, 'verb.mix': 0.55, 'out.level': 1.19
      },
      c: [['lfo1.uni', 'cplx.timb'], ['lfo1.uni', 'lpg.cv1'], ['cplx.out', 'lpg.in1'], ['lpg.out1', 'delay.in'],
        ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Metal Rain', cat: NOISE,
      notes: 'Six-square hats and cowbells in 64th ratchets, ring-modulated against a slowly wandering carrier.',
      p: {
        'clock.bpm': 92,
        'drum.ht': 0.75, 'drum.hd': 0.35, 'drum.hl': 0.8, 'drum.morph': 1, 'drum.bt': 0.7, 'drum.bd': 0.5, 'drum.bl': 0.6, 'drum.kl': 0, 'drum.sl': 0,
        'ring.freq': 140, 'ring.mix': 0.4,
        'lfo1.wave': 3, 'lfo1.rate': 0.1,
        'mix.l1': 1, 'mix.l2': 1, 'mix.master': 1.3,
        'verb.size': 0.7, 'verb.decay': 0.6, 'verb.mix': 0.45, 'out.level': 2.0
      },
      sq: { h: '4.2.4..34.2.4.d4', b: '..x2..4..x...3..', c: '.......x.......' },
      c: [['drum.mix', 'ring.a'], ['lfo1.bi', 'ring.pitch'], ['drum.mix', 'mix.in1'], ['ring.out', 'mix.in2'], ['mix.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Crackle Field', cat: NOISE,
      notes: 'Crackle impulses ring a high-emphasis gate and a resonant filter; the uncertainty source keeps nudging the tuning.',
      p: {
        'noise.dens': 85,
        'filt.cut': 1400, 'filt.res': 0.97, 'filt.amt': 0.8,
        'rand.flux': 0.25,
        'lpg.m1': 2, 'lpg.r1': 0.95, 'lpg.v1': 0.2,
        'mix.l1': 0.6, 'mix.l2': 0.8,
        'delay.time': 0.75, 'delay.fb': 0.5, 'delay.mix': 0.35,
        'verb.mix': 0.4, 'out.level': 1.51
      },
      c: [['noise.crack', 'filt.in'], ['rand.flux', 'filt.cv'], ['filt.bp', 'mix.in1'], ['noise.crack', 'lpg.in1'], ['noise.crack', 'lpg.ping1'],
        ['lpg.out1', 'mix.in2'], ['mix.out', 'delay.in'], ['delay.out', 'verb.inL'], ['verb.L', 'out.L'], ['verb.R', 'out.R']]
    },
    {
      name: 'Init · Keys Voice', cat: NOISE, keys: true,
      notes: 'Starting point: touch plate → complex oscillator → low pass gate opened by function 1. Everything else is free to patch.',
      p: { 'cplx.pfreq': 261.6, 'func1.atk': 5, 'func1.dec': 300, 'func1.sus': 0.6, 'func1.rel': 400, 'lpg.m1': 1, 'out.level': 0.28 },
      c: [['cplx.out', 'lpg.in1'], ['func1.env', 'lpg.cv1'], ['lpg.out1', 'out.L']]
    }
  ];

  root.MASTER_PRESETS = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
