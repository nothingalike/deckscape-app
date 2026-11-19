import Link from 'next/link';
import type { ReactNode } from 'react';

export function CardDetailsLink({ cardId, children, ...props }: {
  cardId: string; children: ReactNode; className?: string; 'aria-label'?: string;
}) {
  return <Link {...props} href={`/cards/${cardId}`}>{children}</Link>;
}
