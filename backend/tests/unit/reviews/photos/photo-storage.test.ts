import { describe, expect, it } from 'vitest';
import { classifyUsage, WARN_THRESHOLD } from '../../../../src/reviews/photos/services/photo-storage.service';

const GB = 1024 ** 3;
const LIMIT = 10 * GB;

describe('classifyUsage — used/limit → percent + warning band (FR-034, research D18)', () => {
  it('reports none below the warning threshold', () => {
    const r = classifyUsage(3 * GB, LIMIT);
    expect(r.usedPercent).toBeCloseTo(30, 5);
    expect(r.warning).toBe('none');
    expect(r.isFull).toBe(false);
  });

  it('is exclusive below and inclusive at the 80% threshold', () => {
    expect(WARN_THRESHOLD).toBe(0.8);
    expect(classifyUsage(LIMIT * 0.8 - 1, LIMIT).warning).toBe('none');
    expect(classifyUsage(LIMIT * 0.8, LIMIT).warning).toBe('approaching');
  });

  it('reports full at and beyond the ceiling', () => {
    expect(classifyUsage(LIMIT - 1, LIMIT).isFull).toBe(false);
    expect(classifyUsage(LIMIT, LIMIT).isFull).toBe(true);
    expect(classifyUsage(LIMIT, LIMIT).warning).toBe('full');
    // Over-ceiling is reachable: the last accepted upload may straddle the line.
    const over = classifyUsage(LIMIT + 5 * GB, LIMIT);
    expect(over.isFull).toBe(true);
    expect(over.usedPercent).toBeGreaterThan(100);
  });

  it('handles an empty store without dividing by zero', () => {
    const r = classifyUsage(0, LIMIT);
    expect(r.usedPercent).toBe(0);
    expect(r.warning).toBe('none');
  });
});
