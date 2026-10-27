export function roleRequired(...allowedRoles) {
  const normalized = allowedRoles.map(r => r.toLowerCase());
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!normalized.includes(req.user.role.toLowerCase())) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions.' });
    }
    next();
  };
}
