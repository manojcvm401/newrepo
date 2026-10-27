import express from 'express';
import db from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { roleRequired } from '../middleware/roles.js';
import { checkAndExpireDonations, enrichDonation, calculateRemainingHours } from '../services/expiryService.js';

const router = express.Router();

// Helper to get formatted donation with donor, ngo, volunteer names and expiry info
function getFullDonation(id) {
  const d = db.prepare(`
    SELECT d.*, 
           dn.name AS donor_name, dn.phone AS donor_phone,
           n.name AS ngo_name, n.location AS ngo_location, n.contact AS ngo_contact,
           v.name AS volunteer_name, v.phone AS volunteer_phone
    FROM donations d
    LEFT JOIN donors dn ON d.donor_id = dn.id
    LEFT JOIN ngos n ON d.ngo_id = n.id
    LEFT JOIN volunteers v ON d.volunteer_id = v.id
    WHERE d.id = ?
  `).get(id);

  if (!d) return null;
  return enrichDonation(d);
}

// GET /api/donations/priority
router.get('/priority', authRequired, (req, res) => {
  checkAndExpireDonations(db);

  let query = `
    SELECT d.*, 
           dn.name AS donor_name,
           n.name AS ngo_name,
           v.name AS volunteer_name
    FROM donations d
    LEFT JOIN donors dn ON d.donor_id = dn.id
    LEFT JOIN ngos n ON d.ngo_id = n.id
    LEFT JOIN volunteers v ON d.volunteer_id = v.id
    WHERE d.status NOT IN ('Delivered', 'Expired')
  `;
  const params = [];

  if (req.user.role === 'Donor') {
    query += ` AND d.donor_id = ? `;
    params.push(req.user.id);
  }

  query += ` ORDER BY d.expires_at ASC LIMIT 10`;

  const rows = db.prepare(query).all(...params);
  const enriched = rows.map(enrichDonation);
  res.json(enriched);
});

// GET /api/donations
router.get('/', authRequired, (req, res) => {
  checkAndExpireDonations(db);

  const { search = '', status = 'All' } = req.query;
  const q = `%${search.trim().toLowerCase()}%`;

  let query = `
    SELECT d.*, 
           dn.name AS donor_name, dn.phone AS donor_phone,
           n.name AS ngo_name, n.location AS ngo_location,
           v.name AS volunteer_name, v.phone AS volunteer_phone
    FROM donations d
    LEFT JOIN donors dn ON d.donor_id = dn.id
    LEFT JOIN ngos n ON d.ngo_id = n.id
    LEFT JOIN volunteers v ON d.volunteer_id = v.id
    WHERE (lower(d.food_name) LIKE ? OR lower(d.id) LIKE ? OR lower(coalesce(dn.name, '')) LIKE ?)
  `;
  const params = [q, q, q];

  // Role permissions scoping
  if (req.user.role === 'Donor') {
    query += ` AND d.donor_id = ?`;
    params.push(req.user.id);
  } else if (req.user.role === 'NGO') {
    if (status === 'Available') {
      query += ` AND d.status = 'Available'`;
    } else {
      query += ` AND d.ngo_id = ?`;
      params.push(req.user.id);
    }
  } else if (req.user.role === 'Volunteer') {
    query += ` AND d.volunteer_id = ?`;
    params.push(req.user.id);
  }

  if (status && status !== 'All' && status !== 'Urgent') {
    query += ` AND d.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY d.expires_at ASC`;

  let rows = db.prepare(query).all(...params);
  let enriched = rows.map(enrichDonation);

  if (status === 'Urgent') {
    enriched = enriched.filter(d => d.priority_label.startsWith('URGENT') && d.status !== 'Expired');
  }

  res.json(enriched);
});

// GET /api/donations/:id
router.get('/:id', authRequired, (req, res) => {
  checkAndExpireDonations(db);
  const donation = getFullDonation(req.params.id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  // Access check
  if (req.user.role === 'Donor' && donation.donor_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: you cannot view another donor’s donation.' });
  }

  const timeline = db.prepare('SELECT * FROM donation_timeline WHERE donation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ ...donation, timeline });
});

// GET /api/donations/:id/safety
router.get('/:id/safety', authRequired, (req, res) => {
  checkAndExpireDonations(db);
  const donation = getFullDonation(req.params.id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  const remaining = calculateRemainingHours(donation.expires_at);
  const isExpired = remaining <= 0 || donation.status === 'Expired';

  res.json({
    id: donation.id,
    food_name: donation.food_name,
    quantity: donation.quantity,
    remaining_hours: remaining,
    safety_label: isExpired ? 'EXPIRED — Cannot be donated' : donation.priority_label,
    icon: donation.icon,
    desc: donation.desc,
    status: donation.status,
    donor_name: donation.donor_name || '—',
    pickup_location: donation.pickup_location,
    can_donate: !isExpired && donation.status === 'Available'
  });
});

// GET /api/donations/:id/timeline
router.get('/:id/timeline', authRequired, (req, res) => {
  const steps = db.prepare('SELECT * FROM donation_timeline WHERE donation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json(steps);
});

// POST /api/donations
router.post('/', authRequired, (req, res) => {
  const { food_name, quantity, expiry_hours, category, pickup_location } = req.body;
  let { donor_id } = req.body;

  if (req.user.role === 'Donor') {
    donor_id = req.user.id;
  } else if (req.user.role === 'Admin') {
    if (!donor_id) return res.status(400).json({ error: 'Donor ID is required.' });
  } else {
    return res.status(403).json({ error: 'Only donors or admins can create donations.' });
  }

  const donor = db.prepare('SELECT id, name, status FROM donors WHERE id = ?').get(donor_id);
  if (!donor) return res.status(404).json({ error: 'Donor not found.' });
  if (donor.status !== 'Active') {
    return res.status(400).json({ error: 'Cannot list donations for an inactive donor.' });
  }

  if (!food_name || !food_name.trim()) return res.status(400).json({ error: 'Food name is required.' });
  if (!quantity || !quantity.trim()) return res.status(400).json({ error: 'Quantity is required.' });
  if (expiry_hours === undefined || expiry_hours === null || isNaN(Number(expiry_hours))) {
    return res.status(400).json({ error: 'Valid expiry hours is required.' });
  }

  const validCategories = ['Cooked Meal', 'Bakery', 'Fruits', 'Vegetables', 'Packaged Food', 'Dairy'];
  const cat = category && validCategories.includes(category) ? category : 'Cooked Meal';
  const pickup = pickup_location && pickup_location.trim() ? pickup_location.trim() : 'Pickup location not specified';

  const hours = Number(expiry_hours);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  const status = hours <= 0 ? 'Expired' : 'Available';

  // Generate readable unique donation ID
  const countRow = db.prepare('SELECT COUNT(*) AS total FROM donations').get();
  const donationId = `DN-${501 + countRow.total}`;

  const createTransaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO donations (id, donor_id, food_name, quantity, category, pickup_location, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(donationId, donor_id, food_name.trim(), quantity.trim(), cat, pickup, expiresAt, status);

    const timelineInsert = db.prepare(`
      INSERT INTO donation_timeline (donation_id, step, done, completed_at)
      VALUES (?, ?, ?, ?)
    `);

    timelineInsert.run(donationId, 'Donation Created', 1, now.toISOString());
    timelineInsert.run(donationId, 'Safety Checked', 0, null);
    timelineInsert.run(donationId, 'Matched with NGO', 0, null);
    timelineInsert.run(donationId, 'Volunteer Assigned', 0, null);
    timelineInsert.run(donationId, 'Delivered', 0, null);

    db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run(
      '🍱',
      `New donation "${food_name.trim()}" (${donationId}) added by ${donor.name}.`
    );

    if (hours > 0 && hours <= 2) {
      db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run(
        '⚠',
        `${food_name.trim()} donation expires in ${hours} hour(s) — URGENT.`
      );
    }
  });

  createTransaction();

  const created = getFullDonation(donationId);
  res.status(201).json(created);
});

// PUT /api/donations/:id (edit only while Available)
router.put('/:id', authRequired, (req, res) => {
  const { id } = req.params;
  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  if (req.user.role === 'Donor' && donation.donor_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: you can only edit your own donations.' });
  }

  if (donation.status !== 'Available') {
    return res.status(400).json({ error: `Cannot edit donation once it is in '${donation.status}' status.` });
  }

  const { food_name, quantity, expiry_hours, category, pickup_location, donor_id } = req.body;

  let newDonorId = donation.donor_id;
  if (req.user.role === 'Admin' && donor_id) {
    newDonorId = donor_id;
  }

  let newExpiresAt = donation.expires_at;
  let newStatus = donation.status;

  if (expiry_hours !== undefined && expiry_hours !== null && !isNaN(Number(expiry_hours))) {
    const hours = Number(expiry_hours);
    newExpiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    if (hours <= 0) newStatus = 'Expired';
  }

  db.prepare(`
    UPDATE donations
    SET donor_id = ?, food_name = ?, quantity = ?, category = ?, pickup_location = ?, expires_at = ?, status = ?
    WHERE id = ?
  `).run(
    newDonorId,
    food_name ? food_name.trim() : donation.food_name,
    quantity ? quantity.trim() : donation.quantity,
    category ? category : donation.category,
    pickup_location ? pickup_location.trim() : donation.pickup_location,
    newExpiresAt,
    newStatus,
    id
  );

  res.json(getFullDonation(id));
});

// DELETE /api/donations/:id (Admin only)
router.delete('/:id', authRequired, roleRequired('Admin'), (req, res) => {
  const { id } = req.params;
  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  db.prepare('DELETE FROM donation_timeline WHERE donation_id = ?').run(id);
  db.prepare('DELETE FROM donations WHERE id = ?').run(id);

  res.json({ message: 'Donation deleted successfully.' });
});

// POST /api/donations/:id/match (Admin)
router.post('/:id/match', authRequired, roleRequired('Admin'), (req, res) => {
  checkAndExpireDonations(db);
  const { id } = req.params;
  const { ngo_id } = req.body;

  if (!ngo_id) return res.status(400).json({ error: 'NGO ID is required.' });

  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  const remaining = calculateRemainingHours(donation.expires_at);
  if (donation.status === 'Expired' || remaining <= 0) {
    return res.status(400).json({ error: 'Expired food cannot be matched or assigned.' });
  }
  if (donation.status !== 'Available') {
    return res.status(400).json({ error: `Cannot match donation in '${donation.status}' status.` });
  }

  const ngo = db.prepare('SELECT id, name, status FROM ngos WHERE id = ?').get(ngo_id);
  if (!ngo) return res.status(404).json({ error: 'NGO not found.' });
  if (ngo.status !== 'Active') return res.status(400).json({ error: 'Cannot match with an inactive NGO.' });

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('UPDATE donations SET status = ?, ngo_id = ? WHERE id = ?').run('Matched', ngo_id, id);
    db.prepare('UPDATE donation_timeline SET done = 1, completed_at = ? WHERE donation_id = ? AND step = ?')
      .run(now, id, 'Safety Checked');
    db.prepare('UPDATE donation_timeline SET done = 1, completed_at = ? WHERE donation_id = ? AND step = ?')
      .run(now, id, 'Matched with NGO');
    db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('✓', `Donation ${id} matched with ${ngo.name}.`);
  });
  tx();

  res.json(getFullDonation(id));
});

// POST /api/donations/:id/claim (NGO role)
router.post('/:id/claim', authRequired, roleRequired('NGO'), (req, res) => {
  checkAndExpireDonations(db);
  const { id } = req.params;
  const ngo_id = req.user.id;

  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  const remaining = calculateRemainingHours(donation.expires_at);
  if (donation.status === 'Expired' || remaining <= 0) {
    return res.status(400).json({ error: 'Expired food cannot be claimed.' });
  }
  if (donation.status !== 'Available') {
    return res.status(400).json({ error: 'This donation has already been claimed or processed.' });
  }

  const ngo = db.prepare('SELECT id, name FROM ngos WHERE id = ?').get(ngo_id);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare('UPDATE donations SET status = ?, ngo_id = ? WHERE id = ?').run('Matched', ngo_id, id);
    db.prepare('UPDATE donation_timeline SET done = 1, completed_at = ? WHERE donation_id = ? AND step = ?')
      .run(now, id, 'Safety Checked');
    db.prepare('UPDATE donation_timeline SET done = 1, completed_at = ? WHERE donation_id = ? AND step = ?')
      .run(now, id, 'Matched with NGO');
    db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('✓', `Donation ${id} claimed by ${ngo ? ngo.name : 'NGO'}.`);
  });
  tx();

  res.json(getFullDonation(id));
});

// POST /api/donations/:id/assign (Admin)
router.post('/:id/assign', authRequired, roleRequired('Admin'), (req, res) => {
  checkAndExpireDonations(db);
  const { id } = req.params;
  const { volunteer_id } = req.body;

  if (!volunteer_id) return res.status(400).json({ error: 'Volunteer ID is required.' });

  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  const remaining = calculateRemainingHours(donation.expires_at);
  if (donation.status === 'Expired' || remaining <= 0) {
    return res.status(400).json({ error: 'Expired food cannot be matched or assigned.' });
  }
  if (donation.status !== 'Matched') {
    return res.status(400).json({ error: 'Donation must be matched to an NGO before assigning a volunteer.' });
  }

  const volunteer = db.prepare('SELECT id, name FROM volunteers WHERE id = ?').get(volunteer_id);
  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('UPDATE donations SET status = ?, volunteer_id = ? WHERE id = ?').run('Volunteer Assigned', volunteer_id, id);
    db.prepare('UPDATE volunteers SET status = ? WHERE id = ?').run('On Delivery', volunteer_id);
    db.prepare('UPDATE donation_timeline SET done = 1, completed_at = ? WHERE donation_id = ? AND step = ?')
      .run(now, id, 'Volunteer Assigned');
    db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run('✓', `Volunteer ${volunteer.name} assigned for Donation #${id}.`);
  });
  tx();

  res.json(getFullDonation(id));
});

// POST /api/donations/:id/deliver (Admin or assigned Volunteer)
router.post('/:id/deliver', authRequired, (req, res) => {
  const { id } = req.params;
  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) return res.status(404).json({ error: 'Donation not found.' });

  if (donation.status !== 'Volunteer Assigned') {
    return res.status(400).json({ error: `Cannot mark delivered: donation status is '${donation.status}'.` });
  }

  const isAdmin = req.user.role === 'Admin';
  const isAssignedVol = req.user.role === 'Volunteer' && req.user.id === donation.volunteer_id;

  if (!isAdmin && !isAssignedVol) {
    return res.status(403).json({ error: 'Only the assigned volunteer or an admin can mark this donation as delivered.' });
  }

  const volunteer = donation.volunteer_id ? db.prepare('SELECT name FROM volunteers WHERE id = ?').get(donation.volunteer_id) : null;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare('UPDATE donations SET status = ? WHERE id = ?').run('Delivered', id);
    if (donation.volunteer_id) {
      db.prepare('UPDATE volunteers SET status = ? WHERE id = ?').run('Free', donation.volunteer_id);
    }
    db.prepare('UPDATE donation_timeline SET done = 1, completed_at = ? WHERE donation_id = ? AND step = ?')
      .run(now, id, 'Delivered');
    db.prepare('INSERT INTO notifications (icon, text) VALUES (?, ?)').run(
      '✓',
      `Donation ${id} marked as Delivered${volunteer ? ` by ${volunteer.name}` : ''}.`
    );
  });
  tx();

  res.json(getFullDonation(id));
});

export default router;
