const logger = require('../configs/logger.config');
const eventService = require('../services/event.service');

const errorMiddleware = async (err, req, res, next) => {
  logger.info('Global error handler', err);

  const statusCode = err.status || 500;
  const message = err.message || 'Internal server error';

  // Track global errors
  await eventService.trackError(message, {
    statusCode,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent')
  });

  res.status(statusCode).json({
    error: 'Internal server error',
    message,
  });
};

module.exports = errorMiddleware;
