import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useNewsStore } from "../store/newsStore";
import { useScannerStore } from "../store/scannerStore";
import { useWatchlistStore } from "../store/watchlistStore";
import { useTradesStore } from "../store/tradesStore";
import { WsMessage, ScannerAlert } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const subscribedChannels = new Set<string>();

function getWs(token: string, onOpen: () => void) {
  if (globalWs && globalWs.readyState <= WebSocket.OPEN) return globalWs;

  globalWs = new WebSocket(WS_URL);

  globalWs.onopen = () => {
    globalWs!.send(JSON.stringify({ type: "auth", token }));
    onOpen();
  };

  globalWs.onclose = () => {
    globalWs = null;
    subscribedChannels.clear();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => getWs(token, onOpen), 3000);
  };

  return globalWs;
}

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const addArticle = useNewsStore((s) => s.addArticle);
  const backfill = useNewsStore((s) => s.backfill);
  const { addAlert, clearAlert, activeScanners } = useScannerStore();
  const updatePrice = useWatchlistStore((s) => s.updatePrice);
  const upsertTrade = useTradesStore((s) => s.upsertTrade);
  // Backfill articles from REST on mount (independent of WebSocket)
  useEffect(() => {
    if (!token) return;
    fetch("/api/news/recent", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((articles) => { if (Array.isArray(articles)) backfill(articles); })
      .catch(() => {});
  }, [token, backfill]);

  useEffect(() => {
    if (!token) return;

    const subscribeChannels = (ws: WebSocket) => {
      const channels = [
        "news",
        "trades",
        "scanner:news_flow",
        ...Array.from(activeScanners).map((id) => `scanner:${id}`),
      ];
      for (const ch of channels) {
        if (!subscribedChannels.has(ch)) {
          ws.send(JSON.stringify({ type: "subscribe", channel: ch }));
          subscribedChannels.add(ch);
        }
      }
    };

    const ws = getWs(token, () => subscribeChannels(globalWs!));

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;

        if (msg.type === "connected") {
          subscribeChannels(ws);
        } else if (msg.type === "news_article") {
          addArticle(msg.article);
        } else if (msg.type === "scanner_alert") {
          addAlert({ ...msg, alertedAt: new Date().toISOString() } as ScannerAlert);
        } else if (msg.type === "scanner_clear") {
          clearAlert(msg.scannerId, msg.ticker);
        } else if (msg.type === "quote_update") {
          updatePrice(msg.ticker, msg.price);
        } else if (msg.type === "trade_update") {
          upsertTrade(msg.trade);
        }
      } catch {
        // ignore
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [token, activeScanners, addArticle, backfill, addAlert, clearAlert, updatePrice, upsertTrade]);
}
