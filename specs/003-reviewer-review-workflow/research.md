# Research: Reviewer Review Workflow — Key Technical Decisions

All decisions inherit the LOCKED stack (TypeScript / Express / Prisma / PostgreSQL ;
React + Vite + TanStack Query + Tailwind) and the constitution. They reuse 001's
session/role/CSRF middleware + envelope and 002's catalog read API + `HIGH_RISK_BLUEPRINT_IDS`.
Each entry: **Decision / Rationale / Alternatives considered**.

---

## D1. Multi-select set storage — native Postgres enum array columns, not join tables

**Decision**: Store `PanelReview.requiredWarnings` and `PanelReview.problemTypes` as
**native PostgreSQL enum array columns** (`WarningType[]`, `ProblemType[]`) directly on the
`PanelReview` row, with a default of empty array. Prisma models them as scalar enum lists
(`requiredWarnings WarningType[]`). zod dedupes and validates each member against the enum at
the boundary; order is not significant (set semantics).

**Rationale**: Both sets are **small and bounded** (≤ 5 warnings, ≤ 6 problem types per
panel) and are **always read and written together with their parent `PanelReview` row** —
there is no query in 003 that filters reviews by an individual warning/problem in isolation.
An enum array gives DB-level type safety (illegal members rejected by Postgres), one-row
reads (no join, no N+1) that exactly fit the autosave "save/restore the whole draft" pattern
(FR-022/FR-023), and atomic replace on every autosave. Aggregation for the admin dashboard
is feature 004's concern and remains expressible over enum arrays (`= ANY`, `@>`) without
003 owning extra tables.

**Alternatives considered**: (a) **Join tables** (`PanelReviewWarning`, `PanelReviewProblem`)
— fully normalized but heavyweight for a fixed tiny set: 2 extra tables, delete-then-insert
churn on every debounced autosave, and join reads on every restore, with no query benefit in
003; rejected. (b) **JSON/`text[]` of raw strings** — loses enum integrity at the DB layer
and pushes validation entirely to the app; rejected. (c) **Comma-joined string** — no
integrity, fragile parsing; rejected.

---

## D2. Enum representation — Postgres native enums labelled in zh-TW, mapped in Prisma, zh-TW on the wire

**Decision**: All five review enums are **native Postgres enums whose labels are the
zh-TW values verbatim** (e.g. label `通過`). In `schema.prisma` each enum member uses an
ASCII identifier with `@map` to the zh-TW label, e.g.

```prisma
enum OverallJudgement { PASS @map("通過")  MINOR_FIX @map("需小修")  REDO @map("需重做") }
```

The service/DTO layer translates Prisma enum ↔ zh-TW so that **every API request and
response carries the zh-TW value verbatim** (`"overallJudgement": "通過"`,
`"requiredWarnings": ["注意跌倒","骨鬆注意"]`). A single `enum-maps.ts` holds the
bidirectional maps; zod validates incoming zh-TW values against the exact allowed set.

**Rationale**: Constitution VIII requires enum values shown to users to be the spec's zh-TW
strings, verbatim. Postgres enum labels may be Chinese, giving DB-level integrity; Prisma
identifiers may not be Chinese, so `@map` bridges them. Emitting zh-TW on the wire keeps the
frontend free of a translation table and makes the contract self-describing.

**Alternatives considered**: (a) ASCII enum on the wire + frontend translation map —
duplicates the label set in two places, drift risk, violates "values per spec verbatim";
rejected. (b) Free `text` columns with app-side validation — loses DB integrity; rejected.

---

## D3. Autosave model — debounced full-document `PATCH`, status-preserving upsert, never submit

**Decision**: The frontend autosaves via a **debounced** `PATCH /api/reviews/:blueprintId`
(≈ 800 ms after the last keystroke; fired immediately on discrete control changes like a
radio/checkbox). The body is the **whole editable document** (overall fields + all four
panels). The backend performs one transaction: **upsert** the `Review` keyed by
`UNIQUE(reviewerId, blueprintId)` and **snapshot-replace** its 4 `PanelReview` rows, then set
`lastSavedAt` and `lastUpdatedAt`. The handler is **status-preserving**:

- no row yet → create `Review(status = 草稿)` + 4 panels;
- `status = 草稿` → keep 草稿;
- `status = 已提交` → keep 已提交 (in-place overwrite for edit-after-submit, D5).

`PATCH` **can never set `status = 已提交`** (only the submit route does) and **can never set a
`已提交` row back to `草稿`** (FR-025/FR-026). It never writes `submittedAt`.

**Rationale**: Full-document replace makes autosave idempotent and makes 100% restore
(FR-023/SC-002) structural rather than dependent on field-level merge logic — the persisted
draft is exactly what the client last sent. Debounce keeps write volume low (one small
review per save). Encoding the status rule in the single writer guarantees the
no-elevate / no-regress invariants regardless of client behaviour or autosave/submit races
(FR-026 edge case).

**Alternatives considered**: (a) Field-level partial PATCH + server merge — smaller payloads
but merge bugs threaten restore fidelity and orphan-text preservation; rejected for a
single small document. (b) Per-keystroke save (no debounce) — needless write amplification;
rejected. (c) Letting the client send `status` — would let a draft self-elevate or a
submitted row regress; the server **ignores any client status** entirely; rejected.

---

## D4. Status machine — 未開始 (no row) → 草稿 → 已提交; 已提交 is terminal w.r.t. regression

**Decision**: `ReviewStatus` has exactly two stored values: `草稿`, `已提交`. **未開始 is
not stored** — it is the *absence* of a `Review` row for that (reviewer × blueprint), derived
when computing progress. Transitions:

| From | Event | To | Timestamps |
|------|-------|----|-----------|
| 未開始 (no row) | first autosave `PATCH` | 草稿 | `createdAt`, `lastSavedAt`, `lastUpdatedAt` = now |
| 草稿 | autosave `PATCH` | 草稿 | `lastSavedAt`, `lastUpdatedAt` = now |
| 草稿 | submit (overall set) | 已提交 | `submittedAt`, `lastUpdatedAt` = now |
| 已提交 | autosave `PATCH` (edit) | 已提交 | `lastSavedAt`, `lastUpdatedAt` = now; `submittedAt` unchanged |
| 已提交 | re-submit | 已提交 | `lastUpdatedAt` = now; `submittedAt` unchanged |
| 已提交 | any event | **never → 草稿** | — (FR-026 hard invariant) |

`已提交 x/N` counts rows with `status = 已提交` for the session reviewer; `草稿` rows are not
counted (FR-024, US3-AS5). `createdAt` is immutable; `lastUpdatedAt` is bumped by **every**
mutation and is the "最近更新時間 / last-updated" of FR-032; `submittedAt` records the original
submission and is **not** rewritten on re-submit; `lastSavedAt` marks the last autosave.

**Rationale**: A two-value stored status plus a derived 未開始 keeps the model minimal and
makes "draft not counted" a pure `WHERE status = 已提交`. Separating `submittedAt`
(first/canonical submission) from `lastUpdatedAt` (freshest mutation) satisfies FR-032's
"refresh last-updated on re-submit" without a version row.

**Alternatives considered**: Persisting a 未開始 row at open time — pollutes the table with
empty rows and complicates counts/cleanup; rejected (rows are created lazily on first
autosave). A third 已修訂 status — explicitly forbidden by the spec; rejected.

---

## D5. Edit-after-submit — in-place overwrite, no version history, no 已修訂 state

**Decision**: "重開" a submitted review is **pure client navigation** to
`/review/:blueprintId`; `GET /api/reviews/:blueprintId` returns the existing `已提交` review
fully populated and editable. Edits autosave **in place** (D3: status stays `已提交`,
`lastUpdatedAt` bumped) and "再次提交" re-runs submit validation and bumps `lastUpdatedAt`.
There is **no** `ReviewVersion` table, **no** snapshot/audit of prior values, and **no**
separate 已修訂 status (FR-032). The (reviewer × blueprint) row count stays exactly one
(SC, US5-AS2).

**Rationale**: The spec mandates in-place overwrite + refreshed last-updated with no history.
Modelling reopen as navigation (not a status change) avoids a transient state that could
violate the no-regress invariant, and keeps the data shape identical whether a blueprint is
first-time or being revised.

**Alternatives considered**: A dedicated `POST /reopen` that flips status — would create a
non-草稿 / non-已提交 intermediate or risk a 已提交→草稿 regression; rejected. Append-only
version history — explicitly out of scope; rejected.

---

## D6. Submit semantics — server hard-requires overallJudgement; empty panels are valid; soft prompt is client-only

**Decision**: `POST /api/reviews/:blueprintId/submit` carries the full editable document,
persists it atomically, validates `overallJudgement !== null`, and only then sets
`status = 已提交`. If `overallJudgement` is null the server returns
`400 OVERALL_JUDGEMENT_REQUIRED` with zh-TW message **請先選擇整體判定** and does **not**
submit (the frontend also shows this inline before calling — FR-011/SC-003). **All four
panels empty is a fully valid submission** for a 通過 (FR-018/SC-004) — the server emits no
warning. The "需小修／需重做 with four empty panels" reminder is a **client-side, non-blocking
soft prompt** (FR-030): the server never blocks on it. The high-risk caution is likewise
informational and never gates submit (FR-035).

**Rationale**: `overallJudgement` is the one minimum-bar datum every counted review must have
(FR-011); enforcing it server-side (not only in the UI) makes SC-003 exception-free.
Keeping the "empty panels" reminder purely client-side honours "soft prompt but allowed"
without inventing a server warning channel that could be mistaken for a block.

**Alternatives considered**: Server-side warning payload for empty-panel submits — risks UIs
treating it as an error and contradicts "不硬擋"; rejected (client renders the reminder).
Requiring `indicationNote` when `有疑慮` — explicitly **not** required (FR-012); rejected.

---

## D7. Auto-advance & "繼續審查" — deterministic next-unreviewed, skip 已提交, N/N non-dead-end

**Decision**: "Next unreviewed" = the first blueprint, in the deterministic order
**Region `displayOrder` ascending, then the numeric suffix of `blueprintId` ascending**
(`S1 < S2 < … < S10`, regions `S→H→E→T→P→K→L→Y`), whose review for the session reviewer is
**not** `已提交` (i.e. 未開始 or 草稿). 已提交 blueprints are skipped (FR-029). The numeric
suffix is parsed from `blueprintId` so `S10` sorts after `S2` — matching the locked catalog
ordering (Region `displayOrder` → numeric id). This is computed by `review-ordering.ts` from
the catalog blueprint list joined with the reviewer's review statuses. It is returned by both:

- the **submit** response (`data.next` = next blueprintId, or `null` + `completed: true` when
  all catalog blueprints are 已提交) — drives auto-advance (FR-027);
- `GET /api/reviews/next` — drives the "繼續審查" entry point (FR-031).

When `next` is `null`, the client shows the **N/N completion** state with review/revise
entry points, never a dead end (FR-029/SC-008).

**Rationale**: A single ordering function shared by submit and "繼續審查" guarantees both land
on the identical next blueprint (SC-005), and reusing the catalog's canonical
`displayOrder → numeric id` order keeps 003 consistent with 002/the locked foundation.

**Alternatives considered**: Lexicographic id sort — would order `S10 < S2`; rejected (must
be numeric). Advancing to the next *sequential* blueprint regardless of status — would land
on already-submitted images; rejected (must skip 已提交).

---

## D8. Per-reviewer isolation — reviewerId from session only; reviewer-role gate

**Decision**: All `/api/reviews/*` routes require `require-auth` + `require-role('REVIEWER')`
(001 middleware). The `reviewerId` used in every query and write is **always**
`session.account.id` — it is **never** read from the path, query, or body. Therefore
`SELECT … WHERE reviewerId = <session> AND blueprintId = …` can only ever resolve the
caller's own (reviewer × blueprint) row, and opening a blueprint with no row yields an empty
template — there is **no code path** that returns another reviewer's review (FR-003/SC-010).
系統管理員 (who do not review — constitution IV) hitting these routes get `403 FORBIDDEN_ROLE`.

**Rationale**: Deriving the owner from the authenticated session (never the request) makes
cross-reviewer leakage impossible by construction, not by filter discipline; this is the
strongest form of SC-010.

**Alternatives considered**: Accepting a `reviewerId` param guarded by a check — an extra
attack surface and an easy place to forget a filter; rejected. Letting admins read reviews
here — admins use 004's dashboard; mixing it in would blur the role boundary; rejected.

---

## D9. Reviewer-facing blueprint composition — reuse 002's public projection; aiPrompt structurally absent

**Decision**: `GET /api/reviews/:blueprintId` composes its `blueprint` payload from **002's
catalog read service via the existing `blueprint-public` projection**, which already includes
metadata + the 4 panels with `畫面視覺描述` and `isHighRisk`, and **excludes `aiPrompt`**
(002 D7). 003 adds **no** new path that selects `aiPrompt`; the reviewer DTO is an allow-list
that has no `aiPrompt` field. `isHighRisk` and the badge come from the shared
`HIGH_RISK_BLUEPRINT_IDS` constant (002), never redefined (FR-036).

**Rationale**: Reusing the already-safe projection means the "畫面視覺描述 shown, aiPrompt
hidden" rule (FR-009) is enforced once, in 002, and cannot regress in 003. Sharing the
high-risk constant satisfies "single named constant" (FR-036).

**Alternatives considered**: 003 querying the `Blueprint` table directly — would risk
selecting `aiPrompt` and duplicate catalog read logic; rejected in favour of calling 002's
service/DTO.

---

## D10. Image interaction & free-text handling — inline zoom/pan (no lightbox); orphan text preserved, sanitized on output

**Decision**: The left column renders the PNG from 002's read-only image route inside a
**sticky** container with **inline zoom/pan** (CSS `transform: scale()/translate()`), default
**fit-whole-image**, and keyboard controls (`+`/`-` zoom, arrows pan, `0` reset). **No
lightbox/modal** (FR-006). Free-text fields `indicationNote`, `warningOther`, `problemNote`
are stored **verbatim regardless of checkbox state** — the server never clears them when the
related set is empty (orphan-text preservation, FR-019) — and are **sanitized on output**
(HTML-escaped) to neutralise XSS (constitution V) while preserving the typed content.

**Rationale**: Inline zoom keeps the reviewer in one screen with the form (低認知負荷, US1)
and is fully keyboard-operable (FR-037/FR-038); a lightbox was explicitly rejected in
clarification. Preserving orphan text but escaping it on render satisfies both FR-019 and the
security baseline without mutating user input.

**Alternatives considered**: Lightbox/modal zoom — rejected by clarification (breaks
图文并陈). Stripping orphan free-text when its checkbox is unchecked — destroys reviewer input
(FR-019 violation); rejected. Sanitizing on input (mutating stored text) — would corrupt the
reviewer's literal words; we sanitize on output only; rejected.

---

# Amendment 2026-08-27 — 參考照片與標註（FR-045..FR-061）

Decisions D11–D19 extend the original D1–D10. Nothing above is retracted; where a decision
narrows an earlier one it says so explicitly.

## D11. 照片位元組儲存 — Postgres `bytea`，且 metadata 與 bytes 分成兩張表

**Decision**: Photo bytes live in PostgreSQL as `bytea`, in a table (`ReviewPhotoBlob`)
that is **separate** from the metadata table (`ReviewPhoto`). No writable filesystem
volume is introduced; `docker-compose.yml` is unchanged.

**Rationale**: At the target scale (10 GB ceiling — see D18) `bytea` removes more moving
parts than it adds: no new volume, no `UPLOAD_DIR` env or path validation, **no path
traversal surface at all**, deletion is handled by the existing FK cascade, and `pg_dump`
alone is a complete backup — eliminating the "database and files must be restored together
or records silently point at missing bytes" failure mode. Splitting bytes into their own
table neutralizes the one real footgun: Prisma's `findMany` selects every scalar column by
default, so a metadata list query on a single-table design would pull every photo's bytes
into process memory. With the split that mistake is structurally impossible.

**Alternatives considered**:
- *Writable Docker volume + filesystem*: the conventional answer, and the right one at a
  larger scale — but it reintroduces volume/env/path-guard/orphan-sweep machinery and the
  split-restore failure mode, for an internal tool maintained by one person.
- *Object storage (S3/MinIO/R2)*: an external service plus credentials for a corpus that
  fits on one disk.
- *Single table holding bytes alongside metadata*: rejected for the Prisma default-select
  footgun above.

**Revisit trigger** (supersedes an earlier draft that used a size number): not a byte
count, but the point at which **backup duration or backup storage cost starts to hurt
operations**, or a change in order of magnitude (e.g. video). Because of the table split,
migrating then moves `ReviewPhotoBlob` only — metadata, foreign keys and cascade behaviour
are untouched.

## D12. 照片歸屬 — 掛在 `Review`，以可為空的 `panelIndex` 表示分格

**Decision**: `ReviewPhoto.reviewId` → `Review` (cascade delete). `panelIndex Int?` where
`1..4` binds the photo to that panel and `NULL` means the image-level 整體參考照片
(FR-045/FR-046).

**Rationale**: Photos **cannot** be children of `PanelReview`. The existing autosave writer
(`reviewRepository.upsertReviewWithPanels`) snapshot-replaces all four `PanelReview` rows
inside its transaction — `deleteMany` followed by `createMany` — on **every** debounced
draft save (D3). Any row hanging off `PanelReview` would be destroyed the first time the
reviewer typed anything. Hanging photos off `Review` also gives the image-level slot a
natural representation instead of a fifth pseudo-panel.

**Alternatives considered**: child of `PanelReview` (fatal, above); a separate
image-level table (duplicates the same shape twice); `panelIndex 0` as a sentinel for
image-level (loses the ability to constrain `1..4`).

## D13. 每張照片保存四個成品

**Decision**: per photo — **原檔** (the uploaded bytes, never re-encoded), **顯示版**
(~1600 px JPEG produced client-side, used by thumbnails/lightbox/admin lists), **標註版**
(full-resolution, only when annotated), and **標註狀態** (a serializable design state,
only when annotated). No separate thumbnail size is generated.

**Rationale**: FR-052 makes the original mandatory — the original is the material the
downstream image repair works from, so it must not be replaced by a shrunken copy. The
display derivative exists because a 12 MP original per grid cell would make the admin work
table unusable. The annotation is stored **both** as a flattened full-resolution raster and
as re-editable state so that "how was this annotated" survives as data, not only as pixels
(FR-056). A third thumbnail size was dropped: the display version is already ~350 KB and a
104 px grid cell can simply scale it.

**Alternatives considered**: original only (admin work table pulls megabytes per cell);
display version only (violates FR-052); server-generated thumbnails (would require an
image library on the server — see D16, which is what makes that expensive).

## D14. 照片走獨立端點；上傳可建立草稿，但永不使已提交回退

**Decision**: Photo create/delete/caption/annotation are their own routes, written
immediately — they are **not** folded into the debounced document `PATCH` (D3). When no
`Review` row exists for (reviewer × blueprint), a photo upload creates one in `草稿`
(FR-050). When the review is already `已提交`, a photo operation keeps `已提交`, refreshes
`lastUpdatedAt`, and leaves `submittedAt` untouched (FR-051).

**Rationale**: Folding binary uploads into the debounced whole-document autosave would
couple a 4 MB transfer to an 800 ms keystroke debounce and put photo loss behind the same
retry path as text. Keeping them separate also means D3/D4's status machine is unchanged —
the only new rule is the one above. FR-050 narrows D4: 未開始 is still "no row", but a
photo upload is now a second way (besides typing) for a row to come into existence.

**Alternatives considered**: photos inside the document `PATCH` (couples binary transfer to
text debounce, and a failed upload would fail the text save); requiring an explicit
re-submit after adding a photo to a submitted review (defeats the "attach material to past
reviews" purpose).

## D15. 分格提交關卡納入照片數，於同一交易內判定

**Decision**: `allPanelsAddressed` moves from a pure document check to
**document-plus-photo-count**, evaluated inside the submit transaction (FR-049).

**Rationale**: There is a real race. The reviewer uploads a photo to 圖2, ticks nothing,
and submits before the debounce fires; the submitted document says 圖2 is unaddressed while
a photo for it is already persisted. Reading photo counts in the same transaction is the
only place the two facts are consistent. The client mirrors the rule from the photo list it
already holds, so the UI never shows a block the server would not raise.

**Alternatives considered**: flushing the autosave before submit (narrows the window, does
not close it, and adds latency to the fast path); a client-only rule (server would reject a
legitimate submit).

## D16. HEIC 於瀏覽器轉換 — 伺服器零影像處理相依

**Decision**: HEIC decoding and all downscaling happen **client-side**. Safari 17.6+ decodes
HEIC natively (`createImageBitmap`), which is roughly 17–39× faster than a JS/WASM path; on
browsers that cannot decode it (notably desktop Chrome) a WASM decoder is lazy-loaded only
when such a file is picked. The server installs **no** image library and validates uploads
by magic bytes.

**Rationale**: `sharp`'s prebuilt binaries deliberately exclude HEIC — the Nokia HEIF patent
licence means HEIC support requires a self-compiled libvips with libheif/libde265/x265.
That is a heavy Dockerfile change (build time, image size, licence surface) and directly
contradicts the "minimum infrastructure change" constraint that also drove D11. Doing the
work in the browser also gets the downscale for free in the same canvas pass.

**Alternatives considered**: custom libvips build (rejected, above); server-side pure-JS
decode (`heic-convert`/`libheif-js` — no native build, but the server would then also need
a resizer, reintroducing an image dependency); rejecting HEIC outright (the user expects
HEIC uploads to be common).

**Accepted cost**: WASM decoding of a 12 MP HEIC on desktop takes ~1–3 s; the upload
「準備中」 state covers it.

## D17. Filerobot Image Editor 接入

**Decision**: `react-filerobot-image-editor`, loaded by dynamic import so it is absent from
the main bundle for reviewers who never annotate. `useBackendTranslations: false` with a
project-supplied zh-TW `translations` map. The **original** is loaded into the editor;
`previewPixelRatio` is lowered for interaction while `savingPixelRatio` produces the
full-resolution output. `onSave(image, designState)` persists both; `loadableDesignState`
restores it for re-editing. Mobile uses the library's native layout.

**Rationale**: The library separates preview resolution from save resolution, so the
earlier assumption that full-resolution annotation had to be traded against mobile memory
is false. `useBackendTranslations` defaults to `true`, which would fetch translation
strings from the vendor's servers at runtime — unacceptable outbound traffic for an
internal clinical tool, and a runtime dependency on a third party (constitution VIII also
requires the copy to be ours).

**Risks accepted**: the design-state export/load feature is labelled *Experimental*
upstream, and issue #259 records dpi/window-size scaling inaccuracies — therefore the
full-resolution raster saved at annotation time remains the authoritative artifact and the
design state is an aid for re-editing, not the sole record. A high `savingPixelRatio` can
fail on constrained devices; on failure the output degrades to a lower ratio **while the
design state is still saved**, so nothing is lost and a desktop session can re-render.

**Alternatives considered**: a hand-rolled canvas annotator (a real maintenance burden for
arrow/ellipse/text/undo); a custom mobile toolbar over Filerobot (rejected by the user in
favour of the native layout).

## D18. 容量上限 10 GB — 可設定，且只擋照片上傳

**Decision**: A configurable total-photo-storage ceiling, default **10 GB**. The admin
dashboard shows used/ceiling and a percentage, warns at 80 %, and at 100 % the system
**blocks new photo uploads only** (FR-061; ceiling display/enforcement surface is 004
FR-034/FR-037).

**Rationale**: 10 GB is real headroom — ~1,450 annotated or ~2,560 unannotated photos,
i.e. several per (reviewer × blueprint) unit for a handful of reviewers, where in practice only panels
with problems get photographed. The scoping rule matters more than the number: a quota that
blocks the whole write path would turn a storage-capacity issue into a stopped review task.
Judgement, warnings, problem notes, draft saves, submit and auto-advance must all continue,
and existing photos must remain viewable, annotatable and deletable.

**Alternatives considered**: no ceiling (silent disk exhaustion, discovered as a Postgres
write failure); blocking all writes at the ceiling (rejected, above).

## D19. 純新增遷移，並以回歸測試證明既有資料不受影響

**Decision**: The migration is **additive only** — two `CREATE TABLE` statements plus
indexes and foreign keys. Zero `ALTER` on the nine existing tables. The Prisma
`Review.photos` relation field is virtual and emits no SQL column. Alongside per-component
tests, a regression suite asserts that existing review records are byte-identical in
content and state before/after (SC-017) and that the photo-free review flow behaves exactly
as it does today (SC-018).

**Rationale**: The system already holds real review data from working clinicians; this
change exists to let them **attach** material to past reviews, so any migration that
rewrites existing rows would defeat its own purpose. Making the no-impact claim testable
rather than asserted is the whole point of SC-017/SC-018.

**Verification approach**: snapshot the existing review corpus (all scalar fields of
`Review` and `PanelReview` per (reviewer × blueprint)) before migrating, re-read after, and
assert zero differing rows; separately re-run the pre-existing 003 integration and E2E
suites unchanged and require them to pass without modification.
