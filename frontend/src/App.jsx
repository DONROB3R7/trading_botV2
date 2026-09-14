import { useEffect, useMemo, useState } from "react";
import PriceV1Panel from "./components/PriceV1Panel";

const API_BASE = "http://localhost:3001";


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
    // SAVE SELECTED PRICE V1 SYMBOL
    // ========================================================

    useEffect(() => {

        if (selectedPriceSymbol) {

            localStorage.setItem(
                "priceV1SelectedSymbol",
                selectedPriceSymbol
            );

        }

    }, [selectedPriceSymbol]);


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
    //
    // These are ONLY used for the ADD selector.
    //
    // They are NOT displayed as Coin Manager assignments.
    //
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
                Array.isArray(data?.symbols)
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

            const botList =
                Array.isArray(data?.bots)
                    ? data.bots
                    : [];

            setBots(
                botList
            );


            // ------------------------------------------------
            // Rebuild running instances from backend
            // ------------------------------------------------

            const instanceMap = {};

            for (
                const bot of botList
            ) {

                const instances =
                    Array.isArray(
                        bot?.instances
                    )
                        ? bot.instances
                        : [];

                for (
                    const instance of instances
                ) {

                    const symbol =
                        String(
                            instance?.symbol ||
                            instance?.statusData?.symbol ||
                            ""
                        )
                            .trim()
                            .toUpperCase();

                    if (!symbol) {
                        continue;
                    }

                    instanceMap[symbol] = {

                        ...instance,

                        botName:
                            bot.name,

                    };

                }

            }

            setBotInstances(
                instanceMap
            );


            // ------------------------------------------------
            // Load assignments from backend
            // ------------------------------------------------

            try {

                const assignmentResponse =
                    await fetch(
                        `${API_BASE}/api/market/assignments`
                    );

                if (
                    assignmentResponse.ok
                ) {

                    const assignmentData =
                        await assignmentResponse.json();

                    const backendAssignments =
                        assignmentData?.assignments;

                    setAssignments(
                        backendAssignments &&
                        typeof backendAssignments ===
                            "object"
                            ? backendAssignments
                            : {}
                    );

                }

            } catch (assignmentError) {

                console.error(
                    "Assignment load error:",
                    assignmentError
                );

            }

        } catch (error) {

            console.error(
                "Bot status error:",
                error
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
            setInterval(() => {

                loadSystemStatus();
                loadBots();

            }, 2000);

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

        }, [botInstances]);


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

                return botInstances[
                    selectedPriceSymbol
                ];

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
            priceV1Instances.length === 0
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

        }, [bots]);


    // ========================================================
    // AVAILABLE SYMBOLS FOR ADD
    // ========================================================
    //
    // We remove already assigned symbols from the selector.
    //
    // This prevents accidentally assigning the same coin twice.
    //
    // ========================================================

    const availableSymbols =
        useMemo(() => {

            return weexSymbols.filter(
                symbol =>
                    !Object.prototype.hasOwnProperty.call(
                        assignments,
                        symbol
                    )
            );

        }, [
            weexSymbols,
            assignments,
        ]);


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


        // ----------------------------------------------------
        // Extra frontend safety check
        // ----------------------------------------------------

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

            setLoading(true);

            const response =
                await fetch(
                    `${API_BASE}/api/market/assign`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({

                            symbol,

                            bot:
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


            // ------------------------------------------------
            // Reload backend state
            // ------------------------------------------------

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

            setLoading(false);

        }

    }


    // ========================================================
    // REMOVE COIN
    // ========================================================

    async function removeCoin(symbol) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();

        if (!cleanSymbol) {
            return;
        }

        try {

            setLoading(true);


            // ------------------------------------------------
            // If currently running, stop it first.
            // ------------------------------------------------

            const instance =
                botInstances[
                    cleanSymbol
                ];

            if (instance) {

                await fetch(
                    `${API_BASE}/api/market/stop`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({

                            symbol:
                                cleanSymbol,

                        }),

                    }
                );

            }


            // ------------------------------------------------
            // Remove assignment
            // ------------------------------------------------

            const response =
                await fetch(
                    `${API_BASE}/api/market/assign`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({

                            symbol:
                                cleanSymbol,

                            bot:
                                "none",

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

            setLoading(false);

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
            String(symbol || "")
                .trim()
                .toUpperCase();

        if (!cleanSymbol) {
            return;
        }

        try {

            setLoading(true);

            const response =
                await fetch(
                    `${API_BASE}/api/market/start`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({

                            symbol:
                                cleanSymbol,

                            bot:
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

            setLoading(false);

        }

    }


    // ========================================================
    // STOP BOT FOR SYMBOL
    // ========================================================

    async function stopBot(
        symbol
    ) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();

        if (!cleanSymbol) {
            return;
        }

        try {

            setLoading(true);

            const response =
                await fetch(
                    `${API_BASE}/api/market/stop`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({

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

            setLoading(false);

        }

    }


    // ========================================================
    // GLOBAL STATIC BOT START
    // ========================================================

    async function startGlobalBot(
        name
    ) {

        try {

            setLoading(true);

            const response =
                await fetch(
                    `${API_BASE}/api/bots/${name}/start`,
                    {
                        method: "POST",
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

            setLoading(false);

        }

    }


    // ========================================================
    // GLOBAL STATIC BOT STOP
    // ========================================================

    async function stopGlobalBot(
        name
    ) {

        try {

            setLoading(true);

            const response =
                await fetch(
                    `${API_BASE}/api/bots/${name}/stop`,
                    {
                        method: "POST",
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

            setLoading(false);

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

                    <div
                        className="app-message"
                    >

                        {message}

                        <button
                            onClick={() =>
                                setMessage("")
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

                        <section
                            className="panel"
                        >

                            <div
                                className="panel-header"
                            >

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

                            <div
                                className="stats-grid"
                            >

                                <div
                                    className="stat-card"
                                >

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

                                <div
                                    className="stat-card"
                                >

                                    <span>
                                        BOTS
                                    </span>

                                    <strong>
                                        {
                                            bots.length
                                        }
                                    </strong>

                                </div>

                                <div
                                    className="stat-card"
                                >

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

                                <div
                                    className="stat-card"
                                >

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

                        <section
                            className="panel"
                        >

                            <div
                                className="panel-header"
                            >

                                <div>

                                    <h2>
                                        Coin Manager
                                    </h2>

                                    <p className="muted">
                                        Assign and control bot instances by symbol
                                    </p>

                                </div>

                            </div>


                            {/* =================================
                                ADD COIN
                            ================================= */}

                            <div
                                className="coin-manager-add"
                            >

                                <select
                                    value={
                                        newSymbol
                                    }

                                    onChange={
                                        event =>
                                            setNewSymbol(
                                                event.target.value
                                            )
                                    }

                                    disabled={
                                        loading
                                    }
                                >

                                    <option value="">
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
                                                event.target.value
                                            )
                                    }

                                    disabled={
                                        loading
                                    }
                                >

                                    <option value="pricev1">
                                        Price V1
                                    </option>

                                    <option value="orderbookv3">
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


                            {/* =================================
                                COIN LIST
                            ================================= */}

                            <div
                                className="table-wrapper"
                            >

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
                                                    (
                                                        [
                                                            symbol,
                                                            botName,
                                                        ]
                                                    ) => {

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

                                                                    <div
                                                                        className="table-actions"
                                                                    >

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
                            BOT LIST
                        ===================================== */}

                        <section
                            className="panel"
                        >

                            <div
                                className="panel-header"
                            >

                                <div>

                                    <h2>
                                        Bot Manager
                                    </h2>

                                    <p className="muted">
                                        Available strategy modules
                                    </p>

                                </div>

                            </div>

                            <div
                                className="bot-grid"
                            >

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


                                                {
                                                    bot.name ===
                                                    "orderbookv3" && (

                                                        <div
                                                            className="table-actions"
                                                        >

                                                            {
                                                                bot.status ===
                                                                "running" ? (

                                                                    <button
                                                                        onClick={() =>
                                                                            stopGlobalBot(
                                                                                bot.name
                                                                            )
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
                ORDER BOOK V3
            ================================================= */}

            {
                activeTab ===
                "orderbookv3" && (

                    <main className="dashboard">

                        <section
                            className="panel"
                        >

                            <div
                                className="panel-header"
                            >

                                <div>

                                    <h2>
                                        Order Book V3
                                    </h2>

                                    <p className="muted">
                                        Order book strategy dashboard
                                    </p>

                                </div>

                            </div>

                            <div
                                className="empty-row"
                            >
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

                        <section
                            className="panel"
                        >

                            <div
                                className="panel-header"
                            >

                                <div>

                                    <h2>
                                        Settings
                                    </h2>

                                    <p className="muted">
                                        WEEX Bot Lab configuration
                                    </p>

                                </div>

                            </div>

                            <div
                                className="stats-grid"
                            >

                                <div
                                    className="stat-card"
                                >

                                    <span>
                                        API SERVER
                                    </span>

                                    <strong>
                                        localhost:3001
                                    </strong>

                                </div>

                                <div
                                    className="stat-card"
                                >

                                    <span>
                                        FRONTEND
                                    </span>

                                    <strong>
                                        Vite / React
                                    </strong>

                                </div>

                                <div
                                    className="stat-card"
                                >

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

