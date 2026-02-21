import GridLayout, { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useEffect } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import { useSocket } from "../hooks/useSocket";
import { useAuthStore } from "../store/authStore";
import { useWatchlistStore } from "../store/watchlistStore";
import { TopNav } from "../components/layout/TopNav";
import { ScannerPanel } from "../components/panels/ScannerPanel";
import { ChartPanel } from "../components/panels/ChartPanel";
import { NewsPanel } from "../components/panels/NewsPanel";
import { WatchlistPanel } from "../components/panels/WatchlistPanel";
import { GridPanel, Watchlist } from "../types";

function PanelWrapper({ panel, children }: { panel: GridPanel; children: React.ReactNode }) {
  return (
    <div className="h-full border border-border rounded overflow-hidden flex flex-col">
      {children}
    </div>
  );
}

function renderPanel(panel: GridPanel) {
  switch (panel.type) {
    case "scanner":
      return (
        <ScannerPanel
          scannerId={panel.scannerId ?? "news_flow"}
          title={panel.title ?? panel.scannerId ?? "Scanner"}
        />
      );
    case "chart":
      return <ChartPanel panelId={panel.id} symbol={panel.symbol ?? "NASDAQ:AAPL"} />;
    case "news":
      return (
        <NewsPanel
          newsMode={panel.newsMode ?? "firehose"}
          title={panel.title ?? "News"}
        />
      );
    case "watchlist":
      return <WatchlistPanel />;
    default:
      return null;
  }
}

export function Dashboard() {
  useSocket();
  const { panels, setPanels } = useDashboardStore();
  const token = useAuthStore((s) => s.token);
  const setLists = useWatchlistStore((s) => s.setLists);

  useEffect(() => {
    if (!token) return;
    fetch("/api/watchlists", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((lists: Watchlist[]) => setLists(lists))
      .catch(() => {});
  }, [token, setLists]);

  const layout: Layout[] = panels.map((p) => ({
    i: p.id,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    minW: 2,
    minH: 6,
  }));

  const onLayoutChange = (newLayout: Layout[]) => {
    const updated = panels.map((panel) => {
      const l = newLayout.find((item) => item.i === panel.id);
      if (!l) return panel;
      return { ...panel, x: l.x, y: l.y, w: l.w, h: l.h };
    });
    setPanels(updated);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />
      <div className="flex-1 overflow-auto">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={30}
          width={window.innerWidth}
          onLayoutChange={onLayoutChange}
          draggableHandle=".panel-drag-handle"
          margin={[4, 4]}
          containerPadding={[4, 4]}
        >
          {panels.map((panel) => (
            <div key={panel.id}>
              <PanelWrapper panel={panel}>
                {renderPanel(panel)}
              </PanelWrapper>
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
