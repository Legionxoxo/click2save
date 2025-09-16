const logger = require('../configs/logger.config');

const errorMiddleware = async (err, req, res, next) => {
  logger.info('Global error handler', err);

  const statusCode = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: 'Internal server error',
    message,
  });
};

module.exports = errorMiddleware;
