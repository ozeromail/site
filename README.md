# Ozero Mail website

The landing page for Ozero Mail. Static site on [Astro](https://astro.build), English at `/en/`, Russian at `/ru/`.

```sh
npm install
npm run dev     # http://localhost:4321/en/
npm run build   # type check, then build into dist/
```

- Text lives in `src/i18n/en.json` (source) and `src/i18n/ru.json`. The build fails if a key is missing in Russian.
- Store links, tip jar and the stats page are set in `src/config.ts`; empty values hide them.
- Hosting is temporary on Netlify (`netlify.toml`), closed to search engines. Set `INDEXABLE` in `src/config.ts` and drop the `X-Robots-Tag` header when the real domain is live.
