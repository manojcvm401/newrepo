import express from 'express';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// GET /api/notifications
router.get('/', authRequired, (req, res) => {
  const notifs = db.prepare(`
    SELECT * FROM notifications 
    ORDER BY id DESC 
    LIMIT 50
  `).all();
  res.json(notifs);
});

// DELETE /api/notifications/:id
router.delete('/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.json({ message: 'Notification dismissed.' });
});

// DELETE /api/notifications (clear all)
router.delete('/', authRequired, (req, res) => {
  db.prepare('DELETE FROM notifications').run();
  res.json({ message: 'All notifications cleared.' });
});

export default router;
