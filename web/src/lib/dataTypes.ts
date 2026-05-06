export type DataValue = string | number | null;

export type DataRecord = Record<string, DataValue>;

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  rows: number;
  updatedAt: string;
}

export interface DataProfile {
  columns: string[];
  numericColumns: string[];
  dateColumns: string[];
  rowCount: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  column: string;
  fromValues: string[];
  toValue: string;
  affectedRows: number;
  rules: MappingRule[]; // stored so we can replay or remove individually
}

export interface MappingRule {
  id?: string;
  column: string;
  fromValues: string[];
  toValue: string;
  reason?: string;
  score?: number;
}
