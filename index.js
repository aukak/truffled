import "dotenv/config"
import fs from "node:fs"
import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import cors from "cors";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server"
import { toIPv4 } from "./utils.js";

const analyticsSnippet = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-PXHK7Q7G3Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-PXHK7Q7G3Z');
</script>
`;

const app = express();
app.use(express.json());
app.use(cors());

// Enhanced COOP/COEP headers for WebAssembly applications
app.use((req, res, next) => {
    // Apply to terraria, hl2, or any path that needs WebAssembly
    if (req.path.includes("terraria") || req.path.includes("hl2") || req.path.includes("half-life") || req.path.includes("portal")) {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        // Add these additional headers for better WebAssembly support
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
    next();
});

app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  const originalSendFile = res.sendFile.bind(res);
    res.send = function(data) {
    if (res.getHeader('Content-Type')?.includes('text/html') && typeof data === 'string') {
      if (data.includes('</head>')) {
        data = data.replace('</head>', `${analyticsSnippet}\n</head>`);
      }
    }
    return originalSend(data);
  };
    res.sendFile = function(filePath, options) {
    if (typeof filePath === 'string' && filePath.endsWith('.html')) {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error loading page');
        const modified = data.replace('</head>', `${analyticsSnippet}\n</head>`);
        res.setHeader('Content-Type', 'text/html');
        originalSend(modified);
      });
    } else {
      originalSendFile(filePath, options);
    }
  };
  next();
});

app.use(express.static("public"));
app.use(express.static("assets"));
app.use("/active/", express.static(uvPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));

const server = createServer();
logging.set_level(logging.DEBUG);
wisp.options.dns_method = "resolve";
wisp.options.dns_servers = ["1.1.1.3", "1.0.0.3"];
wisp.options.dns_result_order = "ipv4first";

server.on("request", (req, res) => {
  app(req, res);
});
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/wisp/") {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

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
    res.sendFile(path.join(import.meta.dirname, "public", route.file));
  });
});
app.get('/ip', (req, res) => {
  const rawIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ipv4 = toIPv4(rawIp);
  const prefix = ipv4.split('.')[0];
  res.send(prefix);
});
app.use((req, res) => {
  res.redirect("/404");
});

const port = process.env.PORT || 80;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});