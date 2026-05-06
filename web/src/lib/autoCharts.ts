import { DataProfile, DataRecord } from "./dataTypes";
import { aggregateBy, buildBoxplot, buildHeatmap, buildScatter, Metric } from "./chartUtils";
import { buildColumnStats } from "./dataUtils";
import { getPalette } from "./chartPalettes";
import { applyChartTheme, ChartTheme } from "./chartTheme";
import { TimeLevel } from "./timeUtils";

export type AutoChartType =
  | "Barras"
  | "Lineas"
  | "Area"
  | "Pie"
  | "Dona"
  | "Pareto"
  | "Histograma"
  | "Dispersion"
  | "Heatmap"
  | "Boxplot";

export interface AutoChartConfig {
  id: string;
  title: string;
  chartType: AutoChartType;
  rowField?: string;
  colField?: string;         // for heatmap
  rowTimeLevel?: TimeLevel;
  metric: Metric;
  valueColumn?: string;
  topN?: number;
  groupOthers?: boolean;
  groupThreshold?: number;
  xKey?: string;
  yKey?: string;
  reason: string;
  icon: string;
}

export interface AutoChartView {
  config: AutoChartConfig;
  option: any;
  insights: string[];
  table?: Record<string, string | number>[];
}

interface AutoChartBuildOptions {
  palette?: string[];
  theme?: ChartTheme;
}

// Clinical-domain keyword detection
const CLINICAL_KEYWORDS = {
  establishment: ["establecimiento", "hospital", "clinica", "cesfam", "aps", "centro", "unidad"],
  equipment: ["equipo", "equipamiento", "dispositivo", "marca", "modelo", "tipo_equipo"],
  status: ["estado", "condicion", "funcional", "activo", "operativo", "baja"],
  service: ["servicio", "area", "departamento", "unidad", "seccion"],
  date: ["fecha", "date", "ingreso", "egreso", "alta", "atencion"],
  numeric: ["costo", "precio", "valor", "cantidad", "n_", "num_", "anos", "dias"]
};

function columnMatchesDomain(col: string, keywords: string[]): boolean {
  const lower = col.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function recommendAutoCharts(
  records: DataRecord[],
  profile: DataProfile,
  limit = 6
): AutoChartConfig[] {
  const stats = buildColumnStats(records, profile.columns);
  const categorical = stats.filter((s) => !profile.numericColumns.includes(s.column));
  const sortedLowCard = [...categorical].sort((a, b) => a.uniqueCount - b.uniqueCount);
  const sortedHighCard = [...categorical].sort((a, b) => b.uniqueCount - a.uniqueCount);
  const charts: AutoChartConfig[] = [];

  const timeColumn = profile.dateColumns[0];
  const numericPrimary = profile.numericColumns[0];
  const numericSecondary = profile.numericColumns[1];

  // 1. Temporal trend
  if (timeColumn) {
    charts.push({
      id: "auto-time",
      title: `Tendencia en el tiempo`,
      chartType: "Lineas",
      rowField: timeColumn,
      rowTimeLevel: "Ano-Mes",
      metric: numericPrimary ? "Suma" : "Conteo",
      valueColumn: numericPrimary,
      topN: 24,
      reason: `Columna temporal detectada: "${timeColumn}"`,
      icon: ""
    });
  }

  // 2. Scatter for two numeric columns
  if (numericPrimary && numericSecondary) {
    charts.push({
      id: "auto-scatter",
      title: `Correlación: ${numericPrimary} vs ${numericSecondary}`,
      chartType: "Dispersion",
      metric: "Conteo",
      xKey: numericPrimary,
      yKey: numericSecondary,
      reason: "Dos variables numéricas — analiza su correlación",
      icon: ""
    });
  }

  // 3. Clinical priority: establishment or service distribution
  const clinicalCat =
    sortedHighCard.find((s) => columnMatchesDomain(s.column, CLINICAL_KEYWORDS.establishment)) ||
    sortedHighCard.find((s) => columnMatchesDomain(s.column, CLINICAL_KEYWORDS.service)) ||
    sortedHighCard.find((s) => s.uniqueCount >= 10);

  if (clinicalCat) {
    charts.push({
      id: "auto-pareto",
      title: `Pareto: ${clinicalCat.column}`,
      chartType: "Pareto",
      rowField: clinicalCat.column,
      metric: "Conteo",
      topN: 15,
      reason: `Análisis 80/20 de "${clinicalCat.column}" — identifica los principales contribuyentes`,
      icon: ""
    });
  }

  // 4. Equipment or status donut
  const statusCat =
    sortedLowCard.find((s) => columnMatchesDomain(s.column, CLINICAL_KEYWORDS.status)) ||
    sortedLowCard.find((s) => columnMatchesDomain(s.column, CLINICAL_KEYWORDS.equipment)) ||
    sortedLowCard.find((s) => s.uniqueCount >= 2 && s.uniqueCount <= 8);

  if (statusCat) {
    charts.push({
      id: "auto-donut",
      title: `Distribución: ${statusCat.column}`,
      chartType: statusCat.uniqueCount <= 5 ? "Dona" : "Barras",
      rowField: statusCat.column,
      metric: "Conteo",
      topN: 10,
      groupOthers: statusCat.uniqueCount > 7,
      groupThreshold: 3,
      reason: `Proporción de categorías de "${statusCat.column}"`,
      icon: ""
    });
  }

  // 5. Heatmap: cross two high-cardinality categorical columns
  const heatRows = sortedHighCard.find((s) => s.uniqueCount >= 4 && s.uniqueCount <= 20);
  const heatCols = sortedHighCard.find(
    (s) => s.uniqueCount >= 3 && s.uniqueCount <= 15 && s.column !== heatRows?.column
  );
  if (heatRows && heatCols) {
    charts.push({
      id: "auto-heatmap",
      title: `Mapa de calor: ${heatRows.column} × ${heatCols.column}`,
      chartType: "Heatmap",
      rowField: heatRows.column,
      colField: heatCols.column,
      metric: "Conteo",
      topN: 12,
      reason: `Cruza "${heatRows.column}" y "${heatCols.column}" — detecta patrones de concentración`,
      icon: ""
    });
  }

  // 6. Boxplot for numeric distribution by category
  if (numericPrimary && sortedLowCard.length > 0) {
    const boxCat = sortedLowCard.find((s) => s.uniqueCount >= 2 && s.uniqueCount <= 15) ?? sortedLowCard[0];
    if (boxCat) {
      charts.push({
        id: "auto-boxplot",
        title: `Distribución de ${numericPrimary} por ${boxCat.column}`,
        chartType: "Boxplot",
        rowField: boxCat.column,
        valueColumn: numericPrimary,
        metric: "Mediana",
        topN: 10,
        reason: `Compara la dispersión de "${numericPrimary}" entre categorías de "${boxCat.column}"`,
        icon: ""
      });
    }
  }

  // Fallback
  if (charts.length < 2 && sortedLowCard[0]) {
    charts.push({
      id: "auto-fallback",
      title: `Top categorías: ${sortedLowCard[0].column}`,
      chartType: "Barras",
      rowField: sortedLowCard[0].column,
      metric: "Conteo",
      topN: 10,
      reason: "Resumen general de categorías",
      icon: ""
    });
  }

  return charts.slice(0, limit);
}

export function buildAutoChartView(
  records: DataRecord[],
  config: AutoChartConfig,
  options: AutoChartBuildOptions = {}
): AutoChartView | null {
  const palette = options.palette ?? getPalette("Predeterminada");
  const theme = options.theme;
  // Heatmap
  if (config.chartType === "Heatmap" && config.rowField && config.colField) {
    const result = buildHeatmap(records, config.rowField, config.colField, "Conteo", undefined, config.topN ?? 12);
    if (result.rowLabels.length === 0) return null;
    const option = {
      color: palette,
      tooltip: { position: "top", formatter: (p: any) => `${result.rowLabels[p.data[1]]} / ${result.colLabels[p.data[0]]}: <b>${p.data[2]}</b>` },
      grid: { top: 10, bottom: 80, left: 120, right: 20 },
      xAxis: { type: "category", data: result.colLabels, axisLabel: { rotate: 30 } },
      yAxis: { type: "category", data: result.rowLabels },
      visualMap: { min: 0, max: result.maxValue, calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#e0f3ff", "#0f766e"] } },
      series: [{ type: "heatmap", data: result.data, label: { show: result.rowLabels.length <= 8, fontSize: 10 } }]
    };
    const themedOption = theme ? applyChartTheme(option, theme) : option;
    return { config, option: themedOption, insights: [`Cruce de ${result.rowLabels.length} filas × ${result.colLabels.length} columnas. Celdas más oscuras = mayor concentración.`] };
  }

  // Boxplot
  if (config.chartType === "Boxplot" && config.rowField && config.valueColumn) {
    const result = buildBoxplot(records, config.rowField, config.valueColumn, config.topN ?? 10);
    if (result.categories.length === 0) return null;
    const option = {
      color: palette,
      tooltip: { trigger: "item", formatter: (p: any) => `${p.name}<br/>Min: ${p.data[1]}<br/>Q1: ${p.data[2]}<br/>Mediana: ${p.data[3]}<br/>Q3: ${p.data[4]}<br/>Max: ${p.data[5]}` },
      xAxis: { type: "category", data: result.categories, axisLabel: { rotate: 20 } },
      yAxis: { type: "value", name: config.valueColumn },
      series: [{ type: "boxplot", data: result.series }]
    };
    const themedOption = theme ? applyChartTheme(option, theme) : option;
    return { config, option: themedOption, insights: buildInsights(result.categories, result.series.map(s => s[2]), "Boxplot") };
  }

  // Scatter
  if (config.chartType === "Dispersion" && config.xKey && config.yKey) {
    const series = buildScatter(records, config.xKey, config.yKey);
    const option = {
      color: palette,
      tooltip: { trigger: "item" },
      xAxis: { type: "value", name: config.xKey },
      yAxis: { type: "value", name: config.yKey },
      series: series.map((item) => ({ name: item.name, type: "scatter", data: item.data, symbolSize: 7 }))
    };
    const themedOption = theme ? applyChartTheme(option, theme) : option;
    return { config, option: themedOption, insights: buildScatterInsights(series[0]?.data ?? []) };
  }

  if (!config.rowField) return null;

  const entries = aggregateBy(
    records,
    [{ key: config.rowField, timeLevel: config.rowTimeLevel ?? "Sin transformacion" }],
    config.metric,
    config.valueColumn
  );

  let sorted = [...entries];
  const hasTime = config.rowTimeLevel && config.rowTimeLevel !== "Sin transformacion";
  if (hasTime) {
    sorted.sort((a, b) => (a.sortKey ?? "").localeCompare(b.sortKey ?? ""));
  } else {
    sorted.sort((a, b) => b.value - a.value);
  }
  sorted = sorted.slice(0, config.topN ?? 10);

  let categories = sorted.map((e) => e.key);
  let values = sorted.map((e) => e.value);

  // Group others for pie/donut
  if ((config.chartType === "Pie" || config.chartType === "Dona") && config.groupOthers) {
    const total = values.reduce((a, b) => a + b, 0);
    const kept: string[] = [];
    const keptVals: number[] = [];
    let otherTotal = 0;
    values.forEach((v, i) => {
      const pct = total > 0 ? (v / total) * 100 : 0;
      if (pct < (config.groupThreshold ?? 3)) otherTotal += v;
      else { kept.push(categories[i]); keptVals.push(v); }
    });
    if (otherTotal > 0 && kept.length > 0) {
      categories = [...kept, "Otros"];
      values = [...keptVals, Math.round(otherTotal * 100) / 100];
    }
  }

  if (config.chartType === "Pareto") {
    const total = values.reduce((a, b) => a + b, 0);
    const cumulative: number[] = [];
    values.reduce((acc, v, i) => {
      const next = acc + v;
      cumulative[i] = Math.round((next / total) * 100 * 100) / 100;
      return next;
    }, 0);
    const option = {
      color: palette,
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 10 },
      xAxis: { type: "category", data: categories, axisLabel: { rotate: 30 } },
      yAxis: [
        { type: "value", name: "Conteo" },
        { type: "value", name: "Acumulado (%)", axisLabel: { formatter: "{value}%" } }
      ],
      series: [
        { name: "Conteo", type: "bar", data: values, itemStyle: { borderRadius: [4, 4, 0, 0] } },
        { name: "Acumulado", type: "line", yAxisIndex: 1, data: cumulative, smooth: true, symbol: "circle" },
        { name: "80%", type: "line", yAxisIndex: 1, data: cumulative.map(() => 80), lineStyle: { type: "dashed", color: "#f59e0b" }, symbol: "none" }
      ]
    };
    const themedOption = theme ? applyChartTheme(option, theme) : option;
    return {
      config,
      option: themedOption,
      insights: buildParetoInsights(categories, values, cumulative),
      table: categories.map((cat, i) => ({ Categoria: cat, Conteo: values[i], "Acumulado %": cumulative[i] }))
    };
  }

  if (config.chartType === "Pie" || config.chartType === "Dona") {
    const option = {
      color: palette,
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { orient: "vertical", left: "left", top: "middle" },
      series: [{
        name: config.metric,
        type: "pie",
        radius: config.chartType === "Dona" ? ["40%", "68%"] : "65%",
        center: ["60%", "50%"],
        data: categories.map((cat, i) => ({ value: values[i], name: cat })),
        label: { formatter: "{b}\n{d}%" },
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0,0,0,0.2)" } }
      }]
    };
    const themedOption = theme ? applyChartTheme(option, theme) : option;
    return {
      config,
      option: themedOption,
      insights: buildInsights(categories, values, config.chartType),
      table: categories.map((cat, i) => ({ Categoria: cat, Valor: values[i] }))
    };
  }

  // Line/Bar/Area
  const isLine = config.chartType === "Lineas" || config.chartType === "Area";
  const option = {
    color: palette,
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: categories, axisLabel: { rotate: categories.length > 8 ? 30 : 0 } },
    yAxis: { type: "value", name: config.metric },
    series: [{
      name: config.metric,
      type: isLine ? "line" : "bar",
      data: values,
      smooth: isLine,
      areaStyle: config.chartType === "Area" ? { opacity: 0.3 } : undefined,
      itemStyle: isLine ? undefined : { borderRadius: [4, 4, 0, 0] },
      markLine: isLine ? {
        data: [{ type: "average", name: "Promedio" }],
        lineStyle: { color: "#f59e0b", type: "dashed" }
      } : undefined
    }]
  };

  const themedOption = theme ? applyChartTheme(option, theme) : option;
  return {
    config,
    option: themedOption,
    insights: buildInsights(categories, values, config.chartType),
    table: categories.map((cat, i) => ({ Categoria: cat, Valor: values[i] }))
  };
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function buildInsights(categories: string[], values: number[], chartType: AutoChartType): string[] {
  if (values.length === 0) return [];
  const insights: string[] = [];
  const total = values.reduce((a, b) => a + b, 0);
  const maxIdx = values.reduce((mi, v, i, a) => (v > a[mi] ? i : mi), 0);
  const leader = categories[maxIdx];
  const leaderPct = total > 0 ? (values[maxIdx] / total) * 100 : 0;
  const mean = total / values.length;

  if (chartType === "Lineas" || chartType === "Area") {
    const first = values[0];
    const last = values[values.length - 1];
    if (first > 0 && last / first >= 1.2) insights.push(`Tendencia al alza: +${(((last - first) / first) * 100).toFixed(1)}% en el periodo.`);
    else if (first > 0 && last / first <= 0.8) insights.push(`Tendencia a la baja: ${(((last - first) / first) * 100).toFixed(1)}% en el periodo.`);
    else insights.push("Comportamiento relativamente estable en el periodo.");
    const peakIdx = values.reduce((mi, v, i, a) => (v > a[mi] ? i : mi), 0);
    insights.push(`Pico maximo: "${categories[peakIdx]}" (${values[peakIdx].toLocaleString()}).`);
    return insights;
  }

  if (chartType === "Boxplot") {
    insights.push(`Categoria con mayor mediana: "${leader}" (${values[maxIdx].toLocaleString()}).`);
    return insights;
  }

  if (leaderPct >= 60) {
    insights.push(`Alta concentracion en "${leader}" — representa el ${leaderPct.toFixed(1)}% del total.`);
  } else if (leaderPct >= 40) {
    insights.push(`Categoria dominante: "${leader}" (${leaderPct.toFixed(1)}%).`);
  } else {
    insights.push("Distribucion relativamente equilibrada entre categorias.");
  }

  const aboveAvg = values.filter((v) => v > mean).length;
  insights.push(`${aboveAvg} de ${values.length} categorias estan sobre el promedio (${mean.toFixed(1)}).`);

  if (categories.length > 10) insights.push("Hay muchas categorias — considera filtrar o usar Pareto.");

  return insights;
}

function buildParetoInsights(categories: string[], values: number[], cumulative: number[]): string[] {
  const idx80 = cumulative.findIndex((v) => v >= 80);
  const top = idx80 >= 0 ? idx80 + 1 : categories.length;
  const pct = Math.round((top / categories.length) * 100);
  return [
    `El ${pct}% de las categorias (${top} de ${categories.length}) concentran el 80% del total.`,
    `Mayor contribuyente: "${categories[0]}" con ${values[0].toLocaleString()} registros.`
  ];
}

function buildScatterInsights(data: [number, number][]): string[] {
  if (data.length < 5) return ["Pocos puntos para análisis de correlación."];
  const n = data.length;
  const meanX = data.reduce((a, p) => a + p[0], 0) / n;
  const meanY = data.reduce((a, p) => a + p[1], 0) / n;
  const cov = data.reduce((a, p) => a + (p[0] - meanX) * (p[1] - meanY), 0) / n;
  const sdX = Math.sqrt(data.reduce((a, p) => a + (p[0] - meanX) ** 2, 0) / n);
  const sdY = Math.sqrt(data.reduce((a, p) => a + (p[1] - meanY) ** 2, 0) / n);
  const r = sdX > 0 && sdY > 0 ? cov / (sdX * sdY) : 0;
  const rounded = Math.round(r * 100) / 100;
  let label = "correlación débil";
  if (Math.abs(r) >= 0.7) label = "correlación fuerte";
  else if (Math.abs(r) >= 0.4) label = "correlación moderada";
  return [
    `Pearson r = ${rounded} — ${label} (${r >= 0 ? "positiva" : "negativa"}).`,
    `${n.toLocaleString()} puntos analizados.`
  ];
}
