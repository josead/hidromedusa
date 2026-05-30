// ──── AnimeJS Animations ──────────────────────────────────────────────────────

function initAnimations() {
  if (!window.anime) return;

  // Hero jellyfish float
  anime({
    targets: '#hero-jelly',
    translateY: [-12, 12],
    duration: 5000,
    direction: 'alternate',
    easing: 'easeInOutSine',
    loop: true,
  });

  // Tentacle wave (each with offset)
  anime({
    targets: '.tentacle',
    d: [
      { value: (el) => el.getAttribute('d').replace(/Q[-\d. ]+/g, m => 'Q' + m.slice(1).split(' ').map((v, i) => i === 1 ? String(parseFloat(v) + 5) : v).join(' ')) },
    ],
    duration: 2000,
    delay: anime.stagger(200),
    direction: 'alternate',
    easing: 'easeInOutSine',
    loop: true,
  });

  // Bioluminescent spots pulse
  anime({
    targets: '#jelly-main circle',
    opacity: [0.4, 1],
    r: (el) => [parseFloat(el.getAttribute('r')), parseFloat(el.getAttribute('r')) * 1.4],
    duration: 2000,
    delay: anime.stagger(300),
    direction: 'alternate',
    easing: 'easeInOutQuad',
    loop: true,
  });

  // Hero title letter animation on load
  anime({
    targets: '#hero-title',
    opacity: [0, 1],
    translateY: [30, 0],
    duration: 1200,
    easing: 'easeOutExpo',
  });

  // Hero CTAs
  anime({
    targets: '#hero-ctas',
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 800,
    delay: 400,
    easing: 'easeOutCubic',
  });

  // Next event card
  anime({
    targets: '#next-event-card',
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 800,
    delay: 700,
    easing: 'easeOutCubic',
  });

  // Ambient blobs slow drift
  anime({
    targets: '#ambient .jelly-blob',
    translateX: () => anime.random(-40, 40),
    translateY: () => anime.random(-40, 40),
    duration: () => anime.random(8000, 14000),
    delay: anime.stagger(2000),
    direction: 'alternate',
    easing: 'easeInOutSine',
    loop: true,
  });

  initParticles();
}

function initParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;

  const colors = ['rgba(0,245,255,', 'rgba(124,47,214,', 'rgba(191,90,255,', 'rgba(0,229,212,'];

  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 3 + 1;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const opacity = (Math.random() * 0.4 + 0.1).toFixed(2);
    p.style.cssText = `
      width:${size}px; height:${size}px;
      background:${color}${opacity});
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      box-shadow:0 0 ${size*4}px ${color}0.6);
    `;
    container.appendChild(p);

    anime({
      targets: p,
      translateY: [0, -(Math.random() * 300 + 100)],
      translateX: [0, (Math.random() - 0.5) * 100],
      opacity: [parseFloat(opacity), 0],
      duration: Math.random() * 8000 + 6000,
      delay: Math.random() * 10000,
      easing: 'linear',
      loop: true,
      complete: () => {
        p.style.top = `${Math.random() * 100}%`;
        p.style.left = `${Math.random() * 100}%`;
      }
    });
  }
}

// Page transition animations
function animatePageIn(pageId) {
  if (!window.anime) return;
  const page = document.getElementById(`page-${pageId}`);
  if (!page) return;
  anime({
    targets: page,
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 500,
    easing: 'easeOutCubic',
  });

  // Stagger direct children
  anime({
    targets: `#page-${pageId} > div > *`,
    opacity: [0, 1],
    translateY: [15, 0],
    delay: anime.stagger(80, { start: 100 }),
    duration: 400,
    easing: 'easeOutCubic',
  });
}

// Nav scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  if (window.scrollY > 20) {
    nav.style.background = 'rgba(4,14,31,0.95)';
    nav.style.backdropFilter = 'blur(20px)';
    nav.style.borderBottom = '1px solid rgba(0,245,255,0.08)';
  } else {
    nav.style.background = 'transparent';
    nav.style.backdropFilter = 'none';
    nav.style.borderBottom = 'none';
  }
});

// Patch navigate to add page transitions
const _navigate = window.navigate;
window.navigate = function(page) {
  if (_navigate) _navigate(page);
  setTimeout(() => animatePageIn(page), 10);
};

// Intersection observer for glass cards
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting && window.anime) {
      anime({
        targets: entry.target,
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 500,
        easing: 'easeOutCubic',
      });
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', () => {
  initAnimations();
  document.querySelectorAll('.glass, .ticket-card').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
});
