import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { ChartTheme, readChartTheme } from "../lib/chartTheme";
import { getSvgSizeFromString, svgTextToPngBlob } from "../lib/svgExport";

const DEFAULT_CODE = `flowchart LR
  A[Inicio] --> B{Decision}
  B -->|Si| C[Accion]
  B -->|No| D[Revisar]
  C --> E[Fin]
  D --> E
`;

export default function MermaidPage() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chartTheme, setChartTheme] = useState<ChartTheme>(() => readChartTheme());
  const renderCounter = useRef(0);

  useEffect(() => {
    setChartTheme(readChartTheme());
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
  }, []);

  useEffect(() => {
    if (!code.trim()) {
      setSvg("");
      setError(null);
      return;
    }
    let active = true;
    const renderId = `mermaid-${nanoid()}-${renderCounter.current++}`;

    mermaid
      .render(renderId, code)
      .then((result) => {
        if (!active) return;
        setSvg(result.svg);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "No se pudo renderizar el diagrama.";
        setError(message);
        setSvg("");
      });

    return () => {
      active = false;
    };
  }, [code]);

  const handleExportSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, "mermaid_gencla.svg");
  };

  const handleExportPng = async () => {
    if (!svg) return;
    const size = getSvgSizeFromString(svg);
    const pngBlob = await svgTextToPngBlob(svg, size, chartTheme.background);
    saveAs(pngBlob, "mermaid_gencla.png");
  };

  return (
    <div className="section">
      <div className="hero">
        <span className="tag">Diagramas</span>
        <h2>Editor Mermaid</h2>
        <p>
          Escribe diagramas en Mermaid, visualiza al instante y exporta en SVG o PNG.
        </p>
      </div>

      <div className="diagram-grid">
        <div className="card diagram-panel">
          <div className="section-title">
            <h3>Codigo Mermaid</h3>
            <div className="panel-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setCode(DEFAULT_CODE)}>
                Cargar ejemplo
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setCode("")}>Limpiar</button>
            </div>
          </div>
          <textarea
            className="editor-textarea"
            rows={16}
            value={code}
            aria-label="Codigo Mermaid"
            onChange={(event) => setCode(event.target.value)}
            placeholder="Escribe tu diagrama Mermaid aqui"
          />
        </div>

        <div className="card diagram-panel">
          <div className="section-title">
            <h3>Vista previa</h3>
            <div className="panel-actions">
              <button className="btn btn-secondary" type="button" onClick={handleExportSvg} disabled={!svg}>
                Exportar SVG
              </button>
              <button className="btn btn-primary" type="button" onClick={handleExportPng} disabled={!svg}>
                Exportar PNG
              </button>
            </div>
          </div>

          {error && <p className="notice">{error}</p>}
          {!error && !svg && <p className="notice">Ingresa un diagrama para previsualizar.</p>}

          <div className="diagram-canvas" aria-label="Vista previa Mermaid">
            {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
