# Plan 2 — Content Authoring

**Written 2026-08-13, at the close of Plan 1. Self-contained: assume the reader
has no memory of the session that built the machinery.**

---

## Where things stand

The instrument is **mechanically complete and live**. Plan 1 built and verified
every moving part; 244 tests pass; a headless-browser probe drives the whole
thing end to end. Nothing in `src/` needs new features for the content to land.

- Repo: `davidwbritt/cavendish-pettigrew`, branch `develop` (the only branch).
- **GitHub Pages serves from `develop` root**, unbundled — `index.html` loads
  `src/main.js` as a module and `src/` is committed, which works fine over
  HTTPS. **Pushing to `develop` updates the live site.** No build or deploy step
  is required. `dist/` exists only for a future itch.io upload.
- Live at `https://davidwbritt.github.io/cavendish-pettigrew/`.

**What is placeholder and what is not:**

| Asset | State |
|---|---|
| `src/questions.js` — 24 prompts + 96 options | **Placeholder.** Every prompt reads `[provisional] Question N (kind).` |
| `src/statements.js` — 24 Barnum statements | **Written, but aimed at a general reader.** Needs re-aiming (see §2) |
| `src/statements.js` — 16 insinuations, 4 tiers of 4 | **Written, same problem** |
| Debrief prose (`renderDebrief` in `src/ui/screens.js`) | **Written.** Needs a warmth pass (see §3) |
| Everything else | Done |

So Plan 2 is **two authoring workstreams plus a tone pass**, not one.

---

## THE AUDIENCE — this governs every decision below

The readers are **people in computing — architects, engineers, technical leads —
passing the far end of mid-life.** Mostly the owner's professional circle, which
skews male, but explicitly **not only men**: his wife will take it, and so will
others outside that skew.

**Write for the career stage and the profession. Never for the gender.**

That is a craft constraint, not just courtesy. The material that bites here —
unused capacity, the road not taken, retirement arithmetic, checking what former
colleagues did next — is entirely gender-neutral and loses nothing by staying so.
A male-coded specific buys no extra bite and breaks the piece completely for the
first reader outside the skew. That is the **worst possible failure mode for a
Barnum instrument**: one statement that obviously is not about you retroactively
discredits every statement around it, including the ones that landed.

The certificate's third-person clinical register (*"the subject presents as…"*)
is already gender-neutral and is doing this work for free. Keep it. Verified: no
gendered language currently exists anywhere in the shipped prose.

**Why aiming at this audience makes the piece much stronger.** Forer's original
1948 statements already skew toward exactly this reader — *"a great deal of
unused capacity which you have not turned to your advantage"*, *"serious doubts
as to whether you made the right decision"*, *"some of your aspirations tend to
be pretty unrealistic"*. For a general audience those are horoscope filler. Read
at fifty-two by someone who took the stable job over the risky one, they stop
being filler. The Barnum effect sharpens the better you know the reader, and here
we know them exactly.

---

## 1. Workstream A — the 24 questions

Replace `prompt` and `options` for all 24 entries in `src/questions.js`.

### The immutable contract

**Do not change `n`, `phase`, `kind`, `correct` or `nonsense` on any question.**
The machinery is tuned to those exact indices — the timer curve, the trick
scheduler, the recovery questions and the falsification selector all key off
them. `validateQuestions()` enforces the rules and the test suite pins them.

Every question keeps **exactly 4 options**. `renderQuestion` indexes options as
`'ABCD'[i]` and `doubleMark` assumes four; three or five will break things.

### Composition, already fixed

| Band | Phase | Content |
|---|---|---|
| Q1–10 | `deposit` | Scrupulously fair, solvable, **no nonsense vocabulary**. Exactly 3 `crt`, 3 `syllogism`, 2 `sequence`, 2 `spatial` |
| Q11–20 | `descent` | Nonsense vocabulary enters via the syllogisms; questions begin asking about the taker |
| Q13, Q16, Q19 | recovery | Inside the descent but **clean, fair, fully solvable, non-nonsense** — they reseal the taker's trust |
| Q21–24 | `farce` | Openly ridiculous. `correct: null` — no wrong answers exist, and the instrument never says so |

### Constraints the machinery imposes on the writing

**(a) Use novel cognitive-reflection items.** Not the canonical Frederick (2005)
three — bat-and-ball, the widgets, the lily pad. They are too well known; a
reader who recognises one answers instantly and correctly, and the deposit fails.
Write new items in the same family: the intuitive answer arrives fast, feels
obvious, and is wrong.

> **AMENDED 2026-08-13 (owner's call) — partially reversed.** Q1 is canonical
> bat-and-ball; Q4 is the widgets problem as *"six wives can wrap six gifts in
> six minutes"* (an inside joke, and period-appropriate phrasing for a 1978
> booklet). Recognition is a feature on the **review screen**, not a bug:
> the recogniser answers 5 cents, is certain of it, and `chooseFalsifications()`
> prefers a correctly-answered CRT above everything else — so that certainty is
> what gets contradicted. **Q7 stays novel** so the deposit still lands on a
> reader who saw through both. Constraint (b) below matters *more* under this
> change, not less.

**(b) Deposit answers must be SHORT, CONCRETE and MEMORABLE.** The review
screen's entire payload is the taker thinking *"I know I answered five cents."*
That only works if the answer is the kind of thing a person remembers deciding.
Long clauses blur together and a falsified row lands on nothing. Aim for
`5 cents`, `None of the above`, `Neither` — not
`Some floodazzles may be gebbleflips under certain conditions`. This matters most
for the three `crt` items, because the falsifier always prefers a CRT question
the taker got **right**.

**(c) Q17, Q18, Q20, Q21 and Q22 carry a trick in EVERY run.** This falls out of
settled decisions (Q24 excluded from tricks, `TRICK_COUNT` = 7, non-adjacency
relaxed from Q17). Placement in the back half is deterministic; only trick types
vary. **Write those five as ordinary-looking items where a misclick feels
plausible** — not ones where the taker will have a strong sense of exactly which
option they meant to press.

**(d) Two parlour-game items for `affect` slots (owner's idea).**
- *"Which of these animals do you prefer?"* — purports to measure how the
  subject sees themselves.
- *"Which of these colours do you prefer?"* — purports to measure how the subject
  believes others perceive them.

Put the animal at **Q15** and the colour at **Q20** — well separated, both inside
the descent. Both take `nonsense: false` and `correct: null`. They do a job
nothing else does: they are the first items that feel genuinely *about* the
taker, and the belief that they mean something is exactly the credulity the
certificate then trades on.

Recommendation: have the certificate name the animal mechanism explicitly
(*"Selection of the HERON is consistent with a subject whose self-concept is
organised around patience rather than force"*) and leave the colour oblique. One
named mechanism sells the apparatus; two starts to read as a magazine quiz.

**(e) The descent's `affect` questions are where the mid-life material enters the
questions themselves.** This is the natural home for it — the point where the
instrument stops asking about the problem and starts asking about the person.

---

## 2. Workstream B — re-aim the certificate prose

`src/statements.js` already holds 24 Barnum statements and 16 insinuations in
four escalating tiers. They work, but they are written for a general audience.
Re-aim them at the reader described above. **Keep the counts exactly: 24 Barnum,
and 4 tiers of exactly 4.** The report draws 10 Barnum and exactly one
insinuation per tier, in tier order, and tests pin those numbers.

### Where the mid-life content goes — and where it must not

Put it in the **prose**: the Barnum pool, the insinuations, and the descent's
`affect` questions. **Keep the seven faculties clinical and content-free** —
they must stay plausible psychometrics with invented names
(`REFLECTIVE LATENCY INDEX`, `BELIEF-BIAS RESISTANCE`, and so on). The joke
depends on a dispassionate apparatus delivering personal material. If the faculty
labels start referencing regret, the instrument stops being an instrument and
becomes a greetings card.

### Register, by example

Not content to use verbatim — the aim:

- **Barnum, re-aimed:** *"The subject retains a clear memory of the point at
  which a different professional trajectory was available, and has revisited it
  more recently than they would report."*
- **Insinuation, tier 1 (barely off):** *"Subjects in this band commonly maintain
  an unread accumulation of professional reading."*
- **Insinuation, tier 2 (private, deniable):** *"Periodic examination of former
  colleagues' current positions is characteristic of this profile."*
- **Insinuation, tier 3 (the breach):** *"The subject has calculated, to the year,
  how long they would need to continue."*
- **Tier 4 is the Recommendations closer** — flattest delivery, worst content.

### The insinuation criterion is unchanged

**Privately near-universal, publicly unadmitted.** True and unspeakable, never
random. A known audience makes this far easier to hit: arm-licking is
universal-human, but *"has rewritten a resignation message without sending it"*
is universal to *these* readers and lands twice as hard.

### Placement discipline (enforced by tests — do not fight it)

- The **Summary block contains no insinuation.** It must read as immaculate; it
  is what re-establishes trust immediately after the falsified review sheet.
- Insinuations sit at **sentence 3 of 5**, mid-paragraph, in interpretation
  paragraphs 2 and 4. Never a bullet, never a sentence opener. The paragraph
  continues past it without pausing. **The document does not notice what it just
  said** — the flatness is the joke, not the content.
- The report **closes on a Barnum statement**, never an insinuation. Warm,
  universal, faultless. Face straight on the way out.

---

## 3. Tone pass — the debrief is now load-bearing

`renderDebrief` in `src/ui/screens.js` honestly explains the Forer effect,
cognitive reflection, the lying timer, the interfered-with clicks, the three
falsified answers and the misspelled name.

It was a nice-to-have when the content was nonsense words. **With this audience
it is the mercy.** Aiming this precisely turns a Barnum gag into something that
can genuinely connect. A friend reading a joke certificate is fine; a friend
reading a document that quietly and accurately enumerates the compromises of his
working life may not be, especially if he is having a worse year than you know.

Two mitigations, both mandatory:

1. **Punch at the shared condition, never at the individual's failure.** The
   subject of every line is the profile, not the person's inadequacy. *"This is
   characteristic of the band"* is funny. *"You settled"* is the same sentence
   with the subject changed, and it is not.
2. **Give the debrief genuine warmth.** The reveal that *everyone* receives these
   sentences is what converts "that stung" into "ah — it got me the way it gets
   everyone." Keep the honest explanation; add the kindness.

---

## 4. How to verify content changes

```bash
npm test                 # 244 tests; validateQuestions enforces the schema
npm run build            # produces dist/index.html
tools/probe/run.sh       # full browser click-through, prints what it saw
```

`tools/probe/run.sh` is the harness that caught the defects the unit suite could
not — it needs Chrome (override with `CHROME=…`). Read `tools/probe/driver.js`
before trusting a surprising result: a failing check there has twice turned out
to be the probe's bug, not the app's.

**After authoring, confirm in the probe output:**
- `review: falsified deposit rows (excluding timeouts) = 3` — the three cuts land
- `REFUSED` markers appear on timed-out and locked-out questions
- `any literal "undefined" on screen? false`
- the certificate footer renders a sane ordinal (`81st`, not `81th`)

---

## 5. Playtest protocol

**Testers are single-use.** Once someone knows, they can never meet it cold
again, and no iteration recovers them. Build to a high standard before showing
anyone; the playtest budget is a finite resource.

Ask each tester exactly one question afterwards:

> **"At which question number did you first suspect?"**

A number, not a vibe. **Target: past Q20.** Below Q15 means the descent bites too
early — re-tune `REAL_MS` in `src/clock.js` before burning the next tester.

Two supporting questions: *"Did you notice anything about the timer?"* (if raised
unprompted, the red-digit threshold or the curve is too aggressive) and *"Did you
edit the review screen?"* (measures the filing-fee decision, and will be the most
interesting data in the project).

---

## 6. Known open items, none blocking

- **The repo is the spoiler.** `docs/` is served publicly from Pages, so
  `…/docs/superpowers/specs/…` explains every trick. Nobody will stumble on it,
  but a curious friend would find it.
- **If a playtester says the clock "felt fast"**, revert the red timer digits
  first — see spec §4. It is the change most likely to have invited that
  scrutiny.
- **If the farce phase reads as hostile rather than uncanny**, drop
  `TRICK_COUNT` from 7 to 6 in `src/tricks.js`. That restores variation in which
  late slot is spared; it is a one-line change.
- The deposit's honest timing now ends at **Q5**, not Q10, while tricks still
  start at Q11. If 30 seconds feels rushed against real cognitive-reflection
  items, consider giving Q1–5 *more* real time than the face claims — a generous
  opening strengthens the deposit rather than weakening it.
