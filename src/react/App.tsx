import { Suspense, useEffect } from "react";
import Router from "./router/Router";
import FallbackSpinner from "./components/ui/spinners/FallbackSpinner";

function App() {
  useEffect(() => {
    const handleZoomShortcut = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "=")
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleZoomShortcut);

    return () => {
      window.removeEventListener("keydown", handleZoomShortcut);
    };
  }, []);

  return (
    <Suspense fallback={<FallbackSpinner />}>
      <Router />
    </Suspense>
  );
}

export default App;
