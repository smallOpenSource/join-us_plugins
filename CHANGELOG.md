# Changelog

## [Unreleased]

### Changed — README + license
- README 외과적 개선: hero(태그라인 + npm·MIT 배지 + 내비) · 빠른 시작(② = `join-us config --init`) · "왜 join-us인가" · 요구사항 섹션 추가. 기존 `## ⚙️ 설정` 블록은 구조 보존.
- 루트 `LICENSE`(MIT) 파일 추가 + `package.json` `files[]`에 포함.

## [0.1.0] - 2026-06-25

### Added — Claude Code marketplace + npm distribution + Codex CLI support
- Initial packaging of the joinus-style contribution workflow skills as a Claude Code plugin + marketplace (installs as `/join-us:*`).
- npm global install: `npm i -g @kaydash9999/join-us-plugins` ships a `join-us` CLI (`bin/join-us.js`, no runtime deps).
- `join-us setup [--claude] [--codex] [--scope user|project] [--dry-run]`, `join-us doctor`, `join-us uninstall`.
- **Codex CLI support**: `join-us setup --codex` installs the 6 tool-agnostic skills into `~/.codex/skills/join-us-<name>/` (subtree copy), per `codex/manifest.json`. It never writes the omx-generated `~/.codex/AGENTS.md` (relies on `~/.codex/skills/` auto-discovery).
- `codex/manifest.json` (per-surface `claude-only | both` target) and `codex/transform-matrix.md`.
- Version-sync guard: `.claude-plugin/plugin.json` is the single source of truth; `npm run sync-version` syncs `package.json`, and `prepublishOnly` fails publish on mismatch.

### Security / generalization (publish hygiene)
- Project identifiers generalized to placeholders (`<OWNER>/<REPO>`, `<my-gh-login>`, `<project-domain>`).
- Removed: dev DB password fragments, EC2 instance IDs, AWS account-id hints, and team members' GitHub handles (third-party PII).
- **`init-join-us` excluded from the published package** — the internal infra reproduction runbook contains a live SES credential, EC2 instance IDs, and internal topology. Kept local only via `.gitignore` + `.npmignore` + `package.json` `files` negation; not listed in `codex/manifest.json`.

### Configuration (so generalized skills still work)
- Skills + scripts resolve placeholders (`<OWNER>/<REPO>`, `<my-gh-login>`, `<project-root>`, ...) from a PRIVATE env file OR interactively. Resolution: `$JOINUS_CONFIG` → `./.join-us.env` → `~/.config/join-us/config.env` (real env vars override the file).
- `config/join-us.env.example` template ships; the real config is private (gitignored / `~/.config`), never published.
- `join-us config [--init]` scaffolds/inspects the config (mode 600, no overwrite without `--force`); `join-us doctor` reports config status. `find_missing_prs.py` reads it and errors clearly when unset (no silent `<OWNER>/<REPO>` calls). Each skill carries a '설정' section documenting the interactive fallback.

### Skills (6)
- `pr-join-us`, `merge_to_dev-join-us`, `make-join-us-pr-report`, `monthly-report`, `post-wiki-join-us`, `review-before-pr-join-us`.

### Notes
- No `postinstall`; `join-us setup` is explicit and refuses to run as root (avoids root-owned files in user homes).
- The skills are generalized templates — fill in your own `<OWNER>/<REPO>`, `<my-gh-login>`, `<project-domain>`.
