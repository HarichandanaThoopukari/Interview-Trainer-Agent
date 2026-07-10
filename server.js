require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const interviewRoutes = require('./routes/interview');
const resumeRoutes = require('./routes/resume');
const bookmarkRoutes = require('./routes/bookmarks');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve the frontend (static dark-themed dashboard/chat UI)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    watsonxConfigured: Boolean(process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID),
    model: process.env.WATSONX_MODEL_ID,
    time: new Date().toISOString(),
  });
});

// Fallback to index.html for any non-API route (simple SPA-style routing)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Interview Trainer Agent running at http://localhost:${PORT}`);
  console.log(`   watsonx model: ${process.env.WATSONX_MODEL_ID}`);
  console.log(`   watsonx configured: ${Boolean(process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID)}\n`);
});
