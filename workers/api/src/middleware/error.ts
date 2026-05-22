/**
 * Error Handling Middleware
 */

import { Context } from 'hono';
import { ErrorCode } from '../types';

/**
 * Helper function to preserve CORS headers in responses
 */
export function preserveCorsHeaders(c: Context) {
  const origin = c.req.header('Origin');
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
}

export interface AppError extends Error {
  status?: number;
  code?: ErrorCode;
}

export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err);

  const appError = err as AppError;
  const status = appError.status || 500;
  const code = appError.code || ErrorCode.INTERNAL_ERROR;

  if (status === 500) {
    // Log internal errors
    console.error('Internal error:', {
      message: err.message,
      stack: err.stack,
      url: c.req.url,
      method: c.req.method,
    });
  }

  // Preserve CORS headers in error responses
  preserveCorsHeaders(c);

  return c.json({
    success: false,
    error: status === 500 ? 'Internal server error' : err.message,
    error_code: code,
  }, status);
}