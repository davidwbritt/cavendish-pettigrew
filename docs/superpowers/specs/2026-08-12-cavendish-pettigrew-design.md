# The Cavendish–Pettigrew Reflective Aptitude Inventory, Form 4-B

**Design spec — 2026-08-12**

A spurious cognitive and personality assessment. It opens as a genuine timed
test, degrades imperceptibly into farce, cheats the taker in ways designed to be
mistaken for their own failings, falsifies their transcript, and then grades them
with total clinical seriousness.

The piece is a working demonstration of the two phenomena it pretends to measure:
**cognitive reflection** (your intuition confidently betrays you) and the
**Forer/Barnum effect** (you will accept any sufficiently flattering description
as personally accurate).

---

## 1. Principles

These govern every downstream decision. When a later choice conflicts with one of
these, the principle wins.

1. **Stealth is the product.** The illusion of a real instrument is maintained as
   long as possible. It breaks exactly twice, both deliberately: the Q23 finale,
   and the insinuations in the certificate.
2. **Deniability.** Every cheat must be survivable as *"I misclicked"* or
   *"I'm slowing down."* Covert sabotage, never acknowledged.
3. **Non-monotonic drift.** A steady ramp gets noticed. A sawtooth does not.
   Recovery questions periodically restore trust and destroy the taker's ability
   to locate the seam.
4. **Every cheat is correctable.** An uncorrectable wrong answer produces rage.
   A correctable one produces self-doubt — and generates the telemetry that
   convicts the taker later.
5. **The apparatus must be boring.** Production values read as institutional and
   humourless. Nothing looks designed; it looks administered.
6. **Insinuations are privately near-universal but publicly unadmitted.** True and
   unspeakable, never random. This is the sole criterion for writing them.

---

## 2. Architecture

Authored fixed sequence — all 24 questions hand-written, drift curve and trick
placement hand-tuned to exact question indices. Comedy timing is the entire
product, and timing is not something a generator does well.

The **certificate statement pool shuffles per visit**, so two people comparing
results get different diagnoses off identical architecture.

No `#seed` URLs (following Spinelli's retirement of seeds). The **certificate is
the share object**, not the link.

Single HTML file, no dependencies, no network, no build step — house style.

---

## 3. The arc

24 questions, roughly 8 minutes, then two closing screens.

### Q1–10 — The Deposit

Scrupulously fair on tricks, honest on timing only through Q5. **No tricks
whatsoever** run before Q11 — that part of the deposit still runs the full
ten questions. But the honest 30-second clock now covers only Q1–5; Q6–10
already begin the real-duration rush described in §4, quietly, before the
trick bag itself has opened. This is the trust deposit that everything later
spends.

Composition: 3 cognitive-reflection items · 3 formal syllogisms in real English ·
2 sequence · 2 spatial.

> **Use novel cognitive-reflection items, not the canonical Frederick (2005)
> three.** Bat-and-ball, the widget problem, and the lily pad are too widely
> known; a tester who recognises them answers correctly and instantly, and the
> deposit fails. Write new items in the same family — where the intuitive answer
> is fluent, confident, and wrong.

The taker will get some of these wrong on their own merits. By Q10 they have been
fooled by themselves, fairly, and have documented reason to distrust their
instincts rather than the instrument.

### Q11–20 — The Descent

Nonsense vocabulary enters **through the syllogisms first**, where it is
invisible: the logical form stays valid, so *floodazzles* and *gebbleflips* read
as domain jargon rather than farce. Real timer begins its slide. Trick bag opens.
Questions begin quietly asking about the taker rather than the problem.

**Q13, Q16 and Q19 are recovery questions** — clean, fair, fully solvable, no
tricks, full honest time. Each reseals the ground behind it.

### Q21–24 — The Farce

Openly ridiculous; tone, timer and layout rigidly unchanged. Bubba is by now a
recurring figure with an established sock drawer. No wrong answers exist and the
instrument never says so. Cursor finale at Q23. Q24 is short and almost gentle.

### Review screen

The falsified transcript. See §6.

### Certificate

See §7.

---

## 4. The timer

**The displayed timer always reads 30 and always counts 30 → 0.** Only the *rate*
changes. Nobody times a countdown against a stopwatch.

Real wall-clock duration by question:

| Questions | Real duration |
|---|---|
| Q1–5 | 30s — honest |
| Q6–10 | 28s, 26s, 24s, 22s, 20s |
| Q11, Q12 | 18s, 16s |
| **Q13** | **30s — recovery, honest** |
| Q14, Q15 | 15s, 14s |
| **Q16** | **30s — recovery, honest** |
| Q17, Q18 | 13s, 12s |
| **Q19** | **30s — recovery, honest** |
| Q20 | 11s |
| Q21–24 | 10s — floor |

**Hard floor of 10 seconds.** Never lower, at any index, under any condition.
The honest deposit was retuned to end at Q5 rather than Q10 — the rush now
starts one full act earlier, quietly, while the trick bag itself still waits
until Q11 (see §3 and §5).

Expiry auto-submits whatever is currently highlighted. Displayed digits and the
depletion rule are both driven from the same fake clock.

**Below 10 displayed seconds, the timer digits render in the correction red**
(`--red`, the same token as everything else saturated in this document — see
§9). Digits only; the hairline depletion bar is deliberately left alone, and
there is no transition or flash — the colour simply changes on the tick that
crosses the threshold. Purely typographic, and it never fires early: a fresh
question's `0:30` never inherits red from the question before it.

By Q24 the taker receives a third of the time the instrument claims to have
given them, fails accordingly, and concludes that they are slowing down. The
certificate later confirms this.

---

## 5. The trick bag

Nothing fires before Q11. Nine named tricks; seven fire per run (`TRICK_COUNT`).

### Pointer/mouse tricks

| Trick | Behaviour |
|---|---|
| Dead click | First click does not register. Occasionally the second does not either. |
| Ghost selection | Marks the option adjacent to the one struck. |
| Double-mark | Two options illuminate; only one is what submits. |
| Button flinch | Option shifts ~3px on mousedown, so the click lands in the gap. |
| Sticky answer | Selection quietly reverts to the previous choice after ~1s. |
| Phantom lock | An option greys out as "already selected" as the taker reaches it. |
| **Lockout** | **No option responds at all for the rest of the question. The timer expiring is the only resolution — see below.** |
| **Text swap** | **After the taker commits, their chosen option's text swaps with another option's, ~150ms into the post-selection hold.** |

### Touch variants

Button flinch and phantom lock have no meaning without a cursor. Touch requires
its own equivalents — a tap that lands as a scroll, a selection requiring a
firmer or longer press. Mobile is in scope (both prior arcade titles shipped to
itch mobile), so these are not optional. Lockout is pointer-agnostic (a
swallowed click is a swallowed tap) and text swap is purely visual — both are
identical on touch, unlike the two above them.

### Scheduling invariants

1. Nothing before Q11.
2. **Never on a recovery question** (Q13/Q16/Q19) — sabotaging one wastes it.
3. Maximum one trick per question.
4. **Never two consecutive questions below Q17.** From Q17 onward, consecutive
   placements are allowed. This was relaxed specifically to make `TRICK_COUNT`
   7 achievable: the eligible slots are `[11, 12, 14, 15, 17, 18, 20, 21, 22]`,
   and with the old blanket non-adjacency rule the true maximum was 5 (one per
   adjacent pair). Below Q17, {11,12} and {14,15} still each contribute at
   most one slot — 2 early, maximum. From Q17 the five late slots
   (17,18,20,21,22) are always available together — 5 late. 2 + 5 = 7,
   exactly `TRICK_COUNT`, so every valid schedule fills every late slot on
   every run; only which trick lands on each varies. Accepted, not a bug.
5. Never the same trick twice in succession.
6. **Every trick except lockout is escapable.** The taker can always reach
   and set their intended answer before submission.
7. **At most one lockout per run.** Enforced in the scheduler.

### Lockout — the one trick that isn't escapable

Genuinely locks the options: nothing commits, for the rest of the question,
for mouse, touch, or keyboard alike. This reverses invariant 6 above, and is
safe only because of the timeout rewrite that already changed what expiry
does: expiry used to record a blank answer, which would have made an
unescapable lockout a true dead end. Now expiry always picks an answer (the
injected seeded rng) and the review sheet brands the row REFUSED — so a
lockout simply resolves into the instrument answering on the taker's behalf,
same as any other timeout, just guaranteed rather than possible. It is never
scheduled on a recovery question or Q23 (both already excluded from the
eligible slots, where the timer cannot be frozen — the only timer freeze in
the piece is the Q23 finale's, and Q23 never carries a trick), and at most
one lockout ever fires per run, so the taker is never forced twice. No
visual announcement: the options still show their normal hover affordance,
which is what makes it crueller — they simply do nothing.

### Q23 — the finale

Timer freezes, cursor locks, then releases into a slow drift toward the
lower-left corner. This one is *not* deniable, and that is intentional: it is
the mask visibly slipping, immediately before a certificate that grades the
taker with total seriousness anyway. The straight face *after* being caught
lying is funnier than the straight face before.

The drift is deliberately unhurried and aimed at a single destination rather
than any kind of flourish — a spiral or flourish reads as an animation
somebody authored, while a slow, steady pull toward a corner reads as
something dragging the taker's mouse. The former is a magic trick; the latter
is the wrongness the finale is supposed to leave behind.

Freezing the timer during the finale means the trick costs the taker nothing —
which reads as haunted rather than unfair.

**Implementation.** A page cannot move the OS cursor. Pointer Lock API is
unsuitable: browsers overlay a "Press Esc to exit" notification that would
puncture the effect. Instead: `cursor: none` across the test surface plus a
synthetic cursor drawn and fully controlled by us — freezable, laggable,
driftable — with clicks hit-tested against the *drawn* position rather
than the real one. The real pointer continues moving invisibly underneath.

Esc and any keyboard input restore everything instantly. This is both the
accessibility escape hatch and a mercy.

### The subject name — a persistent deception

Not a per-question trick but a slow one, running the length of the instrument.

A landing screen collects the taker's name into the `SUBJECT` field of the form
header, which is visible on every subsequent screen. **From Q11 onward the
displayed name carries a single introduced typo.**

This is the highest-value deception in the design per line of code, and the only
one that *persists*: every other cheat is a moment, while this sits in peripheral
vision for twenty minutes without ever quite resolving.

**Rules:**

1. **Plausibly the taker's own.** Adjacent-key substitution, transposition of two
   letters, a doubled letter, or a dropped letter — corruptions a hand makes.
   `DAVDI` and `DVAID` are human. `DAV1D` is a computer, and gives the game away.
2. **Correct throughout Q1–10.** The typo enters with the descent at Q11, keeping
   the deposit clean.
3. **It never changes again.** One stable corruption for the remainder. A name
   that keeps morphing announces itself immediately.
4. **The certificate carries it** — the permanent, screenshotted artifact, with
   the taker's name misspelled.
5. **No EDIT control on the name at review.** Amendment is offered everywhere it
   costs two points and withheld in the one place the taker would want it.

**Edge cases:** names too short to corrupt plausibly (1–2 characters), names with
no adjacent-key candidates, non-Latin scripts, and an empty submission all need
defined fallbacks — including the option of leaving the name uncorrupted, which
costs only this one gag.

The name is never transmitted; the instrument is offline and single-file.

---

## 6. The review screen

Presents the full transcript for review. **Exactly three answers have been
altered**, all drawn from Q1–10, with at least one being a cognitive-reflection
item the taker answered *correctly*.

Those are the questions with firm memory attached — the ones where the taker
overcame their own instinct and felt clever about it. Seeing the record say
otherwise is the deepest available cut, and it retroactively poisons the deposit:
Q1–10 were not the fair foundation, they were the bait.

**Certainty is the payload.** Three altered rows, never more. Half a wrong sheet
is a glitch; one row you are *sure* about is personal.

### Amendment

Each row carries an EDIT control. **It works.**

- **−2 points per amendment, applied whether or not the correction is right.**
  It is a filing fee for objecting.
- **No warning before the first edit.** The deduction lands *after*, so the taker
  then knows the price and must decide whether the truth about themselves is
  worth four more points on a test they already suspect. Most will let it stand.
- The correction is rendered in garish `#E4002B`, heavy condensed type, rotated
  ~2°, baseline slightly off, `mix-blend-mode: multiply`. It should look stamped
  by a different and angrier department. The −2 punches in at 1.4× scale and
  settles in ~350ms while the running total ticks down.

### Both paths are scored

- Amended → `POST-HOC REVISION ATTEMPTS: n — subject exhibits discomfort with
  their own record.`
- Untouched → `RECORD ACCEPTED WITHOUT AMENDMENT — subject demonstrates high
  deference to instrumentation.`

There is no correct move, and the instrument never says so.

### Secondary gag

The review sheet reports *displayed* times, so it will show 41 seconds spent on a
question that really allowed 20. Anyone who timed themselves gets one extra
moment of vertigo.

---

## 7. Scoring model

Every faculty is invented, but each is wired to something the taker genuinely
did, so the numbers move when they move. Names sit deliberately close to real
psychometric vocabulary (WAIS reports index scores with names of exactly this
shape).

| Faculty | Derived from | Status |
|---|---|---|
| REFLECTIVE LATENCY INDEX | Real response times, Q1–10 | Real data, unearned conclusion |
| BELIEF-BIAS RESISTANCE | Acceptance of invalid syllogisms with believable conclusions | **Genuinely valid** — real construct, real measurement |
| PREMISE TOLERANCE | How often a malformed premise was accepted rather than rejected | Measures something real |
| SET-SHIFTING COST | Performance drop immediately following each recovery question | Measures our own sawtooth, reported as the taker's deficit |
| RESPONSE CONSISTENCY (κ) | Answer changes mid-test plus post-hoc amendments | Real, and largely our doing |
| COMPOSURE | Pointer distance travelled during the Q23 freeze | Measures panic, fairly |
| SEMANTIC SATIATION THRESHOLD | Count of repeated nonsense tokens appearing in questions seen | **Nothing to do with the taker whatsoever** |

Semantic satiation is a real, well-documented phenomenon, sounds impeccable, and
is computed entirely from a property of the question set. It will be the last
thing anyone questions.

Belief-bias resistance being *actually valid* is deliberate — as, more loosely,
are premise tolerance and composure. A panel in which several measurements are
legitimately sound is far harder to dismiss than one that is uniformly fake.

Sub-scores are computed from the **altered** transcript, so the certificate is
perfectly internally consistent — the arithmetic checks out, only the inputs are
fabricated. There is nothing to argue with.

**Headline centile is always flattering — 75th to 85th, never lower.** Still
comfortably complimentary, but far more credible. Load-bearing: the insults live
in the sub-scores and the prose, so the overall number must feel like good news or
the record will not be accepted. Real personality tests work exactly this way.

**Classification** is assembled from the two most extreme indices — highest
supplies the adjective, lowest the noun — rendered clinically, e.g.
`PROFILE 4-B — DEFERRED ANALYTIC`. Nonsense vocabulary stays out of the
certificate's structure entirely.

Footer: `σ = 0.03 · n = 1 · p < .0001`. The `n = 1` is there for whoever is
paying attention.

---

## 8. Certificate prose

Barnum statements are rewritten out of horoscope voice into assessment-report
voice — third person, hedged, faintly condescending.

> ~~"You have a tendency to be critical of yourself."~~
> **"The subject presents as markedly self-critical in a manner not typically
> apparent to observers."**

Same statement; the second is evidence.

### Structure — follows a real neuropsychological report

1. **Administrative block** — date, duration, instrument version,
   `administered under standard conditions` (it was not)
2. **Summary of Findings** — immaculate, zero insinuations. Re-establishes trust
   after the review screen
3. **Index-by-Index Interpretation** — one paragraph per faculty, Barnum threaded
   through
4. **Behavioural Observations** — the amend/don't-amend verdict lands here
5. **Recommendations and Limitations** — the closer

### Escalation — four insinuations across ~14 statements

| # | Placement | Intensity | Example |
|---|---|---|---|
| 1 | Interpretation ¶2 | Barely off | *"Subjects in this band commonly reread messages they have already sent."* |
| 2 | Interpretation ¶4 | Private, deniable | *"Rehearsal of unresolved arguments during periods of low cognitive demand is characteristic of this profile."* |
| 3 | Behavioural Observations | The breach | *"There is a moderate likelihood the subject has licked their own forearm and smelled it."* |
| 4 | Recommendations | Flattest, worst | *"The subject is advised that the practice of smelling one's own clothing to determine whether it requires laundering is not diagnostic."* |

### Placement discipline

Never a bullet. Never a sentence opener. Never in the Summary. Each insinuation
is sentence three of five, mid-paragraph, and the paragraph continues past it
without pausing. **The document does not notice what it just said.** The flatness
is the joke, not the content.

The final line is warm, universal and faultless — face perfectly straight on the
way out.

### Pool sizing

24 Barnum statements (10 shown) · **16 insinuations in four intensity tiers of
four**, tier 4 being the Recommendations closer. Draw exactly one per tier, in
tier order. 10 + 4 = the ~14 statements of the report. The escalation curve
survives any shuffle.

### Sample fragment — Interpretation ¶4

> Depressed Set-Shifting Cost is consistent with the subject's response profile
> across items 13 through 19. The subject appears to prefer a degree of variety
> and becomes dissatisfied when constrained, though this preference is not always
> acted upon. Rehearsal of unresolved arguments during periods of low cognitive
> demand is characteristic of this profile. Compensatory strategies are evident
> and are, on the whole, adequate. No further comment is indicated.

---

## 9. Visual direction

Reference frame: 1970s–80s standardised testing. Wechsler record forms, ETS
booklets, optical-mark answer sheets. Institutional, cheap, humourless.

### Palette — four colours, one of them a crime

| Token | Value | Use |
|---|---|---|
| Paper | `#EDE8DA` | warm manila, never white |
| Ink | `#1A1712` | warm near-black, never pure |
| Process blue | `#2E4A6B` | form rules, registration marks, field labels only |
| **Correction red** | `#E4002B` | the only saturated element in the document |

### Typography

System stacks only — single-file and offline, so no webfonts. Georgia/Charter for
prose and questions; `ui-monospace`/Menlo for all data, scores and the timer.
Section headers in small caps with wide tracking over a hairline rule.

No rounded corners, no shadows, no gradients, no app chrome anywhere.

### Layout

Single centred column at a fixed ~62ch measure with generous paper margin. Form
header block at top: `SUBJECT · DATE · FORM · ADMINISTRATION`, filled with
plausible values. **Registration marks in all four corners** — the alignment
crosses from scannable forms. They cost nothing and do enormous credibility work.

Options are lettered boxes A–D, thin-ruled. Clickable, and easy for the trick bag
to misbehave with.

### The timer must be understated

Hairline depletion rule plus small monospace digits in the form grid, top right.
No large countdown, no urgency styling, no motion. A dramatic timer is a *game*
timer, and a game timer invites scrutiny. This one should be boring enough that
nobody thinks to check it against a watch.

**One deliberate exception** (added 2026-08-13): the digits turn `--red` below
`RED_THRESHOLD_MS`. This is a knowing trade against the paragraph above — it
points at the one component that is lying. It is judged worth it because the
face always drains 30 → 0 linearly, so looking harder reveals nothing; only
timing it against a real clock would. Nothing else about the timer changes: no
size change, no motion, no colour on the depletion rule.

**If a playtester ever reports that the clock "felt fast", revert this first.**
It is the single change most likely to have invited that scrutiny.

### Motion — essentially none

Question transitions are instant cuts, like turning a page. Any easing anywhere
reads as "web app" and costs credibility. The stillness is what makes the two
exceptions violent: the trick bag, and the red.

### The certificate is the distribution mechanism

It is what gets screenshotted and sent onward, so it must be explicitly composed
to fit a portrait phone screenshot without cropping. Ruled index table, monospace
score bars, thin double-rule border, statistical footer. Design it as an object
that wants to leave the page.

### Accessibility

Full keyboard navigation throughout. Esc restores the cursor instantly.
`prefers-reduced-motion` disables the Q23 finale and the button flinch.

---

## 10. Edge cases — require explicit rules, not discovery

1. **Taker answers nothing**, letting every timer expire.
2. **Taker gets all cognitive-reflection items wrong** — falsification has nothing
   satisfying to alter. Needs a defined fallback target.
3. **Taker amends every row** — score floor behaviour.
4. **Keyboard-only taker** bypasses most of the trick bag and must still receive a
   coherent report. A small accessible escape hatch is acceptable, arguably good.
5. **`prefers-reduced-motion` taker skips the Q23 finale, leaving COMPOSURE with
   no input.** Requires either an alternate derivation or suppression of the index
   with a plausible note.

---

## 11. Validation

### The governing constraint: testers are single-use

Once someone knows, they can never test it again, and no iteration recovers them.
This inverts the usual build-cheap-and-iterate approach — the piece must be
near-final before the first person sees it, and the playtest budget is a finite
resource to be spent deliberately.

### The one metric

Every tester is asked exactly one question afterward:

> **"At which question number did you first suspect?"**

A number, not a vibe. **Target: past Q20.** Below Q15 means the descent is too
steep or a trick fired too early; re-tune the drift curve before burning the next
tester.

Supporting questions:

- *"Did you notice anything about the timer?"* — if raised unprompted, the rate
  curve is too aggressive and the floor needs raising.
- *"Did you edit the review screen?"* — measures the filing-fee decision, and will
  be the most interesting data in the project.

Five or six testers, run one at a time, re-tuning between. Same soft-seeding
pattern used for Smallfolk.

### Automated tests

Node tests in the Spinelli mould — most of this is invariants rather than feel.

- Displayed timer always runs 30 → 0; real duration matches the §4 table and
  **never** drops below 10s at any index
- Trick scheduler satisfies all six invariants in §5, property-tested across many
  simulated runs
- **Every trick is escapable** — for each, simulate the sabotage and assert a
  subsequent interaction can still reach and set the intended answer
- Falsification: exactly 3 altered rows, all from Q1–10, at least one a
  cognitive-reflection item answered correctly
- Amendment: −2 applied regardless of correctness; score respects its floor
- Certificate: headline centile always 75–85 · exactly four insinuations · one per
  tier in tier order under any shuffle · none in the Summary block · closer is
  always Barnum · no statement repeats within a single certificate
- Faculty computations are pure functions of the transcript (snapshot tested)

---

## 12. Shipping

- Single HTML file, no dependencies, no network, no build step
- Local project directory `/home/dave/Projects/aptitude/`; GitHub repo
  `davidwbritt/cavendish-pettigrew`, canonical branch `develop`. Pages plus
  itch.io under `clevermonkey`, alongside Bumper Crop and Spinelli
- Portrait, with the itch orientation dropdown set explicitly — itch derives
  mobile orientation from embed aspect ratio plus that dropdown (lesson from
  Bumper Crop's forced-landscape embed)
- AI disclosure answered yes, consistent with the other titles
- **Not a Keeping House room.** It keeps nothing, and that framing's curatorial
  warmth would undercut the clinical register this depends on. Standalone.

### Debrief page

A short page reachable only by a small link *after* the certificate, honestly
explaining the Forer effect and cognitive reflection. It converts the piece from a
prank into a demonstration — which is what makes people pass it on — and gives
anyone who feels genuinely got-at somewhere to land.

**The Ko-fi link belongs here**, not on the certificate. A donation ask on the
certificate would puncture the tone completely.
