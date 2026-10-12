import { ensureSchema, getDeviceId, hash, json, rateLimit, safeBody, trackEvent } from '@/lib/server';

const ALLOWED_EVENTS = new Set(['session_started', 'reveal_viewed']);

export async function POST(request: Request) {
  await ensureSchema();
  const body = await safeBody(request);
  if (!body) return json({ error: 'Event could not be read.' }, 400);
  const deviceId = getDeviceId(request, body);
  const eventType = typeof body.eventType === 'string' ? body.eventType : '';
  if (!deviceId || !ALLOWED_EVENTS.has(eventType)) return json({ error: 'Invalid event.' }, 400);
  const deviceHash = await hash(deviceId);
  if (!await rateLimit(deviceHash, 'event', 100, 60 * 60 * 1000)) return json({ error: 'Too many events.' }, 429);
  await trackEvent(eventType, deviceHash, typeof body.sessionId === 'string' ? body.sessionId : null, typeof body.questionId === 'string' ? body.questionId : null);
  return json({ tracked: true });
}
