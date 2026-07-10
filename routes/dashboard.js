const express = require('express');
const db = require('../db/database');
const authRequired = require('../middleware/auth');

const router = express.Router();

router.get('/overview', authRequired, (req, res) => {
  const user = db.get('users').find({ id: req.userId }).value();
  const mocks = db.get('reports').filter({ userId: req.userId }).value();
  const chats = db.get('chats').filter({ userId: req.userId }).value();
  const bookmarks = db.get('bookmarks').filter({ userId: req.userId }).value();

  const completedMocks = mocks.filter((m) => m.status === 'complete');
  const trend = completedMocks.slice(-10).map((m) => ({ date: m.createdAt, score: m.overallScore || 0 }));

  res.json({
    fullName: user.fullName,
    targetRole: user.targetRole,
    experienceLevel: user.experienceLevel,
    readinessScore: user.readinessScore,
    stats: user.stats,
    strengths: user.strengths || [],
    weaknesses: user.weaknesses || [],
    resumeUploaded: !!user.resume,
    recentChats: chats
      .slice(-5)
      .reverse()
      .map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt })),
    bookmarksCount: bookmarks.length,
    mockInterviews: {
      total: mocks.length,
      completed: completedMocks.length,
      trend,
    },
  });
});

module.exports = router;
