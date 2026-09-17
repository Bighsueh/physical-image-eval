# Data Model: Blueprint Catalog Ingestion

Catalog domain (constitution XI). Produced **only** by ingestion/re-run; read-only to users. Storage: PostgreSQL via Prisma. Logical types are stated at a conceptual level; the Prisma `schema.prisma` migration body is out of plan scope (left to /speckit-tasks).

Surrogate primary keys (`id`) are opaque (cuid). Business keys (`regionCode`, `blueprintId`, `matrixNo`) carry the domain identity and are uniquely constrained. `createdAt` / `updatedAt` timestamps exist on every table (omitted from field lists for brevity).

---

## Enums

### `RegionCode`
One of: `S` (肩部), `H` (頭頸部), `E` (肘腕手), `T` (脊椎軀幹), `P` (骨盆髖), `K` (膝部), `L` (小腿足踝), `Y` (全身運動處方).

### `MappingKind`
- `MAPPED`（已對應）— synonym/same-treatment diagnosis mapped to a specific non-Y blueprint.
- `TEMPLATE`（通用處方模板）— abstract systemic diagnosis covered by a Y-series general-prescription blueprint.
- `REFERRAL`（轉介）— non-PT / ophthalmology / GI diagnosis, produces no blueprint, maps to nothing.

`MAPPED ∪ TEMPLATE` = "對應到藍圖"; `REFERRAL` = "轉介". Together they are every diagnosis listed in the index; the counts are computed from the source and reported, not fixed (FR-008).

---

## Entity: `Region`（解剖區域）

The 8 anatomical regions. Seeded entirely by ingestion.

| Field | Logical type | Notes |
|-------|--------------|-------|
| `id` | string (cuid) | PK |
| `regionCode` | enum `RegionCode` | **unique**. Business key. |
| `nameZh` | string | e.g. 肩部. zh-TW (constitution VIII). |
| `nameEn` | string | e.g. SHOULDER. From a constant `regionCode → nameEn` map in `catalog-constants.ts` (co-located with the folder map), NOT parsed from the Chinese source folder name. |
| `displayOrder` | int (1..8) | **unique**. Drives stable region ordering in UI. |

**Relationships**: `Region` 1 ──< `Blueprint` (many).

**Constraints / indexes**:
- `UNIQUE(regionCode)`, `UNIQUE(displayOrder)`.
- Cardinality invariant (enforced by ingestion, FR-003): every region must contain at least one blueprint (`FR-003:empty-region`); membership comes from the index's per-region mapping tables.

---

## Entity: `Blueprint`（藍圖）

One 2×2 four-panel exercise-education image's reference unit. The catalog's center.

| Field | Logical type | Notes |
|-------|--------------|-------|
| `id` | string (cuid) | PK |
| `blueprintId` | string | **unique**. Business key, regex `^[SHETPKLY][1-9][0-9]?$` (FR-022). e.g. `S1`. |
| `regionId` | string (FK → `Region.id`) | NOT NULL. Region letter of `blueprintId` must match `Region.regionCode` (D6 cross-check). |
| `exerciseName` | string | 運動名稱. NOT NULL. |
| `indications` | string (text) | 適應症. **non-empty** (FR-006). |
| `frequency` | string | 練習次數. **non-empty** (FR-006). |
| `gentleReminder` | string (text) | 溫馨小叮嚀. **non-empty** (FR-006). |
| `imagePath` | string | **unique**. Relative path to the single PNG under `IMAGE_SOURCE_DIR`. Bytes NOT stored (D5). |
| `sourceMarkdownRef` | string | Relative path to the source `.md` (FR-016, traceability). |
| `version` | string | e.g. `v1.0`. Parsed from the blueprint blockquote. |
| `contentHash` | string | Hash of normalized parsed fields; powers idempotent diff (D4). Internal. |
| `isHighRisk` | boolean | Derived: `HIGH_RISK_BLUEPRINT_IDS.has(blueprintId)` (FR-010). |
| `aiPrompt` | string (text) | **INTERNAL-ONLY** — stored, never serialized to any API response (FR-020, D7). |

**Relationships**:
- `Region` 1 ──< `Blueprint`.
- `Blueprint` 1 ──= `Panel` (exactly 4, FR-004).
- `Blueprint` 1 ──< `Diagnosis` (0..n covered; FR-009 — every non-REFERRAL diagnosis points to an existing blueprint).
- (cross-feature) `Review` / `PanelNote` in **003** reference `Blueprint.blueprintId` / `Panel`; defined there, never written here.

**Constraints / indexes**:
- `UNIQUE(blueprintId)`, `UNIQUE(imagePath)`.
- Index on `regionId`; index on `isHighRisk` (badge/filter queries).
- Application invariant (FR-002): the set of `Blueprint` rows equals exactly the blueprint IDs listed in the index's per-region mapping tables — no listed blueprint missing from source (`FR-002:missing-blueprint`), no source blueprint unlisted (`FR-002:unlisted-blueprint`).
- The set `{ blueprintId : isHighRisk = true }` must equal `{S4,T8,P1,P4,P5,K2,K3,K5,L3}` exactly (FR-010, SC-006).

---

## Entity: `Panel`（分格）

One cell of a blueprint's 2×2 grid. Exactly four per blueprint.

| Field | Logical type | Notes |
|-------|--------------|-------|
| `id` | string (cuid) | PK |
| `blueprintId` | string (FK → `Blueprint.id`) | NOT NULL. |
| `panelIndex` | int (1..4) | 對應 圖1..圖4. |
| `stepName` | string | 步驟名 (the `### N. <name>` title). NOT NULL. |
| `actionDescription` | string (text) | 動作說明. **non-empty** (FR-007). |
| `timingHint` | string \| null | 時間提示. Optional (empty ⇒ warning, not error — FR-021). |
| `visualDescription` | string (text) \| null | 畫面視覺描述. Optional, **reviewer-exposable** (FR-020). |

**Relationships**: `Blueprint` 1 ──= `Panel` (exactly 4).

**Constraints / indexes**:
- `UNIQUE(blueprintId, panelIndex)`.
- Check: `panelIndex BETWEEN 1 AND 4`.
- Application invariant: each blueprint has exactly the panel set `{1,2,3,4}` — no gaps, no extras (FR-004).

---

## Entity: `Diagnosis`（診斷）

One row of the diagnosis mapping matrix. Sourced authoritatively from `00_藍圖總索引與設計規範.md` (D2).

| Field | Logical type | Notes |
|-------|--------------|-------|
| `id` | string (cuid) | PK |
| `matrixNo` | int (1..N, N = diagnoses listed in the index) | **unique**. Business key — the parenthesized matrix number from the index. |
| `nameZh` | string | 診斷中文名. zh-TW. |
| `mappingKind` | enum `MappingKind` | `MAPPED` / `TEMPLATE` / `REFERRAL`. |
| `mappedBlueprintId` | string (FK → `Blueprint.id`) \| null | NOT NULL for `MAPPED`/`TEMPLATE`; NULL for `REFERRAL`. `TEMPLATE` points to a Y-series blueprint. |

**Relationships**: `Blueprint` 1 ──< `Diagnosis` (via `mappedBlueprintId`; nullable for referral).

**Constraints / indexes**:
- `UNIQUE(matrixNo)`.
- Index on `mappedBlueprintId`.
- Conditional invariant: `mappingKind = REFERRAL ⇔ mappedBlueprintId IS NULL` (FR-009, edge case in spec §Edge Cases).
- Reconciliation invariant (FR-008): `matrixNo` values are unique (`FR-008:dup-matrixNo`) and contiguous from 1 to `count(*)` with no gaps (`FR-008:gap`), and at least one diagnosis is listed (`FR-008:empty`); `count(*)`, `count(MAPPED)+count(TEMPLATE)` and `count(REFERRAL)` are computed from the source and reported, not compared to constants.
- Referential invariant (FR-009): every non-referral `mappedBlueprintId` resolves to an existing `Blueprint`.

---

## Cross-feature references (not owned here)

- **001 (accounts/auth)** — `Account`, `Session`, `AuditLog`. The catalog read API requires an authenticated session (either role) enforced by 001's middleware, but defines no auth entity.
- **003 (review workflow)** — `Review`, `PanelNote` (per reviewer × blueprint / panel). These reference catalog rows by `Blueprint.blueprintId` and `Panel` identity. They are read-only consumers of the catalog; ingestion never reads or writes them (domain separation, constitution XI).

## Entity-relationship summary

```text
Region (8) ──1:N── Blueprint (≥1 per region, set = index) ──1:4── Panel
                        │
                        └──1:N── Diagnosis (mapped/template; referral have NULL blueprint)
Diagnosis total = (MAPPED+TEMPLATE) + (REFERRAL); matrixNo unique, contiguous 1..total
HighRisk Blueprints = { S4, T8, P1, P4, P5, K2, K3, K5, L3 }  (single named constant)
```
