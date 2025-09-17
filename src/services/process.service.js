const logger = require('../configs/logger.config');

const processLink = async (processId, sessionId) => {
  try {
    logger.info('starting processing video link...');
    console.log(processId, sessionId);
  } catch (error) {
    logger.error('Error processing link', error);
    console.log('error', error);
  }
};

module.exports = processLink;
