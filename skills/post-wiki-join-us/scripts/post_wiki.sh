#!/bin/bash
# post_wiki.sh — joinus 의 정본 wiki_docs/ 페이지를 GitHub Wiki(.wiki.git)에 게시/갱신한다.
#   정본(Source of Truth) = repo 의 wiki_docs/. 위키는 단방향 미러다.
#   위키 push 는 메인 repo 가 아니므로 배포(CI/CD)를 트리거하지 않는다 — 단 outward-facing 게시다.
#
# 사용:
#   post_wiki.sh [--dry-run] [--keep] [--from-clone DIR] [--msg "메시지"] MAPPING...
#     MAPPING = <wiki_docs상대경로>:<위키슬러그>[:strip-h1]
#       예) backup_restore_runbook.md:Backup-Restore-Runbook
#           change_log.md:Change-Log:strip-h1   # 선두 H1+빈줄 제거(페이지명과 중복 방지)
#
#   기본(플래그 없음) = 한 번에 게시: clone → 변환 → 시크릿스캔 → commit → push → 검증 → 정리.
#   --dry-run        : 변환·스캔·diff 까지만(push 안 함).
#   --keep           : clone 디렉터리를 남긴다. dry-run 과 함께 쓰면 Home.md 등 네비를 손편집한 뒤
#                      --from-clone 으로 이어서 게시할 수 있다.
#   --from-clone DIR : 이미 준비된(=손편집 포함) clone 을 재스테이징 → 스캔 → commit → push → 검증.
#   --msg "..."      : 커밋 메시지. 미지정 시 기본값. **AI 공동작성자 트레일러는 붙이지 않는다(팀 규칙).**
#
# 전제: origin 이 GitHub repo, git 자격증명으로 위키 push 권한 보유, 위키가 1회 이상 초기화됨
#       (빈 위키는 GitHub 웹UI 에서 첫 페이지를 1회 생성한 뒤 — 위키 페이지 생성 REST API 없음).
set -euo pipefail

DRY=0; KEEP=0; FROM_CLONE=""; MSG=""; MAPPINGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --keep) KEEP=1; shift ;;
    --from-clone) FROM_CLONE="${2:?--from-clone 에 디렉터리 필요}"; shift 2 ;;
    --msg) MSG="${2:?--msg 에 메시지 필요}"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "[error] 알 수 없는 옵션: $1" >&2; exit 2 ;;
    *) MAPPINGS+=("$1"); shift ;;
  esac
done

command -v git >/dev/null || { echo "[error] git 필요" >&2; exit 1; }
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO_ROOT" ] || { echo "[error] git repo 안(정본 wiki_docs/ 가 있는)에서 실행하세요" >&2; exit 1; }
WIKI_DOCS="$REPO_ROOT/wiki_docs"
[ -d "$WIKI_DOCS" ] || { echo "[error] 정본 디렉터리 없음: $WIKI_DOCS" >&2; exit 1; }

derive_wiki_url() {
  local o; o="$(git -C "$REPO_ROOT" remote get-url origin)"
  case "$o" in *.git) echo "${o%.git}.wiki.git" ;; *) echo "${o%/}.wiki.git" ;; esac
}

# 시크릿 게이트: 정의가 명확한 비밀(키/토큰)은 하드페일, 의심 키워드는 경고만(오탐 차단 회피).
#   인프라 ID(계정/인스턴스/버킷)는 '의도된 설계, 비밀 아님' 정책이라 통과시킨다.
secret_scan() {  # dir
  local hits
  hits="$(grep -rnEi 'AKIA[0-9A-Z]{16}|aws_secret_access_key|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[0-9A-Za-z]{8,}|gh[pousr]_[0-9A-Za-z]{30,}' \
          --include='*.md' "$1" 2>/dev/null || true)"
  if [ -n "$hits" ]; then echo "[STOP] 시크릿 패턴 발견 — 게시 중단:" >&2; printf '%s\n' "$hits" >&2; return 1; fi
  # 의심 키워드(값이 붙은 password/token/secret/key)는 사람이 눈으로 확인하도록 경고만.
  local warn
  warn="$(grep -rnEi '(password|passwd|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*[^[:space:]<$"'\''#}]{6,}' \
          --include='*.md' "$1" 2>/dev/null || true)"
  [ -n "$warn" ] && { echo "[warn] 비밀로 의심되는 값 줄 — 게시 전 직접 확인(플레이스홀더면 무시):" >&2; printf '%s\n' "$warn" >&2; }
  echo "[ok] 시크릿 하드페일 패턴 0"
}

strip_h1() {  # src dst : 선두 H1 한 줄 + 바로 뒤 빈 줄 제거(sync_wiki.sh 와 동일 규약)
  awk 'NR==1 && /^# / {d=1; next} d==1 && /^[[:space:]]*$/ {next} {d=0; print}' "$1" > "$2"
}

stage_mappings() {  # clonedir
  local clone="$1" m src slug mode
  for m in "${MAPPINGS[@]}"; do
    IFS=: read -r src slug mode <<<"$m"
    [ -n "$src" ] && [ -n "$slug" ] || { echo "[error] 잘못된 MAPPING: $m (형식 src:Slug[:strip-h1])" >&2; return 1; }
    [ -f "$WIKI_DOCS/$src" ] || { echo "[error] 정본 없음: wiki_docs/$src" >&2; return 1; }
    if [ "${mode:-}" = "strip-h1" ]; then strip_h1 "$WIKI_DOCS/$src" "$clone/$slug.md"
    else cp "$WIKI_DOCS/$src" "$clone/$slug.md"; fi
    echo "  + wiki_docs/$src -> $slug.md${mode:+ ($mode)}"
  done
}

publish() {  # clonedir
  local clone="$1" url
  secret_scan "$clone" || return 1
  git -C "$clone" add -A
  if git -C "$clone" diff --cached --quiet; then echo "[skip] 반영할 변경 없음(위키 이미 최신)"; return 0; fi
  echo "=== 게시될 변경 ==="; git -C "$clone" --no-pager diff --cached --stat
  git -C "$clone" -c commit.gpgsign=false commit -q -m "${MSG:-docs(wiki): wiki_docs 정본 동기화}"
  git -C "$clone" push -q origin HEAD
  url="$(derive_wiki_url)"; echo "[done] 위키 반영 완료 -> ${url%.wiki.git}/wiki"
}

verify() {  # 새 clone 으로 실제 반영 확인(읽기전용)
  local url tmp; url="$(derive_wiki_url)"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/joinus-wiki-verify-XXXXXX")"
  if git clone -q --depth 1 "$url" "$tmp" 2>/dev/null; then
    echo "=== 검증: 라이브 위키 페이지 목록 ==="; ls -1 "$tmp" | grep -v '^\.git$' || true
  else echo "[warn] 검증 clone 실패(권한/네트워크?)"; fi
  rm -rf "$tmp"
}

# ── 손편집한 clone 을 이어서 게시 ──
if [ -n "$FROM_CLONE" ]; then
  [ -d "$FROM_CLONE/.git" ] || { echo "[error] --from-clone 가 git clone 이 아님: $FROM_CLONE" >&2; exit 1; }
  publish "$FROM_CLONE"; verify
  [ "$KEEP" = 1 ] || rm -rf "$FROM_CLONE"
  exit 0
fi

[ ${#MAPPINGS[@]} -gt 0 ] || { echo "[error] MAPPING 이 필요합니다 (src:Slug[:strip-h1])" >&2; exit 2; }
WIKI_URL="$(derive_wiki_url)"
CLONE="$(mktemp -d "${TMPDIR:-/tmp}/joinus-wiki-XXXXXX")"
echo "[post_wiki] wiki = $WIKI_URL"
git clone -q "$WIKI_URL" "$CLONE" 2>/dev/null || {
  echo "[error] 위키 clone 실패. 빈 위키면 ${WIKI_URL%.wiki.git}/wiki 에서 첫 페이지를 1회 생성 후 재시도." >&2
  rm -rf "$CLONE"; exit 1; }

echo "=== 페이지 변환/스테이징 (정본 wiki_docs/) ==="
stage_mappings "$CLONE" || { rm -rf "$CLONE"; exit 1; }

if [ "$DRY" = 1 ]; then
  git -C "$CLONE" add -A
  echo "=== [dry-run] 반영 예정 diff (push 안 함) ==="; git -C "$CLONE" --no-pager diff --cached --stat
  secret_scan "$CLONE" || { rm -rf "$CLONE"; exit 1; }
  if [ "$KEEP" = 1 ]; then
    echo "[keep] clone 보존: $CLONE"
    echo "  ↳ Home.md 등 네비 손편집 후 게시:  $0 --from-clone \"$CLONE\" --msg \"docs(wiki): ...\""
  else rm -rf "$CLONE"; fi
  exit 0
fi

publish "$CLONE"; verify
rm -rf "$CLONE"
