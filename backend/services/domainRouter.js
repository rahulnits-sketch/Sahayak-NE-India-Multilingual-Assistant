// domainRouter.js
// Simple keyword-based domain classifier.
// Upgrade path: replace with an LLM-based classifier prompt for better accuracy
// on languages/phrasings not covered by keywords below.

const DOMAIN_KEYWORDS = {
  healthcare: [
    "fever", "hospital", "doctor", "medicine", "health", "phc", "clinic",
    "disease", "symptom", "ayushman", "vaccine", "vaccination", "treatment",
    "pregnant", "pregnancy", "maternal", "asha", "immunization", "tb",
    "tuberculosis", "mental", "stress", "anxiety", "depression", "counsel",
    "counselling", "snakebite", "snake bite", "emergency", "nutrition",
    "cough", "injury", "wellness", "manas", "jsy", "pmjay", "anganwadi",
    "ambulance", "eye", "cataract", "hiv", "aids", "diabetes", "blood pressure",
    "hypertension", "insurance", "rabies", "dog bite", "animal bite",
    "menstrual", "sanitary", "elderly care", "geriatric", "blood donor",
    "blood bank"
  ],
  governance: [
    "certificate", "scheme", "apply", "government", "portal", "id card",
    "caste", "domicile", "ration", "aadhaar", "office", "district",
    "permit", "ilp", "inner line", "visit", "travel", "border", "tribe",
    "scheduled tribe", "land record", "jamabandi", "complaint", "grievance",
    "income certificate", "birth certificate", "death certificate",
    "cpgrams", "address", "sdo", "circle officer", "passport", "legal aid",
    "lawyer", "disability certificate", "udid", "marriage", "consumer",
    "pension", "old age", "pan card", "voter", "encumbrance", "property",
    "e-shram", "eshram", "unorganized worker"
  ],
  education: [
    "school", "scholarship", "college", "student", "admission", "exam",
    "study", "fee", "university", "course", "diksha", "skill training",
    "pmkvy", "dropout", "drop out", "open school", "nios", "midday meal",
    "mid-day meal", "mid day meal", "emrs", "residential school", "tribal student",
    "hostel", "girls hostel", "kgbv", "literacy", "adult education",
    "study abroad", "overseas scholarship", "sports", "khelo india",
    "digital literacy", "textbook", "uniform", "apprenticeship", "bicycle",
    "cycle scheme", "disability", "inclusive education"
  ],
  rural_development: [
    "mgnrega", "job card", "farmer", "village", "panchayat", "bamboo",
    "agriculture", "rural", "subsidy", "crop", "kisan", "pm-kisan",
    "pmkisan", "loan", "credit card", "house", "housing", "awas",
    "silk", "sericulture", "muga", "eri", "self-help group", "shg",
    "self help group", "livelihood", "road", "pmgsy", "livestock",
    "dairy", "cattle", "veterinary", "crop insurance", "fasal bima",
    "lpg", "gas connection", "ujjwala", "water", "jal jeevan", "toilet",
    "swachh bharat", "sanitation", "forest produce", "van dhan",
    "market", "e-nam", "fish", "fisheries", "electricity", "watershed",
    "skill training", "apprentice"
  ],
  disaster_response: [
    "flood", "floods", "flooding", "disaster", "ndrf", "sdrf", "asdma",
    "rescue", "relief camp", "evacuation", "evacuate", "embankment",
    "dam breach", "landslide", "cyclone", "boat rescue", "missing person",
    "emergency helpline", "waterlogged", "inundated", "river level",
    "flood warning", "damage compensation", "trapped", "cut off",
    "stranded", "high ground", "flood water"
  ]
};

function classifyDomain(text) {
  const lower = text.toLowerCase();
  let bestDomain = "governance"; // sensible default
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    // Weight by keyword length so specific terms (e.g. "scholarship")
    // outrank generic ones (e.g. "apply") when both match.
    const score = keywords.reduce(
      (acc, kw) => acc + (lower.includes(kw) ? kw.length : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return { domain: bestDomain, confidence: bestScore > 0 ? "keyword-match" : "default" };
}

module.exports = { classifyDomain };
