import "dotenv/config";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { fileURLToPath } from "node:url";
const scramjetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules/@mercuryworkshop/scramjet/dist");
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
const analyticsSnippet = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-PXHK7Q7G3Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-PXHK7Q7G3Z');
</script>
`;
const STATIC_EXTENSIONS = new Set([
  ".wasm", ".js", ".css", ".dat", ".json", ".png", ".jpg", ".jpeg",
  ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map",
  ".mp3", ".ogg", ".wav", ".mp4", ".webm", ".webp", ".pck", ".data",
  ".br", ".gz", ".dll", ".blat", ".bin", ".mem",
]);
const MAX_PLAYERS_PER_MATCH = 2;
const MATCH_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const isSearchViewer = req.path === "/search.html";
  const isScramBridge = req.path === "/scram/bridge.html";
  const isHtmlRequest = req.path === "/" || req.path.endsWith(".html");
  const isToolRoute = req.path.startsWith("/tools/");
  const isolate =
    isToolRoute ||
    req.path.endsWith(".html") ||
    req.path.endsWith(".js") ||
    req.path.endsWith(".wasm") ||
    req.path.includes("emulator") ||
    req.path.toLowerCase().endsWith(".iso") ||
    req.path.includes("psp") ||
    req.path.includes("game") ||
    req.path.includes("loader");
  if (req.path.includes("iframe.html")) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  } else if (isolate && !isSearchViewer && !isScramBridge) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  }
  if (
    req.path.includes("/active/") ||
     req.path.includes("/scram/") ||
    req.path.includes("/libcurl/") ||
    req.path.includes("/baremux/")
  ) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  next();
});
function serveBrotli(contentType) {
  return (req, res, next) => {
    const brPath = path.join(process.cwd(), "public", req.path + ".br");
    const rawPath = path.join(process.cwd(), "public", req.path);
    if (fs.existsSync(brPath)) {
      res.set("Content-Encoding", "br");
      res.set("Content-Type", contentType);
      res.sendFile(brPath);
    } else if (fs.existsSync(rawPath)) {
      res.set("Content-Type", contentType);
      res.sendFile(rawPath);
    } else {
      next();
    }
  };
}
app.get(/\.dat$/, serveBrotli("application/octet-stream"));
app.get(/\.data$/, serveBrotli("application/octet-stream"));
app.get(/\.pck$/, serveBrotli("application/octet-stream"));
app.get(/\.wasm$/, serveBrotli("application/wasm"));
app.get(/\.js$/, serveBrotli("application/javascript"));
app.use(express.static("public"));
app.use(express.static("assets"));
app.use("/active/", express.static(uvPath));
app.use("/scram/", express.static(scramjetPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));
const routes = [
  { path: "/", file: "index.html" },
  { path: "/g", file: "games.html" },
  { path: "/a", file: "apps.html" },
  { path: "/i", file: "iframe.html" },
  { path: "/u", file: "unityframe.html" },
  { path: "/p", file: "profile.html" },
  { path: "/t", file: "tools.html" },
  { path: "/s", file: "settings.html" },
  { path: "/404", file: "404.html" },
];
routes.forEach((route) => {
  app.get(route.path, (req, res) => {
    const filePath = path.join(process.cwd(), "public", route.file);
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error("Error loading page:", err);
        return res.status(500).send("Error loading page");
      }
      let html = data;
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${analyticsSnippet}\n</head>`);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.send(html);
    });
  });
});
app.use((req, res) => {
  const ext = path.extname(req.path).toLowerCase();
  if (STATIC_EXTENSIONS.has(ext)) {
    return res.status(404).end();
  }
  res.redirect("/404");
});
const server = createServer();
logging.set_level(logging.DEBUG);
wisp.options.dns_method = "resolve";
wisp.options.dns_servers = ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"];
wisp.options.dns_result_order = "ipv4first";
wisp.options.allow_udp = true;
wisp.options.timeout = 30000;
server.on("request", (req, res) => {
  app(req, res);
});
//multiplayer relay server, ignore this if you do not have yomi hustle on your site. 
const relayWss = new WebSocketServer({ noServer: true });
let nextClientId = 1;
const clients = new Map();
const rooms = new Map();
function send(ws, payload) {
  if (!ws || ws.readyState !== 1) {
    return;
  }
  ws.send(JSON.stringify(payload));
}
function sendToClient(clientId, payload) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }
  send(client.ws, {
    client_id: client.id,
    ...payload,
  });
}
function sendError(clientId, message) {
  sendToClient(clientId, {
    type: "game_error",
    message,
  });
}
function generateMatchCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += MATCH_CODE_ALPHABET[Math.floor(Math.random() * MATCH_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
}
function buildMatchList() {
  return Array.from(rooms.values())
    .filter((room) => room.public && room.members.size < MAX_PLAYERS_PER_MATCH)
    .map((room) => ({
      host: room.hostName,
      code: room.code,
    }));
}
function sendMatchList(clientId) {
  sendToClient(clientId, {
    type: "match_list",
    list: buildMatchList(),
  });
}
function broadcastPlayerCount() {
  for (const clientId of clients.keys()) {
    sendToClient(clientId, {
      type: "player_count",
      count: clients.size,
    });
  }
}
function refreshLobbyState() {
  for (const clientId of clients.keys()) {
    sendMatchList(clientId);
  }
  broadcastPlayerCount();
}
function getRoomMembers(room) {
  return Array.from(room.members)
    .map((clientId) => clients.get(clientId))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}
function sendRegisterSync(room) {
  const members = getRoomMembers(room);
  for (const target of members) {
    for (const member of members) {
      sendToClient(target.id, {
        type: "player_registered",
        name: member.playerName,
        id: member.id,
        version: member.version,
      });
    }
  }
}
function closeRoom(room, disconnectedId) {
  for (const memberId of Array.from(room.members)) {
    const member = clients.get(memberId);
    if (member) {
      member.roomCode = null;
    }
    sendToClient(memberId, {
      type: "peer_disconnected",
      id: disconnectedId,
    });
  }
  rooms.delete(room.code);
}
function leaveRoom(client) {
  if (!client || !client.roomCode) {
    return;
  }
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) {
    return;
  }
  room.members.delete(client.id);
  if (room.members.size === 0) {
    rooms.delete(room.code);
    refreshLobbyState();
    return;
  }
  if (room.hostId === client.id) {
    closeRoom(room, client.id);
    refreshLobbyState();
    return;
  }
  for (const memberId of room.members) {
    sendToClient(memberId, {
      type: "peer_disconnected",
      id: client.id,
    });
  }
  refreshLobbyState();
}
function createRoomForClient(client, publicMatch) {
  leaveRoom(client);
  const code = generateMatchCode();
  const room = {
    code,
    public: Boolean(publicMatch),
    hostId: client.id,
    hostName: client.playerName,
    version: client.version,
    members: new Set([client.id]),
  };
  rooms.set(code, room);
  client.roomCode = code;
  sendToClient(client.id, {
    type: "match_created",
    code,
  });
  sendRegisterSync(room);
  refreshLobbyState();
}
function joinRoomForClient(client, roomCode) {
  leaveRoom(client);
  const code = String(roomCode || "").trim().toUpperCase();
  if (!code) {
    sendToClient(client.id, {
      type: "room_join_deny",
      message: "Invalid room code.",
    });
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    sendToClient(client.id, {
      type: "room_join_deny",
      message: "Room not found.",
    });
    return;
  }
  if (room.members.size >= MAX_PLAYERS_PER_MATCH) {
    sendToClient(client.id, {
      type: "room_join_deny",
      message: "Room is full.",
    });
    return;
  }
  room.members.add(client.id);
  client.roomCode = code;
  sendToClient(client.id, {
    type: "room_join_confirm",
  });
  sendRegisterSync(room);
  refreshLobbyState();
}
function handleRelayRpc(client, message) {
  if (!client.roomCode) {
    return;
  }
  const room = rooms.get(client.roomCode);
  if (!room) {
    return;
  }
  for (const memberId of room.members) {
    if (memberId === client.id) {
      continue;
    }
    sendToClient(memberId, {
      type: "relay_rpc",
      function_name: message.function_name,
      arg: Object.prototype.hasOwnProperty.call(message, "arg") ? message.arg : null,
    });
  }
}
function handleMessage(client, raw) {
  let message = null;
  try {
    message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    sendError(client.id, "Invalid message.");
    return;
  }
  if (!message || typeof message !== "object") {
    sendError(client.id, "Invalid message.");
    return;
  }
  switch (message.type) {
    case "create_match":
      client.playerName = String(message.player_name || `Player ${client.id}`).slice(0, 32);
      client.version = Object.prototype.hasOwnProperty.call(message, "version")
        ? message.version
        : null;
      createRoomForClient(client, message.public);
      break;
    case "player_join_game":
      client.playerName = String(message.player_name || `Player ${client.id}`).slice(0, 32);
      client.version = Object.prototype.hasOwnProperty.call(message, "version")
        ? message.version
        : null;
      joinRoomForClient(client, message.room_code);
      break;
    case "fetch_match_list":
      sendMatchList(client.id);
      break;
    case "fetch_player_count":
      sendToClient(client.id, {
        type: "player_count",
        count: clients.size,
      });
      break;
    case "relay_rpc":
      handleRelayRpc(client, message);
      break;
    default:
      sendError(client.id, "Unknown message type.");
      break;
  }
}
relayWss.on("connection", (ws) => {
  const client = {
    id: nextClientId++,
    ws,
    playerName: "",
    version: null,
    roomCode: null,
  };
  clients.set(client.id, client);
  sendToClient(client.id, { type: "welcome" });
  sendMatchList(client.id);
  broadcastPlayerCount();
  ws.on("message", (raw) => {
    handleMessage(client, raw);
  });
  ws.on("close", () => {
    leaveRoom(client);
    clients.delete(client.id);
    refreshLobbyState();
  });
  ws.on("error", () => {
    leaveRoom(client);
    clients.delete(client.id);
    refreshLobbyState();
  });
});
// routing wisp
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/wisp/")) {
    try {
      wisp.routeRequest(req, socket, head);
    } catch (error) {
      console.error("Wisp upgrade error:", error);
      socket.destroy();
    }
    return;
  }
  //relay server for yomi hustle, ignore this if you do not have yomi hustle on your site.
  if (req.url.startsWith("/relay/")) {
    relayWss.handleUpgrade(req, socket, head, (ws) => {
      relayWss.emit("connection", ws, req);
    });
    return;
  }
  socket.end();
});
server.on("error", (error) => {
  console.error("Server error:", error);
});
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  //optional multiplayer relay server for yomi
  console.log(`Relay running on ws://localhost:${port}/relay/`);
});
