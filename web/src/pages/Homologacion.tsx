import { useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";

import AuditLog from "../components/AuditLog";
import DataSummary from "../components/DataSummary";
import DataTable from "../components/DataTable";
import DataUpload from "../components/DataUpload";
import {
  buildBasicNormalizationRules,
  buildSuggestions,
  detectHomologationCandidates,
  MappingSuggestion
} from "../lib/homologationEngine";
import { CaseMode, filterRecords, getUniqueValues } from "../lib/dataUtils";
import { useDataContext } from "../store/DataContext";

const MANUAL_VALUE = "__manual__";

interface ColumnRule {
  id: string;
  fromValue: string;
  toValue: string;
  enabled: boolean;
}

type RulesByColumn = Record<string, ColumnRule[]>;

export default function Homologacion() {
  const {
    data,
    profile,
    applyHomologation,
    applyHomologationBatch,
    exportCsvData,
    exportXlsxData,
    resetData
  } = useDataContext();
  const [selectedColumn, setSelectedColumn] = useState("");
  const [valueSearch, setValueSearch] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [targetSelection, setTargetSelection] = useState(MANUAL_VALUE);
  const [manualValue, setManualValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [filterColumn, setFilterColumn] = useState("");
  const [filterValues, setFilterValues] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");

  const [caseMode, setCaseMode] = useState<CaseMode>("titulo");
  const [removeAccents, setRemoveAccents] = useState(true);
  const [collapseSpaces, setCollapseSpaces] = useState(true);
  const [applyCommonRules, setApplyCommonRules] = useState(true);
  const [applyAllColumns, setApplyAllColumns] = useState(false);
  const [fuzzyThreshold, setFuzzyThreshold] = useState(0.88);
  const [rareThreshold, setRareThreshold] = useState(3);

  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);

  const [dictionary, setDictionary] = useState<RulesByColumn>({});
  const [newRuleFrom, setNewRuleFrom] = useState("");
  const [newRuleTo, setNewRuleTo] = useState("");

  useEffect(() => {
    if (profile && (!selectedColumn || !profile.columns.includes(selectedColumn))) {
      setSelectedColumn(profile.columns[0] ?? "");
    }
    if (profile && (!filterColumn || !profile.columns.includes(filterColumn))) {
      setFilterColumn(profile.columns[0] ?? "");
    }
  }, [profile, selectedColumn, filterColumn]);

  useEffect(() => {
    setSelectedValues([]);
    setTargetSelection(MANUAL_VALUE);
    setManualValue("");
  }, [selectedColumn]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gencla_rules_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as RulesByColumn;
        setDictionary(parsed);
      }
    } catch {
      setDictionary({});
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gencla_rules_v1", JSON.stringify(dictionary));
    } catch {
      // ignore storage errors
    }
  }, [dictionary]);

  useEffect(() => {
    if (!selectedColumn) {
      setSuggestions([]);
      setSelectedSuggestionIds([]);
      return;
    }
    const list = buildSuggestions(data, selectedColumn, {
      normalizeOptions: {
        trim: true,
        collapseSpaces,
        removeAccents,
        caseMode: "minusculas",
        keepPunctuation: false
      },
      fuzzyThreshold,
      rareThreshold
    });
    setSuggestions(list);
    const safeIds = list
      .filter((item) => item.reason === "normalization" || item.reason === "common")
      .map((item) => item.id);
    setSelectedSuggestionIds(safeIds);
  }, [data, selectedColumn, collapseSpaces, removeAccents, caseMode, fuzzyThreshold, rareThreshold]);

  const uniqueValues = useMemo(() => {
    if (!selectedColumn) {
      return [];
    }
    return getUniqueValues(data, selectedColumn);
  }, [data, selectedColumn]);

  const filteredValues = useMemo(() => {
    if (!valueSearch) {
      return uniqueValues;
    }
    const lower = valueSearch.toLowerCase();
    return uniqueValues.filter((value) => value.toLowerCase().includes(lower));
  }, [uniqueValues, valueSearch]);

  const filterOptions = useMemo(() => {
    if (!filterColumn) {
      return [];
    }
    return getUniqueValues(data, filterColumn);
  }, [data, filterColumn]);

  const filteredFilterOptions = useMemo(() => {
    if (!filterSearch) {
      return filterOptions;
    }
    const lower = filterSearch.toLowerCase();
    return filterOptions.filter((value) => value.toLowerCase().includes(lower));
  }, [filterOptions, filterSearch]);

  const filteredRecords = useMemo(() => {
    if (!filterColumn || filterValues.length === 0) {
      return data;
    }
    return filterRecords(data, { [filterColumn]: filterValues });
  }, [data, filterColumn, filterValues]);

  const candidateColumns = useMemo(() => {
    if (!profile) {
      return [];
    }
    return detectHomologationCandidates(data, profile.columns);
  }, [data, profile]);

  const handleApply = () => {
    setError(null);
    if (!selectedColumn) {
      setError("Selecciona una columna para homologar.");
      return;
    }
    if (selectedValues.length === 0) {
      setError("Selecciona al menos un valor origen.");
      return;
    }
    const targetValue = targetSelection === MANUAL_VALUE ? manualValue.trim() : targetSelection;
    if (!targetValue) {
      setError("Define el valor final de homologacion.");
      return;
    }
    applyHomologation(selectedColumn, selectedValues, targetValue);
  };

  const handleDownload = () => {
    const csv = exportCsvData();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, "datos_homologados.csv");
  };

  const handleDownloadXlsx = () => {
    const blob = exportXlsxData();
    saveAs(blob, "datos_homologados.xlsx");
  };

  const handleApplyBasic = () => {
    if (!profile) {
      return;
    }
    const columns = applyAllColumns ? profile.columns : selectedColumn ? [selectedColumn] : [];
    if (columns.length === 0) {
      return;
    }
    const rules = columns.flatMap((column) =>
      buildBasicNormalizationRules(data, column, {
        trim: true,
        collapseSpaces,
        removeAccents,
        caseMode,
        applyCommonRules
      })
    );
    applyHomologationBatch(rules);
  };

  const handleApplySuggestions = () => {
    const selected = suggestions.filter((item) => selectedSuggestionIds.includes(item.id));
    const rules = selected.map((item) => ({
      column: item.column,
      fromValues: item.fromValues,
      toValue: item.toValue,
      reason: item.reason,
      score: item.score
    }));
    applyHomologationBatch(rules);
  };

  const handleApplyDictionary = () => {
    if (!selectedColumn) {
      return;
    }
    const rules = (dictionary[selectedColumn] ?? [])
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        column: selectedColumn,
        fromValues: [rule.fromValue],
        toValue: rule.toValue,
        reason: "custom"
      }));
    applyHomologationBatch(rules);
  };

  const addDictionaryRule = () => {
    if (!selectedColumn || !newRuleFrom.trim() || !newRuleTo.trim()) {
      return;
    }
    const nextRule: ColumnRule = {
      id: nanoid(),
      fromValue: newRuleFrom.trim(),
      toValue: newRuleTo.trim(),
      enabled: true
    };
    setDictionary((prev) => ({
      ...prev,
      [selectedColumn]: [...(prev[selectedColumn] ?? []), nextRule]
    }));
    setNewRuleFrom("");
    setNewRuleTo("");
  };

  const toggleDictionaryRule = (ruleId: string) => {
    setDictionary((prev) => ({
      ...prev,
      [selectedColumn]: (prev[selectedColumn] ?? []).map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    }));
  };

  const removeDictionaryRule = (ruleId: string) => {
    setDictionary((prev) => ({
      ...prev,
      [selectedColumn]: (prev[selectedColumn] ?? []).filter((rule) => rule.id !== ruleId)
    }));
  };

  return (
    <div className="section">
      <div className="hero">
        <span className="tag">Modulo de homologacion</span>
        <h2>Normaliza y documenta tu dataset</h2>
        <p>
          Homologa valores por columna, verifica el impacto y conserva un historial
          de cambios para trazabilidad academica.
        </p>
      </div>

      <DataUpload />
      <DataSummary />

      {!profile ? (
        <div className="card">
          <p>Sube un dataset para comenzar la homologacion.</p>
        </div>
      ) : (
        <div className="section">
          <div className="card">
            <div className="section-title">
              <h3>Automatizacion de homologacion</h3>
              <span className="tag">Modo mixto</span>
            </div>
            {candidateColumns.length > 0 && (
              <div className="section">
                <strong>Columnas sugeridas</strong>
                <div className="chips">
                  {candidateColumns.map((candidate) => (
                    <button
                      key={candidate.column}
                      type="button"
                      className="chip"
                      onClick={() => setSelectedColumn(candidate.column)}
                    >
                      {candidate.column} (-{candidate.reductionPct.toFixed(0)}%)
                    </button>
                  ))}
                </div>
              </div>
            )}

            <details className="details" open>
              <summary>Normalizacion basica y reglas comunes</summary>
              <div className="controls" style={{ marginTop: "12px" }}>
                <div className="field">
                  <label>Modo de texto</label>
                  <select value={caseMode} onChange={(event) => setCaseMode(event.target.value as CaseMode)}>
                    <option value="mantener">Mantener</option>
                    <option value="mayusculas">Mayusculas</option>
                    <option value="minusculas">Minusculas</option>
                    <option value="titulo">Titulo</option>
                  </select>
                </div>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={collapseSpaces}
                    onChange={(event) => setCollapseSpaces(event.target.checked)}
                  />
                  Unificar espacios
                </label>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={removeAccents}
                    onChange={(event) => setRemoveAccents(event.target.checked)}
                  />
                  Quitar tildes
                </label>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={applyCommonRules}
                    onChange={(event) => setApplyCommonRules(event.target.checked)}
                  />
                  Aplicar reglas comunes (Si/No, Activo/Inactivo, Genero)
                </label>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={applyAllColumns}
                    onChange={(event) => setApplyAllColumns(event.target.checked)}
                  />
                  Aplicar a todas las columnas
                </label>
                <div className="panel-actions">
                  <button className="btn btn-primary" type="button" onClick={handleApplyBasic}>
                    Aplicar normalizacion basica
                  </button>
                  <span className="muted">Se aplican cambios seguros y trazables.</span>
                </div>
              </div>
            </details>

            <details className="details">
              <summary>Sugerencias avanzadas (fuzzy + Otros)</summary>
              <div className="controls" style={{ marginTop: "12px" }}>
                <div className="field">
                  <label>Umbral fuzzy (0.80 - 0.95)</label>
                  <input
                    type="number"
                    min={0.8}
                    max={0.95}
                    step={0.01}
                    value={fuzzyThreshold}
                    onChange={(event) => setFuzzyThreshold(Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Umbral para Otros (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    step={0.5}
                    value={rareThreshold}
                    onChange={(event) => setRareThreshold(Number(event.target.value))}
                  />
                </div>
                <div className="panel-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() =>
                      setSelectedSuggestionIds(
                        suggestions
                          .filter((item) => item.reason === "normalization" || item.reason === "common")
                          .map((item) => item.id)
                      )
                    }
                  >
                    Seleccionar basicas
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setSelectedSuggestionIds([])}>
                    Limpiar seleccion
                  </button>
                  <button className="btn btn-primary" type="button" onClick={handleApplySuggestions}>
                    Aplicar seleccionadas
                  </button>
                </div>
                {suggestions.length === 0 ? (
                  <p className="muted">No hay sugerencias para esta columna.</p>
                ) : (
                  <div className="controls">
                    {suggestions.map((item) => (
                      <label key={item.id} className="card" style={{ cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <input
                            type="checkbox"
                            checked={selectedSuggestionIds.includes(item.id)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedSuggestionIds((prev) =>
                                checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                              );
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <strong>
                              {item.fromValues.slice(0, 4).join(", ")}
                              {item.fromValues.length > 4 ? "..." : ""} → {item.toValue}
                            </strong>
                            <p className="muted">{item.affectedRows.toLocaleString()} filas afectadas</p>
                          </div>
                          <div className="chips">
                            <span className="chip">{item.reason}</span>
                            <span className="chip">{Math.round(item.score * 100)}%</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </details>

            <details className="details">
              <summary>Diccionario por columna</summary>
              <div className="controls" style={{ marginTop: "12px" }}>
                <div className="field">
                  <label>Agregar regla</label>
                  <input
                    type="text"
                    placeholder="Desde"
                    value={newRuleFrom}
                    onChange={(event) => setNewRuleFrom(event.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Hacia"
                    value={newRuleTo}
                    onChange={(event) => setNewRuleTo(event.target.value)}
                  />
                  <button className="btn btn-secondary" type="button" onClick={addDictionaryRule}>
                    Guardar regla
                  </button>
                </div>
                {(dictionary[selectedColumn] ?? []).length === 0 ? (
                  <p className="muted">No hay reglas guardadas para esta columna.</p>
                ) : (
                  <div className="controls">
                    {(dictionary[selectedColumn] ?? []).map((rule) => (
                      <div key={rule.id} className="card">
                        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => toggleDictionaryRule(rule.id)}
                          />
                          {rule.fromValue} → {rule.toValue}
                        </label>
                        <button className="btn btn-ghost" type="button" onClick={() => removeDictionaryRule(rule.id)}>
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-primary" type="button" onClick={handleApplyDictionary}>
                  Aplicar diccionario
                </button>
              </div>
            </details>
          </div>

          <div className="card">
            <div className="section-title">
              <h3>Vista previa</h3>
              <button className="btn btn-ghost" type="button" onClick={resetData}>
                Restaurar dataset
              </button>
            </div>
            <DataTable
              records={data}
              columns={profile.columns}
              maxRows={12}
              pageSize={12}
              ariaLabel="Vista previa del dataset"
            />
          </div>

          <div className="split">
            <div className="card">
              <h3>Configuracion de homologacion</h3>
              <div className="controls">
                <div className="field">
                  <label>Columna a homologar</label>
                  <select value={selectedColumn} onChange={(event) => setSelectedColumn(event.target.value)}>
                    {profile.columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Buscar valores</label>
                  <input
                    type="text"
                    value={valueSearch}
                    onChange={(event) => setValueSearch(event.target.value)}
                    placeholder="Filtrar valores"
                  />
                </div>
                <div className="field">
                  <label>Valores origen</label>
                  <select
                    multiple
                    size={Math.min(8, filteredValues.length || 8)}
                    value={selectedValues}
                    onChange={(event) => {
                      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                      setSelectedValues(values);
                    }}
                  >
                    {filteredValues.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  {selectedValues.length > 0 && (
                    <div className="chips" aria-live="polite">
                      {selectedValues.map((value) => (
                        <span className="chip" key={`chip-${value}`}>
                          {value}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedValues.length > 0 && (
                    <button className="btn btn-ghost" type="button" onClick={() => setSelectedValues([])}>
                      Limpiar seleccion
                    </button>
                  )}
                </div>
                <div className="field">
                  <label>Valor final</label>
                  <select
                    value={targetSelection}
                    onChange={(event) => setTargetSelection(event.target.value)}
                  >
                    <option value={MANUAL_VALUE}>Escribir manualmente</option>
                    {uniqueValues.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                {targetSelection === MANUAL_VALUE && (
                  <div className="field">
                    <label>Nuevo valor</label>
                    <input
                      type="text"
                      value={manualValue}
                      onChange={(event) => setManualValue(event.target.value)}
                      placeholder="Nuevo valor homologado"
                    />
                  </div>
                )}
                {error && (
                  <p style={{ color: "#b91c1c" }} role="alert">
                    {error}
                  </p>
                )}
                <button className="btn btn-primary" type="button" onClick={handleApply}>
                  Aplicar homologacion
                </button>
              </div>
            </div>

            <div className="card">
              <h3>Verificacion y descarga</h3>
              <p className="notice">
                Aplica filtros para validar el resultado de la homologacion antes de exportar.
              </p>
              <div className="controls">
                <div className="field">
                  <label>Columna de filtro</label>
                  <select value={filterColumn} onChange={(event) => setFilterColumn(event.target.value)}>
                    {profile.columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Buscar valores de filtro</label>
                  <input
                    type="search"
                    value={filterSearch}
                    onChange={(event) => setFilterSearch(event.target.value)}
                    placeholder="Filtrar opciones"
                  />
                </div>
                <div className="field">
                  <label>Valores visibles</label>
                  <select
                    multiple
                    size={Math.min(6, filteredFilterOptions.length || 6)}
                    value={filterValues}
                    onChange={(event) => {
                      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                      setFilterValues(values);
                    }}
                  >
                    {filteredFilterOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="panel-actions">
                  <button className="btn btn-secondary" type="button" onClick={handleDownload}>
                    Descargar CSV
                  </button>
                  <button className="btn btn-primary" type="button" onClick={handleDownloadXlsx}>
                    Descargar Excel
                  </button>
                </div>
              </div>
              <p className="muted">
                Mostrando {filteredRecords.length.toLocaleString()} filas de {data.length.toLocaleString()}.
              </p>
              <DataTable
                records={filteredRecords}
                columns={profile.columns}
                maxRows={10}
                pageSize={10}
                ariaLabel="Resultados filtrados"
              />
            </div>
          </div>

          <AuditLog />
        </div>
      )}
    </div>
  );
}
