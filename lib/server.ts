import { Redis } from '@upstash/redis';

const DEVICE_ID = /^[a-zA-Z0-9_-]{16,80}$/;
const PREFIX = 'human-oracle:v1';
const QUEUE_KEY = PREFIX + ':queue';
const EVENTS_KEY = PREFIX + ':events';
const PENDING_TTL_SECONDS = 25 * 60 * 60;
const ANSWERED_TTL_SECONDS = 30 * 24 * 60 * 60;
let redisClient: Redis | null = null;

export type QuestionRecord = {
  id: string;
  text: string;
  normalizedHash: string;
  askerHash: string;
  status: 'pending' | 'answered' | 'expired';
  answer: 'YES' | 'NO' | null;
  answererHash: string | null;
  createdAt: number;
  answeredAt: number | null;
  expiresAt: number;
  distanceKm: number | null;
  askLat: number | null;
  askLng: number | null;
};

type DeviceRecord = {
  credits: number;
  coldStartUsed: number;
  firstSeenAt: number;
  lastSeenAt: number;
};

function redis() {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis environment variables are unavailable.');
  redisClient = new Redis({ url, token, enableAutoPipelining: true });
  return redisClient;
}

const deviceKey = (deviceHash: string) => PREFIX + ':device:' + deviceHash;
const questionKey = (questionId: string) => PREFIX + ':question:' + questionId;
const duplicateKey = (deviceHash: string, normalizedHash: string) => PREFIX + ':duplicate:' + deviceHash + ':' + normalizedHash;

export async function ensureSchema() {
  redis();
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function getDeviceId(request: Request, body?: Record<string, unknown>) {
  const value = request.headers.get('x-oracle-device') || body?.deviceId;
  return typeof value === 'string' && DEVICE_ID.test(value) ? value : null;
}

export async function hash(value: string) {
  const bytes = new TextEncoder().encode('human-oracle:v1:' + value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function id() {
  return crypto.randomUUID().replaceAll('-', '');
}

export async function touchDevice(deviceHash: string) {
  const now = Date.now();
  const key = deviceKey(deviceHash);
  const pipeline = redis().pipeline();
  pipeline.hsetnx(key, 'credits', 0);
  pipeline.hsetnx(key, 'coldStartUsed', 0);
  pipeline.hsetnx(key, 'firstSeenAt', now);
  pipeline.hset(key, { lastSeenAt: now });
  await pipeline.exec();
}

export async function getDevice(deviceHash: string): Promise<DeviceRecord> {
  const record = await redis().hgetall<Record<string, unknown>>(deviceKey(deviceHash));
  return {
    credits: toNumber(record?.credits),
    coldStartUsed: toNumber(record?.coldStartUsed),
    firstSeenAt: toNumber(record?.firstSeenAt),
    lastSeenAt: toNumber(record?.lastSeenAt),
  };
}

export async function rateLimit(deviceHash: string, action: string, limit: number, windowMs: number) {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = PREFIX + ':rate:' + deviceHash + ':' + action + ':' + bucket;
  const count = await redis().eval<unknown[], number>(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
    [key],
    [Math.ceil(windowMs / 1000) + 60],
  );
  return count <= limit;
}

export async function findCandidate(deviceHash: string): Promise<Pick<QuestionRecord, 'id' | 'text' | 'expiresAt'> | null> {
  const ids = await redis().zrange<string[]>(QUEUE_KEY, 0, 99);
  if (!ids.length) return null;
  const pipeline = redis().pipeline();
  for (const questionId of ids) pipeline.hgetall(questionKey(questionId));
  const records = await pipeline.exec<Array<Record<string, unknown> | null>>();
  const now = Date.now();
  const stale: string[] = [];
  const candidates: QuestionRecord[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const record = parseQuestion(records[index]);
    if (!record) {
      stale.push(ids[index]);
      continue;
    }
    if (record.status !== 'pending' || record.expiresAt <= now) {
      stale.push(ids[index]);
      if (record.status === 'pending') await expireQuestion(record.id);
      continue;
    }
    if (record.askerHash !== deviceHash) candidates.push(record);
  }
  if (stale.length) await redis().zrem(QUEUE_KEY, ...stale);
  if (!candidates.length) return null;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const selected = candidates[bytes[0] % candidates.length];
  return { id: selected.id, text: selected.text, expiresAt: selected.expiresAt };
}

export async function createQuestion(input: {
  questionId: string; text: string; normalizedHash: string; askerHash: string;
  now: number; expiresAt: number; location: { lat: number; lng: number } | null;
  coldStartAllowed: boolean;
}) {
  const script = [
    "if not redis.call('SET', KEYS[4], '1', 'NX', 'EX', 86400) then return -2 end",
    "local credits = tonumber(redis.call('HGET', KEYS[1], 'credits') or '0')",
    "local cold = tonumber(redis.call('HGET', KEYS[1], 'coldStartUsed') or '0')",
    "if credits > 0 then redis.call('HINCRBY', KEYS[1], 'credits', -1)",
    "elseif ARGV[9] == '1' and cold == 0 then redis.call('HSET', KEYS[1], 'coldStartUsed', 1)",
    "else redis.call('DEL', KEYS[4]); return -1 end",
    "redis.call('HSET', KEYS[2], 'id', ARGV[1], 'text', ARGV[2], 'normalizedHash', ARGV[3], 'askerHash', ARGV[4], 'status', 'pending', 'createdAt', ARGV[5], 'expiresAt', ARGV[6], 'askLat', ARGV[7], 'askLng', ARGV[8])",
    "redis.call('EXPIRE', KEYS[2], " + PENDING_TTL_SECONDS + ")",
    "redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])",
    "return 1",
  ].join('\n');
  return redis().eval<unknown[], number>(script, [
    deviceKey(input.askerHash), questionKey(input.questionId), QUEUE_KEY,
    duplicateKey(input.askerHash, input.normalizedHash),
  ], [
    input.questionId, input.text, input.normalizedHash, input.askerHash,
    input.now, input.expiresAt, input.location?.lat ?? '', input.location?.lng ?? '',
    input.coldStartAllowed ? '1' : '0',
  ]);
}

export async function getQuestion(questionId: string) {
  return parseQuestion(await redis().hgetall<Record<string, unknown>>(questionKey(questionId)));
}

export async function expireQuestion(questionId: string) {
  const key = questionKey(questionId);
  const pipeline = redis().pipeline();
  pipeline.hset(key, { status: 'expired' });
  pipeline.hdel(key, 'askLat', 'askLng');
  pipeline.expire(key, 6 * 60 * 60);
  pipeline.zrem(QUEUE_KEY, questionId);
  await pipeline.exec();
}

export async function answerQuestion(input: {
  questionId: string; answer: 'YES' | 'NO'; answererHash: string; now: number; distanceKm: number | null;
}) {
  const script = [
    "if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end",
    "if redis.call('HGET', KEYS[1], 'status') ~= 'pending' then return 0 end",
    "if redis.call('HGET', KEYS[1], 'askerHash') == ARGV[3] then return -2 end",
    "if tonumber(redis.call('HGET', KEYS[1], 'expiresAt') or '0') <= tonumber(ARGV[1]) then",
    "redis.call('HSET', KEYS[1], 'status', 'expired'); redis.call('HDEL', KEYS[1], 'askLat', 'askLng'); redis.call('EXPIRE', KEYS[1], 21600); redis.call('ZREM', KEYS[2], ARGV[5]); return -3 end",
    "redis.call('HSET', KEYS[1], 'status', 'answered', 'answer', ARGV[2], 'answererHash', ARGV[3], 'answeredAt', ARGV[1], 'distanceKm', ARGV[4])",
    "redis.call('HDEL', KEYS[1], 'askLat', 'askLng')",
    "redis.call('EXPIRE', KEYS[1], " + ANSWERED_TTL_SECONDS + ")",
    "redis.call('ZREM', KEYS[2], ARGV[5])",
    "redis.call('HINCRBY', KEYS[3], 'credits', 1); redis.call('HSET', KEYS[3], 'lastSeenAt', ARGV[1])",
    "return 1",
  ].join('\n');
  return redis().eval<unknown[], number>(script, [questionKey(input.questionId), QUEUE_KEY, deviceKey(input.answererHash)], [
    input.now, input.answer, input.answererHash, input.distanceKm ?? '', input.questionId,
  ]);
}

export async function saveReaction(input: {
  questionId: string; askerHash: string; feeling: string; knowsNow: boolean;
}) {
  const payload = JSON.stringify({
    id: id(), questionId: input.questionId, askerHash: input.askerHash,
    feeling: input.feeling, knowsNow: input.knowsNow, createdAt: Date.now(),
  });
  return redis().set(PREFIX + ':reaction:' + input.questionId, payload, { nx: true, ex: ANSWERED_TTL_SECONDS });
}

export async function trackEvent(eventType: string, deviceHash: string, sessionId?: string | null, questionId?: string | null) {
  const sessionHash = sessionId && DEVICE_ID.test(sessionId) ? await hash('session:' + sessionId) : null;
  const uniquePart = questionId || sessionHash || String(Math.floor(Date.now() / 60_000));
  const eventKey = PREFIX + ':event-once:' + eventType + ':' + deviceHash + ':' + uniquePart;
  const accepted = await redis().set(eventKey, '1', { nx: true, ex: ANSWERED_TTL_SECONDS });
  if (!accepted) return;
  const now = Date.now();
  await redis().zadd(EVENTS_KEY, {
    score: now,
    member: JSON.stringify({ id: id(), eventType, deviceHash, sessionHash, questionId, createdAt: now }),
  });
  await redis().zremrangebyscore(EVENTS_KEY, 0, now - 90 * 24 * 60 * 60 * 1000);
}

export function approximateLocation(request: Request) {
  const latitude = request.headers.get('x-vercel-ip-latitude') || request.headers.get('cf-iplatitude');
  const longitude = request.headers.get('x-vercel-ip-longitude') || request.headers.get('cf-iplongitude');
  const lat = latitude === null ? NaN : Number(latitude);
  const lng = longitude === null ? NaN : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 2) / 2, lng: Math.round(lng * 2) / 2 };
}

export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) / 10) * 10;
}

export async function safeBody(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 4096) return null;
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuestion(record: Record<string, unknown> | null): QuestionRecord | null {
  if (!record?.id || !record.text || !record.askerHash) return null;
  return {
    id: String(record.id),
    text: String(record.text),
    normalizedHash: String(record.normalizedHash || ''),
    askerHash: String(record.askerHash),
    status: String(record.status || 'pending') as QuestionRecord['status'],
    answer: record.answer ? String(record.answer) as 'YES' | 'NO' : null,
    answererHash: record.answererHash ? String(record.answererHash) : null,
    createdAt: toNumber(record.createdAt),
    answeredAt: nullableNumber(record.answeredAt),
    expiresAt: toNumber(record.expiresAt),
    distanceKm: nullableNumber(record.distanceKm),
    askLat: nullableNumber(record.askLat),
    askLng: nullableNumber(record.askLng),
  };
}
