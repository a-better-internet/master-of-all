/*
 * MASTER OF ALL — module specifications (shared by UI thread and DSP worklet)
 *
 * Every module of the rack is described here: its knobs (params), its input and
 * output jacks, and its "normalled" connections (west-coast style default
 * routings that are active while nothing is patched into that input).
 *
 * Param curves: lin | exp | pow | int | enum | bool
 * Signal conventions:
 *   audio   : ±1
 *   CV      : 0..1 unipolar or ±1 bipolar
 *   pitch   : 1.0 per octave ("1V/oct"), 0 = middle C
 *   gates   : 0 / >0 (amplitude may carry velocity)
 */
(function (root) {
  'use strict';

  function p(k, label, min, max, def, curve, opt) {
    curve = curve || 'lin';
    opt = opt || {};
    var q = {
      k: k, label: label, min: min, max: max, def: def, curve: curve,
      smooth: (curve === 'lin' || curve === 'exp' || curve === 'pow') && !opt.noSmooth,
      unit: opt.unit || '', dec: opt.dec, options: opt.options || null, small: !!opt.small
    };
    return q;
  }

  var VEL = ['SAW', 'TRI', 'RANDOM', 'SMOOTH'];

  function lfo(id, title, rate) {
    return {
      id: id, type: 'lfo', title: title, lib: 'lfoExtended · LFOSimple · LFORandom', w: 2, row: 2,
      params: [
        p('rate', 'RATE', 0.01, 800, rate, 'exp', { unit: ' Hz', dec: 2 }),
        p('wave', 'WAVE', 0, 3, 1, 'enum', { options: VEL }),
        p('res', 'RESOL', 0, 64, 0, 'int'),
        p('flop', 'FLOP', 0, 255, 0, 'int'),
        p('xor', 'XOR', 0, 255, 0, 'int'),
        p('thres', 'THRES', 1, 255, 255, 'int'),
        p('tmode', 'THR MODE', 0, 1, 0, 'enum', { options: ['FOLD', 'OVER'] }),
        p('smooth', 'SMOOTH', 0, 255, 128, 'int')
      ],
      ins: ['rate', 'reset', 'xor'],
      outs: ['uni', 'bi', 'inv', 'sq', 'eoc']
    };
  }

  function func(id, title, normals) {
    return {
      id: id, type: 'func', title: title, lib: 'expADSR (EarLevel)', w: 2, row: 2,
      params: [
        p('atk', 'ATTACK', 0.5, 10000, 5, 'exp', { unit: ' ms', dec: 1 }),
        p('dec', 'DECAY', 1, 10000, 250, 'exp', { unit: ' ms', dec: 0 }),
        p('sus', 'SUSTAIN', 0, 1, 0, 'lin'),
        p('rel', 'RELEASE', 1, 10000, 400, 'exp', { unit: ' ms', dec: 0 }),
        p('hold', 'HOLD', 0, 2000, 0, 'pow', { unit: ' ms', dec: 0 }),
        p('cA', 'CURVE A', 0.0001, 10, 0.3, 'exp', { dec: 4 }),
        p('cDR', 'CURVE DR', 0.0001, 10, 0.0001, 'exp', { dec: 4 }),
        p('loop', 'CYCLE', 0, 1, 0, 'bool')
      ],
      ins: ['gate', 'trig', 'time'],
      outs: ['env', 'inv', 'eor', 'eoc'],
      normals: normals || {}
    };
  }

  var SPECS = [
    // ───────────────────────────── ROW 0 : CONTROL ─────────────────────────────
    {
      id: 'clock', type: 'clock', title: 'CLOCK', lib: 'BastlMetronome · Tapper · BPMConverter · MIDIStepper', w: 2, row: 0,
      params: [
        p('bpm', 'TEMPO', 20, 300, 112, 'lin', { unit: ' bpm', dec: 1 }),
        p('mult', 'MULT', 0, 3, 1, 'enum', { options: ['×1', '×2', '×4', '×8'] }),
        p('swing', 'SWING', 0, 55, 0, 'lin', { dec: 0 }),
        p('width', 'WIDTH', 0.05, 0.9, 0.3, 'lin'),
        p('run', 'RUN', 0, 1, 1, 'bool')
      ],
      ins: ['ext', 'rst'],
      outs: ['q', 'mult', 's16', 'bar', 'rst'],
      custom: 'clock'
    },
    {
      id: 'sqncr', type: 'sqncr', title: 'SQNCR', lib: 'Player · DrumStep · PlayerSettings · StepRecorder · NoVelocityStepMemory · StepSynchronizer', w: 8, row: 0,
      params: [
        p('pattern', 'PATTERN', 0, 7, 0, 'int'),
        p('l1', 'LEN KCK', 1, 64, 16, 'int', { small: true }),
        p('l2', 'LEN SNR', 1, 64, 16, 'int', { small: true }),
        p('l3', 'LEN HAT', 1, 64, 16, 'int', { small: true }),
        p('l4', 'LEN CLP', 1, 64, 16, 'int', { small: true }),
        p('l5', 'LEN TOM', 1, 64, 16, 'int', { small: true }),
        p('l6', 'LEN BEL', 1, 64, 16, 'int', { small: true }),
        p('tlen', 'TRIG LEN', 0, 7, 2, 'int'),
        p('quant', 'REC Q', 0, 3, 0, 'enum', { options: ['1/64', '1/32', '1/16', '1/8'] }),
        p('rec', 'REC', 0, 1, 0, 'bool'),
        p('loop', 'LOOP', 0, 1, 0, 'bool'),
        p('mom', 'PAT MOM', 0, 1, 0, 'bool')
      ],
      ins: ['clk', 'rst', 'loop', 'pat'],
      outs: ['t1', 't2', 't3', 't4', 't5', 't6', 'any'],
      normals: { clk: 'clock.s16', rst: 'clock.rst' },
      custom: 'sqncr'
    },
    {
      id: 'touch', type: 'touch', title: 'TOUCH PLATE', lib: 'MIDInoteBuffer · Web MIDI · keys', w: 4, row: 0,
      params: [
        p('oct', 'OCTAVE', -3, 3, 0, 'int'),
        p('glide', 'GLIDE', 0, 1, 0, 'pow')
      ],
      ins: [],
      outs: ['pitch', 'gate', 'press', 'vel', 'pos'],
      custom: 'touch'
    },
    {
      id: 'arp', type: 'arp', title: 'ARP', lib: 'Arpeggiator', w: 2, row: 0,
      params: [
        p('algo', 'ORDER', 0, 4, 0, 'enum', { options: ['UP', 'DOWN', 'UP/DN', 'SORT', 'RND'] }),
        p('win', 'WINDOW', 1, 20, 20, 'int'),
        p('oct', 'OCTAVES', 1, 4, 1, 'int'),
        p('gate', 'GATE', 0.05, 1, 0.5, 'lin'),
        p('latch', 'LATCH', 0, 1, 0, 'bool')
      ],
      ins: ['clk', 'rst', 'trans'],
      outs: ['pitch', 'gate', 'trig'],
      normals: { clk: 'clock.mult', rst: 'clock.rst' },
      custom: 'arp'
    },
    {
      id: 'seq', type: 'seq', title: 'SEQUENTIAL VOLTAGE', lib: 'Stepper · mapping', w: 5, row: 2,
      params: [
        p('s1', '1', 0, 1, 0.00, 'lin'), p('s2', '2', 0, 1, 0.25, 'lin'),
        p('s3', '3', 0, 1, 0.50, 'lin'), p('s4', '4', 0, 1, 0.33, 'lin'),
        p('s5', '5', 0, 1, 0.75, 'lin'), p('s6', '6', 0, 1, 0.17, 'lin'),
        p('s7', '7', 0, 1, 0.58, 'lin'), p('s8', '8', 0, 1, 0.42, 'lin'),
        p('g1', 'G1', 0, 1, 1, 'bool'), p('g2', 'G2', 0, 1, 1, 'bool'),
        p('g3', 'G3', 0, 1, 1, 'bool'), p('g4', 'G4', 0, 1, 1, 'bool'),
        p('g5', 'G5', 0, 1, 1, 'bool'), p('g6', 'G6', 0, 1, 1, 'bool'),
        p('g7', 'G7', 0, 1, 1, 'bool'), p('g8', 'G8', 0, 1, 1, 'bool'),
        p('steps', 'STEPS', 2, 8, 8, 'int'),
        p('dir', 'DIR', 0, 3, 0, 'enum', { options: ['FWD', 'REV', 'PING', 'RND'] }),
        p('range', 'RANGE', 0, 4, 1, 'lin', { unit: ' oct', dec: 2 }),
        p('quant', 'SCALE', 0, 7, 6, 'enum', { options: ['OFF', 'CHROM', 'MAJOR', 'MINOR', 'DORIAN', 'PHR-DOM', 'PENTA', 'WHOLE'] }),
        p('slew', 'SLEW', 0, 1, 0, 'pow'),
        p('div', 'DIVIDE', 1, 16, 1, 'int')
      ],
      ins: ['clk', 'rst', 'addr', 'trans'],
      outs: ['cv', 'raw', 'gate', 'trig', 'eoc'],
      normals: { clk: 'clock.mult', rst: 'clock.rst' },
      custom: 'seq'
    },

    // ───────────────────────────── ROW 1 : SOURCES ─────────────────────────────
    {
      id: 'cplx', type: 'cplx', title: 'COMPLEX OSC', lib: 'west coast · Mozzi oscil', w: 4, row: 1,
      params: [
        p('mfreq', 'MOD FREQ', 0.05, 2000, 3, 'exp', { unit: ' Hz', dec: 2 }),
        p('mshape', 'MOD SHAPE', 0, 1, 0, 'lin'),
        p('mtrack', 'MOD TRACK', 0, 1, 0, 'bool'),
        p('pfreq', 'PRINCIPAL', 20, 2000, 110, 'exp', { unit: ' Hz', dec: 1 }),
        p('fine', 'FINE', -1, 1, 0, 'lin', { unit: ' st', dec: 2 }),
        p('fm', 'FM INDEX', 0, 1, 0, 'pow'),
        p('am', 'AM', 0, 1, 0, 'lin'),
        p('timbre', 'TIMBRE', 0, 1, 0, 'lin'),
        p('sym', 'SYMMETRY', -1, 1, 0, 'lin'),
        p('tAmt', 'TIMB CV', -1, 1, 0.5, 'lin'),
        p('fmx', 'EXT FM', -1, 1, 0, 'lin')
      ],
      ins: ['pitch', 'mpitch', 'fm', 'timb', 'sym'],
      outs: ['mod', 'sine', 'out'],
      normals: { pitch: 'touch.pitch' }
    },
    {
      id: 'fmv', type: 'fmv', title: 'MONO FM', lib: 'Trinity MONO FM', w: 3, row: 1,
      params: [
        p('freq', 'FREQ', 20, 2000, 55, 'exp', { unit: ' Hz', dec: 1 }),
        p('ratio', 'RATIO', 0.25, 8, 2, 'exp', { dec: 3 }),
        p('snap', 'SNAP', 0, 1, 1, 'bool'),
        p('index', 'INDEX', 0, 10, 2, 'lin'),
        p('fb', 'FEEDBACK', 0, 1, 0, 'lin'),
        p('iAmt', 'IDX CV', -1, 1, 0.5, 'lin')
      ],
      ins: ['pitch', 'idx'],
      outs: ['out', 'mod'],
      normals: { pitch: 'touch.pitch' }
    },
    {
      id: 'poly', type: 'poly', title: 'POLY', lib: 'Trinity POLY · MIDInoteBuffer · expADSR', w: 4, row: 1,
      params: [
        p('wave', 'WAVE', 0, 1, 0, 'lin'),
        p('detune', 'DETUNE', 0, 1, 0.2, 'lin'),
        p('atk', 'ATTACK', 1, 5000, 8, 'exp', { unit: ' ms', dec: 0 }),
        p('dec', 'DECAY', 1, 5000, 400, 'exp', { unit: ' ms', dec: 0 }),
        p('sus', 'SUSTAIN', 0, 1, 0.7, 'lin'),
        p('rel', 'RELEASE', 1, 8000, 600, 'exp', { unit: ' ms', dec: 0 }),
        p('cut', 'CUTOFF', 60, 16000, 3000, 'exp', { unit: ' Hz', dec: 0 }),
        p('res', 'RESO', 0, 1, 0.2, 'lin'),
        p('src', 'SOURCE', 0, 1, 0, 'enum', { options: ['KEYS', 'ARP'] }),
        p('trans', 'TRANSP', -24, 24, 0, 'int', { unit: ' st' }),
        p('level', 'LEVEL', 0, 1, 0.7, 'lin')
      ],
      ins: ['pitch', 'cut'],
      outs: ['out', 'gate']
    },
    {
      id: 'drum', type: 'drum', title: 'DRUM', lib: 'Trinity DRUM', w: 6, row: 1,
      params: [
        p('kt', 'TUNE', 0, 1, 0.5, 'lin', { small: true }), p('kd', 'DECAY', 0, 1, 0.5, 'lin', { small: true }), p('kl', 'LEVEL', 0, 1, 0.9, 'lin', { small: true }),
        p('st', 'TUNE', 0, 1, 0.5, 'lin', { small: true }), p('sd', 'DECAY', 0, 1, 0.4, 'lin', { small: true }), p('sl', 'LEVEL', 0, 1, 0.7, 'lin', { small: true }),
        p('ht', 'TUNE', 0, 1, 0.5, 'lin', { small: true }), p('hd', 'DECAY', 0, 1, 0.2, 'lin', { small: true }), p('hl', 'LEVEL', 0, 1, 0.5, 'lin', { small: true }),
        p('ct', 'TUNE', 0, 1, 0.5, 'lin', { small: true }), p('cd', 'DECAY', 0, 1, 0.4, 'lin', { small: true }), p('cl', 'LEVEL', 0, 1, 0.6, 'lin', { small: true }),
        p('tt', 'TUNE', 0, 1, 0.5, 'lin', { small: true }), p('td', 'DECAY', 0, 1, 0.4, 'lin', { small: true }), p('tl', 'LEVEL', 0, 1, 0.7, 'lin', { small: true }),
        p('bt', 'TUNE', 0, 1, 0.5, 'lin', { small: true }), p('bd', 'DECAY', 0, 1, 0.3, 'lin', { small: true }), p('bl', 'LEVEL', 0, 1, 0.6, 'lin', { small: true }),
        p('snap', 'SNAPPY', 0, 1, 0.5, 'lin'),
        p('morph', 'CLAVE↔BELL', 0, 1, 0, 'lin'),
        p('drive', 'DRIVE', 0, 1, 0.2, 'lin')
      ],
      ins: ['t1', 't2', 't3', 't4', 't5', 't6', 'pitch'],
      outs: ['mix', 'kick', 'snare', 'hat', 'clap', 'tom', 'bell'],
      normals: { t1: 'sqncr.t1', t2: 'sqncr.t2', t3: 'sqncr.t3', t4: 'sqncr.t4', t5: 'sqncr.t5', t6: 'sqncr.t6' },
      custom: 'drum'
    },
    {
      id: 'noise', type: 'noise', title: 'NOISE', lib: 'bastlRandom (xorshift16)', w: 2, row: 1,
      params: [
        p('rate', 'BASTL RATE', 50, 48000, 4000, 'exp', { unit: ' Hz', dec: 0 }),
        p('dens', 'CRACKLE', 0.5, 2000, 20, 'exp', { unit: ' /s', dec: 1 })
      ],
      ins: [],
      outs: ['white', 'pink', 'bastl', 'crack']
    },

    // ───────────────────────────── ROW 2 : MODULATION ─────────────────────────────
    lfo('lfo1', 'LFO 1', 1),
    lfo('lfo2', 'LFO 2', 0.3),
    func('func1', 'FUNCTION 1', { gate: 'touch.gate' }),
    func('func2', 'FUNCTION 2'),
    {
      id: 'rand', type: 'rand', title: 'UNCERTAINTY', lib: 'interpolatingBuffer · movingAverage', w: 3, row: 2,
      params: [
        p('chg', 'CHANGE', 0, 1, 1, 'lin'),
        p('walk', 'WALK', 0, 1, 0.25, 'lin'),
        p('len', 'LENGTH', 2, 32, 16, 'int'),
        p('interp', 'INTERP', 0, 1, 0, 'lin'),
        p('smooth', 'SMOOTH', 0, 1, 0, 'lin'),
        p('gprob', 'GATE PROB', 0, 1, 0.5, 'lin'),
        p('flux', 'FLUX RATE', 0.05, 50, 0.5, 'exp', { unit: ' Hz', dec: 2 })
      ],
      ins: ['clk', 'chg'],
      outs: ['step', 'smooth', 'gate', 'flux'],
      normals: { clk: 'clock.q' }
    },
    {
      id: 'slew', type: 'slew', title: 'SLEW', lib: 'MovingAverageLinear', w: 2, row: 2,
      params: [
        p('rise', 'RISE', 0.1, 5000, 50, 'exp', { unit: ' ms', dec: 1 }),
        p('fall', 'FALL', 0.1, 5000, 200, 'exp', { unit: ' ms', dec: 1 }),
        p('mode', 'MODE', 0, 2, 0, 'enum', { options: ['EXPO', 'LIN', 'AVG'] })
      ],
      ins: ['in'],
      outs: ['out', 'env']
    },
    {
      id: 'util', type: 'util', title: 'ATTENUVERT', lib: 'mapping', w: 2, row: 2,
      params: [
        p('a1', 'SCALE 1', -1, 1, 1, 'lin'),
        p('o1', 'OFFSET 1', -1, 1, 0, 'lin'),
        p('a2', 'SCALE 2', -1, 1, 1, 'lin'),
        p('o2', 'OFFSET 2', -1, 1, 0, 'lin')
      ],
      ins: ['in1', 'in2'],
      outs: ['out1', 'out2', 'sum']
    },

    // ───────────────────────────── ROW 3 : PROCESSING ─────────────────────────────
    {
      id: 'lpg', type: 'lpg', title: 'DUAL LOW PASS GATE', lib: 'vactrol model', w: 4, row: 3,
      params: [
        p('o1', 'OFFSET', 0, 1, 0, 'lin'), p('a1', 'CV AMT', 0, 1, 1, 'lin'),
        p('m1', 'MODE', 0, 2, 1, 'enum', { options: ['VCA', 'COMBO', 'LP'] }),
        p('r1', 'EMPHASIS', 0, 1, 0.2, 'lin'), p('v1', 'VACTROL', 0, 1, 0.4, 'lin'),
        p('o2', 'OFFSET', 0, 1, 0, 'lin'), p('a2', 'CV AMT', 0, 1, 1, 'lin'),
        p('m2', 'MODE', 0, 2, 1, 'enum', { options: ['VCA', 'COMBO', 'LP'] }),
        p('r2', 'EMPHASIS', 0, 1, 0.2, 'lin'), p('v2', 'VACTROL', 0, 1, 0.4, 'lin')
      ],
      ins: ['in1', 'cv1', 'ping1', 'in2', 'cv2', 'ping2'],
      outs: ['out1', 'out2'],
      custom: 'lpg'
    },
    {
      id: 'fold', type: 'fold', title: 'WAVEFOLDER', lib: 'west coast timbre', w: 2, row: 3,
      params: [
        p('gain', 'FOLDS', 0, 1, 0.3, 'lin'),
        p('sym', 'SYMMETRY', -1, 1, 0, 'lin'),
        p('amt', 'CV AMT', -1, 1, 0.5, 'lin'),
        p('mix', 'MIX', 0, 1, 1, 'lin')
      ],
      ins: ['in', 'cv'],
      outs: ['out']
    },
    {
      id: 'filt', type: 'filt', title: 'FILTER', lib: 'TPT state variable', w: 2, row: 3,
      params: [
        p('cut', 'CUTOFF', 20, 20000, 1200, 'exp', { unit: ' Hz', dec: 0 }),
        p('res', 'RESO', 0, 1, 0.3, 'lin'),
        p('drive', 'DRIVE', 0, 1, 0, 'lin'),
        p('amt', 'CV AMT', -1, 1, 0.5, 'lin')
      ],
      ins: ['in', 'voct', 'cv'],
      outs: ['lp', 'bp', 'hp']
    },
    {
      id: 'ring', type: 'ring', title: 'RING MOD', lib: 'balanced modulator', w: 2, row: 3,
      params: [
        p('freq', 'CARRIER', 1, 5000, 220, 'exp', { unit: ' Hz', dec: 1 }),
        p('mix', 'RING↔AM', 0, 1, 0, 'lin'),
        p('level', 'LEVEL', 0, 1, 0.8, 'lin')
      ],
      ins: ['a', 'b', 'pitch'],
      outs: ['out']
    },
    {
      id: 'mix', type: 'mix', title: 'MIXER', lib: 'DC coupled', w: 2, row: 3,
      params: [
        p('l1', 'IN 1', 0, 1, 0.8, 'lin'), p('l2', 'IN 2', 0, 1, 0.8, 'lin'),
        p('l3', 'IN 3', 0, 1, 0.8, 'lin'), p('l4', 'IN 4', 0, 1, 0.8, 'lin'),
        p('master', 'MASTER', 0, 1.5, 1, 'lin')
      ],
      ins: ['in1', 'in2', 'in3', 'in4'],
      outs: ['out', 'inv']
    },
    {
      id: 'bits', type: 'bits', title: 'MOZZI LO-FI', lib: 'Mozzi 16384 Hz · 8-bit', w: 2, row: 3,
      params: [
        p('bits', 'BITS', 1, 16, 8, 'lin', { dec: 1 }),
        p('rate', 'RATE', 200, 48000, 16384, 'exp', { unit: ' Hz', dec: 0 }),
        p('mix', 'MIX', 0, 1, 1, 'lin')
      ],
      ins: ['in', 'rate'],
      outs: ['out']
    },
    {
      id: 'delay', type: 'delay', title: 'TAPE ECHO', lib: 'tape loop', w: 3, row: 3,
      params: [
        p('time', 'TIME', 0.01, 2.4, 0.35, 'exp', { unit: ' s', dec: 3 }),
        p('fb', 'FEEDBACK', 0, 1.1, 0.4, 'lin'),
        p('wow', 'WOW/FLUT', 0, 1, 0.15, 'lin'),
        p('tone', 'TONE', 0, 1, 0.6, 'lin'),
        p('mix', 'MIX', 0, 1, 0.35, 'lin'),
        p('freeze', 'LOOP', 0, 1, 0, 'bool')
      ],
      ins: ['in', 'time'],
      outs: ['out', 'wet']
    },
    {
      id: 'verb', type: 'verb', title: 'REVERB', lib: '8-line FDN', w: 2, row: 3,
      params: [
        p('size', 'SIZE', 0, 1, 0.6, 'lin'),
        p('decay', 'DECAY', 0, 1, 0.5, 'lin'),
        p('damp', 'DAMP', 0, 1, 0.4, 'lin'),
        p('mix', 'MIX', 0, 1, 0.3, 'lin')
      ],
      ins: ['inL', 'inR'],
      outs: ['L', 'R']
    },
    {
      id: 'out', type: 'out', title: 'OUTPUT', lib: 'DC block · look-ahead limiter', w: 3, row: 3,
      params: [
        p('level', 'LEVEL', 0, 2, 0.8, 'lin')
      ],
      ins: ['L', 'R'],
      outs: [],
      custom: 'out'
    }
  ];

  var BY_ID = {};
  SPECS.forEach(function (s) { BY_ID[s.id] = s; s.normals = s.normals || {}; });

  // Display names for drum tracks (shared by SQNCR + DRUM)
  var TRACKS = ['KICK', 'SNARE', 'HAT', 'CLAP', 'TOM', 'BELL'];

  root.MASTER_SPECS = SPECS;
  root.MASTER_SPEC_BY_ID = BY_ID;
  root.MASTER_TRACKS = TRACKS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
