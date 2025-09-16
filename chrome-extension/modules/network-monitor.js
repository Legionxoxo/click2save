// =============================================================================
// NETWORK MONITOR MODULE
// =============================================================================

const { FEATURES, REQUEST_FILTERS, EVENTS, ANALYSIS_CONFIG } = require('../shared/constants.js');
const { Logger, URLUtils, EventEmitter, Performance } = require('../shared/utils.js');

/**
 * NetworkMonitor class handles interception and analysis of network requests
 * to identify video streams and manifest files automatically
 */
class NetworkMonitor extends EventEmitter {
  constructor() {
    super();

    this.isEnabled = FEATURES.NETWORK_MONITORING;
    this.capturedRequests = new Map(); // URL -> request data
    this.manifestCache = new Map(); // URL -> manifest content
    this.activeStreams = new Map(); // tabId -> stream data
    this.requestFilters = REQUEST_FILTERS;

    this.init();
  }

  async init() {
    if (!this.isEnabled) {
      Logger.warn('Network monitoring is disabled');
      return;
    }

    try {
      // Check if we have required permissions
      const hasPermissions = await this.checkPermissions();
      if (!hasPermissions) {
        Logger.error('Missing required permissions for network monitoring');
        return;
      }

      this.setupRequestListeners();
      this.setupTabListeners();

      Logger.log('Network monitor initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize network monitor:', error);
    }
  }

  async checkPermissions() {
    try {
      const permissions = await chrome.permissions.getAll();
      return permissions.permissions.includes('webRequest');
    } catch (error) {
      Logger.error('Permission check failed:', error);
      return false;
    }
  }

  setupRequestListeners() {
    // Monitor requests for video-related URLs
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.handleRequest(details),
      {
        urls: this.requestFilters.VIDEO_URLS,
        types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other']
      },
      ['requestBody']
    );

    // Monitor response headers for content type detection
    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.handleResponse(details),
      {
        urls: this.requestFilters.VIDEO_URLS,
        types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other']
      },
      ['responseHeaders']
    );

    Logger.log('Request listeners setup complete');
  }

  setupTabListeners() {
    // Clean up data when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.activeStreams.delete(tabId);
      Logger.network(`Cleaned up data for closed tab: ${tabId}`);
    });

    // Clear data when navigating to new page
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        this.activeStreams.delete(tabId);
        Logger.network(`Cleared data for navigation in tab: ${tabId}`);
      }
    });
  }

  handleRequest(details) {
    Performance.start(`request-${details.requestId}`);

    const { url, tabId, type, method, requestId } = details;

    // Skip excluded URLs
    if (URLUtils.shouldExcludeURL(url)) {
      return;
    }

    // Detect stream format
    const streamFormat = URLUtils.detectStreamFormat(url);
    if (!streamFormat) {
      return;
    }

    Logger.network('Video request detected:', {
      url: URLUtils.cleanURL(url),
      format: streamFormat,
      tabId,
      type,
      method
    });

    // Store request data
    const requestData = {
      url,
      format: streamFormat,
      tabId,
      type,
      method,
      timestamp: Date.now(),
      requestId,
      quality: URLUtils.extractQuality(url),
      domain: URLUtils.extractDomain(url)
    };

    this.capturedRequests.set(requestId, requestData);

    // Emit event for other modules
    this.emit(EVENTS.STREAM_FOUND, requestData);

    Performance.end(`request-${details.requestId}`);
  }

  handleResponse(details) {
    const { responseHeaders, requestId, statusCode, url } = details;

    if (statusCode < 200 || statusCode >= 300) {
      return;
    }

    const requestData = this.capturedRequests.get(requestId);
    if (!requestData) {
      return;
    }

    // Extract content type and other useful headers
    const headers = this.parseResponseHeaders(responseHeaders);

    // Update request data with response info
    requestData.contentType = headers['content-type'];
    requestData.contentLength = headers['content-length'];
    requestData.statusCode = statusCode;

    Logger.network('Video response received:', {
      url: URLUtils.cleanURL(url),
      contentType: requestData.contentType,
      statusCode,
      contentLength: requestData.contentLength
    });

    // Handle manifest files (M3U8, MPD)
    if (this.isManifestFile(requestData)) {
      this.handleManifestResponse(requestData);
    }

    // Store stream data by tab
    this.addStreamToTab(requestData.tabId, requestData);
  }

  parseResponseHeaders(headers) {
    const parsed = {};

    if (headers) {
      headers.forEach(header => {
        parsed[header.name.toLowerCase()] = header.value;
      });
    }

    return parsed;
  }

  isManifestFile(requestData) {
    const { format, url, contentType } = requestData;

    // Check by format
    if (format === 'HLS' || format === 'DASH') {
      return true;
    }

    // Check by content type
    if (contentType) {
      const manifestTypes = [
        'application/vnd.apple.mpegurl',
        'application/x-mpegURL',
        'application/dash+xml'
      ];

      return manifestTypes.some(type => contentType.includes(type));
    }

    // Check by URL patterns
    return url.includes('.m3u8') || url.includes('.mpd');
  }

  async handleManifestResponse(requestData) {
    const { url, tabId } = requestData;

    try {
      // Fetch manifest content for analysis
      const manifestContent = await this.fetchManifestContent(url);

      if (manifestContent) {
        // Cache manifest
        this.manifestCache.set(url, {
          content: manifestContent,
          timestamp: Date.now(),
          tabId
        });

        // Emit for stream analysis
        this.emit(EVENTS.STREAM_FOUND, {
          ...requestData,
          manifestContent
        });

        Logger.network('Manifest cached:', URLUtils.cleanURL(url));
      }
    } catch (error) {
      Logger.error('Failed to fetch manifest content:', error);
    }
  }

  async fetchManifestContent(url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      Logger.error('Manifest fetch error:', error);
    }
    return null;
  }

  addStreamToTab(tabId, streamData) {
    if (!this.activeStreams.has(tabId)) {
      this.activeStreams.set(tabId, []);
    }

    const tabStreams = this.activeStreams.get(tabId);

    // Avoid duplicates
    const existing = tabStreams.find(stream => stream.url === streamData.url);
    if (!existing) {
      tabStreams.push(streamData);

      Logger.network(`Added stream to tab ${tabId}:`, {
        url: URLUtils.cleanURL(streamData.url),
        format: streamData.format
      });
    }
  }

  // Public API methods

  /**
   * Get all captured streams for a tab
   */
  getTabStreams(tabId) {
    return this.activeStreams.get(tabId) || [];
  }

  /**
   * Get manifest content for a URL
   */
  getManifestContent(url) {
    const cached = this.manifestCache.get(url);

    if (cached) {
      // Check if cache is still valid
      const age = Date.now() - cached.timestamp;
      if (age < ANALYSIS_CONFIG.MANIFEST_CACHE_DURATION) {
        return cached.content;
      } else {
        // Remove expired cache
        this.manifestCache.delete(url);
      }
    }

    return null;
  }

  /**
   * Get all streams grouped by format
   */
  getStreamsByFormat(tabId) {
    const streams = this.getTabStreams(tabId);
    const grouped = {};

    streams.forEach(stream => {
      if (!grouped[stream.format]) {
        grouped[stream.format] = [];
      }
      grouped[stream.format].push(stream);
    });

    return grouped;
  }

  /**
   * Find best quality stream for a tab
   */
  getBestQualityStream(tabId) {
    const streams = this.getTabStreams(tabId);

    if (streams.length === 0) return null;

    // Priority: HLS/DASH manifests > Progressive > Segments
    const manifestStreams = streams.filter(s => s.format === 'HLS' || s.format === 'DASH');
    if (manifestStreams.length > 0) {
      return manifestStreams[0];
    }

    const progressiveStreams = streams.filter(s => s.format === 'PROGRESSIVE');
    if (progressiveStreams.length > 0) {
      return progressiveStreams[0];
    }

    return streams[0];
  }

  /**
   * Clear all data for a tab
   */
  clearTabData(tabId) {
    this.activeStreams.delete(tabId);

    // Remove cached manifests for this tab
    for (const [url, cache] of this.manifestCache.entries()) {
      if (cache.tabId === tabId) {
        this.manifestCache.delete(url);
      }
    }
  }

  /**
   * Get statistics about captured streams
   */
  getStatistics() {
    const totalStreams = Array.from(this.activeStreams.values())
      .reduce((total, streams) => total + streams.length, 0);

    const formatCounts = {};
    this.activeStreams.forEach(streams => {
      streams.forEach(stream => {
        formatCounts[stream.format] = (formatCounts[stream.format] || 0) + 1;
      });
    });

    return {
      totalStreams,
      activeTabs: this.activeStreams.size,
      cachedManifests: this.manifestCache.size,
      formatDistribution: formatCounts
    };
  }

  /**
   * Enable/disable network monitoring
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    Logger.log(`Network monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Export the class
module.exports = { NetworkMonitor };