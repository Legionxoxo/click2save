const logger = require('../configs/logger.config');
const eventService = require('../services/event.service');

const createEvent = async (req, res, next) => {
  try {
    const { category, fields, userId, userEmail } = req.body;

    // Validate required fields
    if (!category) {
      throw new Error('No category provided');
    }

    // Log the event creation request
    logger.info('Event Creation Request Received', {
      category,
      fieldsCount: Object.keys(fields || {}).length,
      hasUserId: !!userId,
      hasUserEmail: !!userEmail,
    });

    // Prepare event data
    const eventData = {
      ...fields,
      ...(userId && { userId }),
      ...(userEmail && { userEmail }),
      timestamp: new Date().toISOString(),
      source: 'justclick-app',
    };

    // Send event using the event service
    const result = await eventService.sendEvent(category, eventData);

    if (result.success) {
      logger.info('Event sent successfully', {
        category,
        eventId: result.data?.eventId,
        status: result.status,
      });

      res.status(200).json({
        success: true,
        eventId: result.data?.eventId,
        message: 'Event created and sent successfully',
        category,
        timestamp: eventData.timestamp,
      });
    } else {
      logger.error('Failed to send event', {
        category,
        error: result.error,
        status: result.status,
      });

      res.status(result.status || 500).json({
        success: false,
        message: 'Failed to create event',
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Error creating event', error);
    next(error);
  }
};

const trackMilestone = async (req, res, next) => {
  try {
    const { userId, userEmail, milestone } = req.body;

    // Validate required fields
    if (!userId || !userEmail) {
      throw new Error('User ID and email are required for milestone tracking');
    }

    logger.info('Milestone Tracking Request Received', {
      userId,
      userEmail,
      milestone,
    });

    // Send milestone event
    const result = await eventService.trackMilestone(userId, userEmail);

    if (result.success) {
      logger.info('Milestone tracked successfully', {
        userId,
        eventId: result.data?.eventId,
        status: result.status,
      });

      res.status(200).json({
        success: true,
        eventId: result.data?.eventId,
        message: 'Milestone tracked successfully',
        userId,
        userEmail,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error('Failed to track milestone', {
        userId,
        error: result.error,
        status: result.status,
      });

      res.status(result.status || 500).json({
        success: false,
        message: 'Failed to track milestone',
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Error tracking milestone', error);
    next(error);
  }
};

const testConnection = async (req, res, next) => {
  try {
    logger.info('Event service connection test requested');

    // Test the connection
    const result = await eventService.testConnection();

    if (result.success) {
      logger.info('Event service connection test successful', {
        eventId: result.data?.eventId,
        status: result.status,
      });

      res.status(200).json({
        success: true,
        message: 'Event service connection successful',
        eventId: result.data?.eventId,
        timestamp: new Date().toISOString(),
        serviceEnabled: eventService.enabled,
      });
    } else {
      logger.error('Event service connection test failed', {
        error: result.error,
        status: result.status,
      });

      res.status(result.status || 500).json({
        success: false,
        message: 'Event service connection failed',
        error: result.error,
        serviceEnabled: eventService.enabled,
      });
    }
  } catch (error) {
    logger.error('Error testing event service connection', error);
    next(error);
  }
};

module.exports = {
  createEvent,
  trackMilestone,
  testConnection,
};