const HIGH_RISK_PATTERNS = [
  /\b(suicid|kill myself|hurt myself|self[ -]?harm|end my life|want to die)\b/i,
  /\b(medication|medicine|prescription|dosage|dose|stop taking|surgery|treatment|diagnos|cancer|insulin|emergency room|chest pain|pregnan|abortion)\b/i,
  /\b(put all|all my savings|life savings|retirement|mortgage|loan|debt|invest|bitcoin|crypto|stock market|gambl|place a bet)\b/i,
  /\b(commit a crime|break the law|shoplift|steal|assault|weapon|gun|poison|drive drunk|set (?:it|this|the .*?) on fire)\b/i,
  /\b(minor|underage|child|kid|teen)\b.{0,32}\b(sex|nude|naked|porn|explicit)\b/i,
  /\b(sex|nude|naked|porn|explicit)\b.{0,32}\b(minor|underage|child|kid|teen)\b/i,
  /\b(quit my job|file for divorce|get married|sell my house|drop out of school|give up custody)\b/i,
  /\b(harass|bully|racial slur|attack them|hate all)\b/i,
];

const CONTACT_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:https?:\/\/|www\.)\S+/i,
  /(?:\+?\d[\d\s().-]{7,}\d)/,
  /(?:^|\s)@[a-z0-9_]{3,30}\b/i,
];

const OPEN_QUESTION = /^(why|how|what|where|when|who)\b/i;
const YES_NO_START = /^(should|could|can|would|will|do|does|did|is|are|am|was|were|have|has|may|might|text|call|go|take|post|send|wear|buy|stay|leave|ask|tell|try|skip|keep|delete|cancel|accept|join)\b/i;

export type ModerationResult = { ok: true; normalized: string } | { ok: false; message: string };

export function moderateQuestion(input: unknown): ModerationResult {
  if (typeof input !== 'string') return reject();
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length < 8 || normalized.length > 140) return reject();
  if (CONTACT_PATTERNS.some((pattern) => pattern.test(normalized))) return reject();
  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(normalized))) return reject();
  if (OPEN_QUESTION.test(normalized) || !YES_NO_START.test(normalized)) return reject();
  return { ok: true, normalized };
}

function reject(): { ok: false; message: string } {
  return { ok: false, message: "This question needs more than a stranger's yes or no." };
}
