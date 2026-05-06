import { DataRecord } from "./dataTypes";
import { normalizeValue, toNumber } from "./dataUtils";
import { buildTimeLabel, TimeLevel } from "./timeUtils";

export type Metric = "Conteo" | "Suma" | "Promedio" | "Maximo" | "Minimo" | "Mediana" | "Conteo único";

export interface FieldConfig {
  key: string;
  timeLevel: TimeLevel;
}

export interface AggregatedEntry {
  key: string;
  value: number;
  sortKey?: string;
}

export interface PivotResult {
  rowKeys: string[];
  columnKeys: string[];
  values: number[][];
}

export interface HistogramResult {
  categories: string[];
  values: number[];
  count: number;
  min: number;
  max: number;
}

export interface ScatterSeries {
  name: string;
  data: [number, number][];
}

export interface BoxplotResult {
  categories: string[];
  series: number[][]; // [min, Q1, median, Q3, max] per category
}

export interface HeatmapResult {
  rowLabels: string[];
  colLabels: string[];
  data: [number, number, number][]; // [colIdx, rowIdx, value]
  maxValue: number;
}

export interface DataStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  q1: number;
  q3: number;
  count: number;
}

// ─── Core aggregation ─────────────────────────────────────────────────────────

export function aggregateBy(
  records: DataRecord[],
  fields: FieldConfig[],
  metric: Metric,
  valueKey?: string
): AggregatedEntry[] {
  if (metric === "Mediana") {
    return aggregateMedian(records, fields, valueKey);
  }
  if (metric === "Conteo único") {
    return aggregateUniqueCount(records, fields, valueKey);
  }

  const map = new Map<string, { values: number[]; sortKey?: string }>();

  records.forEach((row) => {
    const labels = fields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).label);
    const sortKey = fields
      .map((field) => buildTimeLabel(row[field.key], field.timeLevel).sortKey ?? "")
      .join("|");
    const key = labels.join(" | ");

    if (metric === "Conteo") {
      const current = map.get(key) ?? { values: [], sortKey };
      current.values.push(1);
      current.sortKey = sortKey;
      map.set(key, current);
      return;
    }

    const numVal = valueKey ? toNumber(row[valueKey]) : null;
    if (numVal === null) return;

    const current = map.get(key) ?? { values: [], sortKey };
    current.values.push(numVal);
    current.sortKey = sortKey;
    map.set(key, current);
  });

  const entries: AggregatedEntry[] = [];
  map.forEach((bucket, key) => {
    let value: number;
    if (metric === "Conteo") {
      value = bucket.values.length;
    } else if (metric === "Suma") {
      value = bucket.values.reduce((a, b) => a + b, 0);
    } else if (metric === "Promedio") {
      value = bucket.values.length > 0 ? bucket.values.reduce((a, b) => a + b, 0) / bucket.values.length : 0;
    } else if (metric === "Maximo") {
      value = bucket.values.length > 0 ? Math.max(...bucket.values) : 0;
    } else {
      // Minimo
      value = bucket.values.length > 0 ? Math.min(...bucket.values) : 0;
    }
    entries.push({ key, value: round(value), sortKey: bucket.sortKey });
  });

  return entries;
}

function aggregateMedian(records: DataRecord[], fields: FieldConfig[], valueKey?: string): AggregatedEntry[] {
  const map = new Map<string, { values: number[]; sortKey?: string }>();

  records.forEach((row) => {
    const labels = fields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).label);
    const sortKey = fields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).sortKey ?? "").join("|");
    const key = labels.join(" | ");
    const numVal = valueKey ? toNumber(row[valueKey]) : null;
    if (numVal === null) return;
    const current = map.get(key) ?? { values: [], sortKey };
    current.values.push(numVal);
    current.sortKey = sortKey;
    map.set(key, current);
  });

  const entries: AggregatedEntry[] = [];
  map.forEach((bucket, key) => {
    const sorted = [...bucket.values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    entries.push({ key, value: round(median), sortKey: bucket.sortKey });
  });
  return entries;
}

function aggregateUniqueCount(records: DataRecord[], fields: FieldConfig[], valueKey?: string): AggregatedEntry[] {
  if (!valueKey) return [];
  const map = new Map<string, { set: Set<string>; sortKey?: string }>();

  records.forEach((row) => {
    const labels = fields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).label);
    const sortKey = fields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).sortKey ?? "").join("|");
    const key = labels.join(" | ");
    const val = normalizeValue(row[valueKey]);
    const current = map.get(key) ?? { set: new Set<string>(), sortKey };
    current.set.add(val);
    current.sortKey = sortKey;
    map.set(key, current);
  });

  const entries: AggregatedEntry[] = [];
  map.forEach((bucket, key) => {
    entries.push({ key, value: bucket.set.size, sortKey: bucket.sortKey });
  });
  return entries;
}

// ─── Pivot ────────────────────────────────────────────────────────────────────

export function aggregatePivot(
  records: DataRecord[],
  rowFields: FieldConfig[],
  columnFields: FieldConfig[],
  metric: Metric,
  valueKey?: string
): PivotResult {
  const rowMap = new Map<string, Map<string, { sum: number; count: number }>>();
  const rowKeys: string[] = [];
  const columnKeys: string[] = [];
  const columnKeySet = new Set<string>();

  records.forEach((row) => {
    const rowKey = rowFields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).label).join(" | ");
    const columnKey = columnFields.map((field) => buildTimeLabel(row[field.key], field.timeLevel).label).join(" | ");

    if (!rowMap.has(rowKey)) {
      rowMap.set(rowKey, new Map());
      rowKeys.push(rowKey);
    }
    if (!columnKeySet.has(columnKey)) {
      columnKeySet.add(columnKey);
      columnKeys.push(columnKey);
    }

    let increment = 1;
    if (metric !== "Conteo") {
      const value = valueKey ? toNumber(row[valueKey]) : null;
      if (value === null) return;
      increment = value;
    }

    const rowEntry = rowMap.get(rowKey)!;
    const current = rowEntry.get(columnKey) ?? { sum: 0, count: 0 };
    current.sum += increment;
    current.count += 1;
    rowEntry.set(columnKey, current);
  });

  const values = rowKeys.map((rowKey) => {
    const rowEntry = rowMap.get(rowKey) ?? new Map();
    return columnKeys.map((columnKey) => {
      const cell = rowEntry.get(columnKey);
      if (!cell) return 0;
      const metricValue = metric === "Promedio" ? cell.sum / cell.count : cell.sum;
      return round(metricValue);
    });
  });

  return { rowKeys, columnKeys, values };
}

// ─── Histogram ────────────────────────────────────────────────────────────────

export function buildHistogram(records: DataRecord[], column: string, bins: number): HistogramResult {
  const values = records.map((row) => toNumber(row[column])).filter((v): v is number => v !== null);

  if (values.length === 0) return { categories: [], values: [], count: 0, min: 0, max: 0 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / bins || 1;

  const counts = new Array(bins).fill(0);
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / step));
    counts[index] += 1;
  });

  const categories = counts.map((_, index) => {
    const start = min + index * step;
    const end = start + step;
    return `${start.toFixed(1)}-${end.toFixed(1)}`;
  });

  return { categories, values: counts, count: values.length, min, max };
}

// ─── Scatter ──────────────────────────────────────────────────────────────────

export function buildScatter(
  records: DataRecord[],
  xKey: string,
  yKey: string,
  groupKey?: string
): ScatterSeries[] {
  if (!groupKey) {
    const data: [number, number][] = [];
    records.forEach((row) => {
      const x = toNumber(row[xKey]);
      const y = toNumber(row[yKey]);
      if (x !== null && y !== null) data.push([x, y]);
    });
    return [{ name: `${xKey} vs ${yKey}`, data }];
  }

  const grouped = new Map<string, [number, number][]>();
  records.forEach((row) => {
    const x = toNumber(row[xKey]);
    const y = toNumber(row[yKey]);
    if (x === null || y === null) return;
    const label = normalizeValue(row[groupKey]);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push([x, y]);
  });

  return Array.from(grouped.entries()).map(([name, data]) => ({ name, data }));
}

// ─── Boxplot ──────────────────────────────────────────────────────────────────

export function buildBoxplot(
  records: DataRecord[],
  categoryKey: string,
  valueKey: string,
  topN = 10
): BoxplotResult {
  const grouped = new Map<string, number[]>();

  records.forEach((row) => {
    const cat = normalizeValue(row[categoryKey]);
    const val = toNumber(row[valueKey]);
    if (val === null) return;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(val);
  });

  // Sort by median descending, take topN
  const sorted = Array.from(grouped.entries())
    .map(([cat, vals]) => {
      const s = [...vals].sort((a, b) => a - b);
      const med = s.length % 2 === 0 ? (s[Math.floor(s.length / 2) - 1] + s[Math.floor(s.length / 2)]) / 2 : s[Math.floor(s.length / 2)];
      return { cat, vals: s, median: med };
    })
    .sort((a, b) => b.median - a.median)
    .slice(0, topN);

  const categories = sorted.map((item) => item.cat);
  const series = sorted.map((item) => {
    const s = item.vals;
    const q1idx = Math.floor(s.length / 4);
    const q3idx = Math.floor((3 * s.length) / 4);
    return [
      round(s[0]),
      round(s[q1idx]),
      round(item.median),
      round(s[q3idx]),
      round(s[s.length - 1])
    ];
  });

  return { categories, series };
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

export function buildHeatmap(
  records: DataRecord[],
  rowKey: string,
  colKey: string,
  metric: Metric = "Conteo",
  valueKey?: string,
  topN = 12
): HeatmapResult {
  const counts = new Map<string, Map<string, { sum: number; count: number }>>();
  const rowSet = new Map<string, number>();
  const colSet = new Map<string, number>();

  records.forEach((row) => {
    const r = normalizeValue(row[rowKey]);
    const c = normalizeValue(row[colKey]);
    rowSet.set(r, (rowSet.get(r) ?? 0) + 1);
    colSet.set(c, (colSet.get(c) ?? 0) + 1);

    if (!counts.has(r)) counts.set(r, new Map());
    const colMap = counts.get(r)!;
    const current = colMap.get(c) ?? { sum: 0, count: 0 };
    const val = metric === "Conteo" ? 1 : (valueKey ? (toNumber(row[valueKey]) ?? 0) : 0);
    current.sum += val;
    current.count += 1;
    colMap.set(c, current);
  });

  // Top N rows and cols by frequency
  const rowLabels = [...rowSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k);
  const colLabels = [...colSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k);

  const data: [number, number, number][] = [];
  let maxValue = 0;
  rowLabels.forEach((r, ri) => {
    colLabels.forEach((c, ci) => {
      const cell = counts.get(r)?.get(c);
      let val = 0;
      if (cell) {
        val = metric === "Promedio" ? round(cell.sum / cell.count) : round(cell.sum);
      }
      if (val > maxValue) maxValue = val;
      data.push([ci, ri, val]);
    });
  });

  return { rowLabels, colLabels, data, maxValue };
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export function computeStats(records: DataRecord[], column: string): DataStats | null {
  const values = records.map((row) => toNumber(row[column])).filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const q1 = sorted[Math.floor(n / 4)];
  const q3 = sorted[Math.floor((3 * n) / 4)];

  return {
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
    mean: round(mean),
    median: round(median),
    stdDev: round(Math.sqrt(variance)),
    q1: round(q1),
    q3: round(q3),
    count: n
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
