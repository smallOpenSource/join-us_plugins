# Transform matrix: Claude Code surfaces → Codex CLI

Source of truth: this repo's `skills/<name>/`. `codex/manifest.json` tags each surface.
The generator (`join-us setup --codex`) applies the rules below for `target: both` surfaces ONLY;
`claude-only` surfaces are NEVER written to Codex. (This package has no commands.)

| Source (Claude) | Codex destination | Transform |
|---|---|---|
| `skills/<name>/SKILL.md` (+ subtree) | `~/.codex/skills/join-us-<name>/` (whole dir) | **COPY subtree** (Windows: no symlink). SKILL.md frontmatter (name+description) is identical → no body transform. |
| (none) | `~/.codex/AGENTS.md` | **NOT TOUCHED.** omx regenerates it (clobber risk). Rely on `~/.codex/skills/` auto-discovery; if a listing is wanted, write ONLY inside the sanctioned `<!-- user-custom -->` region, idempotently. |

## Naming
- Codex skill dir: `join-us-<name>` (avoids collision with omx/system skills).
- (No commands in this package → no `~/.codex/prompts/` entries. Future tool-agnostic commands would map to `~/.codex/prompts/join-us-<name>.md`, invoked `/join-us-<name>`.)

## Scope
- `--scope user` (default) → `~/.codex/…`. `--scope project` → `./.codex/…`.

## Excluded — never generated for Codex (nor published)
Skill: `init-join-us` — internal infra reproduction runbook (live SES credential + EC2 instance IDs + internal topology). Kept LOCAL ONLY via `.gitignore` + `.npmignore` + `package.json` `files` negation; not listed in `manifest.json`.

## Caveats (documented; not blockers)
- All 6 surfaces are tool-agnostic workflows (use `git`/`gh`/`bash`/`python3`). They are generalized templates — fill in `<OWNER>/<REPO>`, `<my-gh-login>`, `<project-domain>` for your project.
- `make-join-us-pr-report` — optional humanize step references a `humanize-korean` skill; skip if absent.
- `post-wiki-join-us` — needs a live GitHub Wiki (`.wiki.git`) initialized once via the web UI.
- `review-before-pr-join-us` — vendored methodology based on alibaba/open-code-review (Apache-2.0); attribution in `skills/review-before-pr-join-us/NOTICE`.
