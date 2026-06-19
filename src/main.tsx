import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global protection against DOM mutation errors from browser extensions
const DOM_ERROR_PATTERNS = ['removeChild', 'insertBefore', 'appendChild', 'replaceChild', 'NotFoundError'];

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (DOM_ERROR_PATTERNS.some((p) => msg.includes(p))) {
    console.warn('[Global] DOM mutation error suppressed:', msg);
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '');
  if (DOM_ERROR_PATTERNS.some((p) => msg.includes(p))) {
    console.warn('[Global] DOM mutation rejection suppressed:', msg);
    event.preventDefault();
  }
});

// build marker — usado para confirmar que o deploy mais recente subiu (pode remover depois)
console.info('metric-streamer BUILD-2026-06-19-vendas');

createRoot(document.getElementById("root")!).render(<App />);
