import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installBrtDefaults } from "./lib/brt";

installBrtDefaults();

createRoot(document.getElementById("root")!).render(<App />);
