const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const authRequired = require('../middleware/auth');
const { generateText } = require('../config/watsonx');
const { retrieve } = require('../db/knowledge');

const router = express.Router();

const SYSTEM_PROMPT = `You are "Interview Trainer Agent", a friendly, professional, and honest AI career coach and interview mentor.
Rules:
- Be encouraging but never give fake praise; feedback must be honest and constructive.
- Be concise and clear. Avoid long unnecessary paragraphs, robotic tone, or generic advice.
- Always personalize advice to the user's target role, experience level, and industry when known.
- Structure every substantive answer as: 1) Direct Answer 2) Short Explanation 3) Example (if relevant) 4) Action Steps 5) One relevant follow-up question.
- Use the CONTEXT block below (retrieved knowledge) when relevant, but do not mention that it was "retrieved" - speak naturally as your own expertise.`;

function buildPrompt({ systemPrompt, context, history, userMessage, userProfile }) {
  const historyText = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Mentor'}: ${m.content}`)
    .join('\n');

  return `${systemPrompt}

USER PROFILE:
- Target Role: ${userProfile.targetRole || 'Not specified'}
- Experience Level: ${userProfile.experienceLevel || 'Not specified'}
- Industry: ${userProfile.industry || 'Not specified'}
- Skills: ${userProfile.skills || 'Not specified'}

CONTEXT (retrieved knowledge, use only if relevant):
${context.length ? context.map((c, i) => `[${i + 1}] ${c}`).join('\n') : 'None'}

CONVERSATION SO FAR:
${historyText}

User: ${userMessage}
Mentor:`;
}

// Send a chat message, get mentor reply
router.post('/message', authRequired, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const user = db.get('users').find({ id: req.userId }).value();
    const sid = sessionId || uuidv4();

    let session = db.get('chats').find({ id: sid, userId: req.userId }).value();
    if (!session) {
      session = { id: sid, userId: req.userId, title: message.slice(0, 40), messages: [], createdAt: new Date().toISOString() };
      db.get('chats').push(session).write();
    }

    const context = retrieve(message, 3);
    const prompt = buildPrompt({
      systemPrompt: SYSTEM_PROMPT,
      context,
      history: session.messages,
      userMessage: message,
      userProfile: user,
    });

    const reply = await generateText(prompt, { maxNewTokens: 700, temperature: 0.6 });

    const userMsg = { id: uuidv4(), role: 'user', content: message, ts: new Date().toISOString() };
    const mentorMsg = { id: uuidv4(), role: 'mentor', content: reply, ts: new Date().toISOString() };

    db.get('chats')
      .find({ id: sid })
      .get('messages')
      .push(userMsg, mentorMsg)
      .write();

    res.json({ sessionId: sid, reply, messages: [userMsg, mentorMsg] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to reach watsonx.ai. Check your API key and project ID.' });
  }
});

// List recent chat sessions
router.get('/sessions', authRequired, (req, res) => {
  const sessions = db
    .get('chats')
    .filter({ userId: req.userId })
    .sortBy('createdAt')
    .reverse()
    .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, messageCount: s.messages.length }))
    .value();
  res.json({ sessions });
});

// Get a single session with full history
router.get('/sessions/:id', authRequired, (req, res) => {
  const session = db.get('chats').find({ id: req.params.id, userId: req.userId }).value();
  if (!session) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ session });
});

// Search chats by keyword
router.get('/search', authRequired, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const sessions = db
    .get('chats')
    .filter({ userId: req.userId })
    .filter((s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q)))
    .value();
  res.json({ sessions });
});

module.exports = router;
