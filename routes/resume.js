const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const authRequired = require('../middleware/auth');
const { generateText } = require('../config/watsonx');

const router = express.Router();

// Use /tmp on serverless platforms (Vercel) since only that path is writable there.
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${req.userId}-${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.docx', '.txt'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PDF, DOCX, or TXT resumes are supported.'), ok);
  },
});

const COMMON_KEYWORDS = [
  'javascript', 'python', 'java', 'react', 'node', 'sql', 'aws', 'docker', 'kubernetes',
  'git', 'api', 'rest', 'agile', 'communication', 'leadership', 'teamwork', 'problem solving',
  'machine learning', 'data structures', 'algorithms', 'html', 'css', 'typescript', 'mongodb',
  'ci/cd', 'testing', 'project', 'internship',
];

async function extractText(filePath, ext) {
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  // .txt and best-effort fallback for .docx (raw read; for full docx parsing use the docx skill in a real deployment)
  return fs.readFileSync(filePath, 'utf8').toString();
}

function basicAtsScore(text) {
  const lower = text.toLowerCase();
  const found = COMMON_KEYWORDS.filter((k) => lower.includes(k));
  const missing = COMMON_KEYWORDS.filter((k) => !lower.includes(k));

  const hasSections = ['experience', 'education', 'skills', 'project'].filter((s) => lower.includes(s)).length;
  const lengthScore = Math.min(text.length / 3000, 1) * 20; // reward substantial content, cap at 20
  const keywordScore = (found.length / COMMON_KEYWORDS.length) * 50;
  const sectionScore = (hasSections / 4) * 30;

  const score = Math.round(Math.min(lengthScore + keywordScore + sectionScore, 100));

  return { score, foundKeywords: found, missingKeywords: missing.slice(0, 10), sectionsDetected: hasSections };
}

router.post('/upload', authRequired, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const text = await extractText(req.file.path, ext);
    const ats = basicAtsScore(text);

    const user = db.get('users').find({ id: req.userId }).value();

    const prompt = `You are a resume reviewer for a candidate targeting "${user.targetRole || 'Software Engineer'}".
Here is their resume text (may be imperfectly extracted):
"""
${text.slice(0, 3000)}
"""

Their auto-computed ATS score is ${ats.score}/100. Keywords found: ${ats.foundKeywords.join(', ') || 'none'}. Likely missing: ${ats.missingKeywords.join(', ') || 'none'}.

Respond in EXACTLY this format:
Strengths: <2-3 bullet points, separated by " | ">
Weaknesses: <2-3 bullet points, separated by " | ">
Suggestions: <3 concrete, specific improvement suggestions, separated by " | ">`;

    let aiReview = { strengths: [], weaknesses: [], suggestions: [] };
    try {
      const raw = await generateText(prompt, { maxNewTokens: 500, temperature: 0.5 });
      const strengths = raw.match(/Strengths:\s*(.*)/i)?.[1]?.split('|').map((s) => s.trim()).filter(Boolean) || [];
      const weaknesses = raw.match(/Weaknesses:\s*(.*)/i)?.[1]?.split('|').map((s) => s.trim()).filter(Boolean) || [];
      const suggestions = raw.match(/Suggestions:\s*(.*)/i)?.[1]?.split('|').map((s) => s.trim()).filter(Boolean) || [];
      aiReview = { strengths, weaknesses, suggestions };
    } catch (aiErr) {
      console.warn('watsonx review failed, continuing with ATS-only result:', aiErr.message);
    }

    const resumeData = {
      fileName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      ats,
      review: aiReview,
    };

    db.get('users').find({ id: req.userId }).assign({
      resume: resumeData,
      readinessScore: Math.round((ats.score + (user.readinessScore || 40)) / 2),
      strengths: aiReview.strengths,
      weaknesses: aiReview.weaknesses,
    }).write();

    res.json({ resume: resumeData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to analyze resume.' });
  }
});

router.get('/', authRequired, (req, res) => {
  const user = db.get('users').find({ id: req.userId }).value();
  res.json({ resume: user.resume || null });
});

module.exports = router;
