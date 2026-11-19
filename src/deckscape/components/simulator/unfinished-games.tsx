import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { UnfinishedMatchPage } from "@/lib/simulator/match-directory";
import styles from "./play-lobby.module.css";
/** The owning authenticated page loads metadata with listUnfinishedMatches. */
export function UnfinishedGames({ page }: { page: UnfinishedMatchPage }) {
  return (
    <section
      className={styles.games}
      aria-labelledby="unfinished-games-heading"
    >
      <div className={styles.sectionHeader}>
        <h2 id="unfinished-games-heading">Resume matches</h2>
        <span className={styles.count}>
          {page.matches.length}
          {page.nextCursor ? "+" : ""}
        </span>
      </div>
      <p className={styles.help}>
        Leaving this view doesn’t forfeit a game. Resume whenever you’re ready.
        {" "}Saved matches keep their original cards and rules. Catalog updates apply to new matchups.
      </p>
      {page.matches.length ? (
        <ul className={styles.list}>
          {page.matches.map((match) => (
            <li key={match.id} className={styles.match}>
              <div>
                <p className={styles.matchTitle}>Game {match.id.slice(0, 8)}</p>
                {match.title && <p className={styles.help}>{match.title}</p>}
                {match.stage && <span className={styles.help}>{match.stage === 'setup' ? 'Game setup' : 'In progress'} · </span>}
                <span className={styles.time}>
                  Saved{" "}
                  <time dateTime={match.updatedAt}>
                    {new Date(match.updatedAt).toLocaleString("en-US", {
                      timeZone: "UTC",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    UTC
                  </time>
                </span>
              </div>
              {match.compatibility?.ok === false ? <p className={styles.help}>{match.compatibility.message}</p> : <Link
                className={styles.resume}
                aria-label={"Resume game " + match.id.slice(0, 8)}
                href={"/matches/" + match.id}
              >
                Resume
                <ArrowRight size={14} aria-hidden="true" />
              </Link>}
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <Clock3 size={28} aria-hidden="true" />
          <h3>No games waiting</h3>
          <p>
            Choose a deck below to start a bot matchup.
          </p>
        </div>
      )}
      {page.nextCursor && (
        <Link
          className={styles.older}
          href={
            "/solo?before=" +
            encodeURIComponent(page.nextCursor.updatedAt) +
            "&id=" +
            encodeURIComponent(page.nextCursor.id)
          }
        >
          Older games →
        </Link>
      )}
    </section>
  );
}
