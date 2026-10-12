'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Answer = 'YES' | 'NO';
type Feeling = 'relief' | 'disappointment' | 'nothing';
type Phase = 'loading' | 'decide' | 'ask' | 'waiting' | 'reveal-intro' | 'reveal' | 'feeling' | 'knowing' | 'complete' | 'idle' | 'expired';
type Candidate = { id: string; text: string; expiresAt: number };
type OwnQuestion = Candidate & { status?: string; answer?: Answer | null; distanceKm?: number | null };

const DEVICE_KEY = 'human-oracle-device';
const SESSION_KEY = 'human-oracle-session';
const PENDING_KEY = 'human-oracle-pending';

function randomId() {
  return crypto.randomUUID().replaceAll('-', '');
}

function getLocalId(key: string, storage: Storage) {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const value = randomId();
  storage.setItem(key, value);
  return value;
}

export function OracleExperience() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [deviceId, setDeviceId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [ownQuestion, setOwnQuestion] = useState<OwnQuestion | null>(null);
  const [draft, setDraft] = useState('');
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = useMemo(() => deviceId ? {
    'Content-Type': 'application/json',
    'x-oracle-device': deviceId,
    'x-oracle-session': sessionId,
  } : undefined, [deviceId, sessionId]);

  const loadOracle = useCallback(async (activeHeaders: Record<string, string>) => {
    setError('');
    setPhase('loading');
    try {
      const response = await fetch('/api/oracle', { headers: activeHeaders, cache: 'no-store' });
      const data = await response.json() as { question?: Candidate | null; canAsk?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || 'The Oracle is quiet right now.');
      if (data.question) {
        setCandidate(data.question);
        setPhase('decide');
      } else if (data.canAsk) {
        setCandidate(null);
        setPhase('ask');
      } else {
        setCandidate(null);
        setPhase('idle');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Oracle is quiet right now.');
      setPhase('idle');
    }
  }, []);

  const checkQuestion = useCallback(async (questionId: string, activeHeaders: Record<string, string>) => {
    try {
      const response = await fetch(`/api/questions/${questionId}`, { headers: activeHeaders, cache: 'no-store' });
      const data = await response.json() as { question?: OwnQuestion; error?: string };
      if (response.status === 404) {
        localStorage.removeItem(PENDING_KEY);
        await loadOracle(activeHeaders);
        return;
      }
      if (!response.ok || !data.question) throw new Error(data.error || 'Could not find your question.');
      setOwnQuestion(data.question);
      if (data.question.status === 'answered') {
        setPhase('reveal-intro');
      } else if (data.question.status === 'expired') {
        localStorage.removeItem(PENDING_KEY);
        setPhase('expired');
      } else {
        setPhase('waiting');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not find your question.');
      setPhase('waiting');
    }
  }, [loadOracle]);

  useEffect(() => {
    const device = getLocalId(DEVICE_KEY, localStorage);
    const session = getLocalId(SESSION_KEY, sessionStorage);
    const activeHeaders = {
      'Content-Type': 'application/json',
      'x-oracle-device': device,
      'x-oracle-session': session,
    };
    queueMicrotask(() => {
      setDeviceId(device);
      setSessionId(session);
    });
    fetch('/api/events', {
      method: 'POST', headers: activeHeaders,
      body: JSON.stringify({ eventType: 'session_started', deviceId: device, sessionId: session }),
    }).catch(() => undefined);

    const pending = localStorage.getItem(PENDING_KEY);
    queueMicrotask(() => {
      if (pending) void checkQuestion(pending, activeHeaders);
      else void loadOracle(activeHeaders);
    });
  }, [checkQuestion, loadOracle]);

  useEffect(() => {
    if (phase !== 'waiting' || !ownQuestion || !headers) return;
    const interval = setInterval(() => void checkQuestion(ownQuestion.id, headers), 7000);
    return () => clearInterval(interval);
  }, [phase, ownQuestion, headers, checkQuestion]);

  useEffect(() => {
    if (phase !== 'reveal-intro' || !ownQuestion || !headers) return;
    revealTimer.current = setTimeout(() => {
      setPhase('reveal');
      fetch('/api/events', {
        method: 'POST', headers,
        body: JSON.stringify({ eventType: 'reveal_viewed', deviceId, sessionId, questionId: ownQuestion.id }),
      }).catch(() => undefined);
    }, 1500);
    return () => { if (revealTimer.current) clearTimeout(revealTimer.current); };
  }, [phase, ownQuestion, headers, deviceId, sessionId]);

  async function submitAnswer(answer: Answer) {
    if (!candidate || !headers || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/questions/${candidate.id}/answer`, {
        method: 'POST', headers,
        body: JSON.stringify({ answer, deviceId, sessionId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          await loadOracle(headers);
          return;
        }
        throw new Error(data.error || 'Your answer could not be sent.');
      }
      setCandidate(null);
      setPhase('ask');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your answer could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  async function submitQuestion(event: React.FormEvent) {
    event.preventDefault();
    if (!headers || busy) return;
    const question = draft.replace(/\s+/g, ' ').trim();
    if (question.length < 8 || question.length > 140) {
      setError('Keep it to one short YES or NO question.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/questions', {
        method: 'POST', headers,
        body: JSON.stringify({ question, deviceId, sessionId }),
      });
      const data = await response.json() as Candidate & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Your question could not be sent.');
      const submitted = { id: data.id, text: data.text, expiresAt: data.expiresAt, status: 'pending' };
      localStorage.setItem(PENDING_KEY, data.id);
      setOwnQuestion(submitted);
      setDraft('');
      setPhase('waiting');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your question could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReaction(knowsNow: boolean) {
    if (!ownQuestion || !feeling || !headers || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/questions/${ownQuestion.id}/reaction`, {
        method: 'POST', headers,
        body: JSON.stringify({ feeling, knowsNow, deviceId, sessionId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok && response.status !== 409) throw new Error(data.error || 'Your reaction could not be saved.');
      localStorage.removeItem(PENDING_KEY);
      setPhase('complete');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your reaction could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    if (!headers) return;
    localStorage.removeItem(PENDING_KEY);
    setOwnQuestion(null);
    setFeeling(null);
    await loadOracle(headers);
  }

  const status = phase === 'decide' ? 'ONE QUESTION · ONE HUMAN'
    : phase === 'waiting' ? 'IN TRANSIT'
      : phase === 'reveal' || phase === 'reveal-intro' ? 'DELIVERED'
        : phase === 'ask' ? 'YOUR TURN' : 'HUMAN, NOT ALGORITHM';

  return (
    <main className={`oracle-shell phase-${phase}`}>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Human Oracle home">HUMAN <span>ORACLE</span></Link>
        <p className="signal"><i /> {status}</p>
      </header>

      <section className="stage" aria-live="polite">
        {(phase === 'loading') && <Loading />}

        {phase === 'decide' && candidate && (
          <div className="decision screen-enter">
            <Orbit />
            <p className="eyebrow">THE ORACLE NEEDS YOU</p>
            <h1>{candidate.text}</h1>
            <div className="decision-actions">
              <button className="choice choice-no" disabled={busy} onClick={() => submitAnswer('NO')} type="button">
                <span>NO</span><small>Trust your first instinct</small>
              </button>
              <button className="choice choice-yes" disabled={busy} onClick={() => submitAnswer('YES')} type="button">
                <span>YES</span><small>Don&apos;t overthink it</small>
              </button>
            </div>
            <p className="quiet-note">No profile. No context. Just your judgment.</p>
          </div>
        )}

        {phase === 'ask' && (
          <form className="ask-screen screen-enter" onSubmit={submitQuestion}>
            <p className="eyebrow">YOUR TURN</p>
            <label htmlFor="oracle-question">What can&apos;t you decide?</label>
            <textarea
              id="oracle-question" autoFocus rows={3} maxLength={140}
              placeholder="Should I text her tonight?"
              value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }}
              aria-describedby="question-hint question-error"
            />
            <div className="input-meta" id="question-hint">
              <span>YES / NO ONLY</span><span>{draft.length} / 140</span>
            </div>
            <button className="primary-action" disabled={busy || draft.trim().length < 8} type="submit">
              {busy ? 'SENDING…' : 'ASK THE ORACLE'} <span aria-hidden="true">→</span>
            </button>
            <p className="quiet-note">Don&apos;t explain. Ask.</p>
          </form>
        )}

        {phase === 'waiting' && ownQuestion && (
          <div className="waiting-screen screen-enter">
            <div className="travel-mark" aria-hidden="true"><i /><span /><b /></div>
            <p className="eyebrow">YOUR QUESTION HAS LEFT YOU.</p>
            <h1>Somewhere in the world,<br />it is waiting for one human.</h1>
            <blockquote>“{ownQuestion.text}”</blockquote>
            <p className="quiet-note">You can close this page. It will remember.</p>
          </div>
        )}

        {phase === 'reveal-intro' && ownQuestion && (
          <div className="reveal-screen intro screen-enter">
            <Orbit />
            <p className="eyebrow">THE DECISION HAS RETURNED</p>
            <h1>{ownQuestion.distanceKm != null
              ? <>A human <em>{ownQuestion.distanceKm.toLocaleString()} km</em> away<br />has decided.</>
              : <>A human somewhere<br />has decided.</>}</h1>
          </div>
        )}

        {phase === 'reveal' && ownQuestion && (
          <div className="reveal-screen verdict screen-enter">
            <p className="distance-line">{ownQuestion.distanceKm != null
              ? `A human ${ownQuestion.distanceKm.toLocaleString()} km away decided`
              : 'A human somewhere decided'}</p>
            <h1>{ownQuestion.answer}</h1>
            <button className="text-action" type="button" onClick={() => setPhase('feeling')}>NOTICE YOUR REACTION <span>→</span></button>
          </div>
        )}

        {phase === 'feeling' && (
          <div className="reaction-screen screen-enter">
            <p className="eyebrow">THE ANSWER ISN&apos;T THE POINT</p>
            <h1>How did that answer feel?</h1>
            <div className="reaction-options">
              {(['relief', 'disappointment', 'nothing'] as Feeling[]).map((option, index) => (
                <button key={option} type="button" onClick={() => { setFeeling(option); setPhase('knowing'); }}>
                  <span>0{index + 1}</span>{option}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'knowing' && (
          <div className="reaction-screen knowing screen-enter">
            <p className="eyebrow">ONE LAST THING</p>
            <h1>Do you know what you want now?</h1>
            <div className="binary-options">
              <button disabled={busy} type="button" onClick={() => submitReaction(true)}>YES</button>
              <button disabled={busy} type="button" onClick={() => submitReaction(false)}>NOT YET</button>
            </div>
          </div>
        )}

        {phase === 'complete' && (
          <div className="complete-screen screen-enter">
            <span className="complete-mark" aria-hidden="true">+</span>
            <p className="eyebrow">THE LOOP MOVED</p>
            <h1>Keep the answer.<br />Or reject it.</h1>
            <p>Either reaction tells you something.</p>
            <button className="primary-action compact" type="button" onClick={restart}>DECIDE AGAIN <span>→</span></button>
          </div>
        )}

        {phase === 'expired' && (
          <div className="complete-screen screen-enter">
            <p className="eyebrow">THE QUESTION FADED</p>
            <h1>No human reached it in time.</h1>
            <p>Questions disappear after 24 hours. You can begin again.</p>
            <button className="primary-action compact" type="button" onClick={restart}>BEGIN AGAIN <span>→</span></button>
          </div>
        )}

        {phase === 'idle' && (
          <div className="complete-screen screen-enter">
            <p className="eyebrow">THE ORACLE IS QUIET</p>
            <h1>No question is waiting right now.</h1>
            <p>Return soon. One human&apos;s small dilemma will find you.</p>
            <button className="primary-action compact" type="button" onClick={() => headers && loadOracle(headers)}>LISTEN AGAIN <span>→</span></button>
          </div>
        )}

        {error && <p className="error-message" id="question-error" role="alert">{error}</p>}
      </section>

      <footer className="site-footer">
        <p>DON&apos;T EXPLAIN. ASK.</p>
        <nav aria-label="Footer navigation">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </main>
  );
}

function Orbit() {
  return <div className="orbit" aria-hidden="true"><span /></div>;
}

function Loading() {
  return (
    <div className="loading-screen">
      <div className="listening-ring" aria-hidden="true"><span /></div>
      <p>LISTENING FOR A QUESTION</p>
    </div>
  );
}
