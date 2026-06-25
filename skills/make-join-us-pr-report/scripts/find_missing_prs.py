#!/usr/bin/env python3
"""make-join-us-pr-report 권위 소스 누락 탐지기 (v1.3 — config-driven).

GitHub repo 의 PR 목록(권위 소스)에서 본인(JOINUS_GH_LOGIN*) PR 을 모아
  [A] SR/reports/ 미작성   [B] change_log.md 누락   [C] change_log엔 있으나 GitHub 매칭 실패
세 갈래를 대조한다. 리포트 생성 대상([A])을 JSON 으로도 내보낸다.

⚙️ 설정(필수): repo·계정·project-root 는 코드에 박지 않고 설정에서 온다.
  우선순위  $JOINUS_CONFIG -> ./.join-us.env -> ~/.config/join-us/config.env  (KEY=value)
  또는 환경변수 직접:  JOINUS_REPO=owner/repo  JOINUS_GH_LOGIN=login  JOINUS_PROJECT_ROOT=/path
  템플릿:  config/join-us.env.example   (실제 env 변수가 파일 값보다 우선)
  미설정 시 플레이스홀더(<OWNER>/<REPO> 등)가 남아 친절한 에러로 중단한다.

전제: gh CLI 인증 필요. 표준 라이브러리 + gh 만 사용.

사용:
  python3 find_missing_prs.py                          # dev-merged·B안 기본
  python3 find_missing_prs.py --json /tmp/todo.json     # 생성대상 JSON 도 출력
  python3 find_missing_prs.py --base all --include-cl-meta   # 전 base·메타 포함
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

PLACEHOLDER_RE = re.compile(r"<[A-Za-z0-9_./-]+>")


def load_config():
    """KEY=value 설정 해소(파일 → dict). 실제 env 변수가 파일보다 우선.
    우선순위: $JOINUS_CONFIG -> ./.join-us.env -> ~/.config/join-us/config.env."""
    cfg = {}
    candidates = [
        os.environ.get("JOINUS_CONFIG"),
        os.path.join(os.getcwd(), ".join-us.env"),
        os.path.join(os.path.expanduser("~"), ".config", "join-us", "config.env"),
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            for line in open(path, encoding="utf-8"):
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                cfg[k.strip()] = v.strip()
            break
    for k in ("JOINUS_REPO", "JOINUS_GH_LOGIN", "JOINUS_GH_LOGIN_ALT", "JOINUS_PROJECT_ROOT"):
        if os.environ.get(k):
            cfg[k] = os.environ[k]
    return cfg


CFG = load_config()
DEF_REPO = CFG.get("JOINUS_REPO", "<OWNER>/<REPO>")
DEF_ROOT = CFG.get("JOINUS_PROJECT_ROOT", "<project-root>")
DEF_REPORTS = os.path.join(DEF_ROOT, "SR", "reports")
DEF_CHANGELOG = os.path.join(DEF_ROOT, "wiki_docs", "change_log.md")
# author prefix = login(+alt)의 공통 접두어 → 구/신 계정 모두 prefix 매칭.
_LOGINS = [CFG.get("JOINUS_GH_LOGIN", ""), CFG.get("JOINUS_GH_LOGIN_ALT", "")]
KNOWN_LOGINS = {x.lower() for x in _LOGINS if x}        # exact author set (precise default)
DEF_AUTHOR_PREFIX = os.path.commonprefix([x for x in _LOGINS if x]) or "<my-gh-login>"


def gh_prs(repo, limit):
    cmd = [
        "gh", "pr", "list", "--repo", repo, "--state", "all",
        "--json", "number,author,state,title,url,mergedAt,createdAt,baseRefName",
        "--limit", str(limit),
    ]
    out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         universal_newlines=True)  # py3.6 호환(capture_output/text 미사용)
    if out.returncode != 0:
        sys.exit(f"[find_missing_prs] gh 실패 — 인증/네트워크 확인:\n{out.stderr.strip()}")
    return json.loads(out.stdout)


def is_cl_meta(title):
    """change_log 미러/기록 메타 PR(B안 제외 대상)."""
    return bool(re.search(r"change[_ ]?log", title, re.I))


def reports_covered(reports_dir):
    """SR/reports/ 파일명 앞쪽 연속 숫자 토큰 = 커버 PR 번호(묶음 파일 N_M_... 포함)."""
    covered = set()
    for p in glob.glob(os.path.join(reports_dir, "*.md")):
        fn = os.path.basename(p)
        if fn in ("index.md", "README.md") or fn.startswith("op_"):
            continue
        for tok in fn.split("_"):
            if tok.isdigit():
                covered.add(int(tok))
            else:
                break
    return covered


def changelog_prs(changelog, author_prefix):
    nums = set()
    if not os.path.exists(changelog):
        return nums
    for line in open(changelog, encoding="utf-8"):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or cells[0] in ("날짜", "---"):
            continue
        if not cells[1].lower().startswith(author_prefix):
            continue
        m = re.match(r"#(\d+)", cells[2])
        if m:
            nums.add(int(m.group(1)))
    return nums


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=DEF_REPO)
    ap.add_argument("--reports", default=DEF_REPORTS)
    ap.add_argument("--changelog", default=DEF_CHANGELOG)
    ap.add_argument("--author-prefix", default=DEF_AUTHOR_PREFIX,
                    help="미지정 시 JOINUS_GH_LOGIN[_ALT] 정확 집합으로 매칭(정밀). 명시하면 그 prefix 로 startswith 매칭")
    ap.add_argument("--base", default="dev",
                    help="머지 대상 브랜치 필터(기본 dev). 'all'=base 무관(release/main 포함)")
    ap.add_argument("--include-cl-meta", action="store_true",
                    help="change_log 미러/기록 메타 PR 도 포함(기본 제외 — B안)")
    ap.add_argument("--include-open", action="store_true", help="OPEN PR 도 생성대상에 포함")
    ap.add_argument("--include-closed", action="store_true",
                    help="CLOSED(미머지) PR 도 포함(기본 제외 — 트라이얼/superseded)")
    ap.add_argument("--limit", type=int, default=2000)
    ap.add_argument("--json", dest="json_out", default=None, help="생성대상 목록 JSON 출력 경로")
    args = ap.parse_args()

    # 설정 미해소 가드: 플레이스홀더가 남았으면 친절히 중단(조용히 <OWNER>/<REPO> 로 gh 호출 금지).
    unresolved = [name for name, val in (("--repo", args.repo),
                                         ("--author-prefix", args.author_prefix),
                                         ("--reports", args.reports))
                  if PLACEHOLDER_RE.search(str(val))]
    if unresolved:
        sys.exit(
            "[find_missing_prs] 설정 미해소: " + ", ".join(unresolved) + "\n"
            "  repo·계정·project-root 를 설정하세요:\n"
            "    방법1) join-us config --init  후 ~/.config/join-us/config.env 편집\n"
            "    방법2) export JOINUS_REPO=owner/repo JOINUS_GH_LOGIN=login JOINUS_PROJECT_ROOT=/path\n"
            "    템플릿) config/join-us.env.example\n"
            "  또는 --repo/--author-prefix/--reports 를 직접 넘기세요."
        )

    pre = args.author_prefix.lower()
    # 기본 = 설정된 정확한 로그인 집합(KNOWN_LOGINS)으로 매칭(정밀, 무관 계정 over-match 방지).
    # --author-prefix 를 명시하면 그 prefix 로 startswith 매칭(레거시/유연 모드).
    explicit_prefix = args.author_prefix != DEF_AUTHOR_PREFIX

    def _is_mine(login):
        login = (login or "").lower()
        if KNOWN_LOGINS and not explicit_prefix:
            return login in KNOWN_LOGINS
        return bool(pre) and login.startswith(pre)

    prs = gh_prs(args.repo, args.limit)
    mine = {p["number"]: p for p in prs if _is_mine((p.get("author") or {}).get("login"))}
    if args.base != "all":
        mine = {n: p for n, p in mine.items() if p.get("baseRefName") == args.base}
    my_nums = set(mine)

    cl = changelog_prs(args.changelog, pre)
    cov = reports_covered(args.reports)

    want_states = {"MERGED"}
    if args.include_open:
        want_states.add("OPEN")
    if args.include_closed:
        want_states.add("CLOSED")

    def eligible(n):
        if mine[n]["state"] not in want_states:
            return False
        if not args.include_cl_meta and is_cl_meta(mine[n]["title"]):
            return False
        return True

    missing_reports = sorted(n for n in my_nums - cov if eligible(n))
    excl_closed = sorted(n for n in my_nums - cov
                         if mine[n]["state"] == "CLOSED" and "CLOSED" not in want_states)
    excl_cl_meta = sorted(n for n in my_nums - cov
                          if not args.include_cl_meta and is_cl_meta(mine[n]["title"])
                          and mine[n]["state"] in want_states)
    missing_cl = sorted(my_nums - cl)
    phantom = sorted(cl - my_nums)

    def line(n):
        p = mine[n]
        flag = "" if n in cl else "  ⚠️changelog누락"
        return f"  #{n} [{p['state']}/{p.get('baseRefName')}] {p['title'][:64]}{flag}"

    logins = sorted({(mine[n].get('author') or {}).get('login') for n in my_nums})
    print(f"[권위 소스] GitHub {args.repo} — {pre}* PR (base={args.base}) {len(my_nums)}건; login={logins}")
    print(f"  change_log 기록 {len(cl)} · reports 커버 {len(cov)} · states={sorted(want_states)} · cl-meta 제외={not args.include_cl_meta}")
    print()
    print(f">>> [A] 생성 대상 — reports 미작성 ({len(missing_reports)}건):")
    for n in missing_reports:
        print(line(n))
    if excl_cl_meta:
        print(f"\n  (제외) change_log 메타 {len(excl_cl_meta)}건: {['#'+str(n) for n in excl_cl_meta]}  → --include-cl-meta 로 포함")
    if excl_closed:
        print(f"  (제외) CLOSED 미머지 {len(excl_closed)}건: {['#'+str(n) for n in excl_closed]}  → --include-closed 로 포함")
    print(f"\n>>> [B] change_log 누락(GitHub엔 있는 내 PR, {len(missing_cl)}건) — 보고만(자동 편집 금지)")
    print(f">>> [C] change_log엔 있으나 GitHub {pre}*(base={args.base}) 매칭 실패 ({len(phantom)}건): {['#'+str(n) for n in phantom]}")
    print(f"\n※ 묶음 규칙은 생성 단계에서 적용(같은 산출물의 작업→수정→번복→조치만 1파일; SKILL.md 참조).")

    if args.json_out:
        todo = [{
            "number": n, "title": mine[n]["title"], "state": mine[n]["state"],
            "base": mine[n].get("baseRefName"), "url": mine[n]["url"],
            "mergedAt": mine[n].get("mergedAt"), "in_changelog": n in cl,
        } for n in missing_reports]
        json.dump({"to_generate": todo, "missing_from_changelog": missing_cl,
                   "excluded_cl_meta": excl_cl_meta, "excluded_closed": excl_closed,
                   "phantom": phantom},
                  open(args.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"\n[json] 생성대상 {len(todo)}건 → {args.json_out}")


if __name__ == "__main__":
    main()
