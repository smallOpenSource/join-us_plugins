---
name: review-before-pr-join-us
description: >
  joinus 의 diff·staged·commit·branch·PR 을 리뷰할 때 — 특히 PR push/생성 전(/pr-join-us
  선행) 셀프리뷰로 Copilot 지적을 선제 차단해 Copilot 의 제한된 리뷰 횟수를 아낄 때 사용.
  키·바이너리 없이 Claude 가 직접 실행하는 alibaba/open-code-review 포팅. 트리거: "코드리뷰",
  "리뷰해줘", "PR 전 리뷰", "PR 리뷰", "/review-before-pr-join-us".
license: Apache-2.0
metadata:
  source: https://github.com/alibaba/open-code-review
  port: Claude-native (binary/key-free) reimplementation of the ocr pipeline
---

# review-before-pr-join-us — open-code-review 파이프라인 기반 pre-PR 셀프리뷰 (Copilot 선제)

`alibaba/open-code-review`(`ocr`) 의 리뷰 **파이프라인을 Claude 가 직접 실행**하도록 옮긴 포팅. Go 바이너리·모델 API 키 없이(=1st-party·무료·rate-limit 무관) 동일한 **규칙(rule_docs)·프롬프트(task_template)·단계**로 라인 단위 리뷰를 생성한다.

> 자산은 전부 upstream 에서 **verbatim 복사**(Apache-2.0, `NOTICE` 참조): `rules/system_rules.json`, `rules/rule_docs/*.md`(16종), `prompts/task_template.json`(프롬프트 5종+파라미터). SKILL.md(이 절차)만 포팅 산출물.
> ⚠️ 약칭 주의: 이 도구를 "OCR"로 줄이지 말 것(광학문자인식과 혼동). 산문은 `open-code-review`, `ocr` 는 원본 CLI 명령만.

## 용도 / 핵심 개념 — pre-PR Copilot 선제 (구 review-before-pr-join-us 흡수)
**1차 용도 = PR push/생성 *전* 셀프리뷰**(`pr-join-us` 선행). 핵심 개념: **Copilot 이 지적할 것을 먼저 모방·선제 차단**해, rate-limit/credit 으로 자주 막히는 **Copilot 자동리뷰 호출 횟수를 사전 예방**(라운드 ping-pong 감소). 엔진 = 아래 open-code-review 파이프라인(무료·무제한·1st-party → Copilot 쿼터 무관).

**PR 전 2게이트 (사용자 고정 지시 [[pre-pr-two-gate]] — 둘 다 green + push 승인 시에만 진행):**
1. **Gate 1 · 신규개발자 clean-state 동작성**: 변경 영향 요소를 빈 `git clone`(+미커밋 overlay)에서 `wiki_docs/` 가이드대로 **실측**(예: 127.0.0.1 바인딩+헬스 200, precheck→`setup:local`). 파괴적 `db:schema` 데이터손실 주의([[clone-schema-destructive-env-override]]). 끝나면 시크릿 포함 클린 클론 안전 삭제.
2. **Gate 2 · Copilot 지적 선제 0화**: 아래 파이프라인 + joinus Copilot 루브릭([[copilot-review-rubric]])으로 지적 클래스 잔존 0. 한 건 고치면 `grep` 전수로 **동일 클래스 transitive 제거**. 오탐은 PR 본문 "리뷰 노트"에 수비적 기록.

제약: backend/frontend **소스 무수정**(읽기·grep). 커밋=conventional, **AI 공동작성자 트레일러 금지**([[no-ai-coauthor-trailer]]). dev/main 직접 push 금지(→ `pr-join-us`).

## 충실도 (faithful, 단 "완벽"은 아님)
| upstream 요소 | 이 포팅 |
|---|---|
| rule_docs/*.md, system_rules.json, 프롬프트 5종 | ✅ **verbatim 사용** |
| rule resolution 4-tier·plan(**≥50줄**)·diffMap·large-diff/prompt prefilter·tool 루프(≤30)·**inline relocation**·**파일별 filter**·priority | ✅ 절차로 1:1 (`agent.go` 검증) |
| 코멘트 스키마·출력 | ✅ 1:1 |
| **8-워커 동시성** | ⚠️ 적응: 단일세션 **순차**(대량이면 Task 서브에이전트로 격리·병렬 모사) |
| Go 토크나이저/MAX_TOKENS·정확한 truncation | ⚠️ 근사(임계만 준수) |
| 파일 번들링 | ❌ 해당없음 — 이 버전 `executeSubtask` 는 **파일 1개씩** 리뷰(README 의 bundling 은 이 코드에 미구현). 교차 파일 맥락은 diffMap 으로 |

> **충실도 스탬프**: `agent.go`(marketplace clone, 2026-06-21) 기준 단계별 1:1 검증 완료. 각 단계 `agent.go:line` 인용은 아래 파이프라인 절 참조. 런타임 기계장치(goroutine 동시성·토크나이저)만 적응.

## 파라미터 (prompts/task_template.json)
`MAX_TOOL_REQUEST_TIMES=30` · `PLAN_MODE_LINE_THRESHOLD=50`(변경 라인 초과 시 plan 단계) · `MAX_TOKENS=58888`(초과 시 MEMORY_COMPRESSION) · `MAX_SUBTASK_EXECUTION_TIME_MINUTES=5` · 연속 빈 라운드 3회면 중단.

## 도구 매핑 (upstream tool → Claude)
| ocr tool | Claude |
|---|---|
| `file_read` (파일 전문) | Read |
| `file_read_diff` (파일 diff) | `git diff -- <path>` (Bash) |
| `file_find` | Glob |
| `code_search` | Grep |
| `code_comment` (코멘트 적재) | 내부 코멘트 리스트에 누적 |
| `task_done` | 해당 파일 리뷰 종료 |

## 시작 전
1. **대상 확정**: 워크스페이스(staged+unstaged+untracked, 기본) | `--commit <sha>` | `--from <ref> --to <ref>` | PR(`gh pr diff <n>` + 제목→배경). 기본 base=`dev`(joinus).
2. **배경(`{{requirement_background}}`)**: 커밋메시지/PR 제목/사용자 설명에서 추출(리뷰 품질↑).
3. 프롬프트 로드: `<skill-dir>/prompts/task_template.json` 의 `MAIN_TASK`/`PLAN_TASK`/`REVIEW_FILTER_TASK`/`RE_LOCATION_TASK`/`MEMORY_COMPRESSION_TASK` 를 각 단계의 system+user 지시로 **그대로 채택**(아래 토큰 치환).

## 파이프라인 (`agent.go` 검증 — `internal/agent/agent.go:line` 인용)
`dispatchSubtasks`→`executeSubtask` 와 1:1. **한눈에 (단계 > 단계):**

```
[A·전역] diffMap 주입 > filterDiffs(바이너리·확장자) > filterLargeDiffs(>80%토큰 제외) > 삭제파일 skip > 파일별 동시 ≤8
   └→ [B·파일별] change_files > 규칙해석(4-tier + joinus 루브릭) > {plan: 변경 ≥50줄일 때만} > 프롬프트조립 + 80%가드
                 > 메인루프{ read/grep/diff(컨텍스트) → code_comment(위치실패시 inline relocate) → task_done · ≤30라운드 }
                 > 파일별 filter(falsify-not-verify)
[C·종합] priority(High/Med/Low · Low 무음폐기) > 출력
```

(상세·`agent.go:line` 근거 = 아래 A/B/C.)

### A. Dispatch 레벨 — 전역 1회 (`dispatchSubtasks:425`)
1. **diffMap 주입**(`injectDiffMap:398`, 주석 :269): 필터 *전* 전체 diff 맵 구성 → 리뷰 중 LLM 이 `file_read_diff` 로 **필터링·제외된 관련 파일의 diff 까지** 조회 가능.
2. **filterDiffs**(`:780`, `shouldReview:774` → `whyExcluded` **`preview.go:45`**): 제외 사유 = **바이너리**(`ExcludeBinary`) · 사용자 exclude 규칙(`IsUserExcluded`) · **확장자 allowlist 미포함**(`allowedext.IsAllowedExt`).
3. **filterLargeDiffs**(`:432,733`): diff 내용만으로 **MaxTokens 80%(58888×0.8≈47110 토큰)** 초과 파일은 리뷰 전 제외(warning). 전부 제외되면 에러.
4. **삭제 *파일* 통째 skip**(`:449` `IsDeleted`) — 삭제 *라인*(수정 파일 내)은 MAIN_TASK 에서 참조 컨텍스트일 뿐. 비삭제 파일을 **동시 ≤8**(`MaxConcurrency` 기본 8, semaphore `:439-444`)로 `executeSubtask`. ⚠️*적응: 단일 Claude 세션은 순차(대량이면 파일별 Task 서브에이전트로 격리·병렬 모사) — goroutine 전사 아님.*

### B. 파일별 (`executeSubtask:499`) — 이 순서 그대로
1. **change_files**(`buildChangeFilesExcept:514`): 현재 파일 **제외**한 다른 변경 파일 목록 → `{{change_files}}`. (파일은 **1개씩** 리뷰 — 묶지 않음.)
2. **규칙 해석**(`resolveSystemRule:516`, 4-tier first-match): `--rule` > `<repo>/.opencodereview/rule.json` > `~/.opencodereview/rule.json` > 번들 `<skill-dir>/rules/system_rules.json` 의 `path_rule_map` glob(`**`,`{a,b}`) → `rules/rule_docs/<x>.md`(미매칭 `default.md`: Correctness·Security·Performance·Maintainability·Test Coverage) → `{{system_rule}}`. **joinus 추가 룰**: [[copilot-review-rubric]] 테마(시크릿 argv·env 로딩·`set -euo`·죽은 키·포트 override·**마이그레이션 안전**)도 체크리스트에 합류.
3. **plan 단계**(`:521-538`): 변경라인(=삽입+삭제) **≥ 50**(`PLAN_MODE_LINE_THRESHOLD`)일 때만 `PLAN_TASK` → 구조화 plan JSON(`change_summary`+`issues[severity,description,tool_guidance]`, severity 내림차순) → `{{plan_guidance}}`. **< 50 이면 생략**(`### Review Plan` 블록 `stripEmptyPlanBlock` 제거).
4. **프롬프트 조립 + 크기 가드**(`:540-581`): MAIN_TASK 토큰 치환(`{{current_file_path}}`,`{{diff}}`,`{{change_files}}`,`{{system_rule}}`,`{{plan_guidance}}`,`{{requirement_background}}`,`{{current_system_date_time}}`). 조립 **프롬프트가 MaxTokens 80% 초과면 그 파일 리뷰 skip**(warning).
5. **메인 리뷰 루프**(`performLlmCodeReview:899`): 최대 `MAX_TOOL_REQUEST_TIMES=30` 라운드.
   - 도구: `file_read`→Read · `file_find`→Glob · `file_read_diff`→`git diff -- <p>` · `code_search`→Grep · `code_comment`→코멘트 적재 · `task_done`→종료. **다른 파일 문제는 코멘트 금지(컨텍스트 전용)**, 신규 추가 코드 위주, 정상/미변경/삭제/주석·메타데이터 금지. **단 transitive 예외**(joinus 루브릭): 동일 클래스의 cross-file 누락(예: 부분 rename·일괄변경 빠짐)을 발견하면 → **변경 파일 라인에 앵커 + 형제 파일을 *근거로 인용***(다른 파일을 코멘트 *주제*로 삼지 않음 = strict-focus 유지).
   - 도구 호출 0개 라운드 → "You did not successfully call any tools…" 재촉 후 재시도(`:947`). `task_done`→종료. 유효결과 없는 라운드 **연속 3회**면 중단(`:988`). 압축 임계 초과 시도 중단(`:998`).
   - **코멘트 위치 + inline 재지정**(`executeToolCall:1054-1079`): `code_comment` 마다 diff 위치 해석(`ResolveComment`); **실패 시 그 자리에서 `RE_LOCATION_TASK` 인라인 호출**(`:1059`)로 diff 스니펫 재추출해 `start_line`/`end_line` 재anchor(실패 `0,0`) → 컬렉터 적재. *(별도 후처리 아님 — 메인 루프 내부.)* 스키마: `path`,`content`,`start_line`,`end_line`,`existing_code`?,`suggestion_code`?,`thinking`?.
   - 컨텍스트가 MaxTokens 근처면 `MEMORY_COMPRESSION_TASK` 로 5차원 요약 후 계속(`addNextMessage`).
6. **파일별 필터**(`executeReviewFilter:588,595`): 그 파일 루프 종료 직후, **이 파일의 코멘트만**(`CommentsForPath:601`) `REVIEW_FILTER_TASK`(falsify-not-verify) 로 — **diff 만으로 명백히 틀렸다 반증되는 ID만** 제거(`RemoveByPathAndIndices:650`). diff 밖 맥락 의존·"확인 불가"는 **남긴다**. *(전역 일괄 아님 — 파일 단위.)*

### C. priority 분류 + 출력 (전 파일 완료 후)
각 코멘트를 **High/Medium/Low** 로 분류, **Low 는 무음 폐기**. ⚠️*이 분류는 `agent.go`(바이너리)가 아니라 **소비 에이전트** 몫(`model.LlmComment` 에 priority 필드 없음); 출처 = upstream 배포 스킬 `skills/open-code-review/SKILL.md` Step3 / Output Format.* 남은 것을 보고:
```
## Code Review Results — <대상> (파일 N개)
**Issues**: X high / Y medium
### High Priority
- **`path:line`** — <요약>
  > Recommendation: <수정>  (suggestion_code 있으면 ```suggestion 블록```)
### Medium Priority
- ...
```
이슈 0이면 "Review complete — no issues found in N files."

### D. (선택) PR 게시 / 수정
- **게시**: 사용자가 PR 인라인 게시를 명시 승인하면 `gh api .../pulls/<n>/reviews`(라인 앵커). outward-facing → 승인·시크릿0·**AI 공동작성자 트레일러 금지**.
- **수정(fix)**: "리뷰하고 고쳐줘" 등 명시 시에만 High/Medium 위주로 적용, 사용자 확인 후. 단순 "리뷰"는 코멘트만.

## Success Criteria
- 변경 파일 전수 검토(제외분 명시), 추가/수정 라인 위주.
- 단계 충실: 위 §파이프라인 순서(A→B→C) 그대로 — 특히 relocation=메인루프 inline, filter=파일별, plan=변경라인 ≥50.
- 코멘트는 `path:line` 앵커 + 근거 + (가능시) suggestion. Low 폐기, 오탐은 filter 로 제거.
- 키/바이너리 0(Claude 직접). backend/frontend 무수정(읽기), 시크릿 0, 게시·수정은 승인 후.

## Pitfalls
- **다른 파일 이슈를 코멘트로 승격**(MAIN_TASK strict focus 위반) → 컨텍스트 전용. 단 transitive 누락은 **변경파일 앵커 + 형제 인용**으로 표면화(B.5 규칙).
- 삭제/미변경/정상 코드·주석·메타데이터 코멘트 → 금지.
- filter 를 "검증(verify)"으로 오해 → **반증(falsify)** 만; 못 깨면 남긴다.
- plan 단계를 50줄 이하에도 돌림 → 임계 준수(불필요 지연).
- 동시성: 단일세션은 순차. 대량 변경이면 파일별 Task 서브에이전트로 격리·병렬(맥락 오염 방지) — upstream 8-워커 모사(번들링은 없음).

> 원본 엔진: alibaba/open-code-review (Apache-2.0, `NOTICE`). 관련: [[pre-pr-two-gate]] · [[copilot-review-rubric]] · `pr-join-us`(PR 등록 — 이 스킬의 후행) · 4층 모델 `wiki_docs/CODE_REVIEW.md` L2.
