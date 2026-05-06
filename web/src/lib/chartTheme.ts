export interface ChartTheme {
  background: string;
  text: string;
  textMuted: string;
  axisLine: string;
  splitLine: string;
  tooltipBg: string;
  tooltipText: string;
}

const FALLBACK_THEME: ChartTheme = {
  background: "#ffffff",
  text: "#0f172a",
  textMuted: "#334155",
  axisLine: "#e2e8f0",
  splitLine: "#e2e8f0",
  tooltipBg: "rgba(15, 23, 42, 0.92)",
  tooltipText: "#f8fafc"
};

function readCssVar(name: string): string {
  if (typeof window === "undefined") {
    return "";
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value.trim();
}

function hexToRgba(hex: string, alpha: number): string | null {
  if (!hex || !hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    return null;
  }
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function readChartTheme(): ChartTheme {
  if (typeof window === "undefined") {
    return FALLBACK_THEME;
  }
  const background = readCssVar("--surface") || FALLBACK_THEME.background;
  const text = readCssVar("--ink") || FALLBACK_THEME.text;
  const textMuted = readCssVar("--ink-soft") || FALLBACK_THEME.textMuted;
  const axisLine = readCssVar("--border") || FALLBACK_THEME.axisLine;
  const splitLine = readCssVar("--border") || FALLBACK_THEME.splitLine;
  const tooltipBg = hexToRgba(text, 0.92) || FALLBACK_THEME.tooltipBg;
  const tooltipText = "#ffffff";

  return {
    background,
    text,
    textMuted,
    axisLine,
    splitLine,
    tooltipBg,
    tooltipText
  };
}

function applyAxisTheme(axis: any, theme: ChartTheme): any {
  if (!axis) return axis;
  const next = { ...axis };
  next.axisLabel = { ...(next.axisLabel ?? {}), color: theme.textMuted };
  next.axisLine = {
    ...(next.axisLine ?? {}),
    lineStyle: { ...(next.axisLine?.lineStyle ?? {}), color: theme.axisLine }
  };
  next.splitLine = {
    ...(next.splitLine ?? {}),
    lineStyle: { ...(next.splitLine?.lineStyle ?? {}), color: theme.splitLine }
  };
  next.nameTextStyle = { ...(next.nameTextStyle ?? {}), color: theme.textMuted };
  return next;
}

export function applyChartTheme(option: any, theme: ChartTheme): any {
  if (!option || !theme) return option;
  const next = { ...option };
  next.backgroundColor = theme.background;

  if (next.title) {
    next.title = {
      ...next.title,
      textStyle: { ...(next.title.textStyle ?? {}), color: theme.text }
    };
  }

  if (next.legend) {
    next.legend = {
      ...next.legend,
      textStyle: { ...(next.legend.textStyle ?? {}), color: theme.textMuted }
    };
  }

  if (next.tooltip) {
    next.tooltip = {
      ...next.tooltip,
      backgroundColor: theme.tooltipBg,
      textStyle: { ...(next.tooltip.textStyle ?? {}), color: theme.tooltipText }
    };
  }

  if (Array.isArray(next.xAxis)) {
    next.xAxis = next.xAxis.map((axis: any) => applyAxisTheme(axis, theme));
  } else {
    next.xAxis = applyAxisTheme(next.xAxis, theme);
  }

  if (Array.isArray(next.yAxis)) {
    next.yAxis = next.yAxis.map((axis: any) => applyAxisTheme(axis, theme));
  } else {
    next.yAxis = applyAxisTheme(next.yAxis, theme);
  }

  return next;
}
