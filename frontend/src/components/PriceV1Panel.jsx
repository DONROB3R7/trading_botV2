import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
} from "lightweight-charts";

// ============================================================
// API
// ============================================================

const API_BASE = "http://localhost:3001";

// ============================================================
// HELPERS
// ============================================================

function formatPercent(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  const number = Number(value);

  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}


function formatPrice(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  return Number(value).toFixed(4);
}


function formatTime(value) {
  if (!value) return "--";

  const timestamp = Number(value);

  if (Number.isNaN(timestamp)) return "--";

  const date = new Date(
    timestamp < 100000000000
      ? timestamp * 1000
      : timestamp
  );

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


function normalizeDirection(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "--";
  }

  if (
    typeof value === "object"
  ) {
    value =
      value.direction ??
      value.decision ??
      value.signal ??
      value.result ??
      null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return "--";
  }

  const text =
    String(value).toUpperCase();

  if (text.includes("LONG")) {
    return "LONG";
  }

  if (text.includes("SHORT")) {
    return "SHORT";
  }

  if (text.includes("NEUTRAL")) {
    return "NEUTRAL";
  }

  return text;
}


function directionClass(value) {
  const direction =
    normalizeDirection(value);

  if (direction === "LONG") {
    return "long";
  }

  if (direction === "SHORT") {
    return "short";
  }

  if (direction === "NEUTRAL") {
    return "neutral";
  }

  return "";
}


// ============================================================
// PRICE V1 ENTRY READER
// ============================================================

function getEntry(
  entries,
  windowSize
) {

  if (!entries) {
    return null;
  }


  if (
    !Array.isArray(entries) &&
    typeof entries === "object"
  ) {

    const direct =
      entries[windowSize] ??
      entries[String(windowSize)];


    if (direct) {
      return direct;
    }
  }


  if (
    Array.isArray(entries)
  ) {

    return (
      entries.find(
        (entry) =>
          Number(
            entry?.window ??
            entry?.candles ??
            entry?.period ??
            entry?.length
          ) ===
          Number(windowSize)
      ) || null
    );
  }


  return null;
}


function getEntryDirection(entry) {

  if (!entry) {
    return "--";
  }

  return normalizeDirection(
    entry.direction ??
    entry.decision ??
    entry.signal ??
    entry.trend ??
    entry.result
  );
}


function getEntryStrength(entry) {

  if (!entry) {
    return null;
  }

  const value =
    entry.strength ??
    entry.score ??
    entry.percentage ??
    entry.percent ??
    entry.change;


  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }


  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : null;
}


function getEntryPassed(entry) {

  if (!entry) {
    return null;
  }

  if (
    typeof entry.passed ===
    "boolean"
  ) {
    return entry.passed;
  }

  if (
    typeof entry.confirmed ===
    "boolean"
  ) {
    return entry.confirmed;
  }

  if (
    typeof entry.pass ===
    "boolean"
  ) {
    return entry.pass;
  }

  return null;
}


// ============================================================
// ENTRY CELL
// ============================================================

function EntryCell({
  entry,
}) {

  if (!entry) {

    return (
      <div className="price-entry-cell">
        <div className="price-entry-direction neutral">
          --
        </div>
      </div>
    );
  }


  const direction =
    getEntryDirection(entry);


  const strength =
    getEntryStrength(entry);


  const passed =
    getEntryPassed(entry);


  return (
    <div className="price-entry-cell">

      <div
        className={`price-entry-direction ${directionClass(
          direction
        )}`}
      >
        {direction}
      </div>


      {strength !== null && (
        <div className="price-entry-strength">
          {formatPercent(strength)}
        </div>
      )}


      {passed !== null && (
        <div
          className={`price-entry-pass ${
            passed
              ? "passed"
              : "failed"
          }`}
        >
          {passed
            ? "PASS"
            : "FAIL"}
        </div>
      )}

    </div>
  );
}


// ============================================================
// PRICE CHART
// ============================================================

function PriceChart({
  candles,
}) {

  const chartContainerRef =
    useRef(null);

  const chartRef =
    useRef(null);

  const candleSeriesRef =
    useRef(null);


  useEffect(() => {

    if (
      !chartContainerRef.current
    ) {
      return;
    }


    const container =
      chartContainerRef.current;


    const chart =
      createChart(
        container,
        {
          width:
            container.clientWidth ||
            800,

          height: 320,

          layout: {
            background: {
              color:
                "transparent",
            },

            textColor:
              "#9ca3af",
          },

          grid: {
            vertLines: {
              color:
                "rgba(255,255,255,0.05)",
            },

            horzLines: {
              color:
                "rgba(255,255,255,0.05)",
            },
          },

          rightPriceScale: {
            borderColor:
              "rgba(255,255,255,0.08)",
          },

          timeScale: {
            borderColor:
              "rgba(255,255,255,0.08)",

            timeVisible:
              true,

            secondsVisible:
              false,
          },
        }
      );


    const candleSeries =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor:
            "#22c55e",

          downColor:
            "#ef4444",

          borderUpColor:
            "#22c55e",

          borderDownColor:
            "#ef4444",

          wickUpColor:
            "#22c55e",

          wickDownColor:
            "#ef4444",
        }
      );


    chartRef.current =
      chart;

    candleSeriesRef.current =
      candleSeries;


    const resizeObserver =
      new ResizeObserver(
        () => {

          if (
            !chartContainerRef.current
          ) {
            return;
          }


          chart.applyOptions({
            width:
              chartContainerRef
                .current
                .clientWidth,
          });
        }
      );


    resizeObserver.observe(
      container
    );


    return () => {

      resizeObserver.disconnect();

      chart.remove();

      chartRef.current =
        null;

      candleSeriesRef.current =
        null;
    };

  }, []);


  useEffect(() => {

    if (
      !candleSeriesRef.current
    ) {
      return;
    }


    if (
      !Array.isArray(candles) ||
      candles.length === 0
    ) {

      candleSeriesRef.current.setData(
        []
      );

      return;
    }


    const chartData =
      candles
        .map((candle) => {

          const rawTime =
            Number(candle.time);


          const time =
            rawTime >
            100000000000
              ? Math.floor(
                  rawTime / 1000
                )
              : Math.floor(
                  rawTime
                );


          return {

            time,

            open:
              Number(candle.open),

            high:
              Number(candle.high),

            low:
              Number(candle.low),

            close:
              Number(candle.close),
          };
        })
        .filter(
          (candle) =>
            Number.isFinite(
              candle.time
            ) &&
            Number.isFinite(
              candle.open
            ) &&
            Number.isFinite(
              candle.high
            ) &&
            Number.isFinite(
              candle.low
            ) &&
            Number.isFinite(
              candle.close
            )
        )
        .sort(
          (a, b) =>
            a.time - b.time
        );


    const uniqueData = [];


    for (
      const candle of chartData
    ) {

      const previous =
        uniqueData[
          uniqueData.length - 1
        ];


      if (
        !previous ||
        previous.time !==
          candle.time
      ) {

        uniqueData.push(
          candle
        );

      } else {

        uniqueData[
          uniqueData.length - 1
        ] =
          candle;
      }
    }


    candleSeriesRef.current.setData(
      uniqueData
    );


    if (
      chartRef.current &&
      uniqueData.length > 0
    ) {

      chartRef.current
        .timeScale()
        .fitContent();
    }

  }, [candles]);


  return (
    <div className="price-chart-wrapper">

      <div
        ref={chartContainerRef}
        className="price-chart"
        style={{
          width: "100%",
          minHeight: "320px",
        }}
      />

    </div>
  );
}


// ============================================================
// MAIN PANEL
// ============================================================

export default function PriceV1Panel({
  bot,
  selectedSymbol,
  onSelectSymbol,
}) {

  const [instances, setInstances] =
    useState({});


  // ==========================================================
  // LOAD PRICE V1 INSTANCES
  // ==========================================================

  useEffect(() => {

    let cancelled = false;


    async function loadInstances() {

      try {

        const response =
          await fetch(
            `${API_BASE}/api/market/instances`
          );


        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }


        const result =
          await response.json();


        if (
          cancelled
        ) {
          return;
        }


        const rawInstances =
          result?.instances;


        if (
          rawInstances &&
          typeof rawInstances ===
            "object"
        ) {

          const priceInstances = {};


          for (
            const [
              symbol,
              instance
            ] of Object.entries(
              rawInstances
            )
          ) {

            if (
              instance?.bot ===
              "pricev1"
            ) {

              priceInstances[
                String(symbol)
                  .trim()
                  .toUpperCase()
              ] =
                instance;
            }
          }


          setInstances(
            priceInstances
          );

        } else {

          setInstances({});
        }

      } catch (error) {

        console.error(
          "Price V1 instance error:",
          error
        );

      }

    }


    loadInstances();


    const timer =
      setInterval(
        loadInstances,
        2000
      );


    return () => {

      cancelled = true;

      clearInterval(timer);

    };

  }, []);


  // ==========================================================
  // ADD CURRENT BOT IF AVAILABLE
  // ==========================================================

  const allInstances =
    useMemo(() => {

      const result = {
        ...instances,
      };


      if (
        bot &&
        bot.symbol &&
        bot.botName ===
          "pricev1"
      ) {

        const symbol =
          String(
            bot.symbol
          )
            .trim()
            .toUpperCase();


        if (
          symbol
        ) {

          result[symbol] =
            bot;
        }
      }


      return result;

    }, [
      instances,
      bot,
    ]);


  const instanceList =
    useMemo(() => {

      return Object.entries(
        allInstances
      )
        .map(
          ([symbol, instance]) => ({
            symbol,
            ...instance,
          })
        )
        .sort(
          (a, b) =>
            a.symbol.localeCompare(
              b.symbol
            )
        );

    }, [allInstances]);


  // ==========================================================
  // SELECTED INSTANCE
  // ==========================================================

  const selectedInstance =
    useMemo(() => {

      if (
        selectedSymbol &&
        allInstances[
          selectedSymbol
        ]
      ) {

        return allInstances[
          selectedSymbol
        ];
      }


      if (selectedSymbol) {

        const matching =
          instanceList.find(
            (instance) =>
              String(
                instance.symbol
              ).toUpperCase() ===
              String(
                selectedSymbol
              ).toUpperCase()
          );


        if (matching) {
          return matching;
        }
      }


      return (
        instanceList[0] ||
        null
      );

    }, [
      selectedSymbol,
      allInstances,
      instanceList,
    ]);


  const data =
    selectedInstance?.statusData ||
    selectedInstance ||
    bot?.statusData ||
    bot ||
    null;


  // ==========================================================
  // BASIC DATA
  // ==========================================================

  const symbol =
    data?.symbol ||
    selectedInstance?.symbol ||
    selectedSymbol ||
    "--";


  const candles =
    Array.isArray(
      data?.currentCandles
    )
      ? data.currentCandles
      : [];


  // ==========================================================
  // CURRENT CYCLE
  // ==========================================================

  const currentCycle =
    Array.isArray(
      data?.currentCycle
    )
      ? data.currentCycle
      : [];


  const cycleHistory =
    Array.isArray(
      data?.cycleHistory
    )
      ? data.cycleHistory
      : [];


  // ==========================================================
  // DECISION HISTORY
  // ==========================================================

  const decisionHistory =
    [...currentCycle].reverse();


  // ==========================================================
  // LAST SNAPSHOT
  // ==========================================================

  const lastSnapshot =
    data?.lastSnapshot ||
    decisionHistory[0] ||
    null;


  const lastCycle =
    data?.lastCycle ||
    null;


  // ==========================================================
  // CYCLE PROGRESS
  // ==========================================================

  const currentCycleNumber =
    data?.cycleNumber ??
    Math.floor(
      cycleHistory.length + 1
    );


  const cycleProgress =
    data?.cycleProgress ??
    currentCycle.length;


  const cycleLength =
    data?.cycleLength ??
    10;


  // ==========================================================
  // FINAL DECISION
  // ==========================================================

  const finalDecision =
    lastSnapshot?.finalDecision ??
    lastSnapshot?.decision ??
    "--";


  // ==========================================================
  // PRICE
  // ==========================================================

  const currentPrice =
    lastSnapshot?.price ??
    data?.price ??
    null;


  // ==========================================================
  // PRICE MOVEMENT
  // ==========================================================

  const priceMovement =
    lastSnapshot?.priceMovement ||
    data?.priceMovement ||
    {};


  const movement5 =
    priceMovement?.[5] ??
    priceMovement?.["5"] ??
    null;


  const movement10 =
    priceMovement?.[10] ??
    priceMovement?.["10"] ??
    null;


  const movement20 =
    priceMovement?.[20] ??
    priceMovement?.["20"] ??
    null;


  const movement60 =
    priceMovement?.[60] ??
    priceMovement?.["60"] ??
    null;


  // ==========================================================
  // CURRENT ENTRIES
  // ==========================================================

  const currentEntries =
    lastSnapshot?.entries ||
    data?.entries ||
    {};


  const entry15 =
    getEntry(
      currentEntries,
      15
    );


  const entry20 =
    getEntry(
      currentEntries,
      20
    );


  const entry30 =
    getEntry(
      currentEntries,
      30
    );


  const entry60 =
    getEntry(
      currentEntries,
      60
    );


  return (

    <div className="price-v1-panel">

      {/* ================================================== */}
      {/* HEADER */}
      {/* ================================================== */}

      <div className="panel-header">

        <div>

          <h2>
            Price Movement System
          </h2>

          <p>
            1-minute price-only trend and entry analysis
          </p>

        </div>


        <div className="status-badge">

          {data?.status
            ? String(
                data.status
              ).toUpperCase()
            : "UNKNOWN"}

        </div>

      </div>


      {/* ================================================== */}
      {/* CONTROLS */}
      {/* ================================================== */}

      <div className="price-v1-controls">

        <div className="control-box">

          <div className="control-label">
            SYMBOL
          </div>


          <select
            value={
              selectedInstance?.symbol ||
              symbol ||
              ""
            }
            onChange={(event) => {

              if (
                onSelectSymbol
              ) {

                onSelectSymbol(
                  event.target.value
                );
              }

            }}
          >

            {instanceList.length === 0 ? (

              <option value="">
                No Price V1 bots
              </option>

            ) : (

              instanceList.map(
                (instance) => (

                  <option
                    key={
                      instance.symbol
                    }
                    value={
                      instance.symbol
                    }
                  >
                    {instance.symbol}
                  </option>

                )
              )

            )}

          </select>

        </div>


        <div className="control-box">

          <div className="control-label">
            TIMEFRAME
          </div>

          <div className="control-value">
            {data?.timeframe || "1m"}
          </div>

        </div>


        <div className="control-box">

          <div className="control-label">
            CANDLES
          </div>

          <div className="control-value">
            {candles.length || 1000}
          </div>

        </div>

      </div>


      {/* ================================================== */}
      {/* SUMMARY */}
      {/* ================================================== */}

      <div className="price-v1-summary">

        <div className="summary-box">

          <div className="summary-label">
            SYMBOL
          </div>

          <div className="summary-value">
            {symbol}
          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            CYCLE
          </div>

          <div className="summary-value">

            {cycleProgress}
            {" / "}
            {cycleLength}

          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            FINAL
          </div>

          <div
            className={`summary-value ${directionClass(
              finalDecision
            )}`}
          >

            {normalizeDirection(
              finalDecision
            )}

          </div>

        </div>

      </div>


      {/* ================================================== */}
      {/* PRICE MOVEMENT */}
      {/* ================================================== */}

      <section className="price-section">

        <div className="section-title">
          Price Movement
        </div>


        <div className="movement-grid">

          <div className="movement-card">

            <div className="movement-label">
              CURRENT PRICE
            </div>

            <div className="movement-value">
              {formatPrice(
                currentPrice
              )}
            </div>

          </div>


          <div className="movement-card">

            <div className="movement-label">
              5 CANDLES
            </div>

            <div className="movement-value">
              {formatPercent(
                movement5
              )}
            </div>

          </div>


          <div className="movement-card">

            <div className="movement-label">
              10 CANDLES
            </div>

            <div className="movement-value">
              {formatPercent(
                movement10
              )}
            </div>

          </div>


          <div className="movement-card">

            <div className="movement-label">
              20 CANDLES
            </div>

            <div className="movement-value">
              {formatPercent(
                movement20
              )}
            </div>

          </div>


          <div className="movement-card">

            <div className="movement-label">
              60 CANDLES
            </div>

            <div className="movement-value">
              {formatPercent(
                movement60
              )}
            </div>

          </div>

        </div>

      </section>


      {/* ================================================== */}
      {/* CHART */}
      {/* ================================================== */}

      <section className="price-section">

        <div className="section-title">
          Price Chart
        </div>

        <PriceChart
          candles={candles}
        />

      </section>


      {/* ================================================== */}
      {/* DECISION HISTORY */}
      {/* ================================================== */}

      <section className="price-section">

        <div className="section-title">

          Decision History{" "}

          {cycleProgress}
          {" / "}
          {cycleLength}

        </div>


        <div className="decision-table-wrapper">

          <table className="decision-table">

            <thead>

              <tr>

                <th>TIME</th>

                <th>COIN</th>

                <th>TREND</th>

                <th>15</th>

                <th>20</th>

                <th>30</th>

                <th>60</th>

                <th>DECISION</th>

              </tr>

            </thead>


            <tbody>

              {decisionHistory.length === 0 ? (

                <tr>

                  <td
                    colSpan="8"
                    className="empty-cell"
                  >
                    Waiting for Price V1 decisions...
                  </td>

                </tr>

              ) : (

                decisionHistory.map(
                  (
                    snapshot,
                    index
                  ) => {

                    const entries =
                      snapshot?.entries ||
                      {};


                    const item15 =
                      getEntry(
                        entries,
                        15
                      );


                    const item20 =
                      getEntry(
                        entries,
                        20
                      );


                    const item30 =
                      getEntry(
                        entries,
                        30
                      );


                    const item60 =
                      getEntry(
                        entries,
                        60
                      );


                    const trend =
                      snapshot?.trend ||
                      "--";


                    const decision =
                      snapshot?.finalDecision ??
                      snapshot?.decision ??
                      "NEUTRAL";


                    const candleTime =
                      snapshot?.candleTime ??
                      snapshot?.timestamp ??
                      snapshot?.time;


                    return (

                      <tr
                        key={
                          `${
                            candleTime ||
                            index
                          }-${index}`
                        }
                      >

                        <td>
                          {formatTime(
                            candleTime
                          )}
                        </td>


                        <td>
                          {symbol}
                        </td>


                        <td>

                          <span
                            className={`decision-direction ${directionClass(
                              trend
                            )}`}
                          >

                            {normalizeDirection(
                              trend
                            )}

                            {typeof trend ===
                              "object" &&
                              trend?.strength !==
                                undefined && (
                                <>
                                  {" "}
                                  {formatPercent(
                                    trend.strength
                                  )}
                                </>
                              )}

                          </span>

                        </td>


                        <td>
                          <EntryCell
                            entry={item15}
                          />
                        </td>


                        <td>
                          <EntryCell
                            entry={item20}
                          />
                        </td>


                        <td>
                          <EntryCell
                            entry={item30}
                          />
                        </td>


                        <td>
                          <EntryCell
                            entry={item60}
                          />
                        </td>


                        <td>

                          <span
                            className={`decision-direction ${directionClass(
                              decision
                            )}`}
                          >

                            {normalizeDirection(
                              decision
                            )}

                          </span>

                        </td>

                      </tr>

                    );
                  }
                )

              )}

            </tbody>

          </table>

        </div>

      </section>


      {/* ================================================== */}
      {/* COMPLETED CYCLES */}
      {/* ================================================== */}

      <section className="price-section">

        <div className="section-title">
          Previous Completed Cycles
        </div>


        <div className="decision-table-wrapper">

          <table className="decision-table">

            <thead>

              <tr>

                <th>CYCLE</th>

                <th>START</th>

                <th>END</th>

                <th>TREND</th>

                <th>DECISION</th>

              </tr>

            </thead>


            <tbody>

              {cycleHistory.length === 0 ? (

                <tr>

                  <td
                    colSpan="5"
                    className="empty-cell"
                  >
                    No completed cycles yet.
                  </td>

                </tr>

              ) : (

                [...cycleHistory]
                  .map(
                    (
                      cycle,
                      index
                    ) => {

                      const cycleDecision =
                        cycle?.finalDecision ??
                        cycle?.decision ??
                        "--";


                      const cycleTrend =
                        cycle?.trend ??
                        cycle?.finalTrend ??
                        "--";


                      return (

                        <tr
                          key={
                            cycle?.cycleId ??
                            index
                          }
                        >

                          <td>
                            {cycle?.cycleId ??
                              cycleHistory.length -
                                index}
                          </td>


                          <td>
                            {formatTime(
                              cycle?.startTime
                            )}
                          </td>


                          <td>
                            {formatTime(
                              cycle?.endTime
                            )}
                          </td>


                          <td>

                            <span
                              className={`decision-direction ${directionClass(
                                cycleTrend
                              )}`}
                            >

                              {normalizeDirection(
                                cycleTrend
                              )}

                            </span>

                          </td>


                          <td>

                            <span
                              className={`decision-direction ${directionClass(
                                cycleDecision
                              )}`}
                            >

                              {normalizeDirection(
                                cycleDecision
                              )}

                            </span>

                          </td>

                        </tr>

                      );

                    }
                  )

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>
  );
}