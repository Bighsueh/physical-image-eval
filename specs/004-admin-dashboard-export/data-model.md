# Data Model: 管理員儀表板與匯出（Admin Dashboard & Export）

Feature 004 **owns no stored entity** — it adds **no table, no enum, no migration**. It
defines two **derived read projections**, `ReviewProgress` and `ExportRecord`, computed live
(constitution XI: read-only consumer of both domains; never mutates a review). All persisted
entities below are **referenced, not redefined** — they belong to 001 / 002 / 003.

Logical types are conceptual; there is no Prisma model for 004. "Source" columns name the
owning feature's field that feeds the projection.

---

## Referenced entities (owned elsewhere — read-only)

| Entity | Owner | Fields 004 reads |
|--------|-------|------------------|
| `Account` | 001 | `id`, `displayName` (sanitized on output), `role` (filter `REVIEWER`), `isActive` (在職／非在職, ratio basis & 非在職 flag) |
| `Region` | 002 | `regionCode`, `nameZh`, `displayOrder` (region ordering) |
| `Blueprint` | 002 | `blueprintId`, `exerciseName` (圖名稱), `regionId`/region, `isHighRisk` (= `HIGH_RISK_BLUEPRINT_IDS.has(blueprintId)`) |
| `Panel` | 002 | `panelIndex` 1..4 (alignment of 圖1..圖4) |
| `Review` | 003 | `reviewerId` (FK→Account; relation `reviewer`), `blueprintId`, `overallJudgement` (通過／需小修／需重做), `indicationJudgement` (合理／有疑慮), `indicationNote`, `status` (草稿／已提交), `submittedAt`, `lastSavedAt` |
| `PanelReview` | 003 | `panelIndex` 1..4, `requiredWarnings` (set), `warningOther`, `problemTypes` (set), `problemNote` |

**Constants (not redefined)**: `HIGH_RISK_BLUEPRINT_IDS = {S4,T8,P1,P4,P5,K2,K3,K5,L3}` —
imported from 002's `catalog-constants.ts` (single named constant; FR-009).

**Enums (owned by 003, read verbatim — FR-019)**:
- 整體判定: `通過` / `需小修` / `需重做`
- 適應症判定: `合理` / `有疑慮`
- 需要添加的警語: `注意跌倒` / `需有專人幫助指導` / `骨鬆注意` / `心肺功能不全者注意` / `其它`
- 問題類型: `部位／主題錯誤` / `動作示範錯誤` / `文字說明錯誤` / `次數／時間不合理` / `缺安全提醒` / `有錯字`

**Indexes 004 depends on** (owned by 001/003 — 004 adds none): from 003 — `Review(reviewerId)`,
`Review(blueprintId)`, `Review(reviewerId, status)`, unique `Review(reviewerId, blueprintId)`
(guarantees ≤ 1 submitted row per pair — FR-023); from 001 — `Account(isActive)` (+ `role`).
At this corpus size (≤ a few dozen reviewers × 51) these suffice; 004 requests no extra indexes.

---

## Projection: `ReviewProgress`（審查進度投影，衍生、不可變、永不寫回）

Built by `progress.service.ts` from the read repository. Three nested layers. **Active basis**
throughout (D2 in research): every headline number counts only active reviewers' submitted
records; 非在職 submissions are surfaced separately, never in an active numerator.

### Layer 1 — `OverallProgress`（整體聚合）

| Field | Logical type | Source / rule |
|-------|--------------|---------------|
| `activeReviewerCount` | int | `count(Account where role=REVIEWER, isActive=true)` |
| `expectedSubmissions` | int | `activeReviewerCount × 51` (FR-002 denominator) |
| `submittedActive` | int | `count(Review where status=已提交, account.isActive=true)` (FR-002 numerator) |
| `percent` | number (0–100) | `expectedSubmissions = 0 ⇒ 0`, else `submittedActive / expectedSubmissions × 100` (never > 100 — FR-002/016) |
| `inactiveSubmittedTotal` | int | `count(Review where status=已提交, account.isActive=false)` — shown **separately** (FR-016) |
| `fullyCoveredCount` | int | # blueprints with full active coverage (FR-011) |
| `blueprintsWithRedoCount` | int | # blueprints with ≥1 submitted 需重做 (FR-010) |
| `highRiskCount` | int | `9` (size of `HIGH_RISK_BLUEPRINT_IDS`) |
| `totalBlueprints` | int | `51` |

**Invariant (FR-022)**: `submittedActive = Σ_blueprint perImage.submittedActiveCount`
`= Σ_reviewer reviewer.submittedCount(active)`. The three layers are projections of one
filtered set; they cannot disagree at one point in time.

### Layer 2 — `ReviewerProgress[]`（各審查者投影；one per reviewer account）

| Field | Logical type | Source / rule |
|-------|--------------|---------------|
| `accountId` | string | `Account.id` |
| `displayName` | string | `Account.displayName`, sanitized on output (constitution V) |
| `isActive` | boolean | `Account.isActive` → label 在職／非在職 (FR-016) |
| `submittedCount` | int (0..51) | `count(Review where reviewerId, status=已提交)` (FR-003) |
| `unreviewedBlueprintIds` | string[] | the 51 blueprintIds minus this reviewer's submitted set (FR-003) |
| `lastSubmittedBlueprintId` | string \| null | blueprintId of `max(submittedAt)` (FR-004); `null` if none |
| `lastSubmittedAt` | timestamptz \| null | `max(Review.submittedAt)` for this reviewer (FR-004) |

- Active reviewers feed the active ratio; 非在職 reviewers are still listed (flagged 非在職)
  for visibility but excluded from `submittedActive`/`expectedSubmissions` (FR-002/016).
- Edge: a reviewer with 0 submissions ⇒ `submittedCount = 0`, `unreviewedBlueprintIds` = all 51,
  `lastSubmitted* = null` (spec Edge Cases).

### Layer 3 — `ImageProgress[]`（各圖投影；one per blueprint, 51）

| Field | Logical type | Source / rule |
|-------|--------------|---------------|
| `blueprintId` | string | `Blueprint.blueprintId` |
| `exerciseName` | string | `Blueprint.exerciseName` |
| `regionCode` | enum | `Region.regionCode` |
| `isHighRisk` | boolean | `HIGH_RISK_BLUEPRINT_IDS.has(blueprintId)` (FR-009) |
| `submittedActiveCount` | int | # active reviewers who submitted this blueprint (FR-005) |
| `missingReviewers` | `{accountId, displayName}[]` | active reviewers who have **not** submitted this blueprint (FR-005) |
| `fullCoverage` | boolean | `missingReviewers.length = 0 ∧ activeReviewerCount > 0` (FR-011) |
| `distribution` | `{ 通過:int, 需小修:int, 需重做:int }` | counts among **active** submitters only (FR-006) |
| `hasRedo` | boolean | `distribution.需重做 > 0` (FR-010) |
| `inactiveSubmittedCount` | int | # 非在職 submitters of this blueprint — surfaced separately (FR-016) |

- **Ordering**: by `Region.displayOrder` then numeric blueprint id (locked stack).
- Edge: 0 submitters ⇒ `submittedActiveCount = 0`, `distribution` all 0, `missingReviewers` =
  all active reviewers, `fullCoverage = false` (spec Edge Cases).

### Layer 3b — `ImageDrillDown`（單圖逐審查者對照；FR-008/018）

For one blueprint, the cross-reviewer detail that surfaces disagreement (v1: surface only,
**no** mediation — D6):

| Field | Logical type | Source / rule |
|-------|--------------|---------------|
| `blueprintId` | string | path param |
| `summary` | `ImageProgress` | the Layer-3 row for this blueprint (coverage + distribution) |
| `rows` | `DrillDownRow[]` | one per **submitted** reviewer (active **and** 非在職) |
| `hasDisagreement` | boolean | distinct non-null `overallJudgement` among `rows` > 1 (FR-008) |

`DrillDownRow`: `{ accountId, displayName(sanitized), isActive, overallJudgement, indicationJudgement, submittedAt }`.
Drafts never appear (FR-007). At most one row per (reviewer × blueprint) — FR-023.

---

## Projection: `ExportRecord`（匯出紀錄列，衍生；one per submitted reviewer × image）

Built by `export.service.ts`; serialized to CSV by `csv-serializer.ts` (D3–D5 in research).
**Submitted-only** (drafts excluded, FR-015); includes **all** submitters — active and 非在職 —
each flagged (FR-013/016). Read-only; never alters source rows.

| Logical field | Type | CSV column (zh-TW) | Source / rule |
|---------------|------|--------------------|---------------|
| `reviewerId` | string | 審查者ID | `Account.id` |
| `reviewerName` | string | 審查者名稱 | `Account.displayName` — injection-neutralized (FR-020) |
| `reviewerActive` | enum | 在職狀態 | `在職` / `非在職` from `Account.isActive` (FR-016) |
| `blueprintId` | string | 藍圖ID | `Blueprint.blueprintId` (FR-014) |
| `blueprintName` | string | 藍圖名稱 | `Blueprint.exerciseName` (FR-014) |
| `regionCode` | enum | 解剖區域 | `Region.regionCode` (FR-014) |
| `isHighRisk` | flag | 高風險 | `是`/`否` from `HIGH_RISK_BLUEPRINT_IDS` (FR-009/017) |
| `overallJudgement` | enum | 整體判定 | 通過／需小修／需重做 verbatim (FR-014/019) |
| `hasRedo` | flag | 含需重做 | `是`/`否`; `是` iff 整體判定=需重做 (FR-017) |
| `indicationJudgement` | enum \| "" | 適應症判定 | 合理／有疑慮 or empty (FR-012/014) |
| `indicationNote` | text | 適應症說明 | free text — escaped + injection-neutralized (FR-020) |
| `panel{n}.requiredWarnings` | set→string | 圖{n}_需要添加的警語 | pipe-delimited enum list; empty = explicit empty set (FR-014/015) |
| `panel{n}.warningOther` | text | 圖{n}_警語其它 | free text — neutralized (FR-014/020) |
| `panel{n}.problemTypes` | set→string | 圖{n}_問題類型 | pipe-delimited enum list; empty = empty set (FR-014/015) |
| `panel{n}.problemNote` | text | 圖{n}_問題說明 | free text — neutralized (FR-014/020) |
| `submittedAt` | timestamptz | 提交時間 | ISO-8601 UTC (FR-014) |

`{n}` ∈ {1,2,3,4} → 16 panel columns; 28 columns total (column order fixed in
`dashboard-constants.ts`, D4). A "乾淨通過" record still emits a full row: all four panels'
warning/problem columns present and empty (FR-015).

**Invariants**
- Only `status = 已提交` rows are emitted; draft count in export = 0 (FR-007/015, SC-002).
- Exactly one row per (reviewer × blueprint) — no duplicates (FR-023, spec Edge Cases).
- Multi-select cells are parseable delimited lists; flags are explicit columns (FR-017).

---

## Relationship summary (logical, read-only)

```text
Account(REVIEWER, isActive) ──reads──┐
Region ──< Blueprint ──1:4── Panel ──reads──┤
Review(已提交) ──1:4── PanelReview ──reads──┘
                                            ▼
              ReviewProgress (Overall ▸ Reviewer[] ▸ Image[] ▸ DrillDown)   [derived, in-memory]
              ExportRecord[]  (one per submitted reviewer × image)          [derived → CSV]

# 004 writes NOTHING. No table, no enum, no migration. Active basis: FR-002/016/022.
# HighRisk = single named constant HIGH_RISK_BLUEPRINT_IDS (002). Enums owned by 003 (FR-019).
```

---

# Amendment 2026-08-27 — 參考照片的唯讀投影（FR-025..FR-037）

004 still **writes nothing**: no table, no enum, no migration. `ReviewPhoto` and
`ReviewPhotoBlob` are owned by 003; everything below is a read-only projection over them,
always joined through a `Review` whose `status = 已提交` (research D10).

## Referenced entity (owned by 003 — read-only)

**`ReviewPhoto`** — one photo attached by one reviewer to one review, bound to a panel
(`panelIndex` 1..4) or to the image as a whole (`panelIndex = NULL`). 004 reads:
`reviewId` (→ reviewer × blueprint), `panelIndex`, `caption`, `originalByteSize`,
`annotatedByteSize`, `annotatedAt`, `sortOrder`, `createdAt`. 004 **never** reads
`ReviewPhotoBlob` for listing or counting — only when streaming a single file or a bundle
(research D12), and then by primary key.

> **Draft exclusion is structural.** Every query below starts from `Review` filtered to
> `已提交` and joins outward to photos — never from `ReviewPhoto` inward. A photo on a draft
> review is unreachable by construction, not by a filter each caller must remember
> (FR-028, research D10).

## Projection: `ImageWorkTable`（修圖工作台，衍生、不可變）

Replaces the flat shape of `ImageDrillDown` for the per-image view (research D11). One per
blueprint.

| Field | Type | Notes |
|-------|------|-------|
| `blueprintId` / `exerciseName` / `regionCode` / `isHighRisk` | — | From the catalog (002), read-only. |
| `submittedReviewerCount` | int | Reviewers with a 已提交 review of this blueprint. |
| `judgementDistribution` | `{通過, 需小修, 需重做}` | Unchanged from `ImageDrillDown`. |
| `photoCount` | int | Total photos across all **submitted** reviews of this blueprint (FR-027). |
| `panels` | `PanelGroup[4]` | One per 圖1..圖4, in index order. |
| `imageLevelEntries` | `ReviewerEntry[]` | Entries whose photos have `panelIndex = NULL` (003 FR-046). |

**`PanelGroup`**

| Field | Type | Notes |
|-------|------|-------|
| `panelIndex` | 1..4 | — |
| `stepName` | string | From the catalog panel (002), for orientation. |
| `flaggedReviewerCount` | int | Submitting reviewers who did **not** mark this panel 無問題 (FR-027). |
| `photoCount` | int | Photos on this panel across submitted reviews (FR-027). |
| `allClear` | bool | True when every submitting reviewer marked 無問題 — the UI collapses these (research D11). |
| `entries` | `ReviewerEntry[]` | One per submitting reviewer with something to show. |

**`ReviewerEntry`**

| Field | Type | Notes |
|-------|------|-------|
| `reviewerDisplayName` | string | — |
| `isActive` | bool | 非在職 entries are retained and flagged, per FR-016. |
| `overallJudgement` | enum | The image-level judgement, shown for context. |
| `requiredWarnings` / `warningOther` / `problemTypes` / `problemNote` | — | From `PanelReview`, verbatim; free text sanitized on output (FR-020). |
| `photos` | `PhotoRef[]` | This reviewer's photos for this panel. |
| `submittedAt` | timestamptz | — |

**`PhotoRef`**

| Field | Type | Notes |
|-------|------|-------|
| `photoId` | string | — |
| `caption` | string \| null | Free text, sanitized on output (FR-020). |
| `hasAnnotated` | bool | Whether an annotated version exists. |
| `urls` | `{ display, original, annotated? }` | Admin-scoped file routes; bytes are never inlined. |

## Projection: `PhotoBundle`（照片打包，衍生）

One per blueprint (research D12).

| Field | Type | Notes |
|-------|------|-------|
| `blueprintId` | string | — |
| `files` | `BundleFile[]` | Each with its in-archive name encoding 圖 × 分格 × 審查者 × 版本別 (FR-030). |
| `totalFiles` / `totalBytes` | int | For the pre-download summary. |

Composition rule (FR-030, research D12): for each submitted photo include the **original**
and, when present, the **annotated** version. The display derivative is excluded. When the
original is HEIC and no annotated version exists, 003's `originalAsJpeg` is included in its
place so the archive always holds an openable file. `panelIndex = NULL` photos are named as
整體 rather than a panel number.

## Projection: `PhotoStorageUsage`（照片佔用空間，衍生）

| Field | Type | Notes |
|-------|------|-------|
| `usedBytes` | bigint | `SUM(originalByteSize + displayByteSize + COALESCE(annotatedByteSize,0))` over **all** photos — draft ones included, because disk is consumed regardless of review status. |
| `limitBytes` | bigint | The configured ceiling; default 10 GiB (FR-037). |
| `usedPercent` | number | — |
| `warning` | `none` \| `approaching` \| `full` | `approaching` at ≥ 80 %, `full` at ≥ 100 % (FR-034). |

> **The one place drafts are counted.** Usage measures storage consumption, not review
> progress, so it deliberately spans drafts as well — an exception to research D10, called
> out here so it is not read as an inconsistency. Every *other* photo number on the
> dashboard is submitted-only. The byte columns live on `ReviewPhoto`, so this aggregate
> never touches the blob table (003 research D11).

## Relationship summary (updated)

```text
Review(已提交) 1 ──< ReviewPhoto 0..n            ← the ONLY path admin views may traverse
Review(草稿)   1 ──< ReviewPhoto 0..n            ← invisible to 004 (FR-028) except in PhotoStorageUsage

ImageWorkTable  = Blueprint(002) ⋈ Review(已提交) ⋈ PanelReview ⋈ ReviewPhoto, grouped by panelIndex
PhotoBundle     = ImageWorkTable's photos → { original, annotated? | originalAsJpeg }
ExportRecord    = unchanged columns + appended { photoCount, photoFilenames }   (research D13)

# 004 still writes NOTHING. Photo tables are owned by 003.
```
