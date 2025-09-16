// =============================================================================
// STREAM ANALYZER MODULE
// =============================================================================

import { FEATURES, STREAM_FORMATS, EVENTS, ANALYSIS_CONFIG, DOWNLOAD_STATUS } from '../shared/constants.js';
import { Logger, URLUtils, StreamUtils, EventEmitter, AsyncUtils, Performance } from '../shared/utils.js';

/**
 * StreamAnalyzer class analyzes video streams to determine downloadability,
 * quality options, and optimal download strategies
 */
export class StreamAnalyzer extends EventEmitter {
  constructor() {
    super();

    this.isEnabled = FEATURES.STREAM_ANALYSIS;
    this.analysisCache = new Map(); // videoId -> analysis results
    this.pendingAnalysis = new Map(); // videoId -> promise
    this.analysisQueue = [];

    this.init();
  }

  async init() {
    if (!this.isEnabled) {
      Logger.warn('Stream analysis is disabled');
      return;
    }

    // Listen for stream detection events
    this.setupEventListeners();

    Logger.log('Stream analyzer initialized successfully');
  }

  setupEventListeners() {
    // Listen for video selection events
    document.addEventListener('video:selected', (event) => {
      this.handleVideoSelected(event.detail);
    });

    // Listen for network monitor stream events
    if (window.networkMonitor) {
      window.networkMonitor.on(EVENTS.STREAM_FOUND, (streamData) => {
        this.handleStreamFound(streamData);
      });
    }
  }

  async handleVideoSelected(videoData) {
    if (!videoData || !videoData.element) return;

    Logger.stream('Analyzing selected video:', videoData.title);

    try {
      const analysis = await this.analyzeVideo(videoData);

      this.emit(EVENTS.STREAM_ANALYZED, {
        video: videoData,
        analysis
      });

      Logger.stream('Video analysis complete:', {
        videoId: videoData.id,
        downloadable: analysis.downloadable,
        qualityOptions: analysis.qualityOptions?.length || 0
      });

    } catch (error) {
      Logger.error('Video analysis failed:', error);

      this.emit(EVENTS.ERROR_OCCURRED, {
        type: 'ANALYSIS_ERROR',
        video: videoData,
        error: error.message
      });
    }
  }

  async handleStreamFound(streamData) {
    Logger.stream('Processing detected stream:', URLUtils.cleanURL(streamData.url));

    // Add to analysis queue for batch processing
    this.analysisQueue.push(streamData);

    // Process queue with debouncing
    this.debouncedProcessQueue();
  }

  debouncedProcessQueue = this.debounce(() => {
    this.processAnalysisQueue();
  }, 1000);

  async processAnalysisQueue() {
    if (this.analysisQueue.length === 0) return;

    const streamsToProcess = [...this.analysisQueue];
    this.analysisQueue = [];

    Logger.stream(`Processing ${streamsToProcess.length} streams from queue`);

    // Group by tab for efficient processing
    const streamsByTab = {};
    streamsToProcess.forEach(stream => {
      if (!streamsByTab[stream.tabId]) {
        streamsByTab[stream.tabId] = [];
      }
      streamsByTab[stream.tabId].push(stream);
    });

    // Process each tab's streams
    for (const [tabId, streams] of Object.entries(streamsByTab)) {
      try {
        await this.analyzeTabStreams(parseInt(tabId), streams);
      } catch (error) {
        Logger.error(`Failed to analyze streams for tab ${tabId}:`, error);
      }
    }
  }

  /**
   * Analyze a video element and its associated streams
   */
  async analyzeVideo(videoData) {
    const videoId = videoData.id;

    // Check cache first
    if (this.analysisCache.has(videoId)) {
      const cached = this.analysisCache.get(videoId);
      if (Date.now() - cached.timestamp < ANALYSIS_CONFIG.MANIFEST_CACHE_DURATION) {
        return cached.analysis;
      }
    }

    // Check if analysis is already in progress
    if (this.pendingAnalysis.has(videoId)) {
      return await this.pendingAnalysis.get(videoId);
    }

    // Start new analysis
    const analysisPromise = this.performVideoAnalysis(videoData);
    this.pendingAnalysis.set(videoId, analysisPromise);

    try {
      const analysis = await analysisPromise;

      // Cache results
      this.analysisCache.set(videoId, {
        analysis,
        timestamp: Date.now()
      });

      return analysis;
    } finally {
      this.pendingAnalysis.delete(videoId);
    }
  }

  async performVideoAnalysis(videoData) {
    Performance.start(`analysis-${videoData.id}`);

    const element = videoData.element;
    const analysis = {
      videoId: videoData.id,
      status: DOWNLOAD_STATUS.ANALYZING,
      downloadable: false,
      streams: [],
      qualityOptions: [],
      format: null,
      directURL: null,
      manifestURL: null,
      audioTracks: [],
      subtitles: [],
      metadata: {},
      recommendations: []
    };

    try {
      // 1. Analyze the video element itself
      await this.analyzeVideoElement(element, analysis);

      // 2. Check for associated network streams
      await this.analyzeNetworkStreams(videoData, analysis);

      // 3. Attempt to extract direct URLs
      await this.extractDirectURLs(element, analysis);

      // 4. Analyze manifest files if available
      await this.analyzeManifestFiles(analysis);

      // 5. Determine downloadability
      this.determineDownloadability(analysis);

      // 6. Generate recommendations
      this.generateRecommendations(analysis);

      analysis.status = analysis.downloadable ? DOWNLOAD_STATUS.READY : DOWNLOAD_STATUS.FAILED;

    } catch (error) {
      Logger.error('Analysis error:', error);
      analysis.status = DOWNLOAD_STATUS.FAILED;
      analysis.error = error.message;
    }

    Performance.end(`analysis-${videoData.id}`);
    return analysis;
  }

  async analyzeVideoElement(element, analysis) {
    // Extract basic video properties
    analysis.metadata = {
      duration: element.duration || 0,
      width: element.videoWidth || element.clientWidth,
      height: element.videoHeight || element.clientHeight,
      currentTime: element.currentTime || 0,
      paused: element.paused,
      muted: element.muted,
      volume: element.volume,
      poster: element.poster
    };

    // Check for direct source URLs
    if (element.src && !element.src.startsWith('blob:')) {
      analysis.directURL = element.src;
      analysis.format = URLUtils.detectStreamFormat(element.src) || 'PROGRESSIVE';
    }

    // Check source elements
    const sources = element.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src && !source.src.startsWith('blob:')) {
        analysis.streams.push({
          url: source.src,
          type: source.type,
          format: URLUtils.detectStreamFormat(source.src),
          quality: URLUtils.extractQuality(source.src)
        });
      }
    });

    // Check for track elements (subtitles)
    const tracks = element.querySelectorAll('track');
    tracks.forEach(track => {
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        analysis.subtitles.push({
          src: track.src,
          label: track.label,
          language: track.srclang,
          kind: track.kind
        });
      }
    });
  }

  async analyzeNetworkStreams(videoData, analysis) {
    // Get streams from network monitor if available
    if (window.networkMonitor) {
      const tabStreams = window.networkMonitor.getTabStreams(videoData.tabId || 0);

      tabStreams.forEach(stream => {
        if (!analysis.streams.find(s => s.url === stream.url)) {
          analysis.streams.push({
            url: stream.url,
            format: stream.format,
            quality: stream.quality,
            domain: stream.domain,
            timestamp: stream.timestamp
          });
        }
      });

      // Look for manifest files
      const manifestStreams = tabStreams.filter(s => s.format === 'HLS' || s.format === 'DASH');
      if (manifestStreams.length > 0) {
        analysis.manifestURL = manifestStreams[0].url;
        analysis.format = manifestStreams[0].format;
      }
    }
  }

  async extractDirectURLs(element, analysis) {
    // Try to extract URLs from various properties
    const potentialURLs = [
      element.getAttribute('data-src'),
      element.getAttribute('data-url'),
      element.getAttribute('data-video-src')
    ].filter(Boolean);

    for (const url of potentialURLs) {
      if (!URLUtils.shouldExcludeURL(url)) {
        const format = URLUtils.detectStreamFormat(url);
        if (format) {
          analysis.streams.push({
            url,
            format,
            quality: URLUtils.extractQuality(url),
            source: 'element-attribute'
          });
        }
      }
    }
  }

  async analyzeManifestFiles(analysis) {
    if (!analysis.manifestURL) return;

    try {
      // Get manifest content from network monitor or fetch directly
      let manifestContent = null;
      if (window.networkMonitor) {
        manifestContent = window.networkMonitor.getManifestContent(analysis.manifestURL);
      }

      if (!manifestContent) {
        const response = await AsyncUtils.timeout(
          fetch(analysis.manifestURL),
          ANALYSIS_CONFIG.REQUEST_TIMEOUT
        );
        manifestContent = await response.text();
      }

      if (manifestContent) {
        const parsedManifest = this.parseManifest(manifestContent, analysis.format);
        if (parsedManifest) {
          analysis.qualityOptions = parsedManifest.streams || [];
          analysis.hasMultipleQualities = parsedManifest.hasMultipleQualities;
        }
      }
    } catch (error) {
      Logger.error('Manifest analysis failed:', error);
    }
  }

  parseManifest(content, format) {
    switch (format) {
      case 'HLS':
        return StreamUtils.parseM3U8(content);
      case 'DASH':
        return StreamUtils.parseMPD(content);
      default:
        return null;
    }
  }

  async analyzeTabStreams(tabId, streams) {
    // Group streams by format and analyze patterns
    const streamsByFormat = {};
    streams.forEach(stream => {
      if (!streamsByFormat[stream.format]) {
        streamsByFormat[stream.format] = [];
      }
      streamsByFormat[stream.format].push(stream);
    });

    // Emit analysis results for this tab
    this.emit(EVENTS.STREAM_ANALYZED, {
      tabId,
      streams: streamsByFormat,
      hasManifests: streams.some(s => s.format === 'HLS' || s.format === 'DASH'),
      totalStreams: streams.length
    });
  }

  determineDownloadability(analysis) {
    // Check if we have any usable streams
    const hasDirectURL = analysis.directURL && !analysis.directURL.startsWith('blob:');
    const hasValidStreams = analysis.streams.length > 0;
    const hasManifest = analysis.manifestURL;

    analysis.downloadable = hasDirectURL || hasValidStreams || hasManifest;

    // Determine confidence level
    if (hasManifest && analysis.qualityOptions.length > 0) {
      analysis.confidence = 'high';
    } else if (hasDirectURL || hasValidStreams) {
      analysis.confidence = 'medium';
    } else {
      analysis.confidence = 'low';
    }
  }

  generateRecommendations(analysis) {
    analysis.recommendations = [];

    if (!analysis.downloadable) {
      analysis.recommendations.push({
        type: 'warning',
        message: 'No downloadable streams detected'
      });
      return;
    }

    if (analysis.format === 'HLS' || analysis.format === 'DASH') {
      analysis.recommendations.push({
        type: 'info',
        message: 'Adaptive streaming detected - multiple quality options available'
      });
    }

    if (analysis.streams.length > 1) {
      analysis.recommendations.push({
        type: 'info',
        message: `${analysis.streams.length} stream options found`
      });
    }

    if (analysis.subtitles.length > 0) {
      analysis.recommendations.push({
        type: 'info',
        message: `${analysis.subtitles.length} subtitle tracks available`
      });
    }
  }

  // Utility methods

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Get analysis results for a video
   */
  getAnalysis(videoId) {
    const cached = this.analysisCache.get(videoId);
    return cached ? cached.analysis : null;
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
    this.pendingAnalysis.clear();
    Logger.stream('Analysis cache cleared');
  }

  /**
   * Get analysis statistics
   */
  getStatistics() {
    const cached = Array.from(this.analysisCache.values());
    const downloadable = cached.filter(c => c.analysis.downloadable).length;

    return {
      totalAnalyzed: cached.length,
      downloadable,
      downloadablePercentage: cached.length > 0 ? (downloadable / cached.length * 100).toFixed(1) : 0,
      queueSize: this.analysisQueue.length,
      pendingAnalysis: this.pendingAnalysis.size
    };
  }

  /**
   * Force analysis of a specific video
   */
  async forceAnalyze(videoData) {
    // Remove from cache to force fresh analysis
    this.analysisCache.delete(videoData.id);
    return await this.analyzeVideo(videoData);
  }
}

// Create singleton instance
export const streamAnalyzer = new StreamAnalyzer();

// Export class for testing
export default StreamAnalyzer;