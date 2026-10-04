// imageAnalysis.js
// Lets users photograph a government document, form, or notice and get it
// explained in their own language — genuinely useful for low-literacy users
// navigating paperwork (governance/education domains especially).
//
// HARD SAFETY RULE: this must NEVER attempt to diagnose a medical condition
// from a photo (skin, wounds, symptoms, etc). Misdiagnosis from an untrained
// image model could delay real medical care and cause real harm — especially
// risky for a rural population with limited healthcare access. If the image
// looks health/body-related, the model is instructed to firmly redirect to
// a doctor/ASHA worker instead of describing or guessing at a condition.

const axios = require("axios");

const LANGUAGE_NAMES = { en: "English", as: "Assamese", ne: "Nepali", hi: "Hindi" };

async function analyzeImage(imageBase64, mimeType, language, userQuestion) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured — image analysis needs Gemini");
  }

  const targetLangName = LANGUAGE_NAMES[language] || "English";
  const languageInstruction =
    language === "en" ? "" : `Respond ONLY in ${targetLangName} (native script, no transliteration).`;

  const systemPrompt = `You are Sahayak, an assistant helping Northeast India citizens understand government documents, forms, notices, and health paperwork (healthcare, governance, education, and rural-development).

Given a photo, do ONE of these:
1. If it's a government form/document/certificate/notice: explain in plain language what it is, what it's for, and what the person should do next (e.g., where to submit it, what's missing, deadlines if visible).
2. If it's a doctor's prescription, medicine strip/label, or health/insurance card (e.g., Ayushman Bharat card): read out and explain what it says in plain language — medicine name, dosage/timing instructions as written, or what the card covers. Only report what is literally printed — do not add any medical opinion, do not suggest alternatives, do not comment on whether the treatment seems right. If handwriting is unclear, say so rather than guessing.
3. If it's a crop/plant/livestock photo: give general guidance and suggest contacting the local agriculture/veterinary officer for confirmation — do not claim certainty about disease diagnosis.
4. If it's a photo of a person, body part, skin condition, wound, rash, or any symptom — anything where you'd be diagnosing or assessing someone's health FROM HOW THEY LOOK rather than reading printed text: DO NOT describe, diagnose, or guess at any condition. Firmly and kindly say this needs an in-person doctor or ASHA worker visit. This rule is absolute, with no exceptions, even if the person asks directly for your opinion.
5. If the image is unclear or you're not confident what it is: say so honestly and ask the person to describe what they need help with instead of guessing.

Keep responses short (3-5 sentences), practical, and warm. Do NOT use markdown formatting — plain sentences only. ${languageInstruction}`;

  const userPrompt = userQuestion?.trim()
    ? `The person also asked: "${userQuestion}"`
    : "Explain this photo and what the person should do next.";

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: { maxOutputTokens: 350, temperature: 0.3 }
    },
    { headers: { "content-type": "application/json" }, timeout: 25000 }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? text.trim() : "I couldn't analyze that image clearly. Could you describe what you need help with?";
}

module.exports = { analyzeImage };
