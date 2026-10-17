// The page behaves like the app's inbox: swipe a letter or press Done to clear it, Undo in a toast,
// and a quiet "ozero" moment at Inbox Zero.

import type en from '../i18n/en.json';
import { plural } from '../i18n/format';

type Strings = typeof en.client & { lang: string; word: string; done: string };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function start() {
  const S: Strings = JSON.parse($('strings').textContent ?? '{}');
  const live = $('live');

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

  /* Letters */
  const mails = [...document.querySelectorAll<HTMLElement>('.mail')];
  const isOpen = (m: HTMLElement) => !m.classList.contains('is-done');
  const [count, unreadSr, ozw, ozn, lake, calm] = ['count', 'unreadSr', 'ozw', 'ozn', 'lake', 'calm'].map((id) => $(id));
  const oz = document.querySelector<HTMLElement>('.oz')!;

  function centreLake() {
    const r = oz.getBoundingClientRect();
    lake.style.setProperty('--cx', r.left + r.width / 2 + 'px');
    lake.style.setProperty('--cy', r.top + r.height / 2 + 'px');
  }
  addEventListener('resize', () => {
    if (lake.classList.contains('go')) centreLake();
  });

  function upd() {
    const left = mails.filter(isOpen).length;
    count.textContent = String(left);
    unreadSr.textContent = ' ' + plural(S.lang, S.unread, left);
    ozw.textContent = left ? S.word : S.wordDone;
    ozn.textContent = left ? String(left) : '';
    oz.classList.toggle('clear', !left);
    calm.hidden = !!left;
    if (left) {
      lake.classList.remove('go');
      return;
    }
    // Inbox Zero: centre the word and let the water move.
    oz.scrollIntoView({ block: 'center', behavior: 'instant' });
    calm.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      centreLake();
      lake.classList.remove('go');
      void lake.offsetWidth;
      lake.classList.add('go');
    });
  }

  /* A left swipe past 45% of the width clears the letter. Only clearly horizontal gestures count, so scrolling still works.
     Touch swipes anywhere on the letter; a mouse drags by the header, so text stays selectable. */
  for (const m of mails) {
    const sheet = m.querySelector<HTMLElement>('.sheet')!;
    const row = m.querySelector<HTMLElement>('.row')!;
    const doneBtn = m.querySelector<HTMLElement>('.act.done')!;
    const setDone = (done: boolean) => {
      m.classList.toggle('is-done', done);
      sheet.style.transform = '';
      upd();
    };
    const reopen = () => {
      hideToast();
      setDone(false);
      doneBtn.focus();
    };
    const done = () => {
      setDone(true);
      if (mails.some(isOpen)) row.focus({ preventScroll: true });
      live.textContent = '';
      const left = mails.filter(isOpen).length;
      requestAnimationFrame(() => (live.textContent = `${S.done}. ${left} ${plural(S.lang, S.unread, left)}`));
      showToast(reopen);
    };
    doneBtn.addEventListener('click', done);
    row.addEventListener('click', reopen);
    let x0: number | null = null;
    let y0 = 0;
    let dx = 0;
    let axis: 'x' | 'y' | null = null;
    sheet.addEventListener('pointerdown', (e) => {
      const target = e.target as Element;
      if (e.button || target.closest('a,button') || (e.pointerType === 'mouse' && !target.closest('.mhead'))) return;
      x0 = e.clientX;
      y0 = e.clientY;
      dx = 0;
      axis = null;
    });
    sheet.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      if (!e.buttons) {
        x0 = null;
        return;
      }
      const mx = e.clientX - x0;
      const my = e.clientY - y0;
      if (!axis && (Math.abs(mx) > 12 || Math.abs(my) > 12)) {
        axis = mx < 0 && Math.abs(mx) > 2 * Math.abs(my) ? 'x' : 'y';
        if (axis === 'y') {
          x0 = null;
          return;
        }
        sheet.setPointerCapture(e.pointerId);
        m.classList.add('dragging');
      }
      if (axis === 'x') {
        dx = Math.min(0, mx);
        sheet.style.transform = `translateX(${dx}px)`;
      }
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      m.classList.remove('dragging');
      if (axis === 'x' && dx < -m.offsetWidth * 0.45) {
        sheet.style.transform = 'translateX(-110%)';
        setTimeout(done, 200);
      } else {
        sheet.style.transform = '';
      }
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  }
}
