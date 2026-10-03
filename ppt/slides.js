/* ═══════════════════════════════════════════════════════════════════════
   Presentation slide engine and animations
   Navigation, transitions, particles, and interactive elements
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── Utility ───────────────────────────────────────────────── */
    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

    /* ══════════════════════════════════════════════════════════════
       PARTICLE SYSTEM
       ══════════════════════════════════════════════════════════════ */
    class ParticleSystem {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.particles = [];
            const styles = getComputedStyle(document.documentElement);
            this.accent = styles.getPropertyValue('--btc').trim() || '#57b8ff';
            this.accentRgb = styles.getPropertyValue('--btc-rgb').trim() || '87, 184, 255';
            this.resize();
            window.addEventListener('resize', () => this.resize());
            this.init();
            this.animate();
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        init() {
            const count = Math.floor((window.innerWidth * window.innerHeight) / 18000);
            this.particles = [];
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3,
                    radius: Math.random() * 1.5 + 0.5,
                    alpha: Math.random() * 0.3 + 0.05,
                    color: Math.random() > 0.68 ? this.accent : '#ffffff'
                });
            }
        }

        animate() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            const w = this.canvas.width;
            const h = this.canvas.height;

            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = w;
                if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h;
                if (p.y > h) p.y = 0;

                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = p.alpha;
                this.ctx.fill();
            });

            // Draw connections
            this.ctx.globalAlpha = 1;
            for (let i = 0; i < this.particles.length; i++) {
                for (let j = i + 1; j < this.particles.length; j++) {
                    const a = this.particles[i];
                    const b = this.particles[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(a.x, a.y);
                        this.ctx.lineTo(b.x, b.y);
                        this.ctx.strokeStyle = `rgba(${this.accentRgb},${0.07 * (1 - dist / 120)})`;
                        this.ctx.lineWidth = 0.5;
                        this.ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(() => this.animate());
        }
    }

    /* ══════════════════════════════════════════════════════════════
       SLIDE ENGINE
       ══════════════════════════════════════════════════════════════ */
    class SlideEngine {
        constructor() {
            this.slides = $$('.slide:not(.slide-hidden)');
            this.current = 0;
            this.transitioning = false;
            this.totalSlides = this.slides.length;

            this.buildUI();
            this.bindKeys();
            this.bindTouch();

            // Show initial slide
            this.current = this.getInitialIndex();
            this.slides.forEach(slide => slide.classList.remove('active'));
            this.slides[this.current].classList.add('active');
            this.updateUI();
            this.trackSlideView(this.current);

            // Init particles
            const canvas = document.getElementById('particle-canvas');
            if (canvas) new ParticleSystem(canvas);

            // Start mining animation if present
            this.initMiningAnimation();
        }

        getInitialIndex() {
            const match = window.location.hash.match(/slide-(\d+)/i);
            if (!match) return 0;

            const index = parseInt(match[1], 10) - 1;
            if (Number.isNaN(index)) return 0;
            return Math.max(0, Math.min(index, this.totalSlides - 1));
        }

        buildUI() {
            // Progress bar
            this.progressFill = $('.progress-fill');

            // Slide counter
            this.counterCurrent = $('.slide-counter .current-num');
            this.counterTotal = $('.slide-counter .total-num');
            if (this.counterTotal) this.counterTotal.textContent = this.totalSlides;

            // Nav arrows
            this.prevBtn = $('.nav-arrow.prev');
            this.nextBtn = $('.nav-arrow.next');
            if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
            if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());

            // Dots
            this.dotsContainer = $('.slide-dots');
            this.dots = [];
            if (this.dotsContainer) {
                this.dotsContainer.innerHTML = '';
                this.slides.forEach((_, i) => {
                    const dot = document.createElement('button');
                    dot.className = 'slide-dot';
                    if (i === 0) dot.classList.add('active');
                    dot.addEventListener('click', () => this.goTo(i));
                    this.dotsContainer.appendChild(dot);
                    this.dots.push(dot);
                });
            }

            // Fullscreen
            const fsBtn = $('.fullscreen-btn');
            if (fsBtn) {
                fsBtn.addEventListener('click', () => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen();
                    } else {
                        document.exitFullscreen();
                    }
                });
            }
        }

        bindKeys() {
            document.addEventListener('keydown', (e) => {
                switch (e.key) {
                    case 'ArrowRight':
                    case 'ArrowDown':
                    case ' ':
                    case 'PageDown':
                        e.preventDefault();
                        this.next();
                        break;
                    case 'ArrowLeft':
                    case 'ArrowUp':
                    case 'PageUp':
                        e.preventDefault();
                        this.prev();
                        break;
                    case 'Home':
                        e.preventDefault();
                        this.goTo(0);
                        break;
                    case 'End':
                        e.preventDefault();
                        this.goTo(this.totalSlides - 1);
                        break;
                    case 'f':
                    case 'F':
                        if (!document.fullscreenElement) {
                            document.documentElement.requestFullscreen();
                        } else {
                            document.exitFullscreen();
                        }
                        break;
                }
            });
        }

        bindTouch() {
            let startX = 0;
            let startY = 0;

            document.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: true });

            document.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - startX;
                const dy = e.changedTouches[0].clientY - startY;

                // Require a strong horizontal swipe: >100px, mostly horizontal (3:1 ratio)
                if (Math.abs(dx) > 100 && Math.abs(dx) > Math.abs(dy) * 3) {
                    if (dx < 0) this.next();
                    else this.prev();
                }
            }, { passive: true });
        }

        next() {
            if (this.current < this.totalSlides - 1) {
                this.goTo(this.current + 1, 'forward');
            }
        }

        prev() {
            if (this.current > 0) {
                this.goTo(this.current - 1, 'backward');
            }
        }

        goTo(index, direction = 'forward') {
            if (index === this.current || this.transitioning) return;
            if (index < 0 || index >= this.totalSlides) return;

            this.transitioning = true;
            const oldSlide = this.slides[this.current];
            const newSlide = this.slides[index];

            // Reset animations on old bullets/cards
            this.resetAnimations(oldSlide);

            // Exit old slide
            oldSlide.classList.remove('active');
            oldSlide.classList.add(direction === 'forward' ? 'exit-left' : 'exit-right');

            // Set entry position for new slide
            newSlide.style.transform = direction === 'forward' ? 'translateX(60px)' : 'translateX(-60px)';
            newSlide.style.opacity = '0';

            requestAnimationFrame(() => {
                newSlide.style.transform = '';
                newSlide.style.opacity = '';
                newSlide.classList.add('active');

                setTimeout(() => {
                    oldSlide.classList.remove('exit-left', 'exit-right');
                    this.transitioning = false;
                }, 600);
            });

            this.current = index;
            this.updateUI();
            this.trackSlideView(index);

            // Trigger mining animation on the mining slide
            if (newSlide.querySelector('.mining-visual')) {
                this.startMiningDemo();
            }
        }

        trackSlideView(index) {
            if (!window.posthog) return;

            const slideNames = [
                'Hero',
                'InvestorReality',
                'Capabilities',
                'ProductCompose',
                'ProductFeed',
                'ProductTake',
                'PaperBook',
                'Traction',
                'Market',
                'MarketStages',
                'Monetization',
                'Competition',
                'Raise',
                'Team',
                'Close',
            ];
            const name = slideNames[index] || 'Slide ' + (index + 1);
            posthog.capture('slide_viewed', {
                slide_index: index + 1,
                slide_name: name,
                deck: 'SuperView Pitch Deck',
            });
        }

        resetAnimations(slide) {
            // Reset bullet animations
            $$('.slide-bullets li', slide).forEach(li => {
                li.style.animation = 'none';
                li.offsetHeight; // trigger reflow
                li.style.animation = '';
                li.style.opacity = '0';
                li.style.transform = 'translateX(-20px)';
            });

            // Reset card animations
            $$('.info-card', slide).forEach(card => {
                card.style.animation = 'none';
                card.offsetHeight;
                card.style.animation = '';
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px) scale(0.95)';
            });

            // Reset flow steps
            $$('.flow-step', slide).forEach(step => {
                step.style.animation = 'none';
                step.offsetHeight;
                step.style.animation = '';
                step.style.opacity = '0';
                step.style.transform = 'scale(0.8)';
            });

            $$('.flow-arrow', slide).forEach(arrow => {
                arrow.style.animation = 'none';
                arrow.offsetHeight;
                arrow.style.animation = '';
                arrow.style.opacity = '0';
            });

            // Reset block viz
            $$('.block-viz', slide).forEach(block => {
                block.style.animation = 'none';
                block.offsetHeight;
                block.style.animation = '';
                block.style.opacity = '0';
                block.style.transform = 'translateY(30px)';
            });

            $$('.chain-link', slide).forEach(link => {
                link.style.animation = 'none';
                link.offsetHeight;
                link.style.animation = '';
                link.style.opacity = '0';
            });

            // Reset stats
            $$('.stat-item', slide).forEach(stat => {
                stat.style.animation = 'none';
                stat.offsetHeight;
                stat.style.animation = '';
                stat.style.opacity = '0';
                stat.style.transform = 'translateY(15px)';
            });

            // Reset hash visual
            $$('.hash-visual', slide).forEach(hv => {
                hv.style.animation = 'none';
                hv.offsetHeight;
                hv.style.animation = '';
                hv.style.opacity = '0';
            });

            // Reset fade-up / scale-in elements
            $$('.anim-fade-up', slide).forEach(el => {
                el.style.animation = 'none';
                el.offsetHeight;
                el.style.animation = '';
                el.style.opacity = '0';
                el.style.transform = 'translateY(25px)';
            });

            $$('.anim-scale-in', slide).forEach(el => {
                el.style.animation = 'none';
                el.offsetHeight;
                el.style.animation = '';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.85)';
            });
        }

        updateUI() {
            // Progress bar
            const pct = ((this.current + 1) / this.totalSlides) * 100;
            if (this.progressFill) this.progressFill.style.width = pct + '%';

            // Counter
            if (this.counterCurrent) this.counterCurrent.textContent = this.current + 1;

            if (window.location.hash !== `#slide-${this.current + 1}`) {
                history.replaceState(null, '', `#slide-${this.current + 1}`);
            }

            // Dots
            this.dots.forEach((d, i) => d.classList.toggle('active', i === this.current));

            // Arrows
            if (this.prevBtn) this.prevBtn.disabled = this.current === 0;
            if (this.nextBtn) this.nextBtn.disabled = this.current === this.totalSlides - 1;
        }

        /* ── Mining Demo Animation ─────────────────────────────── */
        initMiningAnimation() {
            this.miningNonce = null;
            this.miningHash = null;
            this.miningStatus = null;
            this.miningTimer = null;
        }

        startMiningDemo() {
            const slide = this.slides[this.current];
            this.miningNonce = $('.nonce-counter', slide);
            this.miningHash = $('.hash-output', slide);
            this.miningStatus = $('.mining-status', slide);

            if (!this.miningNonce) return;
            if (this.miningTimer) clearInterval(this.miningTimer);

            let nonce = 0;
            const target = '0000';

            this.miningStatus.className = 'mining-status searching';
            this.miningStatus.textContent = '⛏ Searching for valid hash...';

            this.miningTimer = setInterval(() => {
                nonce++;
                this.miningNonce.textContent = 'Nonce: ' + nonce.toLocaleString();

                // Generate pseudo-random hash
                const hash = this.pseudoHash(nonce);
                const leading = hash.substring(0, 4);

                if (nonce > 40 + Math.floor(Math.random() * 30)) {
                    // Found!
                    const validHash = '0000' + hash.substring(4);
                    this.miningHash.innerHTML =
                        '<span class="leading-zeros">0000</span>' + validHash.substring(4);
                    this.miningNonce.textContent = 'Nonce: ' + nonce.toLocaleString();
                    this.miningStatus.className = 'mining-status found';
                    this.miningStatus.textContent = '✅ Valid block hash found! Block mined!';
                    clearInterval(this.miningTimer);
                    return;
                }

                this.miningHash.textContent = hash;
            }, 80);
        }

        pseudoHash(n) {
            const chars = '0123456789abcdef';
            let hash = '';
            let seed = n * 2654435761;
            for (let i = 0; i < 64; i++) {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                hash += chars[seed % 16];
            }
            return hash;
        }
    }

    /* ══════════════════════════════════════════════════════════════
       TYPE-WRITER EFFECT
       ══════════════════════════════════════════════════════════════ */
    class TypeWriter {
        constructor(element, text, speed = 30) {
            this.element = element;
            this.text = text;
            this.speed = speed;
            this.index = 0;
        }

        start() {
            this.element.textContent = '';
            this.type();
        }

        type() {
            if (this.index < this.text.length) {
                this.element.textContent += this.text.charAt(this.index);
                this.index++;
                setTimeout(() => this.type(), this.speed);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════
       COUNTER ANIMATION
       ══════════════════════════════════════════════════════════════ */
    function animateCounter(element, end, duration = 2000, prefix = '', suffix = '') {
        const start = 0;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.floor(start + (end - start) * eased);
            element.textContent = prefix + current.toLocaleString() + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    /* ── Observe stat items for counter animation ─────────────── */
    function initCounterAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.dataset.target, 10);
                    const prefix = el.dataset.prefix || '';
                    const suffix = el.dataset.suffix || '';
                    if (!isNaN(target)) {
                        animateCounter(el, target, 2000, prefix, suffix);
                    }
                    observer.unobserve(el);
                }
            });
        });

        $$('[data-counter]').forEach(el => observer.observe(el));
    }

    /* ══════════════════════════════════════════════════════════════
       INIT
       ══════════════════════════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', () => {
        new SlideEngine();
        initCounterAnimations();
    });

})();
