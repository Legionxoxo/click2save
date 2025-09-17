const express = require('express');
const {
  processStatus,
  analyseLink,
  downloadLink,
} = require('../controllers/analyseLink.controllers');
const validateLinks = require('../validation/process.validation');
const checkSessionId = require('../middlewares/process.middleware');
const router = express.Router();

//process videos
router.post('/process', validateLinks, checkSessionId, analyseLink);

router.get('/status/:processId', processStatus);

router.get('/download/:processId', downloadLink);

module.exports = router;
