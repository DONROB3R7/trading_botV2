// ============================================================
// WEEX BOT LAB
// BOT CONFIGURATION
// ============================================================


// ============================================================
// PRICE V1 DEFAULT SETTINGS
//
// These are the fallback values.
//
// Dashboard session settings can override them later.
// ============================================================

const priceV1Defaults = {

    TREND_CANDLES: 200,

    ENTRY_WINDOWS: [
        15,
        20,
        30,
        60,
    ],

    TREND_REQUIRED: 53,

    ENTRY_REQUIRED: 50,

    ENTRY_CONFIRMATIONS_REQUIRED: 3,

    CYCLE_LENGTH: 10,

    HISTORY_LIMIT: 500,

    KLINE_LIMIT: 1000,

    REFRESH_BUFFER_MS: 1200,
};


// ============================================================
// CURRENT PRICE V1 SESSION SETTINGS
//
// Starts with the defaults.
//
// These values will later be controlled from the dashboard.
// ============================================================

let priceV1SessionSettings = {

    ...priceV1Defaults,

    ENTRY_WINDOWS: [
        ...priceV1Defaults.ENTRY_WINDOWS,
    ],
};


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    // ========================================================
    // BOT MANAGER
    // ========================================================

    activeBot: null,

    bots: {

        pricev1: {

            enabled: true,

            version: "1.0.0",
        },

        orderbookv3: {

            enabled: true,

            version: "3.0.0",
        },
    },


    // ========================================================
    // PRICE V1 DEFAULTS
    // ========================================================

    priceV1Defaults,


    // ========================================================
    // GET CURRENT PRICE V1 SESSION SETTINGS
    // ========================================================

    getPriceV1Settings() {

        return {

            ...priceV1SessionSettings,

            ENTRY_WINDOWS: [
                ...priceV1SessionSettings.ENTRY_WINDOWS,
            ],
        };
    },


    // ========================================================
    // SET PRICE V1 SESSION SETTINGS
    //
    // Later the dashboard will call this.
    //
    // Only supplied values are changed.
    // Anything not supplied keeps its current value.
    // ========================================================

    setPriceV1Settings(
        settings = {}
    ) {

        priceV1SessionSettings = {

            ...priceV1SessionSettings,

            ...settings,

            ENTRY_WINDOWS:
                Array.isArray(
                    settings.ENTRY_WINDOWS
                )
                    ? [
                        ...settings.ENTRY_WINDOWS,
                    ]
                    : [
                        ...priceV1SessionSettings.ENTRY_WINDOWS,
                    ],
        };


        return this.getPriceV1Settings();
    },


    // ========================================================
    // RESET PRICE V1 SESSION SETTINGS
    // ========================================================

    resetPriceV1Settings() {

        priceV1SessionSettings = {

            ...priceV1Defaults,

            ENTRY_WINDOWS: [
                ...priceV1Defaults.ENTRY_WINDOWS,
            ],
        };


        return this.getPriceV1Settings();
    },
};
