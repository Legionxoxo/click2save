class PopupManager {
  constructor() {
    this.consentStatus = null;
    this.currentTab = null;
    this.init();
  }

  async init() {
    try {
      await Promise.all([
        this.loadConsentStatus(),
        this.getCurrentTab()
      ]);
      this.setupEventListeners();
      this.updateUI();
      this.hideLoading();
    } catch (error) {
      this.showError('Failed to load extension: ' + error.message);
    }
  }

  async loadConsentStatus() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getConsentStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          this.consentStatus = response;
          resolve(response);
        }
      });
    });
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

  setupEventListeners() {
    document.getElementById('grant-btn').addEventListener('click', () => {
      this.handleGrantConsent();
    });

    document.getElementById('revoke-btn').addEventListener('click', () => {
      this.handleRevokeConsent();
    });

    document.getElementById('capture-current').addEventListener('click', () => {
      this.handleCaptureCurrentSite();
    });

    document.getElementById('view-status').addEventListener('click', () => {
      this.handleViewStatus();
    });

    // Handle consent scope changes
    document.querySelectorAll('input[name="consent-scope"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.updateGrantButton();
      });
    });
  }

  updateUI() {
    this.updateCurrentDomainDisplay();
    this.updateConsentStatus();
    this.updateGrantButton();
  }

  updateCurrentDomainDisplay() {
    const currentDomainDiv = document.getElementById('current-domain');
    const domainStatus = document.getElementById('domain-status');

    if (this.currentTab && this.currentTab.url) {
      try {
        const url = new URL(this.currentTab.url);
        const domain = url.hostname;
        currentDomainDiv.textContent = `📍 ${domain}`;

        if (this.consentStatus && this.consentStatus.granted) {
          const hasAccess = this.consentStatus.domains.includes('*') ||
                           this.consentStatus.domains.includes(domain);
          domainStatus.textContent = hasAccess ? 'Active' : 'Not consented';
          domainStatus.className = `platform-status ${hasAccess ? 'active' : 'inactive'}`;
        } else {
          domainStatus.textContent = 'Ready to capture';
          domainStatus.className = 'platform-status inactive';
        }
      } catch (error) {
        currentDomainDiv.textContent = '❌ Invalid URL';
        domainStatus.textContent = 'Cannot capture';
        domainStatus.className = 'platform-status inactive';
      }
    } else {
      currentDomainDiv.textContent = '❌ No active tab';
      domainStatus.textContent = 'Cannot capture';
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

  async handleViewStatus() {
    // Open the web dashboard
    chrome.tabs.create({ url: 'http://localhost:3000' });
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