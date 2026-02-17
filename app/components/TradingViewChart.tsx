"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, HistogramData } from "lightweight-charts";

interface TradingViewChartProps {
  symbol: string;
  interval: string;
  indicators?: {
    ema_9?: number;
    ema_21?: number;
    ema_50?: number;
    ema_200?: number;
    rsi?: number;
    macd?: number;
    macd_signal?: number;
    bb_upper?: number;
    bb_lower?: number;
  } | null;
}

export default function TradingViewChart({ symbol, interval, indicators }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#ddd",
      },
      timeScale: {
        borderColor: "#ddd",
        timeVisible: true,
        secondsVisible: false,
      },
      height: 500,
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: "#3b82f6",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Add EMA lines
    ema9Ref.current = chart.addLineSeries({
      color: "#3b82f6",
      lineWidth: 2,
      title: "EMA 9",
    });

    ema21Ref.current = chart.addLineSeries({
      color: "#f97316",
      lineWidth: 2,
      title: "EMA 21",
    });

    ema50Ref.current = chart.addLineSeries({
      color: "#a855f7",
      lineWidth: 2,
      title: "EMA 50",
    });

    // Sample data - replace with real data from your API
    const sampleData: CandlestickData[] = [
      { time: "2024-01-01", open: 67000, high: 67500, low: 66800, close: 67200 },
      { time: "2024-01-02", open: 67200, high: 67800, low: 67000, close: 67600 },
      { time: "2024-01-03", open: 67600, high: 68000, low: 67400, close: 67800 },
      { time: "2024-01-04", open: 67800, high: 68200, low: 67600, close: 67900 },
      { time: "2024-01-05", open: 67900, high: 68100, low: 67700, close: 68000 },
      { time: "2024-01-06", open: 68000, high: 68500, low: 67800, close: 68400 },
      { time: "2024-01-07", open: 68400, high: 68800, low: 68200, close: 68600 },
      { time: "2024-01-08", open: 68600, high: 69000, low: 68400, close: 68800 },
    ];

    const volumeData: HistogramData[] = [
      { time: "2024-01-01", value: 1000, color: "#22c55e" },
      { time: "2024-01-02", value: 1200, color: "#22c55e" },
      { time: "2024-01-03", value: 800, color: "#22c55e" },
      { time: "2024-01-04", value: 1500, color: "#ef4444" },
      { time: "2024-01-05", value: 1100, color: "#22c55e" },
      { time: "2024-01-06", value: 1800, color: "#22c55e" },
      { time: "2024-01-07", value: 1300, color: "#22c55e" },
      { time: "2024-01-08", value: 1600, color: "#22c55e" },
    ];

    candlestickSeries.setData(sampleData);
    volumeSeries.setData(volumeData);

    // EMA data (simplified - calculate from closes)
    const emaData = sampleData.map((d, i) => ({
      time: d.time,
      value: d.close * (1 + (i * 0.001)),
    }));

    ema9Ref.current?.setData(emaData);
    ema21Ref.current?.setData(emaData.map(d => ({ ...d, value: d.value * 0.998 })));
    ema50Ref.current?.setData(emaData.map(d => ({ ...d, value: d.value * 0.995 })));

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [interval]);

  // Update indicators when they change
  useEffect(() => {
    if (!indicators || !candlestickSeriesRef.current) return;

    // Add markers for signals
    const markers = [];
    
    // RSI overbought/oversold markers
    if (indicators?.rsi && indicators.rsi > 70) {
      markers.push({
        time: new Date().toISOString().split("T")[0],
        position: "aboveBar" as const,
        color: "#ef4444",
        shape: "arrowDown" as const,
        text: "RSI > 70",
      });
    } else if (indicators?.rsi && indicators.rsi < 30) {
      markers.push({
        time: new Date().toISOString().split("T")[0],
        position: "belowBar" as const,
        color: "#22c55e",
        shape: "arrowUp" as const,
        text: "RSI < 30",
      });
    }

    candlestickSeriesRef.current.setMarkers(markers);
  }, [indicators]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
