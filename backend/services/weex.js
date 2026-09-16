const config = require("../config/config");
const crypto = require("crypto");

// ============================================================
// WEEX SERVICE
// General WEEX V3 communication layer.
//
// IMPORTANT:
// This file does NOT contain:
// - strategy logic
// - Price V1 logic
// - Order Book strategy logic
// - position flipping logic
// - pyramiding decisions
//
// It only communicates with WEEX.
// ============================================================

const WEEX_BASE_URL =
    "https://api-contract.weex.com";


// ============================================================
// HELPERS
// ============================================================

function buildQuery(params = {}) {
    const query =
        new URLSearchParams();

    for (
        const [key, value]
        of Object.entries(params)
    ) {
        if (
            value !== undefined &&
            value !== null
        ) {
            query.append(
                key,
                String(value)
            );
        }
    }

    return query.toString();
}


function createSignature(
    timestamp,
    method,
    requestPath,
    queryString = "",
    body = ""
) {
    const prehash =
        timestamp +
        method.toUpperCase() +
        requestPath +
        (
            queryString
                ? `?${queryString}`
                : ""
        ) +
        body;

    return crypto
        .createHmac(
            "sha256",
            config.weex.apiSecret
        )
        .update(prehash)
        .digest("base64");
}


function formatErrorData(data) {
    if (typeof data === "string") {
        return data;
    }

    try {
        return JSON.stringify(data);
    } catch {
        return String(data);
    }
}


// ============================================================
// CLIENT ID GENERATORS
// ============================================================
//
// WEEX V3 requires:
//
// newClientOrderId = 1-36 characters
//
// clientAlgoId = 1-36 characters
//
// We generate our own IDs here so the trading executor
// does not need to know anything about WEEX ID formatting.
// ============================================================

function createClientOrderId(prefix = "lab") {
    const timestamp =
        Date.now().toString(36);

    const random =
        Math.random()
            .toString(36)
            .slice(2, 8);

    return `${prefix}-${timestamp}-${random}`
        .slice(0, 36);
}


function createClientAlgoId(prefix = "algo") {
    const timestamp =
        Date.now().toString(36);

    const random =
        Math.random()
            .toString(36)
            .slice(2, 8);

    return `${prefix}-${timestamp}-${random}`
        .slice(0, 36);
}


// ============================================================
// WEEX SERVICE
// ============================================================

const weex = {

    // ========================================================
    // CONFIG
    // ========================================================

    getConfig() {
        return {
            apiKey:
                config.weex.apiKey,

            apiSecret:
                config.weex.apiSecret,

            apiPassphrase:
                config.weex.apiPassphrase,
        };
    },


    // ========================================================
    // API STATUS
    // ========================================================

    isConfigured() {
        return Boolean(
            config.weex.apiKey &&
            config.weex.apiSecret &&
            config.weex.apiPassphrase
        );
    },


    // ========================================================
    // BASE URL
    // ========================================================

    getBaseUrl() {
        return WEEX_BASE_URL;
    },


    // ========================================================
    // PUBLIC REQUEST
    // ========================================================

    async requestPublic(
        path,
        params = {}
    ) {
        const queryString =
            buildQuery(params);

        const url =
            `${WEEX_BASE_URL}${path}` +
            (
                queryString
                    ? `?${queryString}`
                    : ""
            );

        const response =
            await fetch(url);

        const text =
            await response.text();

        let data;

        try {
            data =
                text
                    ? JSON.parse(text)
                    : null;
        } catch {
            data = text;
        }

        if (!response.ok) {
            throw new Error(
                `WEEX HTTP ${response.status}: ${formatErrorData(data)}`
            );
        }

        return data;
    },


    // ========================================================
    // PRIVATE REQUEST
    // ========================================================

    async requestPrivate(
        method,
        path,
        params = {}
    ) {
        if (!this.isConfigured()) {
            throw new Error(
                "WEEX API credentials are not configured."
            );
        }

        const normalizedMethod =
            String(method).toUpperCase();

        const timestamp =
            Date.now().toString();

        let queryString = "";
        let body = "";

        if (
            normalizedMethod === "GET" ||
            normalizedMethod === "DELETE"
        ) {
            queryString =
                buildQuery(params);
        } else {
            body =
                JSON.stringify(
                    params || {}
                );
        }

        const signature =
            createSignature(
                timestamp,
                normalizedMethod,
                path,
                queryString,
                body
            );

        const url =
            `${WEEX_BASE_URL}${path}` +
            (
                queryString
                    ? `?${queryString}`
                    : ""
            );

        const headers = {
            "Content-Type":
                "application/json",

            "ACCESS-KEY":
                config.weex.apiKey,

            "ACCESS-SIGN":
                signature,

            "ACCESS-TIMESTAMP":
                timestamp,

            "ACCESS-PASSPHRASE":
                config.weex.apiPassphrase,
        };

        const response =
            await fetch(
                url,
                {
                    method:
                        normalizedMethod,

                    headers,

                    body:
                        body || undefined,
                }
            );

        const text =
            await response.text();

        let data;

        try {
            data =
                text
                    ? JSON.parse(text)
                    : null;
        } catch {
            data = text;
        }

        if (!response.ok) {
            throw new Error(
                `WEEX PRIVATE HTTP ${response.status}: ${formatErrorData(data)}`
            );
        }

        return data;
    },


    // ========================================================
    // MARKET DATA
    // ========================================================

    async getKlines(
        symbol,
        interval = "1m",
        limit = 1000
    ) {
        return await this.requestPublic(
            "/capi/v3/market/klines",
            {
                symbol,
                interval,
                limit,
            }
        );
    },


    async getOrderBook(
        symbol,
        limit = 15
    ) {
        return await this.requestPublic(
            "/capi/v3/market/depth",
            {
                symbol,
                limit,
            }
        );
    },


    async getExchangeInfo() {
        return await this.requestPublic(
            "/capi/v3/market/exchangeInfo"
        );
    },


    async getTradingSymbols() {
        return await this.requestPublic(
            "/capi/v3/market/apiTradingSymbols"
        );
    },


    // ========================================================
    // ACCOUNT
    // ========================================================

    async getAccount() {
        return await this.requestPrivate(
            "GET",
            "/capi/v3/account"
        );
    },


    // ========================================================
    // POSITIONS
    // ========================================================

    async getPositions() {
        return await this.requestPrivate(
            "GET",
            "/capi/v3/account/position/allPosition"
        );
    },


    // ========================================================
    // SINGLE SYMBOL POSITION
    // ========================================================

    async getPosition(symbol) {
        if (!symbol) {
            throw new Error(
                "getPosition(): symbol is required."
            );
        }

        return await this.requestPrivate(
            "GET",
            "/capi/v3/account/position/singlePosition",
            {
                symbol:
                    String(symbol)
                        .toUpperCase(),
            }
        );
    },


    // ========================================================
    // GENERIC ORDER
    // ========================================================

    async placeOrder(params) {
        if (
            !params ||
            typeof params !== "object"
        ) {
            throw new Error(
                "placeOrder(): order parameters are required."
            );
        }

        return await this.requestPrivate(
            "POST",
            "/capi/v3/order",
            params
        );
    },


    // ========================================================
    // OPEN POSITION
    //
    // Compatibility helper.
    // ========================================================

    async openPosition(params) {
        return await this.placeOrder(
            params
        );
    },


    // ========================================================
    // CLOSE POSITION
    //
    // Compatibility helper.
    // ========================================================

    async closePosition(params) {
        return await this.placeOrder(
            params
        );
    },


    // ========================================================
    // ORDER MANAGEMENT
    // ========================================================

    async cancelOrder(
        params = {}
    ) {
        return await this.requestPrivate(
            "DELETE",
            "/capi/v3/order",
            params
        );
    },


    async getOpenOrders(
        params = {}
    ) {
        return await this.requestPrivate(
            "GET",
            "/capi/v3/openOrders",
            params
        );
    },


    async getOrder(
        params = {}
    ) {
        return await this.requestPrivate(
            "GET",
            "/capi/v3/order",
            params
        );
    },


    // ========================================================
    // CONTRACT ORDER HISTORY
    //
    // READ-ONLY.
    //
    // Used by Bot Lab trade reconciliation to find the
    // REAL filled closing order and its actual avgPrice.
    //
    // No order is created or modified here.
    // ========================================================

    async getOrderHistory(
        params = {}
    ) {
        return await this.requestPrivate(
            "GET",
            "/capi/v3/order/history",
            params
        );
    },


    // ========================================================
    // CONDITIONAL / TP-SL ORDER HISTORY
    //
    // READ-ONLY.
    //
    // Used by Bot Lab trade reconciliation to determine
    // whether a closing order came from TP or SL.
    //
    // No order is created or modified here.
    // ========================================================

    async getConditionalOrderHistory(
        params = {}
    ) {
        return await this.requestPrivate(
            "GET",
            "/capi/v3/allAlgoOrders",
            params
        );
    },


    // ========================================================
    // TP / SL
    //
    // WEEX V3:
    //
    // POST /capi/v3/placeTpSlOrder
    //
    // triggerPriceType:
    // CONTRACT_PRICE
    // MARK_PRICE
    // ========================================================

    async placeTpSlOrder(
        params
    ) {
        if (
            !params ||
            typeof params !== "object"
        ) {
            throw new Error(
                "placeTpSlOrder(): parameters are required."
            );
        }

        const order =
            {
                ...params,
            };

        if (
            !order.clientAlgoId
        ) {
            order.clientAlgoId =
                createClientAlgoId(
                    "lab"
                );
        }

        return await this.requestPrivate(
            "POST",
            "/capi/v3/placeTpSlOrder",
            order
        );
    },


    // ========================================================
    // CLOSE LONG
    //
    // LOW LEVEL ONLY.
    //
    // No strategy logic.
    // No pyramiding checks.
    // No position checks.
    // ========================================================

    async closeLong(
        symbol,
        quantity
    ) {
        if (!symbol) {
            throw new Error(
                "closeLong(): symbol is required."
            );
        }

        if (!quantity) {
            throw new Error(
                "closeLong(): quantity is required."
            );
        }

        return await this.closePosition({
            symbol:
                String(symbol)
                    .toUpperCase(),

            side:
                "SELL",

            positionSide:
                "LONG",

            type:
                "MARKET",

            quantity,

            newClientOrderId:
                createClientOrderId(
                    "close-long"
                ),

            reduceOnly:
                true,
        });
    },


    // ========================================================
    // CLOSE SHORT
    // ========================================================

    async closeShort(
        symbol,
        quantity
    ) {
        if (!symbol) {
            throw new Error(
                "closeShort(): symbol is required."
            );
        }

        if (!quantity) {
            throw new Error(
                "closeShort(): quantity is required."
            );
        }

        return await this.closePosition({
            symbol:
                String(symbol)
                    .toUpperCase(),

            side:
                "BUY",

            positionSide:
                "SHORT",

            type:
                "MARKET",

            quantity,

            newClientOrderId:
                createClientOrderId(
                    "close-short"
                ),

            reduceOnly:
                true,
        });
    },


    // ========================================================
    // OPEN LONG
    //
    // LOW LEVEL ONLY.
    //
    // tradingExecutor decides whether this is allowed.
    // ========================================================

    async openLong(
        symbol,
        quantity,
        extraParams = {}
    ) {
        if (!symbol) {
            throw new Error(
                "openLong(): symbol is required."
            );
        }

        if (!quantity) {
            throw new Error(
                "openLong(): quantity is required."
            );
        }

        return await this.placeOrder({
            symbol:
                String(symbol)
                    .toUpperCase(),

            side:
                "BUY",

            positionSide:
                "LONG",

            type:
                "MARKET",

            quantity,

            newClientOrderId:
                createClientOrderId(
                    "open-long"
                ),

            ...extraParams,
        });
    },


    // ========================================================
    // OPEN SHORT
    //
    // LOW LEVEL ONLY.
    // ========================================================

    async openShort(
        symbol,
        quantity,
        extraParams = {}
    ) {
        if (!symbol) {
            throw new Error(
                "openShort(): symbol is required."
            );
        }

        if (!quantity) {
            throw new Error(
                "openShort(): quantity is required."
            );
        }

        return await this.placeOrder({
            symbol:
                String(symbol)
                    .toUpperCase(),

            side:
                "SELL",

            positionSide:
                "SHORT",

            type:
                "MARKET",

            quantity,

            newClientOrderId:
                createClientOrderId(
                    "open-short"
                ),

            ...extraParams,
        });
    },
};


// ============================================================
// EXPORT
// ============================================================

module.exports = weex;

