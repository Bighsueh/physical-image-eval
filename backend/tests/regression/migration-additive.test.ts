import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T139 / FR-060 — the reference-photo migration must be purely additive.
 *
 * The property that matters is the **target table**, not the statement verb: Prisma emits
 * `ALTER TABLE … ADD CONSTRAINT` for a new table's own foreign keys, so a blanket "zero ALTER"
 * assertion would fail on a migration that is in fact additive. (The task originally read that
 * way; corrected once the real migration was generated.)
 */
const MIGRATIONS_DIR = join(__dirname, '../../prisma/migrations');

/** Every table that existed before this change. None of them may be touched. */
const PRE_EXISTING_TABLES = [
  'Account',
  'Session',
  'AuditLog',
  'Region',
  'Blueprint',
  'Panel',
  'Diagnosis',
  'Review',
  'PanelReview',
];

const photoMigrationSql = (): string => {
  const dir = readdirSync(MIGRATIONS_DIR).find((d) => d.endsWith('_review_photo'));
  expect(dir, 'the review_photo migration must exist').toBeTruthy();
  return readFileSync(join(MIGRATIONS_DIR, dir!, 'migration.sql'), 'utf8');
};

describe('review_photo migration is additive (FR-060)', () => {
  it('creates exactly the two new tables', () => {
    const sql = photoMigrationSql();
    const created = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(created).toEqual(['ReviewPhoto', 'ReviewPhotoBlob']);
  });

  it('never alters a pre-existing table', () => {
    const sql = photoMigrationSql();
    const altered = [...sql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1]);
    const forbidden = altered.filter((t) => PRE_EXISTING_TABLES.includes(t));
    expect(forbidden).toEqual([]);
    // Whatever it does alter must be one of the tables it just created.
    for (const t of altered) expect(['ReviewPhoto', 'ReviewPhotoBlob']).toContain(t);
  });

  it('drops nothing and renames nothing', () => {
    const sql = photoMigrationSql();
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/RENAME/i);
  });
});
