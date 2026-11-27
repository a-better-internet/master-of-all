# MASTER · OF · ALL

A west-coast patchable modular synthesizer that runs in the browser: a complex oscillator, vactrol low pass
gates, function generators, MONO FM and POLY voices, a 6-voice drum machine with a 6-track step sequencer,
bit-twisting LFOs, an arpeggiator, a tap-tempo clock, an uncertainty source, tape echo and reverb.

Open `index.html` in a current Chrome, Edge, Firefox or Safari and press **POWER**. Nothing needs installing
or building, and it works straight from disk (`file://`) or from any static host.

## Features

- **26 modules, fully patchable.** Drag from any output to any input. Cables can fan out from one output, feedback
  loops are allowed, and west-coast *normalled* connections stay active until you patch over them.
- **One clean signal chain.** The whole rack is evaluated sample by sample inside a single AudioWorklet, in
  topological order, with no allocations in the audio loop. Modules that don't reach the output are skipped.
  Measured load is about 4–8 % of one core.
- **No clipping.** Knob moves are smoothed. Oscillators are band-limited (PolyBLEP, 2× oversampled FM and
  folding). DC blockers are fitted throughout, recursive filters have denormal guards, and the OUTPUT has a
  true look-ahead peak limiter with a −0.5 dBFS ceiling. A NaN guard resets the engine if a patch ever goes
  unstable, and preset changes fade out and back in.
- **46 factory presets** in four banks: *Latin Noise 70s/80s* (25), *West Coast* (8), *Digital Machines* (8) and
  *Noise & Experimental* (5).
- **⚄ RANDOM** builds a new patch that is always routed to the output. It picks a voice and a pitch source, adds
  optional processors, a pinged or enveloped low pass gate and an optional second layer, then echo/reverb and
  2–5 modulation cables. Drum patterns and knobs are randomized within safe limits. **Shift-click** (or
  Shift+R) mutates the current patch instead (about 30% of knobs nudged). After either one, the OUTPUT module
  measures loudness for 2.5 s inside the engine and sets its level to about −16 dBFS RMS. Press SAVE to keep a
  result.
- **Your own presets.** SAVE stores a patch in the browser. EXPORT and IMPORT use `.json` files (all knobs,
  cables, the 8 SQNCR patterns and latched ARP notes). Your last session is restored automatically.
- **24-bit recording.** ● REC captures the master output inside the audio thread, after the limiter, and
  saves a stereo 24-bit PCM WAV with TPDF dither at the device sample rate.
- **Playing it:** the on-screen touch plate (with pressure), the computer keyboard, and Web MIDI (notes, CC1
  pressure, clock, start and stop).

## Modules

| Module | What it does |
|---|---|
| CLOCK | 16 internal steps per beat, ×1/×2/×4/×8 multiplication, swing, tap tempo (4-tap average, resets on a tempo change), external/MIDI clock that waits for the next pulse |
| SQNCR | 6 tracks × 8 patterns × 64 steps × 4 substeps; OFF/NORMAL/ACCENT/SOFT velocities, mute, skip, per-track length (polymeter), TRIGGER/GATE event type, trigger length, LOOP (stutter), momentary patterns, live record with 1/64–1/8 quantization |
| DRUM | kick, snare, 6-square hat, clap, tom/conga (pitch CV), clave↔cowbell |
| TOUCH PLATE | last-note-priority keys, glide, pressure, velocity, position |
| ARP | UP / DOWN / UP-DOWN in the order played, SORTED by pitch, RANDOM; window of last N notes, octaves, latch |
| POLY | 4 voices with voice stealing; a freed voice picks up an older held note; can be played by the ARP |
| MONO FM | 2-operator phase modulation with snap-to-ratio and feedback |
| LFO 1/2 | SAW/TRI/RANDOM-slope/SMOOTH-random in an 8-bit domain, FLOP bits, XOR bits (CV-able), resolution, fold/overflow threshold, reset |
| FUNCTION 1/2 | exponential ADSR with curve ratios, HOLD, CYCLE (loop), gate or trigger, time CV |
| UNCERTAINTY | 32-step random-walk / looping buffer, interpolation, smoothing, random gates, smooth flux |
| SLEW | expo / linear / weighted moving-average slew plus an envelope follower |
| NOISE | white, pink, DIGI (sample-rate xorshift noise whose short cycle sings), crackle |
| SEQUENTIAL VOLTAGE | 8 steps with gates, divider, FWD/REV/PING/RND, voltage addressing, scale quantizer |
| ATTENUVERT | two scale/offset channels and their sum |
| LO-FI | bit depth and sample-rate reduction (16384 Hz default) |
| COMPLEX OSC, DUAL LPG, WAVEFOLDER, FILTER, RING MOD, MIXER, TAPE ECHO, REVERB, OUTPUT | through-zero FM + AM + 2× oversampled folder, vactrol gates with ping, ZDF SVF, tape loop with wow/flutter/freeze, 8-line FDN, look-ahead limiter |

## Signal conventions

Audio is ±1. CV is 0…1 or ±1. Pitch is 1.0 per octave, with 0 = middle C. A gate counts as on above 0.4, and its
amplitude carries velocity. Jack colours: amber = audio, cyan = CV, pink = gate, green = pitch.

## The Latin Noise 70s/80s bank

These presets are homages to the techniques and textures of Latin American electronic, electroacoustic and
underground noise scenes. They don't recreate any recording.

- **Argentina:** CLAEM / Di Tella (Buenos Aires), Fernando von Reichenbach's graphic converter, Francisco
  Kröpfl's university phonology studio.
- **Chile:** José Vicente Asuar's COMDASUAR (Santiago), Electrodomésticos, the curfew-era underground, Gabriel
  Brnčić.
- **Mexico:** Quanta's live electronics, Antonio Russek, Decibel's *El Poeta del Ruido*, the synth-punk of Size,
  Jorge Reyes' pre-Hispanic electronic ritual.
- **Brazil:** Jorge Antunes (Brasília), Akira S (São Paulo), Walter Smetak's microtonal *plásticas sonoras*
  (Bahia), Arrigo Barnabé and the Vanguarda Paulista.
- **Peru:** Lima's *subterráneo* and *chicha* scenes, César Bolaños.
- **Elsewhere:** Jacqueline Nova (Bogotá), Medellín's 80s punk, Juan Blanco's electroacoustic studio (Havana),
  Vytas Brenner's Moog folk (Caracas), Alfredo del Mónaco's studio (Caracas), and the cassette culture that
  carried all of it by mail.

## Tests

```bash
node tests/render-presets.js 8 --random 40
```

```bash
node tests/browser-smoke.js
```

`render-presets.js` renders every preset offline through the real DSP engine. With `--random 40` it also renders
40 random patches and a mutation of each. It fails on NaN, on any sample
above the ceiling, on silence, on DC offset, on a pinned limiter, or on slow rendering.

`browser-smoke.js` drives headless Chromium with Playwright. It powers on, cycles every preset, drag-patches a
cable (with auto-scroll), turns a knob, edits the SQNCR, saves and exports a preset, records 2 s, and checks
that the downloaded WAV is 24-bit stereo with no sample above the ceiling.

## Files

```
index.html          page shell and help
css/master.css      rack styling
js/specs.js         module definitions (params, jacks, normals), shared by UI and DSP
js/dsp.js           the AudioWorklet engine (all modules, routing, limiter, recorder tap)
js/patch.js         patch state, compact preset format, (de)serialization
js/presets.js       factory presets
js/ui.js            rack UI: knobs, jacks, cables, sequencer, touch plate
js/app.js           audio boot, preset browser, recording, MIDI, keyboard
js/wav.js           24-bit WAV encoder with TPDF dither
tests/              offline render test and browser end-to-end test
```

## License

Shared under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). See [NOTICE.md](NOTICE.md) for
third-party credits.
