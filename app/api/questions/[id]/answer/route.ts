import { answerQuestion, approximateLocation, distanceKm, ensureSchema, getDeviceId, getQuestion, hash, json, rateLimit, safeBody, touchDevice, trackEvent } from '@/lib/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const body = await safeBody(request);
  if (!body) return json({ error: 'That answer could not be read.' }, 400);
  const deviceId = getDeviceId(request, body);
  if (!deviceId) return json({ error: 'This browser could not be recognized.' }, 400);
  const answer = body.answer;
  if (answer !== 'YES' && answer !== 'NO') return json({ error: 'Choose YES or NO.' }, 400);
  const deviceHash = await hash(deviceId);
  if (!await rateLimit(deviceHash, 'answer', 30, 60 * 60 * 1000)) {
    return json({ error: 'You have answered enough for now. Come back later.' }, 429);
  }

  const { id } = await context.params;
  const now = Date.now();
  const question = await getQuestion(id);
  if (!question || question.status !== 'pending') return json({ error: 'Another human answered first.' }, 409);
  if (question.askerHash === deviceHash) return json({ error: 'You cannot answer your own question.' }, 403);

  const answerLocation = approximateLocation(request);
  const distance = answerLocation && question.askLat !== null && question.askLng !== null
    ? distanceKm({ lat: question.askLat, lng: question.askLng }, answerLocation)
    : null;
  await touchDevice(deviceHash);
  const result = await answerQuestion({ questionId: id, answer, answererHash: deviceHash, now, distanceKm: distance });
  if (result === -2) return json({ error: 'You cannot answer your own question.' }, 403);
  if (result !== 1) return json({ error: 'Another human answered first.' }, 409);
  await trackEvent('question_answered', deviceHash, typeof body.sessionId === 'string' ? body.sessionId : null, id);
  return json({ counted: true });
}
