// socket.js
const express = require("express");
const path = require("path");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// 👇 serve all frontend files (HTML, CSS, JS, sounds, etc.)
app.use(express.static(path.join(__dirname)));

// ✅ default route
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
