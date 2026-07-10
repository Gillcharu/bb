import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { json, urlencoded } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandlers';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(json());
app.use(urlencoded({ extended: true }));

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);
// Global error handler
app.use(errorHandler);

import { setupSocketLiveEngine } from './sockets/live';

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*', credentials: true },
});
app.set('io', io);

setupSocketLiveEngine(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  logger.info(`Backend server listening on http://localhost:${PORT}`);
});
