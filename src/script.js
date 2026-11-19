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
  if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#161815' : '#f3f2ec');
}

function savedTheme() {
  try { return localStorage.getItem('theme'); } catch (e) { return null; }
}

applyTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

if (toggle) {
  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
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

function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* storage blocked: lasts this visit only */ }
}

// ---- 01 / Gallus: promo video, loaded only when it scrolls into view ----
(function () {
  const video = document.querySelector('[data-lazy-video]');
  const toggle = document.querySelector('[data-video-toggle]');
  if (!video) return;
  let loaded = false;
  let userPaused = reduceMotion; // reduced motion: never autoplay, wait for a click

  function setPausedUi(paused) {
    if (!toggle) return;
    toggle.classList.toggle('is-paused', paused);
    toggle.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
  }
  function load() {
    if (loaded) return;
    loaded = true;
    video.querySelectorAll('source[data-src]').forEach((s) => { s.src = s.dataset.src; });
    video.load();
  }
  function play() { load(); video.play().catch(() => setPausedUi(true)); }

  video.addEventListener('playing', () => { video.classList.add('is-ready'); setPausedUi(false); });
  video.addEventListener('pause', () => setPausedUi(true));
  setPausedUi(userPaused);

  if (toggle) {
    toggle.addEventListener('click', () => {
      if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); }
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { if (!userPaused) play(); }
        else if (!video.paused) video.pause();
      });
    }, { threshold: 0.35 }).observe(video);
  } else if (!userPaused) {
    play();
  }
})();

// ---- 04 / FitCampus: Appetize Android emulator, started only on click ----
(function () {
  const phone = document.querySelector('[data-appetize]');
  if (!phone) return;
  const key = (phone.dataset.appetizeKey || '').trim();
  if (!key) return; // no key yet: the static app screen stays
  const cover = phone.querySelector('[data-appetize-cover]');
  const start = phone.querySelector('[data-appetize-start]');
  const status = document.querySelector('[data-appetize-status]');
  if (status) status.textContent = 'Live Android emulator · Private repository';
  cover.hidden = false;

  start.addEventListener('click', () => {
    const params = new URLSearchParams({
      device: phone.dataset.appetizeDevice || 'pixel7',
      scale: 'auto', centered: 'both', screenOnly: 'true', autoplay: 'true',
    });
    const frame = document.createElement('iframe');
    frame.src = 'https://appetize.io/embed/' + encodeURIComponent(key) + '?' + params;
    frame.title = 'FitCampus running on a cloud Android emulator';
    frame.allow = 'autoplay; clipboard-read; clipboard-write';
    phone.appendChild(frame);
    cover.hidden = true;
  }, { once: true });
})();

// ---- 05 / AMBOT: the real Java game, run in the browser by CheerpJ ----
// CheerpJ has no Java audio, so the game's web build (tools/ambot-web) hands every
// sound to the page through the native methods below. That is also what lets the
// page's mute and volume controls apply to the game.
(function () {
  const game = document.querySelector('[data-game]');
  if (!game) return;
  const CHEERPJ_LOADER = 'https://cjrtnc.leaningtech.com/5.0/loader.js';
  const stage = game.querySelector('[data-game-stage]');
  const cover = game.querySelector('[data-game-cover]');
  const start = game.querySelector('[data-game-start]');
  const hint = game.querySelector('[data-game-hint]');
  const muteBtn = document.querySelector('[data-game-mute]');
  const muteLabel = document.querySelector('[data-game-mute-label]');
  const volume = document.querySelector('[data-game-volume]');
  const volumeOut = document.querySelector('[data-game-volume-out]');
  const fullscreenBtn = document.querySelector('[data-game-fullscreen]');

  const touchOnly = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  if (touchOnly && hint) hint.textContent = 'AMBOT needs a keyboard, so it plays best on a computer.';

  // --- sound ---
  const sound = {
    ctx: null, master: null, buffers: new Map(),
    music: null, musicPath: null, musicToken: 0,
    volume: Number(readPref('ambot-volume', '70')) / 100,
    muted: readPref('ambot-muted', 'false') === 'true',
  };
  const levelGain = (level) => Math.pow(Math.max(0, Math.min(10, Number(level) || 0)) / 10, 2);

  function audioContext() {
    if (!sound.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      sound.ctx = new AC();
      sound.master = sound.ctx.createGain();
      sound.master.connect(sound.ctx.destination);
      applyMaster();
    }
    if (sound.ctx.state === 'suspended') sound.ctx.resume();
    return sound.ctx;
  }
  function applyMaster() {
    if (sound.master) sound.master.gain.setTargetAtTime(sound.muted ? 0 : sound.volume, sound.ctx.currentTime, 0.02);
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
  const natives = {
    async Java_ambot_web_WebAudio_jsPlaySfx() { const [p, l] = last(arguments, 2); playSfx(String(p), l); },
    async Java_ambot_web_WebAudio_jsPlayMusic() { const [p, l] = last(arguments, 2); playMusic(String(p), l); },
    async Java_ambot_web_WebAudio_jsStopMusic() { stopMusic(); },
    async Java_ambot_web_WebAudio_jsMusicVolume() { setMusicLevel(last(arguments, 1)[0]); },
  };

  // --- controls ---
  function renderSoundUi() {
    const pct = Math.round(sound.volume * 100);
    volume.value = pct;
    volumeOut.textContent = pct + '%';
    muteBtn.setAttribute('aria-pressed', String(sound.muted));
    muteLabel.textContent = sound.muted ? 'Unmute' : 'Mute';
  }
  muteBtn.addEventListener('click', () => {
    sound.muted = !sound.muted;
    writePref('ambot-muted', sound.muted);
    applyMaster();
    renderSoundUi();
  });
  volume.addEventListener('input', () => {
    sound.volume = Number(volume.value) / 100;
    if (sound.muted && sound.volume > 0) { sound.muted = false; writePref('ambot-muted', false); }
    writePref('ambot-volume', volume.value);
    applyMaster();
    renderSoundUi();
  });
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (game.requestFullscreen) game.requestFullscreen().catch(() => {});
  });
  renderSoundUi();

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
    start.disabled = true;
    hint.textContent = 'Starting the Java runtime…';
    audioContext(); // created inside the click, so the browser allows sound
    try {
      if (!initialised) {
        await loadScript(CHEERPJ_LOADER);
        await window.cheerpjInit({ version: 17, natives });
        // The web build scales its frame to whatever size the display is (tools/ambot-web/WebFit.java).
        window.cheerpjCreateDisplay(-1, -1, stage);
        initialised = true;
      }
      cover.hidden = true;
      await window.cheerpjRunJar('/app/games/ambot/ambot.jar');
      // The game was quit from its menu.
      stopMusic();
      cover.hidden = false;
      start.hidden = true;
      hint.textContent = 'Thanks for playing! Reload the page to play again.';
    } catch (err) {
      console.error('AMBOT failed to start', err);
      cover.hidden = false;
      start.disabled = false;
      hint.textContent = 'The game could not start in this browser. Try reloading the page.';
    }
  });
})();
