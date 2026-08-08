import { useEffect } from "react";
import Router from "./router/Router";
import ToastProvider from "./components/ui/feedback/ToastProvider";

function App() {
  useEffect(() => {
    // Zoom shortcuts resize a desktop app's chrome in ways the layout doesn't
    // expect, so they stay suppressed.
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
    <ToastProvider>
      <Router />
    </ToastProvider>
  );
}

export default App;
