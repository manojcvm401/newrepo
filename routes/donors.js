import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { roleRequired } from '../middleware/roles.js';

const router = express.Router();

// GET /api/donors (Admin sees all; Donor sees self)
router.get('/', authRequired, (req, res) => {
  const { search = '' } = req.query;
  const q = `%${search.trim().toLowerCase()}%`;

  if (req.user.role === 'Donor') {
    const donor = db.prepare(`
      SELECT id, name, phone, type, status, email 
      FROM donors 
      WHERE id = ?
    `).get(req.user.id);
    return res.json(donor ? [donor] : []);
  }

  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Access denied: only admins can view the donor directory.' });
  }

  const donors = db.prepare(`
    SELECT id, name, phone, type, status, email 
    FROM donors 
    WHERE lower(name) LIKE ? OR lower(id) LIKE ? OR lower(phone) LIKE ?
    ORDER BY id ASC
  `).all(q, q, q);

  res.json(donors);
});

// GET /api/donors/:id
router.get('/:id', authRequired, (req, res) => {
  const { id } = req.params;

  if (req.user.role === 'Donor' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied: you can only view your own donor profile.' });
  }

  const donor = db.prepare(`
    SELECT id, name, phone, type, status, email 
    FROM donors 
    WHERE id = ?
  `).get(id);

  if (!donor) {
    return res.status(404).json({ error: 'Donor not found.' });
  }

  const donations = db.prepare(`
    SELECT id, food_name, quantity, status, created_at, expires_at 
    FROM donations 
    WHERE donor_id = ? 
    ORDER BY created_at DESC
  `).all(id);

  res.json({ ...donor, donations });
});

// POST /api/donors (Admin only)
router.post('/', authRequired, roleRequired('Admin'), (req, res) => {
  const { id, name, phone, type, email, password } = req.body;

  if (!name || !name.trim() || !phone || !phone.trim() || !type) {
    return res.status(400).json({ error: 'Name, phone, and donor type are required.' });
  }

  const validTypes = ['Hotel', 'Restaurant', 'Hostel', 'Event Organizer'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid donor type. Must be one of: ${validTypes.join(', ')}` });
  }

  const cleanPhone = phone.trim().replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Phone number must be at least 10 digits.' });
  }

  const cleanEmail = email ? email.trim().toLowerCase() : null;
  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Login email and password are required for donor accounts.' });
  }

  const existingEmail = db.prepare('SELECT id FROM donors WHERE lower(email) = ?').get(cleanEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'That email is already registered to another donor.' });
  }

  let donorId = id ? id.trim() : null;
  if (!donorId) {
    const count = db.prepare('SELECT COUNT(*) AS total FROM donors').get().total;
    donorId = `D-${101 + count}`;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO donors (id, name, phone, type, status, email, password_hash)
    VALUES (?, ?, ?, ?, 'Active', ?, ?)
  `).run(donorId, name.trim(), phone.trim(), type, cleanEmail, passwordHash);

  db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('🏨', `New donor "${name.trim()}" (${donorId}) registered.`);

  res.status(201).json({
    id: donorId,
    name: name.trim(),
    phone: phone.trim(),
    type,
    status: 'Active',
    email: cleanEmail
  });
});

// PUT /api/donors/:id (Admin only)
router.put('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, phone, type, email, password, status } = req.body;

  const donor = db.prepare('SELECT * FROM donors WHERE id = ?').get(id);
  if (!donor) {
    return res.status(404).json({ error: 'Donor not found.' });
  }

  if (name && !name.trim()) return res.status(400).json({ error: 'Donor name cannot be empty.' });
  if (phone && phone.trim().replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Phone number must be at least 10 digits.' });
  }

  let cleanEmail = donor.email;
  if (email && email.trim()) {
    cleanEmail = email.trim().toLowerCase();
    const clash = db.prepare('SELECT id FROM donors WHERE lower(email) = ? AND id != ?').get(cleanEmail, id);
    if (clash) {
      return res.status(409).json({ error: 'That login email is already in use by another donor.' });
    }
  }

  const newHash = password && password.trim() ? bcrypt.hashSync(password.trim(), 10) : donor.password_hash;
  const newStatus = status ? status : donor.status;

  db.prepare(`
    UPDATE donors 
    SET name = ?, phone = ?, type = ?, email = ?, password_hash = ?, status = ?
    WHERE id = ?
  `).run(
    name ? name.trim() : donor.name,
    phone ? phone.trim() : donor.phone,
    type ? type : donor.type,
    cleanEmail,
    newHash,
    newStatus,
    id
  );

  res.json({
    id,
    name: name ? name.trim() : donor.name,
    phone: phone ? phone.trim() : donor.phone,
    type: type ? type : donor.type,
    email: cleanEmail,
    status: newStatus
  });
});

// PATCH /api/donors/:id/status (Admin only)
router.patch('/:id/status', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Active or Inactive.' });
  }

  const donor = db.prepare('SELECT * FROM donors WHERE id = ?').get(id);
  if (!donor) return res.status(404).json({ error: 'Donor not found.' });

  db.prepare('UPDATE donors SET status = ? WHERE id = ?').run(status, id);

  res.json({ id, status, message: `Donor status updated to ${status}.` });
});

// DELETE /api/donors/:id (Admin only)
router.delete('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const donor = db.prepare('SELECT * FROM donors WHERE id = ?').get(id);
  if (!donor) return res.status(404).json({ error: 'Donor not found.' });

  // Soft/foreign key handle: set donor_id to NULL on existing donations
  db.prepare('UPDATE donations SET donor_id = NULL WHERE donor_id = ?').run(id);
  db.prepare('DELETE FROM donors WHERE id = ?').run(id);

  db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('🗑', `Donor "${donor.name}" (${id}) was deleted by admin.`);

  res.json({ message: 'Donor deleted successfully.' });
});

export default router;
