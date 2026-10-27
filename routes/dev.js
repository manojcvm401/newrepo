import express from 'express';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { roleRequired } from '../middleware/roles.js';
import { checkAndExpireDonations } from '../services/expiryService.js';

const router = express.Router();

// POST /api/dev/advance-hours (Admin only)
router.post('/advance-hours', authRequired, roleRequired('Admin'), (req, res) => {
  const hours = Number(req.body.hours || 1);
  if (isNaN(hours) || hours <= 0) {
    return res.status(400).json({ error: 'Valid positive hours count required.' });
  }

  const shiftMs = hours * 3600 * 1000;

  // Retrieve active donations
  const active = db.prepare(`
    SELECT id, expires_at 
    FROM donations 
    WHERE status NOT IN ('Delivered', 'Expired')
  `).all();

  const updateExpiry = db.prepare('UPDATE donations SET expires_at = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const d of active) {
      const currentExpiryMs = new Date(d.expires_at).getTime();
      const newExpiryIso = new Date(currentExpiryMs - shiftMs).toISOString();
      updateExpiry.run(newExpiryIso, d.id);
    }
  });
  tx();

  // Run expiry rules to update statuses and push notifications if expired/urgent
  checkAndExpireDonations(db);

  res.json({
    message: `Simulated ${hours} hour(s) passing — expiry times and priority rankings updated.`,
    updated_count: active.length
  });
});

export default router;
