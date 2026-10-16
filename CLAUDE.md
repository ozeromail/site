# Ozero Mail website

Astro static site: one page per language, `src/pages/[lang]/index.astro`; client script `src/scripts/inbox.ts`.

## Git and PRs

- Author every commit as `Khizri Makhmudov <khizrim@khizrim.ru>`. No `Co-Authored-By`, `Claude-Session` or "Generated with Claude Code" lines.
- Conventional Commits for commits and PR titles: `feat: add pricing letter`.
- Everything in the repo is in English: code, comments, docs, commits, PRs. Keep it short and plain.
- Before opening a PR, run `/simplify`, then `/code-review`, and fix what they find.

## Content

- English is the source (`src/i18n/en.json`), Russian second (`src/i18n/ru.json`); add every key to both.
- The name is always "Ozero Mail" in text; lowercase "ozero" only in the logo and the Inbox Zero finale word. Never a digit 0 instead of "o".
- First person singular: one author, no "we" or "team". No AI features, no tracking, no third-party requests (fonts are self-hosted).
- Do not mention whether the code is open or closed.

## Before a PR

```sh
npm run build
```
