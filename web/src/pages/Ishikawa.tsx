import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { ChartTheme, readChartTheme } from "../lib/chartTheme";
import { getSvgSizeFromElement, svgTextToPngBlob } from "../lib/svgExport";

interface CauseItem {
  cause: string;
  subcauses: string[];
}

interface CategoryState {
  id: string;
  name: string;
  text: string;
}

const DEFAULT_CATEGORIES = [
  "Metodo",
  "Maquina",
  "Mano de obra",
  "Materiales",
  "Medicion",
  "Medio ambiente"
];

const CATEGORY_COLORS = ["#6C5CE7", "#E17055", "#00B894", "#FDCB6E", "#00A8FF", "#0984E3"];

const MAX_CAUSES = 6;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function parseCauses(text: string): CauseItem[] {
  const causes: CauseItem[] = [];
  let current: CauseItem | null = null;
  text.split(/\r?\n/).forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    if (/^[-*>]/.test(raw)) {
      const sub = raw.replace(/^[-*>]\s*/, "").trim();
      if (!sub) return;
      if (!current) {
        current = { cause: sub, subcauses: [] };
        causes.push(current);
      } else {
        current.subcauses.push(sub);
      }
      return;
    }
    current = { cause: raw, subcauses: [] };
    causes.push(current);
  });
  return causes;
}

function boxWidth(text: string, base = 120, charWidth = 7, pad = 24): number {
  return Math.max(base, text.length * charWidth + pad);
}

function buildIshikawaSvg(
  problem: string,
  categories: CategoryState[],
  theme: ChartTheme,
  width = 1000,
  height = 640
): string {
  const safeProblem = problem.trim();
  if (!safeProblem || categories.length === 0) {
    return "";
  }

  const categoryData = categories.map((cat) => ({
    name: cat.name.trim() || "Categoria",
    causes: parseCauses(cat.text)
  }));

  let maxCauseLen = 0;
  let maxCatLen = 0;
  categoryData.forEach((cat) => {
    maxCatLen = Math.max(maxCatLen, cat.name.length);
    cat.causes.forEach((item) => {
      maxCauseLen = Math.max(maxCauseLen, item.cause.length);
    });
  });

  const maxCauseW = boxWidth("X".repeat(maxCauseLen), 130);
  const maxCatW = boxWidth("X".repeat(maxCatLen), 120);
  const effectW = boxWidth(safeProblem, 130);

  const leftPad = Math.max(0, maxCauseW - 180 + 32);
  const rightPad = Math.max(0, width - 150 + effectW - width);
  const viewMinX = -leftPad;
  const viewWidth = width + leftPad + rightPad;

  const cx = width - 140;
  const cy = height / 2;
  const topCats = categoryData.slice(0, Math.ceil(categoryData.length / 2));
  const bottomCats = categoryData.slice(Math.ceil(categoryData.length / 2));
  const pairCount = Math.max(topCats.length, bottomCats.length, 1);
  const spineStart = 180;
  const spineEnd = cx - 40;
  const sectionGap = (spineEnd - spineStart) / (pairCount + 1);

  const topY = 140;
  const bottomY = height - 140;
  const attachX = Array.from({ length: pairCount }, (_, i) => spineStart + sectionGap * (i + 1));

  const offsets = [
    [0, 0],
    [22, 28],
    [-26, -40],
    [36, 56],
    [-48, -72],
    [60, 88]
  ];

  const svg: string[] = [];
  svg.push(
    `<svg width="100%" height="100%" viewBox="${viewMinX} 0 ${viewWidth} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:${theme.background};display:block;">`
  );
  svg.push(
    `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="${theme.axisLine}" /></marker></defs>`
  );
  svg.push(`<line x1="${spineStart}" y1="${cy}" x2="${spineEnd}" y2="${cy}" stroke="${theme.axisLine}" stroke-width="2" />`);
  svg.push(`<line x1="${spineEnd}" y1="${cy}" x2="${cx - 10}" y2="${cy}" stroke="${theme.axisLine}" stroke-width="2" marker-end="url(#arrow)" />`);

  const effectText = escapeXml(safeProblem);
  svg.push(rect(cx - 10, cy - 26, effectW, 52, "#5B8FF9", "#2B5FB5", effectText, "#ffffff", safeProblem, 13));

  topCats.forEach((cat, idx) => {
    const ax = attachX[Math.min(idx, attachX.length - 1)];
    const catColor = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    const catText = escapeXml(cat.name);
    const catW = Math.max(maxCatW, boxWidth(cat.name, 120));
    svg.push(`<line x1="${ax}" y1="${cy}" x2="${ax - 120}" y2="${topY}" stroke="${theme.axisLine}" stroke-width="2" />`);
    svg.push(rect(ax - 210, topY - 18, catW, 36, catColor, "#444", catText, "#ffffff", cat.name, 13));

    const causes = cat.causes.slice(0, MAX_CAUSES);
    const n = Math.min(MAX_CAUSES, causes.length);
    causes.forEach((item, cidx) => {
      const t = (cidx + 1) / (n + 1);
      const px = ax - 120 * t;
      const py = cy - (cy - topY) * t;
      const boxW = boxWidth(item.cause, 130);
      const [dx, dy] = offsets[Math.min(cidx, offsets.length - 1)];
      const boxCenterX = px - 120 - dx;
      const boxCenterY = py - dy;
      const boxH = 26;
      const boxX = boxCenterX - boxW / 2;
      const boxY = boxCenterY - boxH / 2;
      const title = [item.cause, ...item.subcauses].join("\n");
      svg.push(rect(boxX, boxY, boxW, boxH, "#E8E8FF", "#B6A7FF", escapeXml(item.cause), "#222222", title, 12));
      svg.push(`<line x1="${boxX + boxW}" y1="${boxY + boxH / 2}" x2="${px}" y2="${py}" stroke="${theme.axisLine}" stroke-width="1.5" marker-end="url(#arrow)" />`);
    });
  });

  bottomCats.forEach((cat, idx) => {
    const ax = attachX[Math.min(idx, attachX.length - 1)];
    const colorIndex = idx + topCats.length;
    const catColor = CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length];
    const catText = escapeXml(cat.name);
    const catW = Math.max(maxCatW, boxWidth(cat.name, 120));
    svg.push(`<line x1="${ax}" y1="${cy}" x2="${ax - 120}" y2="${bottomY}" stroke="${theme.axisLine}" stroke-width="2" />`);
    svg.push(rect(ax - 210, bottomY - 18, catW, 36, catColor, "#444", catText, "#ffffff", cat.name, 13));

    const causes = cat.causes.slice(0, MAX_CAUSES);
    const n = Math.min(MAX_CAUSES, causes.length);
    causes.forEach((item, cidx) => {
      const t = (cidx + 1) / (n + 1);
      const px = ax - 120 * t;
      const py = cy + (bottomY - cy) * t;
      const boxW = boxWidth(item.cause, 130);
      const [dx, dy] = offsets[Math.min(cidx, offsets.length - 1)];
      const boxCenterX = px - 120 - dx;
      const boxCenterY = py + dy;
      const boxH = 26;
      const boxX = boxCenterX - boxW / 2;
      const boxY = boxCenterY - boxH / 2;
      const title = [item.cause, ...item.subcauses].join("\n");
      svg.push(rect(boxX, boxY, boxW, boxH, "#E8E8FF", "#B6A7FF", escapeXml(item.cause), "#222222", title, 12));
      svg.push(`<line x1="${boxX + boxW}" y1="${boxY + boxH / 2}" x2="${px}" y2="${py}" stroke="${theme.axisLine}" stroke-width="1.5" marker-end="url(#arrow)" />`);
    });
  });

  svg.push("</svg>");
  return svg.join("");
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  text: string,
  textColor: string,
  titleText: string,
  fontSize: number
): string {
  const title = titleText ? escapeXml(titleText) : "";
  return (
    `<g>` +
    `<title>${title}</title>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" />` +
    `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-family="sans-serif">${text}</text>` +
    `</g>`
  );
}

export default function Ishikawa() {
  const [problem, setProblem] = useState("");
  const [categories, setCategories] = useState<CategoryState[]>(
    DEFAULT_CATEGORIES.map((name) => ({ id: nanoid(), name, text: "" }))
  );
  const [chartTheme, setChartTheme] = useState<ChartTheme>(() => readChartTheme());
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChartTheme(readChartTheme());
  }, []);

  const svgMarkup = useMemo(
    () => buildIshikawaSvg(problem, categories, chartTheme, 1000, 640),
    [problem, categories, chartTheme]
  );

  const handleAddCategory = () => {
    setCategories((prev) => [...prev, { id: nanoid(), name: "Nueva categoria", text: "" }]);
  };

  const handleResetCategories = () => {
    setCategories(DEFAULT_CATEGORIES.map((name) => ({ id: nanoid(), name, text: "" })));
  };

  const handleExportSvg = () => {
    const svgEl = previewRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgText = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, "ishikawa_gencla.svg");
  };

  const handleExportPng = async () => {
    const svgEl = previewRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgText = new XMLSerializer().serializeToString(svgEl);
    const size = getSvgSizeFromElement(svgEl);
    const pngBlob = await svgTextToPngBlob(svgText, size, chartTheme.background);
    saveAs(pngBlob, "ishikawa_gencla.png");
  };

  return (
    <div className="section">
      <div className="hero">
        <span className="tag">Calidad clinica</span>
        <h2>Diagrama de Ishikawa</h2>
        <p>
          Documenta causas raiz por categoria, agrega subcausas y exporta el diagrama
          para tus informes academicos.
        </p>
      </div>

      <div className="diagram-grid">
        <div className="card diagram-panel">
          <div className="section-title">
            <h3>Configuracion</h3>
            <div className="panel-actions">
              <button className="btn btn-ghost" type="button" onClick={handleResetCategories}>
                Restablecer 6M
              </button>
              <button className="btn btn-secondary" type="button" onClick={handleAddCategory}>
                Agregar categoria
              </button>
            </div>
          </div>

          <div className="field">
            <label>Problema principal</label>
            <input
              type="text"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Ej: Alto tiempo de espera en admision"
            />
          </div>

          <p className="muted">
            Escribe una causa por linea. Usa "-" para subcausas debajo de la causa principal.
          </p>

          <div className="editor-stack">
            {categories.map((cat) => (
              <div key={cat.id} className="card">
                <div className="section-title">
                  <input
                    type="text"
                    value={cat.name}
                    aria-label="Nombre de categoria"
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((item) => (item.id === cat.id ? { ...item, name: event.target.value } : item))
                      )
                    }
                  />
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setCategories((prev) => prev.filter((item) => item.id !== cat.id))}
                  >
                    Quitar
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={cat.text}
                  aria-label={`Causas para ${cat.name}`}
                  onChange={(event) =>
                    setCategories((prev) =>
                      prev.map((item) => (item.id === cat.id ? { ...item, text: event.target.value } : item))
                    )
                  }
                  placeholder="Ej: Procedimiento no estandarizado\n- Variaciones por turno"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="card diagram-panel">
          <div className="section-title">
            <h3>Diagrama</h3>
            <div className="panel-actions">
              <button className="btn btn-secondary" type="button" onClick={handleExportSvg} disabled={!svgMarkup}>
                Exportar SVG
              </button>
              <button className="btn btn-primary" type="button" onClick={handleExportPng} disabled={!svgMarkup}>
                Exportar PNG
              </button>
            </div>
          </div>

          {!problem && (
            <p className="notice">Ingresa el problema principal para generar el diagrama.</p>
          )}

          <div ref={previewRef} className="diagram-canvas" aria-label="Diagrama de Ishikawa">
            {svgMarkup && <div dangerouslySetInnerHTML={{ __html: svgMarkup }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
