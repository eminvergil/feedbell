# Translations

One file per language, named with its BCP 47 code (`en.json`, `tr.json`, `pt-BR.json`…). `en.json` is the source of truth.

To add a language: copy `en.json`, fill in `meta`, translate the values (never the keys), then run `npm run i18n:check -- <code>` and `npm test`. The full guide is in [CONTRIBUTING.md](../../CONTRIBUTING.md#translating-akış).
