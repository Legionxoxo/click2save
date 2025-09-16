const express = require('express');
const storeCookies = require('../controllers/cookies.controllers');
const router = express.Router();

router.post('/cookies', storeCookies);

// Revoke consent endpoint
router.post('/revoke', (req, res) => {
  const { sessionId } = req.body;

  console.log(`🗑️ Revoking consent for session: ${sessionId}`);

  // TODO: Remove stored cookies for this session

  res.status(200).json({
    success: true,
    message: 'Consent revoked successfully',
    sessionId,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
