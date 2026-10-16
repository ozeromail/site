import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.URL ?? 'https://ozeromail.netlify.app',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
});
