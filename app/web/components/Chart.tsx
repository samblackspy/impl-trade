"use client";

import { type Candle, fetchCandles } from "@/lib/indexer";
import { fmtPrice, PRICE_PRECISION } from "@/lib/format";
import { useMarketSnapshot } from "@/lib/ws";
import {
  type CandlestickData,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

type ChartStatus = "loading" | "ready" | "empty" | "error";

const RESOLUTION_SECONDS = 60;

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function Chart({ market }: { market: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indexSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const historyRef = useRef<Map<number, Bar>>(new Map());
  const liveRef = useRef<Map<number, Bar>>(new Map());
  const fittedRef = useRef(false);
  const [status, setStatus] = useState<ChartStatus>("loading");
  const [lastMark, setLastMark] = useState<number | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const snap = useMarketSnapshot(market);

  const applyBars = (fit = false) => {
    const bars = mergedBars(historyRef.current, liveRef.current);
    if (!candleSeriesRef.current) return;
    if (bars.length === 0) {
      candleSeriesRef.current.setData([]);
      setStatus("empty");
      return;
    }
    candleSeriesRef.current.setData(bars.map(toCandleData));
    setStatus("ready");
    if (fit || !fittedRef.current) {
      chartRef.current?.timeScale().fitContent();
      fittedRef.current = true;
    }
  };

  // Create the chart once on mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "'Outfit', 'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.02)" },
        horzLines: { color: "rgba(255, 255, 255, 0.02)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.04)",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.04)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      crosshair: { mode: 0 },
    });
    const candles = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    const indexLine = chart.addLineSeries({
      color: "#f5c542",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chartRef.current = chart;
    candleSeriesRef.current = candles;
    indexSeriesRef.current = indexLine;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      indexSeriesRef.current = null;
    };
  }, []);

  // Load indexed trade candles for the selected market.
  useEffect(() => {
    let active = true;
    fittedRef.current = false;
    historyRef.current = new Map();
    liveRef.current = new Map();
    indexSeriesRef.current?.setData([]);
    setLastMark(null);
    setLastIndex(null);
    setStatus("loading");

    const load = async () => {
      try {
        const candles = await fetchCandles(market, RESOLUTION_SECONDS);
        if (!active) return;
        historyRef.current = new Map(
          candles.filter(validCandle).map((c) => [c.time, candleToBar(c)]),
        );
        applyBars(true);
      } catch {
        if (active) setStatus("error");
      }
    };

    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [market]);

  // Keep the current candle alive from the WebSocket mark stream. This prevents the chart
  // from showing stale DB-only candles after a local validator reset or during quiet markets.
  useEffect(() => {
    if (!snap?.mark || snap.market !== market) return;
    const mark = toHumanPrice(snap.mark);
    if (!Number.isFinite(mark) || mark <= 0) return;
    const time = bucketFromMs(snap.ts);
    const prev = liveRef.current.get(time);
    liveRef.current.set(
      time,
      prev
        ? {
            time,
            open: prev.open,
            high: Math.max(prev.high, mark),
            low: Math.min(prev.low, mark),
            close: mark,
          }
        : { time, open: mark, high: mark, low: mark, close: mark },
    );
    setLastMark(mark);
    applyBars(false);

    if (snap.oracle) {
      const index = toHumanPrice(snap.oracle);
      if (Number.isFinite(index) && index > 0) {
        setLastIndex(index);
        indexSeriesRef.current?.update({
          time: time as UTCTimestamp,
          value: index,
        } satisfies LineData);
      }
    } else {
      setLastIndex(null);
    }
  }, [market, snap?.mark, snap?.market, snap?.oracle, snap?.ts]);

  return (
    <section
      className="relative flex h-[340px] min-h-[320px] flex-col glass-panel glass-panel-hover rounded-lg shadow-lg lg:h-[420px]"
      aria-label="Price chart"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3.5 py-2.5">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Price Chart
        </h2>
        <div className="flex min-w-0 flex-wrap justify-end gap-x-3 gap-y-1 font-mono text-[10px] uppercase font-bold tracking-wider">
          {lastMark !== null && (
            <span className="text-foreground bg-surface-2/40 px-2 py-0.5 rounded border border-border/40 font-bold shadow-sm">
              Mark {fmtPrice(lastMark * PRICE_PRECISION)}
            </span>
          )}
          {lastIndex !== null && (
            <span className="text-[#f5c542] bg-[#f5c542]/5 px-2 py-0.5 rounded border border-[#f5c542]/20 font-bold shadow-sm">
              Index {fmtPrice(lastIndex * PRICE_PRECISION)}
            </span>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center">
            <p
              className={`text-xs font-semibold ${status === "error" ? "text-short" : "text-muted"}`}
            >
              {status === "loading"
                ? "Loading market candles..."
                : status === "empty"
                  ? "Waiting for current price..."
                  : "Indexer offline."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function toHumanPrice(price: string | number): number {
  return Number(price) / PRICE_PRECISION;
}

function bucketFromMs(ms: number): number {
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / RESOLUTION_SECONDS) * RESOLUTION_SECONDS;
}

function candleToBar(c: Candle): Bar {
  return {
    time: c.time,
    open: toHumanPrice(c.open),
    high: toHumanPrice(c.high),
    low: toHumanPrice(c.low),
    close: toHumanPrice(c.close),
  };
}

function validCandle(c: Candle): boolean {
  return (
    [c.time, c.open, c.high, c.low, c.close].every((n) =>
      Number.isFinite(Number(n)),
    ) &&
    c.time > 0 &&
    c.open > 0 &&
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0
  );
}

function mergedBars(history: Map<number, Bar>, live: Map<number, Bar>): Bar[] {
  const merged = new Map(history);
  for (const [time, liveBar] of live) {
    const old = merged.get(time);
    merged.set(
      time,
      old
        ? {
            time,
            open: old.open,
            high: Math.max(old.high, liveBar.high),
            low: Math.min(old.low, liveBar.low),
            close: liveBar.close,
          }
        : liveBar,
    );
  }
  return [...merged.values()].sort((a, b) => a.time - b.time);
}

function toCandleData(bar: Bar): CandlestickData {
  return {
    time: bar.time as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}
