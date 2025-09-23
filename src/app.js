const cookieParser = require('cookie-parser');
const express = require('express');
const logger = require('./configs/logger.config');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const processRoute = require('./routes/process.route');
const eventsRoute = require('./routes/events.route');
const errorMiddleware = require('./middlewares/error.middleware');
const eventService = require('./services/event.service');

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

// Test endpoint for event service
app.get('/api/test-events', async (req, res) => {
  try {
    const result = await eventService.testConnection();

    res.status(200).json({
      message: 'Event service test completed',
      eventSent: result.success,
      eventApiConfigured: eventService.enabled,
      result: result
    });
  } catch (error) {
    res.status(500).json({
      message: 'Event service test failed',
      error: error.message,
      eventApiConfigured: eventService.enabled
    });
  }
});

// Video processing endpoints
app.use('/api/video', processRoute);

// Event tracking endpoints
app.use('/api/events', eventsRoute);

//catch all
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorMiddleware);
module.exports = app;
