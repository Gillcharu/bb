import { env } from './config/env';
import 'express-async-errors';
import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './utils/logger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandlers';
import { setupSocketLiveEngine } from './sockets/live';
import { prisma } from './config/db';

const app = express();

if (env.trustProxy) {
  // Required so req.ip reflects the real client IP behind a reverse proxy / load balancer.
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');

app.use(
  helmet({
    hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

// Prevent browsers/proxies from caching authenticated API responses.
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser clients (no Origin header) and exact whitelisted origins only.
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(json({ limit: '100kb' }));
app.use(urlencoded({ extended: true, limit: '100kb' }));

// Liveness probe for container orchestration
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);
// Global error handler
app.use(errorHandler);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: env.corsOrigins, credentials: true },
});
app.set('io', io);

setupSocketLiveEngine(io);

httpServer.listen(env.port, () => {
  logger.info(`Backend server listening on port ${env.port} (${env.nodeEnv} mode)`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received: shutting down gracefully`);
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force-exit if connections refuse to drain in time.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', { reason: String(reason) });
});
