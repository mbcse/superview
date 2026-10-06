/* Solution slide — write → agent builds → feed scores */
(function () {
  'use strict';

  const SENTENCE = 'The world will need a lot more electricity.';
  const HOLDINGS = [
    { symbol: 'VST', w: 27 },
    { symbol: 'CEG', w: 25 },
    { symbol: 'GEV', w: 23 },
    { symbol: 'NEE', w: 20 },
    { symbol: 'Cash', w: 5 },
  ];
  const TARGET_DELTA = 3.42;

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  class SolutionStage {
    constructor(root) {
      this.root = root;
      this.typed = root.querySelector('[data-sol-typed]');
      this.caret = root.querySelector('[data-sol-caret]');
      this.count = root.querySelector('[data-sol-count]');
      this.weightHost = root.querySelector('[data-sol-weights]');
      this.delta = root.querySelector('[data-sol-delta]');
      this.buildCard = root.querySelector('.solution-panel--build');
      this.scoreCard = root.querySelector('.solution-panel--score');
      this.timeouts = new Set();
      this.running = false;
      this.raf = 0;
      this.buildStatic();
    }

    buildStatic() {
      if (!this.weightHost || this.weightHost.children.length) return;
      HOLDINGS.forEach((n, i) => {
        const row = document.createElement('div');
        row.className = 'solution-weight';
        row.style.setProperty('--i', String(i));
        row.innerHTML =
          `<span>${n.symbol}</span>` +
          `<div class="solution-weight__track"><i style="--w:${n.w}%; --i:${i}"></i></div>` +
          `<b>${n.w}%</b>`;
        this.weightHost.appendChild(row);
      });
    }

    later(ms, fn) {
      const id = setTimeout(() => {
        this.timeouts.delete(id);
        if (this.running) fn();
      }, ms);
      this.timeouts.add(id);
    }

    stop() {
      this.running = false;
      this.timeouts.forEach((id) => clearTimeout(id));
      this.timeouts.clear();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    setCount(n) {
      if (this.count) this.count.textContent = `${n}/220`;
    }

    setDelta(vs) {
      if (this.delta) this.delta.textContent = `+${vs.toFixed(2)}%`;
    }

    setFilled(build, score) {
      if (this.buildCard) this.buildCard.classList.toggle('is-filled', build);
      if (this.scoreCard) this.scoreCard.classList.toggle('is-filled', score);
    }

    start() {
      this.stop();
      this.setFilled(false, false);
      this.setDelta(0);
      this.setCount(0);
      if (this.typed) this.typed.textContent = '';
      if (this.caret) this.caret.classList.remove('is-on');

      if (prefersReducedMotion()) {
        if (this.typed) this.typed.textContent = SENTENCE;
        this.setCount(SENTENCE.length);
        this.setFilled(true, true);
        this.setDelta(TARGET_DELTA);
        return;
      }

      this.running = true;
      this.typeSentence(() => {
        this.later(380, () => this.setFilled(true, false));
        this.later(980, () => {
          this.setFilled(true, true);
          this.animateDelta();
        });
        this.later(6800, () => this.start());
      });
    }

    typeSentence(done) {
      if (!this.typed) {
        done();
        return;
      }
      this.typed.textContent = '';
      this.setCount(0);
      if (this.caret) this.caret.classList.add('is-on');
      let i = 0;
      const tick = () => {
        if (!this.running) return;
        i += 1;
        this.typed.textContent = SENTENCE.slice(0, i);
        this.setCount(i);
        if (i < SENTENCE.length) {
          this.later(18 + (i % 5 === 0 ? 28 : 0), tick);
        } else {
          if (this.caret) this.caret.classList.remove('is-on');
          this.setCount(SENTENCE.length);
          done();
        }
      };
      tick();
    }

    animateDelta() {
      const start = performance.now();
      const dur = 900;
      const frame = (now) => {
        if (!this.running) return;
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        this.setDelta(TARGET_DELTA * eased);
        if (t < 1) this.raf = requestAnimationFrame(frame);
        else this.setDelta(TARGET_DELTA);
      };
      this.raf = requestAnimationFrame(frame);
    }
  }

  function bind() {
    const stages = Array.from(document.querySelectorAll('[data-solution-stage]'));
    if (!stages.length) return;

    stages.forEach((el) => {
      el._solution = new SolutionStage(el);
    });

    let lastActive = document.querySelector('.slide.active');
    const sync = (slide) => {
      document.querySelectorAll('[data-solution-stage]').forEach((el) => {
        const onSlide = slide && slide.contains(el);
        if (onSlide) el._solution.start();
        else el._solution.stop();
      });
    };
    sync(lastActive);

    const obs = new MutationObserver(() => {
      const active = document.querySelector('.slide.active');
      if (active === lastActive) return;
      lastActive = active;
      sync(active);
    });
    document.querySelectorAll('.slide').forEach((slide) => {
      obs.observe(slide, { attributes: true, attributeFilter: ['class'] });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
