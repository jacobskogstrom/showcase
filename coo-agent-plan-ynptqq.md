# COO Agent — PLAN-01

**A supervisory layer that reads what every other agent, job, skill and session reports, verifies they actually did what they were told, keeps state on every finding, and escalates only what Jacob must decide.**

Status: proposal, not built. Written 2026-07-21.
Scope: all of `C:\Jacob\Claude code\` — AIOS, the 15 projects under `home\`, the 16 Personal AI Assistant silos, and the products built on top.

---

## 1. Why this exists — the case file

This plan was triggered by Jacob happening to notice `audits/architect/2026-07-21.md`. That report was excellent. Nobody was supposed to see it.

Three verified facts, gathered while writing this plan:

**a) The best report in the system has not been delivered in 59 days.**
`AIOS-architect-morning-brief` is a scheduled task that pushes the nightly architect TL;DR to Telegram at 08:00. There are 58 daily log files in `logs/`. **57 of them contain `FAIL`.** The only successful run was 2026-05-23. Every run since 2026-05-25 died with `.env.local not found` — secrets moved to SOPS-encrypted `.env.local.enc` and this one script was never updated. The nightly architect itself ran perfectly all 59 nights and wrote 57 reports. The delivery step failed silently every single morning and nothing anywhere noticed.

**b) Findings repeat forever because nothing holds state.**
From the 2026-07-21 report, verbatim: the unauthenticated `bypassPermissions` routes are *"still unadjudicated. Night two."* The dashboard test gate is *"still not self-applied. Night five."* PO Wiki2's three scripts that fail `ast.parse` are *"byte-identical"* to two nights ago. The architect is doing its job. There is no mechanism that turns a repeated finding into pressure.

**c) A whole night's work was lost to a 10-minute problem.**
`Bitesize-nightly-build` failed at 01:00 on 2026-07-21: `You've hit your session limit · resets 1:10am`. No retry, no backoff. Ten minutes of patience would have made it succeed.

Plus the standing structural gaps: exit codes are captured correctly by every scheduled task and **read by nothing automatic** (`/run tasks` exists but is pull-only, Telegram-triggered). 16 silos write logs no aggregation surface reads. The dashboard's in-process scheduler silently skips any night the process is down. `handover/` stopped 2026-05-28. `artifact-inventory` fired once on 2026-06-01 and never again. `TT-LinkedIn-Post` is registered in code and absent from Task Scheduler. ~250 log files with no rotation.

**The diagnosis is not "the agents are bad."** The agents are good. There is no closing mechanism. Work is produced, reported into a file, and the loop ends there.

---

## 2. What the outside world has learned about this exact problem

Researched 2026-07-21 across vendor engineering blogs, peer-reviewed papers, and ops practice. Full source list in §12. The short version:

### What works

| Finding | Source |
|---|---|
| Orchestrator-worker only when tasks are genuinely independent; every delegation carries objective, output format, tool guidance, task boundaries | Anthropic, *How we built our multi-agent research system*, 2025-06-13 |
| The one multi-agent pattern that consistently works is **a dedicated verification agent separate from the doer** — it needs minimal context transfer by nature | Anthropic, *When to use multi-agent systems*, 2026-01-23 |
| Verification tiers, in order: **deterministic rules → visual/artifact checks → LLM judge last** | Claude Agent SDK guidance, 2025-09-29 |
| Report **only the delta since last look**. Google killed its static-analysis dashboards because standing backlogs were ignored outright; findings on changed lines got acted on | Sadowski et al., *Lessons from Building Static Analysis Tools at Google*, CACM 2018 |
| Findings need identity and a lifecycle: fingerprint → new / ongoing / snoozed / **escalating** / resolved / **regressed**, snooze conditioned on recurrence not just time, auto-reopen on regression | Sentry issue-grouping and state docs |
| Absence of output must itself be alertable — schedule + grace period + failure tolerance + **minimum duration** ("exited too fast, likely failed") | Cronitor, healthchecks.io docs |
| The monitor needs its own dead man's switch routed out-of-band, or the monitor dying looks exactly like a quiet week | kube-prometheus Watchdog runbook |
| Every alert must pass the actionability test: *"If a page merely merits a robotic response, it shouldn't be a page"* | Google SRE Book, *Monitoring Distributed Systems* |
| Feed the supervisor a small curated structured digest, not raw logs — long contexts degrade non-uniformly and the middle gets lost | Chroma *Context Rot* 2025-07-14; Liu et al. *Lost in the Middle* 2023 |
| Keep a scheduled human review of a sample of raw traces; there is no free lunch on looking at your data | Hamel Husain, *Your AI Product Needs Evals*, 2024-03-29 |

### What fails

| Finding | Source |
|---|---|
| **LLM-as-judge as the operational gate.** Production study: the judge flagged **0 of 100 rounds** while human review confirmed 23 distinct defects; caught 2 of 9 defect patterns. Conclusion: *"automated judging is a regression floor, not a substitute for human review"* | Zhang et al., arXiv 2026-06-09 (preprint) |
| **Intrinsic self-correction.** *"LLMs struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction"* | Huang et al., ICLR 2024 |
| **Verification agents marking work passed without checking.** Named failure mode by the vendor | Anthropic, 2026-01-23 |
| Judge bias is systematic, not noise — position bias confirmed across 15 judges, 22 tasks, 150k instances | Shi et al., AACL 2025 |
| **Read-only nagging.** Automated dependency-upgrade PRs: only **32% merged**. Authors named the residual problem "notification fatigue" | Mirhosseini & Parnin, ASE 2017 |
| Findings above ~10% **effective false positive** rate (defined as "the human took no action") get the whole tool dismissed. Google targets under 5% | Google, CACM 2018 |
| **Splitting agents by task type** (plan / test / review) creates coordination overhead and telephone-game information loss | Anthropic, 2026-01-23 |
| Parallel agents without shared traces make conflicting implicit decisions; the combiner inherits both mistakes | Cognition, *Don't Build Multi-Agents*, 2025-06-12 |
| Cost: multi-agent uses **3–10× the tokens** of single-agent, ~15× a chat turn | Anthropic 2026-01-23, 2025-06-13 |
| Runaway loops: "unaware of termination conditions" 12.4% and "step repetition" 15.7% of observed multi-agent failures across 1,600+ traces | MAST, Cemri et al., NeurIPS 2025 |
| Autonomy without a stop condition: Devin succeeded on 3 of 20 tasks, spent a day on an impossible one while hallucinating features | Answer.AI, 2025-01-08 |
| **"Fail-plausible"** — the agent narrates a fluent, wrong success story. In a longitudinal study of a running personal assistant, **~70% of silent failures were caught by a human noticing**, not by automation. Discovery latency 13 hours to 60 days | Wu, arXiv 2026-06-12 (preprint) |
| Cron/heartbeat monitors tell you something exited zero on time. They say nothing about whether the output was correct | Cronitor, healthchecks.io |

### The three rules that decide this design

1. **The COO is mostly code, not a model.** Detection, dedupe, state, thresholds and routing are deterministic. The model is used only for judgment that rules cannot express. This inverts how "AI agent" projects usually get built, and it is what the evidence says.
2. **The COO can escalate and can propose, but it cannot close.** A model saying "looks fine" is a regression floor, not a gate. Only a human action, or a deterministic re-check, closes a finding.
3. **Silence is the primary failure mode, so silence must be loud.** The 59-day failure produced no error anyone saw. Absence of expected output is a first-class alert.

---

## 3. What the COO agent is — and is not

**Is:**
- A daily verifier that every declared job ran, on time, exited clean, and produced a real artifact.
- A ledger that gives every finding a stable identity, a state, an age, and a closure record.
- A triage layer that decides: escalate now / digest / auto-fix / snooze / drop.
- A single escalation voice with three severity lanes instead of one undifferentiated Telegram firehose.
- The thing that would have caught all three case-file failures on day one.

**Is not:**
- Not a code fixer. It never spawns an unsupervised agent with elevated permissions — that is literally the highest-severity finding in the current architect report.
- Not a second architect. The architect reviews projects; the COO reads the architect's output and tracks whether anything happened. No duplicated review work.
- Not a dashboard. Dashboards of standing findings get ignored (Google's own evidence). The COO pushes deltas.
- Not a summarizer that replaces the source. Every escalation links to the raw artifact. Compaction loses the detail whose importance surfaces later.
- Not a new consolidation store competing with the 3007 Core. `data-map.md` parks that until week 32 (Aug 3+). The COO's ledger is designed to be absorbed by the Core, not to fight it — see §8.

---

## 4. Architecture — five layers, only one of them is a model

```
┌──────────────────────────────────────────────────────────────┐
│ L0  JOB REGISTRY  (the missing manifest)                     │
│     references/job-registry.json                             │
│     One entry per job: schedule, grace, artifact contract,    │
│     min size, severity ceiling, owner project, retry policy   │
└──────────────────────────────────────────────────────────────┘
                            │  declares
                            v
┌──────────────────────────────────────────────────────────────┐
│ L1  SWEEP  (deterministic, zero tokens)                       │
│     scripts/coo-sweep.ps1  — hourly + 07:30 full pass         │
│     Reads: Task Scheduler state/exit/last-run, filesystem     │
│     mtimes + sizes, git status, port/heartbeat state, silos   │
│     Emits: raw observations -> ledger                         │
└──────────────────────────────────────────────────────────────┘
                            │
                            v
┌──────────────────────────────────────────────────────────────┐
│ L2  FINDING LEDGER  (state, the thing that is missing today)  │
│     data/coo.db (SQLite) + data/coo-findings.jsonl (append)   │
│     fingerprint | state | first_seen | last_seen | count |    │
│     snooze_until | escalated_at | closed_by | closure_note    │
└──────────────────────────────────────────────────────────────┘
                            │  delta only
                            v
┌──────────────────────────────────────────────────────────────┐
│ L3  COO AGENT  (the only LLM in the stack)                    │
│     .claude/agents/coo.md, run once daily ~07:45              │
│     Input: NEW + CHANGED findings + today's report TL;DRs     │
│     Output: strict JSON triage. Advisory. Cannot close.       │
└──────────────────────────────────────────────────────────────┘
                            │
                            v
┌──────────────────────────────────────────────────────────────┐
│ L4  ESCALATION  (three lanes, budgeted)                       │
│     P1 push now | P2 08:00 digest | P3 Sunday review          │
│     scripts/coo-escalate.ps1 -> Telegram / calendar / todos   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ L5  WATCHDOG  — out-of-band dead man's switch on the COO      │
└──────────────────────────────────────────────────────────────┘
```

### The key design call: pull, not push

The obvious build is "instrument every producer to emit run events." That is the plan in `projects/aios-logging/PLAN-02.md` — and it is instructive that `scripts/aios_log.py`, `scripts/aios_log.ps1` and `scripts/logview.ps1` all **exist and have zero callers** (`grep -rl "Write-AiosLog\|aios_log"` matches only the loggers themselves; `logs/aios.jsonl` does not exist). The instrumentation plan shipped its helpers and stalled at the 18-touchpoints step. That is the same disease the architect names portfolio-wide: *"code is committed without ever being executed."*

**So Phase 1 requires zero changes to any producer.** Windows Task Scheduler already records state, last run time, next run time and last exit code for all 18+ tasks. The filesystem already records what was written and when. The COO reads those. Instrumentation comes later, only for what pull cannot see (in-process schedulers, chat-triggered skills, silo internals).

---

## 5. Layer 0 — the job registry

The single most valuable artifact in this whole plan, and the cheapest. Today nothing declares what is supposed to happen. Two schedulers (Windows Task Scheduler + the dashboard's in-process `lib/scheduler.ts`), plus chat-triggered skills, and no union.

`references/job-registry.json`, one entry per job:

```json
{
  "id": "architect-nightly",
  "owner": "AIOS",
  "kind": "scheduled-task",
  "handle": "AIOS-architect-nightly",
  "schedule": "daily 02:00",
  "grace_minutes": 120,
  "produces": {
    "path": "audits/architect/{date}.md",
    "min_bytes": 500,
    "must_contain": "## TL;DR",
    "max_age_hours": 26
  },
  "min_duration_seconds": 60,
  "retry": { "attempts": 2, "backoff_minutes": 20 },
  "severity_ceiling": "P2",
  "delivers_to": "architect-morning-brief",
  "notes": "Fans out project-reviewer subagents. Exit 2 = report written but <500B."
}
```

Fields chosen from evidence: `grace_minutes` and schedule-aware missing-job detection (Cronitor); `min_bytes` / `must_contain` because exit-zero says nothing about output correctness; `min_duration_seconds` catches the "exited too fast, likely failed" class; `retry` exists because of the Bitesize session-limit night; `severity_ceiling` caps how loud any single job can ever get; `delivers_to` makes the produce-then-deliver chain explicit, which is exactly the link that broke for 59 days.

Initial registry covers: 18 Windows scheduled tasks, the 2 dashboard in-process jobs, the 16 silo listeners, the 6 servers in `SERVERS.md` (which is itself stale — it misses ports 3007 and 8090 that `heartbeat.ps1` already monitors), and the artifact-producing skills (`trip-hunter`, `whats-trending`, `public-link`, `media`, `bitesize`, `contact-hub`).

**Registry drift is itself a check.** A task in Task Scheduler that is not in the registry = finding. A registry entry with no matching task (`TT-LinkedIn-Post` today) = finding.

---

## 6. Layer 1 — the sweep (deterministic, zero tokens)

`scripts/coo-sweep.ps1`. Runs hourly for liveness, full pass at 07:30 before the digest. Emits observations, never talks to Jacob directly.

Per registry entry, seven checks:

| # | Check | Catches |
|---|---|---|
| 1 | Task exists, is Enabled, `NextRunTime` is in the future | `TT-LinkedIn-Post` drift; disabled-and-forgotten |
| 2 | `LastRunTime` within schedule + grace | Missed nights; the dashboard's in-process scheduler skipping when the process is down |
| 3 | `LastTaskResult` == 0 | **57 days of morning-brief FAIL** |
| 4 | Expected artifact exists at the expected path for the expected date | Ran green, wrote nothing |
| 5 | Artifact ≥ `min_bytes` and contains `must_contain` | Truncated/empty output |
| 6 | Run duration ≥ `min_duration_seconds` | Instant-exit failures |
| 7 | Delivery chain: if `delivers_to` is set, that job also succeeded | **The exact 59-day gap** |

Plus five sweep-wide checks:
- **Freshness** on every report sink: `handover/` (stale since 2026-05-28), `audits/audit-*.md` (2026-05-21), `audits/artifact-inventory/` (fired once). Anything past its declared `max_age_hours` is a finding.
- **Silo liveness**: 16 listener tasks + their daily log mtimes. Currently invisible to every surface.
- **Repeat-finding extraction**: parse the architect report's `## TL;DR` and `## Open challenges` sections, fingerprint each item, and count consecutive nights. This is what converts "night five" from prose into a number that can escalate.
- **Registry drift** both directions.
- **Log growth**: ~250 unrotated log files across two projects. Rotate, and report the trend rather than each file.

Cost: zero tokens. Runtime: seconds. This layer alone would have caught every failure in §1.

---

## 7. Layer 2 — the finding ledger (where state lives)

The single biggest structural gap today: **no finding has an identity.** The architect re-derives everything nightly from scratch, so "night two" and "night five" are prose the author noticed, not data the system holds.

`data/coo.db`, table `findings`:

| Column | Purpose |
|---|---|
| `fingerprint` | Stable hash of (source, job_id, check_type, normalized subject — e.g. `file:line` or task name). Same defect ⇒ same fingerprint across runs. |
| `state` | `new` → `ongoing` → `snoozed` / `escalating` / `resolved` / `regressed` (Sentry's lifecycle, adopted wholesale) |
| `severity` | P1 / P2 / P3, capped by the job's `severity_ceiling` |
| `first_seen`, `last_seen`, `occurrences`, `consecutive_runs` | Aging. Drives auto-escalation. |
| `snooze_until`, `snooze_reason`, `snooze_escape` | Snoozes **expire** and carry an escape trigger (occurrence count or severity bump). Never a silent "hide forever" — Google removed user-level suppression because it hid real bugs. |
| `escalated_at`, `escalation_count` | Feeds the false-positive metric |
| `action_taken`, `closed_by`, `closed_at`, `closure_note` | **Closure tracking.** Nothing in any observability tool records whether a human acted. This field is how §11's metrics get measured. |
| `source_ref` | Path + line into the raw artifact. Always. Never summary-only. |

State transitions, all deterministic:
- Present in sweep, unknown fingerprint → `new`
- Present again after 7 days → `ongoing`
- `consecutive_runs` crosses the job's threshold (default 3) → `escalating`, severity +1
- Absent from a sweep that would have detected it → `resolved` (auto, by evidence — not by a model's opinion)
- Previously `resolved`, reappears → `regressed`, severity +1, always escalates
- `snooze_until` passes, or escape trigger fires → back to `ongoing`

Under this model, the `bypassPermissions` finding would have hit `escalating` on night three, and the dashboard test gate would be P1 by now.

---

## 8. Storage decision — and the constraint that shapes it

`references/data-map.md` carries a hard constraint: **do not build a competing consolidation before Aug 3 (week 32).** The 3007 SQLite Core is the designated unified layer; migration is parked.

Resolution:
- The COO ledger is **operational state, not knowledge** — it is closer to a monitoring store than to the Core's contacts/tasks/decisions domain. Building it does not fork the knowledge layer.
- It lives at `home/AIOS/data/coo.db` with a mirrored append-only `data/coo-findings.jsonl` so nothing is trapped in a binary format.
- The schema is deliberately Core-shaped (id, kind, state, timestamps, source_ref) so week-32 migration is an import, not a rewrite.
- `references/data-map.md` gets updated in the same change that creates the store, per its own rule.
- **This needs Jacob's explicit sign-off before Phase 2** — it is the one place this plan touches a parked decision. Listed in §13.

---

## 9. Layer 3 — the COO agent itself (the only model call)

`.claude/agents/coo.md`. Runs once daily, ~07:45, after the sweep and before the digest. Invoked by `scripts/coo-daily.ps1` via `run-detached-notify.ps1` (per the CLAUDE.md rule on long-running work).

**Input — deliberately small.** Context Rot and Lost-in-the-Middle both say a large dump degrades judgment. So the agent never reads raw logs. It gets:
1. New findings since last run (structured JSON from the ledger)
2. State transitions (escalating / regressed / resolved)
3. The `## TL;DR` and `## Open challenges` sections of today's architect report — not the 400-line body
4. Yesterday's escalations and whether each has a recorded action
5. Open todos from `inbox/todos.md` that are linked to a finding

**Output — strict JSON, schema-validated, one object per finding:**

```json
{
  "fingerprint": "…",
  "verdict": "escalate|digest|autofix|snooze|drop",
  "severity": "P1|P2|P3",
  "one_line": "What broke, in Jacob's voice, no hedging",
  "why_now": "Why this needs attention today rather than next week",
  "next_action": "The single concrete step, or the exact command",
  "source_ref": "audits/architect/2026-07-21.md:19",
  "confidence": 0.0
}
```

**Hard limits on the agent, all evidence-driven:**
- It **cannot close** a finding. `resolved` is set only by the sweep failing to re-detect it, or by Jacob. (LLM-as-judge is a regression floor.)
- It **cannot lower** severity below the deterministic floor. It can only raise, or propose a snooze that Jacob confirms.
- It **cannot spawn** other agents, run code, edit files, or touch git. Read-ledger, write-triage. The system's own worst finding is unauthenticated agents with elevated permissions; the supervisor must not become another one.
- Every escalation carries `source_ref`. No claim without a link to the raw artifact.
- Bounded run: single pass, max token budget, hard timeout. No iterate-until-satisfied loop (12.4% of observed multi-agent failures are "unaware of termination conditions").
- If the agent fails or returns invalid JSON, the sweep's deterministic findings escalate **anyway**, unfiltered, with a note that triage was unavailable. The model is an improvement layer, never a dependency.

Cost estimate: one Sonnet-class call/day on a few KB of structured input. Rounding error next to the nightly architect fan-out.

---

## 10. Layer 4 — escalation policy

Today: everything is a Telegram text to one chat. A record-low flight price, a two-night-old security finding, and "no new jobs today" arrive identically. Three lanes instead:

| Lane | When | Channel | Budget |
|---|---|---|---|
| **P1 — now** | Security finding on an exposed surface; a job that has failed 3+ consecutive runs; a delivery chain broken >24h; a silo listener down; anything `regressed` | Telegram push, immediately | **Max 3/day.** Above that, they collapse into one grouped message. |
| **P2 — daily** | Everything else new or escalating | One 08:00 digest, merged with the architect morning brief so there is one morning read, not two | Max ~7 items; the rest roll to P3 |
| **P3 — weekly** | Ongoing, aging, drift, trends, closure stats | Sunday review note + a calendar block | Unbounded, because it is pull |

**The actionability test is enforced in code, not vibes.** Any escalation must have a non-empty `next_action`. No `next_action` ⇒ demoted to P3. This is the direct implementation of *"if a page merely merits a robotic response, it shouldn't be a page."*

**Grouping and inhibition** (Alertmanager's model): five findings from the same job in one sweep = one message. If a job is down, suppress its downstream artifact-missing findings — report the cause, not the symptom cascade.

**Reply-to-act.** Escalations arrive on Telegram with the fingerprint. Jacob replying `snooze 7d`, `fixed`, `not useful`, or `do it` writes straight back into the ledger via the existing listener. This is the closure signal, and without it §11 cannot be measured. It also converts a read-only nag into a one-tap action — the difference between the 32%-merge outcome and something that gets used.

**"Not useful"** is a first-class response. Three of them on the same check retires the check automatically. That is how the false-positive budget stays honest.

---

## 11. Metrics — how we know the COO is working, not just running

| Metric | Target | Why |
|---|---|---|
| **Effective false positive rate** = escalations with no recorded action within 7 days | **< 10%, aim < 5%** | Google's threshold. Above it, the whole tool gets tuned out. |
| Mean time to detect a silent failure | < 24h | Current baseline: 59 days. |
| P1 escalations per week | 0–5 | More means either the workspace is on fire or the thresholds are wrong. |
| Finding closure rate (30d) | > 60% | Detection without closure is the current state. |
| Findings aged > 14 days in `escalating` | Trending down | This is the "night five" counter, made visible. |
| Delivery-chain integrity | 100% | Every `delivers_to` verified daily. |
| COO token cost / month | < 5% of workspace spend | Supervisors cost 3–10× when built wrong. |

**Weekly human review is not optional.** ~70% of silent failures in the closest published study were caught by a human noticing, not by automation. The Sunday P3 note includes 3 randomly sampled raw run artifacts for eyeball review. Sampling rate can drop over time, never to zero.

---

## 12. Build phases

Each phase ships something usable alone and has a verification gate. No phase starts until the previous one's gate passes with evidence — this workspace already has enough shipped-but-never-executed code.

### Phase 0 — Registry + hard evidence (½ day, zero risk)
- Write `references/job-registry.json` for all 18 scheduled tasks + 2 in-process jobs + 16 silos + 6 servers.
- Write `scripts/coo-audit-once.ps1`: a one-shot read-only report of current state against the registry.
- **Gate:** the one-shot run independently rediscovers all three §1 failures without being told about them.

### Phase 1 — The sweep + ledger (2 days) — *this is where 90% of the value lands*
- `scripts/coo-sweep.ps1` (7 per-job + 5 global checks), `data/coo.db`, fingerprinting, state machine.
- One P2 digest per day at 08:00, merged into the architect morning brief. No model involved at all yet.
- **Gate:** 7 consecutive days of digests. Manually inject a failure (disable a task, truncate an artifact) and confirm detection within one sweep. Effective-false-positive rate measured, under 20% at this stage.

### Phase 2 — The COO agent + triage (1–2 days)
- `.claude/agents/coo.md`, `scripts/coo-daily.ps1`, JSON schema validation, P1/P2/P3 routing, the 3/day P1 budget.
- Requires: Jacob's sign-off on §8 storage.
- **Gate:** 14 days. Effective-false-positive rate under 10%. At least one P1 that Jacob agrees was worth the interrupt. Zero cases of the agent closing a finding.

### Phase 3 — Reply-to-act + closure loop (1 day)
- Telegram reply verbs wired into the ledger via the existing listener. `not useful` retirement. Snooze with expiry + escape.
- **Gate:** closure rate measurable and above 60% for 2 weeks. Retirement path exercised at least once.

### Phase 4 — Coverage extension (ongoing)
- Push instrumentation for what pull cannot see: revive the dead `aios_log` helpers for the dashboard in-process scheduler, chat-triggered skill runs, and silo internals. **Now** it is justified — the consumer exists, which it did not when PLAN-02 was written.
- Retry/backoff on the classes of failure that deserve it (session limits, transient network) — the Bitesize case.
- Silo coverage deepened for the Pocket Operator beta, where silos have external users.

### Phase 5 — Week 32 convergence (Aug 3+)
- Fold the ledger into the 3007 Core as an operational domain; surface it read-only on the `system` panel. Push stays the primary channel; the panel is for browsing, never the alerting mechanism.

---

## 13. Risks and how each is countered

| Risk | Counter |
|---|---|
| **The COO becomes the nag everyone ignores** — the single best-documented failure | Delta-only reporting; enforced actionability; hard P1 budget; measured false-positive rate; auto-retirement on 3× "not useful" |
| **The COO fails silently, exactly like everything else** | L5 watchdog: an out-of-band dead man's switch. If the daily digest does not arrive, something outside the COO says so. Silence in the monitor must not read as calm. |
| **It becomes a second unauthenticated agent with permissions** — the workspace's own top finding | The COO has no write access outside its own ledger. No git, no spawning, no code execution, no elevated agent. Read-and-report only. |
| **The model's judgment is trusted too far** | It cannot close, cannot lower severity, cannot suppress. Its verdict is advisory metadata on a finding that already exists deterministically. |
| **Cost creep** | Phase 1 is zero tokens. Phase 2 is one bounded daily call on a few KB. Token cost is itself a tracked metric with a ceiling. |
| **It duplicates the architect / dashboard / 3007** | It reads outputs, never re-reviews projects. It does not build a UI. §8 aligns the store with the Core rather than forking it. |
| **Registry rot** — the registry drifts from reality | Drift is checked in both directions daily and is itself a finding. |
| **Fingerprint churn** — small wording changes create "new" findings | Fingerprint on normalized structural fields (file:line, task name, check type), never on the prose sentence. Reviewed at the Phase 1 gate. |

---

## 14. How this sits in the whole system

**AIOS** — the COO is an AIOS-level service, like the heartbeat and the listener. It reads `audits/`, `logs/`, `inbox/`, `decisions/log.md` and Task Scheduler. It writes only to `data/coo.*` and (via escalation) to `inbox/todos.md`. It sits under the existing CLAUDE.md rules: never push to main, use `run-detached-notify.ps1` for long work, web links only on Telegram, ASCII-only PowerShell.

**The 15 home projects** — each is already reviewed nightly by the architect. The COO adds the missing half: whether anything happened afterwards. It never opens a project to review it itself.

**Products (Personal AI Assistant silos, Pocket Operator beta, Bitesize AI)** — this is where the gap is widest and the stakes are highest, because silos have *other people* using them. 16 listener tasks and their logs are invisible to every current surface. Phase 1 puts them under the same seven checks as everything else. For the beta, "a friend's assistant went down and nobody noticed" is a product failure, not a housekeeping one.

**Jacob's day** — one morning read at 08:00 (architect TL;DR + COO digest, merged), up to three interrupts a day when something genuinely needs him, one Sunday review. That is the entire surface. Everything else stays in the ledger until it earns attention.

---

## 15. Open questions for Jacob

1. **Storage sign-off (§8).** A COO ledger at `data/coo.db` before Aug 3 — acceptable as operational state, or wait for the Core? *Recommendation: build it; it is monitoring state, not knowledge, and the schema is migration-shaped.*
2. **P1 budget.** Three interrupts a day, or fewer? *Recommendation: start at 3, expect to end at 1–2.*
3. **Auto-fix scope.** Should the COO ever fix anything itself — even trivial things like log rotation or re-running a task that failed on a session limit? *Recommendation: no in Phase 1–3. Revisit at Phase 4 with a tight allowlist of idempotent actions.*
4. **The 08:00 slot.** Merge the COO digest into the architect morning brief (one read), or keep them separate? *Recommendation: merge. Two morning pushes is how the second one gets ignored.*
5. **Fix the fixable now, separately from this plan** — the morning-brief SOPS fix landed today but has not survived a real 08:00 run yet, and Bitesize still has no retry. Those are worth doing regardless of whether the COO gets built.

---

## 16. Sources

**Vendor engineering**
- Anthropic, *Building effective agents*, 2024-12-19 — anthropic.com/engineering/building-effective-agents
- Anthropic, *How we built our multi-agent research system*, 2025-06-13 — anthropic.com/engineering/multi-agent-research-system
- Anthropic, *When to use multi-agent systems (and when not to)*, 2026-01-23 — claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
- Anthropic, *Building agents with the Claude Agent SDK*, 2025-09-29 — claude.com/blog/building-agents-with-the-claude-agent-sdk
- Anthropic, *Effective context engineering for AI agents*, 2025-09-29 — anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Cognition (Walden Yan), *Don't Build Multi-Agents*, 2025-06-12 — cognition.com/blog/dont-build-multi-agents
- Answer.AI, *Thoughts on a Month with Devin*, 2025-01-08 — answer.ai/posts/2025-01-08-devin.html

**Papers**
- Cemri et al., *Why Do Multi-Agent LLM Systems Fail?* (MAST), NeurIPS 2025 — arxiv.org/abs/2503.13657
- Huang et al., *Large Language Models Cannot Self-Correct Reasoning Yet*, ICLR 2024 — arxiv.org/abs/2310.01798
- Zheng et al., *Judging LLM-as-a-Judge* (MT-Bench), NeurIPS 2023 — arxiv.org/abs/2306.05685
- Shi et al., *Judging the Judges* (position bias), AACL 2025 — arxiv.org/abs/2406.07791
- Lù et al., *AgentRewardBench*, 2025-04-11 — arxiv.org/abs/2504.08942
- Zhuge et al., *Agent-as-a-Judge*, 2024-10-14 — arxiv.org/abs/2410.10934
- Arike et al., *Goal drift in language model agents*, 2025-05-05 — arxiv.org/abs/2505.02709
- Liu et al., *Lost in the Middle*, 2023-07-06 — arxiv.org/abs/2307.03172
- Mirhosseini & Parnin, ASE 2017 (automated dependency PRs, notification fatigue)
- Sadowski et al., *Lessons from Building Static Analysis Tools at Google*, CACM 2018
- METR, *Measuring AI ability to complete long tasks*, 2025-03-19
- Chroma, *Context Rot*, 2025-07-14 — trychroma.com/research/context-rot
- Preprints, flagged as corroborative only: Zhang et al. arXiv 2026-06-09 (judge undercount); Wu arXiv 2026-06-12 (silent failures in a running personal-assistant agent); Gurram arXiv 2026-04-17 (error propagation ≈0.62)

**Ops practice**
- Google SRE Book, *Monitoring Distributed Systems* — sre.google/sre-book/monitoring-distributed-systems
- Prometheus Alertmanager (grouping, inhibition, silences, fingerprints)
- kube-prometheus Watchdog runbook (dead man's switch)
- Cronitor + healthchecks.io docs (schedule tolerance, grace, failure tolerance, minimum duration)
- Sentry docs (event grouping, issue states: new/ongoing/escalating/regressed/archived)
- Hamel Husain, *Your AI Product Needs Evals*, 2024-03-29 — hamel.dev/blog/posts/evals
- Barr Moses, *The Five Pillars of Data Observability*, 2020-12-04
- Gartner, 2025-06-25 (>40% of agentic AI projects canceled by 2027; poll-based, directional)

**Internal evidence gathered 2026-07-21**
- `audits/architect/2026-07-21.md` — the trigger for this plan
- `logs/architect-morning-brief-*.log` — 58 files, 57 containing `FAIL`
- `projects/aios-logging/PLAN-02.md` + `grep -rl "Write-AiosLog\|aios_log"` — helpers shipped, zero callers
- `Get-ScheduledTask` / `Get-ScheduledTaskInfo` — live task inventory and exit codes
- `STRUCTURE.md`, `references/data-map.md`, `references/naming-standard.md` — placement and naming constraints
