// The logo: the Refraction mark. A disc cut at the water line, half a stroke below the middle;
// the lower part slides aside in the accent, as a straw does in water. At header and favicon
// sizes the mark is the filled disc; the ring is for large sizes only.
// One source for the header mark and the favicon. Ids must be unique per page.

export const markSvg = (id: string, attrs: string) => `<svg ${attrs} viewBox="0 0 48 48">
  <style>.${id}t{fill:#142036}.${id}b{fill:#2f8cff}@media (prefers-color-scheme:dark){.${id}t{fill:#e5e9f1}.${id}b{fill:#6ab2ff}}</style>
  <defs>
    <clipPath id="${id}a"><rect x="-10" y="-10" width="70" height="36.7"/></clipPath>
    <clipPath id="${id}w"><rect x="-10" y="28.3" width="70" height="40"/></clipPath>
  </defs>
  <g transform="translate(-2.5 0)">
    <circle class="${id}t" cx="24" cy="24" r="17.5" clip-path="url(#${id}a)"/>
    <circle class="${id}b" cx="29" cy="24" r="17.5" clip-path="url(#${id}w)"/>
  </g>
</svg>`;
