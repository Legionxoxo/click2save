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