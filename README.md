# The Cavendish–Pettigrew Reflective Aptitude Inventory, Form 4-B

A spurious cognitive and personality assessment. It opens as a genuine timed
test, degrades imperceptibly into farce, cheats the taker in ways designed to be
mistaken for their own failings, falsifies their transcript, and grades them with
total clinical seriousness.

It is a working demonstration of the two effects it pretends to measure:
cognitive reflection, and the Barnum effect.

## Development

    npm test        # node --test, zero dependencies
    npm run build   # emits dist/index.html
    npm run dev      # serves index.html for development, http://localhost:8080

`index.html` loads `src/main.js` as an ES module (`<script type="module">`),
which browsers refuse to fetch over `file://` — opening `index.html` by
double-clicking it will show a blank page with a CORS/module error in the
console. Use `npm run dev` (a zero-dependency static file server, see
`dev-server.mjs`) instead, or open the built `dist/index.html`, which inlines
everything into a single non-module `<script>` and has no such restriction.
Ship `dist/index.html`.

## Deploying

`dist/` is gitignored and there is no CI/Pages workflow — nothing is
deployable until you build and publish by hand:

    npm run build

Then publish the single built file, `dist/index.html`, to a `gh-pages`
branch (an orphan branch containing only that file — not the source tree),
and set the repository's GitHub Pages source to serve from `gh-pages` /
root. Do not commit `dist/` to `develop`/`main` and do not add a CI
workflow to automate this — both are intentionally out of scope for now.

## Spec and plans

- `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`
- `docs/superpowers/plans/2026-08-12-instrument-machinery.md`
- `docs/superpowers/plans/` — Plan 2 authors the question and statement content

Built by Dave with Claude. Please do not spoil it for anyone.
