// The page behaves like the app's inbox: a letter scrolled to its end counts as read, swipe or press Done
// to clear it with Undo in a toast, a bulk "Swipe N letters" strip, and a quiet "ozero" moment at Inbox Zero.

import type en from '../i18n/en.json';
import { fill, plural } from '../i18n/format';

type Strings = typeof en.client & { lang: string; word: string; done: string };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function start() {
  const S: Strings = JSON.parse($('strings').textContent ?? '{}');

  /* One live region speaks for the page, so each action is announced once. */
  const live = $('live');
  const say = (text: string) => {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  };

  /* Toast with Undo. It waits while focus or a real pointer is on it; touch screens keep :hover after a tap. */
  const toast = $('toast');
  const undoBtn = $<HTMLButtonElement>('toastUndo');
  const hoverable = matchMedia('(hover: hover)');
  let timer: number | undefined;
  let undo: (() => void) | null = null;
  function hideToast() {
    clearInterval(timer);
    toast.hidden = true;
    undo = null;
  }
  function showToast(undoFn: () => void) {
    hideToast();
    undo = undoFn;
    toast.hidden = false;
    let n = 8;
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

  /* Changes to the list morph instead of jumping: letters slide into their new places. Scrolling waits for the morph. */
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let settled: Promise<unknown> = Promise.resolve();
  function morph(change: () => void) {
    if (!document.startViewTransition || still.matches) return change();
    settled = document.startViewTransition(change).finished;
  }
  const glide = (target: HTMLElement, block: ScrollLogicalPosition) =>
    void settled.then(() => target.scrollIntoView({ block, behavior: still.matches ? 'instant' : 'smooth' }));

  /* Letters */
  const mails = [...document.querySelectorAll<HTMLElement>('.mail')];
  mails.forEach((m, i) => (m.style.viewTransitionName = `mail-${i}`));
  const isOpen = (m: HTMLElement | null | undefined): m is HTMLElement => !!m && !m.classList.contains('is-done');
  const isUnread = (m: HTMLElement) => isOpen(m) && !m.classList.contains('is-read');
  const el = Object.fromEntries(
    ['count', 'unreadSr', 'left', 'bar', 'track', 'ozw', 'ozn', 'lake', 'calm', 'bulk', 'bulkText', 'bulkBtn', 'bringBack'].map((id) => [id, $(id)]),
  ) as Record<string, HTMLElement>;
  const oz = document.querySelector<HTMLElement>('.oz')!;
  const nav = document.querySelector<HTMLElement>('.bbar')!;
  let unread = mails.length;
  let wasLeft = mails.length;
  const leftText = () => (unread ? fill(S.left, { n: unread }) : mails.some(isOpen) ? S.allRead : S.allClear);

  function centreLake() {
    const r = oz.getBoundingClientRect();
    // Page coordinates: the lake covers the whole page, so the rings stay on the word while it scrolls.
    el.lake.style.setProperty('--cx', r.left + scrollX + r.width / 2 + 'px');
    el.lake.style.setProperty('--cy', r.top + scrollY + r.height / 2 + 'px');
  }
  addEventListener('resize', () => {
    if (el.lake.classList.contains('go')) centreLake();
  });

  // The counters show unread letters; Inbox Zero needs every letter Done.
  function upd() {
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
    oz.classList.toggle('clear', !left);
    el.calm.hidden = el.bringBack.hidden = !!left;
    // Collapsing letters moves others into view.
    readSoon();
    if (left === wasLeft) return;
    wasLeft = left;
    if (left) {
      el.lake.classList.remove('go');
      return;
    }
    // Inbox Zero: glide to the word and let the water move.
    glide(oz, 'center');
    el.calm.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      centreLake();
      el.lake.classList.remove('go');
      void el.lake.offsetWidth;
      el.lake.classList.add('go');
    });
  }

  // Done implies read; reset also forgets reading, for "Bring the letters back".
  function collapse(m: HTMLElement, done: boolean, reset = false) {
    m.classList.toggle('is-done', done);
    if (done) m.classList.add('is-read');
    if (reset) m.classList.remove('is-read');
  }
  // Reopens a group of letters and brings the reader back to the first one.
  function restore(list: HTMLElement[], reset = false) {
    morph(() => {
      for (const m of list) collapse(m, false, reset);
      upd();
    });
    glide(list[0], 'start');
    doneBtn(list[0]).focus({ preventScroll: true });
  }
  const doneBtn = (m: HTMLElement) => m.querySelector<HTMLElement>('.act.done')!;

  function reopen(m: HTMLElement) {
    hideToast();
    morph(() => {
      collapse(m, false);
      upd();
    });
    doneBtn(m).focus({ preventScroll: true });
  }
  function done(m: HTMLElement) {
    morph(() => {
      collapse(m, true);
      upd();
    });
    if (mails.some(isOpen)) m.querySelector<HTMLElement>('.row')!.focus({ preventScroll: true });
    say(`${S.done}. ${leftText()}`);
    showToast(() => reopen(m));
  }

  /* A left swipe past 45% of the width fires onSwipe. Only clearly horizontal gestures count, so scrolling still works. */
  function swipeable(box: HTMLElement, sheet: HTMLElement, onSwipe: () => void, canStart: (e: PointerEvent) => boolean) {
    let x0: number | null = null;
    let y0 = 0;
    let dx = 0;
    let axis: 'x' | 'y' | null = null;
    let moved = false;
    sheet.addEventListener('pointerdown', (e) => {
      // One finger at a time: a second pointer must not reset the gesture in progress.
      if (x0 !== null) return;
      moved = false;
      if (e.button || !canStart(e)) return;
      x0 = e.clientX;
      y0 = e.clientY;
      dx = 0;
      axis = null;
    });
    sheet.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      // The button was released outside before the pointer was captured.
      if (!e.buttons) {
        x0 = null;
        return;
      }
      const mx = e.clientX - x0;
      const my = e.clientY - y0;
      if (!axis && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
        moved = true;
        axis = mx < 0 && Math.abs(mx) > 1.5 * Math.abs(my) ? 'x' : 'y';
        if (axis === 'y') {
          x0 = null;
          return;
        }
        sheet.setPointerCapture(e.pointerId);
        box.classList.add('dragging');
      }
      if (axis === 'x') {
        dx = Math.min(0, mx);
        sheet.style.transform = `translateX(${dx}px)`;
      }
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      box.classList.remove('dragging');
      if (axis === 'x' && dx < -box.offsetWidth * 0.45) {
        sheet.style.transform = 'translateX(-110%)';
        setTimeout(() => {
          onSwipe();
          sheet.style.transform = '';
        }, 200);
      } else {
        sheet.style.transform = '';
      }
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
    // Whether the last press became a drag, so its click can be ignored.
    return () => moved;
  }

  // Touch swipes anywhere on the letter; a mouse drags by the header, so text stays selectable.
  for (const m of mails) {
    doneBtn(m).addEventListener('click', () => done(m));
    m.querySelector('.row')!.addEventListener('click', () => reopen(m));
    swipeable(m, m.querySelector<HTMLElement>('.sheet')!, () => done(m), (e) => {
      const target = e.target as Element;
      return !target.closest('a,button') && (e.pointerType !== 'mouse' || !!target.closest('.mhead,.subj'));
    });
  }

  /* For visitors who scrolled past without clearing: one bulk action, as in the app. Swipe it or just press it. */
  function doneAll() {
    const open = mails.filter(isOpen);
    if (!open.length) return;
    morph(() => {
      for (const m of open) collapse(m, true);
      upd();
    });
    say(S.allDone);
    showToast(() => restore(open));
  }
  const swiped = swipeable(el.bulk, el.bulkBtn, doneAll, () => true);
  // A keyboard click (detail 0) has no press of its own, so an old swipe must not cancel it.
  el.bulkBtn.addEventListener('click', (e) => {
    if (!e.detail || !swiped()) doneAll();
  });

  el.bringBack.addEventListener('click', () => {
    hideToast();
    restore(mails, true);
  });

  /* Reading: a letter whose end has passed above the bottom bar counts as read. */
  let frame = 0;
  const read = () => {
    frame = 0;
    if (!unread) return;
    const edge = innerHeight - nav.offsetHeight;
    // Measure all first, then write, so layout is read once.
    const seen = mails.filter(isUnread).filter((m) => {
      const r = m.getBoundingClientRect();
      return r.bottom <= edge;
    });
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

  /* Keyboard: E marks the focused letter, or the first open one in view, as Done; U or Z undoes. */
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest('input,textarea')) return;
    // By physical key, so the shortcuts work on any keyboard layout.
    const k = e.code;
    if (k === 'KeyE') {
      const focused = document.activeElement?.closest<HTMLElement>('.mail');
      const m = isOpen(focused) ? focused : mails.find((x) => isOpen(x) && x.getBoundingClientRect().bottom > 0) ?? mails.find(isOpen);
      if (m) {
        e.preventDefault();
        done(m);
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
