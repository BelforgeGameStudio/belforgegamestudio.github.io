# T16 Roster & Party Builder — TODO / future-session prompts

Self-contained prompts for future Claude Code sessions. Each block is copy-pasteable into a fresh
session (which has no memory of prior chats). Both assume you'll **read `roster-builder.NOTES.md`
first** — it's the architecture/decision log for this page.

Repo root: `C:\Users\domin\OneDrive\Work\MyWorkspace\BelforgeGameStudio\belforge.github.io`

---

## 1. Phase-2 Monte Carlo combat sim (model the conditional skills)

Lets the conditional ("sim"-flagged) hero/champion skills finally affect the win-chance grade.

```
Build the Phase-2 Monte Carlo combat sim for the T16 Roster & Party Builder, so the
conditional ("sim"-flagged) hero/champion skills finally affect the win-chance grade.

Repo: C:\Users\domin\OneDrive\Work\MyWorkspace\BelforgeGameStudio\belforge.github.io
Main file: iplaygames/shop-titans/_js/roster-builder.js  (one big IIFE)
READ FIRST: iplaygames/shop-titans/roster-builder.NOTES.md — the architecture/decision log.
Verify changes by serving the site locally (NOT file://) and loading
iplaygames/shop-titans/roster-builder.html; check the browser console for errors.

WHY: today the party grade is a CLOSED-FORM estimate (`partyOutcome` -> `winChance` ->
`unitDeathModel`), good for an average but it can't model state-dependent skills, so those are
deferred. Flat skill parts ARE folded (saves, eva caps, champion stat auras, per-class crit-damage
data). The CONDITIONAL parts are captured in CLASS_SKILLS / CHAMPION_SKILLS with a `sim:true` flag +
description, shown in the (i) tooltips, but DON'T move the grade. This task models them.

CONDITIONAL SKILLS TO MODEL (all currently sim-flagged):
- Jarl: +50% ATK & +10% EVA below 80% HP (doubled <55%, tripled <30%)
- Death Knight: execute weakened enemies + +1% per kill (also revisit MZE "4 monsters" vs single-10M model)
- Daimyo: guaranteed dodge & crit on round 1
- Conquistador: +25% crit damage per consecutive crit (stacks x4)
- Sensei: +50% crit & +25% EVA until damaged (regained after 2 rounds)
- Acrobat: guaranteed crit after dodging
- Bishop: +10 HP regen/turn (+ already-modeled survive-fatal save)
- Champions: Rudo +50% crit for 4 rounds; Hemma HP-drain->self-heal + ATK stacking; Lilu/Hemma heal 20 HP/turn

COMBAT MODEL (honor the existing `MZE` constants — don't reinvent): bossHP 10,000,000; single hit
baseHit 410, AoE aoeHit 280 at aoeChance ~0.225/round hitting ALL units; enemy crit critHit 615
(ignores DEF) at critChance 0.10; DEF reduction via `mzeDefMult`; evade = EVA-20 (evaPenalty),
capped 75% (evaCapDefault, Pathfinder 78); roundCap 500 = auto-loss if boss not dead. Targeting is
by THREAT share. Reuse `survStats`, `mzeDefMult`, `effAtkOf`/`buffedEffAtk`, `critMultOf`,
`partyBuff`, `partyUnits`.

WHAT TO BUILD:
1. A per-round fight simulator `simulateFight(units, opts)` -> win/loss for ONE trial:
   each round: pick a single-target by threat share (dodge check), roll a possible AoE (dodge check
   per unit), apply DEF-reduced + crit damage; units die at HP<=0 (Lord/Bishop save -> 1 HP once);
   recompute party damage from ALIVE units WITH conditional buffs applied for this round (Jarl HP
   thresholds, Conq consecutive-crit stacks, Sensei until-damaged, Acrobat after-dodge, Daimyo
   round-1, DK execute/stacking, healing-over-time); subtract from boss HP. Win = boss dead before
   roundCap AND not wiped; loss otherwise.
2. `simWinChance(units, N)` = run N seeded trials (use the existing `mulberry32` RNG for
   reproducibility), return wins/N. Wire it as the win source in `partyOutcome` (keep the closed-form
   `winChance` as a fast fallback / for `scoreOf` if the sim is too slow for the optimizer's inner loop).
3. Keep grades bucketed by the existing WIN_BANDS / GRADE_LETTERS (S>=95 A>=75 B>=65 C>=20 D<20).

CONSTRAINTS / GOTCHAS:
- Performance: `scoreOf` (Recommended) calls the win model thousands of times (all barriers x all
  tanks x parties + diversify). A full N-trial sim there may be too slow — consider keeping the
  closed-form for the optimizer's search and using the sim only for the DISPLAYED party grade, or
  cache, or use a small N. Decide and document the tradeoff.
- Determinism: seed the RNG so the same roster always shows the same %; otherwise the grade flickers.
  (The in-game faces fluctuate because the game samples live — our number should be the stable average.)
- This is large. Do it incrementally: (a) build the bare sim with NO conditional skills and confirm
  its win% ~= the current closed-form `winChance` on a few parties (sanity check the engine), THEN
  (b) layer in the conditional skills one at a time, re-checking. Validate against real in-game
  outcomes where possible.
- Update roster-builder.NOTES.md (the grade-model section + remove these from the "deferred/sim" list
  as they get implemented).
```

---

## 2. Site-wide: consolidate utils into the shared `BelforgeUtils`

Promote the page-local helpers into the shared site lib. Best done as part of a deliberate
site-wide cleanup pass (when all consumers are in view), not piecemeal.

```
Site-wide cleanup: consolidate the shop-titans page's utility helpers into the shared site utils
library. Repo root: C:\Users\domin\OneDrive\Work\MyWorkspace\BelforgeGameStudio\belforge.github.io

CONTEXT — there are two separate utils files today:
- js/utils.js — the SHARED site library, an IIFE that returns a `BelforgeUtils` namespace
  (callers do `BelforgeUtils.foo()`). Used by the main site's tools. Has escapeHtml,
  formatNumber, showToast, downloadFile, debounce, bitmask helpers, etc.
- iplaygames/shop-titans/_js/utils.js — page-local, 4 BARE GLOBAL functions used only by the
  roster builder: copyTextSmart, downloadTextFile, flashStatus, wireCopyButton. All 4 are
  generic (copy/flash/download) — none are roster-specific.

GOAL: promote those 4 generic helpers into the shared `BelforgeUtils` namespace, then delete
the page-local copy. Do NOT just concatenate the files — promote into the namespace cleanly.

STEPS:
1. Add copyTextSmart, downloadTextFile, flashStatus, wireCopyButton into js/utils.js inside the
   BelforgeUtils IIFE, and expose them on the returned object. (wireCopyButton depends on
   copyTextSmart, so keep them together.) Watch for any name clash with existing BelforgeUtils
   members (e.g. there's already a downloadFile — keep both or reconcile).
2. In iplaygames/shop-titans/roster-builder.html: replace the `<script src="_js/utils.js?v=...">`
   tag with `<script src="../../js/utils.js">` (load it BEFORE roster-builder.js / roster-data.js).
   Note: build.py auto-stamps a ?v= cache-buster onto local .js tags, so don't hand-add ?v=.
3. In iplaygames/shop-titans/_js/roster-builder.js: update the call sites — `flashStatus(...)` ->
   `BelforgeUtils.flashStatus(...)`, same for wireCopyButton / copyTextSmart / downloadTextFile.
   Grep first to find them all (several flashStatus + a couple wireCopyButton calls).
4. Delete iplaygames/shop-titans/_js/utils.js.
5. Verify: `node --check` the JS, then load roster-builder.html via a local static server (NOT
   file://, because of relative paths) and confirm no console errors, the Share modal's
   "Copy Full Link (bookmark)" / "Copy Discord Link (compact)" buttons still copy + flash, and
   Download/Upload still work. Read roster-builder.NOTES.md first and update the Files section after.

PRINCIPLE for the broader pass: a helper graduates to BelforgeUtils the moment a 2nd page needs
it; page-specific logic (the roster builder's combat/grade/build code in roster-builder.js) stays
page-local. Don't turn BelforgeUtils into a junk drawer.
```
