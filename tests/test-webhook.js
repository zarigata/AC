// Simple test webhook server
import { createServer } from "node:http";

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  
  // Test webhook endpoint
  if (req.method === "GET" && url.pathname === "/api/webhooks") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ 
      webhooks: [
        {
          id: "telegram-test",
          name: "Telegram Test",
          type: "telegram",
          endpoint: "/api/webhooks/telegram"
        },
        {
          id: "discord-test", 
          name: "Discord Test",
          type: "discord",
          endpoint: "/api/webhooks/discord"
        }
      ],
      total: 2
    }));
    return;
  }
  
  // Test Telegram webhook
  if (req.method === "POST" && url.pathname === "/api/webhooks/telegram") {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, message: "Telegram webhook received" }));
    });
    return;
  }
  
  // Test Discord webhook  
  if (req.method === "POST" && url.pathname === "/api/webhooks/discord") {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ type: 1, message: "Discord webhook received" }));
    });
    return;
  }
  
  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(4001, () => {
  console.log("Test webhook server running on port 4001");
});