(function () {
  const TARGET = 3.42;
  const DURATION = 900;
  let running = false;
  let raf = 0;

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function reset(slide) {
    const path = slide.querySelector('[data-hero-path]');
    const dot = slide.querySelector('[data-hero-dot]');
    const delta = slide.querySelector('[data-hero-delta]');
    if (path) path.classList.remove('is-draw');
    if (dot) dot.classList.remove('is-on');
    if (delta) delta.textContent = '+0.00%';
    if (raf) cancelAnimationFrame(raf);
    running = false;
  }

  function play(slide) {
    if (!slide || running) return;
    reset(slide);
    running = true;

    const path = slide.querySelector('[data-hero-path]');
    const dot = slide.querySelector('[data-hero-dot]');
    const delta = slide.querySelector('[data-hero-delta]');

    requestAnimationFrame(() => {
      if (path) path.classList.add('is-draw');
    });

    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / DURATION);
      const value = TARGET * easeOut(t);
      if (delta) delta.textContent = '+' + value.toFixed(2) + '%';
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        if (dot) dot.classList.add('is-on');
        running = false;
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function onSlideChange() {
    const active = document.querySelector('.slide.active.investor-hero');
    if (active) {
      play(active);
    } else {
      document.querySelectorAll('.investor-hero').forEach(reset);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    onSlideChange();
    const observer = new MutationObserver(onSlideChange);
    document.querySelectorAll('.slide.investor-hero').forEach((slide) => {
      observer.observe(slide, { attributes: true, attributeFilter: ['class'] });
    });
  });

  window.__heroStageSettlePdf = function (root) {
    const path = root.querySelector('[data-hero-path]');
    const dot = root.querySelector('[data-hero-dot]');
    const delta = root.querySelector('[data-hero-delta]');
    if (path) {
      path.classList.add('is-draw');
      path.style.strokeDashoffset = '0';
      path.style.animation = 'none';
    }
    if (dot) {
      dot.classList.add('is-on');
      dot.style.opacity = '1';
      dot.style.animation = 'none';
    }
    if (delta) delta.textContent = '+3.42%';
    root.querySelectorAll('.hero-card__holds li').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.animation = 'none';
    });
  };
})();
