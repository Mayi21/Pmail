/**
 * JWT signing / verification using a single static secret.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../index';

const TOKEN_EXPIRY = '7d';

function getSecret(env: Env): Uint8Array {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signToken(env: Env, payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret(env));
}

export async function verifyToken(env: Env, token: string): Promise<any> {
  const { payload } = await jwtVerify(token, getSecret(env));
  return payload;
}
