const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);  // <— this line defines `server`
const io = new Server(server);

const PORT = process.env.PORT || 8080;

// Serve static files (your chess front-end)
app.use(express.static("public"));

// Socket.io events
io.on("connection", (socket) => {
  console.log("🟢 A player connected:", socket.id);

  socket.on("move", (data) => {
    socket.broadcast.emit("move", data); // send move to other player
  });

  socket.on("disconnect", () => {
    console.log("🔴 Player disconnected:", socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
