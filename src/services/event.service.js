const axios = require('axios');
const logger = require('../configs/logger.config');

class EventClient {
  constructor() {
    this.apiKey = process.env.EVENT_API_KEY;
    this.baseUrl =
      process.env.EVENT_BASE_URL || 'https://peekpidgey.netlify.app';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('Event API key not configured - event tracking disabled');
    } else {
      logger.info('Event service initialized', { baseUrl: this.baseUrl });
    }
  }

  async sendEvent(category, fields = {}) {
    if (!this.enabled) {
      logger.debug('Event API disabled, skipping event', { category });
      return { success: false, reason: 'API key not configured' };
    }

    try {
      const eventData = {
        category,
        fields,
      };

      logger.info('Sending event to platform', { category, fields });

      const response = await axios.post(
        `${this.baseUrl}/api/v1/events`,
        eventData,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      logger.info('Event sent successfully', {
        category,
        status: response.status,
      });

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      logger.error('Failed to send event', {
        category,
        error: error.message,
        status: error.response?.status,
      });

      return {
        success: false,
        error: error.message,
        status: error.response?.status,
      };
    }
  }

  // Helper methods for common event types
  async trackVideoProcessing(title, metadata = {}) {
    return this.sendEvent('video-processing', {
      title,
      status: 'started',
      ...metadata,
    });
  }

  async trackError(errorMessage, context = {}) {
    return this.sendEvent('error', {
      message: errorMessage,
      ...context,
    });
  }

  async trackApiRequest(method, path, status, duration) {
    const category = status >= 400 ? 'api-error' : 'api-request';

    return this.sendEvent(category, {
      method,
      path,
      status,
      duration,
    });
  }

  // Helper method for milestone events
  async trackMilestone(userId, userEmail) {
    return this.sendEvent('milestone-reached', {
      userId,
      userEmail,
      timestamp: new Date().toISOString(),
    });
  }

  // Test method to verify connection
  async testConnection() {
    return this.sendEvent('test', {
      service: 'event_service',
      app: 'justclick',
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = new EventClient();
