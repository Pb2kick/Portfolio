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
  if (themeColor) themeColor.setAttribute('content', '#121412'); // the header is dark in both themes
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

const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  revealItems.forEach((item, index) => {
    // Small stagger for items that enter together (hero lines, process steps).
    item.style.transitionDelay = `${(index % 4) * 70}ms`;
    observer.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Smooth, eased scrolling for in-page links ("Get in touch", nav, back to top) ----
// The browser's own smooth scrolling is switched off by reduced-motion settings; this keeps
// a short, gentle glide there instead of a jump, and a fuller one otherwise.
(function () {
  const root = document.documentElement;
  let frame = null;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function stop() { if (frame) { cancelAnimationFrame(frame); frame = null; root.style.scrollBehavior = ''; } }
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, stop, { passive: true }));

  function glideTo(y, done) {
    stop();
    const start = scrollY, distance = y - start;
    if (Math.abs(distance) < 2) { if (done) done(); return; }
    const d = Math.abs(distance);
    const duration = reduceMotion ? Math.min(700, Math.max(400, d * 0.2)) : Math.min(1200, Math.max(600, d * 0.4));
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
      if (hash !== '#top') {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
    if (history.pushState) history.pushState(null, '', hash === '#top' ? location.pathname : hash);
  });
})();

// ---- Hover sounds: a soft synthesized tick on buttons, links and tech chips ----
// Browsers only allow sound after the visitor's first click or key press, so the ticks
// start then. The speaker button in the header turns them off (remembered).
(function () {
  const toggle = document.querySelector('[data-sound-toggle]');
  const AC = window.AudioContext || window.webkitAudioContext;
  let enabled = true;
  try { enabled = localStorage.getItem('hover-sounds') !== 'off'; } catch (e) { /* storage blocked */ }
  let ctx = null, last = 0;

  function render() {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Turn hover sounds off' : 'Turn hover sounds on');
  }
  function unlock() {
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true, capture: true }));

  function tick(freq, volume) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - last < 60) return; // no machine-gun ticks when sweeping across a row
    last = nowMs;
    const t = ctx.currentTime, dur = 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.62, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Pitch by kind of element: lower for main buttons, higher for small links and chips.
  function soundFor(el) {
    if (el.matches('.btn, .live-start')) return [1100, 0.05];
    if (el.matches('.stack-list li')) return [2400, 0.025];
    if (el.matches('button')) return [1500, 0.04];
    return [1900, 0.035];
  }
  const HOVERABLE = 'a, button, .stack-list li';
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest(HOVERABLE);
    if (!el || el.closest('[data-game]')) return; // the game has its own sound
    if (e.relatedTarget && el.contains(e.relatedTarget)) return; // still inside the same element
    const [freq, vol] = soundFor(el);
    tick(freq, vol);
  });

  if (toggle) {
    toggle.addEventListener('click', () => {
      enabled = !enabled;
      try { localStorage.setItem('hover-sounds', enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
      render();
      if (enabled) { unlock(); last = 0; tick(1500, 0.045); } // a tick to confirm sounds are on
    });
  }
  render();
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
    video.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; });
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
