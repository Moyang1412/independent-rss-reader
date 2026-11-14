import { describe, expect, it } from 'vitest';
import { virtualWindowRange } from '../src/core/virtual-list';

describe('virtual list windowing', () => {
  it('renders only the visible range with overscan', () => {
    expect(virtualWindowRange(1_000, 560, 280, 56, 2)).toEqual({ start: 8, end: 17, offset: 448, totalHeight: 56_000 });
  });

  it('clamps scroll positions and keeps a selected row in the window', () => {
    expect(virtualWindowRange(20, 99_999, 200, 50, 1)).toEqual({ start: 15, end: 20, offset: 750, totalHeight: 1_000 });
    const range = virtualWindowRange(100, 0, 100, 20, 1, 80);
    expect(range.start).toBeLessThanOrEqual(80);
    expect(range.end).toBeGreaterThan(80);
  });
});
