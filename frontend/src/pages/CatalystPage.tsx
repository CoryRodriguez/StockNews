import { TopNav } from "../components/layout/TopNav";
import { useCatalystStore, type CatalystTab } from "../store/catalystStore";
import { KeywordTrackerPanel } from "../components/panels/KeywordTrackerPanel";
import { UserArticlesPanel } from "../components/panels/UserArticlesPanel";
import { DailyMoversPanel } from "../components/panels/DailyMoversPanel";

const TABS: { id: CatalystTab; label: string }[] = [
  { id: "keywords", label: "Keywords" },
  { id: "articles", label: "User Submitted" },
  { id: "movers", label: "Daily Movers" },
];

export function CatalystPage() {
  const { activeTab, setActiveTab } = useCatalystStore();

  return (
    <div className="min-h-screen bg-base flex flex-col">
      <TopNav />

      {/* Tab bar */}
      <div className="bg-panel border-b border-border px-4 flex items-center gap-1 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-[11px] font-medium px-3 py-2 border-b-2 transition-colors ${
              activeTab === tab.id
                ? "text-white border-accent"
                : "text-muted border-transparent hover:text-white hover:border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-panel">
        {activeTab === "keywords" && <KeywordTrackerPanel />}
        {activeTab === "articles" && <UserArticlesPanel />}
        {activeTab === "movers" && <DailyMoversPanel />}
      </div>
    </div>
  );
}
