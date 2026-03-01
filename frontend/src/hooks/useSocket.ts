import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { useNewsStore } from "../store/newsStore";
import { useScannerStore } from "../store/scannerStore";
import { useWatchlistStore } from "../store/watchlistStore";
import { useTradesStore } from "../store/tradesStore";
import { useBotStore } from "../store/botStore";
import { WsMessage, ScannerAlert } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWs(token: string, onOpen: () => void) {
  if (globalWs && globalWs.readyState <= WebSocket.OPEN) return globalWs;

  globalWs = new WebSocket(WS_URL);

  globalWs.onopen = () => {
    globalWs!.send(JSON.stringify({ type: "auth", token }));
    onOpen();
  };

  globalWs.onclose = () => {
    globalWs = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => getWs(token, onOpen), 3000);
  };

  return globalWs;
}

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const addArticle = useNewsStore((s) => s.addArticle);
  const { addAlert, clearAlert, activeScanners } = useScannerStore();
  const updatePrice = useWatchlistStore((s) => s.updatePrice);
  const upsertTrade = useTradesStore((s) => s.upsertTrade);
  const setBotStatus = useBotStore((s) => s.setStatus);
  const prependBotTrade = useBotStore((s) => s.prependTrade);
  const prependBotSignal = useBotStore((s) => s.prependSignal);
  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;

    const subscribeChannels = (ws: WebSocket) => {
      const channels = [
        "news",
        "trades",
        "bot",
        "scanner:news_flow",
        ...Array.from(activeScanners).map((id) => `scanner:${id}`),
      ];
      for (const ch of channels) {
        if (!subscribedRef.current.has(ch)) {
          ws.send(JSON.stringify({ type: "subscribe", channel: ch }));
          subscribedRef.current.add(ch);
        }
      }
    };

    const ws = getWs(token, () => subscribeChannels(globalWs!));

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;

        if (msg.type === "connected") {
          subscribedRef.current.clear();  // FIX: clear so all channels re-subscribe after reconnect
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
        } else if (msg.type === "bot_status_update") {
          setBotStatus(msg.status as Parameters<typeof setBotStatus>[0]);
        } else if (msg.type === "bot_trade_closed") {
          prependBotTrade(msg.trade as Parameters<typeof prependBotTrade>[0]);
        } else if (msg.type === "bot_signal_evaluated") {
          prependBotSignal(msg.signal as Parameters<typeof prependBotSignal>[0]);
        }
      } catch {
        // ignore
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [token, activeScanners, addArticle, addAlert, clearAlert, updatePrice, upsertTrade,
      setBotStatus, prependBotTrade, prependBotSignal]);

  // Seed scanner store with current server-side alert state on mount
  useEffect(() => {
    if (!token) return;
    fetch("/api/scanner-alerts", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: Record<string, unknown[]>) => {
        for (const [scannerId, alerts] of Object.entries(data)) {
          for (const snap of alerts) {
            addAlert({ ...(snap as object), scannerId, alertedAt: new Date().toISOString() } as ScannerAlert);
          }
        }
      })
      .catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
}
