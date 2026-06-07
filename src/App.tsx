import { HashRouter } from "react-router-dom";
import { AppLayout } from "./components/common/AppLayout";
import { AppRoutes } from "./routes/AppRoutes";

export default function App() {
  return (
    <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppLayout>
        <AppRoutes />
      </AppLayout>
    </HashRouter>
  );
}
