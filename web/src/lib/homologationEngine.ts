import { distance } from "fastest-levenshtein";

import { MappingRule, DataRecord } from "./dataTypes";
import { normalizeText, normalizeValue, TextNormalizeOptions } from "./dataUtils";

export type SuggestionReason = "normalization" | "common" | "fuzzy" | "rare";

export interface MappingSuggestion extends MappingRule {
  id: string;
  reason: SuggestionReason;
  score: number;
  affectedRows: number;
}

export interface HomologationCandidate {
  column: string;
  rawUnique: number;
  normalizedUnique: number;
  reductionPct: number;
  sampleValues: string[];
}

export interface BasicNormalizationOptions extends TextNormalizeOptions {
  applyCommonRules?: boolean;
}

const COMMON_RULES: Array<{
  name: string;
  canonical: Record<string, string[]>;
}> = [
  {
    name: "si_no",
    canonical: {
      Si: ["si", "s", "yes", "y", "true", "1"],
      No: ["no", "n", "false", "0"]
    }
  },
  {
    name: "activo_inactivo",
    canonical: {
      Activo: ["activo", "activa", "vigente", "habilitado", "operativo"],
      Inactivo: ["inactivo", "inactiva", "no vigente", "deshabilitado", "suspendido"]
    }
  },
  {
    name: "genero",
    canonical: {
      Masculino: ["m", "masculino", "hombre", "varon"],
      Femenino: ["f", "femenino", "mujer"]
    }
  }
];

export function detectHomologationCandidates(
  records: DataRecord[],
  columns: string[],
  options: TextNormalizeOptions = {}
): HomologationCandidate[] {
  const normalizeOptions: TextNormalizeOptions = {
    trim: true,
    collapseSpaces: true,
    removeAccents: true,
    caseMode: "minusculas",
    keepPunctuation: false,
    ...options
  };

  return columns
    .map((column) => {
      const rawValues = new Set<string>();
      const normalizedValues = new Set<string>();
      const sampleValues: string[] = [];
      records.forEach((row) => {
        const raw = normalizeValue(row[column]);
        if (raw === "Sin dato") {
          return;
        }
        rawValues.add(raw);
        if (sampleValues.length < 4 && !sampleValues.includes(raw)) {
          sampleValues.push(raw);
        }
        const normalized = normalizeText(raw, normalizeOptions);
        if (normalized.length > 0) {
          normalizedValues.add(normalized);
        }
      });
      const rawUnique = rawValues.size;
      const normalizedUnique = normalizedValues.size;
      const reductionPct = rawUnique > 0 ? (1 - normalizedUnique / rawUnique) * 100 : 0;
      return {
        column,
        rawUnique,
        normalizedUnique,
        reductionPct,
        sampleValues
      };
    })
    .filter((candidate) => candidate.rawUnique >= 6 && candidate.reductionPct >= 10)
    .sort((a, b) => b.reductionPct - a.reductionPct)
    .slice(0, 8);
}

export function buildBasicNormalizationRules(
  records: DataRecord[],
  column: string,
  options: BasicNormalizationOptions
): MappingRule[] {
  const normalizeOptions: TextNormalizeOptions = {
    trim: true,
    collapseSpaces: true,
    removeAccents: false,
    caseMode: "mantener",
    keepPunctuation: true,
    ...options
  };
  const counts = buildValueCounts(records, column);
  const rules: MappingRule[] = [];

  counts.forEach((count, rawValue) => {
    const cleaned = normalizeText(rawValue, normalizeOptions);
    if (cleaned && cleaned !== rawValue) {
      rules.push({
        column,
        fromValues: [rawValue],
        toValue: cleaned,
        reason: "normalization",
        score: 0.95
      });
    }
  });

  if (options.applyCommonRules) {
    rules.push(...buildCommonRules(records, column));
  }

  return mergeRules(rules);
}

export function buildSuggestions(
  records: DataRecord[],
  column: string,
  options: {
    normalizeOptions?: TextNormalizeOptions;
    fuzzyThreshold?: number;
    rareThreshold?: number;
  } = {}
): MappingSuggestion[] {
  const normalizeOptions: TextNormalizeOptions = {
    trim: true,
    collapseSpaces: true,
    removeAccents: true,
    caseMode: "minusculas",
    keepPunctuation: false,
    ...options.normalizeOptions
  };

  const suggestions: MappingSuggestion[] = [];
  suggestions.push(...buildNormalizationSuggestions(records, column, normalizeOptions));
  suggestions.push(...buildCommonSuggestions(records, column));
  suggestions.push(...buildFuzzySuggestions(records, column, options.fuzzyThreshold ?? 0.88));
  if (options.rareThreshold) {
    const rare = buildRareGrouping(records, column, options.rareThreshold);
    if (rare) {
      suggestions.push(rare);
    }
  }
  return suggestions;
}

function buildNormalizationSuggestions(
  records: DataRecord[],
  column: string,
  normalizeOptions: TextNormalizeOptions
): MappingSuggestion[] {
  const counts = buildValueCounts(records, column);
  const groups = new Map<string, Array<{ value: string; count: number }>>();

  counts.forEach((count, rawValue) => {
    const key = normalizeText(rawValue, normalizeOptions);
    if (!key) {
      return;
    }
    const group = groups.get(key) ?? [];
    group.push({ value: rawValue, count });
    groups.set(key, group);
  });

  const suggestions: MappingSuggestion[] = [];
  groups.forEach((group) => {
    if (group.length <= 1) {
      return;
    }
    const canonical = group.reduce((best, entry) => (entry.count > best.count ? entry : best), group[0]);
    const fromValues = group
      .filter((entry) => entry.value !== canonical.value)
      .map((entry) => entry.value);
    if (fromValues.length === 0) {
      return;
    }
    const affected = fromValues.reduce((sum, value) => sum + (counts.get(value) ?? 0), 0);
    suggestions.push({
      id: `${column}-norm-${canonical.value}`,
      column,
      fromValues,
      toValue: canonical.value,
      reason: "normalization",
      score: 0.95,
      affectedRows: affected
    });
  });
  return suggestions;
}

function buildCommonSuggestions(records: DataRecord[], column: string): MappingSuggestion[] {
  const rules = buildCommonRules(records, column);
  const counts = buildValueCounts(records, column);

  return rules.map((rule, index) => {
    const affected = rule.fromValues.reduce((sum, value) => sum + (counts.get(value) ?? 0), 0);
    return {
      id: `${column}-common-${index}`,
      column,
      fromValues: rule.fromValues,
      toValue: rule.toValue,
      reason: "common",
      score: 0.9,
      affectedRows: affected
    };
  });
}

function buildCommonRules(records: DataRecord[], column: string): MappingRule[] {
  const counts = buildValueCounts(records, column);
  const normalizedToOriginals = new Map<string, string[]>();
  counts.forEach((count, value) => {
    const normalized = normalizeText(value, {
      trim: true,
      collapseSpaces: true,
      removeAccents: true,
      caseMode: "minusculas",
      keepPunctuation: false
    });
    const current = normalizedToOriginals.get(normalized) ?? [];
    current.push(value);
    normalizedToOriginals.set(normalized, current);
  });

  const rules: MappingRule[] = [];
  COMMON_RULES.forEach((rule) => {
    const allSynonyms = Object.values(rule.canonical).flat();
    const normalizedUnique = Array.from(normalizedToOriginals.keys());
    const isSubset = normalizedUnique.every((value) => allSynonyms.includes(value));
    if (!isSubset) {
      return;
    }
    Object.entries(rule.canonical).forEach(([canonical, synonyms]) => {
      const fromValues = synonyms
        .flatMap((syn) => normalizedToOriginals.get(syn) ?? [])
        .filter((value) => value !== canonical);
      if (fromValues.length > 0) {
        rules.push({
          column,
          fromValues,
          toValue: canonical,
          reason: "common",
          score: 0.9
        });
      }
    });
  });
  return rules;
}

function buildFuzzySuggestions(records: DataRecord[], column: string, threshold: number): MappingSuggestion[] {
  const counts = buildValueCounts(records, column);
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const limit = Math.min(entries.length, 120);
  const suggestions: MappingSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < limit; i += 1) {
    const [valueA, countA] = entries[i];
    const normA = normalizeText(valueA, {
      trim: true,
      collapseSpaces: true,
      removeAccents: true,
      caseMode: "minusculas",
      keepPunctuation: false
    });
    for (let j = i + 1; j < limit; j += 1) {
      const [valueB, countB] = entries[j];
      const normB = normalizeText(valueB, {
        trim: true,
        collapseSpaces: true,
        removeAccents: true,
        caseMode: "minusculas",
        keepPunctuation: false
      });
      if (!normA || !normB) {
        continue;
      }
      if (normA[0] !== normB[0] || Math.abs(normA.length - normB.length) > 4) {
        continue;
      }
      const dist = distance(normA, normB);
      const similarity = 1 - dist / Math.max(normA.length, normB.length);
      if (similarity < threshold) {
        continue;
      }
      const [target, source, sourceCount] = countA >= countB
        ? [valueA, valueB, countB]
        : [valueB, valueA, countA];
      const key = `${source}=>${target}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push({
        id: `${column}-fuzzy-${suggestions.length}`,
        column,
        fromValues: [source],
        toValue: target,
        reason: "fuzzy",
        score: similarity,
        affectedRows: sourceCount
      });
    }
  }
  return suggestions;
}

function buildRareGrouping(
  records: DataRecord[],
  column: string,
  thresholdPct: number
): MappingSuggestion | null {
  const counts = buildValueCounts(records, column);
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return null;
  }
  const fromValues = Array.from(counts.entries())
    .filter(([, count]) => (count / total) * 100 < thresholdPct)
    .map(([value]) => value);
  if (fromValues.length < 2) {
    return null;
  }
  const affected = fromValues.reduce((sum, value) => sum + (counts.get(value) ?? 0), 0);
  return {
    id: `${column}-rare-otros`,
    column,
    fromValues,
    toValue: "Otros",
    reason: "rare",
    score: 0.7,
    affectedRows: affected
  };
}

function buildValueCounts(records: DataRecord[], column: string): Map<string, number> {
  const counts = new Map<string, number>();
  records.forEach((row) => {
    const value = normalizeValue(row[column]);
    if (value === "Sin dato") {
      return;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return counts;
}

function mergeRules(rules: MappingRule[]): MappingRule[] {
  const map = new Map<string, MappingRule>();
  rules.forEach((rule) => {
    const key = `${rule.column}|${rule.fromValues.join("|")}|${rule.toValue}`;
    if (!map.has(key)) {
      map.set(key, rule);
    }
  });
  return Array.from(map.values());
}
