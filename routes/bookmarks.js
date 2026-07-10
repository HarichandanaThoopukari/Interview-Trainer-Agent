const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const authRequired = require('../middleware/auth');

const router = express.Router();

// type: question | answer | study_plan | note | coding_problem
router.post('/', authRequired, (req, res) => {
  const { type = 'note', title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content are required.' });

  const bookmark = {
    id: uuidv4(),
    userId: req.userId,
    type,
    title,
    content,
    createdAt: new Date().toISOString(),
  };
  db.get('bookmarks').push(bookmark).write();
  res.json({ bookmark });
});

router.get('/', authRequired, (req, res) => {
  const bookmarks = db.get('bookmarks').filter({ userId: req.userId }).sortBy('createdAt').reverse().value();
  res.json({ bookmarks });
});

router.delete('/:id', authRequired, (req, res) => {
  db.get('bookmarks').remove({ id: req.params.id, userId: req.userId }).write();
  res.json({ success: true });
});

module.exports = router;
