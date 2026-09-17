# Contract: Catalog Read API + Ingestion Command (Feature 002)

Two surfaces: (1) a **GET-only HTTP read API** under `/api` over the catalog tables, and (2) the **ingestion command** (an operator CLI, not an HTTP endpoint). The catalog is read-only to users (constitution XI) — there are **no** POST/PUT/PATCH/DELETE catalog routes.

## Response envelope (all HTTP JSON responses)

```json
{ "success": true,  "data": { /* T */ }, "error": null, "meta": { /* optional */ } }
{ "success": false, "data": null,        "error": { "code": "STRING_CODE", "message": "zh-TW 訊息" } }
```

- `meta` carries pagination/counts where relevant (e.g. `{ "total": 40 }`, illustrative).
- The image route is the only non-JSON response (it streams `image/png`); its errors still use the JSON envelope.

## Auth & roles

- All endpoints below require an **authenticated session** (cookie from 001). Either role (`系統管理員` or `審查者`) may read the catalog. Enforced server-side by 001's session middleware (constitution IV); UI hiding is defense-in-depth only.
- Unauthenticated requests → `401 AUTH_REQUIRED`.

## Common error codes

| HTTP | `error.code` | When |
|------|--------------|------|
| 400 | `INVALID_PARAM` | path/query param fails validation (bad `regionCode`, malformed `blueprintId`) |
| 401 | `AUTH_REQUIRED` | no/invalid session |
| 404 | `BLUEPRINT_NOT_FOUND` | `:blueprintId` not in catalog |
| 404 | `IMAGE_NOT_FOUND` | catalog row exists but PNG missing on mount (should not happen post-ingest) |
| 500 | `INTERNAL_ERROR` | unexpected server error (generic message, no leakage — constitution V) |

> Note: `aiPrompt`, `contentHash`, and internal source refs are **never** present in any response body (FR-020, D7).

---

## 1. `GET /api/regions` — list regions

List all 8 anatomical regions with their blueprint counts. Role: any authenticated.

**Response 200**
```json
{
  "success": true,
  "data": [
    { "regionCode": "S", "nameZh": "肩部", "nameEn": "SHOULDER", "displayOrder": 1, "blueprintCount": 4 },
    { "regionCode": "H", "nameZh": "頭頸部", "nameEn": "HEAD_NECK", "displayOrder": 2, "blueprintCount": 4 }
    /* … 8 total, ordered by displayOrder … */
  ],
  "error": null,
  "meta": { "total": 8 }
}
```

---

## 2. `GET /api/blueprints` — list blueprints (summary)

List blueprints, optionally filtered by region. Summary projection (no panels, no `aiPrompt`). Role: any authenticated.

**Query params**
| Param | Type | Required | Validation |
|-------|------|----------|------------|
| `region` | string | no | one of `S H E T P K L Y` (enum) — else `400 INVALID_PARAM` |
| `highRisk` | boolean | no | `true`/`false` filter on `isHighRisk` |

**Response 200**
```json
{
  "success": true,
  "data": [
    { "blueprintId": "S1", "regionCode": "S", "exerciseName": "五十肩鐘擺與爬牆運動",
      "isHighRisk": false, "imageUrl": "/api/blueprints/S1/image", "diagnosisCount": 3 },
    { "blueprintId": "S4", "regionCode": "S", "exerciseName": "肩關節穩定運動",
      "isHighRisk": true,  "imageUrl": "/api/blueprints/S4/image", "diagnosisCount": 2 }
  ],
  "error": null,
  "meta": { "total": 40 }
}
```

---

## 3. `GET /api/blueprints/:blueprintId` — blueprint detail

Full detail: overall metadata + the 4 panels (incl. `visualDescription`) + covered diagnoses + `isHighRisk`. Role: any authenticated.

**Path param**: `blueprintId` — must match `^[SHETPKLY][1-9][0-9]?$` (else `400 INVALID_PARAM`).

**Response 200**
```json
{
  "success": true,
  "data": {
    "blueprintId": "S1",
    "regionCode": "S",
    "regionNameZh": "肩部",
    "exerciseName": "五十肩鐘擺與爬牆運動",
    "indications": "肩關節僵硬、手臂上舉困難、夜間肩痛",
    "frequency": "每個動作重複 10 次，每日 2～3 回",
    "gentleReminder": "💡 動作放慢、循序漸進…急性發炎紅腫期先冰敷、減量。",
    "version": "v1.0",
    "isHighRisk": false,
    "imageUrl": "/api/blueprints/S1/image",
    "panels": [
      { "panelIndex": 1, "stepName": "鐘擺運動", "actionDescription": "身體前傾，健側手扶桌…輕輕擺盪。",
        "timingHint": "每方向擺動 30 秒。", "visualDescription": "人物站姿前傾…旁有時鐘標「30 秒」。" },
      { "panelIndex": 2, "stepName": "手指爬牆", "actionDescription": "面向牆站立…到最高處停留。",
        "timingHint": "到最高點停留 10 秒。", "visualDescription": "人物面牆站立…時鐘「10 秒」。" },
      { "panelIndex": 3, "stepName": "毛巾背後伸展", "actionDescription": "雙手一上一下握住毛巾…向上伸展。",
        "timingHint": "停留 10 秒後放鬆。", "visualDescription": "人物背面…患側肩膀有輕微伸展提示線。" },
      { "panelIndex": 4, "stepName": "收尾放鬆", "actionDescription": "聳肩繞圈放鬆肩膀…回到動作 1。",
        "timingHint": "肩膀繞圈 10 次。", "visualDescription": "人物坐姿聳肩…旁有黃色星星表示完成。" }
    ],
    "diagnoses": [
      { "matrixNo": 4,  "nameZh": "五十肩",        "mappingKind": "MAPPED" },
      { "matrixNo": 12, "nameZh": "冰凍肩",        "mappingKind": "MAPPED" },
      { "matrixNo": 15, "nameZh": "沾黏性關節囊炎", "mappingKind": "MAPPED" }
    ]
  },
  "error": null
}
```

- `panels` is always length 4, ordered by `panelIndex`. `timingHint` / `visualDescription` may be `null`.
- `aiPrompt` is intentionally absent (FR-020).
- **404 `BLUEPRINT_NOT_FOUND`** when `:blueprintId` is valid-shape but not in the catalog.

---

## 4. `GET /api/diagnoses` — diagnosis mapping (optional read)

The full diagnosis matrix (every diagnosis listed in the index) with mapping. Supports the admin/reviewer "which diagnoses does this blueprint cover" view. Role: any authenticated.

**Query params**
| Param | Type | Required | Validation |
|-------|------|----------|------------|
| `mappingKind` | string | no | one of `MAPPED TEMPLATE REFERRAL` |
| `blueprintId` | string | no | `^[SHETPKLY][1-9][0-9]?$` — filter to one blueprint |

**Response 200**
```json
{
  "success": true,
  "data": [
    { "matrixNo": 4,  "nameZh": "五十肩",   "mappingKind": "MAPPED",   "mappedBlueprintId": "S1" },
    { "matrixNo": 121,"nameZh": "骨質疏鬆", "mappingKind": "TEMPLATE", "mappedBlueprintId": "Y1" },
    { "matrixNo": 58, "nameZh": "白內障",   "mappingKind": "REFERRAL", "mappedBlueprintId": null }
  ],
  "error": null,
  "meta": { "total": 40, "mapped": 30, "template": 6, "referral": 4 }
}
```

> `meta` reflects the reconciliation. All numbers above are illustrative — `total`, `mapped`, `template` and `referral` are computed from `00_藍圖總索引與設計規範.md` at ingest time (`total = mapped + template + referral`) and are NOT fixed invariants; do not hardcode any of them.

---

## 5. `GET /api/blueprints/:blueprintId/image` — read-only image

Stream the single 2×2 PNG for a blueprint, read-only from the mounted source dir (D5). Role: any authenticated.

- **Path param**: `blueprintId` — validated as above.
- The handler resolves the stored relative `imagePath` against `IMAGE_SOURCE_DIR`, asserts the resolved path stays within that root (no traversal), opens read-only, streams bytes.

**Response 200**: `Content-Type: image/png`, body = PNG bytes. Cache-friendly headers (`ETag`, `Cache-Control`) permitted.
**Errors**: `400 INVALID_PARAM`, `401 AUTH_REQUIRED`, `404 BLUEPRINT_NOT_FOUND`, `404 IMAGE_NOT_FOUND` (JSON envelope).

The source file is opened read-only; the route never writes, renames, or deletes (constitution II).

---

## 6. Ingestion command interface (NOT an HTTP endpoint)

Operator-run CLI in `backend/`. Produces the catalog; the only writer of catalog tables.

**Invocation**
```bash
npm run ingest            # parse → validate → (if clean) snapshot-replace in one transaction → report
npm run ingest -- --check # dry-run: parse + validate + report ONLY; never writes catalog (Phase A only)
```

**Environment (validated present at startup — constitution V/X)**
| Var | Meaning |
|-----|---------|
| `DATABASE_URL` | Postgres connection (dev `…:5433/…`) |
| `IMAGE_SOURCE_DIR` | Absolute or relative path (resolved against the backend working directory) to the READ-ONLY source dir, e.g. `IMAGE_SOURCE_DIR="../images"` from `backend/` |

**Behavior contract** (maps to FRs)
- Reads source **read-only**; never writes/renames/moves/deletes any source file (FR-001, SC-005).
- Validates all fail-fast invariants in memory **before** any DB write (FR-011, FR-017):
  blueprint file set == blueprint IDs listed in the index's per-region tables (FR-002: `FR-002:missing-blueprint` / `FR-002:unlisted-blueprint`) · every region has ≥ 1 blueprint (FR-003: `FR-003:empty-region`) · exactly 4 panels each (FR-004) · single image, no bidirectional orphan (FR-005) · non-empty indications/frequency/gentleReminder (FR-006) · every panel actionDescription non-empty (FR-007) · diagnosis matrix numbers unique and contiguous 1..total (FR-008: `FR-008:dup-matrixNo` / `FR-008:gap`) · every non-referral diagnosis → existing blueprint (FR-009) · high-risk set == `{S4,T8,P1,P4,P5,K2,K3,K5,L3}` exactly (FR-010) · legal + unique IDs (FR-022).
- On any failure: exit **non-zero**, persist **0 rows**, leave any prior catalog intact (FR-011/FR-015), print a report locating the failing invariant by `blueprintId` / `panelIndex` / `diagnosisNo` (FR-012, SC-004).
- On success: open **one** `prisma.$transaction` that snapshot-replaces the catalog; exit `0`; print a report summarizing totals, per-region counts, reconciliation, high-risk set, and (on re-run) an added/modified/removed diff (FR-012, FR-014).
- **Idempotent**: re-running on unchanged source yields an equivalent catalog, no duplicates/drift (FR-013, SC-003).

**Exit codes**
| Code | Meaning |
|------|---------|
| `0` | success (or `--check` passed) — catalog written (or would be) |
| `1` | validation failure — invariant(s) violated, 0 rows persisted |
| `2` | source unreadable / missing `IMAGE_SOURCE_DIR` — no catalog overwrite (FR-018) |
| `3` | DB/transaction error during Phase B — transaction rolled back, prior catalog intact |

**Report**: written to stdout (and optionally a log file under `backend/`), **never** into the source dir. Structured shape per `research.md` "Report shape"; rendered zh-TW human-readable with warnings (FR-021: empty `timingHint`/`visualDescription`, 0 covered diagnoses) kept distinct from fatal errors.
