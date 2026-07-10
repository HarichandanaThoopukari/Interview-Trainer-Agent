const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const authRequired = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// SIGNUP
router.post('/signup', (req, res) => {
  const { fullName, email, password, experienceLevel, targetRole, industry, skills, preferredLanguage } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email and password are required.' });
  }

  const existing = db.get('users').find({ email: email.toLowerCase() }).value();
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const user = {
    id: uuidv4(),
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    experienceLevel: experienceLevel || 'Fresher',
    targetRole: targetRole || '',
    industry: industry || '',
    skills: skills || '',
    preferredLanguage: preferredLanguage || 'English',
    resume: null,
    readinessScore: 40,
    strengths: [],
    weaknesses: [],
    stats: { questionsPracticed: 0, mockInterviews: 0, codingTests: 0, confidenceScore: 50 },
    createdAt: new Date().toISOString(),
  };

  db.get('users').push(user).write();

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

// LOGIN
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.get('users').find({ email: (email || '').toLowerCase() }).value();

  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

// FORGOT PASSWORD (demo-safe: resets to a temp password, no email service required)
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const user = db.get('users').find({ email: (email || '').toLowerCase() }).value();

  if (!user) {
    return res.status(404).json({ error: 'No account found with that email.' });
  }

  const tempPassword = Math.random().toString(36).slice(-8);
  db.get('users')
    .find({ email: user.email })
    .assign({ passwordHash: bcrypt.hashSync(tempPassword, 10) })
    .write();

  // In production, email this instead of returning it directly.
  res.json({ message: 'Password reset. Use this temporary password to log in, then change it in Profile.', tempPassword });
});

// GET PROFILE
router.get('/me', authRequired, (req, res) => {
  const user = db.get('users').find({ id: req.userId }).value();
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(user) });
});

// UPDATE PROFILE / ONBOARDING
router.put('/me', authRequired, (req, res) => {
  const allowed = ['fullName', 'experienceLevel', 'targetRole', 'industry', 'skills', 'preferredLanguage'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  db.get('users').find({ id: req.userId }).assign(updates).write();
  const user = db.get('users').find({ id: req.userId }).value();
  res.json({ user: publicUser(user) });
});

module.exports = router;
