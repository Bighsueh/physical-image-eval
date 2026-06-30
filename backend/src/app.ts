import cookieParser from 'cookie-parser';
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import { ZodError } from 'zod';
import './types/express.d';
import { env } from './config/env';
import { ok, fail } from './lib/envelope';
import { ERRORS, isAppError } from './lib/errors';
import { apiRouter } from './routes/index';

/**
 * Express app wiring (constitution VI/X). Order: trust-proxy (prod only) → cookie-parser → json →
 * /api routes → 404 envelope → central error handler that maps AppError / ZodError / JSON-parse
 * errors / unknown to the response envelope. Exported as `app` for supertest (no listen here).
 */
export const createApp = () => {
  const app = express();

  // Behind Cloudflared/nginx in prod we need a single trusted proxy hop for correct req.ip.
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
  app.disable('x-powered-by');

  app.use(cookieParser());
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json(ok({ status: 'ok' }));
  });

  app.use('/api', apiRouter);

  // Unknown route → 404 envelope (US3: probed register paths return this, never a form).
  app.use((_req: Request, res: Response) => {
    res.status(ERRORS.NOT_FOUND.status).json(fail('NOT_FOUND', ERRORS.NOT_FOUND.message));
  });

  // Central error handler → envelope. Never leaks secrets; logs server-side detail only.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (isAppError(err)) {
      return res.status(err.status).json(fail(err.code, err.publicMessage));
    }
    if (err instanceof ZodError) {
      return res
        .status(ERRORS.VALIDATION_ERROR.status)
        .json(fail('VALIDATION_ERROR', ERRORS.VALIDATION_ERROR.message));
    }
    // Malformed JSON body from express.json().
    if (err instanceof SyntaxError && 'body' in err) {
      return res
        .status(ERRORS.VALIDATION_ERROR.status)
        .json(fail('VALIDATION_ERROR', ERRORS.VALIDATION_ERROR.message));
    }
    console.error('[unhandled]', err instanceof Error ? err.message : err);
    return res
      .status(ERRORS.INTERNAL_ERROR.status)
      .json(fail('INTERNAL_ERROR', ERRORS.INTERNAL_ERROR.message));
  };
  app.use(errorHandler);

  return app;
};

export const app = createApp();
