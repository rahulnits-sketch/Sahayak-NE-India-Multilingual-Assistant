# Sahayak — NE India Multilingual Assistant
### OCTAVATE 2026 Hackathon · Vertical 2, PS02 prototype

A working scaffold for a multilingual (Assamese, Nepali, English), multi-domain
(healthcare, governance, education, rural development) chatbot with voice
input/output, built for the OCTAVATE hackathon.

## PS02 requirement checklist
| PS02 says | This build |
|---|---|
| Speech-to-speech | ✅ Browser STT (voice in) + TTS (voice out), full loop |
| Text-based AI | ✅ Full text chat flow |
| NPU-enabled | ✅ **Edge/Offline Mode** — toggle in UI, zero network calls, matches entirely in-browser (simulates on-device NPU inference for low-connectivity rural areas) |
| Low-resource NE dialects | ✅ **Bodo** added as a genuinely low-resource case — no MT/ASR engine exists for it, so the system uses native-script retrieval directly instead of pretending to translate it |
| Healthcare/governance/education/rural dev | ✅ All 4 domains, dataset + router + Bodo entries cover each |

Assamese and Nepali (MT-supported) still go through the translate→RAG→translate
pipeline. Bodo (MT-unsupported) is handled honestly via native-language
retrieval — this distinction is worth explaining explicitly to judges, it
shows you understood *why* PS02 calls out "low-resource" specifically.

## What's already working
- ✅ Express backend with domain classification, translation, and RAG pipeline
- ✅ Gemini responds DIRECTLY in the target language (Assamese/Nepali) — no
  separate translate-the-answer-back step, fewer failure points
- ✅ **Answer provenance badges** — every response shows whether it's
  "✓ verified source" (grounded in our curated dataset) or "⚠ general
  knowledge" (Gemini answered without a dataset match) — important trust
  signal for a government-information tool, and a good talking point for judges
- ✅ **Triple-layer voice pipeline for BOTH directions**: Bhashini (official
  govt platform) → Gemini's native audio (reliable, reuses the same working
  connection as text answers) → AI4Bharat Hugging Face Space (last resort).
  If any layer fails or isn't configured, it automatically tries the next —
  voice keeps working even if Bhashini approval is still pending
- ✅ **Flood/Disaster Response module** (NE India-specific — Assam floods are
  a major annual crisis): 12 new dataset entries covering NDRF rescue
  contact, ASDMA helpline, relief camps, damage compensation, missing
  person reporting, boat rescue requests, and post-flood health risks. Plus
  a header **🆘 Emergency** button with a state selector for all 8 NE states.
  **Safety-first design**: only 112 (National Emergency, works everywhere)
  and Assam's ASDMA numbers (1070, 1077) are shown as direct-dial `tel:`
  links, because both were independently cross-checked against official
  `.gov.in` sources. For the other 7 states, we deliberately link to each
  state's OFFICICIAL disaster management website instead of guessing a
  phone number — a wrong emergency number is more dangerous than no number.
  If your team can verify more state numbers against official sources
  before the demo, add them to `STATE_DISASTER_INFO` in `frontend/index.html`
- ✅ **Plain-text output enforced**: Gemini is explicitly instructed not to
  use markdown formatting (no `**`, no bullet dashes) since the frontend
  displays raw text — prevents literal asterisks showing up in answers
- ✅ **"How I got this answer" explainability panel**: expand any answer to
  see the exact retrieval trace — the search query used, every candidate
  considered with its similarity score, and which one was actually used.
  Makes the RAG pipeline transparent instead of a black box — good for
  technical judges who want to verify the retrieval is real, not just claimed
- ✅ **Semantic domain classification**: domain detection (Healthcare/
  Governance/etc.) now also uses the embeddings pipeline — reuses the same
  infra as retrieval, correctly classifies queries in any language/phrasing
  instead of only matching English keywords. Falls back to keyword matching
  automatically if Gemini isn't configured
- ✅ **Response caching**: repeated/identical queries are served instantly
  from an in-memory LRU cache instead of re-calling Gemini — check the
  `cached: true` field in the API response. Only applies to fresh,
  no-history, no-forced-domain queries, so it never serves stale answers to
  an ongoing conversation
- ✅ **Multi-turn conversation memory**: the frontend sends recent
  conversation history with each request; Gemini gets real conversational
  context (so "what documents do I need?" after asking about scholarships
  correctly means scholarship documents), and retrieval is enriched with the
  last turn too, not just the current message
- ✅ **WhatsApp integration** (`routes/whatsapp.js`): the exact same
  domain-classification + RAG pipeline, exposed via a Twilio WhatsApp
  webhook — real reach in rural NE India where WhatsApp is already
  everywhere but a new app install is a real adoption barrier. Language is
  selected with a prefix (`AS:`, `NE:`, `BO:`, or none for English). See
  setup instructions in the file itself — free 10-minute Twilio Sandbox setup
- ✅ **Real semantic search (vector embeddings)**: retrieval now uses actual
  vector embeddings + cosine similarity (Gemini's embedding model) instead of
  keyword/bigram matching — understands meaning and paraphrasing, not just
  literal word overlap. Falls back to keyword matching if Gemini isn't
  configured, so the demo always works either way. Dataset embeddings are
  computed once and cached to `data/embeddings_cache.json` (auto-generated
  on first run with a real Gemini key — don't worry if it's not in the repo)
- ✅ **Similarity score shown in the UI**: the "✓ verified" badge shows the
  actual cosine similarity percentage when semantic search found the match
  — real transparency, not just a binary yes/no
- ✅ **Gemini reliability**: automatic retry + fallback to a second model
  (gemini-2.5-flash-lite) if the primary model reports high demand —
  live demos shouldn't die to a single busy moment on the free tier
- ✅ **Camera/document scanner**: photograph a government form, prescription,
  medicine label, or health card — Gemini explains it in plain language.
  Hard safety rule: NEVER diagnoses from photos of skin/body/symptoms —
  always redirects to an in-person doctor/ASHA worker for those
- ✅ **Find nearest office**: one tap opens Google Maps centered on the
  user's location, searching for the right office type per domain (PHC,
  Circle Officer, Gram Panchayat, etc.) — no maintained database needed,
  scales to anywhere in India
- ✅ **Document checklist generator**: turns any answer into a short,
  shareable checklist of what to bring/do — useful for low-literacy users
- ✅ **Feedback loop**: 👍/👎 on every answer, logged for continuous
  improvement — shows judges this isn't a static demo
- ✅ **Impact Dashboard** (📊 button in header): live stats — total queries,
  breakdown by domain/language, offline-mode usage, satisfaction rate.
  Resets on backend restart (in-memory) — swap for a real DB in production,
  see comments in `services/analytics.js`
- ✅ 80 Q&A entries across 4 domains, based on real government schemes (Ayushman Bharat, MGNREGA, PM-KISAN, National Scholarship Portal, ILP, Tele-MANAS, NALSA legal aid, PMFBY crop insurance, Jal Jeevan Mission, DDU-GKY, and more) — English content is solid; native-language (Assamese/Nepali/Bodo) translations are placeholders needing native-speaker verification before the real demo
- ✅ Fallback mode: works end-to-end even with zero API keys configured
  (returns closest dataset match instead of LLM-generated answer)
- ✅ React frontend with voice input (browser Speech Recognition) and
  voice output (browser Speech Synthesis) — no paid STT/TTS API needed for demo
- ✅ Language + domain selector pills
- ✅ Edge/Offline Mode toggle — on-device-style matching, no backend call

## Quick start

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
# add your GEMINI_API_KEY (aistudio.google.com, free) for real LLM-generated answers
# add BHASHINI_USER_ID + BHASHINI_API_KEY (bhashini.gov.in, free) for real
# Assamese/Bodo/Nepali voice input & output — see "Voice for NE languages" below
npm start
```
Server runs on `http://localhost:5000`.

### 2. Frontend
Serve it with a local server (double-clicking the file can break `fetch` calls):
```bash
cd frontend
python3 -m http.server 3000
```
Then open `http://localhost:3000` in Chrome.

### Voice for NE languages (Assamese / Nepali / Bodo)
Browser Speech Recognition and Speech Synthesis **do not support these
languages at all** — this is a hard browser limitation, not a bug. For
English, the app uses the browser's free built-in voice (works out of the box).
For Assamese/Nepali/Bodo, it calls **Bhashini** — the Government of India's
own language AI platform (Digital India / MeitY), which is the only free
option that actually supports these languages, including Bodo.

To enable it:
1. Sign up free at [bhashini.gov.in](https://bhashini.gov.in) as a developer
2. Get your `userID` and `ulcaApiKey` from the dashboard
3. Add them to `backend/.env` as `BHASHINI_USER_ID` and `BHASHINI_API_KEY`
4. Restart the backend

Without these, voice input/output for NE languages will show a clear error
message rather than failing silently — English voice still works regardless.

**Important:** voice input works best in Chrome (desktop or Android).

## Architecture
```
User (voice/text, NE language)
    │
    ▼
[Browser: Web Speech API]  ──speech-to-text──▶  text in native language
    │
    ▼
POST /api/chat  { message, language, domain }
    │
    ▼
translate.js  ── native language → English (LibreTranslate)
    │
    ▼
domainRouter.js  ── classify into healthcare / governance / education / rural_dev
    │
    ▼
rag.js  ── retrieve relevant Q&A from dataset ──▶ compose answer via Gemini API
    │
    ▼
translate.js  ── English → native language
    │
    ▼
Response to frontend ──▶ [Browser: Speech Synthesis] reads answer aloud
```

## What YOU need to do before the demo

1. **Real data**: replace `backend/data/qa_dataset.json` with real content —
   at least 15-20 entries per domain, sourced from actual govt scheme pages,
   health department FAQs, education ministry sites, etc. This is what judges
   will actually judge — the current file is placeholder/dummy data.

2. **Get a free Gemini API key** (aistudio.google.com — no credit card needed) and put it in
   `backend/.env` so answers are LLM-generated instead of raw dataset lookups.
   Without it the demo still works (fallback mode) but answers are less
   flexible.

3. **Test translation quality** for Assamese/Nepali on the LibreTranslate
   public instance — it's free but not always reliable. If quality is poor,
   swap in Google Cloud Translation API (needs billing) or AI4Bharat's
   IndicTrans2 (free, better for Indian languages, but needs self-hosting —
   ask if you want help setting this up given more time).

4. **Add a 3rd language** if a teammate with Bodo/Khasi comes on board — just
   add entries to `LANGUAGES` in `frontend/index.html` and add matching
   dataset entries with that language code.

## Scaling notes (mention these in your pitch — shows judges you thought ahead)
- Retrieval is currently keyword-based for demo speed. At scale, swap in
  real embeddings (OpenAI/Gemini) + a vector DB (Pinecone/Chroma) — the
  `rag.js` interface is designed so this is a one-file change.
- Domain classification is keyword-based; an LLM-based classifier would
  handle more varied phrasing, especially in NE languages.
- For production speech-to-text on real device audio (not just browser mic),
  integrate Whisper or IndicTrans2's ASR models server-side.

## Tech stack (if judges ask)
- **Frontend**: Plain React (via CDN, no build tooling) + vanilla CSS, single
  HTML file. Uses browser-native Web Speech API for STT/TTS — zero cost, zero
  extra API keys, works offline for Edge Mode.
- **Backend**: Node.js + Express. Modular services: `translate.js`,
  `domainRouter.js`, `rag.js`.
- **Translation**: LibreTranslate (free, public instance) for Assamese/Nepali.
- **LLM**: Google Gemini API for answer generation (optional — falls back
  to raw retrieval if no key is set).
- **Retrieval**: keyword/bigram overlap over a JSON dataset (no vector DB yet
  — documented upgrade path to Pinecone/Chroma in `rag.js`).

No build step is needed for the frontend, which makes deployment trivial (see below).

## Deployment (for judges asking for a live link)

**Frontend** — deploy `frontend/index.html` as a static site:
1. [Vercel](https://vercel.com): drag-and-drop the `frontend` folder in the
   dashboard, or `vercel deploy` from inside it — no build settings needed.
2. Or [Netlify Drop](https://app.netlify.com/drop): literally drag the folder in.

Before deploying, update `API_URL` in `index.html` (currently
`http://localhost:5000/api/chat`) to your deployed backend URL.

**Backend** — deploy `backend/` to [Render](https://render.com) (free tier):
1. New Web Service → connect repo → root directory `backend`
2. Build command: `npm install` · Start command: `npm start`
3. Add environment variable `GEMINI_API_KEY` in Render's dashboard
4. Once live, copy the Render URL into `frontend/index.html`'s `API_URL`

Both are free-tier friendly and deployable in under 10 minutes — worth doing
before the demo so you have a real link to show, not just localhost.

## Demo script suggestion
1. Switch to Assamese, tap mic, ask a healthcare question — show full voice loop
2. Switch to Nepali, type a governance question — show text flow
3. Switch to English, ask an education question — show domain auto-detect
4. Show the dataset JSON briefly — explain how it plugs into real govt data
   sources going forward
