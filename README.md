# The Cavendish–Pettigrew Reflective Aptitude Inventory, Form 4-B

A spurious cognitive and personality assessment. It opens as a genuine timed
test, degrades imperceptibly into farce, cheats the taker in ways designed to be
mistaken for their own failings, falsifies their transcript, and grades them with
total clinical seriousness.

It is a working demonstration of the two effects it pretends to measure:
cognitive reflection, and the Barnum effect.

## Development

    npm test             # node --test, zero dependencies
    npm run build        # emits dist/index.html
    npm run package      # emits dist/cavendish-pettigrew-itch.zip
    tools/probe/run.sh   # end-to-end browser click-through (needs Chrome)
    npm run dev          # serves index.html for development, http://localhost:8080

`index.html` loads `src/main.js` as an ES module (`<script type="module">`),
which browsers refuse to fetch over `file://` — opening `index.html` by
double-clicking it will show a blank page with a CORS/module error in the
console. Use `npm run dev` (a zero-dependency static file server, see
`dev-server.mjs`) instead, or open the built `dist/index.html`, which inlines
everything into a single non-module `<script>` and has no such restriction.
Ship `dist/index.html`.

## Deploying

Two targets, and they ship differently.

### The live site — GitHub Pages

**Pushing to `develop` publishes it. There is no build or deploy step.**

    git push origin develop

Pages is configured to serve `develop` at `/` (verified against the API:
`source: { branch: "develop", path: "/" }`), *unbundled* — the committed
`index.html` loads `src/main.js` as an ES module, and `src/` is committed,
which works because Pages serves over HTTPS. Live at
<https://davidwbritt.github.io/cavendish-pettigrew/>.

There is no `gh-pages` branch; `develop` is the only branch. `dist/` stays
gitignored and is not involved here at all.

### itch.io

    npm run package     # builds, then writes dist/cavendish-pettigrew-itch.zip

The zip holds exactly one file — `index.html`, at the **root** of the
archive, which is where itch looks for it. A zip with the file nested inside
a folder is the most common way an HTML upload fails there, and itch reports
it as a missing `index.html`, which reads like a build problem rather than a
packaging one. `package.mjs` stages the file in a temp directory so that
cannot happen by hand.

The built file is entirely self-contained: 18 modules inlined into one
non-module `<script>`, system fonts only, no images, no network. Nothing is
fetched at runtime.

On itch:

1. **Dashboard → Create new project** (or edit the existing one).
2. **Kind of project: HTML.**
3. Upload `dist/cavendish-pettigrew-itch.zip` and tick
   **"This file will be played in the browser"**.
4. **Enable scrollbars.** Not optional — the review sheet, the marked paper
   and the certificate are all long documents. Without scrollbars they are
   cut off at the frame's bottom edge with no way to reach the rest.
5. Viewport ~**960 × 720**, fullscreen button on, mobile friendly on. The
   layout is a single centred column and reflows; 960 wide is enough to
   avoid horizontal scroll (verified in an iframe at that width).
6. Set visibility, then **Save & view page**.

External links (ko-fi) carry `target="_blank"` precisely because of this
iframe: without it, clicking one navigates the *frame* and replaces the
instrument with ko-fi in a small box, with no way back.

## Spec and plans

- `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`
- `docs/superpowers/plans/2026-08-12-instrument-machinery.md`
- `docs/superpowers/plans/2026-08-13-content-authoring.md` — **Plan 2: next steps.**
  Self-contained brief for authoring the 24 questions and re-aiming the
  certificate prose. Start here.

Built by Dave with Claude. Please do not spoil it for anyone.
