class PopupManager {
  constructor() {
    this.consentStatus = null;
    this.currentTab = null;
    this.tabVideos = { detected: [], selected: null, count: 0 };
    this.init();
  }

  async init() {
    try {
      await Promise.all([
        this.loadConsentStatus(),
        this.getCurrentTab(),
        this.loadTabVideos()
      ]);
      this.setupEventListeners();
      this.updateUI();
      this.hideLoading();
    } catch (error) {
      this.showError('Failed to load extension: ' + error.message);
    }
  }

  async loadConsentStatus() {
    // For video downloader, consent is always active
    this.consentStatus = {
      granted: true,
      domains: ['*'],
      expiresAt: null,
      sessionId: 'video-downloader'
    };
    return this.consentStatus;
  }

  async getCurrentTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (tabs.length > 0) {
          this.currentTab = tabs[0];
          resolve(tabs[0]);
        } else {
          reject(new Error('No active tab found'));
        }
      });
    });
  }

  async loadTabVideos() {
    if (!this.currentTab) return;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'getTabVideos',
        tabId: this.currentTab.id
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.tabVideos = response || { detected: [], selected: null, count: 0 };
          resolve(response);
        }
      });
    });
  }

  setupEventListeners() {
    document.getElementById('refresh-videos').addEventListener('click', () => {
      this.handleRefreshVideos();
    });

    document.getElementById('open-server').addEventListener('click', () => {
      this.handleOpenServer();
    });
  }

  updateUI() {
    this.updateCurrentDomainDisplay();
    this.updateVideoSection();
  }

  updateCurrentDomainDisplay() {
    const currentDomainDiv = document.getElementById('current-domain');
    const domainStatus = document.getElementById('domain-status');

    if (this.currentTab && this.currentTab.url) {
      try {
        const url = new URL(this.currentTab.url);
        const domain = url.hostname;
        currentDomainDiv.textContent = `📍 ${domain}`;
        domainStatus.textContent = 'Video detection active';
        domainStatus.className = 'platform-status active';
      } catch (error) {
        currentDomainDiv.textContent = '❌ Invalid URL';
        domainStatus.textContent = 'Cannot detect videos';
        domainStatus.className = 'platform-status inactive';
      }
    } else {
      currentDomainDiv.textContent = '❌ No active tab';
      domainStatus.textContent = 'Cannot detect videos';
      domainStatus.className = 'platform-status inactive';
    }
  }

  updateConsentStatus() {
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const expiresInfo = document.getElementById('expires-info');
    const grantBtn = document.getElementById('grant-btn');
    const revokeBtn = document.getElementById('revoke-btn');
    const manualActions = document.getElementById('manual-actions');

    if (this.consentStatus.granted) {
      statusDiv.className = 'status granted';
      statusText.textContent = '✅ Cookie learning is active';

      // Show expiration info
      if (this.consentStatus.expiresAt) {
        const expiresAt = new Date(this.consentStatus.expiresAt);
        const now = new Date();
        const hoursLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
        expiresInfo.textContent = `Expires in ${hoursLeft} hours (${expiresAt.toLocaleString()})`;
      }

      grantBtn.style.display = 'none';
      revokeBtn.style.display = 'block';
      manualActions.style.display = 'flex';

      // Show domain info
      const domainCount = this.consentStatus.domains.includes('*') ? 'all websites' :
                         `${this.consentStatus.domains.length} specific domain(s)`;
      statusText.textContent += ` for ${domainCount}`;

    } else {
      statusDiv.className = 'status not-granted';
      statusText.textContent = '⚠️ Cookie learning is disabled';
      expiresInfo.textContent = '';

      grantBtn.style.display = 'block';
      revokeBtn.style.display = 'none';
      manualActions.style.display = 'none';
    }
  }

  updateGrantButton() {
    const grantBtn = document.getElementById('grant-btn');
    const consentScope = document.querySelector('input[name="consent-scope"]:checked');

    if (this.consentStatus.granted) {
      grantBtn.disabled = true;
      grantBtn.textContent = 'Cookie Learning Active';
    } else {
      grantBtn.disabled = false;
      if (consentScope) {
        if (consentScope.value === 'all') {
          grantBtn.textContent = 'Enable for All Websites';
        } else {
          grantBtn.textContent = 'Enable for Current Site';
        }
      } else {
        grantBtn.textContent = 'Select consent scope first';
        grantBtn.disabled = true;
      }
    }
  }

  getConsentScope() {
    const consentScope = document.querySelector('input[name="consent-scope"]:checked');
    if (!consentScope) return null;

    if (consentScope.value === 'all') {
      return ['*'];
    } else if (consentScope.value === 'current' && this.currentTab) {
      try {
        const url = new URL(this.currentTab.url);
        return [url.hostname];
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  async handleGrantConsent() {
    const domains = this.getConsentScope();

    if (!domains) {
      this.showError('Please select a valid consent scope');
      return;
    }

    this.showLoading('Enabling cookie learning...');

    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'grantConsent',
          domains: domains
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      await this.loadConsentStatus();
      this.updateUI();
      this.hideError();
      this.hideLoading();

    } catch (error) {
      this.showError('Failed to enable cookie learning: ' + error.message);
      this.hideLoading();
    }
  }

  async handleRevokeConsent() {
    this.showLoading('Disabling cookie learning...');

    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'revokeConsent' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      await this.loadConsentStatus();
      this.updateUI();
      this.hideError();
      this.hideLoading();

    } catch (error) {
      this.showError('Failed to revoke consent: ' + error.message);
      this.hideLoading();
    }
  }

  async handleCaptureCurrentSite() {
    if (!this.consentStatus.granted) {
      this.showError('Please enable cookie learning first');
      return;
    }

    const button = document.getElementById('capture-current');
    const originalText = button.textContent;
    button.textContent = 'Capturing...';
    button.disabled = true;

    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'captureCurrentTab'
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      this.hideError();
      this.updateCurrentDomainDisplay();

      // Briefly show success
      button.textContent = '✓ Captured';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1500);

    } catch (error) {
      this.showError('Failed to capture cookies: ' + error.message);
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  async handleRefreshVideos() {
    console.log('🔄 Refreshing video detection...');
    try {
      // Reload the tab videos
      await this.loadTabVideos();
      this.updateVideoSection();

      // Send message to content script to rescan
      chrome.tabs.sendMessage(this.currentTab.id, { action: 'rescanVideos' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready for rescan message');
        }
      });

      this.showSuccess('Video detection refreshed');
    } catch (error) {
      this.showError('Failed to refresh: ' + error.message);
    }
  }

  async handleOpenServer() {
    chrome.tabs.create({ url: 'http://localhost:3000' });
  }

  updateVideoSection() {
    const videoSection = document.getElementById('video-section');
    const videoList = document.getElementById('video-list');
    const noVideosDiv = document.getElementById('no-videos');

    if (this.tabVideos.count > 0) {
      videoSection.style.display = 'block';
      noVideosDiv.style.display = 'none';

      // Add stream analysis summary
      this.addAnalysisSummary(videoSection);

      // Update section header with count
      const header = videoSection.querySelector('h3');
      header.innerHTML = `🎬 Detected Videos: <span class="video-count-badge">${this.tabVideos.count}</span>`;

      // Clear existing video list
      videoList.innerHTML = '';

      // Filter and sort videos for display
      const displayVideos = this.tabVideos.detected
        .filter(video => video.category !== 'hidden' && video.category !== 'thumbnail')
        .sort((a, b) => {
          // Sort by downloadability first, then category priority
          const aDownloadable = a.streamAnalysis?.downloadable ? 0 : 1;
          const bDownloadable = b.streamAnalysis?.downloadable ? 0 : 1;

          if (aDownloadable !== bDownloadable) return aDownloadable - bDownloadable;

          // Sort by category priority
          const categoryPriority = {
            'main': 0,
            'content': 1,
            'secondary': 2,
            'advertisement': 3
          };

          const aPriority = categoryPriority[a.category] ?? 4;
          const bPriority = categoryPriority[b.category] ?? 4;

          if (aPriority !== bPriority) return aPriority - bPriority;

          // Secondary sort by dimensions (larger first)
          return (b.width * b.height) - (a.width * a.height);
        })
        .slice(0, 5); // Show max 5 videos to avoid crowding

      // Create video items
      displayVideos.forEach(video => {
        const videoItem = this.createVideoItem(video);
        videoList.appendChild(videoItem);
      });

      if (displayVideos.length === 0) {
        noVideosDiv.style.display = 'block';
        noVideosDiv.innerHTML = 'Videos detected but filtered out.<br>Try hovering over videos on the page.';
      }
    } else {
      videoSection.style.display = 'block';
      noVideosDiv.style.display = 'block';
    }
  }

  addAnalysisSummary(videoSection) {
    // Remove existing summary
    const existingSummary = videoSection.querySelector('.analysis-summary');
    if (existingSummary) {
      existingSummary.remove();
    }

    // Add new summary if we have analysis data
    if (this.tabVideos.streamAnalysis && this.tabVideos.streamAnalysis.hasAnalysis) {
      const summary = document.createElement('div');
      const analysis = this.tabVideos.streamAnalysis;

      summary.className = `analysis-summary ${analysis.downloadable > 0 ? 'has-downloadable' : 'no-downloadable'}`;

      let summaryText = `📊 Analysis: ${analysis.totalAnalyzed} videos analyzed`;
      if (analysis.downloadable > 0) {
        summaryText += `, ${analysis.downloadable} downloadable`;
      } else {
        summaryText += `, none downloadable`;
      }

      summary.innerHTML = summaryText;

      // Insert before the video list
      const platforms = videoSection.querySelector('.platforms');
      platforms.insertBefore(summary, platforms.firstChild);
    }
  }

  createVideoItem(video) {
    const item = document.createElement('div');
    item.className = 'video-item';
    if (this.tabVideos.selected && this.tabVideos.selected.id === video.id) {
      item.classList.add('selected');
    }

    // Create thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'video-thumbnail';
    if (video.thumbnail) {
      const img = document.createElement('img');
      img.src = video.thumbnail;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '2px';
      thumbnail.appendChild(img);
    } else {
      thumbnail.textContent = '🎬';
    }

    // Create video info
    const info = document.createElement('div');
    info.className = 'video-info';

    const title = document.createElement('div');
    title.className = 'video-title';
    title.textContent = video.title || 'Untitled Video';
    title.title = video.title; // Full title on hover

    const details = document.createElement('div');
    details.className = 'video-details';

    // Add category badge
    const categoryBadge = document.createElement('span');
    categoryBadge.className = `video-badge ${video.category}`;
    categoryBadge.textContent = video.category;

    // Add quality and duration info
    const specs = document.createElement('span');
    specs.textContent = `${video.quality || 'Unknown'}`;
    if (video.duration && video.duration > 0) {
      specs.textContent += ` • ${this.formatDuration(video.duration)}`;
    }
    specs.textContent += ` • ${video.width}x${video.height}`;

    // Add stream analysis badge
    const analysisBadge = this.createAnalysisBadge(video);

    details.appendChild(categoryBadge);
    details.appendChild(analysisBadge);
    details.appendChild(specs);

    // Add stream info if available
    if (video.streamAnalysis) {
      const streamInfo = this.createStreamInfo(video.streamAnalysis);
      details.appendChild(streamInfo);
    }

    info.appendChild(title);
    info.appendChild(details);

    // Create actions
    const actions = document.createElement('div');
    actions.className = 'video-actions';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'video-download-btn-small';
    downloadBtn.textContent = '📥';
    downloadBtn.title = 'Download this video';
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleVideoDownload(video);
    });

    actions.appendChild(downloadBtn);

    // Assemble item
    item.appendChild(thumbnail);
    item.appendChild(info);
    item.appendChild(actions);

    // Add click handler for item selection
    item.addEventListener('click', () => {
      this.selectVideoInList(video);
    });

    return item;
  }

  formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  selectVideoInList(video) {
    // Update UI to show selection
    document.querySelectorAll('.video-item').forEach(item => {
      item.classList.remove('selected');
    });

    event.currentTarget.classList.add('selected');

    // Store selection locally
    this.tabVideos.selected = video;

    console.log('📋 Video selected from popup:', video.title);
  }

  async handleVideoDownload(video) {
    if (!this.consentStatus.granted) {
      this.showError('Please enable cookie learning first to download videos');
      return;
    }

    console.log('🎬 Initiating download for:', video.title);

    try {
      // Show loading state
      const downloadBtns = document.querySelectorAll('.video-download-btn-small');
      downloadBtns.forEach(btn => {
        btn.textContent = '⏳';
        btn.disabled = true;
      });

      const response = await chrome.runtime.sendMessage({
        action: 'downloadVideo',
        videoId: video.id,
        video: video
      });

      if (response.success) {
        this.showSuccess(`Download started for: ${video.title}`);
      } else {
        this.showError(response.message || 'Download failed');
      }
    } catch (error) {
      this.showError('Failed to start download: ' + error.message);
    } finally {
      // Reset button states
      setTimeout(() => {
        const downloadBtns = document.querySelectorAll('.video-download-btn-small');
        downloadBtns.forEach(btn => {
          btn.textContent = '📥';
          btn.disabled = false;
        });
      }, 2000);
    }
  }

  createAnalysisBadge(video) {
    const badge = document.createElement('span');
    badge.className = 'stream-analysis-badge';

    if (!video.streamAnalysis) {
      badge.className += ' unknown';
      badge.textContent = '?';
      badge.title = 'Stream analysis not available';
    } else if (video.streamAnalysis.status === 'analyzing') {
      badge.className += ' analyzing';
      badge.textContent = '⏳';
      badge.title = 'Analyzing stream...';
    } else if (video.streamAnalysis.downloadable) {
      badge.className += ' downloadable';
      badge.textContent = '✓';
      badge.title = `Downloadable (${video.streamAnalysis.confidence || 'unknown'} confidence)`;
    } else {
      badge.className += ' not-downloadable';
      badge.textContent = '✗';
      badge.title = 'Not downloadable';
    }

    return badge;
  }

  createStreamInfo(analysis) {
    const streamInfo = document.createElement('div');
    streamInfo.className = 'stream-info';

    const infoParts = [];

    // Format information
    if (analysis.format) {
      infoParts.push(`<span class="stream-format">${analysis.format}</span>`);
    }

    // Quality options
    if (analysis.qualityOptions && analysis.qualityOptions.length > 0) {
      const qualities = analysis.qualityOptions
        .map(q => q.quality)
        .filter(Boolean)
        .slice(0, 3); // Show max 3 qualities

      qualities.forEach(quality => {
        infoParts.push(`<span class="quality-indicator">${quality}</span>`);
      });

      if (analysis.qualityOptions.length > 3) {
        infoParts.push(`+${analysis.qualityOptions.length - 3} more`);
      }
    }

    // Stream count
    if (analysis.streams && analysis.streams.length > 0) {
      infoParts.push(`${analysis.streams.length} stream${analysis.streams.length > 1 ? 's' : ''}`);
    }

    streamInfo.innerHTML = infoParts.join(' • ');
    return streamInfo;
  }

  showSuccess(message) {
    // Create a temporary success notification
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      background: #4caf50;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 12px;
      position: relative;
    `;
    successDiv.textContent = message;

    const content = document.getElementById('content');
    content.insertBefore(successDiv, content.firstChild);

    // Remove after 3 seconds
    setTimeout(() => successDiv.remove(), 3000);
  }

  showLoading(message = 'Loading...') {
    document.getElementById('loading').textContent = message;
    document.getElementById('loading').style.display = 'block';
    document.getElementById('content').style.display = 'none';
  }

  hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  }

  showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  hideError() {
    document.getElementById('error').style.display = 'none';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});