---
name: post-wiki-join-us
description: >-
  joinus(<OWNER>/<REPO>)의 라이브 GitHub Wiki
  (https://github.com/<OWNER>/<REPO>/wiki)에 정본 `wiki_docs/` 페이지를
  실제로 게시(post)/갱신한다 — `.wiki.git` 미러로 신규 페이지 생성·기존 페이지 갱신·Home 네비 정리·
  Change-Log 동기화. 슬러그 명명·H1 처리·시크릿 0 스캔·게시 후 재클론 검증 포함.
  사용자가 "위키에 올려/게시/post/반영해", "GitHub Wiki 업데이트", "wiki_docs를 위키에 동기화",
  "방금 만든 문서 위키에도", "/post-wiki-join-us" 라고 하면 **반드시** 이 스킬을 쓴다.
  로컬 wiki_docs/ 만 쓰는 append-wiki, Change-Log 만 미러하는 scripts/sync_wiki.sh 와 달리
  **임의 페이지를 라이브 GitHub Wiki 로 push** 한다. 위키 push 는 배포(CI/CD)를 트리거하지 않지만
  outward-facing 게시이므로 push 승인·시크릿 0 게이트를 항상 적용한다.
---

# post-wiki-join-us — joinus GitHub Wiki 게시/갱신

## ⚙️ 설정 (필수 — 플레이스홀더 해소)

이 스킬 본문의 `<OWNER>/<REPO>`·`<my-gh-login>`·`<git-author-name>`·`<project-root>` 등은 **범용화 플레이스홀더**다. 실행 전 반드시 실제 값으로 해소한다:

1. **설정 파일 로드**(KEY=value, 첫 발견 우선): `$JOINUS_CONFIG` → `./.join-us.env` → `~/.config/join-us/config.env`. `set -a; . <file>` 로 export 하거나 값을 읽어 치환한다. 템플릿 = `config/join-us.env.example`(`join-us config --init` 로 생성).
2. **설정이 없으면 사용자에게 1회 질문**해 값을 확보(인터랙션)하고 같은 세션 동안 재사용한다.

치환표: `<OWNER>/<REPO>`→`$JOINUS_REPO` · `<my-gh-login>`→`$JOINUS_GH_LOGIN`(구계정=`$JOINUS_GH_LOGIN_ALT`) · `<git-author-name>`→`$JOINUS_AUTHOR_NAME` · `<project-root>`→`$JOINUS_PROJECT_ROOT` · `<project-domain>`→`$JOINUS_WIKI_DOMAIN` · 팀원 제외 목록→`$JOINUS_TEAM_LOGINS` · `<plaintext-pw>`(알려진 평문 시크릿 스캔 패턴)→`$JOINUS_SECRET_PATTERNS`.

> ⚠️ 실값 설정 파일은 **비공개**(별도 관리) — 절대 커밋/게시하지 않는다. 공개본엔 `*.example`(플레이스홀더)만 포함된다. 본문의 "시크릿 0" 게이트는 그대로 유지한다.


## 무엇을 하나
repo 의 정본 `wiki_docs/` 문서를 **라이브 GitHub Wiki**(`.wiki.git` 미러)에 반영한다. 신규 위키 페이지를 만들거나 기존 페이지를 갱신하고, `Home` 네비게이션을 정리하며, `Change-Log` 를 동기화한다. 핵심 파이프라인(clone→변환→시크릿스캔→commit→push→검증)은 `scripts/post_wiki.sh` 가 처리하고, 이 문서는 **무엇을 어떤 슬러그로 올릴지·Home 을 어떻게 정리할지** 같은 판단을 안내한다.

## ⛔ 게이트 (어기면 중단)
1. **push 승인 = outward-facing 게시.** 이 스킬 호출/사용자의 "위키 올려" 요청 자체가 위키 push 승인이다. 단 위키는 별도 repo(`.wiki.git`)라 **메인 repo 의 dev/main 머지·배포와 무관**하다(위키 push 는 CI/CD 를 트리거하지 않음). 그래도 공개 게시이므로 시크릿 게이트는 항상 건다.
2. **시크릿 0.** 게시 전 항상 스캔한다. 위키는 (repo 처럼) private 이지만 실제 비밀(비밀번호·토큰·private key)은 절대 올리지 않는다. `post_wiki.sh` 가 정의 명확한 키/토큰은 하드페일, `password=`/`token=` 류 의심 값은 경고한다 — 경고가 뜨면 플레이스홀더인지 **사람이 눈으로 확인**하고 진행. 인프라 ID(계정·인스턴스·버킷)는 "의도된 설계, 비밀 아님"이라 통과시킨다.
3. **정본은 `wiki_docs/`.** 위키는 단방향 미러다. 위키만 손으로 고치지 말 것(repo 와 어긋난다). 내용 변경은 `wiki_docs/` 에서 하고(필요시 append-wiki) 이 스킬로 반영한다. 이 스킬이 위키에서 직접 손편집하는 건 **`Home` 네비 한정**(정본에 Home 이 없을 때).
4. **커밋에 AI 공동작성자 트레일러(`Co-Authored-By: Claude ...`) 금지** (팀 규칙). 스크립트가 강제한다.

## 개념 (왜 이렇게 하나)
- GitHub Wiki 는 **별도 git repo** `…/<repo>.wiki.git`(기본 브랜치 `master`)다. 페이지 = 그 repo 의 `<Slug>.md` 파일. URL/사이드바 이름이 슬러그에서 나온다.
- **페이지 생성 REST API 가 없다.** 빈 위키는 GitHub 웹UI 에서 첫 페이지를 1회 만든 뒤라야 `.wiki.git` clone/push 가 된다.
- 위키는 정적 미러라 `wiki_docs/` 가 바뀔 때마다 **재push** 해야 최신이 된다.

## 워크플로
1. **범위 확정**: 어떤 `wiki_docs/` 페이지를, 어떤 슬러그로 올릴지 매핑을 정한다. 어느 브랜치의 `wiki_docs/` 를 정본으로 쓸지(보통 현재 체크아웃) 확인. **미배포/미머지 내용을 사실처럼 게시하지 않도록** 주의(예: 라이브에 없는 기능 설명).
2. **미리보기(dry-run)**: 먼저 `--dry-run` 으로 변환·시크릿스캔·diff 를 확인한다.
   ```bash
   scripts/post_wiki.sh --dry-run \
     backup_restore_runbook.md:Backup-Restore-Runbook \
     change_log.md:Change-Log:strip-h1
   ```
3. **Home 네비(선택)**: 새 페이지를 사이드바 외에 Home 에서도 찾게 하려면, `--dry-run --keep` 으로 clone 을 남기고 그 안의 `Home.md` 를 편집(위키에 있는 페이지는 `[[제목|슬러그]]` 링크로) 한 뒤 이어서 게시한다.
   ```bash
   scripts/post_wiki.sh --dry-run --keep <매핑들>     # → [keep] clone 경로 출력
   # 출력된 clone 의 Home.md 를 편집(새 페이지 링크 추가)
   scripts/post_wiki.sh --from-clone <clone경로> --msg "docs(wiki): … 페이지 추가 + Home"
   ```
4. **게시**: 단순 케이스(Home 손질 불필요)면 한 번에.
   ```bash
   scripts/post_wiki.sh --msg "docs(wiki): … (#PR)" <매핑들>
   ```
   스크립트가 clone→변환→스캔→commit→push→**재클론 검증**까지 하고 임시 clone 을 지운다.
5. **보고**: 반영된 페이지 URL(`…/wiki/<Slug>`)을 사용자에게 알린다.

## 컨벤션
| 항목 | 규칙 |
|---|---|
| 슬러그 명명 | Title-Case-Hyphenated. `backup_restore_runbook.md` → `Backup-Restore-Runbook`. 기존 `Change-Log` 와 일관 |
| H1 처리 | 기본 **보존**. 단 선두 H1 이 슬러그 제목과 **중복**되면(예: `change_log.md` 의 `# Change Log` ↔ 페이지 "Change Log") `:strip-h1` 로 제거. 의미있는 설명 H1(예: `# 백업 · 복구 런북`)은 보존 |
| 시크릿 | 게시 전 스캔 0. 하드페일=AWS키/토큰/private key; 의심값=경고(사람 확인). 인프라 ID 는 통과 |
| 커밋 | conventional(한국어), AI 공동작성자 트레일러 없음 |
| Home 네비 | 위키에 실제로 있는 페이지만 `[[제목|슬러그]]` 링크. repo 에만 있는 문서는 파일명 텍스트로 나열(링크 X) |

## 검증 (게시 = 끝 아님)
- `post_wiki.sh` 가 게시 후 **새 clone 으로 페이지 목록을 재확인**한다. 출력에 올린 슬러그가 보이는지 확인.
- 추가로 의심되면 `…/wiki/<Slug>` 를 직접 열어 H1·표·링크 렌더링을 본다.

## 함정
- **`[bot]`/슬러그 오타**가 아니라 — 여기선 **빈 위키 초기화**가 가장 흔한 막힘: clone 이 실패하면 웹UI 로 첫 페이지 1회 생성 후 재시도(REST API 없음).
- **미머지/미배포 내용 게시**: stacked PR 의 한 브랜치만 정본으로 쓰면 다른 브랜치의 정정(예: vendor 수정)이 빠질 수 있다 → 정확한 브랜치를 정본으로 고르거나, 머지 후 동기화.
- **위키 cross-ref**: `wiki_docs/` 의 ``` `other_file.md` ``` 참조는 위키에서 클릭 링크가 아니라 코드 텍스트로 렌더된다(깨지진 않음). 진짜 위키 링크가 필요하면 `[[제목|슬러그]]` 로 바꾼다.
- **얕은 clone push**: 보통 문제없지만 `shallow update not allowed` 가 뜨면 전체 clone 후 재시도.
