import { useEffect, useState } from "react";

const API_URL = "http://localhost:3001";

function App() {
    const [bots, setBots] = useState([]);
    const [activeBot, setActiveBot] = useState(null);
    const [backendOnline, setBackendOnline] = useState(false);
    const [weexConfigured, setWeexConfigured] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadStatus = async () => {
        try {
            const response = await fetch(
                `${API_URL}/api/status`
            );

            const data = await response.json();

            setBackendOnline(data.status === "online");
            setWeexConfigured(data.weexConfigured);
        } catch (error) {
            console.error(
                "Failed to load backend status:",
                error
            );

            setBackendOnline(false);
        }
    };

    const loadBotStatus = async () => {
        try {
            const response = await fetch(
                `${API_URL}/api/bots/status`
            );

            const data = await response.json();

            setBots(data.bots);
            setActiveBot(data.activeBot);
        } catch (error) {
            console.error(
                "Failed to load bot status:",
                error
            );
        }
    };

    const loadDashboard = async () => {
        setLoading(true);

        await Promise.all([
            loadStatus(),
            loadBotStatus(),
        ]);

        setLoading(false);
    };

    useEffect(() => {
        loadDashboard();
    }, []);

    const startBot = async (name) => {
        try {
            const response = await fetch(
                `${API_URL}/api/bots/${name}/start`,
                {
                    method: "POST",
                }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error(data.error);
                return;
            }

            await loadBotStatus();
        } catch (error) {
            console.error(
                "Failed to start bot:",
                error
            );
        }
    };

    const stopBot = async (name) => {
        try {
            const response = await fetch(
                `${API_URL}/api/bots/${name}/stop`,
                {
                    method: "POST",
                }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error(data.error);
                return;
            }

            await loadBotStatus();
        } catch (error) {
            console.error(
                "Failed to stop bot:",
                error
            );
        }
    };

    if (loading) {
        return (
            <div className="dashboard">
                <h1>WEEX Bot Lab</h1>
                <p>Loading...</p>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <h1>WEEX Bot Lab</h1>

            <hr />

            <section className="status-section">
                <h2>System Status</h2>

                <p>
                    Backend:{" "}
                    <strong>
                        {backendOnline
                            ? "ONLINE"
                            : "OFFLINE"}
                    </strong>
                </p>

                <p>
                    WEEX API:{" "}
                    <strong>
                        {weexConfigured
                            ? "CONFIGURED"
                            : "NOT CONFIGURED"}
                    </strong>
                </p>
            </section>

            <hr />

            <section className="bot-section">
                <h2>Bot Manager</h2>

                <p>
                    Active Bot:{" "}
                    <strong>
                        {activeBot || "None"}
                    </strong>
                </p>

                <h2>Available Bots</h2>

                <div className="bot-list">
                    {bots.map((bot) => (
                        <div
                            className="bot-card"
                            key={bot.name}
                        >
                            <h3>{bot.name}</h3>

                            <p>
                                Version:{" "}
                                {bot.version}
                            </p>

                            <p>
                                Status:{" "}
                                {bot.status}
                            </p>

                            <p>
                                Active:{" "}
                                {bot.active
                                    ? "YES"
                                    : "NO"}
                            </p>

                            {bot.active ? (
                                <button
                                    onClick={() =>
                                        stopBot(
                                            bot.name
                                        )
                                    }
                                >
                                    Stop Bot
                                </button>
                            ) : (
                                <button
                                    onClick={() =>
                                        startBot(
                                            bot.name
                                        )
                                    }
                                    disabled={
                                        activeBot !==
                                        null
                                    }
                                >
                                    Start Bot
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

export default App;