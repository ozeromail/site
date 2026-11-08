// The logo: the family ring from the app icon. A ring cut at its centre line with a thin gap;
// the lower half is a touch thicker and slides right, as a straw does in water. One sweep runs
// from light at the top to dark at the bottom, the same as on the app and Ozero Phone icons.
// One source for the header mark and the favicon. Ids must be unique per page.

export const markSvg = (id: string, attrs: string) => `<svg ${attrs} viewBox="18 18 64 64">
  <style>.${id}a{stop-color:#6ab2ff}.${id}z{stop-color:#142036}@media (prefers-color-scheme:dark){.${id}a{stop-color:#cfe4ff}.${id}z{stop-color:#4d9bff}}</style>
  <defs>
    <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" y1="23" x2="0" y2="77"><stop class="${id}a" offset="0"/><stop class="${id}z" offset="1"/></linearGradient>
    <clipPath id="${id}t"><rect x="0" y="0" width="100" height="49.055"/></clipPath>
    <clipPath id="${id}b"><rect x="0" y="50.945" width="100" height="49.055"/></clipPath>
  </defs>
  <g fill="none" stroke="url(#${id}g)">
    <circle cx="47.3" cy="50" r="20.25" stroke-width="13.5" clip-path="url(#${id}t)"/>
    <g clip-path="url(#${id}b)"><circle cx="52.7" cy="50" r="19.71" stroke-width="14.58"/></g>
  </g>
</svg>`;
