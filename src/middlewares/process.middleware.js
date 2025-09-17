const logger = require('../configs/logger.config');

const checkSessionId = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    console.log('session id good');
    next();
  } catch (e) {
    logger.error('Error middleware', e);
    next(e);
  }
};

module.exports = checkSessionId;
