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
  var BARRIERS = ["dark", "light", "earth"];            // Meteor Zone Extreme
  var COVERAGE_ELS = ["dark", "light", "earth", "fire", "air", "water"];
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
  function isTank(cn) { return (CLASS[cn] && CLASS[cn].role || "").indexOf("Tank") >= 0; }
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
    filters: { exclude: {}, max: {}, min: {} }
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
    state.heroes.push({ id: max + 1, name: "", className: className || CATALOG[0].name, partyId: null, roleOverride: null, power: null, hp: null, atk: null, def: null, eva: null, crit: null, threat: null });
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
    recommendReasons = {}; // rebuilt per party below

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
    // Classes matching `filter` and not excluded, sorted by EFFECTIVE (crit-folded) ATK desc, priority
    // asc. Using effClassAtk (not raw ATK) so candidate generation values crit chance / crit-damage the
    // same way the sim, diversify, and explainBuild do — a high-crit class no longer ranks below a
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
      function add(cn) { slots.push(cn); local[cn] = (local[cn] || 0) + 1; }
      function barPow() { var s = champCovers(p, el); for (var i = 0; i < slots.length; i++) s += contrib(slots[i], el); return s; }
      // Exactly one tank (slot 0): the caller's pick if it has room, else the best tank that does.
      if (tankCn && room(tankCn)) add(tankCn);
      else { var t = tanksByAtk.filter(room)[0]; if (t) add(t); }
      // Cover the barrier with the highest-ATK matching DPS that has room.
      while (barPow() < BARRIER_POWER_TARGET && slots.length < cap) {
        var md = dpsByAtk.filter(function (cn) { return contrib(cn, el) > 0 && room(cn); });
        if (!md.length) break;
        add(md[0]);
      }
      // Fill the rest: prefer under-min required classes, else highest-ATK DPS (max kill speed).
      while (slots.length < cap) {
        var avail = dpsByAtk.filter(room);
        if (!avail.length) { var any = allClasses.filter(room); if (!any.length) break; add(any[0]); continue; }
        var needed = avail.filter(function (cn) { return (local[cn] || 0) < fMin(cn); });
        add(needed.length ? needed[0] : avail[0]);
      }
      return slots;
    }

    // Grade a slot list the same way partyGrade does, on class averages — including
    // crit-boosted ATK (kill speed) and threat/dodge-weighted one-shot demotion.
    function scoreOf(p, el, slots) {
      var cap = partyCap(p), champ = getChampion(p.champName);
      var buff = partyBuff(champ, slots);
      var bestBar = 0;
      BARRIERS.forEach(function (b) {
        var s = champCovers(p, b);
        slots.forEach(function (cn) { s += contrib(cn, b); });
        if (s > bestBar) bestBar = s;
      });
      bestBar *= buff.barrierMult;
      var atk = slots.reduce(function (a, cn) { return a + buffedEffAtk(classAvg(cn, "atk"), classAvg(cn, "crit"), critMultOf(cn), buff); }, 0) +
        (champ ? buffedEffAtk(Number(champ.atk) || 0, Number(champ.crit) || 0, MZE.critDmgMod, buff) : 0);
      var tier, win = 0;
      var rounds = atk > 0 ? Math.ceil(MZE.bossHP / atk) : Infinity;
      if (slots.length !== cap || bestBar < BARRIER_POWER_TARGET || rounds >= MZE.roundCap) {
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
      heroes.push({ id: id++, name: "", className: className, partyId: partyId, roleOverride: null, power: null, hp: null, atk: null, def: null, eva: null, crit: null, threat: null });
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
    var BREADTH_FLOOR = 2; // keep every element barrier-capable (~2), then Class Priority drives the rest
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
          return CLASS[cn].element !== "all" && !fExclude(cn) && (counts[cn] || 0) < fMax(cn) && prefLess(slotPref(cn, local), curPref);
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
          if (cn === out[i] || fExclude(cn) || (counts[cn] || 0) >= fMax(cn)) continue;
          var trial = out.slice(); trial[i] = cn;
          var w = scoreOf(p, el, trial).win;                 // tier-4 (barrier broken / undermanned) → win 0, auto-rejected
          if (w > bestWin + FLEX_WIN_EPS) { bestWin = w; bestCn = cn; }
        }
        if (bestCn !== out[i]) { out[i] = bestCn; cur = bestWin; }
      }
      return out;
    }

    state.parties.forEach(function (p) {
      if (heroes.length >= state.maxRoster) return;
      var best = null;
      BARRIERS.forEach(function (el) {
        tanksByAtk.forEach(function (tankCn) {                                                   // try each tank — bulk/threat can beat raw ATK
          var slots = buildFor(p, el, tankCn);
          var sc = scoreOf(p, el, slots);
          // Balance the 3 barriers: among equal-grade, equal-alignment builds prefer the
          // LESS-used barrier element so the roster doesn't all stack dark (highest-ATK).
          var use = elemCount[el] || 0, bestUse = best ? (elemCount[best.el] || 0) : Infinity;
          var better = !best ||
            sc.tier < best.sc.tier ||                                                           // greener face wins
            (sc.tier === best.sc.tier && sc.align > best.sc.align) ||                            // else align to champion element
            (sc.tier === best.sc.tier && sc.align === best.sc.align && use < bestUse) ||         // else even out dark/light/earth
            (sc.tier === best.sc.tier && sc.align === best.sc.align && use === bestUse && sc.atk > best.sc.atk) ||  // else faster kill
            (sc.tier === best.sc.tier && sc.align === best.sc.align && use === bestUse && sc.atk === best.sc.atk && sc.bar > best.sc.bar);
          if (better) best = { slots: slots, sc: sc, el: el };
        });
      });
      var chosen = best ? diversify(p, best.el, best.slots, best.sc.tier) : [];
      if (chosen.length) chosen = flexRefine(p, best.el, chosen); // let the sim pull in bulky/flex picks (Spellknight)
      for (var i = 0; i < chosen.length; i++) {
        if (!mk(chosen[i], p.id)) break;
        var e = CLASS[chosen[i]] && CLASS[chosen[i]].element;
        if (e) elemCount[e] = (elemCount[e] || 0) + 1;
        counts[chosen[i]] = (counts[chosen[i]] || 0) + 1; // track for filter caps/min
      }
      if (best && chosen.length) recommendReasons[p.id] = explainBuild(p, best.el, best.sc.align, chosen, scoreOf(p, best.el, chosen));
    });
    state.heroes = heroes;
  }
  // Class-average effective ATK (crit-boosted) — the figure the build optimizes on.
  function effClassAtk(cn) { return effAtkOf(classAvg(cn, "atk"), classAvg(cn, "crit"), critMultOf(cn)); }
  function fmtN(n) { return Math.round(Number(n) || 0).toLocaleString(); }
  // Per-pick rationale for a Recommended party build (shown in the "Why I chose this" modal):
  // why this barrier, then each hero's role + effective-ATK rank vs same-element alternatives,
  // the crit/crit-damage that drives its damage, and any class skill.
  function explainBuild(p, el, aligned, slots, sc) {
    var champ = getChampion(p.champName);
    var buff = partyBuff(champ, slots);                                   // THIS party's champion aura
    var grade = GRADE_LETTERS[sc.tier];
    var rounds = sc.atk > 0 ? Math.ceil(MZE.bossHP / sc.atk) : 0;
    // In-party effective ATK/EVA = class average boosted by THIS champion's aura (matches what the
    // optimizer scored), so the same class reads differently in another champion's party.
    function buffEff(cn) { return buffedEffAtk(classAvg(cn, "atk"), classAvg(cn, "crit"), critMultOf(cn), buff); }
    function buffEva(cn) { return Math.round(classAvg(cn, "eva") + buff.evaAdd); }
    // Cross-class ranks are aura-invariant (the champ boosts everyone equally) → rank on class avgs.
    var dpsByAtk = CATALOG.filter(function (c) { return !isTank(c.name) && !fExclude(c.name); }).map(function (c) { return c.name; }).sort(function (a, b) { return effClassAtk(b) - effClassAtk(a); });
    var topDps = 0; slots.forEach(function (cn, i) { if (i > 0) { var e = buffEff(cn); if (e > topDps) topDps = e; } });

    var why = aligned ? ("aligns with " + (champ ? champ.name : "the champion") + "’s " + el + " element") : "balances dark / light / earth across your roster so a zone change needs fewer rebuilds";
    var out = ["Barrier — this party breaks " + el + " (" + why + "). It stacks " + Math.round(sc.bar) + " " + el + " power against the 320 needed, so the barrier drops and the team's hits land in full."];
    if (champ) {
      var bp = [];
      if (buff.atkMult > 1) bp.push("+" + Math.round((buff.atkMult - 1) * 100) + "% ATK");
      if (buff.hpMult > 1) bp.push("+" + Math.round((buff.hpMult - 1) * 100) + "% HP");
      if (buff.defMult > 1) bp.push("+" + Math.round((buff.defMult - 1) * 100) + "% DEF");
      if (buff.critAdd) bp.push("+" + buff.critAdd + " crit");
      if (buff.evaAdd) bp.push("+" + buff.evaAdd + " EVA");
      if (buff.critDmgAdd) bp.push("+" + buff.critDmgAdd + " crit-dmg");
      if (buff.barrierMult > 1) bp.push("+" + Math.round((buff.barrierMult - 1) * 100) + "% barrier");
      out.push("Champion — " + champ.name + " (" + champ.el + "): " + (bp.length ? bp.join(", ") + " to the whole party" : "no combat aura") + " — every eff-ATK below already includes it.");
    }
    out.push("");

    slots.forEach(function (cn, i) {
      var elc = CLASS[cn].element, eff = buffEff(cn), cd = critMultOf(cn) + (buff.critDmgAdd || 0), cr = Math.round(classAvg(cn, "crit") + (buff.critAdd || 0));
      var thr = Math.round(classAvg(cn, "threat")), ev = buffEva(cn);
      var critNote = (cd > 2 || cr >= 35) ? " Its " + cr + "% crit at ×" + cd + " crit-damage punches well above the listed ATK." : "";
      var sk = CLASS_SKILLS[cn];
      var skill = sk ? "\n◦ Skill: " + sk.text + (sk.protectAlly || sk.surviveFatal ? " — a free lethal-hit save, a real survivability bump." : "") : "";

      if (i === 0) {
        var tankRank = CATALOG.filter(function (c) { return isTank(c.name) && !fExclude(c.name); }).sort(function (a, b) { return effClassAtk(b.name) - effClassAtk(a.name); }).map(function (c) { return c.name; });
        var lead;
        if (elc === el) lead = "the " + el + " tank, so it pulls double duty — it soaks the boss up front AND its " + Math.round(classAvg(cn, "power") * buff.barrierMult) + " " + el + " power helps break the barrier, freeing a slot for damage. Threat " + thr + " pulls the boss's hits onto it and off your carries";
        else lead = "here for bulk + threat (" + thr + ") to body-block — it eats the boss's hits so your squishies live" + (tankRank[0] && tankRank[0] !== cn ? ", and soaking wins the slot over the higher-ATK " + tankRank[0] : "");
        if (tankRank[0] === cn) lead += " — also your hardest-hitting tank";
        out.push("• Tank — " + cn + ": " + lead + ". HP " + fmtN(classAvg(cn, "hp") * buff.hpMult) + " · DEF " + fmtN(classAvg(cn, "def") * buff.defMult) + " · threat " + thr + "." + skill);
      } else {
        // Hardest same-element DPS IGNORING filters, so we can name the filter reason if it was skipped.
        var sameElAll = CATALOG.filter(function (c) { return c.element === elc && !isTank(c.name); }).map(function (c) { return c.name; }).sort(function (a, b) { return effClassAtk(b) - effClassAtk(a); });
        var hardest = sameElAll[0];
        var gRank = dpsByAtk.indexOf(cn) + 1;
        var covers = (elc === el || elc === "all");
        var pwr = Math.round(classAvg(cn, "power") * (elc === "all" ? MZE.allBarrierFactor : 1) * buff.barrierMult);
        var soaker = topDps > 0 && eff < 0.4 * topDps && ev >= 75; // low damage but high evasion → a survivability pick
        var line;
        if (soaker) {
          line = cn + " (" + elc + ") — not here for damage (only " + fmtN(eff) + " eff ATK); it earns its slot on survival — " + ev + " EVA dodges most of the boss's hits" + (thr >= 50 ? ", and threat " + thr + " pulls fire off your carries" : "") + ", so it rides out the fight (what the win-model rewards)." + (covers ? " It also chips the " + el + " barrier (" + pwr + " pwr)." : "");
        } else {
          var whyNot = "";
          if (hardest && hardest !== cn) {
            var why2 = fExclude(hardest) ? "but you've excluded it" : (isFinite(fMax(hardest)) ? "but it's capped at max-" + fMax(hardest) : "but it's placed in another party / out-prioritized");
            whyNot = " — " + hardest + " hits harder (~" + fmtN(buffEff(hardest)) + " here) " + why2;
          } else if (gRank >= 1 && gRank <= 5) {
            whyNot = " — your top available " + elc + " DPS, one of your hardest hitters (#" + gRank + " overall)";
          }
          var role = covers ? "breaks the " + el + " barrier (" + pwr + " pwr) and brings the damage" : "damage + " + elc + " depth, keeping the roster ready when the barrier rotates";
          line = cn + " (" + elc + ") — " + role + ": " + fmtN(eff) + " eff ATK" + whyNot + "." + critNote;
        }
        out.push("• " + line + skill);
      }
    });

    out.push("");
    if (rounds >= MZE.roundCap) out.push("Result — FAILS: ~" + rounds + " rounds to kill the 10M-HP boss exceeds the 500-round limit (auto-loss). Needs far more ATK.");
    else out.push("Result — grade " + grade + ", ~" + Math.round((sc.win || 0) * 100) + "% est. win chance (clears the quest — survivors finish the boss); kills the 10M boss in ~" + rounds + " rounds at ~" + fmtN(sc.atk) + " party ATK.");
    return out.join("\n");
  }
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
      parties: state.parties.map(function (p) {
        return { id: p.id, name: p.name, champName: p.champName || "" };
      }),
      heroes: state.heroes.map(function (h) {
        return { id: h.id, name: h.name, className: h.className, partyId: h.partyId, roleOverride: h.roleOverride || null,
          power: statOut(h.power), hp: statOut(h.hp), atk: statOut(h.atk), def: statOut(h.def), eva: statOut(h.eva), crit: statOut(h.crit), threat: statOut(h.threat) };
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
    state.heroes = data.heroes.map(function (h) {
      return {
        id: Number(h.id),
        name: h.name == null ? "" : String(h.name),
        className: h.className ? String(h.className) : CATALOG[0].name,
        partyId: h.partyId == null ? null : Number(h.partyId),
        roleOverride: (h.roleOverride === "tank" || h.roleOverride === "dps") ? h.roleOverride : null,
        power: statOut(h.power), hp: statOut(h.hp), atk: statOut(h.atk), def: statOut(h.def), eva: statOut(h.eva), crit: statOut(h.crit), threat: statOut(h.threat)
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
      var isBarrier = BARRIERS.indexOf(el) >= 0;
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
      var slotLabel = (h.name ? escH(h.name) + ' ' : '') +
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
        (recommendReasons[p.id] ? '<button class="bg-transparent border-none cursor-pointer p-0 leading-none shrink-0 opacity-80 hover:opacity-100 transition" data-reason-pid="' + p.id + '" title="Why I chose this"><img src="' + IMG_DIR + 'Wooden_Chest.webp" alt="Why I chose this" class="w-5 h-5 object-contain" onerror="this.outerHTML=\'ⓘ\'"></button>' : '') +
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
  // Per-party "why I chose this" text, set by Recommended (buildSuggestedRoster). The ⓘ on a
  // party card shows only while a reason exists; cleared/invalidated when that party changes.
  var recommendReasons = {};
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
        escH(lastUpdate || "No changes yet — sort, fill, or edit your roster to see updates here.") + '</span></div>';
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
      delete recommendReasons[pid]; // party composition/cap changed
      setUpdate(champ.value ? "Set " + partyLabel(pid) + "'s champion to " + champ.value + "." : "Removed " + partyLabel(pid) + "'s champion.");
      render();
    }
  });
  app.addEventListener("click", function (e) {
    var reason = e.target.closest("[data-reason-pid]");
    if (reason) { openReasonModal(recommendReasons[reason.dataset.reasonPid] || "No reasoning recorded for this party."); return; }
    var el = e.target.closest('[data-action]'); if (!el) return;
    var a = el.dataset.action;
    if (a === "add-hero") {
      if (state.heroes.length >= state.maxRoster) { showAlert("Roster is full (" + state.maxRoster + "). Increase capacity or retire a hero."); return; }
      addHero(el.dataset.class); setUpdate("Added " + el.dataset.class + " to the roster (" + state.heroes.length + "/" + state.maxRoster + ")."); render();
    }
    else if (a === "del-hero") { var di = Number(el.dataset.id), dl = heroLabel(di), dpid = heroPartyId(di); delHero(di); if (dpid) delete recommendReasons[dpid]; setUpdate("Removed " + dl + " from the roster."); render(); }
    else if (a === "unassign") { var ui = Number(el.dataset.id), ul = heroLabel(ui), upid = heroPartyId(ui); setHero(ui, "partyId", null); if (upid) delete recommendReasons[upid]; setUpdate("Benched " + ul + "."); render(); }
    else if (a === "add-party") { addParty(); setUpdate("Added a party (" + state.parties.length + " total)."); render(); }
    else if (a === "del-party") { var dpi = Number(el.dataset.id), dp = partyLabel(dpi); delParty(dpi); delete recommendReasons[dpi]; setUpdate("Deleted " + dp + " — its heroes returned to the roster."); render(); }
    else if (a === "auto-sort") {
      var tankCount = state.heroes.filter(function (h) { return heroRole(h) === "tank"; }).length;
      if (tankCount < state.parties.length) { showAlert("Auto Sort can't give every party a tank: " + state.parties.length + " parties but only " + tankCount + " tanks."); return; }
      var passers = autoSort();
      if (passers === null) { showAlert("Auto Sort couldn't run — your Filters (excluded/capped tanks) leave fewer than " + state.parties.length + " usable tanks."); return; }
      recommendReasons = {}; // different algorithm — Recommended reasoning no longer applies
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
        onConfirm: function () { state.heroes = []; recommendReasons = {}; setUpdate("Cleared all heroes from the roster."); render(); }
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
    var oldPid = heroPartyId(id);
    setHero(id, "partyId", pid);
    delete recommendReasons[pid]; if (oldPid) delete recommendReasons[oldPid]; // both parties changed
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
        BARRIERS.forEach(function (el) { var def = BARRIER_POWER_TARGET - barrierSum(p, hs, el); if (def < bestDef) { bestDef = def; bestEl = el; } });
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
      out.push(suggCard(BARRIERS.indexOf(el) >= 0 ? COL.rose : COL.amber,
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
    var d = depth();
    var elRows = COVERAGE_ELS.map(function (el) {
      var n = d.h[el];
      var isBarrier = BARRIERS.indexOf(el) >= 0;
      var low = n < 3;
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-2">' + barrierIcon(el) +
        '<span class="flex-1 capitalize text-sm">' + el + (isBarrier ? ' <span class="text-textSecondary text-xs">· T16 barrier</span>' : '') + '</span>' +
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
      return { hp: heroStat(h, "hp") * buff.hpMult, def: heroStat(h, "def") * buff.defMult, eva: heroStat(h, "eva") + buff.evaAdd, threat: heroStat(h, "threat"), evaCap: evaCapOf(h.className), atk: buffedEffAtk(heroStat(h, "atk"), heroStat(h, "crit"), critMultOf(h.className), buff) };
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
        critMultOf(h.className) + buff.critDmgAdd);
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
  function applyBossHit(x, r, rng, isAoe) {
    if (rng() < dodgeProbOf(x, r)) { x.dodgedThisRound = true; return; }
    var dmg;
    if (isAoe) {
      dmg = MZE.aoeHit * mzeDefMult(x.def);
    } else {
      var effEva = condEva(x) - MZE.evaPenalty;
      var bossCrit = MZE.critChance + Math.max(0, -effEva) * MZE.critPerNegEva; // crit ignores DEF
      dmg = (rng() < bossCrit) ? MZE.critHit : MZE.baseHit * mzeDefMult(x.def);
    }
    x.hp -= dmg;
    x.damagedThisRound = true;
  }
  // Resolve ONE fight → true (boss dead before the round cap) / false (wiped or hit the cap).
  // `rng` is a mulberry32 stream (advanced across trials); `opts` = { saves, champName }.
  function simulateFight(units, rng, opts) {
    opts = opts || {};
    var n = units.length;
    if (!n) return false;
    var u = new Array(n);
    for (var i = 0; i < n; i++) { var s = units[i];
      u[i] = { cn: s.cn, isChamp: s.isChamp, champName: s.champName, maxHp: s.maxHp, hp: s.maxHp,
        def: s.def, evaBase: s.evaBase, threat: s.threat, evaCap: s.evaCap, baseAtk: s.baseAtk,
        critChance: s.critChance, critMult: s.critMult, alive: true, consec: 0,
        hemmaStack: 0, sensClean: true, sensCnt: 0, dodgedLast: false, dodgedThisRound: false,
        damagedThisRound: false,
        // Bishop survive-fatal is SELF-only (the individual Bishop). Lord's is the party-wide pool below.
        selfSave: !_simBare && !!(CLASS_SKILLS[s.cn] && CLASS_SKILLS[s.cn].surviveFatal), usedSelfSave: false };
    }
    // Party-wide saves = Lord's "protect an ally" (one per Lord). Bishop's save is per-unit (selfSave), NOT here.
    var allySaves = 0;
    if (!_simBare) for (var i = 0; i < n; i++) { if (CLASS_SKILLS[u[i].cn] && CLASS_SKILLS[u[i].cn].protectAlly) allySaves++; }
    var rudo = !_simBare && opts.champName === "Rudo";
    var lilu = !_simBare && opts.champName === "Lilu";
    var bossHp = MZE.bossHP, cap = MZE.roundCap;
    for (var r = 1; r <= cap; r++) {
      // ---- party damage (alive units, with this round's conditional state) ----
      var dmg = 0;
      for (var i = 0; i < n; i++) {
        var x = u[i]; if (!x.alive) continue;
        // Death Knight execute: if the boss is at ≤10% HP when the DK attacks, it's instantly defeated.
        if (!_simBare && x.cn === "Death Knight" && (bossHp - dmg) <= MZE.bossHP * SIM.dk.executeFrac) return true;
        var cc = x.critChance, cm = x.critMult, atkMul = 1, forced = false;
        if (!_simBare) {
          if (x.cn === "Jarl") { var t = jarlTier(x.hp / x.maxHp); if (t) atkMul *= 1 + SIM.jarl.atkPerTier * t; }
          else if (x.cn === "Sensei") { if (x.sensClean) cc += SIM.sensei.crit; }
          else if (x.cn === "Daimyo") { if (r === 1) forced = true; }
          else if (x.cn === "Acrobat") { if (x.dodgedLast) forced = true; }
          else if (x.cn === "Conquistador") { if (x.consec > 0) cm += SIM.conq.perStack * Math.min(x.consec, SIM.conq.maxStacks); }
          if (rudo && r <= SIM.rudo.rounds) cc += SIM.rudo.crit;
          if (x.isChamp && x.champName === "Hemma") atkMul *= 1 + SIM.hemma.atkPerStack * x.hemmaStack;
        }
        var isCrit = forced || (rng() < Math.max(0, Math.min(1, cc / 100)));
        dmg += x.baseAtk * atkMul * (isCrit ? cm : 1);
        if (!_simBare && x.cn === "Conquistador") x.consec = isCrit ? x.consec + 1 : 0;
      }
      bossHp -= dmg;
      if (bossHp <= 0) return true; // boss dead → win
      // ---- boss attacks ----
      var totT = 0, aliveCnt = 0;
      for (var i = 0; i < n; i++) { u[i].dodgedThisRound = false; u[i].damagedThisRound = false; if (u[i].alive) { totT += Number(u[i].threat) || 0; aliveCnt++; } }
      if (!aliveCnt) return false; // wiped
      // single-target by threat share
      var roll = rng() * (totT > 0 ? totT : aliveCnt), acc = 0, tgt = null;
      for (var i = 0; i < n; i++) {
        if (!u[i].alive) continue;
        acc += totT > 0 ? (Number(u[i].threat) || 0) : 1;
        if (roll <= acc) { tgt = u[i]; break; }
      }
      if (!tgt) { for (var i = n - 1; i >= 0; i--) if (u[i].alive) { tgt = u[i]; break; } }
      applyBossHit(tgt, r, rng, false);
      // AoE: hits every alive unit (per-unit dodge), no threat gate
      if (rng() < MZE.aoeChance) { for (var i = 0; i < n; i++) if (u[i].alive) applyBossHit(u[i], r, rng, true); }
      // deaths — a Bishop spends its OWN survive-fatal first; otherwise a Lord's party-wide save covers
      // the ally; else the unit dies. Each save revives to 1 HP, once.
      for (var i = 0; i < n; i++) { var x = u[i]; if (x.alive && x.hp <= 0) {
        if (x.selfSave && !x.usedSelfSave) { x.usedSelfSave = true; x.hp = 1; }
        else if (allySaves > 0) { allySaves--; x.hp = 1; }
        else { x.alive = false; }
      } }
      // ---- end-of-round upkeep (healing, Hemma drain, Sensei/Acrobat state) ----
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
            hemma.hp = Math.min(hemma.maxHp, hemma.hp + drain); if (hemma.hemmaStack < SIM.hemma.maxStacks) hemma.hemmaStack++; }
        }
        for (var i = 0; i < n; i++) { var x = u[i]; if (!x.alive) continue;
          if (x.cn === "Sensei") { if (x.damagedThisRound) { x.sensClean = false; x.sensCnt = 0; }
            else if (!x.sensClean) { x.sensCnt++; if (x.sensCnt >= SIM.sensei.regainRounds) x.sensClean = true; } }
          x.dodgedLast = x.dodgedThisRound;
        }
      }
    }
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
        "," + heroStat(h, "eva") + "," + heroStat(h, "crit") + "," + heroStat(h, "threat");
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
    var atk = hs.reduce(function (a, h) { return a + buffedEffAtk(heroStat(h, "atk"), heroStat(h, "crit"), critMultOf(h.className), buff); }, 0) +
      (champ ? buffedEffAtk(Number(champ.atk) || 0, Number(champ.crit) || 0, MZE.critDmgMod, buff) : 0);
    var rounds = atk > 0 ? Math.ceil(MZE.bossHP / atk) : Infinity;
    if (hs.length !== partyCap(p)) return { grade: "D", winPct: 0, fail: true, reason: "undermanned", rounds: rounds };
    if (partyBestBarrier(p, hs) * buff.barrierMult < BARRIER_POWER_TARGET) return { grade: "D", winPct: 0, fail: true, reason: "barrier", rounds: rounds };
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
      ["hp", "atk", "def", "eva", "power", "crit", "threat"].forEach(function (key, i) {
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
      '<div class="text-xs text-textSecondary leading-relaxed">Per-hero <b>overrides</b> — leave a cell blank to inherit the class average (the faint number). Paste: <b>HP&nbsp; ATK&nbsp; DEF&nbsp; EVA&nbsp; Element&nbsp; CRIT&nbsp; THREAT</b> (optional leading <b>Name</b>).</div>' +
      '<textarea id="statsPaste" spellcheck="false" class="w-full h-16 p-2 rounded-lg bg-hoverBg border border-borderc text-textPrimary font-mono text-xs resize-y focus:outline-none focus:ring-1 focus:ring-accent" placeholder="SHADE&#9;4284&#9;12144&#9;47648&#9;0&#9;215&#9;25&#9;100"></textarea>' +
      '<div class="flex items-center gap-2"><button id="statsPasteApply" class="btn-white text-xs px-3 py-1">Apply Hero Paste</button><span id="statsPasteStatus" class="text-xs text-textSecondary"></span></div>' +
    '</div>';
    var heroHeader = state.heroes.length ? '<div class="flex items-center gap-2 px-3 text-[10px] uppercase tracking-wider text-textSecondary">' +
      '<span class="w-5 shrink-0"></span><span class="flex-1">Hero</span>' +
      '<span class="w-14 text-center shrink-0">HP</span><span class="w-16 text-center shrink-0">ATK</span>' +
      '<span class="w-16 text-center shrink-0">DEF</span><span class="w-12 text-center shrink-0">EVA</span>' +
      '<span class="w-16 text-center shrink-0">Element</span><span class="w-12 text-center shrink-0">CRIT</span>' +
      '<span class="w-14 text-center shrink-0">THREAT</span></div>' : "";
    var heroRows = state.heroes.length ? state.heroes.map(function (h) {
      return '<div class="flex items-center gap-2 bg-surface border-2 border-borderc rounded-lg px-3 py-1.5">' +
        classIcon(h.className) + '<span class="flex-1 min-w-0 truncate text-sm">' + escH(h.name || h.className) + '</span>' +
        overrideField(h, "hp", "w-14") + overrideField(h, "atk", "w-16") + overrideField(h, "def", "w-16") +
        overrideField(h, "eva", "w-12") + overrideField(h, "power", "w-16") +
        overrideField(h, "crit", "w-12") + overrideField(h, "threat", "w-14") + '</div>';
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

  // "Why I chose this" centered overlay (Recommended reasoning) — same open/close pattern as Share.
  var reasonModal = document.getElementById("reasonModal");
  var reasonBackdrop = document.getElementById("reasonBackdrop");
  var reasonBody = document.getElementById("reasonBody");
  function openReasonModal(text) {
    if (reasonBody) reasonBody.textContent = text; // textContent — no HTML injection
    [reasonModal, reasonBackdrop].forEach(function (el) { if (el) el.classList.remove("opacity-0", "pointer-events-none"); });
  }
  function closeReasonModal() { [reasonModal, reasonBackdrop].forEach(function (el) { if (el) el.classList.add("opacity-0", "pointer-events-none"); }); }
  var reasonCloseBtn = document.getElementById("reasonClose");
  if (reasonCloseBtn) reasonCloseBtn.addEventListener("click", closeReasonModal);
  if (reasonBackdrop) reasonBackdrop.addEventListener("click", closeReasonModal);
  if (reasonModal) reasonModal.addEventListener("click", function (e) { if (e.target === reasonModal) closeReasonModal(); });

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
    var keys = ["power", "hp", "atk", "def", "eva", "crit", "threat"]; // per-hero stored values (blank = inherits class avg)
    var lines = ["Name,Class,Party,Power,HP,ATK,DEF,EVA,CRIT,THREAT"];
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
  function applyClassCSV(text) { return parseClassTable(text, ","); }
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
    var n = applyClassCSV(text); setUpdate("Uploaded default-stats CSV (" + n + " classes)."); render();
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
    filtersBody.innerHTML = POWER_HEADER + 'Build filters</div>' +
      '<p class="text-xs text-textSecondary leading-relaxed mb-1"><b>Exclude</b> = never use. <b>Min</b> = require this many in the roster. <b>Max</b> = cap. Whole-roster; Min applies when generating (Top-up / Recommended), Auto Sort honors Exclude + Max.</p>' +
      header + rows;
  }
  if (filtersBody) {
    filtersBody.addEventListener("change", function (e) {
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
  function partyBestBarrier(p, hs) { var b = 0; for (var i = 0; i < BARRIERS.length; i++) { var s = barrierSum(p, hs, BARRIERS[i]); if (s > b) b = s; } return b; }

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
        for (var bi = 0; bi < BARRIERS.length; bi++) {
          var el = BARRIERS[bi];
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

  function autoScore(res) {
    var passers = 0, fullTeams = 0, margin = 0;
    for (var i = 0; i < state.parties.length; i++) {
      var p = state.parties[i], hs = res.assign[p.id], cap = partyCap(p);
      if (hs.length === cap) fullTeams++;
      var b = partyBestBarrier(p, hs);
      if (hs.length === cap && b >= BARRIER_POWER_TARGET) { passers++; margin += (b - BARRIER_POWER_TARGET); }
    }
    return passers * 1e9 + fullTeams * 1e5 + Math.min(margin, 90000);
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
