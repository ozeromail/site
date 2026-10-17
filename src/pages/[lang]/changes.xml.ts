// The build log as RSS, one feed per language.
import type { APIRoute } from 'astro';
import { LANGS, strings, type Lang } from '../../i18n';

export function getStaticPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = ({ params, site }) => {
  const lang = params.lang as Lang;
  const t = strings[lang];
  const page = new URL(`/${lang}/`, site).href;
  const items = t.log
    .map((e) => `<item><title>${esc(e.date)}</title><description>${esc(e.text)}</description><link>${page}#m8</link><guid isPermaLink="false">${lang}-${e.date}</guid><pubDate>${new Date(e.date).toUTCString()}</pubDate></item>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>${esc(t.logTitle)}</title><link>${page}</link><description>${esc(t.s8)}</description><language>${lang}</language>${items}</channel></rss>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
