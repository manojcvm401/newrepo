import express from 'express';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { roleRequired } from '../middleware/roles.js';
import { checkAndExpireDonations, enrichDonation, calculateRemainingHours, getExpiryInfo } from '../services/expiryService.js';

const router = express.Router();

function parseMeals(quantityStr) {
  const match = String(quantityStr || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// GET /api/reports/summary
router.get('/summary', authRequired, (req, res) => {
  checkAndExpireDonations(db);

  const totalDonors = db.prepare('SELECT COUNT(*) AS total FROM donors').get().total;
  const totalNgos = db.prepare('SELECT COUNT(*) AS total FROM ngos').get().total;
  const totalVolunteers = db.prepare('SELECT COUNT(*) AS total FROM volunteers').get().total;

  const donations = db.prepare('SELECT * FROM donations').all();
  const totalDonations = donations.length;
  const available = donations.filter(d => d.status === 'Available').length;
  const matched = donations.filter(d => d.status === 'Matched').length;
  const inProgress = donations.filter(d => d.status === 'Matched' || d.status === 'Volunteer Assigned').length;
  const delivered = donations.filter(d => d.status === 'Delivered').length;
  const expired = donations.filter(d => d.status === 'Expired').length;

  const mealsDelivered = donations
    .filter(d => d.status === 'Delivered')
    .reduce((sum, d) => sum + parseMeals(d.quantity), 0);

  res.json({
    donors: totalDonors,
    ngos: totalNgos,
    volunteers: totalVolunteers,
    donations: totalDonations,
    available,
    matched,
    in_progress: inProgress,
    delivered,
    expired,
    meals_delivered: mealsDelivered
  });
});

// GET /api/reports/by-donor-type
router.get('/by-donor-type', authRequired, (req, res) => {
  const types = ['Hotel', 'Restaurant', 'Hostel', 'Event Organizer'];
  const result = {};
  types.forEach(t => { result[t] = 0; });

  const rows = db.prepare(`
    SELECT dn.type, COUNT(d.id) AS count
    FROM donations d
    JOIN donors dn ON d.donor_id = dn.id
    GROUP BY dn.type
  `).all();

  rows.forEach(r => {
    if (r.type) result[r.type] = r.count;
  });

  res.json(result);
});

// GET /api/reports/by-status
router.get('/by-status', authRequired, (req, res) => {
  checkAndExpireDonations(db);
  const statuses = ['Available', 'Matched', 'Volunteer Assigned', 'Delivered', 'Expired'];
  const result = {};
  statuses.forEach(s => { result[s] = 0; });

  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count 
    FROM donations 
    GROUP BY status
  `).all();

  rows.forEach(r => {
    if (result[r.status] !== undefined) result[r.status] = r.count;
  });

  res.json(result);
});

// GET /api/reports/by-priority
router.get('/by-priority', authRequired, (req, res) => {
  checkAndExpireDonations(db);
  const donations = db.prepare('SELECT * FROM donations WHERE status != "Delivered"').all();
  const result = {
    'Expired': 0,
    'Urgent': 0,
    'Donate Soon': 0,
    'Safe to Donate': 0
  };

  donations.forEach(d => {
    const rem = calculateRemainingHours(d.expires_at);
    if (rem <= 0 || d.status === 'Expired') result['Expired']++;
    else if (rem <= 2) result['Urgent']++;
    else if (rem <= 6) result['Donate Soon']++;
    else result['Safe to Donate']++;
  });

  res.json(result);
});

// GET /api/reports/export.csv
router.get('/export.csv', authRequired, (req, res) => {
  checkAndExpireDonations(db);

  const donations = db.prepare(`
    SELECT d.*, 
           dn.name AS donor_name,
           n.name AS ngo_name,
           v.name AS volunteer_name
    FROM donations d
    LEFT JOIN donors dn ON d.donor_id = dn.id
    LEFT JOIN ngos n ON d.ngo_id = n.id
    LEFT JOIN volunteers v ON d.volunteer_id = v.id
    ORDER BY d.created_at DESC
  `).all();

  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const header = ['ID', 'Food', 'Quantity', 'Donor', 'Category', 'Pickup Location', 'Expiry (Hours Left)', 'Priority', 'Status', 'NGO', 'Volunteer', 'Created At'];

  const rows = [header.map(q).join(',')];

  donations.forEach(d => {
    const rem = calculateRemainingHours(d.expires_at);
    const info = getExpiryInfo(rem);
    rows.push([
      d.id,
      d.food_name,
      d.quantity,
      d.donor_name || '—',
      d.category,
      d.pickup_location,
      rem,
      info.label,
      d.status,
      d.ngo_name || '—',
      d.volunteer_name || '—',
      d.created_at
    ].map(q).join(','));
  });

  const csv = rows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="foodconnect-donations-report.csv"');
  res.send(csv);
});

export default router;
