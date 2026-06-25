---
name: merge_to_dev-join-us
description: "joinus 에서 여러 열린 PR 을 dev 에 순차 머지할 때 — required CI 체크·stacked(base 의존) PR·change_log 충돌·배포 트리거가 얽힌 다건 머지. 트리거: 'PR 들 dev 머지', '#NNN~#MMM 머지', '백업 PR 다 머지', '순차 머지', '/merge_to_dev-join-us'. 본인(<my-gh-login>) PR 만 대상."
---

# merge_to_dev-join-us — joinus 다건 PR 순차 dev 머지

## ⚙️ 설정 (필수 — 플레이스홀더 해소)

이 스킬 본문의 `<OWNER>/<REPO>`·`<my-gh-login>`·`<git-author-name>`·`<project-root>` 등은 **범용화 플레이스홀더**다. 실행 전 반드시 실제 값으로 해소한다:

1. **설정 파일 로드**(KEY=value, 첫 발견 우선): `$JOINUS_CONFIG` → `./.join-us.env` → `~/.config/join-us/config.env`. `set -a; . <file>` 로 export 하거나 값을 읽어 치환한다. 템플릿 = `config/join-us.env.example`(`join-us config --init` 로 생성).
2. **설정이 없으면 사용자에게 1회 질문**해 값을 확보(인터랙션)하고 같은 세션 동안 재사용한다.

치환표: `<OWNER>/<REPO>`→`$JOINUS_REPO` · `<my-gh-login>`→`$JOINUS_GH_LOGIN`(구계정=`$JOINUS_GH_LOGIN_ALT`) · `<git-author-name>`→`$JOINUS_AUTHOR_NAME` · `<project-root>`→`$JOINUS_PROJECT_ROOT` · `<project-domain>`→`$JOINUS_WIKI_DOMAIN` · 팀원 제외 목록→`$JOINUS_TEAM_LOGINS` · `<plaintext-pw>`(알려진 평문 시크릿 스캔 패턴)→`$JOINUS_SECRET_PATTERNS`.

> ⚠️ 실값 설정 파일은 **비공개**(별도 관리) — 절대 커밋/게시하지 않는다. 공개본엔 `*.example`(플레이스홀더)만 포함된다. 본문의 "시크릿 0" 게이트는 그대로 유지한다.


여러 열린 PR 을 **의존 순서대로 하나씩** dev 에 머지한다. 각 PR = dev 병합(required CI 유입) → CI green → `--admin` squash 머지 → (코드면)배포 확인 → 정리. `pr-join-us`(PR 생성·push)의 **후행 단계**(이미 열린 PR 들을 dev 로 반영). 2026-06-21 #239~#250(13개)에 적용·검증.

## ⛔ HARD GATES (어기면 중단)
1. **본인(<my-gh-login>) PR 만 머지.** 머지 전 `gh pr view N --json author --jq .author.login` 확인. 타인(다른 기여자·`app/dependabot` 등)·범위 밖 PR 은 **머지/rebase/close 금지 → 보고만**([[merge-only-own-prs]], [[do-not-touch-others-prs]]). admin 권한 있어도 처리 불가.
2. **dev/main 직접 push 금지.** PR 머지로만 반영. feature 브랜치 push 만 허용([[no-push-without-permission]]).
3. **시크릿 0.** 충돌 해소·신규 파일에 실제 비번/토큰 유입 금지. 커밋=conventional, **AI 공동작성자 트레일러 금지**([[no-ai-coauthor-trailer]]).
4. **배포 인지.** scripts/·backend/·frontend 등 `deploy.yml` `paths-ignore`(`wiki_docs/**`·`**/*.md`·`.gitignore`·`.github/**`) **밖** 파일이 섞인 PR 의 dev 머지는 **dev 배포를 트리거**한다. 머지 전 사용자에게 알리고, 머지 후 배포 success 확인([[dev-first-then-prod-gate]]).

## 1. 사전 분석 (read-only, 머지 시작 전 1회)
대상 PR 들을 한 번에 파악 — 잘못된 일괄 머지를 막는 핵심 단계:
```bash
for n in <PR목록>; do
  gh pr view $n --repo <owner/repo> --json number,author,baseRefName,headRefName,state,mergeable,mergeStateStatus \
    --jq '"#\(.number) [\(.state)] @\(.author.login) base=\(.baseRefName) head=\(.headRefName) \(.mergeable)/\(.mergeStateStatus)"'
done
```
각 PR 에 대해 확인:
- **author** — <my-gh-login> 아니면 제외(HARD GATE 1).
- **base** — `dev` 가 아니면 **stacked**(다른 PR 브랜치에 의존). base PR 을 먼저 머지해야 함.
- **변경 파일**(`gh pr view N --json files`) — `paths-ignore` 밖이면 배포 트리거(코드), 안이면 무배포(docs/.gitignore/.github).

## 2. 의존 순서 결정
- **base=dev + 충돌 없는 것 먼저**(가장 단순).
- **stacked**: 루트부터(예: A→{B,C}이면 A 먼저). A 머지 시 GitHub 가 B·C 를 dev 로 자동 retarget 하지 않으면 `gh pr edit B --base dev` 로 수동 retarget.
- 한 PR 을 dev 에 머지할 때마다 dev 가 바뀌어 **나머지 PR 의 change_log 가 새로 충돌**한다(직렬화). 그래서 "하나씩".

## 3. PR별 머지 사이클 (이 순서 그대로)
1. **dev 병합으로 required CI(`ci-quality.yml`) 유입** — 구 브랜치는 head 에 `ci-quality.yml` 이 없어 `Lint (ruff)`·`Secret scan (gitleaks)` 가 안 돌고 영원히 "Expected"로 차단됨. 반드시 dev 를 head 에 들여야 함.
   - **충돌 없음**(`mergeable=MERGEABLE`): `gh api -X PUT repos/<owner/repo>/pulls/N/update-branch` (worktree 불필요).
   - **충돌**(`CONFLICTING`): worktree 격리 후 로컬 병합·해소(§4):
     ```bash
     git fetch origin <head> dev --quiet
     git worktree add -B <head> /tmp/wt-N origin/<head>
     git -C /tmp/wt-N merge origin/dev --no-edit        # 충돌 발생
     # …§4 해소…
     git -C /tmp/wt-N commit --no-edit && git -C /tmp/wt-N push origin <head>
     ```
2. **CI 대기**: `gh pr checks N --repo <owner/repo> --watch --interval 30`(백그라운드 권장). required **4종** green 확인:
   `Lint (ruff)`·`Secret scan (gitleaks)`·`Backend CI`·`Frontend CI`. (non-blocking 3종 pip-audit/bandit+semgrep/trivy 의 FAILURE 는 무관.)
3. **머지**: `gh pr merge N --repo <owner/repo> --squash --admin`.
   - `--squash`: 레포가 squash-only.
   - `--admin`: dev 보호의 `required_approving_review_count=1` 은 1인 운영이라 충족 불가 → admin 우회. **단 required CI 4종은 반드시 green**(우회 대상은 리뷰요건뿐).
4. **배포 확인**(코드 PR 만): `gh run list --workflow deploy.yml --limit 1 --json databaseId,headSha,status` 로 run id → `gh run watch <id> --exit-status`. success 확인 후 다음 PR. (docs/.gitignore/.github 전용이면 배포 없음 → 생략.)
5. **정리**: `git worktree remove /tmp/wt-N`; `git branch -D <head>`; `git fetch --prune origin`.

## 4. 충돌 해소 패턴
- **`change_log.md`(거의 항상 충돌)**: **union** — 양쪽 행 모두 보존, 마커 제거. dev 블록(theirs) + PR 고유 행(ours):
  ```bash
  python3 - <<'PY'
  p='wiki_docs/change_log.md'; L=open(p,encoding='utf-8').readlines(); o=[]; i=0
  while i<len(L):
      if L[i].startswith('<<<<<<<'):
          i+=1; ours=[]
          while not L[i].startswith('======='): ours.append(L[i]); i+=1
          i+=1; theirs=[]
          while not L[i].startswith('>>>>>>>'): theirs.append(L[i]); i+=1
          i+=1; o+=theirs+ours          # dev 위, PR 고유행 아래
      else: o.append(L[i]); i+=1
  open(p,'w',encoding='utf-8').writelines(o)
  PY
  ```
  ⚠️ stacked PR 은 ours-block 에 이미 dev 에 있는 행이 섞여 **중복**될 수 있음 → ours-block 확인(고유 행만 있는지). 보통 PR 당 고유 행 1~2개.
- **stacked-squash 발산**(base 를 squash 머지하면 child 가 공유 파일을 `AA`(add/add)로 충돌): **`git diff origin/dev origin/<head> -- <file>` 로 회귀 vs 의도변경 판별**:
  - **회귀**(child 가 옛 버전; dev 가 하드닝 상위집합) → `git checkout --theirs <file>`(dev 채택). 예: BucketKeyEnabled 버그·옛 sed·비멱등·벤더 오기.
  - **child 의 의도적 변경**(dev 에 없는 고유 기여) → `git checkout --ours <file>`. 예: notifier 공용분리 refactor.
  - **문서가 dev분+child분 둘 다 필요**(tangled) → dev 버전(theirs) 베이스 + child 고유분만 splice(Edit), 또는 child(ours) + dev 회귀줄만 수정.
  - **child 고유 신규 파일**은 충돌 없이 추가됨 → 보존.
- **시크릿 스캔 오탐**(gitleaks 는 무시하나 자체 grep 이 잡는 것): AWS **계정 ID**(버킷명 `…-<acct>…-…`)·인스턴스 ID(`i-…`)·`password=`(문서 설명)·`REDISCLI_AUTH="$VAR"`(환경변수 참조)=**오탐**(이 repo 는 계정/인스턴스 ID 노출 유지 결정). 실제 차단 대상=평문 비번(`<plaintext-pw>…`)·`AKIA…`·`sk-…` 같은 **값**. 매치 시 `grep -noE` 로 토큰+컨텍스트 확인 후 판단. 최종 권위=CI `Secret scan (gitleaks)`.

## 함정 (Pitfalls)
- **GitHub 일시 `CONFLICTING` 글리치**: dev 머지 직후 GitHub 가 전 열린 PR 의 mergeability 를 재계산하며, 한 PR 이 **stale CONFLICTING** 으로 잘못 잡혀 `pull_request` 체크가 안 도는(롤업에 CodeQL 만) 경우 발생. git 으로 `git merge-base --is-ancestor origin/dev <head>` = clean 인데 GitHub 만 CONFLICTING 이면 → **`gh pr close N && gh pr reopen N`**(`reopened` 이벤트가 ci-quality/pr-ci 재트리거; 커밋·내용 변경 0).
- **update-branch 가 422 conflict**: 진짜 충돌 → worktree 경로(§3-1 CONFLICTING)로.
- **required CI 미실행**: head 에 `ci-quality.yml` 없음 → dev 병합 선행. 안 하면 "Expected" 무한 대기.
- **squash 가 stacked child 발산**: 예상하고 retarget+§4 해소.
- **다른 사람 PR·범위 밖 PR 머지**: 금지(HARD GATE 1).
- **배포 누락 확인**: 코드 PR 머지 후 deploy.yml success 미확인 채 다음 머지 → dev-first 위반.

## 검증 (각 PR 해소 후, 커밋 전)
```bash
git -C /tmp/wt-N diff --name-only --diff-filter=U | wc -l      # 미해결 경로 = 0
grep -rcE '^(<<<<<<<|=======|>>>>>>>)' wiki_docs/ scripts/ | grep -v ':0'   # 충돌 마커 = 0
# 시크릿(값) 스캔 — 매치 시 오탐/실제 판별
grep -rnoE '<plaintext-pw>|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20}' <변경파일>   # = 0
```
머지 후: `gh pr view N --json state --jq .state` = `MERGED`; 코드면 deploy run `conclusion=success`.

## Success Criteria
- 대상 PR 전부 dev MERGED(본인 PR 만), required CI 4종 green, 코드 PR 배포 success.
- 충돌 해소에서 회귀 0(dev 하드닝 보존) + 각 PR 고유 산출물 보존, 시크릿 0.
- 타인/범위 밖 PR 미처리(보고만), worktree/브랜치 정리 완료.

> 관련: `pr-join-us`(PR 생성·push, 이 스킬의 선행) · [[merge-only-own-prs]] · [[branch-protection-and-merge-mechanics]] · [[dev-first-then-prod-gate]] · [[wiki-changelog-rule]] · [[no-push-without-permission]] · [[no-ai-coauthor-trailer]] · [[gh-account-has-repo-admin]].
