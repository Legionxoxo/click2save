// =============================================================================
// SHARED CONSTANTS AND CONFIGURATION
// =============================================================================

// Feature flags for modular functionality
export const FEATURES = {
  VIDEO_SELECTION: true,        // Core video selection (always enabled)
  STREAM_ANALYSIS: true,        // Analyze video streams for downloadability
  NETWORK_MONITORING: true,     // Monitor network requests for video URLs
  DOWNLOAD_PIPELINE: false,     // Full download processing (future)
  PROGRESS_TRACKING: false,     // Real-time download progress (future)
  BULK_DOWNLOADS: false         // Multiple video downloads (future)
};

// Module configuration
export const MODULES = {
  NETWORK_MONITORING: true,
  BACKGROUND_ANALYSIS: true,
  REAL_TIME_PROGRESS: false
};

// Video stream format detection
export const STREAM_FORMATS = {
  HLS: {
    extensions: ['.m3u8'],
    mimeTypes: ['application/vnd.apple.mpegurl', 'application/x-mpegURL'],
    indicators: ['m3u8', 'playlist.m3u8', 'index.m3u8']
  },
  DASH: {
    extensions: ['.mpd'],
    mimeTypes: ['application/dash+xml'],
    indicators: ['mpd', 'manifest.mpd']
  },
  PROGRESSIVE: {
    extensions: ['.mp4', '.webm', '.avi', '.mov', '.mkv'],
    mimeTypes: ['video/mp4', 'video/webm', 'video/avi', 'video/quicktime'],
    indicators: []
  },
  SEGMENTS: {
    extensions: ['.ts', '.m4s', '.mp4'],
    mimeTypes: ['video/mp2t', 'video/mp4'],
    indicators: ['segment', 'chunk']
  }
};

// Quality detection patterns
export const QUALITY_PATTERNS = {
  '4K': ['2160p', '4k', '3840x2160', '4096x2160'],
  '1440p': ['1440p', '2k', '2560x1440'],
  '1080p': ['1080p', 'fhd', '1920x1080'],
  '720p': ['720p', 'hd', '1280x720'],
  '480p': ['480p', 'sd', '854x480', '640x480'],
  '360p': ['360p', '640x360'],
  '240p': ['240p', '426x240'],
  '144p': ['144p', '256x144']
};

// Network request filtering
export const REQUEST_FILTERS = {
  VIDEO_URLS: [
    '*://*/*.m3u8*',
    '*://*/*.mpd*',
    '*://*/*.mp4*',
    '*://*/*.webm*',
    '*://*/*.ts*',
    '*://*/*.m4s*'
  ],
  EXCLUDE_PATTERNS: [
    'data:',
    'blob:',
    'chrome-extension:',
    'moz-extension:'
  ],
  PLATFORM_PATTERNS: {
    youtube: ['youtube.com', 'youtu.be', 'googlevideo.com'],
    vimeo: ['vimeo.com', 'vimeocdn.com'],
    twitch: ['twitch.tv', 'ttvnw.net'],
    dailymotion: ['dailymotion.com', 'dmcdn.net'],
    facebook: ['facebook.com', 'fbcdn.net'],
    instagram: ['instagram.com', 'cdninstagram.com']
  }
};

// Stream analysis configuration
export const ANALYSIS_CONFIG = {
  MAX_SEGMENTS_TO_ANALYZE: 10,
  REQUEST_TIMEOUT: 5000,
  RETRY_ATTEMPTS: 3,
  QUALITY_DETECTION_TIMEOUT: 2000,
  MANIFEST_CACHE_DURATION: 300000, // 5 minutes
};

// Event types for module communication
export const EVENTS = {
  VIDEO_DETECTED: 'video:detected',
  VIDEO_SELECTED: 'video:selected',
  STREAM_FOUND: 'stream:found',
  STREAM_ANALYZED: 'stream:analyzed',
  DOWNLOAD_REQUESTED: 'download:requested',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_COMPLETE: 'download:complete',
  ERROR_OCCURRED: 'error:occurred'
};

// Error types
export const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  FORMAT_ERROR: 'FORMAT_ERROR'
};

// Download status types
export const DOWNLOAD_STATUS = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  READY: 'ready',
  DOWNLOADING: 'downloading',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// UI Constants
export const UI_CONSTANTS = {
  OVERLAY_Z_INDEX: 2147483647,
  NOTIFICATION_DURATION: 3000,
  PROGRESS_UPDATE_INTERVAL: 1000,
  MAX_TITLE_LENGTH: 100,
  THUMBNAIL_SIZE: { width: 160, height: 90 }
};

// Debug configuration
export const DEBUG = {
  ENABLED: true,
  LOG_NETWORK_REQUESTS: false,
  LOG_STREAM_ANALYSIS: true,
  LOG_VIDEO_DETECTION: false,
  PERFORMANCE_TIMING: false
};

// Export default configuration object
export default {
  FEATURES,
  MODULES,
  STREAM_FORMATS,
  QUALITY_PATTERNS,
  REQUEST_FILTERS,
  ANALYSIS_CONFIG,
  EVENTS,
  ERROR_TYPES,
  DOWNLOAD_STATUS,
  UI_CONSTANTS,
  DEBUG
};