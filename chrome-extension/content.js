// Content script for Cookie Education Assistant
// This script runs on web pages to facilitate communication between the web app and extension

console.log('🔗 Cookie Education Assistant content script loaded');
console.log('🌐 Current URL:', window.location.href);
console.log('🏷️ Extension ID:', chrome.runtime.id);

// Listen for messages from the web application
window.addEventListener('message', async (event) => {
  // Only accept messages from our domain
  if (event.origin !== 'http://localhost:3000') {
    return;
  }

  if (event.data.type === 'COOKIE_EDUCATION_EXTENSION_CHECK' && event.data.source === 'webapp') {
    console.log('📨 Received extension check request from web app');
    console.log('📋 Event data:', event.data);

    try {
      // Get consent status from background script
      console.log('🔄 Sending message to background script...');
      
      // Check if runtime is available
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        throw new Error('Chrome runtime not available');
      }
      
      // Wrap in try-catch to handle extension context issues
      let response;
      try {
        response = await chrome.runtime.sendMessage({ action: 'getConsentStatus' });
        console.log('📬 Response from background script:', response);
      } catch (runtimeError) {
        if (runtimeError.message.includes('Extension context invalidated') || 
            runtimeError.message.includes('message port closed')) {
          console.log('🔄 Extension context invalidated, responding with fallback');
          // Send fallback response indicating extension needs to be reloaded
          window.postMessage({
            type: 'COOKIE_EDUCATION_EXTENSION_RESPONSE',
            available: false,
            reason: 'context_invalidated',
            message: 'Extension needs to be reloaded'
          }, '*');
          return;
        }
        throw runtimeError;
      }
      
      if (response && response.granted && response.sessionId) {
        // Extension is available and has active consent
        window.postMessage({
          type: 'COOKIE_EDUCATION_EXTENSION_RESPONSE',
          available: true,
          sessionId: response.sessionId,
          domains: response.domains,
          expiresAt: response.expiresAt
        }, '*');

        console.log('✅ Responded to web app - extension available with session:', response.sessionId);
      } else {
        // Extension available but no consent
        window.postMessage({
          type: 'COOKIE_EDUCATION_EXTENSION_RESPONSE',
          available: false,
          reason: response ? 'no_consent' : 'communication_error'
        }, '*');

        console.log('❌ Responded to web app - extension not available (no consent)');
      }
    } catch (error) {
      console.error('❌ Error communicating with background script:', error);
      window.postMessage({
        type: 'COOKIE_EDUCATION_EXTENSION_RESPONSE',
        available: false,
        reason: 'error',
        error: error.message
      }, '*');
    }
  }

  // Handle requests to capture cookies from current domain
  if (event.data.type === 'COOKIE_EDUCATION_CAPTURE_REQUEST' && event.data.source === 'webapp') {
    console.log('📨 Received cookie capture request from web app');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'captureCurrentTab' });

      window.postMessage({
        type: 'COOKIE_EDUCATION_CAPTURE_RESPONSE',
        success: response.success || false,
        domain: window.location.hostname,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }, '*');

      console.log('✅ Cookie capture completed for domain:', window.location.hostname);
    } catch (error) {
      console.error('❌ Error capturing cookies:', error);
      window.postMessage({
        type: 'COOKIE_EDUCATION_CAPTURE_RESPONSE',
        success: false,
        error: error.message,
        domain: window.location.hostname
      }, '*');
    }
  }

  // Handle consent granting requests
  if (event.data.type === 'COOKIE_EDUCATION_GRANT_CONSENT' && event.data.source === 'webapp') {
    console.log('📨 Received consent grant request from web app');

    try {
      const domains = event.data.domains || ['*'];
      const response = await chrome.runtime.sendMessage({
        action: 'grantConsent',
        domains: domains
      });

      window.postMessage({
        type: 'COOKIE_EDUCATION_CONSENT_RESPONSE',
        success: response.success || false,
        domains: domains,
        timestamp: new Date().toISOString()
      }, '*');

      console.log('✅ Consent granted for domains:', domains);
    } catch (error) {
      console.error('❌ Error granting consent:', error);
      window.postMessage({
        type: 'COOKIE_EDUCATION_CONSENT_RESPONSE',
        success: false,
        error: error.message
      }, '*');
    }
  }
});

// Inject a marker element to help web app detect extension presence
const marker = document.createElement('div');
marker.id = 'cookie-education-extension-available';
marker.style.display = 'none';
document.documentElement.appendChild(marker);

console.log('🎯 Extension marker injected and message listener active');

// =============================================================================
// VIDEO DETECTION AND SELECTION SYSTEM
// =============================================================================

class VideoDetectionManager {
  constructor() {
    this.detectedVideos = new Map();
    this.overlays = new Map();
    this.selectedVideo = null;
    this.observerInitialized = false;

    this.init();
  }

  async init() {
    console.log('🎬 Initializing Video Detection Manager');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.startDetection());
    } else {
      this.startDetection();
    }
  }

  startDetection() {
    // Initial scan
    this.scanForVideos();

    // Set up mutation observer for dynamic content
    this.setupMutationObserver();

    // Periodic rescan for dynamic video loading
    setInterval(() => this.scanForVideos(), 3000);

    console.log('✅ Video detection system active');
  }

  scanForVideos() {
    const videoElements = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"]');
    let newVideosFound = 0;

    videoElements.forEach((element, index) => {
      const videoId = this.generateVideoId(element, index);

      if (!this.detectedVideos.has(videoId)) {
        const videoData = this.extractVideoMetadata(element, videoId);
        const category = this.categorizeVideo(element, videoData);

        // Only process videos that meet minimum criteria
        if (this.isValidVideo(videoData, category)) {
          this.detectedVideos.set(videoId, {
            ...videoData,
            category,
            element,
            detected: new Date().toISOString()
          });

          this.createVideoOverlay(element, videoId, videoData);
          newVideosFound++;
        }
      }
    });

    if (newVideosFound > 0) {
      console.log(`🎯 Found ${newVideosFound} new videos (${this.detectedVideos.size} total)`);
      this.notifyBackgroundScript();
    }
  }

  generateVideoId(element, index) {
    // Create unique ID based on element attributes and position
    const src = element.src || element.getAttribute('data-src') || '';
    const rect = element.getBoundingClientRect();
    return `video_${btoa(src + rect.width + rect.height + index).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12)}`;
  }

  extractVideoMetadata(element, videoId) {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);

    let metadata = {
      id: videoId,
      type: element.tagName.toLowerCase(),
      src: element.src || element.getAttribute('data-src') || '',
      title: this.extractTitle(element),
      duration: element.duration || 0,
      currentTime: element.currentTime || 0,
      width: rect.width,
      height: rect.height,
      isPlaying: element.tagName === 'VIDEO' ? !element.paused : false,
      hasControls: element.controls || false,
      isAutoplay: element.autoplay || false,
      isMuted: element.muted || false,
      isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
      zIndex: parseInt(computedStyle.zIndex) || 0,
      quality: this.estimateQuality(rect.width, rect.height),
      thumbnail: this.extractThumbnail(element)
    };

    // Handle iframe videos
    if (element.tagName === 'IFRAME') {
      metadata = this.enhanceIframeMetadata(element, metadata);
    }

    return metadata;
  }

  extractTitle(element) {
    // Try multiple methods to get video title
    const titleSources = [
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
      element.getAttribute('data-title'),
      element.closest('[data-title]')?.getAttribute('data-title'),
      element.closest('article, .video-item, .video-card')?.querySelector('h1, h2, h3, .title')?.textContent,
      document.title
    ];

    for (const title of titleSources) {
      if (title && title.trim().length > 0) {
        return title.trim().substring(0, 100);
      }
    }

    return 'Untitled Video';
  }

  extractThumbnail(element) {
    if (element.tagName === 'VIDEO') {
      return element.poster || this.generateVideoThumbnail(element);
    } else if (element.tagName === 'IFRAME') {
      // Extract thumbnail from iframe src or related elements
      const container = element.closest('.video-container, .video-wrapper');
      const thumbnailImg = container?.querySelector('img');
      return thumbnailImg?.src || null;
    }
    return null;
  }

  generateVideoThumbnail(videoElement) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 160;
      canvas.height = 90;
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.5);
    } catch (error) {
      return null;
    }
  }

  categorizeVideo(element, metadata) {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement;

    // Main content video indicators
    const isLargeVideo = rect.width > 400 && rect.height > 200;
    const hasControls = metadata.hasControls;
    const isCurrentlyPlaying = metadata.isPlaying;
    const isCenterOfViewport = this.isCenterOfViewport(rect);

    // Ad indicators
    const isSmallVideo = rect.width < 300 || rect.height < 150;
    const hasAdKeywords = this.hasAdKeywords(element);
    const isAutoplayWithoutControls = metadata.isAutoplay && !metadata.hasControls;

    // Background/decoration indicators
    const isBackground = rect.width < 100 || rect.height < 100;
    const isHidden = !metadata.isVisible || rect.width === 0 || rect.height === 0;

    // Categorization logic
    if (isHidden || isBackground) return 'hidden';
    if (hasAdKeywords || (isAutoplayWithoutControls && isSmallVideo)) return 'advertisement';
    if (isSmallVideo && !hasControls) return 'thumbnail';
    if (isCurrentlyPlaying && isLargeVideo && hasControls) return 'main';
    if (isCenterOfViewport && isLargeVideo) return 'main';
    if (isLargeVideo && hasControls) return 'content';

    return 'secondary';
  }

  isCenterOfViewport(rect) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const videoCenterX = rect.left + rect.width / 2;
    const videoCenterY = rect.top + rect.height / 2;

    return videoCenterX > viewportWidth * 0.2 && videoCenterX < viewportWidth * 0.8 &&
           videoCenterY > viewportHeight * 0.1 && videoCenterY < viewportHeight * 0.9;
  }

  hasAdKeywords(element) {
    const adKeywords = ['ad', 'advertisement', 'sponsored', 'promo', 'banner'];
    const textContent = (element.className + ' ' + element.id + ' ' +
                        (element.parentElement?.className || '')).toLowerCase();

    return adKeywords.some(keyword => textContent.includes(keyword));
  }

  estimateQuality(width, height) {
    if (width >= 1920 || height >= 1080) return '1080p+';
    if (width >= 1280 || height >= 720) return '720p';
    if (width >= 854 || height >= 480) return '480p';
    if (width >= 640 || height >= 360) return '360p';
    return 'low';
  }

  enhanceIframeMetadata(iframe, metadata) {
    const src = iframe.src;

    // YouTube iframe
    if (src.includes('youtube.com') || src.includes('youtu.be')) {
      const videoId = this.extractYouTubeId(src);
      metadata.platform = 'youtube';
      metadata.videoId = videoId;
      metadata.title = this.extractYouTubeTitle(iframe) || metadata.title;
    }

    // Vimeo iframe
    else if (src.includes('vimeo.com')) {
      metadata.platform = 'vimeo';
      metadata.videoId = this.extractVimeoId(src);
    }

    return metadata;
  }

  extractYouTubeId(url) {
    const match = url.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([^?&]+)/);
    return match ? match[1] : null;
  }

  extractVimeoId(url) {
    const match = url.match(/vimeo\.com\/(?:embed\/)?(\d+)/);
    return match ? match[1] : null;
  }

  extractYouTubeTitle(iframe) {
    // Try to find title in nearby elements
    const container = iframe.closest('.video-container, .video-wrapper, article');
    const titleElement = container?.querySelector('h1, h2, h3, .title, [data-title]');
    return titleElement?.textContent?.trim();
  }

  isValidVideo(metadata, category) {
    // Filter criteria for videos worth showing to user
    if (category === 'hidden') return false;
    if (metadata.width < 100 || metadata.height < 100) return false;
    if (metadata.duration > 0 && metadata.duration < 5) return false; // Very short videos

    return true;
  }

  createVideoOverlay(element, videoId, metadata) {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'video-downloader-overlay';
    overlay.dataset.videoId = videoId;
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      z-index: 10000;
      pointer-events: none;
      border-radius: 8px;
    `;

    // Create download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'video-download-btn';
    downloadBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        📥 <span>Download Video</span>
      </div>
    `;
    downloadBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 12px 20px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
    `;

    // Add hover effects to button
    downloadBtn.addEventListener('mouseenter', () => {
      downloadBtn.style.background = '#1565c0';
      downloadBtn.style.transform = 'translate(-50%, -50%) scale(1.05)';
    });

    downloadBtn.addEventListener('mouseleave', () => {
      downloadBtn.style.background = '#1976d2';
      downloadBtn.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // Handle download button click
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectVideo(videoId);
    });

    overlay.appendChild(downloadBtn);

    // Position overlay relative to video
    this.positionOverlay(element, overlay);

    // Add hover listeners to video element
    element.addEventListener('mouseenter', () => this.showOverlay(videoId));
    element.addEventListener('mouseleave', () => this.hideOverlay(videoId));

    // Store overlay reference
    this.overlays.set(videoId, overlay);

    // Insert overlay into DOM
    this.insertOverlay(element, overlay);
  }

  positionOverlay(videoElement, overlay) {
    const rect = videoElement.getBoundingClientRect();
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;

    overlay.style.position = 'fixed';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  insertOverlay(videoElement, overlay) {
    // Try to insert overlay as sibling to maintain proper positioning
    const parent = videoElement.parentElement;
    if (parent) {
      parent.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }
  }

  showOverlay(videoId) {
    const overlay = this.overlays.get(videoId);
    const videoData = this.detectedVideos.get(videoId);

    if (overlay && videoData) {
      // Update overlay position in case video moved
      this.positionOverlay(videoData.element, overlay);
      overlay.style.display = 'block';

      console.log('👁️ Showing overlay for:', videoData.title);
    }
  }

  hideOverlay(videoId) {
    const overlay = this.overlays.get(videoId);
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  selectVideo(videoId) {
    const videoData = this.detectedVideos.get(videoId);
    if (!videoData) return;

    this.selectedVideo = videoId;
    console.log('🎯 Video selected:', videoData.title);

    // Hide overlay
    this.hideOverlay(videoId);

    // Add visual selection indicator
    this.addSelectionIndicator(videoData.element);

    // Notify background script about selection
    this.notifyVideoSelection(videoData);
  }

  addSelectionIndicator(element) {
    // Remove previous indicators
    document.querySelectorAll('.video-selected-indicator').forEach(el => el.remove());

    // Add selection border
    const indicator = document.createElement('div');
    indicator.className = 'video-selected-indicator';
    indicator.style.cssText = `
      position: fixed;
      border: 3px solid #4caf50;
      border-radius: 8px;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
    `;

    const rect = element.getBoundingClientRect();
    indicator.style.top = rect.top - 3 + 'px';
    indicator.style.left = rect.left - 3 + 'px';
    indicator.style.width = rect.width + 6 + 'px';
    indicator.style.height = rect.height + 6 + 'px';

    document.body.appendChild(indicator);

    // Remove indicator after 3 seconds
    setTimeout(() => indicator.remove(), 3000);
  }

  async notifyVideoSelection(videoData) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'videoSelected',
        video: {
          id: videoData.id,
          title: videoData.title,
          src: videoData.src,
          duration: videoData.duration,
          quality: videoData.quality,
          category: videoData.category,
          platform: videoData.platform,
          thumbnail: videoData.thumbnail,
          width: videoData.width,
          height: videoData.height
        }
      });

      console.log('📤 Video selection sent to background:', response);
    } catch (error) {
      console.error('❌ Failed to notify video selection:', error);
    }
  }

  async notifyBackgroundScript() {
    try {
      const videosArray = Array.from(this.detectedVideos.values()).map(video => ({
        id: video.id,
        title: video.title,
        category: video.category,
        quality: video.quality,
        duration: video.duration,
        width: video.width,
        height: video.height,
        isPlaying: video.isPlaying,
        platform: video.platform || 'html5'
      }));

      await chrome.runtime.sendMessage({
        action: 'videosDetected',
        videos: videosArray,
        count: videosArray.length,
        url: window.location.href
      });
    } catch (error) {
      console.error('❌ Failed to notify background about detected videos:', error);
    }
  }

  setupMutationObserver() {
    if (this.observerInitialized) return;

    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;

      mutations.forEach((mutation) => {
        // Check for added video elements
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO' || node.tagName === 'IFRAME' ||
                node.querySelector && node.querySelector('video, iframe')) {
              shouldRescan = true;
            }
          }
        });
      });

      if (shouldRescan) {
        setTimeout(() => this.scanForVideos(), 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observerInitialized = true;
    console.log('👀 Mutation observer initialized for dynamic video detection');
  }

  getDetectedVideos() {
    return Array.from(this.detectedVideos.values());
  }

  getVideoById(videoId) {
    return this.detectedVideos.get(videoId);
  }
}

// Initialize video detection manager
const videoManager = new VideoDetectionManager();

// =============================================================================
// STREAM ANALYSIS INTEGRATION
// =============================================================================

// Dynamically load stream analysis modules if features are enabled
async function loadStreamAnalysisModules() {
  try {
    // Check if user has granted optional permissions
    const hasPermissions = await chrome.permissions.contains({
      permissions: ['webRequest', 'webRequestBlocking']
    });

    if (hasPermissions) {
      // Dynamically import modules to avoid loading if not needed
      const { streamAnalyzer } = await import('./modules/stream-analyzer.js');

      // Initialize stream analyzer
      window.streamAnalyzer = streamAnalyzer;

      // Connect stream analyzer to video selection
      videoManager.onVideoSelected = async (videoData) => {
        console.log('🔬 Starting stream analysis for:', videoData.title);

        try {
          const analysis = await streamAnalyzer.analyzeVideo(videoData);

          // Enhance video data with analysis
          videoData.streamAnalysis = analysis;

          // Notify background script
          await chrome.runtime.sendMessage({
            action: 'streamAnalyzed',
            videoId: videoData.id,
            analysis: analysis
          });

          console.log('✅ Stream analysis complete:', {
            downloadable: analysis.downloadable,
            format: analysis.format,
            qualityOptions: analysis.qualityOptions?.length || 0
          });

        } catch (error) {
          console.error('❌ Stream analysis failed:', error);
        }
      };

      console.log('✅ Stream analysis modules loaded');
    } else {
      console.log('ℹ️ Stream analysis requires additional permissions');
    }
  } catch (error) {
    console.error('❌ Failed to load stream analysis modules:', error);
  }
}

// Enhanced video selection with stream analysis
class EnhancedVideoDetectionManager extends VideoDetectionManager {
  constructor() {
    super();
    this.onVideoSelected = null;
  }

  async selectVideo(videoId) {
    // Call parent method
    super.selectVideo(videoId);

    // Trigger stream analysis if callback is set
    if (this.onVideoSelected) {
      const videoData = this.detectedVideos.get(videoId);
      if (videoData) {
        await this.onVideoSelected(videoData);
      }
    }
  }

  async notifyVideoSelection(videoData) {
    // Enhanced notification with stream analysis
    try {
      const message = {
        action: 'videoSelected',
        video: {
          id: videoData.id,
          title: videoData.title,
          src: videoData.src,
          duration: videoData.duration,
          quality: videoData.quality,
          category: videoData.category,
          platform: videoData.platform,
          thumbnail: videoData.thumbnail,
          width: videoData.width,
          height: videoData.height,
          streamAnalysis: videoData.streamAnalysis || null
        }
      };

      const response = await chrome.runtime.sendMessage(message);
      console.log('📤 Enhanced video selection sent to background:', response);
    } catch (error) {
      console.error('❌ Failed to notify video selection:', error);
    }
  }
}

// Replace original video manager with enhanced version
const enhancedVideoManager = new EnhancedVideoDetectionManager();

// Copy existing detected videos to enhanced manager
enhancedVideoManager.detectedVideos = videoManager.detectedVideos;
enhancedVideoManager.overlays = videoManager.overlays;
enhancedVideoManager.selectedVideo = videoManager.selectedVideo;

// Initialize stream analysis modules
loadStreamAnalysisModules();

// Expose enhanced manager to global scope
window.videoManager = enhancedVideoManager;
window.streamAnalyzer = null; // Will be set by loadStreamAnalysisModules