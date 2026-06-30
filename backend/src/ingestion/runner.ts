import { readAndBuildCatalog } from './parser/build-catalog';
import { computeDiff, readSnapshot } from './diff/snapshot-diff';
import { SourceUnreadableError } from './source/source-reader';
import { collectErrors } from './validation/invariants';
import { buildReport, renderReport } from './validation/report';
import { writeCatalog } from './persistence/catalog-writer';
import type { ReportDiff } from './validation/report-types';
import type { IngestReport } from './validation/report-types';

/**
 * Two-phase ingest (D3). Phase A: read-only parse → validate → report (no DB writes). Phase B (only
 * when clean AND not --check): one transaction snapshot-replace. Exit codes per the contract:
 * 0 success/--check · 1 validation failure (0 rows persisted) · 2 source unreadable/missing · 3 DB
 * transaction error (rolled back, prior catalog intact).
 */
export interface RunIngestOptions {
  sourceDir: string;
  check?: boolean;
}

export interface RunIngestResult {
  exitCode: 0 | 1 | 2 | 3;
  report?: IngestReport;
  renderedReport: string;
}

export const runIngest = async (opts: RunIngestOptions): Promise<RunIngestResult> => {
  // Phase A — read-only parse.
  let catalog;
  try {
    catalog = readAndBuildCatalog(opts.sourceDir);
  } catch (err) {
    if (err instanceof SourceUnreadableError) {
      return { exitCode: 2, renderedReport: `❌ ${err.message}（未變更任何既有目錄）` };
    }
    throw err;
  }

  const errors = collectErrors(catalog);

  // Compute a re-run diff against the existing catalog only when the new set is clean.
  let diff: ReportDiff | undefined;
  if (errors.length === 0) {
    diff = computeDiff(await readSnapshot(), catalog);
  }

  const report = buildReport(catalog, errors, diff);
  const rendered = renderReport(report);

  if (errors.length > 0) {
    return { exitCode: 1, report, renderedReport: rendered };
  }
  if (opts.check) {
    return { exitCode: 0, report, renderedReport: `${rendered}\n\n（--check：僅驗證，未寫入任何資料）` };
  }

  // Phase B — single transaction snapshot-replace.
  try {
    await writeCatalog(catalog);
  } catch {
    return {
      exitCode: 3,
      report,
      renderedReport: `${rendered}\n\n❌ 寫入交易失敗，已回滾；既有目錄維持上一份成功狀態。`,
    };
  }
  return { exitCode: 0, report, renderedReport: rendered };
};
