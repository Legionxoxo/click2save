const express = require('express');
const {
  processStatus,
  analyseLink,
  downloadLink,
} = require('../controllers/analyseLink.controllers');
const router = express.Router();

//process videos
router.post('/process', analyseLink);

router.get('/status/:processId', processStatus);

router.post('/download/:processId', downloadLink);

module.exports = router;
