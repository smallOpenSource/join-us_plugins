# Changelog

## [0.2.1] - 2026-07-02

### Docs
- README 라이선스/서드파티 정확화: `review-before-pr-join-us` 의 `rules/`·`prompts/` 가 alibaba/open-code-review에서 **verbatim 복사(Apache-2.0, © Alibaba)** 임을 명시(기존 "방법론 기반" 축소 표현 교정). 의존 도구(git·gh·python3·jq·bash)와 humanize-korean 선택 의존을 3범주(번들/의존/연동)로 정리.
- README 업데이트/제거 섹션을 Claude Code + npm·Codex 대칭으로 보강하고, 재설치 시 기존 `join-us-*` 정리(중복 방지) 노트 추가. 요구사항에 `jq`·humanize-korean(선택) 명시.

## [0.2.0] - 2026-07-02

### Fixed
- **Codex 스킬 미표시**: `join-us setup --codex` 가 스킬을 `~/.codex/skills/join-us-<name>/` 로 복사할 때 SKILL.md 프론트매터 `name:` 을 `join-us-<name>` 로 재작성한다. Codex는 스킬 디렉터리명과 `name:` 일치를 요구하는데, 기존에는 `name: <name>` 그대로라 Codex가 스킬을 인식하지 못했다. `doctor` 에 dir==name 검증·경고와 "codex 있는데 join-us 스킬 0개" 경고 추가.

### Changed
- **업데이트 시 중복 제거**: `join-us setup --codex` 가 설치 전 기존 `join-us-*` 를 먼저 정리(sweep)한 뒤 클린 재설치한다. 매니페스트에서 제거·개명된 스킬의 옛 버전이 잔존하지 않는다.
- **동시 설치 안전(co-install)**: 모든 Codex 작업을 `join-us-` 접두로만 한정해, banker 등 다른 플러그인이나 omx 스킬과 `~/.codex/skills` 를 공유해도 서로 건드리지 않는다. `bin/join-us.js` 에 불변 주석, `scripts/smoke-test.js` 에 회귀 가드를 추가했다.
- **README 재작성**: 과장·AI 흔적 표현을 덜어내고(이탤릭 태그라인·불필요한 em dash 정리, "왜 join-us인가" 섹션 정리) 빠른 시작에 Claude Code·Codex 양쪽 경로를 명시했다. 범용화·설정·`init-join-us` 제외 안내는 보존.
- `sync-version` 이 `.claude-plugin/marketplace.json` 의 `metadata.version` 까지 동기화한다(기존 0.1.0 드리프트 교정).

### Added
- `scripts/smoke-test.js` 에 실제 설치 기반 회귀 단언: `join-us-*` dir==frontmatter `name`, stale sweep, `init-join-us` 는 codex에 설치되지 않음, co-install 시 foreign `banker-*`/omx 스킬 보존.

## [0.1.1] - 2026-06-26

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
