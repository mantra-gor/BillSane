import { Suspense } from "react";
import Router from "./router/Router";
import FallbackSpinner from "./components/ui/spinners/FallbackSpinner";

function App() {
  return (
    <Suspense fallback={<FallbackSpinner />}>
      <Router />
    </Suspense>
  );
}

export default App;
