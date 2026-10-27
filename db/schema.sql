-- FoodConnect SQLite Schema

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('Hotel', 'Restaurant', 'Hostel', 'Event Organizer')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ngos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  contact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('Available', 'Weekdays only', 'Weekends only', 'Unavailable')),
  status TEXT NOT NULL DEFAULT 'Free' CHECK(status IN ('Free', 'On Delivery')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  donor_id TEXT REFERENCES donors(id) ON DELETE SET NULL,
  food_name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Cooked Meal', 'Bakery', 'Fruits', 'Vegetables', 'Packaged Food', 'Dairy')),
  pickup_location TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available', 'Matched', 'Volunteer Assigned', 'Delivered', 'Expired')),
  ngo_id TEXT REFERENCES ngos(id) ON DELETE SET NULL,
  volunteer_id TEXT REFERENCES volunteers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS donation_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id TEXT NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK(step IN ('Donation Created', 'Safety Checked', 'Matched with NGO', 'Volunteer Assigned', 'Delivered')),
  done INTEGER NOT NULL DEFAULT 0,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  role TEXT,
  user_id TEXT
);
