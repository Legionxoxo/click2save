// Minimal test background script to verify basic functionality
console.log('🚀 Testing background script...');

// Test chrome.webRequest API
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = details.url;
    if (url.includes('.m3u8')) {
      console.log('🔥 M3U8 found:', url);
    }
  },
  { urls: ['<all_urls>'] }
);

// Test basic class
class TestManager {
  constructor() {
    console.log('✅ TestManager created');
  }
}

const testManager = new TestManager();

console.log('✅ Background script test completed');