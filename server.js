const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const PORT = process.env.PORT || 3000;
const MAX_CODE_LENGTH = 80000;

// Deliberately in-memory only: no database, no disk persistence, no edit history.
const rooms = new Map();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "100kb" }));

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest();
}
function isOwnerToken(room, token) {
  if (!room || typeof token !== "string" || !token) return false;
  const actual = tokenHash(token);
  return actual.length === room.ownerTokenHash.length && crypto.timingSafeEqual(actual, room.ownerTokenHash);
}
function publicState(id, room, socket) {
  return {
    id, code: room.code, language: room.language,
    participants: room.sockets.size, locked: room.locked,
    isOwner: Boolean(socket && socket.data.isOwner)
  };
}
app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/rooms", (req, res) => {
  const code = typeof req.body.code === "string" ? req.body.code : "";
  const language = typeof req.body.language === "string" ? req.body.language.slice(0, 60) : "Plain text";
  if (code.length > MAX_CODE_LENGTH) return res.status(413).json({ error: "Code is too large. Maximum is 80,000 characters." });

  const id = crypto.randomBytes(9).toString("base64url");
  const ownerToken = crypto.randomBytes(32).toString("base64url");
  rooms.set(id, {
    code, language, ownerTokenHash: tokenHash(ownerToken), locked: false,
    createdAt: Date.now(), sockets: new Set()
  });
  // The owner token is returned once and stored only in that owner's browser.
  res.json({ id, ownerToken, shareUrl: `/room/${id}` });
});

app.get("/api/rooms/:id", (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "This workspace is no longer active. Create a new one." });
  res.json({ id: req.params.id, code: room.code, language: room.language, participants: room.sockets.size, locked: room.locked });
});

app.get("/api/qr", async (req, res) => {
  const target = String(req.query.url || "");
  try {
    const parsed = new URL(target);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== req.get("host")) {
      return res.status(400).json({ error: "Invalid workspace URL." });
    }
    const svg = await QRCode.toString(target, { type: "svg", margin: 1, width: 240, color: { dark: "#172337", light: "#ffffff" } });
    res.type("image/svg+xml").send(svg);
  } catch {
    res.status(400).json({ error: "Could not create QR code." });
  }
});

app.get("/room/:id", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

io.on("connection", socket => {
  socket.on("join-room", ({ id, ownerToken } = {}) => {
    const room = rooms.get(id);
    if (!room) {
      socket.emit("room-error", "This workspace is no longer active. The server may have restarted, or the room may have been removed.");
      return;
    }
    if (socket.data.roomId && socket.data.roomId !== id) {
      const old = rooms.get(socket.data.roomId);
      if (old) old.sockets.delete(socket.id);
      socket.leave(socket.data.roomId);
    }
    socket.data.roomId = id;
    socket.data.isOwner = isOwnerToken(room, ownerToken);
    room.sockets.add(socket.id);
    socket.join(id);
    socket.emit("room-state", publicState(id, room, socket));
    io.to(id).emit("presence", { participants: room.sockets.size });
  });

  socket.on("set-lock", ({ id, ownerToken, locked } = {}) => {
    const room = rooms.get(id);
    if (!room || socket.data.roomId !== id || !isOwnerToken(room, ownerToken)) {
      socket.emit("permission-error", "Only the workspace owner can change the editing lock.");
      return;
    }
    room.locked = Boolean(locked);
    // Update each connected client's owner flag from the token they supplied on join.
    for (const socketId of room.sockets) {
      const peer = io.sockets.sockets.get(socketId);
      if (peer) peer.emit("lock-state", { locked: room.locked, isOwner: Boolean(peer.data.isOwner) });
    }
  });

  socket.on("edit", ({ id, code, language } = {}) => {
    const room = rooms.get(id);
    if (!room || socket.data.roomId !== id || (room.locked && !socket.data.isOwner) || typeof code !== "string" || code.length > MAX_CODE_LENGTH) {
      if (room && socket.data.roomId === id && room.locked && !socket.data.isOwner) {
        socket.emit("permission-error", "This workspace is locked by its owner. You can still view and copy the code.");
      }
      return;
    }
    room.code = code;
    if (typeof language === "string") room.language = language.slice(0, 60);
    // Broadcast current state only. No previous versions or history are retained.
    socket.to(id).emit("remote-edit", { code: room.code, language: room.language, from: socket.id });
  });

  socket.on("disconnect", () => {
    const id = socket.data.roomId;
    const room = id && rooms.get(id);
    if (room) {
      room.sockets.delete(socket.id);
      io.to(id).emit("presence", { participants: room.sockets.size });
    }
  });
});

server.listen(PORT, () => console.log(`CodeRelay running at http://localhost:${PORT}`));
