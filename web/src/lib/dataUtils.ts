import Papa from "papaparse";
import * as XLSX from "xlsx";

import { DataProfile, DataRecord, DataValue } from "./dataTypes";

export function normalizeValue(value: DataValue): string {
  if (value === null || value === undefined) {
    return "Sin dato";
  }
  const text = String(value).trim();
  return text.length > 0 ? text : "Sin dato";
}

export type CaseMode = "mantener" | "mayusculas" | "minusculas" | "titulo";

export interface TextNormalizeOptions {
  trim?: boolean;
  collapseSpaces?: boolean;
  removeAccents?: boolean;
  caseMode?: CaseMode;
  keepPunctuation?: boolean;
}

export function normalizeText(value: DataValue, options: TextNormalizeOptions = {}): string {
  if (value === null || value === undefined) {
    return "";
  }
  const {
    trim = true,
    collapseSpaces = true,
    removeAccents = false,
    caseMode = "mantener",
    keepPunctuation = true
  } = options;
  let text = String(value);
  if (trim) {
    text = text.trim();
  }
  if (collapseSpaces) {
    text = text.replace(/\s+/g, " ");
  }
  if (!keepPunctuation) {
    text = text.replace(/[^\p{L}\p{N}\s]/gu, "");
  }
  if (removeAccents) {
    text = stripAccents(text);
  }
  if (caseMode === "mayusculas") {
    text = text.toUpperCase();
  }
  if (caseMode === "minusculas") {
    text = text.toLowerCase();
  }
  if (caseMode === "titulo") {
    text = toTitleCase(text);
  }
  return text;
}

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function toNumber(value: DataValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace(",", ".");
    const num = Number(cleaned);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return null;
}

export function isDateLike(value: DataValue): boolean {
  if (!value) {
    return false;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return true;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const year = parsed.getFullYear();
  return year >= 1900 && year <= 2100;
}

export function buildProfile(records: DataRecord[]): DataProfile {
  const columnSet = new Set<string>();
  records.forEach((row) => {
    Object.keys(row).forEach((key) => columnSet.add(key));
  });
  const columns = Array.from(columnSet);
  const numericColumns: string[] = [];
  const dateColumns: string[] = [];

  columns.forEach((column) => {
    const values = records.map((row) => row[column]).filter((value) => value !== null && value !== undefined);
    if (values.length === 0) {
      return;
    }
    const numericHits = values.filter((value) => toNumber(value) !== null).length;
    const dateHits = values.filter((value) => isDateLike(value)).length;
    if (numericHits / values.length >= 0.7) {
      numericColumns.push(column);
    }
    if (dateHits / values.length >= 0.7) {
      dateColumns.push(column);
    }
  });

  return {
    columns,
    numericColumns,
    dateColumns,
    rowCount: records.length
  };
}

export interface ColumnStats {
  column: string;
  uniqueCount: number;
  nullCount: number;
  sampleValues: string[];
}

export function buildColumnStats(records: DataRecord[], columns: string[]): ColumnStats[] {
  return columns.map((column) => {
    const counts = new Set<string>();
    let nullCount = 0;
    const sampleValues: string[] = [];
    records.forEach((row) => {
      const value = row[column];
      if (value === null || value === undefined || String(value).trim() === "") {
        nullCount += 1;
        return;
      }
      const text = normalizeValue(value);
      counts.add(text);
      if (sampleValues.length < 6 && !sampleValues.includes(text)) {
        sampleValues.push(text);
      }
    });
    return {
      column,
      uniqueCount: counts.size,
      nullCount,
      sampleValues
    };
  });
}

export function getUniqueValues(records: DataRecord[], column: string, limit = 250): string[] {
  const values = new Set<string>();
  for (const row of records) {
    const value = normalizeValue(row[column]);
    values.add(value);
    if (values.size >= limit) {
      break;
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function filterRecords(
  records: DataRecord[],
  filters: Record<string, string[]>
): DataRecord[] {
  const active = Object.entries(filters).filter(([, values]) => values.length > 0);
  if (active.length === 0) {
    return records;
  }
  return records.filter((row) =>
    active.every(([column, values]) => values.includes(normalizeValue(row[column])))
  );
}

export function exportCsv(records: DataRecord[]): string {
  return Papa.unparse(records, {
    quotes: false,
    delimiter: ",",
    newline: "\n"
  });
}

export function exportXlsx(records: DataRecord[], sheetName = "Datos"): Blob {
  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}
