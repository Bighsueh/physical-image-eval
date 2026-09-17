# Research: Blueprint Catalog Ingestion — Key Technical Decisions

All decisions inherit the LOCKED stack (TypeScript / Express / Prisma / PostgreSQL) and the constitution. Each entry: **Decision / Rationale / Alternatives considered**.

---

## D1. Markdown parsing strategy — AST traversal, not regex

**Decision**: Parse each blueprint `.md` with `unified` + `remark-parse` into an mdast tree, then extract fields by walking the documented section structure rather than by line regex. The source schema (from `00_藍圖總索引與設計規範.md` §一 and confirmed across files) is stable:

- `#` heading → title; the leading blockquote carries `藍圖 ID`, `解剖區域`, `涵蓋診斷`, `版本`.
- `## 一、整體資訊` → bullet list whose **bold-prefixed** items are `運動名稱` / `適應症` / `練習次數` / `溫馨小叮嚀`.
- `## 二、4 宮格分鏡圖解` → exactly four `### N. <步驟名>` subsections, each a bullet list with bold-prefixed `動作說明` / `時間提示` / `畫面視覺描述`.
- `## 三、AI 產圖 Prompt` → fenced code block → `aiPrompt` (internal-only).

Fields are located by matching the bold label text inside list items under the correct heading, so reordering or extra whitespace does not break extraction. The output of the parser is a validated `ParsedBlueprint` value object (zod-checked shape) — no DB contact.

**Rationale**: The corpus is small and authored by humans; an AST gives robustness to incidental whitespace/emoji (e.g. the `💡` prefix on 小叮嚀) and lets us assert structural invariants (exactly four `###` panels) directly on the tree, which is precisely what FR-004 needs. Keeping the parser DB-free makes every invariant unit-testable.

**Alternatives considered**: (a) Line-by-line regex — brittle against emoji/whitespace/heading variants, rejected. (b) Convert markdown→HTML→DOM query — heavier dependency, no benefit over mdast. (c) YAML front-matter convention — source has none and is read-only, so we cannot impose it.

---

## D2. Diagnosis source of truth — the `00` index is authoritative; per-blueprint line is corroborating

**Decision**: The diagnosis reconciliation and the `mappingKind` of each diagnosis are derived **only** from the mapping tables in `00_藍圖總索引與設計規範.md`:

- Each region table row `| <blueprintId> | <name> | <name(matrixNo), …> |` yields one or more `Diagnosis` rows. `matrixNo` is the integer in parentheses (the business key), `nameZh` is the diagnosis name, `mappedBlueprint` is the row's blueprint ID.
- The `不產藍圖：轉介類` table yields the `REFERRAL` diagnoses, `mappedBlueprint = null`.
- The region tables also define the authoritative **blueprint ID set** and each blueprint's region: the source blueprint files must equal that set exactly (FR-002: `FR-002:missing-blueprint` / `FR-002:unlisted-blueprint`), and every region must list at least one blueprint (FR-003: `FR-003:empty-region`).
- Matrix numbers across all tables must be unique (`FR-008:dup-matrixNo`) and contiguous from 1 to the number of diagnoses listed (`FR-008:gap`).
- `mappingKind` derivation rule: mapped to a **Y-series** blueprint ⇒ `TEMPLATE`（通用處方模板）; mapped to a **non-Y** blueprint ⇒ `MAPPED`（已對應）; in the referral table ⇒ `REFERRAL`（轉介）.

The per-blueprint `> 涵蓋診斷：…` line is parsed too but used only as a **cross-check** (its named diagnoses must be a subset of those the index maps to that blueprint); it is not the counting authority.

**Rationale**: FR-008 explicitly names the index as the authority for the diagnosis list (mapped + referral, counts computed from the source and reported, never compared to fixed constants); the per-blueprint line lacks matrix numbers, so it cannot drive reconciliation. The Y-series derivation cleanly separates 已對應 from 通用處方模板 without a second list to keep in sync.

**Alternatives considered**: Trust the per-blueprint 涵蓋診斷 lines as primary — rejected (no matrix numbers, no referral entries, risks double counting synonyms). A hand-maintained mapping constant in code — rejected (duplicates the source, drifts, violates "忠實對帳, 不重新定義").

---

## D3. Fail-fast boundary — parse-and-validate fully in memory, then one transaction

**Decision**: Ingestion runs in two strict phases. **Phase A (pure, no DB writes)**: read source read-only → parse all blueprints + index → run every invariant → build the report. If any invariant fails, the command stops here, prints the failure report, exits non-zero, and **touches no catalog table**. **Phase B (only if Phase A is fully clean)**: open a single `prisma.$transaction([...])` that clears the existing catalog and inserts the freshly parsed `Region`/`Blueprint`/`Panel`/`Diagnosis` set; commit is the only point catalog data changes.

**Rationale**: This is the literal shape FR-011/FR-017 demand (0 rows persisted on any failure; all-or-nothing batch). Separating validation from persistence means SC-002 ("exactly 0 rows persisted on failure") is guaranteed structurally, not by careful rollback handling. The transaction gives atomicity for Phase B; a failure mid-write rolls back to the prior good catalog (FR-015).

**Alternatives considered**: (a) Stream-insert while validating, rolling back on error — correct but couples validation to DB and makes the "never wrote" guarantee depend on rollback timing; rejected. (b) Per-row upsert without a transaction — cannot guarantee all-or-nothing or no-drift; rejected.

---

## D4. Idempotent re-run & diff — deterministic snapshot-replace plus a computed diff for the report

**Decision**: Phase B always performs a **full deterministic snapshot replace** (delete all catalog rows, insert the canonical parsed set in a fixed order) inside the transaction. Because the parsed set is a pure function of source content, re-running on unchanged source yields an byte-for-byte equivalent catalog with no duplicates — idempotency by construction (FR-013, SC-003). For the change summary (FR-014, SC-007), before replacing, the command reads the existing catalog snapshot and computes an added/modified/removed diff against the new parsed set, keyed by `blueprintId` (and per-blueprint by a `contentHash` of normalized fields) and by diagnosis `matrixNo`; the diff is reported but does not change the replace behavior.

**Rationale**: Snapshot-replace is the simplest construction that provably satisfies "two runs are 100% equivalent, no duplicates/drift." A `contentHash` per blueprint makes "modified" detection cheap and exact without field-by-field comparison in the report layer.

**Alternatives considered**: Incremental per-entity upsert/delta application (compute diff, then apply only changes) — more code, and any bug leaves the catalog in a drifted state that re-run would not self-heal; rejected in favor of replace-with-reported-diff.

---

## D5. Image serving — read-only, blueprint-keyed, bytes never in DB

**Decision**: PNGs are served by `GET /api/blueprints/:blueprintId/image`. The route looks up the blueprint's stored relative `imagePath`, resolves it against the configured `IMAGE_SOURCE_DIR` (the read-only mount), verifies the resolved path stays inside that root, opens the file read-only, and streams it with `Content-Type: image/png`. Catalog rows store only the relative path; **no image bytes are stored in Postgres**. During ingestion, each blueprint must resolve to exactly one PNG and there must be no orphan PNG (FR-005); both directions are validated in Phase A.

**Rationale**: Honors constitution II (read-only external assets, no copy into repo) and the locked decision "PNGs served read-only from the mounted source dir." Keying by `blueprintId` (not a client path) removes path-traversal risk entirely.

**Alternatives considered**: (a) Store bytes in DB / object store — violates the read-only-from-source decision, bloats DB; rejected. (b) Static-file middleware over the whole mount with client-supplied filenames — opens traversal surface and leaks non-catalog files; rejected in favor of an explicit blueprint-keyed handler.

---

## D6. ID / region parsing & high-risk derivation — single named constant, cross-checked

**Decision**: Blueprint IDs are validated against `^([SHETPKLY])([1-9][0-9]?)$`; the leading letter must equal the region implied by the containing folder (folder→letter map: `01_肩部→S`, `02_頭頸部→H`, `03_肘腕手→E`, `04_脊椎軀幹→T`, `05_骨盆髖→P`, `06_膝部→K`, `07_小腿足踝→L`, `08_全身運動處方→Y`). IDs must be unique (FR-022). `isHighRisk` is computed as `HIGH_RISK_BLUEPRINT_IDS.has(blueprintId)`, where `HIGH_RISK_BLUEPRINT_IDS = {S4, T8, P1, P4, P5, K2, K3, K5, L3}` is exported from a **single** `catalog-constants.ts` and shared by ingestion and (later) the UI. After derivation, the marked set must equal that constant exactly — no more, no less (FR-010, SC-006). There are **no** hard-coded region-count or total constants: FR-002/FR-003 are checked against the blueprint set and region membership parsed from the `00` index (D2).

**Rationale**: Constitution's "single named constant" rule and FR-010's "不得在匯入中另行重複定義" require exactly one definition site; co-locating the folder map in the same small file keeps the fixed catalog facts together, while cardinalities come from the source index so the code never embeds corpus size.

**Alternatives considered**: Deriving high-risk from per-file flags in the source — the source has no such flag and the constitution declares the set authoritative; rejected. Duplicating the set in UI and ingestion — explicitly forbidden; rejected.

---

## D7. Internal-only `aiPrompt` — stored, never serialized

**Decision**: `aiPrompt` is parsed and stored on the `Blueprint` row (useful for traceability/regeneration), but the read API serializes blueprints through a `blueprint-public.dto.ts` projection that **omits** `aiPrompt` (and `contentHash`, `sourceMarkdownRef` internals). No endpoint selects or returns it.

**Rationale**: FR-020 / the 2026-06-30 clarification: `畫面視覺描述` is reviewer-exposable, `aiPrompt` is internal-only. Enforcing exclusion at the DTO layer (allow-list of fields) means a future endpoint cannot leak it by accident.

**Alternatives considered**: Don't store it at all — loses traceability and forces re-parsing the source to regenerate; rejected. Store it and rely on UI to hide it — violates defense-in-depth; rejected.

---

## D8. Read-only guarantee & report sink

**Decision**: The source reader opens files with read-only flags and never calls any write/rename/unlink API; the source root is treated as immutable input. The human-readable + structured report is written to **stdout** (and optionally a file under `backend/`/logs), never into the source dir. Integration tests snapshot every source file's content hash + mtime before and after both a successful and a failing ingest and assert zero changes (SC-005, FR-001).

**Rationale**: Constitution II is NON-NEGOTIABLE; making "never wrote" a tested invariant (not just a convention) is the only acceptable proof.

**Alternatives considered**: Writing a report file into the source dir for convenience — directly violates read-only; rejected.

---

## Report shape (consumed by FR-012 / FR-021 / SC-004)

A structured object rendered to a zh-TW human-readable summary:

```
{ ok: boolean,
  counts: { blueprints: number, perRegion: { S,H,E,T,P,K,L,Y } },
  reconciliation: { total, mapped, template, referral },   // computed from the index: total = mapped + template + referral
  highRisk: string[],                                       // expect exactly the 9-id set
  warnings: [{ blueprintId?, panelIndex?, message }],       // non-fatal: empty 時間提示/畫面視覺描述, 0 covered diagnoses
  errors:   [{ invariant, blueprintId?, panelIndex?, diagnosisNo?, message }],  // fatal, first failure halts persistence
  diff?:    { added: string[], modified: string[], removed: string[] } }        // re-run only
```

Errors locate the failing invariant by `blueprintId` / `panelIndex` / `diagnosisNo` so an operator can fix the source without reading every file (SC-004). Warnings are kept distinct from errors (FR-021).
