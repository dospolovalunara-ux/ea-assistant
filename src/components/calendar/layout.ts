/** Раскладка пересекающихся событий дня по колонкам (встают рядом). */
export interface Positioned<T> {
  item: T;
  col: number;
  cols: number;
}

export function layoutDay<T extends { start: number; end: number }>(items: T[]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let clusterEnd = -Infinity;
  let colEnds: number[] = [];

  const flush = () => {
    const cols = colEnds.length || 1;
    for (const p of cluster) p.cols = cols;
    result.push(...cluster);
    cluster = [];
    colEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length) {
      flush();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((end) => end <= item.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(item.end);
    } else colEnds[col] = item.end;
    cluster.push({ item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return result;
}
