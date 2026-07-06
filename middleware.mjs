const COMING_SOON_PATH = '/coming-soon.html';

function shouldInspectPath(pathname) {
  return (
    pathname === '/' ||
    pathname === COMING_SOON_PATH ||
    pathname.startsWith('/account') ||
    pathname.endsWith('.html')
  );
}

export const config = {
  matcher: ['/((?!api|admin).*)'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!shouldInspectPath(pathname)) return;

  try {
    const settingsResponse = await fetch(new URL('/api/settings', request.url), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!settingsResponse.ok) return;

    const settings = await settingsResponse.json();
    const siteIsPrivate = String(settings?.site_private_mode || 'false').toLowerCase() === 'true';

    if (siteIsPrivate && pathname !== COMING_SOON_PATH) {
      return Response.redirect(new URL(COMING_SOON_PATH, request.url), 307);
    }

    if (!siteIsPrivate && pathname === COMING_SOON_PATH) {
      return Response.redirect(new URL('/', request.url), 307);
    }
  } catch (error) {
    console.error('Website visibility middleware failed:', error);
  }
}
