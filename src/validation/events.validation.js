const logger = require('../configs/logger.config');

const validateEvents = async (req, res, next) => {
  try {
    const { category, fields, userId, userEmail } = req.body;

    console.log('validating events');

    // Log validation details for debugging
    logger.info('Event validation started', {
      category,
      hasFields: !!fields,
      hasUserId: !!userId,
      hasUserEmail: !!userEmail,
    });

    next();
  } catch (error) {
    logger.error('Error validating events', error);
    next(error);
  }
};

module.exports = validateEvents;