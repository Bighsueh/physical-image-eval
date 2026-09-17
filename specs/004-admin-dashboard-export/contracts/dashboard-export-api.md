# API Contract: Admin Dashboard & Export（管理員儀表板與匯出，Feature 004）

REST contract for feature 004. All endpoints live under `/api`, are **role `系統管理員`
(ADMIN) only**, and are **strictly read-only** — every route is `GET`; **no** route mutates a
`Review`/`PanelReview` (constitution XI, FR-012, SC-007). JSON in / JSON out except the export,
which streams `text/csv` (its errors still use the JSON envelope). This is the wire contract,
not implementation.

## Conventions

### Response envelope (reused from 001/002)

```jsonc
// success
{ "success": true,  "data": { /* T */ }, "error": null, "meta": { /* optional */ } }
// failure
{ "success": false, "data": null, "error": { "code": "STRING_CODE", "message": "zh-TW 訊息" } }
```

- `error.code` is a stable machine string (English); `error.message` is user-facing 繁體中文
  (constitution VIII). `meta` carries `{ total, ... }` on list endpoints.

### Auth & roles

- Every endpoint requires an **authenticated session** (cookie from 001) **and** role `ADMIN`,
  enforced server-side by 001's `require-auth` + `require-role('ADMIN')` (constitution IV).
- No/expired/revoked session → **`401 AUTH_REQUIRED`** (`請先登入`).
- Authenticated **審查者** (or any non-admin) → **`403 FORBIDDEN_ROLE`** (`權限不足`) — FR-001,
  SC-007. UI hiding is defense-in-depth only.
- All routes are `GET`; **no CSRF token is required** (no state-changing request exists in this
  feature).

### Common error codes

| HTTP | `error.code` | zh-TW `message` | When |
|------|--------------|-----------------|------|
| 400 | `INVALID_PARAM` | 請求參數格式錯誤 | path/query fails zod validation (bad `blueprintId`, non-boolean flag) |
| 401 | `AUTH_REQUIRED` | 請先登入 | no/expired/revoked session |
| 403 | `FORBIDDEN_ROLE` | 權限不足 | authenticated but not `ADMIN` (reviewer hitting an admin route) |
| 404 | `BLUEPRINT_NOT_FOUND` | 找不到該藍圖 | drill-down `:blueprintId` valid-shape but not in catalog |
| 500 | `INTERNAL_ERROR` | 系統發生錯誤，請稍後再試 | unexpected server error (generic, no leakage — constitution V) |

> Shared error codes and their canonical zh-TW messages are defined **once** in `backend/src/lib/errors.ts` (established by 001) and reused verbatim here (constitution VIII); see 001/003 contracts for the same table.

> `aiPrompt`, password hashes, session tokens, and any internal-only field are **never**
> present in any 004 response (FR — no leakage). Free text is HTML-escaped on JSON output and
> formula-injection-neutralized in CSV (FR-020).

### Empty / not-ready states (FR-021, SC-010)

With no reviewers / no submitted reviews / catalog not yet ingested, every endpoint returns
`200` with a well-formed empty projection (zeros, empty arrays, `percent: 0`, `meta.total: 0`);
the export returns a valid CSV containing only the header row + BOM. No endpoint errors on
emptiness.

---

## 1. `GET /api/admin/dashboard/overview` — 整體完成度與摘要

Overall completion on the **active basis**, plus headline summary counts. FR-002, FR-016,
FR-022. Role: `ADMIN`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "activeReviewerCount": 3,
    "expectedSubmissions": 120,
    "submittedActive": 40,
    "percent": 33.3,
    "inactiveSubmittedTotal": 5,
    "fullyCoveredCount": 4,
    "blueprintsWithRedoCount": 7,
    "highRiskCount": 9,
    "totalBlueprints": 40
  },
  "error": null
}
```
- Numbers are illustrative (a 40-blueprint catalog). `totalBlueprints` is the number of blueprints
  currently in the ingested catalog; `expectedSubmissions = activeReviewerCount × totalBlueprints`.
- `percent` = `submittedActive / expectedSubmissions × 100`, never > 100; when
  `expectedSubmissions = 0` → `percent: 0` (no division — FR-002/016, D2/D9).
- `inactiveSubmittedTotal` is reported **separately** and is **never** part of `submittedActive`
  (FR-016).

---

## 2. `GET /api/admin/dashboard/reviewers` — 各審查者進度

Per-reviewer progress. FR-003, FR-004. Role: `ADMIN`.

**Response 200** — array ordered by `displayName`; active reviewers first, then 非在職.
```json
{
  "success": true,
  "data": [
    {
      "accountId": "ckv...",
      "displayName": "林醫師",
      "isActive": true,
      "submittedCount": 12,
      "total": 40,
      "unreviewedBlueprintIds": ["S2","S3","H1","…(28)"],
      "lastSubmittedBlueprintId": "S4",
      "lastSubmittedAt": "2026-06-30T03:12:00Z"
    },
    {
      "accountId": "ckw...",
      "displayName": "前審查者",
      "isActive": false,
      "submittedCount": 8,
      "total": 40,
      "unreviewedBlueprintIds": ["…(32)"],
      "lastSubmittedBlueprintId": "K3",
      "lastSubmittedAt": "2026-06-20T09:00:00Z"
    }
  ],
  "error": null,
  "meta": { "total": 2, "activeCount": 1, "inactiveCount": 1 }
}
```
- A reviewer with 0 submissions ⇒ `submittedCount: 0`, `unreviewedBlueprintIds` = every catalog blueprint,
  `lastSubmittedBlueprintId: null`, `lastSubmittedAt: null` (spec Edge Cases).
- `displayName` is sanitized (constitution V).

---

## 3. `GET /api/admin/dashboard/images` — 各圖覆蓋與判定分佈（含篩選）

Per-image coverage + judgement distribution (active basis), with optional combinable filters.
FR-005, FR-006, FR-009, FR-010, FR-011. Role: `ADMIN`.

**Query params** (all optional, zod-validated; bad value → `400 INVALID_PARAM`)
| Param | Type | Meaning |
|-------|------|---------|
| `hasRedo` | boolean | keep only blueprints with ≥1 submitted 需重做 (FR-010) |
| `highRisk` | boolean | keep only high-risk blueprints (from `HIGH_RISK_BLUEPRINT_IDS`, FR-009) |
| `notFullyCovered` | boolean | keep only blueprints with ≥1 active reviewer not yet submitted (FR-011) |

Filters are ANDed. No filter ⇒ every catalog blueprint, ordered by region `displayOrder` then numeric id.

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "blueprintId": "S1",
      "exerciseName": "五十肩鐘擺與爬牆運動",
      "regionCode": "S",
      "isHighRisk": false,
      "submittedActiveCount": 2,
      "missingReviewers": [{ "accountId": "ckx...", "displayName": "王醫師" }],
      "fullCoverage": false,
      "distribution": { "通過": 1, "需小修": 1, "需重做": 0 },
      "hasRedo": false,
      "inactiveSubmittedCount": 0
    },
    {
      "blueprintId": "K3",
      "exerciseName": "膝關節穩定運動",
      "regionCode": "K",
      "isHighRisk": true,
      "submittedActiveCount": 3,
      "missingReviewers": [],
      "fullCoverage": true,
      "distribution": { "通過": 1, "需小修": 1, "需重做": 1 },
      "hasRedo": true,
      "inactiveSubmittedCount": 1
    }
  ],
  "error": null,
  "meta": { "total": 40, "returned": 2 }
}
```
- `distribution` counts **active** submitters only; `inactiveSubmittedCount` is separate
  (FR-006/016). `submittedActiveCount` = sum of `distribution` values (FR-022).
- 0-submitter image ⇒ all counts 0, `missingReviewers` = all active reviewers,
  `fullCoverage: false` (spec Edge Cases).

---

## 4. `GET /api/admin/dashboard/images/:blueprintId` — 單圖逐審查者鑽取（揭示分歧）

Cross-reviewer drill-down for one blueprint: each submitted reviewer's 整體判定 + 適應症判定,
surfacing disagreement. **v1 surfaces only — no mediation** (FR-008, FR-018, D6). Role: `ADMIN`.

**Path param**: `blueprintId` — must match `^[SHETPKLY][1-9][0-9]?$` (else `400 INVALID_PARAM`).

**Response 200**
```json
{
  "success": true,
  "data": {
    "blueprintId": "K3",
    "summary": {
      "exerciseName": "膝關節穩定運動",
      "regionCode": "K",
      "isHighRisk": true,
      "submittedActiveCount": 3,
      "fullCoverage": true,
      "distribution": { "通過": 1, "需小修": 1, "需重做": 1 },
      "hasRedo": true,
      "inactiveSubmittedCount": 1
    },
    "hasDisagreement": true,
    "rows": [
      { "accountId": "ckv...", "displayName": "林醫師", "isActive": true,
        "overallJudgement": "通過", "indicationJudgement": "合理",   "submittedAt": "2026-06-30T03:12:00Z" },
      { "accountId": "ckx...", "displayName": "王醫師", "isActive": true,
        "overallJudgement": "需重做", "indicationJudgement": "有疑慮", "submittedAt": "2026-06-30T04:01:00Z" },
      { "accountId": "ckw...", "displayName": "前審查者", "isActive": false,
        "overallJudgement": "需小修", "indicationJudgement": "合理",   "submittedAt": "2026-06-20T09:00:00Z" }
    ]
  },
  "error": null
}
```
- `rows` includes **all** submitters (active + 非在職, each flagged `isActive`); drafts never
  appear (FR-007). At most one row per reviewer (FR-023).
- `hasDisagreement` = distinct non-null `overallJudgement` among `rows` > 1 (FR-008). No field
  collapses divergent judgements — mediation is 線下 (FR-018).
- Valid-shape but unknown `:blueprintId` → `404 BLUEPRINT_NOT_FOUND`.
- A 0-submitter blueprint ⇒ `rows: []`, `hasDisagreement: false`, summary counts 0 (Edge Cases).

---

## 5. `GET /api/admin/export/reviews.csv` — 匯出已提交審查結果（CSV）

Export every **submitted** (reviewer × image) record as CSV. FR-013, FR-014, FR-015, FR-016,
FR-017, FR-020. Role: `ADMIN`. **Read-only** — the export never alters source data (SC-007).

**Query params** (optional, same validation as endpoint 3; default = all submitted records)
| Param | Type | Meaning |
|-------|------|---------|
| `hasRedo` | boolean | only records on blueprints with ≥1 需重做 (or only 需重做 rows — see note) |
| `highRisk` | boolean | only high-risk blueprints |

> Default (no filter) exports **all** submitted records across all blueprints and all
> reviewers (active + 非在職). Filters narrow the row set but never change column structure.

**Response 200**
- Headers:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="review-export-20260630T0500Z.csv"`
- Body: **UTF-8 with BOM (`EF BB BF`)**, CRLF line endings, RFC-4180 quoting. First line = the
  fixed zh-TW header row; one data row per submitted (reviewer × image).

**Header row (28 columns, fixed order — D4)**
```
審查者ID,審查者名稱,在職狀態,藍圖ID,藍圖名稱,解剖區域,高風險,整體判定,含需重做,適應症判定,適應症說明,圖1_需要添加的警語,圖1_警語其它,圖1_問題類型,圖1_問題說明,圖2_需要添加的警語,圖2_警語其它,圖2_問題類型,圖2_問題說明,圖3_需要添加的警語,圖3_警語其它,圖3_問題類型,圖3_問題說明,圖4_需要添加的警語,圖4_警語其它,圖4_問題類型,圖4_問題說明,提交時間
```

**Example data row** (one submitted record; multi-select sets pipe-delimited; clean panels = empty)
```
ckv...,林醫師,在職,K3,膝關節穩定運動,K,是,需重做,是,有疑慮,角度過大恐傷膝,,,動作示範錯誤,左腳示範方向相反,骨鬆注意|缺安全提醒,,,,,,,,,,,,2026-06-30T04:01:00Z
```

**Encoding rules (FR-014/015/017/020)**
- Multi-select sets (需要添加的警語、問題類型) → pipe `|`-delimited zh-TW enum labels; an empty
  set → empty cell in an **always-present** column (a 乾淨通過 row still has all 16 panel
  columns, empty — FR-015).
- Enum cells use zh-TW labels verbatim (FR-019). Flags `高風險`/`含需重做` = `是`/`否`;
  `在職狀態` = `在職`/`非在職` (FR-016/017).
- Free-text cells (審查者名稱、適應症說明、警語其它、問題說明) are RFC-4180 quoted/escaped and
  formula-injection-neutralized (leading `= + - @ \t \r` prefixed with `'`) — FR-020, SC-002 §4.
- `提交時間` = ISO-8601 UTC.
- **Drafts excluded**: a system with N submitted + M drafts exports exactly N rows, 0 drafts
  (FR-007/015, SC-002).

**Errors** (JSON envelope): `400 INVALID_PARAM`, `401 AUTH_REQUIRED`, `403 FORBIDDEN_ROLE`,
`500 INTERNAL_ERROR`.

---

## Explicitly absent (by design)

There is **no** POST/PUT/PATCH/DELETE under `/api/admin/dashboard/*` or `/api/admin/export/*`,
and **no** endpoint that creates, edits, or deletes a `Review`/`PanelReview`, runs a
consensus/mediation flow (FR-018), or mutates any review judgement or note (FR-012). 004 is a
pure read projection of the review + catalog domains (SC-007).

---

# Amendment 2026-08-27 — 參考照片端點（FR-025..FR-037）

All new routes keep 004's defining properties: **`ADMIN`-only, GET-only, read-only, no
CSRF** (the feature still has no state-changing request), behind the existing
`adminReadRateLimiter` + `requireAuth` + `requireRole('ADMIN')` + `requirePasswordCurrent`
chain. Every photo query joins through a `已提交` review, so draft photos are unreachable
(FR-028, research D10).

## New error codes

| HTTP | `error.code` | zh-TW `message` | When |
|------|--------------|-----------------|------|
| 404 | `PHOTO_NOT_FOUND` | 找不到該照片 | unknown photo id, **or** a photo that belongs to a review that is not 已提交 (indistinguishable by design — FR-028) |

## 6. `GET /api/admin/dashboard/images/:blueprintId/worktable` — 修圖工作台

Returns an **`ImageWorkTable`** (see data-model). Supersedes route 4's flat shape for the
per-image view; route 4 is retained unchanged for callers that only need the disagreement
list (research D11).

**Response 200** (abridged)
```json
{
  "success": true,
  "data": {
    "blueprintId": "E3", "exerciseName": "媽媽手運動", "regionCode": "E", "isHighRisk": false,
    "submittedReviewerCount": 3,
    "judgementDistribution": { "通過": 1, "需小修": 2, "需重做": 0 },
    "photoCount": 4,
    "panels": [
      {
        "panelIndex": 1, "stepName": "Finkelstein 伸展",
        "flaggedReviewerCount": 2, "photoCount": 2, "allClear": false,
        "entries": [
          {
            "reviewerDisplayName": "審查者 A", "isActive": true,
            "overallJudgement": "需小修",
            "requiredWarnings": [], "warningOther": null,
            "problemTypes": ["動作示範錯誤"],
            "problemNote": "圖中拇指露在拳頭外面，應該要收進掌心再由四指握住。",
            "photos": [
              { "photoId": "clx…", "caption": "正確的收拳角度", "hasAnnotated": true,
                "urls": { "display": "/api/admin/dashboard/photos/clx…/file?variant=display",
                          "original": "/api/admin/dashboard/photos/clx…/file?variant=original",
                          "annotated": "/api/admin/dashboard/photos/clx…/file?variant=annotated" } }
            ],
            "submittedAt": "2026-08-26T01:48:00Z"
          }
        ]
      },
      { "panelIndex": 2, "stepName": "拇指主動活動",
        "flaggedReviewerCount": 0, "photoCount": 0, "allClear": true, "entries": [] }
    ],
    "imageLevelEntries": []
  },
  "error": null
}
```

- `panels` is **always** length 4 in index order, even when a panel has no entries.
- `allClear: true` means every submitting reviewer marked that panel 無問題; the UI collapses
  it to one line (research D11).
- Free text (`warningOther`, `problemNote`, `caption`) is sanitized on output (FR-020).
- 非在職 reviewers' submitted entries are present and flagged `isActive: false` (FR-016).
- Empty state: a blueprint with 0 submitted reviews returns 200 with
  `submittedReviewerCount: 0`, `photoCount: 0`, four `allClear: false` panels with empty
  `entries`, never an error (FR-021/SC-010).

## 7. `GET /api/admin/dashboard/photos/:photoId/file` — 取得單張照片

- Query `variant`: `display` (default) | `original` | `annotated`.
- Serves the stored, validated content type; `Content-Disposition: inline`;
  `Cache-Control: private`. Reads bytes by primary key from the blob table — no path is
  involved, so there is no traversal surface (003 research D11).
- A photo whose review is **not** `已提交` returns 404 `PHOTO_NOT_FOUND`, identical to an
  unknown id (FR-028).
- `variant=annotated` on an un-annotated photo → 404 `PHOTO_NOT_FOUND`.

## 8. `GET /api/admin/dashboard/images/:blueprintId/photos.zip` — 下載本圖全部材料

Streams a ZIP of every **submitted** photo for this blueprint (FR-029, research D12).
Remains a `GET` so 004 stays CSRF-free and entirely read-only.

- `Content-Type: application/zip`;
  `Content-Disposition: attachment; filename="E3_媽媽手運動_參考照片.zip"`.
- Contents per photo (FR-030): the **original**, plus the **annotated** version when one
  exists. The display derivative is excluded. When the original is HEIC **and** there is no
  annotated version, 003's `originalAsJpeg` is included in its place so the archive always
  holds an openable file.
- In-archive naming: `<blueprintId>_圖<panelIndex>_<審查者>_<序號>_原始.<ext>` and
  `…_標註.jpg`; `panelIndex = NULL` photos use `整體` in place of `圖N`.
- A blueprint with 0 submitted photos returns a valid **empty** archive with 200, not an
  error (FR-021).
- Streamed — no temporary file is written anywhere (research D12).

## 9. `GET /api/admin/dashboard/storage` — 照片佔用空間

**Response 200**
```json
{ "success": true,
  "data": { "usedBytes": 3221225472, "limitBytes": 10737418240,
            "usedPercent": 30.0, "warning": "none" },
  "error": null }
```

- `warning`: `none` | `approaching` (≥ 80 %) | `full` (≥ 100 %) (FR-034).
- `usedBytes` spans **all** photos including drafts — it measures disk consumption, not
  review progress. This is the single documented exception to the submitted-only rule
  (data-model, `PhotoStorageUsage`).
- The ceiling is enforced by **003's upload route only**; nothing here blocks anything
  (FR-037, 003 FR-061).

## Changes to existing routes

- **Route 3 `GET /api/admin/dashboard/images`** — each row gains `photoCount` (submitted-only),
  and the query accepts `hasPhotos=true` to list only blueprints with ≥ 1 submitted photo
  (FR-031). Existing fields and filters are unchanged.
- **Route 5 `GET /api/admin/export/reviews.csv`** — two columns **appended after** the
  existing ones (FR-032, research D13): `參考照片張數` and `參考照片檔名`（the same
  delimited-set encoding as the other multi-value columns, per D4, escaped and
  formula-neutralized per D5). **No existing column is renamed, reordered or retyped**
  (FR-035/SC-014). Image bytes never enter the CSV; the filenames are the join key into the
  bundle from route 8.
- **Route 4 `GET /api/admin/dashboard/images/:blueprintId`** — unchanged; route 6 is the new
  richer view, not a replacement of this contract.

## Explicitly absent (by design)

- No route mutates anything — 004 remains GET-only and CSRF-free (FR-012/FR-036/SC-007/SC-016).
- No route exposes a photo belonging to a **draft** review, by any id or filter (FR-028).
- No global "all blueprints" bundle this round (FR-033, research D12).
- No route returns photo bytes inside a JSON envelope.
