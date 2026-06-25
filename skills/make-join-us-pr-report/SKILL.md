---
name: make-join-us-pr-report
description: "[joinus] 본인(<my-gh-login>* 계정, 현 <my-gh-login>/구 <my-gh-login>)이 repo(<OWNER>/<REPO>)에 **dev 로 머지**한 PR 을 GitHub PR 목록(권위 소스) 기준으로 모아, 아직 SR/reports/ 에 없는 것을 운영자용 '처리 리포트'(조치일자·제목·기존문제·증거·리스크·조치방법)로 작성하고 본문을 humanize-korean 으로 다듬은 뒤 build_index.sh 로 index.md 를 재생성한다. 같은 산출물의 작업→수정→번복→조치는 한 파일로 묶고(211_212_214 패턴), change_log 미러/기록 메타는 제외하며, change_log 에 누락된 내 PR 도 함께 탐지/보고한다. PR 번호별 작업을 운영자 수준으로 정리/요약하려는 모든 요청에 사용 — '처리 리포트 작성/갱신', 'PR별 작업 정리', 'SR/reports 누락 채워', '내 PR 빠진 거 리포트', 'change_log 누락 PR 확인', 'PR 보고서 만들어', '/make-join-us-pr-report'. 로컬 전용(미커밋·시크릿 0). ⚠️ 월간 봉사보고서(monthly-report)와 다름 — 이건 PR 단위 상세 리포트."
invocation: /make-join-us-pr-report
version: 1.2.0
location: skills/make-join-us-pr-report/  (설치 위치 — Claude: 플러그인 경로 · Codex: ~/.codex/skills/join-us-make-join-us-pr-report/)
---

# make-join-us-pr-report — joinus PR별 처리 리포트

## ⚙️ 설정 (필수 — 플레이스홀더 해소)

이 스킬 본문의 `<OWNER>/<REPO>`·`<my-gh-login>`·`<git-author-name>`·`<project-root>` 등은 **범용화 플레이스홀더**다. 실행 전 반드시 실제 값으로 해소한다:

1. **설정 파일 로드**(KEY=value, 첫 발견 우선): `$JOINUS_CONFIG` → `./.join-us.env` → `~/.config/join-us/config.env`. `set -a; . <file>` 로 export 하거나 값을 읽어 치환한다. 템플릿 = `config/join-us.env.example`(`join-us config --init` 로 생성).
2. **설정이 없으면 사용자에게 1회 질문**해 값을 확보(인터랙션)하고 같은 세션 동안 재사용한다.

치환표: `<OWNER>/<REPO>`→`$JOINUS_REPO` · `<my-gh-login>`→`$JOINUS_GH_LOGIN`(구계정=`$JOINUS_GH_LOGIN_ALT`) · `<git-author-name>`→`$JOINUS_AUTHOR_NAME` · `<project-root>`→`$JOINUS_PROJECT_ROOT` · `<project-domain>`→`$JOINUS_WIKI_DOMAIN` · 팀원 제외 목록→`$JOINUS_TEAM_LOGINS` · `<plaintext-pw>`(알려진 평문 시크릿 스캔 패턴)→`$JOINUS_SECRET_PATTERNS`.

> ⚠️ 실값 설정 파일은 **비공개**(별도 관리) — 절대 커밋/게시하지 않는다. 공개본엔 `*.example`(플레이스홀더)만 포함된다. 본문의 "시크릿 0" 게이트는 그대로 유지한다.


## Purpose

joinus 에서 **본인(GitHub author login `<my-gh-login>*` — 현 `<my-gh-login>`, 구 `<my-gh-login>`)** 이 만든 PR 을 빠짐없이 PR 번호별로 정리한다. 각 항목(또는 같은 산출물의 PR 묶음)을 **지식수준이 낮은 운영자도 이해할 평이한 처리 리포트**(`SR/report_sample.md` 양식)로 `SR/reports/` 에 쓰고, 본문을 **humanize-korean** 으로 다듬은 뒤 `build_index.sh` 로 `index.md` 를 재생성한다.

## 권위 소스 & 기본 스코프 (중요)

- **진실의 원천 = repo 의 PR 목록(GitHub, `gh`)** — change_log 가 아니다(change_log 는 내 PR 의 일부만 담는다). 작성자 = author login `<my-gh-login>*`.
- **기본 스코프(사용자 확정)**:
  1. **`base=dev` 로 머지된 PR 만.** release/main 승격 PR 은 dev 작업의 중복이므로 기본 제외. (`--base all` 로 포함)
  2. **`MERGED` 만.** 트라이얼/`[DO NOT MERGE]`/superseded `CLOSED` 는 제외(`--include-closed`).
  3. **change_log 미러/기록 메타 제외(B안).** 제목에 `change_log` 가 들어가는 기록/싱크 PR(예: "docs(ops): change_log — … 기록")은 리포트 가치가 낮아 기본 제외. (`--include-cl-meta`)
- change_log 의 용도: ① 리포트 **재료**(있으면 운영자 요약이 이미 담김) ② **누락 탐지 대상**([B] GitHub엔 있는데 change_log에 없는 내 PR — 보고만).

3중 대조(GitHub ↔ change_log ↔ reports)는 번들 스크립트가 처리한다:

```bash
python3 scripts/find_missing_prs.py --json /tmp/pr_report_todo.json
# 기본 dev-merged·MERGED·cl-meta제외. [A]=생성대상, [B]=change_log누락, [C]=base 매칭실패.
# 토글: --base all | --include-cl-meta | --include-open | --include-closed
```

`to_generate[]` 의 `in_changelog=false` 면 재료를 change_log 가 아닌 `gh pr view <N>` 로 확보한다.

## When to Use

"처리 리포트 작성/갱신", "PR별 작업 정리", "내 PR 빠진 거 리포트", "SR/reports 누락분 채워", "change_log 누락 PR 확인", `/make-join-us-pr-report`.

> **혼동 주의:** `monthly-report` 는 한 달 합산 *봉사활동 보고서*(`SR/monthly_summary/`). 이 스킬은 *PR 단위* 상세 처리 기록(`SR/reports/`)이며 monthly-report 가 이를 소스로 참조한다.

## ⛔ HARD GATES (어기면 중단)

1. **본인 PR 만 (GitHub author 기준).** author login `<my-gh-login>*` 만. 팀원(다른 기여자들·`app/dependabot` 등) 제외.
2. **시크릿 0 (최우선).** change_log `기타`/PR 본문엔 인스턴스 ID(`i-…`)·DB 호스트·계정번호(12자리)·`.env` 값이 섞여 있다. 리포트에 **전사 금지** — 일반화("운영 서버"/"운영 DB") + 작성·humanize 후 grep 스크럽.
3. **로컬 전용 + change_log 자동편집 금지.** `SR/` 는 `.gitignore` → 커밋/PR 금지. **change_log.md 는 커밋 파일**이라 이 스킬이 수정하지 않는다 — [B] 누락은 보고만, 기록 필요 시 별도 PR(`wiki-changelog-rule`·push 승인).
4. **운영자 수준·간결.** 장황·과장 금지. 메타성은 짧게.
5. **사실 불변(humanize 포함).** humanize 는 문체·리듬만. PR/이슈 번호·날짜·수치·링크·인과관계는 **한 글자도** 불변. humanize 후 재검증.

## 묶음 규칙 (중요 — 사용자 확정)

여러 PR 을 한 리포트로 묶는 것은 **"하나의 산출물"의 생애주기**일 때만이다. 같은 목적이라도 **엄연히 분리된 작업이면 분리 작성**한다.

- **묶는다(1파일):** 같은 산출물의 **작업 → 수정 → 번복(revert) → 조치(재시도/후속 fix)**.
  - 예: `349_350_360`(INF-3 비root: 1차 작업 → revert → 안전 재시도) · `257_258_259`(같은 deps revert→재적용→재복구 A/B/A) · `305_306`(dev 실측 ON → revert) · `271_278`(기능 → 그 배포 실패 fix) · `399_400`(스크립트 → 그 포맷 fix).
- **분리한다(각 1파일):** 목적·트랙만 같고 산출물이 다른 작업.
  - 예: 워크플로별 self-host 이전(#380/#381/#384/#386/#387 각각) · PR-C1/C2/C3 · CSRF PR1/PR2/PR3 · 백업 PR-1~6 · SELF_HOSTED_RUNNER §10/§12/§13/§14 · 보안감사 항목별(SSRF/XSS/rate-limit 등) · dependabot 정책 PR.
  - 판별: "supersede/relates/같은 트랙/번호 시리즈(PR-N)/다른 파일·다른 메커니즘" = **분리**. "revert/그 버그 fix/그걸 되돌린 뒤 재조치" = **묶음**.
- 묶음 자동 후보는 본문의 revert/정정/후속/회수 참조로 1차 추출하되(스크립트 graph 는 과병합하므로), **산출물 단위로 사람이 교정**한다.

## 산출물 / 파일명

- 디렉터리: `<project-root>/SR/reports/`
- 단독: `<PR번호>_<영문_slug>.md` · 묶음: `<n1>_<n2>_..._<slug>.md`(예 `349_350_360_frontend_nonroot.md`) · op: `op_<slug>.md`
- 인덱스: `index.md`(자동생성·직접수정 금지). 양식 정본: `report_sample.md` + 묶음 예시 `211_212_214_deploy_paths_ignore.md`.

## 리포트 양식

`build_index.py` 가 `**조치일자**` 와 `1. **제목**` 을 정규식 추출 → **볼드 라벨·번호 구조 유지**. `**PR**` 와 `**조치일자**` 는 **다른 줄**.

```markdown
**PR**: https://github.com/<OWNER>/<REPO>/pull/<N>

**조치일자**: YYYY-MM-DD


1. **<짧은 제목>** (<분류>)
<1~2문장. 운영자 평이체.>

2. **기존 문제**
3. **증거**     (- PR/이슈/로그 링크)
4. **리스크**
5. **조치방법**  (무엇을 어떻게 + dev/prod 검증)
```

- **조치일자**: change_log 날짜 우선, 없으면 PR `mergedAt`(날짜만).
- **묶음일 때**: 1번째 줄 `**PR**:` 에 모든 PR URL 을 쉼표로 나열 + **역할 주석**(예: `…/349 (1차) , …/350 (revert) , …/360 (재시도)`), 끝에 `(이슈 …/N)`. `**조치일자**` 는 가장 최근 PR 머지일 **1개**(build_index 는 단일 토큰만 읽음). 5번 섹션에 **작업→수정→번복→조치 흐름을 한 흐름으로** 서술. (정본 예시 = `211_212_214_deploy_paths_ignore.md`)
- **op(PR 없음)**: 첫 줄 `**운영조치**: <대상>` (시크릿 0). 나머지 동일.

## Workflow

1. **범위 확정** — 기본 인자 없음 = dev-merged·MERGED·cl-meta제외 증분. `#NNN …`=지정. 토글: `--base all`·`--include-cl-meta`·`--include-open`·`--include-closed`·`--no-humanize`.
2. **권위 목록·3중 대조** — `python3 scripts/find_missing_prs.py --json /tmp/pr_report_todo.json` (**이 스킬 디렉터리에서** 실행 — 설치 위치는 frontmatter `location` 참조; 설정 미해소 시 스크립트가 안내 후 중단). `gh auth status` 선확인.
3. **묶음 확정** — `to_generate` 를 **묶음 규칙**으로 유닛화(같은 산출물 lifecycle 만 묶음, 나머지 단독). 자동 graph 과병합은 산출물 단위로 교정. 규모가 크면 유닛 목록을 사용자에게 한 번 확인.
4. **재료 수집** — 유닛의 각 PR: `in_changelog=true` → change_log 행 `내용`·`기타`; `false` → `gh pr view <N> --json title,body,closingIssuesReferences,url,mergedAt`.
5. **작성** — 위 양식(묶음=lifecycle 1파일). 시크릿 스크럽.
6. **humanize** — 아래 단계. 신규 생성분 본문 산문만.
7. **index 재생성** — `build_index.sh` 가 있으면 `bash SR/reports/build_index.sh`(PYTHON_BIN 강제·폴백 금지). ⚠️ `build_index.{sh,py}`·`report_sample.md`·`211_212_214_*.md` 는 **이 플러그인 번들이 아니라 프로젝트 측 자산**(`$JOINUS_PROJECT_ROOT/SR/reports/`) — 없으면 index 재생성을 건너뛰고 보고에 명시.
8. **검증 & 보고** — 시크릿 0·구조(조치일자 1+5섹션)·커버리지([A] 잔여)·중복 0·[B] change_log 누락 목록. **커밋/PR/change_log 편집 안 함.**

> 대량(수십~수백 유닛)일 때는 Workflow 로 `Discover → Draft → Humanize(pipeline) → Index&Verify` 병렬 처리 권장. 레이트리밋 시 resume(완료분 캐시·실패분만 재실행).

## humanize 단계

본문 산문을 `humanize-korean`(사용자 표현 `/humanize-korean:humanize`)으로 다듬어 AI 티 제거.

- **도구:** 리포트 1건 ≤5,000자 → `humanize-korean:humanize-monolith` Fast Path(여러 건이면 병렬). 깊은 검증은 `/humanize-korean:humanize-korean`.
- **입력:** 섹션 1·2·4·5 와 3의 산문만. **불변**: `**PR**:`/`**운영조치**:`/`**조치일자**:` 라인, `1.~5. **제목**` 번호·볼드, 모든 URL·PR/이슈 번호·날짜·수치. 요약/주석 블록 추가 금지.
- **레지스터 가드(과윤문 금지):** 목표 = 운영자 평이·간결체. 문학체/번역윤문 금지.
- **구조 보존:** humanize 후 볼드 번호·`**조치일자**` 라인 유지(아니면 build_index 추출 실패).
- 기본 신규 생성분만. 사실(번호·날짜·수치) 보존 재검증.

## 검증 명령 (작성 후 필수)

```bash
cd <project-root>
python3 scripts/find_missing_prs.py | head -6     # [A] 잔여
for F in SR/reports/<새파일들>.md; do grep -cE '^\*\*조치일자\*\*:' "$F"; grep -cE '^[1-5]\. \*\*' "$F"; done   # 1, 5
grep -rEn 'i-[0-9a-f]{8,}|\b[0-9]{12}\b|ec2-[0-9-]+\.|ip-10-|password\s*[:=]' SR/reports/<새파일들>.md         # 0
[ -f SR/reports/build_index.sh ] && bash SR/reports/build_index.sh || echo "(build_index.sh 없음 — 프로젝트 측 자산; index 재생성 생략)"
```

## Success Criteria

- dev-merged·MERGED·cl-meta제외(또는 지정 스코프) 내 PR 의 reports 미작성분이 빠짐없이 존재, **중복 0**.
- 묶음은 같은-산출물 lifecycle 만. 양식(조치일자+5섹션, 개행) 충실, 운영자 평이체, **시크릿 0**.
- humanize 됨 + 사실 불변. `index.md` 재생성. [B] change_log 누락 **보고**. 로컬 전용·미커밋.

## Pitfalls

- **과병합** — 같은 트랙/목적이라고 묶지 말 것. 같은 **산출물**의 작업/수정/번복/조치만. (자동 graph 는 참조로 과병합 → 교정 필수.)
- **change_log 만 신뢰** — 내 PR 의 일부만 담음. GitHub 권위 소스로 대조.
- **release/main PR 포함** — 기본 `base=dev` 로 제외(중복). 필요 시 `--base all`.
- **CLOSED 트라이얼·change_log 메타 리포트화** — 기본 제외. 시크릿 전사 — 일반화+스크럽.
- **humanize 과윤문/구조 훼손** — 평이체 유지, 메타·번호·날짜·링크 불변.
- **build_index 임의 python** — `PYTHON_BIN` 미설정 시 폴백 금지(`.env.local`).
- **gh 미인증/페이지네이션** — `gh auth status`·`--limit` 기본 2000.

## 관련 자산 / 메모리

- **이 스킬에 번들된 자산**(설치 위치 = frontmatter `location`): `scripts/find_missing_prs.py`(권위 소스 3중 누락 탐지) **하나뿐**.
- **프로젝트 측 자산**(번들 아님 — `$JOINUS_PROJECT_ROOT/SR/reports/` 에 사용자가 보유/생성): 인덱스 `build_index.py`/`.sh` · 양식 `report_sample.md` + 묶음 예시 `211_212_214_*.md`. 없으면 index 재생성·양식 참조 단계는 건너뛴다(보고에 명시).
- 데이터: GitHub PR 목록(`gh`, 권위) + `wiki_docs/change_log.md`(재료·갭)
- 연계: `monthly-report` · `humanize-korean:humanize-monolith`/`humanize-korean`
- 메모리: `one-pr-per-unit-of-work`, `gh-account-has-repo-admin`, `wiki-changelog-rule`, `no-push-without-permission`, `joinus-skill-description-korean`, `no-ai-coauthor-trailer`
