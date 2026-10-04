// analytics.js
// Lightweight in-memory tracking for the Impact Dashboard feature — logs
// every query (domain/language) and every 👍/👎 feedback rating.
//
// NOTE: in-memory means it resets when the server restarts. That's fine for
// a hackathon demo (shows the concept working live) — for a real deployment,
// swap the arrays below for a proper database (Postgres/MongoDB), keeping
// the same logQuery/logFeedback/getStats function signatures.

const queryLog = [];
const feedbackLog = [];

function logQuery({ domain, language, lowResourceMode, edgeMode }) {
  queryLog.push({
    domain: domain || "unclassified",
    language,
    lowResourceMode: !!lowResourceMode,
    edgeMode: !!edgeMode,
    timestamp: Date.now()
  });
}

function logFeedback({ domain, language, rating }) {
  // rating: "up" | "down"
  feedbackLog.push({ domain, language, rating, timestamp: Date.now() });
}

function getStats() {
  const byDomain = {};
  const byLanguage = {};
  let edgeCount = 0;
  let lowResourceCount = 0;

  for (const q of queryLog) {
    byDomain[q.domain] = (byDomain[q.domain] || 0) + 1;
    byLanguage[q.language] = (byLanguage[q.language] || 0) + 1;
    if (q.edgeMode) edgeCount++;
    if (q.lowResourceMode) lowResourceCount++;
  }

  const feedbackUp = feedbackLog.filter((f) => f.rating === "up").length;
  const feedbackDown = feedbackLog.filter((f) => f.rating === "down").length;

  return {
    totalQueries: queryLog.length,
    byDomain,
    byLanguage,
    edgeModeQueries: edgeCount,
    lowResourceQueries: lowResourceCount,
    feedback: {
      up: feedbackUp,
      down: feedbackDown,
      total: feedbackLog.length,
      satisfactionRate: feedbackLog.length > 0 ? Math.round((feedbackUp / feedbackLog.length) * 100) : null
    }
  };
}

module.exports = { logQuery, logFeedback, getStats };
