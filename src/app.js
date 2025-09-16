//app.js
const cookieParser = require('cookie-parser');
const express = require('express');
const logger = require('./configs/logger.config');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(helmet());
app.use(cors());
app.use(cookieParser());

app.use(
  morgan('combined', {
    stream: {
      write: message => {
        logger.info(message.trim());
      },
    },
  })
);

app.get('/', (req, res) => {
  res.status(200).send('Hello !!');
});

app.get('/api', (res, req) => {
  res.status(200).json({ message: 'Api running like Usain Bolt' });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

//catch all
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
module.exports = app;
