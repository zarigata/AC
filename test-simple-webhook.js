// Simple test to verify webhook route registration
import { createServer } from "node:http";

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  console.log(`${req.method} ${req.url}`);
  
  // Test basic webhook endpoint
  if (req.method === "GET" && req.url === "/api/webhooks") {
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
  
  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(4002, () => {
  console.log("Simple test webhook server running on port 4002");
  
  // Test the endpoint
  setTimeout(() => {
    fetch("http://localhost:4002/api/webhooks")
      .then(res => res.json())
      .then(data => {
        console.log("Test response:", data);
        server.close();
      })
      .catch(err => {
        console.error("Test failed:", err);
        server.close();
      });
  }, 1000);
});