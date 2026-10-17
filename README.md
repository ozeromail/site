# Ozero Mail website

The landing page for Ozero Mail. Static site on [Astro](https://astro.build), English at `/en/`, Russian at `/ru/`.

```sh
npm install
npm run dev     # http://localhost:4321/en/
npm run build   # type check, then build into dist/
```

- Text lives in `src/i18n/en.json` (source) and `src/i18n/ru.json`. The build fails if a key is missing in Russian.
- Store links, tip jar and the stats page are set in `src/config.ts`; empty values hide them.
- Hosting is temporary on Netlify (`netlify.toml`), closed to search engines. CI builds, then a separate job deploys `main` to production and each PR to a preview; it needs the `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` repo secrets. Set `INDEXABLE` in `src/config.ts` and drop the `X-Robots-Tag` header when the real domain is live.
- The launch note in the compose window is a `mailto:` link to `CONTACT` in `src/config.ts`; the site stores no addresses.
- `public/og-*.png` are the link previews; regenerate them when the headline changes.
- The build log letter reads `log` in the i18n files and is also served as RSS at `/en/changes.xml` and `/ru/changes.xml`.
