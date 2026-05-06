import { DataValue } from "./dataTypes";

export type TimeLevel =
  | "Sin transformacion"
  | "Ano"
  | "Trimestre"
  | "Mes"
  | "Ano-Mes"
  | "Semana"
  | "Dia";

export interface TimeLabel {
  label: string;
  sortKey?: string;
  isTime: boolean;
}

export function buildTimeLabel(value: DataValue, level: TimeLevel): TimeLabel {
  if (level === "Sin transformacion") {
    return { label: valueToText(value), isTime: false };
  }
  const date = parseDate(value);
  if (!date) {
    return { label: "Sin dato", isTime: true };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  switch (level) {
    case "Ano":
      return { label: String(year), sortKey: String(year), isTime: true };
    case "Trimestre": {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return {
        label: `${year}-T${quarter}`,
        sortKey: `${year}-${String(quarter).padStart(2, "0")}`,
        isTime: true
      };
    }
    case "Mes":
      return { label: month, sortKey: month, isTime: true };
    case "Ano-Mes":
      return { label: `${year}-${month}`, sortKey: `${year}-${month}`, isTime: true };
    case "Semana": {
      const { week, weekYear } = getIsoWeek(date);
      return {
        label: `${weekYear}-W${String(week).padStart(2, "0")}`,
        sortKey: `${weekYear}-${String(week).padStart(2, "0")}`,
        isTime: true
      };
    }
    case "Dia":
      return { label: `${year}-${month}-${day}`, sortKey: `${year}-${month}-${day}`, isTime: true };
    default:
      return { label: valueToText(value), isTime: false };
  }
}

function valueToText(value: DataValue): string {
  if (value === null || value === undefined) {
    return "Sin dato";
  }
  const text = String(value).trim();
  return text.length > 0 ? text : "Sin dato";
}

function parseDate(value: DataValue): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getIsoWeek(date: Date): { week: number; weekYear: number } {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const weekYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, weekYear };
}
