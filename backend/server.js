
require("dotenv").config();

console.log("API key loaded:", !!process.env.OPENROUTER_API_KEY);
console.log("API key length:", process.env.OPENROUTER_API_KEY?.length || 0);

const express = require("express");
const axios = require("axios");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = 3000;

app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Webhook verification failed:", error.message);
      return res.status(400).send("Invalid Stripe signature");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.mode === "subscription") {
        console.log("TEAMLY SUBSCRIPTION CREATED!");
        console.log("Customer:", session.customer);
        console.log("Subscription:", session.subscription);
      }
    }

    if (event.type === "invoice.paid") {
      console.log("TEAMLY SUBSCRIPTION PAYMENT SUCCESSFUL!");
      console.log("Invoice:", event.data.object.id);
    }

    if (event.type === "customer.subscription.deleted") {
      console.log("TEAMLY SUBSCRIPTION CANCELLED!");
    }

    res.json({ received: true });
  }
);
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
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
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: "http://localhost:3000/payment-success",
      cancel_url: "http://localhost:3000/payment-cancelled"
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error.message);
    res.status(500).json({ error: "Could not create checkout." });
  }
});

app.get("/payment-success", (req, res) => {
  res.send("Teamly checkout returned successfully. Payment verification is pending.");
});

app.get("/payment-cancelled", (req, res) => {
  res.send("Teamly subscription checkout cancelled.");
});
app.listen(PORT, () => {
  console.log(`Commons server running at http://localhost:${PORT}`);
});