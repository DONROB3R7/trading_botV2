const config = require("../config/config");


// ============================================================
// WEEX SERVICE
// General WEEX communication layer
// ============================================================

const WEEX_BASE_URL = "https://api-contract.weex.com";


const weex = {

    // ========================================================
    // CONFIG
    // ========================================================

    getConfig() {

        return {
            apiKey: config.weex.apiKey,
            apiSecret: config.weex.apiSecret,
            apiPassphrase: config.weex.apiPassphrase,
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
    // PUBLIC REQUEST
    // ========================================================

    async requestPublic(
        path,
        params = {}
    ) {

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


        const queryString =
            query.toString();


        const url =
            `${WEEX_BASE_URL}${path}` +
            (
                queryString
                    ? `?${queryString}`
                    : ""
            );


        const response =
            await fetch(url);


        if (!response.ok) {

            const text =
                await response.text();


            throw new Error(
                `WEEX HTTP ${response.status}: ${text}`
            );
        }


        return await response.json();
    },


    // ========================================================
    // PRIVATE REQUEST
    // ========================================================
    //
    // Private WEEX requests will go here.
    //
    // This is where we will later handle:
    //
    // - API key
    // - passphrase
    // - timestamp
    // - signature
    // - authenticated headers
    //
    // ========================================================

    async requestPrivate(
        method,
        path,
        params = {}
    ) {

        throw new Error(
            "WEEX private API is not implemented yet."
        );
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
    //
    // These functions will use requestPrivate()
    // once authenticated WEEX communication is added.
    //
    // ========================================================

    async getAccount() {

        return await this.requestPrivate(
            "GET",
            "/capi/v3/account"
        );
    },


    async getPositions() {

        return await this.requestPrivate(
            "GET",
            "/capi/v3/positionRisk"
        );
    },


    // ========================================================
    // ORDERS
    // ========================================================

    async openPosition(
        params
    ) {

        return await this.requestPrivate(
            "POST",
            "/capi/v3/order",
            params
        );
    },


    async closePosition(
        params
    ) {

        return await this.requestPrivate(
            "POST",
            "/capi/v3/order",
            params
        );
    },


    async cancelOrder(
        params
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
        params
    ) {

        return await this.requestPrivate(
            "GET",
            "/capi/v3/order",
            params
        );
    },


    // ========================================================
    // GENERIC POSITION ACTIONS
    // ========================================================

    async closeLong(
        symbol,
        quantity
    ) {

        return await this.closePosition({
            symbol,
            side: "SELL",
            quantity,
            positionSide: "LONG",
        });
    },


    async closeShort(
        symbol,
        quantity
    ) {

        return await this.closePosition({
            symbol,
            side: "BUY",
            quantity,
            positionSide: "SHORT",
        });
    },


    // ========================================================
    // BASE URL
    // ========================================================

    getBaseUrl() {

        return WEEX_BASE_URL;
    },
};


module.exports = weex;