import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { roleRequired } from '../middleware/roles.js';

const router = express.Router();

// GET /api/volunteers
router.get('/', authRequired, (req, res) => {
  const { search = '' } = req.query;
  const q = `%${search.trim().toLowerCase()}%`;

  if (req.user.role === 'Volunteer') {
    const me = db.prepare('SELECT id, name, phone, availability, status, email FROM volunteers WHERE id = ?').get(req.user.id);
    return res.json(me ? [me] : []);
  }

  const volunteers = db.prepare(`
    SELECT id, name, phone, availability, status, email 
    FROM volunteers 
    WHERE lower(name) LIKE ? OR lower(id) LIKE ? OR lower(phone) LIKE ?
    ORDER BY id ASC
  `).all(q, q, q);

  res.json(volunteers);
});

// GET /api/volunteers/:id
router.get('/:id', authRequired, (req, res) => {
  const { id } = req.params;
  const vol = db.prepare('SELECT id, name, phone, availability, status, email FROM volunteers WHERE id = ?').get(id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found.' });

  const tasks = db.prepare(`
    SELECT id, food_name, quantity, status, pickup_location, expires_at 
    FROM donations 
    WHERE volunteer_id = ?
    ORDER BY created_at DESC
  `).all(id);

  res.json({ ...vol, tasks });
});

// POST /api/volunteers (Admin only)
router.post('/', authRequired, roleRequired('Admin'), (req, res) => {
  const { id, name, phone, availability, email, password } = req.body;

  if (!name || !name.trim() || !phone || !phone.trim()) {
    return res.status(400).json({ error: 'Volunteer name and phone number are required.' });
  }

  const validAvail = ['Available', 'Weekdays only', 'Weekends only', 'Unavailable'];
  const avail = availability && validAvail.includes(availability) ? availability : 'Available';

  const cleanPhone = phone.trim().replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Phone number must be at least 10 digits.' });
  }

  const cleanEmail = email ? email.trim().toLowerCase() : null;
  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Login email and password are required for volunteer accounts.' });
  }

  const existingEmail = db.prepare('SELECT id FROM volunteers WHERE lower(email) = ?').get(cleanEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'That email is already registered to another volunteer.' });
  }

  let volId = id ? id.trim() : null;
  if (!volId) {
    const count = db.prepare('SELECT COUNT(*) AS total FROM volunteers').get().total;
    volId = `V-${301 + count}`;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO volunteers (id, name, phone, availability, status, email, password_hash)
    VALUES (?, ?, ?, ?, 'Free', ?, ?)
  `).run(volId, name.trim(), phone.trim(), avail, cleanEmail, passwordHash);

  db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('🚲', `New volunteer "${name.trim()}" (${volId}) added.`);

  res.status(201).json({
    id: volId,
    name: name.trim(),
    phone: phone.trim(),
    availability: avail,
    status: 'Free',
    email: cleanEmail
  });
});

// PUT /api/volunteers/:id (Admin only)
router.put('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, phone, availability, email, password, status } = req.body;

  const vol = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found.' });

  if (name && !name.trim()) return res.status(400).json({ error: 'Volunteer name cannot be empty.' });
  if (phone && phone.trim().replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Phone number must be at least 10 digits.' });
  }

  let cleanEmail = vol.email;
  if (email && email.trim()) {
    cleanEmail = email.trim().toLowerCase();
    const clash = db.prepare('SELECT id FROM volunteers WHERE lower(email) = ? AND id != ?').get(cleanEmail, id);
    if (clash) {
      return res.status(409).json({ error: 'That login email is already in use by another volunteer.' });
    }
  }

  const newHash = password && password.trim() ? bcrypt.hashSync(password.trim(), 10) : vol.password_hash;
  const newStatus = status ? status : vol.status;
  const newAvail = availability ? availability : vol.availability;

  db.prepare(`
    UPDATE volunteers 
    SET name = ?, phone = ?, availability = ?, email = ?, password_hash = ?, status = ?
    WHERE id = ?
  `).run(
    name ? name.trim() : vol.name,
    phone ? phone.trim() : vol.phone,
    newAvail,
    cleanEmail,
    newHash,
    newStatus,
    id
  );

  res.json({
    id,
    name: name ? name.trim() : vol.name,
    phone: phone ? phone.trim() : vol.phone,
    availability: newAvail,
    email: cleanEmail,
    status: newStatus
  });
});

// DELETE /api/volunteers/:id (Admin only)
router.delete('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const vol = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found.' });

  db.prepare('UPDATE donations SET volunteer_id = NULL WHERE volunteer_id = ?').run(id);
  db.prepare('DELETE FROM volunteers WHERE id = ?').run(id);

  db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('🗑', `Volunteer "${vol.name}" (${id}) was deleted.`);

  res.json({ message: 'Volunteer deleted successfully.' });
});

export default router;
