import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore";
import { usePageStore } from "./store/pageStore";
import { LoginPage } from "./components/auth/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { TradesPage } from "./pages/TradesPage";
import { NewsFeedsPage } from "./pages/NewsFeedsPage";
import RecapPage from "./pages/RecapPage";

export default function App() {
  const { token, needsSetup, setNeedsSetup } = useAuthStore();
  const page = usePageStore((s) => s.page);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d: { needsSetup: boolean }) => {
        setNeedsSetup(d.needsSetup);
      })
      .catch(() => setNeedsSetup(false))
      .finally(() => setChecking(false));
  }, [setNeedsSetup]);

  if (checking) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="text-muted text-sm font-mono">Loading…</span>
      </div>
    );
  }

  if (!token || needsSetup) {
    return <LoginPage isSetup={needsSetup} />;
  }

  if (page === "trades") return <TradesPage />;
  if (page === "newsfeeds") return <NewsFeedsPage />;
  if (page === "recap") return <RecapPage />;
  return <Dashboard />;
}
