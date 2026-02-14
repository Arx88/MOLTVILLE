import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';

export function createAppServer({ config, logger, runWithLogContext, trackHttpRequest }) {
  const app = express();
  const httpServer = createServer(app);

  const allowedOrigins = [
    config.frontendUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin);

  const io = new Server(httpServer, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Socket origin not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('HTTP origin not allowed by CORS'));
      }
    },
    credentials: true
  }));

  app.use((req, res, next) => {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    runWithLogContext({
      request_id: requestId,
      correlation_id: `http-${requestId}`,
      tick_id: null
    }, () => next());
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(trackHttpRequest);

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('HTTP request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  const limiter = rateLimit({
    windowMs: config.apiRateWindowMs,
    max: config.apiRateLimit,
    message: 'Too many requests from this IP, please try again later.',
    handler: (req, res) => {
      res.status(429).json({
        error: { message: 'Too many requests from this IP, please try again later.', status: 429 },
        requestId: req.requestId
      });
    }
  });
  app.use('/api/', limiter);

  return {
    app,
    io,
    httpServer,
    allowedOrigins,
    isAllowedOrigin
  };
}
