const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function publicFrontendUrl() {
  const configured = process.env.PUBLIC_FRONTEND_URL?.trim();
  const production = process.env.NODE_ENV === 'production';
  if (!configured) {
    if (production) throw new Error('PUBLIC_FRONTEND_URL is required in production');
    return 'http://localhost:3000';
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('PUBLIC_FRONTEND_URL must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_FRONTEND_URL must use HTTP or HTTPS');
  }
  if (production && (url.protocol !== 'https:' || LOCAL_HOSTS.has(url.hostname.toLowerCase()))) {
    throw new Error('PUBLIC_FRONTEND_URL must be a public HTTPS URL in production');
  }
  return url.toString().replace(/\/$/, '');
}
