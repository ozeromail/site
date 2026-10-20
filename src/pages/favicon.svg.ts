import { markSvg } from '../components/mark';

export const GET = () =>
  new Response(markSvg('m', 'xmlns="http://www.w3.org/2000/svg"'), { headers: { 'Content-Type': 'image/svg+xml' } });
