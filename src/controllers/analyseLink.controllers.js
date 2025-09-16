const logger = require('../configs/logger.config');

const analyseLink = async (req, res, next) => {
  try {
    const { videoUrl, title, quality, platform, duration, metadata, m3u8Urls, detectedStreams } = req.body;

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
      streamCount: detectedStreams?.length || 0
    });

    // Log M3U8 URLs for downloading
    if (m3u8Urls && m3u8Urls.length > 0) {
      console.log('🎯 M3U8 URLs detected for downloading:');
      m3u8Urls.forEach((stream, index) => {
        console.log(`  ${index + 1}. Quality: ${stream.quality || 'unknown'}`);
        console.log(`     URL: ${stream.url}`);
        console.log(`     Domain: ${stream.domain}`);
        console.log('');
      });
    }

    // Log all detected streams
    if (detectedStreams && detectedStreams.length > 0) {
      console.log('📊 All detected streams:');
      detectedStreams.forEach((stream, index) => {
        console.log(`  ${index + 1}. Format: ${stream.format}, Quality: ${stream.quality || 'unknown'}`);
        console.log(`     URL: ${stream.url.substring(0, 100)}...`);
      });
    }

    // Generate a demo process ID
    const processId =
      'demo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);

    // Simulate processing delay and return demo download link
    setTimeout(() => {
      logger.info(
        `Demo processing completed for: ${title} (Process ID: ${processId})`
      );
    }, 2000);

    // Return demo response with download link
    res.status(200).json({
      success: true,
      processId: processId,
      message: 'Video processing started (demo mode)',
      downloadUrl: `${req.protocol}://${req.get('host')}/api/video/download/${processId}`,
      estimatedTime: '30 seconds',
      title: title,
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
