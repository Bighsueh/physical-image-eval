# Research: 管理員儀表板與匯出（Admin Dashboard & Export）

Phase 0 technical decisions for feature 004, grounded in the locked stack (Express +
Prisma + PostgreSQL backend; React + Vite + TanStack Query frontend) and constitution
I–XI. This feature owns no stored data; every decision is about **how to derive and serve**
read projections without ever mutating the review domain.

---

## D1 — Aggregation approach: read-only Prisma `groupBy`/`count`, NOT SQL views

**Decision**: Compute every dashboard number live with Prisma read operations in
`review-read.repository.ts`:

- **Active reviewer denominator**: `account.count({ where: { role: 'REVIEWER', isActive: true } })` × `blueprint.count()` (blueprints currently in the catalog).
- **Active submitted numerator**: `review.count({ where: { status: '已提交', reviewer: { isActive: true } } })`.
- **Per-reviewer submitted count + unreviewed list**: `review.groupBy({ by: ['reviewerId'], where: { status: '已提交' }, _count: true })`, then diff each reviewer's submitted `blueprintId` set against the catalog's blueprint IDs to produce 尚未提交清單; `findFirst` ordered by `submittedAt desc` for last-submit.
- **Per-image distribution**: `review.groupBy({ by: ['blueprintId', 'overallJudgement'], where: { status: '已提交', reviewer: { isActive: true } }, _count: true })`.
- **Per-image coverage**: `review.groupBy({ by: ['blueprintId'], where: { status: '已提交', reviewer: { isActive: true } } })` for the active submitted count; missing = active reviewers minus submitters.
- **Drill-down**: `review.findMany({ where: { blueprintId, status: '已提交' }, select: { reviewerId, reviewer: { select: { displayName, isActive } }, overallJudgement, indicationJudgement, submittedAt } })`.

**Rationale**: The corpus is tiny (≤ a few dozen reviewers × the blueprint catalog ⇒ low-thousands of `Review`
rows). `groupBy` over indexed columns (`Review.blueprintId`, `Review.reviewerId`,
`Review(reviewerId, status)` from 003; `Account(isActive)` from 001) is well under the < 150 ms
target and is **always fresh**, satisfying SC-009 (ratio reflects active-reviewer changes on
next view) with no refresh step. Prisma is parameterized (constitution V) and keeps 004
purely in the application layer with no migration of its own (constitution XI — 004 adds no
catalog/review schema).

**Alternatives considered**:
- *Postgres SQL views / materialized views* — rejected for v1: adds migrations + a refresh
  story 004 would own, risks staleness vs SC-009, and buys nothing at this data volume.
- *Denormalized counters maintained on review write* — rejected: couples 004 to 003's write
  path and violates the read-only boundary (FR-012, constitution XI). 004 must never sit on a
  write transaction.

---

## D2 — Active-basis consistency (FR-002 / FR-016 / FR-022): one basis everywhere

**Decision**: All three headline aggregates use a **single active basis** = active reviewers'
submitted records:

| Aggregate | Numerator / value | Basis |
|-----------|-------------------|-------|
| Overall completion | active submitted ÷ (active reviewers × blueprints in catalog) | active only |
| Per-image coverage | active submitters of that image; missing = active non-submitters | active only |
| Per-image distribution | counts of 通過／需小修／需重做 among **active** submitters | active only |

非在職（disabled）reviewers' submitted records are **kept** but surfaced **separately**:
a global `inactiveSubmittedTotal`, a per-image `inactiveSubmittedCount`, and a 非在職 flag on
each drill-down row and each export row. They are **never** added to any active numerator or
to the active distribution.

**Why this guarantees FR-022 (no contradiction)**: because coverage's active submitted count
for an image equals the sum of that image's active distribution counts, and the overall active
numerator equals Σ over images of the active submitted counts. The three numbers are different
projections of the **same** filtered set, so they cannot disagree at a single point in time.
Mixing 非在職 into any one of them would break this identity and could push the ratio over
100% (a reviewer disabled after submitting still has rows) — exactly what FR-002/016 forbid.

**Edge handling**: when active reviewer count = 0 (no reviewers, or all disabled), the
denominator is 0; the ratio is reported as `{ submitted: 0, expected: 0, percent: 0 }` (no
division), and the dashboard renders an empty state, not an error (FR-021, SC-010).

---

## D3 — Export format: UTF-8 CSV **with BOM**, one row per submitted record

**Decision**: The export is **CSV**, UTF-8 encoded, prefixed with the UTF-8 BOM
(`EF BB BF`). One row per **submitted** (reviewer × image) record (drafts excluded, FR-015).
`Content-Type: text/csv; charset=utf-8`,
`Content-Disposition: attachment; filename="review-export-<UTCstamp>.csv"`.

**Rationale**: The consumer is the 產圖 (image-fixing) team — humans opening the file in Excel
(constitution VIII assumes zh-TW). Excel on Windows mis-decodes UTF-8 CSV without a BOM,
mangling 繁體中文; the BOM forces correct decoding. CSV is the lowest-friction, universally
openable single-table format and maps cleanly to FR-017's "單列對應一組（審查者 × 圖）".

**Alternatives considered**:
- *XLSX* — rejected for v1: needs a heavyweight library and styling decisions the spec doesn't
  ask for; CSV+BOM already opens natively in Excel. (Can be added later without contract change.)
- *JSON / NDJSON* — rejected: FR-017 + the human consumer call for a flat tabular, single-row
  shape, not a nested document.

---

## D4 — Multi-select encoding + explicit empty set + flag columns (FR-014/015/017)

**Decision**:
- **Multi-select sets** (需要添加的警語、問題類型) are encoded as a **delimited list using the
  ASCII pipe `|`** between items, e.g. `骨鬆注意|心肺功能不全者注意`. The pipe is safe because
  every multi-select item is a fixed zh-TW enum value (FR-019) containing no `|`. An empty set
  is the **empty string** in a column that is **always present** — so a "乾淨通過" panel reads
  as an explicit empty set, never a missing column (FR-015).
- **警語－其它** and **問題說明** are **separate free-text columns** per panel (not folded into
  the pipe list), so structured enum sets stay machine-parseable while free text is isolated.
- **Flag columns** are explicit zh-TW columns: `高風險`（是／否）, `含需重做`（是／否；true iff
  整體判定 = 需重做）, `在職狀態`（在職／非在職）. Flags are columns, not color (constitution IX /
  FR-024 also applies to the file's interpretability).

**Column order (one row per submitted reviewer × image)** — fixed in `dashboard-constants.ts`:

```
審查者ID, 審查者名稱, 在職狀態, 藍圖ID, 藍圖名稱, 解剖區域, 高風險, 整體判定, 含需重做,
適應症判定, 適應症說明,
圖1_需要添加的警語, 圖1_警語其它, 圖1_問題類型, 圖1_問題說明,
圖2_需要添加的警語, 圖2_警語其它, 圖2_問題類型, 圖2_問題說明,
圖3_需要添加的警語, 圖3_警語其它, 圖3_問題類型, 圖3_問題說明,
圖4_需要添加的警語, 圖4_警語其它, 圖4_問題類型, 圖4_問題說明,
提交時間
```

(28 columns: 11 record/flag/indication + 4 panels × 4 + 提交時間.) Enum cells carry the **zh-TW
labels verbatim** (FR-019, constitution VIII); `提交時間` is ISO-8601 UTC.

---

## D5 — Free-text safety: RFC-4180 escaping **and** CSV formula-injection neutralization (FR-020)

**Decision**: `csv-serializer.ts` applies two layers to every cell, free-text cells especially
(適應症說明、警語－其它、問題說明、審查者名稱):

1. **RFC-4180 structural escaping** — any cell containing `"`, `,`, CR, or LF is wrapped in
   double quotes with embedded `"` doubled (`""`). This keeps free text from breaking the
   column structure (FR-020, SC-002 §4).
2. **Formula-injection neutralization** — a cell whose first character is `=`, `+`, `-`, `@`,
   TAB (`0x09`), or CR (`0x0D`) is prefixed with a single apostrophe `'` before quoting, so
   Excel/Sheets treat it as text, not a formula. This blocks the classic CSV-injection vector.

For **dashboard JSON display**, the same free text is HTML-escaped on output (constitution V,
XSS) by the DTO builders; the raw stored value is never trusted on either surface.

**Rationale**: FR-020 + the spec edge case "free text 含特殊字元或可能破壞匯出結構／注入" demand
both structural integrity and injection safety; doing it in one in-house serializer keeps the
guarantee testable (a unit test feeds `=cmd|...`, `a,b"c`, newline-containing notes) with no
third-party dependency.

---

## D6 — Disagreement is **surfaced, not mediated** (FR-018, v1)

**Decision**: The drill-down returns, for one blueprint, each submitted reviewer's 整體判定 +
適應症判定 (+ 在職狀態 + 提交時間) and a derived `hasDisagreement` boolean = (distinct
非空 整體判定 values among submitters > 1). v1 provides **no** consensus, merge, vote, or
write-back; the dashboard renders the divergent rows side by side and disagreement is resolved
線下. No endpoint can collapse divergent judgements into one.

**Rationale**: FR-018 + the spec assumption explicitly scope v1 to presentation only. Keeping
this a pure read keeps 004 inside its read-only boundary (constitution XI) and avoids inventing
a mediation data model the spec hasn't defined.

---

## D7 — Filters as validated boolean query flags on the per-image endpoint (FR-009/010/011)

**Decision**: `GET /api/admin/dashboard/images` accepts optional, zod-validated, combinable
boolean flags: `hasRedo`（含需重做：≥1 submitter marked 需重做）, `highRisk`（藍圖屬高風險集合）,
`notFullyCovered`（尚有在職審查者未提交該圖）. The same flags optionally apply to the export.
`highRisk` derives from the shared `HIGH_RISK_BLUEPRINT_IDS` constant (002) — **not**
re-declared (constitution: single named constant; FR-009). Unknown/malformed flag → `400
INVALID_PARAM`.

**Rationale**: Boolean flags over a fixed-shape allow-set are trivially validated at the
boundary (constitution V) and let an admin reach any "≥1 需重做" image in ≤ 3 interactions
(SC-003) and identify all not-fully-covered images with 100% precision/recall (SC-001).

---

## D8 — Enum values are read, not owned; CSV emits zh-TW labels verbatim (FR-019)

**Decision**: The judgement/warning/problem enums are **owned by 003** (review domain). 004
reads them and renders the **zh-TW labels** verbatim per FR-019:

- 整體判定: 通過 / 需小修 / 需重做
- 適應症判定: 合理 / 有疑慮
- 需要添加的警語: 注意跌倒 / 需有專人幫助指導 / 骨鬆注意 / 心肺功能不全者注意 / 其它
- 問題類型: 部位／主題錯誤 / 動作示範錯誤 / 文字說明錯誤 / 次數／時間不合理 / 缺安全提醒 / 有錯字

Dashboard JSON DTOs may key distribution counts by a stable code (`PASS`/`MINOR`/`REDO`) for
the SPA, but the user-visible labels and **every CSV enum cell** use the zh-TW strings above.
004 never redefines these option sets — if 003's enum changes, the change flows from spec-first
(constitution I/VIII) and 004 inherits it.

**Rationale**: Constitution VIII requires列舉值逐字一致 with the review form; sourcing them from
003 (not a private copy) prevents drift (FR-019).

---

## D9 — Empty / not-ready states return 200 with zeros, never an error (FR-021, SC-010)

**Decision**: With no reviewers, no submitted reviews, or catalog not yet ingested, every
endpoint returns `200` with a well-formed empty projection (zero counts, empty arrays,
`percent: 0`) and `meta.total: 0`; the export returns a valid CSV with **only the header row**
and the BOM. No endpoint throws on emptiness.

**Rationale**: FR-021 + SC-010 require graceful empty states at a 0% error rate; returning a
typed empty projection keeps the frontend code path uniform and avoids special-casing.

---

# Amendment 2026-08-27 — 參考照片的管理端呈現（FR-025..FR-037）

Decisions D10–D14 extend D1–D9. 004 remains **read-only and write-free** (D1's premise is
unchanged): it still owns no table, no enum and no migration — the photo tables belong to
003.

## D10 — 照片只透過「已提交」的審查進入管理端，草稿一律不可見

**Decision**: Every admin-side photo path — the work table, the per-image count column, the
bundle download and the CSV — joins through `Review` filtered to `已提交`. A photo attached
to a draft is invisible to the admin in **all four** places (FR-028).

**Rationale**: FR-007 already excludes drafts from every statistic and from the export, and
D2's active-basis work made "one basis everywhere" the governing habit. Photos introduce a
**side door**: a reviewer can upload a photo before ever submitting, so a naive
`ReviewPhoto`-first query would surface draft material and quietly break the invariant that
the dashboard only ever reports submitted work. Filtering at the join — rather than in each
caller — makes the exclusion structural.

**Alternatives considered**: showing draft photos as "pending" (contradicts FR-007 and would
make the count column disagree with every other number on the page); filtering per caller
(four places to forget it).

## D11 — 詳情頁改為「原圖 + 逐分格分組」的修圖工作台

**Decision**: The existing per-image drill-down (D6's disagreement view) is restructured into
a work table: the blueprint image on one side; on the other, four groups (圖1..圖4), each
listing every submitting reviewer's judgement, problem annotations and that reviewer's photos
for that panel (FR-026). Group headers carry「幾位標了問題」and the panel's photo count
(FR-027); panels where every submitting reviewer signed off 無問題 collapse to a single line.

**Rationale**: The admin's actual task is not "read opinions" but "decide how to fix this
image", and that decision is made panel by panel. D6 established that disagreement is
surfaced rather than mediated; grouping by panel keeps that property while putting the
evidence (text + photo) next to the thing it describes. Collapsing all-clear panels is what
keeps a full pass over every image tractable.

**Alternatives considered**: keeping the flat per-reviewer list and appending photos (the
reader has to re-group mentally, four times per image); a photo-only gallery (severs each
photo from the note explaining it).

## D12 — 打包下載：單圖一包，GET，串流產生，內含原檔與標註版

**Decision**: `GET /api/admin/dashboard/images/:blueprintId/photos.zip`, streamed rather
than assembled on disk, containing each submitted photo's **original** and **annotated**
version (when present), named so that 圖 × 分格 × 審查者 × 版本別 is readable from the
filename alone (FR-029/FR-030). The global "all images at once" bundle is **not built**
this round (FR-033).

**Rationale**: Keeping it a `GET` preserves 004's defining property — every route is
read-only and CSRF-free (D1, FR-012/SC-007) — and streaming avoids a temp-file lifecycle in
a feature that otherwise touches no filesystem. Originals are what the repair work needs;
the display derivative is a web-viewing artifact and is deliberately excluded. The
`originalAsJpeg` column 003 populates for HEIC-without-annotation photos is included in its
place so a bundle always contains an openable file without paying ~3 MB per photo.

**Alternatives considered**: bundling display versions too (three near-duplicate files per
photo, and the useful one is ambiguous); a `POST` job + polling (needs state and CSRF for a
read); the global bundle (deferred by decision, FR-033).

## D13 — 匯出加欄，不改既有欄位；影像不入 CSV

**Decision**: Each export row gains a photo count and the corresponding filenames, appended
**after** the existing columns; no existing column is renamed, reordered or retyped
(FR-032/FR-035). Image bytes never enter the CSV.

**Rationale**: D3/D4 fixed a column contract that downstream consumers已經 rely on, and
D5's escaping rules apply unchanged to the new filename column. Appending is the only shape
that satisfies SC-014 ("existing export structure and content identical"). Filenames rather
than bytes keep the CSV a table and make it the index into the bundle from D12 — the two
artifacts are designed to be read together.

**Alternatives considered**: base64 in a cell (destroys the CSV as a spreadsheet and
multiplies size); a separate manifest file (a third artifact to keep in sync).

## D14 — 容量以「已用／上限」呈現，門檻 80%，達上限只擋照片上傳

**Decision**: The dashboard shows used bytes, the configured ceiling (default 10 GB) and a
percentage, warning at 80 % (FR-034). At the ceiling the system rejects **new photo
uploads only** (FR-037); every other operation — review submission included — continues
(003 FR-061).

**Rationale**: The ceiling is close enough to plausible usage (several photos per
reviewer × image unit) that silent exhaustion is a real risk, and the
failure it would otherwise produce is a raw Postgres write error surfaced to a clinician
mid-review. Usage is one `SUM` over the photo metadata table — the byte columns are
denormalized onto `ReviewPhoto` precisely so this aggregate never touches `ReviewPhotoBlob`
(003 research D11). Scoping the block to the upload path is the load-bearing part of this
decision: a quota that halts the review task converts a capacity problem into an outage.

**Alternatives considered**: no ceiling (discovered as a disk-full incident); blocking all
writes at the ceiling (rejected, above); auto-pruning old photos (destroys the material this
feature exists to preserve).
