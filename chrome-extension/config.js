// Configuration for Chrome Extension
// This file can be loaded in content scripts without module imports

window.EXTENSION_CONFIG = {
  API_SERVER_URL: 'http://localhost:3000',
  ENDPOINTS: {
    VIDEO_PROCESS: '/api/video/process',
    VIDEO_DOWNLOAD: '/api/video/download',
    VIDEO_STATUS: '/api/video/status'
  }
};