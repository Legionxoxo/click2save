// =============================================================================
// SHARED UTILITY FUNCTIONS
// =============================================================================

const { STREAM_FORMATS, QUALITY_PATTERNS, DEBUG } = require('./constants.js');

/**
 * Logging utilities with debug control
 */
const Logger = {
  log: (message, ...args) => {
    if (DEBUG.ENABLED) {
      console.log(`[VideoDownloader] ${message}`, ...args);
    }
  },

  error: (message, ...args) => {
    console.error(`[VideoDownloader] ❌ ${message}`, ...args);
  },

  warn: (message, ...args) => {
    if (DEBUG.ENABLED) {
      console.warn(`[VideoDownloader] ⚠️ ${message}`, ...args);
    }
  },

  debug: (message, ...args) => {
    if (DEBUG.ENABLED) {
      console.debug(`[VideoDownloader] 🐛 ${message}`, ...args);
    }
  },

  network: (message, ...args) => {
    if (DEBUG.ENABLED && DEBUG.LOG_NETWORK_REQUESTS) {
      console.log(`[Network] 🌐 ${message}`, ...args);
    }
  },

  stream: (message, ...args) => {
    if (DEBUG.ENABLED && DEBUG.LOG_STREAM_ANALYSIS) {
      console.log(`[Stream] 🎬 ${message}`, ...args);
    }
  }
};

/**
 * URL utilities for video stream analysis
 */
const URLUtils = {
  /**
   * Check if URL is a video stream
   */
  isVideoURL: (url) => {
    if (!url || typeof url !== 'string') return false;

    const lowercaseUrl = url.toLowerCase();

    // Check extensions
    for (const format of Object.values(STREAM_FORMATS)) {
      if (format.extensions.some(ext => lowercaseUrl.includes(ext))) {
        return true;
      }
    }

    return false;
  },

  /**
   * Detect stream format from URL
   */
  detectStreamFormat: (url) => {
    if (!url) return null;

    const lowercaseUrl = url.toLowerCase();

    // Check each format
    for (const [formatName, format] of Object.entries(STREAM_FORMATS)) {
      // Check extensions
      if (format.extensions.some(ext => lowercaseUrl.includes(ext))) {
        return formatName;
      }

      // Check indicators
      if (format.indicators.some(indicator => lowercaseUrl.includes(indicator))) {
        return formatName;
      }
    }

    return null;
  },

  /**
   * Extract quality from URL or filename
   */
  extractQuality: (url) => {
    if (!url) return null;

    const lowercaseUrl = url.toLowerCase();

    for (const [quality, patterns] of Object.entries(QUALITY_PATTERNS)) {
      if (patterns.some(pattern => lowercaseUrl.includes(pattern.toLowerCase()))) {
        return quality;
      }
    }

    return null;
  },

  /**
   * Extract domain from URL
   */
  extractDomain: (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  },

  /**
   * Clean URL for analysis (remove query params)
   */
  cleanURL: (url) => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  },

  /**
   * Check if URL should be excluded from analysis
   */
  shouldExcludeURL: (url) => {
    if (!url) return true;

    const excludePatterns = ['data:', 'blob:', 'chrome-extension:', 'moz-extension:'];
    return excludePatterns.some(pattern => url.startsWith(pattern));
  }
};

/**
 * Stream analysis utilities
 */
const StreamUtils = {
  /**
   * Parse M3U8 playlist content
   */
  parseM3U8: (content) => {
    if (!content || typeof content !== 'string') return null;

    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const streams = [];
    let currentStream = {};

    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Parse stream info
        const attributes = StreamUtils.parseAttributes(line);
        currentStream = {
          quality: StreamUtils.extractQualityFromAttributes(attributes),
          bandwidth: attributes.BANDWIDTH ? parseInt(attributes.BANDWIDTH) : null,
          resolution: attributes.RESOLUTION || null,
          codecs: attributes.CODECS || null,
          attributes
        };
      } else if (line && !line.startsWith('#') && currentStream.quality) {
        // Stream URL
        currentStream.url = line;
        streams.push(currentStream);
        currentStream = {};
      }
    }

    return {
      type: 'HLS',
      streams,
      hasMultipleQualities: streams.length > 1
    };
  },

  /**
   * Parse MPD manifest content
   */
  parseMPD: (content) => {
    if (!content || typeof content !== 'string') return null;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');

      const adaptationSets = doc.querySelectorAll('AdaptationSet');
      const streams = [];

      adaptationSets.forEach(adaptationSet => {
        const mimeType = adaptationSet.getAttribute('mimeType');
        if (mimeType && mimeType.startsWith('video/')) {
          const representations = adaptationSet.querySelectorAll('Representation');

          representations.forEach(representation => {
            const width = representation.getAttribute('width');
            const height = representation.getAttribute('height');
            const bandwidth = representation.getAttribute('bandwidth');

            streams.push({
              quality: height ? `${height}p` : null,
              resolution: width && height ? `${width}x${height}` : null,
              bandwidth: bandwidth ? parseInt(bandwidth) : null,
              mimeType
            });
          });
        }
      });

      return {
        type: 'DASH',
        streams,
        hasMultipleQualities: streams.length > 1
      };
    } catch (error) {
      Logger.error('Failed to parse MPD:', error);
      return null;
    }
  },

  /**
   * Parse attributes from M3U8 line
   */
  parseAttributes: (line) => {
    const attributes = {};
    const attrRegex = /([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g;
    let match;

    while ((match = attrRegex.exec(line)) !== null) {
      const key = match[1];
      const value = match[2] || match[3];
      attributes[key] = value;
    }

    return attributes;
  },

  /**
   * Extract quality from M3U8 attributes
   */
  extractQualityFromAttributes: (attributes) => {
    if (attributes.RESOLUTION) {
      const height = attributes.RESOLUTION.split('x')[1];
      return height ? `${height}p` : null;
    }

    // Fallback to bandwidth-based quality estimation
    if (attributes.BANDWIDTH) {
      const bandwidth = parseInt(attributes.BANDWIDTH);
      if (bandwidth > 5000000) return '1080p';
      if (bandwidth > 2500000) return '720p';
      if (bandwidth > 1000000) return '480p';
      if (bandwidth > 500000) return '360p';
      return '240p';
    }

    return null;
  }
};

/**
 * Performance timing utilities
 */
const Performance = {
  timers: new Map(),

  start: (label) => {
    if (DEBUG.PERFORMANCE_TIMING) {
      Performance.timers.set(label, performance.now());
    }
  },

  end: (label) => {
    if (DEBUG.PERFORMANCE_TIMING && Performance.timers.has(label)) {
      const duration = performance.now() - Performance.timers.get(label);
      Logger.debug(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
      Performance.timers.delete(label);
      return duration;
    }
    return 0;
  }
};

/**
 * Event emitter for module communication
 */
class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName).push(callback);
  }

  off(eventName, callback) {
    if (this.events.has(eventName)) {
      const callbacks = this.events.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(eventName, data) {
    if (this.events.has(eventName)) {
      this.events.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          Logger.error(`Event handler error for ${eventName}:`, error);
        }
      });
    }
  }
}

/**
 * Async utilities
 */
const AsyncUtils = {
  /**
   * Sleep for specified milliseconds
   */
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Timeout wrapper for promises
   */
  timeout: (promise, ms) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), ms)
      )
    ]);
  },

  /**
   * Retry function with exponential backoff
   */
  retry: async (fn, attempts = 3, delay = 1000) => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await AsyncUtils.sleep(delay * Math.pow(2, i));
      }
    }
  }
};

/**
 * DOM utilities
 */
const DOMUtils = {
  /**
   * Check if element is visible
   */
  isVisible: (element) => {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  },

  /**
   * Get element center point
   */
  getElementCenter: (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  },

  /**
   * Check if point is within element bounds
   */
  isPointInElement: (element, x, y) => {
    const rect = element.getBoundingClientRect();
    return x >= rect.left &&
           x <= rect.right &&
           y >= rect.top &&
           y <= rect.bottom;
  }
};

// Export all utilities
module.exports = {
  Logger,
  URLUtils,
  StreamUtils,
  Performance,
  EventEmitter,
  AsyncUtils,
  DOMUtils
};