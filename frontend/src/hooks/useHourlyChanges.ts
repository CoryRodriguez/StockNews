import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/authStore";

const POLL_INTERVAL = 60_000; // refresh every 60s

/**
 * Fetches the 1-hour % change for a list of tickers.
 * Returns a map of ticker → hourChangePct (number).
 */
export function useHourlyChanges(tickers: string[]): Record<string, number> {
  const token = useAuthStore((s) => s.token);
  const [changes, setChanges] = useState<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token || tickers.length === 0) return;

    const symbols = [...new Set(tickers)].join(",");

    const fetch_ = () => {
      fetch(`/api/hourly-changes?symbols=${encodeURIComponent(symbols)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data: Record<string, number>) => setChanges((prev) => ({ ...prev, ...data })))
        .catch(() => {/* ignore */});
    };

    fetch_();
    timerRef.current = setInterval(fetch_, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tickers.join(",")]);

  return changes;
}
