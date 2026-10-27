export function errorHandler(err, req, res, next) {
  console.error('[FoodConnect Server Error]', err);

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A record with that email or identifier already exists.' });
  }

  if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: err.message || 'Database constraint violation.' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({ error: message });
}
