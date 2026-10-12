import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const pages = {
  about: {
    label: 'WHY IT EXISTS',
    title: 'An interruption for overthinking.',
    intro: 'Human Oracle is for the little decisions that somehow feel impossible.',
    sections: [
      ['The idea', 'More information is not always what breaks a loop. Sometimes an outside event is enough. One unknown human chooses YES or NO, and your reaction helps you notice what you wanted all along.'],
      ['Not an authority', 'The answer is not advice, expertise, or a prediction. It may be wrong for you. Agreement and immediate disagreement are equally useful outcomes.'],
    ],
  },
  'how-it-works': {
    label: 'THE SMALL RITUAL',
    title: 'Decide. Ask. Notice.',
    intro: 'No profile. No history. No algorithmic answer. Just another human’s instinct.',
    sections: [
      ['01 — Decide', 'Choose YES or NO for one anonymous question. The first answer is the only one that counts.'],
      ['02 — Ask', 'Send one short dilemma that can genuinely be answered YES or NO. Don’t explain. Ask.'],
      ['03 — Notice', 'When the answer returns, pay attention to relief, disappointment, or nothing at all. The reaction is more important than obedience.'],
    ],
  },
  privacy: {
    label: 'PLAIN-LANGUAGE PRIVACY',
    title: 'Anonymous by design.',
    intro: 'We collect only what the small ritual needs to work.',
    sections: [
      ['What is stored', 'Your question, its YES or NO answer, an anonymous browser identifier, essential timestamps, and the reaction you choose to share. There are no profiles.'],
      ['Rough distance', 'Approximate IP-based location may be used on the server to calculate a rough distance between two humans. Exact locations are never shown to users, and temporary coordinates are removed when a question is answered or expires.'],
      ['Retention and analytics', 'Unanswered questions expire after 24 hours. Anonymous event data helps measure whether the experience breaks an overthinking loop. We do not sell personal data.'],
    ],
  },
  terms: {
    label: 'THE AGREEMENT',
    title: 'Keep it small. Keep it human.',
    intro: 'By using Human Oracle, you agree to use it only for low-stakes, everyday choices.',
    sections: [
      ['No professional advice', 'Answers come from random humans and are not medical, legal, financial, mental-health, or other professional advice. Do not use the service for emergencies or dangerous decisions.'],
      ['Your responsibility', 'You remain responsible for every choice you make. Human Oracle does not tell you what to do and does not promise that an answer is correct.'],
      ['Fair use', 'Do not automate submissions, try to identify another person, post personal contact details, or use the service for illegal, abusive, or harmful content.'],
    ],
  },
  'community-guidelines': {
    label: 'COMMUNITY GUIDELINES',
    title: 'Small dilemmas only.',
    intro: 'A stranger’s YES or NO is useful only when the stakes are genuinely small.',
    sections: [
      ['Good questions', 'Ask about a text, a party, a post, a day off, a small trip, or a second date. Keep it under 140 characters and leave out identifying details.'],
      ['Questions we refuse', 'Do not ask about self-harm, emergencies, medicine, legal problems, major financial choices, dangerous or illegal acts, hate or harassment, or sexual content involving minors.'],
      ['If it matters more', 'Talk to someone you trust or a qualified professional. If anyone may be in immediate danger, contact local emergency services. Some questions need more than a stranger’s YES or NO.'],
    ],
  },
} as const;

type Slug = keyof typeof pages;

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug as Slug];
  return page ? { title: page.title, description: page.intro, openGraph: { images: [] }, twitter: { images: [] } } : {};
}

export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug as Slug];
  if (!page) notFound();
  return (
    <main className="info-shell">
      <header className="site-header">
        <Link className="wordmark" href="/">HUMAN <span>ORACLE</span></Link>
        <Link className="back-link" href="/">RETURN TO THE ORACLE <span>↗</span></Link>
      </header>
      <article className="info-article">
        <p className="eyebrow">{page.label}</p>
        <h1>{page.title}</h1>
        <p className="info-intro">{page.intro}</p>
        <div className="info-sections">
          {page.sections.map(([heading, body]) => (
            <section key={heading}>
              <h2>{heading}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      </article>
      <footer className="site-footer info-footer">
        <p>HUMAN ORACLE · {new Date().getFullYear()}</p>
        <nav>
          <Link href="/about">About</Link><Link href="/how-it-works">How it works</Link>
          <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>
          <Link href="/community-guidelines">Guidelines</Link>
        </nav>
      </footer>
    </main>
  );
}
