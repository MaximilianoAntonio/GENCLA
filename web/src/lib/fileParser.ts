import Papa from "papaparse";
import { tableFromIPC } from "apache-arrow";
import { readParquet } from "parquet-wasm";
import * as XLSX from "xlsx";

import { DataRecord } from "./dataTypes";

export async function parseFile(file: File): Promise<DataRecord[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension) {
    throw new Error("No se pudo identificar la extension del archivo.");
  }

  if (extension === "csv") {
    return parseCsv(file);
  }

  if (extension === "xlsx" || extension === "xls") {
    return parseXlsx(file);
  }

  if (extension === "parquet") {
    return parseParquet(file);
  }

  throw new Error("Formato no soportado. Usa CSV o Excel.");
}

async function parseCsv(file: File): Promise<DataRecord[]> {
  const text = await file.text();
  const parsed = Papa.parse<DataRecord>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true
  });
  if (parsed.errors.length > 0) {
    throw new Error(`Error al leer CSV: ${parsed.errors[0].message}`);
  }
  return parsed.data;
}

async function parseXlsx(file: File): Promise<DataRecord[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo Excel no contiene hojas.");
  }
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false }) as DataRecord[];
}

async function parseParquet(file: File): Promise<DataRecord[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  try {
    const arrowBuffer = readParquet(buffer) as Uint8Array;
    const table = tableFromIPC(arrowBuffer);
    const rows: DataRecord[] = [];
    const columns = table.schema.fields.map((field) => field.name);
    for (let rowIndex = 0; rowIndex < table.numRows; rowIndex += 1) {
      const row: DataRecord = {};
      columns.forEach((column, colIndex) => {
        const columnData = table.getColumnAt(colIndex);
        row[column] = columnData ? (columnData.get(rowIndex) as DataRecord[string]) : null;
      });
      rows.push(row);
    }
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    throw new Error(`No se pudo leer Parquet: ${message}`);
  }
}
