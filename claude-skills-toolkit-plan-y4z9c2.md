# Portable Skills Toolkit — Taking Home AIOS Skills Into Work/Consultant Sessions

**Date:** 2026-07-31
**Trigger:** Jacob starting consultant assignments (Reeinvent/ALMA via SC AB, from 2026-08-03) and wanting his proven personal skill library available in Claude Code sessions on client/work machines, without bringing home-specific data or PII along.

## 1. Problem

Home AIOS (`C:\Jacob\Claude code\home\AIOS`) has ~30 global skills in `~/.claude/skills/` plus project skills. Many are generically useful (dataviz, excalidraw, screenshot loops, git helpers, dev/brainstorm modes). Others are bound to home context: contacts, family, Telegram bot, price monitors, silos. A work Claude Code session on a client machine needs the first group, must never see the second.

## 2. Research: what already exists

**Claude Code's own plugin marketplace (native, already in daily use by Jacob).**
Plugins ship slash commands/skills, subagents, hooks, and MCP servers as one installable unit, installed with `/plugin marketplace add <repo>` then `/plugin install <name>@<marketplace>`. This is exactly how the current setup already gets `superpowers`, `caveman`, `clay`, and `claude-video` — confirmed from `~/.claude/plugins/known_marketplaces.json`:
- `superpowers-marketplace` → `obra/superpowers-marketplace`
- `caveman` → `JuliusBrussee/caveman`
- `clay-plugins` → `clay-run/agent-plugins`
- `claude-video` → `bradautomates/claude-video`

All are ordinary GitHub repos with a `.claude-plugin/marketplace.json` manifest. Private repos work the same way — auth rides on whatever git/`gh` credentials are already on the machine, no special plugin-marketplace auth layer.

**ClawHub (clawhub.ai) / clawskills.sh** — the official skill registry for OpenClaw agents, ~3,300+ skills, npm-style publish/install via CLI, semantic search. It's a *public discovery* marketplace for skills anyone can use — not a personal/private portability tool. Doesn't fit "move my own skills between my own machines without publishing them."
Sources: [ClawHub overview](https://felo.ai/blog/clawhub-skills-marketplace-claude-code/), [ClawSkills.sh](https://clawskills.sh/)

**Dotfiles-repo pattern** — the community-standard alternative for serious devs: treat `~/.claude/` (or a curated subset of it) as its own git repo, pull on the new machine, done. Examples: [zircote/.claude](https://github.com/zircote/.claude), [elizabethfuentes12/claude-code-dotfiles](https://github.com/elizabethfuentes12/claude-code-dotfiles) (auto-pull on open, auto-push on close via a shell wrapper). Simpler than plugins, but no install/uninstall granularity, no versioning, and easy to accidentally sync something you didn't mean to.

**What's reported as working vs. not, for real dev setups (2026):**
- Works: keep the portable skill set *small and curated* — commonly cited as 8–12 skills is what actually earns its keep daily; more than that just taxes context every session whether it helps or not.
- Works: version-pin via the plugin marketplace (each install records a version + git SHA) so a skill doesn't silently change under you mid-engagement.
- Doesn't work: syncing the whole `~/.claude` wholesale — drags in project-specific config, secrets, and irrelevant skills; also doesn't work: no sanitization pass before anything crosses a personal/client boundary — that's how PII or credentials leak into a client's machine.

Source for the pattern and the "8-12 skills" curation guidance: [Best Claude Code Skills 2026 roundups](https://www.developersdigest.tech/blog/best-claude-code-skills-2026), [Claude Code Plugin Marketplace Guide](https://www.agensi.io/learn/claude-code-plugin-marketplace-guide)

## 3. Recommendation

Build a **private GitHub repo, structured as Jacob's own Claude Code plugin marketplace** — not a dotfiles mirror, not a public ClawHub listing.

Why this over the alternatives:
- Native mechanism, zero new tooling — Jacob already installs plugins this way every day.
- Per-skill install/uninstall/version, unlike a dotfiles pull-everything mirror.
- Private repo means no public sanitization bar to clear (no "could this embarrass me if forked" risk) — just a personal-data bar, which is lower and easier to check mechanically.
- Superpowers itself (already installed) is the reference example of how a marketplace repo should be structured — copy its shape.

### 3.1 Repo shape

```
jacob-claude-toolkit/                  (private GitHub repo)
  .claude-plugin/
    marketplace.json                   (lists every plugin below, versions)
  dataviz/
    .claude-plugin/plugin.json
    SKILL.md
    references/palette.md
  git-flows/                           (git-this, git-dry bundled)
    ...
  dev-modes/                           (dev, bs)
    ...
  screenshot-tools/                    (screenshotHTML, screenshotWindow)
    ...
  ...
```

### 3.2 Candidate whitelist (port these)

`dataviz`, `excalidraw-diagram`, `simplify`, `screenshotHTML`, `screenshotWindow`, `dev`, `bs`, `git-this`, `git-dry`, `update-config`, `keybindings-help`, `security-review`, `claude-api` (reference), `lean-exploration`. Plus superpowers/caveman/clay stay as-is — they're already portable, just re-`/plugin marketplace add` them on the work machine directly from their public sources.

### 3.3 Exclude list (home-only, never port)

`contact-hub`, `wherefam`, `trip-hunter`, `price-monitor`, `family-budget`-adjacent skills, `bitesize`/`tellingtechnology`, `household`, `newsilo`, `restart-listener`, `status-silo`, `handover-desktop-app`, anything reading `inbox/people/*`, Telegram-listener-bound skills, `pp-contact-goat`.

### 3.4 Sanitization checklist (per skill, before it's copied in)

1. `grep -riE "jacob|skogstrom|c:\\\\jacob|@gmail|@skogstrom|\+46"` — zero hits, or parameterize what shows up.
2. No hardcoded absolute paths — anything path-like becomes a `$CLAUDE_PROJECT_DIR`-relative reference or an explicit arg.
3. No API keys/tokens/IDs — those stay in `.env` on the machine that needs them, never in the skill file.
4. Skill still makes sense with zero home-AIOS context loaded (no silent dependency on `connections.md`, `context/about-me.md`, etc.).

### 3.5 Work-machine install flow

```
gh auth login                                             (once, if not already)
/plugin marketplace add jacobskogstrom/jacob-claude-toolkit
/plugin install dataviz@jacob-claude-toolkit
/plugin install git-flows@jacob-claude-toolkit
...
```

### 3.6 Ongoing promotion workflow

New skill built at home → ask "would this help on a client engagement with zero home context?" → if yes, run it through the sanitization checklist → copy into the toolkit repo → bump `marketplace.json` version → commit + push. A `/promote-skill <name>` helper command could automate steps 2-4 later.

## 4. Effort to implement

Scaffold repo + `.claude-plugin/marketplace.json` + port first 3-4 skills as a proof of shape: ~30-45 min of Claude Code work. Full whitelist port + sanitization pass: another session. No new paid services, no infra — just a new private GitHub repo (`gh repo create jacobskogstrom/jacob-claude-toolkit --private`).

## 5. Open questions for Jacob

- Keep the whole toolkit repo private, or eventually spin a public subset as a "here's my Claude Code setup" showcase/brand piece (ties into Bitesize AI positioning)?
- Any client engagement (Reeinvent/ALMA) restrictions on installing personal tooling on their machines — worth a quick check before the 2026-08-03 start.

## Sources

- [ClawHub: The Skills Marketplace for Claude Code](https://felo.ai/blog/clawhub-skills-marketplace-claude-code/)
- [ClawSkills.sh — Curated OpenClaw Skill Discovery](https://clawskills.sh/)
- [Claude Code Plugin Marketplace Guide (2026)](https://www.agensi.io/learn/claude-code-plugin-marketplace-guide)
- [zircote/.claude dotfiles](https://github.com/zircote/.claude)
- [elizabethfuentes12/claude-code-dotfiles](https://github.com/elizabethfuentes12/claude-code-dotfiles)
- [Best Claude Code Skills in 2026 — Developers Digest](https://www.developersdigest.tech/blog/best-claude-code-skills-2026)
