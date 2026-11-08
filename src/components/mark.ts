// The mark: sky over water in a circle, the shore an envelope flap. The same in both themes.
// The favicon draws it; the header shows the outlined lockup from public/brand.

export const markSvg = (attrs: string) => `<svg ${attrs} viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="w"><path d="M0 280L466 572Q512 612 558 572L1024 280V1024H0Z"/></clipPath>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="280" x2="0" y2="1024"><stop offset="0" stop-color="#4f8bff"/><stop offset=".5" stop-color="#2f6bff"/><stop offset="1" stop-color="#1b3f7a"/></linearGradient>
  </defs>
  <circle cx="512" cy="512" r="512" fill="#e9f0ff"/>
  <circle cx="512" cy="512" r="512" fill="url(#g)" clip-path="url(#w)"/>
</svg>`;
