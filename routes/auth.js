import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'foodconnect_secure_jwt_secret_key_college_project_2026';

router.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Please provide email, password, and role.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  let user = null;

  if (role === 'Admin') {
    user = db.prepare('SELECT * FROM admins WHERE lower(email) = ?').get(cleanEmail);
  } else if (role === 'Donor') {
    user = db.prepare('SELECT * FROM donors WHERE lower(email) = ?').get(cleanEmail);
  } else if (role === 'NGO') {
    user = db.prepare('SELECT * FROM ngos WHERE lower(email) = ?').get(cleanEmail);
  } else if (role === 'Volunteer') {
    user = db.prepare('SELECT * FROM volunteers WHERE lower(email) = ?').get(cleanEmail);
  } else {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }

  if (!user) {
    return res.status(401).json({ error: `No ${role} account matches that email address.` });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  if (user.status && user.status === 'Inactive') {
    return res.status(403).json({ error: 'This account has been deactivated by the admin. Contact FoodConnect support.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      status: user.status || 'Active'
    }
  });
});

router.get('/me', authRequired, (req, res) => {
  const { id, role } = req.user;
  let record = null;

  if (role === 'Admin') {
    record = db.prepare('SELECT id, name, email FROM admins WHERE id = ?').get(id);
  } else if (role === 'Donor') {
    record = db.prepare('SELECT id, name, phone, type, status, email FROM donors WHERE id = ?').get(id);
  } else if (role === 'NGO') {
    record = db.prepare('SELECT id, name, location, contact, status, email FROM ngos WHERE id = ?').get(id);
  } else if (role === 'Volunteer') {
    record = db.prepare('SELECT id, name, phone, availability, status, email FROM volunteers WHERE id = ?').get(id);
  }

  if (!record) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  res.json({ ...record, role });
});

router.post('/change-password', authRequired, (req, res) => {
  const { current_password, new_password } = req.body;
  const { id, role } = req.user;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  }

  let table = 'donors';
  if (role === 'Admin') table = 'admins';
  else if (role === 'NGO') table = 'ngos';
  else if (role === 'Volunteer') table = 'volunteers';

  const user = db.prepare(`SELECT password_hash FROM ${table} WHERE id = ?`).get(id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare(`UPDATE ${table} SET password_hash = ? WHERE id = ?`).run(newHash, id);

  res.json({ message: 'Password updated successfully.' });
});

export default router;
