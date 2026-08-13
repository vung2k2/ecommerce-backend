import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';

const server = createServer(createApp());

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'HTTP server started');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown started');

  server.close((error) => {
    void finalizeShutdown(error);
  });
}

async function finalizeShutdown(error?: Error) {
  await prisma.$disconnect();

  if (error) {
    logger.error({ error }, 'HTTP server failed to close cleanly');
    process.exit(1);
  }

  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
