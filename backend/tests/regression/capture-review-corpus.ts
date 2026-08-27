import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { prisma } from '../../src/lib/prisma';

/**
 * SC-017 baseline capture (003 amendment, task T088).
 *
 * Dumps every scalar of the review corpus — `Review` plus its `PanelReview` rows — in a
 * stable order, so the same dump taken after the reference-photo migration can be compared
 * row for row. The photo change is additive by design (two `CREATE TABLE`s, zero `ALTER`);
 * this file is what turns that from a claim into a check.
 *
 * MUST run BEFORE the migration. Once applied, a pre-migration snapshot cannot be recovered.
 *
 *   npx tsx backend/tests/regression/capture-review-corpus.ts <outFile>
 *
 * Run it against whichever database holds the real data. A developer machine with an empty
 * database produces an empty (still valid) baseline — meaningful only against a database
 * that actually has reviews, so this must also be run against production before the
 * migration is deployed there.
 */

/** Stable, order-independent serialization of one review + its panels. */
export interface CorpusRow {
  reviewerId: string;
  blueprintCode: string;
  overallJudgement: string | null;
  indicationJudgement: string | null;
  indicationNote: string | null;
  otherComment: string | null;
  status: string;
  submittedAt: string | null;
  panels: {
    panelIndex: number;
    noProblem: boolean;
    requiredWarnings: string[];
    warningOther: string | null;
    problemTypes: string[];
    problemNote: string | null;
  }[];
}

export interface Corpus {
  rowCount: number;
  /** Digest of the serialized rows — a single value that must not change across the migration. */
  digest: string;
  rows: CorpusRow[];
}

/**
 * Multi-select columns are Postgres enum arrays whose stored order is the order they were
 * written in; sorting them here keeps the digest stable against a rewrite that preserves the
 * set but not the sequence. `lastUpdatedAt` is deliberately excluded — attaching a photo to a
 * submitted review is allowed to refresh it (FR-051), so including it would produce a false
 * positive. `submittedAt` and every judgement/annotation field IS included, because none of
 * them may move (SC-017).
 */
export async function captureCorpus(): Promise<Corpus> {
  const reviews = await prisma.review.findMany({
    orderBy: [{ reviewerId: 'asc' }, { blueprintCode: 'asc' }],
    include: { panels: { orderBy: { panelIndex: 'asc' } } },
  });

  const rows: CorpusRow[] = reviews.map((r) => ({
    reviewerId: r.reviewerId,
    blueprintCode: r.blueprintCode,
    overallJudgement: r.overallJudgement,
    indicationJudgement: r.indicationJudgement,
    indicationNote: r.indicationNote,
    otherComment: r.otherComment,
    status: r.status,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    panels: r.panels.map((p) => ({
      panelIndex: p.panelIndex,
      noProblem: p.noProblem,
      requiredWarnings: [...p.requiredWarnings].sort(),
      warningOther: p.warningOther,
      problemTypes: [...p.problemTypes].sort(),
      problemNote: p.problemNote,
    })),
  }));

  const serialized = JSON.stringify(rows);
  return {
    rowCount: rows.length,
    digest: createHash('sha256').update(serialized).digest('hex'),
    rows,
  };
}

export async function writeCorpus(outFile: string): Promise<Corpus> {
  const corpus = await captureCorpus();
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  return corpus;
}

// Direct execution (not when imported by a test).
if (process.argv[1]?.endsWith('capture-review-corpus.ts')) {
  const outFile = process.argv[2] ?? 'backend/tests/regression/fixtures/review-corpus.baseline.json';
  writeCorpus(outFile)
    .then((c) => {
      console.log(`[corpus] ${c.rowCount} reviews → ${outFile}`);
      console.log(`[corpus] digest ${c.digest}`);
      if (c.rowCount === 0) {
        console.warn(
          '[corpus] WARNING: empty baseline. This proves nothing about real data — ' +
            'run this against the database that actually holds reviews before migrating it.',
        );
      }
    })
    .catch((err) => {
      console.error('[corpus] failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
