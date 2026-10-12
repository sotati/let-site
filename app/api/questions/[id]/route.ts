import { ensureSchema, expireQuestion, getDeviceId, getQuestion, hash, json, rateLimit } from '@/lib/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const deviceId = getDeviceId(request);
  if (!deviceId) return json({ error: 'This browser could not be recognized.' }, 400);
  const deviceHash = await hash(deviceId);
  if (!await rateLimit(deviceHash, 'status', 500, 60 * 60 * 1000)) {
    return json({ error: 'Please wait before checking again.' }, 429);
  }

  const { id } = await context.params;
  let question = await getQuestion(id);
  if (!question || question.askerHash !== deviceHash) return json({ error: 'Question not found.' }, 404);
  if (question.status === 'pending' && question.expiresAt <= Date.now()) {
    await expireQuestion(id);
    question = { ...question, status: 'expired', askLat: null, askLng: null };
  }
  return json({ question: {
    id: question.id, text: question.text, status: question.status, answer: question.answer,
    distanceKm: question.distanceKm, createdAt: question.createdAt,
    answeredAt: question.answeredAt, expiresAt: question.expiresAt,
  } });
}
