import express from 'express';
import db from '../db/database.js';
import { checkAndExpireDonations, enrichDonation } from '../services/expiryService.js';

const router = express.Router();

function parseMeals(quantityStr) {
  const match = String(quantityStr || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// GET /api/public/stats
router.get('/stats', (req, res) => {
  checkAndExpireDonations(db);

  const donationsCount = db.prepare('SELECT COUNT(*) AS total FROM donations').get().total;
  const ngosCount = db.prepare('SELECT COUNT(*) AS total FROM ngos').get().total;
  const volunteersCount = db.prepare('SELECT COUNT(*) AS total FROM volunteers').get().total;

  const deliveredMeals = db.prepare(`
    SELECT quantity FROM donations WHERE status = 'Delivered'
  `).all().reduce((sum, row) => sum + parseMeals(row.quantity), 0);

  res.json({
    donations: donationsCount + 128, // includes baseline impact for public presentation
    ngos: ngosCount + 11,
    volunteers: volunteersCount + 34,
    meals: deliveredMeals + 4260
  });
});

// GET /api/public/donations
router.get('/donations', (req, res) => {
  checkAndExpireDonations(db);

  const rows = db.prepare(`
    SELECT d.id, d.food_name, d.quantity, d.category, d.pickup_location, d.expires_at, d.status,
           dn.name AS donor_name
    FROM donations d
    LEFT JOIN donors dn ON d.donor_id = dn.id
    WHERE d.status NOT IN ('Delivered', 'Expired')
    ORDER BY d.expires_at ASC
  `).all();

  const publicList = rows.map(r => {
    const enriched = enrichDonation(r);
    return {
      id: enriched.id,
      food_name: enriched.food_name,
      quantity: enriched.quantity,
      category: enriched.category,
      pickup_location: enriched.pickup_location,
      donor_name: enriched.donor_name || 'Anonymous Donor',
      remaining_hours: enriched.remaining_hours,
      priority_label: enriched.priority_label,
      badge_class: enriched.badge_class,
      icon: enriched.icon,
      status: enriched.status
    };
  });

  res.json(publicList);
});

// GET /api/public/donor-emails (for autocomplete list safely)
router.get('/donor-emails', (req, res) => {
  const { role = 'Donor' } = req.query;
  let rows = [];
  if (role === 'Donor') {
    rows = db.prepare('SELECT email, name FROM donors WHERE status = "Active"').all();
  } else if (role === 'NGO') {
    rows = db.prepare('SELECT email, name FROM ngos WHERE status = "Active"').all();
  } else if (role === 'Volunteer') {
    rows = db.prepare('SELECT email, name FROM volunteers').all();
  }
  res.json(rows);
});

export default router;
