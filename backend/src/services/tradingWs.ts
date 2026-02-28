/**
 * Trading WebSocket Service
 *
 * Connects to the Alpaca trading stream endpoint (separate from the market data
 * stream in alpaca.ts). Handles authentication, subscription to trade_updates,
 * and dispatches fill/partial_fill/rejected events to tradeExecutor.ts.
 *
 * URL is mode-aware: paper uses wss://paper-api.alpaca.markets/stream
 *                    live uses  wss://api.alpaca.markets/stream
 *
 * Reconnects automatically on disconnect (5s backoff, mirrors alpaca.ts pattern).
 * All message handling is wrapped in try/catch — a bad JSON message will not crash
 * the WebSocket handler.
 *
 * Plan 03-04 calls startTradingWs() in the server startup sequence.
 * Plan 03-04 calls restartTradingWs() from switchMode() after a paper→live transition.
 */

import WebSocket from 'ws';
import { config } from '../config';
import { getAlpacaBaseUrl } from './botController';
import { onFillEvent, onRejectedEvent } from './tradeExecutor';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuthMessage {
  action: 'auth';
  key: string;
  secret: string;
}

interface ListenMessage {
  action: 'listen';
  data: { streams: string[] };
}

interface TradingWsAuthResult {
  status: 'authorized' | 'unauthorized';
  action: string;
  message?: string;
}

interface AlpacaOrderUpdate {
  id: string;
  status: string;
  symbol: string;
  notional: string | null;
  qty: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  side: string;
  created_at: string;
}

interface TradeUpdate {
  event: 'fill' | 'partial_fill' | 'rejected' | 'new' | 'canceled' | 'expired' | 'done_for_day';
  timestamp: string;
  price?: string;
  qty?: string;
  position_qty?: string;
  order: AlpacaOrderUpdate;
}

interface TradingWsMessage {
  stream: 'trade_updates' | 'authorization' | 'listening';
  data: TradeUpdate | TradingWsAuthResult;
}

// ─── Module-level state ────────────────────────────────────────────────────────

let tradingWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ─── URL derivation (mode-aware) ──────────────────────────────────────────────

/**
 * Derives the trading WebSocket URL from the current Alpaca base URL.
 *   Paper: wss://paper-api.alpaca.markets/stream
 *   Live:  wss://api.alpaca.markets/stream
 */
function getTradingWsUrl(): string {
  return getAlpacaBaseUrl()
    .replace('https://', 'wss://')
    .replace('http://', 'ws://') + '/stream';
}

// ─── Message handling ─────────────────────────────────────────────────────────

/**
 * Dispatches parsed trading WebSocket messages to the appropriate handlers.
 * Routes fill/partial_fill/rejected → tradeExecutor callbacks.
 * Logs other events (new, canceled, expired, done_for_day) at debug level.
 */
async function handleTradingWsMessage(msg: TradingWsMessage): Promise<void> {
  if (msg.stream === 'authorization') {
    const authData = msg.data as TradingWsAuthResult;
    if (authData.status === 'authorized') {
      // Send subscribe message after successful auth
      const subscribeMsg: ListenMessage = {
        action: 'listen',
        data: { streams: ['trade_updates'] },
      };
      tradingWs?.send(JSON.stringify(subscribeMsg));
      console.log('[TradingWs] Authenticated — subscribed to trade_updates');
    } else {
      console.error(`[TradingWs] Authentication failed: status=${authData.status} message=${authData.message ?? 'none'}`);
    }
    return;
  }

  if (msg.stream === 'listening') {
    // Acknowledgement that we are now subscribed — no action needed
    return;
  }

  if (msg.stream === 'trade_updates') {
    const update = msg.data as TradeUpdate;
    const { event, order } = update;

    if (event === 'fill' || event === 'partial_fill') {
      await onFillEvent({
        event,
        orderId: order.id,
        filledQty: order.filled_qty,
        filledAvgPrice: order.filled_avg_price,
        symbol: order.symbol,
      });
      return;
    }

    if (event === 'rejected') {
      await onRejectedEvent({
        orderId: order.id,
        symbol: order.symbol,
        // Alpaca does not send a reason field in the WebSocket event
      });
      return;
    }

    // new, canceled, expired, done_for_day — log at debug level, no action needed
    console.log(`[TradingWs] Trade event: ${event} symbol=${order.symbol} orderId=${order.id}`);
  }
}

// ─── Connection lifecycle ─────────────────────────────────────────────────────

/**
 * Creates a new WebSocket connection to the Alpaca trading stream.
 * Mirrors the reconnect pattern from alpaca.ts.
 */
function connectTradingWs(): void {
  const url = getTradingWsUrl();
  console.log(`[TradingWs] Connecting to ${url}`);

  tradingWs = new WebSocket(url);

  tradingWs.on('open', () => {
    // Send auth immediately after connection opens
    const authMsg: AuthMessage = {
      action: 'auth',
      key: config.alpacaApiKey,
      secret: config.alpacaApiSecret,
    };
    tradingWs!.send(JSON.stringify(authMsg));
  });

  tradingWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as TradingWsMessage;
      void handleTradingWsMessage(msg).catch((err) => {
        console.error('[TradingWs] Message handler error:', err);
      });
    } catch (err) {
      // Bad JSON — log and ignore; must not crash the WebSocket handler
      console.warn('[TradingWs] Failed to parse message:', err);
    }
  });

  tradingWs.on('close', () => {
    console.warn('[TradingWs] Disconnected — reconnecting in 5s');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectTradingWs, 5000);
  });

  tradingWs.on('error', (err) => {
    // Log error message only — do not crash
    console.error('[TradingWs] Error:', err.message);
  });
}

// ─── Exported functions ────────────────────────────────────────────────────────

/**
 * Starts the Alpaca trading WebSocket connection.
 * Guard: if no API key is configured, logs a warning and returns without connecting.
 * Called by server startup in Plan 03-04.
 */
export function startTradingWs(): void {
  if (!config.alpacaApiKey) {
    console.warn('[TradingWs] No API key — trading stream disabled');
    return;
  }
  connectTradingWs();
}

/**
 * Closes any existing trading WebSocket and reconnects.
 * Called by switchMode() in Plan 03-04 after a paper→live or live→paper transition
 * to ensure the new connection targets the correct endpoint URL.
 */
export function restartTradingWs(): void {
  // Cancel any pending reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Close existing socket if open
  tradingWs?.close();

  // Reconnect after 100ms to ensure socket is fully closed first
  setTimeout(connectTradingWs, 100);
}
