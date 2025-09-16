// Background script for Video Downloader Assistant
console.log('🚀 Video Downloader Assistant background script starting...');

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

// Video manager will be initialized later with enhanced version

// =============================================================================
// STREAM ANALYSIS INTEGRATION
// =============================================================================

// =============================================================================
// M3U8 AND STREAM CAPTURE USING chrome.webRequest API
// =============================================================================

// Storage for captured streams per tab
const capturedStreams = new Map(); // tabId -> array of stream URLs

// Set up chrome.webRequest listeners for M3U8 and video stream capture
console.log('🚀 Setting up M3U8 capture with chrome.webRequest API...');

// Listen for completed requests to capture M3U8 and video streams
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = details.url;
    const tabId = details.tabId;

    // Skip if not a valid tab
    if (tabId < 0) return;

    // Check for video streams
    if (isVideoStreamUrl(url)) {
      const streamData = {
        url,
        format: detectStreamFormat(url),
        quality: extractQualityFromUrl(url),
        timestamp: Date.now(),
        domain: extractDomain(url),
        statusCode: details.statusCode
      };

      // Store stream data for this tab
      if (!capturedStreams.has(tabId)) {
        capturedStreams.set(tabId, []);
      }

      const tabStreams = capturedStreams.get(tabId);

      // Avoid duplicates
      if (!tabStreams.find(s => s.url === url)) {
        tabStreams.push(streamData);

        console.log(`🎯 Captured ${streamData.format} stream for tab ${tabId}:`, {
          format: streamData.format,
          quality: streamData.quality || 'unknown',
          url: url.substring(0, 100) + '...',
          domain: streamData.domain
        });

        // Special logging for M3U8 files
        if (streamData.format === 'HLS') {
          console.log(`🔥 M3U8 FOUND:`, url);
        }
      }
    }
  },
  { urls: ['<all_urls>'] }
);

// Helper functions
function isVideoStreamUrl(url) {
  const lowUrl = url.toLowerCase();
  return lowUrl.includes('.m3u8') ||
         lowUrl.includes('.mpd') ||
         lowUrl.includes('.mp4') ||
         lowUrl.includes('.webm') ||
         lowUrl.includes('.ts') ||
         lowUrl.includes('.m4s') ||
         lowUrl.includes('.mov') ||
         lowUrl.includes('.avi') ||
         lowUrl.includes('.mkv');
}

function detectStreamFormat(url) {
  const lowUrl = url.toLowerCase();
  if (lowUrl.includes('.m3u8')) return 'HLS';
  if (lowUrl.includes('.mpd')) return 'DASH';
  if (lowUrl.includes('.mp4') || lowUrl.includes('.webm') || lowUrl.includes('.mov')) return 'PROGRESSIVE';
  if (lowUrl.includes('.ts') || lowUrl.includes('.m4s')) return 'SEGMENTS';
  return 'UNKNOWN';
}

function extractQualityFromUrl(url) {
  const qualityPatterns = {
    '4K': ['2160p', '4k', '3840x2160', '4096x2160'],
    '1440p': ['1440p', '2k', '2560x1440'],
    '1080p': ['1080p', 'fhd', '1920x1080'],
    '720p': ['720p', 'hd', '1280x720'],
    '480p': ['480p', 'sd', '854x480'],
    '360p': ['360p', '640x360']
  };

  const lowUrl = url.toLowerCase();
  for (const [quality, patterns] of Object.entries(qualityPatterns)) {
    if (patterns.some(pattern => lowUrl.includes(pattern.toLowerCase()))) {
      return quality;
    }
  }
  return null;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Clean up streams when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  capturedStreams.delete(tabId);
  console.log(`🧹 Cleaned up streams for closed tab: ${tabId}`);
});

// Clean up streams when navigating to new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    capturedStreams.delete(tabId);
    console.log(`🧹 Cleared streams for navigation in tab: ${tabId}`);
  }
});

// Mock networkMonitor object for compatibility with existing code
const networkMonitor = {
  getTabStreams: (tabId) => capturedStreams.get(tabId) || [],

  getBestQualityStream: (tabId) => {
    const streams = capturedStreams.get(tabId) || [];
    if (streams.length === 0) return null;

    // Prioritize HLS manifests first
    const hlsStreams = streams.filter(s => s.format === 'HLS');
    if (hlsStreams.length > 0) {
      return hlsStreams[0];
    }

    // Then DASH manifests
    const dashStreams = streams.filter(s => s.format === 'DASH');
    if (dashStreams.length > 0) {
      return dashStreams[0];
    }

    // Then progressive videos
    const progressiveStreams = streams.filter(s => s.format === 'PROGRESSIVE');
    if (progressiveStreams.length > 0) {
      return progressiveStreams[0];
    }

    // Finally any other streams
    return streams[0];
  },

  clearTabData: (tabId) => {
    capturedStreams.delete(tabId);
  }
};

console.log('✅ M3U8 capture system initialized with chrome.webRequest API');

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

// Create base video manager first
const videoManager = new VideoManager();

// Create enhanced video manager
const enhancedVideoManager = new EnhancedVideoManager();

// Copy existing data from base manager
Object.setPrototypeOf(enhancedVideoManager, VideoManager.prototype);
enhancedVideoManager.detectedVideos = videoManager.detectedVideos;
enhancedVideoManager.selectedVideos = videoManager.selectedVideos;
enhancedVideoManager.tabVideoCount = videoManager.tabVideoCount;

// Network monitor is now initialized directly via chrome.webRequest listeners above

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
  console.log('📬 Background received message:', {
    action: request.action,
    tabId: sender.tab?.id,
    url: sender.tab?.url,
    fullRequest: request
  });

  (async () => {
    try {
      switch (request.action) {

        case 'getM3U8Urls':
          try {
            const tab = await chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]);
            const tabId = tab?.id || sender?.tab?.id;

            if (tabId) {
              const m3u8Urls = await getM3U8UrlsForTab(tabId);
              const allStreams = await getStreamDataForTab(tabId);

              sendResponse({
                success: true,
                m3u8Urls,
                allStreams,
                tabId
              });
            } else {
              sendResponse({
                success: false,
                error: 'Could not determine tab ID',
                m3u8Urls: [],
                allStreams: []
              });
            }
          } catch (error) {
            console.error('❌ Error getting M3U8 URLs:', error);
            sendResponse({
              success: false,
              error: error.message,
              m3u8Urls: [],
              allStreams: []
            });
          }
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
          const requestTabId = request.tabId || sender.tab?.id;
          const tabVideos = enhancedVideoManager.getTabVideos(requestTabId);
          sendResponse(tabVideos);
          break;

        case 'downloadVideo':
          const downloadResult = await handleVideoDownload(request);
          sendResponse(downloadResult);
          break;

        case 'videoProcessingStarted':
          // Store processing information for tracking
          const processingResult = handleVideoProcessingStarted(request, sender);
          sendResponse(processingResult);
          break;

        case 'getCookiesForDomain':
          // Get cookies for specified domain
          const cookieResult = await getCookiesForDomain(request.domain);
          sendResponse(cookieResult);
          break;

        case 'getBestStreamUrl':
          // Get the best stream URL for a tab
          const streamTabId = request.tabId || sender.tab?.id;
          const bestStreamUrl = await getBestStreamUrlForTab(streamTabId);
          sendResponse({
            success: !!bestStreamUrl,
            streamUrl: bestStreamUrl,
            tabId: streamTabId
          });
          break;

        // Legacy popup handlers (simplified for video downloader)
        case 'getConsentStatus':
          sendResponse({
            granted: false,
            domains: [],
            expiresAt: null,
            sessionId: null
          });
          break;

        case 'grantConsent':
          sendResponse({ success: false, error: 'Cookie consent not needed for video downloads' });
          break;

        case 'revokeConsent':
          sendResponse({ success: false, error: 'Cookie consent not needed for video downloads' });
          break;

        case 'captureCurrentTab':
          sendResponse({ success: false, error: 'Manual cookie capture not needed for video downloads' });
          break;

        default:
          console.error('❌ Unknown action received:', request.action);
          sendResponse({ error: `Unknown action: ${request.action}` });
      }
    } catch (error) {
      console.error('❌ Background script error:', error);
      sendResponse({ error: error.message });
    }
  })();

  // Return true to indicate we'll respond asynchronously
  return true;
});

// Helper functions to get M3U8 and stream data
async function getM3U8UrlsForTab(tabId) {
  const streams = networkMonitor.getTabStreams(tabId);
  const m3u8Urls = [];

  streams.forEach(streamData => {
    if (streamData.format === 'HLS' && streamData.url.includes('.m3u8')) {
      m3u8Urls.push({
        url: streamData.url,
        quality: streamData.quality,
        timestamp: streamData.timestamp,
        domain: streamData.domain
      });
    }
  });

  console.log(`🎯 Found ${m3u8Urls.length} M3U8 URLs for tab ${tabId}:`, m3u8Urls);
  return m3u8Urls;
}

async function getStreamDataForTab(tabId) {
  const streams = networkMonitor.getTabStreams(tabId);
  const allStreams = [];

  streams.forEach(streamData => {
    allStreams.push({
      url: streamData.url,
      format: streamData.format,
      quality: streamData.quality,
      timestamp: streamData.timestamp,
      domain: streamData.domain,
      type: streamData.type || 'captured'
    });
  });

  console.log(`📊 Found ${allStreams.length} total streams for tab ${tabId}`);
  return allStreams;
}

// Get the best stream URL for a tab (prioritize M3U8, then other formats)
async function getBestStreamUrlForTab(tabId) {
  const bestStream = networkMonitor.getBestQualityStream(tabId);
  if (bestStream) {
    console.log(`🏆 Best stream for tab ${tabId}:`, {
      url: bestStream.url.substring(0, 100) + '...',
      format: bestStream.format,
      quality: bestStream.quality
    });
    return bestStream.url;
  }

  console.log(`❌ No streams found for tab ${tabId}`);
  return null;
}

// Handle video download request - send to server for processing
async function handleVideoDownload(request) {
  console.log('🎬 Download request for video:', request.videoId);

  try {
    const { video } = request;

    if (!video) {
      return {
        success: false,
        message: 'No video data provided',
        videoId: request.videoId
      };
    }

    console.log('📤 Sending video to server for processing:', video.title);

    const response = await fetch(`http://localhost:3000/api/video/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoUrl: video.src,
        title: video.title,
        quality: video.quality,
        platform: video.platform || 'html5',
        duration: video.duration,
        m3u8Urls: await getM3U8UrlsForTab(request.tabId),
        metadata: {
          width: video.width,
          height: video.height,
          category: video.category,
          thumbnail: video.thumbnail,
          streamAnalysis: video.streamAnalysis,
          detectedStreams: await getStreamDataForTab(request.tabId)
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Video processing response:', result);

    return {
      success: true,
      message: result.message || 'Video processing started',
      processId: result.processId,
      downloadUrl: result.downloadUrl,
      estimatedTime: result.estimatedTime,
      videoId: request.videoId
    };

  } catch (error) {
    console.error('❌ Failed to process video download:', error);
    return {
      success: false,
      message: `Download failed: ${error.message}`,
      videoId: request.videoId
    };
  }
}

// Get cookies for a specific domain
async function getCookiesForDomain(domain) {
  try {
    console.log(`🍪 Getting cookies for domain: ${domain}`);

    const cookies = await chrome.cookies.getAll({ domain });

    console.log(`📋 Found ${cookies.length} cookies for ${domain}`);

    return {
      success: true,
      cookies: cookies,
      domain: domain,
      count: cookies.length
    };
  } catch (error) {
    console.error(`❌ Failed to get cookies for ${domain}:`, error);
    return {
      success: false,
      error: error.message,
      cookies: [],
      domain: domain,
      count: 0
    };
  }
}

// Handle video processing started notification from content script
function handleVideoProcessingStarted(request, sender) {
  const { videoId, processId, downloadUrl, title } = request;
  const tabId = sender.tab?.id;

  if (!tabId) {
    return { error: 'No tab ID available' };
  }

  console.log(`🎬 Video processing started: ${title} (Process ID: ${processId})`);

  // Store processing information in video manager
  const storedVideo = enhancedVideoManager.getTabVideos(tabId);
  if (storedVideo.selected && storedVideo.selected.id === videoId) {
    // Update the selected video with processing info
    storedVideo.selected.processing = {
      processId,
      downloadUrl,
      status: 'processing',
      startTime: Date.now()
    };

    // Update badge to show processing status
    enhancedVideoManager.updateBadge(tabId, '⏳');

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Video Processing Started',
      message: `"${title}" is being processed for download`
    });
  }

  return {
    success: true,
    processId,
    message: 'Processing information stored'
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
    console.log('🎉 Video Downloader Assistant installed');
    chrome.tabs.create({ url: 'http://localhost:3000' });
  }
});

console.log('🚀 Video Downloader Assistant background script loaded');