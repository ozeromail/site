// The page reads as plain text; small live pieces of the app move only when touched,
// and the still water of Inbox Zero closes the page.

import { Lake } from './lake';
import { clamp, still } from './motion';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* One physics, as in the app: a critically damped spring (stiffness 700) that starts from the release velocity,
   so a fling carries on and a motion can be caught midway without a jump. It ends early once `until` holds.
   Returns a function that stops it. */
function spring(from: number, to: number, v: number, apply: (x: number) => void, done?: () => void, until?: (x: number) => boolean) {
  if (still.matches) {
    apply(to);
    done?.();
    return () => {};
  }
  const k = 700;
  let x = from;
  let last = performance.now();
  let id = requestAnimationFrame(function tick(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const s = Math.min(dt, 1 / 240);
      v += (-k * (x - to) - 2 * Math.sqrt(k) * v) * s;
      x += v * s;
      dt -= s;
    }
    const over = until?.(x);
    if (over || (Math.abs(x - to) < 0.5 && Math.abs(v) < 10)) {
      apply(over ? x : to);
      done?.();
      return;
    }
    apply(x);
    id = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(id);
}

/* Springs an element's height from what it was before `change` to what it is after, so what is below
   moves up or down instead of jumping. */
const resizing = new WeakMap<HTMLElement, () => void>();
function resize(box: HTMLElement, change: () => void, done?: () => void) {
  // A resize caught midway starts from where it is, and the one it replaces still finishes its work.
  const h0 = box.offsetHeight;
  resizing.get(box)?.();
  box.style.height = '';
  change();
  const h1 = box.offsetHeight;
  const end = () => {
    resizing.delete(box);
    box.style.height = '';
    done?.();
  };
  if (h0 === h1) return end();
  box.style.height = `${h0}px`;
  const stop = spring(h0, h1, 0, (h) => (box.style.height = `${h}px`), end);
  resizing.set(box, () => {
    stop();
    end();
  });
}


/* A left swipe, as on a row in the app: the finger drives 1:1, the bead fills past the threshold,
   and the release velocity decides: a flick clears even a short drag, a finger that stopped cancels.
   A sheet in motion can be caught. Only clearly horizontal gestures count, so scrolling still works.
   `onSwipe` gets a function that puts the sheet back once its box has changed. */
function swipeable(box: HTMLElement, sheet: HTMLElement, onSwipe: (reset: () => void) => void, canStart: (e: PointerEvent) => boolean) {
  const under = box.querySelector<HTMLElement>(':scope > .under');
  let x0: number | null = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let v = 0;
  let lastX = 0;
  let lastT = 0;
  let axis: 'x' | 'y' | null = null;
  let stop = () => {};
  const threshold = () => Math.min(box.offsetWidth * 0.35, 160);
  const place = (x: number) => {
    dx = x;
    sheet.style.transform = x ? `translateX(${x}px)` : '';
    under?.style.setProperty('--seen', String(clamp((-x - 14) / 36)));
  };
  const settle = (speed = 0) => {
    box.classList.remove('armed');
    if (dx) stop = spring(dx, 0, speed, place);
  };
  const reset = () => {
    stop();
    box.classList.remove('flying', 'armed');
    place(0);
  };
  const fly = (from: number, speed: number) => {
    if (box.classList.contains('flying')) return;
    stop();
    const width = box.offsetWidth;
    box.classList.add('flying', 'armed');
    // Aimed past the edge and done once out of sight, so it never lingers there.
    stop = spring(from, -width * 1.5, Math.min(speed, -600), place, () => onSwipe(reset), (x) => x <= -width);
  };
  sheet.addEventListener('pointerdown', (e) => {
    // One finger at a time: a second pointer must not reset the gesture in progress.
    if (x0 !== null) return;
    if (e.button || !canStart(e)) return;
    // iOS takes a swipe from the screen edge for Forward.
    if (e.pointerType === 'touch' && e.clientX > innerWidth - 20) return;
    stop();
    box.classList.remove('flying');
    startX = lastX = e.clientX;
    startY = e.clientY;
    x0 = e.clientX - dx;
    lastT = e.timeStamp;
    v = 0;
    axis = null;
    // The bead waits beside the finger, not in the middle of a tall letter.
    box.style.setProperty('--by', `${Math.max(40, e.clientY - sheet.getBoundingClientRect().top)}px`);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    // The button was released outside before the pointer was captured.
    if (!e.buttons) {
      x0 = null;
      return settle();
    }
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (!axis && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
      axis = mx < 0 && Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (axis === 'y') {
        x0 = null;
        return settle();
      }
      // Start from where the sheet is, so it does not jump by the slop.
      x0 = e.clientX - dx;
      sheet.setPointerCapture(e.pointerId);
      box.classList.add('dragging');
    }
    if (axis !== 'x') return;
    const dt = Math.max(1, e.timeStamp - lastT);
    v = v * 0.6 + ((e.clientX - lastX) / dt) * 1000 * 0.4;
    lastX = e.clientX;
    lastT = e.timeStamp;
    const x = e.clientX - x0;
    // Past the start the finger meets resistance, as at the edge of a list.
    place(x < 0 ? x : x * 0.2);
    box.classList.toggle('armed', -dx > threshold());
  });
  const end = (e: PointerEvent) => {
    if (x0 === null) return;
    x0 = null;
    box.classList.remove('dragging');
    if (axis !== 'x') return settle();
    if (e.timeStamp - lastT > 60) v = 0;
    // Where the motion would come to rest: the release velocity carries it on.
    const projected = dx + v * 0.2;
    if (v <= 300 && (-dx > threshold() || projected < -box.offsetWidth * 0.5 || v < -900)) fly(dx, v);
    else settle(v);
  };
  /* touch-action lets the page pan vertically, so a swipe that drifts up or down would scroll it too.
     Once a touch moves more sideways than up or down, the page stays put; only the first moves count, as browsers decide on those. */
  let tx = 0;
  let ty = 0;
  let sideways: boolean | null = null;
  sheet.addEventListener('touchstart', (e) => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
    sideways = null;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (sideways === null) {
      const mx = e.touches[0].clientX - tx;
      const my = e.touches[0].clientY - ty;
      if (Math.abs(mx) < 3 && Math.abs(my) < 3) return;
      sideways = mx < 0 && Math.abs(mx) > Math.abs(my);
    }
    if (sideways && e.cancelable) e.preventDefault();
  }, { passive: false });
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  // Clears as a swipe would, for a button.
  return () => fly(dx, -900);
}

export function start() {
  /* Every visit opens at the top: no restored scroll, no #anchor kept in the address. */
  history.scrollRestoration = 'manual';
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
    scrollTo(0, 0);
  }
  // CSS makes in-page links glide; focus moves along, so Tab continues from the target.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    const target = a && document.getElementById(a.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ block: 'start' });
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  });

  /* Focus follows an action only when it came from a keyboard or a screen reader; a finger stays where it is. */
  let pointer = false;
  addEventListener('pointerdown', () => (pointer = true), true);
  addEventListener('keydown', () => (pointer = false), true);
  const follow = (to: HTMLElement) => pointer || to.focus({ preventScroll: true });

  // The URL bar coming and going resizes the page too, so redraw once it settles.
  const lakes: Lake[] = [];
  let redrawing = 0;
  addEventListener('resize', () => {
    clearTimeout(redrawing);
    redrawing = window.setTimeout(() => lakes.forEach((l) => l.redraw()), 120);
  });

  /* The finale: arriving at it is the cause, so a drop falls from the word once and opens the water, then the words come. */
  const finale = $('finale');
  const lake = new Lake($<HTMLCanvasElement>('lake'), 90);
  lakes.push(lake);
  lake.onOpen = () => finale.classList.add('open');
  new IntersectionObserver((entries, seen) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    seen.disconnect();
    lake.open();
  }, { threshold: 0.5 }).observe(finale);

  /* The bottom button leads to the last letter, so it steps aside once that letter is in view. */
  const bar = document.querySelector<HTMLElement>('.bbar');
  const wait = document.getElementById('wait');
  if (bar && wait) new IntersectionObserver(([e]) => bar.classList.toggle('away', e.isIntersecting)).observe(wait);

  /* Demos move only when touched. Inbox Zero: its rows swipe away like letters, and the last one leaves still water. */
  const zero = document.querySelector<HTMLElement>('.demo.zero');
  if (zero) {
    const rows = [...zero.querySelectorAll<HTMLElement>('.swipe')];
    const count = zero.querySelector('.dc')!;
    const zeroLake = new Lake(zero.querySelector('canvas')!, 72, 120);
    lakes.push(zeroLake);
    zeroLake.onOpen = () => zero.classList.remove('falling');
    const deb = zero.querySelector<HTMLElement>('.deb')!;
    // A row on its way out is already gone for focus.
    const left = () => rows.filter((x) => !x.inert);
    let toDeb = false;
    const gone = (r: HTMLElement, reset: () => void) => {
      r.inert = true;
      const n = left().length;
      count.textContent = n ? String(n) : '';
      // The rows below close the gap; once the last one has closed, the water opens.
      // A keyboard user gets Back at once, hidden until the water settles, so focus never drops.
      if (!n && toDeb) {
        zero.classList.add('clear', 'falling');
        deb.focus({ preventScroll: true });
        toDeb = false;
      }
      resize(r, () => r.classList.add('shut'), () => {
        reset();
        if (n || left().length) return;
        zero.classList.add('clear', 'falling');
        zeroLake.open();
      });
    };
    for (const r of rows) {
      const fly = swipeable(r, r.querySelector<HTMLElement>('.di')!, (reset) => gone(r, reset), () => !r.inert);
      // Keyboards clear a row with its button, which shows only when focused.
      r.querySelector('.rowdone')!.addEventListener('click', () => {
        const next = left().find((x) => x !== r);
        if (next) next.querySelector<HTMLElement>('.rowdone')!.focus();
        else toDeb = true;
        r.inert = true;
        fly();
      });
    }
    deb.addEventListener('click', () => {
      rows.forEach((r) => {
        r.inert = false;
        r.classList.remove('shut');
      });
      zero.classList.remove('clear', 'falling');
      count.textContent = String(rows.length);
      zeroLake.hide();
      follow(rows[0].querySelector<HTMLElement>('.rowdone')!);
    });
  }

  /* Segmented controls: the thumb slides to the choice. */
  for (const seg of document.querySelectorAll<HTMLElement>('.tabs,.seg')) {
    const inputs = [...seg.querySelectorAll('input')];
    seg.style.setProperty('--n', String(inputs.length));
    // Browsers may restore a choice on reload without a change event.
    const sync = () => seg.style.setProperty('--i', String(Math.max(0, inputs.findIndex((i) => i.checked))));
    sync();
    seg.addEventListener('change', sync);
  }

  /* The invitation: once answered, its answer and Change take the buttons' place, so focus moves along. */
  const work = document.querySelector<HTMLElement>('.demo.work');
  if (work) {
    const result = work.querySelector<HTMLElement>('.rtext')!;
    for (const b of work.querySelectorAll<HTMLElement>('.answers button')) {
      b.addEventListener('click', () => {
        result.textContent = b.dataset.result!;
        work.dataset.answer = b.dataset.answer;
        work.classList.add('answered');
        work.querySelector<HTMLElement>('.chg')!.focus();
      });
    }
    work.querySelector('.chg')!.addEventListener('click', () => {
      result.textContent = '';
      work.classList.remove('answered');
      work.querySelector<HTMLElement>('.answers button')!.focus();
    });
  }

  /* Compose: Send opens the visitor's mail app with a note to the author; the phone goes into the text. */
  const send = document.getElementById('send') as HTMLAnchorElement | null;
  if (send) {
    const compose = send.closest('.compose')!;
    // Browsers may restore the radio choice on reload without a change event.
    const sync = () => (send.href = send.dataset[compose.querySelector<HTMLInputElement>('input:checked')!.value]!);
    compose.addEventListener('change', sync);
    sync();
  }
}
