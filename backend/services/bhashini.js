// bhashini.js
// Integrates with Bhashini (bhashini.gov.in) — India's National Language
// Translation Mission (Digital India / MeitY). Unlike browser Web Speech API,
// Bhashini actually supports Assamese and Bodo for ASR/TTS, because it's
// built specifically for Indian languages including low-resource ones.
//
// SETUP REQUIRED:
// 1. Sign up as a developer at bhashini.gov.in (free)
// 2. Get your userID and ulcaApiKey from the developer dashboard
// 3. Add them to .env as BHASHINI_USER_ID and BHASHINI_API_KEY
//
// Flow (2 steps, per Bhashini's ULCA API design):
//   Step 1: "Pipeline Config" call — tells Bhashini which task (ASR/TTS) and
//           language you want; returns a serviceId + a callback URL + an
//           inference auth key (these can change, so we don't hardcode them).
//   Step 2: "Pipeline Compute" call — send the actual audio/text to the
//           callback URL from step 1 to get the real result.

const axios = require("axios");

const ULCA_BASE = "https://meity-auth.ulcacontrib.org";
const CONFIG_ENDPOINT = "/ulca/apis/v0/model/getModelsPipeline";

// Bhashini uses ISO language codes. Bodo's ISO 639-3 code is "brx" (our app
// uses "bo" internally for simplicity — mapped here).
const BHASHINI_LANG = { as: "as", ne: "ne", bo: "brx", en: "en", hi: "hi" };

function isConfigured() {
  return !!(process.env.BHASHINI_USER_ID && process.env.BHASHINI_API_KEY);
}

async function getPipelineConfig(taskType, sourceLanguage, targetLanguage) {
  const task = { taskType };
  if (taskType === "asr") {
    task.config = { language: { sourceLanguage: BHASHINI_LANG[sourceLanguage] } };
  } else if (taskType === "tts") {
    task.config = { language: { sourceLanguage: BHASHINI_LANG[sourceLanguage] } };
  } else if (taskType === "translation") {
    task.config = {
      language: {
        sourceLanguage: BHASHINI_LANG[sourceLanguage],
        targetLanguage: BHASHINI_LANG[targetLanguage]
      }
    };
  }

  const response = await axios.post(
    `${ULCA_BASE}${CONFIG_ENDPOINT}`,
    {
      pipelineTasks: [task],
      pipelineRequestConfig: { pipelineId: "64392f96daac500b55c543cd" } // Bhashini's default public pipeline ID
    },
    {
      headers: {
        userID: process.env.BHASHINI_USER_ID,
        ulcaApiKey: process.env.BHASHINI_API_KEY,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const config = response.data.pipelineResponseConfig[0].config[0];
  const inferenceEndpoint = response.data.pipelineInferenceAPIEndPoint;

  return {
    serviceId: config.serviceId,
    callbackUrl: inferenceEndpoint.callbackUrl,
    authHeaderName: inferenceEndpoint.inferenceApiKey.name,
    authHeaderValue: inferenceEndpoint.inferenceApiKey.value
  };
}

// Speech-to-text: takes base64-encoded audio (WAV, 16kHz recommended), returns transcript
async function speechToText(audioBase64, language) {
  if (!isConfigured()) {
    throw new Error("Bhashini not configured — set BHASHINI_USER_ID and BHASHINI_API_KEY in .env");
  }
  const { serviceId, callbackUrl, authHeaderName, authHeaderValue } = await getPipelineConfig("asr", language);

  const response = await axios.post(
    callbackUrl,
    {
      pipelineTasks: [
        {
          taskType: "asr",
          config: { language: { sourceLanguage: BHASHINI_LANG[language] }, serviceId }
        }
      ],
      inputData: { audio: [{ audioContent: audioBase64 }] }
    },
    {
      headers: { [authHeaderName]: authHeaderValue, "Content-Type": "application/json" },
      timeout: 20000
    }
  );

  return response.data.pipelineResponse[0].output[0].source;
}

// Text-to-speech: takes text, returns base64-encoded audio (WAV)
async function textToSpeech(text, language) {
  if (!isConfigured()) {
    throw new Error("Bhashini not configured — set BHASHINI_USER_ID and BHASHINI_API_KEY in .env");
  }
  const { serviceId, callbackUrl, authHeaderName, authHeaderValue } = await getPipelineConfig("tts", language);

  const response = await axios.post(
    callbackUrl,
    {
      pipelineTasks: [
        {
          taskType: "tts",
          config: {
            language: { sourceLanguage: BHASHINI_LANG[language] },
            serviceId,
            gender: "female",
            samplingRate: 8000
          }
        }
      ],
      inputData: { input: [{ source: text }] }
    },
    {
      headers: { [authHeaderName]: authHeaderValue, "Content-Type": "application/json" },
      timeout: 20000
    }
  );

  return response.data.pipelineResponse[0].audio[0].audioContent; // base64 WAV
}

// Text translation via Bhashini NMT (more reliable for Assamese/Nepali than
// free public LibreTranslate, and keeps the whole language pipeline on one
// consistent government platform — good for both reliability and the pitch).
async function translateViaNmt(text, sourceLang, targetLang) {
  if (!isConfigured()) {
    throw new Error("Bhashini not configured — set BHASHINI_USER_ID and BHASHINI_API_KEY in .env");
  }
  const { serviceId, callbackUrl, authHeaderName, authHeaderValue } = await getPipelineConfig(
    "translation",
    sourceLang,
    targetLang
  );

  const response = await axios.post(
    callbackUrl,
    {
      pipelineTasks: [
        {
          taskType: "translation",
          config: {
            language: {
              sourceLanguage: BHASHINI_LANG[sourceLang],
              targetLanguage: BHASHINI_LANG[targetLang]
            },
            serviceId
          }
        }
      ],
      inputData: { input: [{ source: text }] }
    },
    {
      headers: { [authHeaderName]: authHeaderValue, "Content-Type": "application/json" },
      timeout: 15000
    }
  );

  return response.data.pipelineResponse[0].output[0].target;
}

module.exports = { speechToText, textToSpeech, translateViaNmt, isConfigured, BHASHINI_LANG };
