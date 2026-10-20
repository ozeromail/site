// The logo: a round window onto a still lake, the app icon without its tile.
// One source for the header mark and the favicon. Ids must be unique per page.

// Water sheets from the horizon down, each nearer one darker.
const sheets = [[27.2, '#9cc4fd'], [30.7, '#6aa3f9'], [35.2, '#3f82f2'], [41.1, '#1f5ccd']] as const;

export const markSvg = (id: string, attrs: string) => `<svg ${attrs} viewBox="0 0 48 48">
  <defs>
    <clipPath id="${id}c"><circle cx="24" cy="24" r="24"/></clipPath>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6d4ff"/><stop offset=".56" stop-color="#f4f8ff"/></linearGradient>
  </defs>
  <g clip-path="url(#${id}c)">
    <rect width="48" height="48" fill="url(#${id}s)"/>
    <circle cx="26.7" cy="20" r="4.3" fill="#fff"/>
    ${sheets.map(([y, fill]) => `<path d="M0 ${y}Q24 ${y + 0.7} 48 ${y}V48H0Z" fill="${fill}"/>`).join('')}
  </g>
  <circle cx="24" cy="24" r="23.75" fill="none" stroke="#04122e" stroke-opacity=".08" stroke-width=".5"/>
</svg>`;
