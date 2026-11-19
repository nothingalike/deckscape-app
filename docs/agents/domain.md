# Domain docs

This repository uses a single domain context: `GLOSSARY.md` at the root and architectural decisions in `docs/adr/`.

## Read before exploring

Read `GLOSSARY.md` and the ADRs relevant to the area being explored. Proceed with the available context when those files have yet to be created.

`/domain-modeling`, including through `/grill-with-docs`, creates glossary entries when terms are settled and ADRs when a consequential trade-off is decided.

## Use the canonical language

Use the glossary's terms in specs, tickets, code, tests, and explanations. Raise a terminology gap during domain modeling when a new concept needs a definition.

Keep the glossary focused on domain definitions. Record implementation decisions in ADRs and feature requirements in the owning spec or ticket.

## Surface conflicting decisions

When a proposal contradicts an existing ADR, name that ADR and explain why the decision needs to be reconsidered. Record the replacement decision explicitly once adopted.
