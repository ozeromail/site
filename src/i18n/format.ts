// Shared by the pages and the client script, so it must not import the string files.

export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m));

export const plural = (lang: string, p: Plural, n: number) =>
  fill(p[new Intl.PluralRules(lang).select(n)] ?? p.other, { n });
