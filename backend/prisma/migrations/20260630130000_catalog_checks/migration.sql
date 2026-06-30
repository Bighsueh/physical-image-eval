-- Catalog CHECK constraints (data-model.md). Prisma's DSL cannot express CHECK constraints, so
-- they are added as a raw migration: a DB-level backstop behind the Phase-A ingestion validation.

-- FR-004: each panel index is 1..4.
ALTER TABLE "Panel"
  ADD CONSTRAINT "Panel_panelIndex_chk" CHECK ("panelIndex" BETWEEN 1 AND 4);

-- FR-009 / data-model: REFERRAL ⇔ mappedBlueprintId IS NULL; MAPPED/TEMPLATE ⇒ NOT NULL.
ALTER TABLE "Diagnosis"
  ADD CONSTRAINT "Diagnosis_mapping_chk" CHECK (
    ("mappingKind" = 'REFERRAL' AND "mappedBlueprintId" IS NULL) OR
    ("mappingKind" <> 'REFERRAL' AND "mappedBlueprintId" IS NOT NULL)
  );
