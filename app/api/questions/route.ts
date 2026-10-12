import { moderateQuestion } from '@/lib/moderation';
import { approximateLocation, createQuestion, ensureSchema, findCandidate, getDevice, getDeviceId, hash, id, json, rateLimit, safeBody, touchDevice, trackEvent } from '@/lib/server';

export async function POST(request: Request) {
  await ensureSchema();
  const body = await safeBody(request);
  if (!body) return json({ error: 'That question could not be read.' }, 400);
  const deviceId = getDeviceId(request, body);
  if (!deviceId) return json({ error: 'This browser could not be recognized.' }, 400);
  const deviceHash = await hash(deviceId);
  if (!await rateLimit(deviceHash, 'ask', 5, 60 * 60 * 1000)) {
    return json({ error: 'You have asked enough for now. Let the questions breathe.' }, 429);
  }

  const moderation = moderateQuestion(body.question);
  if (!moderation.ok) return json({ error: moderation.message }, 422);
  await touchDevice(deviceHash);

  const now = Date.now();
  const device = await getDevice(deviceHash);
  const available = await findCandidate(deviceHash);
  const hasCredit = device.credits > 0;
  const coldStart = !hasCredit && !available && device.coldStartUsed === 0;
  if (!hasCredit && !coldStart) return json({ error: 'Decide for one human before asking your own question.' }, 403);

  const normalizedHash = await hash(`${moderation.normalized.toLocaleLowerCase()}:${Math.floor(now / 86_400_000)}`);
  const location = approximateLocation(request);
  const questionId = id();
  const expiresAt = now + 24 * 60 * 60 * 1000;
  const created = await createQuestion({
    questionId, text: moderation.normalized, normalizedHash, askerHash: deviceHash,
    now, expiresAt, location, coldStartAllowed: coldStart,
  });
  if (created === -2) return json({ error: 'You already sent this question today.' }, 409);
  if (created !== 1) return json({ error: 'Decide for one human before asking your own question.' }, 403);
  await trackEvent('question_submitted', deviceHash, typeof body.sessionId === 'string' ? body.sessionId : null, questionId);

  return json({ id: questionId, text: moderation.normalized, expiresAt }, 201);
}
