const config = require("../config/config");
const weex = require("./weex");

const symbolLocks = new Set();

let exchangeInfoCache = null;
let exchangeInfoCacheTime = 0;

const EXCHANGE_INFO_CACHE_MS =
    5 * 60 * 1000;


// ============================================================
// WEEX SESSION CLOCK
// ============================================================
//
// WEEX timestamps are Unix milliseconds.
//
// At backend startup:
//
//     Node local time
//             ↓
//     ask WEEX for server time
//             ↓
//     calculate clock offset
//
// After that:
//
//     synchronizedWeexNow()
//          = Date.now() + offset
//
// This means we only ask WEEX for the clock ONCE at startup.
//
// We do NOT make another clock request every minute.
//
// ============================================================

let weexClockOffsetMs = 0;

let weexClockInitialized = false;

let weexSessionStartTime = null;

let weexClockLocalSyncTime = null;

async function initializeWeexSessionClock() {
    const localBefore =
        Date.now();

    try {
        const response =
            await weex.requestPublic(
                "/capi/v3/market/time"
            );

        const serverTime =
            Number(
                response?.serverTime ??
                response?.data ??
                response?.result?.serverTime ??
                0
            );

        if (
            !Number.isFinite(serverTime) ||
            serverTime <= 0
        ) {
            throw new Error(
                `Invalid WEEX server time response: ${JSON.stringify(response)}`
            );
        }

        const localAfter =
            Date.now();

        // ----------------------------------------------------
        // Estimate the local time at approximately the middle
        // of the request.
        //
        // This reduces the small network-latency difference.
        // ----------------------------------------------------

        const localMidpoint =
            Math.round(
                (
                    localBefore +
                    localAfter
                ) / 2
            );

        weexClockOffsetMs =
            serverTime -
            localMidpoint;

        weexClockLocalSyncTime =
            localMidpoint;

        weexSessionStartTime =
            serverTime;

        weexClockInitialized = true;

        console.log(
            `[TradeHistory] WEEX clock synced. ` +
            `WEEX=${new Date(serverTime).toISOString()} ` +
            `Node=${new Date(localMidpoint).toISOString()} ` +
            `Offset=${weexClockOffsetMs}ms`
        );

        console.log(
            `[TradeHistory] Session starts at ` +
            `${new Date(weexSessionStartTime).toISOString()}`
        );

        return {
            serverTime,
            localTime:
                localMidpoint,
            offsetMs:
                weexClockOffsetMs,
        };
    } catch (error) {
        // ----------------------------------------------------
        // Fallback:
        //
        // We still allow the bot to start if the public clock
        // request fails.
        //
        // Node time becomes the session clock.
        // ----------------------------------------------------

        weexClockOffsetMs = 0;

        weexClockLocalSyncTime =
            Date.now();

        weexSessionStartTime =
            weexClockLocalSyncTime;

        weexClockInitialized = false;

        console.warn(
            `[TradeHistory] WEEX clock sync failed: ${error.message}`
        );

        console.warn(
            `[TradeHistory] Falling back to Node local time for this session.`
        );

        return {
            serverTime:
                weexSessionStartTime,

            localTime:
                weexSessionStartTime,

            offsetMs:
                0,
        };
    }
}


function getSynchronizedWeexTime() {
    return (
        Date.now() +
        weexClockOffsetMs
    );
}


// ============================================================
// WEEX TRADE HISTORY CACHE
// ============================================================
//
// SIMPLE DESIGN:
//
// WEEX is the source of truth for the Trading page.
//
// Every 60 seconds:
//
//     ONE WEEX order-history request
//                 ↓
//        normalize the orders
//                 ↓
//        pair OPEN + CLOSE
//                 ↓
//        keep everything in memory
//
// The React dashboard never asks WEEX directly.
//
// The dashboard reads the local backend cache.
//
// IMPORTANT:
//
// Only trades created AFTER the backend session started
// are included.
//
// ============================================================

const tradeHistoryCache = {
    updatedAt: null,

    loading: false,

    error: null,

    sessionStartTime: null,

    sessionStartTimeLocal: null,

    orders: [],

    activeTrades: [],

    completedTrades: [],
};

const WEEX_TRADE_HISTORY_REFRESH_MS =
    60 * 1000;

let tradeHistoryRefreshTimer = null;


// ============================================================
// BASIC HELPERS
// ============================================================

function normalizeSymbol(symbol) {
    return String(symbol || "")
        .trim()
        .toUpperCase()
        .replace(/\.P$/, "");
}


function normalizeSignal(signal) {
    const value = String(signal || "")
        .trim()
        .toUpperCase();

    if (value === "LONG") return "LONG";
    if (value === "SHORT") return "SHORT";
    if (value === "NEUTRAL") return "NEUTRAL";
    if (value === "CLOSE") return "CLOSE";
    if (value === "CLOSE_LONG") return "CLOSE_LONG";
    if (value === "CLOSE_SHORT") return "CLOSE_SHORT";

    return null;
}


function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


function toNumber(
    value,
    fallback = 0
) {
    const number =
        Number(value);

    if (
        !Number.isFinite(number)
    ) {
        return fallback;
    }

    return number;
}


// ============================================================
// WEEX HISTORY HELPERS
// ============================================================

function historyNumber(
    value,
    fallback = 0
) {
    return toNumber(
        value,
        fallback
    );
}


function historySymbol(
    order
) {
    return normalizeSymbol(
        order?.symbol ||
        order?.contract ||
        order?.instId ||
        ""
    );
}


function historySide(
    order
) {
    return String(
        order?.positionSide ||
        ""
    )
        .trim()
        .toUpperCase();
}


function historyOrderStatus(
    order
) {
    return String(
        order?.status ||
        ""
    )
        .trim()
        .toUpperCase();
}


function historyTimestamp(
    order
) {
    const value =
        historyNumber(
            order?.updateTime ??
            order?.time ??
            0
        );

    if (value <= 0) {
        return 0;
    }

    return value < 100000000000
        ? value * 1000
        : value;
}


function historyAveragePrice(
    order
) {
    const candidates = [
        order?.avgPrice,
        order?.averagePrice,
        order?.priceAvg,
        order?.executedPrice,
        order?.fillPrice,
        order?.price,
    ];

    for (
        const candidate
            of candidates
    ) {
        const value =
            historyNumber(
                candidate,
                0
            );

        if (value > 0) {
            return value;
        }
    }

    return 0;
}


function historyQuantity(
    order
) {
    const candidates = [
        order?.executedQty,
        order?.filledQty,
        order?.filledSize,
        order?.executedSize,
        order?.size,
        order?.quantity,
        order?.origQty,
    ];

    for (
        const candidate
            of candidates
    ) {
        const value =
            Math.abs(
                historyNumber(
                    candidate,
                    0
                )
            );

        if (value > 0) {
            return value;
        }
    }

    return 0;
}


function historyReduceOnly(
    order
) {
    return (
        order?.reduceOnly === true ||
        String(
            order?.reduceOnly || ""
        )
            .trim()
            .toLowerCase() ===
            "true"
    );
}


function historyIsFilled(
    order
) {
    const status =
        historyOrderStatus(
            order
        );

    if (
        status === "FILLED" ||
        status === "FULL_FILLED" ||
        status === "FULL-FILLED" ||
        status === "COMPLETED" ||
        status === "SUCCESS"
    ) {
        return true;
    }

    return (
        historyAveragePrice(order) > 0 &&
        historyQuantity(order) > 0
    );
}


// ============================================================
// EXTRACT ORDER ARRAY
// ============================================================

function unwrapHistoryOrders(
    response
) {
    if (!response) {
        return [];
    }

    if (Array.isArray(response)) {
        return response;
    }

    if (
        Array.isArray(
            response.orders
        )
    ) {
        return response.orders;
    }

    if (
        Array.isArray(
            response.data
        )
    ) {
        return response.data;
    }

    if (
        Array.isArray(
            response.result
        )
    ) {
        return response.result;
    }

    if (
        response.data &&
        typeof response.data ===
            "object"
    ) {
        return unwrapHistoryOrders(
            response.data
        );
    }

    if (
        response.result &&
        typeof response.result ===
            "object"
    ) {
        return unwrapHistoryOrders(
            response.result
        );
    }

    return [];
}


// ============================================================
// NORMALIZE WEEX ORDER
// ============================================================

function normalizeHistoryOrder(
    order
) {
    if (!order) {
        return null;
    }

    const symbol =
        historySymbol(order);

    const positionSide =
        historySide(order);

    const price =
        historyAveragePrice(
            order
        );

    const quantity =
        historyQuantity(
            order
        );

    const timestamp =
        historyTimestamp(
            order
        );

    if (
        !symbol ||
        (
            positionSide !== "LONG" &&
            positionSide !== "SHORT"
        ) ||
        price <= 0 ||
        quantity <= 0 ||
        timestamp <= 0
    ) {
        return null;
    }

    // --------------------------------------------------------
    // Ignore anything that happened before this backend
    // session started.
    // --------------------------------------------------------

    if (
        tradeHistoryCache.sessionStartTime &&
        timestamp <
            tradeHistoryCache.sessionStartTime
    ) {
        return null;
    }

    return {
        orderId:
            order.orderId ??
            order.id ??
            null,

        clientOrderId:
            order.clientOrderId ??
            order.newClientOrderId ??
            null,

        symbol,

        positionSide,

        side:
            String(
                order.side || ""
            )
                .trim()
                .toUpperCase(),

        type:
            String(
                order.type || ""
            )
                .trim()
                .toUpperCase(),

        status:
            historyOrderStatus(
                order
            ),

        reduceOnly:
            historyReduceOnly(
                order
            ),

        price,

        quantity,

        time:
            timestamp,

        raw:
            order,
    };
}


// ============================================================
// TRADE P&L
// ============================================================
//
// Gross price-difference P&L.
//
// LONG:
//     exit - entry
//
// SHORT:
//     entry - exit
//
// multiplied by quantity.
//
// Fees/funding are not included here.
//
// ============================================================

function calculateHistoryPnl(
    side,
    entryPrice,
    exitPrice,
    quantity
) {
    const entry =
        historyNumber(
            entryPrice
        );

    const exit =
        historyNumber(
            exitPrice
        );

    const size =
        historyNumber(
            quantity
        );

    if (
        entry <= 0 ||
        exit <= 0 ||
        size <= 0
    ) {
        return null;
    }

    if (side === "LONG") {
        return (
            exit -
            entry
        ) * size;
    }

    if (side === "SHORT") {
        return (
            entry -
            exit
        ) * size;
    }

    return null;
}


// ============================================================
// BUILD TRADE HISTORY
// ============================================================

function buildTradeHistory(
    orders
) {
    const grouped =
        new Map();

    // --------------------------------------------------------
    // Oldest -> newest.
    // --------------------------------------------------------

    const sortedOrders =
        [
            ...orders,
        ]
            .filter(
                historyIsFilled
            )
            .sort(
                (a, b) =>
                    a.time -
                    b.time
            );

    // --------------------------------------------------------
    // Group by symbol + position side.
    // --------------------------------------------------------

    for (
        const order
            of sortedOrders
    ) {
        const key =
            `${order.symbol}:${order.positionSide}`;

        if (
            !grouped.has(key)
        ) {
            grouped.set(
                key,
                []
            );
        }

        grouped
            .get(key)
            .push(order);
    }

    const activeTrades = [];
    const completedTrades = [];

    // --------------------------------------------------------
    // Process every symbol/side independently.
    // --------------------------------------------------------

    for (
        const [
            key,
            groupOrders
        ]
            of grouped.entries()
    ) {
        let currentOpen = null;

        for (
            const order
                of groupOrders
        ) {
            // =================================================
            // OPEN
            // =================================================

            if (
                !order.reduceOnly
            ) {
                if (
                    !currentOpen
                ) {
                    currentOpen = {
                        id:
                            String(
                                order.orderId ??
                                order.clientOrderId ??
                                `${order.symbol}-${order.time}`
                            ),

                        symbol:
                            order.symbol,

                        side:
                            order.positionSide,

                        entryPrice:
                            order.price,

                        entrySize:
                            order.quantity,

                        entryTime:
                            new Date(
                                order.time
                            ).toISOString(),

                        entryOrderId:
                            order.orderId,

                        entryClientOrderId:
                            order.clientOrderId,

                        entryType:
                            order.type,

                        entryRaw:
                            order.raw,
                    };

                    continue;
                }

                // No pyramiding pairing here.
                // Keep the existing open trade.
                continue;
            }

            // =================================================
            // CLOSE
            // =================================================

            if (
                order.reduceOnly &&
                currentOpen
            ) {
                const closedQuantity =
                    Math.min(
                        currentOpen.entrySize,
                        order.quantity
                    );

                const pnl =
                    calculateHistoryPnl(
                        currentOpen.side,
                        currentOpen.entryPrice,
                        order.price,
                        closedQuantity
                    );

                const completedTrade = {
                    id:
                        `${currentOpen.id}-close-${order.orderId ?? order.time}`,

                    symbol:
                        currentOpen.symbol,

                    side:
                        currentOpen.side,

                    entryPrice:
                        currentOpen.entryPrice,

                    exitPrice:
                        order.price,

                    entrySize:
                        closedQuantity,

                    entryTime:
                        currentOpen.entryTime,

                    exitTime:
                        new Date(
                            order.time
                        ).toISOString(),

                    pnl,

                    result:
                        pnl === null
                            ? "UNKNOWN"
                            : pnl > 0
                            ? "WIN"
                            : pnl < 0
                            ? "LOSS"
                            : "BREAKEVEN",

                    entryOrderId:
                        currentOpen.entryOrderId,

                    exitOrderId:
                        order.orderId,

                    entryClientOrderId:
                        currentOpen.entryClientOrderId,

                    exitClientOrderId:
                        order.clientOrderId,

                    entryType:
                        currentOpen.entryType,

                    exitType:
                        order.type,

                    source:
                        "WEEX_ORDER_HISTORY",

                    rawEntry:
                        currentOpen.entryRaw,

                    rawExit:
                        order.raw,
                };

                completedTrades.unshift(
                    completedTrade
                );

                // ------------------------------------------------
                // Partial close support.
                // ------------------------------------------------

                currentOpen.entrySize -=
                    closedQuantity;

                if (
                    currentOpen.entrySize <=
                    0.0000000001
                ) {
                    currentOpen =
                        null;
                }
            }
        }

        if (
            currentOpen &&
            currentOpen.entrySize > 0
        ) {
            activeTrades.push({
                ...currentOpen,

                entrySize:
                    currentOpen.entrySize,

                source:
                    "WEEX_ORDER_HISTORY",
            });
        }
    }

    completedTrades.sort(
        (a, b) =>
            Date.parse(b.exitTime) -
            Date.parse(a.exitTime)
    );

    activeTrades.sort(
        (a, b) =>
            Date.parse(b.entryTime) -
            Date.parse(a.entryTime)
    );

    return {
        activeTrades,
        completedTrades,
    };
}


// ============================================================
// REFRESH WEEX HISTORY CACHE
// ============================================================

async function refreshWeexTradeHistory() {
    if (
        tradeHistoryCache.loading
    ) {
        return;
    }

    if (
        !tradeHistoryCache.sessionStartTime
    ) {
        console.warn(
            "[TradeHistory] Session clock is not initialized yet."
        );

        return;
    }

    tradeHistoryCache.loading =
        true;

    try {
        const endTime =
            getSynchronizedWeexTime();

        // ----------------------------------------------------
        // ONE WEEX ORDER-HISTORY REQUEST.
        //
        // Start = backend session start.
        // End   = synchronized WEEX-style current time.
        //
        // WEEX V3 supports 1-1000 records per page.
        // ----------------------------------------------------

        const response =
            await weex.getOrderHistory({
                limit: 1000,

                startTime:
                    tradeHistoryCache.sessionStartTime,

                endTime,

                page: 0,
            });

        const rawOrders =
            unwrapHistoryOrders(
                response
            );

        const normalizedOrders =
            rawOrders
                .map(
                    normalizeHistoryOrder
                )
                .filter(
                    Boolean
                );

        const uniqueOrders =
            new Map();

        for (
            const order
                of normalizedOrders
        ) {
            const key =
                order.orderId ??
                order.clientOrderId;

            if (!key) {
                continue;
            }

            uniqueOrders.set(
                String(key),
                order
            );
        }

        const orders =
            Array.from(
                uniqueOrders.values()
            );

        const result =
            buildTradeHistory(
                orders
            );

        tradeHistoryCache.orders =
            orders;

        tradeHistoryCache.activeTrades =
            result.activeTrades;

        tradeHistoryCache.completedTrades =
            result.completedTrades;

        tradeHistoryCache.updatedAt =
            new Date().toISOString();

        tradeHistoryCache.error =
            null;

        console.log(
            `[TradeHistory] Refreshed WEEX history: ` +
            `${orders.length} orders, ` +
            `${result.activeTrades.length} active, ` +
            `${result.completedTrades.length} completed.`
        );
    } catch (error) {
        tradeHistoryCache.error =
            error.message;

        console.warn(
            `[TradeHistory] WEEX history refresh failed: ` +
            `${error.message}`
        );
    } finally {
        tradeHistoryCache.loading =
            false;
    }
}


// ============================================================
// START WEEX TRADE HISTORY SCANNER
// ============================================================

async function startWeexTradeHistoryScanner() {
    if (
        tradeHistoryRefreshTimer
    ) {
        return;
    }

    // --------------------------------------------------------
    // FIRST:
    //
    // Synchronize Node time with WEEX server time.
    // --------------------------------------------------------

    await initializeWeexSessionClock();

    tradeHistoryCache.sessionStartTime =
        weexSessionStartTime;

    tradeHistoryCache.sessionStartTimeLocal =
        weexClockLocalSyncTime;

    // --------------------------------------------------------
    // FIRST HISTORY SCAN IMMEDIATELY.
    // --------------------------------------------------------

    await refreshWeexTradeHistory();

    // --------------------------------------------------------
    // THEN ONE SCAN EVERY MINUTE.
    // --------------------------------------------------------

    tradeHistoryRefreshTimer =
        setInterval(
            () => {
                refreshWeexTradeHistory()
                    .catch((error) => {
                        console.warn(
                            `[TradeHistory] Scanner error: ${error.message}`
                        );
                    });
            },
            WEEX_TRADE_HISTORY_REFRESH_MS
        );
}


// ============================================================
// DASHBOARD GETTERS
// ============================================================

function getTradeHistory() {
    return [
        ...tradeHistoryCache
            .completedTrades,
    ];
}


function getActiveTrades() {
    return [
        ...tradeHistoryCache
            .activeTrades,
    ];
}


function getTradeHistoryStatus() {
    return {
        updatedAt:
            tradeHistoryCache.updatedAt,

        loading:
            tradeHistoryCache.loading,

        error:
            tradeHistoryCache.error,

        sessionStartTime:
            tradeHistoryCache
                .sessionStartTime,

        sessionStartTimeLocal:
            tradeHistoryCache
                .sessionStartTimeLocal,

        synchronizedNow:
            getSynchronizedWeexTime(),

        clockOffsetMs:
            weexClockOffsetMs,

        clockInitialized:
            weexClockInitialized,

        orderCount:
            tradeHistoryCache.orders.length,

        activeTrades:
            tradeHistoryCache
                .activeTrades
                .length,

        completedTrades:
            tradeHistoryCache
                .completedTrades
                .length,

        refreshIntervalMs:
            WEEX_TRADE_HISTORY_REFRESH_MS,
    };
}


// ============================================================
// POSITION HELPERS
// ============================================================

function unwrapPositionResponse(
    response
) {
    if (!response) {
        return null;
    }

    if (
        response.symbol ||
        response.contract ||
        response.instId ||
        response.positionSide ||
        response.side
    ) {
        return response;
    }

    if (Array.isArray(response)) {
        if (
            response.length === 0
        ) {
            return null;
        }

        return (
            response.find(
                (item) => {
                    return (
                        item &&
                        (
                            item.symbol ||
                            item.contract ||
                            item.instId ||
                            item.positionSide ||
                            item.side
                        )
                    );
                }
            ) || null
        );
    }

    if (
        response.data !==
        undefined
    ) {
        return unwrapPositionResponse(
            response.data
        );
    }

    if (
        response.result !==
        undefined
    ) {
        return unwrapPositionResponse(
            response.result
        );
    }

    if (
        response.position !==
        undefined
    ) {
        return unwrapPositionResponse(
            response.position
        );
    }

    if (
        response.positions !==
        undefined
    ) {
        return unwrapPositionResponse(
            response.positions
        );
    }

    return null;
}


function extractPosition(
    rawPosition,
    requestedSymbol = null
) {
    const normalizedRequestedSymbol =
        requestedSymbol
            ? normalizeSymbol(
                requestedSymbol
            )
            : null;

    const position =
        unwrapPositionResponse(
            rawPosition
        );

    if (!position) {
        return {
            symbol:
                normalizedRequestedSymbol,

            side:
                "FLAT",

            size:
                0,

            avgPrice:
                0,

            marginType:
                null,

            leverage:
                null,

            raw:
                rawPosition ||
                null,
        };
    }

    const symbol =
        normalizeSymbol(
            position.symbol ||
            position.contract ||
            position.instId ||
            normalizedRequestedSymbol ||
            ""
        );

    const rawSide =
        String(
            position.side ||
            position.positionSide ||
            ""
        )
            .trim()
            .toUpperCase();

    const size =
        Math.abs(
            toNumber(
                position.size ??
                position.positionSize ??
                position.quantity ??
                position.positionQty ??
                0
            )
        );

    let side =
        "FLAT";

    if (size > 0) {
        if (
            rawSide === "LONG" ||
            rawSide === "BUY"
        ) {
            side =
                "LONG";
        } else if (
            rawSide === "SHORT" ||
            rawSide === "SELL"
        ) {
            side =
                "SHORT";
        }
    }

    let avgPrice =
        toNumber(
            position.avgPrice ??
            position.averagePrice ??
            position.entryPrice ??
            position.avgEntryPrice ??
            0
        );

    const openValue =
        toNumber(
            position.openValue,
            0
        );

    if (
        avgPrice <= 0 &&
        size > 0 &&
        openValue > 0
    ) {
        avgPrice =
            openValue /
            size;
    }

    return {
        symbol,

        side,

        size,

        avgPrice,

        marginType:
            position.marginType ||
            null,

        leverage:
            position.leverage ??
            null,

        raw:
            position,
    };
}


async function getLivePosition(
    symbol
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const response =
        await weex.getPosition(
            normalizedSymbol
        );

    return extractPosition(
        response,
        normalizedSymbol
    );
}


async function waitForPositionState(
    symbol,
    expectedSide,
    options = {}
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const timeoutMs =
        options.timeoutMs ??
        15000;

    const pollMs =
        options.pollMs ??
        500;

    const expected =
        String(
            expectedSide ||
            ""
        )
            .trim()
            .toUpperCase();

    const startedAt =
        Date.now();

    while (
        Date.now() -
        startedAt <=
        timeoutMs
    ) {
        const position =
            await getLivePosition(
                normalizedSymbol
            );

        if (
            expected === "FLAT"
        ) {
            if (
                position.side ===
                    "FLAT" ||
                position.size <=
                    0
            ) {
                return {
                    confirmed:
                        true,

                    position,
                };
            }
        } else if (
            position.side ===
                expected &&
            position.size >
                0
        ) {
            return {
                confirmed:
                    true,

                position,
            };
        }

        await sleep(
            pollMs
        );
    }

    const finalPosition =
        await getLivePosition(
            normalizedSymbol
        );

    return {
        confirmed:
            expected === "FLAT"
                ? (
                    finalPosition.side ===
                        "FLAT" ||
                    finalPosition.size <=
                        0
                )
                : (
                    finalPosition.side ===
                        expected &&
                    finalPosition.size >
                        0
                ),

        position:
            finalPosition,

        timedOut:
            true,
    };
}


// ============================================================
// EXCHANGE INFO
// ============================================================

async function getExchangeInfo() {
    const now =
        Date.now();

    if (
        exchangeInfoCache &&
        now -
            exchangeInfoCacheTime <
            EXCHANGE_INFO_CACHE_MS
    ) {
        return exchangeInfoCache;
    }

    const data =
        await weex.getExchangeInfo();

    exchangeInfoCache =
        data;

    exchangeInfoCacheTime =
        now;

    return exchangeInfoCache;
}


function findSymbolInfo(
    exchangeInfo,
    symbol
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const possibleLists = [
        exchangeInfo?.symbols,
        exchangeInfo?.data,
        exchangeInfo?.result,
    ];

    for (
        const list
            of possibleLists
    ) {
        if (
            !Array.isArray(list)
        ) {
            continue;
        }

        const found =
            list.find(
                (item) => {
                    if (!item) {
                        return false;
                    }

                    return (
                        normalizeSymbol(
                            item.symbol ||
                            item.contract ||
                            item.instId ||
                            ""
                        ) ===
                        normalizedSymbol
                    );
                }
            );

        if (found) {
            return found;
        }
    }

    return null;
}


async function getSymbolInfo(
    symbol
) {
    const exchangeInfo =
        await getExchangeInfo();

    return findSymbolInfo(
        exchangeInfo,
        symbol
    );
}


// ============================================================
// GENERIC FILTER HELPERS
// ============================================================

function findFilterValue(
    symbolInfo,
    names = []
) {
    if (!symbolInfo) {
        return 0;
    }

    for (
        const key
            of names
    ) {
        if (
            symbolInfo[key] !==
                undefined &&
            symbolInfo[key] !==
                null &&
            symbolInfo[key] !==
                ""
        ) {
            const value =
                toNumber(
                    symbolInfo[key]
                );

            if (value > 0) {
                return value;
            }
        }
    }

    const filterCollections = [
        symbolInfo.filters,
        symbolInfo.orderFilters,
        symbolInfo.priceFilter,
        symbolInfo.lotSize,
        symbolInfo.lotSizeFilter,
    ];

    for (
        const collection
            of filterCollections
    ) {
        if (
            Array.isArray(
                collection
            )
        ) {
            for (
                const filter
                    of collection
            ) {
                if (!filter) {
                    continue;
                }

                for (
                    const key
                        of names
                ) {
                    if (
                        filter[key] !==
                            undefined &&
                        filter[key] !==
                            null &&
                        filter[key] !==
                            ""
                    ) {
                        const value =
                            toNumber(
                                filter[key]
                            );

                        if (value > 0) {
                            return value;
                        }
                    }
                }
            }
        } else if (
            collection &&
            typeof collection ===
                "object"
        ) {
            for (
                const key
                    of names
            ) {
                if (
                    collection[key] !==
                        undefined &&
                    collection[key] !==
                        null &&
                    collection[key] !==
                        ""
                ) {
                    const value =
                        toNumber(
                            collection[key]
                        );

                    if (value > 0) {
                        return value;
                    }
                }
            }
        }
    }

    return 0;
}


// ============================================================
// NUMBER / STEP HELPERS
// ============================================================

function getDecimalPlaces(
    value
) {
    const number =
        toNumber(value);

    if (
        number <= 0
    ) {
        return 0;
    }

    const text =
        String(number)
            .toLowerCase();

    if (
        text.includes("e-")
    ) {
        const parts =
            text.split("e-");

        return toNumber(
            parts[1],
            0
        );
    }

    const dotIndex =
        text.indexOf(".");

    if (
        dotIndex === -1
    ) {
        return 0;
    }

    return Math.max(
        0,
        text.length -
            dotIndex -
            1
    );
}


function floorToStep(
    value,
    step
) {
    const number =
        toNumber(value);

    const stepNumber =
        toNumber(step);

    if (
        number <= 0
    ) {
        return 0;
    }

    if (
        stepNumber <= 0
    ) {
        return number;
    }

    const decimals =
        Math.min(
            12,
            Math.max(
                0,
                getDecimalPlaces(
                    stepNumber
                )
            )
        );

    const scale =
        Math.pow(
            10,
            decimals
        );

    const integerNumber =
        Math.floor(
            number *
                scale +
                1e-10
        );

    const integerStep =
        Math.max(
            1,
            Math.round(
                stepNumber *
                    scale
            )
        );

    const result =
        Math.floor(
            integerNumber /
                integerStep
        ) *
        integerStep /
        scale;

    return Number(
        result.toFixed(
            Math.max(
                2,
                decimals + 2
            )
        )
    );
}


function ceilToStep(
    value,
    step
) {
    const number =
        toNumber(value);

    const stepNumber =
        toNumber(step);

    if (
        number <= 0
    ) {
        return 0;
    }

    if (
        stepNumber <= 0
    ) {
        return number;
    }

    const decimals =
        Math.min(
            12,
            Math.max(
                0,
                getDecimalPlaces(
                    stepNumber
                )
            )
        );

    const scale =
        Math.pow(
            10,
            decimals
        );

    const integerNumber =
        Math.round(
            number *
                scale
        );

    const integerStep =
        Math.max(
            1,
            Math.round(
                stepNumber *
                    scale
            )
        );

    const result =
        Math.ceil(
            integerNumber /
                integerStep
        ) *
        integerStep /
        scale;

    return Number(
        result.toFixed(
            Math.max(
                2,
                decimals + 2
            )
        )
    );
}


function roundDownToPrecision(
    value,
    precision
) {
    const number =
        toNumber(value);

    if (
        number <= 0 ||
        precision < 0
    ) {
        return number;
    }

    const factor =
        Math.pow(
            10,
            precision
        );

    return (
        Math.floor(
            number *
                factor +
                1e-12
        ) /
        factor
    );
}


function applyQuantityPrecision(
    quantity,
    precision
) {
    return roundDownToPrecision(
        quantity,
        precision
    );
}


function getQuantityPrecision(
    symbolInfo
) {
    return toNumber(
        symbolInfo?.quantityPrecision ??
        symbolInfo?.quantityScale ??
        symbolInfo?.volumePrecision ??
        -1,
        -1
    );
}


function getPricePrecision(
    symbolInfo
) {
    return toNumber(
        symbolInfo?.pricePrecision ??
        symbolInfo?.tickPrecision ??
        symbolInfo?.priceScale ??
        -1,
        -1
    );
}


function getMinOrderSize(
    symbolInfo
) {
    return toNumber(
        symbolInfo?.minOrderSize ??
        symbolInfo?.minQty ??
        symbolInfo?.minQuantity ??
        symbolInfo?.minTradeAmount ??
        0
    );
}


function getMaxOrderSize(
    symbolInfo
) {
    return toNumber(
        symbolInfo?.maxOrderSize ??
        symbolInfo?.maxQty ??
        symbolInfo?.maxQuantity ??
        Infinity,
        Infinity
    );
}


function getMaxPositionSize(
    symbolInfo
) {
    return toNumber(
        symbolInfo?.maxPositionSize ??
        symbolInfo?.maxPositionQty ??
        Infinity,
        Infinity
    );
}


function getMarketOpenLimitSize(
    symbolInfo
) {
    return toNumber(
        symbolInfo?.marketOpenLimitSize ??
        symbolInfo?.marketOrderLimitSize ??
        symbolInfo?.marketOpenMaxSize ??
        Infinity,
        Infinity
    );
}


function getQuantityStep(
    symbolInfo,
    quantityPrecision
) {
    const directStep =
        findFilterValue(
            symbolInfo,
            [
                "quantityStep",
                "stepSize",
                "sizeIncrement",
                "size_increment",
                "qtyStep",
                "lotSize",
            ]
        );

    if (
        directStep > 0
    ) {
        return directStep;
    }

    if (
        quantityPrecision >= 0
    ) {
        return Math.pow(
            10,
            -quantityPrecision
        );
    }

    const minOrderSize =
        getMinOrderSize(
            symbolInfo
        );

    if (
        minOrderSize > 0
    ) {
        return minOrderSize;
    }

    return 0;
}


function getPriceStep(
    symbolInfo
) {
    const directStep =
        findFilterValue(
            symbolInfo,
            [
                "priceStep",
                "tickSize",
                "tick_size",
                "priceTick",
            ]
        );

    if (
        directStep > 0 &&
        directStep < 1
    ) {
        return directStep;
    }

    const pricePrecision =
        getPricePrecision(
            symbolInfo
        );

    if (
        pricePrecision >= 0
    ) {
        return Math.pow(
            10,
            -pricePrecision
        );
    }

    const priceEndStep =
        toNumber(
            symbolInfo?.priceEndStep ??
            0
        );

    if (
        priceEndStep > 0 &&
        priceEndStep < 1
    ) {
        return priceEndStep;
    }

    return 0;
}


// ============================================================
// MARKET PRICE
// ============================================================

async function getCurrentPrice(
    symbol
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const orderBook =
        await weex.getOrderBook(
            normalizedSymbol
        );

    const bids =
        Array.isArray(
            orderBook?.bids
        )
            ? orderBook.bids
            : [];

    const asks =
        Array.isArray(
            orderBook?.asks
        )
            ? orderBook.asks
            : [];

    const bestBid =
        toNumber(
            bids?.[0]?.[0] ??
            bids?.[0]?.price ??
            0
        );

    const bestAsk =
        toNumber(
            asks?.[0]?.[0] ??
            asks?.[0]?.price ??
            0
        );

    if (
        bestBid > 0 &&
        bestAsk > 0
    ) {
        return (
            bestBid +
            bestAsk
        ) / 2;
    }

    if (
        bestAsk > 0
    ) {
        return bestAsk;
    }

    if (
        bestBid > 0
    ) {
        return bestBid;
    }

    throw new Error(
        `Unable to determine current price for ${normalizedSymbol}`
    );
}


// ============================================================
// ORDER QUANTITY
// ============================================================

async function calculateOrderQuantity(
    symbol,
    price = null
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const symbolInfo =
        await getSymbolInfo(
            normalizedSymbol
        );

    if (!symbolInfo) {
        throw new Error(
            `WEEX symbol information not found for ${normalizedSymbol}`
        );
    }

    const currentPrice =
        price !== null
            ? toNumber(price)
            : await getCurrentPrice(
                normalizedSymbol
            );

    if (
        currentPrice <= 0
    ) {
        throw new Error(
            `Invalid market price for ${normalizedSymbol}: ${currentPrice}`
        );
    }

    const maxMargin =
        toNumber(
            config.trading.MAX_MARGIN_USDT
        );

    const leverage =
        toNumber(
            config.trading.LEVERAGE
        );

    if (
        maxMargin <= 0
    ) {
        throw new Error(
            "MAX_MARGIN_USDT must be greater than 0."
        );
    }

    if (
        leverage <= 0
    ) {
        throw new Error(
            "LEVERAGE must be greater than 0."
        );
    }

    const targetNotional =
        maxMargin *
        leverage;

    const rawQuantity =
        targetNotional /
        currentPrice;

    const quantityPrecision =
        getQuantityPrecision(
            symbolInfo
        );

    const quantityStep =
        getQuantityStep(
            symbolInfo,
            quantityPrecision
        );

    const minOrderSize =
        getMinOrderSize(
            symbolInfo
        );

    const maxOrderSize =
        getMaxOrderSize(
            symbolInfo
        );

    const maxPositionSize =
        getMaxPositionSize(
            symbolInfo
        );

    const marketOpenLimitSize =
        getMarketOpenLimitSize(
            symbolInfo
        );

    let quantity;

    if (
        quantityStep > 0
    ) {
        quantity =
            floorToStep(
                rawQuantity,
                quantityStep
            );
    } else {
        quantity =
            applyQuantityPrecision(
                rawQuantity,
                quantityPrecision
            );
    }

    if (
        quantity <
        minOrderSize
    ) {
        if (
            quantityStep > 0
        ) {
            quantity =
                ceilToStep(
                    minOrderSize,
                    quantityStep
                );
        } else {
            quantity =
                minOrderSize;
        }
    }

    const allowedMaximum =
        Math.min(
            maxOrderSize,
            marketOpenLimitSize,
            maxPositionSize
        );

    if (
        Number.isFinite(
            allowedMaximum
        ) &&
        quantity >
            allowedMaximum
    ) {
        if (
            quantityStep > 0
        ) {
            quantity =
                floorToStep(
                    allowedMaximum,
                    quantityStep
                );
        } else {
            quantity =
                applyQuantityPrecision(
                    allowedMaximum,
                    quantityPrecision
                );
        }
    }

    if (
        quantityStep > 0
    ) {
        quantity =
            floorToStep(
                quantity,
                quantityStep
            );
    } else {
        quantity =
            applyQuantityPrecision(
                quantity,
                quantityPrecision
            );
    }

    if (
        quantity <= 0
    ) {
        throw new Error(
            `Calculated quantity is invalid for ${normalizedSymbol}. ` +
            `Raw quantity=${rawQuantity}, ` +
            `stepSize=${quantityStep}, ` +
            `minOrderSize=${minOrderSize}.`
        );
    }

    if (
        Number.isFinite(
            minOrderSize
        ) &&
        quantity <
            minOrderSize
    ) {
        throw new Error(
            `Calculated quantity ${quantity} is below minimum order size ` +
            `${minOrderSize} for ${normalizedSymbol}. ` +
            `Raw quantity=${rawQuantity}, stepSize=${quantityStep}.`
        );
    }

    if (
        Number.isFinite(
            maxOrderSize
        ) &&
        quantity >
            maxOrderSize
    ) {
        throw new Error(
            `Calculated quantity ${quantity} exceeds max order size ` +
            `${maxOrderSize} for ${normalizedSymbol}.`
        );
    }

    if (
        Number.isFinite(
            marketOpenLimitSize
        ) &&
        quantity >
            marketOpenLimitSize
    ) {
        throw new Error(
            `Calculated quantity ${quantity} exceeds market open limit ` +
            `${marketOpenLimitSize} for ${normalizedSymbol}.`
        );
    }

    if (
        Number.isFinite(
            maxPositionSize
        ) &&
        quantity >
            maxPositionSize
    ) {
        throw new Error(
            `Calculated quantity ${quantity} exceeds max position size ` +
            `${maxPositionSize} for ${normalizedSymbol}.`
        );
    }

    return {
        quantity,

        rawQuantity,

        price:
            currentPrice,

        targetNotional,

        maxMargin,

        leverage,

        quantityPrecision,

        quantityStep,

        minOrderSize,

        maxOrderSize,

        maxPositionSize,

        marketOpenLimitSize,
    };
}


// ============================================================
// PRICE ROUNDING FOR TP / SL
// ============================================================

function roundTriggerPrice(
    price,
    step,
    direction
) {
    const number =
        toNumber(price);

    if (
        number <= 0
    ) {
        throw new Error(
            "Trigger price must be greater than 0."
        );
    }

    if (
        step <= 0
    ) {
        return number;
    }

    if (
        direction === "UP"
    ) {
        return ceilToStep(
            number,
            step
        );
    }

    return floorToStep(
        number,
        step
    );
}


function formatTriggerPrice(
    price,
    symbolInfo
) {
    const precision =
        getPricePrecision(
            symbolInfo
        );

    if (
        precision < 0
    ) {
        return String(price);
    }

    return Number(price)
        .toFixed(
            precision
        );
}


// ============================================================
// TP / SL
// ============================================================

function calculateTpSl(
    side,
    basedOnPrice,
    symbolInfo = null
) {
    const normalizedSide =
        String(
            side || ""
        )
            .toUpperCase();

    const price =
        Number(
            basedOnPrice
        );

    if (
        !Number.isFinite(price) ||
        price <= 0
    ) {
        throw new Error(
            `Invalid TP/SL base price: ${basedOnPrice}`
        );
    }

    const takeProfitPercent =
        Number(
            config.tpSl
                .TAKE_PROFIT_PERCENT
        );

    const stopLossPercent =
        Number(
            config.tpSl
                .STOP_LOSS_PERCENT
        );

    if (
        !Number.isFinite(
            takeProfitPercent
        ) ||
        takeProfitPercent <= 0
    ) {
        throw new Error(
            `Invalid TAKE_PROFIT_PERCENT: ${config.tpSl.TAKE_PROFIT_PERCENT}`
        );
    }

    if (
        !Number.isFinite(
            stopLossPercent
        ) ||
        stopLossPercent <= 0
    ) {
        throw new Error(
            `Invalid STOP_LOSS_PERCENT: ${config.tpSl.STOP_LOSS_PERCENT}`
        );
    }

    const priceStep =
        symbolInfo
            ? getPriceStep(
                symbolInfo
            )
            : 0;

    const pricePrecision =
        symbolInfo
            ? getPricePrecision(
                symbolInfo
            )
            : -1;

    let rawTakeProfitPrice;
    let rawStopLossPrice;

    if (
        normalizedSide ===
        "LONG"
    ) {
        rawTakeProfitPrice =
            price *
            (
                1 +
                takeProfitPercent /
                    100
            );

        rawStopLossPrice =
            price *
            (
                1 -
                stopLossPercent /
                    100
            );
    } else if (
        normalizedSide ===
        "SHORT"
    ) {
        rawTakeProfitPrice =
            price *
            (
                1 -
                takeProfitPercent /
                    100
            );

        rawStopLossPrice =
            price *
            (
                1 +
                stopLossPercent /
                    100
            );
    } else {
        throw new Error(
            `Unsupported TP/SL side: ${side}`
        );
    }

    let takeProfitPrice =
        rawTakeProfitPrice;

    let stopLossPrice =
        rawStopLossPrice;

    if (
        priceStep > 0
    ) {
        if (
            normalizedSide ===
            "LONG"
        ) {
            takeProfitPrice =
                roundTriggerPrice(
                    rawTakeProfitPrice,
                    priceStep,
                    "UP"
                );

            stopLossPrice =
                roundTriggerPrice(
                    rawStopLossPrice,
                    priceStep,
                    "UP"
                );
        } else {
            takeProfitPrice =
                roundTriggerPrice(
                    rawTakeProfitPrice,
                    priceStep,
                    "DOWN"
                );

            stopLossPrice =
                roundTriggerPrice(
                    rawStopLossPrice,
                    priceStep,
                    "DOWN"
                );
        }
    }

    if (
        normalizedSide ===
        "LONG"
    ) {
        if (
            !(
                takeProfitPrice >
                    price &&
                stopLossPrice <
                    price
            )
        ) {
            throw new Error(
                `Invalid TP/SL relationship for LONG. ` +
                `Entry=${price}, ` +
                `TP=${takeProfitPrice}, ` +
                `SL=${stopLossPrice}, ` +
                `Configured TP=${takeProfitPercent}%, ` +
                `Configured SL=${stopLossPercent}%.`
            );
        }
    }

    if (
        normalizedSide ===
        "SHORT"
    ) {
        if (
            !(
                takeProfitPrice <
                    price &&
                stopLossPrice >
                    price
            )
        ) {
            throw new Error(
                `Invalid TP/SL relationship for SHORT. ` +
                `Entry=${price}, ` +
                `TP=${takeProfitPrice}, ` +
                `SL=${stopLossPrice}, ` +
                `Configured TP=${takeProfitPercent}%, ` +
                `Configured SL=${stopLossPercent}%.`
            );
        }
    }

    let actualTakeProfitPercent;
    let actualStopLossPercent;

    if (
        normalizedSide ===
        "LONG"
    ) {
        actualTakeProfitPercent =
            (
                (
                    takeProfitPrice -
                    price
                ) /
                price
            ) * 100;

        actualStopLossPercent =
            (
                (
                    price -
                    stopLossPrice
                ) /
                price
            ) * 100;
    } else {
        actualTakeProfitPercent =
            (
                (
                    price -
                    takeProfitPrice
                ) /
                price
            ) * 100;

        actualStopLossPercent =
            (
                (
                    stopLossPrice -
                    price
                ) /
                price
            ) * 100;
    }

    if (
        actualTakeProfitPercent <=
        actualStopLossPercent
    ) {
        throw new Error(
            `Invalid TP/SL distance after price-step rounding for ${normalizedSide}. ` +
            `Entry=${price}, ` +
            `TP=${takeProfitPrice} (${actualTakeProfitPercent.toFixed(4)}%), ` +
            `SL=${stopLossPrice} (${actualStopLossPercent.toFixed(4)}%), ` +
            `Configured TP=${takeProfitPercent}%, ` +
            `Configured SL=${stopLossPercent}%.`
        );
    }

    return {
        basedOnPrice:
            price,

        rawTakeProfitPrice:
            rawTakeProfitPrice,

        rawStopLossPrice:
            rawStopLossPrice,

        takeProfitPrice:
            takeProfitPrice,

        stopLossPrice:
            stopLossPrice,

        actualTakeProfitPercent:
            actualTakeProfitPercent,

        actualStopLossPercent:
            actualStopLossPercent,

        takeProfitPercent:
            takeProfitPercent,

        stopLossPercent:
            stopLossPercent,

        priceStep:
            priceStep,

        pricePrecision:
            pricePrecision,

        triggerPriceType:
            config.tpSl
                .TRIGGER_TYPE,
    };
}


// ============================================================
// APPLY TP / SL
// ============================================================

async function applyTpSl(
    symbol,
    position
) {
    if (
        !config.tpSl.ENABLED
    ) {
        return {
            enabled:
                false,

            applied:
                false,

            reason:
                "TP/SL is disabled.",
        };
    }

    const normalizedSymbol =
        normalizeSymbol(symbol);

    if (!position) {
        throw new Error(
            `Cannot apply TP/SL to ${normalizedSymbol}: position is missing.`
        );
    }

    if (
        position.side !==
            "LONG" &&
        position.side !==
            "SHORT"
    ) {
        throw new Error(
            `Cannot apply TP/SL to ${normalizedSymbol}: invalid position side ${position.side}.`
        );
    }

    if (
        position.size <= 0
    ) {
        throw new Error(
            `Cannot apply TP/SL to ${normalizedSymbol}: position size is ${position.size}.`
        );
    }

    if (
        position.avgPrice <= 0
    ) {
        throw new Error(
            `Cannot apply TP/SL to ${normalizedSymbol}: confirmed avgPrice is invalid.`
        );
    }

    const symbolInfo =
        await getSymbolInfo(
            normalizedSymbol
        );

    if (!symbolInfo) {
        throw new Error(
            `Cannot apply TP/SL to ${normalizedSymbol}: symbol information not found.`
        );
    }

    const tpSl =
        calculateTpSl(
            position.side,
            position.avgPrice,
            symbolInfo
        );

    const takeProfitTrigger =
        formatTriggerPrice(
            tpSl.takeProfitPrice,
            symbolInfo
        );

    const stopLossTrigger =
        formatTriggerPrice(
            tpSl.stopLossPrice,
            symbolInfo
        );

    const commonParams = {
        symbol:
            normalizedSymbol,

        positionSide:
            position.side,

        quantity:
            "0",

        triggerPriceType:
            tpSl.triggerPriceType,

        executePrice:
            "0",

        reduceOnly:
            true,
    };

    const takeProfit =
        await weex.placeTpSlOrder({
            ...commonParams,

            planType:
                "TAKE_PROFIT",

            triggerPrice:
                takeProfitTrigger,
        });

    try {
        const stopLoss =
            await weex.placeTpSlOrder({
                ...commonParams,

                planType:
                    "STOP_LOSS",

                triggerPrice:
                    stopLossTrigger,
            });

        return {
            enabled:
                true,

            applied:
                true,

            basedOn:
                "CONFIRMED WEEX AVG PRICE",

            avgPrice:
                position.avgPrice,

            side:
                position.side,

            size:
                position.size,

            rawTakeProfitPrice:
                tpSl.rawTakeProfitPrice,

            rawStopLossPrice:
                tpSl.rawStopLossPrice,

            takeProfitPrice:
                tpSl.takeProfitPrice,

            stopLossPrice:
                tpSl.stopLossPrice,

            takeProfitTrigger,

            stopLossTrigger,

            priceStep:
                tpSl.priceStep,

            pricePrecision:
                tpSl.pricePrecision,

            triggerPriceType:
                tpSl.triggerPriceType,

            takeProfit,

            stopLoss,
        };
    } catch (
        error
    ) {
        throw new Error(
            `TP accepted for ${normalizedSymbol}, ` +
            `but STOP_LOSS failed: ${error.message}`
        );
    }
}


// ============================================================
// PROTECT EXISTING POSITION
// ============================================================

async function protectExistingPosition(
    symbol
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    if (
        !normalizedSymbol
    ) {
        throw new Error(
            "Symbol is required."
        );
    }

    if (
        symbolLocks.has(
            normalizedSymbol
        )
    ) {
        return {
            success:
                false,

            liveExecution:
                true,

            action:
                "LOCKED",

            symbol:
                normalizedSymbol,

            reason:
                `Execution already running for ${normalizedSymbol}.`,
        };
    }

    symbolLocks.add(
        normalizedSymbol
    );

    try {
        const livePosition =
            await getLivePosition(
                normalizedSymbol
            );

        if (
            livePosition.side ===
                "FLAT" ||
            livePosition.size <=
                0
        ) {
            return {
                success:
                    true,

                liveExecution:
                    true,

                action:
                    "NO_ACTION",

                symbol:
                    normalizedSymbol,

                position:
                    livePosition,

                reason:
                    "No live position exists. Nothing to protect.",
            };
        }

        if (
            livePosition.side !==
                "LONG" &&
            livePosition.side !==
                "SHORT"
        ) {
            throw new Error(
                `Cannot protect ${normalizedSymbol}: unknown position side ${livePosition.side}.`
            );
        }

        if (
            livePosition.avgPrice <=
                0
        ) {
            throw new Error(
                `Cannot protect ${normalizedSymbol}: confirmed avgPrice is invalid.`
            );
        }

        const tpSl =
            await applyTpSl(
                normalizedSymbol,
                livePosition
            );

        return {
            success:
                true,

            liveExecution:
                true,

            action:
                "PROTECT",

            symbol:
                normalizedSymbol,

            position:
                livePosition,

            tpSl,

            reason:
                "Existing live position was protected with TP/SL.",
        };
    } catch (
        error
    ) {
        return {
            success:
                false,

            liveExecution:
                true,

            action:
                "ERROR",

            symbol:
                normalizedSymbol,

            error:
                error.message,
        };
    } finally {
        symbolLocks.delete(
            normalizedSymbol
        );
    }
}


// ============================================================
// OPEN LONG
// ============================================================

async function executeOpenLong(
    symbol,
    options = {}
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const quantityData =
        options.quantityData ||
        await calculateOrderQuantity(
            normalizedSymbol
        );

    const order =
        await weex.openLong(
            normalizedSymbol,
            quantityData.quantity,
            options.extraParams ||
                {}
        );

    const confirmation =
        await waitForPositionState(
            normalizedSymbol,
            "LONG",
            {
                timeoutMs:
                    options.confirmationTimeoutMs ??
                    15000,

                pollMs:
                    options.confirmationPollMs ??
                    500,
            }
        );

    if (
        !confirmation.confirmed
    ) {
        throw new Error(
            `LONG order was sent for ${normalizedSymbol}, but WEEX did not confirm a LONG position.`
        );
    }

    const confirmedPosition =
        await getLivePosition(
            normalizedSymbol
        );

    if (
        confirmedPosition.side !==
            "LONG" ||
        confirmedPosition.size <=
            0
    ) {
        throw new Error(
            `LONG order for ${normalizedSymbol} was not confirmed correctly.`
        );
    }

    let tpSl;

    try {
        tpSl =
            await applyTpSl(
                normalizedSymbol,
                confirmedPosition
            );
    } catch (
        protectionError
    ) {
        let emergencyCloseError =
            null;

        try {
            await executeClose(
                normalizedSymbol,
                confirmedPosition,
                options
            );
        } catch (
            closeError
        ) {
            emergencyCloseError =
                closeError.message;
        }

        if (
            emergencyCloseError
        ) {
            throw new Error(
                `LONG ${normalizedSymbol} opened, but TP/SL protection failed: ` +
                `${protectionError.message}. ` +
                `EMERGENCY CLOSE ALSO FAILED: ${emergencyCloseError}`
            );
        }

        throw new Error(
            `LONG ${normalizedSymbol} opened, but TP/SL protection failed. ` +
            `The bot automatically closed the new position. ` +
            `Reason: ${protectionError.message}`
        );
    }

    return {
        success:
            true,

        action:
            "OPEN_LONG",

        symbol:
            normalizedSymbol,

        order,

        position:
            confirmedPosition,

        tpSl,
    };
}


// ============================================================
// OPEN SHORT
// ============================================================

async function executeOpenShort(
    symbol,
    options = {}
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const quantityData =
        options.quantityData ||
        await calculateOrderQuantity(
            normalizedSymbol
        );

    const order =
        await weex.openShort(
            normalizedSymbol,
            quantityData.quantity,
            options.extraParams ||
                {}
        );

    const confirmation =
        await waitForPositionState(
            normalizedSymbol,
            "SHORT",
            {
                timeoutMs:
                    options.confirmationTimeoutMs ??
                    15000,

                pollMs:
                    options.confirmationPollMs ??
                    500,
            }
        );

    if (
        !confirmation.confirmed
    ) {
        throw new Error(
            `SHORT order was sent for ${normalizedSymbol}, but WEEX did not confirm a SHORT position.`
        );
    }

    const confirmedPosition =
        await getLivePosition(
            normalizedSymbol
        );

    if (
        confirmedPosition.side !==
            "SHORT" ||
        confirmedPosition.size <=
            0
    ) {
        throw new Error(
            `SHORT order for ${normalizedSymbol} was not confirmed correctly.`
        );
    }

    let tpSl;

    try {
        tpSl =
            await applyTpSl(
                normalizedSymbol,
                confirmedPosition
            );
    } catch (
        protectionError
    ) {
        let emergencyCloseError =
            null;

        try {
            await executeClose(
                normalizedSymbol,
                confirmedPosition,
                options
            );
        } catch (
            closeError
        ) {
            emergencyCloseError =
                closeError.message;
        }

        if (
            emergencyCloseError
        ) {
            throw new Error(
                `SHORT ${normalizedSymbol} opened, but TP/SL protection failed: ` +
                `${protectionError.message}. ` +
                `EMERGENCY CLOSE ALSO FAILED: ${emergencyCloseError}`
            );
        }

        throw new Error(
            `SHORT ${normalizedSymbol} opened, but TP/SL protection failed. ` +
            `The bot automatically closed the new position. ` +
            `Reason: ${protectionError.message}`
        );
    }

    return {
        success:
            true,

        action:
            "OPEN_SHORT",

        symbol:
            normalizedSymbol,

        order,

        position:
            confirmedPosition,

        tpSl,
    };
}


// ============================================================
// CLOSE
// ============================================================

async function executeClose(
    symbol,
    position,
    options = {}
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const livePosition =
        position ||
        await getLivePosition(
            normalizedSymbol
        );

    if (
        livePosition.side ===
            "FLAT" ||
        livePosition.size <=
            0
    ) {
        return {
            success:
                true,

            action:
                "NO_ACTION",

            symbol:
                normalizedSymbol,

            reason:
                "Already FLAT.",

            position:
                livePosition,
        };
    }

    let order;

    if (
        livePosition.side ===
        "LONG"
    ) {
        order =
            await weex.closeLong(
                normalizedSymbol,
                livePosition.size
            );
    } else if (
        livePosition.side ===
        "SHORT"
    ) {
        order =
            await weex.closeShort(
                normalizedSymbol,
                livePosition.size
            );
    } else {
        throw new Error(
            `Cannot close ${normalizedSymbol}: unknown position side ${livePosition.side}.`
        );
    }

    const confirmation =
        await waitForPositionState(
            normalizedSymbol,
            "FLAT",
            {
                timeoutMs:
                    options.confirmationTimeoutMs ??
                    15000,

                pollMs:
                    options.confirmationPollMs ??
                    500,
            }
        );

    if (
        !confirmation.confirmed
    ) {
        throw new Error(
            `Close order was sent for ${normalizedSymbol}, but WEEX did not confirm FLAT.`
        );
    }

    const confirmedFlat =
        await getLivePosition(
            normalizedSymbol
        );

    if (
        confirmedFlat.side !==
            "FLAT" &&
        confirmedFlat.size >
            0
    ) {
        throw new Error(
            `Close for ${normalizedSymbol} was not confirmed as FLAT.`
        );
    }

    return {
        success:
            true,

        action:
            "CLOSE",

        symbol:
            normalizedSymbol,

        order,

        position:
            confirmedFlat,
    };
}


// ============================================================
// LIVE SIGNAL EXECUTION
// ============================================================

async function executeSignal(
    symbol,
    signal,
    options = {}
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const normalizedSignal =
        normalizeSignal(signal);

    if (
        !normalizedSymbol
    ) {
        throw new Error(
            "Symbol is required."
        );
    }

    if (
        !normalizedSignal
    ) {
        throw new Error(
            `Invalid signal: ${signal}`
        );
    }

    if (
        normalizedSignal ===
        "NEUTRAL"
    ) {
        return {
            success:
                true,

            liveExecution:
                true,

            action:
                "NO_ACTION",

            symbol:
                normalizedSymbol,

            signal:
                normalizedSignal,

            reason:
                "NEUTRAL signal. No order required.",
        };
    }

    if (
        symbolLocks.has(
            normalizedSymbol
        )
    ) {
        return {
            success:
                false,

            liveExecution:
                true,

            action:
                "LOCKED",

            symbol:
                normalizedSymbol,

            signal:
                normalizedSignal,

            reason:
                `Execution already running for ${normalizedSymbol}.`,
        };
    }

    symbolLocks.add(
        normalizedSymbol
    );

    try {
        let livePosition =
            await getLivePosition(
                normalizedSymbol
            );

        // ----------------------------------------------------
        // CLOSE
        // ----------------------------------------------------

        if (
            normalizedSignal ===
                "CLOSE" ||
            normalizedSignal ===
                "CLOSE_LONG" ||
            normalizedSignal ===
                "CLOSE_SHORT"
        ) {
            if (
                normalizedSignal ===
                    "CLOSE_LONG" &&
                livePosition.side !==
                    "LONG" &&
                livePosition.side !==
                    "FLAT"
            ) {
                return {
                    success:
                        true,

                    liveExecution:
                        true,

                    action:
                        "NO_ACTION",

                    symbol:
                        normalizedSymbol,

                    signal:
                        normalizedSignal,

                    position:
                        livePosition,

                    reason:
                        "CLOSE_LONG requested but live position is not LONG.",
                };
            }

            if (
                normalizedSignal ===
                    "CLOSE_SHORT" &&
                livePosition.side !==
                    "SHORT" &&
                livePosition.side !==
                    "FLAT"
            ) {
                return {
                    success:
                        true,

                    liveExecution:
                        true,

                    action:
                        "NO_ACTION",

                    symbol:
                        normalizedSymbol,

                    signal:
                        normalizedSignal,

                    position:
                        livePosition,

                    reason:
                        "CLOSE_SHORT requested but live position is not SHORT.",
                };
            }

            return await executeClose(
                normalizedSymbol,
                livePosition,
                options
            );
        }

        // ----------------------------------------------------
        // SAME DIRECTION
        // ----------------------------------------------------

        if (
            normalizedSignal ===
                "LONG" &&
            livePosition.side ===
                "LONG"
        ) {
            return {
                success:
                    true,

                liveExecution:
                    true,

                action:
                    "NO_ACTION",

                symbol:
                    normalizedSymbol,

                signal:
                    normalizedSignal,

                position:
                    livePosition,

                reason:
                    "Already LONG. Pyramiding is disabled.",
            };
        }

        if (
            normalizedSignal ===
                "SHORT" &&
            livePosition.side ===
                "SHORT"
        ) {
            return {
                success:
                    true,

                liveExecution:
                    true,

                action:
                    "NO_ACTION",

                symbol:
                    normalizedSymbol,

                signal:
                    normalizedSignal,

                position:
                    livePosition,

                reason:
                    "Already SHORT. Pyramiding is disabled.",
            };
        }

        // ----------------------------------------------------
        // REVERSAL
        // ----------------------------------------------------

        let reversal =
            false;

        let closedPosition =
            null;

        if (
            (
                normalizedSignal ===
                    "LONG" &&
                livePosition.side ===
                    "SHORT"
            ) ||
            (
                normalizedSignal ===
                    "SHORT" &&
                livePosition.side ===
                    "LONG"
            )
        ) {
            reversal =
                true;

            const closeResult =
                await executeClose(
                    normalizedSymbol,
                    livePosition,
                    options
                );

            closedPosition =
                closeResult.position;

            livePosition =
                await getLivePosition(
                    normalizedSymbol
                );

            if (
                livePosition.side !==
                    "FLAT" &&
                livePosition.size >
                    0
            ) {
                throw new Error(
                    `Reversal stopped for ${normalizedSymbol}: old position is still ${livePosition.side}.`
                );
            }
        }

        // ----------------------------------------------------
        // FRESH MARKET PRICE
        // ----------------------------------------------------

        const marketPrice =
            await getCurrentPrice(
                normalizedSymbol
            );

        // ----------------------------------------------------
        // FRESH QUANTITY
        // ----------------------------------------------------

        const quantityData =
            await calculateOrderQuantity(
                normalizedSymbol,
                marketPrice
            );

        // ----------------------------------------------------
        // OPEN
        // ----------------------------------------------------

        let openResult;

        if (
            normalizedSignal ===
            "LONG"
        ) {
            openResult =
                await executeOpenLong(
                    normalizedSymbol,
                    {
                        ...options,

                        quantityData,
                    }
                );
        } else {
            openResult =
                await executeOpenShort(
                    normalizedSymbol,
                    {
                        ...options,

                        quantityData,
                    }
                );
        }

        return {
            success:
                true,

            liveExecution:
                true,

            action:
                reversal
                    ? "REVERSAL"
                    : "OPEN",

            symbol:
                normalizedSymbol,

            signal:
                normalizedSignal,

            reversal,

            closedPosition,

            marketPrice,

            quantity:
                quantityData.quantity,

            rawQuantity:
                quantityData.rawQuantity,

            targetNotional:
                quantityData.targetNotional,

            quantityStep:
                quantityData.quantityStep,

            openedPosition:
                openResult.position,

            openOrder:
                openResult.order,

            tpSl:
                openResult.tpSl,
        };
    } catch (
        error
    ) {
        return {
            success:
                false,

            liveExecution:
                true,

            action:
                "ERROR",

            symbol:
                normalizedSymbol,

            signal:
                normalizedSignal,

            error:
                error.message,
        };
    } finally {
        symbolLocks.delete(
            normalizedSymbol
        );
    }
}


// ============================================================
// READ-ONLY EXECUTION STATUS
// ============================================================

function getExecutionStatus() {
    return {
        lockedSymbols:
            Array.from(
                symbolLocks
            ),

        liveExecutionAvailable:
            true,

        maxMarginUsdt:
            config.trading
                .MAX_MARGIN_USDT,

        leverage:
            config.trading
                .LEVERAGE,

        tpSlEnabled:
            config.tpSl
                .ENABLED,

        takeProfitPercent:
            config.tpSl
                .TAKE_PROFIT_PERCENT,

        stopLossPercent:
            config.tpSl
                .STOP_LOSS_PERCENT,

        triggerType:
            config.tpSl
                .TRIGGER_TYPE,

        tradeHistorySessionStart:
            tradeHistoryCache
                .sessionStartTime,

        tradeHistoryUpdatedAt:
            tradeHistoryCache
                .updatedAt,
    };
}


// ============================================================
// READ-ONLY ORDER PREVIEW
// ============================================================

async function buildOrderPreview(
    symbol,
    signal
) {
    const normalizedSymbol =
        normalizeSymbol(symbol);

    const normalizedSignal =
        normalizeSignal(signal);

    if (
        !normalizedSymbol
    ) {
        throw new Error(
            "Symbol is required."
        );
    }

    if (
        !normalizedSignal
    ) {
        throw new Error(
            `Invalid signal: ${signal}`
        );
    }

    const livePosition =
        await getLivePosition(
            normalizedSymbol
        );

    const marketPrice =
        await getCurrentPrice(
            normalizedSymbol
        );

    const symbolInfo =
        await getSymbolInfo(
            normalizedSymbol
        );

    if (!symbolInfo) {
        throw new Error(
            `WEEX symbol information not found for ${normalizedSymbol}`
        );
    }

    const quantityPrecision =
        getQuantityPrecision(
            symbolInfo
        );

    const quantityStep =
        getQuantityStep(
            symbolInfo,
            quantityPrecision
        );

    const preview = {
        symbol:
            normalizedSymbol,

        requestedAction:
            normalizedSignal,

        liveExecution:
            false,

        orderSent:
            false,

        livePosition,

        market: {
            price:
                marketPrice,
        },

        exchangeRules: {
            pricePrecision:
                getPricePrecision(
                    symbolInfo
                ),

            priceStep:
                getPriceStep(
                    symbolInfo
                ),

            quantityPrecision,

            quantityStep,

            minOrderSize:
                getMinOrderSize(
                    symbolInfo
                ),

            maxOrderSize:
                getMaxOrderSize(
                    symbolInfo
                ),

            maxPositionSize:
                getMaxPositionSize(
                    symbolInfo
                ),

            marketOpenLimitSize:
                getMarketOpenLimitSize(
                    symbolInfo
                ),

            contractVal:
                toNumber(
                    symbolInfo?.contractVal ??
                    0
                ),
        },

        decision:
            null,

        orders:
            [],

        tpSl:
            null,

        quantity:
            null,
    };

    // --------------------------------------------------------
    // NEUTRAL
    // --------------------------------------------------------

    if (
        normalizedSignal ===
        "NEUTRAL"
    ) {
        preview.decision = {
            action:
                "NO_ACTION",

            reason:
                "NEUTRAL signal. No order required.",
        };

        return preview;
    }

    // --------------------------------------------------------
    // SAME DIRECTION
    // --------------------------------------------------------

    if (
        normalizedSignal ===
            "LONG" &&
        livePosition.side ===
            "LONG"
    ) {
        preview.decision = {
            action:
                "NO_ACTION",

            reason:
                "Already LONG. Pyramiding is disabled.",
        };

        return preview;
    }

    if (
        normalizedSignal ===
            "SHORT" &&
        livePosition.side ===
            "SHORT"
    ) {
        preview.decision = {
            action:
                "NO_ACTION",

            reason:
                "Already SHORT. Pyramiding is disabled.",
        };

        return preview;
    }

    // --------------------------------------------------------
    // CLOSE
    // --------------------------------------------------------

    if (
        normalizedSignal ===
            "CLOSE" ||
        normalizedSignal ===
            "CLOSE_LONG" ||
        normalizedSignal ===
            "CLOSE_SHORT"
    ) {
        if (
            livePosition.side ===
                "FLAT" ||
            livePosition.size <=
                0
        ) {
            preview.decision = {
                action:
                    "NO_ACTION",

                reason:
                    "Already FLAT.",
            };

            return preview;
        }

        if (
            normalizedSignal ===
                "CLOSE_LONG" &&
            livePosition.side !==
                "LONG"
        ) {
            preview.decision = {
                action:
                    "NO_ACTION",

                reason:
                    "CLOSE_LONG requested but live position is not LONG.",
            };

            return preview;
        }

        if (
            normalizedSignal ===
                "CLOSE_SHORT" &&
            livePosition.side !==
                "SHORT"
        ) {
            preview.decision = {
                action:
                    "NO_ACTION",

                reason:
                    "CLOSE_SHORT requested but live position is not SHORT.",
            };

            return preview;
        }

        preview.decision = {
            action:
                "CLOSE",

            reason:
                `Close live ${livePosition.side} position.`,
        };

        preview.orders.push({
            type:
                "CLOSE",

            symbol:
                normalizedSymbol,

            side:
                livePosition.side ===
                    "LONG"
                    ? "SELL"
                    : "BUY",

            positionSide:
                livePosition.side,

            orderType:
                "MARKET",

            quantity:
                livePosition.size,

            reduceOnly:
                true,

            newClientOrderId:
                "<generated-by-weex-service>",
        });

        return preview;
    }

    // --------------------------------------------------------
    // OPEN QUANTITY
    // --------------------------------------------------------

    const quantityData =
        await calculateOrderQuantity(
            normalizedSymbol,
            marketPrice
        );

    // --------------------------------------------------------
    // REVERSAL
    // --------------------------------------------------------

    if (
        normalizedSignal ===
            "LONG" &&
        livePosition.side ===
            "SHORT"
    ) {
        preview.decision = {
            action:
                "REVERSAL",

            reason:
                "Live SHORT + requested LONG.",
        };

        preview.orders.push({
            type:
                "CLOSE",

            symbol:
                normalizedSymbol,

            side:
                "BUY",

            positionSide:
                "SHORT",

            orderType:
                "MARKET",

            quantity:
                livePosition.size,

            reduceOnly:
                true,

            newClientOrderId:
                "<generated-by-weex-service>",
        });
    } else if (
        normalizedSignal ===
            "SHORT" &&
        livePosition.side ===
            "LONG"
    ) {
        preview.decision = {
            action:
                "REVERSAL",

            reason:
                "Live LONG + requested SHORT.",
        };

        preview.orders.push({
            type:
                "CLOSE",

            symbol:
                normalizedSymbol,

            side:
                "SELL",

            positionSide:
                "LONG",

            orderType:
                "MARKET",

            quantity:
                livePosition.size,

            reduceOnly:
                true,

            newClientOrderId:
                "<generated-by-weex-service>",
        });
    } else {
        preview.decision = {
            action:
                "OPEN",

            reason:
                `Live FLAT + requested ${normalizedSignal}.`,
        };
    }

    // --------------------------------------------------------
    // OPEN ORDER
    // --------------------------------------------------------

    const openSide =
        normalizedSignal ===
            "LONG"
            ? "BUY"
            : "SELL";

    preview.orders.push({
        type:
            "OPEN",

        symbol:
            normalizedSymbol,

        side:
            openSide,

        positionSide:
            normalizedSignal,

        orderType:
            "MARKET",

        quantity:
            quantityData.quantity,

        reduceOnly:
            false,

        newClientOrderId:
            "<generated-by-weex-service>",
    });

    // --------------------------------------------------------
    // PREVIEW TP / SL
    // --------------------------------------------------------

    const previewTpSl =
        calculateTpSl(
            normalizedSignal,
            marketPrice,
            symbolInfo
        );

    preview.tpSl = {
        basedOn:
            "PREVIEW MARKET PRICE",

        warning:
            "Actual execution must use confirmed WEEX avgPrice.",

        rawTakeProfitPrice:
            previewTpSl.rawTakeProfitPrice,

        rawStopLossPrice:
            previewTpSl.rawStopLossPrice,

        takeProfitPrice:
            previewTpSl.takeProfitPrice,

        stopLossPrice:
            previewTpSl.stopLossPrice,

        priceStep:
            previewTpSl.priceStep,

        pricePrecision:
            previewTpSl.pricePrecision,

        triggerPriceType:
            previewTpSl.triggerPriceType,
    };

    // --------------------------------------------------------
    // QUANTITY DETAILS
    // --------------------------------------------------------

    preview.quantity = {
        calculated:
            quantityData.quantity,

        raw:
            quantityData.rawQuantity,

        step:
            quantityData.quantityStep,

        minOrderSize:
            quantityData.minOrderSize,

        maxOrderSize:
            quantityData.maxOrderSize,

        maxPositionSize:
            quantityData.maxPositionSize,

        marketOpenLimitSize:
            quantityData.marketOpenLimitSize,

        targetNotional:
            quantityData.targetNotional,
    };

    return preview;
}


// ============================================================
// START TRADE HISTORY
// ============================================================
//
// Important:
// This starts asynchronously so the WEEX clock is synchronized
// BEFORE we perform the first history request.
//
// ============================================================

startWeexTradeHistoryScanner()
    .catch((error) => {
        console.error(
            `[TradeHistory] Startup failed: ${error.message}`
        );
    });


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    normalizeSymbol,
    normalizeSignal,

    getLivePosition,
    waitForPositionState,

    getCurrentPrice,

    calculateOrderQuantity,

    calculateTpSl,

    applyTpSl,

    protectExistingPosition,

    executeOpenLong,
    executeOpenShort,

    executeClose,

    executeSignal,

    getExecutionStatus,

    buildOrderPreview,

    getTradeHistory,
    getActiveTrades,
    getTradeHistoryStatus,

    getSynchronizedWeexTime,
};
