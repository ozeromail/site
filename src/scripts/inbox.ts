// The page behaves like the app's inbox: a letter scrolled to its end counts as read, swipe or press Done
// to clear it with Undo in a toast, a bulk "Swipe N letters" strip, and still water at Inbox Zero.

import type en from '../i18n/en.json';
import { plural } from '../i18n/format';
import { Lake } from './lake';
import { clamp, still } from './motion';

type Strings = typeof en.client & { lang: string; word: string; done: string };

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
function resize(box: HTMLElement, change: () => void, done?: () => void, step?: (k: number) => void) {
  // A resize caught midway starts from where it is.
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
  // `step` gets how far along it is, 0 to 1.
  resizing.set(box, spring(h0, h1, 0, (h) => {
    box.style.height = `${h}px`;
    step?.((h - h0) / (h1 - h0));
  }, end));
}

interface Swipe {
  /** Whether the last press became a drag, so its click can be ignored. */
  moved: () => boolean;
  /** Clears as a swipe would, for a button or a key. */
  fly: () => void;
  /** Comes back from the left, the way it left. */
  back: () => void;
}

/* A left swipe, as on a row in the app: the finger drives 1:1, the bead fills past the threshold,
   and the release velocity decides: a flick clears even a short drag, a finger that stopped cancels.
   A sheet in motion can be caught. Only clearly horizontal gestures count, so scrolling still works.
   `onSwipe` gets a function that puts the sheet back once its box has changed. */
function swipeable(box: HTMLElement, sheet: HTMLElement, onSwipe: (reset: () => void) => void, canStart: (e: PointerEvent) => boolean, by?: HTMLElement): Swipe {
  const under = box.querySelector<HTMLElement>(':scope > .under');
  let x0: number | null = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let v = 0;
  let lastX = 0;
  let lastT = 0;
  let axis: 'x' | 'y' | null = null;
  let moved = false;
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
    moved = false;
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
      moved = true;
      axis = mx < 0 && Math.abs(mx) > 1.5 * Math.abs(my) ? 'x' : 'y';
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
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  return {
    moved: () => moved,
    fly: () => {
      // The bead shows by the button that was pressed.
      if (by) box.style.setProperty('--by', `${by.offsetTop + by.offsetHeight / 2}px`);
      fly(dx, -900);
    },
    back: () => {
      stop();
      place(-box.offsetWidth);
      stop = spring(dx, 0, 0, place);
    },
  };
}

export function start() {
  const S: Strings = JSON.parse($('strings').textContent ?? '{}');

  /* Every visit is a fresh inbox, so it opens at the top: no restored scroll, no #anchor kept in the address. */
  history.scrollRestoration = 'manual';
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
    scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    const target = a && document.getElementById(a.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    glide(target, 'start');
    // Move focus along, so Tab continues from the target.
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  });

  /* Focus follows an action only when it came from a keyboard or a screen reader; a finger stays where it is. */
  let pointer = false;
  addEventListener('pointerdown', () => (pointer = true), true);
  addEventListener('keydown', () => (pointer = false), true);
  const follow = (to: HTMLElement) => pointer || to.focus({ preventScroll: true });

  /* One live region speaks for the page, so each action is announced once. */
  const live = $('live');
  const say = (text: string) => {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  };

  /* Toast with Undo, for five seconds as in the app. It waits while focus or a real pointer is on it;
     touch screens keep :hover after a tap. */
  const toast = $('toast');
  const undoBtn = $<HTMLButtonElement>('toastUndo');
  const hoverable = matchMedia('(hover: hover)');
  let timer: number | undefined;
  let undo: (() => void) | null = null;
  function hideToast() {
    clearInterval(timer);
    toast.classList.add('gone');
    toast.inert = true;
    undo = null;
  }
  function showToast(undoFn: () => void) {
    clearInterval(timer);
    undo = undoFn;
    toast.hidden = false;
    toast.inert = false;
    // A frame later, so even the first one rises.
    requestAnimationFrame(() => toast.classList.remove('gone'));
    let n = 5;
    timer = window.setInterval(() => {
      const held = toast.matches(':focus-within') || (hoverable.matches && toast.matches(':hover'));
      if (!held && --n <= 0) hideToast();
    }, 1000);
  }
  undoBtn.addEventListener('click', () => {
    const f = undo;
    hideToast();
    f?.();
  });

  // While the page moves by itself, letters it passes are not read. Returns the release.
  let holds = 0;
  const hold = () => {
    holds++;
    return () => --holds || readSoon();
  };
  // CSS turns smooth scrolling off for reduced motion.
  function glide(target: HTMLElement, block: ScrollLogicalPosition, then?: () => void) {
    const release = hold();
    const y0 = scrollY;
    target.scrollIntoView({ block });
    const ac = new AbortController();
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const over = () => {
      if (ac.signal.aborted) return;
      ac.abort();
      clearTimeout(quiet);
      release();
      then?.();
    };
    if ('onscrollend' in window) {
      addEventListener('scrollend', over, { signal: ac.signal });
      // No scroll at all.
      quiet = setTimeout(() => scrollY === y0 && over(), 150);
    } else {
      // Safari: over once the page has been still for a moment.
      quiet = setTimeout(over, 200);
      addEventListener('scroll', () => {
        clearTimeout(quiet);
        quiet = setTimeout(over, 150);
      }, { passive: true, signal: ac.signal });
    }
  }

  /* The screen across the middle of the view is "on": E clears it first. */
  const lit = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('on', e.isIntersecting);
  }, { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('.screen').forEach((s) => lit.observe(s));

  /* Letters */
  const mails = [...document.querySelectorAll<HTMLElement>('.mail')];
  const isOpen = (m: HTMLElement | null | undefined): m is HTMLElement => !!m && !m.classList.contains('is-done');
  const isUnread = (m: HTMLElement) => isOpen(m) && !m.classList.contains('is-read');
  const el = Object.fromEntries(
    ['count', 'unreadSr', 'left', 'bar', 'track', 'ozw', 'ozn', 'calm', 'bulk', 'bulkText', 'bulkBtn', 'bringBack', 'finale'].map((id) => [id, $(id)]),
  ) as Record<string, HTMLElement>;
  const nav = document.querySelector<HTMLElement>('.bbar')!;
  let unread = mails.length;
  let wasLeft = mails.length;
  const leftText = () => (unread ? plural(S.lang, S.left, unread) : mails.some(isOpen) ? S.allRead : S.allClear);

  // The finale's water: its horizon lies 90px down the canvas, under the word.
  const lake = new Lake($<HTMLCanvasElement>('lake'), 90);
  lake.onOpen = () => {
    el.calm.classList.remove('wait-drop');
    el.finale.classList.add('open');
  };
  const lakes = [lake];
  // The URL bar coming and going resizes the page too, so redraw once it settles.
  let redrawing = 0;
  addEventListener('resize', () => {
    clearTimeout(redrawing);
    redrawing = window.setTimeout(() => lakes.forEach((l) => l.redraw()), 120);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => lakes.forEach((l) => l.redraw()));

  // The counters show unread letters; Inbox Zero needs every letter Done.
  // `land` jumps to the finale at once, for the bulk action.
  function upd(land = false) {
    const left = mails.filter(isOpen).length;
    unread = mails.filter(isUnread).length;
    el.count.textContent = String(unread);
    el.unreadSr.textContent = ' ' + plural(S.lang, S.unread, unread);
    el.left.textContent = leftText();
    const read = mails.length - unread;
    el.bar.style.width = (read / mails.length) * 100 + '%';
    el.track.setAttribute('aria-valuenow', String(read));
    el.ozw.textContent = left ? S.word : S.wordDone;
    el.ozn.textContent = unread ? String(unread) : '';
    el.bulk.hidden = !left;
    el.bulkText.textContent = plural(S.lang, S.bulk, left);
    el.calm.hidden = el.bringBack.hidden = !!left;
    el.finale.classList.toggle('clear', !left);
    // Collapsing letters moves others into view.
    readSoon();
    if (left === wasLeft) return;
    wasLeft = left;
    if (left) {
      lake.hide();
      el.finale.classList.remove('open');
      return;
    }
    // Inbox Zero: glide to the word; a drop falls from it and opens the water, then the words come.
    el.calm.classList.add('wait-drop');
    el.calm.focus({ preventScroll: true });
    if (land) {
      // In the same frame: otherwise Safari clamps to the page bottom first and then glides back up.
      el.finale.scrollIntoView({ block: 'center', behavior: 'instant' });
      lake.open();
    } else glide(el.finale, 'center', () => lake.open());
  }

  // Done implies read; reset also forgets reading, for "Bring the letters back".
  function collapse(m: HTMLElement, done: boolean, reset = false) {
    m.classList.toggle('is-done', done);
    if (done) m.classList.add('is-read');
    if (reset) m.classList.remove('is-read');
  }
  const doneBtn = (m: HTMLElement) => m.querySelector<HTMLElement>('.act.done')!;
  const swipes = new Map<HTMLElement, Swipe>();
  // For a button or a key. The Undo for the letter before must not undo this one.
  const clear = (m: HTMLElement) => {
    hideToast();
    swipes.get(m)!.fly();
  };

  // Reopens every letter at once, unread again, and puts the reader at the first one, which comes back from the left.
  function restoreAll() {
    mails.forEach((m) => collapse(m, false, true));
    upd();
    mails[0].scrollIntoView({ block: 'start', behavior: 'instant' });
    swipes.get(mails[0])!.back();
    doneBtn(mails[0]).focus({ preventScroll: true });
    say(leftText());
  }
  // The row comes into view first, if it is out of it, and then opens where the reader looks.
  function reopen(m: HTMLElement) {
    hideToast();
    const open = () => {
      resize(m, () => {
        collapse(m, false);
        swipes.get(m)!.back();
        upd();
      });
      follow(doneBtn(m));
    };
    const r = m.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.6) glide(m, 'start', open);
    else open();
    say(leftText());
  }
  // Called once the letter has flown out: it closes into a row and the letters below move up.
  function done(m: HTMLElement, reset: () => void) {
    if (!isOpen(m)) return reset();
    const row = m.querySelector<HTMLElement>('.row')!;
    // A letter read from its end closes towards the top of the view, so the next one follows right under its row.
    const top = m.getBoundingClientRect().top;
    const y0 = scrollY;
    const root = document.documentElement;
    const release = top < 0 ? hold() : null;
    if (release) root.style.overflowAnchor = 'none';
    resize(m, () => {
      collapse(m, true);
      reset();
      upd();
    }, () => {
      if (release) {
        root.style.overflowAnchor = '';
        release();
      }
      // A keyboard user follows focus, so the row comes into view for them.
      if (row.matches(':focus-visible')) row.scrollIntoView({ block: 'nearest' });
    }, top < 0 ? (k) => scrollTo(0, y0 + top * k) : undefined);
    // The last letter has no Undo: "Bring the letters back" takes its place.
    if (mails.some(isOpen)) {
      follow(row);
      say(`${S.done}. ${leftText()}. ${S.undoHint}`);
      showToast(() => reopen(m));
    } else {
      say(`${S.done}. ${leftText()}`);
      hideToast();
    }
  }

  // Touch swipes anywhere on the letter; a mouse drags by the header, the subject or the margins, so text stays selectable.
  for (const m of mails) {
    const swipe = swipeable(m, m.querySelector<HTMLElement>('.sheet')!, (reset) => done(m, reset), (e) => {
      const target = e.target as Element;
      if (target.closest('a,button,label,input,.demo')) return false;
      return e.pointerType !== 'mouse' || !target.closest('.sheet > p,.plan');
    }, doneBtn(m));
    swipes.set(m, swipe);
    doneBtn(m).addEventListener('click', () => clear(m));
    m.querySelector('.row')!.addEventListener('click', () => reopen(m));
  }

  /* For visitors who scrolled past without clearing: one bulk action, as in the app. Swipe it or just press it.
     All letters close at once and the page lands on the finale; "Bring the letters back" is the undo. */
  function doneAll(reset?: () => void) {
    const open = mails.filter(isOpen);
    reset?.();
    if (!open.length) return;
    hideToast();
    open.forEach((m) => collapse(m, true));
    upd(true);
    say(S.allDone);
  }
  const bulk = swipeable(el.bulk, el.bulkBtn, doneAll, () => true);
  // A keyboard click (detail 0) has no press of its own, so an old swipe must not cancel it.
  el.bulkBtn.addEventListener('click', (e) => {
    if (!e.detail || !bulk.moved()) bulk.fly();
  });

  el.bringBack.addEventListener('click', () => {
    hideToast();
    restoreAll();
  });

  /* Reading: a letter whose end has passed above the bottom bar counts as read. */
  let frame = 0;
  const read = () => {
    frame = 0;
    if (!unread || holds) return;
    const edge = innerHeight - nav.offsetHeight;
    // Measure all first, then write, so layout is read once.
    const seen = mails.filter(isUnread).filter((m) => m.querySelector('.sheet')!.getBoundingClientRect().bottom <= edge);
    for (const m of seen) m.classList.add('is-read');
    if (seen.length) upd();
  };
  // Also after load and resize: short letters may be read without any scrolling.
  function readSoon() {
    frame ||= requestAnimationFrame(read);
  }
  addEventListener('scroll', readSoon, { passive: true });
  addEventListener('resize', readSoon);
  readSoon();

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
        resize(zero, () => zero.classList.add('clear', 'falling'));
        zeroLake.open();
      });
    };
    for (const r of rows) {
      const swipe = swipeable(r, r.querySelector<HTMLElement>('.di')!, (reset) => gone(r, reset), () => !r.inert);
      // Keyboards clear a row with its button, which shows only when focused.
      r.querySelector('.rowdone')!.addEventListener('click', () => {
        const next = left().find((x) => x !== r);
        if (next) next.querySelector<HTMLElement>('.rowdone')!.focus();
        else toDeb = true;
        r.inert = true;
        swipe.fly();
      });
    }
    deb.addEventListener('click', () => {
      resize(zero, () => {
        rows.forEach((r) => {
          r.inert = false;
          r.classList.remove('shut');
        });
        zero.classList.remove('clear', 'falling');
      });
      count.textContent = String(rows.length);
      zeroLake.hide();
      follow(rows[0].querySelector<HTMLElement>('.rowdone')!);
    });
  }

  /* Segmented controls: the thumb slides to the choice, and a demo grows or shrinks to what it now shows. */
  for (const seg of document.querySelectorAll<HTMLElement>('.tabs,.seg')) {
    const inputs = [...seg.querySelectorAll('input')];
    const box = seg.closest<HTMLElement>('.demo');
    seg.style.setProperty('--n', String(inputs.length));
    // Browsers may restore a choice on reload without a change event.
    const sync = () => seg.style.setProperty('--i', String(Math.max(0, inputs.findIndex((i) => i.checked))));
    sync();
    seg.addEventListener('change', () => (box ? resize(box, sync) : sync()));
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

  /* Keyboard: E marks the focused letter, or the first open one in view, as Done; U or Z undoes. */
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    // Only where a letter or the toast has focus, or nothing does, so a key pressed elsewhere does nothing.
    const at = document.activeElement;
    if (at && at !== document.body && !at.closest('.mail,.toast,.finale')) return;
    if ((e.target as Element).closest('input,textarea')) return;
    // By physical key, so the shortcuts work on any keyboard layout.
    const k = e.code;
    if (k === 'KeyE') {
      // A letter already flying is gone, so a quick second E takes the next one.
      const can = (x: HTMLElement | null | undefined): x is HTMLElement => isOpen(x) && !x.classList.contains('flying');
      const focused = at?.closest<HTMLElement>('.mail');
      const m = can(focused) ? focused : mails.find((x) => can(x) && x.classList.contains('on'));
      if (m) {
        e.preventDefault();
        clear(m);
      }
    } else if ((k === 'KeyU' || k === 'KeyZ') && undo) {
      e.preventDefault();
      undoBtn.click();
    }
  });

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
