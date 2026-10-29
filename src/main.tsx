import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./ui/ErrorBoundary.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary
      onError={(e) => console.error("[app] fatal UI error:", e)}
      fallback={(e) => (
        <div className="stage stage-error" role="alert">
          <p>
            The app hit an unexpected error ({e.message}). Your microphone has been released.{" "}
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
