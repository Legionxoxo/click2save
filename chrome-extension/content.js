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
      // Safety check: ensure element is still valid
      if (!element || !element.parentNode) {
        console.log('⚠️ Skipping null or detached element');
        return;
      }

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

    // Handle case where element might be null (for captured streams)
    let rect = { width: 0, height: 0 };
    if (element) {
      rect = element.getBoundingClientRect();
    }

    return `video_${btoa(src + rect.width + rect.height + index)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 12)}`;
  }

  extractVideoMetadata(element, videoId) {
    // Handle case where element might be null (for captured streams)
    if (!element) {
      return {
        id: videoId,
        type: 'captured',
        src: '',
        title: 'Captured Stream',
        duration: 0,
        currentTime: 0,
        width: 1280,
        height: 720,
        isPlaying: false,
        hasControls: false,
        isAutoplay: false,
        isMuted: false,
        isVisible: true,
        zIndex: 0,
        quality: 'unknown',
        thumbnail: null
      };
    }

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
    // Safety check for null element
    if (!element) {
      return '';
    }

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
    // Safety check for null element
    if (!element) {
      return 'Captured Stream';
    }

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
    // Safety check for null element
    if (!element) {
      return null;
    }

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
    // Handle case where element might be null (for captured streams)
    if (!element) {
      return 'captured';
    }

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
    // Skip positioning for null elements (captured streams)
    if (!videoElement) {
      return;
    }

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
    // Skip DOM insertion for null elements (captured streams use banner instead)
    if (!videoElement) {
      return;
    }

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
    console.log('🚀 Starting processVideoWithCookies for:', videoData.title);
    console.log('📋 Video data:', {
      id: videoData.id,
      title: videoData.title,
      src: videoData.src,
      category: videoData.category,
      domain: videoData.domain
    });

    try {
      // Check if config is available
      const config = window.EXTENSION_CONFIG;
      if (!config) {
        throw new Error('Extension configuration not loaded - config.js may not be available');
      }
      console.log('✅ Extension config loaded:', config);

      // Get cookies for current domain
      const domain = window.location.hostname;
      console.log('🍪 Getting cookies for domain:', domain);

      const cookies = await this.getCookiesForDomain(domain);
      console.log(`✅ Retrieved ${cookies.length} cookies for ${domain}`);

      // Send video data with cookies to server
      console.log('📤 About to send video to server...');
      await this.sendVideoToServerWithCookies(videoData, cookies);
      console.log('✅ Successfully sent video to server');

    } catch (error) {
      console.error('❌ Error in processVideoWithCookies:', error);
      console.error('❌ Error stack:', error.stack);

      // Show more specific error message
      this.showNotification(
        'Processing Error',
        `Failed to process "${videoData.title}": ${error.message}`
      );

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

    // Skip visual indicator for null elements (captured streams)
    if (!element) {
      console.log('📺 Stream selected (captured stream - no visual indicator)');
      return;
    }

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
console.log('🔍 Checking if getVideoGroupingKey is defined:', typeof getVideoGroupingKey);

const videoManager = new VideoDetectionManager();
console.log('✅ Video manager created:', videoManager);

// Debug: Log all available functions
console.log('🔍 Available functions in global scope:');
console.log('- getVideoGroupingKey:', typeof window.getVideoGroupingKey);
console.log('- updateGroupedStreamBanner:', typeof updateGroupedStreamBanner);
console.log('- createGroupedStreamBanner:', typeof createGroupedStreamBanner);

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
      console.log('📤 sendVideoToServerWithCookies called');
      console.log('   📋 Video data:', videoData);
      console.log('   🍪 Cookie count:', cookies.length);
      console.log(
        '📤 Sending video to server for processing:',
        videoData.title
      );

      // Get M3U8 URLs from background script network monitoring
      console.log('📨 Requesting M3U8 URLs from background script...');
      let m3u8Data;
      try {
        m3u8Data = await chrome.runtime.sendMessage({
          action: 'getM3U8Urls',
        });
        console.log('✅ M3U8 request successful');
      } catch (m3u8Error) {
        console.error('❌ Failed to get M3U8 URLs from background:', m3u8Error);
        m3u8Data = { m3u8Urls: [], allStreams: [] };
      }

      console.log('🎯 M3U8 detection results:', m3u8Data);

      // Use global config loaded by manifest
      const config = window.EXTENSION_CONFIG;
      if (!config) {
        throw new Error('Extension configuration not loaded');
      }

      // Get the best stream URL from network monitoring
      console.log('📨 Requesting best stream URL from background script...');
      let bestStreamResponse;
      try {
        bestStreamResponse = await chrome.runtime.sendMessage({
          action: 'getBestStreamUrl'
        });
        console.log('✅ Best stream request successful:', bestStreamResponse);
      } catch (streamError) {
        console.error('❌ Failed to get best stream URL from background:', streamError);
        bestStreamResponse = { success: false, streamUrl: null };
      }

      // Prioritize network-captured stream URLs over video element src
      let primaryVideoUrl = videoData.src; // fallback

      console.log('🔍 Video URL Selection Process:');
      console.log('  📁 Video element src:', videoData.src);
      console.log('  🏷️ Video category:', videoData.category);
      console.log('  🌐 Network streams available:', {
        bestStream: bestStreamResponse.success ? bestStreamResponse.streamUrl : 'none',
        m3u8Count: m3u8Data?.m3u8Urls?.length || 0,
        allStreamCount: m3u8Data?.allStreams?.length || 0
      });

      // For captured streams, prefer the existing stream URL, but still check for better network streams
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
      } else if (videoData.category === 'captured' && videoData.src) {
        // Use pre-captured stream URL as fallback
        primaryVideoUrl = videoData.src;
        console.log('🎯 SELECTED: Pre-captured stream URL (from category)');
        console.log('   📺 Full URL:', primaryVideoUrl);
      } else {
        console.log('⚠️ FALLBACK: Using video element src');
        console.log('   📺 Full URL:', primaryVideoUrl);
      }

      // Validation: ensure we have a valid URL
      if (!primaryVideoUrl || primaryVideoUrl.trim() === '') {
        throw new Error(`No valid video URL found. VideoData src: "${videoData.src}", Category: "${videoData.category}"`);
      }

      // Clean up cookies to avoid serialization issues
      const cleanCookies = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite
      }));

      const payload = {
        videoUrl: primaryVideoUrl,
        title: videoData.title,
        quality: videoData.quality,
        platform: videoData.platform || 'html5',
        duration: videoData.duration,
        m3u8Urls: m3u8Data?.m3u8Urls || [],
        detectedStreams: m3u8Data?.allStreams || [],
        cookies: cleanCookies,
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

      const endpoint = `${config.API_SERVER_URL}${config.ENDPOINTS.VIDEO_PROCESS}`;
      console.log('📤 Sending payload to server:', {
        endpoint: endpoint,
        primaryVideoUrl: primaryVideoUrl,
        title: videoData.title,
        cookieCount: cookies.length,
        m3u8Count: payload.m3u8Urls.length,
        streamCount: payload.detectedStreams.length,
        payloadSize: JSON.stringify(payload).length
      });

      // Quick server connectivity check
      console.log('🔍 Testing server connectivity...');
      try {
        const testResponse = await fetch(config.API_SERVER_URL, {
          method: 'GET',
          timeout: 3000
        });
        console.log('✅ Server is reachable, status:', testResponse.status);
      } catch (connectError) {
        console.error('❌ Server connectivity issue:', connectError.message);
        throw new Error(`Cannot reach server at ${config.API_SERVER_URL}. Is the server running?`);
      }

      // Debug: Log the full payload structure to identify issues
      console.log('🔍 CONTENT SCRIPT FULL PAYLOAD DEBUG:', JSON.stringify(payload, null, 2));

      let response;
      try {
        console.log('🔄 Attempting to serialize and send payload...');
        const payloadJson = JSON.stringify(payload);
        console.log('✅ Payload serialized successfully, length:', payloadJson.length);

        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payloadJson,
        });

        console.log('📡 Fetch completed, status:', response.status, response.statusText);
      } catch (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        throw new Error(`Network request failed: ${fetchError.message}`);
      }

      if (response.ok) {
        try {
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
        } catch (jsonError) {
          console.error('❌ Failed to parse server response:', jsonError);
          throw new Error(`Server response parsing failed: ${jsonError.message}`);
        }
      } else {
        let errorText = `Server responded with status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorText = errorData.message || errorData.error || errorText;
          console.error('❌ Server error response:', errorData);
        } catch (e) {
          const rawResponse = await response.text();
          console.error('❌ Raw server error response:', rawResponse);
          errorText += ` - ${rawResponse}`;
        }
        throw new Error(errorText);
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

// =============================================================================
// MESSAGE HANDLING FOR STREAM CAPTURE NOTIFICATIONS
// =============================================================================

// Listen for messages from background script about captured streams
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received message:', request);

  switch (request.action) {
    case 'streamCaptured':
      handleCapturedStream(request.stream);
      sendResponse({ success: true });
      break;

    case 'rescanVideos':
      enhancedVideoManager.scanForVideos();
      sendResponse({ success: true });
      break;

    default:
      console.log('❓ Unknown message action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return true; // Keep the message channel open for async response
});

// Handle captured stream notifications from background script
function handleCapturedStream(streamData) {
  console.log('🎯 Handling captured stream:', streamData);

  // Add to detected videos map
  enhancedVideoManager.detectedVideos.set(streamData.id, {
    ...streamData,
    detected: new Date().toISOString(),
    element: null // No DOM element for captured streams
  });

  // Group streams by video name instead of creating individual overlays
  updateGroupedStreamBanner();

  // Notify background about the detected video
  enhancedVideoManager.notifyBackgroundScript();

  console.log(`✅ Added captured stream to grouped display: ${streamData.title}`);
}

// Enhanced video grouping - identify streams belonging to the same video
function getVideoGroupingKey(stream) {
  try {
    if (!stream || !stream.src) {
      return 'unknown-stream';
    }

    const url = stream.src;
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const domain = urlObj.hostname;

    // Strategy 1: Look for common video identifiers in the path
    const videoIdPatterns = [
      /\/video[_-]?(\w+)/i,          // /video_123, /video-abc
      /\/watch[_-]?(\w+)/i,          // /watch_123, /watch-abc
      /\/v[_-]?(\w+)/i,              // /v_123, /v-abc
      /\/(\w{8,})/,                  // Long alphanumeric strings (likely IDs)
      /\/([a-zA-Z0-9]{6,})-/,        // Pattern like /abc123-something
    ];

    for (const pattern of videoIdPatterns) {
      const match = pathname.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];
        console.log(`🎯 Found video ID: "${videoId}" in ${url.substring(0, 60)}...`);
        return `${domain}-${videoId}`;
      }
    }

    // Strategy 2: Group by base path (everything before quality/format indicators)
    const basePath = pathname
      .replace(/\/\d+p?\/.*$/, '')        // Remove /720p/... or /720/...
      .replace(/\/playlist\.m3u8.*$/, '') // Remove /playlist.m3u8...
      .replace(/\/index\.m3u8.*$/, '')    // Remove /index.m3u8...
      .replace(/\/master\.m3u8.*$/, '')   // Remove /master.m3u8...
      .replace(/\/\w+\.m3u8.*$/, '')      // Remove any .m3u8 file
      .replace(/\/chunklist.*$/, '')      // Remove chunklist files
      .replace(/\/seg-\d+.*$/, '')        // Remove segment files
      .replace(/\/\d+-\d+.*$/, '');       // Remove timestamp patterns

    if (basePath && basePath !== '/' && basePath.length > 5) {
      console.log(`🎯 Using base path grouping: "${basePath}" for ${url.substring(0, 60)}...`);
      return `${domain}${basePath}`;
    }

    // Strategy 3: Group by common parent directory
    const segments = pathname.split('/').filter(s => s.length > 0);
    if (segments.length >= 2) {
      // Use the last non-file segment as grouping key
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];

        // Skip file-like segments
        if (segment.includes('.') || segment.match(/^\d+$/) ||
            segment.includes('playlist') || segment.includes('chunklist') ||
            segment.includes('seg-') || segment.match(/^\d+-\d+/)) {
          continue;
        }

        if (segment.length > 3) {
          const groupKey = `${domain}-${segments.slice(0, i + 1).join('/')}`;
          console.log(`🎯 Using parent directory grouping: "${groupKey}" for ${url.substring(0, 60)}...`);
          return groupKey;
        }
      }
    }

    // Strategy 4: Look for timestamp-based grouping (same video, different times)
    const timestampMatch = url.match(/(\d{10,13})/); // Unix timestamp
    const dateMatch = url.match(/(\d{4}-\d{2}-\d{2})/); // Date pattern

    if (timestampMatch || dateMatch) {
      const timeKey = timestampMatch ? timestampMatch[1].substring(0, 8) : dateMatch[1];
      const groupKey = `${domain}-${timeKey}`;
      console.log(`🎯 Using timestamp grouping: "${groupKey}" for ${url.substring(0, 60)}...`);
      return groupKey;
    }

    // Fallback: use domain + first meaningful path segment
    const fallbackKey = segments.length > 0 ? `${domain}-${segments[0]}` : domain;
    console.log(`🎯 Fallback grouping: "${fallbackKey}" for ${url.substring(0, 60)}...`);
    return fallbackKey;

  } catch (error) {
    console.warn('⚠️ getVideoGroupingKey error:', error.message);
    return `unknown-${Date.now()}`;
  }
}

// Helper function to extract video name from grouping key
function extractVideoNameFromGroupingKey(groupingKey, streams) {
  try {
    // Remove domain prefix
    const keyWithoutDomain = groupingKey.replace(/^[^-]+-/, '');

    // Get the most common path segments from all streams in this group
    const pathSegments = streams.map(stream => {
      try {
        const url = new URL(stream.src);
        return url.pathname.split('/').filter(s => s.length > 0);
      } catch {
        return [];
      }
    });

    // Find common meaningful segments
    if (pathSegments.length > 0) {
      const commonSegments = pathSegments[0];
      for (let i = 0; i < commonSegments.length; i++) {
        const segment = commonSegments[i];

        // Skip technical segments
        if (segment.includes('.m3u8') || segment.includes('playlist') ||
            segment.includes('chunklist') || segment.match(/^\d+p?$/) ||
            segment.includes('master') || segment.includes('index')) {
          continue;
        }

        // If this is a meaningful name, use it
        if (segment.length > 3 && !segment.match(/^\d+$/)) {
          const cleanName = segment
            .replace(/[_-]/g, ' ')
            .replace(/\.(mp4|webm|m3u8).*$/i, '')
            .trim();

          if (cleanName.length > 0) {
            console.log(`🏷️ Extracted video name from group: "${cleanName}"`);
            return cleanName;
          }
        }
      }
    }

    // Fallback to cleaning the grouping key
    const cleanKey = keyWithoutDomain
      .replace(/[_-]/g, ' ')
      .replace(/\.(mp4|webm|m3u8).*$/i, '')
      .trim();

    return cleanKey.length > 0 ? cleanKey : 'Video Stream';

  } catch (error) {
    console.warn('⚠️ extractVideoNameFromGroupingKey error:', error.message);
    return 'Video Stream';
  }
}

// Ensure the functions are globally accessible for debugging
if (typeof window !== 'undefined') {
  window.getVideoGroupingKey = getVideoGroupingKey;
  window.extractVideoNameFromGroupingKey = extractVideoNameFromGroupingKey;
}

// Update the grouped stream banner with all captured streams
function updateGroupedStreamBanner() {
  // Get all captured streams
  const capturedStreams = Array.from(enhancedVideoManager.detectedVideos.values())
    .filter(video => video.category === 'captured');

  if (capturedStreams.length === 0) {
    return;
  }

  // Group streams by video using enhanced grouping logic
  const videoGroups = new Map();

  console.log(`🔍 Starting enhanced grouping for ${capturedStreams.length} streams...`);

  capturedStreams.forEach((stream, index) => {
    const groupingKey = getVideoGroupingKey(stream);
    console.log(`  ${index + 1}. Stream: ${stream.src.substring(0, 80)}...`);
    console.log(`     → Group key: ${groupingKey}`);

    if (!videoGroups.has(groupingKey)) {
      videoGroups.set(groupingKey, {
        groupingKey: groupingKey,
        name: null, // Will be determined after all streams are grouped
        domain: stream.domain,
        streams: [],
        firstSeen: stream.timestamp || Date.now()
      });
    }

    videoGroups.get(groupingKey).streams.push(stream);
  });

  // Now determine the best name for each group based on all its streams
  videoGroups.forEach((group, groupingKey) => {
    group.name = extractVideoNameFromGroupingKey(groupingKey, group.streams);
    console.log(`📊 Group "${groupingKey}" → Display name: "${group.name}" (${group.streams.length} streams)`);
  });

  // Convert to array and sort by stream count
  const groupedVideos = Array.from(videoGroups.values())
    .sort((a, b) => b.streams.length - a.streams.length);

  console.log(`📊 Grouped ${capturedStreams.length} streams into ${groupedVideos.length} videos:`, groupedVideos);

  // Create or update the grouped banner
  createGroupedStreamBanner(groupedVideos);
}

// Create a virtual overlay for captured streams (no DOM element)
function createVirtualStreamOverlay(streamData) {
  // This function is now replaced by updateGroupedStreamBanner
  console.log(`📺 Stream will be grouped: ${streamData.title}`);
}

// Create a grouped banner for captured streams
function createGroupedStreamBanner(groupedVideos) {
  // Remove existing banner
  const existingBanner = document.querySelector('.captured-streams-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  if (groupedVideos.length === 0) {
    return;
  }

  // Create the main banner container
  const banner = document.createElement('div');
  banner.className = 'captured-streams-banner';
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    background: rgba(25, 118, 210, 0.95);
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    max-width: 450px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    cursor: pointer;
    transition: all 0.3s ease;
  `;

  const totalStreams = groupedVideos.reduce((sum, group) => sum + group.streams.length, 0);

  banner.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <span style="font-size: 20px; margin-right: 8px;">🎬</span>
      <strong>Detected ${groupedVideos.length} Video${groupedVideos.length > 1 ? 's' : ''} (${totalStreams} streams)</strong>
    </div>
    <div style="font-size: 11px; opacity: 0.7; margin: 4px 0 12px 28px; font-style: italic;">
      📍 From: ${window.location.hostname}
    </div>
    <div class="video-group-list" style="margin-left: 28px;">
      <!-- Video groups will be added here -->
    </div>
    <div style="font-size: 12px; opacity: 0.8; margin-top: 8px; margin-left: 28px;">
      Click on a video to download all its streams
    </div>
  `;

  const videoGroupList = banner.querySelector('.video-group-list');

  // Add each video group
  groupedVideos.forEach(group => {
    const groupItem = document.createElement('div');
    groupItem.className = 'video-group-item';
    groupItem.style.cssText = `
      margin: 6px 0;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s ease;
      border-left: 3px solid rgba(255, 255, 255, 0.3);
    `;

    const uniqueQualities = [...new Set(group.streams.map(s => s.quality || 'unknown'))];
    const uniqueFormats = [...new Set(group.streams.map(s => s.format))];

    groupItem.innerHTML = `
      <div style="font-weight: 500; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
        <span style="color: white;">🎬 ${group.name}</span>
        <span style="background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: bold;">
          ${group.streams.length} streams
        </span>
      </div>
      <div style="font-size: 11px; opacity: 0.8; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span>📍 ${group.domain}</span>
        <span>•</span>
        <span>📊 ${uniqueFormats.join(', ')}</span>
        ${uniqueQualities.length > 0 ? '<span>•</span>' : ''}
        ${uniqueQualities.map(quality => `
          <span style="background: rgba(255,255,255,0.15); padding: 1px 4px; border-radius: 2px; font-size: 9px;">
            ${quality}
          </span>
        `).join('')}
      </div>
      <div style="font-size: 10px; opacity: 0.6;">
        Sample URLs: ${group.streams.slice(0, 2).map(s =>
          s.src.length > 40 ? s.src.substring(s.src.lastIndexOf('/')+1, s.src.lastIndexOf('/')+20) + '...' : s.src.substring(s.src.lastIndexOf('/')+1)
        ).join(', ')}${group.streams.length > 2 ? ` +${group.streams.length - 2} more` : ''}
      </div>
    `;

    // Add click handler for video group - sends all streams for this video
    groupItem.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadVideoGroup(group);
    });

    // Add hover effects
    groupItem.addEventListener('mouseenter', () => {
      groupItem.style.background = 'rgba(255, 255, 255, 0.2)';
      groupItem.style.borderLeftColor = 'rgba(255, 255, 255, 0.6)';
    });

    groupItem.addEventListener('mouseleave', () => {
      groupItem.style.background = 'rgba(255, 255, 255, 0.1)';
      groupItem.style.borderLeftColor = 'rgba(255, 255, 255, 0.3)';
    });

    videoGroupList.appendChild(groupItem);
  });

  // Add click handler to show detailed view
  banner.addEventListener('click', (e) => {
    if (e.target === banner || e.target.closest('.video-group-list') === null) {
      showGroupedStreamDetails(groupedVideos);
    }
  });

  document.body.appendChild(banner);

  // Auto-hide banner after 10 seconds if not interacted with
  setTimeout(() => {
    if (banner && banner.parentNode && !banner.matches(':hover')) {
      banner.style.opacity = '0.7';
      banner.style.transform = 'translateX(-10px)';
    }
  }, 10000);

  return banner;
}

// Handle downloading all streams for a video group
async function downloadVideoGroup(group) {
  console.log(`🎬 Downloading video group: ${group.name} with ${group.streams.length} streams`);

  // Create a representative video object for this group
  const representativeStream = group.streams[0]; // Use first stream as representative
  const groupVideoData = {
    ...representativeStream,
    title: `${group.name} (${group.streams.length} streams)`,
    groupedStreams: group.streams, // Include all streams
    category: 'grouped'
  };

  // Process the grouped video
  await enhancedVideoManager.selectVideo(representativeStream.id);
}

// Show detailed view of grouped streams
function showGroupedStreamDetails(groupedVideos) {
  console.log('📋 Showing grouped stream details');

  if (groupedVideos.length === 0) {
    console.log('❌ No grouped videos found');
    return;
  }

  // Create a selection dialog
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
    max-width: 700px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  `;

  const totalStreams = groupedVideos.reduce((sum, group) => sum + group.streams.length, 0);

  const videoGroupItems = groupedVideos.map((group, index) => `
    <div class="video-group-option" data-group-index="${index}" style="
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin: 8px 0;
      cursor: pointer;
      transition: all 0.2s ease;
    ">
      <div style="font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <span>🎬</span>
        <span>${group.name}</span>
        <span style="background: #1976d2; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px;">
          ${group.streams.length} streams
        </span>
      </div>
      <div style="color: #666; font-size: 14px; margin-bottom: 8px;">
        📍 ${group.domain}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${group.streams.map(stream => `
          <span style="background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #666;">
            ${stream.format}${stream.quality ? ` • ${stream.quality}` : ''}
          </span>
        `).join('')}
      </div>
      <div style="font-size: 11px; color: #999; margin-top: 8px;">
        Click to download all ${group.streams.length} stream${group.streams.length > 1 ? 's' : ''} for this video
      </div>
    </div>
  `).join('');

  dialogContent.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 20px;">
      <span style="font-size: 24px; margin-right: 12px;">🎬</span>
      <h3 style="margin: 0; color: #333;">Select Video to Download</h3>
    </div>
    <div style="color: #666; margin-bottom: 16px;">
      Found <strong>${groupedVideos.length}</strong> video${groupedVideos.length > 1 ? 's' : ''}
      with <strong>${totalStreams}</strong> total streams:
    </div>
    ${videoGroupItems}
    <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
      <button id="close-dialog" style="
        padding: 10px 20px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        color: #666;
      ">Cancel</button>
    </div>
  `;

  dialog.appendChild(dialogContent);
  document.body.appendChild(dialog);

  // Add click handlers
  dialogContent.querySelector('#close-dialog').addEventListener('click', () => {
    document.body.removeChild(dialog);
  });

  // Add video group selection handlers
  dialogContent.querySelectorAll('.video-group-option').forEach(option => {
    option.addEventListener('click', () => {
      const groupIndex = parseInt(option.dataset.groupIndex);
      const selectedGroup = groupedVideos[groupIndex];
      document.body.removeChild(dialog);
      downloadVideoGroup(selectedGroup);
    });

    // Add hover effect
    option.addEventListener('mouseenter', () => {
      option.style.backgroundColor = '#f5f5f5';
      option.style.borderColor = '#1976d2';
    });

    option.addEventListener('mouseleave', () => {
      option.style.backgroundColor = 'white';
      option.style.borderColor = '#e0e0e0';
    });
  });

  // Close on background click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog);
    }
  });
}

// Show options for all captured streams (legacy function, now uses grouped display)
function showAllCapturedStreams() {
  console.log('📋 Showing all captured streams (redirecting to grouped view)');

  // Get all captured streams and group them
  const capturedStreams = Array.from(enhancedVideoManager.detectedVideos.values())
    .filter(video => video.category === 'captured');

  if (capturedStreams.length === 0) {
    console.log('❌ No captured streams found');
    return;
  }

  // Group using enhanced logic
  const videoGroups = new Map();

  capturedStreams.forEach(stream => {
    const groupingKey = getVideoGroupingKey(stream);

    if (!videoGroups.has(groupingKey)) {
      videoGroups.set(groupingKey, {
        groupingKey: groupingKey,
        name: null,
        domain: stream.domain,
        streams: []
      });
    }

    videoGroups.get(groupingKey).streams.push(stream);
  });

  // Determine names for each group
  videoGroups.forEach((group, groupingKey) => {
    group.name = extractVideoNameFromGroupingKey(groupingKey, group.streams);
  });

  const groupedVideos = Array.from(videoGroups.values())
    .sort((a, b) => b.streams.length - a.streams.length);

  showGroupedStreamDetails(groupedVideos);
}
