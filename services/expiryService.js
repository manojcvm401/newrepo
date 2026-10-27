export function calculateRemainingHours(expiresAt) {
  const expiresMs = new Date(expiresAt).getTime();
  const diffHours = (expiresMs - Date.now()) / (1000 * 60 * 60);
  const rounded = Math.round(diffHours * 10) / 10;
  return rounded <= 0 ? 0 : rounded;
}

export function getExpiryInfo(remainingHours) {
  const h = Number(remainingHours);
  if (h <= 0) {
    return {
      label: 'Expired',
      color: 'red',
      cls: 'badge-red',
      icon: '⛔',
      desc: 'This food can no longer be donated.'
    };
  }
  if (h <= 2) {
    return {
      label: 'URGENT — Donate Immediately',
      color: 'red',
      cls: 'badge-red',
      icon: '🚨',
      desc: 'Extremely time-sensitive. Match and dispatch right away.'
    };
  }
  if (h <= 6) {
    return {
      label: 'Donate Soon',
      color: 'amber',
      cls: 'badge-amber',
      icon: '⏳',
      desc: 'Should be matched with an NGO within the next few hours.'
    };
  }
  return {
    label: 'Safe to Donate',
    color: 'green',
    cls: 'badge-green',
    icon: '🟢',
    desc: 'Plenty of time — schedule a normal pickup.'
  };
}

export function enrichDonation(donation) {
  const remainingHours = calculateRemainingHours(donation.expires_at);
  const info = getExpiryInfo(remainingHours);
  return {
    ...donation,
    remaining_hours: remainingHours,
    priority_label: info.label,
    priority_color: info.color,
    badge_class: info.cls,
    icon: info.icon,
    desc: info.desc
  };
}

export function checkAndExpireDonations(db) {
  const nowIso = new Date().toISOString();
  
  // 1. Process Expired Donations
  const activeDonations = db.prepare(`
    SELECT * FROM donations 
    WHERE status NOT IN ('Delivered', 'Expired')
  `).all();

  const updateDonation = db.prepare(`UPDATE donations SET status = 'Expired' WHERE id = ?`);
  const freeVolunteer = db.prepare(`UPDATE volunteers SET status = 'Free' WHERE id = ?`);
  const addNotif = db.prepare(`INSERT INTO notifications (icon, text) VALUES (?, ?)`);
  const checkUrgentNotif = db.prepare(`
    SELECT id FROM notifications 
    WHERE text LIKE ? AND text LIKE '%URGENT%'
    LIMIT 1
  `);

  for (const d of activeDonations) {
    const remaining = calculateRemainingHours(d.expires_at);
    
    if (remaining <= 0) {
      // Mark expired
      updateDonation.run(d.id);
      if (d.volunteer_id) {
        freeVolunteer.run(d.volunteer_id);
      }
      addNotif.run('⛔', `${d.food_name} (${d.id}) has expired and can no longer be donated.`);
    } else if (remaining <= 2) {
      // Check if urgent notification already created for this donation
      const existing = checkUrgentNotif.get(`%${d.id}%`);
      if (!existing) {
        addNotif.run('⚠', `${d.food_name} donation (${d.id}) expires in ${remaining} hour(s) — URGENT.`);
      }
    }
  }
}
