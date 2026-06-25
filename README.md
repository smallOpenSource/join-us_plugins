# join-us-plugins

Claude Code 플러그인 — **joinus 스타일 기여(contribution) 워크플로** 스킬 모음입니다.
PR 컨벤션 + Copilot 재리뷰, 여러 PR의 `dev` 순차 머지, PR별·월간 리포트, GitHub Wiki 게시,
PR 전 코드리뷰를 한 번에 제공합니다. 설치하면 스킬이 **`/join-us:<이름>`** 네임스페이스로 노출됩니다.

> **🧩 범용화 템플릿**: 공개본은 특정 저장소·계정·도메인에 묶이지 않도록 식별자를
> 플레이스홀더(`<OWNER>/<REPO>`, `<my-gh-login>`, `<project-domain>`)로 일반화했습니다.
> 본인 프로젝트 값으로 바꿔 쓰세요. 시크릿·개인 GitHub 핸들(PII)·인프라 ID는 제거돼 있습니다.
>
> **🔒 제외**: 내부 인프라 재현 런북 `init-join-us`(실 자격증명·인스턴스 ID·내부 토폴로지 포함)는
> 공개본에 **포함되지 않습니다**(로컬 전용).

이 repo는 그 자체로 **Claude Code 마켓플레이스**(`.claude-plugin/marketplace.json`)이자
**플러그인**(`.claude-plugin/plugin.json`, name `join-us`)입니다.

## 설치

```bash
# 마켓플레이스 추가 + 플러그인 설치 (CLI)
claude plugin marketplace add smallOpenSource/join-us_plugins
claude plugin install join-us@join-us-plugins
```

또는 Claude Code 세션 안에서:

```text
/plugin marketplace add smallOpenSource/join-us_plugins
/plugin install join-us@join-us-plugins
```

설치 후 스킬은 **`/join-us:pr-join-us`**, **`/join-us:monthly-report`** 처럼 `/join-us:` 로 호출됩니다.
스코프는 `-s user|project|local`(기본 `user`) — 현재 프로젝트에만: `claude plugin install join-us@join-us-plugins -s project`.

## npm 전역 설치 + Codex CLI (대안)

마켓플레이스 대신 **npm**으로 설치할 수 있고, **Codex CLI**에도 스킬을 설치할 수 있습니다:

```bash
npm i -g @kaydash9999/join-us-plugins
join-us setup            # Claude Code + Codex 둘 다 (대상 플래그 없으면 둘 다)
join-us setup --claude   # Claude Code만 (마켓플레이스 등록 → /join-us:*)
join-us setup --codex    # Codex CLI만 (~/.codex/skills/join-us-*)
join-us doctor           # 설치 상태 점검
join-us uninstall        # 제거
```

- `--scope project` 로 프로젝트-로컬(`./.codex`)에 설치, `--dry-run` 으로 미리보기.
- **non-root 전용**(전역 sudo 설치 시 root 소유 파일 방지). **postinstall 없음** — `join-us setup` 을 직접 실행.
- Codex에는 **도구-무관 스킬 6개 전부** 설치됩니다(`codex/manifest.json`). Codex 스킬 → `~/.codex/skills/join-us-<name>/`.
  이 패키지엔 커맨드가 없어 `~/.codex/prompts/` 항목은 0개이며, `~/.codex/AGENTS.md`는 건드리지 않습니다(omx가 재생성하므로).

## 업데이트 / 제거

```bash
claude plugin update join-us                        # 플러그인 최신화 (재시작 후 적용)
claude plugin marketplace update join-us-plugins    # 마켓플레이스 메타 갱신
claude plugin uninstall join-us                     # 제거
```

## 구성 — 스킬 6

| 스킬 | 설명 |
|---|---|
| `pr-join-us` | PR 컨벤션대로 feature/fix 브랜치 커밋·push → PR 생성/갱신 → Copilot 재리뷰 요청(`[bot]` 접미사 노하우). dev/main 직접 push 금지 |
| `merge_to_dev-join-us` | 여러 열린 PR을 `dev`에 순차 머지 — required CI·stacked(base 의존) PR·change_log 충돌·배포 트리거 처리 |
| `make-join-us-pr-report` | 본인 PR을 GitHub PR 목록(권위 소스) 기준으로 모아 운영자용 '처리 리포트'(조치일자·문제·증거·리스크·조치)로 작성, index 재생성 |
| `monthly-report` | 한 달 작업을 봉사활동 보고서 양식(5섹션)으로 집계 — 사람 worktime 기준 |
| `post-wiki-join-us` | 정본 `wiki_docs/`를 라이브 GitHub Wiki(`.wiki.git` 미러)에 게시/갱신 — 슬러그 명명·시크릿 스캔·게시 후 재클론 검증 |
| `review-before-pr-join-us` | PR 전 다국어 코드리뷰(diff 필터·토큰 가드·언어별 rule_docs). alibaba/open-code-review 기반 |

> 이 스킬들은 `git`/`gh`/`bash`/`python3`만 쓰는 **도구-무관 워크플로**라 Claude Code·Codex 양쪽에서 동작합니다.

## 라이선스 / 소유

- Owner: [smallOpenSource](https://github.com/smallOpenSource)
- License: MIT
- Version: 0.1.0

### 서드파티 (Third-party)

- `skills/review-before-pr-join-us` — [alibaba/open-code-review](https://github.com/alibaba/open-code-review) 방법론 기반. 원본 라이선스/고지는 `skills/review-before-pr-join-us/NOTICE` 참조.
