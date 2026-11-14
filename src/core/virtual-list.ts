export interface VirtualWindow {
  start: number;
  end: number;
  offset: number;
  totalHeight: number;
}

/** Calculate a bounded render window for a fixed-height virtual list. */
export function virtualWindowRange(
  totalCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 6,
  selectedIndex = -1,
): VirtualWindow {
  const count = Math.max(0, Math.floor(totalCount));
  const height = Math.max(1, rowHeight);
  const viewport = Math.max(1, viewportHeight);
  const safeScrollTop = Math.max(0, Math.min(Number.isFinite(scrollTop) ? scrollTop : 0, Math.max(0, count * height - viewport)));
  let start = Math.max(0, Math.floor(safeScrollTop / height) - Math.max(0, Math.floor(overscan)));
  let end = Math.min(count, Math.ceil((safeScrollTop + viewport) / height) + Math.max(0, Math.floor(overscan)));
  if (selectedIndex >= 0 && selectedIndex < count && (selectedIndex < start || selectedIndex >= end)) {
    start = Math.max(0, selectedIndex - Math.max(0, Math.floor(overscan)));
    end = Math.min(count, Math.max(end, selectedIndex + Math.max(1, Math.floor(overscan)) + 1));
  }
  return { start, end, offset: start * height, totalHeight: count * height };
}
