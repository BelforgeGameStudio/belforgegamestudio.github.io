/** @format */

// _js/t16-roster-builder.js
//
// T16 Roster & Party Builder — data-driven app view rendered into #app.
// All structural chrome uses Tailwind theme classes. The only hex lives in the
// SEMANTIC COLOR MAPS below: element / group / status colors are domain data
// (like chart category colors), not theme tokens, so they live here as data.
// Values are tuned for legibility on the light `bg-background` theme.

(function () {
  "use strict";

  /* ---------------- semantic data colors (tuned for purple cards) ---------------- */
  var EL_COLOR = {
    none: "#C9AEBC", air: "#22D3EE", dark: "#A78BFA", earth: "#4ADE80",
    fire: "#FB7185", gold: "#FBBF24", light: "#FDE047", water: "#60A5FA", all: "#FFFFFF"
  };
  var GROUP_COLOR = { Fighter: "#FBBF24", Rogue: "#34D399", Spellcaster: "#60A5FA" };
  var COL = {
    emerald: "#34D399", amber: "#FBBF24", rose: "#F87171",
    muted: "#D9C2CE", text: "#FFFFFF", border: "#E0DFDC"
  };

  /* ---------------- data ---------------- */
  // Active barrier elements now live in state.barriers (player-configurable in the Filters panel,
  // persisted in JSON). Default = dark/light/earth (T16 MZE). COVERAGE_ELS is the full element set.
  var COVERAGE_ELS = ["dark", "light", "earth", "fire", "air", "water"];
  var DEFAULT_BARRIER_ELS = ["dark", "light", "earth"];
  // Roster Objective presets (player-chosen in Filters; drive how Recommended optimizes). Each maps to
  // the optimizer knobs: breadth on/off (spread barriers + diversify pass), the breadth floor, and the
  // soft per-class cap. From meta min-max (concentrate) to a resilient well-rounded roster (spread).
  var OBJECTIVES = {
    balanced:  { label: "Balanced",  breadth: true,  floor: 3, softCap: 6, desc: "Strong, with enough class + barrier coverage to not be fragile." },
    resilient: { label: "Resilient", breadth: true,  floor: 3, softCap: 4, desc: "Max diversity + barrier coverage — survives zone / gear changes." }
  };
  var DEFAULT_OBJECTIVE = "balanced";
  var BARRIER_POWER_TARGET = 320;                       // border turns green when a barrier hits this
  var MAX_PARTIES = 12;                                 // party-slot cap
  var DEFAULT_MAX_ROSTER = 32;                          // default roster capacity
  var MAX_ROSTER_CAP = 36;                              // hard ceiling for roster capacity

  var CATALOG = [
    { name: "Mercenary", group: "Fighter", role: "Tank", element: "earth" },
    { name: "Chieftain", group: "Fighter", role: "Tank", element: "fire" },
    { name: "Lord", group: "Fighter", role: "Tank", element: "light" },
    { name: "Warden", group: "Fighter", role: "Tank", element: "air" },
    { name: "Jarl", group: "Fighter", role: "Tank/EVA", element: "fire" },
    { name: "Death Knight", group: "Fighter", role: "Tank", element: "dark" },
    { name: "Daimyo", group: "Fighter", role: "Tank", element: "water" },
    { name: "Grandmaster", group: "Rogue", role: "EVA/DPS", element: "water" },
    { name: "Conquistador", group: "Rogue", role: "EVA/DPS", element: "fire" },
    { name: "Pathfinder", group: "Rogue", role: "EVA/DPS", element: "earth" },
    { name: "Sensei", group: "Rogue", role: "EVA/DPS", element: "dark" },
    { name: "Acrobat", group: "Rogue", role: "EVA/DPS", element: "air" },
    { name: "Praetorian", group: "Rogue", role: "EVA/DPS", element: "light" },
    { name: "Archmage", group: "Spellcaster", role: "DPS", element: "fire" },
    { name: "Bishop", group: "Spellcaster", role: "DPS", element: "light" },
    { name: "Arch Druid", group: "Spellcaster", role: "DPS", element: "earth" },
    { name: "Warlock", group: "Spellcaster", role: "DPS", element: "dark" },
    { name: "Spellknight", group: "Spellcaster", role: "DPS", element: "all", note: "50% barrier power" },
    { name: "Astramancer", group: "Spellcaster", role: "DPS", element: "water" },
    { name: "Fateweaver", group: "Spellcaster", role: "DPS", element: "air" },
    { name: "Trickster", group: "Rogue", role: "EVA/DPS", element: "air" }
  ];
  var CLASS = {};
  CATALOG.forEach(function (c) { CLASS[c.name] = c; });
  // Tank = a high-THREAT class (its class-average threat clears the cutoff), not the hand-set role tag.
  // 75 matches the threat ≥ 75 "Tank" stat badge, so a class that shows that badge IS treated as a tank.
  // Currently this is the 7 Fighters plus Praetorian (threat 80, the reworked high-DEF/dodge wall).
  function isTank(cn) { return classAvg(cn, "threat") >= 75; }
  function elOf(cn) { return CLASS[cn] ? CLASS[cn].element : "none"; }

  // Per-class skills. Foldable fields feed the grade now; `sim`-flagged effects are
  // captured for the Phase-2 sim and don't yet move the face. `text` = display.
  //   evaCap       : overrides the default 75% dodge cap
  //   protectAlly  : party negates one lethal hit (once/battle)
  //   surviveFatal : the hero ignores one lethal hit to itself (once/battle)
  // (Crit damage is now a per-class DATA stat — classStats.critDmg — not a skill bonus.)
  var CLASS_SKILLS = {
    "Lord":         { protectAlly: true,                  text: "Protect an ally from a lethal attack once per battle." },
    "Jarl":         { sim: true,                          text: "+50% ATK & +10% EVA below 80% HP (doubled <55%, tripled <30%)." },
    "Death Knight": { sim: true,                          text: "Instantly defeats weakened monsters; +1% per kill." },
    "Daimyo":       { sim: true,                          text: "Guaranteed dodge & crit on round 1; +100% crit damage." },
    "Conquistador": { sim: true,                          text: "+150% crit damage; +25% per consecutive crit (stacks 4)." },
    "Pathfinder":   { evaCap: 78,                         text: "+3% max evasion cap (78%)." },
    "Sensei":       { sim: true,                          text: "+50% crit & +25% EVA until damaged; regained after 2 rounds." },
    "Acrobat":      { sim: true,                          text: "Guaranteed crit after dodging; +150% crit damage." },
    "Bishop":       { surviveFatal: true, sim: true,      text: "+10 HP regen/turn; survive one fatal blow." }
  };

  // Per-champion party auras (apply to the whole party at grade time). Foldable fields:
  //   atkPct/defPct/hpPct : ×(1+pct/100) on that stat   · barrierPct : ×(1+pct/100) on barrier power
  //   critAdd/evaAdd      : additive points to crit chance / evasion (user-confirmed)
  //   critDmgAdd          : added to the crit multiplier (base 2.0)
  //   perGroup            : composition-scaled (per spellcaster/fighter/rogue in the party)
  // `sim`-flagged conditional/heal parts are captured but don't yet move the face.
  var CHAMPION_SKILLS = {
    "Argon":   { atkPct: 40, defPct: 40,                       text: "+40% ATK & DEF to the party." },
    "Ashley":  { atkPct: 25, defPct: 25,                       text: "+25% ATK & DEF to the party." },
    "Rudo":    { barrierPct: 50, sim: true,                    text: "+50% crit chance for 4 rounds; +50% element power vs barriers." },
    "Malady":  { atkPct: 30, evaAdd: 15, critAdd: 10,          text: "+30% ATK, +15% EVA, +10% crit to the party." },
    "Yami":    { critAdd: 20, evaAdd: 20,                      text: "+20% crit & +20% EVA to the party." },
    "Sia":     { atkPct: 25,                                   text: "+25% ATK to the party." },
    "Hemma":   { hpPct: 25, sim: true,                         text: "Drains 7% ally HP/turn (heals self, +35% ATK/drain); +25% party HP." },
    "Polonia": { defPct: 25, evaAdd: 10,                       text: "+25% DEF & +10% EVA to the party." },
    "Donovan": { perGroup: { spellcasterAtk: 14, fighterHp: 10, rogueCrit: 7, rogueEva: 7 }, text: "+14% ATK/spellcaster, +10% HP/fighter, +7% crit & EVA/rogue." },
    "Lilu":    { hpPct: 25, sim: true,                         text: "+25% party HP; party heals 20 HP/turn." },
    "Bjorn":   { atkPct: 30, hpPct: 20, critDmgAdd: 0.5,       text: "+30% ATK, +20% HP, +50% crit damage to the party." }
  };

  var CHAMPION_POOL = [
    { name: "Argon",   el: "light", power: 200 },
    { name: "Bjorn",   el: "air",   power: 200 },
    { name: "Malady",  el: "light", power: 210 },
    { name: "Yami",    el: "dark",  power: 200 },
    { name: "Lilu",    el: "water", power: 200 },
    { name: "Sia",     el: "air",   power: 200 },
    { name: "Hemma",   el: "dark",  power: 200 },
    { name: "Donovan", el: "fire",  power: 200 },
    { name: "Rudo",    el: "fire",  power: 200 },
    { name: "Ashley",  el: "earth", power: 200 },
    { name: "Polonia", el: "water", power: 200 }
  ];
  var SEED_PARTIES = [
    { id: 1,  name: "Argon's Party",   champName: "Argon" },
    { id: 10, name: "Ashley's Party",  champName: "Ashley" },
    { id: 9,  name: "Rudo's Party",    champName: "Rudo" },
    { id: 3,  name: "Malady's Party",  champName: "Malady" },
    { id: 4,  name: "Yami's Party",    champName: "Yami" },
    { id: 6,  name: "Sia's Party",     champName: "Sia" },
    { id: 7,  name: "Hemma's Party",   champName: "Hemma" },
    { id: 11, name: "Polonia's Party", champName: "Polonia" },
    { id: 8,  name: "Donovan's Party", champName: "Donovan" },
    { id: 5,  name: "Lilu's Party",    champName: "Lilu" },
    { id: 2,  name: "Bjorn's Party",   champName: "Bjorn" }
  ];
  var SEED_HEROES = ([
    ["Lord", 1], ["Arch Druid", 1], ["Astramancer", 1],
    ["Death Knight", 2], ["Bishop", 2], ["Archmage", 2],
    ["Mercenary", 3], ["Warlock", 3], ["Conquistador", 3],
    ["Chieftain", 4], ["Sensei", 4], ["Praetorian", 4],
    ["Warden", 5], ["Bishop", 5], ["Pathfinder", 5],
    ["Jarl", 6], ["Warlock", 6], ["Pathfinder", 6],
    ["Death Knight", 7], ["Praetorian", 7], ["Astramancer", 7],
    ["Spellknight", 8], ["Archmage", 8], ["Conquistador", 8],
    ["Lord", 9], ["Sensei", 9], ["Arch Druid", 9],
    ["Bishop", 10], ["Pathfinder", 10],
    ["Grandmaster", 11], ["Spellknight", 11]
  ]).map(function (a, i) { return { id: i + 1, name: "", className: a[0], partyId: a[1], power: 0 }; });

  // Gear-quality tiers the class-average defaults assume (best -> worst, drives dropdown order).
  // Each tier holds its own full per-class table; switching tier re-skins every inherited stat.
  var QUALITIES = ["Legendary", "Epic", "Flawless", "Superior"];
  var DEFAULT_QUALITY = "Epic";
  function emptyClassTable() {
    var t = {};
    CATALOG.forEach(function (c) { t[c.name] = { hp: 0, atk: 0, def: 0, eva: 0, power: 0, crit: 0, threat: 0, critDmg: 2 }; });
    return t;
  }
  function normalizeQuality(q) {
    if (q == null) return null;
    var s = String(q).trim().toLowerCase();
    for (var i = 0; i < QUALITIES.length; i++) if (QUALITIES[i].toLowerCase() === s) return QUALITIES[i];
    return null;
  }

  var state = {
    maxRoster: DEFAULT_MAX_ROSTER,
    champions: CHAMPION_POOL.map(function (c) { return { name: c.name, el: c.el, power: c.power, hp: 1000, atk: 10000, def: 10000, eva: 0, crit: 0, threat: 0 }; }),
    classStatsByQuality: {}, // quality -> { className -> { hp, atk, def, eva, power, crit, threat, critDmg } }
    quality: DEFAULT_QUALITY, // active tier
    classStats: {}, // live reference to classStatsByQuality[quality] — classAvg & all readers use this
    classOrder: CATALOG.map(function (c) { return c.name; }), // priority order (feeds suggestions)
    heroes: SEED_HEROES,
    parties: SEED_PARTIES,
    // Build constraints applied by Auto Sort / Top-up / Recommended.
    //   exclude{cn:true} never use the class · max{cn:N} cap roster count · min{cn:N} require roster count
    filters: { exclude: {}, max: {}, min: {} },
    // Active barrier elements (player-configurable in Filters). Each party must break ONE of these
    // (≥ BARRIER_POWER_TARGET). Empty = no barrier requirement this zone.
    barriers: DEFAULT_BARRIER_ELS.slice(),
    // How Recommended optimizes (balanced | resilient). See OBJECTIVES.
    objective: DEFAULT_OBJECTIVE
  };
  QUALITIES.forEach(function (q) { state.classStatsByQuality[q] = emptyClassTable(); });
  // Point the active table at the selected tier. classAvg/panel/paste all read & write state.classStats,
  // which IS classStatsByQuality[quality] by reference — so edits land in the right tier and persist.
  function useQuality(q) {
    var nq = normalizeQuality(q);
    if (!nq) return;
    state.quality = nq;
    state.classStats = state.classStatsByQuality[nq];
  }
  useQuality(state.quality);

  // Filter helpers (whole-roster). fExclude = never use; fMax = cap (Infinity if unset); fMin = require.
  function fExclude(cn) { return !!state.filters.exclude[cn]; }
  function fMax(cn) { var m = state.filters.max[cn]; return (typeof m === "number" && m >= 0) ? m : Infinity; }
  function fMin(cn) { var m = state.filters.min[cn]; return (typeof m === "number" && m > 0) ? m : 0; }
  function classBlocked(cn, count) { return fExclude(cn) || (count || 0) >= fMax(cn); } // can't add another

  /* ---------------- state ops ---------------- */
  function setHero(id, field, v) { state.heroes.forEach(function (h) { if (h.id === id) h[field] = v; }); }
  function setParty(id, field, v) { state.parties.forEach(function (p) { if (p.id === id) p[field] = v; }); }
  function addHero(className) {
    var max = 0;
    state.heroes.forEach(function (h) { if (h.id > max) max = h.id; });
    // null stats = inherit the class average until overridden
    state.heroes.push({ id: max + 1, name: "", className: className || CATALOG[0].name, partyId: null, roleOverride: null, power: null, hp: null, atk: null, def: null, eva: null, crit: null, threat: null, critDmg: null });
  }
  function delHero(id) { state.heroes = state.heroes.filter(function (h) { return h.id !== id; }); }

  /* ---------------- champion & party helpers ---------------- */
  function getChampion(name) {
    if (!name) return null;
    for (var i = 0; i < state.champions.length; i++) if (state.champions[i].name === name) return state.champions[i];
    return null;
  }
  function partyChampEl(p) { var c = getChampion(p.champName); return c ? c.el : "none"; }
  function partyChampPower(p) { var c = getChampion(p.champName); return c ? (Number(c.power) || 0) : 0; }
  function partyCap(p) { return p.champName ? 3 : 4; } // no champion -> the 4th hero seat opens up

  // Stat resolution: a hero uses its own override when set, else the class average.
  // null/undefined/"" means "inherit"; a number (including 0) is an override.
  var PLANNING = false; // when true, heroStat ignores overrides & uses class averages (for suggestions)
  function classAvg(name, key) { var cs = state.classStats[name]; return cs ? (Number(cs[key]) || 0) : 0; }
  function heroStat(h, key) {
    if (PLANNING) return classAvg(h.className, key);
    var v = h[key];
    return (v === null || v === undefined || v === "") ? classAvg(h.className, key) : (Number(v) || 0);
  }
  function moveClass(name, dir) {
    var i = state.classOrder.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= state.classOrder.length) return;
    var t = state.classOrder[i]; state.classOrder[i] = state.classOrder[j]; state.classOrder[j] = t;
  }
  // Effective combat role: "tank" or "dps". Class default unless the hero has a roleOverride.
  // Effective role for the "1 tank per party" rule. Honors a saved roleOverride if present
  // (no longer set via UI — the hero badges are stat-driven now), else the class default.
  function heroRole(h) {
    if (h.roleOverride === "tank" || h.roleOverride === "dps") return h.roleOverride;
    return isTank(h.className) ? "tank" : "dps";
  }

  // Build an ideal roster on class-average stats, optimizing each party's win-chance
  // grade (the face). Per party: keep exactly one tank, cover a barrier (>=320), then
  // pack the remaining seats with the highest-ATK classes to minimize rounds-to-kill.
  // Tries all three barriers and keeps the build with the best face. Ties break by
  // matching the champion's element, then more ATK, then barrier margin — deterministic.
  // Fills party seats up to the roster cap, replacing all heroes.
  function buildSuggestedRoster() {
    var heroes = [], id = 1;
    var allClasses = CATALOG.map(function (c) { return c.name; });
    var topAny = state.classOrder[0] || CATALOG[0].name;

    // Soft feasibility check: if the sum of all required class minimums can't fit in the roster
    // cap, the minimums are mathematically unsatisfiable. Warn (don't block) — the greedy fill is
    // best-effort, so the user understands why some minimums may go unmet in the result.
    var minSum = allClasses.reduce(function (a, cn) { return a + fMin(cn); }, 0);
    if (minSum > state.maxRoster) {
      showAlert("Filter minimums require " + minSum + " heroes, but the roster cap (Max Roster) is " +
        state.maxRoster + ". Those minimums can't all be met — raise Max Roster or lower the minimums. " +
        "Building the best roster possible anyway.");
    }

    var counts = {}; // running roster class counts (for filter caps/min as the build commits)
    // Roster Objective knobs (Balanced / Resilient) — see OBJECTIVES.
    var OBJ = OBJECTIVES[state.objective] || OBJECTIVES[DEFAULT_OBJECTIVE];
    var BREADTH_ON = OBJ.breadth; // spread across barriers + run the diversify pass
    // Soft per-class diversity cap: the breadth (`diversify`) and survivability (`flexRefine`) passes
    // won't pile a single class past this, so one standout (e.g. Acrobat once air is a barrier) can't
    // flood the roster. SOFT, not hard: `buildFor` can still exceed it when filling is forced, and a
    // class's Min filter overrides it. Driven by the objective; `fMax` (Filters) is the player's hard cap.
    var SOFT_CLASS_CAP = OBJ.softCap;
    function softCapBlocks(cn, slots) { // would adding one more `cn` (to a party with these slots) exceed the cap?
      var inParty = 0; for (var k = 0; k < slots.length; k++) if (slots[k] === cn) inParty++;
      return (counts[cn] || 0) + inParty >= Math.max(SOFT_CLASS_CAP, fMin(cn));
    }
    // Classes matching `filter` and not excluded, sorted by EFFECTIVE (crit-folded) ATK desc, priority
    // asc. Using effClassAtk (not raw ATK) so candidate generation values crit chance / crit-damage the
    // same way the sim and diversify do — a high-crit class no longer ranks below a
    // higher-raw-ATK one that actually does less damage. (Evade is survivability, not ATK, so it's
    // handled by flexRefine's shortlist + the sim, not here.)
    function byAtk(filter) {
      return allClasses.filter(function (cn) { return !fExclude(cn) && filter(cn); }).sort(function (a, b) {
        var d = effClassAtk(b) - effClassAtk(a);
        return d !== 0 ? d : state.classOrder.indexOf(a) - state.classOrder.indexOf(b);
      });
    }
    // Power a class contributes to barrier `el` (matches element, or "all" covers any) —
    // mirrors heroContrib/barrierSum so this matches the grade exactly.
    function contrib(cn, el) { var c = CLASS[cn]; if (!c) return 0; if (c.element === el) return classAvg(cn, "power"); if (c.element === "all") return classAvg(cn, "power") * MZE.allBarrierFactor; return 0; }
    function champCovers(p, el) { var ce = partyChampEl(p); if (ce === el) return partyChampPower(p); if (ce === "all") return partyChampPower(p) * MZE.allBarrierFactor; return 0; }

    var tanksByAtk = byAtk(function (cn) { return isTank(cn); });
    var dpsByAtk = byAtk(function (cn) { return !isTank(cn); });

    // Best slot list for party p targeting barrier element `el` with a given tank. Respects
    // filters: never an excluded class, never over a class's cap (live count = roster + this
    // party), and filler slots prefer classes still under their required minimum.
    function buildFor(p, el, tankCn) {
      var cap = partyCap(p);
      var slots = [];
      var local = {}; Object.keys(counts).forEach(function (k) { local[k] = counts[k]; });
      function room(cn) { return !fExclude(cn) && (local[cn] || 0) < fMax(cn); }
      function softOK(cn) { return (local[cn] || 0) < Math.max(SOFT_CLASS_CAP, fMin(cn)); } // under the diversity cap (soft)
      function add(cn) { slots.push(cn); local[cn] = (local[cn] || 0) + 1; }
      function barPow() { var s = champCovers(p, el); for (var i = 0; i < slots.length; i++) s += contrib(slots[i], el); return s; }
      // Exactly one tank (slot 0): the caller's pick if it has room, else the best tank that does.
      if (tankCn && room(tankCn)) add(tankCn);
      else { var t = tanksByAtk.filter(room)[0]; if (t) add(t); }
      // Cover the barrier with the highest-ATK matching DPS that has room (prefer under the soft cap).
      while (barPow() < BARRIER_POWER_TARGET && slots.length < cap) {
        var md = dpsByAtk.filter(function (cn) { return contrib(cn, el) > 0 && room(cn); });
        if (!md.length) break;
        var mdPref = md.filter(softOK);
        add(mdPref.length ? mdPref[0] : md[0]);
      }
      // Fill the rest: under-min required classes first, then under-soft-cap (diversity), else highest-ATK.
      while (slots.length < cap) {
        var avail = dpsByAtk.filter(room);
        if (!avail.length) { var any = allClasses.filter(room); if (!any.length) break; add(any[0]); continue; }
        var needed = avail.filter(function (cn) { return (local[cn] || 0) < fMin(cn); });
        if (needed.length) { add(needed[0]); continue; }
        var pref = avail.filter(softOK);
        add(pref.length ? pref[0] : avail[0]);
      }
      return slots;
    }

    // Grade a slot list the same way partyGrade does, on class averages — including
    // crit-boosted ATK (kill speed) and threat/dodge-weighted one-shot demotion.
    function scoreOf(p, el, slots) {
      var cap = partyCap(p), champ = getChampion(p.champName);
      var buff = partyBuff(champ, slots);
      var bestBar = 0;
      state.barriers.forEach(function (b) {
        var s = champCovers(p, b);
        slots.forEach(function (cn) { s += contrib(cn, b); });
        if (s > bestBar) bestBar = s;
      });
      bestBar *= buff.barrierMult;
      var atk = slots.reduce(function (a, cn) { return a + buffedEffAtk(classAvg(cn, "atk"), classAvg(cn, "crit"), critMultOf(cn), buff); }, 0) +
        (champ ? buffedEffAtk(Number(champ.atk) || 0, Number(champ.crit) || 0, MZE.critDmgMod, buff) : 0);
      var tier, win = 0;
      var rounds = atk > 0 ? Math.ceil(MZE.bossHP / atk) : Infinity;
      var barrierFail = state.barriers.length > 0 && bestBar < BARRIER_POWER_TARGET; // no active barriers = no requirement
      if (slots.length !== cap || barrierFail || rounds >= MZE.roundCap) {
        tier = 4; // hard fail (D): undermanned, barrier unbroken, or can't kill before the 500-round cap
      } else {
        var saves = slots.reduce(function (a, cn) { return a + classSaves(cn); }, 0);
        // Recommended now ranks on the SAME Monte Carlo sim that drives the displayed grade, so the
        // optimizer "sees" the conditional skills (Jarl rage, Rudo crit, Lilu heal, …) and will pick
        // classes the closed form was blind to. Smaller N than the display + cached by composition
        // (champion + sorted slots + saves + gear tier — the el only affects barrier/align, not the
        // sim) so the thousands of search/diversify evals stay fast. (winChance remains the fast
        // fallback engine — `partyOutcome`'s pre-gate and this branch's pre-gate still use the
        // closed-form ATK to skip impossible builds before paying for the sim.)
        var key = "opt|" + state.quality + "|" + (champ ? champ.name : "") + "|" + saves + "|" + slots.slice().sort().join(",");
        win = _simScoreCache[key];
        if (win === undefined) {
          var sunits = slots.map(function (cn) {
            return simUnitFromStats(cn, false, null, classAvg(cn, "hp") * buff.hpMult, classAvg(cn, "def") * buff.defMult,
              classAvg(cn, "eva") + buff.evaAdd, classAvg(cn, "threat"), evaCapOf(cn),
              classAvg(cn, "atk") * buff.atkMult, classAvg(cn, "crit") + buff.critAdd, critMultOf(cn) + buff.critDmgAdd);
          });
          if (champ) sunits.push(simUnitFromStats(null, true, champ.name, (Number(champ.hp) || 0) * buff.hpMult,
            (Number(champ.def) || 0) * buff.defMult, (Number(champ.eva) || 0) + buff.evaAdd, Number(champ.threat) || 0,
            MZE.evaCapDefault, (Number(champ.atk) || 0) * buff.atkMult, (Number(champ.crit) || 0) + buff.critAdd, MZE.critDmgMod + buff.critDmgAdd));
          win = simWinChance(sunits, SIM.optimizerTrials, hashStr(key), { saves: saves, champName: champ ? champ.name : null });
          _simScoreCache[key] = win;
        }
        tier = winTier(win);
      }
      return { tier: tier, align: champCovers(p, el) > 0 ? 1 : 0, atk: atk, bar: bestBar, win: win };
    }

    function mk(className, partyId) {
      if (heroes.length >= state.maxRoster) return false;
      heroes.push({ id: id++, name: "", className: className, partyId: partyId, roleOverride: null, power: null, hp: null, atk: null, def: null, eva: null, crit: null, threat: null, critDmg: null });
      return true;
    }

    // Running element tally across the roster as it's built (for breadth).
    var elemCount = {};
    CATALOG.forEach(function (c) { elemCount[c.element] = 0; });

    // "Free" breadth: swap each slot toward an under-represented element WITHOUT dropping
    // the party's tier (re-scoring guards barrier / kill-speed / fragility). Slot 0 stays a
    // tank (swaps only among tanks); other slots swap among DPS.
    // Slot preference (lower is better, lexicographic): 1) breadth need, 2) Class Priority,
    // 3) effective ATK. Breadth is a FLOOR, not an endless objective: an element only "needs"
    // more until it hits BREADTH_FLOOR/element; once every element is at the floor, the breadth
    // term ties and your Class Priority list decides the discretionary slots (no longer spreads
    // for spreading's sake). Raise the floor to spread more before priority kicks in; lower it
    // to honor priority sooner. Barrier-forced dark/light/earth presence is unaffected (hard req).
    var BREADTH_FLOOR = OBJ.floor; // per objective; Balanced/Resilient use 3 (matches Roster Health "3+/element")
    // A breadth swap must be truly (near-)free: it may not drop the party's est. win % by more than
    // this. Without it, `diversify` would happily trade a 95%-win nuker for an off-element low-DPS
    // class just because the coarse S/A/B/C tier "held" — exactly what made Recommended grades sag.
    var DIVERSIFY_WIN_EPS = 0.04;
    function slotPref(cn, local) { return [Math.min(local[CLASS[cn].element] || 0, BREADTH_FLOOR), state.classOrder.indexOf(cn), -effClassAtk(cn)]; }
    function prefLess(a, b) { for (var k = 0; k < a.length; k++) { if (a[k] !== b[k]) return a[k] < b[k]; } return false; }
    function diversify(p, el, slots, tier) {
      var out = slots.slice();
      var curWin = scoreOf(p, el, out).win; // protect the actual win %, not just the tier bucket
      for (var i = 0; i < out.length; i++) {
        var curEl = CLASS[out[i]] ? CLASS[out[i]].element : null;
        // An "all" slot (Spellknight) may still swap out toward an under-represented single
        // element — the candidate filter (no "all" in) + the tier+win guard below keep it safe.
        if (!curEl) continue;
        if (fMin(out[i]) > (counts[out[i]] || 0)) continue; // don't swap away a still-needed required class
        var local = {};
        Object.keys(elemCount).forEach(function (k) { local[k] = elemCount[k]; });
        out.forEach(function (cn, j) { if (j !== i) { var e = CLASS[cn] && CLASS[cn].element; if (e) local[e] = (local[e] || 0) + 1; } });
        var curPref = slotPref(out[i], local);
        var pool = (i === 0) ? tanksByAtk : dpsByAtk; // keep exactly one tank (slot 0)
        var cands = pool.filter(function (cn) {
          return CLASS[cn].element !== "all" && !fExclude(cn) && (counts[cn] || 0) < fMax(cn) && !softCapBlocks(cn, out) && prefLess(slotPref(cn, local), curPref);
        }).sort(function (a, b) { var pa = slotPref(a, local), pb = slotPref(b, local); return prefLess(pa, pb) ? -1 : (prefLess(pb, pa) ? 1 : 0); });
        for (var j2 = 0; j2 < cands.length; j2++) {
          var trial = out.slice(); trial[i] = cands[j2];
          var s2 = scoreOf(p, el, trial);
          if (s2.tier <= tier && s2.win >= curWin - DIVERSIFY_WIN_EPS) { out = trial; curWin = s2.win; break; } // breadth only when ~free
        }
      }
      return out;
    }

    // Sim-driven win refine. `buildFor` fills slots by raw ATK, so bulky / flexible low-ATK classes
    // — above all Spellknight ("all" element, ~half a nuker's ATK but far tankier) — never get
    // CONSTRUCTED as candidates, even though the sim rates them higher because they survive the long
    // fight. This pass lets the sim rank each non-tank slot across the FULL DPS pool and keeps a swap
    // only when it raises the party's est. win % by more than FLEX_WIN_EPS (above the ~±2.6% sim noise,
    // so it isn't chasing noise). `scoreOf` still enforces barrier coverage + tier, so a swap can never
    // break the party's barrier (e.g. it won't drop a Bishop that's holding the light barrier). Runs
    // AFTER diversify, so it only overrides a breadth choice when another class wins MEANINGFULLY more
    // — the barrier element (and thus roster-wide barrier breadth) is fixed here.
    var FLEX_WIN_EPS = 0.02;
    // The blind spot is specifically the BULKY / FLEXIBLE / DODGY low-ATK picks ATK-greed skips, above
    // all Spellknight ("all" element). The high-ATK nukers are already explored by buildFor + diversify,
    // so the refine only needs to offer the SURVIVABILITY underdogs — ranked by effective HP, which
    // credits dodge (`hp / (1 − dodge)`), so high-EVA evasion picks (Acrobat/Grandmaster/Pathfinder)
    // are offered alongside the high-raw-HP ones. Top 5 + Spellknight (keeps the pass cheap).
    function survProxy(cn) {
      var dodge = Math.max(0, Math.min(evaCapOf(cn) / 100, (classAvg(cn, "eva") - MZE.evaPenalty) / 100));
      return classAvg(cn, "hp") / Math.max(0.1, 1 - dodge); // effective HP — dodge multiplies survivability
    }
    var flexPool = dpsByAtk.slice().sort(function (a, b) { return survProxy(b) - survProxy(a); }).slice(0, 5);
    if (CLASS["Spellknight"] && flexPool.indexOf("Spellknight") < 0) flexPool.push("Spellknight");
    function flexRefine(p, el, slots) {
      var out = slots.slice();
      var cur = scoreOf(p, el, out).win;
      for (var i = 1; i < out.length; i++) {                 // slot 0 = tank, leave it
        if (fMin(out[i]) > (counts[out[i]] || 0)) continue;  // don't drop a still-required class
        var bestCn = out[i], bestWin = cur;
        for (var c = 0; c < flexPool.length; c++) {
          var cn = flexPool[c];
          if (cn === out[i] || fExclude(cn) || (counts[cn] || 0) >= fMax(cn) || softCapBlocks(cn, out)) continue;
          var trial = out.slice(); trial[i] = cn;
          var w = scoreOf(p, el, trial).win;                 // tier-4 (barrier broken / undermanned) → win 0, auto-rejected
          if (w > bestWin + FLEX_WIN_EPS) { bestWin = w; bestCn = cn; }
        }
        if (bestCn !== out[i]) { out[i] = bestCn; cur = bestWin; }
      }
      return out;
    }

    // ---- Global rebalancing pass (Recommended's "second pass") ----
    // The greedy build optimizes each party in isolation and in array order, so the first parties grab the
    // strongest classes and later ones eat leftovers — and because per-party win% saturates near 100%,
    // nothing redistributes that overkill (the "lots of 99–100%, not the best roster" complaint). This pass
    // takes the FINISHED roster and steepest-ascent hill-climbs SWAPS of non-tank heroes BETWEEN parties,
    // keeping a swap only when it improves a non-saturating global objective: maximize the MINIMUM party
    // win%, tie-broken by the SUM (lexicographic — lift the weakest team first, then total power). Pure
    // swaps preserve the global class multiset, so element breadth / soft caps / filter caps / the 1-tank
    // rule are all INVARIANT; the only per-party thing that can change is barrier coverage, which the tier-4
    // guard rejects. So it never trades away roster health — it just reassigns the SAME classes (and honors
    // each party's champion) to where they clear best. Reuses the memoized sim (`_simScoreCache`), so the
    // repeated re-scores are mostly cache hits.
    function rebalanceRoster() {
      var groups = [];
      state.parties.forEach(function (p) {
        var hs = heroes.filter(function (h) { return h.partyId === p.id; });
        if (hs.length === partyCap(p)) groups.push({ p: p, hs: hs }); // only full, scorable parties
      });
      if (groups.length < 2) return;
      function slotsOf(g) { return g.hs.map(function (h) { return h.className; }); }
      // el only sets scoreOf's `align` field (ignored here); barrier coverage is computed over ALL
      // state.barriers regardless, so pass null.
      function evalG(g) { return scoreOf(g.p, null, slotsOf(g)); }
      function objMin(a) { var m = Infinity; for (var k = 0; k < a.length; k++) { var v = a[k].tier === 4 ? -1 : a[k].win; if (v < m) m = v; } return m; }
      function objSum(a) { var s = 0; for (var k = 0; k < a.length; k++) s += (a[k].tier === 4 ? 0 : a[k].win); return s; }
      var sc = groups.map(evalG);
      // If the weakest party is already S-tier, the floor can't be meaningfully lifted and any sum gain is
      // within sim noise — skip the (otherwise wasted) pairwise sweep. This is the common case at strong
      // gear, where win% saturates; the pass earns its keep at marginal tiers with a genuinely weak party.
      if (objMin(sc) >= WIN_BANDS.S) return;
      var REBAL_EPS = 0.02, MAX_SWEEPS = 6;
      for (var sweep = 0; sweep < MAX_SWEEPS; sweep++) {
        var curMin = objMin(sc), curSum = objSum(sc), pick = null;
        for (var gi = 0; gi < groups.length; gi++) {
          for (var gj = gi + 1; gj < groups.length; gj++) {
            var A = groups[gi], B = groups[gj], sA0 = slotsOf(A), sB0 = slotsOf(B);
            for (var hi = 0; hi < A.hs.length; hi++) {
              if (isTank(A.hs[hi].className)) continue;                       // keep exactly one tank per party
              for (var hj = 0; hj < B.hs.length; hj++) {
                if (isTank(B.hs[hj].className)) continue;
                if (A.hs[hi].className === B.hs[hj].className) continue;
                var sA = sA0.slice(); sA[hi] = B.hs[hj].className;
                var sB = sB0.slice(); sB[hj] = A.hs[hi].className;
                var ra = scoreOf(A.p, null, sA), rb = scoreOf(B.p, null, sB);
                if (ra.tier === 4 || rb.tier === 4) continue;                 // would break a barrier (or bust the round cap) — never
                var trial = sc.slice(); trial[gi] = ra; trial[gj] = rb;
                var nMin = objMin(trial), nSum = objSum(trial);
                var better = nMin > curMin + REBAL_EPS || (Math.abs(nMin - curMin) <= REBAL_EPS && nSum > curSum + REBAL_EPS);
                if (!better) continue;
                var gain = (nMin - curMin) * 1000 + (nSum - curSum);         // steepest: lifting the floor dominates the sum
                if (!pick || gain > pick.gain) pick = { gi: gi, hi: hi, gj: gj, hj: hj, ra: ra, rb: rb, gain: gain };
              }
            }
          }
        }
        if (!pick) break;                                                     // local optimum — done
        var GA = groups[pick.gi], GB = groups[pick.gj];                       // apply: swap the two heroes' classes in place
        var tmp = GA.hs[pick.hi].className; GA.hs[pick.hi].className = GB.hs[pick.hj].className; GB.hs[pick.hj].className = tmp;
        sc[pick.gi] = pick.ra; sc[pick.gj] = pick.rb;
      }
    }

    // No active barriers → still try once (el=null) so parties get built (pure DPS/survival, no barrier req).
    var barrierChoices = state.barriers.length ? state.barriers : [null];
    // Within a tier, the sim `win` is a better "stronger party" signal than raw ATK (it sees survival +
    // conditionals), so it ranks just below breadth and above ATK. Without it the S-bucket collapses every
    // ≥95% build to a tie and the choice falls to ATK — the "lots of 99–100%, but not the best" effect.
    // EPS keeps it off the ~±2.6% sim noise.
    var SELECT_WIN_EPS = 0.02;
    state.parties.forEach(function (p) {
      if (heroes.length >= state.maxRoster) return;
      var best = null;
      barrierChoices.forEach(function (el) {
        tanksByAtk.forEach(function (tankCn) {                                                   // try each tank — bulk/threat can beat raw ATK
          var slots = buildFor(p, el, tankCn);
          var sc = scoreOf(p, el, slots);
          // Selection priority: tier → champion alignment → (breadth: least-used barrier) → est. win% → ATK → margin.
          // If an objective sets breadth OFF the least-used step is skipped and ties fall straight to win% then ATK;
          // the shipped objectives (Balanced/Resilient) both keep breadth ON, so this stays guarded by BREADTH_ON.
          var use = elemCount[el] || 0, bestUse = best ? (elemCount[best.el] || 0) : Infinity;
          var better;
          if (!best) better = true;
          else if (sc.tier !== best.sc.tier) better = sc.tier < best.sc.tier;          // greener face wins
          else if (sc.align !== best.sc.align) better = sc.align > best.sc.align;       // align to champion element
          else if (BREADTH_ON && use !== bestUse) better = use < bestUse;               // even out barriers (breadth only)
          else if (Math.abs(sc.win - best.sc.win) > SELECT_WIN_EPS) better = sc.win > best.sc.win; // genuinely stronger (sim), not just raw ATK
          else if (sc.atk !== best.sc.atk) better = sc.atk > best.sc.atk;               // faster kill
          else better = sc.bar > best.sc.bar;                                           // bigger barrier margin
          if (better) best = { slots: slots, sc: sc, el: el };
        });
      });
      var chosen = best ? (BREADTH_ON ? diversify(p, best.el, best.slots, best.sc.tier) : best.slots.slice()) : [];
      if (chosen.length) chosen = flexRefine(p, best.el, chosen); // sim pulls in bulky/flex picks; soft cap per objective
      for (var i = 0; i < chosen.length; i++) {
        if (!mk(chosen[i], p.id)) break;
        var e = CLASS[chosen[i]] && CLASS[chosen[i]].element;
        if (e) elemCount[e] = (elemCount[e] || 0) + 1;
        counts[chosen[i]] = (counts[chosen[i]] || 0) + 1; // track for filter caps/min
      }
    });
    rebalanceRoster(); // second pass: redistribute strength across parties (lift the weakest), barrier-safe
    state.heroes = heroes;
  }
  // Class-average effective ATK (crit-boosted) — the figure the build optimizes on.
  function effClassAtk(cn) { return effAtkOf(classAvg(cn, "atk"), classAvg(cn, "crit"), critMultOf(cn)); }
  function addParty() {
    if (state.parties.length >= MAX_PARTIES) return;
    var max = 0; state.parties.forEach(function (p) { if (p.id > max) max = p.id; });
    state.parties.push({ id: max + 1, name: "Party " + (max + 1), champName: "" });
  }
  function delParty(id) {
    state.heroes.forEach(function (h) { if (h.partyId === id) h.partyId = null; });
    state.parties = state.parties.filter(function (p) { return p.id !== id; });
  }
  function enforcePartyCap(id) {
    var p = null; state.parties.forEach(function (q) { if (q.id === id) p = q; });
    if (!p) return;
    var cap = partyCap(p), members = state.heroes.filter(function (h) { return h.partyId === id; });
    for (var i = cap; i < members.length; i++) members[i].partyId = null; // bump overflow back to roster
  }

  /* ---------------- JSON (full party + hero state) ---------------- */
  function statOut(v) { return (v === null || v === undefined || v === "") ? null : (Number(v) || 0); }
  function toJSON() {
    return JSON.stringify({
      maxRoster: state.maxRoster,
      champions: state.champions.map(function (c) { return { name: c.name, el: c.el, power: Number(c.power) || 0, hp: Number(c.hp) || 0, atk: Number(c.atk) || 0, def: Number(c.def) || 0, eva: Number(c.eva) || 0, crit: Number(c.crit) || 0, threat: Number(c.threat) || 0 }; }),
      quality: state.quality,
      classStatsByQuality: state.classStatsByQuality,
      classOrder: state.classOrder,
      filters: state.filters,
      barriers: state.barriers.slice(),
      objective: state.objective,
      parties: state.parties.map(function (p) {
        return { id: p.id, name: p.name, champName: p.champName || "" };
      }),
      heroes: state.heroes.map(function (h) {
        return { id: h.id, name: h.name, className: h.className, partyId: h.partyId, roleOverride: h.roleOverride || null,
          power: statOut(h.power), hp: statOut(h.hp), atk: statOut(h.atk), def: statOut(h.def), eva: statOut(h.eva), crit: statOut(h.crit), threat: statOut(h.threat), critDmg: statOut(h.critDmg) };
      })
    }, null, 2);
  }
  function loadJSON(str) {
    var data = JSON.parse(str); // throws on malformed JSON
    if (!data || !Array.isArray(data.parties) || !Array.isArray(data.heroes)) {
      throw new Error("JSON must have 'parties' and 'heroes' arrays");
    }
    state.maxRoster = Math.min(MAX_ROSTER_CAP, Number(data.maxRoster) || DEFAULT_MAX_ROSTER);
    // Champions: explicit pool if present, else migrate from legacy per-party champEl/power.
    var cStat = function (v, def) { return (v === null || v === undefined || v === "") ? def : (Number(v) || 0); };
    if (Array.isArray(data.champions)) {
      state.champions = data.champions.map(function (c) {
        return { name: String(c.name || ""), el: c.el ? String(c.el) : "none", power: Number(c.power) || 0,
          hp: cStat(c.hp, 1000), atk: cStat(c.atk, 10000), def: cStat(c.def, 10000), eva: cStat(c.eva, 0), crit: cStat(c.crit, 0), threat: cStat(c.threat, 0) };
      });
    } else {
      var pool = [];
      data.parties.forEach(function (p) {
        if (p.champName && !pool.some(function (c) { return c.name === p.champName; })) {
          pool.push({ name: String(p.champName), el: p.champEl ? String(p.champEl) : "none", power: Number(p.power) || 0, hp: 1000, atk: 10000, def: 10000, eva: 0, crit: 0, threat: 0 });
        }
      });
      state.champions = pool.length ? pool : CHAMPION_POOL.map(function (c) { return { name: c.name, el: c.el, power: c.power, hp: 1000, atk: 10000, def: 10000, eva: 0, crit: 0, threat: 0 }; });
    }
    state.parties = data.parties.map(function (p) {
      return {
        id: Number(p.id),
        name: p.name == null ? "" : String(p.name),
        champName: p.champName == null ? "" : String(p.champName)
      };
    });
    // classStats: build per-quality tables. New saves carry classStatsByQuality; legacy saves have a
    // single flat classStats (= best gear) which we migrate into the Legendary tier.
    var byQ = {};
    QUALITIES.forEach(function (q) { byQ[q] = emptyClassTable(); });
    function fillTier(tier, src) {
      var tbl = byQ[tier];
      if (!tbl || !src || typeof src !== "object") return;
      Object.keys(src).forEach(function (name) {
        var key = tbl[name] ? name : null;
        if (!key) Object.keys(tbl).forEach(function (k) { if (k.toLowerCase() === name.toLowerCase()) key = k; });
        if (!key) return;
        var s = src[name] || {};
        tbl[key] = { hp: Number(s.hp) || 0, atk: Number(s.atk) || 0, def: Number(s.def) || 0, eva: Number(s.eva) || 0, power: Number(s.power) || 0, crit: Number(s.crit) || 0, threat: Number(s.threat) || 0, critDmg: Number(s.critDmg) || 2 };
      });
    }
    if (data.classStatsByQuality && typeof data.classStatsByQuality === "object") {
      QUALITIES.forEach(function (q) { fillTier(q, data.classStatsByQuality[q]); });
    } else if (data.classStats && typeof data.classStats === "object") {
      // Legacy flat defaults (= best gear). Seed every tier as a baseline so no tier reads empty;
      // real per-tier numbers overwrite when quality-tagged data is pasted/uploaded.
      QUALITIES.forEach(function (q) { fillTier(q, data.classStats); });
    }
    state.classStatsByQuality = byQ;
    useQuality(normalizeQuality(data.quality) || DEFAULT_QUALITY);
    // classOrder: keep saved order (valid classes only), then append any missing catalog classes
    var allNames = CATALOG.map(function (c) { return c.name; });
    var order = Array.isArray(data.classOrder) ? data.classOrder.filter(function (n) { return allNames.indexOf(n) >= 0; }) : [];
    allNames.forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
    state.classOrder = order;
    // filters: sanitize to known classes; exclude=bool, max/min=non-negative numbers.
    var f = { exclude: {}, max: {}, min: {} };
    if (data.filters && typeof data.filters === "object") {
      var df = data.filters;
      allNames.forEach(function (n) {
        if (df.exclude && df.exclude[n]) f.exclude[n] = true;
        if (df.max && typeof df.max[n] === "number" && df.max[n] >= 0) f.max[n] = df.max[n];
        if (df.min && typeof df.min[n] === "number" && df.min[n] > 0) f.min[n] = df.min[n];
      });
    }
    state.filters = f;
    // Active barriers: keep only valid elements; default to dark/light/earth for older saves (no `barriers`).
    state.barriers = Array.isArray(data.barriers)
      ? data.barriers.filter(function (e) { return COVERAGE_ELS.indexOf(e) >= 0; })
      : DEFAULT_BARRIER_ELS.slice();
    state.objective = OBJECTIVES[data.objective] ? data.objective : DEFAULT_OBJECTIVE;
    state.heroes = data.heroes.map(function (h) {
      return {
        id: Number(h.id),
        name: h.name == null ? "" : String(h.name),
        className: h.className ? String(h.className) : CATALOG[0].name,
        partyId: h.partyId == null ? null : Number(h.partyId),
        roleOverride: (h.roleOverride === "tank" || h.roleOverride === "dps") ? h.roleOverride : null,
        power: statOut(h.power), hp: statOut(h.hp), atk: statOut(h.atk), def: statOut(h.def), eva: statOut(h.eva), crit: statOut(h.crit), threat: statOut(h.threat), critDmg: statOut(h.critDmg)
      };
    });
  }

  // On startup, seed from the local data file (_js/t16-roster-data.js) if it has
  // valid JSON; otherwise keep the built-in default roster.
  try {
    if (typeof window !== "undefined" && window.T16_ROSTER_JSON && String(window.T16_ROSTER_JSON).trim()) {
      loadJSON(window.T16_ROSTER_JSON);
    }
  } catch (e) { /* malformed saved data — fall back to the seed roster */ }

  /* ---------------- escaping ---------------- */
  function escH(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function escA(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------------- computed ---------------- */
  function depth() {
    var h = {}, c = {};
    COVERAGE_ELS.forEach(function (e) { h[e] = 0; c[e] = 0; });
    var hflex = 0, cflex = 0;
    state.heroes.forEach(function (x) { var e = elOf(x.className); if (e === "all") hflex++; else if (h[e] !== undefined) h[e]++; });
    state.parties.forEach(function (p) { var e = partyChampEl(p); if (e === "all") cflex++; else if (c[e] !== undefined) c[e]++; });
    var assigned = state.heroes.filter(function (x) { return x.partyId; }).length;
    return { h: h, c: c, hflex: hflex, cflex: cflex, assigned: assigned, total: state.heroes.length };
  }
  function evalParty(p) {
    var members = state.heroes.filter(function (h) { return h.partyId === p.id; });
    var tanks = members.filter(function (h) { return heroRole(h) === "tank"; });
    var sources = members.map(function (h) { return elOf(h.className); });
    var champEl = partyChampEl(p);
    var champPower = partyChampPower(p); // champion's elemental power
    if (champEl && champEl !== "none") sources.push(champEl);
    // The badge number is the summed elemental power covering that barrier:
    // heroes of that element + the champion (when its element matches) +
    // "all"-element contributors (which count toward every barrier).
    var allPresent = sources.indexOf("all") >= 0;
    // "all"-element units (Spellknight) count toward every barrier at a reduced factor (st-central).
    var allPower = (members.reduce(function (s, m) { return s + (elOf(m.className) === "all" ? heroStat(m, "power") : 0); }, 0)
      + (champEl === "all" ? champPower : 0)) * MZE.allBarrierFactor;
    // Champion barrier aura (e.g. Rudo +50%) boosts barrier-element power only.
    var bMult = partyBuff(getChampion(p.champName), members.map(function (m) { return m.className; })).barrierMult;
    var elements = COVERAGE_ELS.map(function (el) {
      var directPower = members.reduce(function (s, m) { return s + (elOf(m.className) === el ? heroStat(m, "power") : 0); }, 0)
        + (champEl === el ? champPower : 0);
      var directPresent = sources.indexOf(el) >= 0;
      var isBarrier = state.barriers.indexOf(el) >= 0;
      return {
        el: el, power: (directPower + allPower) * (isBarrier ? bMult : 1),
        ok: directPresent || allPresent, viaAll: (!directPresent && allPresent),
        barrier: isBarrier
      };
    });
    var bar = elements.filter(function (e) { return e.barrier; });
    var missing = bar.filter(function (b) { return !b.ok; }).map(function (b) { return b.el; });
    var onlyViaAll = bar.some(function (b) { return b.viaAll; });
    var issues = [];
    var cap = partyCap(p);
    if (members.length < cap) issues.push("needs " + (cap - members.length) + " more");
    if (members.length > cap) issues.push((members.length - cap) + " over");
    missing.forEach(function (e) { issues.push("no " + e); });
    if (tanks.length === 0) issues.push("no tank");
    // Border: bright green when any barrier (dark/light/earth) hits the target, else default gold.
    var ready = bar.some(function (b) { return b.power >= BARRIER_POWER_TARGET; });
    var color = ready ? "#27E056" : "#C49415";
    var verdict = !issues.length
      ? (onlyViaAll ? "Ready — a barrier rides on a half-power All cover" : "Ready for Meteor Zone")
      : issues.join(" · ") + (tanks.length === 0 && !missing.length ? " (champion may anchor)" : "");
    return { members: members, bar: bar, elements: elements, color: color, verdict: verdict };
  }

  /* ---------------- view helpers ---------------- */
  function dot(el, sm) {
    var s = sm ? "w-2 h-2" : "w-2.5 h-2.5";
    return '<span class="inline-block rounded-sm flex-shrink-0 ' + s + '" style="background:' + EL_COLOR[el] + '"></span>';
  }
  function opts(list, value, labels) {
    return list.map(function (o) {
      var lab = labels ? labels[o] : o;
      return '<option value="' + escA(o) + '"' + (String(o) === String(value) ? " selected" : "") + '>' + escH(lab) + '</option>';
    }).join("");
  }

  /* ---------------- icons (images/) ---------------- */
  var IMG_DIR = "images/";
  // Champion name -> portrait file (most match lowercase name; a couple differ).
  var CHAMP_IMG = {
    Argon: "argon.webp", Bjorn: "bjorn.webp", Malady: "icon_global_malady.webp",
    Yami: "yami.webp", Lilu: "lilu.webp", Sia: "sia.webp", Hemma: "hemma.webp",
    Donovan: "donovan.webp", Rudo: "rudo.webp", Polonia: "polonia.webp",
    Ashley: "ashley.webp"
  };
  function champIcon(name) {
    var f = CHAMP_IMG[name];
    return f
      ? '<img src="' + escA(IMG_DIR + f) + '" alt="' + escA(name) + '" class="w-7 h-7 rounded-md object-cover shrink-0" onerror="this.style.display=\'none\'">'
      : '<span class="text-base shrink-0">★</span>';
  }
  // Champion <select> options for a party: "None" + champions not used by other parties.
  function champOptions(p) {
    var used = {};
    state.parties.forEach(function (q) { if (q.id !== p.id && q.champName) used[q.champName] = true; });
    var out = '<option value=""' + (!p.champName ? " selected" : "") + '>No champion · 4 heroes</option>';
    state.champions.forEach(function (c) {
      if (used[c.name]) return; // taken by another party (champions are unique)
      out += '<option value="' + escA(c.name) + '"' + (p.champName === c.name ? " selected" : "") + '>' + escH(c.name) + " (" + c.el + ")</option>";
    });
    return out;
  }
  // Class name -> icon file: icon_global_class_<lowercased, no spaces>_128.webp,
  // with overrides for classes whose icon filename differs from the name.
  var CLASS_ICON = { Grandmaster: "mastermonk", Fateweaver: "timekeeper" };
  function classIcon(cn, sizeClass) {
    var slug = CLASS_ICON[cn] || String(cn).toLowerCase().replace(/\s+/g, "");
    var file = IMG_DIR + "icon_global_class_" + slug + "_128.webp";
    return '<img src="' + escA(file) + '" alt="' + escA(cn) + '" class="' + (sizeClass || "w-5 h-5") + ' shrink-0 object-contain" onerror="this.style.display=\'none\'">';
  }
  // Barrier element -> icon file: icon_global_barrier_<element>.png (6 elements); "all" → any.png.
  function barrierIcon(el, sizeClass) {
    var file = el === "all" ? "any.png" : "icon_global_barrier_" + el + ".png";
    return '<img src="' + IMG_DIR + file + '" alt="' + escA(el) + '" class="' + (sizeClass || "w-4 h-4") + ' shrink-0 object-contain inline-block align-middle" onerror="this.style.display=\'none\'">';
  }
  // Yellow ⓘ info marker — click opens a popover with `text` (delegated handler below).
  function infoBadge(text) {
    var t = escA(text);
    return '<span class="shrink-0 text-[#FBBF24] text-sm cursor-pointer leading-none hover:brightness-110" data-info="' + t + '" title="' + t + '">ⓘ</span>';
  }
  // Stat-profile badges (non-interactive): show each icon when the hero's effective
  // stat clears its threshold. A hero can show 0–5 — e.g. a bruiser tank shows all but crit/evade.
  var STAT_BADGES = [
    { stat: "threat", min: 75,    file: "icon_global_defense.png",    label: "Tank — threat ≥ 75" },
    { stat: "hp",     min: 3000,  file: "icon_global_health.png",     label: "Durable — HP ≥ 3,000" },
    { stat: "eva",    min: 75,    file: "Evasion.webp",               label: "Evasive — EVA ≥ 75" },
    { stat: "crit",   min: 35,    file: "icon_global_critchance.png", label: "Crit build — CRIT ≥ 35" },
    { stat: "atk",    min: 47000, file: "icon_global_attack.png",     label: "Damage dealer — ATK ≥ 47,000" }
  ];
  function statBadges(h) {
    var out = STAT_BADGES.filter(function (b) { return heroStat(h, b.stat) >= b.min; }).map(function (b) {
      return '<img src="' + IMG_DIR + b.file + '" alt="' + escA(b.label) + '" title="' + escA(b.label) + '" class="w-5 h-5 object-contain shrink-0" onerror="this.style.display=\'none\'">';
    }).join("");
    return out ? '<span class="flex items-center gap-0.5 shrink-0">' + out + '</span>' : '';
  }
  // True when a hero is overall WORSE than its class default (the active-tier averages in the Default
  // Stats panel) — i.e. weaker on BOTH axes that matter: crit-folded effective ATK AND survivability
  // (hits-to-die credited by dodge, so it folds HP + DEF + EVA). Requiring both avoids flagging a strong
  // specialist (e.g. a high-ATK glass nuker isn't "lower" just because its HP is below default). An
  // inheriting hero equals the default on both → never flagged; only a genuinely under-geared one trips it.
  function belowClassDefault(h) {
    var cn = h.className, cap = evaCapOf(cn);
    function survival(hp, def, eva) { var s = survStats(hp, def, eva, cap); return s.hitsToDie / Math.max(0.1, 1 - s.dodge); }
    var hAtk = effAtkOf(heroStat(h, "atk"), heroStat(h, "crit"), heroCritMult(h));     // hero uses its own crit dmg
    var dAtk = effAtkOf(classAvg(cn, "atk"), classAvg(cn, "crit"), critMultOf(cn));     // default uses the class crit dmg
    var hSurv = survival(heroStat(h, "hp"), heroStat(h, "def"), heroStat(h, "eva"));
    var dSurv = survival(classAvg(cn, "hp"), classAvg(cn, "def"), classAvg(cn, "eva"));
    return hAtk < dAtk * 0.999 && hSurv < dSurv * 0.999;
  }
  function belowDefaultMark(h) {
    if (!belowClassDefault(h)) return "";
    return '<span class="shrink-0 font-bold leading-none" style="color:' + COL.rose + '" ' +
      'title="Overall stats are below the ' + escA(state.quality) + ' ' + escA(h.className) + ' default (Default Stats panel)">−</span>';
  }

  var FIELD = "bg-surface border border-borderc rounded-lg text-textPrimary px-2 py-1.5 outline-none text-sm focus:border-accent";
  var GHOST_X = "bg-transparent border-none text-textSecondary hover:text-textPrimary cursor-pointer text-base leading-none";

  /* ---------------- view ---------------- */
  function viewZone() {
    return '<section class="bg-surface border-2 border-[#FFC11B] rounded-2xl p-6 flex flex-col items-center gap-2 text-center">' +
      '<div class="flex items-center gap-2">' +
        '<img src="' + IMG_DIR + 'icon_global_questarea_space_small.png" alt="Meteor Zone" class="w-8 h-8 object-contain">' +
        '<span class="font-bold text-sm">Meteor Zone</span>' +
      '</div>' +
      '<img src="' + IMG_DIR + '{0A2CFD1F-2672-41FB-BEE7-C86C7810327B}.png" alt="Meteor Zone stats" class="max-w-[200px] w-full h-auto" onerror="this.style.display=\'none\'">' +
    '</section>';
  }
  function viewAddRoster() {
    var atCap = state.heroes.length >= state.maxRoster;
    return '<section class="bg-surface border-2 border-[#FFC11B] rounded-2xl p-6 space-y-2">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="text-xs font-semibold uppercase tracking-wider text-textSecondary">Add hero to roster</div>' +
        '<div class="flex items-center gap-3 flex-wrap">' +
          '<label class="flex items-center gap-1.5 text-xs text-textSecondary whitespace-nowrap"><span class="uppercase tracking-wider text-[10px]">Gear Quality</span>' +
            '<select data-action="select-quality" title="Gear-quality tier the class-average defaults assume — switches every hero\'s inherited stats" class="bg-hoverBg border border-borderc rounded px-1.5 py-0.5 text-textPrimary text-xs font-semibold outline-none focus:border-accent">' +
              QUALITIES.map(function (q) { return '<option value="' + escA(q) + '"' + (q === state.quality ? " selected" : "") + '>' + escH(q) + '</option>'; }).join("") +
            '</select>' +
          '</label>' +
          '<div class="text-xs text-textSecondary whitespace-nowrap">Roster <b style="color:' + (atCap ? COL.rose : COL.emerald) + '">' + state.heroes.length + '</b> / ' +
            '<input data-action="max-roster" data-k="max-roster" value="' + state.maxRoster + '" inputmode="numeric" title="Roster capacity (max ' + MAX_ROSTER_CAP + ')" class="w-12 bg-hoverBg border border-borderc rounded px-1 py-0.5 text-textPrimary text-xs text-right outline-none focus:border-accent"></div>' +
        '</div>' +
      '</div>' +
      ["Fighter", "Rogue", "Spellcaster"].map(function (grp) {
        return '<div class="flex flex-wrap gap-2">' +
          CATALOG.filter(function (c) { return c.group === grp; }).map(function (c) {
            return '<button type="button" data-action="add-hero" data-class="' + escA(c.name) + '" title="Add ' + escA(c.name) + ' to roster" ' +
              'class="flex flex-col items-center gap-0.5 w-24 p-1 rounded-lg border border-borderc bg-surface hover:bg-hoverBg hover:border-accent transition">' +
              classIcon(c.name, "w-8 h-8") +
              '<span class="text-[10px] leading-tight text-center text-textSecondary truncate w-full">' + escH(c.name) + '</span>' +
            '</button>';
          }).join("") +
        '</div>';
      }).join("") +
    '</section>';
  }

  function viewParty(p) {
    var r = evalParty(p);
    var badges = r.elements.map(function (b) {
      var col = b.barrier
        ? (!b.ok ? COL.rose : (b.power > 0 ? COL.emerald : COL.amber))
        : (b.power > 0 ? EL_COLOR[b.el] : COL.muted);
      return '<span class="inline-flex items-center gap-0.5 text-xs font-mono" title="' + b.el + ' power" style="color:' + col + '">' + barrierIcon(b.el, "w-4 h-4") + " " + b.power + '</span>';
    }).join("");

    var slots = "";
    var cap = partyCap(p);
    for (var i = 0; i < cap; i++) {
      var h = r.members[i];
      if (!h) { slots += '<div class="text-xs text-textSecondary italic py-1 pl-1">empty slot</div>'; continue; }
      var slotLabel = (h.name ? escH(h.name) + ' ' : '') + belowDefaultMark(h) + ' ' +
        '<span class="text-textSecondary">(' + escH(h.className) + ')</span>';
      slots += '<div class="flex items-center gap-2 py-1">' + classIcon(h.className) + barrierIcon(elOf(h.className)) +
        '<span class="flex-1 text-sm">' + slotLabel + '</span>' +
        statBadges(h) +
        '<button class="' + GHOST_X + '" data-action="unassign" data-id="' + h.id + '">×</button></div>';
    }

    var champEl = partyChampEl(p);
    return '<div data-party-id="' + p.id + '" class="bg-surface border-2 border-borderc rounded-xl p-3 transition" style="border-color:' + r.color + '">' +
      '<div class="flex items-center gap-2 mb-1">' + gradeImg(p) + gradePct(p) +
        '<input class="flex-1 min-w-0 bg-transparent border-none outline-none font-bold text-base text-textPrimary" value="' + escA(p.name) + '" data-action="text" data-target="party" data-id="' + p.id + '" data-field="name" data-k="party-' + p.id + '-name">' +
        '<button class="bg-transparent border-none cursor-pointer p-0 leading-none shrink-0 text-base opacity-70 hover:opacity-100 transition" data-sim-pid="' + p.id + '" title="Simulate combat — watch a sample fight">⚔️</button>' +
        '<button class="bg-transparent border-none cursor-pointer p-0 leading-none shrink-0 opacity-70 hover:opacity-100 transition" data-action="del-party" data-id="' + p.id + '" title="Delete party"><img src="' + IMG_DIR + 'cancel.png" alt="Delete party" class="w-5 h-5 object-contain" onerror="this.outerHTML=\'×\'"></button>' +
      '</div>' +
      '<div class="flex flex-wrap gap-1.5 mb-2">' + badges + '</div>' +
      '<div class="flex gap-2 items-center bg-hoverBg rounded-lg px-2.5 py-2 mb-2">' + champIcon(p.champName) +
        '<select class="' + FIELD + ' flex-1 min-w-0 font-bold text-sm" data-action="select-champ" data-id="' + p.id + '">' + champOptions(p) + '</select>' +
        (p.champName && CHAMPION_SKILLS[p.champName]
          ? infoBadge(CHAMPION_SKILLS[p.champName].text + (CHAMPION_SKILLS[p.champName].sim ? "  —  conditional parts pending the sim" : ""))
          : '') +
        (p.champName
          ? '<span class="inline-flex items-center gap-1 text-xs font-bold capitalize shrink-0" style="color:' + EL_COLOR[champEl] + '">' + barrierIcon(champEl) + ' ' + champEl + '</span>'
          : '<span class="text-xs text-textSecondary shrink-0">4 heroes</span>') +
      '</div>' +
      slots +
    '</div>';
  }

  function viewRoster() {
    var pool = state.heroes.filter(function (h) { return !h.partyId; });
    var rows = pool.map(function (h) {
      var c = CLASS[h.className];
      return '<div draggable="true" data-hero-id="' + h.id + '" class="flex items-center gap-2 bg-[#5c2f46] border-2 border-borderc rounded-xl px-2.5 py-1.5 cursor-move">' +
        '<span class="text-white/60 select-none leading-none" title="Drag onto a party">⠿</span>' +
        classIcon(h.className) + barrierIcon(c ? c.element : "none") +
        '<input draggable="false" class="w-[170px] shrink-0 bg-[#814463] rounded px-2 py-1 border-none outline-none text-sm text-white placeholder:text-white/60" placeholder="' + escA(h.className) + '" value="' + escA(h.name) + '" data-action="text" data-target="hero" data-id="' + h.id + '" data-field="name" data-k="hero-' + h.id + '-name">' +
        '<span class="text-xs font-bold whitespace-nowrap text-white">' + escH(h.className) + '</span>' + statBadges(h) +
        '<button class="bg-transparent border-none text-white/70 hover:text-white cursor-pointer text-base leading-none" data-action="del-hero" data-id="' + h.id + '">×</button></div>';
    }).join("");

    return '<div class="flex justify-between items-center mb-2"><span class="text-xs font-semibold uppercase tracking-wider text-textSecondary">Roster · ' + pool.length + ' available</span></div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">' + rows + '</div>';
  }

  // Persistent "what changed" message shown in the update bar above the party section.
  var lastUpdate = "";
  function setUpdate(msg) { lastUpdate = msg; }
  function heroLabel(id) { var h = null; state.heroes.forEach(function (x) { if (x.id === id) h = x; }); return h ? (h.name || h.className) : "hero"; }
  function heroPartyId(id) { var pid = null; state.heroes.forEach(function (x) { if (x.id === id) pid = x.partyId; }); return pid; }
  function partyLabel(id) { var p = null; state.parties.forEach(function (q) { if (q.id === id) p = q; }); return p && p.name ? p.name : "party"; }

  function view() {
    var addCard = state.parties.length < MAX_PARTIES
      ? '<button type="button" data-action="add-party" class="flex items-center justify-center min-h-[90px] rounded-xl border-2 border-dashed border-borderc bg-surface/40 text-textSecondary hover:text-textPrimary hover:border-accent transition text-sm font-semibold">+ Add Party</button>'
      : '';
    var autoSortCol = '<div class="space-y-2">' +
      '<div class="grid grid-cols-2 gap-2">' +
        '<button type="button" data-action="auto-sort" title="Rearrange ALL your current heroes into the best party layout" class="bg-[#27E056] text-[#14331f] text-xs font-semibold rounded-full border border-[#FFC11B] px-2 py-2 hover:brightness-95 transition">Auto Sort</button>' +
        '<button type="button" data-action="fill-gaps" title="Top up your roster to capacity with the best heroes to round out what you have — keeps your current heroes" class="btn-white text-xs px-2 py-2">Top-up Roster</button>' +
        '<button type="button" data-action="suggested-roster" title="Generate our recommended ideal roster from class-average stats — replaces ALL heroes (barrier + kill speed + element breadth)" class="btn-white text-xs px-2 py-2">Recommended</button>' +
        '<button type="button" data-action="clear-roster" title="Delete all heroes" class="btn-red text-xs px-2 py-2">Clear</button>' +
      '</div>' +
      '<p class="text-[10px] text-textSecondary leading-snug"><b>Auto Sort</b> rearranges your current heroes. <b>Top-up Roster</b> fills your roster to capacity with the best complementary heroes (keeps current). <b>Recommended</b> builds the ideal aspirational roster from class averages (replaces everyone). <b>Clear</b> wipes all heroes.</p>' +
    '</div>';
    var updateBar = '<div class="bg-surface border-2 border-borderc rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">' +
      '<span class="font-semibold uppercase tracking-wider text-[10px] text-textSecondary shrink-0">Latest</span>' +
      '<span class="flex-1 min-w-0 truncate ' + (lastUpdate ? "text-textPrimary" : "text-textSecondary italic") + '">' +
        escH(lastUpdate || "All Default heroes are pre-populated with assumed T15 BIS gear/skills.  Zone is set to T16 (Meteor Zone).") + '</span></div>';
    return '' +
      '<div class="grid grid-cols-1 lg:grid-cols-[76fr_24fr] gap-4 items-start">' +
        '<div>' + viewRoster() + '</div>' + autoSortCol +
      '</div>' +
      updateBar +
      '<div class="grid grid-cols-1 lg:grid-cols-[76fr_24fr] gap-4 items-start">' +
        '<div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">' + state.parties.map(viewParty).join("") + addCard + '</div>' +
          '<p class="text-xs text-textSecondary text-center mt-2 italic">All unassigned heroes in your roster are shown toward the top of the page.</p>' +
        '</div>' +
        '<div class="space-y-4">' + viewZone() + viewAddRoster() + '</div>' +
      '</div>';
  }

  /* ---------------- render w/ caret restore ---------------- */
  var app = document.getElementById("app");
  if (!app) return;

  // Refresh only the main #app (parties/roster), restoring caret for any focused
  // input inside it. Does NOT touch the side panels.
  function renderApp() {
    var a = document.activeElement, restore = null;
    if (a && a.dataset && a.dataset.k && app.contains(a)) {
      restore = { k: a.dataset.k, s: a.selectionStart, e: a.selectionEnd };
    }
    app.innerHTML = view();
    if (restore) {
      var el = app.querySelector('[data-k="' + restore.k + '"]');
      if (el) { el.focus(); try { el.setSelectionRange(restore.s, restore.e); } catch (_) {} }
    }
  }
  function render() {
    renderApp();
    // Keep the side panels in sync while open (heroes added/removed/renamed).
    if (healthPanel && !healthPanel.classList.contains("translate-x-full")) buildRosterHealth();
    if (statsPanel && !statsPanel.classList.contains("translate-x-full")) buildStatsPanel();
    if (defaultsPanel && !defaultsPanel.classList.contains("translate-x-full")) buildDefaultsPanel();
  }

  /* ---------------- events (delegated) ---------------- */
  function applyEdit(el) {
    var t = el.dataset.target, id = Number(el.dataset.id), f = el.dataset.field, v = el.value;
    if (f === "partyId") v = (v === "Bench") ? null : Number(v);
    if (t === "hero") setHero(id, f, v); else setParty(id, f, v);
  }
  app.addEventListener("input", function (e) {
    var txt = e.target.closest('[data-action="text"]');
    if (txt) { applyEdit(txt); render(); return; }
    var mr = e.target.closest('[data-action="max-roster"]');
    if (mr) { state.maxRoster = Math.min(MAX_ROSTER_CAP, Math.max(0, parseInt(String(mr.value).replace(/[^0-9]/g, ""), 10) || 0)); render(); return; }
  });
  app.addEventListener("change", function (e) {
    var sel = e.target.closest('[data-action="select"]');
    if (sel) { applyEdit(sel); render(); return; }
    var qsel = e.target.closest('[data-action="select-quality"]');
    if (qsel) {
      useQuality(qsel.value);
      setUpdate("Gear quality set to " + state.quality + " — class-average defaults now use the " + state.quality + " tier.");
      render();
      return;
    }
    var champ = e.target.closest('[data-action="select-champ"]');
    if (champ) {
      var pid = Number(champ.dataset.id);
      setParty(pid, "champName", champ.value);
      enforcePartyCap(pid); // dropping to a 3-slot party bumps any 4th hero back to roster
      setUpdate(champ.value ? "Set " + partyLabel(pid) + "'s champion to " + champ.value + "." : "Removed " + partyLabel(pid) + "'s champion.");
      render();
    }
  });
  app.addEventListener("click", function (e) {
    var sim = e.target.closest("[data-sim-pid]");
    if (sim) { openCombatModal(Number(sim.dataset.simPid)); return; }
    var el = e.target.closest('[data-action]'); if (!el) return;
    var a = el.dataset.action;
    if (a === "add-hero") {
      if (state.heroes.length >= state.maxRoster) { showAlert("Roster is full (" + state.maxRoster + "). Increase capacity or retire a hero."); return; }
      addHero(el.dataset.class); setUpdate("Added " + el.dataset.class + " to the roster (" + state.heroes.length + "/" + state.maxRoster + ")."); render();
    }
    else if (a === "del-hero") { var di = Number(el.dataset.id), dl = heroLabel(di); delHero(di); setUpdate("Removed " + dl + " from the roster."); render(); }
    else if (a === "unassign") { var ui = Number(el.dataset.id), ul = heroLabel(ui); setHero(ui, "partyId", null); setUpdate("Benched " + ul + "."); render(); }
    else if (a === "add-party") { addParty(); setUpdate("Added a party (" + state.parties.length + " total)."); render(); }
    else if (a === "del-party") { var dpi = Number(el.dataset.id), dp = partyLabel(dpi); delParty(dpi); setUpdate("Deleted " + dp + " — its heroes returned to the roster."); render(); }
    else if (a === "auto-sort") {
      var tankCount = state.heroes.filter(function (h) { return heroRole(h) === "tank"; }).length;
      if (tankCount < state.parties.length) { showAlert("Auto Sort can't give every party a tank: " + state.parties.length + " parties but only " + tankCount + " tanks."); return; }
      var passers = autoSort();
      if (passers === null) { showAlert("Auto Sort couldn't run — your Filters (excluded/capped tanks) leave fewer than " + state.parties.length + " usable tanks."); return; }
      setUpdate("Auto Sort — " + passers + "/" + state.parties.length + " parties clear a barrier.");
      render();
    }
    else if (a === "fill-gaps") {
      var n = fillGaps();
      setUpdate(n ? "Top-up Roster — added " + n + " hero" + (n === 1 ? "" : "es") + " (" + state.heroes.length + "/" + state.maxRoster + ")." : "Top-up Roster — roster already at capacity (" + state.maxRoster + ").");
      render();
    }
    else if (a === "clear-roster") {
      showConfirm({
        title: "Clear roster",
        bodyHTML: "Delete <b>ALL heroes</b> from the roster? This can't be undone.",
        confirmLabel: "Clear All",
        confirmClass: "btn-red",
        onConfirm: function () { state.heroes = []; setUpdate("Cleared all heroes from the roster."); render(); }
      });
    }
    else if (a === "suggested-roster") {
      showConfirm({
        title: "Build a recommended roster",
        bodyHTML:
          "<p>Builds an <b>aspirational</b> roster from class-average stats at your current gear tier: one tank per party, a cleared <b>320 barrier</b>, then the highest-damage classes for kill speed — spread across elements for breadth.</p>" +
          "<p class=\"mt-2\"><b>This replaces ALL current heroes.</b></p>" +
          "<p class=\"mt-2 text-textSecondary\">Want it tailored? Set class <b>excludes, caps, or minimums</b> in the <b>Filters</b> tab first — Recommended honors them.</p>",
        confirmLabel: "Build Roster",
        onConfirm: function () { buildSuggestedRoster(); setUpdate("Recommended — built the ideal roster (" + state.heroes.length + " heroes)."); render(); }
      });
    }
  });

  /* ---------------- drag & drop: roster hero -> party ---------------- */
  var dropEl = null;
  function setDrop(el) {
    if (dropEl === el) return;
    if (dropEl) dropEl.classList.remove("ring-2", "ring-accent");
    dropEl = el;
    if (dropEl) dropEl.classList.add("ring-2", "ring-accent");
  }
  app.addEventListener("dragstart", function (e) {
    var el = e.target.closest('[data-hero-id]'); if (!el) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", el.dataset.heroId);
  });
  app.addEventListener("dragover", function (e) {
    var el = e.target.closest('[data-party-id]');
    if (!el) { setDrop(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDrop(el);
  });
  app.addEventListener("drop", function (e) {
    var el = e.target.closest('[data-party-id]'); if (!el) return;
    e.preventDefault();
    var id = Number(e.dataTransfer.getData("text/plain"));
    setDrop(null);
    if (!id) return;
    var pid = Number(el.dataset.partyId), party = null;
    state.parties.forEach(function (q) { if (q.id === pid) party = q; });
    var count = state.heroes.filter(function (h) { return h.partyId === pid; }).length;
    if (party && count >= partyCap(party)) return; // party already full (3 with champion, 4 without)
    setHero(id, "partyId", pid);
    setUpdate("Moved " + heroLabel(id) + " to " + (party && party.name ? party.name : "a party") + ".");
    render();
  });
  app.addEventListener("dragend", function () { setDrop(null); });

  /* ---------------- side panels: health / priority / stats ---------------- */
  var healthPanel = document.getElementById("healthPanel");
  var healthBackdrop = document.getElementById("healthBackdrop");
  var healthBody = document.getElementById("healthPanelBody");

  function openPanel(panel, backdrop) {
    if (panel) panel.classList.remove("translate-x-full", "-translate-x-full"); // works for right or left panels
    if (backdrop) backdrop.classList.remove("opacity-0", "pointer-events-none");
  }
  function closePanel(panel, backdrop, hiddenClass) {
    if (panel) panel.classList.add(hiddenClass || "translate-x-full");
    if (backdrop) backdrop.classList.add("opacity-0", "pointer-events-none");
  }

  var POWER_HEADER = '<div class="text-xs font-semibold uppercase tracking-wider text-textSecondary mb-1">';

  /* ---------------- Suggestions (planning on class averages) ---------------- */
  var suggestionHTML = ""; // last Analyze result; persists across panel rebuilds
  function topTankClass() {
    for (var i = 0; i < state.classOrder.length; i++) { var c = CLASS[state.classOrder[i]]; if (c && c.role.indexOf("Tank") >= 0) return c.name; }
    return null;
  }
  function topClassForElement(el) {
    for (var i = 0; i < state.classOrder.length; i++) { var c = CLASS[state.classOrder[i]]; if (c && c.element === el) return c.name; }
    return null;
  }
  function suggCard(color, html) {
    return '<div class="bg-surface border-2 rounded-lg px-3 py-2 text-xs leading-relaxed" style="border-color:' + color + '">' + html + '</div>';
  }
  // Best valid-party count on class AVERAGES, plus which parties fall short & on which barrier.
  function analyzeRoster() {
    PLANNING = true;
    var best = null, bestCov = -1;
    var enoughTanks = state.heroes.filter(function (h) { return heroRole(h) === "tank"; }).length >= state.parties.length;
    if (enoughTanks) {
      for (var i = 0; i < 200; i++) {
        var res = autoBuild(mulberry32(900 + i));
        if (!res) break;
        var cov = 0;
        state.parties.forEach(function (p) {
          var hs = res.assign[p.id];
          if (hs.length === partyCap(p) && partyBestBarrier(p, hs) >= BARRIER_POWER_TARGET) cov++;
        });
        if (cov > bestCov) { bestCov = cov; best = res; }
      }
    }
    var deficits = [];
    if (best) {
      state.parties.forEach(function (p) {
        var hs = best.assign[p.id];
        var full = hs.length === partyCap(p);
        if (full && partyBestBarrier(p, hs) >= BARRIER_POWER_TARGET) return;
        var bestEl = null, bestDef = Infinity;
        state.barriers.forEach(function (el) { var def = BARRIER_POWER_TARGET - barrierSum(p, hs, el); if (def < bestDef) { bestDef = def; bestEl = el; } });
        deficits.push({ party: p.name, el: bestEl, deficit: Math.max(0, Math.round(bestDef)), full: full });
      });
    }
    PLANNING = false;
    return { covered: bestCov < 0 ? 0 : bestCov, deficits: deficits, enoughTanks: enoughTanks };
  }
  function buildSuggestions() {
    var slots = state.parties.length;
    var hasAverages = CATALOG.some(function (c) { var s = state.classStats[c.name]; return s && (s.power || s.hp || s.atk); });
    if (!hasAverages) return suggCard(COL.amber, 'Enter <b>class averages</b> in the Hero Stats panel first — suggestions plan on average (gear-independent) stats.');

    var a = analyzeRoster();
    var out = [];
    var headColor = a.covered >= slots ? COL.emerald : (a.covered >= Math.ceil(slots * 0.7) ? COL.amber : COL.rose);
    out.push('<div class="text-sm font-bold">Valid parties (avg stats): <span style="color:' + headColor + '">' + a.covered + ' / ' + slots + '</span></div>');

    var tanks = state.heroes.filter(function (h) { return heroRole(h) === "tank"; }).length;
    if (tanks < slots) {
      var tc = topTankClass();
      out.push(suggCard(COL.rose, 'Tanks: <b>' + tanks + '/' + slots + '</b> — recruit ' + (slots - tanks) + ' more (one per party).' + (tc ? ' Top by priority: <b>' + escH(tc) + '</b>.' : '')));
    }
    var seats = state.parties.reduce(function (s, p) { return s + partyCap(p); }, 0);
    if (state.heroes.length < seats) out.push(suggCard(COL.amber, 'Empty seats: <b>' + (seats - state.heroes.length) + '</b> across ' + slots + ' parties — recruit heroes to fill them.'));

    var d = depth();
    COVERAGE_ELS.forEach(function (el) {
      if (d.h[el] >= 3) return;
      var tc2 = topClassForElement(el);
      out.push(suggCard(state.barriers.indexOf(el) >= 0 ? COL.rose : COL.amber,
        'Thin on <b class="capitalize">' + el + '</b> (' + d.h[el] + '/3 heroes).' + (tc2 ? ' Recruit a <b>' + escH(tc2) + '</b>.' : '')));
    });

    var byEl = {};
    a.deficits.forEach(function (x) { if (x.el) byEl[x.el] = (byEl[x.el] || 0) + 1; });
    Object.keys(byEl).forEach(function (el) {
      var tc3 = topClassForElement(el);
      out.push(suggCard(COL.rose, byEl[el] + ' part' + (byEl[el] > 1 ? 'ies' : 'y') + ' short on the <b class="capitalize">' + el + '</b> barrier.' + (tc3 ? ' Recruit a <b>' + escH(tc3) + '</b> (' + el + ') to raise coverage.' : '')));
    });
    if (a.deficits.length) {
      out.push('<div class="space-y-0.5">' + a.deficits.map(function (x) {
        return '<div class="text-xs text-textSecondary pl-1">○ ' + escH(x.party) + ' — ' + (x.full ? 'short ~' + x.deficit + ' ' + x.el : 'needs heroes (~' + x.deficit + ' ' + x.el + ')') + '</div>';
      }).join("") + '</div>');
    }
    if (!a.enoughTanks) out.push(suggCard(COL.rose, 'Not enough tanks to anchor every party — limited analysis until you have ' + slots + ' tanks.'));
    else if (a.covered >= slots) out.push(suggCard(COL.emerald, 'All ' + slots + ' parties can clear the barrier on class-average stats. 🎉'));
    return out.join("");
  }

  // Roster Health: element depth across all 6 elements + Fighter/tank count.
  function buildRosterHealth() {
    if (!healthBody) return;
    // Keep the header note in sync with the player's chosen barriers.
    var note = document.getElementById("healthBarrierNote");
    if (note) {
      var bnames = state.barriers.slice().sort(function (a, b) { return COVERAGE_ELS.indexOf(a) - COVERAGE_ELS.indexOf(b); })
        .map(function (e) { return e.charAt(0).toUpperCase() + e.slice(1); });
      note.textContent = "Aim for 3+ heroes per element. " + (bnames.length
        ? bnames.join(" / ") + " " + (bnames.length === 1 ? "is the" : "are the") + " current barrier priority."
        : "No barriers selected for this zone.");
    }
    var d = depth();
    var elRows = COVERAGE_ELS.map(function (el) {
      var n = d.h[el];
      var isBarrier = state.barriers.indexOf(el) >= 0;
      var low = n < 3;
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-2">' + barrierIcon(el) +
        '<span class="flex-1 capitalize text-sm">' + el + (isBarrier ? ' <span class="text-textSecondary text-xs">· barrier</span>' : '') + '</span>' +
        '<span class="font-mono text-sm font-bold" style="color:' + (low ? COL.rose : COL.emerald) + '">' + n + '</span>' +
        '<span class="text-xs text-textSecondary font-mono">/3</span></div>';
    }).join("");
    var flexNote = d.hflex
      ? '<div class="text-xs text-textSecondary px-1">+ ' + d.hflex + ' flex (All-element) hero' + (d.hflex > 1 ? 's' : '') + ' — counts toward any element.</div>'
      : '';

    var tankCount = 0, groups = { Fighter: 0, Rogue: 0, Spellcaster: 0 };
    state.heroes.forEach(function (h) {
      if (heroRole(h) === "tank") tankCount++;
      var c = CLASS[h.className]; if (c && groups[c.group] !== undefined) groups[c.group]++;
    });
    var slots = state.parties.length;
    var tankOk = tankCount >= slots;
    var overview =
      '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-2">' +
        '<span class="flex-1 text-sm">Fighters / tanks <span class="text-textSecondary text-xs">· need 1 per party</span></span>' +
        '<span class="font-mono text-sm font-bold" style="color:' + (tankOk ? COL.emerald : COL.rose) + '">' + tankCount + '</span>' +
        '<span class="text-xs text-textSecondary font-mono">/' + slots + '</span></div>' +
      '<div class="flex flex-wrap gap-2 text-xs">' +
        '<span class="bg-surface border-2 border-borderc rounded-lg px-2 py-1">Fighters <b style="color:' + GROUP_COLOR.Fighter + '">' + groups.Fighter + '</b></span>' +
        '<span class="bg-surface border-2 border-borderc rounded-lg px-2 py-1">Rogues <b style="color:' + GROUP_COLOR.Rogue + '">' + groups.Rogue + '</b></span>' +
        '<span class="bg-surface border-2 border-borderc rounded-lg px-2 py-1">Spellcasters <b style="color:' + GROUP_COLOR.Spellcaster + '">' + groups.Spellcaster + '</b></span>' +
      '</div>';

    var suggPlaceholder = '<div class="text-xs text-textSecondary italic">Click <b>Analyze</b> to evaluate your roster against the 320 barrier on class-average stats — recruit picks follow your class priority.</div>';
    healthBody.innerHTML =
      POWER_HEADER + 'Element depth (target 3+)</div>' + elRows + flexNote +
      '<div class="mt-4 pt-3 border-t border-borderc space-y-2">' + POWER_HEADER + 'Roster overview</div>' + overview + '</div>' +
      '<div class="mt-4 pt-3 border-t border-borderc">' +
        '<div class="flex items-center justify-between gap-2 mb-2">' +
          '<div class="text-xs font-semibold uppercase tracking-wider text-textSecondary">Suggestions</div>' +
          '<button id="analyzeBtn" class="btn-white text-xs px-3 py-1">Analyze</button>' +
        '</div>' +
        '<div class="space-y-1.5">' + (suggestionHTML || suggPlaceholder) + '</div>' +
      '</div>';
  }

  if (healthBody) {
    healthBody.addEventListener("click", function (e) {
      if (!e.target.closest("#analyzeBtn")) return;
      suggestionHTML = buildSuggestions();
      buildRosterHealth();
    });
  }

  var openHealthBtn = document.getElementById("openHealthBtn");
  if (openHealthBtn) openHealthBtn.addEventListener("click", function () { buildRosterHealth(); openPanel(healthPanel, healthBackdrop); });
  var healthCloseBtn = document.getElementById("healthClose");
  if (healthCloseBtn) healthCloseBtn.addEventListener("click", function () { closePanel(healthPanel, healthBackdrop); });
  if (healthBackdrop) healthBackdrop.addEventListener("click", function () { closePanel(healthPanel, healthBackdrop); });

  /* ---------------- Class Priority (left panel) ---------------- */
  var priorityPanel = document.getElementById("priorityPanel");
  var priorityBackdrop = document.getElementById("priorityBackdrop");
  var priorityBody = document.getElementById("priorityPanelBody");

  function buildPriorityPanel() {
    if (!priorityBody) return;
    var arrowBtn = "bg-transparent border-none text-textSecondary hover:text-textPrimary cursor-pointer text-sm leading-none disabled:opacity-30 px-0.5";
    var last = state.classOrder.length - 1;
    priorityBody.innerHTML = state.classOrder.map(function (name, i) {
      var c = CLASS[name], g = c ? c.group : "";
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1">' +
        '<span class="w-5 text-right font-mono text-xs text-textSecondary shrink-0">' + (i + 1) + '</span>' +
        classIcon(name) +
        '<span class="flex-1 min-w-0 truncate text-sm font-bold"' + (g ? ' style="color:' + GROUP_COLOR[g] + '"' : "") + '>' + escH(name) + '</span>' +
        '<button data-action="class-up" data-class="' + escA(name) + '" title="Move up" class="' + arrowBtn + '"' + (i === 0 ? " disabled" : "") + '>▲</button>' +
        '<button data-action="class-down" data-class="' + escA(name) + '" title="Move down" class="' + arrowBtn + '"' + (i === last ? " disabled" : "") + '>▼</button>' +
      '</div>';
    }).join("");
  }

  if (priorityBody) {
    priorityBody.addEventListener("click", function (e) {
      var up = e.target.closest('[data-action="class-up"]');
      var down = e.target.closest('[data-action="class-down"]');
      if (up) { moveClass(up.dataset.class, -1); buildPriorityPanel(); }
      else if (down) { moveClass(down.dataset.class, 1); buildPriorityPanel(); }
    });
  }

  var openPriorityBtn = document.getElementById("openPriorityBtn");
  if (openPriorityBtn) openPriorityBtn.addEventListener("click", function () { buildPriorityPanel(); openPanel(priorityPanel, priorityBackdrop); });
  var priorityCloseBtn = document.getElementById("priorityClose");
  if (priorityCloseBtn) priorityCloseBtn.addEventListener("click", function () { closePanel(priorityPanel, priorityBackdrop); });
  if (priorityBackdrop) priorityBackdrop.addEventListener("click", function () { closePanel(priorityPanel, priorityBackdrop); });

  /* ---------------- Hero Stats & MZE survivability ---------------- */
  // Meteor Zone Extreme combat numbers. bossHP / baseHit / AoE / DEF caps confirmed
  // against st-central Quest Data (source of truth): single hit 410, AoE 280, DEF caps
  // 50%/70%/75% @ 26,600 / 53,200 / 159,600. baseHit drives the DEF curve; enemy crit
  // is a flat baseHit×1.5 (615) ignoring DEF (Combat Compendium: enemy crit ~10%).
  // evaPenalty (Extreme −20 evade debuff) + evaCapDefault (75% dodge cap, Pathfinder 78)
  // are user-confirmed. critPerNegEva (+0.25%/neg-eva to enemy crit) is the one remaining
  // unconfirmed house rule. aoeHit not modeled yet (Phase-2 sim). Tweak here if values change.
  // critDmgMod = base HERO crit-damage multiplier (a normal crit = ATK × 2.0, user-confirmed);
  // class crit-damage skills add to it via CLASS_SKILLS.critDmgBonus.
  // allBarrierFactor = fraction of elemental power an "all"-element unit (Spellknight) contributes
  // to a barrier (st-central roster guide ≈ 50%; exact value unconfirmed — tune here when known).
  // roundCap = the quest hard-terminates (auto-fail) at round 500, so a party that can't
  // kill the boss before then simply loses, regardless of survivability.
  var MZE = { bossHP: 10000000, baseHit: 410, aoeHit: 280, aoeChance: 0.225, critHit: 615, critChance: 0.10, critPerNegEva: 0.0025, evaPenalty: 20, evaCapDefault: 75, critDmgMod: 2.0, allBarrierFactor: 0.5, roundCap: 500 };
  // aoeChance = per-round chance the boss uses an AoE that hits EVERY unit (~20-25% observed;
  // 0.225 midpoint, tunable). aoeHit (280) is DEF-reduced like a normal hit (~68% of baseHit).

  // ---- Phase-2 Monte Carlo sim tuning (conditional / `sim`-flagged skills) ----
  // The engine (simulateFight) switches on class/champion NAME and pulls magnitudes from here, so
  // every conditional-skill number lives in ONE place (like MZE). The CLASS_SKILLS / CHAMPION_SKILLS
  // `text` is the player-facing wording of these same effects. Tune freely.
  //   jarl    : below 80%/55%/30% HP → +50%/100%/150% ATK & +10/20/30 EVA (1×/2×/3× the tier values).
  //   conq    : +0.25 crit-MULT per consecutive crit, up to 4 stacks (resets on a non-crit).
  //   sensei  : +50 crit chance & +25 EVA while undamaged; lost when hit, regained after 2 clean rounds.
  //   acrobat : guaranteed crit the round after it dodges. daimyo: guaranteed dodge + crit on round 1.
  //   bishop  : +10 HP/round self-heal AND survives one fatal blow — BOTH self-only (the individual
  //             Bishop), not the party. (Lord's save is the party-wide one.) See the save logic below.
  //   dk      : execute — when the boss is at ≤10% HP and the Death Knight attacks, the boss is
  //             instantly defeated (the fight is won). Otherwise the DK just deals its normal hit.
  //   rudo    : party-wide +50 crit chance for the first 4 rounds. lilu: party +20 HP/round.
  //   hemma   : drains 7% of the highest-HP ally/round → self-heal + a stacking +35% ATK (cap 12).
  var SIM = {
    trials: 400,            // trials per DISPLAYED party grade (seeded → the % is stable, not flickery)
    optimizerTrials: 400,   // trials per Recommended/scoreOf eval (cached; ~±2% noise so the refine can trust ~3% gaps)
    jarl:   { t1: 0.80, t2: 0.55, t3: 0.30, atkPerTier: 0.50, evaPerTier: 10 },
    conq:   { perStack: 0.25, maxStacks: 4 },
    sensei: { crit: 50, eva: 25, regainRounds: 2 },
    bishop: { regen: 10 },
    dk:     { executeFrac: 0.10 }, // boss at ≤10% HP when the DK attacks → instantly defeated
    rudo:   { crit: 50, rounds: 4 },
    lilu:   { heal: 20 },
    hemma:  { drainFrac: 0.07, atkPerStack: 0.35, maxStacks: 12 }
  };
  // FNV-1a string hash → a stable 32-bit seed (so the same roster always shows the same sim %).
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var STATFIELD = "bg-hoverBg border border-borderc rounded text-textPrimary px-1 py-1 outline-none text-xs font-mono text-right focus:border-accent";
  function statNum(x) { return Number(String(x).replace(/[^0-9.\-]/g, "")) || 0; }

  function mzeDefMult(def) {
    def = Number(def) || 0;
    if (def <= 0) return 1.5;
    if (def <= 26600) return 1.5 - def / 26600;                       // 1.5x -> 0.5x
    if (def <= 53200) return 0.5 - 0.2 * (def - 26600) / 26600;       // 0.5x -> 0.3x
    if (def <= 159600) return 0.3 - 0.05 * (def - 53200) / 106400;    // 0.3x -> 0.25x
    return 0.25;
  }
  function survStats(hp, def, eva, evaCap) {
    var normal = Math.round(MZE.baseHit * mzeDefMult(def));
    var crit = MZE.critHit;
    var effEva = eva - MZE.evaPenalty; // EXTREME applies -20 evade debuff
    // st-central: chance to evade = EVA%; capped at 75% (Pathfinder 78%) after the debuff.
    var cap = (evaCap || MZE.evaCapDefault) / 100;
    var dodge = Math.max(0, Math.min(cap, effEva / 100));
    var critChance = MZE.critChance + Math.max(0, -effEva) * MZE.critPerNegEva;
    var hitsToDie = normal > 0 ? Math.ceil(hp / normal) : 0;
    var flag = hp <= 0 ? "none" : hp <= crit ? "risk" : hp <= 2 * normal ? "two" : "safe";
    return { normal: normal, crit: crit, critChance: critChance, hitsToDie: hitsToDie, flag: flag, effEva: effEva, dodge: dodge };
  }
  function survivability(h) { return survStats(heroStat(h, "hp"), heroStat(h, "def"), heroStat(h, "eva"), evaCapOf(h.className)); }
  function champSurv(c) { return survStats(Number(c.hp) || 0, Number(c.def) || 0, Number(c.eva) || 0); }
  function survColor(f) { return f === "risk" ? COL.rose : f === "two" ? COL.amber : f === "safe" ? COL.emerald : COL.muted; }
  function survBadge(h) {
    var s = survivability(h);
    var label = heroStat(h, "hp") <= 0 ? "—" : (s.flag === "risk" ? "1-shot" : s.hitsToDie + " hits");
    return '<span data-surv-id="' + h.id + '" class="w-20 shrink-0 text-right text-xs font-bold font-mono" style="color:' + survColor(s.flag) + '" ' +
      'title="normal ' + s.normal + '/hit · crit ' + s.crit + ' (ignores DEF) · crit chance ' + Math.round(s.critChance * 100) + '% · dodge ' + Math.round(s.dodge * 100) + '% (after −20 MZE)">' + label + '</span>';
  }
  // Per-hero OVERRIDE field: blank = inherit (placeholder shows the class average).
  function overrideField(h, stat, w) {
    var ov = h[stat];
    var val = (ov === null || ov === undefined || ov === "") ? "" : ov;
    return '<input type="text" inputmode="numeric" value="' + val + '" placeholder="' + classAvg(h.className, stat) + '" data-stat-id="' + h.id + '" data-stat="' + stat + '" class="' + STATFIELD + ' ' + w + '">';
  }
  // Class-average field.
  function classField(name, stat, w) {
    return '<input type="text" inputmode="numeric" value="' + (Number(state.classStats[name][stat]) || 0) + '" data-cls="' + escA(name) + '" data-stat="' + stat + '" class="' + STATFIELD + ' ' + w + '">';
  }
  // Champion stat field.
  function champField(name, stat, w) {
    var c = getChampion(name);
    return '<input type="text" inputmode="numeric" value="' + (Number(c[stat]) || 0) + '" data-champ="' + escA(name) + '" data-stat="' + stat + '" class="' + STATFIELD + ' ' + w + '">';
  }

  // Class-skill lookups (foldable parts only — see CLASS_SKILLS).
  function classSkill(cn) { return CLASS_SKILLS[cn] || null; }
  function critMultOf(cn) { var cd = classAvg(cn, "critDmg"); return cd > 0 ? cd : MZE.critDmgMod; } // per-class crit-damage multiplier (data)
  function heroCritMult(h) { var cd = heroStat(h, "critDmg"); return cd > 0 ? cd : MZE.critDmgMod; } // per-hero crit damage: override if set, else the class default
  function evaCapOf(cn) { var s = CLASS_SKILLS[cn]; return s && s.evaCap ? s.evaCap : MZE.evaCapDefault; }
  function classSaves(cn) { var s = CLASS_SKILLS[cn]; return (s && (s.protectAlly || s.surviveFatal)) ? 1 : 0; }

  // Champion party-aura buff bundle (foldable parts of CHAMPION_SKILLS). `classNames`
  // = the party's hero classes, for composition-scaled auras (Donovan). Multipliers
  // for ATK/DEF/HP/barrier; additive points for crit chance / evasion; additive to the
  // crit multiplier for crit damage. Neutral (all 1×/0) when there's no champion/skill.
  function partyBuff(champ, classNames) {
    var b = { atkMult: 1, defMult: 1, hpMult: 1, critAdd: 0, evaAdd: 0, critDmgAdd: 0, barrierMult: 1 };
    var s = champ ? CHAMPION_SKILLS[champ.name] : null;
    if (!s) return b;
    if (s.atkPct) b.atkMult *= 1 + s.atkPct / 100;
    if (s.defPct) b.defMult *= 1 + s.defPct / 100;
    if (s.hpPct) b.hpMult *= 1 + s.hpPct / 100;
    if (s.barrierPct) b.barrierMult *= 1 + s.barrierPct / 100;
    if (s.critAdd) b.critAdd += s.critAdd;
    if (s.evaAdd) b.evaAdd += s.evaAdd;
    if (s.critDmgAdd) b.critDmgAdd += s.critDmgAdd;
    if (s.perGroup) {
      var cnt = { Fighter: 0, Rogue: 0, Spellcaster: 0 };
      (classNames || []).forEach(function (cn) { var g = CLASS[cn] && CLASS[cn].group; if (cnt[g] !== undefined) cnt[g]++; });
      b.atkMult *= 1 + (s.perGroup.spellcasterAtk || 0) * cnt.Spellcaster / 100;
      b.hpMult *= 1 + (s.perGroup.fighterHp || 0) * cnt.Fighter / 100;
      b.critAdd += (s.perGroup.rogueCrit || 0) * cnt.Rogue;
      b.evaAdd += (s.perGroup.rogueEva || 0) * cnt.Rogue;
    }
    return b;
  }
  // Effective ATK with a class crit multiplier and a party buff applied.
  function buffedEffAtk(atk, crit, critMult, buff) {
    return effAtkOf((Number(atk) || 0) * buff.atkMult, (Number(crit) || 0) + buff.critAdd, critMult + buff.critDmgAdd);
  }

  // Hero damage-per-round including crit. st-central: CR is the effective crit chance
  // per swing (capped at 100% here), crit hit = ATK × crit multiplier (base 2.0 + the
  // class's crit-damage skill bonus). Effective ATK = chance-weighted normal/crit swings.
  function effAtkOf(atk, crit, critMult) {
    var cc = Math.max(0, Math.min(1, (Number(crit) || 0) / 100));
    return (Number(atk) || 0) * (1 + cc * (critMult - 1));
  }

  // P(N >= k) for N ~ Poisson(lambda): chance of taking at least k landed hits.
  function poissonTailGE(lambda, k) {
    if (!isFinite(k)) return 0;
    if (lambda <= 0) return 0;
    if (k <= 0) return 1;
    var term = Math.exp(-lambda), cdf = term; // P(N=0)
    for (var i = 1; i < k; i++) { term *= lambda / i; cdf += term; }
    return Math.max(0, Math.min(1, 1 - cdf));
  }

  // Expected unit deaths over the fight (raw float). The boss makes ~1 single-target hit per
  // round (AoE not modeled yet), targeting a unit by THREAT share (st-central: target chance =
  // threat / total threat); the unit may DODGE (EVA%, capped). A unit dies once its ACCUMULATED
  // hits reach its kill count (HP ÷ avg hit) — capturing both one-shots (frail, 1 hit) and
  // attrition (wear-down). Landed hits are Poisson, so death stays unlikely until expected hits
  // approach the kill count. **More rounds = more exposure = more expected deaths** — this is the
  // only channel through which kill speed matters (fights auto-skip, so raw duration is free).
  // `saves` = lethal negations (Lord protect / Bishop survive-fatal). Per-hit average and the
  // 1-hit/round assumption are tunable; a calibrated value is the deferred Phase-2 sim.
  // Per-unit death probability over the fight (independent across units). Two damage streams:
  // single-target (threat-gated → the tank soaks it) + AoE (hits EVERY unit, NOT threat-gated → the
  // tank can't shield squishies). A unit dies once accumulated landed hits reach its kill count
  // (HP ÷ avg hit); landed hits are Poisson (`poissonTailGE`). AoE is converted to single-hit-damage
  // equivalents so the same killHits applies — this is what gives a low-threat glass cannon real risk.
  function unitDeathModel(units, rounds) { // per-unit { lambda: expected single-hit-equiv landed hits, killHits: hits to die }
    var totalThreat = units.reduce(function (s, u) { return s + (Number(u.threat) || 0); }, 0);
    var n = units.length || 1;
    var r = (isFinite(rounds) && rounds > 0) ? rounds : 60;
    return units.map(function (u) {
      if (u.hp <= 0) return { lambda: 0, killHits: Infinity };
      var share = totalThreat > 0 ? (Number(u.threat) || 0) / totalThreat : 1 / n;
      var s = survStats(u.hp, u.def, u.eva, u.evaCap);
      var avgDmg = s.normal * (1 - s.critChance) + s.crit * s.critChance; // crit ignores DEF
      var killHits = avgDmg > 0 ? Math.max(1, Math.ceil(u.hp / avgDmg)) : Infinity;
      var aoeDmg = MZE.aoeHit * mzeDefMult(u.def);                        // DEF-reduced AoE hit
      var aoeEquivHits = avgDmg > 0 ? r * MZE.aoeChance * (1 - s.dodge) * (aoeDmg / avgDmg) : 0;
      var lambda = r * share * (1 - s.dodge) + aoeEquivHits;             // single-hit-equiv landed hits
      return { lambda: lambda, killHits: killHits };
    });
  }
  // Estimated win chance (0..1) = P(the party CLEARS the quest) — "not wiped", not "no losses".
  // A casualty only matters if it costs enough DPS that the survivors can't kill the 10M boss before
  // the 500-round cap. So losing a squishy is fine when the rest still kill in time; losing your
  // damage core (or the whole party) is a loss. Enumerates the 2^n survivor subsets from independent
  // per-unit death probs (n ≤ ~5). A faster kill = more DPS headroom to absorb losses; a near-cap
  // party can't afford to lose a carry. `saves` (Lord/Bishop) shield the highest-risk allies.
  // Calibrated probability is the deferred Phase-2 Monte Carlo; this is a closed-form estimate.
  function winChance(units, rounds, saves) {
    var n = units.length;
    if (!n) return 0;
    var m = unitDeathModel(units, rounds);
    var p = m.map(function (d) { return poissonTailGE(d.lambda, d.killHits); });
    // A save (Lord protect / Bishop survive-fatal) revives its ally to 1 HP on the first lethal hit,
    // so it dies only after ONE MORE landed hit → killHits + 1 (NOT full immunity). One save per
    // Lord/Bishop, applied to the current highest-risk unit(s).
    var order = p.map(function (v, i) { return i; }).sort(function (a, b) { return p[b] - p[a]; });
    for (var k = 0; k < Math.floor(Number(saves) || 0) && k < order.length; k++) {
      var si = order[k];
      p[si] = poissonTailGE(m[si].lambda, m[si].killHits + 1);
    }
    var minAtk = MZE.bossHP / MZE.roundCap; // ATK floor to kill before the round cap
    var win = 0;
    for (var mask = 0; mask < (1 << n); mask++) {          // bit set = unit SURVIVES
      var prob = 1, survAtk = 0, alive = 0;
      for (var i = 0; i < n; i++) {
        if (mask & (1 << i)) { prob *= (1 - p[i]); survAtk += (Number(units[i].atk) || 0); alive++; }
        else { prob *= p[i]; }
      }
      if (prob <= 0) continue;
      if (alive > 0 && survAtk > minAtk) win += prob; // survivors retain enough DPS to clear in time
    }
    return Math.max(0, Math.min(1, win));
  }
  // est. win-chance thresholds for the face (tune freely). D = "almost certainly a loss" (≤20%).
  var WIN_BANDS = { S: 0.95, A: 0.75, B: 0.65, D: 0.20 };
  function winTier(w) { return w >= WIN_BANDS.S ? 0 : w >= WIN_BANDS.A ? 1 : w >= WIN_BANDS.B ? 2 : w > WIN_BANDS.D ? 3 : 4; }
  var GRADE_LETTERS = ["S", "A", "B", "C", "D"];
  function partyUnits(hs, champ, buff) {
    buff = buff || partyBuff(null, []);
    var units = hs.map(function (h) {
      return { hp: heroStat(h, "hp") * buff.hpMult, def: heroStat(h, "def") * buff.defMult, eva: heroStat(h, "eva") + buff.evaAdd, threat: heroStat(h, "threat"), evaCap: evaCapOf(h.className), atk: buffedEffAtk(heroStat(h, "atk"), heroStat(h, "crit"), heroCritMult(h), buff) };
    });
    if (champ) units.push({ hp: (Number(champ.hp) || 0) * buff.hpMult, def: (Number(champ.def) || 0) * buff.defMult, eva: (Number(champ.eva) || 0) + buff.evaAdd, threat: Number(champ.threat) || 0, evaCap: MZE.evaCapDefault, atk: buffedEffAtk(Number(champ.atk) || 0, Number(champ.crit) || 0, MZE.critDmgMod, buff) });
    return units;
  }

  /* ---------------- Phase-2 Monte Carlo combat sim ----------------
   * A per-round fight simulator that resolves a SINGLE trial of the MZE fight, then averages many
   * seeded trials into a win %. Unlike the closed-form `winChance` (a static expectation), the sim
   * tracks boss HP draining round-by-round from the ALIVE units, so STATE-DEPENDENT skills can move
   * the grade: Jarl's HP-threshold rage, Conq/Acrobat/Daimyo/Sensei crit states, DK execute/stacking,
   * Rudo's timed crit, and Lilu/Hemma/Bishop healing all read the live fight state each round.
   *
   * Damage model: the boss's attacks (who's targeted, dodge, crit, AoE) are the Monte Carlo dice —
   * they decide who dies and when, which drives party DPS over time. Each unit's OWN attack rolls a
   * discrete crit too (so "consecutive crit" / "guaranteed crit" skills are real events); a discrete
   * crit averages to exactly `effAtkOf` (atk·(1+cc·(critMult−1))), so with conditionals OFF the sim's
   * mean DPS matches the closed-form's folded ATK — see the bare-mode sanity check in the NOTES.
   *
   * Performance tradeoff (documented): the OPTIMIZER (`scoreOf`/Recommended) keeps the fast closed-form
   * `winChance` for its thousands of inner-loop evals; the sim runs ONLY for the displayed party grade
   * (`partyOutcome`), memoized per exact composition (`_simCache`) so re-renders are free.
   */
  var _simBare = false; // when true, conditional skills are skipped (engine-vs-closed-form sanity check)

  // One sim unit: combat stats + the runtime fields the conditional skills mutate during a trial.
  // critMult already includes the champion crit-damage aura (buff.critDmgAdd), mirroring buffedEffAtk.
  function simUnitFromStats(cn, isChamp, champName, hp, def, eva, threat, evaCap, atk, crit, critMult) {
    return {
      cn: cn, isChamp: !!isChamp, champName: champName || null,
      maxHp: hp, def: def, evaBase: eva, threat: threat, evaCap: evaCap,
      baseAtk: Number(atk) || 0, critChance: Number(crit) || 0, critMult: critMult
    };
  }
  // Build the sim unit list for a party — same buffed stats as `partyUnits`, plus the raw crit
  // chance / crit multiplier the sim needs to roll discrete crits (partyUnits pre-folds them into atk).
  function simUnits(hs, champ, buff) {
    buff = buff || partyBuff(null, []);
    var units = hs.map(function (h) {
      return simUnitFromStats(h.className, false, null,
        heroStat(h, "hp") * buff.hpMult, heroStat(h, "def") * buff.defMult,
        heroStat(h, "eva") + buff.evaAdd, heroStat(h, "threat"), evaCapOf(h.className),
        (Number(heroStat(h, "atk")) || 0) * buff.atkMult, heroStat(h, "crit") + buff.critAdd,
        heroCritMult(h) + buff.critDmgAdd);
    });
    if (champ) units.push(simUnitFromStats(null, true, champ.name,
      (Number(champ.hp) || 0) * buff.hpMult, (Number(champ.def) || 0) * buff.defMult,
      (Number(champ.eva) || 0) + buff.evaAdd, Number(champ.threat) || 0, MZE.evaCapDefault,
      (Number(champ.atk) || 0) * buff.atkMult, (Number(champ.crit) || 0) + buff.critAdd,
      MZE.critDmgMod + buff.critDmgAdd));
    return units;
  }
  function jarlTier(frac) { return frac < SIM.jarl.t3 ? 3 : frac < SIM.jarl.t2 ? 2 : frac < SIM.jarl.t1 ? 1 : 0; }
  // Conditional-adjusted EVA (Jarl rage, Sensei untouched buff) — used for both dodge and enemy-crit chance.
  function condEva(x) {
    var eva = x.evaBase;
    if (!_simBare) {
      if (x.cn === "Jarl") { var t = jarlTier(x.hp / x.maxHp); if (t) eva += SIM.jarl.evaPerTier * t; }
      else if (x.cn === "Sensei" && x.sensClean) eva += SIM.sensei.eva;
    }
    return eva;
  }
  function dodgeProbOf(x, r) {
    if (!_simBare && x.cn === "Daimyo" && r === 1) return 1; // guaranteed round-1 dodge
    var effEva = condEva(x) - MZE.evaPenalty;
    var cap = (x.evaCap || MZE.evaCapDefault) / 100;
    return Math.max(0, Math.min(cap, effEva / 100));
  }
  // Apply one boss attack to a unit (single-target can crit; AoE is a flat DEF-reduced hit). Mutates hp.
  // Returns a { dodged, dmg, crit } info object ONLY when `wantInfo` (the combat-replay log) — the hot
  // grade/optimizer path passes wantInfo=false so it allocates nothing per hit (avoids heavy GC churn).
  function applyBossHit(x, r, rng, isAoe, wantInfo) {
    if (rng() < dodgeProbOf(x, r)) { x.dodgedThisRound = true; return wantInfo ? { dodged: true, dmg: 0, crit: false } : null; }
    var dmg, crit = false;
    if (isAoe) {
      dmg = MZE.aoeHit * mzeDefMult(x.def);
    } else {
      var effEva = condEva(x) - MZE.evaPenalty;
      var bossCrit = MZE.critChance + Math.max(0, -effEva) * MZE.critPerNegEva; // crit ignores DEF
      crit = rng() < bossCrit;
      dmg = crit ? MZE.critHit : MZE.baseHit * mzeDefMult(x.def);
    }
    x.hp -= dmg;
    x.damagedThisRound = true;
    return wantInfo ? { dodged: false, dmg: dmg, crit: crit } : null;
  }
  // Resolve ONE fight → true (boss dead before the round cap) / false (wiped or hit the cap).
  // `rng` is a mulberry32 stream (advanced across trials); `opts` = { saves, champName }.
  function simulateFight(units, rng, opts, log) {
    opts = opts || {};
    var n = units.length;
    if (!n) return false;
    var u = new Array(n);
    for (var i = 0; i < n; i++) { var s = units[i];
      u[i] = { cn: s.cn, isChamp: s.isChamp, champName: s.champName, maxHp: s.maxHp, hp: s.maxHp,
        def: s.def, evaBase: s.evaBase, threat: s.threat, evaCap: s.evaCap, baseAtk: s.baseAtk,
        critChance: s.critChance, critMult: s.critMult, alive: true, consec: 0,
        hemmaStack: 0, sensClean: true, sensCnt: 0, dodgedThisRound: false,
        damagedThisRound: false,
        // Bishop survive-fatal is SELF-only (the individual Bishop). Lord's is the party-wide pool below.
        selfSave: !_simBare && !!(CLASS_SKILLS[s.cn] && CLASS_SKILLS[s.cn].surviveFatal), usedSelfSave: false };
    }
    // Combat-replay logging (only when `log` is passed — the grade/optimizer path skips all of this).
    var LOG = !!log;
    function LG(rd, k, t) { if (LOG) log.push({ r: rd, k: k, t: t }); }
    function num(v) { return Math.round(v).toLocaleString(); }
    if (LOG) { // unique display labels (dedupe same-class heroes)
      var seenL = {}; u.forEach(function (z) { var b = z.isChamp ? z.champName + " (champ)" : z.cn; seenL[b] = (seenL[b] || 0) + 1; });
      var cntL = {}; u.forEach(function (z) { var b = z.isChamp ? z.champName + " (champ)" : z.cn; if (seenL[b] > 1) { cntL[b] = (cntL[b] || 0) + 1; z.label = b + " #" + cntL[b]; } else z.label = b; });
    }
    function lab(z) { return z.label || (z.isChamp ? z.champName : z.cn); }
    // Party-wide saves = Lord's "protect an ally" (one per Lord). Bishop's save is per-unit (selfSave), NOT here.
    var allySaves = 0;
    if (!_simBare) for (var i = 0; i < n; i++) { if (CLASS_SKILLS[u[i].cn] && CLASS_SKILLS[u[i].cn].protectAlly) allySaves++; }
    var rudo = !_simBare && opts.champName === "Rudo";
    var lilu = !_simBare && opts.champName === "Lilu";
    var bossHp = MZE.bossHP, cap = MZE.roundCap;
    for (var r = 1; r <= cap; r++) {
      // ---- boss attacks FIRST (boss-first ordering, confirmed against the live game) ----
      // The boss strikes before the party deals damage each round, so a unit the boss kills this round
      // contributes NO damage that round — about-to-die units are removed before they can act. Round 1
      // is the boss's opening volley.
      var totT = 0, aliveCnt = 0;
      for (var i = 0; i < n; i++) { u[i].dodgedThisRound = false; u[i].damagedThisRound = false; if (u[i].alive) { totT += Number(u[i].threat) || 0; aliveCnt++; } }
      if (!aliveCnt) { LG(r, "loss", "Party wiped — LOSS (round " + r + ")"); return false; }
      // single-target by threat share
      var roll = rng() * (totT > 0 ? totT : aliveCnt), acc = 0, tgt = null;
      for (var i = 0; i < n; i++) {
        if (!u[i].alive) continue;
        acc += totT > 0 ? (Number(u[i].threat) || 0) : 1;
        if (roll <= acc) { tgt = u[i]; break; }
      }
      if (!tgt) { for (var i = n - 1; i >= 0; i--) if (u[i].alive) { tgt = u[i]; break; } }
      var sres = applyBossHit(tgt, r, rng, false, LOG);
      if (LOG) LG(r, sres.dodged ? "dodge" : (sres.crit ? "bosscrit" : "hit"), "Boss strikes " + lab(tgt) + ": " + (sres.dodged ? "DODGED" : (sres.crit ? "CRIT " + num(sres.dmg) : num(sres.dmg))));
      // AoE: hits every alive unit (per-unit dodge), no threat gate
      if (rng() < MZE.aoeChance) {
        var aoeParts = LOG ? [] : null;
        for (var i = 0; i < n; i++) if (u[i].alive) { var ares = applyBossHit(u[i], r, rng, true, LOG); if (LOG) aoeParts.push(lab(u[i]) + ": " + (ares.dodged ? "dodged" : num(ares.dmg))); }
        if (LOG) LG(r, "aoe", "Boss AoE → " + (aoeParts ? aoeParts.join(" · ") : ""));
      }
      // deaths — a Bishop spends its OWN survive-fatal first; otherwise a Lord's party-wide save covers
      // the ally; else the unit dies. Each save revives to 1 HP, once. Resolved BEFORE party damage so a
      // killed unit can't deal its share this round (the whole point of boss-first).
      for (var i = 0; i < n; i++) { var x = u[i]; if (x.alive && x.hp <= 0) {
        if (x.selfSave && !x.usedSelfSave) { x.usedSelfSave = true; x.hp = 1; LG(r, "save", lab(x) + " survives a fatal blow → 1 HP"); }
        else if (allySaves > 0) { allySaves--; x.hp = 1; LG(r, "save", lab(x) + " shielded by a Lord → 1 HP"); }
        else { x.alive = false; LG(r, "death", lab(x) + " is defeated"); }
      } }
      // Sensei loses "+crit/+eva until damaged" the instant it's hit — now BEFORE it attacks, since the
      // boss strikes first (the opening volley can knock it out of its untouched state). The "regain after
      // N clean rounds" half stays in end-of-round upkeep below.
      if (!_simBare) for (var i = 0; i < n; i++) { var x = u[i]; if (x.alive && x.cn === "Sensei" && x.damagedThisRound) { x.sensClean = false; x.sensCnt = 0; } }

      // ---- party damage (alive units, with this round's conditional state) ----
      var dmg = 0, procs = LOG ? [] : null, critN = 0;
      for (var i = 0; i < n; i++) {
        var x = u[i]; if (!x.alive) continue;
        // Death Knight execute: if the boss is at ≤10% HP when the DK attacks, it's instantly defeated.
        if (!_simBare && x.cn === "Death Knight" && (bossHp - dmg) <= MZE.bossHP * SIM.dk.executeFrac) {
          LG(r, "win", lab(x) + " EXECUTES the boss (≤" + Math.round(SIM.dk.executeFrac * 100) + "% HP) — WIN");
          return true;
        }
        var cc = x.critChance, cm = x.critMult, atkMul = 1, forced = false;
        if (!_simBare) {
          if (x.cn === "Jarl") { var t = jarlTier(x.hp / x.maxHp); if (t) { atkMul *= 1 + SIM.jarl.atkPerTier * t; if (LOG) procs.push(lab(x) + " rage×" + t); } }
          else if (x.cn === "Sensei") { if (x.sensClean) { cc += SIM.sensei.crit; if (LOG) procs.push(lab(x) + " +crit (untouched)"); } }
          else if (x.cn === "Daimyo") { if (r === 1) { forced = true; if (LOG) procs.push(lab(x) + " round-1 crit"); } }
          // Acrobat: guaranteed crit after dodging. Boss-first means the dodge already happened THIS round
          // (boss phase above), so the reward lands on this round's attack → read dodgedThisRound.
          else if (x.cn === "Acrobat") { if (x.dodgedThisRound) { forced = true; if (LOG) procs.push(lab(x) + " crit (post-dodge)"); } }
          else if (x.cn === "Conquistador") { if (x.consec > 0) { cm += SIM.conq.perStack * Math.min(x.consec, SIM.conq.maxStacks); if (LOG) procs.push(lab(x) + " crit-stack×" + Math.min(x.consec, SIM.conq.maxStacks)); } }
          if (rudo && r <= SIM.rudo.rounds) cc += SIM.rudo.crit;
          if (x.isChamp && x.champName === "Hemma" && x.hemmaStack > 0) { atkMul *= 1 + SIM.hemma.atkPerStack * x.hemmaStack; if (LOG) procs.push(lab(x) + " ATK-stack×" + x.hemmaStack); }
        }
        var isCrit = forced || (rng() < Math.max(0, Math.min(1, cc / 100)));
        if (isCrit) critN++;
        dmg += x.baseAtk * atkMul * (isCrit ? cm : 1);
        if (!_simBare && x.cn === "Conquistador") x.consec = isCrit ? x.consec + 1 : 0;
      }
      bossHp -= dmg;
      if (LOG) {
        if (rudo && r <= SIM.rudo.rounds) procs.unshift("Rudo +crit (party)");
        LG(r, "dmg", "Party deals " + num(dmg) + (critN ? " (" + critN + " crit" + (critN > 1 ? "s" : "") + ")" : "") +
          " → Boss " + num(Math.max(0, bossHp)) + " (" + Math.max(0, Math.round(bossHp / MZE.bossHP * 100)) + "%)" +
          (procs.length ? " · " + procs.join(", ") : ""));
      }
      if (bossHp <= 0) { LG(r, "win", "Boss defeated — WIN (round " + r + ")"); return true; }
      // ---- end-of-round upkeep (healing, Hemma drain, Sensei regain) ----
      if (!_simBare) {
        for (var i = 0; i < n; i++) { var x = u[i]; if (!x.alive) continue;
          if (lilu) x.hp = Math.min(x.maxHp, x.hp + SIM.lilu.heal);
          if (x.cn === "Bishop") x.hp = Math.min(x.maxHp, x.hp + SIM.bishop.regen);
        }
        var hemma = null;
        for (var i = 0; i < n; i++) if (u[i].alive && u[i].isChamp && u[i].champName === "Hemma") { hemma = u[i]; break; }
        if (hemma) {
          var victim = null;
          for (var i = 0; i < n; i++) { var x = u[i]; if (x.alive && x !== hemma && (!victim || x.hp > victim.hp)) victim = x; }
          if (victim) { var drain = victim.hp * SIM.hemma.drainFrac; victim.hp -= drain;
            hemma.hp = Math.min(hemma.maxHp, hemma.hp + drain); if (hemma.hemmaStack < SIM.hemma.maxStacks) hemma.hemmaStack++;
            LG(r, "heal", lab(hemma) + " drains " + lab(victim) + " (" + num(drain) + " HP) → self-heal + ATK stack"); }
        }
        // Sensei regains its untouched buff after N clean (undamaged) rounds. The "lost when damaged"
        // half ran above, before the party attacked.
        for (var i = 0; i < n; i++) { var x = u[i]; if (!x.alive) continue;
          if (x.cn === "Sensei" && !x.damagedThisRound && !x.sensClean) { x.sensCnt++; if (x.sensCnt >= SIM.sensei.regainRounds) x.sensClean = true; }
        }
      }
    }
    LG(cap, "loss", "Boss not killed before the " + cap + "-round cap — LOSS");
    return bossHp <= 0; // round cap reached → loss
  }
  // Average N seeded trials → win chance (0..1). Deterministic given the seed.
  function simWinChance(units, N, seed, opts) {
    N = N || SIM.trials;
    _simBare = !!(opts && opts.bare);
    var rng = mulberry32(seed >>> 0), wins = 0;
    for (var t = 0; t < N; t++) if (simulateFight(units, rng, opts)) wins++;
    _simBare = false;
    return wins / N;
  }
  // Composition signature → memo key + stable seed source. Encodes everything that changes the sim
  // (classes, every resolved stat, champion, saves, gear tier, sim version) so the cache never goes stale.
  function partySig(hs, champ, saves) {
    var hero = hs.map(function (h) {
      return h.className + "," + heroStat(h, "hp") + "," + heroStat(h, "atk") + "," + heroStat(h, "def") +
        "," + heroStat(h, "eva") + "," + heroStat(h, "crit") + "," + heroStat(h, "threat") + "," + heroStat(h, "critDmg");
    }).join(";");
    var ch = champ ? [champ.name, champ.hp, champ.atk, champ.def, champ.eva, champ.crit, champ.threat].join(",") : "";
    return "sim2|" + state.quality + "|" + saves + "|" + hero + "|" + ch;
  }
  var _simCache = {};       // displayed-grade sim (per exact composition, partySig)
  var _simScoreCache = {};  // optimizer sim (per champion + sorted slots + saves + tier, see scoreOf)

  // Full party outcome → the face icon. The grade is the ESTIMATED WIN CHANCE, not raw speed:
  //   • Hard fails (win 0%): undermanned, barrier not broken (≥320), or can't kill the 10M boss
  //     before the 500-round cap (auto-loss).
  //   • Otherwise grade by est. win % = P(no losses over the kill duration) → S/A/B/C (WIN_BANDS).
  // Kill speed (rounds) only matters via exposure: more rounds = more boss hits = lower win%.
  // So a slow-but-unkillable party rightly grades high, and a fast-but-fragile one rightly drops.
  function partyOutcome(p) {
    var hs = state.heroes.filter(function (h) { return h.partyId === p.id; });
    var champ = getChampion(p.champName);
    var buff = partyBuff(champ, hs.map(function (h) { return h.className; }));
    var atk = hs.reduce(function (a, h) { return a + buffedEffAtk(heroStat(h, "atk"), heroStat(h, "crit"), heroCritMult(h), buff); }, 0) +
      (champ ? buffedEffAtk(Number(champ.atk) || 0, Number(champ.crit) || 0, MZE.critDmgMod, buff) : 0);
    var rounds = atk > 0 ? Math.ceil(MZE.bossHP / atk) : Infinity;
    if (hs.length !== partyCap(p)) return { grade: "D", winPct: 0, fail: true, reason: "undermanned", rounds: rounds };
    if (state.barriers.length > 0 && partyBestBarrier(p, hs) * buff.barrierMult < BARRIER_POWER_TARGET) return { grade: "D", winPct: 0, fail: true, reason: "barrier", rounds: rounds };
    if (rounds >= MZE.roundCap) return { grade: "D", winPct: 0, fail: true, reason: "roundcap", rounds: rounds };
    var saves = hs.reduce(function (a, h) { return a + classSaves(h.className); }, 0);
    // Phase-2: the DISPLAYED grade comes from the Monte Carlo sim (models the conditional skills),
    // seeded + memoized per composition so the % is stable and re-renders are free. The closed-form
    // `winChance` stays as the fast fallback the optimizer (scoreOf) uses in its inner loop.
    var sig = partySig(hs, champ, saves);
    var w = _simCache[sig];
    if (w === undefined) {
      w = simWinChance(simUnits(hs, champ, buff), SIM.trials, hashStr(sig), { saves: saves, champName: champ ? champ.name : null });
      _simCache[sig] = w;
    }
    return { grade: GRADE_LETTERS[winTier(w)], winPct: Math.round(w * 100), fail: false, reason: null, rounds: rounds };
  }
  function partyGrade(p) { return partyOutcome(p).grade; }
  // One seeded sample fight for the "Simulate combat" replay → { win, log[] }. Pure combat (the barrier /
  // undermanned context is surfaced separately via partyOutcome in the modal). Same engine as the grade.
  function simulateReplay(p, seed) {
    var hs = state.heroes.filter(function (h) { return h.partyId === p.id; });
    var champ = getChampion(p.champName);
    var buff = partyBuff(champ, hs.map(function (h) { return h.className; }));
    var units = simUnits(hs, champ, buff);
    var log = [];
    var win = units.length ? simulateFight(units, mulberry32(seed >>> 0), { champName: champ ? champ.name : null }, log) : false;
    return { win: win, log: log, units: units.length };
  }
  function gradeImg(p) {
    var o = partyOutcome(p);
    var tip = o.fail
      ? "Estimated win chance: 0% — " + (o.reason === "barrier" ? "barrier not broken" : o.reason === "roundcap" ? "can't kill before the 500-round cap" : "party not full")
      : "Estimated win chance: " + o.winPct + "%";
    var t = escA(tip);
    // data-info routes the click through the same popover the ⓘ markers use (delegated handler below).
    // If the image is missing, fall back to a clickable letter that keeps the same data-info popover.
    return '<span data-info="' + t + '" class="shrink-0 cursor-pointer hover:brightness-110" title="' + t + '">' +
      '<img src="' + IMG_DIR + o.grade + '.png" alt="Rank ' + o.grade + '" class="w-8 h-8 object-contain pointer-events-none" ' +
      'onerror="this.outerHTML=\'<b class=&quot;text-[#FBBF24]&quot;>' + o.grade + '</b>\'"></span>';
  }
  // Estimated success % shown next to the face. Green S/A · amber B · rose C/D (incl. 0% fails).
  function gradePct(p) {
    var o = partyOutcome(p);
    var col = (o.grade === "S" || o.grade === "A") ? COL.emerald : (o.grade === "B" ? COL.amber : COL.rose);
    return '<span class="text-sm font-bold font-mono shrink-0" style="color:' + col + '" title="estimated success chance">' + o.winPct + '%</span>';
  }

  var statsPanel = document.getElementById("statsPanel");
  var statsBackdrop = document.getElementById("statsBackdrop");
  var statsBody = document.getElementById("statsPanelBody");

  function applyStatsPaste(text) {
    if (!text) return 0;
    var orderIdx = 0, count = 0;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var parts = line.split("\t");
      var first = (parts[0] || "").trim();
      var nameMode = first !== "" && !/^[\d.,%\-\s]+$/.test(first);
      var hero = null, stats;
      if (nameMode) {
        var nm = first.toLowerCase();
        state.heroes.forEach(function (h) { if ((h.name || "").toLowerCase() === nm) hero = h; });
        stats = parts.slice(1);
      } else {
        hero = state.heroes[orderIdx++];
        stats = parts;
      }
      if (!hero) return;
      ["hp", "atk", "def", "eva", "power", "crit", "threat", "critDmg"].forEach(function (key, i) {
        if (stats[i] !== undefined && String(stats[i]).trim() !== "") hero[key] = statNum(stats[i]);
      });
      count++;
    });
    return count;
  }

  // Tab-separated paste (Excel). Same format as the CSV importer: an optional Quality column
  // routes each row to its tier (Class \t Quality \t 8 stats), else rows apply to the active tier.
  function applyClassPaste(text) { return parseClassTable(text, "\t"); }

  // ---------------- Default Stats (per-class averages) ----------------
  var defaultsPanel = document.getElementById("defaultsPanel");
  var defaultsBackdrop = document.getElementById("defaultsBackdrop");
  var defaultsBody = document.getElementById("defaultsPanelBody");

  // Classes whose averages are rough placeholders (no real data yet) — their name
  // renders grey in Default Stats as a reminder to update. All classes now have real
  // data, so this is empty; add a class name here to flag it as an estimate again.
  var ESTIMATED_CLASSES = {};

  function buildDefaultsPanel() {
    if (!defaultsBody) return;
    var clsPaste = '<div class="space-y-2">' +
      '<div class="text-xs text-textSecondary leading-relaxed">Editing the <b style="color:' + COL.amber + '">' + escH(state.quality) + '</b> tier (change via the Gear Quality dropdown). ' +
        'Paste straight from your sheet <b>including the header row</b> (<b>Class&nbsp; HP&nbsp; ATK&nbsp; DEF&nbsp; EVA&nbsp; Element&nbsp; CRIT&nbsp; THREAT&nbsp; CritDmg</b>, any order). ' +
        'Add a <b>gear-quality</b> column to fill multiple tiers at once; without it, rows fill the tier above.</div>' +
      '<textarea id="clsPaste" spellcheck="false" class="w-full h-16 p-2 rounded-lg bg-hoverBg border border-borderc text-textPrimary font-mono text-xs resize-y focus:outline-none focus:ring-1 focus:ring-accent" placeholder="Lord&#9;5000&#9;15000&#9;50000&#9;0&#9;230&#9;25&#9;100&#9;2"></textarea>' +
      '<div class="flex items-center gap-2"><button id="clsPasteApply" class="btn-white text-xs px-3 py-1">Apply Class Paste</button><span id="clsPasteStatus" class="text-xs text-textSecondary"></span></div>' +
    '</div>';
    var clsHeader = '<div class="flex items-center gap-2 px-3 text-[10px] uppercase tracking-wider text-textSecondary">' +
      '<span class="w-5 shrink-0"></span><span class="flex-1">Class</span>' +
      '<span class="w-14 text-center shrink-0">HP</span><span class="w-16 text-center shrink-0">ATK</span>' +
      '<span class="w-16 text-center shrink-0">DEF</span><span class="w-12 text-center shrink-0">EVA</span>' +
      '<span class="w-16 text-center shrink-0">Element</span><span class="w-12 text-center shrink-0">CRIT</span>' +
      '<span class="w-14 text-center shrink-0">THREAT</span><span class="w-14 text-center shrink-0">CRIT✕</span></div>';
    var clsRows = CATALOG.map(function (c) {
      var est = ESTIMATED_CLASSES[c.name];
      var nameCls = "truncate text-sm" + (est ? " text-textSecondary italic" : "");
      var nameTitle = est ? ' title="Estimated — group-average placeholder. Update with real stats."' : "";
      var sk = CLASS_SKILLS[c.name];
      var mark = sk ? infoBadge(sk.text + (sk.sim ? "  —  conditional parts pending the sim" : "")) : "";
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1.5">' +
        classIcon(c.name) + '<span class="flex-1 min-w-0 flex items-center gap-1"><span class="' + nameCls + '"' + nameTitle + '>' + escH(c.name) + '</span>' + mark + '</span>' +
        classField(c.name, "hp", "w-14") + classField(c.name, "atk", "w-16") + classField(c.name, "def", "w-16") +
        classField(c.name, "eva", "w-12") + classField(c.name, "power", "w-16") +
        classField(c.name, "crit", "w-12") + classField(c.name, "threat", "w-14") +
        classField(c.name, "critDmg", "w-14") + '</div>';
    }).join("");

    defaultsBody.innerHTML =
      POWER_HEADER + 'Class averages (defaults)</div>' + clsPaste + clsHeader + clsRows;
  }

  if (defaultsBody) {
    defaultsBody.addEventListener("input", function (e) {
      var cl = e.target.closest("[data-cls]");
      if (cl) {
        var cname = cl.dataset.cls, ckey = cl.dataset.stat;
        if (state.classStats[cname]) state.classStats[cname][ckey] = statNum(cl.value);
        // live-refresh badges for heroes of this class that inherit
        state.heroes.forEach(function (h) {
          if (h.className !== cname) return;
          var b2 = statsBody && statsBody.querySelector('[data-surv-id="' + h.id + '"]'); if (b2) b2.outerHTML = survBadge(h);
        });
        renderApp(); // inheriting heroes' grades shift
      }
    });
    defaultsBody.addEventListener("click", function (e) {
      if (e.target.closest("#clsPasteApply")) {
        var cta = document.getElementById("clsPaste");
        var cn = applyClassPaste(cta ? cta.value : "");
        buildDefaultsPanel(); renderApp();
        flashStatus(document.getElementById("clsPasteStatus"), cn + " class" + (cn === 1 ? "" : "es") + " updated", 2500);
      }
    });
  }

  var openDefaultsBtn = document.getElementById("openDefaultsBtn");
  if (openDefaultsBtn) openDefaultsBtn.addEventListener("click", function () { buildDefaultsPanel(); openPanel(defaultsPanel, defaultsBackdrop); });
  var defaultsCloseBtn = document.getElementById("defaultsClose");
  if (defaultsCloseBtn) defaultsCloseBtn.addEventListener("click", function () { closePanel(defaultsPanel, defaultsBackdrop); });
  if (defaultsBackdrop) defaultsBackdrop.addEventListener("click", function () { closePanel(defaultsPanel, defaultsBackdrop); });

  function buildStatsPanel() {
    if (!statsBody) return;

    // ---- Section B: per-hero overrides + survivability ----
    var heroPaste = '<div class="space-y-2">' +
      '<div class="text-xs text-textSecondary leading-relaxed">Per-hero <b>overrides</b> — leave a cell blank to inherit the class average (the faint number). Paste: <b>HP&nbsp; ATK&nbsp; DEF&nbsp; EVA&nbsp; Element&nbsp; CRIT&nbsp; THREAT&nbsp; CritDmg</b> (optional leading <b>Name</b>).</div>' +
      '<textarea id="statsPaste" spellcheck="false" class="w-full h-16 p-2 rounded-lg bg-hoverBg border border-borderc text-textPrimary font-mono text-xs resize-y focus:outline-none focus:ring-1 focus:ring-accent" placeholder="SHADE&#9;4284&#9;12144&#9;47648&#9;0&#9;215&#9;25&#9;100&#9;4.5"></textarea>' +
      '<div class="flex items-center gap-2"><button id="statsPasteApply" class="btn-white text-xs px-3 py-1">Apply Hero Paste</button><span id="statsPasteStatus" class="text-xs text-textSecondary"></span></div>' +
    '</div>';
    var heroHeader = state.heroes.length ? '<div class="flex items-center gap-2 px-3 text-[10px] uppercase tracking-wider text-textSecondary">' +
      '<span class="w-5 shrink-0"></span><span class="flex-1">Hero</span>' +
      '<span class="w-14 text-center shrink-0">HP</span><span class="w-16 text-center shrink-0">ATK</span>' +
      '<span class="w-16 text-center shrink-0">DEF</span><span class="w-12 text-center shrink-0">EVA</span>' +
      '<span class="w-16 text-center shrink-0">Element</span><span class="w-12 text-center shrink-0">CRIT</span>' +
      '<span class="w-14 text-center shrink-0">THREAT</span><span class="w-14 text-center shrink-0">CRIT✕</span></div>' : "";
    var heroRows = state.heroes.length ? state.heroes.map(function (h) {
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1.5">' +
        classIcon(h.className) + '<span class="flex-1 min-w-0 truncate text-sm">' + escH(h.name || h.className) + '</span>' +
        overrideField(h, "hp", "w-14") + overrideField(h, "atk", "w-16") + overrideField(h, "def", "w-16") +
        overrideField(h, "eva", "w-12") + overrideField(h, "power", "w-16") +
        overrideField(h, "crit", "w-12") + overrideField(h, "threat", "w-14") + overrideField(h, "critDmg", "w-14") + '</div>';
    }).join("") : '<div class="text-xs text-textSecondary italic">No heroes yet.</div>';

    var champHeader = '<div class="flex items-center gap-2 px-3 text-[10px] uppercase tracking-wider text-textSecondary">' +
      '<span class="w-7 shrink-0"></span><span class="flex-1">Champion</span>' +
      '<span class="w-14 text-center shrink-0">HP</span><span class="w-16 text-center shrink-0">ATK</span>' +
      '<span class="w-16 text-center shrink-0">DEF</span><span class="w-12 text-center shrink-0">EVA</span>' +
      '<span class="w-16 text-center shrink-0">Element</span><span class="w-12 text-center shrink-0">CRIT</span>' +
      '<span class="w-14 text-center shrink-0">THREAT</span></div>';
    var champRows = state.champions.map(function (c) {
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1.5">' + champIcon(c.name) +
        '<span class="flex-1 min-w-0 truncate text-sm">' + escH(c.name) + ' <span class="text-textSecondary capitalize">(' + escH(c.el) + ')</span></span>' +
        champField(c.name, "hp", "w-14") + champField(c.name, "atk", "w-16") + champField(c.name, "def", "w-16") +
        champField(c.name, "eva", "w-12") + champField(c.name, "power", "w-16") +
        champField(c.name, "crit", "w-12") + champField(c.name, "threat", "w-14") + '</div>';
    }).join("");

    var summary = state.parties.map(function (p) {
      var hs = state.heroes.filter(function (x) { return x.partyId === p.id; });
      var champ = getChampion(p.champName);
      var o = partyOutcome(p);
      var rounds = isFinite(o.rounds) ? o.rounds : 0;
      var risky = hs.filter(function (x) { return survivability(x).flag === "risk"; }).length + (champ && champSurv(champ).flag === "risk" ? 1 : 0);
      // win/grade is the headline; rounds-to-kill stays as info (matters only via exposure + the 500 cap).
      var winColor = o.fail ? COL.rose : (o.winPct >= 75 ? COL.emerald : o.winPct >= 55 ? COL.amber : COL.rose);
      var winLabel = o.fail
        ? (o.reason === "barrier" ? "✗ barrier" : o.reason === "roundcap" ? "✗ 500-cap" : "incomplete")
        : "~" + o.winPct + "% win · " + o.grade;
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1.5 text-xs">' +
        '<span class="flex-1 min-w-0 truncate">' + escH(p.name) + '</span>' +
        '<span class="font-bold" style="color:' + winColor + '">' + winLabel + '</span>' +
        '<span class="font-mono text-textSecondary" title="rounds to kill the 10M boss (info only — fights auto-skip)">' + (rounds <= 0 ? "no ATK" : (rounds >= MZE.roundCap ? "✗ " + rounds + " rds" : "~" + rounds + " rds")) + '</span>' +
        (risky ? '<span class="font-bold" style="color:' + COL.rose + '">⚠ ' + risky + ' 1-shot</span>' : '<span style="color:' + COL.emerald + '">✓ tanky</span>') +
      '</div>';
    }).join("");

    statsBody.innerHTML =
      POWER_HEADER + 'Heroes — overrides (blank = class average)</div>' + heroPaste + heroHeader + heroRows +
      '<div class="mt-4 pt-3 border-t border-borderc space-y-1.5">' + POWER_HEADER + 'Champion stats</div>' + champHeader + champRows + '</div>' +
      '<div class="mt-4 pt-3 border-t border-borderc space-y-2">' + POWER_HEADER + 'Per-party clear speed (vs 10M HP)</div>' + summary + '</div>';
  }

  if (statsBody) {
    statsBody.addEventListener("input", function (e) {
      var ov = e.target.closest("[data-stat-id]");
      if (ov) {
        var id = Number(ov.dataset.statId), stat = ov.dataset.stat;
        var raw = String(ov.value).trim();
        var val = raw === "" ? null : statNum(ov.value); // blank = inherit
        var hero = null;
        state.heroes.forEach(function (h) { if (h.id === id) { h[stat] = val; hero = h; } });
        if (hero) { var b = statsBody.querySelector('[data-surv-id="' + id + '"]'); if (b) b.outerHTML = survBadge(hero); }
        renderApp(); // grade may shift
        return;
      }
      var champEdit = e.target.closest("[data-champ]");
      if (champEdit) {
        var chn = champEdit.dataset.champ, ck = champEdit.dataset.stat, chv = statNum(champEdit.value);
        state.champions.forEach(function (c) { if (c.name === chn) c[ck] = chv; });
        renderApp();
        return;
      }
    });
    statsBody.addEventListener("click", function (e) {
      if (e.target.closest("#statsPasteApply")) {
        var ta = document.getElementById("statsPaste");
        var n = applyStatsPaste(ta ? ta.value : "");
        buildStatsPanel(); renderApp();
        flashStatus(document.getElementById("statsPasteStatus"), n + " hero" + (n === 1 ? "" : "es") + " updated", 2500);
      }
    });
  }

  var openStatsBtn = document.getElementById("openStatsBtn");
  if (openStatsBtn) openStatsBtn.addEventListener("click", function () { buildStatsPanel(); openPanel(statsPanel, statsBackdrop); });
  var statsCloseBtn = document.getElementById("statsClose");
  if (statsCloseBtn) statsCloseBtn.addEventListener("click", function () { closePanel(statsPanel, statsBackdrop); });
  if (statsBackdrop) statsBackdrop.addEventListener("click", function () { closePanel(statsPanel, statsBackdrop); });

  /* ---------------- Share / Download / Upload ---------------- */
  var CLASS_STAT_KEYS = ["hp", "atk", "def", "eva", "power", "crit", "threat", "critDmg"];

  // Share link codec: full toJSON() -> deflate-raw (native CompressionStream) -> base64url, carried
  // in the URL #r= hash. Self-contained (roster + gear tiers + champions), no server. ~4KB link.
  var SHARE_SUPPORTED = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
  function bytesToB64url(bytes) {
    var bin = ""; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function deflateRaw(str) { // -> Promise<Uint8Array>
    var cs = new CompressionStream("deflate-raw"), w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(str)); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  function inflateRaw(bytes) { // -> Promise<string>
    var ds = new DecompressionStream("deflate-raw"), w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) { return new TextDecoder().decode(ab); });
  }
  function encodeShareLink(compact) { // -> Promise<string> full URL with #r= hash
    // Always drop the per-quality stat TABLES (≈80% of the payload) — identical on the recipient's
    // page (baked into roster-data.js), so they're supplied locally on load.
    var o = JSON.parse(toJSON());
    delete o.classStatsByQuality;
    // Compact ("Discord") link: also drop each hero's override stats → composition only. Heroes
    // load with null stats and inherit class averages at the viewer's gear tier (~1.3KB total).
    if (compact) o.heroes = o.heroes.map(function (h) { return { id: h.id, name: h.name, className: h.className, partyId: h.partyId }; });
    return deflateRaw(JSON.stringify(o)).then(function (bytes) { return location.origin + location.pathname + "#r=" + bytesToB64url(bytes); });
  }

  // Share: centered overlay (opacity-toggled, not a slide panel). Generates a self-contained link
  // that encodes the full roster into the #r= hash (falls back to the bare URL if unsupported).
  var shareModal = document.getElementById("shareModal");
  var shareBackdrop = document.getElementById("shareBackdrop");
  var shareText = document.getElementById("shareText");
  var bareUrl = function () { return location.origin + location.pathname; };
  var _compactLink = ""; // pre-generated composition-only link for the Discord button
  function openShare() {
    _compactLink = "";
    if (shareText) {
      if (SHARE_SUPPORTED) {
        shareText.value = "Generating link…";
        encodeShareLink(false).then(function (url) { if (shareText) shareText.value = url; })
          .catch(function () { if (shareText) shareText.value = bareUrl(); });
        encodeShareLink(true).then(function (url) { _compactLink = url; }).catch(function () { _compactLink = ""; });
      } else {
        shareText.value = bareUrl();
      }
    }
    [shareModal, shareBackdrop].forEach(function (el) { if (el) el.classList.remove("opacity-0", "pointer-events-none"); });
  }
  function closeShare() { [shareModal, shareBackdrop].forEach(function (el) { if (el) el.classList.add("opacity-0", "pointer-events-none"); }); }
  var openShareBtn = document.getElementById("openShareBtn");
  if (openShareBtn) openShareBtn.addEventListener("click", openShare);
  var shareCloseBtn = document.getElementById("shareClose");
  if (shareCloseBtn) shareCloseBtn.addEventListener("click", closeShare);
  if (shareBackdrop) shareBackdrop.addEventListener("click", closeShare);
  if (shareModal) shareModal.addEventListener("click", function (e) { if (e.target === shareModal) closeShare(); }); // click outside the card
  wireCopyButton(document.getElementById("shareCopyBtn"), shareText);
  // Discord button copies the pre-generated compact (composition-only) link; falls back to the full link.
  wireCopyButton(document.getElementById("shareDiscordBtn"), function () { return _compactLink || (shareText ? shareText.value : bareUrl()); });

  /* ---------------- Combat replay modal (Simulate combat) ---------------- */
  var combatModal = document.getElementById("combatModal");
  var combatTitle = document.getElementById("combatTitle");
  var combatSummary = document.getElementById("combatSummary");
  var combatBody = document.getElementById("combatBody");
  var _combatPid = null, _combatSeed = 0;
  var COMBAT_KCOL = { dmg: COL.emerald, hit: COL.muted, bosscrit: COL.rose, dodge: COL.amber, aoe: COL.amber, save: COL.amber, death: COL.rose, heal: "#7DD3FC", win: COL.emerald, loss: COL.rose };
  function renderCombatReplay() {
    if (!combatBody) return;
    var p = null; for (var i = 0; i < state.parties.length; i++) if (state.parties[i].id === _combatPid) { p = state.parties[i]; break; }
    if (!p) return;
    if (combatTitle) combatTitle.textContent = "Combat replay — " + p.name;
    var rep = simulateReplay(p, _combatSeed);
    var o = partyOutcome(p);
    var col = rep.win ? COL.emerald : COL.rose;
    var failNote = o.fail ? (o.reason === "barrier" ? "barrier not broken" : o.reason === "undermanned" ? "party not full" : o.reason === "roundcap" ? "can't beat the round cap" : "") : "";
    combatSummary.innerHTML =
      '<span style="color:' + col + '" class="font-bold">' + (rep.win ? "WIN" : "LOSS") + '</span> this sample · displayed grade <b>' + o.grade + '</b> (~' + o.winPct + '% over many fights)' +
      (failNote ? ' · <span style="color:' + COL.rose + '">' + escH(failNote) + '</span>' : '') +
      '<div class="text-textSecondary text-xs mt-0.5">This is ONE random fight; the grade % is the average of hundreds. Use Re-roll to see another.</div>';
    var rows = [], lastR = 0;
    rep.log.forEach(function (e) {
      if (e.r !== lastR) { rows.push('<div class="mt-2 mb-0.5 font-bold text-textSecondary uppercase tracking-wider text-[10px]">Round ' + e.r + '</div>'); lastR = e.r; }
      rows.push('<div class="font-mono pl-2" style="color:' + (COMBAT_KCOL[e.k] || COL.text) + '">' + escH(e.t) + '</div>');
    });
    combatBody.innerHTML = rows.join("") || '<div class="text-textSecondary">No combat to show (empty party).</div>';
    combatBody.scrollTop = 0;
  }
  function openCombatModal(pid) { _combatPid = pid; _combatSeed = hashStr("rep" + pid) >>> 0; renderCombatReplay(); if (combatModal) combatModal.classList.remove("opacity-0", "pointer-events-none"); }
  function closeCombatModal() { if (combatModal) combatModal.classList.add("opacity-0", "pointer-events-none"); }
  var combatCloseBtn = document.getElementById("combatClose");
  if (combatCloseBtn) combatCloseBtn.addEventListener("click", closeCombatModal);
  var combatRerollBtn = document.getElementById("combatReroll");
  if (combatRerollBtn) combatRerollBtn.addEventListener("click", function () { _combatSeed = (_combatSeed + 0x9E3779B1) >>> 0; renderCombatReplay(); });
  if (combatModal) combatModal.addEventListener("click", function (e) { if (e.target === combatModal) closeCombatModal(); });

  // Generic alert/notice overlay (replaces native alert()).
  var alertModal = document.getElementById("alertModal");
  var alertBackdrop = document.getElementById("alertBackdrop");
  var alertBody = document.getElementById("alertBody");
  function showAlert(msg) {
    if (alertBody) alertBody.textContent = msg; // textContent — no HTML injection
    [alertModal, alertBackdrop].forEach(function (el) { if (el) el.classList.remove("opacity-0", "pointer-events-none"); });
  }
  function closeAlert() { [alertModal, alertBackdrop].forEach(function (el) { if (el) el.classList.add("opacity-0", "pointer-events-none"); }); }
  var alertOkBtn = document.getElementById("alertOk");
  if (alertOkBtn) alertOkBtn.addEventListener("click", closeAlert);
  if (alertBackdrop) alertBackdrop.addEventListener("click", closeAlert);
  if (alertModal) alertModal.addEventListener("click", function (e) { if (e.target === alertModal) closeAlert(); });

  // Generic Confirm/Cancel overlay (replaces native confirm()). opts: {title, bodyHTML, confirmLabel,
  // confirmClass, onConfirm}. bodyHTML is built from static strings only (no user input).
  var confirmModal = document.getElementById("confirmModal");
  var confirmBackdrop = document.getElementById("confirmBackdrop");
  var confirmTitle = document.getElementById("confirmTitle");
  var confirmBody = document.getElementById("confirmBody");
  var confirmOkBtn = document.getElementById("confirmOk");
  var confirmCancelBtn = document.getElementById("confirmCancel");
  var _confirmCb = null;
  function showConfirm(opts) {
    opts = opts || {};
    if (confirmTitle) confirmTitle.textContent = opts.title || "Confirm";
    if (confirmBody) confirmBody.innerHTML = opts.bodyHTML || "";
    if (confirmOkBtn) { confirmOkBtn.textContent = opts.confirmLabel || "Confirm"; confirmOkBtn.className = (opts.confirmClass || "btn-primary") + " w-full"; }
    _confirmCb = typeof opts.onConfirm === "function" ? opts.onConfirm : null;
    [confirmModal, confirmBackdrop].forEach(function (el) { if (el) el.classList.remove("opacity-0", "pointer-events-none"); });
  }
  function closeConfirm() { _confirmCb = null; [confirmModal, confirmBackdrop].forEach(function (el) { if (el) el.classList.add("opacity-0", "pointer-events-none"); }); }
  if (confirmOkBtn) confirmOkBtn.addEventListener("click", function () { var cb = _confirmCb; closeConfirm(); if (cb) cb(); });
  if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", closeConfirm);
  if (confirmBackdrop) confirmBackdrop.addEventListener("click", closeConfirm);
  if (confirmModal) confirmModal.addEventListener("click", function (e) { if (e.target === confirmModal) closeConfirm(); });

  // Download: trigger a real file download from a Blob.
  function downloadFile(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || "text/plain" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); // dynamic <a download> is the only way to save a generated file
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { return false; }
  }
  function rosterJSONStr() { var o = JSON.parse(toJSON()); delete o.classStatsByQuality; return JSON.stringify(o, null, 2); }
  function defaultsJSONStr() { return JSON.stringify({ quality: state.quality, classStatsByQuality: state.classStatsByQuality }, null, 2); }
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function defaultsCSVStr() {
    // Column order mirrors the source sheet: Class, 8 stats, then the Quality tier last.
    var lines = ["Class,HP,ATK,DEF,EVA,Element,CRIT,THREAT,CritDmg,Quality"];
    QUALITIES.forEach(function (q) {
      var tbl = state.classStatsByQuality[q] || {};
      CATALOG.forEach(function (c) {
        var s = tbl[c.name] || {};
        lines.push([csvCell(c.name)].concat(CLASS_STAT_KEYS.map(function (k) { return Number(s[k]) || 0; })).concat([csvCell(q)]).join(","));
      });
    });
    return lines.join("\n");
  }
  function rosterCSVStr() {
    var keys = ["power", "hp", "atk", "def", "eva", "crit", "threat", "critDmg"]; // per-hero stored values (blank = inherits class avg)
    var lines = ["Name,Class,Party,Power,HP,ATK,DEF,EVA,CRIT,THREAT,CritDmg"];
    state.heroes.forEach(function (h) {
      var row = [csvCell(h.name || ""), csvCell(h.className), csvCell(h.partyId ? partyLabel(h.partyId) : "Bench")];
      keys.forEach(function (k) { var v = h[k]; row.push((v === null || v === undefined || v === "") ? "" : v); });
      lines.push(row.join(","));
    });
    return lines.join("\n");
  }
  function championsCSVStr() {
    var keys = ["power", "hp", "atk", "def", "eva", "crit", "threat"];
    var lines = ["Name,Element,Power,HP,ATK,DEF,EVA,CRIT,THREAT"];
    state.champions.forEach(function (c) {
      lines.push([csvCell(c.name), csvCell(c.el)].concat(keys.map(function (k) { return Number(c[k]) || 0; })).join(","));
    });
    return lines.join("\n");
  }
  function allCSVStr() {
    return "Heroes\n" + rosterCSVStr() + "\n\nChampions\n" + championsCSVStr() + "\n\nClass Defaults\n" + defaultsCSVStr();
  }
  var downloadPanel = document.getElementById("downloadPanel");
  var downloadBackdrop = document.getElementById("downloadBackdrop");
  var downloadStatus = document.getElementById("downloadStatus");
  var openDownloadBtn = document.getElementById("openDownloadBtn");
  if (openDownloadBtn) openDownloadBtn.addEventListener("click", function () { openPanel(downloadPanel, downloadBackdrop); });
  var downloadCloseBtn = document.getElementById("downloadClose");
  if (downloadCloseBtn) downloadCloseBtn.addEventListener("click", function () { closePanel(downloadPanel, downloadBackdrop); });
  if (downloadBackdrop) downloadBackdrop.addEventListener("click", function () { closePanel(downloadPanel, downloadBackdrop); });
  function wireDownload(id, fn, filename, mime) {
    var b = document.getElementById(id);
    if (b) b.addEventListener("click", function () { flashStatus(downloadStatus, downloadFile(filename, fn(), mime) ? "Downloaded " + filename : "Download failed", 2500); });
  }
  wireDownload("dlRosterJson", rosterJSONStr, "t16-roster.json", "application/json");
  wireDownload("dlDefaultsJson", defaultsJSONStr, "t16-default-stats.json", "application/json");
  wireDownload("dlAllJson", toJSON, "t16-all.json", "application/json");
  wireDownload("dlRosterCsv", rosterCSVStr, "t16-roster.csv", "text/csv");
  wireDownload("dlDefaultsCsv", defaultsCSVStr, "t16-default-stats.csv", "text/csv");
  wireDownload("dlAllCsv", allCSVStr, "t16-all.csv", "text/csv");

  // Merge a flat { className -> {stats} } map into one quality tier (known classes only).
  function mergeTier(tier, map) {
    var tbl = state.classStatsByQuality[tier];
    if (!tbl || !map || typeof map !== "object") return 0;
    var count = 0;
    Object.keys(map).forEach(function (name) {
      var target = tbl[name];
      if (!target) Object.keys(tbl).forEach(function (k) { if (k.toLowerCase() === name.toLowerCase()) target = tbl[k]; });
      if (!target) return;
      var s = map[name] || {};
      CLASS_STAT_KEYS.forEach(function (key) { if (s[key] !== undefined && s[key] !== null && s[key] !== "") target[key] = statNum(s[key]); });
      count++;
    });
    return count;
  }
  // Upload: accept either a quality-keyed object ({Legendary:{Knight:{...}}, Epic:{...}}) or a flat
  // class map ({Knight:{...}}). A flat map applies to the currently-selected tier.
  function applyClassStatsObject(obj) {
    if (!obj || typeof obj !== "object") return 0;
    var qKeys = Object.keys(obj).filter(function (k) { return normalizeQuality(k); });
    if (qKeys.length) {
      var total = 0;
      qKeys.forEach(function (k) { total += mergeTier(normalizeQuality(k), obj[k]); });
      return total;
    }
    return mergeTier(state.quality, obj);
  }
  function applyClassCSV(text, sep) { return parseClassTable(text, sep || ","); }
  // Shared parser for the CSV upload (comma) and the in-panel paste box (tab, Excel).
  // Header-aware: if the first non-empty row's first cell is "class", its column names map the
  // data in ANY order — recognizes an optional Quality / gear-quality column plus synonyms
  // (Element=power, "crit dmg"=critDmg, EVA=eva). Stat cells tolerate suffixes like "2x" via
  // statNum, and blank cells are left untouched. Without a header it falls back to positional
  // Class[,Quality],HP,ATK,DEF,EVA,Power,CRIT,THREAT,CritDmg (Quality auto-detected in cell 2).
  function colKeyFor(headerCell) {
    var n = String(headerCell == null ? "" : headerCell).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (n === "class" || n === "classname") return "name";
    if (n === "hp" || n === "health") return "hp";
    if (n === "atk" || n === "attack") return "atk";
    if (n === "def" || n === "defense" || n === "defence") return "def";
    if (n === "eva" || n === "evasion") return "eva";
    if (n === "element" || n === "power") return "power";
    if (n === "critdmg" || n === "critdamage" || n === "critx") return "critDmg";
    if (n === "crit" || n === "critchance" || n === "critrate") return "crit";
    if (n === "threat") return "threat";
    if (n === "gearquality" || n === "quality" || n === "tier") return "quality";
    return null;
  }
  function parseClassTable(text, sep) {
    var rows = (text || "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (!rows.length) return 0;
    var colMap = null, startRow = 0;
    if (colKeyFor(rows[0].split(sep)[0]) === "name") {
      colMap = {};
      rows[0].split(sep).forEach(function (cell, i) { var k = colKeyFor(cell); if (k && colMap[k] === undefined) colMap[k] = i; });
      startRow = 1;
    }
    var count = 0;
    for (var r = startRow; r < rows.length; r++) {
      var parts = rows[r].split(sep);
      var name, q;
      if (colMap) {
        name = (parts[colMap.name] || "").trim();
        q = colMap.quality !== undefined ? normalizeQuality(parts[colMap.quality]) : null;
      } else {
        name = (parts[0] || "").trim();
        q = normalizeQuality(parts[1]);
      }
      var tbl = state.classStatsByQuality[q || state.quality];
      if (!tbl) continue;
      var key = tbl[name] ? name : null;
      if (!key) { var nl = name.toLowerCase(); Object.keys(tbl).forEach(function (k) { if (k.toLowerCase() === nl) key = k; }); }
      if (!key) continue; // header row already consumed, or unknown class
      var cs = tbl[key];
      for (var si = 0; si < CLASS_STAT_KEYS.length; si++) {
        var skey = CLASS_STAT_KEYS[si];
        var idx = colMap ? colMap[skey] : ((q ? 2 : 1) + si);
        if (idx === undefined) continue;
        var v = parts[idx];
        if (v !== undefined && String(v).trim() !== "") cs[skey] = statNum(v);
      }
      count++;
    }
    return count;
  }
  // Roster CSV (per-hero) importer — the counterpart to rosterCSVStr's export, so a downloaded roster
  // CSV round-trips back in. Header-aware (Name, Class, Party, Power, HP, ATK, DEF, EVA, CRIT, THREAT in
  // any order). REPLACES the roster: each row → a hero of the matched class, its CSV stats kept as
  // overrides, assigned to the EXISTING party whose name matches the Party cell (parties + their
  // champions are left intact); "Bench"/blank/no-match → bench. Class names match case- and
  // punctuation-insensitively, so "Arch-Druid" lands on "Arch Druid". Returns { matched, skipped }, or
  // null if it isn't a roster CSV (no Class column).
  function applyRosterCSV(text, sep) {
    sep = sep || ",";
    var rows = (text || "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (!rows.length) return null;
    var col = {};
    rows[0].split(sep).forEach(function (cell, i) {
      var n = String(cell).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (n === "name" || n === "hero") col.name = i;
      else if (n === "class" || n === "classname") col.className = i;
      else if (n === "party") col.party = i;
      else if (n === "power" || n === "element") col.power = i;
      else if (n === "hp" || n === "health") col.hp = i;
      else if (n === "atk" || n === "attack") col.atk = i;
      else if (n === "def" || n === "defense" || n === "defence") col.def = i;
      else if (n === "eva" || n === "evasion") col.eva = i;
      else if (n === "crit" || n === "critchance" || n === "critrate") col.crit = i;
      else if (n === "threat") col.threat = i;
      else if (n === "critdmg" || n === "critdamage" || n === "critx") col.critDmg = i;
    });
    if (col.className === undefined) return null; // not a roster CSV — let the class-defaults parser try
    var norm = function (s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); };
    var partyByName = {};
    state.parties.forEach(function (p) { partyByName[String(p.name || "").trim().toLowerCase()] = p.id; });
    var classByNorm = {};
    CATALOG.forEach(function (c) { classByNorm[norm(c.name)] = c.name; });
    var statKeys = ["power", "hp", "atk", "def", "eva", "crit", "threat", "critDmg"];
    var heroes = [], id = 1, matched = 0, skipped = 0;
    for (var r = 1; r < rows.length; r++) {
      var parts = rows[r].split(sep);
      var cn = classByNorm[norm(parts[col.className])];
      if (!cn) { skipped++; continue; } // unknown class name
      var pid = null;
      if (col.party !== undefined) {
        var pl = String(parts[col.party] || "").trim().toLowerCase();
        if (pl && pl !== "bench" && partyByName[pl] !== undefined) pid = partyByName[pl];
      }
      var h = { id: id++, name: col.name !== undefined ? String(parts[col.name] || "").trim() : "",
        className: cn, partyId: pid, roleOverride: null,
        power: null, hp: null, atk: null, def: null, eva: null, crit: null, threat: null, critDmg: null };
      statKeys.forEach(function (k) {
        if (col[k] === undefined) return;
        var v = parts[col[k]];
        if (v !== undefined && String(v).trim() !== "") h[k] = statNum(v);
      });
      heroes.push(h); matched++;
    }
    if (!matched) return { matched: 0, skipped: skipped };
    state.heroes = heroes;
    state.parties.forEach(function (p) { enforcePartyCap(p.id); }); // bump any party over its cap to the bench
    return { matched: matched, skipped: skipped };
  }

  var uploadPanel = document.getElementById("uploadPanel");
  var uploadBackdrop = document.getElementById("uploadBackdrop");
  var uploadText = document.getElementById("uploadText");
  var uploadStatus = document.getElementById("uploadStatus");
  var uploadFileInput = document.getElementById("uploadFile");
  var lastUploadName = "";
  // Auto-detect: full JSON (roster + classStats) → load all; roster-only JSON → load roster
  // but KEEP current default stats; default-stats JSON or CSV → update only classStats.
  function applyUpload(text, fileName) {
    text = (text || "").trim();
    if (!text) { flashStatus(uploadStatus, "Nothing to load", 2500); return; }
    var isJson = text.charAt(0) === "{" || (fileName && /\.json$/i.test(fileName));
    if (isJson) {
      var data;
      try { data = JSON.parse(text); } catch (e) { flashStatus(uploadStatus, "Invalid JSON — " + e.message, 3500); return; }
      var hasRoster = data && Array.isArray(data.parties) && Array.isArray(data.heroes);
      var statsObj = data && (data.classStatsByQuality || data.classStats);
      var hasStats = statsObj && typeof statsObj === "object";
      if (hasRoster) {
        if (!hasStats) data.classStatsByQuality = state.classStatsByQuality; // preserve current defaults (all tiers)
        try { loadJSON(JSON.stringify(data)); } catch (e) { flashStatus(uploadStatus, "Load failed — " + e.message, 3500); return; }
        setUpdate(hasStats ? "Uploaded full data." : "Uploaded roster (kept default stats).");
        render();
        flashStatus(uploadStatus, hasStats ? "Loaded full data ✓" : "Loaded roster (kept default stats) ✓", 3000);
      } else if (hasStats) {
        var c = applyClassStatsObject(statsObj); setUpdate("Uploaded default stats (" + c + " class rows)."); render();
        flashStatus(uploadStatus, c + " class row" + (c === 1 ? "" : "s") + " updated ✓", 3000);
      } else {
        flashStatus(uploadStatus, "JSON needs parties+heroes or classStats", 3500);
      }
      return;
    }
    // CSV / TSV. Excel copy-paste is TAB-separated, a saved file is comma-separated — detect which from
    // the first line (a tab in the header → Excel paste). A roster (per-hero) table has both Name and
    // Class columns; a class-defaults table has Class as its leading name column and no separate Name.
    var firstLine = text.split(/\r?\n/)[0] || "";
    var sep = /\t/.test(firstLine) ? "\t" : ",";
    var hdr = firstLine.split(sep).map(function (c) { return c.trim().toLowerCase(); });
    if (hdr.indexOf("name") >= 0 && hdr.indexOf("class") >= 0) {
      var rr = applyRosterCSV(text, sep);
      if (rr && rr.matched) {
        setUpdate("Uploaded roster (" + rr.matched + " heroes" + (rr.skipped ? ", " + rr.skipped + " skipped" : "") + ")."); render();
        flashStatus(uploadStatus, rr.matched + " hero" + (rr.matched === 1 ? "" : "es") + " loaded" + (rr.skipped ? " (" + rr.skipped + " skipped)" : "") + " ✓", 3500);
      } else {
        flashStatus(uploadStatus, "No matching classes in roster", 3000);
      }
      return;
    }
    var n = applyClassCSV(text, sep); setUpdate("Uploaded default stats (" + n + " classes)."); render();
    flashStatus(uploadStatus, n ? n + " class" + (n === 1 ? "" : "es") + " updated ✓" : "No matching classes in CSV", 3000);
  }
  var openUploadBtn = document.getElementById("openUploadBtn");
  if (openUploadBtn) openUploadBtn.addEventListener("click", function () { openPanel(uploadPanel, uploadBackdrop); });
  var uploadCloseBtn = document.getElementById("uploadClose");
  if (uploadCloseBtn) uploadCloseBtn.addEventListener("click", function () { closePanel(uploadPanel, uploadBackdrop); });
  if (uploadBackdrop) uploadBackdrop.addEventListener("click", function () { closePanel(uploadPanel, uploadBackdrop); });
  if (uploadFileInput) uploadFileInput.addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    lastUploadName = f.name;
    var reader = new FileReader();
    reader.onload = function () { if (uploadText) uploadText.value = String(reader.result || ""); flashStatus(uploadStatus, "Loaded " + f.name + " — click Load Data", 3000); };
    reader.readAsText(f);
  });
  var uploadApplyBtn = document.getElementById("uploadApplyBtn");
  if (uploadApplyBtn) uploadApplyBtn.addEventListener("click", function () { applyUpload(uploadText ? uploadText.value : "", lastUploadName); });

  /* ---------------- Filters panel ---------------- */
  var filtersPanel = document.getElementById("filtersPanel");
  var filtersBackdrop = document.getElementById("filtersBackdrop");
  var filtersBody = document.getElementById("filtersPanelBody");
  function buildFiltersPanel() {
    if (!filtersBody) return;
    var header = '<div class="flex items-center gap-2 px-3 text-[10px] uppercase tracking-wider text-textSecondary">' +
      '<span class="w-5 shrink-0"></span><span class="flex-1">Class</span>' +
      '<span class="w-16 text-center shrink-0">Exclude</span><span class="w-14 text-center shrink-0">Min</span>' +
      '<span class="w-14 text-center shrink-0">Max</span></div>';
    var rows = CATALOG.map(function (c) {
      var cn = c.name, ex = fExclude(cn), minV = state.filters.min[cn], maxV = state.filters.max[cn];
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1.5">' +
        classIcon(cn) + '<span class="flex-1 min-w-0 truncate text-sm' + (ex ? " text-textSecondary line-through" : "") + '">' + escH(cn) + '</span>' +
        '<span class="w-16 flex justify-center shrink-0"><input type="checkbox" data-filter="exclude" data-cls="' + escA(cn) + '"' + (ex ? " checked" : "") + ' class="w-4 h-4 accent-accent cursor-pointer"></span>' +
        '<input type="text" inputmode="numeric" value="' + (minV != null ? minV : "") + '" placeholder="–" data-filter="min" data-cls="' + escA(cn) + '" class="' + STATFIELD + ' w-14">' +
        '<input type="text" inputmode="numeric" value="' + (maxV != null ? maxV : "") + '" placeholder="–" data-filter="max" data-cls="' + escA(cn) + '" class="' + STATFIELD + ' w-14">' +
      '</div>';
    }).join("");
    // Prioritize Elements = the active barriers each party must break (≥320 power). Player-configurable.
    var barrierChips = COVERAGE_ELS.map(function (el) {
      var on = state.barriers.indexOf(el) >= 0;
      return '<label class="flex items-center gap-1.5 bg-surface border-2 rounded-lg px-2 py-1 cursor-pointer text-sm capitalize ' +
        (on ? "border-accent text-textPrimary" : "border-borderc text-textSecondary") + '">' +
        '<input type="checkbox" data-barrier="' + el + '"' + (on ? " checked" : "") + ' class="w-4 h-4 accent-accent cursor-pointer">' +
        barrierIcon(el, "w-4 h-4") + el + '</label>';
    }).join("");
    var barrierSection = POWER_HEADER + 'Prioritize elements (barriers)</div>' +
      '<p class="text-xs text-textSecondary leading-relaxed mb-1">Check the elemental barriers this zone uses. Each party must break <b>one</b> of them (≥ ' + BARRIER_POWER_TARGET + ' power). Default: dark / light / earth (T16 MZE). Unchecking all removes the barrier requirement.</p>' +
      '<div class="flex flex-wrap gap-2 mb-4">' + barrierChips + '</div>';
    // Roster Objective: how Recommended optimizes (balanced ↔ resilient spread).
    if (!OBJECTIVES[state.objective]) state.objective = DEFAULT_OBJECTIVE; // normalize retired values (e.g. old "maxwin" saves)
    var objBtns = Object.keys(OBJECTIVES).map(function (k) {
      var o = OBJECTIVES[k], on = state.objective === k;
      return '<button type="button" data-objective="' + k + '" title="' + escA(o.desc) + '" class="flex-1 px-2 py-1.5 rounded-lg border-2 text-sm font-semibold ' +
        (on ? "border-accent text-textPrimary bg-hoverBg" : "border-borderc text-textSecondary") + '">' + escH(o.label) + '</button>';
    }).join("");
    var objDesc = (OBJECTIVES[state.objective] || OBJECTIVES[DEFAULT_OBJECTIVE]).desc;
    var objSection = POWER_HEADER + 'Roster objective</div>' +
      '<p class="text-xs text-textSecondary leading-relaxed mb-1">How <b>Recommended</b> optimizes — from meta min-max to a resilient, well-rounded roster. Applies on the next Recommended build.</p>' +
      '<div class="flex gap-2 mb-1">' + objBtns + '</div>' +
      '<p class="text-xs text-textSecondary mb-4">' + escH(objDesc) + '</p>';
    filtersBody.innerHTML = objSection + barrierSection + POWER_HEADER + 'Build filters</div>' +
      '<p class="text-xs text-textSecondary leading-relaxed mb-1"><b>Exclude</b> = never use. <b>Min</b> = require this many in the roster. <b>Max</b> = cap. Whole-roster; Min applies when generating (Top-up / Recommended), Auto Sort honors Exclude + Max.</p>' +
      header + rows;
  }
  if (filtersBody) {
    filtersBody.addEventListener("change", function (e) {
      // Prioritize Elements: toggle an active barrier; barriers drive grades + Roster Health → re-render.
      var bar = e.target.closest('[data-barrier]');
      if (bar) {
        var bel = bar.dataset.barrier, bi = state.barriers.indexOf(bel);
        if (bar.checked) { if (bi < 0) state.barriers.push(bel); }
        else if (bi >= 0) state.barriers.splice(bi, 1);
        // keep stored order canonical (COVERAGE_ELS order) for a stable Roster Health note
        state.barriers.sort(function (a, b) { return COVERAGE_ELS.indexOf(a) - COVERAGE_ELS.indexOf(b); });
        buildFiltersPanel();
        render();
        return;
      }
      var el = e.target.closest('[data-filter="exclude"]'); if (!el) return;
      var cn = el.dataset.cls;
      if (el.checked) state.filters.exclude[cn] = true; else delete state.filters.exclude[cn];
      buildFiltersPanel(); // refresh strike-through
    });
    filtersBody.addEventListener("input", function (e) {
      var el = e.target.closest('[data-filter="min"], [data-filter="max"]'); if (!el) return;
      var cn = el.dataset.cls, kind = el.dataset.filter, v = String(el.value).replace(/[^0-9]/g, "");
      if (v === "") delete state.filters[kind][cn]; else state.filters[kind][cn] = Math.max(0, parseInt(v, 10) || 0);
    });
    filtersBody.addEventListener("click", function (e) {
      // Roster Objective: change how Recommended optimizes (applies on the next Recommended build).
      var ob = e.target.closest("[data-objective]"); if (!ob) return;
      if (OBJECTIVES[ob.dataset.objective]) { state.objective = ob.dataset.objective; buildFiltersPanel(); }
    });
  }
  var openFiltersBtn = document.getElementById("openFiltersBtn");
  if (openFiltersBtn) openFiltersBtn.addEventListener("click", function () { buildFiltersPanel(); openPanel(filtersPanel, filtersBackdrop); });
  var filtersCloseBtn = document.getElementById("filtersClose");
  if (filtersCloseBtn) filtersCloseBtn.addEventListener("click", function () { closePanel(filtersPanel, filtersBackdrop); });
  if (filtersBackdrop) filtersBackdrop.addEventListener("click", function () { closePanel(filtersPanel, filtersBackdrop); });

  /* ---------------- ⓘ info popover ---------------- */
  var infoPopover = document.getElementById("infoPopover");
  function hideInfoPopover() { if (infoPopover) infoPopover.classList.add("hidden"); }
  function showInfoPopover(anchor, text) {
    if (!infoPopover) return;
    infoPopover.textContent = text; // textContent — no HTML injection
    infoPopover.classList.remove("hidden");
    var r = anchor.getBoundingClientRect();
    var pw = infoPopover.offsetWidth, ph = infoPopover.offsetHeight;
    var left = Math.min(r.left, window.innerWidth - pw - 8);
    var top = (r.bottom + 6 + ph > window.innerHeight - 8) ? (r.top - ph - 6) : (r.bottom + 6); // flip above if no room below
    infoPopover.style.left = Math.max(8, left) + "px";
    infoPopover.style.top = Math.max(8, top) + "px";
  }
  // Delegated: click a ⓘ → popover with its info; click anywhere else (not the popover) → close.
  document.addEventListener("click", function (e) {
    var badge = e.target.closest("[data-info]");
    if (badge) { showInfoPopover(badge, badge.getAttribute("data-info")); return; }
    if (!e.target.closest("#infoPopover")) hideInfoPopover();
  });

  /* ---------------- Auto Sort: maximize full passing teams ---------------- */
  // Randomized multi-start greedy. Hard rule: every party gets exactly one tank
  // (assigned by construction). Objective (lexicographic):
  //   1) most teams that are FULL and clear a barrier (>=320 dark/light/earth)
  //   2) most full teams (concentrates the unavoidable empty slots on losers)
  //   3) larger barrier margins (more robust passes)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffleRng(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // "all"-element units (Spellknight) cover every barrier at a reduced factor (per st-central roster guide).
  function heroContrib(h, el) { var e = elOf(h.className); if (e === el) return heroStat(h, "power"); if (e === "all") return heroStat(h, "power") * MZE.allBarrierFactor; return 0; }
  function champContrib(p, el) { var ce = partyChampEl(p); if (ce === el) return partyChampPower(p); if (ce === "all") return partyChampPower(p) * MZE.allBarrierFactor; return 0; }
  function barrierSum(p, hs, el) { var s = champContrib(p, el); for (var i = 0; i < hs.length; i++) s += heroContrib(hs[i], el); return s; }
  function partyBestBarrier(p, hs) { var b = 0; for (var i = 0; i < state.barriers.length; i++) { var s = barrierSum(p, hs, state.barriers[i]); if (s > b) b = s; } return b; }

  function autoBuild(rng) {
    var parties = state.parties;
    // Filters: drop excluded-class heroes from the assignable pool, and cap each class to its
    // max (excess stays benched). Min can't apply here — Auto Sort arranges existing heroes.
    var seen = {};
    var assignable = state.heroes.filter(function (h) {
      if (fExclude(h.className)) return false;
      seen[h.className] = (seen[h.className] || 0) + 1;
      return seen[h.className] <= fMax(h.className);
    });
    var tanks = assignable.filter(function (h) { return heroRole(h) === "tank"; });
    var others = assignable.filter(function (h) { return heroRole(h) !== "tank"; });
    if (tanks.length < parties.length) return null; // hard tank rule infeasible (or filters too strict)
    shuffleRng(tanks, rng); shuffleRng(others, rng);

    var assign = {};
    parties.forEach(function (p) { assign[p.id] = []; });
    parties.forEach(function (p, i) { assign[p.id].push(tanks[i]); }); // exactly 1 tank each
    var pool = others.concat(tanks.slice(parties.length));
    shuffleRng(pool, rng);

    // Phase 1: iteratively secure the cheapest available pass.
    var secured = {};
    while (true) {
      var best = null;
      for (var pi = 0; pi < parties.length; pi++) {
        var p = parties[pi];
        if (secured[p.id]) continue;
        var cur = assign[p.id];
        var capacity = partyCap(p) - cur.length;
        if (capacity <= 0) continue;
        for (var bi = 0; bi < state.barriers.length; bi++) {
          var el = state.barriers[bi];
          var base = barrierSum(p, cur, el);
          if (base >= BARRIER_POWER_TARGET) { if (!best || best.cost > 0) best = { pid: p.id, heroes: [], cost: 0 }; continue; }
          var deficit = BARRIER_POWER_TARGET - base;
          var cands = pool.filter(function (h) { return heroContrib(h, el) > 0; });
          cands.sort(function (a, b) { return heroContrib(b, el) - heroContrib(a, el); });
          var take = [], sum = 0;
          for (var ci = 0; ci < cands.length && take.length < capacity && sum < deficit; ci++) { take.push(cands[ci]); sum += heroContrib(cands[ci], el); }
          if (sum >= deficit && (!best || take.length < best.cost)) best = { pid: p.id, heroes: take, cost: take.length };
        }
      }
      if (!best) break;
      best.heroes.forEach(function (h) { assign[best.pid].push(h); var idx = pool.indexOf(h); if (idx >= 0) pool.splice(idx, 1); });
      secured[best.pid] = true;
    }

    // Phase 2: fill passing teams first (one at a time) so empties land on losers.
    var fillOrder = parties.slice().sort(function (a, b) { return (secured[b.id] ? 1 : 0) - (secured[a.id] ? 1 : 0); });
    fillOrder.forEach(function (p) { while (assign[p.id].length < partyCap(p) && pool.length) assign[p.id].push(pool.shift()); });
    return { assign: assign, bench: pool };
  }

  // Fast (closed-form) win estimate for a party arrangement, mirroring partyOutcome's gates. Used by
  // Auto Sort's 3000-iteration search — the Monte Carlo sim would be far too slow at that volume; the
  // DISPLAYED grade still uses the sim (partyOutcome). Returns 0 for any party that can't clear.
  function closedWinEstimate(p, hs) {
    if (hs.length !== partyCap(p)) return 0;
    var champ = getChampion(p.champName);
    var buff = partyBuff(champ, hs.map(function (h) { return h.className; }));
    if (state.barriers.length && partyBestBarrier(p, hs) * buff.barrierMult < BARRIER_POWER_TARGET) return 0;
    var atk = hs.reduce(function (a, h) { return a + buffedEffAtk(heroStat(h, "atk"), heroStat(h, "crit"), heroCritMult(h), buff); }, 0) +
      (champ ? buffedEffAtk(Number(champ.atk) || 0, Number(champ.crit) || 0, MZE.critDmgMod, buff) : 0);
    var rounds = atk > 0 ? Math.ceil(MZE.bossHP / atk) : Infinity;
    if (rounds >= MZE.roundCap) return 0;
    var saves = hs.reduce(function (a, h) { return a + classSaves(h.className); }, 0);
    return winChance(partyUnits(hs, champ, buff), rounds, saves);
  }
  // Auto Sort search objective: most full parties that clear the (active) barrier, then barrier margin.
  // (Win is optimized separately by winSwapPass on the chosen arrangement — putting it in this 3000×
  // search was a near no-op, since the search fills passing parties with the same heroes either way.)
  function autoScore(res) {
    var passers = 0, fullTeams = 0, margin = 0;
    for (var i = 0; i < state.parties.length; i++) {
      var p = state.parties[i], hs = res.assign[p.id], cap = partyCap(p);
      if (hs.length === cap) fullTeams++;
      var b = partyBestBarrier(p, hs);
      var barrierOK = !state.barriers.length || b >= BARRIER_POWER_TARGET; // empty barriers = no requirement
      if (hs.length === cap && barrierOK) { passers++; if (state.barriers.length) margin += (b - BARRIER_POWER_TARGET); }
    }
    return passers * 1e9 + fullTeams * 1e5 + Math.min(margin, 90000);
  }
  // Win-improving swap pass: on the CHOSEN arrangement, swap non-tank heroes between parties (or with
  // the bench) whenever it raises total closed-form win, without dropping a party's barrier. Greedy
  // hill-climb — runs once on the final arrangement (cheap), so Auto Sort lands the strongest CLEARING
  // teams, not just barrier-passers. Tanks aren't swapped (keeps the 1-tank-per-party rule intact).
  function winSwapPass(assign, bench) {
    var pid2p = {}; state.parties.forEach(function (p) { pid2p[p.id] = p; });
    var pids = state.parties.filter(function (p) { return assign[p.id].length === partyCap(p); }).map(function (p) { return p.id; });
    function barrierOK(p, hs) { return !state.barriers.length || partyBestBarrier(p, hs) >= BARRIER_POWER_TARGET; }
    function notTank(h) { return heroRole(h) !== "tank"; }
    var improved = true, guard = 0;
    while (improved && guard++ < 12) {
      improved = false;
      for (var a = 0; a < pids.length; a++) for (var b = a + 1; b < pids.length; b++) {
        var pa = pid2p[pids[a]], pb = pid2p[pids[b]], A = assign[pa.id], B = assign[pb.id];
        for (var ia = 0; ia < A.length; ia++) { if (!notTank(A[ia])) continue;
          for (var ib = 0; ib < B.length; ib++) { if (!notTank(B[ib])) continue;
            var before = closedWinEstimate(pa, A) + closedWinEstimate(pb, B);
            var ha = A[ia], hb = B[ib]; A[ia] = hb; B[ib] = ha;                    // try swap
            if (barrierOK(pa, A) && barrierOK(pb, B) && closedWinEstimate(pa, A) + closedWinEstimate(pb, B) > before + 1e-9) { improved = true; }
            else { A[ia] = ha; B[ib] = hb; }                                       // revert
          }
        }
      }
      for (var pi = 0; pi < pids.length; pi++) { var p = pid2p[pids[pi]], hs = assign[p.id];
        for (var si = 0; si < hs.length; si++) { if (!notTank(hs[si])) continue;
          for (var bj = 0; bj < bench.length; bj++) { if (!notTank(bench[bj])) continue;
            var before2 = closedWinEstimate(p, hs);
            var hp = hs[si], hbn = bench[bj]; hs[si] = hbn; bench[bj] = hp;        // try party<->bench swap
            if (barrierOK(p, hs) && closedWinEstimate(p, hs) > before2 + 1e-9) { improved = true; }
            else { hs[si] = hp; bench[bj] = hbn; }                                 // revert
          }
        }
      }
    }
  }

  function autoSort() {
    var rng = mulberry32(0x7117b0); // fixed seed -> deterministic result
    var best = null, bestScore = -1;
    for (var i = 0; i < 3000; i++) {
      var res = autoBuild(rng);
      if (!res) return null;
      var sc = autoScore(res);
      if (sc > bestScore) { bestScore = sc; best = res; }
    }
    winSwapPass(best.assign, best.bench); // local win optimization on the chosen arrangement
    state.heroes.forEach(function (h) { h.partyId = null; });
    state.parties.forEach(function (p) { best.assign[p.id].forEach(function (h) { h.partyId = p.id; }); });
    var passers = 0;
    state.parties.forEach(function (p) {
      var hs = state.heroes.filter(function (h) { return h.partyId === p.id; });
      if (hs.length === partyCap(p) && partyBestBarrier(p, hs) >= BARRIER_POWER_TARGET) passers++;
    });
    return passers;
  }

  // Top up the ROSTER to capacity (maxRoster) with new bench heroes, choosing the best
  // classes to complement what's already there: secure 1 tank per party first, then shore
  // up any element below the 3+/element target (highest-ATK class of that element), else
  // add the highest-ATK class overall. Returns how many heroes were added.
  function fillGaps() {
    var gap = state.maxRoster - state.heroes.length;
    if (gap <= 0) return 0;
    var elemCount = {}; COVERAGE_ELS.forEach(function (e) { elemCount[e] = 0; });
    var counts = {}; var tankCount = 0;
    state.heroes.forEach(function (h) {
      counts[h.className] = (counts[h.className] || 0) + 1;
      var e = elOf(h.className); if (elemCount[e] !== undefined) elemCount[e]++;
      if (heroRole(h) === "tank") tankCount++;
    });
    function room(cn) { return !fExclude(cn) && (counts[cn] || 0) < fMax(cn); } // filter: not excluded, under cap
    // Allowed classes matching `filter`, sorted by ATK desc, priority asc.
    function byAtk(filter) {
      return CATALOG.map(function (c) { return c.name; }).filter(function (cn) { return room(cn) && filter(cn); }).sort(function (a, b) {
        var d = classAvg(b, "atk") - classAvg(a, "atk");
        return d !== 0 ? d : state.classOrder.indexOf(a) - state.classOrder.indexOf(b);
      });
    }
    var added = 0;
    for (var i = 0; i < gap; i++) {
      var pick;
      var underMin = byAtk(function (cn) { return (counts[cn] || 0) < fMin(cn); });
      if (underMin.length) pick = underMin[0];                         // 1) satisfy required minimums first
      else if (tankCount < state.parties.length) { pick = byAtk(isTank)[0]; if (pick) tankCount++; } // 2) tanks
      else {
        var needEl = null, lowest = 3;
        COVERAGE_ELS.forEach(function (e) { if (elemCount[e] < lowest) { lowest = elemCount[e]; needEl = e; } });
        if (needEl && elemCount[needEl] < 3) pick = byAtk(function (cn) { return CLASS[cn].element === needEl; })[0]; // 3) element breadth
        if (!pick) pick = byAtk(function (cn) { return !isTank(cn); })[0];                                            // 4) best DPS
      }
      if (!pick) pick = byAtk(function () { return true; })[0];        // any allowed class
      if (!pick) break;                                               // everything excluded / at cap — stop
      addHero(pick);
      counts[pick] = (counts[pick] || 0) + 1;
      var pe = elOf(pick); if (elemCount[pe] !== undefined) elemCount[pe]++;
      added++;
    }
    return added;
  }

  // Auto Sort is now a button inside the roster row; handled in the delegated app click listener.

  render();

  // If the URL carries a shared roster (#r=...), decode it (async) and load over the default.
  // Leaving the hash in place keeps the link bookmarkable — a refresh returns to the shared roster.
  (function () {
    if (!SHARE_SUPPORTED) return;
    var m = String(location.hash || "").match(/[#&]r=([^&]+)/);
    if (!m) return;
    inflateRaw(b64urlToBytes(m[1])).then(function (json) {
      try {
        var data = JSON.parse(json);
        // Links omit the gear-tier stat tables — keep this page's own (baked-in) tables.
        if (!data.classStatsByQuality) data.classStatsByQuality = state.classStatsByQuality;
        loadJSON(JSON.stringify(data));
        setUpdate("Loaded a shared roster from the link.");
        render();
      } catch (e) { /* shared data invalid — keep the current roster */ }
    }).catch(function () { /* corrupt/garbled link — keep the current roster */ });
  })();
})();
