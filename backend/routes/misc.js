const express = require("express");
const router = express.Router();
const axios = require("axios");
const analytics = require("../services/analytics");

// POST /api/feedback
// body: { domain, language, rating: "up" | "down" }
router.post("/feedback", (req, res) => {
  const { domain, language, rating } = req.body;
  if (!rating || !["up", "down"].includes(rating)) {
    return res.status(400).json({ error: "rating must be 'up' or 'down'" });
  }
  analytics.logFeedback({ domain, language, rating });
  res.json({ ok: true });
});

// GET /api/stats — powers the Impact Dashboard
router.get("/stats", (req, res) => {
  res.json(analytics.getStats());
});

// POST /api/checklist
// body: { text: string, language: string }
// Extracts a short "documents/steps needed" checklist from an answer, so
// users can save/share exactly what to bring to an office — genuinely
// useful for low-literacy users navigating paperwork.
router.post("/checklist", async (req, res) => {
  try {
    const { text, language = "en" } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured — checklist generation needs Gemini" });
    }

    const langNames = { en: "English", as: "Assamese", ne: "Nepali", hi: "Hindi" };
    const langName = langNames[language] || "English";
    const languageInstruction = language === "en" ? "" : ` Respond in ${langName} script.`;

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        systemInstruction: {
          parts: [{
            text: `Extract a short checklist of concrete documents needed and/or steps to take, from the given answer text. Output ONLY a JSON array of short strings (max 6 items, each under 10 words), nothing else — no markdown, no explanation.${languageInstruction}`
          }]
        },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.2 }
      },
      { headers: { "content-type": "application/json" }, timeout: 15000 }
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    let items;
    try {
      items = JSON.parse(cleaned);
    } catch {
      items = [cleaned]; // fallback: show raw text as a single item rather than failing
    }

    res.json({ items });
  } catch (err) {
    console.error("[checklist] error:", err.response?.data || err.message);
    res.status(500).json({ error: "Checklist generation failed", detail: err.message });
  }
});

module.exports = router;
