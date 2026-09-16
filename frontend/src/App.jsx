import { useEffect, useMemo, useState } from "react";

import PriceV1Panel from "./components/PriceV1Panel";
import TradingPositionsPanel from "./components/TradingPositionsPanel";

const API_BASE = "http://localhost:3001";


// ============================================================
// PRICE V1 DEFAULT SETTINGS
//
// Used only as initial UI fallback while the backend loads.
// The backend remains the real source of truth.
// ============================================================

const PRICE_V1_DEFAULTS = {
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
// APP
// ============================================================

export default function App() {

    // ========================================================
    // SYSTEM STATE
    // ========================================================

    const [systemStatus, setSystemStatus] =
        useState(null);

    const [bots, setBots] =
        useState([]);

    const [botInstances, setBotInstances] =
        useState({});

    const [assignments, setAssignments] =
        useState({});

    const [weexSymbols, setWeexSymbols] =
        useState([]);


    // ========================================================
    // UI STATE
    // ========================================================

    const [activeTab, setActiveTab] =
        useState("dashboard");

    const [selectedPriceSymbol, setSelectedPriceSymbol] =
        useState(
            () =>
                localStorage.getItem(
                    "priceV1SelectedSymbol"
                ) || ""
        );

    const [newSymbol, setNewSymbol] =
        useState("");

    const [newBot, setNewBot] =
        useState("pricev1");

    const [message, setMessage] =
        useState("");

    const [loading, setLoading] =
        useState(false);


    // ========================================================
    // PRICE V1 SESSION SETTINGS
    // ========================================================

    const [
        priceV1Settings,
        setPriceV1Settings,
    ] = useState({
        ...PRICE_V1_DEFAULTS,

        ENTRY_WINDOWS: [
            ...PRICE_V1_DEFAULTS.ENTRY_WINDOWS,
        ],
    });


    const [
        priceV1SettingsLoading,
        setPriceV1SettingsLoading,
    ] = useState(true);


    const [
        priceV1SettingsSaving,
        setPriceV1SettingsSaving,
    ] = useState(false);


    // ========================================================
    // SAVE SELECTED PRICE V1 SYMBOL
    // ========================================================

    useEffect(() => {

        if (selectedPriceSymbol) {

            localStorage.setItem(
                "priceV1SelectedSymbol",
                selectedPriceSymbol
            );

        }

    }, [
        selectedPriceSymbol
    ]);


    // ========================================================
    // LOAD SYSTEM STATUS
    // ========================================================

    async function loadSystemStatus() {

        try {

            const response =
                await fetch(
                    `${API_BASE}/api/status`
                );

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }

            const data =
                await response.json();

            setSystemStatus(data);

        } catch (error) {

            console.error(
                "System status error:",
                error
            );

        }

    }


    // ========================================================
    // LOAD WEEX SYMBOLS
    // ========================================================

    async function loadWeexSymbols() {

        try {

            const response =
                await fetch(
                    `${API_BASE}/api/market/symbols`
                );

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }

            const data =
                await response.json();

            const symbols =
                Array.isArray(
                    data?.symbols
                )
                    ? data.symbols
                    : [];


            const cleanSymbols =
                symbols
                    .map(
                        symbol =>
                            String(symbol)
                                .trim()
                                .toUpperCase()
                    )
                    .filter(Boolean)
                    .sort();


            setWeexSymbols(
                cleanSymbols
            );

        } catch (error) {

            console.error(
                "WEEX symbol load error:",
                error
            );

        }

    }


    // ========================================================
    // LOAD BOTS
    // ========================================================

    async function loadBots() {

        try {

            const response =
                await fetch(
                    `${API_BASE}/api/bots/status`
                );

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }

            const data =
                await response.json();

            const status =
                data?.status || {};


            // ------------------------------------------------
            // BOT LIST
            // ------------------------------------------------

            const botList =
                Array.isArray(
                    status?.bots
                )
                    ? status.bots
                    : [];


            setBots(
                botList
            );


            // ------------------------------------------------
            // RUNNING INSTANCES
            // ------------------------------------------------

            const rawInstances =
                status?.instances || {};


            const instanceMap =
                {};


            for (
                const [
                    symbol,
                    instance
                ]
                    of Object.entries(
                        rawInstances
                    )
            ) {

                const cleanSymbol =
                    String(
                        symbol || ""
                    )
                        .trim()
                        .toUpperCase();


                if (!cleanSymbol) {
                    continue;
                }


                instanceMap[
                    cleanSymbol
                ] = {

                    ...instance,

                    symbol:
                        cleanSymbol,

                    botName:
                        instance?.bot ||
                        "",
                };

            }


            setBotInstances(
                instanceMap
            );


            // ------------------------------------------------
            // SYMBOL ASSIGNMENTS
            // ------------------------------------------------

            const backendAssignments =
                status?.symbolAssignments;


            setAssignments(
                backendAssignments &&
                typeof backendAssignments ===
                    "object"
                    ? backendAssignments
                    : {}
            );

        } catch (error) {

            console.error(
                "Bot status error:",
                error
            );

        }

    }


    // ========================================================
    // LOAD PRICE V1 SESSION SETTINGS
    // ========================================================

    async function loadPriceV1Settings() {

        try {

            setPriceV1SettingsLoading(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/pricev1/settings`,
                    {
                        cache:
                            "no-store",
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }


            const data =
                await response.json();


            if (
                data?.success &&
                data?.settings
            ) {

                setPriceV1Settings({

                    ...PRICE_V1_DEFAULTS,

                    ...data.settings,

                    ENTRY_WINDOWS:
                        Array.isArray(
                            data.settings
                                .ENTRY_WINDOWS
                        )
                            ? [
                                ...data.settings
                                    .ENTRY_WINDOWS,
                            ]
                            : [
                                ...PRICE_V1_DEFAULTS
                                    .ENTRY_WINDOWS,
                            ],
                });

            }

        } catch (error) {

            console.error(
                "Price V1 settings load error:",
                error
            );

        } finally {

            setPriceV1SettingsLoading(
                false
            );

        }

    }


    // ========================================================
    // INITIAL LOAD
    // ========================================================

    useEffect(() => {

        let cancelled = false;


        async function initialLoad() {

            if (cancelled) {
                return;
            }


            await Promise.all([
                loadSystemStatus(),
                loadBots(),
                loadWeexSymbols(),
                loadPriceV1Settings(),
            ]);

        }


        initialLoad();


        return () => {

            cancelled = true;

        };

    }, []);


    // ========================================================
    // REFRESH BACKEND DATA
    // ========================================================

    useEffect(() => {

        const timer =
            setInterval(
                () => {

                    loadSystemStatus();

                    loadBots();

                },
                2000
            );


        return () => {

            clearInterval(
                timer
            );

        };

    }, []);


    // ========================================================
    // PRICE V1 INSTANCES
    // ========================================================

    const priceV1Instances =
        useMemo(() => {

            return Object.entries(
                botInstances
            )
                .filter(
                    ([, instance]) =>
                        instance?.botName ===
                        "pricev1"
                )
                .map(
                    ([symbol, instance]) => ({

                        symbol,

                        ...instance,

                    })
                );

        }, [
            botInstances
        ]);


    // ========================================================
    // SELECTED PRICE V1 INSTANCE
    // ========================================================

    const selectedPriceInstance =
        useMemo(() => {

            if (
                selectedPriceSymbol &&
                botInstances[
                    selectedPriceSymbol
                ]?.botName ===
                    "pricev1"
            ) {

                return (
                    botInstances[
                        selectedPriceSymbol
                    ]
                );

            }


            return (
                priceV1Instances[0] ||
                null
            );

        }, [
            selectedPriceSymbol,
            botInstances,
            priceV1Instances,
        ]);


    // ========================================================
    // KEEP SELECTED SYMBOL VALID
    // ========================================================

    useEffect(() => {

        if (
            priceV1Instances.length ===
            0
        ) {

            return;

        }


        const exists =
            priceV1Instances.some(
                instance =>
                    instance.symbol ===
                    selectedPriceSymbol
            );


        if (!exists) {

            setSelectedPriceSymbol(
                priceV1Instances[0].symbol
            );

        }

    }, [
        priceV1Instances,
        selectedPriceSymbol,
    ]);


    // ========================================================
    // PRICE V1 BOT INFORMATION
    // ========================================================

    const priceBot =
        useMemo(() => {

            return (
                bots.find(
                    bot =>
                        bot.name ===
                        "pricev1"
                ) ||
                null
            );

        }, [
            bots
        ]);


    // ========================================================
    // AVAILABLE SYMBOLS FOR ADD
    // ========================================================

    const availableSymbols =
        useMemo(() => {

            return weexSymbols.filter(
                symbol =>
                    !Object.prototype
                        .hasOwnProperty.call(
                            assignments,
                            symbol
                        )
            );

        }, [
            weexSymbols,
            assignments,
        ]);


    // ========================================================
    // PRICE V1 SETTING INPUT HELPERS
    // ========================================================

    function updatePriceV1Setting(
        key,
        value
    ) {

        setPriceV1Settings(
            previous => ({

                ...previous,

                [key]:
                    value,

            })
        );

    }


    function updateEntryWindow(
        index,
        value
    ) {

        setPriceV1Settings(
            previous => {

                const windows =
                    Array.isArray(
                        previous.ENTRY_WINDOWS
                    )
                        ? [
                            ...previous
                                .ENTRY_WINDOWS,
                        ]
                        : [];


                windows[index] =
                    value;


                return {

                    ...previous,

                    ENTRY_WINDOWS:
                        windows,
                };

            }
        );

    }


    // ========================================================
    // APPLY PRICE V1 SETTINGS
    // ========================================================

    async function applyPriceV1Settings() {

        try {

            setPriceV1SettingsSaving(
                true
            );


            const cleanWindows =
                priceV1Settings
                    .ENTRY_WINDOWS
                    .map(
                        Number
                    )
                    .filter(
                        Number.isFinite
                    );


            const payload = {

                TREND_CANDLES:
                    Number(
                        priceV1Settings
                            .TREND_CANDLES
                    ),

                ENTRY_WINDOWS:
                    cleanWindows,

                TREND_REQUIRED:
                    Number(
                        priceV1Settings
                            .TREND_REQUIRED
                    ),

                ENTRY_REQUIRED:
                    Number(
                        priceV1Settings
                            .ENTRY_REQUIRED
                    ),

                ENTRY_CONFIRMATIONS_REQUIRED:
                    Number(
                        priceV1Settings
                            .ENTRY_CONFIRMATIONS_REQUIRED
                    ),

                CYCLE_LENGTH:
                    Number(
                        priceV1Settings
                            .CYCLE_LENGTH
                    ),

                HISTORY_LIMIT:
                    Number(
                        priceV1Settings
                            .HISTORY_LIMIT
                    ),

                KLINE_LIMIT:
                    Number(
                        priceV1Settings
                            .KLINE_LIMIT
                    ),

                REFRESH_BUFFER_MS:
                    Number(
                        priceV1Settings
                            .REFRESH_BUFFER_MS
                    ),

            };


            const response =
                await fetch(
                    `${API_BASE}/api/bots/pricev1/settings`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                payload
                            ),
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            if (
                data?.settings
            ) {

                setPriceV1Settings({

                    ...PRICE_V1_DEFAULTS,

                    ...data.settings,

                    ENTRY_WINDOWS:
                        Array.isArray(
                            data.settings
                                .ENTRY_WINDOWS
                        )
                            ? [
                                ...data.settings
                                    .ENTRY_WINDOWS,
                            ]
                            : [
                                ...PRICE_V1_DEFAULTS
                                    .ENTRY_WINDOWS,
                            ],
                });

            }


            setMessage(
                "Price V1 session settings applied."
            );

        } catch (error) {

            console.error(
                "Apply Price V1 settings error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setPriceV1SettingsSaving(
                false
            );

        }

    }


    // ========================================================
    // RESET PRICE V1 SETTINGS
    // ========================================================

    async function resetPriceV1Settings() {

        try {

            setPriceV1SettingsSaving(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/pricev1/settings/reset`,
                    {

                        method:
                            "POST",

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            if (
                data?.settings
            ) {

                setPriceV1Settings({

                    ...PRICE_V1_DEFAULTS,

                    ...data.settings,

                    ENTRY_WINDOWS:
                        Array.isArray(
                            data.settings
                                .ENTRY_WINDOWS
                        )
                            ? [
                                ...data.settings
                                    .ENTRY_WINDOWS,
                            ]
                            : [
                                ...PRICE_V1_DEFAULTS
                                    .ENTRY_WINDOWS,
                            ],
                });

            }


            setMessage(
                "Price V1 settings reset to defaults."
            );

        } catch (error) {

            console.error(
                "Reset Price V1 settings error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setPriceV1SettingsSaving(
                false
            );

        }

    }


    // ========================================================
    // ADD COIN
    // ========================================================

    async function addCoin() {

        const symbol =
            String(
                newSymbol || ""
            )
                .trim()
                .toUpperCase();


        if (!symbol) {

            setMessage(
                "Please select a WEEX symbol."
            );

            return;
        }


        if (
            !weexSymbols.includes(
                symbol
            )
        ) {

            setMessage(
                `${symbol} is not a valid WEEX trading symbol.`
            );

            return;
        }


        try {

            setLoading(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/assign`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({

                                symbol,

                                botName:
                                    newBot,

                            }),

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            setMessage(
                `${symbol} assigned to ${newBot}`
            );


            setNewSymbol("");


            await loadBots();

        } catch (error) {

            console.error(
                "Add coin error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    // ========================================================
    // REMOVE COIN
    // ========================================================

    async function removeCoin(
        symbol
    ) {

        const cleanSymbol =
            String(
                symbol || ""
            )
                .trim()
                .toUpperCase();


        if (!cleanSymbol) {
            return;
        }


        try {

            setLoading(
                true
            );


            // ------------------------------------------------
            // STOP RUNNING INSTANCE FIRST
            // ------------------------------------------------

            const instance =
                botInstances[
                    cleanSymbol
                ];


            if (
                instance &&
                instance.status ===
                    "running"
            ) {

                const stopResponse =
                    await fetch(
                        `${API_BASE}/api/bots/stop-symbol`,
                        {

                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",
                            },

                            body:
                                JSON.stringify({
                                    symbol:
                                        cleanSymbol,
                                }),

                        }
                    );


                const stopData =
                    await stopResponse.json();


                if (!stopResponse.ok) {

                    throw new Error(
                        stopData?.error ||
                        `HTTP ${stopResponse.status}`
                    );

                }

            }


            // ------------------------------------------------
            // REMOVE ASSIGNMENT
            // ------------------------------------------------

            const response =
                await fetch(
                    `${API_BASE}/api/bots/assign`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({

                                symbol:
                                    cleanSymbol,

                                botName:
                                    null,

                            }),

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            // ------------------------------------------------
            // CLEAR SELECTED PRICE V1 SYMBOL
            // ------------------------------------------------

            if (
                selectedPriceSymbol ===
                cleanSymbol
            ) {

                localStorage.removeItem(
                    "priceV1SelectedSymbol"
                );


                setSelectedPriceSymbol(
                    ""
                );

            }


            setMessage(
                `${cleanSymbol} removed`
            );


            await loadBots();

        } catch (error) {

            console.error(
                "Remove coin error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    // ========================================================
    // START BOT FOR SYMBOL
    // ========================================================

    async function startBot(
        symbol,
        botName
    ) {

        const cleanSymbol =
            String(
                symbol || ""
            )
                .trim()
                .toUpperCase();


        if (!cleanSymbol) {
            return;
        }


        try {

            setLoading(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/start-symbol`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({

                                symbol:
                                    cleanSymbol,

                                botName:
                                    botName,

                            }),

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            // ------------------------------------------------
            // PRICE V1 OPEN
            // ------------------------------------------------

            if (
                botName ===
                "pricev1"
            ) {

                setSelectedPriceSymbol(
                    cleanSymbol
                );


                setActiveTab(
                    "pricev1"
                );

            }


            setMessage(
                `${botName} started for ${cleanSymbol}`
            );


            await loadBots();

        } catch (error) {

            console.error(
                "Start bot error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    // ========================================================
    // STOP BOT FOR SYMBOL
    // ========================================================

    async function stopBot(
        symbol
    ) {

        const cleanSymbol =
            String(
                symbol || ""
            )
                .trim()
                .toUpperCase();


        if (!cleanSymbol) {
            return;
        }


        try {

            setLoading(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/stop-symbol`,
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({

                                symbol:
                                    cleanSymbol,

                            }),

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            setMessage(
                `Bot stopped for ${cleanSymbol}`
            );


            await loadBots();

        } catch (error) {

            console.error(
                "Stop bot error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    // ========================================================
    // GLOBAL STATIC BOT START
    // ========================================================

    async function startGlobalBot(
        name
    ) {

        try {

            setLoading(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/${name}/start`,
                    {

                        method:
                            "POST",

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            setMessage(
                `${name} started`
            );


            await loadBots();

        } catch (error) {

            console.error(
                "Global start error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    // ========================================================
    // GLOBAL STATIC BOT STOP
    // ========================================================

    async function stopGlobalBot(
        name
    ) {

        try {

            setLoading(
                true
            );


            const response =
                await fetch(
                    `${API_BASE}/api/bots/${name}/stop`,
                    {

                        method:
                            "POST",

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    `HTTP ${response.status}`
                );

            }


            setMessage(
                `${name} stopped`
            );


            await loadBots();

        } catch (error) {

            console.error(
                "Global stop error:",
                error
            );


            setMessage(
                error.message
            );

        } finally {

            setLoading(
                false
            );

        }

    }


    // ========================================================
    // RENDER
    // ========================================================

    return (

        <div className="app">


            {/* =================================================
                HEADER
            ================================================= */}

            <header className="app-header">

                <div>

                    <h1>
                        WEEX Bot Lab
                    </h1>

                    <p className="muted">
                        Modular trading bot control center
                    </p>

                </div>


                <div className="header-status">

                    <span>
                        BACKEND
                    </span>

                    <strong>
                        {
                            systemStatus
                                ? "ONLINE"
                                : "CONNECTING..."
                        }
                    </strong>

                </div>

            </header>


            {/* =================================================
                NAVIGATION
            ================================================= */}

            <nav className="app-tabs">

                <button
                    className={
                        activeTab ===
                        "dashboard"
                            ? "active"
                            : ""
                    }

                    onClick={() =>
                        setActiveTab(
                            "dashboard"
                        )
                    }
                >
                    Dashboard
                </button>


                <button
                    className={
                        activeTab ===
                        "pricev1"
                            ? "active"
                            : ""
                    }

                    onClick={() =>
                        setActiveTab(
                            "pricev1"
                        )
                    }
                >
                    Price V1
                </button>


                <button
                    className={
                        activeTab ===
                        "trading"
                            ? "active"
                            : ""
                    }

                    onClick={() =>
                        setActiveTab(
                            "trading"
                        )
                    }
                >
                    Trading
                </button>


                <button
                    className={
                        activeTab ===
                        "orderbookv3"
                            ? "active"
                            : ""
                    }

                    onClick={() =>
                        setActiveTab(
                            "orderbookv3"
                        )
                    }
                >
                    Order Book V3
                </button>


                <button
                    className={
                        activeTab ===
                        "settings"
                            ? "active"
                            : ""
                    }

                    onClick={() =>
                        setActiveTab(
                            "settings"
                        )
                    }
                >
                    Settings
                </button>

            </nav>


            {/* =================================================
                MESSAGE
            ================================================= */}

            {
                message && (

                    <div className="app-message">

                        {message}

                        <button
                            onClick={() =>
                                setMessage(
                                    ""
                                )
                            }
                        >
                            ×
                        </button>

                    </div>

                )
            }


            {/* =================================================
                DASHBOARD
            ================================================= */}

            {
                activeTab ===
                    "dashboard" && (

                    <main className="dashboard">


                        {/* =====================================
                            SYSTEM
                        ===================================== */}

                        <section className="panel">

                            <div className="panel-header">

                                <div>

                                    <h2>
                                        System
                                    </h2>

                                    <p className="muted">
                                        WEEX Bot Lab backend status
                                    </p>

                                </div>


                                <div
                                    className={
                                        systemStatus
                                            ? "status-badge running"
                                            : "status-badge stopped"
                                    }
                                >
                                    {
                                        systemStatus
                                            ? "ONLINE"
                                            : "OFFLINE"
                                    }
                                </div>

                            </div>


                            <div className="stats-grid">

                                <div className="stat-card">

                                    <span>
                                        BACKEND
                                    </span>

                                    <strong>
                                        {
                                            systemStatus
                                                ? "CONNECTED"
                                                : "OFFLINE"
                                        }
                                    </strong>

                                </div>


                                <div className="stat-card">

                                    <span>
                                        BOTS
                                    </span>

                                    <strong>
                                        {
                                            bots.length
                                        }
                                    </strong>

                                </div>


                                <div className="stat-card">

                                    <span>
                                        RUNNING INSTANCES
                                    </span>

                                    <strong>
                                        {
                                            Object.keys(
                                                botInstances
                                            ).length
                                        }
                                    </strong>

                                </div>


                                <div className="stat-card">

                                    <span>
                                        PRICE V1
                                    </span>

                                    <strong>
                                        {
                                            priceV1Instances.length
                                        }
                                    </strong>

                                </div>

                            </div>

                        </section>


                        {/* =====================================
                            COIN MANAGER
                        ===================================== */}

                        <section className="panel">

                            <div className="panel-header">

                                <div>

                                    <h2>
                                        Coin Manager
                                    </h2>

                                    <p className="muted">
                                        Assign and control bot instances by symbol
                                    </p>

                                </div>

                            </div>


                            {/* ADD COIN */}

                            <div className="coin-manager-add">

                                <select
                                    value={
                                        newSymbol
                                    }

                                    onChange={
                                        event =>
                                            setNewSymbol(
                                                event
                                                    .target
                                                    .value
                                            )
                                    }

                                    disabled={
                                        loading
                                    }
                                >

                                    <option
                                        value=""
                                    >
                                        Select WEEX symbol
                                    </option>


                                    {
                                        availableSymbols.map(
                                            symbol => (

                                                <option
                                                    key={
                                                        symbol
                                                    }

                                                    value={
                                                        symbol
                                                    }
                                                >
                                                    {
                                                        symbol
                                                    }
                                                </option>

                                            )
                                        )
                                    }

                                </select>


                                <select
                                    value={
                                        newBot
                                    }

                                    onChange={
                                        event =>
                                            setNewBot(
                                                event
                                                    .target
                                                    .value
                                            )
                                    }

                                    disabled={
                                        loading
                                    }
                                >

                                    <option
                                        value="pricev1"
                                    >
                                        Price V1
                                    </option>

                                    <option
                                        value="orderbookv3"
                                    >
                                        Order Book V3
                                    </option>

                                </select>


                                <button
                                    onClick={
                                        addCoin
                                    }

                                    disabled={
                                        loading ||
                                        !newSymbol
                                    }
                                >
                                    ADD
                                </button>

                            </div>


                            {/* COIN LIST */}

                            <div className="table-wrapper">

                                <table>

                                    <thead>

                                        <tr>

                                            <th>
                                                SYMBOL
                                            </th>

                                            <th>
                                                ASSIGNED BOT
                                            </th>

                                            <th>
                                                STATUS
                                            </th>

                                            <th>
                                                ACTIONS
                                            </th>

                                        </tr>

                                    </thead>


                                    <tbody>

                                        {
                                            Object.keys(
                                                assignments
                                            ).length ===
                                                0 ? (

                                                <tr>

                                                    <td
                                                        colSpan="4"
                                                        className="empty-row"
                                                    >
                                                        No coins assigned yet.
                                                    </td>

                                                </tr>

                                            ) : (

                                                Object.entries(
                                                    assignments
                                                ).map(
                                                    ([
                                                        symbol,
                                                        botName,
                                                    ]) => {

                                                        const instance =
                                                            botInstances[
                                                                symbol
                                                            ];


                                                        const isRunning =
                                                            instance?.status ===
                                                            "running";


                                                        return (

                                                            <tr
                                                                key={
                                                                    symbol
                                                                }
                                                            >

                                                                <td>
                                                                    {
                                                                        symbol
                                                                    }
                                                                </td>

                                                                <td>
                                                                    {
                                                                        botName
                                                                    }
                                                                </td>

                                                                <td>

                                                                    <span
                                                                        className={
                                                                            isRunning
                                                                                ? "status-badge running"
                                                                                : "status-badge stopped"
                                                                        }
                                                                    >
                                                                        {
                                                                            isRunning
                                                                                ? "RUNNING"
                                                                                : "STOPPED"
                                                                        }
                                                                    </span>

                                                                </td>

                                                                <td>

                                                                    <div className="table-actions">

                                                                        {
                                                                            isRunning ? (

                                                                                <button
                                                                                    onClick={() =>
                                                                                        stopBot(
                                                                                            symbol
                                                                                        )
                                                                                    }

                                                                                    disabled={
                                                                                        loading
                                                                                    }
                                                                                >
                                                                                    STOP
                                                                                </button>

                                                                            ) : (

                                                                                <button
                                                                                    onClick={() =>
                                                                                        startBot(
                                                                                            symbol,
                                                                                            botName
                                                                                        )
                                                                                    }

                                                                                    disabled={
                                                                                        loading
                                                                                    }
                                                                                >
                                                                                    START
                                                                                </button>

                                                                            )
                                                                        }


                                                                        {
                                                                            botName ===
                                                                                "pricev1" && (

                                                                                <button
                                                                                    onClick={() => {

                                                                                        setSelectedPriceSymbol(
                                                                                            symbol
                                                                                        );

                                                                                        setActiveTab(
                                                                                            "pricev1"
                                                                                        );

                                                                                    }}
                                                                                >
                                                                                    OPEN
                                                                                </button>

                                                                            )
                                                                        }


                                                                        <button
                                                                            onClick={() =>
                                                                                removeCoin(
                                                                                    symbol
                                                                                )
                                                                            }

                                                                            disabled={
                                                                                loading
                                                                            }
                                                                        >
                                                                            REMOVE
                                                                        </button>

                                                                    </div>

                                                                </td>

                                                            </tr>

                                                        );

                                                    }
                                                )

                                            )
                                        }

                                    </tbody>

                                </table>

                            </div>

                        </section>


                        {/* =====================================
                            BOT MANAGER
                        ===================================== */}

                        <section className="panel">

                            <div className="panel-header">

                                <div>

                                    <h2>
                                        Bot Manager
                                    </h2>

                                    <p className="muted">
                                        Available strategy modules
                                    </p>

                                </div>

                            </div>


                            <div className="bot-grid">

                                {
                                    bots.map(
                                        bot => (

                                            <div
                                                className="bot-card"
                                                key={
                                                    bot.name
                                                }
                                            >

                                                <div>

                                                    <h3>
                                                        {
                                                            bot.name
                                                        }
                                                    </h3>

                                                    <p>
                                                        Version{" "}
                                                        {
                                                            bot.version
                                                        }
                                                    </p>

                                                </div>


                                                <div
                                                    className={
                                                        bot.status ===
                                                        "running"
                                                            ? "status-badge running"
                                                            : "status-badge stopped"
                                                    }
                                                >
                                                    {
                                                        bot.status ||
                                                        "FACTORY"
                                                    }
                                                </div>


                                                <div>

                                                    <span>
                                                        Instances:{" "}
                                                        {
                                                            bot.instances
                                                                ?.length ||
                                                            0
                                                        }
                                                    </span>

                                                </div>


                                                {/* =====================================
                                                    PRICE V1 SETTINGS
                                                ===================================== */}

                                                {
                                                    bot.name ===
                                                        "pricev1" && (

                                                        <div className="price-v1-settings">

                                                            <div className="price-v1-settings-title">
                                                                STRATEGY SETTINGS
                                                            </div>


                                                            <div className="price-v1-settings-grid">


                                                                {/* TREND CANDLES */}

                                                                <label>

                                                                    <span>
                                                                        Trend Candles
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .TREND_CANDLES
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "TREND_CANDLES",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* TREND REQUIRED */}

                                                                <label>

                                                                    <span>
                                                                        Trend Required %
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="0"

                                                                        max="100"

                                                                        step="0.1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .TREND_REQUIRED
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "TREND_REQUIRED",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* ENTRY REQUIRED */}

                                                                <label>

                                                                    <span>
                                                                        Entry Required %
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="0"

                                                                        max="100"

                                                                        step="0.1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .ENTRY_REQUIRED
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "ENTRY_REQUIRED",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* CONFIRMATIONS */}

                                                                <label>

                                                                    <span>
                                                                        Confirmations
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .ENTRY_CONFIRMATIONS_REQUIRED
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "ENTRY_CONFIRMATIONS_REQUIRED",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* CYCLE LENGTH */}

                                                                <label>

                                                                    <span>
                                                                        Cycle Length
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .CYCLE_LENGTH
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "CYCLE_LENGTH",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* HISTORY LIMIT */}

                                                                <label>

                                                                    <span>
                                                                        History Limit
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .HISTORY_LIMIT
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "HISTORY_LIMIT",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* KLINE LIMIT */}

                                                                <label>

                                                                    <span>
                                                                        Kline Limit
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .KLINE_LIMIT
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "KLINE_LIMIT",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>


                                                                {/* REFRESH BUFFER */}

                                                                <label>

                                                                    <span>
                                                                        Refresh Buffer MS
                                                                    </span>

                                                                    <input
                                                                        type="number"

                                                                        min="1"

                                                                        value={
                                                                            priceV1Settings
                                                                                .REFRESH_BUFFER_MS
                                                                        }

                                                                        onChange={
                                                                            event =>
                                                                                updatePriceV1Setting(
                                                                                    "REFRESH_BUFFER_MS",
                                                                                    event
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                        }

                                                                        disabled={
                                                                            priceV1SettingsSaving
                                                                        }

                                                                    />

                                                                </label>

                                                            </div>


                                                            {/* =====================================
                                                                ENTRY WINDOWS
                                                            ===================================== */}

                                                            <div className="price-v1-entry-window-settings">

                                                                <div className="price-v1-settings-label">
                                                                    Entry Windows
                                                                </div>


                                                                <div className="price-v1-entry-window-row">

                                                                    {
                                                                        priceV1Settings
                                                                            .ENTRY_WINDOWS
                                                                            .map(
                                                                                (
                                                                                    windowSize,
                                                                                    index
                                                                                ) => (

                                                                                    <input

                                                                                        key={
                                                                                            index
                                                                                        }

                                                                                        type="number"

                                                                                        min="1"

                                                                                        value={
                                                                                            windowSize
                                                                                        }

                                                                                        onChange={
                                                                                            event =>
                                                                                                updateEntryWindow(
                                                                                                    index,
                                                                                                    event
                                                                                                        .target
                                                                                                        .value
                                                                                                )
                                                                                        }

                                                                                        disabled={
                                                                                            priceV1SettingsSaving
                                                                                        }

                                                                                    />

                                                                                )
                                                                            )
                                                                    }

                                                                </div>

                                                            </div>


                                                            {/* =====================================
                                                                BUTTONS
                                                            ===================================== */}

                                                            <div className="price-v1-settings-actions">

                                                                <button
                                                                    onClick={
                                                                        applyPriceV1Settings
                                                                    }

                                                                    disabled={
                                                                        priceV1SettingsSaving ||
                                                                        priceV1SettingsLoading
                                                                    }
                                                                >
                                                                    {
                                                                        priceV1SettingsSaving
                                                                            ? "APPLYING..."
                                                                            : "APPLY SETTINGS"
                                                                    }
                                                                </button>


                                                                <button
                                                                    onClick={
                                                                        resetPriceV1Settings
                                                                    }

                                                                    disabled={
                                                                        priceV1SettingsSaving
                                                                    }
                                                                >
                                                                    RESET DEFAULTS
                                                                </button>

                                                            </div>


                                                            <div className="price-v1-settings-note">

                                                                {
                                                                    priceV1SettingsLoading
                                                                        ? "Loading session settings..."
                                                                        : "Settings apply to new Price V1 bot instances."
                                                                }

                                                            </div>

                                                        </div>

                                                    )
                                                }


                                                {/* =====================================
                                                    ORDER BOOK V3 GLOBAL CONTROL
                                                ===================================== */}

                                                {
                                                    bot.name ===
                                                        "orderbookv3" && (

                                                        <div className="table-actions">

                                                            {
                                                                bot.status ===
                                                                    "running" ? (

                                                                    <button
                                                                        onClick={() =>
                                                                            stopGlobalBot(
                                                                                bot.name
                                                                            )
                                                                        }

                                                                        disabled={
                                                                            loading
                                                                        }
                                                                    >
                                                                        STOP
                                                                    </button>

                                                                ) : (

                                                                    <button
                                                                        onClick={() =>
                                                                            startGlobalBot(
                                                                                bot.name
                                                                            )
                                                                        }

                                                                        disabled={
                                                                            loading
                                                                        }
                                                                    >
                                                                        START
                                                                    </button>

                                                                )
                                                            }

                                                        </div>

                                                    )
                                                }

                                            </div>

                                        )
                                    )
                                }

                            </div>

                        </section>

                    </main>

                )
            }


            {/* =================================================
                PRICE V1
            ================================================= */}

            {
                activeTab ===
                    "pricev1" && (

                    <main className="dashboard">

                        <PriceV1Panel

                            bot={
                                selectedPriceInstance ||
                                priceBot
                            }

                            instances={
                                priceV1Instances
                            }

                            selectedSymbol={
                                selectedPriceSymbol
                            }

                            onSelectSymbol={
                                setSelectedPriceSymbol
                            }

                        />

                    </main>

                )
            }


            {/* =================================================
                TRADING
            ================================================= */}

            {
                activeTab ===
                    "trading" && (

                    <main className="dashboard">

                        <TradingPositionsPanel />

                    </main>

                )
            }


            {/* =================================================
                ORDER BOOK V3
            ================================================= */}

            {
                activeTab ===
                    "orderbookv3" && (

                    <main className="dashboard">

                        <section className="panel">

                            <div className="panel-header">

                                <div>

                                    <h2>
                                        Order Book V3
                                    </h2>

                                    <p className="muted">
                                        Order book strategy dashboard
                                    </p>

                                </div>

                            </div>


                            <div className="empty-row">
                                Order Book V3 dashboard coming next.
                            </div>

                        </section>

                    </main>

                )
            }


            {/* =================================================
                SETTINGS
            ================================================= */}

            {
                activeTab ===
                    "settings" && (

                    <main className="dashboard">

                        <section className="panel">

                            <div className="panel-header">

                                <div>

                                    <h2>
                                        Settings
                                    </h2>

                                    <p className="muted">
                                        WEEX Bot Lab configuration
                                    </p>

                                </div>

                            </div>


                            <div className="stats-grid">

                                <div className="stat-card">

                                    <span>
                                        API SERVER
                                    </span>

                                    <strong>
                                        localhost:3001
                                    </strong>

                                </div>


                                <div className="stat-card">

                                    <span>
                                        FRONTEND
                                    </span>

                                    <strong>
                                        Vite / React
                                    </strong>

                                </div>


                                <div className="stat-card">

                                    <span>
                                        BOT STATE
                                    </span>

                                    <strong>
                                        BACKEND
                                    </strong>

                                </div>

                            </div>

                        </section>

                    </main>

                )
            }


            {/* =================================================
                FOOTER
            ================================================= */}

            <footer className="app-footer">

                WEEX Bot Lab · React + Node.js

            </footer>

        </div>

    );
}
