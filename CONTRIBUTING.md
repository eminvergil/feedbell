# Contributing to Feedbell

Thanks for helping! Feedbell is a small Electron app with no runtime dependencies, so getting started takes a minute.

- [Development setup](#development-setup)
- [Translating Feedbell](#translating-akış) ← the easiest way to contribute
- [Adding a theme](#adding-a-theme)
- [Code changes](#code-changes)

## Development setup

You need Node.js 18 or newer.

```bash
git clone <this repository>
cd feedbell
npm install
npm run demo      # sample data, no network; "Refresh" simulates new posts
npm start         # your real data
npm test          # parser, storage, notification rules, feed discovery, OPML, translations
```

Useful flags while developing (they render a window off-screen, save a PNG and quit):

```bash
npx electron . --demo --lang=de --capture=main.png --view=first:1
npx electron . --demo --lang=de --capture-panel=panel.png --tab=feeds
npx electron . --demo --lang=de --capture-toast=popup.png
```

`--view` accepts `notifications`, `settings`, `add` or `first:<n>`; `--color-theme=<id>` and `--mode=light|dark` change the look. Demo mode uses a temporary data folder and a separate browser profile, so it never touches your own subscriptions.

## Translating Feedbell

Every language is a single JSON file in [`src/locales/`](src/locales). English (`en.json`) is the source; everything else is a translation of it. Feedbell picks up new files automatically — there is no list to register them in.

### Add a new language

1. Copy `src/locales/en.json` to `src/locales/<code>.json`. Use a BCP 47 code: `de`, `fr`, `es`, `pt-BR`, `zh-Hans`…
2. Fill in `meta`:
   ```json
   "meta": {
     "name": "Deutsch",
     "englishName": "German",
     "locale": "de-DE",
     "translators": ["Your Name <optional@email>"]
   }
   ```
   `name` is shown in the language menu in its own language. `locale` is used for dates, numbers and plural rules.
3. Translate the values. **Never change the keys.**
4. Check your work:
   ```bash
   npm run i18n:check -- de
   npm test
   ```
5. Try it: `npx electron . --demo --lang=de`, or pick the language in **Settings → Appearance → Language**.
6. Open a pull request. Screenshots are welcome but not required.

### Rules of thumb

**Placeholders.** Text in braces is filled in by the app. Keep every placeholder (`{name}`, `{time}`, `{until}`, `{start}`…) exactly as written — you can move it anywhere in the sentence.

```json
"added": "Added “{name}”."          →  "added": "„{name}“ hinzugefügt."
```

**Plurals.** Keys whose value is an object are plural forms chosen with [`Intl.PluralRules`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules) for your `meta.locale`. Provide the categories your language uses — `zero`, `one`, `two`, `few`, `many`, `other`. `other` is required; the rest fall back to it.

```json
"posts": { "one": "{count} post", "other": "{count} posts" }        // English
"posts": { "other": "{count} yazı" }                                // Turkish: one form is enough
"posts": { "one": "{count} wpis", "few": "{count} wpisy",
           "many": "{count} wpisów", "other": "{count} wpisu" }     // Polish
```

`{count}` may be left out of a plural form when your language doesn't need the number ("Every hour").

**Missing strings.** Anything you haven't translated yet shows in English, so a partial translation is fine to ship and improve later.

**Tone.** Feedbell talks to the user in a friendly, direct, first-person voice ("I'll let you know when something new arrives"). Keep sentences short; most strings appear in buttons, menus and small notifications.

**Names.** Keep the product name **Feedbell** as is. Theme names (`themes.*`) can be translated freely. Keyboard keys in shortcuts (J, K, S…) are not translated, but `common.space` (the Space key) is.

**Where strings show up.** The first part of each key tells you where it's used:

| Prefix | Where |
|--------|-------|
| `nav`, `sidebar`, `list`, `reader`, `welcome`, `keys` | Main window |
| `notifications` | Notification history page |
| `settings`, `themes` | Settings page |
| `addDialog`, `feedDialog` | "Add feed" and feed settings dialogs |
| `panel`, `panelMenu` | Menu bar / system tray panel |
| `toast` | Popup notifications in the screen corner |
| `system`, `tray`, `menu`, `confirm`, `opml` | System notifications, tray menu, app menu, dialogs |
| `errors` | Feed errors (network, HTTP, invalid feeds) |
| `time`, `snooze`, `common` | Shared |

## Adding a theme

Themes live in [`src/shared/themes.css`](src/shared/themes.css). Add a light block and a dark block with the same variables as the existing themes, register the id in `THEMES` in `src/renderer/app.js` and `src/app-menu.js`, and add a name under `themes.<id>` in every locale file (English is enough; others fall back). The accent color must have at least 4.5:1 contrast with `--accent-ink`, and `--muted` must stay readable on `--surface`.

## Code changes

- Keep the app dependency-free at runtime (the XML parser, feed discovery and i18n are all in `src/`).
- Every user-facing string goes through `t('key')` and lives in `en.json` (plus `tr.json` if you can). `npm test` fails if code uses a key that doesn't exist.
- Errors shown to users are `AppError`s with a code (`src/errors.js`); the UI turns the code into text with `errors.<code>`.
- Run `npm test` before opening a pull request. For UI changes, a screenshot made with the capture flags above helps reviewers.

| Path | What it does |
|------|--------------|
| `src/main.js` | App lifecycle, windows, notifications, IPC |
| `src/menubar.js`, `src/app-menu.js` | Menu bar icon and panel, application and Dock menus |
| `src/feed-parser.js`, `src/fetcher.js` | RSS / Atom / RDF / JSON Feed parsing, downloading, feed discovery |
| `src/store.js`, `src/poller.js`, `src/notifier.js` | Local storage, background refresh, notification rules |
| `src/renderer/`, `src/panel/`, `src/toast/` | Main window, menu bar panel, popup UI |
| `src/shared/` | Translation core and theme colors shared by all windows |
| `src/locales/` | Translations |
