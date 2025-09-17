const logger = require('../configs/logger.config');
const processLink = require('../services/process.service');
const { extractVideoNameFromGroupingKey } = require('../utils/process.utils');

const analyseLink = async (req, res, next) => {
  try {
    const {
      videoUrl,
      title,
      quality,
      platform,
      duration,
      metadata,
      m3u8Urls,
      detectedStreams,
      cookies,
      sessionId,
    } = req.body;

    // Validate required fields
    if (!videoUrl) {
      throw new Error('No video url provided');
    }

    // Log the video processing request
    logger.info('Video Processing Request Received', {
      title,
      videoUrl,
      quality,
      platform,
      duration,
      metadata,
      m3u8Count: m3u8Urls?.length || 0,
      streamCount: detectedStreams?.length || 0,
      cookieCount: cookies?.length || 0,
      hasSessionId: !!sessionId,
    });

    // Log cookie information if provided
    if (cookies && cookies.length > 0) {
      logger.info('Cookies received for video processing', {
        domain: cookies[0]?.domain || 'unknown',
        cookieCount: cookies.length,
        sessionId: sessionId,
      });
      console.log('🍪 Cookies received for video download authentication');
    }

    // Group M3U8 URLs by video name/domain for better organization
    let groupedVideos = [];
    if (m3u8Urls && m3u8Urls.length > 0) {
      console.log('🎯 M3U8 URLs detected for downloading:');

      // Group M3U8 URLs by video name or domain
      const videoGroups = new Map();

      console.log(
        `🔍 Starting enhanced M3U8 grouping for ${m3u8Urls.length} streams...`
      );

      m3u8Urls.forEach((stream, index) => {
        console.log(`  ${index + 1}. Quality: ${stream.quality || 'unknown'}`);
        console.log(`     URL: ${stream.url}`);
        console.log(`     Domain: ${stream.domain}`);

        // Use enhanced grouping logic
        const groupingKey = getVideoGroupingKey(stream.url);
        console.log(`     → Group key: ${groupingKey}`);
        console.log('');

        if (!videoGroups.has(groupingKey)) {
          videoGroups.set(groupingKey, {
            groupingKey: groupingKey,
            name: null, // Will be determined after all streams are grouped
            domain: stream.domain,
            streams: [],
          });
        }

        videoGroups.get(groupingKey).streams.push(stream);
      });

      // Determine the best display name for each group
      videoGroups.forEach((group, groupingKey) => {
        group.name = extractVideoNameFromGroupingKey(
          groupingKey,
          group.streams
        );
        console.log(
          `📊 Group "${groupingKey}" → Display name: "${group.name}" (${group.streams.length} streams)`
        );
      });

      // Convert grouped data to array for easier processing
      groupedVideos = Array.from(videoGroups.values());

      console.log(`📊 Grouped into ${groupedVideos.length} videos:`);
      groupedVideos.forEach((video, index) => {
        console.log(
          `  ${index + 1}. "${video.name}" - ${video.streams.length} stream(s)`
        );
      });
    }

    // Log all detected streams
    if (detectedStreams && detectedStreams.length > 0) {
      console.log('📊 All detected streams:');
      detectedStreams.forEach((stream, index) => {
        console.log(
          `  ${index + 1}. Format: ${stream.format}, Quality: ${stream.quality || 'unknown'}`
        );
        console.log(`     URL: ${stream.url.substring(0, 100)}...`);
      });
    }

    // Generate a demo process ID
    const processId =
      'demo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);

    //process them with ffmpeg
    processLink(processId, sessionId);

    // Simulate processing delay and return demo download link
    setTimeout(() => {
      logger.info(
        `Demo processing completed for: ${title} (Process ID: ${processId})`
      );
    }, 2000);

    // Return demo response with download link and grouped videos
    res.status(200).json({
      success: true,
      processId: processId,
      message: 'Video processing started (demo mode)',
      downloadUrl: `${req.protocol}://${req.get('host')}/api/video/download/${processId}`,
      estimatedTime: '30 seconds',
      title: title,
      groupedVideos: groupedVideos,
      originalM3U8Count: m3u8Urls?.length || 0,
      groupedVideoCount: groupedVideos.length,
    });
  } catch (error) {
    logger.error('Error processing video', error);
    next(error);
  }
};

const processStatus = async (req, res, next) => {
  try {
    const { processId } = req.params;

    if (!processId) {
      throw new Error('No process id provided');
    }

    logger.info('Status check for process ID:', processId);

    // Demo response - always return completed status
    res.status(200).json({
      processId: processId,
      status: 'completed',
      progress: 100,
      downloadUrl: `${req.protocol}://${req.get('host')}/api/video/download/${processId}`,
      message: 'Demo video ready for download',
    });
  } catch (error) {
    logger.error('Error processing status', error);
    next(error);
  }
};

const downloadLink = async (req, res, next) => {
  try {
    const { processId } = req.params;

    if (!processId) {
      throw new Error('No process id provided');
    }

    logger.info('Download request for process ID:', processId);

    // In demo mode, serve local sample video
    const demoVideoUrl = `${req.protocol}://${req.get('host')}/public/sample-video.mp4`;

    logger.info('Redirecting to local demo video:', demoVideoUrl);

    res.redirect(demoVideoUrl);
  } catch (error) {
    logger.error('Error processing download link', error);
    next(error);
  }
};

module.exports = {
  analyseLink,
  processStatus,
  downloadLink,
};
