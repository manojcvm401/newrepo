import bcrypt from 'bcryptjs';
import db from './database.js';

export function runSeed() {
  console.log('🌱 Seeding FoodConnect SQLite database...');

  // Clear existing records
  db.exec(`
    DELETE FROM donation_timeline;
    DELETE FROM donations;
    DELETE FROM notifications;
    DELETE FROM volunteers;
    DELETE FROM ngos;
    DELETE FROM donors;
    DELETE FROM admins;
  `);

  const now = new Date();

  // 1. Admins
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO admins (id, name, email, password_hash)
    VALUES (?, ?, ?, ?)
  `).run('A-001', 'System Admin', 'admin@foodconnect.org', adminHash);

  // 2. Donors
  const donorHash = bcrypt.hashSync('donor123', 10);
  const donors = [
    ['D-101', 'Green Leaf Hotel', '9876500011', 'Hotel', 'Active', 'greenleaf@foodconnect.org'],
    ['D-102', 'Spice Route Restaurant', '9876500022', 'Restaurant', 'Active', 'spiceroute@foodconnect.org'],
    ['D-103', 'MIT Boys Hostel', '9876500033', 'Hostel', 'Active', 'mithostel@foodconnect.org'],
    ['D-104', 'Chennai Tech Summit', '9876500044', 'Event Organizer', 'Active', 'techsummit@foodconnect.org'],
  ];

  const insertDonor = db.prepare(`
    INSERT INTO donors (id, name, phone, type, status, email, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const d of donors) {
    insertDonor.run(...d, donorHash);
  }

  // 3. NGOs
  const ngoHash = bcrypt.hashSync('ngo123', 10);
  const ngos = [
    ['N-201', 'Helping Hands NGO', 'Chennai', '9840011122', 'Active', 'helpinghands@foodconnect.org'],
    ['N-202', 'Annam Foundation', 'Chennai', '9840033344', 'Active', 'annam@foodconnect.org'],
    ['N-203', 'Seva Bharati Trust', 'Chrompet', '9840055566', 'Active', 'sevabharati@foodconnect.org'],
  ];

  const insertNgo = db.prepare(`
    INSERT INTO ngos (id, name, location, contact, status, email, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const n of ngos) {
    insertNgo.run(...n, ngoHash);
  }

  // 4. Volunteers
  const volHash = bcrypt.hashSync('vol123', 10);
  const volunteers = [
    ['V-301', 'Arjun Kumar', '9900011122', 'Available', 'Free', 'arjun@foodconnect.org'],
    ['V-302', 'Divya Shree', '9900033344', 'Available', 'Free', 'divya@foodconnect.org'],
    ['V-303', 'Ramesh Babu', '9900055566', 'Weekends only', 'Free', 'ramesh@foodconnect.org'],
  ];

  const insertVol = db.prepare(`
    INSERT INTO volunteers (id, name, phone, availability, status, email, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const v of volunteers) {
    insertVol.run(...v, volHash);
  }

  // 5. Donations
  const insertDonation = db.prepare(`
    INSERT INTO donations (id, donor_id, food_name, quantity, category, pickup_location, created_at, expires_at, status, ngo_id, volunteer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTimeline = db.prepare(`
    INSERT INTO donation_timeline (donation_id, step, done, completed_at)
    VALUES (?, ?, ?, ?)
  `);

  const sampleDonations = [
    {
      id: 'DN-501', donor_id: 'D-101', food_name: 'Veg Rice Meals', quantity: '50 packets',
      category: 'Cooked Meal', pickup_location: 'Anna Nagar, Chennai', expiry_hours: 1.5, status: 'Available'
    },
    {
      id: 'DN-502', donor_id: 'D-102', food_name: 'Bread Loaves', quantity: '120 pcs',
      category: 'Bakery', pickup_location: 'T. Nagar, Chennai', expiry_hours: 5.0, status: 'Available'
    },
    {
      id: 'DN-503', donor_id: 'D-103', food_name: 'Chapati & Curry', quantity: '80 packets',
      category: 'Cooked Meal', pickup_location: 'MIT Campus, Chromepet', expiry_hours: 8.0, status: 'Available'
    },
    {
      id: 'DN-504', donor_id: 'D-104', food_name: 'Fruit Boxes', quantity: '40 boxes',
      category: 'Fruits', pickup_location: 'Guindy, Chennai', expiry_hours: 0, status: 'Expired'
    },
    {
      id: 'DN-505', donor_id: 'D-101', food_name: 'Sambar Rice', quantity: '65 packets',
      category: 'Cooked Meal', pickup_location: 'Velachery, Chennai', expiry_hours: 2.0, status: 'Available'
    },
  ];

  for (const item of sampleDonations) {
    const createdAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + item.expiry_hours * 3600 * 1000).toISOString();
    insertDonation.run(
      item.id, item.donor_id, item.food_name, item.quantity, item.category,
      item.pickup_location, createdAt, expiresAt, item.status, null, null
    );

    insertTimeline.run(item.id, 'Donation Created', 1, createdAt);
    insertTimeline.run(item.id, 'Safety Checked', 0, null);
    insertTimeline.run(item.id, 'Matched with NGO', 0, null);
    insertTimeline.run(item.id, 'Volunteer Assigned', 0, null);
    insertTimeline.run(item.id, 'Delivered', 0, null);
  }

  // Delivered sample donation: DN-506
  const deliveredCreatedAt = new Date(now.getTime() - 4 * 3600 * 1000).toISOString();
  const deliveredExpiresAt = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();
  const deliveredDoneAt = new Date(now.getTime() - 1 * 3600 * 1000).toISOString();

  insertDonation.run(
    'DN-506', 'D-102', 'Biryani Packets', '90 packets', 'Cooked Meal',
    'Mylapore, Chennai', deliveredCreatedAt, deliveredExpiresAt, 'Delivered', 'N-201', 'V-301'
  );

  insertTimeline.run('DN-506', 'Donation Created', 1, deliveredCreatedAt);
  insertTimeline.run('DN-506', 'Safety Checked', 1, deliveredCreatedAt);
  insertTimeline.run('DN-506', 'Matched with NGO', 1, deliveredCreatedAt);
  insertTimeline.run('DN-506', 'Volunteer Assigned', 1, deliveredCreatedAt);
  insertTimeline.run('DN-506', 'Delivered', 1, deliveredDoneAt);

  // 6. Notifications
  const insertNotif = db.prepare('INSERT INTO notifications (icon, text, created_at) VALUES (?, ?, ?)');
  insertNotif.run('✓', 'Welcome to FoodConnect — real SQLite backend loaded successfully.', now.toISOString());
  insertNotif.run('🍱', 'New donation "Veg Rice Meals" (DN-501) added by Green Leaf Hotel.', new Date(now.getTime() - 25 * 60 * 1000).toISOString());
  insertNotif.run('⚠', 'Veg Rice Meals donation expires in 1.5 hour(s) — URGENT.', new Date(now.getTime() - 24 * 60 * 1000).toISOString());
  insertNotif.run('✓', 'Donation DN-506 marked as Delivered by Arjun Kumar.', deliveredDoneAt);

  console.log('✅ Seeding completed successfully!');
}

// If invoked directly via CLI
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeed();
  process.exit(0);
}
