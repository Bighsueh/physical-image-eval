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
all catalog blueprints; `region`/`status` filter only the returned `index`. Numbers in the
examples below are illustrative; `total` is the number of blueprints currently in the catalog
(written `N` in prose; `N/N` = every catalog blueprint submitted).

- Role: `REVIEWER`.
- Query (optional): `region` ∈ `S H E T P K L Y`; `status` ∈ `未開始 草稿 已提交`. Bad value ⇒ `400 INVALID_PARAM`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "submitted": 10,
    "draft": 3,
    "notStarted": 27,
    "total": 40,
    "perRegion": [
      { "regionCode": "S", "regionNameZh": "肩部", "displayOrder": 1, "total": 5, "submitted": 2, "draft": 1, "notStarted": 2 }
      /* … 8 regions, ordered by displayOrder … */
    ],
    "index": [
      { "blueprintId": "S1", "regionCode": "S", "exerciseName": "五十肩鐘擺與爬牆運動", "isHighRisk": false, "myStatus": "已提交" },
      { "blueprintId": "S4", "regionCode": "S", "exerciseName": "肩關節穩定運動",     "isHighRisk": true,  "myStatus": "草稿" }
      /* … filtered by region/status if provided; ordered by region displayOrder → numeric id … */
    ]
  },
  "error": null,
  "meta": { "total": 40, "submitted": 10, "draft": 3, "notStarted": 27 }
}
```

- `myStatus` is `未開始` (no row) / `草稿` / `已提交`. Reflects **only** the caller (FR-042/SC-009).
- 401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE`.

---

## 2. `GET /api/reviews/next` — "繼續審查" target

Return the next unreviewed blueprint in the deterministic order, or completion when N/N
(FR-031/FR-027–FR-029, research D7).

- Role: `REVIEWER`.

**Response 200 — work remaining**
```json
{ "success": true, "data": { "next": "S2", "completed": false, "submitted": 10, "total": 40 }, "error": null }
```
**Response 200 — all submitted (N/N, non-dead-end)**
```json
{ "success": true, "data": { "next": null, "completed": true, "submitted": 40, "total": 40 }, "error": null }
```

- "Next" skips `已提交`; lands on the first 未開始/草稿 by Region `displayOrder` → numeric id
  (`S→H→E→T→P→K→L→Y`; `S2` before `S10`). `completed: true` ⇒ client shows the N/N state
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
    "progress": { "submitted": 10, "total": 40 },
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
    "progress": { "submitted": 11, "total": 40 }
  },
  "error": null
}
```

**Response 200 — submitted the last image (N/N)**
```json
{
  "success": true,
  "data": {
    "status": "已提交", "submittedAt": "2026-06-30T05:00:00Z", "lastUpdatedAt": "2026-06-30T05:00:00Z",
    "next": null, "completed": true, "progress": { "submitted": 40, "total": 40 }
  },
  "error": null
}
```

- `next` = next blueprint to auto-advance to (skips 已提交; deterministic order). `next: null`
  + `completed: true` ⇒ the N/N completion state, not a dead end (FR-029/SC-008).
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
    "progress": { "submitted": 10, "total": 40 }
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

---

# Amendment 2026-08-27 — 參考照片端點（FR-045..FR-061）

Six new routes under the existing `/api/reviews` router. Every one carries the same guard
chain as routes 1–6 (`requireAuth` + `requireRole('REVIEWER')` + `requirePasswordCurrent`),
and every mutation carries CSRF — the double-submit header check works unchanged with
`multipart/form-data` because it reads `X-CSRF-Token`, not the body. `reviewerId` continues
to come **only** from the session (FR-057, research D8).

Photo routes are deliberately **separate from the debounced document `PATCH`** (route 4):
they write immediately and a failed upload never endangers typed text (research D14).

## New error codes

| HTTP | `error.code` | zh-TW `message` | When |
|------|--------------|-----------------|------|
| 400 | `UNSUPPORTED_IMAGE_TYPE` | 僅支援 JPG／PNG／WebP 格式的照片 | display/annotated part fails magic-byte validation (research D16) |
| 400 | `IMAGE_TOO_LARGE` | 照片檔案過大 | a single part exceeds the configured per-file cap |
| 404 | `PHOTO_NOT_FOUND` | 找不到該照片 | unknown photo id, **or** a photo belonging to another reviewer (indistinguishable by design — FR-057) |
| 409 | `PHOTO_STORAGE_FULL` | 照片儲存空間已滿，請聯絡管理員 | total photo storage is at the configured ceiling (FR-061, research D18) |

> `PHOTO_STORAGE_FULL` MUST be raised **only** by the photo routes below. Routes 1–6
> (open/autosave/submit/reset/progress/next) MUST continue to succeed when storage is full
> (FR-061/SC-020), and deleting or annotating an existing photo MUST also still succeed.

## Shared shape: `ReviewPhoto`

```json
{
  "id": "clx…",
  "panelIndex": 1,
  "caption": "正確的收拳角度",
  "annotated": true,
  "sortOrder": 0,
  "createdAt": "2026-08-27T01:48:00Z",
  "urls": {
    "display":   "/api/reviews/E3/photos/clx…/file?variant=display",
    "original":  "/api/reviews/E3/photos/clx…/file?variant=original",
    "annotated": "/api/reviews/E3/photos/clx…/file?variant=annotated"
  }
}
```

- `panelIndex` is `1..4`, or **`null`** for the image-level 整體參考照片 (FR-046).
- `annotated` is a boolean convenience flag; `urls.annotated` is `null` when false.
- Bytes are **never** inlined in a JSON response — always fetched through route 9.
- The re-editable annotation content is **not** in this shape; it is fetched on demand by
  route 11 so listing a review never carries it.

## 7. `POST /api/reviews/:blueprintId/photos` — attach a photo

`multipart/form-data`. CSRF required.

| Part | Required | Notes |
|------|----------|-------|
| `original` | yes | The uploaded file, stored **byte-for-byte, never re-encoded** (FR-052). Wider allow-list than `display`: JPEG/PNG/WebP **and HEIC** (research D16). |
| `display` | yes | Client-produced ~1600 px JPEG. Allow-list JPEG/PNG/WebP. |
| `originalAsJpeg` | conditional | Only when `original` is HEIC; guarantees the admin bundle always contains an openable file (004 FR-030). |
| `panelIndex` | no | `1..4`; omit for the image-level slot. |
| `caption` | no | Free text, length-capped. |

**Behaviour**: resolve (session reviewer × blueprint); if no `Review` exists, create one as
`草稿` (FR-050); if it exists as `已提交`, keep `已提交`, refresh `lastUpdatedAt`, leave
`submittedAt` untouched (FR-051). Validate every image part by magic bytes. Reject with
`PHOTO_STORAGE_FULL` when the ceiling is reached (FR-061). There is **no per-panel cap**
(FR-048).

**Response 201** — `{ "success": true, "data": { "photo": ReviewPhoto, "reviewStatus": "草稿" }, "error": null }`

- 400 `VALIDATION_ERROR` / `INVALID_PARAM` / `UNSUPPORTED_IMAGE_TYPE` / `IMAGE_TOO_LARGE`,
  401 `AUTH_REQUIRED`, 403 `FORBIDDEN_ROLE` / `CSRF_INVALID`, 404 `BLUEPRINT_NOT_FOUND`,
  409 `PHOTO_STORAGE_FULL`.

## 8. `DELETE /api/reviews/:blueprintId/photos/:photoId` — remove a photo

CSRF required. Own photos only. A photo that is not yours **and** a photo that no longer
exists both return `PHOTO_NOT_FOUND`, never 403 (FR-057).

> *Corrected during implementation*: an earlier draft of this contract also promised
> idempotence (a repeat delete returning 200). The two cannot both hold — being able to tell
> 「已刪除」 apart from 「不是你的」 is exactly the existence oracle FR-057 forbids. Isolation
> wins; a client that double-clicks delete sees a 404 for something that is in fact gone.

Removing the last photo
from a panel may make that panel unaddressed again — the submit gate re-evaluates at submit
time (FR-049), this route does not block. Succeeds even when storage is full.

**Response 200** — `{ "success": true, "data": { "deleted": true }, "error": null }`

## 9. `GET /api/reviews/:blueprintId/photos/:photoId/file` — fetch bytes

- Query `variant`: `display` (default) | `original` | `annotated`.
- Own photos only. Serves the **stored, validated** content type; `Content-Disposition: inline`;
  `Cache-Control: private`. Mirrors 002's read-only image route shape, but reads from the
  database rather than the filesystem — there is no path involved and therefore no traversal
  surface (research D11).
- `variant=annotated` on an un-annotated photo → 404 `PHOTO_NOT_FOUND`.

## 10. `PATCH /api/reviews/:blueprintId/photos/:photoId` — edit caption / order

CSRF required. Body: `{ "caption": string|null, "sortOrder": number }` (both optional).
Caption is preserved verbatim and sanitized on output (FR-047). Not part of the document
autosave debounce.

## 11. `GET /api/reviews/:blueprintId/photos/:photoId/annotation` — load annotation state

Returns the re-editable annotation content for re-opening the editor (FR-056):
`{ "success": true, "data": { "annotationState": { … } | null }, "error": null }`.
Separate from the photo listing so the state is never carried by a workspace open.

## 12. `PUT /api/reviews/:blueprintId/photos/:photoId/annotation` — save annotation

`multipart/form-data`. CSRF required.

| Part | Required | Notes |
|------|----------|-------|
| `annotated` | yes | Full-resolution flattened output. **Authoritative** artifact (research D17). |
| `annotationState` | yes | JSON, the re-editable content. |

**Behaviour**: stores both; **never** overwrites `original` or `display` (FR-052). Last write
wins — no version history (FR-056). On an already-`已提交` review, status is preserved and
`submittedAt` untouched (FR-051). Succeeds when storage is full **if** it does not increase
total usage beyond the ceiling by more than the replaced artifact; a first-time annotation on
a full store returns `PHOTO_STORAGE_FULL`.

**Response 200** — `{ "success": true, "data": { "photo": ReviewPhoto }, "error": null }`

## Changes to existing routes

- **Route 3 `GET /api/reviews/:blueprintId`** — the `review` payload gains
  `photos: ReviewPhoto[]` (all photos for this review, panel-bound and image-level together;
  the client groups by `panelIndex`). No existing field changes shape.
- **Route 5 `POST /api/reviews/:blueprintId/submit`** — `PANEL_REVIEW_INCOMPLETE` is now
  raised only when a panel is neither `noProblem`, nor annotated in the document, **nor
  carrying ≥ 1 photo**. The photo count is read **inside the submit transaction**, so a photo
  uploaded moments before submit is always seen (FR-049, research D15).
- **Route 6 `POST /api/reviews/:blueprintId/reset`** — the cascade removes the review's photos
  and their bytes along with it (FR-059). Response shape unchanged.

## Explicitly absent (by design)

- No endpoint returns photo bytes inside a JSON envelope.
- No endpoint lets a reviewer reach another reviewer's photo, by any id or filter (FR-057).
- No per-panel photo cap is enforced anywhere (FR-048).
- No admin-facing photo route lives here — the admin work table, counts, bundle download and
  export belong to **004**, and read only photos of **submitted** reviews (004 FR-028).
