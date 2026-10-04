// cache.js
// Simple in-memory LRU cache for chat responses — repeated or near-identical
// queries (common in a demo, or across multiple real users asking the same
// scheme question) get answered instantly without hitting Gemini again,
// saving both latency and free-tier API quota.
//
// Deliberately simple (a Map with manual eviction) rather than a caching
// library — this is a hackathon-scale concern (hundreds of entries), not a
// production Redis-scale one. Swap for Redis in production if query volume
// grows past what a single process's memory should hold.

const MAX_ENTRIES = 200;
const cache = new Map(); // Map preserves insertion order — used for LRU eviction

function makeKey(queryEn, domain, language) {
  const normalized = queryEn.toLowerCase().trim().replace(/\s+/g, " ");
  return `${language}|${domain || "any"}|${normalized}`;
}

function get(queryEn, domain, language) {
  const key = makeKey(queryEn, domain, language);
  if (!cache.has(key)) return null;

  // Refresh recency: delete + re-insert moves this entry to the "most
  // recently used" end of the Map's iteration order
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function set(queryEn, domain, language, value) {
  const key = makeKey(queryEn, domain, language);
  cache.set(key, value);

  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value; // Map iteration = insertion order = oldest first
    cache.delete(oldestKey);
  }
}

function stats() {
  return { size: cache.size, maxSize: MAX_ENTRIES };
}

module.exports = { get, set, stats };
