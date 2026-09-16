const percentEl = document.getElementById('preloader-percent');
const preloader = document.getElementById('preloader');
let count = 0;

const counter = setInterval(() => {
  count += Math.floor(Math.random() * 8) + 4;
  if (count >= 100) {
    count = 100;
    clearInterval(counter);
    percentEl.textContent = count + '%';

    gsap.to(preloader, {
      yPercent: -100,
      duration: 0.8,
      ease: 'power3.inOut',
      delay: 0.3,
      onComplete: () => preloader.remove()
    });

    playHeroIntro();
    return;
  }
  percentEl.textContent = count + '%';
}, 80);

function playHeroIntro() {
  const tl = gsap.timeline({ delay: 0.5 });

  tl.from('.line-1', { yPercent: 110, duration: 0.9, ease: 'power4.out' })
    .from('.line-2', { yPercent: 110, duration: 0.9, ease: 'power4.out' }, '-=0.6')
    .to('.hero-sub', { opacity: 1, duration: 0.6 }, '-=0.3')
    .to('.scroll-hint', { opacity: 1, duration: 0.6 }, '-=0.2')
    .to('.badge', { opacity: 1, duration: 0.6 }, '-=0.4');
}

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  navToggle.classList.toggle('active');
  navLinks.classList.toggle('open');
  document.body.classList.toggle('menu-open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navToggle.classList.remove('active');
    navLinks.classList.remove('open');
    document.body.classList.remove('menu-open');
  });
});

const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (isFinePointer) {
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  const heroTitle = document.querySelector('.hero-title');

  gsap.set(ring, { xPercent: -50, yPercent: -50 });

  const ringX = gsap.quickTo(ring, "x", { duration: 0.35, ease: "power3" });
  const ringY = gsap.quickTo(ring, "y", { duration: 0.35, ease: "power3" });
  const titleX = gsap.quickTo(heroTitle, "x", { duration: 0.6, ease: "power3" });
  const titleY = gsap.quickTo(heroTitle, "y", { duration: 0.6, ease: "power3" });

  window.addEventListener('mousemove', (e) => {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    ringX(e.clientX);
    ringY(e.clientY);

    const relX = (e.clientX / window.innerWidth - 0.5) * 20;
    const relY = (e.clientY / window.innerHeight - 0.5) * 20;
    titleX(relX);
    titleY(relY);
  });

  document.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('hovering'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hovering'));
  });
}

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const delay = parseFloat(entry.target.dataset.delay || 0);
      gsap.to(entry.target, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        delay: delay,
        ease: 'power3.out'
      });
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

const countObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = parseInt(el.getAttribute('data-target'), 10);

      gsap.to(el, {
        innerText: target,
        duration: 1.6,
        ease: 'power2.out',
        snap: { innerText: 1 },
        onUpdate: function () {
          el.innerText = Math.floor(el.innerText);
        }
      });

      countObserver.unobserve(el);
    }
  });
}, { threshold: 0.6 });

document.querySelectorAll('.count').forEach((el) => countObserver.observe(el));

document.querySelectorAll('.cert-toggle').forEach((btn) => {
  const details = btn.closest('.cert-card').querySelector('.cert-details');

  btn.addEventListener('click', () => {
    const isOpen = btn.classList.contains('open');
    btn.classList.toggle('open');
    gsap.to(details, {
      height: isOpen ? 0 : 'auto',
      duration: 0.45,
      ease: 'power2.inOut'
    });
  });
});

document.querySelectorAll('.expertise-toggle').forEach((btn) => {
  const details = btn.closest('.expertise-row').querySelector('.expertise-details');

  btn.addEventListener('click', () => {
    const isOpen = btn.classList.contains('open');
    btn.classList.toggle('open');
    btn.textContent = isOpen ? '+ more' : '- less';
    gsap.to(details, {
      height: isOpen ? 0 : 'auto',
      duration: 0.45,
      ease: 'power2.inOut'
    });
  });
});

const backToTop = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
  if (window.scrollY > window.innerHeight * 0.6) {
    backToTop.classList.add('visible');
  } else {
    backToTop.classList.remove('visible');
  }
});

backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const lightbox = GLightbox({ selector: '.glightbox' });