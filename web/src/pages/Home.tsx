import { Link } from "react-router-dom";

import { useDataContext } from "../store/DataContext";

export default function Home() {
  const { profile } = useDataContext();

  return (
    <div className="section">
      <div className="hero">
        <span className="tag">Proyecto academico</span>
        <h1>Homologador y Visualizador BI</h1>
        <p>
          Plataforma academica para Ingenieria Clinica Aplicada. Normaliza datos,
          deja trazabilidad y construye visuales tipo BI con foco en calidad
          asistencial.
        </p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link to="/homologacion" className="btn btn-primary">
            Iniciar homologacion
          </Link>
          <Link to="/visualizador" className="btn btn-ghost">
            Ir al visualizador
          </Link>
        </div>
        {profile && (
          <span className="badge">
            Dataset cargado: {profile.rowCount.toLocaleString()} filas
          </span>
        )}
      </div>

      <div className="cards-grid">
        <div className="card">
          <h3>Homologacion controlada</h3>
          <p>
            Normaliza valores por columna, registra cambios y valida resultados
            antes de descargar.
          </p>
        </div>
        <div className="card">
          <h3>Visualizacion estrategica</h3>
          <p>
            Crea graficos tipo BI con jerarquia temporal, filtros y ranking de
            categorias.
          </p>
        </div>
        <div className="card">
          <h3>Trazabilidad academica</h3>
          <p>
            Documenta el proceso de limpieza, ideal para informes y estudios en
            Ingenieria Clinica.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Flujo recomendado</h3>
        <ol style={{ display: "grid", gap: "8px", paddingLeft: "18px" }}>
          <li>Carga tu dataset en Excel o CSV.</li>
          <li>Homologa valores criticos y valida con filtros.</li>
          <li>Construye graficos y exporta hallazgos.</li>
        </ol>
      </div>
    </div>
  );
}
