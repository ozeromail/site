import type { APIRoute } from 'astro';
import { INDEXABLE } from '../config';

export const GET: APIRoute = () =>
  new Response(INDEXABLE ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');
