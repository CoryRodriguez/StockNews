import { useAuthStore } from "../../store/authStore";
import { usePageStore } from "../../store/pageStore";

export function TopNav() {
  const logout = useAuthStore((s) => s.logout);
  const { page, setPage } = usePageStore();

  const navBtn = (target: typeof page, label: string) => (
    <button
      onClick={() => setPage(target)}
      className={`text-[11px] font-medium px-2.5 py-1 rounded transition-colors ${
        page === target
          ? "text-white bg-raised"
          : "text-muted hover:text-white hover:bg-raised"
      }`}
    >
      {label}
    </button>
  );

  return (
    <nav className="h-11 bg-panel border-b border-border flex items-center px-4 gap-1 shrink-0">
      <span className="text-white font-bold text-sm mr-2 tracking-tight">IsItaBuy?</span>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Page navigation tabs */}
      <div className="flex items-center gap-0.5">
        {navBtn("newsfeeds", "Dashboard")}
        {navBtn("scanner", "Scanner")}
        {navBtn("trades", "Trades")}
        {navBtn("bot", "Bot")}
        {navBtn("recap", "Recap")}
        {navBtn("history", "History")}
        {navBtn("catalyst", "Catalyst")}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[10px] font-mono text-muted">
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
          className="text-muted hover:text-white text-[10px] font-medium px-2 py-1 rounded border border-border hover:bg-raised transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
