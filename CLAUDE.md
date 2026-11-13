# G-Scout

## Always bump the cache version

Whenever you change any file the app serves (`index.html`, `css/`, `js/`, `vendor/`, `icons/`,
`manifest.webmanifest`), increment `VERSION` in `sw.js` in the same commit
(e.g. `'g-scout-v28'` → `'g-scout-v29'`). Only bump it once per commit, however many files changed.

Installed phones and tablets run from an offline cache and only fetch new files when `VERSION`
changes. If it isn't bumped, devices keep running the old version even after GitHub Pages updates.

If you add or rename a file the app serves, also add it to the `FILES` list in `sw.js`.

Changes that only touch `README.md`, `tools/` or this file don't need a bump.
