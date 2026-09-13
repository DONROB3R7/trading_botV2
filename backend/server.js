const express = require("express");
const cors = require("cors");

const config = require("./config/config");
const weex = require("./services/weex");
const botManager = require("../bot-manager");

const app = express();

const PORT = config.server.port;

app.use(cors());
app.use(express.json());


// =========================
// HEALTH
// =========================

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});


// =========================
// SYSTEM STATUS
// =========================

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        project: "WEEX Bot Lab",
        backend: "Node.js",
        port: PORT,
        weexConfigured: weex.isConfigured(),
    });
});


// =========================
// BOT LIST
// =========================

app.get("/api/bots", (req, res) => {
    res.json({
        bots: botManager.listBots(),
    });
});


// =========================
// BOT MANAGER STATUS
// =========================

app.get("/api/bots/status", (req, res) => {
    res.json(
        botManager.getStatus()
    );
});


// =========================
// SINGLE BOT INFO
// =========================

app.get("/api/bots/:name", (req, res) => {
    try {
        const bot = botManager.getBotInfo(
            req.params.name
        );

        res.json({
            bot,
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message,
        });
    }
});


// =========================
// START BOT
// =========================

app.post("/api/bots/:name/start", (req, res) => {
    try {
        botManager.startBot(
            req.params.name
        );

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


// =========================
// STOP BOT
// =========================

app.post("/api/bots/:name/stop", (req, res) => {
    try {
        botManager.stopBot(
            req.params.name
        );

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


// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
    console.log(
        `WEEX Bot Lab backend running on http://localhost:${PORT}`
    );
});