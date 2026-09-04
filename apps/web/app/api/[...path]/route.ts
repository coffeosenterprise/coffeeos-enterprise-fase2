import type { NextRequest } from 'next/server';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3000';
  const publicRoutes = new Set(['health', 'metrics', 'version']);
  const upstreamPath = publicRoutes.has(path[0])
    ? path.join('/')
    : `api/${path.join('/')}`;
  const target = new URL(`${baseUrl.replace(/\/$/, '')}/${upstreamPath}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'x-correlation-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer(),
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  const contentType = response.headers.get('content-type');
  const correlationId = response.headers.get('x-correlation-id');
  if (contentType) responseHeaders.set('content-type', contentType);
  if (correlationId) responseHeaders.set('x-correlation-id', correlationId);

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
