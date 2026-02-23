import { useDashboardStore } from "../../store/dashboardStore";
import { useAuthStore } from "../../store/authStore";
import { SavedLayout } from "../../types";

const PRESET_LAYOUTS: SavedLayout[] = [];

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
