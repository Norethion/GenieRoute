function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  const isProd = process.env.NODE_ENV === 'production';

  if (err.response) {
    return res.status(err.response.status || 502).json({
      error: 'External API error',
      message: isProd ? 'Upstream service error' : err.message,
    });
  }

  // Production'da 5xx detayını (DB/şema mesajları) client'a sızdırma; log'a kalsın.
  const status = err.status || 500;
  res.status(status).json({
    error: isProd && status >= 500 ? 'Internal server error' : (err.message || 'Internal server error'),
  });
}

module.exports = errorHandler;
