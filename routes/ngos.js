import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { roleRequired } from '../middleware/roles.js';

const router = express.Router();

// GET /api/ngos
router.get('/', authRequired, (req, res) => {
  const { search = '' } = req.query;
  const q = `%${search.trim().toLowerCase()}%`;

  if (req.user.role === 'NGO') {
    const me = db.prepare('SELECT id, name, location, contact, status, email FROM ngos WHERE id = ?').get(req.user.id);
    return res.json(me ? [me] : []);
  }

  const ngos = db.prepare(`
    SELECT id, name, location, contact, status, email 
    FROM ngos 
    WHERE lower(name) LIKE ? OR lower(id) LIKE ? OR lower(location) LIKE ?
    ORDER BY id ASC
  `).all(q, q, q);

  res.json(ngos);
});

// GET /api/ngos/:id
router.get('/:id', authRequired, (req, res) => {
  const { id } = req.params;
  const ngo = db.prepare('SELECT id, name, location, contact, status, email FROM ngos WHERE id = ?').get(id);
  if (!ngo) return res.status(404).json({ error: 'NGO not found.' });

  const donations = db.prepare(`
    SELECT id, food_name, quantity, status, created_at, expires_at 
    FROM donations 
    WHERE ngo_id = ?
    ORDER BY created_at DESC
  `).all(id);

  res.json({ ...ngo, donations });
});

// POST /api/ngos (Admin only)
router.post('/', authRequired, roleRequired('Admin'), (req, res) => {
  const { id, name, location, contact, email, password } = req.body;

  if (!name || !name.trim() || !location || !location.trim() || !contact || !contact.trim()) {
    return res.status(400).json({ error: 'NGO name, location, and contact number are required.' });
  }

  const cleanContact = contact.trim().replace(/\D/g, '');
  if (cleanContact.length < 10) {
    return res.status(400).json({ error: 'Contact number must be at least 10 digits.' });
  }

  const cleanEmail = email ? email.trim().toLowerCase() : null;
  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Login email and password are required for NGO accounts.' });
  }

  const existingEmail = db.prepare('SELECT id FROM ngos WHERE lower(email) = ?').get(cleanEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'That email is already registered to another NGO.' });
  }

  let ngoId = id ? id.trim() : null;
  if (!ngoId) {
    const count = db.prepare('SELECT COUNT(*) AS total FROM ngos').get().total;
    ngoId = `N-${201 + count}`;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO ngos (id, name, location, contact, status, email, password_hash)
    VALUES (?, ?, ?, ?, 'Active', ?, ?)
  `).run(ngoId, name.trim(), location.trim(), contact.trim(), cleanEmail, passwordHash);

  db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('🤝', `New NGO "${name.trim()}" (${ngoId}) added.`);

  res.status(201).json({
    id: ngoId,
    name: name.trim(),
    location: location.trim(),
    contact: contact.trim(),
    status: 'Active',
    email: cleanEmail
  });
});

// PUT /api/ngos/:id (Admin only)
router.put('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, location, contact, email, password, status } = req.body;

  const ngo = db.prepare('SELECT * FROM ngos WHERE id = ?').get(id);
  if (!ngo) return res.status(404).json({ error: 'NGO not found.' });

  if (name && !name.trim()) return res.status(400).json({ error: 'NGO name cannot be empty.' });
  if (location && !location.trim()) return res.status(400).json({ error: 'Location cannot be empty.' });
  if (contact && contact.trim().replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Contact number must be at least 10 digits.' });
  }

  let cleanEmail = ngo.email;
  if (email && email.trim()) {
    cleanEmail = email.trim().toLowerCase();
    const clash = db.prepare('SELECT id FROM ngos WHERE lower(email) = ? AND id != ?').get(cleanEmail, id);
    if (clash) {
      return res.status(409).json({ error: 'That login email is already in use by another NGO.' });
    }
  }

  const newHash = password && password.trim() ? bcrypt.hashSync(password.trim(), 10) : ngo.password_hash;
  const newStatus = status ? status : ngo.status;

  db.prepare(`
    UPDATE ngos 
    SET name = ?, location = ?, contact = ?, email = ?, password_hash = ?, status = ?
    WHERE id = ?
  `).run(
    name ? name.trim() : ngo.name,
    location ? location.trim() : ngo.location,
    contact ? contact.trim() : ngo.contact,
    cleanEmail,
    newHash,
    newStatus,
    id
  );

  res.json({
    id,
    name: name ? name.trim() : ngo.name,
    location: location ? location.trim() : ngo.location,
    contact: contact ? contact.trim() : ngo.contact,
    email: cleanEmail,
    status: newStatus
  });
});

// DELETE /api/ngos/:id (Admin only)
router.delete('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const ngo = db.prepare('SELECT * FROM ngos WHERE id = ?').get(id);
  if (!ngo) return res.status(404).json({ error: 'NGO not found.' });

  db.prepare('UPDATE donations SET ngo_id = NULL WHERE ngo_id = ?').run(id);
  db.prepare('DELETE FROM ngos WHERE id = ?').run(id);

  db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('🗑', `NGO "${ngo.name}" (${id}) was deleted.`);

  res.json({ message: 'NGO deleted successfully.' });
});

export default router;
