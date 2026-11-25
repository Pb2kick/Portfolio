// GSAP motion: the hero intro, scroll-driven project cards, magnetic buttons and big-text
// scroll reveals. Runs only when <head> marked the page with .motion (no reduced-motion
// setting) and GSAP loaded; otherwise script.js's CSS reveals stay in charge.
(function () {
  const html = document.documentElement;
  if (!html.classList.contains('motion')) return; // reduced motion, or the 3 s fallback already ran
  const { gsap, ScrollTrigger, SplitText } = window;
  if (!gsap || !ScrollTrigger || !SplitText) { window.kprMotionOff(); return; }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  // Split the text once the web font is in, so letters and words are measured right.
  // (If the font takes over 3 s, the <head> fallback has already switched to CSS motion.)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setUp);
  else setUp();

  function setUp() {
    if (!html.classList.contains('motion')) return;
    const show = (els) => els.forEach((el) => el.classList.add('is-visible'));
    const all = (sel) => [...document.querySelectorAll(sel)];

    // ---- Hero intro: the headline rises letter by letter, then the rest follows ----
    const heroItems = all('.hero-copy > .reveal, .portrait-card');
    show(heroItems);
    const headline = SplitText.create('.hero-title .line > span', { type: 'words,chars' });
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.hero-copy > .label', { autoAlpha: 0, y: 12, duration: 0.6 }, 0)
      .from(headline.chars, { yPercent: 110, duration: 0.9, stagger: 0.02, ease: 'power4.out' }, 0.1)
      .from('.hero-copy > .reveal:not(.label)', { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.1, clearProps: 'transform' }, 0.55)
      .from('.portrait-card', { autoAlpha: 0, y: 24, duration: 0.9, clearProps: 'transform' }, 0.3)
      .from('.portrait-frame', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.1, ease: 'power3.inOut', clearProps: 'clipPath' }, 0.35);

    // ---- Project cards wipe up into view; the screenshots drift for depth ----
    const cards = all('.spotlight, .feature, .live-card');
    cards.forEach((card) => {
      gsap.from(card, {
        autoAlpha: 0, y: 40, clipPath: 'inset(0% 0% 100% 0%)', duration: 1, ease: 'power3.out',
        // nothing left on the card afterwards: a transform here would trap the game's fullscreen
        clearProps: 'transform,clipPath',
        scrollTrigger: { trigger: card, start: 'top 88%', once: true },
        onStart: () => show([card]),
      });
    });
    all('.shot').forEach((shot) => {
      gsap.fromTo(shot, { '--par-y': '18px' }, {
        '--par-y': '-18px', ease: 'none',
        scrollTrigger: { trigger: shot.closest('.feature-media') || shot, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // ---- Everything else marked .reveal fades up as it enters, in small batches ----
    const rest = all('.reveal').filter((el) => !heroItems.includes(el) && !cards.includes(el));
    gsap.set(rest, { autoAlpha: 0, y: 24 });
    ScrollTrigger.batch(rest, {
      start: 'top 92%',
      once: true,
      onEnter: (batch) => {
        show(batch); // the tech chips cascade in from the CSS once their group is visible
        gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out', clearProps: 'transform' });
      },
    });

    // ---- Big text: headlines brighten word by word as they scroll up the screen ----
    all('.context-title, .cta-title').forEach((title) => {
      const words = SplitText.create(title, { type: 'words' }).words;
      gsap.fromTo(words, { opacity: 0.18 }, {
        opacity: 1, stagger: 0.1, ease: 'none',
        // clamp(): the contact headline sits near the page's end, so finish by the last scroll
        scrollTrigger: { trigger: title, start: 'top 85%', end: 'clamp(top 55%)', scrub: true },
      });
    });

    // "01 — 05" counts up when the work section arrives
    const count = document.querySelector('#work .section-bar .lime');
    if (count) {
      const n = { v: 1 };
      count.textContent = '01 — 01';
      gsap.to(n, {
        v: 5, duration: 1.2, delay: 0.8, ease: 'power2.out', // after the hero intro, when it's on screen at load
        onUpdate: () => { count.textContent = '01 — 0' + Math.round(n.v); },
        scrollTrigger: { trigger: count, start: 'top 90%', once: true },
      });
    }

    // ---- Magnetic buttons: they lean toward the mouse and spring back (mouse only) ----
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      all('.btn, .float-top').forEach((el) => {
        gsap.set(el, { '--mag-x': '0px', '--mag-y': '0px' });
        const toX = gsap.quickTo(el, '--mag-x', { duration: 0.4, ease: 'power3.out' });
        const toY = gsap.quickTo(el, '--mag-y', { duration: 0.4, ease: 'power3.out' });
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          const clamp = (v, m) => Math.max(-m, Math.min(m, v));
          toX(clamp((e.clientX - (r.left + r.width / 2)) * 0.3, 10)); // plain numbers: quickTo keeps the px unit
          toY(clamp((e.clientY - (r.top + r.height / 2)) * 0.4, 8));
        });
        el.addEventListener('pointerleave', () => { toX(0); toY(0); });
      });
    }

    // Re-measure scroll positions whenever the page's height changes after this (late images,
    // the video, the game panel), or end-of-page effects stop short of finishing.
    if ('ResizeObserver' in window) {
      let pending;
      new ResizeObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => ScrollTrigger.refresh(), 200);
      }).observe(document.body);
    }

    html.classList.add('motion-ready');
  }
})();
