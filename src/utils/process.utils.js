const logger = require('../configs/logger.config');

// Enhanced video grouping for backend - identify streams belonging to the same video
const getVideoGroupingKey = url => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const domain = urlObj.hostname;

    // Strategy 1: Look for video identifiers
    const videoIdPatterns = [
      /\/video[_-]?(\w+)/i,
      /\/watch[_-]?(\w+)/i,
      /\/v[_-]?(\w+)/i,
      /\/(\w{8,})/,
      /\/([a-zA-Z0-9]{6,})-/,
    ];

    for (const pattern of videoIdPatterns) {
      const match = pathname.match(pattern);
      if (match && match[1]) {
        return `${domain}-${match[1]}`;
      }
    }

    // Strategy 2: Group by base path (remove quality/format indicators)
    const basePath = pathname
      .replace(/\/\d+p?\/.*$/, '')
      .replace(/\/playlist\.m3u8.*$/, '')
      .replace(/\/index\.m3u8.*$/, '')
      .replace(/\/master\.m3u8.*$/, '')
      .replace(/\/\w+\.m3u8.*$/, '')
      .replace(/\/chunklist.*$/, '')
      .replace(/\/seg-\d+.*$/, '')
      .replace(/\/\d+-\d+.*$/, '');

    if (basePath && basePath !== '/' && basePath.length > 5) {
      return `${domain}${basePath}`;
    }

    // Strategy 3: Parent directory grouping
    const segments = pathname.split('/').filter(s => s.length > 0);
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];

      if (
        !segment.includes('.') &&
        !segment.match(/^\d+$/) &&
        !segment.includes('playlist') &&
        !segment.includes('chunklist') &&
        segment.length > 3
      ) {
        return `${domain}-${segments.slice(0, i + 1).join('/')}`;
      }
    }

    // Fallback
    return segments.length > 0 ? `${domain}-${segments[0]}` : domain;
  } catch (error) {
    return `unknown-${Date.now()}`;
  }
};

// Extract display name from grouping key
const extractVideoNameFromGroupingKey = (groupingKey, streams = []) => {
  try {
    const keyWithoutDomain = groupingKey.replace(/^[^-]+-/, '');

    if (streams.length > 0) {
      // Analyze all stream URLs to find common meaningful segments
      const allSegments = streams.map(stream => {
        try {
          const url = new URL(stream.url);
          return url.pathname.split('/').filter(s => s.length > 0);
        } catch {
          return [];
        }
      });

      if (allSegments.length > 0) {
        const firstSegments = allSegments[0];
        for (const segment of firstSegments) {
          if (
            segment.includes('.m3u8') ||
            segment.includes('playlist') ||
            segment.includes('chunklist') ||
            segment.match(/^\d+p?$/) ||
            segment.includes('master') ||
            segment.includes('index')
          ) {
            continue;
          }

          if (segment.length > 3 && !segment.match(/^\d+$/)) {
            return segment
              .replace(/[_-]/g, ' ')
              .replace(/\.(mp4|webm|m3u8).*$/i, '')
              .trim();
          }
        }
      }
    }

    return (
      keyWithoutDomain
        .replace(/[_-]/g, ' ')
        .replace(/\.(mp4|webm|m3u8).*$/i, '')
        .trim() || 'Video Stream'
    );
  } catch (error) {
    return 'Video Stream';
  }
};

module.exports = {
  getVideoGroupingKey,
  extractVideoNameFromGroupingKey,
  extractVideoNameFromGroupingKey,
};
