# API Contract: Reviewer Review Workflow (Feature 003)

REST contract for the review domain. All endpoints live under `/api/reviews`. JSON in /
JSON out. Every response uses the project envelope and reuses 001's cookie session + CSRF and
002's catalog read service. No implementation code here — this is the wire contract.

## Conventions

### Response envelope

```jsonc
// success
{ "success": true,  "data": { /* T */ }, "error": null, "meta": { /* optional */ } }
// failure
{ "success": false, "data": null, "error": { "code": "STRING_CODE", "message": "zh-TW 訊息" } }
```

- `error.code` is a stable machine string (English); `error.message` is the user-facing
  繁體中文 copy (constitution VIII).
- `meta` is present only on the progress/index endpoint (counts).
- **Enum values on the wire are the zh-TW strings, verbatim** (e.g. `"通過"`,
  `"requiredWarnings": ["注意跌倒","骨鬆注意"]`) — research D2.

### Auth, role & CSRF (reused from 001)

- Every route requires `require-auth` + **`require-role('REVIEWER')`** at the server boundary
  (constitution IV). `reviewerId` is resolved from the session — **never** from path/query/body
  (research D8). Cross-reviewer access is impossible by construction (FR-003/SC-010).
- Missing/expired/revoked session ⇒ `401 AUTH_REQUIRED` (message **請先登入**).
- Authenticated but wrong role (e.g. a 系統管理員, who never reviews) ⇒ `403 FORBIDDEN_ROLE`
  (message **權限不足**).
- Every **mutating** request (`PATCH`, `POST`) MUST send header `X-CSRF-Token` equal to the
  `pie_csrf` cookie; mismatch ⇒ `403 CSRF_INVALID` (message **請重新整理後再試**).

### Error codes

| HTTP | `error.code` | zh-TW `message` | When |
|------|--------------|-----------------|------|
| 400 | `VALIDATION_ERROR` | 輸入資料有誤 | zod boundary failure (bad enum value, malformed body, panels not 1..4, bad query) |
| 400 | `INVALID_PARAM` | 請求參數格式錯誤 | `:blueprintId` fails `^[SHETPKLY][1-9][0-9]?$` |
| 400 | `OVERALL_JUDGEMENT_REQUIRED` | 請先選擇整體判定 | **submit** with `overallJudgement = null` (FR-011/SC-003) |
| 400 | `PANEL_REVIEW_INCOMPLETE` | 每個分格請勾選「無問題」或標注問題 | **submit** with a panel that is neither `noProblem` nor annotated (2026-07-01) |
| 401 | `AUTH_REQUIRED` | 請先登入 | no/expired/revoked session |
| 403 | `FORBIDDEN_ROLE` | 權限不足 | authenticated non-reviewer hits a review route |
| 403 | `CSRF_INVALID` | 請重新整理後再試 | missing/mismatched CSRF token on a mutation |
| 404 | `BLUEPRINT_NOT_FOUND` | 找不到該藍圖 | `:blueprintId` valid-shape but not in the catalog |
| 500 | `INTERNAL_ERROR` | 系統發生錯誤，請稍後再試 | unexpected error (generic, no leakage — constitution V) |

> Shared error codes and their canonical zh-TW messages (`AUTH_REQUIRED`, `FORBIDDEN_ROLE`, `INVALID_PARAM`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `CSRF_INVALID`) are defined **once** in `backend/src/lib/errors.ts` (established by 001) and reused verbatim across all features (constitution VIII). Feature-specific codes (`OVERALL_JUDGEMENT_REQUIRED`, `BLUEPRINT_NOT_FOUND`) are added there too.

### Shared shapes

```jsonc
// ReviewDocument — the editable payload (autosave body, submit body, and the `review`
// field of the open response). Enum values are zh-TW. status/timestamps are server-owned
// and IGNORED on input (research D3/D4).
{
  "overallJudgement": "通過" | "需小修" | "需重做" | null,
  "indicationJudgement": "合理" | "有疑慮" | null,
  "indicationNote": "string" | null,
  "otherComment": "string" | null,   // 其他意見, image-level (2026-07-01)
  "panels": [   // EXACTLY 4, panelIndex 1..4, each present once
    {
      "panelIndex": 1,
      "noProblem": false,   // 無問題 sign-off (2026-07-01); submit requires noProblem OR an annotation
      "requiredWarnings": ["注意跌倒","需有專人幫助指導","骨鬆注意","心肺功能不全者注意","其它"], // subset, may be []
      "warningOther": "string" | null,
      "problemTypes": ["部位／主題錯誤","動作示範錯誤","文字說明錯誤","次數／時間不合理","缺安全提醒","有錯字"], // subset, may be []
      "problemNote": "string" | null
    }
    // … panelIndex 2,3,4
  ]
}
```

- On input the server **ignores** any client-sent `status`/timestamp fields and stores
  free-text verbatim (orphan text preserved — FR-019), sanitizing only on output.
- `status` (server-owned) is one of `"草稿"` | `"已提交"`; `"未開始"` is never a stored value
  (it is the absence of a review).

---

## 1. `GET /api/reviews/progress` — my progress + filterable index

Personal progress and the jump index (FR-039–FR-042). Own data only. Counts always reflect
all 51; `region`/`status` filter only the returned `index`.

- Role: `REVIEWER`.
- Query (optional): `region` ∈ `S H E T P K L Y`; `status` ∈ `未開始 草稿 已提交`. Bad value ⇒ `400 INVALID_PARAM`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "submitted": 10,
    "draft": 3,
    "notStarted": 38,
    "total": 51,
    "perRegion": [
      { "regionCode": "S", "regionNameZh": "肩部", "displayOrder": 1, "total": 4, "submitted": 2, "draft": 1, "notStarted": 1 }
      /* … 8 regions, ordered by displayOrder … */
    ],
    "index": [
      { "blueprintId": "S1", "regionCode": "S", "exerciseName": "五十肩鐘擺與爬牆運動", "isHighRisk": false, "myStatus": "已提交" },
      { "blueprintId": "S4", "regionCode": "S", "exerciseName": "肩關節穩定運動",     "isHighRisk": true,  "myStatus": "草稿" }
      /* … filtered by region/status if provided; ordered by region displayOrder → numeric id … */
    ]
  },
  "error": null,
  "meta": { "total": 51, "submitted": 10, "draft": 3, "notStarted": 38 }
}
```

- `myStatus` is `未開始` (no row) / `草稿` / `已提交`. Reflects **only** the caller (FR-042/SC-009).
- 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE`.

---

## 2. `GET /api/reviews/next` — "繼續審查" target

Return the next unreviewed blueprint in the deterministic order, or completion when 51/51
(FR-031/FR-027–FR-029, research D7).

- Role: `REVIEWER`.

**Response 200 — work remaining**
```json
{ "success": true, "data": { "next": "S2", "completed": false, "submitted": 10, "total": 51 }, "error": null }
```
**Response 200 — all submitted (51/51, non-dead-end)**
```json
{ "success": true, "data": { "next": null, "completed": true, "submitted": 51, "total": 51 }, "error": null }
```

- "Next" skips `已提交`; lands on the first 未開始/草稿 by Region `displayOrder` → numeric id
  (`S→H→E→T→P→K→L→Y`; `S2` before `S10`). `completed: true` ⇒ client shows the 51/51 state
  with review/revise entry points (FR-029/SC-008).
- 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE`.

---

## 3. `GET /api/reviews/:blueprintId` — open a blueprint for review (incl. reopen)

Return the read-only blueprint payload + my existing review/draft (or an empty template),
for both first-time review and reopen-to-edit (US1/US5, research D5).

- Role: `REVIEWER`.
- Path: `:blueprintId` must match `^[SHETPKLY][1-9][0-9]?$` (else `400 INVALID_PARAM`).

**Response 200**
```json
{
  "success": true,
  "data": {
    "blueprint": {
      "blueprintId": "S1",
      "regionCode": "S",
      "regionNameZh": "肩部",
      "exerciseName": "五十肩鐘擺與爬牆運動",
      "indications": "肩關節僵硬、手臂上舉困難、夜間肩痛",
      "frequency": "每個動作重複 10 次，每日 2～3 回",
      "gentleReminder": "💡 動作放慢、循序漸進…急性發炎紅腫期先冰敷、減量。",
      "isHighRisk": false,
      "imageUrl": "/api/blueprints/S1/image",
      "panels": [
        { "panelIndex": 1, "stepName": "鐘擺運動", "actionDescription": "身體前傾…輕輕擺盪。",
          "timingHint": "每方向擺動 30 秒。", "visualDescription": "人物站姿前傾…旁有時鐘標「30 秒」。" }
        /* … panelIndex 2,3,4 — visualDescription shown, aiPrompt NEVER present (FR-009, 002 D7) … */
      ]
    },
    "review": {
      "status": "草稿",
      "overallJudgement": null,
      "indicationJudgement": "合理",
      "indicationNote": null,
      "panels": [
        { "panelIndex": 1, "requiredWarnings": ["注意跌倒"], "warningOther": null,
          "problemTypes": [], "problemNote": "第1格秒數疑似錯誤" }
        /* … panelIndex 2,3,4 (empty template when no row exists) … */
      ],
      "createdAt": "2026-06-30T02:00:00Z",
      "lastSavedAt": "2026-06-30T02:05:00Z",
      "submittedAt": null,
      "lastUpdatedAt": "2026-06-30T02:05:00Z"
    },
    "progress": { "submitted": 10, "total": 51 },
    "neighbors": { "prev": null, "next": "S2" }
  },
  "error": null
}
```

- When the reviewer has no row yet, `review` is an **empty template** (`status` omitted/`未開始`
  semantics, all fields null/`[]`, 4 empty panels) so the form renders identically (FR-023
  restore path is the same shape).
- `neighbors.prev` / `neighbors.next` are the previous/next blueprint in the **deterministic
  catalog order** (region S→H→E→T→P→K→L→Y, ascending serial — same order as auto-advance),
  `null` at the first/last blueprint. Powers the 上一張／下一張 free-browse nav (FR-044), which is
  independent of submit's auto-advance-to-next-unreviewed.
- `blueprint` is composed from 002's `blueprint-public` projection — `aiPrompt` is structurally
  absent (FR-009). `isHighRisk` from the shared constant feeds the non-blocking badge.
- 400 `INVALID_PARAM`, 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE`, 404 `BLUEPRINT_NOT_FOUND`.

---

## 4. `PATCH /api/reviews/:blueprintId` — autosave draft

Persist the whole editable document as a draft. Debounced by the client (research D3). CSRF
required. **Never** elevates to 已提交; **never** regresses 已提交→草稿 (FR-022–FR-026).

- Role: `REVIEWER`. CSRF required.
- Path: `:blueprintId` validated as above.
- Request body: a **`ReviewDocument`** (see Shared shapes). `panels` MUST be exactly 4 with
  `panelIndex` 1..4 each once; enum members validated + deduped; free text length-capped;
  any client `status` is ignored.

**Behaviour** (one transaction): upsert the `Review` for (session reviewer × blueprint),
snapshot-replace its 4 `PanelReview` rows, set `lastSavedAt` + `lastUpdatedAt`. Status:
no row → create `草稿`; `草稿` → keep `草稿`; `已提交` → keep `已提交` (in-place edit, D5).
`overallJudgement` may be `null` here (draft does not require it).

**Response 200**
```json
{
  "success": true,
  "data": {
    "status": "草稿",
    "lastSavedAt": "2026-06-30T02:05:12Z",
    "lastUpdatedAt": "2026-06-30T02:05:12Z",
    "submittedAt": null
  },
  "error": null
}
```

- A `PATCH` against an already-`已提交` review returns `"status": "已提交"` with a refreshed
  `lastSavedAt`/`lastUpdatedAt` and an unchanged `submittedAt` (FR-026/FR-032) — it is **not**
  counted again.
- 400 `VALIDATION_ERROR` / `INVALID_PARAM`, 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE` /
  `CSRF_INVALID`, 404 `BLUEPRINT_NOT_FOUND`.

---

## 5. `POST /api/reviews/:blueprintId/submit` — submit (and re-submit)

Submit a review; `overallJudgement` is required (FR-011/SC-003). On success, sets
`已提交` and returns the auto-advance target (FR-027–FR-030, research D6/D7). Used for both
first submit and re-submit after edit (FR-032).

- Role: `REVIEWER`. CSRF required.
- Path: `:blueprintId` validated as above.
- Request body: a **`ReviewDocument`** (same shape as autosave) carrying the final state, so
  submit is atomic and race-free w.r.t. the last autosave. `overallJudgement` MUST be
  non-null.

**Behaviour** (one transaction): persist the document, validate `overallJudgement !== null`,
set `status = 已提交`, set `submittedAt` (first submit only), bump `lastUpdatedAt`, then
compute the next unreviewed blueprint. **All-empty panels are accepted with no warning**
(FR-018/SC-004). The "需小修／需重做 + 四格全空" reminder is **client-side only** and never
blocks here (FR-030). The high-risk caution never blocks (FR-035).

**Response 200 — submitted, work remaining**
```json
{
  "success": true,
  "data": {
    "status": "已提交",
    "submittedAt": "2026-06-30T02:06:00Z",
    "lastUpdatedAt": "2026-06-30T02:06:00Z",
    "next": "S2",
    "completed": false,
    "progress": { "submitted": 11, "total": 51 }
  },
  "error": null
}
```

**Response 200 — submitted the last image (51/51)**
```json
{
  "success": true,
  "data": {
    "status": "已提交", "submittedAt": "2026-06-30T05:00:00Z", "lastUpdatedAt": "2026-06-30T05:00:00Z",
    "next": null, "completed": true, "progress": { "submitted": 51, "total": 51 }
  },
  "error": null
}
```

- `next` = next blueprint to auto-advance to (skips 已提交; deterministic order). `next: null`
  + `completed: true` ⇒ the 51/51 completion state, not a dead end (FR-029/SC-008).
- **400 `OVERALL_JUDGEMENT_REQUIRED`** (message **請先選擇整體判定**) when `overallJudgement`
  is null — nothing is submitted (FR-011/SC-003).
- Re-submit of an already-`已提交` review overwrites in place, bumps `lastUpdatedAt`, leaves
  `submittedAt` unchanged, and is **not** double-counted (FR-032).
- 400 `VALIDATION_ERROR` / `INVALID_PARAM`, 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE` /
  `CSRF_INVALID`, 404 `BLUEPRINT_NOT_FOUND`.

---

## 6. `POST /api/reviews/:blueprintId/reset` — 初始化本頁提交記錄 (reset own review)

Delete the current reviewer's OWN review for this blueprint (draft OR submitted; panels cascade),
returning it to `未開始` (FR-043). For the reviewer to wipe and restart a single image. The client
gates this behind a **reconfirm**; there is no request body.

- Role: `REVIEWER`. CSRF required. `reviewerId` is the session account — never from path/body.
- Path: `:blueprintId` validated as above.
- **Behaviour**: `deleteMany({ reviewerId, blueprintCode })` — **idempotent** (no row ⇒ no-op, still
  200). Only the caller's own review is affected; another reviewer's row for the same blueprint is
  untouched. Once a `已提交` review is reset, it drops out of stats/export (submitted count falls).

**Response 200**
```json
{
  "success": true,
  "data": {
    "review": {
      "status": "未開始", "overallJudgement": null, "indicationJudgement": null,
      "indicationNote": null, "otherComment": null,
      "panels": [ { "panelIndex": 1, "noProblem": false, "requiredWarnings": [], "warningOther": null, "problemTypes": [], "problemNote": null } /* …2,3,4 */ ],
      "createdAt": null, "lastSavedAt": null, "submittedAt": null, "lastUpdatedAt": null
    },
    "progress": { "submitted": 10, "total": 51 }
  },
  "error": null
}
```

- Returns the same **empty template** shape as `GET` open, so the client re-hydrates a blank form,
  plus the refreshed `progress` (submitted count reflects the removal).
- 400 `INVALID_PARAM`, 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE` / `CSRF_INVALID`,
  404 `BLUEPRINT_NOT_FOUND`.

---

## Explicitly absent (by design)

- **No** endpoint returns another reviewer's review — `reviewerId` is always the session
  account (FR-003/SC-010); there is no `?reviewerId=` parameter anywhere.
- **No** delete/version/history endpoint — edit-after-submit is in-place overwrite with no
  history (FR-032).
- **No** reviewer-facing field ever carries `aiPrompt` (FR-009).
- **No** dashboard/aggregation/export route — cross-reviewer stats and export are **feature
  004**, out of scope here.
