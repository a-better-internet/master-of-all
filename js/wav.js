/*
 * 24-bit PCM WAV encoder with TPDF dither.
 * Input: arrays of Float32Array chunks for L and R (equal total length).
 */
(function (root) {
  'use strict';
  function encodeWav24(chunksL, chunksR, sampleRate) {
    var total = 0, i;
    for (i = 0; i < chunksL.length; i++) total += chunksL[i].length;
    var bytes = 44 + total * 6;
    var buf = new ArrayBuffer(bytes), dv = new DataView(buf), u8 = new Uint8Array(buf);
    function str(o, s) { for (var k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + total * 6, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 6, true); dv.setUint16(32, 6, true); dv.setUint16(34, 24, true);
    str(36, 'data'); dv.setUint32(40, total * 6, true);
    var o = 44, FS = 8388607, seed = 22222;
    function r() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var c = 0; c < chunksL.length; c++) {
      var L = chunksL[c], R = chunksR[c] || L;
      for (i = 0; i < L.length; i++) {
        for (var ch = 0; ch < 2; ch++) {
          var x = ch ? R[i] : L[i];
          if (!(x === x)) x = 0;
          var v = Math.round((x > 1 ? 1 : x < -1 ? -1 : x) * FS + (r() - r()));
          if (v > FS) v = FS; else if (v < -FS - 1) v = -FS - 1;
          if (v < 0) v += 16777216;
          u8[o++] = v & 255; u8[o++] = (v >> 8) & 255; u8[o++] = (v >> 16) & 255;
        }
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  root.encodeWav24 = encodeWav24;
})(typeof globalThis !== 'undefined' ? globalThis : this);
