import { useState } from "react";
import { useDataContext } from "../store/DataContext";

export default function AuditLog() {
  const { history, clearHistory, removeHomologation } = useDataContext();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (history.length === 0) {
    return <p className="notice">Aun no hay homologaciones registradas.</p>;
  }

  const handleRemove = (id: string) => {
    if (confirmId === id) {
      removeHomologation(id);
      setConfirmId(null);
    } else {
      setConfirmId(id);
    }
  };

  return (
    <div className="section">
      <div className="section-title">
        <h3>Historial de cambios</h3>
        <button className="btn btn-ghost" type="button" onClick={clearHistory}>
          Limpiar historial
        </button>
      </div>
      <div className="controls">
        {history.map((entry, index) => (
          <div
            key={entry.id}
            className="card"
            style={{ opacity: index === 0 ? 1 : 0.85 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <strong>{entry.column}</strong>
                {index === 0 && (
                  <span
                    className="chip"
                    style={{ fontSize: "0.7rem", background: "rgba(245,158,11,0.12)", color: "#b45309" }}
                  >
                    más reciente
                  </span>
                )}
              </div>
              <span className="tag" style={{ whiteSpace: "nowrap" }}>
                {entry.affectedRows.toLocaleString()} filas
              </span>
            </div>

            <p style={{ margin: "4px 0" }}>
              <span style={{ color: "var(--ink-muted)" }}>Origen: </span>
              {entry.fromValues.slice(0, 6).join(", ")}
              {entry.fromValues.length > 6 ? ` (+${entry.fromValues.length - 6} más)` : ""}
              <br />
              <span style={{ color: "var(--ink-muted)" }}>Destino: </span>
              <strong>{entry.toValue}</strong>
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <small style={{ color: "var(--ink-muted)" }}>
                {new Date(entry.timestamp).toLocaleString("es-CL")}
              </small>

              {confirmId === entry.id ? (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ fontSize: "0.8rem", padding: "6px 10px", color: "#b91c1c", borderColor: "#fca5a5" }}
                    onClick={() => handleRemove(entry.id)}
                  >
                    Confirmar revertir
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ fontSize: "0.8rem", padding: "6px 10px" }}
                    onClick={() => setConfirmId(null)}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ fontSize: "0.8rem", padding: "6px 10px" }}
                  onClick={() => handleRemove(entry.id)}
                  title={`Revertir la homologación "${entry.fromValues.join(", ")} → ${entry.toValue}" en columna ${entry.column}`}
                >
                  Revertir este cambio
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
