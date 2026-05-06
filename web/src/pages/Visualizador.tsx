import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";

import DataSummary from "../components/DataSummary";
import DataTable from "../components/DataTable";
import { AutoChartConfig, buildAutoChartView, recommendAutoCharts } from "../lib/autoCharts";
import { aggregateBy, aggregatePivot, buildBoxplot, buildHeatmap, buildHistogram, buildScatter, computeStats, Metric } from "../lib/chartUtils";
import { PALETTE_OPTIONS, PaletteName, getPalette } from "../lib/chartPalettes";
import { applyChartTheme, ChartTheme, readChartTheme } from "../lib/chartTheme";
import { exportCsv, filterRecords } from "../lib/dataUtils";
import { TimeLevel } from "../lib/timeUtils";
import { useDataContext } from "../store/DataContext";

type ChartType =
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

const ALL_METRICS: Metric[] = ["Conteo", "Suma", "Promedio", "Maximo", "Minimo", "Mediana", "Conteo único"];
const NUMERIC_METRICS: Metric[] = ["Suma", "Promedio", "Maximo", "Minimo", "Mediana"];

type PieLabelFormat = "Porcentaje" | "Valor" | "Categoria + valor + %";

type LabelPosition = "Exterior" | "Interior";

const timeLevels: TimeLevel[] = [
  "Sin transformacion",
  "Ano",
  "Trimestre",
  "Mes",
  "Ano-Mes",
  "Semana",
  "Dia"
];

export default function Visualizador() {
  const { data, profile } = useDataContext();
  const chartRef = useRef<ReactECharts>(null);
  const [chartType, setChartType] = useState<ChartType>("Barras");
  const [paletteName, setPaletteName] = useState<PaletteName>("Predeterminada");
  const [chartTheme, setChartTheme] = useState<ChartTheme>(() => readChartTheme());

  const [rowField, setRowField] = useState("");
  const [rowFieldSecondary, setRowFieldSecondary] = useState("-- Ninguno --");
  const [seriesField, setSeriesField] = useState("-- Ninguno --");
  const [seriesFieldSecondary, setSeriesFieldSecondary] = useState("-- Ninguno --");

  const [rowTimeLevel, setRowTimeLevel] = useState<TimeLevel>("Sin transformacion");
  const [rowTimeLevelSecondary, setRowTimeLevelSecondary] = useState<TimeLevel>("Sin transformacion");
  const [seriesTimeLevel, setSeriesTimeLevel] = useState<TimeLevel>("Sin transformacion");
  const [seriesTimeLevelSecondary, setSeriesTimeLevelSecondary] = useState<TimeLevel>("Sin transformacion");

  const [metric, setMetric] = useState<Metric>("Conteo");
  const [valueColumn, setValueColumn] = useState("");
  const [topN, setTopN] = useState(10);
  const [showZoom, setShowZoom] = useState(true);
  const [orderChrono, setOrderChrono] = useState(true);
  const [orderAscending, setOrderAscending] = useState(false);
  const [showSeriesLabels, setShowSeriesLabels] = useState(false);

  const [histColumn, setHistColumn] = useState("");
  const [histBins, setHistBins] = useState(12);

  const [scatterX, setScatterX] = useState("");
  const [scatterY, setScatterY] = useState("");
  const [scatterColor, setScatterColor] = useState("-- Ninguno --");

  // Heatmap fields
  const [heatmapColField, setHeatmapColField] = useState("-- Ninguno --");

  // Boxplot
  const [boxplotValueCol, setBoxplotValueCol] = useState("");

  // Chart title (editable)
  const [chartTitle, setChartTitle] = useState("");

  const [filterColumns, setFilterColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});

  const [showPieLabels, setShowPieLabels] = useState(true);
  const [pieLabelFormat, setPieLabelFormat] = useState<PieLabelFormat>("Porcentaje");
  const [pieLabelPosition, setPieLabelPosition] = useState<LabelPosition>("Exterior");
  const [showPieHints, setShowPieHints] = useState(true);
  const [groupOthers, setGroupOthers] = useState(false);
  const [groupThreshold, setGroupThreshold] = useState(3);

  const activePalette = useMemo(() => getPalette(paletteName), [paletteName]);

  useEffect(() => {
    setChartTheme(readChartTheme());
  }, []);

  useEffect(() => {
    if (!profile) {
      return;
    }
    if (!rowField || !profile.columns.includes(rowField)) {
      setRowField(profile.columns[0] ?? "");
    }
    if (!valueColumn && profile.numericColumns.length > 0) {
      setValueColumn(profile.numericColumns[0]);
    }
    if (!histColumn && profile.numericColumns.length > 0) {
      setHistColumn(profile.numericColumns[0]);
    }
    if (profile.numericColumns.length >= 2 && (!scatterX || !scatterY)) {
      setScatterX(profile.numericColumns[0]);
      setScatterY(profile.numericColumns[1]);
    }
    if (!boxplotValueCol && profile.numericColumns.length > 0) {
      setBoxplotValueCol(profile.numericColumns[0]);
    }
  }, [profile, rowField, valueColumn, histColumn, scatterX, scatterY, boxplotValueCol]);

  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!filterColumns.includes(key)) {
          delete next[key];
        }
      });
      return next;
    });
    setFilterSearch((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!filterColumns.includes(key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [filterColumns]);

  const filteredData = useMemo(() => filterRecords(data, filters), [data, filters]);

  const dimensionColumns = profile?.columns ?? [];
  const numericColumns = profile?.numericColumns ?? [];
  const dateColumns = profile?.dateColumns ?? [];

  const autoCharts = useMemo(() => {
    if (!profile) return [] as AutoChartConfig[];
    return recommendAutoCharts(data, profile, 6);
  }, [data, profile]);

  const autoViews = useMemo(
    () =>
      autoCharts
        .map((config) => buildAutoChartView(data, config, { palette: activePalette, theme: chartTheme }))
        .filter(Boolean),
    [autoCharts, data, activePalette, chartTheme]
  );

  const rowFields = useMemo(() => {
    const fields = [] as { key: string; timeLevel: TimeLevel }[];
    if (rowField) {
      fields.push({ key: rowField, timeLevel: rowTimeLevel });
    }
    if (rowFieldSecondary !== "-- Ninguno --") {
      fields.push({ key: rowFieldSecondary, timeLevel: rowTimeLevelSecondary });
    }
    return fields;
  }, [rowField, rowFieldSecondary, rowTimeLevel, rowTimeLevelSecondary]);

  const seriesFields = useMemo(() => {
    const fields = [] as { key: string; timeLevel: TimeLevel }[];
    if (seriesField !== "-- Ninguno --") {
      fields.push({ key: seriesField, timeLevel: seriesTimeLevel });
    }
    if (seriesFieldSecondary !== "-- Ninguno --") {
      fields.push({ key: seriesFieldSecondary, timeLevel: seriesTimeLevelSecondary });
    }
    return fields;
  }, [seriesField, seriesFieldSecondary, seriesTimeLevel, seriesTimeLevelSecondary]);

  const chartState = useMemo(() => {
    if (!profile || filteredData.length === 0) {
      return { option: null as any, table: null as any, hints: [] as string[], notice: "" };
    }

    const labelStyle = (position: "top" | "inside" = "top") =>
      showSeriesLabels
        ? { show: true, position, color: chartTheme.text, fontSize: 11 }
        : { show: false };

    if (chartType === "Heatmap") {
      if (!rowField || heatmapColField === "-- Ninguno --") {
        return { option: null, table: null, hints: [], notice: "Selecciona columna de fila y columna para el mapa de calor." };
      }
      const result = buildHeatmap(filteredData, rowField, heatmapColField, metric, metric !== "Conteo" ? valueColumn : undefined, topN);
      if (result.rowLabels.length === 0) return { option: null, table: null, hints: [], notice: "Sin datos para el mapa de calor." };
      const hmOption = {
        color: activePalette,
        tooltip: { position: "top", formatter: (p: any) => `${result.rowLabels[p.data[1]]} / ${result.colLabels[p.data[0]]}: <b>${p.data[2]}</b>` },
        grid: { top: 20, bottom: 90, left: 140, right: 20 },
        xAxis: { type: "category", data: result.colLabels, axisLabel: { rotate: 35 } },
        yAxis: { type: "category", data: result.rowLabels },
        visualMap: { min: 0, max: result.maxValue, calculable: true, orient: "horizontal", left: "center", bottom: 10, inRange: { color: ["#e0f8f4", "#0f766e"] } },
        series: [{ type: "heatmap", data: result.data, label: { show: result.rowLabels.length <= 8, fontSize: 10 } }]
      } as any;
      const themedOption = applyChartTheme(hmOption, chartTheme);
      return { option: themedOption, table: null, hints: [`Cruce de ${result.rowLabels.length} filas × ${result.colLabels.length} columnas.`], notice: "" };
    }

    if (chartType === "Boxplot") {
      if (!rowField || !boxplotValueCol) {
        return { option: null, table: null, hints: [], notice: "Selecciona columna de categoria y columna numerica." };
      }
      const result = buildBoxplot(filteredData, rowField, boxplotValueCol, topN);
      if (result.categories.length === 0) return { option: null, table: null, hints: [], notice: "Sin datos suficientes para boxplot." };
      const bpOption = {
        color: activePalette,
        tooltip: { trigger: "item", formatter: (p: any) => `<b>${p.name}</b><br/>Min: ${p.data[1]}<br/>Q1: ${p.data[2]}<br/>Med: ${p.data[3]}<br/>Q3: ${p.data[4]}<br/>Max: ${p.data[5]}` },
        xAxis: { type: "category", data: result.categories, axisLabel: { rotate: 25 } },
        yAxis: { type: "value", name: boxplotValueCol },
        series: [{ name: boxplotValueCol, type: "boxplot", data: result.series, itemStyle: { color: "rgba(93,95,239,0.3)", borderColor: "#5d5fef" } }]
      } as any;
      const bpTable = result.categories.map((cat, i) => ({ Categoria: cat, Min: result.series[i][0], Q1: result.series[i][1], Mediana: result.series[i][2], Q3: result.series[i][3], Max: result.series[i][4] }));
      const themedOption = applyChartTheme(bpOption, chartTheme);
      return { option: themedOption, table: bpTable, hints: [`Distribución de "${boxplotValueCol}" por "${rowField}". Mediana más alta: "${result.categories[0]}".`], notice: "" };
    }

    if (chartType === "Histograma") {
      if (!histColumn) {
        return { option: null, table: null, hints: [], notice: "Selecciona una columna numerica." };
      }
      const hist = buildHistogram(filteredData, histColumn, histBins);
      const stats = computeStats(filteredData, histColumn);
      const option = {
        color: activePalette,
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: hist.categories, axisLabel: { rotate: 25, color: "#1f2937" } },
        yAxis: { type: "value", axisLabel: { color: "#1f2937" } },
        series: [{ name: "Frecuencia", type: "bar", data: hist.values, itemStyle: { borderRadius: [3, 3, 0, 0] } }]
      } as any;
      if (showZoom) option.dataZoom = [{ type: "inside" }, { type: "slider" }];
      const histHints = stats ? [`Media: ${stats.mean} | Mediana: ${stats.median} | Desv. Estándar: ${stats.stdDev} | Min: ${stats.min} | Max: ${stats.max}`] : [];
      const themedOption = applyChartTheme(option, chartTheme);
      return {
        option: themedOption,
        table: hist.categories.map((label, index) => ({ Rango: label, Frecuencia: hist.values[index] })),
        hints: histHints,
        notice: ""
      };
    }

    if (chartType === "Dispersion") {
      if (!scatterX || !scatterY) {
        return { option: null, table: null, hints: [], notice: "Selecciona dos columnas numericas." };
      }
      const series = buildScatter(
        filteredData,
        scatterX,
        scatterY,
        scatterColor === "-- Ninguno --" ? undefined : scatterColor
      );
      const option = {
        color: activePalette,
        tooltip: { trigger: "item" },
        legend: { top: 10 },
        xAxis: {
          type: "value",
          name: scatterX,
          axisLabel: { color: "#1f2937" },
          axisLine: { lineStyle: { color: "#1f2937" } }
        },
        yAxis: {
          type: "value",
          name: scatterY,
          axisLabel: { color: "#1f2937" },
          axisLine: { lineStyle: { color: "#1f2937" } }
        },
        series: series.map((serie) => ({
          name: serie.name,
          type: "scatter",
          data: serie.data,
          symbolSize: 10
        }))
      } as any;
      const themedOption = applyChartTheme(option, chartTheme);

      return { option: themedOption, table: null, hints: [], notice: "" };
    }

    if (chartType === "Pareto") {
      const entries = aggregateBy(filteredData, rowFields, "Conteo");
      const sorted = [...entries].sort((a, b) => b.value - a.value).slice(0, topN);
      const categories = sorted.map((entry) => entry.key);
      const values = sorted.map((entry) => entry.value);
      const total = values.reduce((sum, value) => sum + value, 0);
      if (total === 0) {
        return { option: null, table: null, hints: [], notice: "No hay datos suficientes." };
      }
      const cumulative: number[] = [];
      values.reduce((acc, value, index) => {
        const next = acc + value;
        cumulative[index] = Math.round((next / total) * 100 * 100) / 100;
        return next;
      }, 0);

      const option = {
        color: activePalette,
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        legend: { top: 10 },
        xAxis: {
          type: "category",
          data: categories,
          axisLabel: { rotate: 25, color: "#1f2937" },
          axisLine: { lineStyle: { color: "#1f2937" } }
        },
        yAxis: [
          {
            type: "value",
            name: "Conteo",
            axisLabel: { color: "#1f2937" },
            axisLine: { lineStyle: { color: "#1f2937" } }
          },
          {
            type: "value",
            name: "Acumulado (%)",
            axisLabel: { formatter: "{value}%", color: "#1f2937" },
            axisLine: { lineStyle: { color: "#1f2937" } }
          }
        ],
        series: [
          { name: "Conteo", type: "bar", data: values },
          { name: "Acumulado", type: "line", yAxisIndex: 1, data: cumulative, smooth: true },
          {
            name: "Linea 80/20",
            type: "line",
            yAxisIndex: 1,
            data: cumulative.map(() => 80),
            lineStyle: { type: "dashed", color: "#1f2937" },
            symbol: "none"
          }
        ]
      } as any;
      const themedOption = applyChartTheme(option, chartTheme);

      return {
        option: themedOption,
        table: categories.map((cat, index) => ({ Categoria: cat, Conteo: values[index], "Acumulado %": cumulative[index] })),
        hints: [],
        notice: ""
      };
    }

    const hasSeries = seriesFields.length > 0;

    if (!hasSeries) {
      const entries = aggregateBy(filteredData, rowFields, metric as any, valueColumn);
      const hasTime = rowFields.some((field) => field.timeLevel !== "Sin transformacion");
      let sorted = [...entries];
      if (orderChrono && hasTime) {
        sorted.sort((a, b) => (a.sortKey ?? "").localeCompare(b.sortKey ?? ""));
      } else {
        sorted.sort((a, b) => (orderAscending ? a.value - b.value : b.value - a.value));
      }
      sorted = sorted.slice(0, topN);

      let categories = sorted.map((entry) => entry.key);
      let values = sorted.map((entry) => entry.value);

      if ((chartType === "Pie" || chartType === "Dona") && groupOthers && values.length > 1) {
        const total = values.reduce((sum, value) => sum + value, 0);
        const kept: string[] = [];
        const keptValues: number[] = [];
        let otherTotal = 0;
        categories.forEach((category, index) => {
          const percentage = total > 0 ? (values[index] / total) * 100 : 0;
          if (percentage < groupThreshold) {
            otherTotal += values[index];
          } else {
            kept.push(category);
            keptValues.push(values[index]);
          }
        });
        if (otherTotal > 0 && kept.length > 0) {
          categories = [...kept, "Otros"];
          values = [...keptValues, Math.round(otherTotal * 100) / 100];
        }
      }

      const hints: string[] = [];
      if ((chartType === "Pie" || chartType === "Dona") && showPieHints && values.length > 0) {
        const total = values.reduce((sum, value) => sum + value, 0);
        const maxIndex = values.reduce((maxIdx, value, idx, arr) => (value > arr[maxIdx] ? idx : maxIdx), 0);
        const leader = categories[maxIndex];
        const leaderPct = total > 0 ? (values[maxIndex] / total) * 100 : 0;
        if (leaderPct >= 60) {
          hints.push(`La categoria '${leader}' concentra ${leaderPct.toFixed(1)}% del total.`);
        } else if (leaderPct >= 40) {
          hints.push(`La categoria '${leader}' lidera con ${leaderPct.toFixed(1)}% del total.`);
        } else {
          hints.push("La distribucion es relativamente equilibrada.");
        }
        const small = values.filter((value) => (total > 0 ? (value / total) * 100 : 0) < 3).length;
        if (small >= 3) {
          hints.push("Hay varias categorias pequenas. Considera agrupar en 'Otros'.");
        }
      }

      if (chartType === "Pie" || chartType === "Dona") {
        const labelFormat =
          pieLabelFormat === "Valor"
            ? "{c}"
            : pieLabelFormat === "Categoria + valor + %"
              ? "{b}\n{c} ({d}%)"
              : "{d}%";
        const option = {
          color: activePalette,
          tooltip: { trigger: "item" },
          legend: { orient: "vertical", left: "left" },
          series: [
            {
              name: metric,
              type: "pie",
              radius: chartType === "Dona" ? ["40%", "70%"] : "65%",
              data: categories.map((category, index) => ({ value: values[index], name: category })),
              label: {
                show: showPieLabels,
                position: pieLabelPosition === "Exterior" ? "outside" : "inside",
                formatter: labelFormat,
                color: pieLabelPosition === "Exterior" ? chartTheme.text : "#ffffff"
              },
              labelLine: { show: showPieLabels && pieLabelPosition === "Exterior" }
            }
          ]
        } as any;
        const themedOption = applyChartTheme(option, chartTheme);
        return {
          option: themedOption,
          table: categories.map((cat, index) => ({ Categoria: cat, Valor: values[index] })),
          hints,
          notice: ""
        };
      }

      const option = {
        color: activePalette,
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: categories,
          axisLabel: { rotate: 25, color: "#1f2937" },
          axisLine: { lineStyle: { color: "#1f2937" } }
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#1f2937" },
          axisLine: { lineStyle: { color: "#1f2937" } }
        },
        series: [
          {
            name: metric,
            type: chartType === "Barras" ? "bar" : "line",
            data: values,
            smooth: chartType !== "Barras",
            areaStyle: chartType === "Area" ? {} : undefined,
            label: labelStyle(chartType === "Barras" ? "top" : "top")
          }
        ]
      } as any;

      if (showZoom) {
        option.dataZoom = [{ type: "inside" }, { type: "slider" }];
      }

      const themedOption = applyChartTheme(option, chartTheme);
      return {
        option: themedOption,
        table: categories.map((cat, index) => ({ Categoria: cat, Valor: values[index] })),
        hints,
        notice: ""
      };
    }

    const pivot = aggregatePivot(filteredData, rowFields, seriesFields, metric as any, valueColumn);
    const rowTotals = pivot.values.map((row) => row.reduce((sum, value) => sum + value, 0));
    const rowEntries = pivot.rowKeys.map((key, index) => ({ key, total: rowTotals[index] }));
    const hasTime = rowFields.some((field) => field.timeLevel !== "Sin transformacion");

    let orderedRows = rowEntries;
    if (orderChrono && hasTime) {
      orderedRows = [...rowEntries].sort((a, b) => a.key.localeCompare(b.key));
    } else {
      orderedRows = [...rowEntries].sort((a, b) => (orderAscending ? a.total - b.total : b.total - a.total));
    }

    orderedRows = orderedRows.slice(0, topN);
    const rowIndexMap = new Map(pivot.rowKeys.map((key, idx) => [key, idx]));

    const rows = orderedRows.map((entry) => entry.key);
    const values = rows.map((rowKey) => pivot.values[rowIndexMap.get(rowKey)!]);
    const columns = orderChrono && seriesFields.length > 0 ? [...pivot.columnKeys].sort() : pivot.columnKeys;

    const option = {
      color: activePalette,
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 10 },
      xAxis: {
        type: "category",
        data: rows,
        axisLabel: { rotate: 25, color: "#1f2937" },
        axisLine: { lineStyle: { color: "#1f2937" } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#1f2937" },
        axisLine: { lineStyle: { color: "#1f2937" } }
      },
      series: columns.map((colKey, colIndex) => ({
        name: colKey,
        type: chartType === "Barras" ? "bar" : "line",
        stack: chartType === "Barras" ? "total" : undefined,
        smooth: chartType !== "Barras",
        areaStyle: chartType === "Area" ? {} : undefined,
        data: values.map((row) => row[colIndex] ?? 0),
        label: labelStyle(chartType === "Barras" ? "inside" : "top")
      }))
    } as any;

    if (showZoom) {
      option.dataZoom = [{ type: "inside" }, { type: "slider" }];
    }

    const table = rows.map((rowKey, rowIndex) => {
      const row: Record<string, number | string> = { Categoria: rowKey };
      columns.forEach((colKey, colIndex) => {
        row[colKey] = values[rowIndex][colIndex] ?? 0;
      });
      return row;
    });

    const themedOption = applyChartTheme(option, chartTheme);
    return {
      option: themedOption,
      table,
      hints: chartType === "Pie" || chartType === "Dona" ? ["Pie y dona no aplican a series multiples."] : [],
      notice: ""
    };
  }, [
    profile,
    filteredData,
    chartType,
    rowFields,
    seriesFields,
    metric,
    valueColumn,
    topN,
    showZoom,
    orderChrono,
    orderAscending,
    histColumn,
    histBins,
    scatterX,
    scatterY,
    scatterColor,
    groupOthers,
    groupThreshold,
    showPieHints,
    showPieLabels,
    pieLabelFormat,
    pieLabelPosition,
    showSeriesLabels,
    activePalette,
    chartTheme
  ]);

  const canExport = Boolean(chartState.option);

  const activeFilters = useMemo(() => {
    return Object.entries(filters)
      .filter(([, values]) => values.length > 0)
      .map(([column, values]) => `${column}: ${values.slice(0, 4).join(", ")}${values.length > 4 ? "..." : ""}`);
  }, [filters]);

  const buildChartImage = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) {
      return null;
    }
    return instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: chartTheme.background });
  };

  const handleExportPng = () => {
    const dataUrl = buildChartImage();
    if (!dataUrl) {
      return;
    }
    const blob = dataUrlToBlob(dataUrl);
    saveAs(blob, "grafico_gencla.png");
  };

  const handleExportPdf = () => {
    const dataUrl = buildChartImage();
    if (!dataUrl) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(chartTitle || "GENCLA - Reporte BI", 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Visual: ${chartType} | Filas: ${filteredData.length.toLocaleString()} | ${new Date().toLocaleDateString("es-CL")}`, 40, 60);
    if (activeFilters.length > 0) doc.text(`Filtros: ${activeFilters.join("; ")}`, 40, 75, { maxWidth: 760 });
    doc.addImage(dataUrl, "PNG", 40, 100, 760, 360);
    doc.save("reporte_bi_gencla.pdf");
  };

  const handleExportTableCsv = () => {
    if (!chartState.table) return;
    const csv = exportCsv(chartState.table as any);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, "tabla_grafico.csv");
  };

  const applyAutoConfig = (config: AutoChartConfig) => {
    setChartType(config.chartType as ChartType);
    if (config.chartType === "Dispersion") {
      if (config.xKey) setScatterX(config.xKey);
      if (config.yKey) setScatterY(config.yKey);
      return;
    }
    if (config.chartType === "Heatmap") {
      if (config.rowField) setRowField(config.rowField);
      if (config.colField) setHeatmapColField(config.colField);
      setMetric(config.metric);
      setTopN(config.topN ?? 12);
      return;
    }
    if (config.chartType === "Boxplot") {
      if (config.rowField) setRowField(config.rowField);
      if (config.valueColumn) setBoxplotValueCol(config.valueColumn);
      setTopN(config.topN ?? 10);
      return;
    }
    if (config.rowField) setRowField(config.rowField);
    setRowFieldSecondary("-- Ninguno --");
    setSeriesField("-- Ninguno --");
    setSeriesFieldSecondary("-- Ninguno --");
    setMetric(config.metric);
    if (config.valueColumn) setValueColumn(config.valueColumn);
    setTopN(config.topN ?? 10);
    setGroupOthers(config.groupOthers ?? false);
    setGroupThreshold(config.groupThreshold ?? 3);
    setRowTimeLevel(config.rowTimeLevel ?? "Sin transformacion");
    setOrderChrono(true);
  };

  const supportsValueLabels = chartType === "Barras" || chartType === "Lineas" || chartType === "Area";

  if (!profile) {
    return (
      <div className="section">
        <div className="card">
          <h3>Visualizador BI</h3>
          <p>Sube un dataset en la seccion de homologacion para habilitar los graficos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="hero">
        <span className="tag">Dashboard BI</span>
        <h2>Visualizacion interactiva</h2>
        <p>
          Configura filas, columnas y metricas para generar visuales similares a Power BI,
          con jerarquia temporal y filtros avanzados.
        </p>
      </div>

      <DataSummary />

      {autoViews.length > 0 && (
        <details className="details" open>
          <summary>Dashboard automático — {autoViews.length} visuales sugeridos</summary>
          <div className="dashboard-grid" style={{ marginTop: "12px" }}>
            {autoViews.map((view) =>
              view ? (
                <div key={view.config.id} className="card">
                  <div className="section-title">
                    <h4 style={{ fontSize: "0.92rem" }}>
                      {view.config.title}
                    </h4>
                    <button className="btn btn-ghost" type="button" style={{ fontSize: "0.8rem", padding: "4px 10px" }} onClick={() => applyAutoConfig(view.config)}>
                      Aplicar
                    </button>
                  </div>
                  <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "6px" }}>{view.config.reason}</p>
                  <ReactECharts option={view.option} style={{ height: "200px" }} />
                  {view.insights.length > 0 && (
                    <div style={{ marginTop: "6px", display: "grid", gap: "3px" }}>
                      {view.insights.map((insight) => (
                        <p key={insight} className="muted" style={{ fontSize: "0.8rem" }}>{insight}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>
        </details>
      )}

      <div className="split">
        <div className="card">
          <div className="section-title">
            <h3>Constructor del visual</h3>
            <span className="tag">{filteredData.length.toLocaleString()} filas</span>
          </div>

          <div className="controls">
            <div className="field">
              <label>Título del gráfico</label>
              <input type="text" value={chartTitle} onChange={(e) => setChartTitle(e.target.value)} placeholder="Ej: Equipos por servicio clínico" />
            </div>
            <div className="field">
              <label>Tipo de visual</label>
              <select value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)}>
                <optgroup label="Básicos">
                  <option value="Barras">Barras</option>
                  <option value="Lineas">Lineas</option>
                  <option value="Area">Area</option>
                  <option value="Pie">Pie</option>
                  <option value="Dona">Dona</option>
                </optgroup>
                <optgroup label="Avanzados">
                  <option value="Pareto">Pareto 80/20</option>
                  <option value="Histograma">Histograma</option>
                  <option value="Dispersion">Dispersion</option>
                  <option value="Heatmap">Mapa de calor</option>
                  <option value="Boxplot">Boxplot</option>
                </optgroup>
              </select>
            </div>

            {chartType === "Histograma" && (
              <>
                <div className="field">
                  <label>Columna numerica</label>
                  <select value={histColumn} onChange={(event) => setHistColumn(event.target.value)}>
                    {numericColumns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Bins</label>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={histBins}
                    onChange={(event) => setHistBins(Number(event.target.value))}
                  />
                </div>
              </>
            )}

            {chartType === "Dispersion" && (
              <>
                <div className="field">
                  <label>Eje X</label>
                  <select value={scatterX} onChange={(event) => setScatterX(event.target.value)}>
                    {numericColumns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Eje Y</label>
                  <select value={scatterY} onChange={(event) => setScatterY(event.target.value)}>
                    {numericColumns.filter((col) => col !== scatterX).map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Leyenda (opcional)</label>
                  <select value={scatterColor} onChange={(event) => setScatterColor(event.target.value)}>
                    <option value="-- Ninguno --">-- Ninguno --</option>
                    {dimensionColumns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {chartType === "Heatmap" && (
              <>
                <div className="field">
                  <label>Columna de filas (Y)</label>
                  <select value={rowField} onChange={(e) => setRowField(e.target.value)}>
                    {dimensionColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Columna de columnas (X)</label>
                  <select value={heatmapColField} onChange={(e) => setHeatmapColField(e.target.value)}>
                    <option value="-- Ninguno --">-- Ninguno --</option>
                    {dimensionColumns.filter((c) => c !== rowField).map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Top N categorias</label>
                  <input type="number" min={3} max={20} value={topN} onChange={(e) => setTopN(Number(e.target.value))} />
                </div>
              </>
            )}

            {chartType === "Boxplot" && (
              <>
                <div className="field">
                  <label>Columna de categoria</label>
                  <select value={rowField} onChange={(e) => setRowField(e.target.value)}>
                    {dimensionColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Columna numerica</label>
                  <select value={boxplotValueCol} onChange={(e) => setBoxplotValueCol(e.target.value)}>
                    {numericColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Top N categorias</label>
                  <input type="number" min={3} max={20} value={topN} onChange={(e) => setTopN(Number(e.target.value))} />
                </div>
              </>
            )}

            {chartType !== "Histograma" && chartType !== "Dispersion" && chartType !== "Heatmap" && chartType !== "Boxplot" && (
              <>
                <div className="field">
                  <label>Filas (categoria principal)</label>
                  <select value={rowField} onChange={(event) => setRowField(event.target.value)}>
                    {dimensionColumns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Filas secundarias</label>
                  <select
                    value={rowFieldSecondary}
                    onChange={(event) => setRowFieldSecondary(event.target.value)}
                  >
                    <option value="-- Ninguno --">-- Ninguno --</option>
                    {dimensionColumns
                      .filter((column) => column !== rowField)
                      .map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label>Columnas / Leyenda</label>
                  <select value={seriesField} onChange={(event) => setSeriesField(event.target.value)}>
                    <option value="-- Ninguno --">-- Ninguno --</option>
                    {dimensionColumns
                      .filter((column) => column !== rowField)
                      .map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                  </select>
                </div>
                {seriesField !== "-- Ninguno --" && (
                  <div className="field">
                    <label>Columnas secundarias</label>
                    <select
                      value={seriesFieldSecondary}
                      onChange={(event) => setSeriesFieldSecondary(event.target.value)}
                    >
                      <option value="-- Ninguno --">-- Ninguno --</option>
                      {dimensionColumns
                        .filter(
                          (column) =>
                            column !== rowField &&
                            column !== rowFieldSecondary &&
                            column !== seriesField
                        )
                        .map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="field">
                  <label>Métrica</label>
                  <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>
                    {ALL_METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {NUMERIC_METRICS.includes(metric) && (
                  <div className="field">
                    <label>Columna numerica</label>
                    <select value={valueColumn} onChange={(event) => setValueColumn(event.target.value)}>
                      {numericColumns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="field">
                  <label>Top N categorias</label>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={topN}
                    onChange={(event) => setTopN(Number(event.target.value))}
                  />
                </div>

                <div className="field">
                  <label>Jerarquia temporal</label>
                  {dateColumns.includes(rowField) && (
                    <select value={rowTimeLevel} onChange={(event) => setRowTimeLevel(event.target.value as TimeLevel)}>
                      {timeLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  )}
                  {rowFieldSecondary !== "-- Ninguno --" && dateColumns.includes(rowFieldSecondary) && (
                    <select
                      value={rowTimeLevelSecondary}
                      onChange={(event) => setRowTimeLevelSecondary(event.target.value as TimeLevel)}
                    >
                      {timeLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  )}
                  {seriesField !== "-- Ninguno --" && dateColumns.includes(seriesField) && (
                    <select
                      value={seriesTimeLevel}
                      onChange={(event) => setSeriesTimeLevel(event.target.value as TimeLevel)}
                    >
                      {timeLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  )}
                  {seriesFieldSecondary !== "-- Ninguno --" && dateColumns.includes(seriesFieldSecondary) && (
                    <select
                      value={seriesTimeLevelSecondary}
                      onChange={(event) => setSeriesTimeLevelSecondary(event.target.value as TimeLevel)}
                    >
                      {timeLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

            <div className="field">
              <label>Paleta de colores</label>
              <select value={paletteName} onChange={(event) => setPaletteName(event.target.value as PaletteName)}>
                {PALETTE_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Filtros por categoria</label>
              <select
                multiple
                size={Math.min(6, dimensionColumns.length || 6)}
                value={filterColumns}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                  setFilterColumns(values);
                }}
              >
                {dimensionColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </div>

            {filterColumns.map((column) => (
              <div key={`filter-${column}`} className="field">
                <label>{`Valores de ${column}`}</label>
                <input
                  type="search"
                  value={filterSearch[column] ?? ""}
                  onChange={(event) =>
                    setFilterSearch((prev) => ({ ...prev, [column]: event.target.value }))
                  }
                  placeholder="Buscar dentro del filtro"
                />
                <select
                  multiple
                  size={6}
                  value={filters[column] ?? []}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                    setFilters((prev) => ({ ...prev, [column]: values }));
                  }}
                >
                  {Array.from(new Set(data.map((row) => String(row[column] ?? "Sin dato"))))
                    .filter((value) =>
                      (filterSearch[column] ?? "").length === 0
                        ? true
                        : value.toLowerCase().includes((filterSearch[column] ?? "").toLowerCase())
                    )
                    .map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </select>
              </div>
            ))}

            <div className="field">
              <label>Opciones del grafico</label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="checkbox" checked={showZoom} onChange={(event) => setShowZoom(event.target.checked)} />
                Zoom interactivo
              </label>
              {supportsValueLabels && (
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={showSeriesLabels}
                    onChange={(event) => setShowSeriesLabels(event.target.checked)}
                  />
                  Etiquetas de valor
                </label>
              )}
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={orderChrono}
                  onChange={(event) => setOrderChrono(event.target.checked)}
                />
                Orden cronologico
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={orderAscending}
                  onChange={(event) => setOrderAscending(event.target.checked)}
                />
                Orden ascendente (valores)
              </label>
            </div>

            {(chartType === "Pie" || chartType === "Dona") && (
              <div className="field">
                <label>Etiquetas en pie/dona</label>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={showPieLabels}
                    onChange={(event) => setShowPieLabels(event.target.checked)}
                  />
                  Mostrar etiquetas
                </label>
                <select
                  value={pieLabelFormat}
                  onChange={(event) => setPieLabelFormat(event.target.value as PieLabelFormat)}
                >
                  <option value="Porcentaje">Porcentaje</option>
                  <option value="Valor">Valor</option>
                  <option value="Categoria + valor + %">Categoria + valor + %</option>
                </select>
                <select
                  value={pieLabelPosition}
                  onChange={(event) => setPieLabelPosition(event.target.value as LabelPosition)}
                >
                  <option value="Exterior">Exterior</option>
                  <option value="Interior">Interior</option>
                </select>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={showPieHints}
                    onChange={(event) => setShowPieHints(event.target.checked)}
                  />
                  Mostrar sugerencias
                </label>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={groupOthers}
                    onChange={(event) => setGroupOthers(event.target.checked)}
                  />
                  Agrupar categorias pequenas
                </label>
                {groupOthers && (
                  <input
                    type="number"
                    min={1}
                    max={15}
                    step={0.5}
                    value={groupThreshold}
                    onChange={(event) => setGroupThreshold(Number(event.target.value))}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card chart-panel">
          <div className="section-title">
            <h3>Visual</h3>
            <span className="tag">{filteredData.length.toLocaleString()} filas</span>
          </div>
          {activeFilters.length > 0 && (
            <div className="chips" aria-live="polite">
              {activeFilters.map((filter) => (
                <span key={filter} className="chip">
                  {filter}
                </span>
              ))}
            </div>
          )}
          <div className="panel-actions">
            <button className="btn btn-secondary" type="button" onClick={handleExportPng} disabled={!canExport}>
              Exportar PNG
            </button>
            <button className="btn btn-primary" type="button" onClick={handleExportPdf} disabled={!canExport}>
              Exportar PDF
            </button>
          </div>
          {filteredData.length === 0 && (
            <p className="notice">No hay datos para los filtros seleccionados.</p>
          )}
          {chartState.notice && (
            <p className="notice" role="status" aria-live="polite">
              {chartState.notice}
            </p>
          )}
          {chartTitle && chartState.option && (
            <h3 style={{ textAlign: "center", fontSize: "1rem", color: "var(--ink-soft)", margin: "4px 0" }}>{chartTitle}</h3>
          )}
          {chartState.option && (
            <ReactECharts ref={chartRef} option={chartState.option} style={{ height: "520px" }} />
          )}
          {chartState.hints.length > 0 && (
            <div style={{ background: "var(--surface-alt)", borderRadius: "var(--radius-sm)", padding: "12px 16px", borderLeft: "3px solid var(--primary)", display: "grid", gap: "4px" }}>
              {chartState.hints.map((hint, index) => (
                <p key={`hint-${index}`} style={{ fontSize: "0.875rem", color: "var(--ink-soft)" }}>{hint}</p>
              ))}
            </div>
          )}
          {chartState.table && (
            <div className="section">
              <div className="section-title">
                <h4>Tabla base</h4>
                <button className="btn btn-ghost" type="button" style={{ fontSize: "0.8rem" }} onClick={handleExportTableCsv}>
                  Descargar CSV
                </button>
              </div>
              <DataTable
                records={chartState.table}
                columns={Object.keys(chartState.table[0] ?? {})}
                maxRows={12}
                pageSize={12}
                ariaLabel="Tabla base del visual"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
