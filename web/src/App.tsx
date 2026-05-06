import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { DataProvider } from "./store/DataContext";
import Home from "./pages/Home";
import Homologacion from "./pages/Homologacion";
import Ishikawa from "./pages/Ishikawa";
import MermaidPage from "./pages/Mermaid";
import Visualizador from "./pages/Visualizador";

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/homologacion" element={<Homologacion />} />
            <Route path="/visualizador" element={<Visualizador />} />
            <Route path="/ishikawa" element={<Ishikawa />} />
            <Route path="/mermaid" element={<MermaidPage />} />
          </Routes>
        </AppShell>
      </DataProvider>
    </BrowserRouter>
  );
}
