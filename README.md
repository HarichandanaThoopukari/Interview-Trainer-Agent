# 🎯 Interview Trainer Agent

**Practice Smarter. Interview Stronger. Get Hired Faster.**

An AI-powered interview preparation platform built on **IBM watsonx.ai** using the **IBM Granite** foundation model, with a lightweight Retrieval-Augmented Generation (RAG) layer. Includes auth, a colorful dark-themed dashboard, resume ATS analysis, a personalized question generator, realistic scored mock interviews, DSA/study-plan generation, bookmarks, and progress analytics.

---

## ✨ Features

- 🔐 Secure signup/login (JWT + bcrypt), forgot password, profile management
- 📊 Dashboard: interview readiness score, stats, strengths/weaknesses, recent chats
- 💬 Mentor chatbot (Granite + RAG context) with session history & search
- 📄 Resume upload (PDF/DOCX/TXT) → ATS score, keyword gap analysis, AI feedback
- ❓ Question generator: Technical / Coding / HR / Behavioral (STAR), with model answers
- 🎤 Mock Interview mode: one question at a time, scored on Clarity, Confidence, Technical Accuracy, Communication, Structure, plus an overall report
- 🗺️ Study plan generator (daily/weekly/monthly, company-targeted)
- 🔖 Bookmarks for questions, answers, and study plans
- 🎨 Attractive, colorful dark theme (deep navy/charcoal + blue/violet/teal/amber accents)

---

## 🧰 Tech Stack

- **Backend:** Node.js + Express
- **Storage:** lowdb (JSON file) — zero external DB required, easy to swap for MongoDB/Postgres later
- **Auth:** JWT + bcryptjs
- **AI:** IBM watsonx.ai REST API (`/ml/v1/text/generation`) calling an **IBM Granite** model, with IAM API-key → bearer-token exchange
- **Frontend:** Vanilla HTML/CSS/JS (no build step — runs anywhere, zero framework lock-in)

---

## 📁 Project Structure

```
interview-trainer-agent/
├── server.js                 # Express entrypoint
├── config/watsonx.js         # IBM watsonx.ai IAM auth + Granite text generation
├── db/
│   ├── database.js           # lowdb setup
│   ├── knowledge.js          # RAG knowledge base + retrieval
│   └── data.json             # auto-created local data store (git-ignored)
├── middleware/auth.js         # JWT auth guard
├── routes/
│   ├── auth.js                # signup/login/forgot-password/profile
│   ├── chat.js                 # mentor chatbot + sessions
│   ├── interview.js            # questions, model answers, mock interviews, study plan
│   ├── resume.js                # resume upload + ATS analysis
│   ├── bookmarks.js             # save/list/delete bookmarks
│   └── dashboard.js             # aggregated overview stats
├── public/                    # frontend (served statically by Express)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── uploads/                   # uploaded resumes (git-ignored)
├── .env                       # PRE-FILLED with the watsonx credentials you provided
├── .env.example                # template for teammates/other environments
├── render.yaml                 # one-click Render blueprint
├── vercel.json                  # Vercel serverless config (see caveats below)
└── package.json
```

---

## 🔑 IBM watsonx.ai Credentials

Your `.env` file has already been pre-filled with the API key and Project ID you provided:

```
WATSONX_API_KEY=m5UnFLy4YiEBpkGZdGWCUBqkvhXAAHaDq6yiV8JHGlL-
WATSONX_PROJECT_ID=7dd9f4a1-7119-4214-9380-ef579a52ad49
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-3-8b-instruct
```

> ⚠️ **Security note:** `.env` is listed in `.gitignore` so it will **not** be pushed to GitHub. Never commit real API keys to a public repo. When you deploy (Render/Vercel), re-enter these same values as **Environment Variables** in that platform's dashboard instead of uploading the `.env` file.
>
> If `WATSONX_URL` doesn't match your project's region, open your project in watsonx.ai → check the URL bar / project settings for the correct regional endpoint (`us-south`, `eu-de`, `eu-gb`, or `jp-tok`) and update it.
>
> If `ibm/granite-3-8b-instruct` isn't available in your project, open watsonx.ai → Foundation Models and copy the exact model ID of any Granite model you have access to (e.g. `ibm/granite-13b-instruct-v2`), then update `WATSONX_MODEL_ID`.

---

## 🚀 Running Locally (VS Code)

1. **Unzip** this project and open the folder in VS Code.
2. Open a terminal in VS Code (`` Ctrl+` ``) and install dependencies:
   ```bash
   npm install
   ```
3. Confirm `.env` has your credentials (already done — see above).
4. Start the server:
   ```bash
   npm start
   ```
   or, for auto-restart on file changes during development:
   ```bash
   npm run dev
   ```
5. Open **http://localhost:5000** in your browser. Sign up, and you're in.

The top bar shows a live **"watsonx connected"** pill once your credentials are verified — if it shows an error, double-check your API key/Project ID/region.

---

## 🧪 Running in IBM Bob (IBM's AI-assisted IDE) / any Node-compatible IDE

This is a **standard Node.js + Express** project with no proprietary build tooling, so it opens and runs the same way in IBM Bob (or any IDE) as it does in VS Code:

1. Open/import the unzipped `interview-trainer-agent` folder as a project.
2. Ensure a Node.js runtime (v18+) is selected/available in the IDE.
3. Run `npm install` in the integrated terminal.
4. Run `npm start` (entrypoint: `server.js`, port from `.env`/`PORT`, default `5000`).
5. Use the IDE's built-in browser preview or open `http://localhost:5000` manually.

If your IDE auto-detects a `Procfile`/start script, `npm start` (→ `node server.js`) is the one to use.

---

## ☁️ Deploying for Free

### Option A — Render (recommended, full app in one place)

Render gives you a persistent Node process, which this app is built around (file-based storage + file uploads).

1. Push this project to a GitHub repo (`.env` stays out of it automatically via `.gitignore`).
2. Go to [render.com](https://render.com) → **New → Web Service** → connect your repo.
   - Render will detect `render.yaml` automatically (or set manually: Build Command `npm install`, Start Command `npm start`).
3. In **Environment**, add:
   - `WATSONX_API_KEY`
   - `WATSONX_PROJECT_ID`
   - `WATSONX_URL`
   - `WATSONX_MODEL_ID`
   - `JWT_SECRET` (any long random string — Render can auto-generate one)
4. Deploy. Render gives you a live URL like `https://interview-trainer-agent.onrender.com`.

> Free-tier Render services spin down after inactivity and spin back up on the next request (may take ~30-60s to "wake up"). This is normal.

### Option B — Vercel

Vercel functions are **serverless and stateless** — this app's storage (`lowdb`) writes to disk, and disk writes on Vercel only persist for the lifetime of a single function invocation (path auto-switches to `/tmp` when `VERCEL` env var is detected, so it won't crash, but **user accounts/chat history will not reliably persist** between requests/cold starts).

Two ways to use Vercel:
- **Frontend-only split:** Deploy just the `public/` folder to Vercel (as a static site) and point `API_BASE` in `public/js/app.js` to your Render backend URL. This gives you persistent data (via Render) + Vercel's fast static hosting for the UI.
- **Full app on Vercel (demo/testing only):** Import the repo into Vercel as-is (it will use `vercel.json`), add the same environment variables as above in Project Settings → Environment Variables. Good for quick demos; not recommended for real user data without swapping `lowdb` for a hosted database (e.g. MongoDB Atlas free tier, or Postgres on Neon/Supabase).

---

## 🔌 API Overview

All routes are prefixed with `/api`.

| Route | Method | Description |
|---|---|---|
| `/auth/signup` | POST | Create account + onboarding profile |
| `/auth/login` | POST | Log in, returns JWT |
| `/auth/forgot-password` | POST | Reset to a temp password |
| `/auth/me` | GET/PUT | Get/update profile |
| `/chat/message` | POST | Send a chat message to the mentor (Granite + RAG) |
| `/chat/sessions` | GET | List chat sessions |
| `/chat/sessions/:id` | GET | Full session history |
| `/chat/search?q=` | GET | Search chats |
| `/resume/upload` | POST | Upload + analyze a resume (multipart `resume` field) |
| `/interview/questions` | POST | Generate questions by category/difficulty |
| `/interview/model-answer` | POST | Model answer + tips for a question |
| `/interview/mock/start` | POST | Start a mock interview |
| `/interview/mock/:id/answer` | POST | Submit an answer, get scored feedback |
| `/interview/mock/:id` | GET | Get a mock interview report |
| `/interview/study-plan` | POST | Generate a study plan |
| `/bookmarks` | GET/POST | List/create bookmarks |
| `/bookmarks/:id` | DELETE | Remove a bookmark |
| `/dashboard/overview` | GET | Aggregated dashboard data |
| `/health` | GET | Server + watsonx connectivity status |

All routes except `/auth/signup`, `/auth/login`, `/auth/forgot-password`, and `/health` require `Authorization: Bearer <token>`.

---

## 🧠 About the RAG Layer

`db/knowledge.js` contains curated interview knowledge (DSA roadmaps, STAR method, ATS tips, company-specific patterns, etc.) with a simple keyword-based retriever. Relevant snippets are injected into every Granite prompt as context — this is what makes responses grounded rather than purely generic. To upgrade to a full vector-based RAG pipeline, swap the `retrieve()` function for a call to a real vector store (watsonx.ai Discovery, Milvus, Pinecone, etc.) — nothing else in the app needs to change.

---

## 🛠️ Troubleshooting

- **"watsonx not configured" pill:** `.env` is missing or the server wasn't restarted after editing it.
- **401 from watsonx / IAM token errors:** API key is invalid, expired, or doesn't have access to the given Project ID.
- **404 / model not found:** Your `WATSONX_MODEL_ID` isn't available in your project's region — check watsonx.ai → Foundation Models.
- **Resume upload fails on DOCX:** the built-in extractor does raw text extraction for `.docx`/`.txt`; for full DOCX parsing swap in a library like `mammoth` if needed.

---

Built for students, freshers, and professionals who want to walk into every interview prepared, confident, and ready. Good luck! 🚀
