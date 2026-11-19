import type { ComponentProps } from 'react';

export default function Link({ href, onClick, ...props }: ComponentProps<'a'>) {
  return <a {...props} href={href?.startsWith('/') ? `#${href}` : href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || !href) return;
    if (href.startsWith('/')) { event.preventDefault(); window.location.hash = href; }
    else if (href.startsWith('https://')) { event.preventDefault(); void window.neuroscape.openExternal(href); }
  }} />;
}
