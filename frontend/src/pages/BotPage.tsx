import { TopNav } from "../components/layout/TopNav";
import { BotPanel } from "../components/panels/BotPanel";

export function BotPage() {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />
      <div className="flex-1 overflow-auto p-2">
        <div className="h-full border border-border rounded overflow-hidden">
          <BotPanel />
        </div>
      </div>
    </div>
  );
}
