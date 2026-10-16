// The page behaves like the app's inbox: swipe or press Done to clear a letter, Undo in a toast,
// a bulk "Swipe N letters" strip, and a quiet "ozero" moment at Inbox Zero.

import type en from '../i18n/en.json';
import { fill, plural } from '../i18n/format';

type Strings = typeof en.client & { lang: string; done: string; cta: string };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function start() {
  const S: Strings = JSON.parse($('strings').textContent ?? '{}');

  /* Toast with Undo, shared by Done and Send. onEnd runs when the countdown ends or another toast replaces it. */
  const toast = $('toast');
  const undoBtn = $<HTMLButtonElement>('toastUndo');
  let timer: number | undefined;
  let undo: (() => void) | null = null;
  let onEnd: (() => void) | null = null;
  const toastText = $('toastText');
  const toastCd = $('toastCd');
  function hideToast() {
    clearInterval(timer);
    toast.hidden = true;
    undo = null;
    const f = onEnd;
    onEnd = null;
    f?.();
  }
  function showToast(text: string, undoFn: (() => void) | null, seconds: number, end?: () => void) {
    hideToast();
    undo = undoFn;
    onEnd = end ?? null;
    undoBtn.style.display = undoFn ? '' : 'none';
    let n = seconds;
    toastText.textContent = text;
    toastCd.textContent = end ? String(n) : '';
    toast.hidden = false;
    timer = window.setInterval(() => {
      n--;
      if (end) toastCd.textContent = String(n);
      if (n <= 0) hideToast();
    }, 1000);
  }
  undoBtn.addEventListener('click', () => {
    const f = undo;
    onEnd = null;
    hideToast();
    f?.();
  });

  /* Letters */
  const app = $('app');
  const mails = [...document.querySelectorAll<HTMLElement>('.mail')];
  const isOpen = (m: Element | null | undefined): m is HTMLElement => !!m && !m.classList.contains('is-done');
  // Side list links by letter id
  const side = new Map([...document.querySelectorAll<HTMLAnchorElement>('#sidelist a')].map((a) => [a.hash.slice(1), a]));
  const el = {
    count: $('count'), unreadSr: $('unreadSr'), left: $('left'), bar: $('bar'), track: $('track'),
    finale: $('finale'), ozw: $('ozw'), ozn: $('ozn'), finaleText: $('finaleText'),
    bringBack: $('bringBack'), bulk: $('bulk'), bulkText: $('bulkText'), bulkBtn: $('bulkBtn'),
  };
  let prevLeft = mails.length;

  function upd() {
    const left = mails.filter(isOpen).length;
    if (left === prevLeft) return;
    el.count.textContent = String(left);
    el.unreadSr.textContent = ' ' + plural(S.lang, S.unread, left);
    el.count.classList.add('tick');
    setTimeout(() => el.count.classList.remove('tick'), 200);
    el.left.textContent = left ? fill(S.left, { n: left }) : S.allClear;
    el.bar.style.width = ((mails.length - left) / mails.length) * 100 + '%';
    el.track.setAttribute('aria-valuenow', String(mails.length - left));
    el.ozw.textContent = left ? S.word : S.wordDone;
    el.ozn.textContent = left ? String(left) : '';
    el.finaleText.textContent = left ? S.fin : S.finDone;
    el.bringBack.hidden = !!left;
    el.bulk.hidden = !left;
    el.bulkText.textContent = plural(S.lang, S.bulk, left);
    el.bulkBtn.setAttribute('aria-label', fill(S.bulkLabel, { n: left }));
    el.finale.classList.toggle('clear', !left);
    app.classList.toggle('clear', !left);
    for (const m of mails) side.get(m.id)?.parentElement!.classList.toggle('is-done', !isOpen(m));
    if (!left) quiet();
    else if (document.body.classList.contains('quiet')) {
      clearTimeout(quietTimer);
      document.body.classList.remove('quiet');
      afterQuiet = null;
    }
    prevLeft = left;
  }

  /* Inbox Zero: centre the word, clear the screen, let the water move, then bring the note back */
  let quietTimer: number | undefined;
  let afterQuiet: (() => void) | null = null;
  // A toast raised during the quiet moment would be invisible, so it waits until the page comes back.
  function toastWhenCalm(show: () => void) {
    if (document.body.classList.contains('quiet')) afterQuiet = show;
    else show();
  }
  function quiet() {
    const lake = $('lake');
    hideToast();
    document.body.classList.add('quiet');
    const oz = document.querySelector<HTMLElement>('.oz')!;
    oz.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = oz.getBoundingClientRect();
    lake.style.setProperty('--cx', r.left + r.width / 2 + 'px');
    lake.style.setProperty('--cy', r.top + r.height / 2 + 'px');
    lake.classList.remove('go');
    void lake.offsetWidth;
    lake.classList.add('go');
    clearTimeout(quietTimer);
    quietTimer = window.setTimeout(() => {
      document.body.classList.remove('quiet');
      const f = afterQuiet;
      afterQuiet = null;
      f?.();
    }, 3200);
    el.finaleText.focus({ preventScroll: true });
  }

  function collapse(m: HTMLElement, done: boolean) {
    m.classList.toggle('is-done', done);
    m.querySelector<HTMLElement>('.sheet')!.style.transform = '';
  }

  function setDone(m: HTMLElement, done: boolean, silent = false) {
    const above = m.getBoundingClientRect().top < 0;
    collapse(m, done);
    upd();
    if (!done || above) m.scrollIntoView({ block: 'start' });
    if (!done) return;
    if (!app.classList.contains('clear')) m.querySelector<HTMLElement>('.row')!.focus({ preventScroll: true });
    if (!silent) {
      toastWhenCalm(() => showToast(S.done, () => {
        setDone(m, false, true);
        m.querySelector<HTMLElement>('.act.done')!.focus({ preventScroll: true });
      }, 4));
    }
  }

  /* A left swipe that passes 45% of the width fires onSwipe. Only clearly horizontal gestures count, so scrolling still works. */
  function swipeable(box: HTMLElement, el: HTMLElement, slop: number, ratio: number, onSwipe: () => void, canStart: (e: PointerEvent) => boolean) {
    let x0: number | null = null;
    let y0 = 0;
    let dx = 0;
    let axis: 'x' | 'y' | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button || !canStart(e)) return;
      x0 = e.clientX;
      y0 = e.clientY;
      dx = 0;
      axis = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      // The button was released outside before the pointer was captured.
      if (!e.buttons) {
        x0 = null;
        return;
      }
      const mx = e.clientX - x0;
      const my = e.clientY - y0;
      if (!axis && (Math.abs(mx) > slop || Math.abs(my) > slop)) {
        axis = mx < 0 && Math.abs(mx) > ratio * Math.abs(my) ? 'x' : 'y';
        if (axis === 'y') {
          x0 = null;
          return;
        }
        el.setPointerCapture(e.pointerId);
        box.classList.add('dragging');
      }
      if (axis === 'x') {
        dx = Math.min(0, mx);
        el.style.transform = `translateX(${dx}px)`;
      }
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      box.classList.remove('dragging');
      if (axis === 'x' && dx < -box.offsetWidth * 0.45) {
        el.style.transform = 'translateX(-110%)';
        setTimeout(onSwipe, 200);
      } else {
        el.style.transform = '';
      }
      axis = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => axis === 'x';
  }

  for (const m of mails) {
    m.querySelector('.act.done')!.addEventListener('click', () => setDone(m, true));
    m.querySelector('.row')!.addEventListener('click', () => {
      hideToast();
      setDone(m, false, true);
      const subj = m.querySelector<HTMLElement>('.subj')!;
      subj.tabIndex = -1;
      subj.focus({ preventScroll: true });
    });
    // Touch swipes anywhere on the letter; a mouse drags by the header.
    swipeable(m, m.querySelector<HTMLElement>('.sheet')!, 12, 2, () => setDone(m, true), (e) => {
      const target = e.target as Element;
      if (target.closest('a,button,input,label')) return false;
      return e.pointerType !== 'mouse' || !!target.closest('.mhead');
    });
  }

  /* For visitors who scrolled past without clearing: one bulk action, as in the app */
  function doneAll() {
    const open = mails.filter(isOpen);
    for (const m of open) collapse(m, true);
    upd();
    toastWhenCalm(() => showToast(S.allDone, () => {
      for (const m of open) collapse(m, false);
      upd();
      open[0].scrollIntoView({ block: 'start' });
    }, 5));
  }
  const { bulk, bulkBtn } = el;
  const swiped = swipeable(bulk, bulkBtn, 8, 1.5, () => {
    bulkBtn.style.transform = '';
    doneAll();
  }, () => true);
  // Keyboard (Enter or Space) clears at once; a tap only shows which way to swipe.
  let moved = false;
  bulkBtn.addEventListener('pointerdown', () => {
    moved = false;
  });
  bulkBtn.addEventListener('pointermove', () => {
    if (swiped()) moved = true;
  });
  bulkBtn.addEventListener('click', (e) => {
    if (moved) {
      moved = false;
      return;
    }
    if (e.detail === 0) {
      doneAll();
      return;
    }
    bulk.classList.remove('nudge');
    void bulk.offsetWidth;
    bulk.classList.add('nudge');
  });

  $('bringBack').addEventListener('click', () => {
    for (const m of mails) collapse(m, false);
    upd();
    mails[0].scrollIntoView({ block: 'start' });
  });

  /* Side list: highlight the letter being read; clicking a done letter reopens it */
  let current: HTMLElement | null = null;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      side.get(e.target.id)?.classList.toggle('on', e.isIntersecting);
      if (e.isIntersecting) current = e.target as HTMLElement;
    }
  }, { rootMargin: '-35% 0px -60% 0px' });
  mails.forEach((m) => io.observe(m));
  for (const m of mails) {
    side.get(m.id)?.addEventListener('click', () => {
      if (!isOpen(m)) setDone(m, false, true);
    });
  }

  /* Keyboard: E marks the letter in view as Done, U or Z undoes */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'e') {
      const focused = document.activeElement?.closest<HTMLElement>('.mail');
      let m = isOpen(focused) ? focused : isOpen(current) ? current : null;
      if (!m) {
        const from = mails.indexOf((focused ?? current)!);
        m = mails.slice(from + 1).find(isOpen) ?? mails.find(isOpen) ?? null;
      }
      if (m) {
        e.preventDefault();
        setDone(m, true);
      }
    } else if ((k === 'u' || k === 'z') && undo) {
      e.preventDefault();
      undoBtn.click();
    }
  });

  /* Compose: send with a 5-second undo, like the app. Nothing is sent until the waitlist opens. */
  $('wf').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email = $<HTMLInputElement>('email');
    const msg = $('wmsg');
    if (!email.checkValidity()) {
      msg.className = 'msg bad';
      msg.textContent = S.bad;
      email.focus();
      return;
    }
    msg.className = 'msg';
    msg.textContent = '';
    const btn = form.querySelector<HTMLButtonElement>('.sendbtn')!;
    btn.disabled = true;
    showToast(S.sent, () => {
      btn.disabled = false;
      msg.textContent = S.undone;
    }, 5, () => {
      form.closest('.compose')!.classList.add('sent');
      msg.className = 'msg ok';
      msg.textContent = S.ok;
    });
  });

  /* Store buttons: the visitor's own platform first */
  const ua = navigator.userAgent;
  const mine = /iPhone|iPad|Macintosh/.test(ua) ? 'appStore' : /Android/.test(ua) ? 'googlePlay' : '';
  const own = document.querySelector<HTMLAnchorElement>(`[data-store="${mine}"]`);
  const cta = $<HTMLAnchorElement>('cta');
  if (own) {
    own.parentElement!.prepend(own);
    cta.href = own.href;
  } else if (mine && cta.target) {
    // Not out on this visitor's platform yet: offer the waitlist instead of the other store.
    cta.href = '#wait';
    cta.removeAttribute('target');
    cta.textContent = S.cta;
  }

}
