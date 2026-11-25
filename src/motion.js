// GSAP motion: the hero intro, scroll-driven project cards, magnetic buttons and big-text
// scroll reveals. Runs only when <head> marked the page with .motion (no reduced-motion
// setting) and GSAP loaded; otherwise script.js's CSS reveals stay in charge.
// The Work / Info / Certifications deck shows one module at a time, so each module's scroll
// entrances are armed the first time it is on screen (window.kprMotion.armPanel).
(function () {
  const html = document.documentElement;
  if (!html.classList.contains('motion')) return; // reduced motion, or the 3 s fallback already ran
  const { gsap, ScrollTrigger, SplitText } = window;
  if (!gsap || !ScrollTrigger || !SplitText) { window.kprMotionOff(); return; }
  gsap.registerPlugin(...[ScrollTrigger, SplitText, window.Flip, window.ScrambleTextPlugin].filter(Boolean));

  let ready = false;
  const all = (sel, scope) => [...(scope || document).querySelectorAll(sel)];
  const show = (els) => els.forEach((el) => el.classList.add('is-visible'));
  const CARDS = '.spotlight, .feature, .live-card';

  // Split the text once the web font is in, so letters and words are measured right.
  // (If the font takes over 3 s, the <head> fallback has already switched to CSS motion.)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setUp);
  else setUp();

  // Scroll entrances for one area of the page: cards wipe up, screenshots drift, other
  // .reveal items fade up in small batches, big headlines brighten word by word.
  function arm(scope, skip) {
    const inScope = (sel) => all(sel, scope).filter((el) => !skip || !skip(el));

    const cards = inScope(CARDS);
    cards.forEach((card) => {
      gsap.fromTo(card,
        { autoAlpha: 0, y: 40, clipPath: 'inset(0% 0% 100% 0%)' },
        {
          autoAlpha: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1, ease: 'power3.out',
          // nothing left on the card afterwards: a transform here would trap the game's fullscreen
          clearProps: 'transform,clipPath,opacity,visibility',
          scrollTrigger: { trigger: card, start: 'top 90%', once: true },
          onStart: () => show([card]),
        });
    });
    inScope('.shot').forEach((shot) => {
      gsap.fromTo(shot, { '--par-y': '18px' }, {
        '--par-y': '-18px', ease: 'none',
        scrollTrigger: { trigger: shot.closest('.feature-media') || shot, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    const rest = inScope('.reveal').filter((el) => !cards.includes(el) && !el.classList.contains('is-visible'));
    if (rest.length) {
      gsap.set(rest, { autoAlpha: 0, y: 24 });
      ScrollTrigger.batch(rest, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) => {
          show(batch); // the tech chips cascade in from the CSS once their group is visible
          batch.forEach((el) => {
            if (el.classList.contains('stack-group')) setTimeout(() => el.classList.add('is-settled'), 650);
          });
          // opacity is cleared too, so classes (the process rail's dimmed steps) can set it
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        },
      });
    }

    inScope('.context-title, .cta-title').forEach((title) => {
      const words = SplitText.create(title, { type: 'words' }).words;
      gsap.fromTo(words, { opacity: 0.18 }, {
        opacity: 1, stagger: 0.1, ease: 'none',
        // clamp(): the contact headline sits near the page's end, so finish by the last scroll
        scrollTrigger: { trigger: title, start: 'top 85%', end: 'clamp(top 55%)', scrub: true },
      });
    });
  }

  window.kprMotion = {
    armPanel(panel) {
      if (!ready || !panel || panel.dataset.armed) return;
      panel.dataset.armed = '1';
      arm(panel);
    },
  };

  function setUp() {
    if (!html.classList.contains('motion')) return;
    // Drop the pre-GSAP visibility lock before GSAP reads computed visibility for .from() tweens.
    html.classList.add('motion-ready');

    // ---- Hero intro: the headline rises letter by letter, then the rest follows ----
    const heroItems = all('.hero-copy > .reveal, .portrait-card');
    show(heroItems);
    const headline = SplitText.create('.hero-title .line > span', { type: 'words,chars' });
    const heroTl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } })
      .from('.hero-copy > .label', { autoAlpha: 0, y: 12, duration: 0.6 }, 0)
      .from(headline.chars, { yPercent: 110, duration: 0.9, stagger: 0.02, ease: 'power4.out' }, 0.1)
      .from('.hero-copy > .reveal:not(.label)', { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.1, clearProps: 'transform,opacity,visibility' }, 0.55)
      .from('.portrait-card', { autoAlpha: 0, y: 24, duration: 0.9, clearProps: 'transform,opacity,visibility' }, 0.3)
      .from('.portrait-frame img', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.1, ease: 'power3.inOut', clearProps: 'clipPath' }, 0.35);

    // ---- The deck console rises in as one piece; its open module arms below ----
    const consoleEl = document.querySelector('.deck-console');
    if (consoleEl) {
      gsap.from(consoleEl, {
        autoAlpha: 0, y: 30, duration: 0.9, ease: 'power3.out', clearProps: 'transform,opacity,visibility',
        scrollTrigger: { trigger: consoleEl, start: 'top 92%', once: true },
      });
    }

    // Everything outside the deck (contact headline), then the module that's open now.
    ready = true;
    arm(document, (el) => heroItems.includes(el) || !!el.closest('[data-deck-panel]'));
    window.kprMotion.armPanel(document.querySelector('[data-deck-panel].is-active'));

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
    // the video, the game panel, switching modules), or end-of-page effects stop short.
    if ('ResizeObserver' in window) {
      let pending;
      new ResizeObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => ScrollTrigger.refresh(), 200);
      }).observe(document.body);
    }

    if (window.kprIntro && window.kprIntro.whenDone) {
      window.kprIntro.whenDone(() => {
        ScrollTrigger.refresh();
        heroTl.play(0);
      });
    } else {
      heroTl.play(0);
    }
  }
})();
