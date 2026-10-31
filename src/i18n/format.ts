// Fills {name} placeholders in a string.

export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m));
