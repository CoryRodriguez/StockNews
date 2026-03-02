import { useAuthStore } from "../../store/authStore";
import { usePageStore } from "../../store/pageStore";

export function TopNav() {
  const logout = useAuthStore((s) => s.logout);
  const { page, setPage } = usePageStore();

  const navBtn = (target: typeof page, label: string) => (
    <button
      onClick={() => setPage(target)}
      className={`text-xs px-2.5 py-1 rounded transition-colors ${
        page === target
          ? "text-white bg-surface"
          : "text-muted hover:text-white hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <nav className="h-10 bg-panel border-b border-border flex items-center px-3 gap-3 shrink-0 font-mono">
      <span className="text-white font-semibold text-sm mr-1">DTDash</span>

      {/* Page navigation tabs */}
      <div className="flex items-center gap-0.5 border-r border-border pr-3">
        {navBtn("newsfeeds", "Dashboard")}
        {navBtn("scanner", "Scanner")}
        {navBtn("trades", "Trades")}
        {navBtn("bot", "Bot")}
        {navBtn("recap", "Recap")}
        {navBtn("history", "History")}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-muted">
          {new Date().toLocaleTimeString("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}{" "}
          ET
        </span>
        <button
          onClick={logout}
          className="text-muted hover:text-white text-xs px-2 py-1 rounded hover:bg-surface"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
