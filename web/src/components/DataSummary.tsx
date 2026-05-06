import { useDataContext } from "../store/DataContext";

export default function DataSummary() {
  const { profile, fileInfo } = useDataContext();

  if (!profile || !fileInfo) {
    return null;
  }

  const sizeMb = (fileInfo.size / 1024 / 1024).toFixed(2);

  return (
    <div className="card">
      <h3>Resumen del dataset</h3>
      <div className="cards-grid">
        <div className="kpi">
          <span>Archivo</span>
          <strong>{fileInfo.name}</strong>
        </div>
        <div className="kpi">
          <span>Filas</span>
          <strong>{profile.rowCount.toLocaleString()}</strong>
        </div>
        <div className="kpi">
          <span>Columnas</span>
          <strong>{profile.columns.length}</strong>
        </div>
        <div className="kpi">
          <span>Tamano</span>
          <strong>{sizeMb} MB</strong>
        </div>
      </div>
    </div>
  );
}
