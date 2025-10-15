// socket.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Serve static files (your HTML/CSS/JS)
app.use(express.static(path.join(__dirname)));

// Simple route to check if server is alive
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Socket logic (keep your game logic later)
io.on("connection", (socket) => {
  console.log("✅ New player connected:", socket.id);
  socket.emit("message", "Welcome to Chess server!");

  socket.on("disconnect", () => {
    console.log("❌ Player disconnected:", socket.id);
  });
});

// ✅ Important: Railway provides PORT automatically
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
