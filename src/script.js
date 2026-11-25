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

// ---- Site Audio (tactile Razer UI ticks + real CC0 sword slash foley) ----
const siteAudio = (function () {
  const BLADE_SFX = {
    unsheathe: 'assets/sfx/blade-unsheathe.ogg',
    slash1: 'assets/sfx/blade-slash-1.ogg',
    slash2: 'assets/sfx/blade-slash-2.ogg',
    whoosh: 'assets/sfx/blade-whoosh.mp3',
  };

  const toggle = document.querySelector('[data-sound-toggle]');
  const AC = window.AudioContext || window.webkitAudioContext;
  let enabled = true;
  try { enabled = localStorage.getItem('hover-sounds') !== 'off'; } catch (e) { /* storage blocked */ }
  let ctx = null, last = 0, noiseBuf = null;
  const mediaPool = new Map();

  // Preload the real recorded blade audio files immediately so reload playback has zero lag
  Object.values(BLADE_SFX).forEach((src) => {
    const a = new Audio(src);
    a.preload = 'auto';
    mediaPool.set(src, a);
  });

  function render() {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Turn UI sounds off' : 'Turn UI sounds on');
  }
  function unlock() {
    if (!AC) return null;
    if (!ctx) ctx = new AC();
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

  function playClip(src, rate = 1, volume = 0.75) {
    if (!enabled || !src) return;
    const base = mediaPool.get(src);
    const clip = base ? base.cloneNode() : new Audio(src);
    clip.volume = Math.max(0, Math.min(1, volume));
    if ('preservesPitch' in clip) clip.preservesPitch = false;
    else if ('webkitPreservesPitch' in clip) clip.webkitPreservesPitch = false;
    clip.playbackRate = rate;
    clip.play().catch(() => { /* blocked until first user gesture in fresh tabs */ });
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

  function playUnsheathe() {
    playClip(BLADE_SFX.unsheathe, 1.0, 0.55);
  }

  function playKatanaSlash(step) {
    if (step === 1) {
      playClip(BLADE_SFX.slash1, 1.02, 0.72);
      playClip(BLADE_SFX.whoosh, 1.05, 0.38);
    } else if (step === 2) {
      playClip(BLADE_SFX.slash2, 1.06, 0.76);
      playClip(BLADE_SFX.whoosh, 1.12, 0.42);
    } else {
      // Heavy final cleave: deeper pitched blade slice + air whoosh
      playClip(BLADE_SFX.slash2, 0.84, 0.90);
      playClip(BLADE_SFX.slash1, 0.88, 0.50);
      playClip(BLADE_SFX.whoosh, 0.82, 0.65);
    }
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

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem('hover-sounds', enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    render();
    if (enabled) unlock();
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      setEnabled(!enabled);
      if (enabled) playUiConfirm();
    });
  }
  render();

  return {
    unlock,
    setEnabled,
    playUnsheathe,
    playKatanaSlash,
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
  const backCanvas = document.querySelector('[data-intro-canvas-back]');
  const flashEl = document.querySelector('[data-intro-flash]');
  const skipBtn = document.querySelector('[data-intro-skip]');
  const gate = splash ? splash.querySelector('[data-intro-gate]') : null;
  const ctx2d = canvas ? canvas.getContext('2d') : null;
  const bctx = backCanvas ? backCanvas.getContext('2d') : null;
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let active = root.classList.contains('intro-pending') && !!splash && !!gate;
  const doneCallbacks = [];
  let runToken = 0, timers = [], unblurTimer = 0;

  function notifyDone() {
    active = false;
    while (doneCallbacks.length) {
      const fn = doneCallbacks.shift();
      try { fn(); } catch (e) {}
    }
  }
  function releaseSiteBlur() {
    clearTimeout(unblurTimer);
    if (!root.classList.contains('site-blur-hold')) return;
    void root.offsetWidth;
    root.classList.add('site-unblurring');
    root.classList.remove('site-blur-hold');
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
    { step: 1, life: 0.40, widthK: 0.036, minW: 16, flash: 0.26, p0: [0.76, 0.20], cp: [0.46, 0.44], p1: [0.24, 0.80] },
    { step: 2, life: 0.42, widthK: 0.040, minW: 18, flash: 0.30, p0: [0.22, 0.30], cp: [0.52, 0.47], p1: [0.78, 0.70] },
    { step: 3, life: 0.50, widthK: 0.052, minW: 24, flash: 0.55, cleave: true, p0: [1.04, 0.14], cp: [0.50, 0.50], p1: [-0.04, 0.86] },
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
    // While the sound choice shows, the coil follows the raised emblem and shrinks to fit above the buttons.
    let lift = 0, liftTarget = 0, fit = 1, fitTarget = 1, fitHalf = Infinity;
    const slashes = [], sparks = [], rings = [], motes = [], embers = [], petals = [];
    const dragon = { hist: [], angle: rand(0, TAU), speed: 0.75, squeeze: 1, alpha: 0, len: 0, lunge: null };

    function size() {
      W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
      [[canvas, ctx2d], [backCanvas, bctx]].forEach(([c, x]) => {
        if (!c || !x) return;
        c.width = Math.max(1, Math.round(W * dpr));
        c.height = Math.max(1, Math.round(H * dpr));
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      dragon.len = Math.min(W, H) * (dragon.lunge ? 2 : 1.35);
    }
    const at = (f) => ({ x: W * f[0], y: H * f[1] });

    // --- ambient: embers rise, pale petals drift down and across ---
    function newEmber(anywhere) {
      return { x: rand(0, W), y: anywhere ? rand(0, H) : H + rand(4, 40), vy: -rand(18, 60), sway: rand(0, TAU),
        swayAmp: rand(6, 22), r: rand(0.7, 2.1), hue: rand(110, 165), flick: rand(0, TAU) };
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

    // --- the dragon: its head follows a tilted orbit round the mark, the body trails behind ---
    function orbitPoint(a, now) {
      const rx = Math.min(W * 0.44, H * 0.42, 360) * dragon.squeeze * fit;
      const ry = rx * 0.42;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry + Math.sin(a * 2 + now * 0.0011) * ry * 0.22;
      const tilt = -0.2;
      // z > 0: the near (lower) side of the orbit, drawn in front of the mark
      return { x: W / 2 + px * Math.cos(tilt) - py * Math.sin(tilt), y: H / 2 - lift + px * Math.sin(tilt) + py * Math.cos(tilt), z: Math.sin(a) };
    }
    function updateDragon(dt, now) {
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
      if (d.hist.length < 4) return;
      const p = d.hist[Math.floor(Math.random() * Math.min(d.hist.length, 120))];
      const a = rand(0, TAU), v = rand(60, 220) * speedScale;
      sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.55), age: 0,
        width: rand(0.8, 1.8), color: Math.random() > 0.5 ? '#28f0b4' : '#eaffea' });
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
      const pick = (z) => (z < -0.04 && bctx && !d.lunge) ? bctx : ctx2d;
      [ctx2d, bctx].forEach((c) => { if (c) { c.lineCap = 'butt'; c.lineJoin = 'round'; } });
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

    // --- strike effects ---
    function drawCrescent(c, p0, cp, p1, tStart, tEnd, maxW, alpha) {
      const steps = 28;
      if (tEnd <= tStart + 0.01) return;
      const topPts = [], botPts = [];
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
        const profile = Math.pow(Math.sin(u * Math.PI), 0.75) * maxW;
        topPts.push({ x: pt.x + nx * profile * 0.85, y: pt.y + ny * profile * 0.85 });
        botPts.push({ x: pt.x - nx * profile * 0.35, y: pt.y - ny * profile * 0.35 });
      }
      c.save();
      c.globalAlpha = alpha;
      c.beginPath();
      c.moveTo(topPts[0].x, topPts[0].y);
      for (let i = 1; i < topPts.length; i++) c.lineTo(topPts[i].x, topPts[i].y);
      for (let i = botPts.length - 1; i >= 0; i--) c.lineTo(botPts[i].x, botPts[i].y);
      c.closePath();
      c.shadowColor = '#44d62c';
      c.shadowBlur = 28;
      c.fillStyle = '#44d62c';
      c.fill();
      c.shadowBlur = 10;
      c.shadowColor = '#28f0b4';
      c.fillStyle = '#edffea';
      c.globalAlpha = alpha * 0.92;
      c.fill();
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
    function strike(spec) {
      const now = performance.now();
      const m = Math.min(W, H);
      const s = { ...spec, born: now, width: Math.max(spec.minW, m * spec.widthK) };
      slashes.push(s);
      const p0 = at(s.p0), cp = at(s.cp), p1 = at(s.p1);
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      for (let k = 0; k < 5; k++) {
        const pt = quadPt(p0, cp, p1, 0.2 + k * 0.16);
        spawnSparks(pt.x, pt.y, dx, dy, spec.cleave ? 9 : 5, spec.cleave ? 1.25 : 0.9);
      }
      const mid = quadPt(p0, cp, p1, 0.5);
      rings.push({ x: mid.x, y: mid.y, born: now, life: spec.cleave ? 0.7 : 0.45, max: m * (spec.cleave ? 0.95 : 0.5), w: spec.cleave ? 10 : 6, flat: !!spec.cleave });
      shake = spec.cleave ? 12 : 7;
      focus = 0;
      phase = spec.cleave ? 'lunge' : 'strike';
      flash(spec.flash, spec.cleave ? 420 : 260);
      glitch();
    }
    function cleave(spec) {
      const now = performance.now();
      freezeUntil = now + 80; // hit-stop: everything holds for a beat before the cut lands
      strike(spec);
      const head = dragon.hist[0] || { x: W * 0.8, y: H * 0.3 };
      dragon.lunge = { p0: { x: head.x, y: head.y }, cp: { x: W * 0.52, y: H * 0.46 }, p1: { x: -W * 0.4, y: H * 1.3 }, start: now + 80, dur: 430 };
      dragon.len = Math.min(W, H) * 2;
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
      if (shake > 0.2) {
        const sx = (Math.random() - 0.5) * shake * 2, sy = (Math.random() - 0.5) * shake * 2;
        marks.forEach((m) => { m.style.transform = `translate(calc(-50% + ${sx.toFixed(1)}px), calc(-50% + ${sy.toFixed(1)}px))`; });
        if (dt > 0) shake *= 0.8;
      } else if (shake > 0) {
        shake = 0;
        marks.forEach((m) => { m.style.transform = ''; });
      }
    }
    function render(now) {
      ctx2d.clearRect(0, 0, W, H);
      if (bctx) bctx.clearRect(0, 0, W, H);
      const amb = bctx || ctx2d;

      // ambient
      amb.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const a = 0.22 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.006 + e.flick));
        amb.fillStyle = `hsla(${e.hue.toFixed(0)},90%,62%,${a.toFixed(3)})`;
        amb.beginPath();
        amb.arc(e.x + Math.sin(e.sway) * e.swayAmp, e.y, e.r, 0, TAU);
        amb.fill();
      }
      amb.globalCompositeOperation = 'source-over';
      for (const p of petals) {
        amb.save();
        amb.translate(p.x, p.y); amb.rotate(p.rot);
        amb.fillStyle = `rgba(234,255,234,${p.a.toFixed(3)})`;
        amb.beginPath(); amb.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, TAU); amb.fill();
        amb.restore();
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
      [ctx2d, bctx].forEach((c) => { if (c) c.globalCompositeOperation = 'source-over'; });

      // blade crescents
      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i];
        const age = (now - s.born) / 1000;
        if (age > s.life) { slashes.splice(i, 1); continue; }
        const prog = age / s.life;
        const tEnd = easeOutCubic(Math.min(1, prog * 2.15));
        const tStart = Math.max(0, (prog - 0.14) * 1.15);
        const alpha = Math.max(0, 1 - Math.pow(prog, 1.8));
        drawCrescent(ctx2d, at(s.p0), at(s.cp), at(s.p1), tStart, tEnd, s.width * (1 - prog * 0.45), alpha);
      }

      // shockwaves
      ctx2d.globalCompositeOperation = 'lighter';
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const p = (now - r.born) / (r.life * 1000);
        if (p >= 1) { rings.splice(i, 1); continue; }
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
    function tick(now) {
      if (!running) return;
      let dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (now < freezeUntil) dt = 0;
      update(dt, now);
      render(now);
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
        // the tilted orbit reaches about 0.72 rx above and below its centre, plus the body's width
        const rx = Math.min(W * 0.44, H * 0.42, 360);
        fitTarget = Math.min(1, Math.max(0.35, (fitHalf - Math.min(W, H) * 0.035) / (rx * 0.72)));
        if (instant) { lift = px; fit = fitTarget; }
      },
      strike,
      cleave,
      ringBurst,
      sparkBurst,
      stop() {
        running = false;
        cancelAnimationFrame(raf);
        clearTimeout(glitchTimer);
        window.removeEventListener('resize', size);
        ctx2d.clearRect(0, 0, W, H);
        if (bctx) bctx.clearRect(0, 0, W, H);
        marks.forEach((m) => { m.style.transform = ''; });
      },
    };
  }

  // ---------- the strike sequence, after the visitor has chosen ----------
  function startSequence() {
    const token = ++runToken;
    active = true;
    splash.classList.remove('is-slash-1', 'is-slash-2', 'is-cleaved', 'is-parting', 'is-skipping');
    root.classList.remove('intro-pending', 'site-unblurring');
    root.classList.add('site-blur-hold');
    root.style.overflow = 'hidden';
    if (skipBtn) skipBtn.focus({ preventScroll: true });

    splash.classList.add('is-powering');
    siteAudio.playUnsheathe();
    fx.charge();

    const onSplashPointer = (e) => {
      if (e.target.closest && e.target.closest('[data-intro-skip]')) return;
      siteAudio.unlock();
    };
    splash.addEventListener('pointerdown', onSplashPointer);

    const at = (ms, fn) => timers.push(setTimeout(() => { if (token === runToken) fn(); }, ms));
    // 1) the first strike shatters the diamond reticle
    at(820, () => { fx.strike(STRIKES[0]); siteAudio.playKatanaSlash(1); });
    at(875, () => { splash.classList.add('is-slash-1'); fx.ringBurst(); });
    // 2) the counter-cut shears KPR in half
    at(1120, () => { fx.strike(STRIKES[1]); siteAudio.playKatanaSlash(2); });
    at(1175, () => { splash.classList.add('is-slash-2'); fx.sparkBurst(); });
    // 3) hit-stop, then the cleave: the dragon tears through and the screen parts
    at(1400, () => { fx.cleave(STRIKES[2]); siteAudio.playKatanaSlash(3); });
    at(1490, () => {
      splash.classList.add('is-cleaved');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (token === runToken) splash.classList.add('is-parting');
      }));
    });
    // 4) once the halves have parted, ease the website in from the blur
    at(2150, () => finish(false));

    function finish(skipped) {
      if (token !== runToken) return;
      runToken++;
      clearTimers();
      cleanupListeners();
      const finalizeHide = () => {
        fx.stop();
        splash.classList.remove('is-active', 'is-charging', 'is-powering', 'is-glitch', 'is-slash-1', 'is-slash-2', 'is-cleaved', 'is-parting', 'is-skipping');
        splash.hidden = true;
        splash.setAttribute('aria-hidden', 'true');
        root.style.overflow = '';
        releaseSiteBlur();
        notifyDone();
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      };
      if (skipped) {
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
    const mark = whole ? whole.querySelector('.intro-mark') : null;
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
    if (mark) mark.style.transition = 'none';
    layoutGate(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (mark) mark.style.transition = ''; }));
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
      splash.classList.remove('is-gate');
      // the emblem glides back to the centre at full size, where the strikes and the split screen expect it
      if (whole) { whole.style.setProperty('--gate-lift', '0px'); whole.style.setProperty('--gate-scale', '1'); }
      if (fx) fx.setLift(0, false, Infinity);
      if (fx) startSequence();
      else leaveQuietly();
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

// ---- Lenis: smooth, weighted scrolling across the whole page ----
// Wheel and trackpad input glide instead of jumping; touch keeps the phone's own native
// scrolling. Off with reduced motion, and simply absent if the CDN script didn't load.
window.kprLenis = null;
(function () {
  if (reduceMotion || typeof window.Lenis !== 'function') return;
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

  // Hold the page still while the intro is up, then hand scrolling back.
  if (window.kprIntro && window.kprIntro.isActive()) {
    lenis.stop();
    window.kprIntro.whenDone(() => lenis.start());
  }
})();

// ---- Subtle effects: reading progress, frosted header, cursor glow, active nav ----
(function () {
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.scroll-progress');
  const floatTop = document.querySelector('.float-top');
  const footer = document.querySelector('.site-footer');
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.setProperty('--progress', max > 0 ? Math.min(1, scrollY / max) : 0);
    if (header) header.classList.toggle('is-scrolled', scrollY > 24);
    if (floatTop) {
      floatTop.classList.toggle('is-visible', scrollY > innerHeight);
      // Once the footer scrolls into view, the button stops on the footer's centre line,
      // level with the "2026 Ken Patrick Ranis" text, instead of floating over the page.
      const rest = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.25;
      let bottom = rest;
      if (footer) {
        const f = footer.getBoundingClientRect();
        const docked = innerHeight - (f.top + f.height / 2) - floatTop.offsetHeight / 2;
        bottom = Math.max(rest, docked);
      }
      floatTop.style.bottom = bottom + 'px';
    }
  }
  window.addEventListener('resize', onScroll);
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  // A soft light follows the cursor across cards (mouse and trackpad only). It's a
  // lighting change rather than movement, so it stays on with reduced motion too.
  const finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (finePointer) {
    document.querySelectorAll('.spotlight, .feature-media, .live-card, .stack-group, .context, .portrait-card')
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

  const ids = ['work', 'info', 'certifications'];
  const names = { work: 'Work', info: 'Info', certifications: 'Certifications' };
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

  // ---- gliders: the lit block behind the active tab, the underline under the header link ----
  function moveTo(el, x, w, instant, vars) {
    if (!el) return;
    if (G()) {
      if (instant || !canAnimate()) G().set(el, { x, width: w });
      else G().to(el, Object.assign({ x, width: w, overwrite: true }, vars));
    } else {
      el.style.transform = 'translateX(' + x + 'px)';
      el.style.width = w + 'px';
    }
  }
  function placeGliders(instant) {
    const t = tabs[current];
    moveTo(glider, t.offsetLeft, t.offsetWidth, instant, { duration: 0.62, ease: 'expo.inOut' });
    const a = navLinks[current];
    if (a && navGlider) {
      moveTo(navGlider, a.offsetLeft, a.offsetWidth, instant, { duration: 0.55, ease: 'power3.inOut' });
      nav.classList.add('has-glider');
    }
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => placeGliders(true));
    ro.observe(tabList);
    if (nav) ro.observe(nav);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeGliders(true));

  // The header underline dims while the deck is off screen.
  if (nav && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => nav.classList.toggle('is-away', !entry.isIntersecting))
      .observe(deck);
  }

  // ---- labels decode like a cipher when hovered ----
  function scramble(el, text, duration) {
    if (!el) return;
    if (canAnimate() && window.ScrambleTextPlugin) {
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
    if (canAnimate() && window.ScrambleTextPlugin) {
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
  function afterShow(panel, firstVisit) {
    if (window.kprMotion && window.kprMotion.armPanel) window.kprMotion.armPanel(panel);
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    if (!firstVisit && canAnimate()) {
      const items = [...panel.querySelectorAll('.section-bar, [data-item]:not(.is-filtered-out), .context, .process-step, .stack-group, .trace, .cert')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })
        .slice(0, 10);
      G().fromTo(items, { y: 22, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.05, ease: 'power3.out', delay: 0.12,
        clearProps: 'transform,opacity,visibility',
      });
    }
  }

  function activate(i, opts) {
    opts = opts || {};
    if (i === current) {
      if (opts.scroll) scrollToDeck(opts.then);
      else if (opts.then) opts.then();
      return;
    }
    const from = panels[current];
    const to = panels[i];
    current = i;
    mark();
    placeGliders(false);
    scramble(tabs[i].querySelector('[data-cipher-text]'), names[ids[i]], 0.6);

    // Keep the console in view: from the header (or "Next up") always glide to it, and from
    // the tabs only when the visitor has scrolled past it.
    if (opts.scroll || deck.getBoundingClientRect().top < 0) scrollToDeck();

    const firstVisit = !to.dataset.visited;
    to.dataset.visited = '1';

    if (switching) { switching.progress(1); switching.kill(); switching = null; }
    if (!canAnimate()) {
      show(to);
      afterShow(to, firstVisit);
      if (opts.then) opts.then();
      return;
    }
    const g = G();
    switching = g.timeline({ onComplete: () => { switching = null; } })
      .to(from, { autoAlpha: 0, x: -36, duration: 0.26, ease: 'power2.in' })
      .add(() => {
        g.set(from, { clearProps: 'opacity,visibility,transform' });
        show(to);
        afterShow(to, firstVisit);
        if (opts.then) opts.then();
      })
      .set(beam, { autoAlpha: 1, x: 0 })
      .fromTo(to, { clipPath: 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'power3.inOut', clearProps: 'clipPath' }, '<')
      .to(beam, { x: () => stage.clientWidth, duration: 0.75, ease: 'power3.inOut' }, '<')
      .to(beam, { autoAlpha: 0, duration: 0.25, ease: 'power1.out' }, '-=0.18')
      .set(beam, { x: 0 }); // park it at the left edge so it never widens the page
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
  panels[0].dataset.visited = '1';
  show(panels[current]);
  placeGliders(true);
  openFromHash(true);

  // ---- filters (Work by platform, Certifications by field), animated with Flip ----
  deck.querySelectorAll('[data-filter-group]').forEach((group) => {
    const panel = group.closest('[data-deck-panel]');
    const pills = [...group.querySelectorAll('[data-filter]')];
    const items = [...panel.querySelectorAll('[data-item]')];
    const blocks = [...panel.querySelectorAll('[data-filter-block]')];
    const labels = [...panel.querySelectorAll('[data-filter-label]')];
    const count = panel.querySelector('[data-filter-count="' + group.dataset.filterGroup + '"]');

    function apply(filter) {
      pills.forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.filter === filter)));
      const flip = canAnimate() && window.Flip;
      const state = flip ? window.Flip.getState(items) : null;
      let shown = 0;
      items.forEach((it) => {
        const on = filter === 'all' || it.dataset.tags.split(' ').includes(filter);
        it.classList.toggle('is-filtered-out', !on);
        // Shown by a filter counts as revealed, so a pending scroll entrance can't hide it again.
        if (on) { shown++; it.classList.add('is-visible'); }
      });
      blocks.forEach((b) => {
        const visible = [...b.querySelectorAll('[data-item]:not(.is-filtered-out)')];
        b.classList.toggle('is-empty', visible.length === 0);
        // A lone wide card (AMBOT) takes the whole row instead of the narrow phone column.
        b.classList.toggle('is-solo-wide', visible.length === 1 && visible[0].classList.contains('live-card--wide'));
      });
      labels.forEach((l) => {
        const block = panel.querySelector('[data-filter-block="' + l.dataset.filterLabel + '"]');
        l.classList.toggle('is-empty', !!block && block.classList.contains('is-empty'));
      });
      if (count) count.textContent = shown + ' of ' + items.length;
      if (!flip) { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); return; }
      window.Flip.from(state, {
        duration: 0.65,
        ease: 'power3.inOut',
        absoluteOnLeave: true,
        onEnter: (els) => G().fromTo(els, { autoAlpha: 0, y: 34, scale: 0.97 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, delay: 0.12, stagger: 0.06, ease: 'power3.out' }),
        onLeave: (els) => G().to(els, { autoAlpha: 0, y: -18, scale: 0.97, duration: 0.28, ease: 'power2.in' }),
        onComplete: () => {
          G().set(items, { clearProps: 'transform,opacity,visibility,width,height' });
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        },
      });
    }
    pills.forEach((p) => p.addEventListener('click', () => apply(p.dataset.filter)));
    group.kprApply = apply; // the tech trace resets a filter that would hide its target
  });

  // ---- tech trace: pick a technology, see (and jump to) the projects that ship with it ----
  const PROJECTS = {
    gallus: '01 / Gallus', teamflow: '02 / TeamFlow', newshub: '03 / NewsHub',
    fitcampus: '04 / FitCampus', ambot: '05 / AMBOT',
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
    const target = document.getElementById('project-' + key);
    if (!target) return;
    const workFilter = deck.querySelector('[data-filter-group="work"]');
    activate(0, {
      then: () => {
        if (target.classList.contains('is-filtered-out') && workFilter && workFilter.kprApply) workFilter.kprApply('all');
        requestAnimationFrame(() => {
          const header = document.querySelector('.site-header');
          const y = target.getBoundingClientRect().top + scrollY - (header ? header.offsetHeight : 72) - 28;
          const flash = () => {
            target.classList.remove('is-traced');
            void target.offsetWidth;
            target.classList.add('is-traced');
            setTimeout(() => target.classList.remove('is-traced'), 2400);
          };
          if (window.kprGlideTo) window.kprGlideTo(y, flash); else { window.scrollTo(0, y); flash(); }
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
    let index = 0, timer = null, paused = false;
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
      if (!paused) timer = setInterval(() => show(index + 1), 3200);
    }
    // Pause while the visitor is looking closely (hover or keyboard focus).
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
