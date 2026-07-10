/**
 * IBM watsonx.ai integration
 * Handles IAM bearer-token exchange (cached until near-expiry) and calls the
 * watsonx.ai text generation endpoint using an IBM Granite foundation model.
 */
const fetch = require('node-fetch');

const {
  WATSONX_API_KEY,
  WATSONX_PROJECT_ID,
  WATSONX_URL = 'https://us-south.ml.cloud.ibm.com',
  WATSONX_MODEL_ID = 'ibm/granite-3-8b-instruct',
  IBM_IAM_URL = 'https://iam.cloud.ibm.com/identity/token',
} = process.env;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getIamToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (!WATSONX_API_KEY) {
    throw new Error('WATSONX_API_KEY is missing. Add it to your .env file.');
  }

  const res = await fetch(IBM_IAM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: WATSONX_API_KEY,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IBM IAM token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000);
  return cachedToken;
}

/**
 * Calls IBM Granite via watsonx.ai's text generation endpoint.
 * @param {string} prompt - the fully composed prompt (system + context + user turn)
 * @param {object} opts - { maxNewTokens, temperature }
 */
async function generateText(prompt, opts = {}) {
  if (!WATSONX_PROJECT_ID) {
    throw new Error('WATSONX_PROJECT_ID is missing. Add it to your .env file.');
  }

  const token = await getIamToken();

  const body = {
    model_id: WATSONX_MODEL_ID,
    project_id: WATSONX_PROJECT_ID,
    input: prompt,
    parameters: {
      decoding_method: 'greedy',
      max_new_tokens: opts.maxNewTokens || 700,
      temperature: opts.temperature ?? 0.6,
      repetition_penalty: 1.05,
      stop_sequences: opts.stopSequences || ['<|end|>', '\n\nUser:'],
    },
  };

  const res = await fetch(`${WATSONX_URL}/ml/v1/text/generation?version=2024-05-31`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`watsonx.ai generation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.results?.[0]?.generated_text?.trim() || '';
}

module.exports = { generateText, getIamToken };
