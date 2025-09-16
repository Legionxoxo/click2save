const logger = require('../configs/logger.config');

const storeCookies = async (req, res) => {
  try {
    const { sessionId, domain, url, cookies, timestamp, userAgent } = req.body;

    logger.info(`📧 Received cookies for domain: ${domain}`, {
      sessionId,
      domain,
      url,
      cookieCount: cookies?.length || 0,
      timestamp,
      userAgent: userAgent?.substring(0, 50) + '...'
    });

    // Log cookies for debugging (remove in production)
    console.log('🍪 Cookies received:', {
      domain,
      cookieCount: cookies?.length || 0,
      cookies: cookies?.map(c => `${c.name}=${c.value?.substring(0, 20)}...`)
    });

    // TODO: Store cookies in database or process as needed
    // For now, just acknowledge receipt

    res.status(200).json({
      success: true,
      message: `Successfully received ${cookies?.length || 0} cookies for ${domain}`,
      sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to store cookies', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process cookies',
      message: error.message
    });
  }
};
module.exports = storeCookies;
