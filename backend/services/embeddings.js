// embeddings.js
// Real semantic retrieval: converts the dataset and each query into vector
// embeddings (via Gemini's embedding model) and ranks by cosine similarity.
// This is the actual RAG architecture (embed → compare → retrieve), not the
// keyword/bigram-overlap approximation used elsewhere in this project as a
// no-API-key fallback. Semantic search understands meaning, not just word
// overlap — e.g. "sar dard" (headache) now correctly matches a healthcare
// entry even with zero literal keyword overlap with the English dataset.
//
// Embeddings for the (static) 80-entry dataset are computed once and cached
// to disk (data/embeddings_cache.json) — this avoids re-embedding on every
// server restart and keeps runtime fast (only the user's query needs a live
// embedding call per request).

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CACHE_PATH = path.join(__dirname, "../data/embeddings_cache.json");
const EMBED_MODEL = "text-embedding-004";

async function embedText(text) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`,
    { content: { parts: [{ text }] } },
    { headers: { "content-type": "application/json" }, timeout: 10000 }
  );
  return response.data.embedding.values;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

let cachedDatasetEmbeddings = null; // in-memory copy once loaded/built this run

async function getDatasetEmbeddings(dataset) {
  if (cachedDatasetEmbeddings) return cachedDatasetEmbeddings;

  // Try loading from disk cache first
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
      if (cached.length === dataset.length) {
        cachedDatasetEmbeddings = cached;
        return cached;
      }
      console.log("[embeddings] cache size mismatch with dataset — rebuilding");
    } catch {
      console.log("[embeddings] cache unreadable — rebuilding");
    }
  }

  // Build fresh (one-time cost — subsequent restarts reuse the cache file)
  console.log(`[embeddings] building embeddings for ${dataset.length} dataset entries (one-time, cached to disk)...`);
  const results = [];
  for (const entry of dataset) {
    const vector = await embedText(`${entry.question_en} ${entry.answer_en}`);
    results.push({ id: entry.id, domain: entry.domain, vector });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(results));
  cachedDatasetEmbeddings = results;
  console.log("[embeddings] done, cached to", CACHE_PATH);
  return results;
}

// Returns top-k dataset entries ranked by semantic similarity to queryEn,
// each with a similarity score (0-1) for transparency in the UI.
async function semanticRetrieve(queryEn, domain, dataset, k = 3) {
  const datasetEmbeddings = await getDatasetEmbeddings(dataset);
  const queryVector = await embedText(queryEn);

  const scored = datasetEmbeddings
    .filter((e) => domain === null || e.domain === domain)
    .map((e) => ({ id: e.id, score: cosineSimilarity(queryVector, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  // Map back to full dataset entries, attaching the similarity score
  return scored.map((s) => ({
    ...dataset.find((d) => d.id === s.id),
    similarityScore: Math.round(s.score * 100) / 100
  }));
}

module.exports = { semanticRetrieve, embedText, cosineSimilarity };
