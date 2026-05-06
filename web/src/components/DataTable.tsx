import { useEffect, useId, useMemo, useState } from "react";

import { normalizeValue } from "../lib/dataUtils";
import { DataRecord, DataValue } from "../lib/dataTypes";

/** Formats a cell value for display. Dates are shown as locale date strings. */
function formatCellValue(value: DataValue): string {
  if (value === null || value === undefined) return "Sin dato";
  // JS Date object (e.g. from Excel parser)
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Sin dato" : value.toLocaleDateString("es-CL");
  }
  // ISO-8601 string that looks like a timestamp (e.g. "2024-01-15T03:00:00.000Z")
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-CL");
  }
  const text = String(value).trim();
  return text.length > 0 ? text : "Sin dato";
}

interface DataTableProps {
  records: DataRecord[];
  columns: string[];
  maxRows?: number;
  enableSearch?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
  ariaLabel?: string;
}

export default function DataTable({
  records,
  columns,
  maxRows = 20,
  enableSearch = true,
  enablePagination = true,
  pageSize,
  ariaLabel = "Tabla de datos"
}: DataTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const searchId = useId();

  useEffect(() => {
    setPage(1);
  }, [records, columns, query]);

  if (records.length === 0 || columns.length === 0) {
    return <p>No hay datos para mostrar.</p>;
  }

  const filtered = useMemo(() => {
    if (!enableSearch || query.trim().length === 0) {
      return records;
    }
    const lower = query.toLowerCase();
    return records.filter((row) =>
      columns.some((column) => normalizeValue(row[column]).toLowerCase().includes(lower))
    );
  }, [records, columns, enableSearch, query]);

  const sorted = useMemo(() => {
    if (!sortKey) {
      return filtered;
    }
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === "number" && typeof right === "number") {
        return sortDirection === "asc" ? left - right : right - left;
      }
      const leftText = normalizeValue(left);
      const rightText = normalizeValue(right);
      return sortDirection === "asc"
        ? leftText.localeCompare(rightText)
        : rightText.localeCompare(leftText);
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const effectivePageSize = pageSize ?? maxRows;
  const totalPages = enablePagination ? Math.max(1, Math.ceil(sorted.length / effectivePageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const startIndex = enablePagination ? (currentPage - 1) * effectivePageSize : 0;
  const endIndex = enablePagination ? startIndex + effectivePageSize : maxRows;
  const rows = sorted.slice(startIndex, enablePagination ? endIndex : endIndex);

  const handleSort = (column: string) => {
    if (sortKey === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column);
      setSortDirection("asc");
    }
  };

  const ariaSort = (column: string): "none" | "ascending" | "descending" => {
    if (sortKey !== column) {
      return "none";
    }
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  return (
    <div className="table-wrap">
      <div className="table-controls">
        {enableSearch && (
          <div className="field">
            <label htmlFor={searchId}>Buscar en la tabla</label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Buscar por cualquier columna"
            />
          </div>
        )}
        <span className="badge" role="status" aria-live="polite">
          {sorted.length.toLocaleString()} registros
        </span>
      </div>
      <table className="table" aria-label={ariaLabel}>
        <caption className="sr-only">{ariaLabel}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} aria-sort={ariaSort(column)}>
                <button
                  type="button"
                  className="sort-button"
                  onClick={() => handleSort(column)}
                >
                  {column}
                  {sortKey === column && (
                    <span aria-hidden="true">{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`}>
              {columns.map((column) => (
                <td key={`${column}-${index}`}>{formatCellValue(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {enablePagination && totalPages > 1 && (
        <div className="pagination" role="navigation" aria-label="Paginacion de tabla">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </button>
          <span className="tag">
            Pagina {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
