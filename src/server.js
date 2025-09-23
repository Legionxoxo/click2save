const app = require('./app.js');
const logger = require('./configs/logger.config');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server started and listening on http://localhost:${PORT}`);
});

// Graceful shutdown function
const shutdown = signal => {
  console.log(`\n⚡️ Received ${signal}. Shutting down gracefully...`);

  // Set a timeout to force exit if graceful shutdown takes too long
  const forceShutdown = setTimeout(() => {
    console.log('🚫 Force shutting down...');
    process.exit(1);
  }, 10000);

  // Check if server is actually running before trying to close
  if (server && server.listening) {
    server.close(err => {
      if (err) {
        console.error('❌ Error during server shutdown:', err);
        clearTimeout(forceShutdown);
        process.exit(1);
      }

      // Close logger transports to ensure all file handles are released
      logger.close(() => {
        console.log('✅ Server closed successfully.');
        clearTimeout(forceShutdown);
        process.exit(0);
      });
    });
  } else {
    console.log('📭 Server was not running.');
    clearTimeout(forceShutdown);
    process.exit(0);
  }
};

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', err => {
  console.error('❌ Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  console.error('❌ Unhandled Rejection:', reason);
  shutdown('unhandledRejection');
});
