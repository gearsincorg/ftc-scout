// QR transport: framing, rendering, camera/image scanning, multi-part assembly.
// Uses vendored globals `qrcode` (qrcode-generator) and `jsQR`.
//
// Frame format:  FS1|<kind>|<msgId>|<part>|<parts>|<data>
//   kind: R = scouting record(s), S = schedule
// Big payloads are split into parts; the display cycles through them and the
// scanner collects them in any order.

import { h, clear, pickFile } from './ui.js';

const TAG = 'FS1';
// Chars per QR code. Kept small, with low error correction, so each code has
// few modules (~61x61) and a webcam or tablet camera can read it off a screen
// from a comfortable distance. Bigger payloads just become more cycling parts.
const CHUNK = 300;
const EC = 'L';

// QR byte mode is safest with pure ASCII; escape anything else as \uXXXX.
export const asciiJSON = obj =>
  JSON.stringify(obj).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function makeFrames(kind, payload) {
  const id = Math.random().toString(36).slice(2, 6);
  const n = Math.max(1, Math.ceil(payload.length / CHUNK));
  const size = Math.ceil(payload.length / n); // equal parts, so no part is extra dense
  const out = [];
  for (let i = 0; i < n; i++) out.push([TAG, kind, id, i + 1, n, payload.slice(i * size, (i + 1) * size)].join('|'));
  return out;
}

export function parseFrame(text) {
  if (!text || !text.startsWith(TAG + '|')) return null;
  const p = text.split('|');
  if (p.length < 6) return null;
  return { kind: p[1], id: p[2], i: +p[3], n: +p[4], data: p.slice(5).join('|') };
}

// Largest QR that fits the screen with room for the sheet header and buttons.
export const qrSize = () => Math.max(240, Math.min(600, window.innerWidth - 48, window.innerHeight - 230));

// Draw one QR code into a canvas.
export function qrCanvas(text, px = 360) {
  const qr = qrcode(0, EC);
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount(), quiet = 4, total = n + quiet * 2;
  const scale = Math.max(2, Math.floor(px / total));
  const c = h('canvas', { class: 'qr', width: total * scale, height: total * scale });
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (qr.isDark(r, col)) g.fillRect((col + quiet) * scale, (r + quiet) * scale, scale, scale);
  return c;
}

// Show frames in a container; cycles automatically when there are several.
// Returns a stop() function.
export function showFrames(container, frames, px) {
  clear(container);
  let i = 0, timer = null, paused = false;
  const holder = h('div', { class: 'qr-holder' });
  const label = h('div', { class: 'qr-part' });
  const draw = () => {
    clear(holder).append(qrCanvas(frames[i], px));
    label.textContent = frames.length > 1 ? `Part ${i + 1} of ${frames.length}` : '';
  };
  container.append(holder, label);
  if (frames.length > 1) {
    const step = d => { i = (i + d + frames.length) % frames.length; draw(); };
    const pauseBtn = h('button', { class: 'btn small', onclick: () => {
      paused = !paused; pauseBtn.textContent = paused ? 'Play' : 'Pause';
    } }, 'Pause');
    container.append(h('div', { class: 'row center' },
      h('button', { class: 'btn small', onclick: () => step(-1) }, '◀'), pauseBtn,
      h('button', { class: 'btn small', onclick: () => step(1) }, '▶')));
    timer = setInterval(() => { if (!paused) step(1); }, 1500);
  }
  draw();
  return () => clearInterval(timer);
}

// Collects frames until a message is complete, then calls onMessage(kind, data).
export class Assembler {
  constructor(onMessage, onProgress) {
    this.msgs = new Map();
    this.done = new Set();
    this.onMessage = onMessage;
    this.onProgress = onProgress || (() => {});
  }
  push(text) {
    const f = parseFrame(text);
    if (!f) return false;
    const key = f.kind + f.id;
    if (this.done.has(key)) return true; // already delivered; ignore repeats
    let m = this.msgs.get(key);
    if (!m) { m = { n: f.n, parts: new Array(f.n) }; this.msgs.set(key, m); }
    m.parts[f.i - 1] = f.data;
    const have = m.parts.filter(p => p != null).length;
    if (have < m.n) { this.onProgress(have, m.n, Array.from(m.parts, p => p != null)); return true; }
    this.msgs.delete(key);
    this.done.add(key);
    this.onMessage(f.kind, m.parts.join(''));
    return true;
  }
}

// Decode a QR from ImageData. Our codes are dark-on-light, so skip the
// inverted pass (halves the work per frame).
function decodeImageData(img, invert = false) {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' });
  return r ? r.data : null;
}

// Use the browser's built-in detector only where it really reads QR codes
// (Android Chrome, macOS). Elsewhere it may exist but find nothing.
let detectorP;
function getDetector() {
  if (!detectorP) {
    detectorP = (async () => {
      try {
        if (!('BarcodeDetector' in window)) return null;
        const fmts = await BarcodeDetector.getSupportedFormats();
        return fmts.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
      } catch (e) { return null; }
    })();
  }
  return detectorP;
}
async function detect(source) {
  const d = await getDetector();
  if (!d) return null;
  try { return (await d.detect(source)).map(c => c.rawValue); } catch (e) { return null; }
}

// Decode QR codes in an image file (photo or screenshot).
export async function scanImageFile(file) {
  const bmp = await createImageBitmap(file);
  const viaDetector = await detect(bmp);
  if (viaDetector && viaDetector.length) return viaDetector;
  for (const max of [1600, 1000]) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = h('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    const g = c.getContext('2d');
    for (const mirror of [false, true]) { // a mirrored webcam photo needs flipping back
      g.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? c.width : 0, 0);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const t = decodeImageData(g.getImageData(0, 0, c.width, c.height), true);
      if (t) return [t];
    }
  }
  return [];
}

// Live camera scanner. onText is called for each newly seen code.
// Frames alternate between the centre square at full resolution (best for a
// code held in the aiming box) and the whole frame shrunk (code off-centre).
export class Scanner {
  constructor(video, onText) {
    this.video = video;
    this.onText = onText;
    this.canvas = document.createElement('canvas');
    this.last = new Map(); // text -> time seen, to skip repeats
    this.frames = 0;
  }
  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw new Error('Camera needs HTTPS (or localhost) and a browser with camera support.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
    const track = this.stream.getVideoTracks()[0];
    try { // continuous autofocus where supported (Android)
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (e) { /* optional */ }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    this.running = true;
    this.frames = 0;
    this.mirrored = undefined;
    this.loop();
  }
  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
  grab(sx, sy, sw, sh, max, mirror) {
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.round(sw * scale), ht = Math.round(sh * scale);
    this.canvas.width = w; this.canvas.height = ht;
    const g = this.canvas.getContext('2d', { willReadFrequently: true });
    g.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? w : 0, 0); // undo a mirroring webcam driver
    g.drawImage(this.video, sx, sy, sw, sh, 0, 0, w, ht);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return g.getImageData(0, 0, w, ht);
  }
  // Current raw camera frame as a PNG blob (for troubleshooting).
  snapshot() {
    const v = this.video, c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }
  async loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth) {
      this.frames++;
      let texts = await detect(v);
      if (texts == null) {
        // Alternate the centre square at full detail with the whole frame.
        // Some webcams (often on Windows laptops) deliver a mirrored image,
        // which a QR decoder can't read, so also try flipped frames. Once a
        // flipped frame decodes, stick with flipped (and vice versa).
        const W = v.videoWidth, H = v.videoHeight, side = Math.min(W, H);
        const crop = this.frames % 2 === 0;
        const mirror = this.mirrored ?? (this.frames % 4 >= 2);
        const img = crop
          ? this.grab((W - side) / 2, (H - side) / 2, side, side, 1080, mirror)
          : this.grab(0, 0, W, H, 1000, mirror);
        const t = decodeImageData(img, this.frames % 5 === 0);
        if (t && this.mirrored === undefined) this.mirrored = mirror;
        texts = t ? [t] : [];
      }
      const now = Date.now();
      for (const t of texts) {
        if (now - (this.last.get(t) || 0) > 3000) this.onText(t);
        this.last.set(t, now);
      }
    }
    setTimeout(() => this.loop(), 60);
  }
}

// A ready-made scan panel: video, start/stop, photo fallback, paste fallback.
// onMessage(kind, data) receives complete messages.
// Options:
//   autoStart  start the camera as soon as the panel is shown (default true)
//   idleMs     turn the camera off after this long with no code read (default 60 s)
// The camera also stops when the panel leaves the page, and pauses while the
// app is in the background (resuming when it comes back).
export function scanPanel(onMessage, { autoStart = true, idleMs = 60000 } = {}) {
  const status = h('div', { class: 'scan-status' }, 'Camera off');
  const asm = new Assembler((kind, data) => {
    status.textContent = '✓ Received';
    // Handlers may return (a promise of) a short result line to show here,
    // or throw to report a problem.
    Promise.resolve().then(() => onMessage(kind, data))
      .then(m => { if (m) status.textContent = '✓ ' + m; }, e => { status.textContent = '✗ ' + e.message; });
  }, (have, n, got) => {
    status.textContent = `Got ${got.map(g => (g ? '■' : '□')).join('')}  part ${have} of ${n}, keep pointing at the code`;
  });
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true });
  const view = h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-aim' }));
  let lastRead = Date.now();
  const feed = t => {
    lastRead = Date.now(); // any readable code counts as activity
    if (!asm.push(t)) status.textContent = 'Not an FTC Scout code';
  };
  const scanner = new Scanner(video, feed);
  let beat = null, starting = false, pausedForBackground = false;

  const stopCam = msg => {
    clearInterval(beat); beat = null;
    scanner.stop();
    btn.textContent = 'Start camera';
    if (msg) status.textContent = msg;
  };
  const startCam = async () => {
    if (scanner.running || starting) return;
    starting = true;
    try {
      await scanner.start();
      if (!panel.isConnected) { scanner.stop(); return; } // closed while the camera was starting
      btn.textContent = 'Stop camera';
      status.textContent = 'Fill the square with the QR code';
      lastRead = Date.now();
      const t0 = Date.now(), f0 = scanner.frames;
      beat = setInterval(() => {
        if (!panel.isConnected) { stopCam(); return; }            // panel closed or screen changed
        if (Date.now() - lastRead > idleMs) {
          stopCam(`Camera paused after ${Math.round(idleMs / 1000)} s with no code. Tap Start camera to resume.`);
          return;
        }
        if (/^(Fill|Looking)/.test(status.textContent))
          status.textContent = `Looking… ${Math.round((scanner.frames - f0) / ((Date.now() - t0) / 1000))} frames/s · fill the square with the code`;
      }, 1000);
    } catch (e) {
      status.textContent = 'Camera error: ' + e.message + (autoStart ? ' · tap Start camera to try again' : '');
    } finally { starting = false; }
  };

  const onVisibility = () => {
    if (!panel.isConnected) { document.removeEventListener('visibilitychange', onVisibility); return; }
    if (document.hidden && scanner.running) { pausedForBackground = true; stopCam('Camera paused'); }
    else if (!document.hidden && pausedForBackground) { pausedForBackground = false; startCam(); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const btn = h('button', { class: 'btn primary big', onclick: () => {
    pausedForBackground = false;
    if (scanner.running) stopCam('Camera off'); else startCam();
  } }, 'Start camera');
  const photo = h('button', { class: 'btn', onclick: async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const texts = await scanImageFile(f);
    if (!texts.length) status.textContent = 'No QR code found in that image';
    texts.forEach(feed);
  } }, 'Scan a photo');
  const snap = h('button', { class: 'btn', onclick: async () => {
    if (!scanner.running) { status.textContent = 'Start the camera first'; return; }
    const blob = await scanner.snapshot();
    const a = h('a', { href: URL.createObjectURL(blob), download: `camera-frame-${Date.now()}.png` });
    document.body.append(a); a.click(); a.remove();
  } }, 'Save frame');
  const paste = h('button', { class: 'btn', onclick: () => {
    const t = prompt('Paste QR text (FS1|…). Separate several with new lines.');
    if (t) t.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(feed);
  } }, 'Paste text');
  const panel = h('div', { class: 'scan-panel' }, view, status, h('div', { class: 'row wrap' }, btn, photo, paste, snap));
  panel.stop = () => { pausedForBackground = false; stopCam(); };
  panel.feed = feed;
  // Start once the caller has put the panel on the page.
  if (autoStart) setTimeout(() => { if (panel.isConnected && !document.hidden) startCam(); }, 0);
  return panel;
}
