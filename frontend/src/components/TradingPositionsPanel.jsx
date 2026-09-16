import React, { useEffect, useState } from "react";

function formatNumber(value, decimals = 4) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "-";
    }

    return number.toFixed(decimals);
}

function formatPnl(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "-";
    }

    if (number > 0) {
        return `+${number.toFixed(4)} USDT`;
    }

    return `${number.toFixed(4)} USDT`;
}

function formatTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function formatWinRate(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0.0%";
    }

    return `${number.toFixed(1)}%`;
}

export default function TradingPositionsPanel() {
    const [openPositions, setOpenPositions] = useState([]);

    const [tradeHistory, setTradeHistory] = useState([]);
    const [activeTrades, setActiveTrades] = useState([]);
    const [perCoin, setPerCoin] = useState([]);

    const [tradeSummary, setTradeSummary] = useState({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        winRate: 0,
        realizedPnl: 0,
        activeTrades: 0,
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // ============================================================
    // LIVE WEEX POSITIONS
    // ============================================================

    useEffect(() => {
        let cancelled = false;

        async function loadPositions() {
            try {
                const response = await fetch(
                    "http://localhost:3001/api/weex/positions"
                );

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.error ||
                            "Failed to load positions."
                    );
                }

                if (!cancelled) {
                    setOpenPositions(
                        Array.isArray(data.positions)
                            ? data.positions
                            : []
                    );

                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadPositions();

        const interval = setInterval(
            loadPositions,
            5000
        );

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    // ============================================================
    // BOT LAB TRADE HISTORY
    // ============================================================

    useEffect(() => {
        let cancelled = false;

        async function loadTradeHistory() {
            try {
                const response = await fetch(
                    "http://localhost:3001/api/trading/history"
                );

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.error ||
                            "Failed to load Bot Lab trade history."
                    );
                }

                if (!cancelled) {
                    setTradeHistory(
                        Array.isArray(data.completedTrades)
                            ? data.completedTrades
                            : []
                    );

                    setActiveTrades(
                        Array.isArray(data.activeTrades)
                            ? data.activeTrades
                            : []
                    );

                    setPerCoin(
                        Array.isArray(data.perCoin)
                            ? data.perCoin
                            : []
                    );

                    setTradeSummary({
                        totalTrades:
                            Number(
                                data.summary?.totalTrades || 0
                            ),

                        wins:
                            Number(
                                data.summary?.wins || 0
                            ),

                        losses:
                            Number(
                                data.summary?.losses || 0
                            ),

                        breakeven:
                            Number(
                                data.summary?.breakeven || 0
                            ),

                        winRate:
                            Number(
                                data.summary?.winRate || 0
                            ),

                        realizedPnl:
                            Number(
                                data.summary?.realizedPnl || 0
                            ),

                        activeTrades:
                            Number(
                                data.summary?.activeTrades || 0
                            ),
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    console.error(
                        "[Trading History]",
                        err
                    );
                }
            }
        }

        loadTradeHistory();

        const interval = setInterval(
            loadTradeHistory,
            3000
        );

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    // ============================================================
    // LIVE UNREALIZED PNL
    // ============================================================

    const unrealizedPnl =
        openPositions.reduce(
            (total, position) =>
                total +
                Number(
                    position.unrealizePnl || 0
                ),
            0
        );

    // ============================================================
    // SUMMARY VALUES
    // ============================================================

    const wins =
        tradeSummary.wins;

    const losses =
        tradeSummary.losses;

    const totalTrades =
        tradeSummary.totalTrades;

    const winRate =
        Number(
            tradeSummary.winRate || 0
        );

    const realizedPnl =
        Number(
            tradeSummary.realizedPnl || 0
        );

    return (
        <section className="trading-positions-panel">

            {/* ==================================================
                HEADER
                ================================================== */}

            <div className="trading-panel-header">

                <div>
                    <div className="trading-panel-title">
                        TRADING
                    </div>

                    <div className="trading-panel-subtitle">
                        Live WEEX positions and Bot Lab trades
                    </div>
                </div>

                <div className="trading-live-status">

                    <span className="trading-live-dot"></span>

                    {loading
                        ? "CONNECTING"
                        : "LIVE"}

                </div>

            </div>


            {/* ==================================================
                ERROR
                ================================================== */}

            {error && (
                <div
                    style={{
                        padding: "12px 14px",
                        marginBottom: "16px",
                        borderRadius: "8px",
                        color: "#ef4444",
                        background:
                            "rgba(239, 68, 68, 0.08)",
                        fontSize: "12px",
                    }}
                >
                    WEEX ERROR: {error}
                </div>
            )}


            {/* ==================================================
                SUMMARY
                ================================================== */}

            <div className="trading-stat-grid">

                <div className="trading-stat-card">

                    <div className="trading-stat-label">
                        OPEN POSITIONS
                    </div>

                    <div className="trading-stat-value">
                        {openPositions.length}
                    </div>

                </div>


                <div className="trading-stat-card">

                    <div className="trading-stat-label">
                        WINS
                    </div>

                    <div className="trading-stat-value trading-positive">
                        {wins}
                    </div>

                </div>


                <div className="trading-stat-card">

                    <div className="trading-stat-label">
                        LOSSES
                    </div>

                    <div className="trading-stat-value trading-negative">
                        {losses}
                    </div>

                </div>


                <div className="trading-stat-card">

                    <div className="trading-stat-label">
                        WIN RATE
                    </div>

                    <div className="trading-stat-value">
                        {formatWinRate(winRate)}
                    </div>

                </div>


                <div className="trading-stat-card">

                    <div className="trading-stat-label">
                        REALIZED PNL
                    </div>

                    <div
                        className={`trading-stat-value ${
                            realizedPnl >= 0
                                ? "trading-positive"
                                : "trading-negative"
                        }`}
                    >
                        {formatPnl(realizedPnl)}
                    </div>

                </div>


                <div className="trading-stat-card">

                    <div className="trading-stat-label">
                        UNREALIZED PNL
                    </div>

                    <div
                        className={`trading-stat-value ${
                            unrealizedPnl >= 0
                                ? "trading-positive"
                                : "trading-negative"
                        }`}
                    >
                        {formatPnl(unrealizedPnl)}
                    </div>

                </div>

            </div>


            {/* ==================================================
                CURRENT POSITIONS
                ================================================== */}

            <div className="trading-section">

                <div className="trading-section-header">

                    <div>

                        <div className="trading-section-title">
                            CURRENT POSITIONS
                        </div>

                        <div className="trading-section-description">
                            Live positions from WEEX
                        </div>

                    </div>

                    <div className="trading-section-count">
                        {openPositions.length}
                    </div>

                </div>


                <div className="trading-table-wrapper">

                    <table className="trading-table">

                        <thead>

                            <tr>
                                <th>COIN</th>
                                <th>SIDE</th>
                                <th>SIZE</th>
                                <th>LEVERAGE</th>
                                <th>MARGIN</th>
                                <th>OPEN VALUE</th>
                                <th>UNREALIZED PNL</th>
                            </tr>

                        </thead>


                        <tbody>

                            {openPositions.length === 0 ? (

                                <tr>

                                    <td
                                        colSpan="7"
                                        className="trading-empty"
                                    >
                                        No open positions.
                                    </td>

                                </tr>

                            ) : (

                                openPositions.map(
                                    (
                                        position,
                                        index
                                    ) => {

                                        const pnl =
                                            Number(
                                                position.unrealizePnl
                                            );

                                        return (

                                            <tr
                                                key={
                                                    position.id ||
                                                    `${position.symbol}-${index}`
                                                }
                                            >

                                                <td className="trading-symbol">
                                                    {position.symbol}
                                                </td>


                                                <td>

                                                    <span
                                                        className={`position-side ${
                                                            position.side ===
                                                            "LONG"
                                                                ? "position-long"
                                                                : "position-short"
                                                        }`}
                                                    >
                                                        {position.side}
                                                    </span>

                                                </td>


                                                <td>
                                                    {position.size}
                                                </td>


                                                <td>
                                                    {position.leverage}x
                                                </td>


                                                <td>
                                                    {formatNumber(
                                                        position.marginSize,
                                                        4
                                                    )}{" "}
                                                    USDT
                                                </td>


                                                <td>
                                                    {formatNumber(
                                                        position.openValue,
                                                        2
                                                    )}{" "}
                                                    USDT
                                                </td>


                                                <td
                                                    className={
                                                        pnl >= 0
                                                            ? "trading-positive"
                                                            : "trading-negative"
                                                    }
                                                >
                                                    {formatPnl(pnl)}
                                                </td>

                                            </tr>

                                        );
                                    }
                                )

                            )}

                        </tbody>

                    </table>

                </div>

            </div>


            {/* ==================================================
                BOT LAB ACTIVE TRADES
                ================================================== */}

            <div className="trading-section">

                <div className="trading-section-header">

                    <div>

                        <div className="trading-section-title">
                            BOT ACTIVE TRADES
                        </div>

                        <div className="trading-section-description">
                            Positions currently tracked by Bot Lab
                        </div>

                    </div>

                    <div className="trading-section-count">
                        {activeTrades.length}
                    </div>

                </div>


                <div className="trading-table-wrapper">

                    <table className="trading-table">

                        <thead>

                            <tr>
                                <th>TIME</th>
                                <th>COIN</th>
                                <th>SIDE</th>
                                <th>ENTRY</th>
                                <th>SIZE</th>
                                <th>SOURCE</th>
                            </tr>

                        </thead>


                        <tbody>

                            {activeTrades.length === 0 ? (

                                <tr>

                                    <td
                                        colSpan="6"
                                        className="trading-empty"
                                    >
                                        No active Bot Lab trades.
                                    </td>

                                </tr>

                            ) : (

                                activeTrades.map(
                                    (trade) => (

                                        <tr key={trade.id}>

                                            <td>
                                                {formatTime(
                                                    trade.entryTime
                                                )}
                                            </td>


                                            <td className="trading-symbol">
                                                {trade.symbol}
                                            </td>


                                            <td>

                                                <span
                                                    className={`position-side ${
                                                        trade.side ===
                                                        "LONG"
                                                            ? "position-long"
                                                            : "position-short"
                                                    }`}
                                                >
                                                    {trade.side}
                                                </span>

                                            </td>


                                            <td>
                                                {formatNumber(
                                                    trade.entryPrice,
                                                    6
                                                )}
                                            </td>


                                            <td>
                                                {formatNumber(
                                                    trade.entrySize,
                                                    4
                                                )}
                                            </td>


                                            <td>
                                                {trade.source ||
                                                    "BOT"}
                                            </td>

                                        </tr>

                                    )
                                )

                            )}

                        </tbody>

                    </table>

                </div>

            </div>


            {/* ==================================================
                COIN PERFORMANCE
                ================================================== */}

            <div className="trading-section">

                <div className="trading-section-header">

                    <div>

                        <div className="trading-section-title">
                            COIN PERFORMANCE
                        </div>

                        <div className="trading-section-description">
                            Bot Lab completed-trade performance by coin
                        </div>

                    </div>

                    <div className="trading-section-count">
                        {perCoin.length}
                    </div>

                </div>


                <div className="trading-table-wrapper">

                    <table className="trading-table">

                        <thead>

                            <tr>
                                <th>COIN</th>
                                <th>TRADES</th>
                                <th>LONG</th>
                                <th>SHORT</th>
                                <th>WINS</th>
                                <th>LOSSES</th>
                                <th>WIN RATE</th>
                                <th>P&amp;L</th>
                            </tr>

                        </thead>


                        <tbody>

                            {perCoin.length === 0 ? (

                                <tr>

                                    <td
                                        colSpan="8"
                                        className="trading-empty"
                                    >
                                        No completed Bot Lab trades yet.
                                    </td>

                                </tr>

                            ) : (

                                perCoin.map(
                                    (coin) => {

                                        const pnl =
                                            Number(
                                                coin.pnl || 0
                                            );

                                        return (

                                            <tr
                                                key={
                                                    coin.symbol
                                                }
                                            >

                                                <td className="trading-symbol">
                                                    {coin.symbol}
                                                </td>


                                                <td>
                                                    {coin.totalTrades}
                                                </td>


                                                <td>
                                                    {coin.longTrades}
                                                </td>


                                                <td>
                                                    {coin.shortTrades}
                                                </td>


                                                <td className="trading-positive">
                                                    {coin.wins}
                                                </td>


                                                <td className="trading-negative">
                                                    {coin.losses}
                                                </td>


                                                <td>
                                                    {formatWinRate(
                                                        coin.winRate
                                                    )}
                                                </td>


                                                <td
                                                    className={
                                                        pnl >= 0
                                                            ? "trading-positive"
                                                            : "trading-negative"
                                                    }
                                                >
                                                    {formatPnl(pnl)}
                                                </td>

                                            </tr>

                                        );
                                    }
                                )

                            )}

                        </tbody>

                    </table>

                </div>

            </div>


            {/* ==================================================
                TRADE HISTORY
                ================================================== */}

            <div className="trading-section">

                <div className="trading-section-header">

                    <div>

                        <div className="trading-section-title">
                            TRADE HISTORY
                        </div>

                        <div className="trading-section-description">
                            Completed positions recorded by Bot Lab
                        </div>

                    </div>

                    <div className="trading-section-count">
                        {totalTrades}
                    </div>

                </div>


                <div className="trading-table-wrapper">

                    <table className="trading-table">

                        <thead>

                            <tr>
                                <th>TIME</th>
                                <th>COIN</th>
                                <th>SIDE</th>
                                <th>ENTRY</th>
                                <th>EXIT</th>
                                <th>P&amp;L</th>
                                <th>RESULT</th>
                            </tr>

                        </thead>


                        <tbody>

                            {tradeHistory.length === 0 ? (

                                <tr>

                                    <td
                                        colSpan="7"
                                        className="trading-empty"
                                    >
                                        No completed Bot Lab trades yet.
                                    </td>

                                </tr>

                            ) : (

                                tradeHistory.map(
                                    (trade) => {

                                        const pnl =
                                            Number(
                                                trade.pnl || 0
                                            );

                                        return (

                                            <tr
                                                key={
                                                    trade.id
                                                }
                                            >

                                                <td>
                                                    {formatTime(
                                                        trade.exitTime ||
                                                        trade.entryTime
                                                    )}
                                                </td>


                                                <td className="trading-symbol">
                                                    {trade.symbol}
                                                </td>


                                                <td>

                                                    <span
                                                        className={`position-side ${
                                                            trade.side === "LONG"
                                                                ? "position-long"
                                                                : "position-short"
                                                        }`}
                                                    >
                                                        {trade.side}
                                                    </span>

                                                </td>


                                                <td>
                                                    {formatNumber(
                                                        trade.entryPrice,
                                                        6
                                                    )}
                                                </td>


                                                <td>
                                                    {trade.exitPrice !==
                                                    null &&
                                                    trade.exitPrice !==
                                                        undefined
                                                        ? formatNumber(
                                                            trade.exitPrice,
                                                            6
                                                        )
                                                        : "-"}
                                                </td>


                                                <td
                                                    className={
                                                        pnl >= 0
                                                            ? "trading-positive"
                                                            : "trading-negative"
                                                    }
                                                >
                                                    {formatPnl(pnl)}
                                                </td>


                                                <td>

                                                    <span
                                                        className={`trade-result ${
                                                            trade.result ===
                                                            "WIN"
                                                                ? "trade-win"
                                                                : trade.result ===
                                                                  "LOSS"
                                                                ? "trade-loss"
                                                                : ""
                                                        }`}
                                                    >
                                                        {trade.result}
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

            </div>

        </section>
    );
}
