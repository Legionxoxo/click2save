const logger = require('../configs/logger.config');

const validateLinks = async (req, res, next) => {
  try {
    const { link } = req.body;
    console.log('validating link');
    next();
  } catch (error) {
    logger.error('Error validating', error);
    next(error);
  }
};

module.exports = validateLinks;
