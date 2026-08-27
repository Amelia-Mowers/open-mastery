# Cairn — Architecture v0.9

*OpenMastery project. Supersedes v0.5. Resolves the v0.5 review, replaces per-student key wrapping with conventional at-rest handling, and resolves the v0.8 review (branch-specific BKT discount, corrective state machine, site-time stamping, version taxonomy, local HTTPS, LLM transcript policy). Device enrollment is auth, not presence enforcement.*

**Stack decision:** full TypeScript (client, core, server, pipeline). Runtime: **Bun** (single-file compile, built-in SQLite). No Rust for v1; core is pure functions over plain data so a wasm port stays a one-seam change.

**Process decision:** test-first, with end-to-end tests as the primary spec. See §10.

## 1. Goals and non-goals

**Goals**
- Self-hostable mastery learning engine for K-12 (math first), used in a room with a human guide present. Each site runs its own server (a Raspberry Pi with a wifi router and solar/battery, a laptop, or a hosted instance); clients are thin. Classroom wifi is assumed reliable; internet is not.
- Cairn delivers **initial instruction**, practice, mastery tracking, and spaced retention — not just homework/review.
- Vetted curriculum is the source of truth; the LLM is an upgrade layer (explainer, grader, conversion pipeline), never primary instruction.
- One structured item record feeds widgets, grading, visualization, explanation, hints, and the mastery model.
- Curriculum is a separate CC BY repo derived from OER (OpenStax, Illustrative Math), authored as plain files under OpenMastery.
- Runs on a Raspberry Pi server; clients are any browser on any device, including a 2015 Android phone.
- Same code serves one room, one school, or thousands of hosted sites: **single-tenant by construction, multi-tenant by process.**

**Non-goals**
- Replacing the guide; behavioral surveillance (camera, eye tracking, keystrokes outside widgets).
- **Homework / at-home mode.** Not supported or designed for; the product assumes a guide present. Not structurally prevented either — device enrollment is an auth control, not a presence check.
- Being an LMS (forums, attendance, file submission, full gradebook). Cairn launches from and reports to an LMS.
- Content generation as primary instruction.
- Reading/phonics in v1.

## 2. Naming and repos

- **OpenMastery** — org, brand, openmastery.io. Holds curriculum and schema. Intended home: foundation/fiscal sponsor.
- **Cairn** — the engine (client + server + core).
- Repos: `openmastery/cairn` (AGPL), `openmastery/schema` (MIT), `openmastery/curriculum` (CC BY).

## 3. System overview

```
┌──────────────────────── Clients (PWA, thin) ─────────────────────────────┐
│ Widget layer · explanation player · guide dashboard · parent report      │
│ Ordered outbox (per-device seq) to survive wifi blips — no merge logic   │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ classroom wifi (assumed reliable)
┌──────────────────────────────────▼────────────────────────────────────────┐
│ Site server (Bun + SQLite, single binary; Pi / laptop / hosted)           │
│  Core: schema, graders, BKT + FSRS, selector, corrective policy           │
│  Append-only event log (single writer: server assigns order)             │
│  Curriculum bundles · auth · read models · export/deletion · LLM gateway │
│  Site↔cloud sync (opportunistic) · LTI/OneRoster adapters (optional)     │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ internet, when available
┌──────────────────────────────────▼────────────────────────────────────────┐
│ OpenMastery cloud (optional): hosted site servers, network aggregation,  │
│  curriculum distribution, aggregate param fitting                        │
└──────────────────────────────────────────────────────────────────────────┘
      ▲ openmastery/curriculum (git, CC BY) → release bundles
```

**Invariants**
1. The **site server is the single authority** for student state and runs the scheduler. Clients render and submit; they never compute mastery. Event order is assigned by the server on arrival.
2. Corrective escalation is engine behavior, not a setting. Its constants are a **versioned policy module**, changed only by release.
3. No throughput targets or comparative rankings by default; dashboards surface exception signals.
4. Nothing unreviewed ships in a release bundle.
5. Everything except LLM features works with no internet; LLM features degrade gracefully (static hints/explanations, queued grading).
6. Guide in the room is a design assumption, not something the engine polices. Student sessions require guide-enrolled devices (auth), nothing more.
7. The LLM never grades a mastery check and never produces a check item.

## 4. Data model

Curriculum files are YAML/JSON validated by a published Zod → JSON Schema spec.

### 4.1 Skill
```yaml
id: alg1.linear.solve-one-step
name: Solve one-step linear equations
prereqs: [alg1.arith.inverse-ops, alg1.expr.evaluate]
standards: [CCSS.MATH.CONTENT.6.EE.B.7]
source: { book: openstax-prealgebra, section: "3.3" }
bkt_defaults: { L0: 0.3, T: 0.15, S: 0.1, G: 0.2 }
fluency: false
instruction:                      # ordered; first is the primary lesson
  - alg1.linear.solve-one-step.exp-balance
  - alg1.linear.solve-one-step.exp-inverse
  - alg1.linear.solve-one-step.exp-numberline
faded_examples: [..item ids..]    # partially-completed items for the lesson phase
# CI rule: every skill has ≥2 generator-backed, non-choice items eligible as check items.
```
Every skill has **at least two** explanations using different representations, so the corrective policy can present the material differently.

### 4.2 Item
```yaml
id: alg1.linear.solve-one-step.007
skills: [alg1.linear.solve-one-step]
difficulty: 2                      # v1: orders items within a skill only; not used in P(correct)
params: { a: 7, b: 21, variable: x }
generator: { a: {int: [2,12]}, b: {mult_of: a, range: [10,60]} }
widget: { type: equation-input, config: { allow_fraction: true } }
answer: { type: expr, value: "{variable} = {b/a}", equivalence: symbolic }   # templated; isomorph test depends on it
rubric: null                       # rubric items are practice-only; never check items
viz: { template: balance-scale, bind: { left: "{a}{variable}", right: "{b}" } }
hints:
  - "What operation undoes multiplying by {a}?"
  - "Divide both sides by {a}."
faded: null                        # or { reveal_steps: [1,2], student_completes: [3] }
source: { book: openstax-prealgebra, section: "3.3", exercise: 41 }
review: { status: vetted, by: "@handle", date: 2026-08-24 }
```

### 4.3 Explanation (timeline over widgets)
```yaml
id: alg1.linear.solve-one-step.exp-balance
skill: alg1.linear.solve-one-step
representation: balance-scale     # used to guarantee variety across correctives
widget: balance-scale
params_from: item
timeline:
  - { t: 0,   patch: { left: "{a}{variable}", right: "{b}" }, caption: "Both sides are balanced." }
  - { t: 2.5, patch: { highlight: left.coef }, caption: "{variable} is multiplied by {a}. Undo it by dividing." }
  - { t: 5,   patch: { op: divide, by: "{a}" }, caption: "Divide both sides by {a}." }
  - { t: 7.5, patch: { left: "{variable}", right: "{b/a}" }, caption: "{variable} = {b/a}." }
  - { t: 9,   handoff: { prompt: "Now you try." } }
review: { status: vetted }
```
Captions are source of truth; TTS optional and on-device. Generated explanations use the same schema and are promoted after review.

### 4.3a Templating: `cairn-expr`
All `{...}` templates in items, hints, viz bindings, answers, and timelines use one mini-language defined in `openmastery/schema` and shared by pipeline, core, and widgets:
- Arithmetic over params with **exact rationals**; comparison; a fixed function set (`frac`, `gcd`, `round`, `abs`, `min`, `max`).
- Generator constraints (`int`, `range`, `mult_of`, `coprime`, `distinct`) are part of the same spec.
- Explicit rendering rules: `1x → x`, `+ -3 → − 3`, fraction vs. decimal display from a per-item flag, sign normalization.
- No arbitrary code; evaluation is total and side-effect free.

**Item and skill IDs are immutable and never reused.** Renames are new IDs with a `supersedes:` pointer; curriculum CI diffs against the previous release.

### 4.4 Widget contract
```ts
interface Widget<P, A> {
  render(params: P, mode: 'lesson' | 'faded' | 'problem' | 'review'): Component
  extract(): A                     // structured answer
  trace(): Event[]                 // process log
  applyPatch(patch: Patch<P, V>)   // explanation timelines; V = typed view state (highlight, op), separate from params
  a11y: { role: string; label(params: P): string }
}
```
Widgets are pure over `params` and render `V` view state on top; grading lives in core. First-class, not Perseus; Perseus item JSON is an import source and KAS-style expression equivalence is reused as a library.

### 4.5 Organization model
```
Site (school / center / tutor)  ──┬── Class ──┬── Enrollment ── Student
                                  └── Staff (guide | admin | owner)
Network (optional)  ── many Sites            # multi-site aggregation for networks/franchisor
```
Modeled from day one even for a single tutor, so OneRoster import is a mapping.

### 4.6 Identity
```ts
User { id, role, siteId }
Identity { userId, provider: 'local' | 'class_code' | 'google' | 'microsoft' | 'lti', externalId }
```
- Students: handle + PIN/picture password, or class code. No email required.
- Staff: password, optional Google/Microsoft OIDC.
- LTI launches create or link an `lti` identity.

### 4.7 Student state and events
```ts
type MasteryState = Record<SkillId, {
  p: number; attempts: number; lastCorrect?: number;
  phase: 'unseen' | 'lesson' | 'faded' | 'practice' | 'mastered';
  fsrs?: { stability; difficulty; due };
}>

// Envelope on every event
type Envelope = { siteSeq: number; deviceId: string; deviceSeq: number; coreVersion: string; bundleVersion: string; studentId: string; t: number }
// siteSeq: assigned by the site server on ingest (single writer); the total order.
// (deviceId, deviceSeq): makes client retries idempotent.
// t: SITE TIME, stamped by the server at ingest. Folds read t and never query a clock. state = fold(core, events by siteSeq).

type Event = Envelope & (
  | { kind: 'attempt', itemId, answer, correct, hintLevel: number, latencyMs, assisted: boolean, trace? }
  | { kind: 'explanation_viewed', explanationId, completed, representation }
  | { kind: 'hint', itemId, level }
  | { kind: 'llm_help', itemId, turnCount }             // marks the item assisted; NO transcript in the student log
  | { kind: 'mastery_granted', skillId, checkItemIds }  // explicit fact; survives model retuning
  | { kind: 'mastery_lapsed', skillId }                 // failed FSRS review
  | { kind: 'signal', signal: 'idle' | 'focus_lost' | 'focus_gained' | 'pace', value? }  // raw, from client
  | { kind: 'guide_flag', reason: FlagReason, skillId? }// emitted by server; FlagReason frozen at build step 2
  | { kind: 'guide_intervention', note? }
  | { kind: 'session', phase: 'start' | 'end' }
  | { kind: 'clock_set', wallclock: number, source: 'rtc' | 'ntp' | 'guide' }  // site time corrections (see §7)
  | { kind: 'student_deleted' }                         // audit marker carrying the opaque student id; rows removed locally and, on sync, at the replica
)
```
`p` is a read model and may shift when BKT parameters are retuned; mastery is an event and does not. The fold tolerates `siteSeq` gaps (deletion). `assisted` is scoped per (student, itemId, paramHash). FSRS due values are expressed in the site-time coordinate of `t`. The fold does not read policy constants, so policy changes never alter replayed state.

**Version taxonomy for `coreVersion`:**
- *Parameter changes* (BKT/FSRS numbers): read models may shift on rebuild; no migration.
- *Reducer/schema changes*: reducers are versioned; a migration is an explicit replay of the immutable log under reducer N; never edit events.
- *Policy/selector changes*: affect future decisions only; never touch the fold.

## 5. Core (pure functions)

**Per-skill sequence.** `lesson` (primary explanation) → `faded` (worked examples with student-completed steps) → `practice` → mastery check on an **unassisted isomorph**. On mastery, skill enters FSRS review.

**Graders.** numeric (tolerance, units), symbolic expression equivalence, set/order, choice, and `rubric-route` returning `needs_llm` (queued when offline or low confidence). Rubric-graded attempts are practice-only: they update `p` at the hint-level-1 discount and are never check items.

**Mastery model.** BKT per skill. Assistance discount is **branch-specific** (inflating `G` in both branches would weaken negative evidence):
```
correct, hint level k:   post = p(1−S) / (p(1−S) + (1−p)·G_eff),  G_eff = 1 − (1−G)·0.5^k
incorrect (any k):       post = pS / (pS + (1−p)(1−G))            // base G, base S
then                     p' = post + (1−post)·T
```
Correct-with-help carries reduced evidence; wrong-with-help is full negative evidence. `faded` completions are heavily assisted by construction (the walkthrough plays every step but the last), so a correct faded attempt updates `p` at the hint-level-2 (maximal-assistance) discount regardless of hints revealed; a wrong one is still full negative evidence. Like the `0.5` halving, this is part of the model formula the fold replays, not policy. The mastery **check** is *offered* when `p ≥ 0.9` or after 3 consecutive unassisted correct; **passing 2 unassisted isomorphs from two distinct base items grants mastery regardless of `p`** (emits `mastery_granted`, sets `p ≥ 0.95`). Assisted attempts never satisfy the check. This is a deliberately thin bar; FSRS review is the intended safety net for false positives.

**BKT → FSRS handoff.** On mastery the skill enters FSRS. Review outcome → rating: wrong → *again*; correct with hint or latency > 1.5× skill median → *hard*; correct unassisted → *good*; correct unassisted, fast, first try → *easy*. A failed review emits `mastery_lapsed`, demotes phase to `practice` (not `lesson`), sets `p = 0.7`, and requires a fresh unassisted check to re-master.

**Item selector.** Eligible = unmastered skills with prereqs mastered ∪ FSRS-due. Interleave ~1 review per 3 new items; target 70–90% expected correctness in `practice` and `review` phases only (lesson/faded are exempt), where in v1 expected correctness is the per-skill BKT prediction (no per-item term; `difficulty` only orders items within a skill); avoid recent items. **Scheduling is blocked acquisition, interleaved consolidation**: the selector stays on one skill through its lesson, faded phase, and a short opening practice run (novices benefit from a brief blocked run), then every serve re-ranks with band ties going to the least-recently-served skill — interleaved practice across the working set improves delayed retention and strategy *selection* (blocked practice gives the method away and inflates in-session accuracy, which also inflates `p`). A working-set cap (policy `maxActiveSkills`) keeps breadth from becoming a lesson avalanche: no new skill starts while the cap's worth are already underway. Runtime isomorphs come **only** from `generator` (total, grader-verified). LLM isomorph drafting is pipeline-only. Check items are generator-backed, non-choice widgets.

**Corrective policy (invariant), as a state machine over consecutive misses on a skill within a session:**

| consecutive misses | action before next item |
|---|---|
| 1 | hint level 1 offered on the next item |
| 2 | alternative explanation with a `representation` not yet viewed, then a new item |
| 3 | prerequisite probe (items from the weakest unmastered-or-lapsed prereq) |
| — | at **6 attempts** on the skill this session: park the skill, emit `guide_flag` |

A correct unassisted answer resets the miss counter; a correct assisted answer does not.

Accounting rules: hints do not consume attempts; attempts on a prerequisite probe count only against the prerequisite skill; "same item" for never-re-serve is (itemId, paramHash), so a fresh isomorph is a different item but still counts toward the skill cap.

Constants live in `core/policy/v1` as a versioned module — not config (operators can't weaken it), not magic numbers (a later release can ship `policy/v2`). Events record `coreVersion`; because the fold ignores policy, changing constants is a release with no replay consequences. With ≥2 explanations per skill and the lesson consuming one, the corrective path has exactly one alternative before the prerequisite probe; this is a deliberate v1 trade against explanation-authoring cost.

**Guide signals.** Clients emit raw `signal` events (idle, focus, pace); the **server** combines them with the log (stuck duration, hint-rate spike, guess-speed latency, prerequisite failure) and decides what becomes a `guide_flag`. Latency thresholds use per-skill defaults from the bundle until a site has 30 attempts on the skill, then the site median.

## 6. Client

- PWA, React + TypeScript, Tailwind; installable so the shell loads instantly; all **authoritative student state** lives on the site server (the device holds only the outbox).
- **Thin:** renders items/explanations from bundles served by the site server; submits events; receives next item from the server. Small ordered outbox (per-device seq) exists to **prevent data loss** during a wifi blip, not to make blips seamless; a blip stalls the next-item fetch and that is accepted. No prefetch.
- Explanation player: scrub, pause, interact mid-timeline, handoff to faded/practice.
- Accessibility: WCAG 2.1 AA from first widget; keyboard and screen-reader paths per widget; RTL/IME via browser.
- **Device enrollment (auth):** a guide enrolls each device once (QR from the guide dashboard → device token; on offline sites this step also installs the site CA, see §7). Student class-code + PIN logins are accepted only from enrolled devices. This limits the brute-force surface; it is not a presence check.
- **Shared devices:** switching students is class-code + PIN against the site server. **Flush-before-switch:** the outbox must drain before a new student can log in; if it can't, the switch is blocked with a guide-visible message.
- Target devices: a 2015-era Android phone with its shipped browser is in CI from step 1; the explanation player's SVG patching is the known risk.
- Roles in the same client: student, guide (dashboard), site admin, network admin (aggregate only).
- Parent report: monthly, generated from the log — skills mastered, Cairn sessions participated in (not institutional attendance), guide interventions. No minutes on task.

## 7. Server

- Bun + SQLite; single-file binary or container; runs on a Pi 4. The same binary serves a room from a Pi, a tutoring center from a laptop, or a hosted site from the cloud. Code stays **Node-portable** behind the `SiteStore` adapter so the runtime is a one-seam swap if Bun on ARM proves unreliable unattended.
- Runs core: ingests events, assigns `siteSeq`, updates state, selects the next item, emits `guide_flag`s.
- Endpoints: curriculum bundles, event ingest, next-item, state, dashboard/report queries, export, deletion, auth.
- **Resilience / RPO:** the event log (source of truth) is continuously replicated to a second medium (USB); read models are snapshotted hourly and rebuilt on restore. Target RPO is seconds. Litestream-style WAL shipping is an acceptable implementation, not a requirement. Any laptop can restore and take over as the site server; curriculum is static so replacement is restore-and-restart.
- **Time:** ordering never depends on wall-clock (`siteSeq`). The server maintains **site time** = last `clock_set` + monotonic elapsed, and stamps every accepted event's `t` with it at ingest; folds consume `t` and never a clock, so replay is deterministic on any machine. Corrections (RTC at boot, NTP when reachable, guide-supplied hint) are `clock_set` events that govern only future stamps. After a restore the server resumes from the last event's `t` plus a fresh correction. Backward corrections are rejected by a monotonic guard; a forward jump cannot flood reviews because the interleave ratio bounds reviews per session. Reference BOM includes an RTC module.
- **Platform note:** Bun requires 64-bit Raspberry Pi OS (linux-aarch64); the 32-bit image will not work.
- **Local HTTPS / secure origin (step-1 spike; a known pilot risk).** PWAs, service workers, and sane token handling need a secure origin, and old Android trust stores plus a drifting RTC make certificates the likely failure. Two supported paths: (a) *cloud-assisted*: each site gets a name under `sites.openmastery.io` resolving to its LAN address, with a real certificate obtained and renewed via the cloud whenever the site has internet (Plex pattern); (b) *fully offline*: the server generates a site CA at first boot and device enrollment installs it. mDNS (`cairn.local`) for discovery in both. The RTC in the BOM exists partly so certificate validation doesn't fail on a cold boot.
- **Site↔cloud sync:** opportunistic push of the site log to the hosted service for backup, network aggregation, and cross-site transfer; pull of curriculum bundle updates. Cross-site student moves are an admin export/import.
- **LLM gateway (optional, online):** grounded explainer chat (source section as context), rubric grading with confidence, explanation drafting (pipeline). Provider abstraction: hosted API under no-training terms, or local model. Outbound requests carry item context and the student's typed text only; the gateway strips obvious PII patterns (names from the roster, phone/email shapes). **Transcripts are not part of the student event log**; `llm_help` records counts. Transcript retention is off by default, site-opt-in for guide review, short retention window.
- **LMS adapters (optional):** LTI 1.3 (launch, deep linking of *scopes*, NRPS roster, AGS mastery write-back). Deep links assign scopes (a unit or skill set), never deadlines; deadlines stay in the LMS. OneRoster CSV import; REST later.
- Multi-site: `Network` aggregates over sites; no per-student data crosses sites by default.

## 7a. Tenancy and deployment topologies

**Site is the hard boundary.** A site's entire state (roster, identities, event log, read models, config) is one SQLite file behind a `SiteStore` interface. Core and every endpoint operate on exactly one `SiteStore`; there is no cross-site query path in the engine. Consequences: export = copy the file, delete = delete the file, restore = drop the file in, and isolation bugs have no table to leak through.

**Topologies, same binary:**
- *One Pi per room:* one process, one `SiteStore`. Rooms in the same building without shared wifi are separate sites under a `Network`.
- *One server per school:* one process, one `SiteStore`, many classes.
- *Hosted:* one process (or a small pool) opens N `SiteStore`s routed by site id/hostname — SQLite-per-tenant. Thousands of small sites fit on one box; no per-tenant containers.

**Aggregation is a separate service.** Network dashboards, cross-site reports, and `fit-params` consume site logs via site↔cloud sync into a network-scoped store (Postgres is fine here). Core never reads from it; it holds derived, anonymized, or network-scoped data only. This is where the managed-database convenience lives, deliberately away from student event logs.

**Rejected:** a single shared Postgres schema for all sites. Isolation would become a `WHERE site_id` discipline on every query, per-site backup/restore/deletion would stop being primitives, and Pi and cloud would diverge into two storage backends.

## 8. Curriculum repo and pipeline

```
curriculum/
  skills/ items/ explanations/ templates/ standards/ sources/
  pipeline/
    extract-skills.ts     # OER sections → skill candidates + prereq edges
    convert-items.ts      # OER exercises → item schema
    gen-explanations.ts   # skill → timeline drafts (LLM), tagged by representation
    fit-params.ts         # BKT/difficulty from aggregate anonymized events
    review/               # human review; promotion to vetted
```
- CI validates schema and enforces: every skill has ≥2 vetted explanations of distinct representations before release.
- **The skill graph derives from the standards layer, not from any textbook's structure.** CCSS-M IDs are the node vocabulary (every skill carries `standards:`); the Coherence Map's prerequisite arrows are the default backbone; the Progressions documents supply the decomposition rationale and the expected representations per standard (the widget backlog). Textbooks are reference implementations consulted for representation choices and mined (CC BY-pinned editions only) for diagrams — a route that also sidesteps their NC relicensing entirely, since the standards layer has no license baggage that matters (standard IDs and concepts are facts; widget concepts are unprotectable methods of instruction). Item authoring follows: parameterized templates with computed, verified answers — the LLM drafts templates, never asserted answer keys. Details: `curriculum/sources/standards/SOURCES.md`.
- **Content licensing policy: the catalog is CC BY 4.0 only; NC-licensed OER is excluded outright.** NC binds the end licensee, and for-profit tutoring centers are a core deployment (§4.5), so an NC track would split the catalog into schools-only content — parity drift plus a liability trap for a center that loads the wrong bundle. Both pillar sources have relicensed their current editions (OpenStax → CC BY-NC-SA, 2025–26; IM v.360 → CC BY-NC, 2024); derivation is pinned to the last CC BY 4.0 revisions (OpenStax pre-relicense commits; IM first edition © 2019–2021), which remain CC BY irrevocably. The engine's licenses (AGPL/MIT) restrict nothing commercially — this is purely a content lane. A site needing post-relicense editions negotiates with the publisher directly; OpenMastery does not intermediate.
- First content target: **one OpenStax chapter** (linear equations), hard-capped for the pilot. Review hours per vetted explanation **and widget count needed per skill** are tracked metrics; no course-level commitment until measured. Widgets may gate course scale before review hours do. Rough scale for planning: an Algebra 1 course is ~150–250 skills → 300–500 reviewed timelines.

## 9. Privacy and safety

- School-owned accounts; the site is the data controller. No ads, analytics SDKs, or data sale.
- Data minimization: student handles, no email; guides map identities locally.
- Export and deletion are first-class. Deletion removes the student's rows at the site and in the cloud replica; backups age out on a stated 30-day window; a `student_deleted` audit marker remains. That is what "deleted" means, and it is documented for operators.
- **Encryption and custody (threat model: leaked hosted database, lost or stolen site hardware — not nation-state).** On a self-hosted Pi, a key stored on the same SD card would be theater, and Bun's SQLite has no SQLCipher; so **stolen site hardware is covered by data minimization, not crypto**, and the doc says so. Optional hardening in the reference BOM: LUKS full-disk encryption with a USB keyfile. Hosted replicas use provider disk encryption plus KMS-held keys, access control, and audit logging. OpenMastery can read hosted and replicated data; that is what enables recovery of a dead site without a passphrase and network-level analytics. Rejected: per-student key wrapping with a school-held passphrase — realistic catastrophic loss (lost passphrase + dead Pi) outweighs the breach it prevents for low-sensitivity data, and it makes aggregation impossible. Customer-managed keys are a possible later hosted tier for districts that require them.
- The primary privacy control is **data minimization**: a leaked Cairn database is handles and item attempts; the handle→child mapping lives with the site.
- Aggregate exports for `fit-params.ts` are per-skill/per-site counts with no student identifiers and a k ≥ 20 threshold per cell; sites opt in. Aggregates are **materialized, dated snapshots** taken before any deletion; reruns after deletions may differ and are not expected to match.
- Parent report shows sessions attended and skills mastered; it does not report minutes on task (throughput-adjacent).
- Interaction logs only. No camera/eye tracking.
- LLM to students: explain, hint, diff against solution. Never assigns, gates, or grades mastery.
- Invariants in §3 are code, not config; the operating-model license restates them.
- Licensing note: AGPL on the engine obliges sharing only *modifications* that are distributed or offered as a service; unmodified self-hosting carries no obligation. Curriculum and schema are permissive.

## 10. Testing strategy

Tests are written before implementation and double as the executable spec. Three layers.

**Synthetic-student simulations (Vitest) are the fast executable spec.** Student models (always-correct, always-wrong, guesser, slow learner, hint-dependent) drive core end to end in milliseconds; every invariant and pedagogy rule has a simulation assertion here first.

**End-to-end (Playwright).** One scenario per invariant, kept small to stay fast and stable. Each scenario runs the real PWA against the real server (or fully offline) with a fixture curriculum, and drives it as a student or guide. Scenarios are derived directly from the invariants and the pedagogy commitments:
- Student completes lesson → faded → practice → unassisted isomorph → skill marked mastered; FSRS due date set.
- Student uses LLM help on an item → that item never counts toward mastery; a later unassisted isomorph does; the event log contains no transcript.
- Mastery check passes only with two unassisted successes from distinct base items.
- Corrective state machine: miss 1 → hint offered; miss 2 → unseen-representation explanation; miss 3 → prerequisite probe; 6 attempts → parked + flagged; the same (itemId, paramHash) is never re-served.
- Persistent failure → prerequisite probe → `guide_flag` appears on the guide dashboard; guide resolves it → `guide_intervention` in the log and on the parent report.
- No internet: site server with cloud unreachable runs a full session; later cloud sync uploads the log once; hosted replica matches.
- Wifi blip: client loses the site server mid-attempt; outbox retries; no lost or duplicated events (device seq idempotence).
- Shared device: two students alternate on one tablet; flush-before-switch enforced; both logs intact; no student data left on device.
- Server failover: restore last export on a second machine; clients reconnect; state matches.
- Hosted isolation: N sites in one process; a request scoped to site A can never observe site B's data (fuzzed).
- Deletion: student deleted → events unreadable on site and cloud replica; aggregate counts unchanged.
- Curriculum bundle update mid-session doesn't corrupt state.
- Accessibility: every widget scenario is also run keyboard-only and passes axe checks.
- LTI launch creates/links an identity and AGS write-back reflects mastery of the assigned scope only.
- Unenrolled device cannot start a student session; enrolled device can; enrollment revocation takes effect.
- Secure origin: PWA installs and service worker registers against a Pi over LAN on the target Android device, via both HTTPS paths.
- Rubric-graded item never appears as a check item; runtime isomorphs are always generator-derived.
- Restore from cloud replica onto a fresh machine succeeds with operator credentials alone.
- Deleted student's rows are absent at site and replica; audit marker present; previously materialized aggregates unchanged.

**Core (Vitest, property-based with fast-check).** Pure functions, so exhaustive:
- BKT/FSRS update invariants (monotonicity, bounds, idempotent replay by `siteSeq`); assisted-correct is weaker evidence than unassisted-correct; assisted-incorrect equals unassisted-incorrect.
- Mastery stability: retuning BKT parameters never revokes a `mastery_granted`.
- Hint-dependent student cannot be trapped below the check threshold (gate decoupled from `p`).
- Check items are non-choice; guess-through on a 2-item check is bounded by grader tolerance, not option count.
- Assisted flag is per (student, itemId, paramHash): a fresh isomorph is unassisted; a skill never runs out of check items.
- FSRS rating mapping and lapse demotion.
- `cairn-expr`: parser/evaluator property tests; generator always yields items whose templated answer the grader accepts.
- Graders: equivalence classes for expressions, tolerance for numerics, isomorph generator always yields items the grader accepts its own answer for.
- Selector and corrective policy — bounded loops (3-miss escalation, 6-attempt cap), prereq ordering, interleaving ratio, representation variety; accounting rules (hints free, probe attempts scoped to prereq, isomorph is a new item but counts to cap).
- Site time: fold reads only `t`; replay on a second machine yields identical state; forward jump does not exceed per-session review bound; backward correction rejected.
- Reducer versioning: replay under reducer N+1 is an explicit migration; events are never rewritten.
- Schema: every curriculum file in the repo validates; every skill has ≥2 vetted explanations of distinct representations (this is the repo's CI gate too).

**Widgets (component tests).** Each widget: render from params, extract structured answer, apply timeline patches, a11y roles/labels, keyboard operation.

**Rules.** A feature starts with an E2E scenario and a failing core test. Synthetic-student simulations run in CI as regression on pedagogy behavior, not just code. Fixture curriculum is tiny and hand-authored; the real curriculum repo has its own CI.

## 11. Build order

1. Schema + validator; 3 widgets (numeric, expression, number line); 1 viz template; low-end device in CI; **local HTTPS spike on a Pi with a 2015 Android device.**
2. Core graders, BKT, selector, corrective policy, `cairn-expr`; event envelope + fold; synthetic-student suite. **Freeze server-side `FlagReason` here.**
3. Convert one OpenStax section; end-to-end loop, client against a local site server (lesson → faded → practice → check).
4. Explanation player; 2 hand-authored explanations per skill for the pilot section.
5. Single-file Bun site server running core behind `SiteStore`; event ingest with `siteSeq`; client outbox; device enrollment + class-code/PIN auth; local HTTPS (both paths); hosted KMS at-rest encryption and optional LUKS in the BOM; deletion with backup aging; log replication and restore.
5a. Site↔cloud sync; hosted multi-`SiteStore` router; aggregation service.
6. Guide dashboard MVP (flags); parent report.
7. LLM gateway: grounded explainer, then rubric grader.
8. FSRS review; isomorph generation; pipeline tooling; Perseus importer.
9. Google OIDC for staff; OneRoster CSV.
10. LTI 1.3 when a customer needs it; network aggregation when a network does.

## 12. Open questions

- Multi-skill items: primary-skill-only for v1.
- Per-item difficulty in the model (IRT-lite or S/G modifiers): after pilot data exists.
- Fluency track as a mode vs item type.
- Voice input for "talk me through it": after the text loop is solid.
- Foundation vs company for the curriculum repo: recommendation is foundation from the start.
- Reference hardware kit (Pi + router + solar/battery) as an OpenMastery-published BOM.
