import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createChart,
  CandlestickSeries,
} from "lightweight-charts";

const API_BASE = "http://localhost:3001";

const BERLIN_TIME_ZONE = "Europe/Berlin";


// =========================================================
// HELPERS
// =========================================================

function formatPercent(value) {

  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  return `${Number(value).toFixed(2)}%`;
}


function formatPrice(value) {

  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  return Number(value).toFixed(6);
}


function formatBerlinTime(value) {

  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(
    "de-DE",
    {
      timeZone: BERLIN_TIME_ZONE,

      hour: "2-digit",
      minute: "2-digit",

      second: "2-digit",

      hour12: false,
    }
  ).format(date);
}


function formatBerlinDateTime(value) {

  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(
    "de-DE",
    {
      timeZone: BERLIN_TIME_ZONE,

      day: "2-digit",
      month: "2-digit",

      hour: "2-digit",
      minute: "2-digit",

      second: "2-digit",

      hour12: false,
    }
  ).format(date);
}


function normalizeDirection(value) {

  if (!value) {
    return "NEUTRAL";
  }

  return String(value).toUpperCase();
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

  return "neutral";
}


// =========================================================
// ENTRY HELPERS
// =========================================================

function getEntry(
  entries,
  windowSize
) {

  if (!entries) {
    return null;
  }

  if (Array.isArray(entries)) {

    return entries.find(
      (entry) =>
        Number(entry?.window) ===
        Number(windowSize)
    );
  }

  return (
    entries[windowSize] ||
    entries[String(windowSize)] ||
    null
  );
}


function getEntryDirection(
  entries,
  windowSize
) {

  const entry =
    getEntry(
      entries,
      windowSize
    );

  return (
    entry?.direction ||
    entry?.rawDirection ||
    "NEUTRAL"
  );
}


function getEntryStrength(
  entries,
  windowSize
) {

  const entry =
    getEntry(
      entries,
      windowSize
    );

  if (!entry) {
    return null;
  }

  return entry.strength;
}


function getEntryPassed(
  entries,
  windowSize
) {

  const direction =
    getEntryDirection(
      entries,
      windowSize
    );

  return (
    direction === "LONG" ||
    direction === "SHORT"
  );
}


// =========================================================
// ENTRY CELL
// =========================================================

function EntryCell({
  entries,
  windowSize,
}) {

  const direction =
    getEntryDirection(
      entries,
      windowSize
    );

  const strength =
    getEntryStrength(
      entries,
      windowSize
    );

  const passed =
    getEntryPassed(
      entries,
      windowSize
    );

  return (
    <div className="entry-cell">

      <div className="entry-window">
        {windowSize}
      </div>

      <div
        className={`entry-direction ${directionClass(
          direction
        )}`}
      >
        {direction}
      </div>

      <div className="entry-strength">
        {formatPercent(strength)}
      </div>

      <div
        className={`entry-status ${
          passed
            ? "passed"
            : "waiting"
        }`}
      >
        {passed
          ? "READY"
          : "WAITING"}
      </div>

    </div>
  );
}


// =========================================================
// CHART
// =========================================================

function PriceChart({
  candles,
}) {

  const chartContainerRef =
    useRef(null);

  const chartRef =
    useRef(null);

  const candleSeriesRef =
    useRef(null);

  const lastChartTimeRef =
    useRef(null);


  // =======================================================
  // CREATE CHART
  // =======================================================

  useEffect(() => {

    if (!chartContainerRef.current) {
      return;
    }

    const container =
      chartContainerRef.current;


    function berlinTimeFormatter(time) {

      if (
        typeof time !==
        "number"
      ) {
        return "";
      }

      const date =
        new Date(
          time * 1000
        );

      return new Intl.DateTimeFormat(
        "de-DE",
        {
          timeZone:
            BERLIN_TIME_ZONE,

          hour: "2-digit",
          minute: "2-digit",

          hour12: false,
        }
      ).format(date);
    }


    const chart =
      createChart(
        container,
        {
          width:
            container.clientWidth,

          height: 420,

          layout: {
            background: {
              color:
                "transparent",
            },

            textColor:
              "#b8c0cc",
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
              "rgba(255,255,255,0.10)",
          },

          timeScale: {
            borderColor:
              "rgba(255,255,255,0.10)",

            timeVisible:
              true,

            secondsVisible:
              false,

            tickMarkFormatter:
              berlinTimeFormatter,
          },

          localization: {
            timeFormatter:
              berlinTimeFormatter,
          },

          crosshair: {
            mode: 0,
          },
        }
      );


    const candleSeries =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor:
            "#26a69a",

          downColor:
            "#ef5350",

          borderVisible:
            false,

          wickUpColor:
            "#26a69a",

          wickDownColor:
            "#ef5350",
        }
      );


    chartRef.current =
      chart;

    candleSeriesRef.current =
      candleSeries;


    // =====================================================
    // RESIZE
    // =====================================================

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


    // =====================================================
    // CLEANUP
    // =====================================================

    return () => {

      resizeObserver.disconnect();

      chart.remove();

      chartRef.current =
        null;

      candleSeriesRef.current =
        null;

      lastChartTimeRef.current =
        null;
    };

  }, []);


  // =======================================================
  // UPDATE CHART
  // =======================================================

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
      return;
    }


    const normalized =
      candles
        .map(
          (candle) => ({

            time:
              Number(
                candle.time
              ),

            open:
              Number(
                candle.open
              ),

            high:
              Number(
                candle.high
              ),

            low:
              Number(
                candle.low
              ),

            close:
              Number(
                candle.close
              ),
          })
        )
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
            a.time -
            b.time
        );


    if (
      normalized.length === 0
    ) {
      return;
    }


    const uniqueData = [];

    for (
      const candle of normalized
    ) {

      const last =
        uniqueData[
          uniqueData.length - 1
        ];

      if (
        last &&
        last.time ===
          candle.time
      ) {

        uniqueData[
          uniqueData.length - 1
        ] =
          candle;

      } else {

        uniqueData.push(
          candle
        );
      }
    }


    const latestCandle =
      uniqueData[
        uniqueData.length - 1
      ];


    // =====================================================
    // FIRST LOAD
    // =====================================================

    if (
      lastChartTimeRef.current ===
      null
    ) {

      candleSeriesRef.current
        .setData(
          uniqueData
        );

      lastChartTimeRef.current =
        latestCandle.time;

      if (
        chartRef.current
      ) {

        chartRef.current
          .timeScale()
          .fitContent();

      }

      return;
    }


    // =====================================================
    // LIVE UPDATE
    // =====================================================

    for (
      const candle of uniqueData
    ) {

      if (
        candle.time >=
        lastChartTimeRef.current
      ) {

        candleSeriesRef.current
          .update(
            candle
          );
      }
    }


    lastChartTimeRef.current =
      latestCandle.time;

  }, [candles]);


  return (
    <div className="price-chart-wrapper">

      <div
        ref={
          chartContainerRef
        }
        className="price-chart"
        style={{
          width:
            "100%",

          height:
            "420px",
        }}
      />

    </div>
  );
}


// =========================================================
// HISTORY HELPERS
// =========================================================

function getCycleTrend(
  cycle
) {

  return (
    cycle?.trend?.direction ||
    cycle?.trendDirection ||
    cycle?.trend ||
    "NEUTRAL"
  );
}


function getCycleTrendStrength(
  cycle
) {

  return (
    cycle?.trend?.strength ??
    cycle?.trendStrength ??
    null
  );
}


function getCycleEntryDirection(
  cycle,
  windowSize
) {

  const entries =
    cycle?.entries ||
    {};

  return getEntryDirection(
    entries,
    windowSize
  );
}


function getCycleEntryStrength(
  cycle,
  windowSize
) {

  const entries =
    cycle?.entries ||
    {};

  return getEntryStrength(
    entries,
    windowSize
  );
}


function getCycleDecision(
  cycle
) {

  return (
    cycle?.decision ||
    cycle?.finalDecision ||
    cycle?.direction ||
    "NEUTRAL"
  );
}


function getCycleTime(
  cycle
) {

  return (
    cycle?.completedAt ||
    cycle?.timestamp ||
    cycle?.endTime ||
    cycle?.lastTimestamp ||
    cycle?.snapshots?.[
      cycle.snapshots.length - 1
    ]?.timestamp ||
    null
  );
}


// =========================================================
// PREVIOUS CYCLE ROW
// =========================================================

function PreviousCycleRow({
  cycle,
  selectedSymbol,
  entryWindows,
}) {

  const decision =
    getCycleDecision(
      cycle
    );

  const trend =
    getCycleTrend(
      cycle
    );

  const trendStrength =
    getCycleTrendStrength(
      cycle
    );


  return (
    <tr>

      <td>
        {formatBerlinDateTime(
          getCycleTime(
            cycle
          )
        )}
      </td>


      <td className="coin-cell">
        {cycle?.symbol ||
          selectedSymbol ||
          "--"}
      </td>


      <td>

        <span
          className={`decision-value ${directionClass(
            trend
          )}`}
        >

          {trend}

          {trendStrength !==
            null && (

            <small
              style={{
                marginLeft:
                  "4px",
              }}
            >
              {formatPercent(
                trendStrength
              )}
            </small>

          )}

        </span>

      </td>


      {
        entryWindows.map(
          (windowSize) => {

            const direction =
              getCycleEntryDirection(
                cycle,
                windowSize
              );

            const strength =
              getCycleEntryStrength(
                cycle,
                windowSize
              );


            return (

              <td
                key={
                  windowSize
                }
              >

                <span
                  className={`decision-value ${directionClass(
                    direction
                  )}`}
                >

                  {direction}

                  {strength !==
                    null && (

                    <small
                      style={{
                        marginLeft:
                          "4px",
                      }}
                    >
                      {formatPercent(
                        strength
                      )}
                    </small>

                  )}

                </span>

              </td>

            );

          }
        )
      }


      <td>

        <span
          className={`decision-value ${directionClass(
            decision
          )}`}
        >
          {normalizeDirection(
            decision
          )}
        </span>

      </td>


      <td>

        <span className="cycle-reason">
          {
            cycle?.reason ||
            cycle?.finalReason ||
            "--"
          }
        </span>

      </td>

    </tr>
  );
}


// =========================================================
// MAIN PRICE V1 PANEL
// =========================================================

export default function PriceV1Panel({
  bot,
  instances = [],
  selectedSymbol,
  onSelectSymbol,
}) {

  // =======================================================
  // LIVE INSTANCE LIST
  // =======================================================

  const [
    liveInstances,
    setLiveInstances,
  ] = useState([]);


  useEffect(() => {

    let mounted = true;


    async function loadInstances() {

      try {

        const response =
          await fetch(
            `${API_BASE}/api/bots/status`,
            {
              cache:
                "no-store",
            }
          );


        if (
          !response.ok
        ) {

          console.error(
            "Price V1 status HTTP error:",
            response.status
          );

          return;
        }


        const result =
          await response.json();


        if (!mounted) {
          return;
        }


        const rawInstances =
          result?.status
            ?.instances ||
          {};


        const priceInstances =
          Object.entries(
            rawInstances
          )
            .map(
              ([
                symbol,
                instance,
              ]) => ({

                symbol,

                botName:
                  instance?.bot ||
                  "",

                status:
                  instance?.status ||
                  "unknown",

                statusData:
                  instance
                    ?.statusData ||
                  null,
              })
            )
            .filter(
              (instance) =>
                instance.botName ===
                "pricev1"
            );


        setLiveInstances(
          priceInstances
        );

      } catch (error) {

        console.error(
          "Price V1 instance polling error:",
          error
        );
      }
    }


    loadInstances();


    const interval =
      setInterval(
        loadInstances,
        2000
      );


    return () => {

      mounted = false;

      clearInterval(
        interval
      );

    };

  }, []);


  // =======================================================
  // COMBINE INSTANCE LIST
  // =======================================================

  const allInstances =
    useMemo(() => {

      const map =
        new Map();


      for (
        const instance of instances
      ) {

        if (
          !instance?.symbol
        ) {
          continue;
        }


        map.set(
          String(
            instance.symbol
          ).toUpperCase(),
          instance
        );
      }


      for (
        const instance of liveInstances
      ) {

        if (
          !instance?.symbol
        ) {
          continue;
        }


        map.set(
          String(
            instance.symbol
          ).toUpperCase(),
          instance
        );
      }


      if (
        bot?.symbol
      ) {

        map.set(
          String(
            bot.symbol
          ).toUpperCase(),
          bot
        );
      }


      return Array.from(
        map.values()
      ).sort(
        (a, b) =>
          String(
            a.symbol
          ).localeCompare(
            String(
              b.symbol
            )
          )
      );

    }, [
      instances,
      liveInstances,
      bot,
    ]);


  // =======================================================
  // SELECTED INSTANCE
  // =======================================================

  const selectedInstance =
    useMemo(() => {

      if (
        selectedSymbol
      ) {

        const selected =
          allInstances.find(
            (instance) =>
              String(
                instance.symbol
              ).toUpperCase() ===
              String(
                selectedSymbol
              ).toUpperCase()
          );


        if (selected) {
          return selected;
        }
      }


      return (
        allInstances[0] ||
        null
      );

    }, [
      allInstances,
      selectedSymbol,
    ]);


  // =======================================================
  // SELECTED NODE DATA
  // =======================================================

  const [
    selectedNodeData,
    setSelectedNodeData,
  ] = useState(null);


  useEffect(() => {

    let mounted = true;


    if (
      !selectedSymbol
    ) {

      setSelectedNodeData(
        null
      );

      return () => {
        mounted = false;
      };
    }


    async function loadNodeStatus() {

      try {

        const cleanSymbol =
          String(
            selectedSymbol
          )
            .trim()
            .toUpperCase();


        const response =
          await fetch(
            `${API_BASE}/api/bots/status`,
            {
              cache:
                "no-store",
            }
          );


        if (
          !response.ok
        ) {

          console.error(
            `Price V1 ${cleanSymbol} HTTP error:`,
            response.status
          );

          return;
        }


        const result =
          await response.json();


        if (!mounted) {
          return;
        }


        const instance =
          result?.status
            ?.instances?.[
              cleanSymbol
            ];


        if (
          instance
        ) {

          setSelectedNodeData({

            success:
              true,

            symbol:
              cleanSymbol,

            running:
              instance.status ===
              "running",

            statusData:
              instance.statusData ||
              null,

          });

        }

      } catch (error) {

        console.error(
          "Selected Price V1 polling error:",
          error
        );

      }
    }


    loadNodeStatus();


    const interval =
      setInterval(
        loadNodeStatus,
        2000
      );


    return () => {

      mounted = false;

      clearInterval(
        interval
      );

    };

  }, [
    selectedSymbol,
  ]);


  // =======================================================
  // SINGLE SOURCE OF TRUTH
  // =======================================================

  const data =
    selectedNodeData?.statusData ||
    selectedInstance?.statusData ||
    bot?.statusData ||
    selectedInstance ||
    bot ||
    null;


  // =======================================================
  // BASIC DATA
  // =======================================================

  const symbol =
    selectedNodeData?.symbol ||
    data?.symbol ||
    selectedInstance?.symbol ||
    bot?.symbol ||
    "--";


  const candles =
    Array.isArray(
      data?.currentCandles
    )
      ? data.currentCandles
      : [];


  const currentCycle =
    Array.isArray(
      data?.currentCycle
    )
      ? data.currentCycle
      : [];


  const lastSnapshot =
    data?.lastSnapshot ||
    null;


  const cycleHistory =
    Array.isArray(
      data?.cycleHistory
    )
      ? data.cycleHistory
      : [];


  // =======================================================
  // DYNAMIC PRICE V1 SETTINGS
  //
  // These come from the running bot instance.
  //
  // No hard-coded strategy windows in the UI.
  // =======================================================

  const trendCandles =
    Number(
      data?.trendCandles ||
      200
    );


  const entryWindows =
    useMemo(() => {

      if (
        Array.isArray(
          data?.entryWindows
        ) &&
        data.entryWindows.length > 0
      ) {

        return data.entryWindows
          .map(Number)
          .filter(
            Number.isInteger
          );

      }


      return [
        15,
        20,
        30,
        60,
      ];

    }, [
      data?.entryWindows,
    ]);


  const cycleLength =
    Number(
      data?.cycleLength ||
      10
    );


  const trendRequired =
    Number(
      data?.trendRequired ??
      53
    );


  const entryRequired =
    Number(
      data?.entryRequired ??
      50
    );


  const entryConfirmationsRequired =
    Number(
      data?.entryConfirmationsRequired ??
      3
    );


  // =======================================================
  // PREVIOUS CYCLES
  //
  // IMPORTANT:
  //
  // bot_pricev1 uses unshift(), so cycleHistory is already
  // newest -> oldest.
  //
  // DO NOT reverse it.
  // =======================================================

  const previousCycles =
    useMemo(() => {

      return [
        ...cycleHistory,
      ];

    }, [
      cycleHistory,
    ]);


  const lastCycle =
    previousCycles[0] ||
    data?.lastCycle ||
    null;


  const cycleProgress =
    currentCycle.length;


  // =======================================================
  // CURRENT SNAPSHOT
  // =======================================================

  const trend =
    data?.trend ||
    lastSnapshot?.trend ||
    null;


  const entries =
    data?.entries ||
    lastSnapshot?.entries ||
    {};


  const confirmation =
    lastSnapshot?.confirmation ||
    data?.confirmation ||
    null;


  const finalDecision =
    data?.finalDecision ||
    lastSnapshot?.finalDecision ||
    data?.decision ||
    lastSnapshot?.decision ||
    "NEUTRAL";


  const currentPrice =
    data?.price ??
    lastSnapshot?.price ??
    null;


  const priceMovement =
    data?.priceMovement ||
    lastSnapshot?.priceMovement ||
    {};


  // =======================================================
  // TREND
  // =======================================================

  const trendDirection =
    trend?.direction ||
    trend?.rawDirection ||
    "NEUTRAL";


  const trendStrength =
    trend?.strength ??
    null;


  const trendUpMovement =
    trend?.upMovement ??
    null;


  const trendDownMovement =
    trend?.downMovement ??
    null;


  const hasTrendCandles =
    candles.length >=
      trendCandles + 1 ||
    Boolean(trend);


  // =======================================================
  // CONFIRMATION
  // =======================================================

  const confirmationDecision =
    confirmation?.decision ||
    "NEUTRAL";


  const longVotes =
    confirmation?.longVotes ??
    0;


  const shortVotes =
    confirmation?.shortVotes ??
    0;


  const neutralVotes =
    confirmation?.neutralVotes ??
    0;


  const rawLongVotes =
    confirmation?.rawLongVotes ??
    0;


  const rawShortVotes =
    confirmation?.rawShortVotes ??
    0;


  const lastConfirmationTime =
    lastSnapshot?.timestamp ||
    null;


  // =======================================================
  // PRICE MOVEMENT
  //
  // These remain the existing 5/10/20/60 display values.
  // They are separate from ENTRY_WINDOWS.
  // =======================================================

  const movement5 =
    priceMovement["5"] ??
    priceMovement[5] ??
    null;


  const movement10 =
    priceMovement["10"] ??
    priceMovement[10] ??
    null;


  const movement20 =
    priceMovement["20"] ??
    priceMovement[20] ??
    null;


  const movement60 =
    priceMovement["60"] ??
    priceMovement[60] ??
    null;


  // =======================================================
  // RENDER
  // =======================================================

  return (

    <div className="price-v1-panel">


      {/* ==================================================
          HEADER
          ================================================== */}

      <div className="panel-header">

        <div>

          <div className="panel-title">
            PRICE V1
          </div>

          <div className="panel-subtitle">
            PRICE ONLY
          </div>

        </div>


        <div
          className={`bot-status ${
            selectedNodeData?.running ||
            selectedInstance?.status ===
              "running"
              ? "running"
              : "stopped"
          }`}
        >
          {
            selectedNodeData?.running ||
            selectedInstance?.status ===
              "running"
              ? "RUNNING"
              : "STOPPED"
          }
        </div>

      </div>


      {/* ==================================================
          CONTROLS
          ================================================== */}

      <div className="price-v1-controls">

        <div className="control-box">

          <div className="control-label">
            SYMBOL
          </div>

          <select
            value={
              selectedSymbol ||
              ""
            }
            onChange={(
              event
            ) => {

              if (
                typeof onSelectSymbol ===
                "function"
              ) {

                onSelectSymbol(
                  event.target.value
                );
              }

            }}
          >

            {
              allInstances.length ===
              0 ? (

                <option value="">
                  No Price V1 bots
                </option>

              ) : (

                allInstances.map(
                  (instance) => (

                    <option
                      key={
                        instance.symbol
                      }
                      value={
                        instance.symbol
                      }
                    >
                      {
                        instance.symbol
                      }
                    </option>

                  )
                )

              )
            }

          </select>

        </div>


        <div className="control-box">

          <div className="control-label">
            TIMEFRAME
          </div>

          <div className="control-value">
            {
              data?.timeframe ||
              "1m"
            }
          </div>

        </div>


        <div className="control-box">

          <div className="control-label">
            CANDLES
          </div>

          <div className="control-value">
            {
              candles.length
            }
          </div>

        </div>

      </div>


      {/* ==================================================
          SUMMARY
          ================================================== */}

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
            /
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
            {
              normalizeDirection(
                finalDecision
              )
            }
          </div>

        </div>

      </div>


      {/* ==================================================
          PRICE
          ================================================== */}

      <div className="price-v1-price-card">

        <div className="price-card-label">
          CURRENT PRICE
        </div>

        <div className="price-card-value">
          {
            formatPrice(
              currentPrice
            )
          }
        </div>

      </div>


      {/* ==================================================
          PRICE MOVEMENT
          ================================================== */}

      <div className="section-title">
        PRICE MOVEMENT
      </div>


      <div className="price-v1-summary movement-summary">

        <div className="summary-box">

          <div className="summary-label">
            5 CANDLES
          </div>

          <div
            className={`summary-value ${
              movement5 ===
              null
                ? "neutral"
                : movement5 >= 0
                ? "long"
                : "short"
            }`}
          >
            {
              formatPercent(
                movement5
              )
            }
          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            10 CANDLES
          </div>

          <div
            className={`summary-value ${
              movement10 ===
              null
                ? "neutral"
                : movement10 >= 0
                ? "long"
                : "short"
            }`}
          >
            {
              formatPercent(
                movement10
              )
            }
          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            20 CANDLES
          </div>

          <div
            className={`summary-value ${
              movement20 ===
              null
                ? "neutral"
                : movement20 >= 0
                ? "long"
                : "short"
            }`}
          >
            {
              formatPercent(
                movement20
              )
            }
          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            60 CANDLES
          </div>

          <div
            className={`summary-value ${
              movement60 ===
              null
                ? "neutral"
                : movement60 >= 0
                ? "long"
                : "short"
            }`}
          >
            {
              formatPercent(
                movement60
              )
            }
          </div>

        </div>

      </div>


      {/* ==================================================
          DYNAMIC TREND DIRECTION
          ================================================== */}

      <div className="section-title">

        {trendCandles}
        {" CANDLE DIRECTION"}

      </div>


      <div className="price-v1-trend-card">

        <div className="trend-header">

          <div
            className={`trend-status ${directionClass(
              trendDirection
            )}`}
          >

            {
              hasTrendCandles
                ? normalizeDirection(
                    trendDirection
                  )
                : "WAITING"
            }

          </div>

        </div>


        <div className="trend-grid">

          <div className="trend-box">

            <div className="trend-label">
              TREND DIRECTION
            </div>

            <div
              className={`trend-value ${directionClass(
                trendDirection
              )}`}
            >

              {
                hasTrendCandles
                  ? normalizeDirection(
                      trendDirection
                    )
                  : "--"
              }

            </div>

          </div>


          <div className="trend-box">

            <div className="trend-label">
              STRENGTH
            </div>

            <div className="trend-value">
              {
                formatPercent(
                  trendStrength
                )
              }
            </div>

          </div>


          <div className="trend-box">

            <div className="trend-label">
              UP MOVEMENT
            </div>

            <div className="trend-value long">
              {
                formatPercent(
                  trendUpMovement
                )
              }
            </div>

          </div>


          <div className="trend-box">

            <div className="trend-label">
              DOWN MOVEMENT
            </div>

            <div className="trend-value short">
              {
                formatPercent(
                  trendDownMovement
                )
              }
            </div>

          </div>

        </div>


        {!hasTrendCandles && (

          <div className="trend-waiting">

            Waiting for{" "}
            {trendCandles}
            {" candles..."}

          </div>

        )}

      </div>


      {/* ==================================================
          ENTRY CONFIRMATION
          ================================================== */}

      <div className="section-title">
        ENTRY CONFIRMATION
      </div>


      <div className="price-v1-entry-grid">

        {
          entryWindows.map(
            (windowSize) => (

              <EntryCell
                key={
                  windowSize
                }
                entries={
                  entries
                }
                windowSize={
                  windowSize
                }
              />

            )
          )
        }

      </div>


      {/* ==================================================
          CONFIRMATION SUMMARY
          ================================================== */}

      <div className="price-v1-summary confirmation-summary">

        <div className="summary-box">

          <div className="summary-label">
            RAW LONG
          </div>

          <div className="summary-value long">
            {rawLongVotes}
          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            RAW SHORT
          </div>

          <div className="summary-value short">
            {rawShortVotes}
          </div>

        </div>


        <div className="summary-box">

          <div className="summary-label">
            NEUTRAL
          </div>

          <div className="summary-value neutral">
            {neutralVotes}
          </div>

        </div>


        <div className="summary-box confirmation-result">

          <div className="summary-label">
            CONFIRMATION
          </div>

          <div
            className={`summary-value ${directionClass(
              confirmationDecision
            )}`}
          >
            {
              normalizeDirection(
                confirmationDecision
              )
            }
          </div>

        </div>


        <div className="summary-box confirmation-result">

          <div className="summary-label">
            REQUIRED
          </div>

          <div className="summary-value">
            {
              entryConfirmationsRequired
            }
          </div>

        </div>


        <div className="summary-box confirmation-result">

          <div className="summary-label">
            LAST CONFIRMATION
          </div>

          <div className="summary-value confirmation-time">
            {
              formatBerlinTime(
                lastConfirmationTime
              )
            }
          </div>

        </div>

      </div>


      {/* ==================================================
          PRICE CHART
          ================================================== */}

      <div className="section-title">
        PRICE CHART
      </div>


      <PriceChart
        key={symbol}
        candles={candles}
      />


      {/* ==================================================
          CURRENT CYCLE
          ================================================== */}

      <div className="panel-card">

        <div className="panel-card-header">

          <div>

            <div className="panel-card-title">
              CURRENT CYCLE
            </div>

            <div className="panel-card-subtitle">
              Live snapshot collection
            </div>

          </div>

          <div className="cycle-progress">
            {currentCycle.length}
            {" / "}
            {cycleLength}
          </div>

        </div>


        {
          currentCycle.length ===
          0 ? (

            <div className="empty-state">
              Waiting for first snapshot...
            </div>

          ) : (

            <div className="table-wrap">

              <table className="decision-table">

                <thead>

                  <tr>

                    <th>
                      Time
                    </th>

                    <th>
                      Coin
                    </th>

                    <th>
                      Trend
                    </th>

                    {
                      entryWindows.map(
                        (windowSize) => (

                          <th
                            key={
                              windowSize
                            }
                          >
                            {windowSize}
                          </th>

                        )
                      )
                    }

                    <th>
                      Decision
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {
                    [
                      ...currentCycle
                    ]
                      .reverse()
                      .map(
                        (
                          snapshot,
                          index
                        ) => {

                          const snapshotTrend =
                            snapshot?.trend ||
                            {};


                          const formatSnapshotEntry =
                            (
                              entry
                            ) => {

                              const direction =
                                entry?.direction ||
                                "NEUTRAL";

                              const strength =
                                entry?.strength;


                              if (
                                strength ===
                                  null ||
                                strength ===
                                  undefined
                              ) {

                                return direction;
                              }


                              return `${direction} ${Number(
                                strength
                              ).toFixed(2)}%`;

                            };


                          const trendText =
                            snapshotTrend?.strength !==
                              null &&
                            snapshotTrend?.strength !==
                              undefined

                              ? `${snapshotTrend?.direction || "NEUTRAL"} ${Number(
                                  snapshotTrend.strength
                                ).toFixed(2)}%`

                              : (
                                  snapshotTrend?.direction ||
                                  "NEUTRAL"
                                );


                          return (

                            <tr
                              key={
                                `${
                                  snapshot?.candleTime ||
                                  snapshot?.timestamp ||
                                  index
                                }-${index}`
                              }
                            >

                              <td>
                                {
                                  formatBerlinTime(
                                    snapshot?.timestamp
                                  )
                                }
                              </td>


                              <td className="coin-cell">
                                {
                                  snapshot?.symbol ||
                                  selectedSymbol ||
                                  "--"
                                }
                              </td>


                              <td>

                                <span
                                  className={`decision-value ${directionClass(
                                    snapshotTrend?.direction
                                  )}`}
                                >
                                  {
                                    trendText
                                  }
                                </span>

                              </td>


                              {
                                entryWindows.map(
                                  (
                                    windowSize
                                  ) => {

                                    const entry =
                                      getEntry(
                                        snapshot?.entries,
                                        windowSize
                                      ) ||
                                      {};

                                    return (

                                      <td
                                        key={
                                          windowSize
                                        }
                                      >

                                        <span
                                          className={`decision-value ${directionClass(
                                            entry?.direction
                                          )}`}
                                        >
                                          {
                                            formatSnapshotEntry(
                                              entry
                                            )
                                          }
                                        </span>

                                      </td>

                                    );

                                  }
                                )
                              }


                              <td>

                                <span
                                  className={`decision-value ${directionClass(
                                    snapshot?.decision
                                  )}`}
                                >
                                  {
                                    snapshot?.decision ||
                                    "NEUTRAL"
                                  }
                                </span>

                              </td>

                            </tr>

                          );

                        }
                      )
                  }

                </tbody>

              </table>

            </div>

          )
        }

      </div>


      {/* ==================================================
          PREVIOUS CYCLES
          ================================================== */}

      <div className="panel-card">

        <div className="panel-card-header">

          <div>

            <div className="panel-card-title">
              PREVIOUS CYCLES
            </div>

            <div className="panel-card-subtitle">
              Completed Cycle History
            </div>

          </div>

          <div className="cycle-progress">

            {previousCycles.length}
            {" "}
            {
              previousCycles.length ===
              1
                ? "cycle"
                : "cycles"
            }

          </div>

        </div>


        {
          previousCycles.length ===
          0 ? (

            <div className="empty-state">
              No completed cycles yet.
            </div>

          ) : (

            <div className="table-wrap">

              <table className="decision-table">

                <thead>

                  <tr>

                    <th>
                      Time
                    </th>

                    <th>
                      Coin
                    </th>

                    <th>
                      Trend
                    </th>

                    {
                      entryWindows.map(
                        (windowSize) => (

                          <th
                            key={
                              windowSize
                            }
                          >
                            {windowSize}
                          </th>

                        )
                      )
                    }

                    <th>
                      Decision
                    </th>

                    <th>
                      Reason
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {
                    previousCycles.map(
                      (
                        cycle,
                        index
                      ) => (

                        <PreviousCycleRow
                          key={
                            cycle?.cycleId ||
                            `${getCycleTime(
                              cycle
                            )}-${index}`
                          }

                          cycle={
                            cycle
                          }

                          selectedSymbol={
                            selectedSymbol
                          }

                          entryWindows={
                            entryWindows
                          }

                        />

                      )
                    )
                  }

                </tbody>

              </table>

            </div>

          )
        }

      </div>


      {/* ==================================================
          LAST COMPLETED CYCLE
          ================================================== */}

      {
        lastCycle && (

          <div className="last-cycle-card">

            <div className="section-title">
              LAST COMPLETED CYCLE
            </div>


            <div className="last-cycle-grid">

              <div>

                <div className="trend-label">
                  CYCLE
                </div>

                <div className="trend-value">

                  #

                  {
                    lastCycle.cycleId ??
                    "--"
                  }

                </div>

              </div>


              <div>

                <div className="trend-label">
                  DECISION
                </div>

                <div
                  className={`trend-value ${directionClass(
                    getCycleDecision(
                      lastCycle
                    )
                  )}`}
                >
                  {
                    normalizeDirection(
                      getCycleDecision(
                        lastCycle
                      )
                    )
                  }
                </div>

              </div>


              <div>

                <div className="trend-label">
                  LONG
                </div>

                <div className="trend-value long">
                  {
                    lastCycle.votes
                      ?.long ??
                    0
                  }
                </div>

              </div>


              <div>

                <div className="trend-label">
                  SHORT
                </div>

                <div className="trend-value short">
                  {
                    lastCycle.votes
                      ?.short ??
                    0
                  }
                </div>

              </div>


              <div>

                <div className="trend-label">
                  NEUTRAL
                </div>

                <div className="trend-value neutral">
                  {
                    lastCycle.votes
                      ?.neutral ??
                    0
                  }
                </div>

              </div>

            </div>


            <div className="last-cycle-reason">

              {
                lastCycle.reason ||
                lastCycle.finalReason ||
                "--"
              }

            </div>

          </div>

        )
      }


    </div>
  );
}

