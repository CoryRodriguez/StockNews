import { useDashboardStore } from "../../store/dashboardStore";
import { useAuthStore } from "../../store/authStore";
import { SavedLayout } from "../../types";

const PRESET_LAYOUTS: SavedLayout[] = [
  {
    id: "preset-premarket",
    name: "Pre-Market",
    panels: [
      { id: "s1", type: "scanner", scannerId: "news_flow", title: "News Flow",   x: 0, y: 0,  w: 3, h: 14 },
      { id: "s2", type: "scanner", scannerId: "gap_up",    title: "Gap Up",      x: 0, y: 14, w: 3, h: 14 },
      { id: "c1", type: "chart",   symbol: "NASDAQ:AAPL",                         x: 3, y: 0,  w: 6, h: 18 },
      { id: "w1", type: "watchlist", title: "Watchlist",                           x: 3, y: 18, w: 6, h: 10 },
      { id: "n1", type: "news",    newsMode: "firehose",   title: "News Feed",   x: 9, y: 0,  w: 3, h: 28 },
    ],
  },
  {
    id: "preset-open",
    name: "Market Open",
    panels: [
      { id: "s1", type: "scanner", scannerId: "momentum",  title: "Momentum",    x: 0, y: 0,  w: 3, h: 14 },
      { id: "s2", type: "scanner", scannerId: "high_rvol", title: "High RVOL",   x: 0, y: 14, w: 3, h: 14 },
      { id: "c1", type: "chart",   symbol: "NASDAQ:AAPL",                         x: 3, y: 0,  w: 5, h: 14 },
      { id: "c2", type: "chart",   symbol: "NYSE:SPY",                            x: 8, y: 0,  w: 4, h: 14 },
      { id: "w1", type: "watchlist", title: "Watchlist",                           x: 3, y: 14, w: 9, h: 14 },
    ],
  },
];

export function TopNav() {
  const { savedLayouts, loadLayout } = useDashboardStore();
  const logout = useAuthStore((s) => s.logout);

  const allLayouts = [...PRESET_LAYOUTS, ...savedLayouts];

  return (
    <nav className="h-10 bg-panel border-b border-border flex items-center px-3 gap-3 shrink-0 font-mono">
      <span className="text-white font-semibold text-sm mr-2">DTDash</span>

      <div className="flex items-center gap-1">
        {allLayouts.map((layout) => (
          <button
            key={layout.id}
            onClick={() => loadLayout(layout)}
            className="text-muted hover:text-white text-xs px-2 py-1 rounded hover:bg-surface transition-colors"
          >
            {layout.name}
          </button>
        ))}
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
