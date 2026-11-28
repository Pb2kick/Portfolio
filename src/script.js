// Progressive enhancement only: all content is visible without JavaScript.
document.documentElement.classList.add('js');

// ---- Dark / light theme ----
// The initial theme is set by the inline script in <head>; this wires up the toggle.
const root = document.documentElement;
const toggle = document.querySelector('[data-theme-toggle]');
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (themeColor) themeColor.setAttribute('content', '#050605'); // the header is Razer dark in both themes
}

function savedTheme() {
  try { return localStorage.getItem('theme'); } catch (e) { return null; }
}

applyTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

if (toggle) {
  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    // Cross-fade the colours for a moment instead of flipping instantly.
    root.classList.add('theme-switching');
    clearTimeout(toggle.fadeTimer);
    toggle.fadeTimer = setTimeout(() => root.classList.remove('theme-switching'), 450);
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked: theme lasts this visit */ }
  });
}

// Follow system changes until the visitor picks a theme themselves.
if (systemLight && systemLight.addEventListener) {
  systemLight.addEventListener('change', (event) => {
    const saved = savedTheme();
    if (saved !== 'light' && saved !== 'dark') applyTheme(event.matches ? 'light' : 'dark');
  });
}

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

// Scroll reveals with CSS transitions. motion.js (GSAP) does these instead when it runs;
// this is the fallback for reduced motion or when GSAP didn't load (see kprMotionOff in <head>).
window.kprStartReveals = function () {
  if (window.kprStartReveals.started) return;
  window.kprStartReveals.started = true;
  const revealItems = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible', 'is-settled'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      if (entry.target.classList.contains('stack-group')) {
        setTimeout(() => entry.target.classList.add('is-settled'), 650);
      }
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  revealItems.forEach((item, index) => {
    // Small stagger for items that enter together (hero lines, process steps).
    item.style.transitionDelay = `${(index % 4) * 70}ms`;
    observer.observe(item);
  });
};
if (!root.classList.contains('motion')) window.kprStartReveals();

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouchMobile = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover) and (pointer: fine)').matches;

// ---- Smooth, eased scrolling for in-page links ("Get in touch", nav, back to top) ----
(function () {
  const root = document.documentElement;
  let frame = null;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function stop() { if (frame) { cancelAnimationFrame(frame); frame = null; root.style.scrollBehavior = ''; } }
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, stop, { passive: true }));

  function glideTo(y, done) {
    stop();
    const start = scrollY, distance = y - start;
    if (reduceMotion || Math.abs(distance) < 2) {
      window.scrollTo(0, y);
      if (done) done();
      return;
    }
    const d = Math.abs(distance);
    const duration = Math.min(1200, Math.max(600, d * 0.4));
    // With Lenis running, let it drive the glide so wheel input and the glide never fight.
    if (window.kprLenis) {
      window.kprLenis.scrollTo(y, { duration: duration / 1000, easing: ease, onComplete: () => { if (done) done(); } });
      return;
    }
    const t0 = performance.now();
    root.style.scrollBehavior = 'auto'; // our animation drives every frame
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, start + distance * ease(t));
      if (t < 1) frame = requestAnimationFrame(step);
      else { frame = null; root.style.scrollBehavior = ''; if (done) done(); }
    };
    frame = requestAnimationFrame(step);
  }
  window.kprGlideTo = glideTo; // the deck below reuses this eased scroll

  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const hash = link.getAttribute('href');
    if (hash.length < 2) return;
    const target = hash === '#top' ? document.body : document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    const margin = hash === '#top' ? 0 : parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const y = hash === '#top' ? 0 : target.getBoundingClientRect().top + scrollY - margin;
    glideTo(Math.max(0, y), () => {
      // Move keyboard focus to where the visitor landed.
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
    if (history.pushState) history.pushState(null, '', hash === '#top' ? location.pathname : hash);
  });
})();

// ---- Site Audio (tactile Razer UI ticks, the splash's slash track and the background music) ----
// The splash sound is one recording: a blade draw, then three slashes. These are where each
// slash hits, in seconds into the file, so the intro can land its strikes exactly on them.
const SPLASH_SFX_HITS = [0.555, 0.940, 1.375];

const siteAudio = (function () {
  const SPLASH_SFX = 'assets/sfx/splash-slashes.mp3';
  const MUSIC_SRC = 'assets/audio/site-music.mp3';

  const toggle = document.querySelector('[data-sound-toggle]');
  const AC = window.AudioContext || window.webkitAudioContext;
  let enabled = true;
  try { enabled = localStorage.getItem('hover-sounds') !== 'off'; } catch (e) { /* storage blocked */ }
  let ctx = null, last = 0, noiseBuf = null;

  // The splash track is small, so fetch it now; it is decoded once there is an audio context.
  const splashBytes = fetch(SPLASH_SFX).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  let splashBuffer = null, splashDecode = null, splashVoice = null, splashToken = 0;
  function splashReady() {
    if (splashBuffer) return Promise.resolve(splashBuffer);
    if (!ctx) return Promise.resolve(null);
    if (!splashDecode) {
      splashDecode = splashBytes
        .then((bytes) => (bytes ? new Promise((res, rej) => ctx.decodeAudioData(bytes.slice(0), res, rej)) : null))
        .then((buf) => (splashBuffer = buf))
        .catch(() => null);
    }
    return splashDecode;
  }

  function render() {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Mute sound' : 'Turn sound on');
    const label = toggle.querySelector('[data-sound-label]');
    if (label) label.textContent = enabled ? 'Mute' : 'Sound on';
  }
  function unlock() {
    if (!AC) return null;
    if (!ctx) { ctx = new AC(); splashReady(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true, capture: true }));

  function getNoiseBuffer() {
    if (!ctx) return null;
    if (!noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Subtle dampened Razer optical-switch / stealth HUD micro-tick
  function playHoverTick(bodyFreq, clickFreq, volume) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - last < 55) return;
    last = nowMs;
    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(clickFreq, t);
    bp.Q.value = 3.2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t);
    nGain.gain.exponentialRampToValueAtTime(volume * 0.7, t + 0.0015);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.013);
    noise.connect(bp).connect(nGain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.018);

    const body = ctx.createOscillator();
    const bGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(bodyFreq, t);
    body.frequency.exponentialRampToValueAtTime(Math.max(48, bodyFreq * 0.34), t + 0.02);
    bGain.gain.setValueAtTime(0.0001, t);
    bGain.gain.exponentialRampToValueAtTime(volume, t + 0.002);
    bGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    body.connect(bGain).connect(ctx.destination);
    body.start(t);
    body.stop(t + 0.026);
  }

  function playUiConfirm() {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    last = 0;
    playHoverTick(195, 2900, 0.045);
    const t = ctx.currentTime + 0.028;
    const ping = ctx.createOscillator();
    const pGain = ctx.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(1480, t);
    pGain.gain.setValueAtTime(0.0001, t);
    pGain.gain.exponentialRampToValueAtTime(0.018, t + 0.003);
    pGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    ping.connect(pGain).connect(ctx.destination);
    ping.start(t);
    ping.stop(t + 0.065);
  }

  // Play the splash track so the file's first moment is heard `delayMs` from now. It runs on
  // the audio clock, offset by the device's output latency, so each slash in the recording
  // lands on its strike on screen. If decoding finishes late, it starts part-way into the
  // file instead, so the slashes that are left still line up.
  function playSplashSfx(delayMs) {
    stopSplashSfx(0);
    if (!enabled || !unlock()) return;
    const requested = performance.now(), token = splashToken;
    splashReady().then((buf) => {
      if (!buf || !enabled || !ctx || token !== splashToken) return;
      const lag = ctx.outputLatency || ctx.baseLatency || 0;
      const lead = (delayMs - (performance.now() - requested)) / 1000 - lag;
      const offset = Math.max(0, -lead);
      if (offset >= buf.duration) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      g.gain.value = 0.9;
      src.connect(g).connect(ctx.destination);
      src.start(ctx.currentTime + Math.max(0, lead), offset);
      const voice = { src, g };
      src.onended = () => { if (splashVoice === voice) splashVoice = null; };
      splashVoice = voice;
    });
  }
  // On skip: fade the slashes out quickly rather than letting them ring over the site.
  function stopSplashSfx(fade = 0.15) {
    splashToken++;
    const v = splashVoice;
    splashVoice = null;
    if (!v || !ctx) return;
    const t = ctx.currentTime;
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.02);
    } catch (e) { /* not started yet or already stopped */ }
  }

  // Tactile switch profiles by element weight
  function soundFor(el) {
    if (el.matches('.btn')) return [185, 2700, 0.042];
    if (el.matches('.stack-list li, .cert-card')) return [295, 3600, 0.022];
    if (el.matches('button')) return [225, 3100, 0.032];
    return [255, 3300, 0.026];
  }
  const HOVERABLE = 'a, button, .stack-list li, .cert-card';
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest(HOVERABLE);
    if (!el || el.closest('[data-game]')) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    const [bodyFreq, clickFreq, vol] = soundFor(el);
    playHoverTick(bodyFreq, clickFreq, vol);
  });

  // ---- Background music: the site's own track, looping quietly under everything ----
  // Streamed from a media element (it is long, so it is never decoded whole) and routed
  // through Web Audio so it can fade in and out smoothly, which element volume can't do on
  // iOS. Plays only after "Enter with sound", and pauses while the tab is hidden.
  const music = (function () {
    const LEVEL = 0.178; // background level (was 0.22, then lowered 10% twice)
    let el = null, gain = null, playing = false, fadeTimer = 0;

    function setup() {
      if (el) return true;
      if (!unlock()) return false;
      el = new Audio(MUSIC_SRC);
      el.loop = true;
      el.preload = 'auto';
      try {
        gain = ctx.createGain();
        gain.gain.value = 0.0001;
        ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
      } catch (e) {
        gain = null; // no Web Audio routing: fall back to the element's own volume
        el.volume = LEVEL;
      }
      return true;
    }
    function fadeTo(level, seconds) {
      if (!gain) return;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t + seconds);
    }
    // Called inside the "Enter with sound" click: browsers (iOS Safari above all) only let a
    // media element play from a gesture, so play it silently there and stop it again. After
    // that it may start on its own, which it does once the first slash has landed.
    function prime() {
      if (playing || !setup() || el.dataset.primed) return;
      el.dataset.primed = '1';
      const p = el.play();
      const rewind = () => { if (!playing) { el.pause(); el.currentTime = 0; } };
      if (p && p.then) p.then(rewind, () => {}); else rewind();
    }
    function start() {
      if (playing || !setup()) return;
      playing = true;
      clearTimeout(fadeTimer);
      const p = el.play();
      if (p && p.catch) p.catch(() => { playing = false; });
      fadeTo(LEVEL, 2); // fade in
    }
    function stop() {
      if (!playing) return;
      playing = false;
      fadeTo(0.0001, 0.8);
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => { if (!playing && el) el.pause(); }, gain ? 850 : 0);
    }
    document.addEventListener('visibilitychange', () => {
      if (!el || !playing) return;
      if (document.hidden) el.pause();
      else {
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        el.play().catch(() => {});
      }
    });
    return { prime, start, stop, isPlaying: () => playing };
  })();

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem('hover-sounds', enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    render();
    if (enabled) unlock();
    else music.stop();
  }

  // The dock's mute button: the intro decides sound; this only lets a visitor change their mind.
  if (toggle) {
    toggle.addEventListener('click', () => {
      setEnabled(!enabled);
      if (enabled) { playUiConfirm(); music.start(); }
    });
  }
  render();

  return {
    unlock,
    setEnabled,
    primeMusic: () => { if (enabled) music.prime(); },
    startMusic: () => { if (enabled) music.start(); },
    isMusicPlaying: () => music.isPlaying(),
    playSplashSfx,
    stopSplashSfx,
    isEnabled: () => enabled,
  };
})();

// ---- Cyber-ninja blade intro ----
// Every page load opens on a choice: enter with or without sound (that click is also what
// lets the browser play audio). While the visitor decides, an energy dragon coils around
// the KPR mark among rising embers and drifting petals. Choosing charges it: focus lines and
// motes pull in, three blade strikes shatter the reticle and shear the mark, and the dragon
// tears through on the final cleave as the screen parts. Reduced motion: a still gate, then a fade.
window.kprIntro = (function () {
  const splash = document.querySelector('[data-intro-splash]');
  const canvas = document.querySelector('[data-intro-canvas]');
  const midCanvas = document.querySelector('[data-intro-canvas-mid]');
  const backCanvas = document.querySelector('[data-intro-canvas-back]');
  const flashEl = document.querySelector('[data-intro-flash]');
  const skipBtn = document.querySelector('[data-intro-skip]');
  const gate = splash ? splash.querySelector('[data-intro-gate]') : null;
  const ctx2d = canvas ? canvas.getContext('2d') : null;
  const mctx = midCanvas ? midCanvas.getContext('2d') : null;
  const bctx = backCanvas ? backCanvas.getContext('2d') : null;
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let active = root.classList.contains('intro-pending') && !!splash && !!gate;
  const doneCallbacks = [];
  let runToken = 0, timers = [], unblurTimer = 0, doneNotified = false;

  function scrollToTopNow() {
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (window.kprLenis) window.kprLenis.scrollTo(0, { immediate: true, force: true });
    root.style.scrollBehavior = '';
  }

  function notifyDone() {
    if (doneNotified) return;
    doneNotified = true;
    scrollToTopNow();
    active = false;
    while (doneCallbacks.length) {
      const fn = doneCallbacks.shift();
      try { fn(); } catch (e) {}
    }
    requestAnimationFrame(scrollToTopNow);
  }
  function releaseSiteBlur() {
    clearTimeout(unblurTimer);
    if (!root.classList.contains('site-blur-hold')) return;
    void root.offsetWidth;
    root.classList.add('site-unblurring');
    root.classList.remove('site-blur-hold', 'site-glimpse');
    unblurTimer = setTimeout(() => {
      root.classList.remove('site-unblurring');
    }, 1950);
  }
  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  // Blade paths as fractions of the viewport, so they hold on any screen size.
  const STRIKES = [
    // Sweeping full-frame katana wrist arcs forming a natural continuous dragon combo:
    // 1) breaks off orbit top-right -> exits bottom-left, 2) whips back top-left -> clears bottom-right cleanly before Slash 3,
    // 3) single colossal dragon dives top-right -> cleaves KPR dead-center right on HIT3 -> swells into full-screen wipe!
    { step: 1, life: 0.30, pass: { fromOrbit: true, leadMs: 280, stopMs: 38, exitBoost: 1.40, zPeak: 0.95, zBase: 0.22, waveK: 0.028, grow: 1.22, front: false }, widthK: 0.024, minW: 11, flash: 0.22, p0: [0.90, 0.10], cp: [0.44, 0.44], p1: [0.10, 0.90] },
    { step: 2, life: 0.32, pass: { leadMs: 185, stopMs: 36, bodyFrac: 0.52, exitBoost: 1.65, zPeak: 1.85, zBase: 0.30, waveK: 0.044, grow: 2.15, front: true }, widthK: 0.028, minW: 13, flash: 0.28, p0: [0.08, 0.22], cp: [0.54, 0.44], p1: [0.94, 0.78] },
    { step: 3, life: 0.46, widthK: 0.036, minW: 17, flash: 0.46, cleave: true, p0: [1.04, 0.10], cp: [0.49, 0.47], p1: [-0.04, 0.90] },
  ];

  const fx = (ctx2d && !reducedMotion) ? createFx() : null;

  // ---------- VFX engine: one canvas loop for the gate and the strike sequence ----------
  function createFx() {
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInCubic = (t) => t * t * t;
    const quadPt = (p0, cp, p1, t) => {
      const m = 1 - t;
      return { x: m * m * p0.x + 2 * m * t * cp.x + t * t * p1.x, y: m * m * p0.y + 2 * m * t * cp.y + t * t * p1.y };
    };
    const marks = splash.querySelectorAll('.intro-mark');

    let W = innerWidth, H = innerHeight, dpr = 1;
    let raf = 0, running = false, lastFrame = 0, freezeUntil = 0;
    let phase = 'idle', phaseAt = 0, shake = 0, focus = 0, glitchTimer = 0;
    let recoilX = 0, recoilY = 0, recoilVx = 0, recoilVy = 0, markShiftX = 0, markShiftY = 0;
    let ambientAlpha = 1, wiped = false, onClearCb = null;
    // While the sound choice shows, the coil follows the raised emblem and shrinks to fit above the buttons.
    let lift = 0, liftTarget = 0, fit = 1, fitTarget = 1, fitHalf = Infinity;
    const slashes = [], sparks = [], rings = [], motes = [], embers = [], petals = [];
    const logoDebris = [];
    const kprImg = new Image();
    kprImg.src = 'kpr-logo.png';
    const wholeStage = splash.querySelector('.intro-whole');
    const logoMarkEl = splash.querySelector('.intro-whole .intro-mark--logo');
    // Tracks progressive KPR destruction across the 3 strikes:
    //   stage 0: intact
    //   stage 1: deeply scarred along Slash 1's exact `/` line (wounded, NOT yet severed)
    //   stage 2: sheared cleanly in two along Slash 2's exact `\` dragon direction (still carrying Slash 1's scar)
    //   stage 3: shattered & crumbled into 38+ tumbling crystalline shards + neon fracture dust
    let logoDamage = {
      stage: 0, rect: null, scar1: null, cut2: null, scarTex: null, cut2EdgeTex: null,
      shatter: null,
    };

    // Intersects a line through the center of `rect` along direction (p0 -> p1) with all 4 box edges,
    // returning exact CSS polygon strings for both severed halves + exact shear vectors along the blade!
    function computeLogoCut(rect, p0, p1) {
      const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      const cx = w * 0.5, cy = h * 0.5;
      let dx = p1.x - p0.x, dy = p1.y - p0.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const nx = -dy, ny = dx; // perpendicular normal

      const hits = [];
      const pushIfNew = (x, y) => {
        if (x < -0.5 || x > w + 0.5 || y < -0.5 || y > h + 0.5) return;
        const cxp = Math.max(0, Math.min(w, x));
        const cyp = Math.max(0, Math.min(h, y));
        if (!hits.some((q) => Math.hypot(q.x - cxp, q.y - cyp) < 1)) hits.push({ x: cxp, y: cyp });
      };
      if (Math.abs(dx) > 1e-4) {
        pushIfNew(0, cy + ((0 - cx) / dx) * dy);
        pushIfNew(w, cy + ((w - cx) / dx) * dy);
      }
      if (Math.abs(dy) > 1e-4) {
        pushIfNew(cx + ((0 - cy) / dy) * dx, 0);
        pushIfNew(cx + ((h - cy) / dy) * dx, h);
      }
      // Order cut endpoints along (dx, dy) from entry -> exit
      hits.sort((u, v) => ((u.x - cx) * dx + (u.y - cy) * dy) - ((v.x - cx) * dx + (v.y - cy) * dy));
      const a = hits[0] || { x: 0, y: cy };
      const b = hits[1] || { x: w, y: cy };

      const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
      // side < 0 = upper-right half for Slash 2 (`\`); side > 0 = lower-left half
      const sideOf = (pt) => dx * (pt.y - cy) - dy * (pt.x - cx);
      const buildPoly = (wantNeg) => {
        const pts = [a, b, ...corners.filter((c) => (wantNeg ? sideOf(c) <= 0 : sideOf(c) >= 0))];
        const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
        const my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
        pts.sort((u, v) => Math.atan2(u.y - my, u.x - mx) - Math.atan2(v.y - my, v.x - mx));
        return {
          pts,
          css: 'polygon(' + pts.map((q) => `${((q.x / w) * 100).toFixed(2)}% ${((q.y / h) * 100).toFixed(2)}%`).join(', ') + ')',
        };
      };
      const topHalf = buildPoly(true);
      const botHalf = buildPoly(false);
      // Clean, disciplined katana shear along the exact blade vector (dx, dy) scaled to logo width
      // so both 290px desktop and 150px mobile KPR marks split cleanly without excessive vertical offset
      const shearK = Math.max(0.58, Math.min(1.05, w / 245));
      const shiftTop = { x: (dx * 17 - nx * 4.2) * shearK, y: (dy * 17 - ny * 4.2) * shearK, rot: 0.55 };
      const shiftBot = { x: (-dx * 15 + nx * 4.2) * shearK, y: (-dy * 15 + ny * 4.2) * shearK, rot: -0.55 };
      return { w, h, cx, cy, dx, dy, nx, ny, a, b, sideOf, topHalf, botHalf, shiftTop, shiftBot };
    }

    // Exact convex polygon area & Sutherland-Hodgman infinite straight-line half-plane bisector
    function polyArea(pts) {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) * 0.5;
    }
    function splitConvexPoly(poly, px, py, nx, ny) {
      const neg = [], pos = [];
      const side = (q) => (q.x - px) * nx + (q.y - py) * ny;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = side(a), db = side(b);
        if (da <= 1e-4) neg.push(a);
        if (da >= -1e-4) pos.push(a);
        if ((da < -1e-4 && db > 1e-4) || (da > 1e-4 && db < -1e-4)) {
          const t = da / (da - db);
          const inter = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          neg.push(inter);
          pos.push(inter);
        }
      }
      const clean = (pts) => (pts.length >= 3 && polyArea(pts) > 28 ? pts : null);
      return [clean(neg), clean(pos)];
    }

    // Draws a dead-straight, razor-tapered incandescent katana flash beam along (dx, dy)
    function drawRazorLine(c, cx, cy, dx, dy, halfLen, coreW, glowW, alpha) {
      if (alpha <= 0.01 || halfLen <= 1) return;
      const nx = -dy, ny = dx;
      const drawTaper = (hw, fillStyle) => {
        c.beginPath();
        c.moveTo(cx - dx * halfLen, cy - dy * halfLen);
        c.lineTo(cx + nx * hw, cy + ny * hw);
        c.lineTo(cx + dx * halfLen, cy + dy * halfLen);
        c.lineTo(cx - nx * hw, cy - ny * hw);
        c.closePath();
        c.fillStyle = fillStyle;
        c.fill();
      };
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha;
      drawTaper(glowW * 1.45, 'rgba(68, 214, 44, 0.34)');
      drawTaper(glowW * 0.72, 'rgba(40, 240, 180, 0.68)');
      drawTaper(coreW, '#f6fff5');
      c.restore();
    }

    // Renders the exact green-cyan gradient KPR logo onto an offscreen canvas (for incisions & sliced slabs)
    function makeKprSprite(w, h, sc = 2) {
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(w * sc));
      c.height = Math.max(2, Math.round(h * sc));
      const g = c.getContext('2d');
      g.scale(sc, sc);
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#d8ffcf');
      grad.addColorStop(0.45, '#44d62c');
      grad.addColorStop(1, '#28f0b4');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      if (kprImg.complete && kprImg.naturalWidth > 0) {
        g.globalCompositeOperation = 'destination-in';
        const ar = kprImg.naturalWidth / kprImg.naturalHeight;
        let dw = w, dh = h, ox = 0, oy = 0;
        if (w / h > ar) { dw = h * ar; ox = (w - dw) * 0.5; }
        else { dh = w / ar; oy = (h - dh) * 0.5; }
        g.drawImage(kprImg, ox, oy, dw, dh);
      }
      g.globalCompositeOperation = 'source-over';
      return { canvas: c, sc };
    }

    // Slash 1: A single dead-straight, surgical katana incision along `/` — ZERO jagged cracks, ZERO branches!
    // Looks razor-sharp: a clean dark-void blade slit with a crisp metallic specular highlight on the cut lip.
    function makeScarTexture(cut) {
      const sc = 2;
      const { w, h, a, b, cx, cy, dx, dy, nx, ny } = cut;
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(w * sc));
      c.height = Math.max(2, Math.round(h * sc));
      const g = c.getContext('2d');
      g.scale(sc, sc);

      const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.56;
      const slitHW = 1.65;

      // 1) Crisp laser-straight dark-void surgical incision tapered cleanly to needle points
      g.beginPath();
      g.moveTo(cx - dx * len, cy - dy * len);
      g.lineTo(cx + nx * slitHW, cy + ny * slitHW);
      g.lineTo(cx + dx * len, cy + dy * len);
      g.lineTo(cx - nx * slitHW, cy - ny * slitHW);
      g.closePath();
      g.fillStyle = 'rgba(2, 6, 3, 0.98)';
      g.fill();

      // 2) Razor-crisp metallic specular bevel gleaming strictly along the upper & lower lips of the straight cut
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(242, 255, 248, 0.92)';
      g.lineWidth = 1.15;
      g.beginPath();
      g.moveTo(a.x + nx * 1.4, a.y + ny * 1.4);
      g.lineTo(b.x + nx * 1.4, b.y + ny * 1.4);
      g.stroke();

      g.strokeStyle = 'rgba(68, 214, 44, 0.72)';
      g.lineWidth = 1.0;
      g.beginPath();
      g.moveTo(a.x - nx * 1.4, a.y - ny * 1.4);
      g.lineTo(b.x - nx * 1.4, b.y - ny * 1.4);
      g.stroke();

      // Mask strictly inside KPR letters so the surgical blade slit sits cleanly ON the logo!
      if (kprImg.complete && kprImg.naturalWidth > 0) {
        g.globalCompositeOperation = 'destination-in';
        const ar = kprImg.naturalWidth / kprImg.naturalHeight;
        let dw = w, dh = h, ox = 0, oy = 0;
        if (w / h > ar) { dw = h * ar; ox = (w - dw) * 0.5; }
        else { dh = w / ar; oy = (h - dh) * 0.5; }
        g.drawImage(kprImg, ox, oy, dw, dh);
      }
      g.globalCompositeOperation = 'source-over';
      return c;
    }

    // Slash 2: Surgical, razor-thin metallic specular sheen strictly along the freshly severed `\` letter edges
    function makeCutEdgeTexture(cut) {
      const sc = 2;
      const { w, h, a, b } = cut;
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(w * sc));
      c.height = Math.max(2, Math.round(h * sc));
      const g = c.getContext('2d');
      g.scale(sc, sc);
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(40, 240, 180, 0.75)';
      g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.strokeStyle = '#f5fff8';
      g.lineWidth = 1.25;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      if (kprImg.complete && kprImg.naturalWidth > 0) {
        g.globalCompositeOperation = 'destination-in';
        const ar = kprImg.naturalWidth / kprImg.naturalHeight;
        let dw = w, dh = h, ox = 0, oy = 0;
        if (w / h > ar) { dw = h * ar; ox = (w - dw) * 0.5; }
        else { dh = w / ar; oy = (h - dh) * 0.5; }
        g.drawImage(kprImg, ox, oy, dw, dh);
      }
      g.globalCompositeOperation = 'source-over';
      return c;
    }

    function scarLogo(spec) {
      if (!logoMarkEl) return;
      const r = logoMarkEl.getBoundingClientRect();
      if (r.width < 4) return;
      const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      const cut1 = computeLogoCut(rect, at(spec.p0), at(spec.p1));
      logoDamage.stage = 1;
      logoDamage.rect = rect;
      logoDamage.scar1 = cut1;
      logoDamage.scarTex = makeScarTexture(cut1);
      logoDamage.scarFlashBorn = performance.now();
      // Fine razor sparks trailing strictly along Slash 1's `/` exit vector
      const mx = rect.left + cut1.cx, my = rect.top + cut1.cy;
      spawnSparks(mx, my, cut1.dx, cut1.dy, 18, 1.15);
    }

    function sliceLogo(spec) {
      if (!logoMarkEl) return;
      const r = logoMarkEl.getBoundingClientRect();
      if (r.width < 4) return;
      const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      const cut2 = computeLogoCut(rect, at(spec.p0), at(spec.p1));
      logoDamage.stage = 2;
      logoDamage.rect = rect;
      logoDamage.cut2 = cut2;
      logoDamage.cut2EdgeTex = makeCutEdgeTexture(cut2);
      logoDamage.cut2FlashBorn = performance.now();
      if (wholeStage) {
        wholeStage.style.setProperty('--cut-top-poly', cut2.topHalf.css);
        wholeStage.style.setProperty('--cut-bot-poly', cut2.botHalf.css);
        wholeStage.style.setProperty('--cut-shift-a', `translate(${cut2.shiftTop.x.toFixed(1)}px, ${cut2.shiftTop.y.toFixed(1)}px) rotate(${cut2.shiftTop.rot}deg)`);
        wholeStage.style.setProperty('--cut-shift-b', `translate(${cut2.shiftBot.x.toFixed(1)}px, ${cut2.shiftBot.y.toFixed(1)}px) rotate(${cut2.shiftBot.rot}deg)`);
      }
      // Sharp cutting sparks streaming along Slash 2's exact `\` blade trajectory
      const mx = rect.left + cut2.cx, my = rect.top + cut2.cy;
      spawnSparks(mx, my, cut2.dx, cut2.dy, 24, 1.2);
    }

    // Slash 3: True Iaijutsu Multi-Slice Collapse — ZERO blunt cracks, ZERO lightning zigzags, ZERO triangle grid!
    // Mathematically bisects both Slash 2 halves with exact straight katana cut planes (starting with Slash 1's
    // own `/` incision giving way!) into ~22-28 razor-clean geometric slabs of K, P, R that gleam along pure
    // straight blade-lines for one breathless iaijutsu beat, then slide cleanly off each other and crumble downward!
    function shatterLogo(spec, now) {
      const r = logoMarkEl ? logoMarkEl.getBoundingClientRect() : null;
      const rect = (r && r.width > 4) ? { left: r.left, top: r.top, width: r.width, height: r.height } : logoDamage.rect;
      if (!rect || rect.width < 4) return;
      const isMobShatter = isTouchMobile || Math.min(W, H) <= 760;
      const { left, top, width: w, height: h } = rect;
      const { canvas: sprite, sc } = makeKprSprite(w, h, isMobShatter ? 1 : 2);
      // Pre-render ONE dark obsidian letter silhouette once so every slab gets a crisp letter-only rim
      // with zero software shadowBlur AND zero polygon bounding-box artifacts!
      const darkSprite = document.createElement('canvas');
      darkSprite.width = sprite.width;
      darkSprite.height = sprite.height;
      const dg = darkSprite.getContext('2d');
      dg.fillStyle = 'rgba(2, 8, 4, 0.92)';
      dg.fillRect(0, 0, darkSprite.width, darkSprite.height);
      dg.globalCompositeOperation = 'destination-in';
      dg.drawImage(sprite, 0, 0);
      // Pure geometric ink check (replaces synchronous sg.getImageData() GPU->CPU pipeline flush that stalled HIT3!)
      const hasInk = (poly) => {
        if (polyArea(poly) < 34) return false;
        let cx = 0, cy = 0;
        for (const p of poly) { cx += p.x; cy += p.y; }
        cx /= poly.length; cy /= poly.length;
        return cx > w * 0.03 && cx < w * 0.97 && cy > h * 0.06 && cy < h * 0.94;
      };

      const cut1 = logoDamage.scar1 || computeLogoCut(rect, at(STRIKES[0].p0), at(STRIKES[0].p1));
      const cut2 = logoDamage.cut2 || computeLogoCut(rect, at(STRIKES[1].p0), at(STRIKES[1].p1));
      const cut3 = computeLogoCut(rect, at(spec.p0), at(spec.p1));
      const s3x = cut3.dx, s3y = cut3.dy;

      // Start from Slash 2's 2 already-severed halves so Frame 0 transitions seamlessly with zero pop!
      let pieces = [
        { poly: cut2.topHalf.pts, half: 0 },
        { poly: cut2.botHalf.pts, half: 1 },
      ];

      // Dead-straight katana cut planes slicing cleanly through K, P, R (6 cuts on mobile -> ~16 crisp slabs; 8 on desktop):
      const makePlane = (px, py, ang, delay, halfLen) => {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        return { px, py, dx, dy, nx: -dy, ny: dx, delay, halfLen };
      };
      const ang1 = Math.atan2(cut1.dy, cut1.dx);
      const ang2 = Math.atan2(cut2.dy, cut2.dx);
      const ang3 = Math.atan2(cut3.dy, cut3.dx);
      const diag = Math.hypot(w, h);
      const cutPlanes = [
        { px: cut1.cx, py: cut1.cy, dx: cut1.dx, dy: cut1.dy, nx: cut1.nx, ny: cut1.ny, delay: 0, halfLen: diag * 0.95 },
        { px: w * 0.56, py: h * 0.44, dx: cut3.dx, dy: cut3.dy, nx: cut3.nx, ny: cut3.ny, delay: 12, halfLen: diag * 1.25 },
        makePlane(w * 0.24, h * 0.50, ang1 + 0.08, 24, diag * 0.85),
        makePlane(w * 0.77, h * 0.52, ang3 - 0.07, 36, diag * 0.85),
        makePlane(w * 0.46, h * 0.26, ang2 - 0.09, 48, diag * 0.92),
        makePlane(w * 0.54, h * 0.74, ang2 + 0.08, 60, diag * 0.92),
      ];
      if (!isMobShatter) {
        cutPlanes.push(
          makePlane(w * 0.50, h * 0.52, -0.14, 72, diag * 1.05),
          makePlane(w * 0.38, h * 0.48, ang1 + 0.42, 84, diag * 0.78),
        );
      }

      // Sequentially bisect every piece with each straight blade plane!
      for (const pl of cutPlanes) {
        const next = [];
        for (const pc of pieces) {
          const [neg, pos] = splitConvexPoly(pc.poly, pl.px, pl.py, pl.nx, pl.ny);
          if (neg && pos) {
            next.push({ poly: neg, half: pc.half });
            next.push({ poly: pos, half: pc.half });
          } else {
            next.push(pc);
          }
        }
        pieces = next;
      }

      const shards = [];
      for (const pc of pieces) {
        const poly = pc.poly;
        if (!hasInk(poly)) continue;
        let minX = w, minY = h, maxX = 0, maxY = 0;
        let cx = 0, cy = 0;
        for (const p of poly) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
          cx += p.x; cy += p.y;
        }
        cx /= poly.length; cy /= poly.length;

        const pad = isMobShatter ? 4 : 6;
        const bx = minX - pad, by = minY - pad;
        const bw = Math.max(8, (maxX + pad) - bx);
        const bh = Math.max(8, (maxY + pad) - by);

        // Single-canvas razor-sliced KPR slab: letter-only obsidian offset shadow + surgical cut-steel bevels!
        const tc = document.createElement('canvas');
        tc.width = Math.max(2, Math.ceil(bw * sc));
        tc.height = Math.max(2, Math.ceil(bh * sc));
        const tg = tc.getContext('2d');
        tg.scale(sc, sc);
        tg.beginPath();
        tg.moveTo(poly[0].x - bx, poly[0].y - by);
        for (let i = 1; i < poly.length; i++) tg.lineTo(poly[i].x - bx, poly[i].y - by);
        tg.closePath();
        tg.save();
        tg.clip();
        tg.drawImage(sprite, -bx, -by, w, h);
        tg.restore();
        tg.globalCompositeOperation = 'source-atop';
        tg.lineJoin = 'miter';
        tg.strokeStyle = 'rgba(40, 240, 180, 0.72)';
        tg.lineWidth = 2.6;
        tg.stroke();
        tg.strokeStyle = 'rgba(246, 255, 250, 0.96)';
        tg.lineWidth = 1.35;
        tg.stroke();
        // Fast crisp letter-shaped obsidian drop-rim behind the slab (zero polygon box lines, zero shadowBlur!)
        tg.globalCompositeOperation = 'destination-over';
        tg.save();
        tg.translate(1.6, 1.8);
        tg.beginPath();
        tg.moveTo(poly[0].x - bx, poly[0].y - by);
        for (let i = 1; i < poly.length; i++) tg.lineTo(poly[i].x - bx, poly[i].y - by);
        tg.closePath();
        tg.clip();
        tg.drawImage(darkSprite, -bx, -by, w, h);
        tg.restore();
        tg.globalCompositeOperation = 'source-over';

        const shBase = pc.half === 0 ? cut2.shiftTop : cut2.shiftBot;
        const rx = (cx - w * 0.5) / (w * 0.5);
        const ry = (cy - h * 0.5) / (h * 0.5);
        const dist = Math.hypot(rx, ry) + 0.16;
        const dirX = rx / dist, dirY = ry / dist;
        // Side relative to Slash 3's main `/` plane so opposing slices glide cleanly apart along the blade!
        const s3Side = cut3.sideOf({ x: cx, y: cy }) <= 0 ? -1 : 1;
        const s1Side = cut1.sideOf({ x: cx, y: cy }) <= 0 ? -1 : 1;

        // Clean iaijutsu micro-slide during the 165ms stillness beat: pieces slip straight off their cut seams!
        const slipX = s3x * (s3Side * 4.5 + 3.0) + cut1.dx * (s1Side * 3.0) + dirX * rand(2.5, 6.5);
        const slipY = s3y * (s3Side * 4.5 + 3.0) + cut1.dy * (s1Side * 3.0) + dirY * rand(2.5, 6.5);

        // Collapse physics: sliced blocks glide cleanly off one another along the slash planes, then crumble downward!
        const cleavePush = rand(140, 340);
        const slidePush = rand(70, 240);
        const heavy = polyArea(poly) > (w * h) / 28;
        shards.push({
          tex: tc,
          dxDraw: bx - cx,
          dyDraw: by - cy,
          bw, bh,
          x0: left + cx + shBase.x,
          y0: top + cy + shBase.y,
          x: left + cx + shBase.x,
          y: top + cy + shBase.y,
          slipX, slipY,
          vx: s3x * (cleavePush * (0.45 + 0.55 * (s3Side < 0 ? 1 : 0.35))) + dirX * slidePush + rand(-45, 45),
          vy: s3y * (cleavePush * 0.5) + dirY * (slidePush * 0.7) + (heavy ? rand(-20, 90) : rand(-140, 40)),
          grav: heavy ? rand(1150, 1680) : rand(840, 1340),
          rot: (shBase.rot * Math.PI) / 180,
          vr: s3Side * rand(1.8, 6.2) + rand(-1.5, 1.5),
          tilt: 0,
          vtilt: rand(-8.5, 8.5),
          life: 3.4,
          age: 0,
        });
      }

      // Convert cutPlanes into viewport-space straight razor blade flash lines!
      const mcx = left + w * 0.5, mcy = top + h * 0.5;
      const cutFlashes = cutPlanes.map((pl, idx) => ({
        x: left + pl.px,
        y: top + pl.py,
        dx: pl.dx,
        dy: pl.dy,
        halfLen: pl.halfLen,
        delay: pl.delay,
        dur: idx < 2 ? 230 : 185,
        coreW: idx < 2 ? 2.1 : 1.35,
        glowW: idx < 2 ? 6.2 : 3.8,
      }));

      // Sleek razor-thin metallic-emerald blade slivers (NOT chunky triangles!) streaming off the cut seams
      logoDebris.length = 0;
      for (let i = 0; i < 72; i++) {
        const pl = cutPlanes[i % cutPlanes.length];
        const t = rand(-w * 0.45, w * 0.45);
        const px = left + pl.px + pl.dx * t;
        const py = top + pl.py + pl.dy * t;
        const spd = rand(180, 680);
        const dir = Math.random() < 0.7 ? 1 : -1;
        logoDebris.push({
          x: px, y: py,
          vx: pl.dx * spd * dir + s3x * rand(60, 220) + rand(-50, 50),
          vy: pl.dy * spd * dir + s3y * rand(60, 220) + rand(-40, 60),
          grav: rand(220, 520),
          len: rand(7, 22),
          w: rand(0.9, 2.0),
          life: rand(0.35, 0.85), age: 0,
          color: Math.random() < 0.45 ? '#f4fff8' : (Math.random() < 0.65 ? '#28f0b4' : '#44d62c'),
        });
      }

      // Crisp directional blade sparks along Slash 3's exact `/` cleave vector + sleek collapse ring
      spawnSparks(mcx, mcy, s3x, s3y, 32, 1.35);
      spawnSparks(mcx, mcy, -s3x, -s3y, 14, 1.0);
      const bornNow = performance.now();
      rings.push({ x: mcx, y: mcy, born: bornNow + 90, life: 0.56, max: Math.min(W, H) * 0.72, w: 6, flat: false });

      logoDamage.stage = 3;
      logoDamage.shatter = { born: bornNow, holdMs: 90, collapsed: false, w, h, mcx, mcy, shards, cutFlashes };
      splash.classList.add('is-shattered');
    }

    function drawLogoDamage(now) {
      // Stages 1 & 2 sit on mctx (strictly above .intro-mark--logo, strictly behind the front 3D dragon!)
      // and track (markShiftX, markShiftY) so scars stay glued to KPR during recoil and are cleanly occluded!
      const lc = mctx || ctx2d;
      if (logoDamage.stage === 1 && logoDamage.scarTex && logoDamage.rect) {
        const r = logoDamage.rect;
        lc.save();
        lc.translate(markShiftX, markShiftY);
        lc.drawImage(logoDamage.scarTex, r.left, r.top, r.width, r.height);
        if (logoDamage.scar1 && logoDamage.scarFlashBorn) {
          const dtF = Math.max(0, now - logoDamage.scarFlashBorn);
          if (dtF < 210) {
            const p = dtF / 210;
            const c1 = logoDamage.scar1;
            const hl = Math.hypot(r.width, r.height) * (0.62 + 0.16 * p);
            drawRazorLine(lc, r.left + c1.cx, r.top + c1.cy, c1.dx, c1.dy, hl, 1.8 * (1 - p * 0.6), 4.6 * (1 - p * 0.5), 1 - p * p);
          }
        }
        lc.restore();
      } else if (logoDamage.stage === 2 && logoDamage.cut2 && logoDamage.rect) {
        const r = logoDamage.rect;
        const c2 = logoDamage.cut2;
        lc.save();
        lc.translate(markShiftX, markShiftY);
        // Draw Slash 1's straight `/` incision + Slash 2's surgical `\` metallic edge split across BOTH halves!
        const drawHalfOverlays = (halfPoly, sh) => {
          lc.save();
          lc.translate(r.left + r.width * 0.5 + sh.x, r.top + r.height * 0.5 + sh.y);
          lc.rotate((sh.rot * Math.PI) / 180);
          lc.translate(-r.width * 0.5, -r.height * 0.5);
          lc.beginPath();
          lc.moveTo(halfPoly.pts[0].x, halfPoly.pts[0].y);
          for (let i = 1; i < halfPoly.pts.length; i++) lc.lineTo(halfPoly.pts[i].x, halfPoly.pts[i].y);
          lc.closePath();
          lc.clip();
          if (logoDamage.scarTex) lc.drawImage(logoDamage.scarTex, 0, 0, r.width, r.height);
          if (logoDamage.cut2EdgeTex) {
            lc.globalCompositeOperation = 'lighter';
            lc.drawImage(logoDamage.cut2EdgeTex, 0, 0, r.width, r.height);
          }
          lc.restore();
        };
        drawHalfOverlays(c2.topHalf, c2.shiftTop);
        drawHalfOverlays(c2.botHalf, c2.shiftBot);
        if (logoDamage.cut2FlashBorn) {
          const dtF = Math.max(0, now - logoDamage.cut2FlashBorn);
          if (dtF < 190) {
            const p = dtF / 190;
            const hl = Math.hypot(r.width, r.height) * (0.68 + 0.18 * p);
            drawRazorLine(lc, r.left + c2.cx, r.top + c2.cy, c2.dx, c2.dy, hl, 2.0 * (1 - p * 0.6), 5.2 * (1 - p * 0.5), 1 - p * p);
          }
        }
        lc.restore();
      }

      // Stage 3: Draw the cleanly straight-sliced KPR slabs + razor iaijutsu slash beams + falling collapse!
      const sh = logoDamage.shatter;
      if (!sh) return;
      const elapsed = Math.max(0, now - sh.born);
      const inHold = elapsed < sh.holdMs;
      const holdK = Math.max(0, Math.min(1, elapsed / sh.holdMs));

      for (const s of sh.shards) {
        // Stay at full solid opacity all the way until each slab physically falls out of sight past the viewport!
        const px = inHold ? s.x0 + s.slipX * easeOutCubic(holdK) : s.x;
        const py = inHold ? s.y0 + s.slipY * easeOutCubic(holdK) : s.y;
        const flipScale = inHold ? 1 : (0.34 + 0.66 * Math.abs(Math.cos(s.tilt)));

        ctx2d.save();
        ctx2d.translate(px, py);
        ctx2d.rotate(s.rot);
        ctx2d.scale(flipScale, 1);
        ctx2d.drawImage(s.tex, s.dxDraw, s.dyDraw, s.bw, s.bh);
        ctx2d.restore();
      }

      // Razor-thin dead-straight katana flash lines slicing cleanly across KPR during the iaijutsu beat!
      if (sh.cutFlashes) {
        for (const fl of sh.cutFlashes) {
          const age = elapsed - fl.delay;
          if (age < 0 || age > fl.dur) continue;
          const p = age / fl.dur;
          const extend = easeOutCubic(Math.min(1, p * 4.5));
          const fade = Math.max(0, 1 - Math.pow(p, 1.35));
          drawRazorLine(ctx2d, fl.x, fl.y, fl.dx, fl.dy, fl.halfLen * extend, fl.coreW * (1 - p * 0.55), fl.glowW * (1 - p * 0.45), fade);
        }
      }

      // Sleek directional razor-spark streaks streaming off the cleanly cut planes as pieces collapse!
      if (!inHold && logoDebris.length) {
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        ctx2d.lineCap = 'round';
        for (const d of logoDebris) {
          const a = Math.max(0, 1 - d.age / d.life);
          if (a <= 0.01) continue;
          const spd = Math.hypot(d.vx, d.vy) || 1;
          const ux = d.vx / spd, uy = d.vy / spd;
          ctx2d.globalAlpha = a;
          ctx2d.strokeStyle = d.color;
          ctx2d.lineWidth = d.w;
          ctx2d.beginPath();
          ctx2d.moveTo(d.x, d.y);
          ctx2d.lineTo(d.x - ux * d.len, d.y - uy * d.len);
          ctx2d.stroke();
        }
        ctx2d.restore();
      }
    }
    const dragon3d = window.createSpiritDragon3D ? window.createSpiritDragon3D() : null;
    window.__kprDragon3D = dragon3d;
    const dragon = { hist: [], angle: rand(0, TAU), speed: 0.75, squeeze: 1, alpha: 0, len: 0, lunge: null };

    let ringDirty = true, mctxDirty = false;
    function size() {
      W = innerWidth; H = innerHeight;
      const isMob = isTouchMobile || Math.min(W, H) <= 760;
      dpr = Math.min(devicePixelRatio || 1, isMob ? 1.25 : 2);
      [[canvas, ctx2d], [midCanvas, mctx], [backCanvas, bctx]].forEach(([c, x]) => {
        if (!c || !x) return;
        c.width = Math.max(1, Math.round(W * dpr));
        c.height = Math.max(1, Math.round(H * dpr));
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      if (dragon3d) dragon3d.resize(W, H, devicePixelRatio || 1);
      dragon.len = Math.min(W, H) * (dragon.lunge ? 2 : 1.35);
      ringDirty = true;
    }
    // Maps normalized strike coordinates to CSS px: unchanged on landscape (aspect >= 0.95), and
    // compresses vertical span around center on tall portrait phones so slashes keep sleek katana diagonals!
    const at = (f) => {
      const aspect = W / H;
      if (aspect >= 0.95) return { x: W * f[0], y: H * f[1] };
      const yComp = Math.max(0.46, aspect * 1.08);
      return { x: W * f[0], y: H * (0.5 + (f[1] - 0.5) * yComp) };
    };

    // --- ambient: embers rise, pale petals drift down and across ---
    function newEmber(anywhere) {
      return { x: rand(0, W), y: anywhere ? rand(0, H) : H + rand(4, 40), vy: -rand(18, 60), sway: rand(0, TAU),
        swayAmp: rand(6, 22), r: rand(0.7, 2.1), hue: rand(76, 118), flick: rand(0, TAU) };
    }
    function newPetal(anywhere) {
      return { x: anywhere ? rand(0, W) : W + rand(10, 80), y: anywhere ? rand(0, H) : rand(-H * 0.3, H * 0.7),
        vx: -rand(14, 38), vy: rand(14, 34), rot: rand(0, TAU), vr: rand(-2.2, 2.2), s: rand(2.4, 5), a: rand(0.16, 0.36) };
    }
    function seedAmbient() {
      embers.length = 0; petals.length = 0;
      const ne = Math.round(Math.min(70, Math.max(24, W * H / 20000)));
      for (let i = 0; i < ne; i++) embers.push(newEmber(true));
      const np = Math.round(Math.min(18, Math.max(7, W / 90)));
      for (let i = 0; i < np; i++) petals.push(newPetal(true));
    }

    // --- the dragon: 2D fallback follows a precessing Infinite Dempsey Roll figure-8 round KPR ---
    function orbitPoint(a, now) {
      const rx = Math.min(W * 0.42, H * 0.38, 360) * dragon.squeeze * fit;
      const ry = Math.min(H * 0.34, rx * 0.82);
      const psi = a * 0.195;
      const u8 = Math.sin(a);
      const v8 = 0.56 * Math.sin(2 * a);
      const px = (u8 * Math.cos(psi) - v8 * Math.sin(psi)) * rx;
      const py = (u8 * Math.sin(psi) + v8 * Math.cos(psi)) * ry;
      // z > 0: near pass across KPR (obstructs KPR); z < 0: far pass behind KPR
      return { x: W / 2 + px, y: H / 2 - lift + py, z: Math.cos(a) };
    }
    // The diamond round KPR as it is on screen right now (raised and scaled for the sound
    // choice, then gliding back to centre). It's a square turned 45deg, so its bounding box spans
    // tip to tip. The 3D dragon circles a ring just outside it.
    const reticleEl = splash.querySelector('.intro-whole .intro-reticle--whole');
    // The KPR letters' box: the 3D dragon is never drawn over them, so it always passes behind.
    const logoEl = splash.querySelector('.intro-whole .intro-logo--whole');
    function updateDragon(dt, now) {
      if (dragon3d) {
        dragon3d.setLift(lift, fit);
        // Only measure reticleEl when resizing or actively gliding lift (eliminates 2x per-frame forced layout!)
        if (reticleEl && (ringDirty || Math.abs(lift - liftTarget) > 0.25)) {
          const r = reticleEl.getBoundingClientRect();
          if (r.width > 2) {
            dragon3d.setRing(r.left + r.width / 2, r.top + r.height / 2, r.width / 2);
            ringDirty = false;
          }
        }
        dragon3d.update(dt, now, phase, phaseAt);
        const passing = dragon3d.isPassing && dragon3d.isPassing(now);
        if (dt > 0 && (phase === 'charge' || phase === 'lunge' || passing)) {
          const count = phase === 'lunge' ? 4 : (passing ? 3 : 1);
          for (let i = 0; i < count; i++) shed(dragon, phase === 'lunge' || passing ? 1.6 : 1);
        }
        return;
      }
      const d = dragon;
      if (dt === 0) return;
      let head;
      if (d.lunge) {
        const L = d.lunge;
        const p = Math.max(0, Math.min(1, (now - L.start) / L.dur));
        head = quadPt(L.p0, L.cp, L.p1, easeInCubic(p) * 0.6 + p * 0.4);
        head.z = 1;
        if (now > L.start + L.dur + 120) d.alpha = Math.max(0, d.alpha - dt / 0.35);
        for (let i = 0; i < 4; i++) shed(d, 1.6);
      } else {
        if (phase === 'charge') {
          const p = Math.min(1, (now - phaseAt) / 820);
          d.speed = 0.75 + 3.6 * easeInCubic(p);
          d.squeeze = 1 - 0.28 * easeOutCubic(p);
          shed(d, 1);
        }
        d.angle += d.speed * dt;
        head = orbitPoint(d.angle, now);
        d.alpha = Math.min(1, d.alpha + dt / 0.9);
      }
      d.hist.unshift(head);
      let acc = 0;
      for (let i = 1; i < d.hist.length; i++) {
        acc += Math.hypot(d.hist[i].x - d.hist[i - 1].x, d.hist[i].y - d.hist[i - 1].y);
        if (acc > d.len * 1.25) { d.hist.length = i + 1; break; }
      }
      if (d.hist.length > 600) d.hist.length = 600;
    }
    function shed(d, speedScale) {
      let p = null;
      if (dragon3d) {
        p = dragon3d.sampleTrailPointScreen();
      } else if (d.hist.length >= 4) {
        p = d.hist[Math.floor(Math.random() * Math.min(d.hist.length, 120))];
      }
      if (!p) return;
      const a = rand(0, TAU), v = rand(60, 220) * speedScale;
      sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.55), age: 0,
        width: rand(0.8, 1.9), color: Math.random() > 0.45 ? '#c6ff38' : (Math.random() > 0.4 ? '#68f028' : '#f7ffd4') });
    }

    // Even spacing along the trail, so the body keeps its shape at any speed.
    function resample(pts, spacing, n) {
      const out = [pts[0]];
      let a = pts[0], acc = 0;
      for (let k = 1; k < pts.length && out.length < n; k++) {
        const b = pts[k];
        let seg = Math.hypot(b.x - a.x, b.y - a.y);
        while (seg > 0 && acc + seg >= spacing && out.length < n) {
          const t = (spacing - acc) / seg;
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
          out.push(p);
          a = p; acc = 0;
          seg = Math.hypot(b.x - a.x, b.y - a.y);
        }
        acc += seg;
        a = b;
      }
      return out;
    }
    function quad(c, a, b, na, nb, wa, wb) {
      c.beginPath();
      c.moveTo(a.x + na.x * wa, a.y + na.y * wa);
      c.lineTo(b.x + nb.x * wb, b.y + nb.y * wb);
      c.lineTo(b.x - nb.x * wb, b.y - nb.y * wb);
      c.lineTo(a.x - na.x * wa, a.y - na.y * wa);
      c.closePath();
    }
    function drawDragon(now) {
      if (dragon3d) {
        dragon3d.render(ctx2d, bctx, now, mctx);
        return;
      }
      const d = dragon;
      if (d.alpha < 0.01 || d.hist.length < 3) return;
      const N = 44;
      const s = resample(d.hist, d.len / N, N + 1);
      const M = s.length;
      if (M < 3) return;
      const maxW = Math.max(5, Math.min(W, H) * 0.017);
      const nrm = [], wid = [];
      for (let i = 0; i < M; i++) {
        const a = s[Math.max(0, i - 1)], b = s[Math.min(M - 1, i + 1)];
        const tx = a.x - b.x, ty = a.y - b.y, L = Math.hypot(tx, ty) || 1;
        nrm.push({ x: -ty / L, y: tx / L });
        const u = i / N;
        const prof = u < 0.08 ? 0.62 + u * 4.75 : Math.pow(Math.max(0, 1 - (u - 0.08) / 0.92), 0.8);
        wid.push(Math.max(0.6, maxW * prof));
      }
      const A = d.alpha;
      const pick = (z) => d.lunge ? ctx2d : (z < -0.04 && bctx ? bctx : ctx2d);
      [ctx2d, mctx, bctx].forEach((c) => { if (c) { c.lineCap = 'butt'; c.lineJoin = 'round'; } });
      // tail first, so the head lands on top
      for (let k = M - 2; k >= 0; k--) {
        const a = s[k], b = s[k + 1], na = nrm[k], nb = nrm[k + 1], wa = wid[k], wb = wid[k + 1];
        const c = pick((a.z + b.z) / 2);
        const u = k / N;
        const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
        const hue = (160 - u * 45).toFixed(0);
        // energy pulses travel from the head down to the tail
        const ph = ((u * 3 - now / 700) % 1 + 1) % 1;
        // ...and the whole body flares while it lunges through the cleave
        const pulse = Math.max(d.lunge ? 0.7 : 0, 1 - Math.abs(ph - 0.5) * 9);
        // faint aura
        c.globalCompositeOperation = 'lighter';
        quad(c, a, b, na, nb, wa * 1.9, wb * 1.9);
        c.fillStyle = `rgba(68,214,44,${((0.045 + pulse * 0.08) * A).toFixed(3)})`;
        c.fill();
        // hard-light body: a dark core lit by its edges
        c.globalCompositeOperation = 'source-over';
        quad(c, a, b, na, nb, wa, wb);
        c.fillStyle = `hsla(150,70%,${(6 + pulse * 26).toFixed(0)}%,${(0.92 * A).toFixed(3)})`;
        c.fill();
        // scales
        if (k % 2 === 0 && u > 0.05) {
          c.beginPath();
          c.moveTo(a.x + na.x * wa * 0.78, a.y + na.y * wa * 0.78);
          c.lineTo(a.x + ux * wa * 0.5, a.y + uy * wa * 0.5);
          c.lineTo(a.x - na.x * wa * 0.78, a.y - na.y * wa * 0.78);
          c.strokeStyle = `hsla(${hue},95%,62%,${((0.4 + pulse * 0.5) * A).toFixed(3)})`;
          c.lineWidth = 1; c.stroke();
        }
        // neon edges
        c.lineWidth = Math.max(1.1, wa * 0.16);
        c.strokeStyle = `hsla(${hue},95%,${(58 + pulse * 25).toFixed(0)}%,${A.toFixed(3)})`;
        c.beginPath();
        c.moveTo(a.x + na.x * wa, a.y + na.y * wa); c.lineTo(b.x + nb.x * wb, b.y + nb.y * wb);
        c.moveTo(a.x - na.x * wa, a.y - na.y * wa); c.lineTo(b.x - nb.x * wb, b.y - nb.y * wb);
        c.stroke();
        // dorsal fins, swept back
        if (k % 3 === 1 && u > 0.06 && u < 0.88) {
          c.beginPath();
          c.moveTo(a.x + na.x * wa * 0.9 - ux * wa * 0.3, a.y + na.y * wa * 0.9 - uy * wa * 0.3);
          c.lineTo(a.x + na.x * wa * 2.3 + ux * wa * 1.1, a.y + na.y * wa * 2.3 + uy * wa * 1.1);
          c.lineTo(a.x + na.x * wa * 0.9 + ux * wa * 0.6, a.y + na.y * wa * 0.9 + uy * wa * 0.6);
          c.closePath();
          c.fillStyle = `hsla(165,92%,60%,${(0.85 * A).toFixed(3)})`;
          c.fill();
        }
        // mane: flame wisps streaming back from the neck
        if (k > 0 && k < 11) {
          const f = 1 - k / 11;
          c.globalCompositeOperation = 'lighter';
          c.lineWidth = 1.1;
          c.strokeStyle = `rgba(40,240,180,${(0.6 * f * A).toFixed(3)})`;
          [1, -1].forEach((sd) => {
            const reach = wa * (1.9 + Math.sin(now / 110 + k * 1.7 + sd) * 0.7);
            c.beginPath();
            c.moveTo(a.x + sd * na.x * wa, a.y + sd * na.y * wa);
            c.quadraticCurveTo(a.x + sd * na.x * reach + ux * wa, a.y + sd * na.y * reach + uy * wa,
              a.x + sd * na.x * reach * 0.8 + ux * wa * 3, a.y + sd * na.y * reach * 0.8 + uy * wa * 3);
            c.stroke();
          });
          c.globalCompositeOperation = 'source-over';
        }
        // spine light
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
        c.strokeStyle = `rgba(234,255,234,${((0.3 + pulse * 0.6) * (1 - u * 0.7) * A).toFixed(3)})`;
        c.lineWidth = Math.max(0.7, wa * 0.12); c.stroke();
      }
      drawHead(pick(s[0].z), s[0], s[1], wid[0], now, A);
    }
    function drawHead(c, h, nxt, w, now, A) {
      let fx0 = h.x - nxt.x, fy0 = h.y - nxt.y;
      const l0 = Math.hypot(fx0, fy0) || 1; fx0 /= l0; fy0 /= l0;
      const nx = -fy0, ny = fx0;
      const L = w * 3.2, hw = w * 1.25;
      const P = (f, sd) => ({ x: h.x + fx0 * f + nx * sd, y: h.y + fy0 * f + ny * sd });
      const sway = Math.sin(now / 170) * hw * 0.7;
      // head aura and whiskers
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, L * 1.6);
      g.addColorStop(0, `rgba(68,214,44,${(0.35 * A).toFixed(3)})`);
      g.addColorStop(1, 'rgba(68,214,44,0)');
      c.fillStyle = g; c.beginPath(); c.arc(h.x, h.y, L * 1.6, 0, TAU); c.fill();
      [1, -1].forEach((sd) => {
        const p0 = P(L * 0.78, sd * hw * 0.3), cp = P(-L * 0.4, sd * (hw * 0.4) + sway * 0.3), p1 = P(-L * 2.6, sd * hw * 1.7 + sway);
        c.beginPath(); c.moveTo(p0.x, p0.y); c.quadraticCurveTo(cp.x, cp.y, p1.x, p1.y);
        c.strokeStyle = `rgba(234,255,234,${(0.55 * A).toFixed(3)})`; c.lineWidth = 1.2; c.stroke();
      });
      c.globalCompositeOperation = 'source-over';
      // horns
      c.lineCap = 'round';
      [1, -1].forEach((sd) => {
        const b0 = P(-L * 0.05, sd * hw * 0.6), cp = P(-L * 0.7, sd * hw * 1.0), tip = P(-L * 1.25, sd * hw * 1.65);
        c.beginPath(); c.moveTo(b0.x, b0.y); c.quadraticCurveTo(cp.x, cp.y, tip.x, tip.y);
        c.strokeStyle = `hsla(165,92%,64%,${A.toFixed(3)})`; c.lineWidth = Math.max(1.4, w * 0.22); c.stroke();
      });
      c.lineCap = 'butt';
      // skull
      const pts = [P(L, 0), P(L * 0.55, hw * 0.42), P(L * 0.1, hw * 0.62), P(-L * 0.2, hw * 1.0), P(-L * 0.45, hw * 0.55),
        P(-L * 0.45, -hw * 0.55), P(-L * 0.2, -hw * 1.0), P(L * 0.1, -hw * 0.62), P(L * 0.55, -hw * 0.42)];
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.fillStyle = `hsla(150,70%,7%,${(0.95 * A).toFixed(3)})`; c.fill();
      c.strokeStyle = `hsla(155,95%,62%,${A.toFixed(3)})`; c.lineWidth = Math.max(1.3, w * 0.18); c.stroke();
      const s0 = P(L * 0.9, 0), s1 = P(-L * 0.3, 0);
      c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y);
      c.strokeStyle = `hsla(155,95%,62%,${(0.45 * A).toFixed(3)})`; c.lineWidth = 1; c.stroke();
      // eyes: hot white slits with a teal bloom
      c.globalCompositeOperation = 'lighter';
      [1, -1].forEach((sd) => {
        const e = P(L * 0.12, sd * hw * 0.42);
        const eg = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, w * 1.6);
        eg.addColorStop(0, `rgba(40,240,180,${(0.55 * A).toFixed(3)})`);
        eg.addColorStop(1, 'rgba(40,240,180,0)');
        c.fillStyle = eg; c.beginPath(); c.arc(e.x, e.y, w * 1.6, 0, TAU); c.fill();
        c.beginPath();
        c.ellipse(e.x, e.y, Math.max(1.6, w * 0.3), Math.max(0.8, w * 0.1), Math.atan2(fy0, fx0), 0, TAU);
        c.fillStyle = `rgba(240,255,250,${A.toFixed(3)})`; c.fill();
      });
      c.globalCompositeOperation = 'source-over';
    }

    // --- razor katana blade crescent ---
    function drawCrescent(c, p0, cp, p1, tStart, tEnd, maxW, alpha) {
      const steps = 30;
      if (tEnd <= tStart + 0.01) return;
      const outerPts = [], innerPts = [], trailPts = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const t = tStart + (tEnd - tStart) * u;
        const pt = quadPt(p0, cp, p1, t);
        const next = quadPt(p0, cp, p1, Math.min(1, t + 0.01));
        const prev = quadPt(p0, cp, p1, Math.max(0, t - 0.01));
        let tx = next.x - prev.x, ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len; ty /= len;
        const nx = -ty, ny = tx;
        // Taper sharply to needle tips so the blade reads razor-keen rather than blunt!
        const needle = Math.pow(Math.sin(u * Math.PI), 1.22);
        const wEdge = needle * maxW;
        outerPts.push({ x: pt.x + nx * wEdge * 0.42, y: pt.y + ny * wEdge * 0.42 });
        innerPts.push({ x: pt.x - nx * wEdge * 0.22, y: pt.y - ny * wEdge * 0.22 });
        trailPts.push({ x: pt.x - nx * wEdge * 1.15, y: pt.y - ny * wEdge * 1.15 });
      }
      c.save();
      c.globalCompositeOperation = 'lighter';
      const headP = outerPts[outerPts.length - 1], tailP = outerPts[0];
      if (!headP || !tailP || !isFinite(headP.x) || !isFinite(headP.y) || !isFinite(tailP.x) || !isFinite(tailP.y)) {
        c.restore();
        return;
      }
      // Directional luminous energy gradient: dissolves softly at the trailing wake -> white-hot at the cutting tip!
      const wakeGrad = c.createLinearGradient(tailP.x, tailP.y, headP.x, headP.y);
      wakeGrad.addColorStop(0, 'rgba(68, 214, 44, 0)');
      wakeGrad.addColorStop(0.35, 'rgba(68, 214, 44, 0.42)');
      wakeGrad.addColorStop(0.85, 'rgba(68, 214, 44, 0.82)');
      wakeGrad.addColorStop(1, 'rgba(180, 255, 190, 0.95)');

      const bladeGrad = c.createLinearGradient(tailP.x, tailP.y, headP.x, headP.y);
      bladeGrad.addColorStop(0, 'rgba(40, 240, 180, 0)');
      bladeGrad.addColorStop(0.30, 'rgba(40, 240, 180, 0.58)');
      bladeGrad.addColorStop(0.82, 'rgba(110, 255, 212, 0.96)');
      bladeGrad.addColorStop(1, 'rgba(248, 255, 252, 1)');

      const edgeGrad = c.createLinearGradient(tailP.x, tailP.y, headP.x, headP.y);
      edgeGrad.addColorStop(0, 'rgba(248, 255, 248, 0)');
      edgeGrad.addColorStop(0.42, 'rgba(248, 255, 248, 0.68)');
      edgeGrad.addColorStop(1, 'rgba(255, 255, 255, 1)');

      // 1) Sleek emerald sword-wind wake trailing behind the cutting edge
      c.globalAlpha = alpha * 0.54;
      c.beginPath();
      c.moveTo(outerPts[0].x, outerPts[0].y);
      for (let i = 1; i < outerPts.length; i++) c.lineTo(outerPts[i].x, outerPts[i].y);
      for (let i = trailPts.length - 1; i >= 0; i--) c.lineTo(trailPts[i].x, trailPts[i].y);
      c.closePath();
      c.fillStyle = wakeGrad;
      c.fill();

      // 2) Razor-sharp luminous cyan-emerald blade body
      c.globalAlpha = alpha * 0.90;
      c.beginPath();
      c.moveTo(outerPts[0].x, outerPts[0].y);
      for (let i = 1; i < outerPts.length; i++) c.lineTo(outerPts[i].x, outerPts[i].y);
      for (let i = innerPts.length - 1; i >= 0; i--) c.lineTo(innerPts[i].x, innerPts[i].y);
      c.closePath();
      c.fillStyle = bladeGrad;
      c.fill();

      // 3) Blazing pure white-hot katana cutting edge right along the leading curve
      c.globalAlpha = alpha;
      c.strokeStyle = edgeGrad;
      c.lineWidth = Math.max(1.6, maxW * 0.14);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(outerPts[0].x, outerPts[0].y);
      for (let i = 1; i < outerPts.length; i++) c.lineTo(outerPts[i].x, outerPts[i].y);
      c.stroke();
      c.restore();
    }
    function spawnSparks(x, y, vxBase, vyBase, count, speedScale) {
      for (let i = 0; i < count; i++) {
        const angle = Math.atan2(vyBase, vxBase) + (Math.random() - 0.5) * 1.45;
        const speed = (220 + Math.random() * 580) * speedScale;
        sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.25 + Math.random() * 0.42, age: 0,
          width: 1.2 + Math.random() * 2.2, color: Math.random() > 0.35 ? '#44d62c' : (Math.random() > 0.4 ? '#28f0b4' : '#eaffea') });
      }
    }
    function flash(k, ms) {
      if (!flashEl || !flashEl.animate) return;
      flashEl.animate([{ opacity: k }, { opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    function glitch() {
      clearTimeout(glitchTimer);
      splash.classList.remove('is-glitch');
      void splash.offsetWidth;
      splash.classList.add('is-glitch');
      glitchTimer = setTimeout(() => splash.classList.remove('is-glitch'), 240);
    }
    // Arms a dragon-coupled katana blade crescent right as the dragon begins its strike dive:
    // its leading edge tracks the dragon's live nose along the curved arc (`tEnd = strikeProgress`)
    // so the blade energy physically erupts out of the dragon's jaws instead of popping in separately!
    function armSlashArc(spec) {
      const now = performance.now();
      const m = Math.min(W, H);
      slashes.push({
        ...spec,
        armedAt: now,
        hitAt: 0,
        born: now,
        maxEnd: 0,
        lastSparkT: 0.05,
        coupled: !!dragon3d,
        width: Math.max(spec.minW, m * spec.widthK),
      });
    }
    function strike(spec) {
      const now = performance.now();
      const m = Math.min(W, H);
      // Bind impact flare to the already-armed dragon-coupled crescent (or spawn fallback if 2D)
      let s = slashes.find((sl) => sl.step === spec.step && !sl.hitAt);
      if (s) {
        s.hitAt = now;
        s.born = now;
      } else {
        s = { ...spec, armedAt: now, hitAt: now, born: now, maxEnd: 0, lastSparkT: 0.05, coupled: false, width: Math.max(spec.minW, m * spec.widthK) };
        slashes.push(s);
      }
      const p0 = at(s.p0), cp = at(s.cp), p1 = at(s.p1);
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl, uy = dy / dl;
      // Directional sparks spraying along the blade's exit momentum right from the center of KPR
      const mid = quadPt(p0, cp, p1, 0.5);
      spawnSparks(mid.x, mid.y, dx, dy, spec.cleave ? 28 : 16, spec.cleave ? 1.30 : 1.05);
      rings.push({ x: mid.x, y: mid.y, born: now, life: spec.cleave ? 0.65 : 0.42, max: m * (spec.cleave ? 0.92 : 0.48), w: spec.cleave ? 8 : 5, flat: !!spec.cleave });
      // Smooth directional spring recoil along the exact cut vector (replaces choppy random shake!)
      const kick = spec.cleave ? 24 : (spec.step === 2 ? 16 : 11);
      recoilVx += ux * kick * 18;
      recoilVy += uy * kick * 18;
      shake = spec.cleave ? 4.5 : (spec.step === 2 ? 3.0 : 2.2);
      if (dragon3d && dragon3d.impulseCamera) {
        dragon3d.impulseCamera(ux, uy, spec.cleave ? 0.42 : (spec.step === 2 ? 0.28 : 0.18));
      }
      focus = 0;
      phase = spec.cleave ? 'lunge' : 'strike';
      flash(spec.flash, spec.cleave ? 380 : 230);
    }
    function cleave(spec) {
      strike(spec);
    }
    function launchLunge() {
      const now = performance.now();
      if (dragon3d) {
        dragon3d.triggerLunge(now);
      } else {
        const head = dragon.hist[0] || { x: W * 0.8, y: H * 0.3 };
        dragon.lunge = { p0: { x: head.x, y: head.y }, cp: { x: W * 0.52, y: H * 0.46 }, p1: { x: -W * 0.4, y: H * 1.3 }, start: now, dur: 430 };
        dragon.len = Math.min(W, H) * 2;
      }
    }
    function ringBurst() {
      const cx = W / 2, cy = H / 2, radius = Math.min(W, H) * 0.22;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU + (Math.random() - 0.5) * 0.3;
        spawnSparks(cx + Math.cos(a) * radius * 0.7, cy + Math.sin(a) * radius * 0.7, Math.cos(a), Math.sin(a), 1, 0.85);
      }
    }
    function sparkBurst() { spawnSparks(W / 2, H / 2, 1, 0.36, 22, 1.05); }

    // --- one frame ---
    function update(dt, now) {
      lift += (liftTarget - lift) * Math.min(1, dt * 7);
      fit += (fitTarget - fit) * Math.min(1, dt * 7);
      updateDragon(dt, now);
      const charge = phase === 'charge' ? Math.min(1, (now - phaseAt) / 820) : 0;
      if (phase === 'charge') {
        focus = easeInCubic(charge);
        for (let i = 0; i < 5; i++) {
          motes.push({ a: rand(0, TAU), r0: Math.hypot(W, H) * rand(0.32, 0.58), born: now, life: rand(380, 640), w: rand(0.8, 2) });
        }
      }
      const rise = 1 + 2.5 * charge;
      for (const e of embers) {
        e.y += e.vy * rise * dt;
        e.sway += dt * 1.3;
        if (e.y < -12) Object.assign(e, newEmber(false));
      }
      for (const p of petals) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.x < -24 || p.y > H + 24) Object.assign(p, newPetal(false));
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.age += dt;
        if (sp.age >= sp.life) { sparks.splice(i, 1); continue; }
        sp.x += sp.vx * dt; sp.y += sp.vy * dt;
        sp.vx *= 0.94; sp.vy *= 0.94;
      }
      // Update cleanly sliced KPR slabs & razor sparks once the iaijutsu hold collapses!
      const sh = logoDamage.shatter;
      if (sh && now - sh.born >= sh.holdMs) {
        if (!sh.collapsed) {
          sh.collapsed = true;
          // Launch seamlessly from each slab's exact iaijutsu micro-slide position into collapse
          for (const s of sh.shards) { s.x = s.x0 + s.slipX; s.y = s.y0 + s.slipY; }
        }
        const sdt = dt > 0 ? dt : 0.016;
        for (let i = sh.shards.length - 1; i >= 0; i--) {
          const s = sh.shards[i];
          s.age += sdt;
          s.x += s.vx * sdt;
          s.y += s.vy * sdt;
          s.vy += s.grav * sdt;
          s.vx *= Math.pow(0.988, sdt * 60);
          s.rot += s.vr * sdt;
          s.tilt += s.vtilt * sdt;
          // Keep every falling slab alive until it completely exits past the viewport edges!
          const offBottom = s.y - Math.max(s.bw, s.bh) > H + 48;
          const offSides = s.x + Math.max(s.bw, s.bh) < -80 || s.x - Math.max(s.bw, s.bh) > W + 80;
          if (offBottom || offSides || s.age >= s.life) { sh.shards.splice(i, 1); continue; }
        }
        for (let i = logoDebris.length - 1; i >= 0; i--) {
          const d = logoDebris[i];
          d.age += sdt;
          if (d.age >= d.life || d.y > H + 48) { logoDebris.splice(i, 1); continue; }
          d.x += d.vx * sdt; d.y += d.vy * sdt;
          d.vy += d.grav * sdt;
          d.vx *= Math.pow(0.968, sdt * 60);
        }
      }
      if (wiped && ambientAlpha > 0) {
        ambientAlpha = Math.max(0, ambientAlpha - dt / 0.32);
      }
      // Spring-damped directional recoil + subtle micro-tremor along the blade vector (organic kinetic punch!)
      if (dt > 0) {
        const springK = 260, damp = 18;
        recoilVx += (-recoilX * springK - recoilVx * damp) * dt;
        recoilVy += (-recoilY * springK - recoilVy * damp) * dt;
        recoilX += recoilVx * dt;
        recoilY += recoilVy * dt;
      }
      const hasRecoil = Math.hypot(recoilX, recoilY) > 0.15 || Math.hypot(recoilVx, recoilVy) > 2;
      if (shake > 0.15 || hasRecoil) {
        markShiftX = recoilX + (Math.random() - 0.5) * shake * 1.4;
        markShiftY = recoilY + (Math.random() - 0.5) * shake * 1.4;
        marks.forEach((m) => { m.style.transform = `translate(calc(-50% + ${markShiftX.toFixed(1)}px), calc(-50% + ${markShiftY.toFixed(1)}px))`; });
        if (dt > 0) shake *= Math.pow(0.76, dt * 60);
      } else if (shake > 0 || markShiftX !== 0 || markShiftY !== 0 || recoilX !== 0 || recoilY !== 0) {
        shake = 0; recoilX = 0; recoilY = 0; recoilVx = 0; recoilVy = 0; markShiftX = 0; markShiftY = 0;
        marks.forEach((m) => { m.style.transform = ''; });
      }
    }
    function render(now) {
      ctx2d.clearRect(0, 0, W, H);
      // Only clear midCanvas while Stage 1/2 logo scars are active (plus one final clear when entering Stage 3)
      if (mctx && (logoDamage.stage === 1 || logoDamage.stage === 2 || mctxDirty)) {
        mctx.clearRect(0, 0, W, H);
        mctxDirty = logoDamage.stage === 1 || logoDamage.stage === 2;
      }
      if (bctx) bctx.clearRect(0, 0, W, H);
      const amb = bctx || ctx2d;

      // ambient (fades out cleanly once the dragon wipe uncovers the site)
      if (ambientAlpha > 0.01) {
        amb.globalCompositeOperation = 'lighter';
        for (const e of embers) {
          const a = (0.22 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.006 + e.flick))) * ambientAlpha;
          amb.fillStyle = `hsla(${e.hue.toFixed(0)},90%,62%,${a.toFixed(3)})`;
          amb.beginPath();
          amb.arc(e.x + Math.sin(e.sway) * e.swayAmp, e.y, e.r, 0, TAU);
          amb.fill();
        }
        amb.globalCompositeOperation = 'source-over';
        for (const p of petals) {
          amb.save();
          amb.translate(p.x, p.y); amb.rotate(p.rot);
          amb.fillStyle = `rgba(234,255,234,${(p.a * ambientAlpha).toFixed(3)})`;
          amb.beginPath(); amb.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, TAU); amb.fill();
          amb.restore();
        }
      }

      // focus lines: speed lines pulling in toward the mark while it charges
      if (focus > 0.02) {
        const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) * 0.6, rMin = Math.min(W, H) * 0.3;
        ctx2d.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 64; i++) {
          const a = rand(0, TAU), inner = rMin + rand(0, Math.min(W, H) * 0.22) * (1 - focus * 0.5), half = rand(0.002, 0.009);
          ctx2d.fillStyle = `rgba(234,255,234,${(rand(0.03, 0.13) * focus).toFixed(3)})`;
          ctx2d.beginPath();
          ctx2d.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
          ctx2d.lineTo(cx + Math.cos(a - half) * R, cy + Math.sin(a - half) * R);
          ctx2d.lineTo(cx + Math.cos(a + half) * R, cy + Math.sin(a + half) * R);
          ctx2d.closePath();
          ctx2d.fill();
        }
      } else if (focus > 0) {
        focus = 0;
      }

      // motes: energy streaks drawn into the mark
      ctx2d.globalCompositeOperation = 'lighter';
      for (let i = motes.length - 1; i >= 0; i--) {
        const mo = motes[i];
        const p = (now - mo.born) / mo.life;
        if (p >= 1) { motes.splice(i, 1); continue; }
        const r = mo.r0 * (1 - easeInCubic(p));
        const cx = W / 2 + Math.cos(mo.a) * r, cy = H / 2 + Math.sin(mo.a) * r;
        const tail = mo.r0 * 0.07 * (0.4 + p);
        ctx2d.strokeStyle = `rgba(40,240,180,${(0.85 * p).toFixed(3)})`;
        ctx2d.lineWidth = mo.w;
        ctx2d.beginPath();
        ctx2d.moveTo(cx, cy);
        ctx2d.lineTo(cx + Math.cos(mo.a) * tail, cy + Math.sin(mo.a) * tail);
        ctx2d.stroke();
      }
      ctx2d.globalCompositeOperation = 'source-over';

      drawDragon(now);
      [ctx2d, mctx, bctx].forEach((c) => { if (c) c.globalCompositeOperation = 'source-over'; });
      // Progressive KPR scar / cut seam / 38-shard cataclysmic crumble overlay
      drawLogoDamage(now);

      // Dragon-coupled katana blade crescents: sweep organically out of the dragon's live nose along the
      // curved arc, flaring razor-bright as the jaws cross KPR and shedding sparks cleanly along the tip!
      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i];
        const p0 = at(s.p0), cp = at(s.cp), p1 = at(s.p1);
        let tEnd, tStart, alpha, wScale;
        if (s.coupled && dragon3d && dragon3d.strikeProgress) {
          const liveT = dragon3d.strikeProgress(now);
          // Lead the katana point right out of the dragon's roaring snout tip (ahead of neck origin hist[0]!)
          const snoutLead = s.cleave ? 0.12 : (s.step === 2 ? 0.13 : 0.09);
          const isLatest = i === slashes.length - 1;
          if (isLatest && liveT > 0.01) s.maxEnd = Math.max(s.maxEnd, Math.min(1, liveT + snoutLead));
          if (s.hitAt) {
            const postAge = Math.max(0, (now - s.hitAt) / 1000);
            if (postAge > s.life) { slashes.splice(i, 1); continue; }
            const prog = Math.min(1, postAge / s.life);
            tEnd = Math.max(s.maxEnd, Math.min(1, 0.58 + easeOutCubic(Math.min(1, prog * 3.6)) * 0.42));
            // Trailing wake whips swiftly out behind the blade so zero stale sliver lingers into the next slash!
            tStart = Math.max(0, Math.min(tEnd - 0.02, Math.pow(prog, 0.92) * 1.18));
            const impactFlare = Math.exp(-prog * 7.5) * 0.35;
            alpha = Math.max(0, (1 - Math.pow(prog, 1.35)) * (0.94 + impactFlare));
            wScale = (1 + impactFlare * 0.6) * (1 - prog * 0.48);
          } else {
            // Approaching KPR with the dragon: sleek spirit-blade edge spearheading right off the roaring snout!
            if (now - s.armedAt > 1200) { slashes.splice(i, 1); continue; }
            tEnd = s.maxEnd;
            if (tEnd <= 0.04) continue;
            tStart = Math.max(0, tEnd - 0.36);
            alpha = Math.min(0.95, tEnd * 2.1);
            wScale = 0.62 + 0.42 * Math.min(1, tEnd * 2.0);
          }
          // Shed crisp directional blade sparks right off the moving tip of the cut!
          if (tEnd - s.lastSparkT >= 0.09 && tEnd <= 0.96) {
            s.lastSparkT = tEnd;
            const tipPt = quadPt(p0, cp, p1, tEnd);
            const nextPt = quadPt(p0, cp, p1, Math.min(1, tEnd + 0.02));
            spawnSparks(tipPt.x, tipPt.y, nextPt.x - tipPt.x, nextPt.y - tipPt.y, s.cleave ? 4 : 2, s.cleave ? 1.1 : 0.85);
          }
        } else {
          const age = Math.max(0, (now - s.born) / 1000);
          if (age > s.life) { slashes.splice(i, 1); continue; }
          const prog = Math.min(1, age / s.life);
          tEnd = easeOutCubic(Math.min(1, prog * 3.2));
          tStart = Math.max(0, (prog - 0.14) * 1.15);
          alpha = Math.max(0, 1 - Math.pow(prog, 1.7));
          wScale = 1 - prog * 0.45;
        }
        drawCrescent(ctx2d, p0, cp, p1, tStart, tEnd, s.width * wScale, Math.min(1, alpha));
      }

      // shockwaves
      ctx2d.globalCompositeOperation = 'lighter';
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const p = (now - r.born) / (r.life * 1000);
        if (p >= 1) { rings.splice(i, 1); continue; }
        if (p < 0) continue; // scheduled for a moment from now
        const rr = r.max * easeOutCubic(p);
        ctx2d.beginPath();
        if (r.flat) ctx2d.ellipse(r.x, r.y, rr, rr * 0.42, -0.2, 0, TAU);
        else ctx2d.arc(r.x, r.y, rr, 0, TAU);
        ctx2d.lineWidth = r.w * (1 - p) + 0.5;
        ctx2d.strokeStyle = `rgba(68,214,44,${(0.8 * (1 - p)).toFixed(3)})`;
        ctx2d.stroke();
        ctx2d.beginPath();
        if (r.flat) ctx2d.ellipse(r.x, r.y, rr * 0.92, rr * 0.92 * 0.42, -0.2, 0, TAU);
        else ctx2d.arc(r.x, r.y, rr * 0.92, 0, TAU);
        ctx2d.lineWidth = 1;
        ctx2d.strokeStyle = `rgba(234,255,234,${(0.6 * (1 - p)).toFixed(3)})`;
        ctx2d.stroke();
      }
      ctx2d.globalCompositeOperation = 'source-over';

      // sparks
      for (const sp of sparks) {
        const alpha = 1 - sp.age / sp.life;
        ctx2d.globalAlpha = alpha;
        ctx2d.strokeStyle = sp.color;
        ctx2d.lineWidth = sp.width;
        ctx2d.beginPath();
        ctx2d.moveTo(sp.x, sp.y);
        ctx2d.lineTo(sp.x - sp.vx * 0.032, sp.y - sp.vy * 0.032);
        ctx2d.stroke();
      }
      ctx2d.globalAlpha = 1;
    }
    function hasActiveDebris() {
      const sh = logoDamage.shatter;
      if (sh && sh.shards.length > 0) return true;
      if (logoDebris.length > 0 || sparks.length > 0 || rings.length > 0) return true;
      if (ambientAlpha > 0.01) return true;
      return false;
    }
    function tick(now) {
      if (!running) return;
      let dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (now < freezeUntil) dt = 0;
      update(dt, now);
      render(now);
      if (onClearCb && !hasActiveDebris()) {
        const cb = onClearCb;
        onClearCb = null;
        cb();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    return {
      start() {
        if (running) return;
        size();
        seedAmbient();
        running = true;
        lastFrame = performance.now();
        window.addEventListener('resize', size);
        raf = requestAnimationFrame(tick);
      },
      charge() { phase = 'charge'; phaseAt = performance.now(); },
      // halfSpace: half the height the coil may use around the emblem's centre (Infinity = no limit)
      setLift(px, instant, halfSpace) {
        liftTarget = px;
        fitHalf = halfSpace;
        ringDirty = true;
        // the tilted orbit reaches about 0.72 rx above and below its centre, plus the body's width
        const rx = Math.min(W * 0.44, H * 0.42, 360);
        fitTarget = Math.min(1, Math.max(0.35, (fitHalf - Math.min(W, H) * 0.035) / (rx * 0.72)));
        if (instant) { lift = px; fit = fitTarget; if (dragon3d) dragon3d.setLift(lift, fit); }
      },
      // The dragon dives across the screen along this strike's cut; its head crosses the middle of
      // the cut leadMs from now, on the hit.
      // With the 3D dragon the cleave is a wipe: its body covers the screen, then uncovers the site.
      has3d: !!dragon3d,
      lungeHitMs: () => (dragon3d && dragon3d.lungeHitMs ? dragon3d.lungeHitMs() : 0),
      lungeCoverMs: () => (dragon3d && dragon3d.lungeCoverMs ? dragon3d.lungeCoverMs() : 0),
      lungeMs: () => (dragon3d && dragon3d.lungeMs ? dragon3d.lungeMs() : 0),
      pass(spec) {
        armSlashArc(spec);
        if (!dragon3d || !dragon3d.triggerPass || !spec.pass) return;
        const o = spec.pass;
        dragon3d.triggerPass(performance.now(), { p0: at(spec.p0), cp: at(spec.cp), p1: at(spec.p1) },
          { ...o, wavePx: Math.min(W, H) * o.waveK });
      },
      armLungeArc(spec) {
        armSlashArc(spec);
      },
      strike,
      cleave,
      lunge: launchLunge,
      scarLogo,
      sliceLogo,
      shatterLogo,
      setWiped() { wiped = true; },
      whenDebrisClear(cb) {
        if (!hasActiveDebris()) cb();
        else onClearCb = cb;
      },
      ringBurst,
      sparkBurst,
      stop() {
        running = false;
        cancelAnimationFrame(raf);
        clearTimeout(glitchTimer);
        window.removeEventListener('resize', size);
        ctx2d.clearRect(0, 0, W, H);
        if (mctx) mctx.clearRect(0, 0, W, H);
        if (bctx) bctx.clearRect(0, 0, W, H);
        if (dragon3d) dragon3d.dispose();
        marks.forEach((m) => { m.style.transform = ''; });
      },
    };
  }

  // ---------- the strike sequence, after the visitor has chosen ----------
  function startSequence() {
    const token = ++runToken;
    active = true;
    splash.classList.remove('is-slash-1', 'is-slash-2', 'is-shattered', 'is-cleaved', 'is-parting', 'is-skipping', 'is-wiped');
    root.classList.remove('intro-pending', 'site-unblurring');
    root.classList.add('site-blur-hold');
    root.style.overflow = 'hidden';
    if (skipBtn) skipBtn.focus({ preventScroll: true });

    // The slash track starts as the charge builds, timed so its three slashes fall on the three
    // strikes: the first strike stays where the charge ends (820ms), the others follow the
    // recording's own spacing, and everything after the cleave moves with it.
    const SFX_START = 265;
    const [HIT1, HIT2, HIT3] = SPLASH_SFX_HITS.map((s) => Math.round(SFX_START + s * 1000));
    const after = (ms) => HIT3 + (ms - 1400); // later beats, kept where they sat relative to the cleave

    splash.classList.add('is-powering');
    siteAudio.playSplashSfx(SFX_START);
    fx.charge();

    const onSplashPointer = (e) => {
      if (e.target.closest && e.target.closest('[data-intro-skip]')) return;
      siteAudio.unlock();
    };
    splash.addEventListener('pointerdown', onSplashPointer);

    const at = (ms, fn) => timers.push(setTimeout(() => { if (token === runToken) fn(); }, ms));
    // Three slashes, ONE dragon pass per slash:
    // 1) breaks off orbit to score KPR, 2) counter-dives from top-left to sever KPR in two,
    // 3) single colossal dragon dives from top-right to hit KPR dead-center RIGHT ON HIT3,
    //    crumbling the sliced slabs across its wake before sweeping away to reveal the site!
    at(HIT1 - STRIKES[0].pass.leadMs, () => fx.pass(STRIKES[0]));
    at(HIT2 - STRIKES[1].pass.leadMs, () => fx.pass(STRIKES[1]));
    // The music comes in once the first slash has finished.
    at(HIT1 + 120, () => siteAudio.startMusic());
    // 1) First strike shatters the diamond reticle & scores a razor-straight `/` incision into intact KPR
    at(HIT1, () => fx.strike(STRIKES[0]));
    at(HIT1 + 28, () => { splash.classList.add('is-slash-1'); fx.scarLogo(STRIKES[0]); fx.ringBurst(); });
    // 2) Second strike cleanly severs KPR in two along Slash 2's exact `\` dragon direction
    at(HIT2, () => fx.strike(STRIKES[1]));
    at(HIT2 + 28, () => { fx.sliceLogo(STRIKES[1]); splash.classList.add('is-slash-2'); fx.sparkBurst(); });
    // 3) Third strike: ONE single dragon launches `lungeHitMs` early so its roaring head slams dead-center
    //    on KPR RIGHT ON HIT3, cross-slicing & crumbling KPR right across its sweep into the revealed site!
    at(HIT3, () => { fx.cleave(STRIKES[2]); fx.shatterLogo(STRIKES[2], performance.now()); });
    if (fx.has3d) {
      const LUNGE_AT = Math.max(HIT2 + 220, Math.round(HIT3 - fx.lungeHitMs()));
      at(LUNGE_AT, () => { fx.armLungeArc(STRIKES[2]); fx.lunge(); });
      at(LUNGE_AT + fx.lungeCoverMs(), () => {
        fx.setWiped();
        splash.classList.add('is-wiped');
        root.classList.add('site-wipe');
        releaseSiteBlur();
      });
      // As soon as the dragon tail clears, hand full scroll & click control back to the visitor
      // immediately while keeping the transparent overlay alive until every last KPR shard falls off-screen!
      at(LUNGE_AT + fx.lungeMs() + 40, () => {
        splash.style.pointerEvents = 'none';
        root.style.overflow = '';
        notifyDone();
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        fx.whenDebrisClear(() => finish(false));
      });
      // Safety ceiling in case a tab was backgrounded mid-fall
      at(LUNGE_AT + fx.lungeMs() + 3400, () => finish(false));
    } else {
      at(HIT3 + 80, () => fx.lunge());
      // No 3D dragon: the cut runs the whole screen along the cleave's line. The upper half is
      // sliced off and flies away along the cut, and the site shows through behind it, still
      // blurred: a brief glimpse. The lower half holds for a beat, then dissolves.
      at(after(1490), () => {
        splash.classList.add('is-cleaved');
        root.classList.add('site-glimpse');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (token === runToken) splash.classList.add('is-parting');
        }));
      });
      at(after(1950), () => splash.classList.add('is-revealing'));
      // 4) once the last half has dissolved, ease the website in from the blur
      at(after(2420), () => finish(false));
    }

    function finish(skipped) {
      if (token !== runToken) return;
      runToken++;
      clearTimers();
      cleanupListeners();
      siteAudio.startMusic(); // if the intro was skipped before the music came in
      const finalizeHide = () => {
        fx.stop();
        splash.classList.remove('is-active', 'is-charging', 'is-powering', 'is-glitch', 'is-slash-1', 'is-slash-2', 'is-shattered', 'is-cleaved', 'is-parting', 'is-revealing', 'is-skipping', 'is-wiped');
        root.classList.remove('site-wipe');
        splash.style.pointerEvents = '';
        splash.hidden = true;
        splash.setAttribute('aria-hidden', 'true');
        root.style.overflow = '';
        releaseSiteBlur();
        notifyDone();
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      };
      if (skipped) {
        siteAudio.stopSplashSfx();
        splash.classList.add('is-skipping');
        setTimeout(finalizeHide, 220);
      } else {
        finalizeHide();
      }
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(true); }
    };
    const onSkip = () => finish(true);
    function cleanupListeners() {
      window.removeEventListener('keydown', onKey);
      splash.removeEventListener('pointerdown', onSplashPointer);
      if (skipBtn) skipBtn.removeEventListener('click', onSkip);
    }
    window.addEventListener('keydown', onKey);
    if (skipBtn) skipBtn.addEventListener('click', onSkip);
  }

  // Step 0: sound on or off. This click is also what lets the browser play the blade audio;
  // it blocks sound on a page nobody has clicked yet.
  function showGate() {
    clearTimeout(window.kprIntroFailsafe);
    splash.hidden = false;
    splash.removeAttribute('aria-hidden');
    splash.classList.add('is-active', 'is-gate');
    root.style.overflow = 'hidden';
    if (fx) fx.start();

    // The buttons sit at the bottom; the whole emblem (mark, diamond and the dragon's coil) is
    // centred in the space above them and shrunk if needed, so nothing of it hides behind them.
    const whole = splash.querySelector('.intro-whole');
    const wholeMarks = whole ? Array.from(whole.querySelectorAll('.intro-mark')) : [];
    const mark = wholeMarks[0] || null;
    const reticle = whole ? whole.querySelector('.intro-reticle--whole') : null;
    function layoutGate(instant) {
      if (!whole || !mark) return;
      const H = innerHeight;
      const top = 16, gap = Math.max(16, Math.min(H * 0.035, 32));
      const space = Math.max(80, gate.getBoundingClientRect().top - gap - top);
      // the diamond is a square turned 45°, so it reaches half its diagonal above and below
      const reach = Math.max(mark.offsetHeight / 2, (reticle ? reticle.offsetWidth : 0) * Math.SQRT1_2);
      const scale = Math.min(1, (space / 2) / reach);
      const lift = Math.max(0, H / 2 - (top + space / 2));
      whole.style.setProperty('--gate-lift', lift + 'px');
      whole.style.setProperty('--gate-scale', scale.toFixed(3));
      if (fx) fx.setLift(lift, instant, space / 2);
    }
    // place it before the first paint without gliding there
    wholeMarks.forEach((m) => { m.style.transition = 'none'; });
    layoutGate(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { wholeMarks.forEach((m) => { m.style.transition = ''; }); }));
    const onGateResize = () => layoutGate(true);
    window.addEventListener('resize', onGateResize);

    const buttons = Array.from(gate.querySelectorAll('[data-intro-enter]'));
    // Focus whichever option the visitor picked last time (sound on by default).
    const preferred = buttons.find((b) => (b.dataset.introEnter === 'sound') === siteAudio.isEnabled()) || buttons[0];
    requestAnimationFrame(() => {
      splash.classList.add('is-charging');
      if (preferred) preferred.focus({ preventScroll: true });
    });

    let chosen = false;
    function choose(withSound) {
      if (chosen) return;
      chosen = true;
      window.removeEventListener('keydown', onGateKey);
      window.removeEventListener('resize', onGateResize);
      siteAudio.setEnabled(withSound);
      if (withSound) siteAudio.primeMusic(); // starts once the first slash lands, then keeps looping
      splash.classList.remove('is-gate');
      // the emblem glides back to the centre at full size, where the strikes and the split screen expect it
      if (whole) { whole.style.setProperty('--gate-lift', '0px'); whole.style.setProperty('--gate-scale', '1'); }
      if (fx) fx.setLift(0, false, Infinity);
      if (fx) startSequence();
      else { siteAudio.startMusic(); leaveQuietly(); }
    }
    function onGateKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); choose(false); }
    }
    buttons.forEach((b) => b.addEventListener('click', () => choose(b.dataset.introEnter === 'sound')));
    window.addEventListener('keydown', onGateKey);
  }

  // Reduced motion: no strikes, the screen fades and the site appears.
  function leaveQuietly() {
    root.classList.remove('intro-pending');
    splash.classList.add('is-skipping');
    setTimeout(() => {
      splash.classList.remove('is-active', 'is-charging', 'is-skipping');
      splash.hidden = true;
      splash.setAttribute('aria-hidden', 'true');
      root.style.overflow = '';
      releaseSiteBlur();
      notifyDone();
    }, 240);
  }

  if (active) {
    showGate();
  } else {
    root.classList.remove('intro-pending', 'site-blur-hold', 'site-unblurring');
    if (splash) { splash.hidden = true; splash.setAttribute('aria-hidden', 'true'); }
  }

  return {
    isActive: () => active,
    whenDone(fn) {
      if (!active) fn();
      else doneCallbacks.push(fn);
    },
  };
})();

// ---- Lenis: smooth, weighted scrolling on desktop wheel/trackpad ----
// Touch mobile keeps hardware-accelerated native scrolling directly (no idle RAF or lagSmoothing(0) jank!).
window.kprLenis = null;
(function () {
  if (reduceMotion || isTouchMobile || typeof window.Lenis !== 'function') return;
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
  window.kprLenis = lenis;

  // One clock for everything: drive Lenis from GSAP's ticker so ScrollTrigger effects stay
  // in step with the smoothed position. Without GSAP, run it on its own frame loop.
  if (window.gsap) {
    if (window.ScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add((time) => lenis.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const loop = (time) => { lenis.raf(time); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // Hold the page still while the intro is up, then hand scrolling back at the very top.
  if (window.kprIntro && window.kprIntro.isActive()) {
    lenis.stop();
    window.kprIntro.whenDone(() => {
      lenis.start();
      lenis.scrollTo(0, { immediate: true, force: true });
    });
  } else {
    lenis.scrollTo(0, { immediate: true, force: true });
  }
})();

// ---- Subtle effects: reading progress, frosted header, cursor glow, active nav ----
(function () {
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.scroll-progress');
  const floatTop = document.querySelector('.float-top');
  const footer = document.querySelector('.site-footer');
  let ticking = false, maxScroll = 0, rootFont = 16, floatH = 44, lastScrolled = false;
  function measureScroll() {
    maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (floatTop && !root.classList.contains('has-dock')) floatH = floatTop.offsetHeight || 44;
  }
  function onScroll() {
    ticking = false;
    const y = scrollY;
    const needFloat = !!floatTop && !root.classList.contains('has-dock');
    // Batch all DOM reads BEFORE any DOM writes (eliminates forced synchronous layout thrashing!)
    let bottom = 0;
    if (needFloat) {
      const rest = rootFont * 1.25;
      bottom = rest;
      if (footer) {
        const f = footer.getBoundingClientRect();
        const docked = innerHeight - (f.top + f.height / 2) - floatH / 2;
        bottom = Math.max(rest, docked);
      }
    }
    if (progress) progress.style.setProperty('--progress', maxScroll > 0 ? Math.min(1, y / maxScroll) : 0);
    const isScrolled = y > 24;
    if (header && isScrolled !== lastScrolled) {
      lastScrolled = isScrolled;
      header.classList.toggle('is-scrolled', isScrolled);
    }
    if (needFloat) {
      floatTop.classList.toggle('is-visible', y > innerHeight);
      floatTop.style.bottom = bottom + 'px';
    }
  }
  const onResize = () => { measureScroll(); onScroll(); };
  window.addEventListener('resize', onResize, { passive: true });
  if ('ResizeObserver' in window) {
    let rTimer = 0;
    new ResizeObserver(() => {
      clearTimeout(rTimer);
      rTimer = setTimeout(measureScroll, 120);
    }).observe(document.body);
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  measureScroll();
  onScroll();

  // A soft light follows the cursor across cards (mouse and trackpad only). It's a
  // lighting change rather than movement, so it stays on with reduced motion too.
  const finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (finePointer) {
    document.querySelectorAll('.wx-inspector, .stack-group, .context')
      .forEach((el) => el.classList.add('glow'));
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.glow');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  // Screenshots fade in once loaded.
  document.querySelectorAll('.shot img').forEach((img) => {
    const done = () => img.classList.add('is-loaded');
    if (img.complete) done();
    else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
  });

  // Tech chips cascade in, one after another.
  document.querySelectorAll('.stack-list').forEach((list) => {
    [...list.children].forEach((li, i) => li.style.setProperty('--i', i));
  });

  // Underline the nav link for the section in view (the deck's links follow the open module).
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]:not([data-deck-trigger])')];
  const targets = links.map((a) => document.querySelector(a.hash)).filter(Boolean);
  if ('IntersectionObserver' in window && targets.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = links.find((a) => a.hash === '#' + entry.target.id);
        if (link) link.classList.toggle('is-active', entry.isIntersecting);
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    targets.forEach((t) => io.observe(t));
  }
})();

// ---- Deck: Work / Info / Certifications in one console ----
// The header links, the tabs, keys 1-3 and "Next up" all switch the open module. With GSAP
// the old module slips out and a light beam wipes the new one in; with reduced motion (or
// no GSAP) the switch is instant. Filters, the tech trace and the process rail live here too.
(function () {
  const deck = document.querySelector('[data-deck]');
  if (!deck) return;
  const G = () => window.gsap;
  const canAnimate = () => !!G() && !reduceMotion;
  if (G()) {
    const plugins = [window.Flip, window.ScrambleTextPlugin].filter(Boolean);
    if (plugins.length) G().registerPlugin(...plugins);
  }
  const finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  const ids = ['work', 'certifications', 'info'];
  const names = { work: 'Work', certifications: 'Certifications', info: 'Info' };
  const tabList = deck.querySelector('[data-deck-tabs]');
  const tabs = ids.map((id) => deck.querySelector('[data-deck-tab="' + id + '"]'));
  const panels = ids.map((id) => deck.querySelector('[data-deck-panel="' + id + '"]'));
  const glider = deck.querySelector('[data-deck-glider]');
  const beam = deck.querySelector('[data-deck-beam]');
  const stage = deck.querySelector('[data-deck-stage]');
  const status = deck.querySelector('[data-deck-status]');
  const statusLive = deck.querySelector('[data-deck-status-live]');
  const nextBtn = deck.querySelector('[data-deck-next]');
  const nextLabel = deck.querySelector('[data-deck-next-label]');
  const nav = document.querySelector('[data-header-nav]');
  const navGlider = nav && nav.querySelector('[data-nav-glider]');
  const navLinks = ids.map((id) => nav && nav.querySelector('[data-deck-trigger="' + id + '"]'));
  let current = 0;
  let switching = null;

  // ---- gliders: compositor-only x + scaleX (zero per-frame width layout reflows!) ----
  let gliderBaseW = 0, navGliderBaseW = 100;
  function moveTo(el, x, w, baseW, instant, vars) {
    if (!el || !baseW) return;
    const sx = w / baseW;
    if (G()) {
      if (instant || !canAnimate()) G().set(el, { x, scaleX: sx, transformOrigin: '0 50%' });
      else G().to(el, Object.assign({ x, scaleX: sx, transformOrigin: '0 50%', overwrite: true }, vars));
    } else {
      el.style.transformOrigin = '0 50%';
      el.style.transform = 'translateX(' + x + 'px) scaleX(' + sx + ')';
    }
  }
  function placeGliders(instant) {
    const t = tabs[current];
    if (glider && t) {
      if (instant || !gliderBaseW) {
        gliderBaseW = Math.max(1, tabs[0].offsetWidth || t.offsetWidth);
        glider.style.width = gliderBaseW + 'px';
      }
      moveTo(glider, t.offsetLeft, t.offsetWidth, gliderBaseW, instant, { duration: 0.56, ease: 'expo.inOut' });
    }
    const a = navLinks[current];
    if (a && navGlider) {
      if (instant || navGlider.style.width !== navGliderBaseW + 'px') {
        navGlider.style.width = navGliderBaseW + 'px';
      }
      moveTo(navGlider, a.offsetLeft, a.offsetWidth, navGliderBaseW, instant, { duration: 0.48, ease: 'power3.inOut' });
      nav.classList.add('has-glider');
    }
  }
  if ('ResizeObserver' in window) {
    let roTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = setTimeout(() => placeGliders(true), 50);
    });
    ro.observe(tabList);
    if (nav) ro.observe(nav);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeGliders(true));

  // The header underline dims while the deck is off screen.
  if (nav && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => nav.classList.toggle('is-away', !entry.isIntersecting))
      .observe(deck);
  }

  // ---- labels decode like a cipher on desktop hover/switch (skipped on touch mobile to prevent auto-column & wrap reflows) ----
  function scramble(el, text, duration) {
    if (!el) return;
    if (finePointer && canAnimate() && window.ScrambleTextPlugin) {
      G().to(el, { duration: duration || 0.55, scrambleText: { text, chars: 'upperCase', speed: 0.7 }, overwrite: true });
    } else {
      el.textContent = text;
    }
  }
  if (finePointer) {
    document.querySelectorAll('[data-cipher-text]').forEach((el) => {
      const text = el.textContent;
      const host = el.closest('a, button');
      if (host) host.addEventListener('pointerenter', () => scramble(el, text, 0.45));
    });
  }

  // ---- switching ----
  function show(panel) {
    panels.forEach((p) => {
      const on = p === panel;
      p.hidden = !on;
      p.classList.toggle('is-active', on);
    });
  }
  function mark() {
    tabs.forEach((t, k) => {
      const on = k === current;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    navLinks.forEach((a, k) => {
      if (!a) return;
      a.classList.toggle('is-active', k === current);
      if (k === current) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    const next = ids[(current + 1) % ids.length];
    nextLabel.textContent = names[next];
    nextBtn.setAttribute('aria-label', 'Next up: ' + names[next]);
    const text = panels[current].dataset.status || '';
    statusLive.textContent = text;
    if (finePointer && canAnimate() && window.ScrambleTextPlugin) {
      G().to(status, { duration: 0.9, scrambleText: { text, chars: 'lowerCase', speed: 0.6, revealDelay: 0.2 }, overwrite: true });
    } else {
      status.textContent = text;
    }
  }
  function deckTop() {
    const margin = parseFloat(getComputedStyle(deck).scrollMarginTop) || 0;
    return deck.getBoundingClientRect().top + scrollY - margin;
  }
  function scrollToDeck(done) {
    if (window.kprGlideTo) window.kprGlideTo(Math.max(0, deckTop()), done);
    else { window.scrollTo(0, deckTop()); if (done) done(); }
  }
  // After a module appears: let motion.js arm its first-visit entrances, re-measure scroll
  // effects, and (on later visits) cascade in whatever is on screen.
  const CASCADE_SEL = '.section-bar, .wx-bar, .wx-shell, [data-item]:not(.is-filtered-out), .context, .process-step, .stack-group, .trace';
  function clearPanelAnims(panel) {
    if (!G() || !panel) return;
    const g = G();
    g.killTweensOf(panel);
    g.set(panel, { clearProps: 'opacity,visibility,transform,clipPath' });
    const items = panel.querySelectorAll(CASCADE_SEL);
    if (items.length) {
      g.killTweensOf(items);
      g.set(items, { clearProps: 'opacity,visibility,transform' });
    }
  }
  function afterShow(panel, firstVisit) {
    if (window.kprMotion && window.kprMotion.armPanel) window.kprMotion.armPanel(panel);
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    // Re-measure scrollable explorer rails (Work & Certifications) once their panel is visible.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    if (!firstVisit && canAnimate()) {
      const items = [...panel.querySelectorAll(CASCADE_SEL)]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })
        .slice(0, 10);
      if (items.length) {
        G().fromTo(items, { y: 18, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.55, stagger: 0.04, ease: 'power3.out', delay: 0.06,
          overwrite: 'auto',
          clearProps: 'transform,opacity,visibility',
        });
      }
    }
  }

  function activate(i, opts) {
    opts = opts || {};
    if (i < 0 || i >= panels.length) return;
    const to = panels[i];
    if (i === current && to.classList.contains('is-active') && !to.hidden && !switching) {
      if (opts.scroll) scrollToDeck(opts.then);
      else if (opts.then) opts.then();
      return;
    }
    // Capture whichever panel is actually visible right now (not stale `from` during rapid clicks).
    const from = panels.find((p) => p.classList.contains('is-active') && !p.hidden) || panels[current];
    current = i;
    mark();
    placeGliders(false);
    scramble(tabs[i].querySelector('[data-cipher-text]'), names[ids[i]], 0.55);

    // Keep the console in view: from the header (or "Next up") always glide to it, and from
    // the tabs only when the visitor has scrolled past it.
    if (opts.scroll || deck.getBoundingClientRect().top < 0) scrollToDeck();

    const firstVisit = !to.dataset.visited;
    to.dataset.visited = '1';

    // Safely interrupt any in-flight transition BEFORE mutating panels (never call progress(1)
    // synchronously into onComplete, which previously nulled `switching` right before `.kill()`).
    if (switching) {
      const prev = switching;
      switching = null;
      prev.kill();
    }
    if (G()) {
      panels.forEach(clearPanelAnims);
      G().killTweensOf(beam);
      G().set(beam, { clearProps: 'opacity,visibility,transform', x: 0 });
    }

    if (!canAnimate() || from === to) {
      show(to);
      afterShow(to, firstVisit);
      if (opts.then) opts.then();
      return;
    }
    const g = G();
    const tl = g.timeline({
      onComplete: () => {
        if (switching === tl) switching = null;
        if (!finePointer && window.ScrollTrigger) window.ScrollTrigger.refresh();
      },
    });
    switching = tl;
    if (!finePointer) {
      // Touch mobile: pure GPU compositor fade + subtle slide (avoids full-panel clipPath rasterization jank!)
      tl.to(from, { autoAlpha: 0, x: -12, duration: 0.12, ease: 'power2.in' })
        .add(() => {
          if (switching !== tl) return;
          clearPanelAnims(from);
          show(to);
          if (window.kprMotion && window.kprMotion.armPanel) window.kprMotion.armPanel(to);
          if (opts.then) opts.then();
        })
        .fromTo(to, { autoAlpha: 0, x: 14 },
          { autoAlpha: 1, x: 0, duration: 0.30, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
    } else {
      tl.to(from, { autoAlpha: 0, x: -24, duration: 0.16, ease: 'power2.in' })
        .add(() => {
          if (switching !== tl) return;
          clearPanelAnims(from);
          show(to);
          afterShow(to, firstVisit);
          if (opts.then) opts.then();
        })
        .set(beam, { autoAlpha: 1, x: 0 })
        .fromTo(to, { clipPath: 'inset(0% 100% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.52, ease: 'power3.inOut', clearProps: 'clipPath' }, '<')
        .to(beam, { x: () => stage.clientWidth, duration: 0.52, ease: 'power3.inOut' }, '<')
        .to(beam, { autoAlpha: 0, duration: 0.2, ease: 'power1.out' }, '-=0.14')
        .set(beam, { x: 0 }); // park it at the left edge so it never widens the page
    }
  }

  const indexOf = (id) => ids.indexOf(id);
  const setHash = (id) => { if (history.replaceState) history.replaceState(null, '', '#' + id); };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { activate(i); setHash(ids[i]); });
  });
  // Arrow keys move along the tabs (and open them), as in any tab strip.
  tabList.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const step = keys[e.key];
    const i = step === 'first' ? 0 : step === 'last' ? ids.length - 1 : (current + step + ids.length) % ids.length;
    tabs[i].focus();
    activate(i);
    setHash(ids[i]);
  });

  // Header links and "Explore my work": switch, then glide to the console.
  document.querySelectorAll('[data-deck-trigger]').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const i = indexOf(link.dataset.deckTrigger);
      if (i < 0) return;
      e.preventDefault();
      activate(i, { scroll: true });
      if (history.pushState) history.pushState(null, '', '#' + ids[i]);
    });
  });

  nextBtn.addEventListener('click', () => {
    const i = (current + 1) % ids.length;
    activate(i, { scroll: true, then: () => tabs[i].focus({ preventScroll: true }) });
    setHash(ids[i]);
  });

  // Keys 1-3 switch modules while the deck is on screen (not while typing or playing AMBOT).
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    const i = ['1', '2', '3'].indexOf(e.key);
    if (i < 0) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable], [data-game]')) return;
    if (document.fullscreenElement || root.classList.contains('intro-pending')) return;
    const r = deck.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    activate(i);
    setHash(ids[i]);
  });

  // Deep links (#info, #stack, #project-ambot …) open the module that holds the target.
  function openFromHash(instantScroll) {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target || !deck.contains(target)) return;
    const panel = target.closest('[data-deck-panel]');
    const i = panel ? panels.indexOf(panel) : -1;
    if (i < 0) return;
    const targetY = () => {
      if (target === panel) return deckTop();
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 72;
      return target.getBoundingClientRect().top + scrollY - margin;
    };
    const reveal = () => {
      if (hash.startsWith('project-') && window.kprWorkSelect) {
        window.kprWorkSelect(hash.slice('project-'.length));
      }
      if (!instantScroll) {
        if (window.kprGlideTo) window.kprGlideTo(targetY()); else window.scrollTo(0, targetY());
        return;
      }
      window.scrollTo(0, targetY());
      // Images and fonts above can still shift the page after a fresh load: re-aim once it
      // settles, unless the visitor has scrolled since.
      const landed = scrollY;
      const reaim = () => { if (Math.abs(scrollY - landed) < 2) window.scrollTo(0, targetY()); };
      if (document.readyState === 'complete') setTimeout(reaim, 350);
      else window.addEventListener('load', () => setTimeout(reaim, 350), { once: true });
    };
    if (instantScroll) {
      current = i;
      panels[i].dataset.visited = '1';
      show(panels[i]);
      mark();
      placeGliders(true);
      // Wait for the intro (if any) to hand the page back before scrolling.
      if (window.kprIntro && window.kprIntro.whenDone) window.kprIntro.whenDone(reveal);
      else requestAnimationFrame(reveal);
    } else {
      activate(i, { then: () => requestAnimationFrame(reveal) });
    }
  }
  window.addEventListener('hashchange', () => openFromHash(false));

  // ---- start: one module open, the rest hidden ----
  // Every visit starts at the very top with Work open. Switching tabs writes #info or
  // #certifications into the address, so a reload (or a link copied mid-visit) would otherwise
  // reopen that tab and jump down to it: drop the hash on a fresh load instead of following it.
  // (During the visit, tabs, header links and #deep-links still work as before via hashchange.)
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  panels[0].dataset.visited = '1';
  show(panels[current]);
  placeGliders(true);

  // ---- Split-Pane Explorers (Work & Certifications: scrollable logo rail + live inspector) ----
  deck.querySelectorAll('[data-wx-shell]').forEach((shell) => {
    const rail = shell.querySelector('[data-wx-rail]');
    const listWrap = shell.querySelector('[data-wx-list-wrap]');
    const list = shell.querySelector('[data-wx-list]');
    const items = [...shell.querySelectorAll('[data-wx-select]')];
    const panes = [...shell.querySelectorAll('[data-wx-pane]')];
    const order = items.map((b) => b.dataset.wxSelect);
    const video = shell.querySelector('[data-lazy-video]');
    const isWork = shell.closest('#work') !== null;

    let activeIdx = 0;

    function updateFades() {
      if (!list || !listWrap) return;
      const top = list.scrollTop > 4;
      const bottom = list.scrollTop + list.clientHeight < list.scrollHeight - 4;
      listWrap.classList.toggle('has-top-fade', top);
      listWrap.classList.toggle('has-bottom-fade', bottom);
    }

    function scrollItemIntoView(btn) {
      if (!list || !btn) return;
      if (window.matchMedia('(max-width: 860px)').matches) {
        btn.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        return;
      }
      const targetTop = btn.offsetTop - (list.clientHeight - btn.offsetHeight) / 2;
      const clamped = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, targetTop));
      list.scrollTo({ top: clamped, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    function selectEntry(key, opts) {
      opts = opts || {};
      const idx = order.indexOf(key);
      if (idx < 0) return;
      activeIdx = idx;

      items.forEach((btn, k) => {
        const on = k === idx;
        btn.setAttribute('aria-selected', String(on));
        btn.tabIndex = on ? 0 : -1;
        if (on && opts.focus) btn.focus({ preventScroll: true });
        if (on && opts.scrollList !== false) scrollItemIntoView(btn);
      });
      panes.forEach((p) => {
        const on = p.dataset.wxPane === key;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
      if (video) {
        if (key === 'gallus') {
          if (video.preload === 'none') { video.preload = 'metadata'; video.load(); }
        } else if (!video.paused) {
          video.pause();
        }
      }
      if (isWork) window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(updateFades);
    }

    items.forEach((btn) => {
      btn.addEventListener('click', () => selectEntry(btn.dataset.wxSelect, { scrollList: true }));
    });

    if (list) {
      list.addEventListener('scroll', updateFades, { passive: true });
      list.addEventListener('keydown', (e) => {
        const keys = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
        if (!(e.key in keys)) return;
        e.preventDefault();
        const step = keys[e.key];
        const nextIdx = step === 'first' ? 0 : step === 'last' ? items.length - 1 : (activeIdx + step + items.length) % items.length;
        selectEntry(order[nextIdx], { focus: true, scrollList: true });
      });
    }

    // Mouse-wheel / trackpad scrolling over the side panel steps through entries smoothly.
    // Once at the very top (scrolling up) or very bottom (scrolling down), let the wheel event
    // bubble straight through so the site's universal Lenis / page scroll takes over seamlessly.
    if (rail) {
      let wheelAcc = 0;
      let lastStepAt = 0;
      rail.addEventListener('wheel', (e) => {
        if (window.matchMedia('(max-width: 860px)').matches) return;
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        const dir = e.deltaY > 0 ? 1 : -1;
        const now = performance.now();
        const atTop = !list || list.scrollTop <= 2;
        const atBottom = !list || (list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
        const canPassUp = dir < 0 && activeIdx === 0 && atTop;
        const canPassDown = dir > 0 && activeIdx === order.length - 1 && atBottom;

        if (canPassUp || canPassDown) {
          // Absorb only a brief trailing tick right after arriving at the boundary;
          // otherwise hand straight back to the universal page scroll.
          if (now - lastStepAt < 200) {
            e.preventDefault();
            e.stopPropagation();
          }
          wheelAcc = 0;
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // If the user dragged the scrollbar away from the edge on the first/last item,
        // let wheel smoothly return the list to the edge first.
        if (dir < 0 && activeIdx === 0 && !atTop && list) {
          list.scrollTop = Math.max(0, list.scrollTop + e.deltaY);
          return;
        }
        if (dir > 0 && activeIdx === order.length - 1 && !atBottom && list) {
          list.scrollTop = Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + e.deltaY);
          return;
        }

        if (now - lastStepAt < 135) return;
        wheelAcc += e.deltaY;
        if (Math.abs(wheelAcc) >= 28) {
          const stepDir = wheelAcc > 0 ? 1 : -1;
          wheelAcc = 0;
          lastStepAt = now;
          const next = Math.max(0, Math.min(order.length - 1, activeIdx + stepDir));
          if (next !== activeIdx) selectEntry(order[next], { scrollList: true });
        }
      }, { passive: false });
    }

    window.addEventListener('resize', updateFades);
    selectEntry(order[0], { scrollList: false });
    requestAnimationFrame(updateFades);
    if (isWork) window.kprWorkSelect = (key) => selectEntry(key, { scrollList: true });
  });

  // ---- tech trace: pick a technology, see (and jump to) the projects that ship with it ----
  const PROJECTS = {
    gallus: 'Gallus', teamflow: 'TeamFlow', newshub: 'NewsHub',
    fitcampus: 'FitCampus', ambot: 'AMBOT',
  };
  const USED_IN = {
    Java: ['newshub', 'ambot'], Kotlin: ['fitcampus'], Python: ['teamflow'], TypeScript: ['gallus'],
    JavaScript: ['teamflow', 'newshub'], Rust: ['gallus'], HTML: ['gallus', 'teamflow', 'newshub'],
    CSS: ['gallus', 'teamflow', 'newshub'], React: ['gallus', 'newshub'], 'Spring Boot': ['newshub'],
    Django: ['teamflow'], 'Tailwind CSS': ['newshub'], Vite: ['gallus'], Capacitor: ['gallus'],
    Tauri: ['gallus'], PostgreSQL: ['teamflow', 'newshub'], SQLite: ['gallus', 'fitcampus'],
    Supabase: ['gallus', 'teamflow', 'newshub'], Android: ['gallus', 'fitcampus'],
    Git: Object.keys(PROJECTS), GitHub: Object.keys(PROJECTS), Render: ['gallus', 'teamflow', 'newshub'],
    'JUnit 5': ['ambot'],
  };
  const NOTES = {
    Vercel: 'hosts this portfolio, the site you’re on now.',
    Claude: 'is an AI coding assistant I use; it isn’t tagged on a featured project.',
    Antigravity: 'is an AI coding assistant I use; it isn’t tagged on a featured project.',
    Codex: 'is an AI coding assistant I use; it isn’t tagged on a featured project.',
  };
  const stack = deck.querySelector('#stack');
  const chips = [...deck.querySelectorAll('.chip[data-tech]')];
  const traceHead = deck.querySelector('[data-trace-head]');
  const traceLinks = deck.querySelector('[data-trace-links]');
  const defaultHead = traceHead ? traceHead.textContent : '';
  const everywhere = (tech) => (USED_IN[tech] || []).length === Object.keys(PROJECTS).length;

  function jumpTo(key) {
    const inspector = deck.querySelector('[data-wx-inspector]');
    const target = document.getElementById('project-' + key);
    if (!target) return;
    if (window.kprWorkSelect) window.kprWorkSelect(key);
    activate(0, {
      scroll: true,
      then: () => {
        if (window.kprWorkSelect) window.kprWorkSelect(key);
        const flashEl = inspector || target;
        requestAnimationFrame(() => {
          flashEl.classList.remove('is-traced');
          void flashEl.offsetWidth;
          flashEl.classList.add('is-traced');
          setTimeout(() => flashEl.classList.remove('is-traced'), 2400);
        });
      },
    });
    setHash('work');
  }

  function select(chip) {
    const tech = chip ? chip.dataset.tech : null;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    stack.classList.toggle('is-tracing', !!chip);
    const used = tech ? USED_IN[tech] || [] : [];
    chips.forEach((c) => {
      const other = USED_IN[c.dataset.tech] || [];
      const related = !!chip && c !== chip && !everywhere(c.dataset.tech) &&
        other.some((p) => used.includes(p));
      c.classList.toggle('is-related', related);
    });
    traceLinks.textContent = '';
    if (!chip) { traceHead.textContent = defaultHead; return; }
    const strong = document.createElement('strong');
    strong.textContent = tech;
    traceHead.textContent = '';
    traceHead.append(strong);
    if (!used.length) {
      traceHead.append(' ' + (NOTES[tech] || 'isn’t tagged on a featured project.'));
      return;
    }
    traceHead.append(used.length === Object.keys(PROJECTS).length
      ? ' runs through all five projects.'
      : ' shipped in ' + (used.length === 1 ? 'one project' : used.length + ' projects') +
        '. Lit chips shipped alongside it.');
    used.forEach((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'trace-link';
      b.innerHTML = '<span></span><span class="arrow" aria-hidden="true">→</span>';
      b.firstChild.textContent = PROJECTS[key];
      b.setAttribute('aria-label', 'Go to ' + PROJECTS[key] + ' in Work');
      b.addEventListener('click', () => jumpTo(key));
      traceLinks.append(b);
    });
    if (canAnimate()) {
      G().fromTo(traceLinks.children, { autoAlpha: 0, x: -12 },
        { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
    }
  }
  chips.forEach((chip) => chip.addEventListener('click', () => {
    select(chip.getAttribute('aria-pressed') === 'true' ? null : chip);
  }));

  // ---- process rail: hovering a step fills the rail up to it ----
  const process = deck.querySelector('[data-process]');
  if (process) {
    const steps = [...process.querySelectorAll('.process-step')];
    const fill = process.querySelector('[data-process-fill]');
    const rail = process.querySelector('.process-rail');
    const last = steps.length - 1;
    const light = (n) => {
      steps.forEach((s, k) => s.classList.toggle('is-dim', k > n));
      const ratio = n >= last ? 1 : n < 0 ? 0 : (steps[n].offsetLeft + 6) / (rail.offsetWidth || 1);
      fill.style.setProperty('--fill', Math.min(1, ratio).toFixed(4));
    };
    steps.forEach((s, k) => s.addEventListener('pointerenter', () => light(k)));
    process.addEventListener('pointerleave', () => light(last));
    // First time the steps come into view, the rail charges one stage at a time.
    if (canAnimate() && 'IntersectionObserver' in window) {
      light(-1);
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        steps.forEach((_, k) => setTimeout(() => light(k), 250 + k * 380));
      }, { threshold: 0.6 });
      io.observe(process);
    }
  }
})();

// ---- Info: the journey board's copper trace, and the Gallus link diagram ----
// The trace is routed through the solder pads in reading order: straight along a row, straight
// down a column, and between rows round the board's right edge, back along the gap, and in from
// the left, with 45-degree corners like a real PCB. The run into the last pad ("Next") is drawn
// dashed and never powers up. The first time the board is on screen the trace powers up once,
// lighting each pad as it arrives; with reduced motion it is simply lit.
(function () {
  const board = document.querySelector('[data-journey]');
  if (!board) return;
  const svg = board.querySelector('.journey-trace');
  const base = board.querySelector('[data-journey-base]');
  const live = board.querySelector('[data-journey-live]');
  const next = board.querySelector('[data-journey-next]');
  const list = board.querySelector('.journey-list');
  const steps = [...board.querySelectorAll('.journey-step')];
  const pads = steps.map((s) => s.querySelector('.journey-pad'));
  let mainLen = 0, padAt = [], powered = false, powering = false;

  // Polyline -> SVG path with each interior corner cut at 45 degrees.
  function chamfered(pts, cut) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], p = pts[i], b = pts[i + 1];
      const la = Math.hypot(p.x - a.x, p.y - a.y) || 1, lb = Math.hypot(b.x - p.x, b.y - p.y) || 1;
      const c = Math.min(cut, la / 2, lb / 2);
      d += ` L${p.x - ((p.x - a.x) / la) * c} ${p.y - ((p.y - a.y) / la) * c}`;
      d += ` L${p.x + ((b.x - p.x) / lb) * c} ${p.y + ((b.y - p.y) / lb) * c}`;
    }
    const z = pts[pts.length - 1];
    return d + ` L${z.x} ${z.y}`;
  }
  function route() {
    const br = board.getBoundingClientRect();
    if (br.width < 10) return false; // the Info module isn't showing
    svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
    const centres = pads.map((p) => { const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top }; });
    const rowGap = parseFloat(getComputedStyle(list).rowGap) || 40;
    const edgeR = br.width - 16, edgeL = 16;
    const legs = [];
    for (let i = 1; i < centres.length; i++) {
      const a = centres[i - 1], b = centres[i];
      if (Math.abs(a.y - b.y) < 6 || Math.abs(a.x - b.x) < 6) { legs.push([a, b]); continue; }
      const gapY = steps[i].getBoundingClientRect().top - br.top - rowGap / 2;
      legs.push([a, { x: edgeR, y: a.y }, { x: edgeR, y: gapY }, { x: edgeL, y: gapY }, { x: edgeL, y: b.y }, b]);
    }
    // Everything up to the last pad is the powered trace; the last leg is the dashed "next" run.
    const mainPts = [centres[0]];
    padAt = [0];
    legs.slice(0, -1).forEach((leg) => { mainPts.push(...leg.slice(1)); });
    base.setAttribute('d', chamfered(mainPts, 10));
    live.setAttribute('d', chamfered(mainPts, 10));
    next.setAttribute('d', chamfered(legs.length ? legs[legs.length - 1] : [], 10));
    mainLen = live.getTotalLength();
    // How far along the trace each pad sits, to light it as the power arrives.
    let acc = 0;
    legs.slice(0, -1).forEach((leg) => {
      for (let k = 1; k < leg.length; k++) acc += Math.hypot(leg[k].x - leg[k - 1].x, leg[k].y - leg[k - 1].y);
      padAt.push(acc);
    });
    // The 45-degree corner cuts make the drawn trace a little shorter than the square route;
    // scale the pad positions to match, or the pads after a corner would never light.
    const k = acc > 0 ? mainLen / acc : 1;
    padAt = padAt.map((v) => v * k);
    live.style.strokeDasharray = `${mainLen} ${mainLen}`;
    if (powered) live.style.strokeDashoffset = '0';
    else if (!powering) live.style.strokeDashoffset = String(mainLen);
    return true;
  }
  function light(drawn) {
    steps.forEach((s, i) => { if (i < padAt.length) s.classList.toggle('is-lit', drawn >= padAt[i] - 1); });
  }
  function powerUp() {
    if (powered || powering) return;
    if (!route()) return;
    if (reduceMotion) { powered = true; live.style.strokeDashoffset = '0'; light(mainLen); return; }
    powering = true;
    const t0 = performance.now(), dur = 1700;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur), drawn = ease(p) * mainLen;
      live.style.strokeDashoffset = String(mainLen - drawn);
      light(drawn);
      if (p < 1) requestAnimationFrame(frame);
      else { powering = false; powered = true; }
    })(t0);
  }

  // Re-route whenever the board changes size (window resizes, or the Info module opening).
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!powering) route(); }).observe(board);
  else window.addEventListener('resize', () => { if (!powering) route(); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      if (route()) { io.disconnect(); powerUp(); }
    }, { threshold: 0.35 });
    io.observe(board);
  } else {
    powerUp();
  }

  // Gallus: the packets cross the desktop-to-mobile link a few times when it first comes into view.
  const story = document.querySelector('[data-story]');
  if (story && 'IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      so.disconnect();
      story.classList.add('is-linked');
    }, { threshold: 0.5 });
    so.observe(story);
  }
})();

// ---- 01 / Gallus: promo video, loaded only when it scrolls into view ----
(function () {
  // The video uses the browser's own controls (seek bar, volume, fullscreen). It starts
  // muted when it scrolls into view and pauses when it scrolls away, unless the visitor
  // paused it themselves.
  const video = document.querySelector('[data-lazy-video]');
  if (!video) return;
  let loaded = false;
  let userPaused = reduceMotion; // reduced motion: never autoplay, wait for the visitor
  let autoPausing = false;

  function load() {
    if (loaded) return;
    loaded = true;
    video.preload = 'metadata';
    video.load();
  }
  function play() { load(); video.play().catch(() => {}); }

  video.addEventListener('play', () => { userPaused = false; });
  video.addEventListener('pause', () => {
    if (autoPausing) autoPausing = false;
    else userPaused = true; // paused from the controls
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          load(); // so the controls work even when it doesn't autoplay
          if (!userPaused) play();
        } else if (!video.paused) {
          autoPausing = true;
          video.pause();
        }
      });
    }, { threshold: 0.35 }).observe(video);
  } else {
    load();
    if (!userPaused) play();
  }
})();

// ---- Screenshot slideshows (FitCampus, AMBOT): cross-fade, loop, dots to jump ----
(function () {
  document.querySelectorAll('[data-slides]').forEach((box, n) => {
    const slides = [...box.querySelectorAll('.slide')];
    if (slides.length < 2) return;
    let index = 0, timer = null, paused = false, inView = !('IntersectionObserver' in window);
    const dots = document.createElement('div');
    dots.className = 'slide-dots';
    const buttons = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Show screenshot ' + (i + 1) + ' of ' + slides.length);
      b.addEventListener('click', () => { show(i); restart(); });
      dots.appendChild(b);
      return b;
    });
    box.appendChild(dots);
    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('is-active', k === index));
      buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === index)));
    }
    function restart() {
      clearInterval(timer);
      if (!paused && inView) timer = setInterval(() => show(index + 1), 3200);
    }
    // Pause while off-screen or while the visitor is looking closely (hover or keyboard focus).
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        if (inView) restart();
        else clearInterval(timer);
      }).observe(box);
    }
    box.addEventListener('mouseenter', () => { paused = true; clearInterval(timer); });
    box.addEventListener('mouseleave', () => { paused = false; restart(); });
    box.addEventListener('focusin', () => { paused = true; clearInterval(timer); });
    box.addEventListener('focusout', () => { paused = false; restart(); });
    show(0);
    // Offset the second slideshow so the two don't change in lockstep.
    setTimeout(restart, n * 1600);
  });
})();

// ---- "Email" button: copies the address and says so ----
(function () {
  const toast = document.querySelector('.toast');
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        // Older browsers or a blocked clipboard: fall back to a hidden text field.
        const field = document.createElement('textarea');
        field.value = text; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0';
        document.body.appendChild(field); field.select();
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        field.remove();
      }
      showToast(ok ? 'Email copied to clipboard: ' + text : 'Couldn’t copy it. My email is ' + text);
    });
  });
})();

// Run once the intro has finished (or straight away when there's none).
function kprAfterIntro(fn) {
  if (window.kprIntro && window.kprIntro.whenDone) window.kprIntro.whenDone(fn);
  else fn();
}

// ---- TextType: the hero status line types itself out ----
// Ported from React Bits' TextType (MIT, reactbits.dev) to plain JS: variable typing speed,
// a per-character blur-in, backspace deletion, and a bar cursor that glides and blinks.
// Screen readers get every line at once; reduced motion swaps whole lines without typing.
(function () {
  const el = document.querySelector('[data-text-type]');
  if (!el) return;
  let lines;
  try { lines = JSON.parse(el.dataset.textType); } catch (e) { return; }
  if (!Array.isArray(lines) || !lines.length) return;

  const TYPE_MIN = 45, TYPE_MAX = 85, DELETE_SPEED = 26, PAUSE = 2300, NEXT_LINE = 320;
  const graphemes = (v) => (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v), (p) => p.segment)
    : Array.from(v);

  el.classList.add('text-type');
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'text-type__sr';
  sr.textContent = lines.join('. ');
  const content = document.createElement('span');
  content.setAttribute('aria-hidden', 'true');
  const typed = document.createElement('span');
  const caret = document.createElement('span');
  caret.className = 'text-type__caret';
  caret.textContent = '​';
  content.append(typed, caret);
  const cursor = document.createElement('span');
  cursor.className = 'text-type__cursor';
  cursor.setAttribute('aria-hidden', 'true');
  const blink = document.createElement('span');
  blink.className = 'text-type__blink';
  const shape = document.createElement('span');
  shape.className = 'text-type__shape';
  blink.appendChild(shape);
  cursor.appendChild(blink);
  el.append(sr, content, cursor);

  // Cursor: a soft blink that holds solid while characters are landing.
  const blinkAnim = !reduceMotion && blink.animate
    ? blink.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: 1050, iterations: Infinity, easing: 'ease-in-out' })
    : null;
  let blinkTimer = 0;
  function holdBlink() {
    if (!blinkAnim) return;
    blinkAnim.pause();
    blinkAnim.currentTime = 0;
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => blinkAnim.play(), 140);
  }
  let last = null;
  function placeCursor(instant) {
    const x = caret.offsetLeft, y = caret.offsetTop;
    if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
    const jump = instant || !last || reduceMotion || Math.abs(last.y - y) > 1;
    last = { x, y };
    if (window.gsap) {
      if (jump) { window.gsap.killTweensOf(cursor); window.gsap.set(cursor, { x, y }); }
      else window.gsap.to(cursor, { x, y, duration: 0.1, ease: 'power3.out', overwrite: true });
    } else {
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    }
    if (!instant) holdBlink();
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => { last = null; placeCursor(true); }).observe(el);

  // Only type while the line is on screen; resume where it left off.
  let visible = true, pending = null, timer = 0;
  function schedule(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (visible) fn(); else pending = fn; }, ms);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && pending) { const fn = pending; pending = null; fn(); }
    }).observe(el);
  }

  let index = 0, chars = graphemes(lines[0]), shown = 0;
  function typeNext() {
    if (shown < chars.length) {
      const span = document.createElement('span');
      span.className = 'text-type__char';
      span.textContent = chars[shown];
      typed.appendChild(span);
      if (span.animate) {
        if (isTouchMobile) {
          span.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }],
            { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        } else {
          span.animate([{ opacity: 0, filter: 'blur(0.3em)' }, { opacity: 1, filter: 'blur(0em)' }],
            { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        }
      }
      shown++;
      placeCursor(false);
      schedule(typeNext, TYPE_MIN + Math.random() * (TYPE_MAX - TYPE_MIN));
    } else {
      schedule(deleteNext, PAUSE);
    }
  }
  function deleteNext() {
    if (shown > 0) {
      typed.lastChild.remove();
      shown--;
      placeCursor(false);
      schedule(deleteNext, DELETE_SPEED);
    } else {
      index = (index + 1) % lines.length;
      chars = graphemes(lines[index]);
      schedule(typeNext, NEXT_LINE);
    }
  }
  function swapWhole() { // reduced motion: whole lines, no typing
    typed.textContent = lines[index];
    placeCursor(true);
    index = (index + 1) % lines.length;
    schedule(swapWhole, PAUSE + 1200);
  }
  placeCursor(true);
  kprAfterIntro(() => schedule(reduceMotion ? swapWhole : typeNext, reduceMotion ? 0 : 450));
})();

// ---- Profile card: tilt, glare and foil that follow the pointer ----
// Ported from React Bits' ProfileCard (MIT, reactbits.dev): a damped spring eases the card
// toward the pointer and writes the --pc-* variables the CSS uses. Reduced motion keeps the
// light following the pointer but drops the tilt and the photo parallax.
(function () {
  const card = document.querySelector('[data-profile-card]');
  // On touch-only mobile, skip spring tilt & 13-CSS-var foil repaints so swiping past the portrait stays 60fps
  if (!card || isTouchMobile) return;
  const TILT = 10, DEPTH = 6;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const size = { width: card.offsetWidth, height: card.offsetHeight };
  const x = { p: 0, v: 0, target: 0 }, y = { p: 0, v: 0, target: 0 }, light = { p: 0, target: 0 };
  let raf = 0, last = 0, slowUntil = 0, touchId = null;

  function write() {
    const angle = reduceMotion ? 0 : TILT;
    const depth = reduceMotion ? 0 : DEPTH;
    const tilt = Math.min(1, Math.hypot(x.p, y.p));
    const s = card.style;
    s.setProperty('--pc-light-x', `${((x.p + 1) * 0.5 * size.width).toFixed(1)}px`);
    s.setProperty('--pc-light-y', `${((y.p + 1) * 0.5 * size.height).toFixed(1)}px`);
    s.setProperty('--pc-pointer-x', `${((x.p + 1) * 50).toFixed(2)}%`);
    s.setProperty('--pc-pointer-y', `${((y.p + 1) * 50).toFixed(2)}%`);
    s.setProperty('--pc-band-x', `${(50 + x.p * 15).toFixed(2)}%`);
    s.setProperty('--pc-band-y', `${(50 + y.p * 15).toFixed(2)}%`);
    s.setProperty('--pc-rotate-x', `${(y.p * angle).toFixed(3)}deg`);
    s.setProperty('--pc-rotate-y', `${(-x.p * angle).toFixed(3)}deg`);
    s.setProperty('--pc-shift-x', `${(x.p * depth).toFixed(2)}px`);
    s.setProperty('--pc-shift-y', `${(y.p * depth).toFixed(2)}px`);
    s.setProperty('--pc-reach', tilt.toFixed(4));
    s.setProperty('--pc-tilt', (tilt * light.p).toFixed(4));
    s.setProperty('--pc-active', light.p.toFixed(4));
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const slow = now < slowUntil;
    const stiffness = slow ? 24 : 120, damping = slow ? 9 : 16;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of [x, y]) {
        axis.v += (stiffness * (axis.target - axis.p) - damping * axis.v) * h;
        axis.p += axis.v * h;
      }
    }
    const tau = light.target > light.p ? 0.18 : slow ? 0.9 : 0.45;
    light.p += (light.target - light.p) * (1 - Math.exp(-dt / tau));
    write();
    const moving = Math.abs(x.target - x.p) > 0.0005 || Math.abs(y.target - y.p) > 0.0005 ||
      Math.abs(x.v) > 0.0005 || Math.abs(y.v) > 0.0005 || Math.abs(light.target - light.p) > 0.002;
    if (moving) raf = requestAnimationFrame(frame);
    else { x.p = x.target; y.p = y.target; light.p = light.target; write(); raf = 0; }
  }
  function wake() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(frame); }
  function aim(nx, ny, on) {
    x.target = clamp(nx, -1, 1); y.target = clamp(ny, -1, 1);
    light.target = on ? 1 : 0;
    slowUntil = 0;
    wake();
  }
  function aimAt(e) {
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    aim(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, true);
  }
  const release = () => aim(0, 0, false);
  card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') aimAt(e); });
  card.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerId === touchId) aimAt(e); });
  card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') release(); });
  card.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; touchId = e.pointerId; aimAt(e); });
  const lift = (e) => { if (e.pointerId !== touchId) return; touchId = null; release(); };
  card.addEventListener('pointerup', lift);
  card.addEventListener('pointercancel', lift);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { size.width = card.offsetWidth; size.height = card.offsetHeight; write(); }).observe(card);
  }
  write();
  // A slow settle from a tilt, once the hero has come in: shows the card is alive.
  if (!reduceMotion) {
    kprAfterIntro(() => setTimeout(() => {
      x.p = 0.62; y.p = -0.55; light.p = 1;
      slowUntil = performance.now() + 1400;
      write();
      wake();
    }, 650));
  }
})();

// ---- Dock: résumé and contacts, one click away anywhere on the page ----
// Ported from React Bits' Dock (MIT, reactbits.dev): tiles grow on a spring as the pointer
// nears them, hop when clicked, show a label on hover or focus, and arrow keys move along
// the row. It slides in once the intro is done. Touch screens get the bar without magnifying.
(function () {
  const dock = document.querySelector('[data-dock]');
  if (!dock) return;
  const items = [...dock.children].filter((n) => n.classList.contains('dock-item') || n.classList.contains('dock-separator'));
  const MASS = 0.1, STIFFNESS = 150, DAMPING = 12, HOP = 0.4, HOP_TIME = 0.38;
  const fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const motion = new Map();
  const pointer = { x: 0, inside: false };
  let base = 44, peak = 62, distance = 176, gap = 8, focused = -1, raf = 0, last = 0;

  function measure() {
    const cs = getComputedStyle(dock);
    const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
    const read = (name, fallback) => { const v = cs.getPropertyValue(name).trim(); return v.endsWith('rem') ? parseFloat(v) * rem : parseFloat(v) || fallback; };
    const next = read('--dock-base', 44);
    motion.forEach((s) => { s.size *= next / base; s.velocity *= next / base; });
    base = next; peak = base * 1.42; distance = base * 4; gap = read('--dock-gap', 8);
    wake();
  }
  function state(i) {
    let s = motion.get(i);
    if (!s) { s = { size: base, velocity: 0, lift: 0, rise: 0, launch: 0, gravity: 0, hopping: false, drawn: '' }; motion.set(i, s); }
    return s;
  }
  function restCentres() {
    const spans = items.map((n) => (n.classList.contains('dock-separator') ? 1 : base));
    let cursor = -(spans.reduce((a, b) => a + b, 0) + gap * Math.max(0, spans.length - 1)) / 2;
    return spans.map((span) => { const mid = cursor + span / 2; cursor += span + gap; return mid; });
  }
  function tick(now) {
    raf = 0;
    const dt = Math.min(1 / 30, Math.max(0.001, (now - last) / 1000));
    last = now;
    const rect = dock.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;
    const rest = restCentres();
    let focus = null;
    if (pointer.inside) focus = pointer.x - centre;
    else if (rest[focused] !== undefined) focus = rest[focused];
    const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    const k = STIFFNESS / MASS, c = DAMPING / MASS;
    let moving = false;
    items.forEach((node, i) => {
      if (node.classList.contains('dock-separator')) return;
      const s = state(i);
      const reach = focus === null ? 1 : Math.abs(focus - rest[i]) / distance;
      const target = base + (peak - base) * (reach < 1 ? Math.cos((reach * Math.PI) / 2) ** 2 : 0);
      if (reduceMotion) { s.size = target; s.velocity = 0; }
      else {
        for (let n = 0; n < steps; n++) {
          s.velocity = (s.velocity + h * k * (target - s.size)) / (1 + h * c + h * h * k);
          s.size += s.velocity * h;
          if (!s.hopping) continue;
          s.rise -= s.gravity * h;
          s.lift += s.rise * h;
          if (s.lift > 0) continue;
          s.lift = 0;
          s.rise *= -0.36;
          if (s.rise < s.launch * 0.2) { s.rise = 0; s.hopping = false; node.removeAttribute('data-hop'); }
        }
      }
      if (Math.abs(s.velocity) < 0.01 && Math.abs(target - s.size) < 0.01) { s.size = target; s.velocity = 0; }
      else moving = true;
      if (s.hopping) moving = true;
      const size = Math.max(1, s.size);
      const drawn = size.toFixed(2) + ' ' + s.lift.toFixed(2);
      if (drawn === s.drawn) return;
      s.drawn = drawn;
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      const tile = node.firstElementChild;
      if (tile) tile.style.transform = `translateY(${-s.lift}px) scale(${size / base})`;
    });
    if (moving) raf = requestAnimationFrame(tick);
  }
  function wake() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(tick); }
  function hop(i) {
    const node = items[i];
    if (reduceMotion || !node) return;
    const s = state(i);
    if (s.hopping) return;
    const height = s.size * HOP;
    s.gravity = (8 * height) / (HOP_TIME * HOP_TIME);
    s.launch = (s.gravity * HOP_TIME) / 2;
    s.rise = s.launch;
    s.hopping = true;
    node.setAttribute('data-hop', '');
    wake();
  }

  if (fine) {
    dock.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.inside = true; wake(); });
    dock.addEventListener('pointerleave', () => { pointer.inside = false; wake(); });
  }
  const buttons = items.filter((n) => n.classList.contains('dock-item'));
  items.forEach((node, i) => {
    if (!node.classList.contains('dock-item')) return;
    node.addEventListener('click', () => hop(i));
    node.addEventListener('focus', () => { if (node.matches(':focus-visible')) { focused = i; wake(); } });
    node.addEventListener('blur', () => { focused = -1; wake(); });
    node.addEventListener('keydown', (e) => {
      const at = buttons.indexOf(node);
      let next;
      if (e.key === 'ArrowLeft') next = buttons[(at - 1 + buttons.length) % buttons.length];
      else if (e.key === 'ArrowRight') next = buttons[(at + 1) % buttons.length];
      else if (e.key === 'Home') next = buttons[0];
      else if (e.key === 'End') next = buttons[buttons.length - 1];
      if (!next) return;
      e.preventDefault();
      next.focus();
    });
  });
  window.addEventListener('resize', measure);
  measure();

  kprAfterIntro(() => {
    root.classList.add('has-dock');
    requestAnimationFrame(() => dock.removeAttribute('data-hidden'));
  });
})();

// ---- 05 / AMBOT: the real Java game, run in the browser by CheerpJ ----
// CheerpJ has no Java audio, so the game's web build (tools/ambot-web) hands every
// sound to the page through the native methods below, at the levels set in the
// game's own Options menu.
(function () {
  const game = document.querySelector('[data-game]');
  if (!game) return;
  const CHEERPJ_LOADER = 'https://cjrtnc.leaningtech.com/5.0/loader.js';
  const stage = game.querySelector('[data-game-stage]');
  const cover = game.querySelector('[data-game-cover]');
  const start = document.querySelector('[data-game-start]');
  const hint = document.querySelector('[data-game-hint]');
  const fullscreenBtn = document.querySelector('[data-game-fullscreen]');

  const touchOnly = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  if (touchOnly && hint) hint.textContent = 'AMBOT needs a keyboard, so it plays best on a computer.';

  // --- sound ---
  const sound = {
    ctx: null, master: null, buffers: new Map(),
    music: null, musicPath: null, musicToken: 0,
  };
  const levelGain = (level) => Math.pow(Math.max(0, Math.min(10, Number(level) || 0)) / 10, 2);

  function audioContext() {
    if (!sound.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      sound.ctx = new AC();
      sound.master = sound.ctx.createGain();
      sound.master.connect(sound.ctx.destination);
    }
    if (sound.ctx.state === 'suspended') sound.ctx.resume();
    return sound.ctx;
  }
  function decoded(path) {
    const url = 'games/ambot' + path; // the game asks for e.g. /audio/sfx/jump.wav
    if (!sound.buffers.has(url)) {
      sound.buffers.set(url, fetch(url)
        .then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
        .then((data) => sound.ctx.decodeAudioData(data))
        .catch((err) => { sound.buffers.delete(url); throw err; }));
    }
    return sound.buffers.get(url);
  }
  function connect(buffer, level, loop) {
    const src = sound.ctx.createBufferSource();
    const gain = sound.ctx.createGain();
    src.buffer = buffer;
    src.loop = loop;
    gain.gain.value = levelGain(level);
    src.connect(gain).connect(sound.master);
    src.start();
    return { src, gain };
  }
  async function playSfx(path, level) {
    if (!audioContext()) return;
    try { connect(await decoded(path), level, false); } catch (e) { /* missing sound: skip it */ }
  }
  async function playMusic(path, level) {
    if (!audioContext()) return;
    if (sound.musicPath === path) return; // same track already playing or loading
    stopMusic();
    sound.musicPath = path;
    const token = ++sound.musicToken;
    try {
      const buffer = await decoded(path);
      if (token === sound.musicToken) sound.music = connect(buffer, level, true);
    } catch (e) { sound.musicPath = null; }
  }
  function stopMusic() {
    sound.musicToken++;
    sound.musicPath = null;
    if (sound.music) { try { sound.music.src.stop(); } catch (e) { /* already stopped */ } sound.music = null; }
  }
  function setMusicLevel(level) {
    if (sound.music) sound.music.gain.gain.value = levelGain(level);
  }

  // CheerpJ passes its library object first, then the Java arguments.
  const last = (args, n) => Array.prototype.slice.call(args, -n);
  // The loading cover lifts when the game reports its first painted frame (WebSession.painted
  // in the web build), so neither CheerpJ's own loading screen nor a black canvas is ever seen.
  let ready = false, onReady = null, replayResolve = null;
  function markReady() {
    if (ready) return;
    ready = true;
    if (onReady) onReady();
  }
  const natives = {
    async Java_ambot_web_WebAudio_jsPlaySfx() { const [p, l] = last(arguments, 2); playSfx(String(p), l); },
    async Java_ambot_web_WebAudio_jsPlayMusic() { const [p, l] = last(arguments, 2); playMusic(String(p), l); },
    async Java_ambot_web_WebAudio_jsStopMusic() { stopMusic(); },
    async Java_ambot_web_WebAudio_jsMusicVolume() { setMusicLevel(last(arguments, 1)[0]); },
    // Quit from the game's menu: pause behind the cover instead of ending Java (WebSession.java).
    async Java_ambot_web_WebSession_jsQuit() { showQuitCover(); },
    async Java_ambot_web_WebSession_jsAwaitReplay() { return new Promise((resolve) => { replayResolve = resolve; }); },
    // The first frame has been painted: wait for the browser to show it, then lift the cover.
    async Java_ambot_web_WebSession_jsFirstFrame() {
      requestAnimationFrame(() => requestAnimationFrame(markReady));
    },
  };

  // --- controls --- (volume lives in the game's own Options menu)
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (game.requestFullscreen) game.requestFullscreen().catch(() => {});
  });

  // The Java display keeps the size it was created at (Java doesn't follow later resizes),
  // and CSS scales it to fill the box, the resized box, or the whole screen in fullscreen.
  let baseW = 0, baseH = 0;
  function fitStage() {
    const w = game.clientWidth, h = game.clientHeight;
    if (!baseW || !w) return; // not started, or its deck module is hidden
    const s = Math.min(w / baseW, h / baseH);
    stage.style.transform = 'translate(' + (w - baseW * s) / 2 + 'px,' + (h - baseH * s) / 2 + 'px) scale(' + s + ')';
  }
  function focusGame() {
    const target = stage.querySelector('textarea') || stage.querySelector('canvas');
    if (target) target.focus({ preventScroll: true });
  }
  window.addEventListener('resize', fitStage);
  // The box also resizes without a window resize: the Work filters widen it, and the deck
  // hides and shows its module.
  if ('ResizeObserver' in window) new ResizeObserver(fitStage).observe(game);
  document.addEventListener('fullscreenchange', () => { fitStage(); focusGame(); });

  const startLabel = start.querySelector('[data-game-start-label]');
  function setCover(state, text) {
    cover.dataset.state = state; // idle | loading | quit | ended
    cover.hidden = state === 'playing';
    start.hidden = !(state === 'idle' || state === 'quit'); // only offered when it can start or resume
    start.disabled = false;
    if (startLabel) startLabel.textContent = state === 'quit' ? 'Play again' : 'Play AMBOT';
    if (text) hint.textContent = text;
  }
  function showQuitCover() {
    if (document.fullscreenElement) document.exitFullscreen();
    if (sound.ctx) sound.ctx.suspend(); // the game still thinks its music is on, so pause it, don't stop it
    setCover('quit', 'Thanks for playing! Jump back in any time.');
  }

  // Space and the arrow keys would scroll the page while the game has focus.
  window.addEventListener('keydown', (e) => {
    if (game.contains(document.activeElement) && [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  let initialised = false;
  start.addEventListener('click', async () => {
    // "Play again" after Quit: the game is paused in Java, waiting for this click.
    if (cover.dataset.state === 'quit') {
      setCover('playing');
      if (sound.ctx) sound.ctx.resume();
      const resume = replayResolve;
      replayResolve = null;
      if (resume) resume();
      focusGame();
      return;
    }

    setCover('loading', 'Downloading the Java runtime… (only slow the first time)');
    audioContext(); // created inside the click, so the browser allows sound
    onReady = () => { setCover('playing', 'Esc pauses. If the keys stop working, click the game.'); focusGame(); };
    try {
      if (!initialised) {
        await loadScript(CHEERPJ_LOADER);
        await window.cheerpjInit({ version: 17, natives });
        hint.textContent = 'Starting AMBOT…';
        baseW = Math.round(game.clientWidth);
        baseH = Math.round(game.clientHeight);
        stage.style.width = baseW + 'px';
        stage.style.height = baseH + 'px';
        // The web build scales its frame to fill this display (tools/ambot-web/WebFit.java).
        window.cheerpjCreateDisplay(baseW, baseH, stage);
        initialised = true;
        // Safety net in case no sound call ever arrives: lift the cover a while after drawing starts.
        const waitForCanvas = setInterval(() => {
          if (stage.querySelector('canvas')) { clearInterval(waitForCanvas); setTimeout(markReady, 20000); }
        }, 1000);
      }
      await window.cheerpjRunJar('/app/games/ambot/ambot.jar');
      // Only reached if Java ends for some other reason (Quit no longer exits).
      stopMusic();
      setCover('ended', 'The game has closed. Reload the page to play again.');
    } catch (err) {
      console.error('AMBOT failed to start', err);
      setCover('ended', 'The game could not start in this browser. Try reloading the page.');
    }
  });
})();

// ---- Résumé viewer ----
// A lightbox for the PDF instead of a new tab. The page flies out of the button that opened
// it and is drawn by PDF.js (vector-sharp, re-drawn as you zoom). Zoom with the wheel, a
// trackpad or touch pinch, a double-click/tap, the toolbar, the slider or the keyboard
// (+ - 0 W, arrows); drag to move, with a little momentum and a soft spring at the edges.
// A minimap shows where you are once zoomed in. Download and open-in-new-tab are always there.
// If PDF.js can't load, the browser's own PDF viewer is shown; without JavaScript the links
// just open the PDF.
(function () {
  const viewer = document.querySelector('[data-resume-viewer]');
  const openers = document.querySelectorAll('[data-resume-open]');
  if (!viewer || !openers.length) return;
  const PDF_URL = 'assets/Ken-Patrick-R-Ranis-Resume.pdf';
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  const $ = (s) => viewer.querySelector(s);
  const stage = $('[data-rv-stage]'), sheet = $('[data-rv-sheet]'), canvas = $('[data-rv-canvas]');
  const loading = $('[data-rv-loading]'), pctEl = $('[data-rv-pct]'), slider = $('[data-rv-slider]');
  const mini = $('[data-rv-mini]'), miniCanvas = $('[data-rv-mini-canvas]'), miniView = $('[data-rv-mini-view]');
  const hint = $('[data-rv-hint]'), closeBtn = $('.rv-close');
  const ZMIN = 0.5, ZMAX = 6;
  const PAD_TOP = 70, PAD_BOTTOM = 90, OFFSET_Y = (PAD_TOP - PAD_BOTTOM) / 2;

  let page = null, pdfFailed = false, baseW = 612, baseH = 792; // PDF points; Letter until loaded
  let fitS = 1, sheetW = 0, sheetH = 0;
  const cur = { z: 1, x: 0, y: 0 }, tgt = { z: 1, x: 0, y: 0 }; // zoom (1 = page fits) and pan, px
  let raf = 0, last = 0, isOpen = false, opener = null, hintTimer = 0;
  let renderTimer = 0, renderTask = null, renderedAt = 0, miniDrawn = false;

  // --- PDF.js, fetched the first time the viewer opens ---
  let loadPromise = null;
  function loadPdf() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('PDF.js missing')));
      s.onerror = reject;
      document.head.appendChild(s);
    }).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      return lib.getDocument(PDF_URL).promise;
    }).then((doc) => doc.getPage(1)).then((p) => {
      page = p;
      const vp = p.getViewport({ scale: 1 });
      baseW = vp.width; baseH = vp.height;
    });
    return loadPromise;
  }
  // PDF.js unavailable: show the browser's own viewer in the sheet, keep download / new tab.
  function fallback() {
    pdfFailed = true;
    viewer.classList.add('is-fallback');
    loading.hidden = true;
    canvas.hidden = true;
    if (!sheet.querySelector('iframe')) {
      const f = document.createElement('iframe');
      f.src = PDF_URL + '#view=FitH';
      f.title = 'Résumé of Ken Patrick R. Ranis';
      sheet.appendChild(f);
    }
  }

  // --- layout and view maths ---
  function layout() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const padX = Math.min(64, sw * 0.06);
    // Never below a small minimum: a very short window (or a hidden one, 0x0) must not give a
    // zero or negative page size; the resize handler lays it out again once there's room.
    const availW = Math.max(80, sw - padX * 2), availH = Math.max(80, sh - PAD_TOP - PAD_BOTTOM);
    fitS = Math.min(availW / baseW, availH / baseH);
    sheetW = baseW * fitS; sheetH = baseH * fitS;
    sheet.style.width = sheetW + 'px';
    sheet.style.height = sheetH + 'px';
    sheet.style.marginLeft = -sheetW / 2 + 'px';
    sheet.style.marginTop = -sheetH / 2 + OFFSET_Y + 'px';
  }
  // How far the sheet may move: centred when it fits, edge to edge (plus some air) when not.
  function bounds(z) {
    const bx = Math.max(0, (sheetW * z - stage.clientWidth) / 2 + 40);
    const by = Math.max(0, (sheetH * z - stage.clientHeight) / 2 + 90);
    return { bx, by };
  }
  function clampTarget() {
    tgt.z = Math.min(ZMAX, Math.max(ZMIN, tgt.z));
    const { bx, by } = bounds(tgt.z);
    tgt.x = Math.max(-bx, Math.min(bx, tgt.x));
    tgt.y = Math.max(-by, Math.min(by, tgt.y));
  }
  function stageCentre() {
    const r = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 + OFFSET_Y };
  }
  // Zoom so the point under (cx, cy) stays put.
  function zoomTo(z, cx, cy) {
    const c = stageCentre();
    const px = (cx === undefined ? c.x : cx) - c.x, py = (cy === undefined ? c.y : cy) - c.y;
    const nz = Math.min(ZMAX, Math.max(ZMIN, z));
    const lx = (px - tgt.x) / tgt.z, ly = (py - tgt.y) / tgt.z;
    tgt.x = px - lx * nz; tgt.y = py - ly * nz; tgt.z = nz;
    clampTarget();
    kick();
  }
  function fit(mode) {
    if (mode === 'width') {
      tgt.z = Math.min(ZMAX, Math.max(ZMIN, (stage.clientWidth - 80) / sheetW));
      tgt.x = 0;
      tgt.y = bounds(tgt.z).by; // show the top of the page
    } else {
      tgt.z = 1; tgt.x = 0; tgt.y = 0;
    }
    clampTarget();
    kick();
  }

  // --- animation: the view eases toward its target (instant with reduced motion) ---
  let dragging = false;
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 14);
    cur.z += (tgt.z - cur.z) * k;
    if (!dragging) { cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k; }
    const moving = Math.abs(tgt.z - cur.z) > 0.0005 ||
      (!dragging && (Math.abs(tgt.x - cur.x) > 0.25 || Math.abs(tgt.y - cur.y) > 0.25));
    if (moving) raf = requestAnimationFrame(frame);
    else {
      cur.z = tgt.z;
      if (!dragging) { cur.x = tgt.x; cur.y = tgt.y; }
      scheduleRender();
    }
    apply();
  }
  function apply() {
    sheet.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0) scale(${cur.z.toFixed(4)})`;
    // percent of printed size (PDF points are 1/72 inch, CSS pixels 1/96)
    pctEl.textContent = Math.round(fitS * cur.z * 75) + '%';
    slider.value = String(Math.round((Math.log(cur.z / ZMIN) / Math.log(ZMAX / ZMIN)) * 1000));
    updateMini();
  }

  // --- sharp rendering: re-draw at the zoom's resolution once it settles ---
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 120); }
  function render() {
    if (!page || !isOpen || !(fitS > 0) || stage.clientWidth === 0) return; // nothing to draw into yet
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let s = Math.max(fitS * dpr, fitS * tgt.z * dpr);
    s = Math.min(s, 8192 / baseW, 8192 / baseH, Math.sqrt(24e6 / (baseW * baseH)));
    if (renderedAt && Math.abs(s - renderedAt) / renderedAt < 0.12) return;
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    const vp = page.getViewport({ scale: s });
    const off = document.createElement('canvas'); // draw off-screen, then swap: no blank flashes
    off.width = Math.ceil(vp.width); off.height = Math.ceil(vp.height);
    const task = page.render({ canvasContext: off.getContext('2d'), viewport: vp });
    renderTask = task;
    task.promise.then(() => {
      if (renderTask !== task) return;
      renderTask = null;
      canvas.width = off.width; canvas.height = off.height;
      canvas.getContext('2d').drawImage(off, 0, 0);
      renderedAt = s;
      loading.hidden = true;
      if (!miniDrawn) drawMini();
    }).catch(() => {});
  }

  // --- minimap: where you are on the page once zoomed in; click or drag it to move ---
  function drawMini() {
    const w = 240, h = Math.round(w * baseH / baseW);
    miniCanvas.width = w; miniCanvas.height = h;
    miniCanvas.getContext('2d').drawImage(canvas, 0, 0, w, h);
    miniDrawn = true;
  }
  function updateMini() {
    const on = cur.z > 1.08 && !pdfFailed && miniDrawn;
    mini.classList.toggle('is-on', on);
    if (!on) return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const W2 = sheetW * cur.z, H2 = sheetH * cur.z;
    const left = (W2 / 2 - cur.x - sw / 2) / W2, top = (H2 / 2 - cur.y - sh / 2 + OFFSET_Y) / H2;
    const c01 = (v) => Math.max(0, Math.min(1, v));
    const x0 = c01(left), y0 = c01(top), x1 = c01(left + sw / W2), y1 = c01(top + sh / H2);
    const mw = miniCanvas.clientWidth, mh = miniCanvas.clientHeight;
    miniView.style.left = miniCanvas.offsetLeft + x0 * mw + 'px';
    miniView.style.top = miniCanvas.offsetTop + y0 * mh + 'px';
    miniView.style.width = (x1 - x0) * mw + 'px';
    miniView.style.height = (y1 - y0) * mh + 'px';
  }
  function miniJump(e) {
    const r = miniCanvas.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    tgt.x = -(fx - 0.5) * sheetW * tgt.z;
    tgt.y = -(fy - 0.5) * sheetH * tgt.z;
    clampTarget();
    kick();
  }
  mini.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    mini.setPointerCapture(e.pointerId);
    miniJump(e);
    const move = (ev) => miniJump(ev);
    const up = () => { mini.removeEventListener('pointermove', move); mini.removeEventListener('pointerup', up); };
    mini.addEventListener('pointermove', move);
    mini.addEventListener('pointerup', up);
  });

  // --- pointers: one drags (with momentum), two pinch about their midpoint ---
  const pts = new Map();
  let lastMove = null, vel = { x: 0, y: 0 }, pinch = null, lastTap = 0, travel = 0, downOnSheet = false;
  function hideHint() { hint.classList.add('is-gone'); }
  stage.addEventListener('pointerdown', (e) => {
    if (pdfFailed || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    hideHint();
    if (pts.size === 1) {
      downOnSheet = sheet.contains(e.target);
      travel = 0;
      const now = performance.now();
      if (downOnSheet && now - lastTap < 300) { // double-click / double-tap
        lastTap = 0;
        if (tgt.z < 1.6) zoomTo(2.6, e.clientX, e.clientY); else fit('page');
        return;
      }
      lastTap = now;
      dragging = true;
      stage.classList.add('is-dragging');
      lastMove = { x: e.clientX, y: e.clientY, t: now };
      vel = { x: 0, y: 0 };
    } else if (pts.size === 2) {
      dragging = false;
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: tgt.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      tgt.x += mx - pinch.mx; tgt.y += my - pinch.my;
      pinch.mx = mx; pinch.my = my;
      zoomTo(pinch.z * (d / pinch.d), mx, my);
      return;
    }
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastMove.x, dy = e.clientY - lastMove.y;
    travel += Math.abs(dx) + Math.abs(dy);
    const ms = Math.max(1, now - lastMove.t);
    vel = { x: (dx / ms) * 1000 * 0.7 + vel.x * 0.3, y: (dy / ms) * 1000 * 0.7 + vel.y * 0.3 };
    lastMove = { x: e.clientX, y: e.clientY, t: now };
    // past the edges the sheet resists like rubber, then springs back on release
    const { bx, by } = bounds(cur.z);
    cur.x += dx * (Math.abs(cur.x + dx) > bx ? 0.35 : 1);
    cur.y += dy * (Math.abs(cur.y + dy) > by ? 0.35 : 1);
    tgt.x = cur.x; tgt.y = cur.y;
    apply();
  });
  function endPointer(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { // pinch -> carry on dragging with the finger that's left
      const p = [...pts.values()][0];
      dragging = true;
      lastMove = { x: p.x, y: p.y, t: performance.now() };
      vel = { x: 0, y: 0 };
      return;
    }
    if (pts.size === 0) {
      const wasDragging = dragging;
      dragging = false;
      stage.classList.remove('is-dragging');
      // a plain click off the page closes the viewer, like any lightbox
      if (wasDragging && travel < 6 && !downOnSheet) { close(); return; }
      // fling: keep going the way it was thrown, then settle inside the bounds
      if (wasDragging && !reduceMotion && performance.now() - lastMove.t < 90) {
        tgt.x = cur.x + vel.x * 0.22;
        tgt.y = cur.y + vel.y * 0.22;
      }
      clampTarget();
      kick();
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // Wheel: a mouse wheel or a trackpad pinch (ctrlKey) zooms toward the cursor; a trackpad's
  // two-finger scroll moves the page.
  stage.addEventListener('wheel', (e) => {
    if (pdfFailed) return;
    e.preventDefault();
    hideHint();
    const lines = e.deltaMode === 1;
    const mouseWheel = lines || (Math.abs(e.deltaY) >= 40 && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || mouseWheel) {
      const dy = lines ? e.deltaY * 33 : e.deltaY;
      zoomTo(tgt.z * Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0016)), e.clientX, e.clientY);
    } else {
      tgt.x -= e.deltaX; tgt.y -= e.deltaY;
      clampTarget();
      kick();
    }
  }, { passive: false });

  // --- toolbar ---
  viewer.querySelectorAll('[data-rv-zoom]').forEach((b) => b.addEventListener('click', () => {
    zoomTo(tgt.z * (b.dataset.rvZoom === 'in' ? 1.35 : 1 / 1.35));
  }));
  viewer.querySelectorAll('[data-rv-fit]').forEach((b) => b.addEventListener('click', () => fit(b.dataset.rvFit)));
  slider.addEventListener('input', () => zoomTo(ZMIN * Math.pow(ZMAX / ZMIN, slider.value / 1000)));
  viewer.querySelectorAll('[data-rv-close]').forEach((b) => b.addEventListener('click', close));

  // --- keyboard: + - 0 W and arrows; Esc closes; Tab stays inside the viewer ---
  function focusables() {
    return [...viewer.querySelectorAll('button, a[href], input')].filter((el) => el.offsetParent !== null);
  }
  viewer.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep the page's own shortcuts (1 2 3 tabs) quiet while it's open
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); close(); return; }
    if (k === 'Tab') {
      const f = focusables(), i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.target === slider && k.startsWith('Arrow')) return;
    if (k === '+' || k === '=') zoomTo(tgt.z * 1.25);
    else if (k === '-' || k === '_') zoomTo(tgt.z / 1.25);
    else if (k === '0') fit('page');
    else if (k === 'w' || k === 'W') fit('width');
    else if (k.startsWith('Arrow')) {
      const step = 90;
      if (k === 'ArrowLeft') tgt.x += step;
      if (k === 'ArrowRight') tgt.x -= step;
      if (k === 'ArrowUp') tgt.y += step;
      if (k === 'ArrowDown') tgt.y -= step;
      clampTarget();
      kick();
    } else return;
    e.preventDefault();
    hideHint();
  });

  window.addEventListener('resize', () => {
    if (!isOpen) return;
    layout();
    clampTarget();
    Object.assign(cur, tgt);
    apply();
    renderedAt = 0;
    scheduleRender();
  });

  // --- open / close: the sheet flies out of the button and back into it ---
  function flight(el) {
    const r = el.getBoundingClientRect(), s = sheet.getBoundingClientRect();
    const baseCx = s.left + s.width / 2 - cur.x, baseCy = s.top + s.height / 2 - cur.y;
    return {
      dx: r.left + r.width / 2 - baseCx,
      dy: r.top + r.height / 2 - baseCy,
      sc: Math.max(0.04, r.width / sheetW),
    };
  }
  let closeAnims = [];
  function open(fromEl) {
    if (isOpen) return;
    isOpen = true;
    // reopened while still closing: stop the close so it can't hide the viewer afterwards
    closeAnims.forEach((a) => a.cancel());
    closeAnims = [];
    opener = fromEl;
    viewer.hidden = false;
    viewer.classList.remove('is-closing');
    document.documentElement.style.overflow = 'hidden';
    if (window.kprLenis) window.kprLenis.stop();
    layout();
    Object.assign(tgt, { z: 1, x: 0, y: 0 });
    Object.assign(cur, tgt);
    apply();
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) {
      hint.textContent = 'Pinch to zoom · drag to move · double-tap to zoom in';
    }
    hint.classList.remove('is-gone');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 5000);
    if (!reduceMotion && fromEl && sheet.animate) {
      const f = flight(fromEl);
      sheet.animate([
        { transform: `translate3d(${f.dx}px, ${f.dy}px, 0) scale(${f.sc})`, opacity: 0.25 },
        { transform: 'translate3d(0px, 0px, 0) scale(1)', opacity: 1 },
      ], { duration: 560, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    if (viewer.animate) viewer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduceMotion ? 120 : 260, easing: 'ease-out' });
    closeBtn.focus({ preventScroll: true });
    if (page) { renderedAt = 0; render(); }
    else if (!pdfFailed) {
      loading.hidden = false;
      loadPdf().then(() => { layout(); apply(); render(); }).catch(fallback);
    }
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(renderTimer);
    const done = () => {
      closeAnims = [];
      if (isOpen) return; // reopened in the meantime
      viewer.hidden = true;
      document.documentElement.style.overflow = '';
      if (window.kprLenis) window.kprLenis.start();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
    if (!reduceMotion && opener && sheet.animate) {
      const f = flight(opener);
      const a = sheet.animate([
        { transform: sheet.style.transform, opacity: 1 },
        { transform: `translate3d(${f.dx}px, ${f.dy}px, 0) scale(${f.sc})`, opacity: 0 },
      ], { duration: 380, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' });
      const b = viewer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' });
      closeAnims = [a, b];
      a.onfinish = () => { a.cancel(); b.cancel(); done(); };
    } else {
      done();
    }
  }

  openers.forEach((a) => a.addEventListener('click', (e) => {
    // let ctrl/cmd/shift/middle clicks open the PDF in a new tab or window as usual
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(a);
  }));
  // warm the cache when someone heads for a résumé link, so it opens instantly
  openers.forEach((a) => a.addEventListener('pointerenter', () => { if (!page && !pdfFailed) loadPdf().catch(() => {}); }, { once: true }));
  window.kprResume = { open: () => open(openers[0]), close, state: () => ({ open: isOpen, z: tgt.z, x: tgt.x, y: tgt.y, page: !!page, fallback: pdfFailed, renderedAt }) };
})();
