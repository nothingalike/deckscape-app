import Link from "next/link";
import { rules, rulesVersion, rulesChecked, rulesSource } from "@/lib/rules";
export function RuleTopic({ id }: { id: string }) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return <p>Rule topic not found.</p>;
  return (
    <article className="page narrow rule-detail">
      <Link className="rule-back" href="/rules">
        ← Rules reference
      </Link>
      <header className="rule-heading">
        <span className="eyebrow">RULE {rule.id}</span>
        <h1>{rule.title}</h1>
      </header>
      {rule.summary && (
        <section
          className="rule-definition"
          aria-labelledby="rule-summary-title"
        >
          <h2 id="rule-summary-title" className="eyebrow">
            Deckscape summary
          </h2>
          <p>{rule.summary}</p>
        </section>
      )}
      <aside className="rule-disclaimer" aria-label="About this guide">
        <strong>About this guide</strong>
        <p>
          This is a Deckscape explanation, not an official ruling. Read the
          complete official rule for its conditions and exceptions.
        </p>
      </aside>
      <section className="rule-source" aria-labelledby="rule-source-title">
        <h2 id="rule-source-title">Official source</h2>
        <dl className="rule-source-details">
          <div>
            <dt>Rulebook</dt>
            <dd>Comprehensive Rules v{rulesVersion}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>
              Rule {rule.id} · Page {rule.page}
            </dd>
          </div>
          <div>
            <dt>Source checked</dt>
            <dd>
              <time dateTime={rulesChecked}>{rulesChecked}</time>
            </dd>
          </div>
        </dl>
        <a
          className="button"
          href={`${rulesSource}#page=${rule.page}`}
          target="_blank"
          rel="noreferrer"
        >
          Read official rule {rule.id} ↗
        </a>
      </section>
    </article>
  );
}
