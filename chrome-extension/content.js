// Content script for Video Downloader Assistant
// This script runs on web pages to detect videos and provide download functionality

console.log('🎬 Video Downloader Assistant content script loaded');
console.log('🌐 Current URL:', window.location.href);

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
      document.addEventListener('DOMContentLoaded', () =>
        this.startDetection()
      );
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
    console.log('🔍 Scanning for videos on:', window.location.href);

    const videoElements = document.querySelectorAll(
      `
      video,
      iframe[src*="youtube"],
      iframe[src*="vimeo"],
      iframe[src*="dailymotion"],
      iframe[src*="twitter.com"],
      iframe[src*="x.com"],
      [data-testid*="videoPlayer"],
      [data-testid="videoComponent"],
      [aria-label*="video" i],
      [role="button"][aria-label*="play" i],
      .video-player,
      .tweet-video,
      [class*="video" i][class*="player" i],
      [data-video-url],
      [data-poster],
      video[poster]
    `
        .replace(/\s+/g, ' ')
        .trim()
    );

    console.log(`🎯 Found ${videoElements.length} potential video elements`);
    let newVideosFound = 0;

    // Debug logging for X.com
    if (
      window.location.hostname.includes('x.com') ||
      window.location.hostname.includes('twitter.com')
    ) {
      console.log(
        `🔍 Scanning X.com - found ${videoElements.length} potential video elements:`,
        Array.from(videoElements).map(el => ({
          tag: el.tagName,
          classes: el.className,
          testId: el.getAttribute('data-testid'),
          src: el.src || 'no-src',
        }))
      );
    }

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
            detected: new Date().toISOString(),
          });

          this.createVideoOverlay(element, videoId, videoData);
          newVideosFound++;
        }
      }
    });

    if (newVideosFound > 0) {
      console.log(
        `🎯 Found ${newVideosFound} new videos (${this.detectedVideos.size} total)`
      );
      this.notifyBackgroundScript();
    }
  }

  generateVideoId(element, index) {
    // Create unique ID based on element attributes and position
    const src = element.src || element.getAttribute('data-src') || '';
    const rect = element.getBoundingClientRect();
    return `video_${btoa(src + rect.width + rect.height + index)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 12)}`;
  }

  extractVideoMetadata(element, videoId) {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);

    let metadata = {
      id: videoId,
      type: element.tagName.toLowerCase(),
      src: this.extractVideoSrc(element),
      title: this.extractTitle(element),
      duration: element.duration || 0,
      currentTime: element.currentTime || 0,
      width: rect.width,
      height: rect.height,
      isPlaying: element.tagName === 'VIDEO' ? !element.paused : false,
      hasControls: element.controls || false,
      isAutoplay: element.autoplay || false,
      isMuted: element.muted || false,
      isVisible:
        computedStyle.display !== 'none' &&
        computedStyle.visibility !== 'hidden',
      zIndex: parseInt(computedStyle.zIndex) || 0,
      quality: this.estimateQuality(rect.width, rect.height),
      thumbnail: this.extractThumbnail(element),
    };

    // Handle iframe videos
    if (element.tagName === 'IFRAME') {
      metadata = this.enhanceIframeMetadata(element, metadata);
    }

    return metadata;
  }

  extractVideoSrc(element) {
    // Handle different ways videos are referenced on social media
    const src =
      element.src ||
      element.getAttribute('data-src') ||
      element.getAttribute('data-video-url') ||
      element.getAttribute('data-poster') ||
      '';

    // For Twitter/X video containers, look for nested video elements
    if (
      !src &&
      (element.classList.contains('video-player') ||
        element.getAttribute('data-testid'))
    ) {
      const nestedVideo = element.querySelector('video');
      if (nestedVideo) {
        return nestedVideo.src || nestedVideo.getAttribute('data-src') || '';
      }

      // Look for background video URLs in style attributes
      const style = element.getAttribute('style') || '';
      const bgVideoMatch = style.match(
        /url\(['"]([^'"]*\.(?:mp4|webm|ogg))['"]\)/i
      );
      if (bgVideoMatch) {
        return bgVideoMatch[1];
      }
    }

    // For iframe elements, return the iframe src
    if (element.tagName === 'IFRAME') {
      return element.src;
    }

    // Extract from data attributes commonly used by video players
    const dataAttrs = [
      'data-video',
      'data-src',
      'data-source',
      'data-url',
      'data-mp4',
      'data-webm',
      'data-stream',
      'data-file',
    ];

    for (const attr of dataAttrs) {
      const value = element.getAttribute(attr);
      if (
        value &&
        (value.includes('.mp4') ||
          value.includes('.webm') ||
          value.includes('blob:'))
      ) {
        return value;
      }
    }

    return src;
  }

  extractTitle(element) {
    // Try multiple methods to get video title
    const titleSources = [
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
      element.getAttribute('data-title'),
      element.closest('[data-title]')?.getAttribute('data-title'),
      element
        .closest('article, .video-item, .video-card')
        ?.querySelector('h1, h2, h3, .title')?.textContent,
      document.title,
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
    const isAutoplayWithoutControls =
      metadata.isAutoplay && !metadata.hasControls;

    // Background/decoration indicators
    const isBackground = rect.width < 100 || rect.height < 100;
    const isHidden =
      !metadata.isVisible || rect.width === 0 || rect.height === 0;

    // Categorization logic
    if (isHidden || isBackground) return 'hidden';
    if (hasAdKeywords || (isAutoplayWithoutControls && isSmallVideo))
      return 'advertisement';
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

    return (
      videoCenterX > viewportWidth * 0.2 &&
      videoCenterX < viewportWidth * 0.8 &&
      videoCenterY > viewportHeight * 0.1 &&
      videoCenterY < viewportHeight * 0.9
    );
  }

  hasAdKeywords(element) {
    const adKeywords = ['ad', 'advertisement', 'sponsored', 'promo', 'banner'];
    const textContent = (
      element.className +
      ' ' +
      element.id +
      ' ' +
      (element.parentElement?.className || '')
    ).toLowerCase();

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
    const container = iframe.closest(
      '.video-container, .video-wrapper, article'
    );
    const titleElement = container?.querySelector(
      'h1, h2, h3, .title, [data-title]'
    );
    return titleElement?.textContent?.trim();
  }

  isValidVideo(metadata, category) {
    // Filter criteria for videos worth showing to user
    if (category === 'hidden') return false;

    // More lenient size requirements for social media
    const isOnSocialMedia =
      window.location.hostname.includes('x.com') ||
      window.location.hostname.includes('twitter.com') ||
      window.location.hostname.includes('instagram.com') ||
      window.location.hostname.includes('tiktok.com');

    const minWidth = isOnSocialMedia ? 50 : 100;
    const minHeight = isOnSocialMedia ? 50 : 100;

    if (metadata.width < minWidth || metadata.height < minHeight) return false;
    if (metadata.duration > 0 && metadata.duration < 3) return false; // Very short videos

    // Accept videos without src if they have data attributes (social media)
    if (!metadata.src && !isOnSocialMedia) return false;

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
    downloadBtn.addEventListener('click', e => {
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

  async selectVideo(videoId) {
    const videoData = this.detectedVideos.get(videoId);
    if (!videoData) return;

    this.selectedVideo = videoId;
    console.log('🎯 Video selected:', videoData.title);

    // Hide overlay
    this.hideOverlay(videoId);

    // Add visual selection indicator
    this.addSelectionIndicator(videoData.element);

    // Show consent dialog and process video
    await this.showConsentAndProcessVideo(videoData);
  }

  async showConsentAndProcessVideo(videoData) {
    return new Promise(resolve => {
      // Create consent dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10002;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      const dialogContent = document.createElement('div');
      dialogContent.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      `;

      dialogContent.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 24px; margin-right: 12px;">🎬</div>
          <h3 style="margin: 0; color: #333;">Download Video</h3>
        </div>
        <p style="color: #666; margin: 16px 0; line-height: 1.5;">
          To download "<strong>${videoData.title}</strong>", we need your permission to access cookies from this website.
          Cookies may be required for authentication to download the video.
        </p>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
          <button id="cancel-btn" style="
            padding: 10px 20px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            color: #666;
          ">Cancel</button>
          <button id="consent-btn" style="
            padding: 10px 20px;
            border: none;
            background: #1976d2;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
          ">Allow & Download</button>
        </div>
      `;

      dialog.appendChild(dialogContent);
      document.body.appendChild(dialog);

      // Handle button clicks
      dialogContent
        .querySelector('#cancel-btn')
        .addEventListener('click', () => {
          document.body.removeChild(dialog);
          resolve(false);
        });

      dialogContent
        .querySelector('#consent-btn')
        .addEventListener('click', async () => {
          document.body.removeChild(dialog);

          // Show processing indicator
          this.showProcessingIndicator();

          // Get cookies and process video
          try {
            await this.processVideoWithCookies(videoData);
            resolve(true);
          } catch (error) {
            console.error('❌ Error processing video:', error);
            this.showNotification(
              'Error',
              'Failed to process video for download'
            );
            resolve(false);
          }
        });
    });
  }

  showProcessingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'video-processing-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2196f3;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    indicator.innerHTML = `
      <div style="
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top: 2px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <span>Processing video...</span>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(indicator);
  }

  async processVideoWithCookies(videoData) {
    try {
      // Get cookies for current domain
      const domain = window.location.hostname;
      const cookies = await this.getCookiesForDomain(domain);

      console.log(`🍪 Retrieved ${cookies.length} cookies for ${domain}`);

      // Send video data with cookies to server
      await this.sendVideoToServerWithCookies(videoData, cookies);
    } catch (error) {
      console.error('❌ Error in processVideoWithCookies:', error);
      throw error;
    } finally {
      // Remove processing indicator
      const indicator = document.getElementById('video-processing-indicator');
      if (indicator) {
        indicator.remove();
      }
    }
  }

  async getCookiesForDomain(domain) {
    try {
      console.log('📨 Requesting cookies for domain:', domain);
      const response = await chrome.runtime.sendMessage({
        action: 'getCookiesForDomain',
        domain: domain,
      });
      console.log('📬 Cookie response received:', response);
      return response.cookies || [];
    } catch (error) {
      console.error('❌ Error getting cookies:', error);
      return [];
    }
  }

  addSelectionIndicator(element) {
    // Remove previous indicators
    document
      .querySelectorAll('.video-selected-indicator')
      .forEach(el => el.remove());

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
          height: videoData.height,
        },
      });

      console.log('📤 Video selection sent to background:', response);
    } catch (error) {
      console.error('❌ Failed to notify video selection:', error);
    }
  }

  async notifyBackgroundScript() {
    try {
      const videosArray = Array.from(this.detectedVideos.values()).map(
        video => ({
          id: video.id,
          title: video.title,
          category: video.category,
          quality: video.quality,
          duration: video.duration,
          width: video.width,
          height: video.height,
          isPlaying: video.isPlaying,
          platform: video.platform || 'html5',
        })
      );

      await chrome.runtime.sendMessage({
        action: 'videosDetected',
        videos: videosArray,
        count: videosArray.length,
        url: window.location.href,
      });
    } catch (error) {
      console.error(
        '❌ Failed to notify background about detected videos:',
        error
      );
    }
  }

  setupMutationObserver() {
    if (this.observerInitialized) return;

    const observer = new MutationObserver(mutations => {
      let shouldRescan = false;

      mutations.forEach(mutation => {
        // Check for added video elements
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.tagName === 'VIDEO' ||
              node.tagName === 'IFRAME' ||
              (node.querySelector && node.querySelector('video, iframe'))
            ) {
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
      subtree: true,
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

// Initialize video detection manager with debugging
console.log('🚀 Initializing video detection system...');
const videoManager = new VideoDetectionManager();
console.log('✅ Video manager created:', videoManager);

// =============================================================================
// STREAM ANALYSIS INTEGRATION
// =============================================================================

// Stream analysis is handled by the background script's network monitor
// Content script focuses on video detection and user interaction
console.log('ℹ️ Stream analysis handled by background network monitor');

// Enhanced video detection manager
class EnhancedVideoDetectionManager extends VideoDetectionManager {
  constructor() {
    super();
  }

  // Uses the parent class selectVideo method which handles consent and processing

  async sendVideoToServerWithCookies(videoData, cookies) {
    try {
      console.log(
        '📤 Sending video to server for processing:',
        videoData.title
      );

      // Get M3U8 URLs from background script network monitoring
      const m3u8Data = await chrome.runtime.sendMessage({
        action: 'getM3U8Urls',
      });

      console.log('🎯 M3U8 detection results:', m3u8Data);

      // Use global config loaded by manifest
      const config = window.EXTENSION_CONFIG;
      if (!config) {
        throw new Error('Extension configuration not loaded');
      }

      // Get the best stream URL from network monitoring
      const bestStreamResponse = await chrome.runtime.sendMessage({
        action: 'getBestStreamUrl'
      });

      // Prioritize network-captured stream URLs over video element src
      let primaryVideoUrl = videoData.src; // fallback

      console.log('🔍 Video URL Selection Process:');
      console.log('  📁 Video element src:', videoData.src);
      console.log('  🌐 Network streams available:', {
        bestStream: bestStreamResponse.success ? bestStreamResponse.streamUrl : 'none',
        m3u8Count: m3u8Data?.m3u8Urls?.length || 0,
        allStreamCount: m3u8Data?.allStreams?.length || 0
      });

      if (bestStreamResponse.success && bestStreamResponse.streamUrl) {
        primaryVideoUrl = bestStreamResponse.streamUrl;
        console.log('🎯 SELECTED: Network-captured stream URL');
        console.log('   📺 Full URL:', primaryVideoUrl);
      } else if (m3u8Data?.m3u8Urls && m3u8Data.m3u8Urls.length > 0) {
        // Use first M3U8 URL if available
        primaryVideoUrl = m3u8Data.m3u8Urls[0].url;
        console.log('🎯 SELECTED: M3U8 URL');
        console.log('   📺 Full URL:', primaryVideoUrl);
      } else if (m3u8Data?.allStreams && m3u8Data.allStreams.length > 0) {
        // Use first detected stream
        primaryVideoUrl = m3u8Data.allStreams[0].url;
        console.log('🎯 SELECTED: Detected stream');
        console.log('   📺 Full URL:', primaryVideoUrl);
      } else {
        console.log('⚠️ FALLBACK: Using video element src');
        console.log('   📺 Full URL:', primaryVideoUrl);
      }

      const payload = {
        videoUrl: primaryVideoUrl,
        title: videoData.title,
        quality: videoData.quality,
        platform: videoData.platform || 'html5',
        duration: videoData.duration,
        m3u8Urls: m3u8Data?.m3u8Urls || [],
        detectedStreams: m3u8Data?.allStreams || [],
        cookies: cookies,
        sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        metadata: {
          width: videoData.width,
          height: videoData.height,
          category: videoData.category,
          thumbnail: videoData.thumbnail,
          streamCount: m3u8Data?.m3u8Urls?.length || 0,
          domain: window.location.hostname,
        },
      };

      console.log('📤 Sending payload to server:', {
        endpoint: `${config.API_SERVER_URL}${config.ENDPOINTS.VIDEO_PROCESS}`,
        primaryVideoUrl: primaryVideoUrl,
        title: videoData.title,
        cookieCount: cookies.length,
        m3u8Count: payload.m3u8Urls.length,
        streamCount: payload.detectedStreams.length,
        fullPayload: payload
      });

      const response = await fetch(
        `${config.API_SERVER_URL}${config.ENDPOINTS.VIDEO_PROCESS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Video processing started:', result);

        // Show success notification with download option
        this.showNotificationWithDownload(
          'Demo processing completed!',
          `"${videoData.title}" is ready for download`,
          result.downloadUrl,
          result.processId
        );

        // Store processing ID for later download
        await chrome.runtime.sendMessage({
          action: 'videoProcessingStarted',
          videoId: videoData.id,
          processId: result.processId,
          downloadUrl: result.downloadUrl,
          title: videoData.title,
        });
      } else {
        throw new Error(`Server responded with status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to send video to server:', error);
      this.showNotification(
        'Processing failed',
        `Failed to process "${videoData.title}"`
      );
      throw error;
    }
  }

  showNotification(title, message) {
    // Create a simple notification overlay
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2196f3;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      max-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;

    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
      <div style="opacity: 0.9;">${message}</div>
    `;

    document.body.appendChild(notification);

    // Remove notification after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 4000);
  }

  showNotificationWithDownload(title, message, downloadUrl, processId) {
    // Create a notification with download button
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;

    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
      <div style="opacity: 0.9; margin-bottom: 12px;">${message}</div>
      <button id="download-btn-${processId}" style="
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        width: 100%;
        transition: background 0.2s ease;
      ">📥 Download Demo Video</button>
    `;

    document.body.appendChild(notification);

    // Add download button functionality
    const downloadBtn = notification.querySelector(
      `#download-btn-${processId}`
    );
    downloadBtn.addEventListener('click', () => {
      console.log('🎬 Starting demo download:', downloadUrl);

      // Create a hidden link to trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `demo-video-${processId}.mp4`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Update button to show download started
      downloadBtn.innerHTML = '✅ Download Started';
      downloadBtn.style.background = 'rgba(255, 255, 255, 0.3)';
      downloadBtn.disabled = true;
    });

    downloadBtn.addEventListener('mouseenter', () => {
      if (!downloadBtn.disabled) {
        downloadBtn.style.background = 'rgba(255, 255, 255, 0.3)';
      }
    });

    downloadBtn.addEventListener('mouseleave', () => {
      if (!downloadBtn.disabled) {
        downloadBtn.style.background = 'rgba(255, 255, 255, 0.2)';
      }
    });

    // Remove notification after 10 seconds (longer for download option)
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 10000);
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
          streamAnalysis: videoData.streamAnalysis || null,
        },
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

// Expose enhanced manager to global scope
window.videoManager = enhancedVideoManager;
