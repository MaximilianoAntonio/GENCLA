import { NavLink } from "react-router-dom";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido principal
      </a>
      <aside className="sidebar" aria-label="Panel lateral">
        <div className="brand">
          <h2>GENCLA</h2>
          <span>Ingenieria Clinica Aplicada</span>
        </div>
        <nav className="nav" aria-label="Navegacion principal">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}
            >Inicio</NavLink>
          <NavLink to="/homologacion" className={({ isActive }) => (isActive ? "active" : "")}
            >Homologacion</NavLink>
          <NavLink to="/visualizador" className={({ isActive }) => (isActive ? "active" : "")}
            >Visualizador BI</NavLink>
          <NavLink to="/ishikawa" className={({ isActive }) => (isActive ? "active" : "")}
            >Ishikawa</NavLink>
          <NavLink to="/mermaid" className={({ isActive }) => (isActive ? "active" : "")}
            >Mermaid</NavLink>
        </nav>
        <div className="card" style={{ background: "rgba(255,255,255,0.08)", color: "#f8fafc" }}>
          <strong>Proyecto academico</strong>
          <p style={{ color: "rgba(248,250,252,0.7)", fontSize: "0.85rem" }}>
            Homologacion y visualizacion avanzada para Ingenieria Clinica Aplicada.
          </p>
        </div>
      </aside>
      <main className="content" id="main-content" tabIndex={-1} role="main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
