const cards = document.querySelectorAll('.project-card');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Content stays visible when JavaScript or IntersectionObserver is unavailable.
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('is-pending');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  cards.forEach((card) => {
    card.classList.add('is-pending');
    observer.observe(card);
  });

  // Honor a motion preference changed while the page is open, too.
  reducedMotion.addEventListener('change', (event) => {
    if (event.matches) {
      observer.disconnect();
      cards.forEach((card) => card.classList.remove('is-pending'));
    }
  });
}
