// Shared by the page and its water.
export const still = matchMedia('(prefers-reduced-motion: reduce)');
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
