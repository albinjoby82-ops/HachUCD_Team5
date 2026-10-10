
require("dotenv").config();

console.log("API key loaded:", !!process.env.OPENROUTER_API_KEY);
console.log("API key length:", process.env.OPENROUTER_API_KEY?.length || 0);

const express = require("express");
const axios = require("axios");
const app = express();
const PORT = 3000;

// Public hosting uses the Vercel function or Cloudflare Worker at /api/stripe.
// This optional local adapter requires Node 22+ and a same-origin frontend proxy.
app.all('/api/stripe', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const { handleStripe } = await import('../shared/stripe/sandbox.mjs');
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
    const request = new Request('http://localhost:3000' + req.originalUrl, { method: req.method, headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req.body }) });
    const response = await handleStripe(request, process.env);
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(await response.text());
  } catch { res.status(500).json({ error: 'Demo checkout is unavailable.' }); }
});
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Commons backend is running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Commons is ready!"
  });
});

app.post("/api/ai-test", async (req, res) => {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: process.env.OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content:
              req.body.message ||
              "Explain what Commons does in one sentence."
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      reply: response.data.choices[0].message.content
    });
  } catch (error) {
    console.error(
      "AI request failed:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "AI request failed. Check the server terminal for details."
    });
  }
});
app.listen(PORT, () => {
  console.log(`Commons server running at http://localhost:${PORT}`);
});