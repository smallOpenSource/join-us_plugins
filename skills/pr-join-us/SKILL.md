---
name: pr-join-us
description: joinus(<OWNER>/<REPO>) PR 컨벤션을 준수해 feature/fix 브랜치에 커밋·push 하고 PR 생성/갱신 후 Copilot 재리뷰를 요청한다. dev/main 직접 push 는 금지(머지로만 반영).
triggers:
  - pr-join-us
  - /pr-join-us
  - 조인어스 PR
  - joinus PR
  - PR 올려 / PR 등록
  - 코파일럿 리뷰 요청 / copilot 재리뷰
---

# pr-join-us — joinus PR 등록 + Copilot 리뷰 요청

## Purpose

joinus 저장소(`<OWNER>/<REPO>`)에서 변경분을 **팀 PR 컨벤션대로** 커밋·푸시하고, PR 을 생성(또는 기존 PR 갱신)한 뒤 **Copilot 자동 리뷰를 (재)요청**한다. 신규 커밋은 Copilot 자동 재리뷰가 보장되지 않으므로 명시 재요청이 핵심.

## When to Use

- joinus 작업 결과를 PR 로 올리거나 기존 PR 에 반영분을 추가할 때
- 리뷰 수정 반영 후 Copilot 재리뷰가 필요할 때
- 사용자가 "PR 올려", "코파일럿 리뷰 요청", "/pr-join-us" 명시

## ⛔ HARD GATES (어기면 중단)

1. **PR 등록은 push 를 포함한다 — 이 스킬 호출(또는 사용자의 PR 요청) 자체가 feature/fix 브랜치 push 승인이다.** 매번 "push 해도 되냐" 재확인하지 말고 진행한다. 단:
   - **`dev`/`main` 에 직접 push 금지.** 배포가 트리거된다. PR 은 feature/fix → `dev` **머지**로만 반영. feature 브랜치 push 는 배포를 트리거하지 않는다.
   - push 직전 현재 브랜치가 feature/fix 인지 확인(`git rev-parse --abbrev-ref HEAD`). dev/main 이면 중단하고 브랜치부터.
   - 스킬 호출/PR 요청이 **없는** 임의 상황에서는 push 금지(커밋까지만 후 보고). (메모리 `no-push-without-permission`)
2. **스테이징은 경로 명시로만.** `git add -A`/`git add .` 금지. 의도한 파일만 stage 하고 `git status` 로 무관한 변경(예: `.gitignore`, `.env*`, lockfile)이 섞이지 않았는지 확인.
3. **커밋 금지 대상**: `_bak/`, `.env`/`*.env*`, dev DB 비밀번호(`<plaintext-pw>` 등 시크릿), `work/`·`db_data/`(gitignore 산출물). 작업 지시에 "backend/frontend 소스 무수정" 같은 제약이 있으면 그 경로도 제외.

## 컨벤션 (팀 규칙)

- **브랜치**: `feature/이슈번호-기능` · `fix/이슈번호-버그` · `refactor/이슈번호-리팩토링`. **dev 에서 분기.** base=`dev`(main 은 배포 시에만).
- **커밋**: conventional commits (`feat|fix|docs|style|refactor|test|chore`), 한국어 제목. 성격이 다르면 커밋 분리(예: 로직 `fix:` + 문서 `docs:`). **AI 공동작성자 트레일러(`Co-Authored-By: Claude ...`)는 붙이지 않는다** (사용자 지시, 2026-05-27).
- **PR 본문 양식** (반드시 포함):
  ```
  ## 작업 내용
  ## 변경 사항
  ## 테스트 방법
  ## 관련 이슈
  closes #<이슈번호>
  ```
  `closes #N` 은 머지 시 이슈 자동 종료.
- **리뷰/머지**: dev 머지 전 **사람 리뷰어 ≥1명 승인 필수**. 수정 요청 반영 후 재리뷰 요청. main 머지는 가능한 **squash and merge**(dev 는 강제 아님).

## Workflow

### 1. 승인·범위 확인
- push 승인 여부 확인(없으면 커밋까지만). 대상 파일 목록 확정.

### 2. 브랜치
```bash
git rev-parse --abbrev-ref HEAD               # 현재 브랜치
# 신규면 dev 기준으로: git switch dev && git pull && git switch -c feature/<이슈>-<기능>
```

### 3. 스테이징(명시 경로) + 검증
```bash
git add <파일1> <파일2> ...
git status --short          # 무관 변경 섞임 없는지 확인 (HARD GATE 2)
git --no-pager diff --cached --stat
```

### 4. 커밋 (성격별 분리, AI 공동작성자 트레일러 없음)
```bash
git commit -m "fix: <제목>" -m "<본문 불릿>"
```

### 5. 푸시 (승인 시에만)
```bash
git fetch origin <branch>
git rev-list --left-right --count origin/<branch>...HEAD   # divergence 점검
git push origin <branch>
```
- 기존 PR 의 head 브랜치면 **PR 이 자동 갱신**(별도 회수 불필요). 히스토리 재작성 시에만 `--force-with-lease`.

### 6. PR 생성(신규) — 기존 PR 이면 건너뜀
```bash
gh pr create --base dev --head <branch> --title "<type>: <요약>" --body "$(cat <<'EOF'
## 작업 내용
...
## 변경 사항
...
## 테스트 방법
...
## 관련 이슈
closes #<이슈>
EOF
)"
```

### 7. Copilot 재리뷰 요청 ★핵심 노하우
```bash
gh api --method POST repos/{owner}/{repo}/pulls/<PR번호>/requested_reviewers \
  -f "reviewers[]=copilot-pull-request-reviewer[bot]"
```
- **반드시 `[bot]` 접미사.** plain `copilot-pull-request-reviewer` 는
  `422 "Reviews may only be requested from collaborators"` 로 실패한다.
- `gh` 가 `{owner}/{repo}` 를 현재 저장소로 치환.

### 8. 검증
- PR 커밋 수 증가 확인: `gh pr view <PR> --json commits --jq '.commits|length'`
- 재리뷰 등록 확인: 응답 JSON 의 `requested_reviewers` 에
  `{"login":"Copilot","type":"Bot"}` 존재.
- 반영된 기존 인라인 코멘트는 GitHub UI 에서 "Resolve conversation" 으로 정리(선택).

## Success Criteria

- 의도한 파일만 커밋됨(무관 변경·시크릿 미포함).
- 커밋 메시지가 conventional 준수(AI 공동작성자 트레일러 없음).
- push 는 사용자 승인 하에 수행되어 PR 갱신/생성됨.
- `requested_reviewers` 에 Copilot Bot 이 등록됨(재리뷰 트리거).
- (신규 PR 시) 본문이 4섹션 + `closes #N` 양식.

## Pitfalls

- **Copilot login `[bot]` 누락 → 422.** 이게 가장 자주 막히는 지점.
- `git add -A` 로 `.gitignore`/`.env`/lockfile/`_bak` 가 딸려 들어감 → 경로 명시로 방지.
- 신규 커밋만 push 하면 Copilot 이 자동 재리뷰 안 할 수 있음 → 명시 재요청 필요.
- Copilot 승인은 사람 리뷰어 ≥1명 요건을 **대체하지 못함**.
- feature 브랜치 push 가 배포를 트리거하는지는 워크플로 설정에 의존 — 그래도 push 승인 게이트는 항상 적용.

## 검증 근거 (이 노하우의 출처)

- 2026-05-25 PR #163: plain login → `422 not a collaborator`, `copilot-pull-request-reviewer[bot]` → 성공(응답에 `requested_reviewers:[{login:"Copilot",type:"Bot"}]`). 커밋 2건(`fix:`/`docs:`) 분리·트레일러·경로 명시 스테이징으로 무관한 `.gitignore` 제외, PR 4→6 커밋 갱신.
