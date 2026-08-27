# Data Model: Reviewer Review Workflow

Logical model for the entities **owned by feature 003**: `Review`, `PanelReview`, and the
five review enums (`OverallJudgement`, `IndicationJudgement`, `WarningType`, `ProblemType`,
`ReviewStatus`). Types are logical; the physical mapping is Prisma → PostgreSQL. Surrogate
PKs (`id`) are opaque cuids. `createdAt` exists on every table; other timestamps are listed
explicitly because they carry domain meaning.

This feature **is** the mutable / **review domain** (constitution XI). It references but never
writes the **catalog domain** (`Region`/`Blueprint`/`Panel` — feature 002) or the **auth
domain** (`Account` — feature 001).

---

## Enums

All enum **values are the spec's zh-TW strings, verbatim** (constitution VIII). Storage is a
native Postgres enum whose labels are those zh-TW strings; the Prisma member identifier is
ASCII with `@map` to the label, and the API transmits the zh-TW value (research D2).

### `OverallJudgement`（整體判定）
Single-select, image-level. **NULL until submit**; required to submit (FR-010/FR-011).

| zh-TW value | Prisma id `@map` |
|-------------|------------------|
| `通過` | `PASS` |
| `需小修` | `MINOR_FIX` |
| `需重做` | `REDO` |

### `IndicationJudgement`（適應症／診斷對應）
Single-select, image-level. Optional/nullable; never forces a note (FR-012).

| zh-TW value | Prisma id `@map` |
|-------------|------------------|
| `合理` | `REASONABLE` |
| `有疑慮` | `DOUBTFUL` |

### `WarningType`（需要添加的警語）
Member type of a panel's multi-select set; the set may be empty (FR-014).

| zh-TW value | Prisma id `@map` |
|-------------|------------------|
| `注意跌倒` | `FALL_RISK` |
| `需有專人幫助指導` | `NEEDS_ASSISTANCE` |
| `骨鬆注意` | `OSTEOPOROSIS` |
| `心肺功能不全者注意` | `CARDIOPULMONARY` |
| `其它` | `OTHER` |

### `ProblemType`（問題類型）
Member type of a panel's multi-select set; the set may be empty (FR-016).

| zh-TW value | Prisma id `@map` |
|-------------|------------------|
| `部位／主題錯誤` | `WRONG_SUBJECT` |
| `動作示範錯誤` | `WRONG_DEMONSTRATION` |
| `文字說明錯誤` | `WRONG_TEXT` |
| `次數／時間不合理` | `UNREASONABLE_FREQ_TIME` |
| `缺安全提醒` | `MISSING_SAFETY` |
| `有錯字` | `TYPO` |

### `ReviewStatus`（審查狀態）
Stored status of a `Review` (FR-024).

| zh-TW value | Prisma id `@map` | Meaning |
|-------------|------------------|---------|
| `草稿` | `DRAFT` | Has at least one autosave; **not** counted in 已提交 x/51. |
| `已提交` | `SUBMITTED` | Has `overallJudgement`; counted, comparable, exportable (004). |

> **未開始** is **not** a stored value — it is the *absence* of a `Review` row for that
> (reviewer × blueprint), derived when computing progress (research D4). The progress
> **filter** still offers 未開始／草稿／已提交; the first is "no row".

---

## Entity: `Review`（審查）

One reviewer's whole review of one blueprint. Identity = (reviewer × blueprint), unique
(FR-001). Created lazily on the first autosave; owns exactly four `PanelReview` rows.

| Field | Logical type | Notes / constraints |
|-------|--------------|---------------------|
| `id` | string (cuid) | PK. |
| `reviewerId` | string (FK → `Account.id`, 001) | NOT NULL. The owning 審查者. Always set from the session, never the request (FR-003, research D8). |
| `blueprintCode` | string (catalog **business code**, e.g. `S1`) | NOT NULL. The reviewed blueprint, referenced by its business code — **NOT** a FK to `Blueprint.id`. Re-ingestion deletes+recreates every `Blueprint` row with new cuids (002), so a cuid FK would break re-ingestion (RESTRICT) or cascade-delete review data (CASCADE). The catalog is resolved by code at read time; a retired blueprint makes its reviews inaccessible (open → `BLUEPRINT_NOT_FOUND`) but never corrupts them. A DB CHECK enforces the `^[SHETPKLY][1-9][0-9]?$` shape. |
| `overallJudgement` | `OverallJudgement` \| null | 整體判定. **NULL until submit**; required to submit (FR-010/FR-011). |
| `indicationJudgement` | `IndicationJudgement` \| null | 適應症／診斷對應. Optional (FR-012). |
| `indicationNote` | text \| null | 適應症說明. Optional free text; preserved verbatim (V). |
| `otherComment` | text \| null | 其他意見. Image-level optional free text (2026-07-01); preserved verbatim. |
| `status` | `ReviewStatus` | default `草稿`. Never regresses 已提交→草稿 (FR-026). |
| `createdAt` | timestamptz | default now(). Immutable (first autosave). |
| `lastSavedAt` | timestamptz \| null | Set on every autosave (draft save marker). |
| `submittedAt` | timestamptz \| null | Set on **first** transition to 已提交; not rewritten on re-submit (FR-032, research D4). |
| `lastUpdatedAt` | timestamptz | Bumped on **every** mutation (autosave, submit, re-submit). The "最近更新時間 / last-updated" (FR-032). |

**Relationships**
- `Review *──1 Account` — Prisma relation field **`reviewer`** with scalar **`reviewerId`**
  (`reviewer Account @relation(fields: [reviewerId], references: [id])`; 001). Other features
  MUST reference this Review FK as `reviewerId` / `reviewer`, not `accountId`. Disabling an
  account never deletes its reviews (001 FR-008) — no cascade from `Account`.
- `Review *··> Blueprint` (002, read-only reference **by business code**, not a FK — see `blueprintCode`).
- `Review 1 ──= PanelReview` (**exactly 4**, one per `panelIndex` 1..4 — FR-013).

**Constraints / indexes**
- **`UNIQUE(reviewerId, blueprintCode)`** — the (reviewer × blueprint) identity (FR-001).
- Index on `(reviewerId, status)` (已提交 / 草稿 counts — FR-039; also serves reviewerId-leading scans, so no standalone `reviewerId` index).
- Index on `blueprintCode` (cross-reviewer aggregation is **004**'s concern; provided for it).
- CHECK `blueprintCode ~ '^[SHETPKLY][1-9][0-9]?$'` and CHECK `panelIndex BETWEEN 1 AND 4` (defense-in-depth, mirrors zod).

**Application-level invariants** (service layer)
- Each `Review` has exactly four `PanelReview` rows `{1,2,3,4}` — created together on first
  autosave, replaced together on each autosave (FR-013, research D3).
- `status = 已提交 ⇒ overallJudgement IS NOT NULL` (submit gate, FR-011).
- Autosave never sets `已提交`; never sets a `已提交` row to `草稿` (FR-025/FR-026).
- `reviewerId` equals the session account on every read/write (FR-003/SC-010).

---

## Entity: `PanelReview`（分格審查）

One reviewer's notes on one of a blueprint's four panels. Exactly four per `Review`. Drafts may
be incomplete, but at **submit** each panel must be `noProblem` OR carry an annotation
(2026-07-01 clarification supersedes the old "all-empty valid" of FR-018).

| Field | Logical type | Notes / constraints |
|-------|--------------|---------------------|
| `id` | string (cuid) | PK. |
| `reviewId` | string (FK → `Review.id`) | NOT NULL. `ON DELETE CASCADE` (panels live and die with their review). |
| `panelIndex` | int (1..4) | 對應 圖1..圖4 — 圖1=左上, 圖2=右上, 圖3=左下, 圖4=右下 (FR-013). |
| `noProblem` | boolean | 無問題 sign-off (2026-07-01), default `false`. Submit requires `noProblem` OR any annotation per panel. |
| `requiredWarnings` | `WarningType[]` | 需要添加的警語. **Multi-select set**, default `[]` (empty valid). Members deduped (research D1). |
| `warningOther` | text \| null | 警語－其它. Optional free text; **orphan-preserved** even if `其它` not selected (FR-019); sanitized on output. |
| `problemTypes` | `ProblemType[]` | 問題類型. **Multi-select set**, default `[]` (empty valid). Members deduped. |
| `problemNote` | text \| null | 問題說明. Optional free text; **orphan-preserved** even if no problem type selected (FR-019); sanitized on output. |

**Relationships**
- `PanelReview *──1 Review`.

**Constraints / indexes**
- **`UNIQUE(reviewId, panelIndex)`** — one row per panel.
- Check: `panelIndex BETWEEN 1 AND 4`.
- Application invariant: the four rows of a review are exactly `{1,2,3,4}` — no gaps, no
  extras (FR-013), mirroring the catalog's panel set (002).

> **Orphan free-text** (FR-019, spec Edge Cases): `warningOther` / `problemNote` text is
> **never discarded** because its companion checkbox/set is empty. The autosave writer stores
> exactly what the client sent (research D3/D10).

---

## Four-aspect coverage (FR-021) — how the fields map to the reviewer's four gates

| 把關面向 | Fields |
|----------|--------|
| 動作對不對 | panel `問題類型` = `動作示範錯誤`（輔以 `部位／主題錯誤`） |
| 安全與禁忌 | panel `問題類型` = `缺安全提醒` + the whole `需要添加的警語` set |
| 適應症對不對 | image-level `適應症／診斷對應` + `整體判定` |
| 文字／畫面有沒有錯 | panel `問題類型` = `文字說明錯誤` / `次數／時間不合理` / `有錯字` |

(Coverage mapping only; no separate column — these are the existing fields above.)

---

## Cross-feature references (not owned here)

- **`Account` (001)** — `Review.reviewerId → Account.id`. 003 guarantees the row is owned by
  the authenticated reviewer; it never creates/edits an `Account`. Only `REVIEWER`-role
  accounts own reviews (server-enforced, constitution IV).
- **`Blueprint` / `Panel` / `Region` (002)** — read-only. `Review.blueprintId → Blueprint.id`;
  the reviewer-facing blueprint payload (metadata + 4 panels incl. `畫面視覺描述`, `isHighRisk`,
  **never `aiPrompt`**) comes from 002's `blueprint-public` projection (research D9). Ordering
  for auto-advance uses `Region.displayOrder` → numeric `blueprintId` (research D7). 003 never
  writes any catalog row.
- **`HIGH_RISK_BLUEPRINT_IDS` (002 constant)** — `{S4,T8,P1,P4,P5,K2,K3,K5,L3}`. Reused, not
  redefined (FR-036); drives the informational, non-blocking high-risk badge (FR-033–FR-035).

## Entity-relationship summary

```text
Account(REVIEWER) 1 ──< Review 0..51 ──= PanelReview ×4
                          │
                          └──*:1── Blueprint (002, read-only;  UNIQUE(reviewerId, blueprintId))

Blueprint 1 ──< Review 0..n   (one per reviewer; many reviewers comparable on the same image)
ReviewStatus = { 草稿, 已提交 }   ; 未開始 = absence of a Review row (derived)
HighRisk badge source = HIGH_RISK_BLUEPRINT_IDS (002 single named constant)
```

---

# Amendment 2026-08-27 — 參考照片（FR-045..FR-061）

Two **new** tables. **No existing table is altered** — no column added, renamed, dropped or
retyped on `Account`, `Session`, `AuditLog`, `Region`, `Blueprint`, `Panel`, `Diagnosis`,
`Review` or `PanelReview` (FR-060, research D19). The Prisma relation field added to
`Review` (`photos ReviewPhoto[]`) is virtual and emits no SQL column, so the migration is
exactly two `CREATE TABLE` statements plus their indexes and foreign keys.

## Entity: `ReviewPhoto`（參考照片 — metadata）

One photo a reviewer attached to their own review, either to a specific panel or to the
image as a whole. Metadata only — the bytes live in `ReviewPhotoBlob` (research D11).

| Field | Logical type | Notes / constraints |
|-------|--------------|---------------------|
| `id` | string (cuid) | PK. |
| `reviewId` | string (FK → `Review.id`) | NOT NULL, **ON DELETE CASCADE**. Ownership is the Review's owner; there is no separate `reviewerId` (it would be denormalized and could drift). Deleting a Review (FR-043 初始化) removes its photos (FR-059). |
| `panelIndex` | int \| null | `1..4` binds this photo to 圖1..圖4 (FR-045); **NULL** = 圖層級「整體參考照片」(FR-046). Photos are **not** children of `PanelReview` — that table is snapshot-replaced on every autosave (research D12). |
| `caption` | text \| null | 說明文字. Optional free text; preserved verbatim, sanitized on output (FR-047, constitution V). |
| `originalMimeType` | string | Validated by **magic bytes**, not the client-supplied header (research D16). |
| `originalByteSize` | int | Used for the storage-usage aggregate (004 FR-034). |
| `displayByteSize` | int | Size of the display derivative. |
| `annotatedByteSize` | int \| null | NULL until annotated. |
| `annotationState` | json \| null | Re-editable annotation content (FR-056). NULL until annotated. Small; kept here, not in the blob table, so it can be read without touching bytes. |
| `annotatedAt` | timestamptz \| null | Set/refreshed on each annotation save; last write wins, no version history (FR-056). |
| `sortOrder` | int | Stable display order within its panel (or within the image-level group). |
| `createdAt` | timestamptz | default now(). |
| `updatedAt` | timestamptz | Bumped on caption/annotation change. |

**Relationships**
- `ReviewPhoto *──1 Review` — relation field `review`, scalar `reviewId`, `onDelete: Cascade`.
- `ReviewPhoto 1 ──1 ReviewPhotoBlob` — the bytes, split out per research D11.

**Constraints / indexes**
- Index on `(reviewId, panelIndex, sortOrder)` — the per-panel listing used by the workspace
  and by the submit gate's photo count (FR-049, research D15).
- CHECK `panelIndex IS NULL OR panelIndex BETWEEN 1 AND 4` (defense-in-depth, mirrors zod).
- **No** uniqueness on `(reviewId, panelIndex)` — a panel may carry any number of photos;
  there is deliberately no per-panel cap (FR-048).

**Application-level invariants** (service layer)
- Every read/write resolves the owning Review from the **session** reviewer; a photo id
  belonging to another reviewer is never reachable (FR-057, mirrors research D8).
- Uploading a photo when no `Review` row exists creates one in `草稿` (FR-050); uploading to
  a `已提交` review keeps `已提交`, bumps `lastUpdatedAt`, and leaves `submittedAt` unchanged
  (FR-051, research D14).
- A panel is "已標注問題" if it carries ≥ 1 photo, evaluated **inside the submit transaction**
  together with the document (FR-049, research D15).
- The original is never overwritten by a derivative or by an annotation (FR-052, research D13).

## Entity: `ReviewPhotoBlob`（照片位元組）

The bytes for one `ReviewPhoto`, deliberately in their own table so that no metadata query
can accidentally load them (research D11).

| Field | Logical type | Notes / constraints |
|-------|--------------|---------------------|
| `photoId` | string (FK → `ReviewPhoto.id`) | **PK** and FK, **ON DELETE CASCADE**. One-to-one. |
| `original` | bytes (`bytea`) | NOT NULL. The uploaded file, **never re-encoded** (FR-052). May be HEIC — the original's allow-list is wider than the display derivative's (research D16). |
| `display` | bytes (`bytea`) | NOT NULL. ~1600 px JPEG produced client-side; every grid/lightbox/admin view reads this one (research D13). |
| `annotated` | bytes (`bytea`) \| null | Full-resolution flattened annotation output. NULL until annotated; authoritative over `annotationState` (research D17). |
| `originalAsJpeg` | bytes (`bytea`) \| null | Only populated when the original is HEIC **and** no annotated version exists — guarantees the download bundle always contains a universally openable file without paying ~3 MB on every photo (004 FR-030). |

**Constraints / indexes**
- PK on `photoId` only. **No other index** — this table is only ever reached by primary key
  from a resolved, authorized `ReviewPhoto`.
- Never selected by a list query. Repositories MUST use explicit `select` and MUST NOT
  expose a `findMany` over this table (research D11).

## Entity-relationship summary (updated)

```text
Account(REVIEWER) 1 ──< Review 0..51 ──= PanelReview ×4
                          │
                          ├──< ReviewPhoto 0..n ──1 ReviewPhotoBlob   (cascade on Review delete)
                          │       panelIndex 1..4 = 分格；NULL = 圖層級
                          │
                          └──*:1── Blueprint (002, read-only, by business code)

未開始 = absence of a Review row — now reachable in two ways in reverse: a first autosave
         OR a first photo upload creates the row as 草稿 (FR-050, research D14).
```
