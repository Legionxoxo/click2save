const cookieParser = require('cookie-parser');
const express = require('express');
const logger = require('./configs/logger.config');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const processRoute = require('./routes/process.route');
const errorMiddleware = require('./middlewares/error.middleware');
const storeCookies = require('./routes/cookies.routes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use('/public', express.static('public'));

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

app.get('/api', (req, res) => {
  res.status(200).json({ message: 'Api running like Usain Bolt' });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

//cookie routes
app.use('/api/extension', storeCookies);
// Video processing endpoints
app.use('/api/video', processRoute);

//catch all
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorMiddleware);
module.exports = app;
