// The page behaves like the app's inbox: a letter scrolled to its end counts as read, swipe or press Done
// to clear it with Undo in a toast, a bulk "Swipe N letters" strip, and a quiet "ozero" moment at Inbox Zero.

import type en from '../i18n/en.json';
import { fill, plural } from '../i18n/format';

type Strings = typeof en.client & { lang: string; done: string; cta: string };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function start() {
  const S: Strings = JSON.parse($('strings').textContent ?? '{}');

  /* One live region speaks for the page, so each action is announced once. */
  const live = $('live');
  const say = (text: string) => {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  };

  /* Toast with Undo. It waits while the pointer or focus is on it. */
  const toast = $('toast');
  const undoBtn = $<HTMLButtonElement>('toastUndo');
  const toastText = $('toastText');
  let timer: number | undefined;
  let undo: (() => void) | null = null;
  function hideToast() {
    clearInterval(timer);
    toast.hidden = true;
    undo = null;
  }
  function showToast(text: string, undoFn: () => void, seconds = 8) {
    hideToast();
    undo = undoFn;
    toastText.textContent = text;
    toast.hidden = false;
    let n = seconds;
    timer = window.setInterval(() => {
      if (!toast.matches(':hover,:focus-within') && --n <= 0) hideToast();
    }, 1000);
  }
  undoBtn.addEventListener('click', () => {
    const f = undo;
    hideToast();
    f?.();
  });

  /* Letters */
  const app = $('app');
  const mails = [...document.querySelectorAll<HTMLElement>('.mail')];
  const isOpen = (m: Element | null | undefined): m is HTMLElement => !!m && !m.classList.contains('is-done');
  const isUnread = (m: HTMLElement) => isOpen(m) && !m.classList.contains('is-read');
  // Phone rows by letter id: the desktop side phone and the one in the mobile header.
  const rows = new Map<string, HTMLAnchorElement[]>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.ph-list a')) rows.set(a.dataset.id!, [...(rows.get(a.dataset.id!) ?? []), a]);
  const eachRow = (m: HTMLElement, f: (a: HTMLAnchorElement) => void) => rows.get(m.id)?.forEach(f);
  const el = {
    count: $('count'), unreadSr: $('unreadSr'), left: $('left'), bar: $('bar'), track: $('track'),
    finale: $('finale'), ozw: $('ozw'), ozn: $('ozn'), finaleText: $('finaleText'), lake: $('lake'),
    bringBack: $('bringBack'), bulk: $('bulk'), bulkText: $('bulkText'), bulkBtn: $('bulkBtn'),
  };
  // Hidden during the quiet moment, so they leave the tab order too.
  const calm = [...document.querySelectorAll<HTMLElement>('.head,.compose,#bringBack,.bbar,.side')];
  let prevLeft = mails.length;
  let prevUnread = mails.length;
  const leftText = (unread: number) => (unread ? fill(S.left, { n: unread }) : mails.some(isOpen) ? S.allRead : S.allClear);

  // The count is unread letters; Inbox Zero needs every letter Done.
  function upd() {
    const left = mails.filter(isOpen).length;
    const unread = mails.filter(isUnread).length;
    for (const m of mails) {
      eachRow(m, (a) => {
        a.parentElement!.classList.toggle('is-done', !isOpen(m));
        a.parentElement!.classList.toggle('is-read', !isUnread(m));
      });
    }
    if (unread !== prevUnread) {
      el.count.textContent = String(unread);
      el.unreadSr.textContent = ' ' + plural(S.lang, S.unread, unread);
      el.count.classList.add('tick');
      setTimeout(() => el.count.classList.remove('tick'), 200);
      el.left.textContent = leftText(unread);
      el.bar.style.width = ((mails.length - unread) / mails.length) * 100 + '%';
      el.track.setAttribute('aria-valuenow', String(mails.length - unread));
      el.ozn.textContent = unread ? String(unread) : '';
      prevUnread = unread;
    }
    if (left === prevLeft) return;
    el.left.textContent = leftText(unread);
    el.ozw.textContent = left ? S.word : S.wordDone;
    if (!left) el.ozn.textContent = '';
    el.finaleText.textContent = left ? S.fin : S.finDone;
    el.bringBack.hidden = !!left;
    el.bulk.hidden = !left;
    el.bulkText.textContent = plural(S.lang, S.bulk, left);
    el.bulkBtn.setAttribute('aria-label', fill(S.bulkLabel, { n: left }));
    el.finale.classList.toggle('clear', !left);
    app.classList.toggle('clear', !left);
    if (!left) quiet();
    else {
      el.lake.classList.remove('go');
      if (document.body.classList.contains('quiet')) endQuiet();
    }
    prevLeft = left;
  }

  /* Inbox Zero: centre the word, clear the screen, let the water move, then bring the note back */
  let quietTimer: number | undefined;
  const oz = document.querySelector<HTMLElement>('.oz')!;
  function centreLake() {
    const r = oz.getBoundingClientRect();
    el.lake.style.setProperty('--cx', r.left + r.width / 2 + 'px');
    el.lake.style.setProperty('--cy', r.top + r.height / 2 + 'px');
  }
  function endQuiet() {
    clearTimeout(quietTimer);
    document.body.classList.remove('quiet');
    for (const e of calm) e.inert = false;
  }
  function quiet() {
    hideToast();
    document.body.classList.add('quiet');
    for (const e of calm) e.inert = true;
    oz.scrollIntoView({ block: 'center', behavior: 'instant' });
    centreLake();
    el.lake.classList.remove('go');
    void el.lake.offsetWidth;
    el.lake.classList.add('go');
    say(S.finDone);
    clearTimeout(quietTimer);
    quietTimer = window.setTimeout(() => {
      endQuiet();
      el.finaleText.focus({ preventScroll: true });
      $('wait').scrollIntoView({ block: 'end' });
    }, 3200);
  }
  addEventListener('resize', () => {
    if (el.lake.classList.contains('go')) centreLake();
  });

  function collapse(m: HTMLElement, done: boolean) {
    m.classList.toggle('is-done', done);
    if (done) m.classList.add('is-read');
    m.querySelector<HTMLElement>('.sheet')!.style.transform = '';
  }

  function setDone(m: HTMLElement, done: boolean, silent = false) {
    const above = m.getBoundingClientRect().top < 0;
    collapse(m, done);
    upd();
    if (!done || above) m.scrollIntoView({ block: 'start' });
    if (!done || app.classList.contains('clear')) return;
    m.querySelector<HTMLElement>('.row')!.focus({ preventScroll: true });
    if (silent) return;
    const left = leftText(prevUnread);
    say(`${S.done}. ${left[0].toUpperCase()}${left.slice(1)}`);
    showToast(S.done, () => {
      setDone(m, false, true);
      m.querySelector<HTMLElement>('.act.done')!.focus({ preventScroll: true });
    });
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
    // Touch swipes anywhere on the letter; a mouse drags by the header, so text stays selectable.
    swipeable(m, m.querySelector<HTMLElement>('.sheet')!, 12, 2, () => setDone(m, true), (e) => {
      const target = e.target as Element;
      if (target.closest('a,button,input,label')) return false;
      return e.pointerType !== 'mouse' || !!target.closest('.mhead');
    });
  }

  /* For visitors who scrolled past without clearing: one bulk action, as in the app. Swipe it or just press it.
     No toast: Inbox Zero follows at once, and "Bring the letters back" undoes it. */
  function doneAll() {
    for (const m of mails) collapse(m, true);
    upd();
  }
  const { bulk, bulkBtn } = el;
  const swiping = swipeable(bulk, bulkBtn, 8, 1.5, () => {
    bulkBtn.style.transform = '';
    doneAll();
  }, () => true);
  let swiped = false;
  bulkBtn.addEventListener('pointerdown', () => {
    swiped = false;
  });
  bulkBtn.addEventListener('pointermove', () => {
    if (swiping()) swiped = true;
  });
  bulkBtn.addEventListener('click', () => {
    if (swiped) swiped = false;
    else doneAll();
  });

  $('bringBack').addEventListener('click', () => {
    for (const m of mails) {
      collapse(m, false);
      m.classList.remove('is-read');
    }
    upd();
    mails[0].scrollIntoView({ block: 'start' });
    mails[0].querySelector<HTMLElement>('.act.done')!.focus({ preventScroll: true });
  });

  /* Side list: highlight the letter being read; clicking a done letter reopens it */
  let current: HTMLElement | null = null;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const m = e.target as HTMLElement;
      eachRow(m, (a) => a.classList.toggle('on', e.isIntersecting));
      if (e.isIntersecting) current = m;
    }
  }, { rootMargin: '-35% 0px -60% 0px' });
  mails.forEach((m) => io.observe(m));
  for (const m of mails) {
    eachRow(m, (a) => a.addEventListener('click', () => {
      if (!isOpen(m)) setDone(m, false, true);
    }));
  }

  /* Reading: a letter whose end has come into view, above the bottom bar, counts as read. */
  let frame = 0;
  const read = () => {
    frame = 0;
    const edge = innerHeight - el.bar.closest('nav')!.offsetHeight;
    let changed = false;
    for (const m of mails) {
      if (!isUnread(m)) continue;
      const r = m.getBoundingClientRect();
      if (r.bottom <= edge && r.bottom > 0) {
        m.classList.add('is-read');
        changed = true;
      }
    }
    if (changed) upd();
  };
  addEventListener('scroll', () => {
    frame ||= requestAnimationFrame(read);
  }, { passive: true });

  /* Keyboard: E marks the letter in view as Done, U or Z undoes. A held key does not repeat. */
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest('a,input,textarea')) return;
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

  /* Compose: Send opens the visitor's mail app with a note to the author; the phone goes into the text. */
  const send = $<HTMLAnchorElement>('send');
  const template = send.dataset.href!;
  $('wait').addEventListener('change', (e) => {
    const os = (e.target as HTMLInputElement).value;
    send.href = template.replace(encodeURIComponent('{os}'), encodeURIComponent(os));
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
    // Not out on this visitor's platform yet: offer the launch note instead of the other store.
    cta.href = '#wait';
    cta.removeAttribute('target');
    cta.textContent = S.cta;
  }
}
