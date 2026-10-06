(function () {
  const MQ = window.matchMedia('(max-width: 1100px)');

  function alignMark() {
    const slide = document.querySelector('.investor-survey');
    const cards = slide && slide.querySelector('.problem-cards');
    const mark = slide && slide.querySelector('.problem-mark');
    if (!slide || !cards || !mark) return;

    if (MQ.matches) {
      mark.style.paddingBottom = '';
      return;
    }

    // Clear first so measurement is against the figure's true bottom edge.
    mark.style.paddingBottom = '0px';
    const markBottom = mark.getBoundingClientRect().bottom;
    const cardsBottom = cards.getBoundingClientRect().bottom;
    // Hang the floor glow a bit past the cards so the "?" ball sits on the card baseline.
    const opticalHang = Math.round(Math.min(48, Math.max(28, window.innerHeight * 0.04)));
    const gap = Math.max(0, Math.round(markBottom - cardsBottom) - opticalHang);
    mark.style.paddingBottom = gap + 'px';
  }

  let scheduled = 0;
  function schedule() {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      alignMark();
    });
  }

  function onSlideChange() {
    if (document.querySelector('.slide.active.investor-survey')) schedule();
  }

  document.addEventListener('DOMContentLoaded', () => {
    schedule();
    window.addEventListener('resize', schedule);
    MQ.addEventListener('change', schedule);

    const img = document.querySelector('.problem-mark img');
    if (img) {
      if (img.complete) schedule();
      else img.addEventListener('load', schedule, { once: true });
    }

    document.addEventListener('slidechange', onSlideChange);
    // Fallback: observe active class changes used by the deck.
    const deck = document.querySelector('.deck') || document.body;
    const mo = new MutationObserver(onSlideChange);
    mo.observe(deck, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
})();
