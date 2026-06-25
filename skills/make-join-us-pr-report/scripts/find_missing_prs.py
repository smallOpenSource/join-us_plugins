#!/usr/bin/env python3
"""make-join-us-pr-report 권위 소스 누락 탐지기 (v1.2).

GitHub repo 의 PR 목록(권위 소스)에서 본인(<my-gh-login>*) PR 을 모아
  [A] SR/reports/ 미작성   [B] change_log.md 누락   [C] change_log엔 있으나 GitHub 매칭 실패
세 갈래를 대조한다. 리포트 생성 대상([A])을 JSON 으로도 내보낸다.

기본 스코프(2026-06 사용자 확정):
  - base=dev 로 머지된 PR 만(release/main 승격분은 dev 작업의 중복이라 기본 제외). --base 로 변경.
  - change_log 미러/기록 메타 PR 은 기본 제외(B안). --include-cl-meta 로 포함.
  - state=MERGED 만(트라이얼/superseded CLOSED 는 기본 제외). --include-open/--include-closed.

전제: "내 PR 의 전체 목록은 repo 의 PR 목록에 있다" → change_log 가 아니라 GitHub 이 권위 소스.
gh CLI 인증 필요. 표준 라이브러리 + gh 만 사용.

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

DEF_REPO = "<OWNER>/<REPO>"
DEF_REPORTS = "<project-root>/SR/reports"
DEF_CHANGELOG = "<project-root>/wiki_docs/change_log.md"


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
    ap.add_argument("--author-prefix", default="<my-gh-login>",
                    help="GitHub author login 접두어(본인 GitHub 계정 prefix)")
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

    pre = args.author_prefix.lower()
    prs = gh_prs(args.repo, args.limit)
    mine = {p["number"]: p for p in prs
            if (p.get("author") or {}).get("login", "").lower().startswith(pre)}
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
