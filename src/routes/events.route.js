const express = require('express');
const {
  createEvent,
  trackMilestone,
  testConnection,
} = require('../controllers/events.controllers');
const validateEvents = require('../validation/events.validation');
const checkSessionId = require('../middlewares/process.middleware');
const router = express.Router();

// Create general event
router.post('/create', validateEvents, createEvent);

// Track milestone events
router.post('/milestone', validateEvents, checkSessionId, trackMilestone);

// Test event service connection
router.get('/test', testConnection);

module.exports = router;