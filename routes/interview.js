const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const authRequired = require('../middleware/auth');
const { generateText } = require('../config/watsonx');
const { retrieve } = require('../db/knowledge');

const router = express.Router();

function withUser(req) {
  return db.get('users').find({ id: req.userId }).value();
}

async function askGranite(prompt, opts) {
  return generateText(prompt, opts);
}

// ---------- QUESTION GENERATOR ----------
// category: technical | coding | hr | behavioral
router.post('/questions', authRequired, async (req, res) => {
  try {
    const { category = 'technical', difficulty = 'medium', count = 5 } = req.body;
    const user = withUser(req);
    const context = retrieve(`${category} ${user.targetRole} ${difficulty}`, 3);

    const categoryInstructions = {
      technical: 'Generate role-specific TECHNICAL interview questions (concepts, not coding problems).',
      coding: 'Generate CODING problems with a short problem statement, a hint, and expected time complexity. Do NOT give the full solution yet.',
      hr: 'Generate common HR round questions (e.g. about background, motivation, salary expectations, culture fit).',
      behavioral: 'Generate BEHAVIORAL questions that should be answered using the STAR method (leadership, teamwork, conflict, failure, problem solving).',
    };

    const prompt = `You are an expert interview question generator for the role "${user.targetRole || 'Software Engineer'}" at ${difficulty} difficulty, for a candidate with experience level "${user.experienceLevel}".
${categoryInstructions[category] || categoryInstructions.technical}

Relevant context:
${context.join('\n')}

Return exactly ${count} questions as a numbered list (1. 2. 3. ...). No preamble, no explanation, just the numbered list.`;

    const raw = await askGranite(prompt, { maxNewTokens: 500, temperature: 0.7 });

    const questions = raw
      .split(/\n+/)
      .map((l) => l.replace(/^\s*\d+[\.\)]\s*/, '').trim())
      .filter((l) => l.length > 3)
      .slice(0, count);

    // bump stats — coding-category generations count as a coding test attempt too
    const statUpdates = { questionsPracticed: (user.stats.questionsPracticed || 0) + questions.length };
    if (category === 'coding') {
      statUpdates.codingTests = (user.stats.codingTests || 0) + 1;
    }
    db.get('users').find({ id: req.userId }).get('stats').assign(statUpdates).write();

    res.json({ category, difficulty, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- MODEL ANSWER FOR A SINGLE QUESTION ----------
router.post('/model-answer', authRequired, async (req, res) => {
  try {
    const { question, category = 'technical' } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required.' });

    const user = withUser(req);
    const context = retrieve(`${category} ${question}`, 2);

    const prompt = `You are an interview coach. For the ${category} question below, respond to a candidate targeting "${user.targetRole || 'Software Engineer'}" (experience: ${user.experienceLevel}).

Question: "${question}"

Relevant context:
${context.join('\n')}

Respond in this exact structure with these exact headers:
Sample Answer:
Expert Tips:
Common Mistakes:
Confidence Tip:`;

    const answer = await askGranite(prompt, { maxNewTokens: 600, temperature: 0.6 });
    res.json({ question, answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- MOCK INTERVIEW: START ----------
router.post('/mock/start', authRequired, async (req, res) => {
  try {
    const { role, numQuestions = 5 } = req.body;
    const user = withUser(req);
    const targetRole = role || user.targetRole || 'Software Engineer';
    const context = retrieve(`mock interview ${targetRole} ${user.experienceLevel}`, 3);

    const prompt = `Generate ${numQuestions} mock interview questions for a "${targetRole}" role, experience level "${user.experienceLevel}". Mix technical, behavioral, and one HR question. Return ONLY a numbered list, no extra text.
Context: ${context.join(' ')}`;

    const raw = await askGranite(prompt, { maxNewTokens: 400, temperature: 0.7 });
    const questions = raw
      .split(/\n+/)
      .map((l) => l.replace(/^\s*\d+[\.\)]\s*/, '').trim())
      .filter((l) => l.length > 3)
      .slice(0, numQuestions);

    const mockId = uuidv4();
    const mock = {
      id: mockId,
      userId: req.userId,
      role: targetRole,
      questions,
      answers: [],
      status: 'in_progress',
      createdAt: new Date().toISOString(),
    };
    db.get('reports').push(mock).write();

    res.json({ mockId, questions, currentIndex: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- MOCK INTERVIEW: SUBMIT ANSWER FOR CURRENT QUESTION ----------
router.post('/mock/:id/answer', authRequired, async (req, res) => {
  try {
    const { answer } = req.body;
    const mock = db.get('reports').find({ id: req.params.id, userId: req.userId }).value();
    if (!mock) return res.status(404).json({ error: 'Mock interview not found.' });

    const currentIndex = mock.answers.length;
    const question = mock.questions[currentIndex];
    if (!question) return res.status(400).json({ error: 'No more questions in this mock interview.' });

    const prompt = `You are evaluating a candidate's mock interview answer.
Question: "${question}"
Candidate's answer: "${answer}"

Evaluate on these 5 parameters, each scored 0-10: Clarity, Confidence, Technical Accuracy, Communication, Structure.
Then give 2-3 sentences of specific, honest, constructive feedback (no fake praise).

Respond in EXACTLY this format:
Clarity: <score>
Confidence: <score>
Technical Accuracy: <score>
Communication: <score>
Structure: <score>
Feedback: <feedback text>`;

    const raw = await askGranite(prompt, { maxNewTokens: 350, temperature: 0.4 });

    const scores = {};
    const scoreRegex = /(Clarity|Confidence|Technical Accuracy|Communication|Structure):\s*(\d+)/gi;
    let m;
    while ((m = scoreRegex.exec(raw)) !== null) {
      scores[m[1]] = parseInt(m[2], 10);
    }
    const feedbackMatch = raw.match(/Feedback:\s*([\s\S]*)/i);
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : raw.trim();

    const entry = { question, answer, scores, feedback, ts: new Date().toISOString() };
    db.get('reports').find({ id: req.params.id }).get('answers').push(entry).write();

    const updatedMock = db.get('reports').find({ id: req.params.id }).value();
    const isComplete = updatedMock.answers.length >= updatedMock.questions.length;

    if (isComplete) {
      const allScores = updatedMock.answers.flatMap((a) => Object.values(a.scores));
      const overall = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 10) : 0;
      db.get('reports').find({ id: req.params.id }).assign({ status: 'complete', overallScore: overall }).write();

      const user = withUser(req);
      db.get('users').find({ id: req.userId }).get('stats').assign({
        mockInterviews: (user.stats.mockInterviews || 0) + 1,
        confidenceScore: Math.round((user.stats.confidenceScore + overall) / 2),
      }).write();
    }

    res.json({
      entry,
      nextIndex: updatedMock.answers.length,
      totalQuestions: updatedMock.questions.length,
      isComplete,
      nextQuestion: isComplete ? null : updatedMock.questions[updatedMock.answers.length],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- MOCK INTERVIEW: GET REPORT ----------
router.get('/mock/:id', authRequired, (req, res) => {
  const mock = db.get('reports').find({ id: req.params.id, userId: req.userId }).value();
  if (!mock) return res.status(404).json({ error: 'Mock interview not found.' });
  res.json({ mock });
});

router.get('/mock', authRequired, (req, res) => {
  const mocks = db.get('reports').filter({ userId: req.userId }).sortBy('createdAt').reverse().value();
  res.json({ mocks });
});

// ---------- STUDY PLAN GENERATOR ----------
router.post('/study-plan', authRequired, async (req, res) => {
  try {
    const { durationDays = 30, hoursPerDay = 2, targetCompany = '' } = req.body;
    const user = withUser(req);
    const context = retrieve(`study plan roadmap ${user.targetRole} ${targetCompany}`, 3);

    const prompt = `Create a ${durationDays}-day interview preparation study plan for a candidate targeting the role "${user.targetRole || 'Software Engineer'}"${targetCompany ? ` at ${targetCompany}` : ''}, experience level "${user.experienceLevel}", with ${hoursPerDay} hours/day available.

Context:
${context.join('\n')}

Structure the plan into weekly blocks (Week 1, Week 2, ...). For each week give 3-5 bullet points covering: topics to study, practice tasks, and one revision/mock-test checkpoint. Keep it concise and actionable. No long paragraphs.`;

    const plan = await askGranite(prompt, { maxNewTokens: 800, temperature: 0.6 });
    res.json({ durationDays, hoursPerDay, targetCompany, plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;