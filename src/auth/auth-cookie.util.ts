import { Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

export function extractRefreshTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(value.join('='));
    }
  }

  return null;
}

export function getRefreshCookieMaxAgeMs() {
  const configuredDays = Number(process.env.AUTH_REFRESH_COOKIE_DAYS ?? '7');
  return configuredDays * 24 * 60 * 60 * 1000;
}

export function buildRefreshCookieOptions(maxAge: number) {
  const secure =
    process.env.AUTH_COOKIE_SECURE !== undefined
      ? process.env.AUTH_COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure,
    sameSite: (process.env.AUTH_COOKIE_SAME_SITE ?? 'lax') as 'lax' | 'strict' | 'none',
    path: process.env.AUTH_COOKIE_PATH ?? '/api/auth',
    maxAge,
  } as const;
}

export function setRefreshTokenCookie(response: Response, refreshToken: string) {
  response.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    buildRefreshCookieOptions(getRefreshCookieMaxAgeMs()),
  );
}

export function clearRefreshTokenCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE_NAME, buildRefreshCookieOptions(0));
}
