function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);

  if (err.response) {
    return res.status(err.response.status || 502).json({
      error: 'External API error',
      message: err.message,
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
}

module.exports = errorHandler;
