import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { nanoid } from "nanoid";

import { AuditEntry, DataProfile, DataRecord, FileInfo, MappingRule } from "../lib/dataTypes";
import { buildProfile, exportCsv, exportXlsx, normalizeValue } from "../lib/dataUtils";

interface DataContextValue {
  data: DataRecord[];
  rawData: DataRecord[];
  profile: DataProfile | null;
  history: AuditEntry[];
  fileInfo: FileInfo | null;
  setData: (records: DataRecord[], file: File) => void;
  applyHomologation: (column: string, fromValues: string[], toValue: string) => void;
  applyHomologationBatch: (rules: MappingRule[]) => void;
  clearHistory: () => void;
  resetData: () => void;
  removeHomologation: (id: string) => void;
  exportCsvData: () => string;
  exportXlsxData: () => Blob;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

/** Apply a list of MappingRule[] sequentially to a base dataset (for replay). */
function replayRules(base: DataRecord[], rules: MappingRule[]): DataRecord[] {
  if (rules.length === 0) return base;

  const ruleMaps = new Map<string, Map<string, MappingRule>>();
  rules.forEach((rule) => {
    const columnMap = ruleMaps.get(rule.column) ?? new Map<string, MappingRule>();
    rule.fromValues.forEach((value) => columnMap.set(normalizeValue(value), rule));
    ruleMaps.set(rule.column, columnMap);
  });

  return base.map((row) => {
    let changed = false;
    const nextRow = { ...row };
    ruleMaps.forEach((columnMap, column) => {
      const rule = columnMap.get(normalizeValue(row[column]));
      if (rule) {
        nextRow[column] = rule.toValue;
        changed = true;
      }
    });
    return changed ? nextRow : row;
  });
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<DataRecord[]>([]);
  const [rawData, setRawData] = useState<DataRecord[]>([]);
  const [profile, setProfile] = useState<DataProfile | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);

  const setData = useCallback((records: DataRecord[], file: File) => {
    setDataState(records);
    setRawData(records);
    setProfile(buildProfile(records));
    setHistory([]);
    setFileInfo({
      name: file.name,
      size: file.size,
      type: file.type || "desconocido",
      rows: records.length,
      updatedAt: new Date().toISOString()
    });
  }, []);

  const applyHomologation = useCallback(
    (column: string, fromValues: string[], toValue: string) => {
      if (!column || fromValues.length === 0 || !toValue) return;

      const fromSet = new Set(fromValues.map((v) => v.trim()));
      let affected = 0;
      const updated = data.map((row) => {
        const current = normalizeValue(row[column]);
        if (fromSet.has(current)) {
          affected += 1;
          return { ...row, [column]: toValue };
        }
        return row;
      });

      const rule: MappingRule = { id: nanoid(), column, fromValues, toValue, reason: "manual" };
      setDataState(updated);
      setHistory((prev) => [
        {
          id: nanoid(),
          timestamp: new Date().toISOString(),
          column,
          fromValues,
          toValue,
          affectedRows: affected,
          rules: [rule]
        },
        ...prev
      ]);
    },
    [data]
  );

  const applyHomologationBatch = useCallback(
    (rules: MappingRule[]) => {
      if (rules.length === 0) return;

      const ruleMaps = new Map<string, Map<string, MappingRule>>();
      rules.forEach((rule) => {
        const columnMap = ruleMaps.get(rule.column) ?? new Map<string, MappingRule>();
        rule.fromValues.forEach((value) => columnMap.set(normalizeValue(value), rule));
        ruleMaps.set(rule.column, columnMap);
      });

      const counters = new Map<string, number>();
      const updated = data.map((row) => {
        let changed = false;
        const nextRow = { ...row };
        ruleMaps.forEach((columnMap, column) => {
          const current = normalizeValue(row[column]);
          const rule = columnMap.get(current);
          if (rule) {
            nextRow[column] = rule.toValue;
            const key = `${rule.column}|${rule.toValue}|${rule.fromValues.join("|")}`;
            counters.set(key, (counters.get(key) ?? 0) + 1);
            changed = true;
          }
        });
        return changed ? nextRow : row;
      });

      // Each rule becomes its own AuditEntry so it can be reverted individually
      const historyEntries: AuditEntry[] = rules.map((rule) => {
        const key = `${rule.column}|${rule.toValue}|${rule.fromValues.join("|")}`;
        return {
          id: nanoid(),
          timestamp: new Date().toISOString(),
          column: rule.column,
          fromValues: rule.fromValues,
          toValue: rule.toValue,
          affectedRows: counters.get(key) ?? 0,
          rules: [rule]
        };
      });

      setDataState(updated);
      setHistory((prev) => [...historyEntries, ...prev]);
    },
    [data]
  );

  /**
   * Remove a specific homologation by id and replay all remaining ones from rawData.
   * This correctly handles any order of removal.
   */
  const removeHomologation = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = prev.filter((entry) => entry.id !== id);
        // Collect all remaining rules in chronological order (history is newest-first)
        const allRules = [...next].reverse().flatMap((entry) => entry.rules);
        const replayed = replayRules(rawData, allRules);
        setDataState(replayed);
        return next;
      });
    },
    [rawData]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    setDataState(rawData);
  }, [rawData]);

  const resetData = useCallback(() => {
    setDataState(rawData);
    setHistory([]);
  }, [rawData]);

  const exportCsvData = useCallback(() => exportCsv(data), [data]);
  const exportXlsxData = useCallback(() => exportXlsx(data), [data]);

  const value = useMemo(
    () => ({
      data,
      rawData,
      profile,
      history,
      fileInfo,
      setData,
      applyHomologation,
      applyHomologationBatch,
      clearHistory,
      resetData,
      removeHomologation,
      exportCsvData,
      exportXlsxData
    }),
    [
      data,
      rawData,
      profile,
      history,
      fileInfo,
      setData,
      applyHomologation,
      applyHomologationBatch,
      clearHistory,
      resetData,
      removeHomologation,
      exportCsvData,
      exportXlsxData
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("DataContext is missing");
  }
  return ctx;
}
