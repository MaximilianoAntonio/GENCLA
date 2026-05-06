import { useState } from "react";

import { parseFile } from "../lib/fileParser";
import { useDataContext } from "../store/DataContext";

export default function DataUpload() {
  const { setData } = useDataContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const records = await parseFile(file);
      if (records.length === 0) {
        throw new Error("El archivo no contiene registros validos.");
      }
      setData(records, file);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el archivo.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" aria-busy={loading}>
      <h3>Carga de datos</h3>
      <p className="notice">
        Acepta archivos CSV, Excel o Parquet. El procesamiento se realiza en tu navegador.
      </p>
      <div className="field">
        <label htmlFor="data-upload">Selecciona un archivo</label>
        <input
          id="data-upload"
          type="file"
          accept=".csv,.xlsx,.xls,.parquet"
          onChange={handleFile}
          disabled={loading}
          aria-describedby="data-upload-help"
        />
        <small id="data-upload-help" className="muted">
          Recomendacion: si el archivo supera 50 MB, considera filtrar columnas antes de subir.
        </small>
      </div>
      {loading && (
        <span className="badge" role="status" aria-live="polite">
          Procesando archivo...
        </span>
      )}
      {error && (
        <p style={{ color: "#b91c1c" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
