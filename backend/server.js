const express = require("express");
const cors = require("cors");

const botManager = require("../bot-manager");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());


// ================================
// SYSTEM STATUS
// ================================

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        project: "WEEX Bot Lab",
        backend: "Node.js",
    });
});


// ================================
// BOT MANAGER
// ================================

app.get("/api/bots", (req, res) => {
    res.json({
        bots: botManager.listBots(),
    });
});


app.get("/api/bots/status", (req, res) => {
    res.json(
        botManager.getStatus()
    );
});


app.post("/api/bots/:name/start", (req, res) => {
    try {
        botManager.startBot(req.params.name);

        res.json({
            success: true,
            message: `Bot started: ${req.params.name}`,
            status: botManager.getStatus(),
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});


app.post("/api/bots/:name/stop", (req, res) => {
    try {
        botManager.stopBot(req.params.name);

        res.json({
            success: true,
            message: `Bot stopped: ${req.params.name}`,
            status: botManager.getStatus(),
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});


// ================================
// START SERVER
// ================================

app.listen(PORT, () => {
    console.log(
        `WEEX Bot Lab backend running on http://localhost:${PORT}`
    );
});