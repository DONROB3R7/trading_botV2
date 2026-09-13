import { useEffect, useState } from "react";

const API_URL = "http://localhost:3001";

function App() {
    const [bots, setBots] = useState([]);
    const [activeBot, setActiveBot] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadBotStatus = async () => {
        try {
            const response = await fetch(
                `${API_URL}/api/bots/status`
            );

            const data = await response.json();

            setBots(data.availableBots);
            setActiveBot(data.activeBot);
        } catch (error) {
            console.error(
                "Failed to load bot status:",
                error
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBotStatus();
    }, []);

    const startBot = async (name) => {
        try {
            await fetch(
                `${API_URL}/api/bots/${name}/start`,
                {
                    method: "POST",
                }
            );

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
            await fetch(
                `${API_URL}/api/bots/${name}/stop`,
                {
                    method: "POST",
                }
            );

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
            <div>
                <h1>WEEX Bot Lab</h1>
                <p>Loading...</p>
            </div>
        );
    }

    return (
        <div>
            <h1>WEEX Bot Lab</h1>

            <p>
                Backend: ONLINE
            </p>

            <hr />

            <h2>Bot Manager</h2>

            <p>
                Active Bot:{" "}
                <strong>
                    {activeBot || "None"}
                </strong>
            </p>

            <h2>Available Bots</h2>

            {bots.map((bot) => (
                <div key={bot}>
                    <h3>{bot}</h3>

                    {activeBot === bot ? (
                        <button
                            onClick={() =>
                                stopBot(bot)
                            }
                        >
                            Stop Bot
                        </button>
                    ) : (
                        <button
                            onClick={() =>
                                startBot(bot)
                            }
                            disabled={activeBot !== null}
                        >
                            Start Bot
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

export default App;