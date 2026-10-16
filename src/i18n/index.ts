import en from './en.json';
import ruSource from './ru.json';

export type Lang = 'en' | 'ru';
export type Strings = typeof en;

// Russian typography: glue short words and numbers to what follows with a no-break space.
function typo(s: string): string {
  return s
    .replace(/(?<=^|[\s(«])(в|и|с|к|о|у|а|я|на|по|не|за|до|от|из|без|для|ни|но|или)\s/gi, '$1 ')
    .replace(/(\d)\s(?=\S)/g, '$1 ');
}

function deep<T>(v: T, f: (s: string) => string): T {
  if (typeof v === 'string') return f(v) as T;
  if (Array.isArray(v)) return v.map((x) => deep(x, f)) as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, f)])) as T;
  }
  return v;
}

// Typed as Strings so a key missing from ru.json fails `astro check`.
const ru: Strings = deep(ruSource, typo);

export const LANGS: Lang[] = ['en', 'ru'];
export const strings: Record<Lang, Strings> = { en, ru };
