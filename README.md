# join-us-plugins

> joinus 스타일 기여 워크플로(PR·머지·리포트·위키·리뷰) 스킬 모음.

[![npm](https://img.shields.io/npm/v/@kaydash9999/join-us-plugins)](https://www.npmjs.com/package/@kaydash9999/join-us-plugins)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[빠른 시작](#빠른-시작) · [구성](#구성-스킬-6) · [설치 상세](#설치-상세-npm--codex) · [요구사항](#요구사항) · [라이선스](#라이선스--서드파티)

join-us는 joinus 스타일 기여 워크플로를 위한 스킬 6개 모음입니다. PR 컨벤션과 Copilot 재리뷰, 여러 PR의 `dev` 순차 머지, PR별·월간 리포트, GitHub Wiki 게시, PR 전 코드리뷰를 제공합니다. 설치하면 스킬이 `/join-us:<이름>` 네임스페이스로 노출되며, 도구에 무관한 스킬이라 Codex CLI에도 설치됩니다.

> **🧩 범용화 템플릿**: 공개본은 특정 저장소·계정·도메인에 묶이지 않도록 식별자를
> 플레이스홀더(`<OWNER>/<REPO>`, `<my-gh-login>`, `<project-domain>`)로 일반화했습니다.
> 본인 프로젝트 값으로 바꿔 쓰세요(아래 **⚙️ 설정**). 시크릿·개인 GitHub 핸들(PII)·인프라 ID는 제거돼 있습니다.
>
> **🔒 제외**: 내부 인프라 재현 런북 `init-join-us`(실 자격증명·인스턴스 ID·내부 토폴로지 포함)는
> 공개본에 포함되지 않습니다(로컬 전용).

이 저장소 자체가 **Claude Code 마켓플레이스**(`.claude-plugin/marketplace.json`)이자 **플러그인**(`.claude-plugin/plugin.json`, name `join-us`)입니다.

> npm 패키지(`@kaydash9999/join-us-plugins`)와 GitHub 저장소(`smallOpenSource/join-us_plugins`)는 같은 메인테이너가 관리합니다.

## 빠른 시작

**Claude Code:** 마켓플레이스로 설치

```bash
claude plugin marketplace add smallOpenSource/join-us_plugins
claude plugin install join-us@join-us-plugins
```

**Codex CLI:** npm 전역 설치 후 `join-us setup`

```bash
npm i -g @kaydash9999/join-us-plugins
join-us setup --codex
```

설치 후 본인 프로젝트 값을 주입합니다(스킬 동작에 필수).

```bash
join-us config --init
```

Claude Code는 스킬을 `/join-us:pr-join-us` 처럼, Codex는 `join-us-pr-join-us` 처럼 호출합니다.

> ⚠️ join-us 스킬은 범용화 템플릿이라 설정 없이는 동작하지 않습니다. `config --init` 을 건너뛰면 스킬이 실행 중 값을 1회 물어봅니다.

## 구성 (스킬 6)

| 스킬 | 설명 |
|---|---|
| `pr-join-us` | PR 컨벤션대로 feature/fix 브랜치 커밋·push, PR 생성/갱신, Copilot 재리뷰 요청(`[bot]` 접미사 노하우). dev/main 직접 push 금지 |
| `merge_to_dev-join-us` | 여러 열린 PR을 `dev`에 순차 머지 (required CI·stacked PR·change_log 충돌·배포 트리거 처리) |
| `make-join-us-pr-report` | 본인 PR을 GitHub PR 목록(권위 소스) 기준으로 모아 운영자용 처리 리포트(조치일자·문제·증거·리스크·조치)로 작성, index 재생성 |
| `monthly-report` | 한 달 작업을 봉사활동 보고서 양식(5섹션)으로 집계 (사람 worktime 기준) |
| `post-wiki-join-us` | 정본 `wiki_docs/`를 라이브 GitHub Wiki(`.wiki.git` 미러)에 게시/갱신 (슬러그 명명·시크릿 스캔·게시 후 재클론 검증) |
| `review-before-pr-join-us` | PR 전 다국어 코드리뷰(diff 필터·토큰 가드·언어별 rule_docs). alibaba/open-code-review 기반 |

> 이 스킬들은 `git`·`gh`·`bash`·`python3`만 쓰는 **도구 무관 워크플로**라 Claude Code·Codex 양쪽에서 동작합니다.

## 설치 상세 (npm · Codex)

마켓플레이스 대신 npm으로 전역 설치할 수 있고, Codex CLI에도 스킬을 설치할 수 있습니다.

```bash
npm i -g @kaydash9999/join-us-plugins
join-us setup            # 대상 플래그가 없으면 Claude Code와 Codex 둘 다
join-us setup --claude   # Claude Code만 (마켓플레이스 등록 후 /join-us:*)
join-us setup --codex    # Codex CLI만 (~/.codex/skills/join-us-*)
join-us doctor           # 설치 + 설정 상태 점검
join-us uninstall        # 제거
```

- `--scope project` 로 프로젝트 로컬(`./.codex`)에 설치하고, `--dry-run` 으로 미리 볼 수 있습니다.
- non-root 전용입니다(전역 sudo 설치 시 root 소유 파일을 방지). postinstall이 없으므로 `join-us setup` 을 직접 실행합니다.
- Codex에는 도구 무관 스킬 6개가 설치됩니다(`codex/manifest.json`). 스킬은 `~/.codex/skills/join-us-<name>/` 에 놓이고, 디렉터리명과 일치하도록 프론트매터 `name:` 이 `join-us-<name>` 으로 재작성되어 Codex가 `join-us-<name>` 으로 인식합니다. 이 패키지엔 커맨드가 없어 `~/.codex/prompts/` 항목은 0개이며, `~/.codex/AGENTS.md` 는 건드리지 않습니다(omx가 재생성하므로). 재설치할 때마다 기존 `join-us-*` 를 먼저 정리하므로 옛 버전이 중복으로 남지 않습니다.
- 다른 플러그인(예: banker)과 함께 설치돼도 각자 `join-us-*`·`banker-*` 접두만 다루므로 서로 간섭하지 않습니다.
- Claude Code 세션 안에서는 `/plugin marketplace add smallOpenSource/join-us_plugins` → `/plugin install join-us@join-us-plugins` 로도 설치됩니다.

## ⚙️ 설정 (필수: 스킬 플레이스홀더 해소)

스킬 본문은 `<OWNER>/<REPO>`·`<my-gh-login>`·`<project-root>` 같은 **플레이스홀더**를 씁니다(특정 저장소·계정에 묶이지 않도록 범용화). 실제로 동작시키려면 본인 값을 **비공개 설정 파일**로 주거나, 스킬이 **물어볼 때 답하면** 됩니다.

```bash
join-us config --init     # ~/.config/join-us/config.env 를 템플릿에서 생성 (mode 600)
#  편집해 실제 값 입력: JOINUS_REPO=owner/repo · JOINUS_GH_LOGIN=... · JOINUS_PROJECT_ROOT=... 등
join-us config            # 현재 설정 경로 + 설정된 키 확인
join-us doctor            # 설치 + 설정 상태 한눈에
```

- 해소 순서(첫 발견 우선): `$JOINUS_CONFIG` → `./.join-us.env` → `~/.config/join-us/config.env`.
- 설정 파일이 없으면 스킬이 **1회 질문**해 값을 받아 그 세션 동안 사용합니다(인터랙션 폴백).
- 키: `JOINUS_REPO`, `JOINUS_GH_LOGIN`(+`_ALT`), `JOINUS_AUTHOR_NAME`, `JOINUS_PROJECT_ROOT`, `JOINUS_WIKI_DOMAIN`, `JOINUS_TEAM_LOGINS`, `JOINUS_SECRET_PATTERNS`. 템플릿은 `config/join-us.env.example`.
- ⚠️ **실값 설정 파일은 비공개**입니다(별도 관리). 절대 커밋·게시하지 마세요. 공개본엔 `*.example`(플레이스홀더)만 포함됩니다. 번들 스크립트(`find_missing_prs.py`)는 이 설정을 자동으로 읽고, 미설정 시 안내 후 중단합니다.

## 요구사항

- **Claude Code** (마켓플레이스 설치 경로) 또는 **Node.js ≥ 16.7** (npm 전역 설치 경로. `join-us` CLI 제공).
- **`git`·`gh`(GitHub CLI, 인증 필요)·`python3`·`jq`**. 스킬이 런타임에 사용합니다.
- 본인 프로젝트 설정(위 **⚙️ 설정**).
- (선택) `make-join-us-pr-report` 의 윤문 단계는 humanize-korean 스킬을 사용합니다(없으면 건너뜀).

## 업데이트 / 제거

**Claude Code:**

```bash
claude plugin update join-us                        # 플러그인 최신화 (재시작 후 적용)
claude plugin marketplace update join-us-plugins    # 마켓플레이스 메타 갱신
claude plugin uninstall join-us                     # 제거
```

**npm · Codex:**

```bash
npm i -g @kaydash9999/join-us-plugins   # 최신 버전 설치
join-us setup                            # 재설치 (기존 join-us-* 정리 후 클린 설치)
join-us uninstall                        # 제거
```

Codex는 재설치할 때마다 기존 `join-us-*` 를 먼저 정리하므로 옛 버전이 중복으로 남지 않습니다.

## 라이선스 / 서드파티

join-us 자체는 **MIT** ([LICENSE](LICENSE)). Owner: [smallOpenSource](https://github.com/smallOpenSource).

**번들된 코드 (이 패키지가 재배포)**
- `skills/review-before-pr-join-us` 의 `rules/`·`prompts/` 자산은 [alibaba/open-code-review](https://github.com/alibaba/open-code-review)에서 **verbatim 복사**한 것으로 **Apache-2.0**(© 2026 Alibaba)입니다. 원본 고지는 `skills/review-before-pr-join-us/NOTICE` 에 포함. SKILL.md 파이프라인은 원본 동작을 옮긴 Claude-native 포팅입니다.

아래는 스킬이 **런타임에 의존하거나 연동**하는 외부 요소로, join-us 가 재배포하지 않으며 각 라이선스·상표는 소유자에게 있습니다.

**의존 도구 (사용 시 별도 설치, 라이선스는 각 프로젝트 소유)**
- git(GPL-2.0), GitHub CLI `gh`(MIT), python3(PSF), jq(MIT), bash. 번들 스크립트 `find_missing_prs.py`(표준 라이브러리만)·`post_wiki.sh`(bash)는 서드파티 라이브러리를 쓰지 않습니다.

**연동·참조**
- humanize-korean 스킬: `make-join-us-pr-report` 의 선택적 윤문 단계에서 사용(없으면 건너뜀).
