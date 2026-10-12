import { ensureSchema, findCandidate, getDevice, getDeviceId, hash, json, rateLimit, touchDevice, trackEvent } from '@/lib/server';

export async function GET(request: Request) {
  await ensureSchema();
  const deviceId = getDeviceId(request);
  if (!deviceId) return json({ error: 'This browser could not be recognized.' }, 400);
  const deviceHash = await hash(deviceId);
  if (!await rateLimit(deviceHash, 'oracle', 120, 60 * 60 * 1000)) {
    return json({ error: 'The Oracle needs a little quiet. Try again soon.' }, 429);
  }

  await touchDevice(deviceHash);
  const question = await findCandidate(deviceHash);
  const device = await getDevice(deviceHash);

  const sessionId = request.headers.get('x-oracle-session');
  if (question) await trackEvent('question_viewed', deviceHash, sessionId, question.id);

  return json({
    question: question || null,
    canAsk: Boolean(device.credits > 0 || (!question && device.coldStartUsed === 0)),
  });
}
