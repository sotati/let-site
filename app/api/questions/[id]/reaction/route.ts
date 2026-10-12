import { ensureSchema, getDeviceId, getQuestion, hash, json, rateLimit, safeBody, saveReaction, trackEvent } from '@/lib/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const body = await safeBody(request);
  if (!body) return json({ error: 'That reaction could not be read.' }, 400);
  const deviceId = getDeviceId(request, body);
  if (!deviceId) return json({ error: 'This browser could not be recognized.' }, 400);
  const feeling = body.feeling;
  const knowsNow = body.knowsNow;
  if (!['relief', 'disappointment', 'nothing'].includes(String(feeling)) || typeof knowsNow !== 'boolean') {
    return json({ error: 'Choose one response for each question.' }, 400);
  }
  const deviceHash = await hash(deviceId);
  if (!await rateLimit(deviceHash, 'reaction', 10, 60 * 60 * 1000)) return json({ error: 'Try again later.' }, 429);
  const { id: questionId } = await context.params;
  const question = await getQuestion(questionId);
  if (!question || question.askerHash !== deviceHash || question.status !== 'answered') return json({ error: 'Question not found.' }, 404);

  const result = await saveReaction({ questionId, askerHash: deviceHash, feeling: String(feeling), knowsNow });
  if (!result) return json({ error: 'You already recorded your reaction.' }, 409);
  await trackEvent('reaction_submitted', deviceHash, typeof body.sessionId === 'string' ? body.sessionId : null, questionId);
  return json({ saved: true });
}
