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

// ---- Site Web Audio (tactile Razer UI ticks + cold-steel Dragonblade SFX) ----
// Browsers only allow sound after the visitor's first click or key press, so auto-loaded
// intros run visually until interacted with, while explicit clicks/replays play full SFX.
const siteAudio = (function () {
  const toggle = document.querySelector('[data-sound-toggle]');
  const AC = window.AudioContext || window.webkitAudioContext;
  let enabled = true;
  try { enabled = localStorage.getItem('hover-sounds') !== 'off'; } catch (e) { /* storage blocked */ }
  let ctx = null, last = 0, noiseBuf = null;

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
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Subtle dampened Razer optical-switch / stealth HUD micro-tick (no pixel square waves)
  function playHoverTick(bodyFreq, clickFreq, volume) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - last < 55) return; // no machine-gun ticks when sweeping across a row
    last = nowMs;
    const t = ctx.currentTime;

    // 1) Crisp 12 ms tactile switch transient
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

    // 2) Short damped low-mid keyswitch body ("thock")
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
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    // Scabbard steel draw friction
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5.5;
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(6400, t + 0.20);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.24);

    // Fixed inharmonic cold-steel resonance partials ("shing")
    [2920, 4410, 6080].forEach((freq, idx) => {
      const mode = ctx.createOscillator();
      const mGain = ctx.createGain();
      mode.type = 'sine';
      mode.frequency.setValueAtTime(freq * 0.992, t);
      mode.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
      mGain.gain.setValueAtTime(0.0001, t);
      mGain.gain.exponentialRampToValueAtTime(0.012 / (idx + 1), t + 0.012);
      mGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      mode.connect(mGain).connect(ctx.destination);
      mode.start(t);
      mode.stop(t + 0.30);
    });
  }

  function playKatanaSlash(step) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const isCleave = step === 3;
    const dur = isCleave ? 0.28 : 0.16;

    // 1) Doppler air-whip (accelerates past listener: low -> high peak -> low tail)
    const air = ctx.createBufferSource();
    air.buffer = getNoiseBuffer();
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.Q.value = isCleave ? 1.55 : 1.85;
    airFilter.frequency.setValueAtTime(520, t);
    airFilter.frequency.exponentialRampToValueAtTime(step === 2 ? 3200 : 2850, t + 0.042);
    airFilter.frequency.exponentialRampToValueAtTime(isCleave ? 260 : 380, t + dur);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, t);
    airGain.gain.exponentialRampToValueAtTime(isCleave ? 0.22 : 0.14, t + 0.032);
    airGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    air.connect(airFilter).connect(airGain).connect(ctx.destination);
    air.start(t);
    air.stop(t + dur + 0.03);

    // 2) Sharp metallic blade impact transient (> 5 kHz steel bite)
    const bite = ctx.createBufferSource();
    bite.buffer = getNoiseBuffer();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const biteGain = ctx.createGain();
    biteGain.gain.setValueAtTime(0.0001, t + 0.02);
    biteGain.gain.exponentialRampToValueAtTime(isCleave ? 0.09 : 0.055, t + 0.026);
    biteGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.052);
    bite.connect(hp).connect(biteGain).connect(ctx.destination);
    bite.start(t + 0.018);
    bite.stop(t + 0.06);

    // 3) Fixed inharmonic steel blade ring (no cartoon downward pitch sweep)
    const modes = step === 1 ? [2760, 4190, 5840]
      : step === 2 ? [3040, 4610, 6390]
      : [2540, 3880, 5420, 7120];
    const ringTail = isCleave ? 0.42 : 0.20;
    modes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.006, t + 0.02);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.045);
      g.gain.setValueAtTime(0.0001, t + 0.02);
      g.gain.exponentialRampToValueAtTime((isCleave ? 0.022 : 0.014) / (1 + idx * 0.65), t + 0.028);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ringTail);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + 0.02);
      osc.stop(t + ringTail + 0.02);
    });

    // 4) Low-end air displacement punch on the final Dragonblade cleave
    if (isCleave) {
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(96, t + 0.02);
      sub.frequency.exponentialRampToValueAtTime(34, t + 0.21);
      subGain.gain.setValueAtTime(0.0001, t + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.17, t + 0.032);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      sub.connect(subGain).connect(ctx.destination);
      sub.start(t + 0.02);
      sub.stop(t + 0.26);
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
    if (!el || el.closest('[data-game]')) return; // the game has its own sound
    if (e.relatedTarget && el.contains(e.relatedTarget)) return; // still inside the same element
    const [bodyFreq, clickFreq, vol] = soundFor(el);
    playHoverTick(bodyFreq, clickFreq, vol);
  });

  if (toggle) {
    toggle.addEventListener('click', () => {
      enabled = !enabled;
      try { localStorage.setItem('hover-sounds', enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
      render();
      if (enabled) { unlock(); playUiConfirm(); }
    });
  }
  render();

  return {
    unlock,
    playUnsheathe,
    playKatanaSlash,
    isEnabled: () => enabled,
  };
})();

// ---- Genji Shimada Dragonblade Splash Intro ----
// Zero polygon seam while intact; Slash 1 shatters the diamond reticle, Slash 2 shears
// the KPR mark into two halves, and Slash 3 cleaves the viewport open into the Hero.
window.kprIntro = (function () {
  const splash = document.querySelector('[data-intro-splash]');
  const canvas = document.querySelector('[data-intro-canvas]');
  const skipBtn = document.querySelector('[data-intro-skip]');
  const replayBtn = document.querySelector('[data-intro-replay]');
  const ctx2d = canvas ? canvas.getContext('2d') : null;

  let active = root.classList.contains('intro-pending') && !!splash && !!ctx2d;
  const doneCallbacks = [];
  let raf = 0, runToken = 0, timers = [], activeCleanup = null;

  function markSeen() {
    try { sessionStorage.setItem('kpr-intro-seen', '1'); } catch (e) {}
  }
  function notifyDone() {
    active = false;
    while (doneCallbacks.length) {
      const fn = doneCallbacks.shift();
      try { fn(); } catch (e) {}
    }
  }
  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function startSequence(options = {}) {
    if (!splash || !ctx2d) { notifyDone(); return; }
    if (activeCleanup) activeCleanup();
    clearTimers();

    const token = ++runToken;
    const isReplay = !!options.replay;
    const returnFocusTo = isReplay ? document.activeElement : null;
    active = true;

    let W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    function sizeCanvas() {
      W = innerWidth;
      H = innerHeight;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();

    splash.classList.remove('is-charging', 'is-slash-1', 'is-slash-2', 'is-cleaved', 'is-parting', 'is-skipping');
    splash.hidden = false;
    splash.removeAttribute('aria-hidden');
    splash.classList.add('is-active');
    root.classList.remove('intro-pending');
    root.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      if (token === runToken) splash.classList.add('is-charging');
      if (!isReplay && skipBtn) skipBtn.focus({ preventScroll: true });
    });

    if (isReplay) siteAudio.unlock();
    siteAudio.playUnsheathe();

    const onSplashPointer = (e) => {
      if (e.target.closest && e.target.closest('[data-intro-skip]')) return;
      siteAudio.unlock();
    };
    splash.addEventListener('pointerdown', onSplashPointer);

    const slashes = [];
    const sparks = [];
    let shake = 0;

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const quadPt = (p0, cp, p1, t) => {
      const m = 1 - t;
      return {
        x: m * m * p0.x + 2 * m * t * cp.x + t * t * p1.x,
        y: m * m * p0.y + 2 * m * t * cp.y + t * t * p1.y,
      };
    };

    function spawnSparks(x, y, vxBase, vyBase, count, speedScale = 1) {
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 1.45;
        const speed = (220 + Math.random() * 580) * speedScale;
        const angle = Math.atan2(vyBase, vxBase) + spread;
        sparks.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.25 + Math.random() * 0.42,
          age: 0,
          width: 1.2 + Math.random() * 2.2,
          color: Math.random() > 0.35 ? '#44d62c' : (Math.random() > 0.4 ? '#28f0b4' : '#eaffea'),
        });
      }
    }

    function spawnRingBurst(cx, cy, radius, count) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const px = cx + Math.cos(a) * radius * 0.7;
        const py = cy + Math.sin(a) * radius * 0.7;
        spawnSparks(px, py, Math.cos(a), Math.sin(a), 1, 0.85);
      }
    }

    function addSlash(spec) {
      const now = performance.now();
      slashes.push({ ...spec, born: now });
      const p0 = spec.p0(), cp = spec.cp(), p1 = spec.p1();
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      for (let k = 0; k < 5; k++) {
        const pt = quadPt(p0, cp, p1, 0.2 + k * 0.16);
        spawnSparks(pt.x, pt.y, dx, dy, spec.cleave ? 9 : 5, spec.cleave ? 1.25 : 0.9);
      }
      shake = spec.cleave ? 10 : 6;
      siteAudio.playKatanaSlash(spec.step);
    }

    function drawCrescent(p0, cp, p1, tStart, tEnd, maxW, alpha) {
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
      ctx2d.save();
      ctx2d.globalAlpha = alpha;
      ctx2d.beginPath();
      ctx2d.moveTo(topPts[0].x, topPts[0].y);
      for (let i = 1; i < topPts.length; i++) ctx2d.lineTo(topPts[i].x, topPts[i].y);
      for (let i = botPts.length - 1; i >= 0; i--) ctx2d.lineTo(botPts[i].x, botPts[i].y);
      ctx2d.closePath();

      ctx2d.shadowColor = '#44d62c';
      ctx2d.shadowBlur = 28;
      ctx2d.fillStyle = '#44d62c';
      ctx2d.fill();

      ctx2d.shadowBlur = 10;
      ctx2d.shadowColor = '#28f0b4';
      ctx2d.fillStyle = '#edffea';
      ctx2d.globalAlpha = alpha * 0.92;
      ctx2d.fill();
      ctx2d.restore();
    }

    let lastFrame = performance.now();
    function tickFrame(now) {
      if (token !== runToken) return;
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      ctx2d.clearRect(0, 0, W, H);

      if (shake > 0.2) {
        const sx = (Math.random() - 0.5) * shake * 2;
        const sy = (Math.random() - 0.5) * shake * 2;
        splash.querySelectorAll('.intro-mark').forEach((m) => {
          m.style.transform = `translate(calc(-50% + ${sx.toFixed(1)}px), calc(-50% + ${sy.toFixed(1)}px))`;
        });
        shake *= 0.80;
      } else if (shake > 0) {
        shake = 0;
        splash.querySelectorAll('.intro-mark').forEach((m) => { m.style.transform = ''; });
      }

      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i];
        const age = (now - s.born) / 1000;
        if (age > s.life) { slashes.splice(i, 1); continue; }
        const prog = age / s.life;
        const tEnd = easeOutCubic(Math.min(1, prog * 2.15));
        const tStart = Math.max(0, (prog - 0.14) * 1.15);
        const alpha = Math.max(0, 1 - Math.pow(prog, 1.8));
        drawCrescent(s.p0(), s.cp(), s.p1(), tStart, tEnd, s.width * (1 - prog * 0.45), alpha);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.age += dt;
        if (sp.age >= sp.life) { sparks.splice(i, 1); continue; }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= 0.94;
        sp.vy *= 0.94;
        const alpha = 1 - sp.age / sp.life;
        ctx2d.save();
        ctx2d.globalAlpha = alpha;
        ctx2d.strokeStyle = sp.color;
        ctx2d.shadowColor = '#44d62c';
        ctx2d.shadowBlur = 10;
        ctx2d.lineWidth = sp.width;
        ctx2d.beginPath();
        ctx2d.moveTo(sp.x, sp.y);
        ctx2d.lineTo(sp.x - sp.vx * 0.032, sp.y - sp.vy * 0.032);
        ctx2d.stroke();
        ctx2d.restore();
      }

      raf = requestAnimationFrame(tickFrame);
    }
    raf = requestAnimationFrame(tickFrame);

    // 1) Slash 1: cuts across & physically shatters the diamond cyber-reticle
    timers.push(setTimeout(() => {
      if (token !== runToken) return;
      addSlash({
        step: 1, life: 0.40, width: Math.max(16, Math.min(W, H) * 0.036),
        p0: () => ({ x: W * 0.76, y: H * 0.20 }),
        cp: () => ({ x: W * 0.46, y: H * 0.44 }),
        p1: () => ({ x: W * 0.24, y: H * 0.80 }),
      });
      timers.push(setTimeout(() => {
        if (token !== runToken) return;
        splash.classList.add('is-slash-1');
        spawnRingBurst(W * 0.5, H * 0.5, Math.min(W, H) * 0.22, 20);
      }, 55));
    }, 460));

    // 2) Slash 2: counter-cuts straight through KPR, physically shearing the letters in half
    timers.push(setTimeout(() => {
      if (token !== runToken) return;
      addSlash({
        step: 2, life: 0.42, width: Math.max(18, Math.min(W, H) * 0.04),
        p0: () => ({ x: W * 0.22, y: H * 0.30 }),
        cp: () => ({ x: W * 0.52, y: H * 0.47 }),
        p1: () => ({ x: W * 0.78, y: H * 0.70 }),
      });
      timers.push(setTimeout(() => {
        if (token !== runToken) return;
        splash.classList.add('is-slash-2');
        spawnSparks(W * 0.5, H * 0.5, 1, 0.36, 22, 1.05);
      }, 55));
    }, 780));

    // 3) Slash 3: sweeping Dragonblade cleave parts the entire viewport open (no ruler line)
    timers.push(setTimeout(() => {
      if (token !== runToken) return;
      addSlash({
        step: 3, cleave: true, life: 0.48, width: Math.max(24, Math.min(W, H) * 0.052),
        p0: () => ({ x: W * 1.04, y: H * 0.14 }),
        cp: () => ({ x: W * 0.50, y: H * 0.50 }),
        p1: () => ({ x: -W * 0.04, y: H * 0.86 }),
      });
      timers.push(setTimeout(() => {
        if (token !== runToken) return;
        splash.classList.add('is-cleaved');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (token !== runToken) return;
            splash.classList.add('is-parting');
            if (!isReplay) notifyDone();
          });
        });
      }, 75));
    }, 1120));

    // 4) Finish and remove overlay cleanly
    timers.push(setTimeout(() => {
      if (token !== runToken) return;
      finish(false);
    }, 1920));

    function finish(skipped) {
      if (token !== runToken) return;
      runToken++;
      clearTimers();
      markSeen();
      const finalizeHide = () => {
        splash.classList.remove('is-active', 'is-charging', 'is-slash-1', 'is-slash-2', 'is-cleaved', 'is-parting', 'is-skipping');
        splash.hidden = true;
        splash.setAttribute('aria-hidden', 'true');
        root.style.overflow = '';
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        if (returnFocusTo && returnFocusTo.focus) returnFocusTo.focus({ preventScroll: true });
      };
      if (skipped) {
        splash.classList.add('is-skipping');
        if (!isReplay) notifyDone();
        setTimeout(finalizeHide, 240);
      } else {
        finalizeHide();
      }
      cleanupListeners();
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(true); }
    };
    const onSkip = () => finish(true);
    function cleanupListeners() {
      window.removeEventListener('resize', sizeCanvas);
      window.removeEventListener('keydown', onKey);
      splash.removeEventListener('pointerdown', onSplashPointer);
      if (skipBtn) skipBtn.removeEventListener('click', onSkip);
      activeCleanup = null;
    }

    window.addEventListener('resize', sizeCanvas);
    window.addEventListener('keydown', onKey);
    if (skipBtn) skipBtn.addEventListener('click', onSkip);
    activeCleanup = () => {
      clearTimers();
      cleanupListeners();
      root.style.overflow = '';
    };
  }

  if (active) {
    startSequence({ replay: false });
  } else {
    root.classList.remove('intro-pending');
    if (splash) { splash.hidden = true; splash.setAttribute('aria-hidden', 'true'); }
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', () => startSequence({ replay: true }));
  }

  return {
    isActive: () => active,
    whenDone(fn) {
      if (!active) fn();
      else doneCallbacks.push(fn);
    },
  };
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
    document.querySelectorAll('.spotlight, .feature-media, .live-card, .stack-group, .cert-card, .context, .portrait-card')
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

  // Underline the nav link for the section in view.
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
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
    if (!baseW) return;
    const w = game.clientWidth, h = game.clientHeight;
    const s = Math.min(w / baseW, h / baseH);
    stage.style.transform = 'translate(' + (w - baseW * s) / 2 + 'px,' + (h - baseH * s) / 2 + 'px) scale(' + s + ')';
  }
  function focusGame() {
    const target = stage.querySelector('textarea') || stage.querySelector('canvas');
    if (target) target.focus({ preventScroll: true });
  }
  window.addEventListener('resize', fitStage);
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
