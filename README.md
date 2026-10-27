# FoodConnect – Smart Food Donation Management System

FoodConnect is a full-stack web application designed to connect surplus food donors (hotels, restaurants, hostels, event organizers) with nearby NGOs and volunteers to rescue perishable food before it expires.

Built as a 2nd-year college project with clean, readable code that is easy to explain during practical viva examinations.

---

## 1. Project Architecture

The application follows a standard modular RESTful client-server architecture:

```
foodconnect/
├── server.js              # Express application entry point & static server
├── package.json           # Dependencies and project scripts
├── .env.example           # Environment variable template
├── README.md              # Documentation & viva notes
├── foodconnect.db         # SQLite persistent database file
├── db/
│   ├── database.js        # better-sqlite3 connection and table bootstrapper
│   ├── schema.sql         # SQL schema with relational foreign keys
│   └── seed.js            # Initial dataset and sample accounts
├── middleware/
│   ├── auth.js            # JWT Bearer token authentication
│   ├── roles.js           # Role-based access control (RBAC)
│   └── errorHandler.js    # Centralized JSON error handler
├── services/
│   └── expiryService.js   # Dynamic Smart Expiry Priority engine
├── routes/
│   ├── auth.js            # /api/auth (login, me, change-password)
│   ├── donors.js          # /api/donors (CRUD, status toggle)
│   ├── ngos.js            # /api/ngos (CRUD)
│   ├── volunteers.js      # /api/volunteers (CRUD)
│   ├── donations.js       # /api/donations (workflow, match, claim, assign, deliver)
│   ├── notifications.js   # /api/notifications (list, dismiss, clear)
│   ├── reports.js         # /api/reports (summary, breakdowns, CSV export)
│   ├── public.js          # /api/public (landing stats & live preview)
│   └── dev.js             # /api/dev/advance-hours (simulation tool)
└── public/
    ├── index.html         # Responsive frontend with modern UI
    └── api.js             # Fetch wrapper with JWT injection & error handling
```

---

## 2. Tech Stack

- **Runtime**: Node.js 22
- **Backend**: Express.js
- **Database**: SQLite 3 with `better-sqlite3` (synchronous, ACID compliant, file-based persistence in `foodconnect.db`)
- **Authentication**: JWT (`jsonwebtoken`) sent in `Authorization: Bearer <token>`
- **Security**: Password hashing with `bcryptjs` (salt rounds: 10)
- **Frontend**: Semantic HTML5, CSS3 with CSS variables, vanilla JavaScript (ES6+), Google Fonts (Space Grotesk + Inter)

---

## 3. Role Permissions Matrix

| Feature / Endpoint | Admin | Donor | NGO | Volunteer | Public |
|---|:---:|:---:|:---:|:---:|:---:|
| Landing Page Stats & Live Preview | ✅ | ✅ | ✅ | ✅ | ✅ |
| Account Login | ✅ | ✅ | ✅ | ✅ | ❌ |
| Donor Management (CRUD, Reset Password, Deactivate) | ✅ | ❌ (Own profile only) | ❌ | ❌ | ❌ |
| NGO Management (CRUD) | ✅ | ❌ | ❌ (Own profile only) | ❌ | ❌ |
| Volunteer Management (CRUD) | ✅ | ❌ | ❌ | ❌ (Own profile only) | ❌ |
| Create Donation | ✅ | ✅ (Auto-bound to self) | ❌ | ❌ | ❌ |
| Edit Donation | ✅ | ✅ (Only while Available) | ❌ | ❌ | ❌ |
| View Donations List | ✅ (All) | ✅ (Only own) | ✅ (Available or Claimed) | ✅ (Assigned only) | ❌ |
| Match NGO to Donation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Claim Available Donation | ❌ | ❌ | ✅ | ❌ | ❌ |
| Assign Volunteer to Matched Food | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mark Delivered | ✅ | ❌ | ❌ | ✅ (Assigned only) | ❌ |
| View System Reports & Export CSV | ✅ | ❌ | ❌ | ❌ | ❌ |
| Simulate Time Advance (+1 hour) | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Smart Expiry Priority Engine

Instead of storing remaining hours as a static value, FoodConnect stores a precise ISO 8601 timestamp `expires_at`.

On **every request** and in a background heartbeat interval (every 60 seconds):
1. **Dynamic Remaining Time**:
   $$\text{remaining\_hours} = \frac{\text{expires\_at} - \text{now}}{1000 \times 60 \times 60}$$
2. **Priority Classification**:
   - `remaining_hours <= 0`: **Expired** (Red badge `⛔`) &rarr; Food is marked Expired, volunteer freed, and notification logged. Expired food **cannot** be matched or assigned.
   - `0 < remaining_hours <= 2`: **URGENT — Donate Immediately** (Red badge `🚨`) &rarr; Pushed to top priority.
   - `2 < remaining_hours <= 6`: **Donate Soon** (Amber badge `⏳`).
   - `remaining_hours > 6`: **Safe to Donate** (Green badge `🟢`).
3. Priority sorting queries orders by `expires_at ASC` so the food closest to spoiling is always surfaced first.

---

## 5. Seed Accounts & Credentials

Run `npm run seed` to load the default dataset:

| Role | Name | Email | Password |
|---|---|---|---|
| **Admin** | System Admin | `admin@foodconnect.org` | `admin123` |
| **Donor** | Green Leaf Hotel | `greenleaf@foodconnect.org` | `donor123` |
| **Donor** | Spice Route Restaurant | `spiceroute@foodconnect.org` | `donor123` |
| **Donor** | MIT Boys Hostel | `mithostel@foodconnect.org` | `donor123` |
| **Donor** | Chennai Tech Summit | `techsummit@foodconnect.org` | `donor123` |
| **NGO** | Helping Hands NGO | `helpinghands@foodconnect.org` | `ngo123` |
| **NGO** | Annam Foundation | `annam@foodconnect.org` | `ngo123` |
| **NGO** | Seva Bharati Trust | `sevabharati@foodconnect.org` | `ngo123` |
| **Volunteer** | Arjun Kumar | `arjun@foodconnect.org` | `vol123` |
| **Volunteer** | Divya Shree | `divya@foodconnect.org` | `vol123` |
| **Volunteer** | Ramesh Babu | `ramesh@foodconnect.org` | `vol123` |

---

## 6. How to Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Seed database with initial users and sample donations
npm run seed

# 3. Start development server
npm start
```

Open your browser at: **`http://localhost:3000`**

---

## 7. Example API Calls (cURL)

### 1. Login as Admin
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foodconnect.org","password":"admin123","role":"Admin"}'
```

### 2. Get Priority Donations (Requires JWT)
```bash
curl -X GET http://localhost:3000/api/donations/priority \
  -H "Authorization: Bearer <TOKEN>"
```

### 3. Create a New Donation (Donor or Admin)
```bash
curl -X POST http://localhost:3000/api/donations \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "donor_id": "D-101",
    "food_name": "Paneer Pulao",
    "quantity": "40 packets",
    "category": "Cooked Meal",
    "pickup_location": "Anna Nagar, Chennai",
    "expiry_hours": 3
  }'
```

### 4. Food Safety Check for a Donation
```bash
curl -X GET http://localhost:3000/api/donations/DN-501/safety \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Match an Available Donation to an NGO (Admin)
```bash
curl -X POST http://localhost:3000/api/donations/DN-501/match \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ngo_id": "N-201"}'
```

### 6. Assign a Volunteer for Pickup (Admin)
```bash
curl -X POST http://localhost:3000/api/donations/DN-501/assign \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"volunteer_id": "V-301"}'
```

### 7. Mark Donation as Delivered (Volunteer or Admin)
```bash
curl -X POST http://localhost:3000/api/donations/DN-501/deliver \
  -H "Authorization: Bearer <TOKEN>"
```

### 8. Simulate Time Advance (+1 hour to demo expiry)
```bash
curl -X POST http://localhost:3000/api/dev/advance-hours \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"hours": 1}'
```

---

## 8. College Viva Preparation Guide

1. **Why SQLite instead of MongoDB/PostgreSQL for this project?**
   - SQLite is an embedded, zero-configuration, serverless database engine. It stores data in a single file (`foodconnect.db`), perfectly suitable for demonstrations, portable viva setups, and fast offline evaluation without external database servers.

2. **How does the Smart Expiry Priority feature prevent food waste?**
   - Instead of static numbers, we store the expiration timestamp. The system continually evaluates the time delta. When food enters the critical $\le 2$ hours window, it triggers urgent alerts and moves to the top of matching queues. If it expires, safety rules block distribution.

3. **How is security handled?**
   - Passwords are never stored in plain text; they are hashed using bcrypt with 10 salt rounds.
   - Stateless JWT tokens verify identity.
   - Server-side middleware verifies roles before granting access to sensitive routes (e.g., matching or deleting).
   - SQL queries are strictly parameterized to prevent SQL injection.
