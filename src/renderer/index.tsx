import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'pixi.js/unsafe-eval';
import { CircuitBoard, Layers3, Swords, Archive, Settings2, Cpu, HardDrive } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CatalogScreen } from './catalog-screen';
import { DecksScreen } from './decks-screen';
import { RulesReference } from '../deckscape/components/rules-reference';
import { RuleTopic } from '../deckscape/components/rule-topic';
import { SoloScreen, SoloSetupScreen } from './solo-screen';
import { MatchScreen } from './match-screen';
import { BackupScreen } from './backup-screen';
import { AppReleaseScreen } from './app-release-screen';

function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/cards');
  const [serviceLost, setServiceLost] = useState(false);
  useEffect(() => window.neuroscape.onMatchRevision(notice => {
    if (notice === null) setServiceLost(true);
  }), []);
  useEffect(() => {
    const changed = () => setRoute(window.location.hash.slice(1) || '/cards');
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const decks = route.startsWith('/decks');
  const solo = route.startsWith('/solo') || route.startsWith('/matches/');
  const backups = route === '/backups';
  const appInfo=route==='/app';
  const query = new URLSearchParams(route.split('?')[1] ?? '');
  const cursor = query.has('before') || query.has('id') ? { updatedAt: query.get('before') ?? '', id: query.get('id') ?? '' } : undefined;
  const navigation = [
    { href: '/cards', label: 'Cards', detail: 'Card library', icon: Layers3, active: !decks && !solo && !backups && !appInfo },
    { href: '/decks', label: 'My decks', detail: 'Build your strategy', icon: CircuitBoard, active: decks },
    { href: '/solo', label: 'Fight a bot', detail: 'Enter the arena', icon: Swords, active: solo },
    { href: '/backups', label: 'Backups', detail: 'Protect your progress', icon: Archive, active: backups },
    { href: '/app', label: 'App & updates', detail: 'System information', icon: Settings2, active: appInfo },
  ];
  const current = navigation.find(item => item.active)!;
  return <div className={`app dark${route.startsWith('/matches/') ? ' app-match' : ''}`}>
    {serviceLost && <p role="alert" className="service-failure">The local service stopped. Your last committed data is kept. Close and reopen the app to continue.</p>}
    <Button className="skip-link" onClick={() => { const workspace = document.getElementById('workspace'); workspace?.focus(); workspace?.scrollIntoView(); }}>Skip to workspace</Button>
    <aside className="app-sidebar"><a href="#/cards" className="wordmark" aria-label="Neuroscape Local home"><span className="brand-mark"><Cpu aria-hidden="true" /></span><span className="brand-name">NEUROSCAPE<small>LOCAL / DECKSCAPE</small></span></a>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="Main navigation">{navigation.map(({ href, label, detail, icon: Icon, active }, index) =>
        <Button asChild variant="ghost" key={href} className={`nav-item h-auto min-h-16 justify-start px-3 py-3 ${active ? 'nav-active' : ''}`}>
          <a href={'#' + href} aria-current={active ? 'page' : undefined} aria-label={label} title={label}>
            <Icon aria-hidden="true" /><span className="nav-copy">{label}<small>{detail}</small></span><span className="nav-index" aria-hidden="true">0{index + 1}</span>
          </a>
        </Button>)}
      </nav>
      <div className="aside-note"><span className="eyebrow">PLAY ON YOUR TERMS</span><p>Your cards.<br />Your next move.</p><Badge variant="outline"><HardDrive aria-hidden="true" /> Local storage</Badge></div>
      <small className="attribution">Independent fan application<br />Cards and artwork © Neuroscape LLC</small>
    </aside>
    <main id="workspace" tabIndex={-1}><header className="workspace-header"><span className="workspace-location"><span className="eyebrow">WORKSPACE</span><span className="header-divider">/</span>{current.detail}</span><Badge variant="outline" className="local-badge"><span className="dot" /> On your computer</Badge></header>
      {appInfo?<AppReleaseScreen />:backups ? <BackupScreen /> : route === '/rules' ? <RulesReference /> : route.startsWith('/rules/') ? <RuleTopic id={route.slice(7)} />
        : route.startsWith('/matches/') ? <MatchScreen key={route} id={route.slice(9)} />
        : route.startsWith('/solo/setup/') ? <SoloSetupScreen key={route} id={route.slice(12)} />
        : solo ? <SoloScreen key={route} initialDeckId={/^\/solo\/([^/]+)$/.exec(route)?.[1]} cursor={cursor} />
        : decks ? <DecksScreen key={route} id={/^\/decks\/([^/]+)$/.exec(route)?.[1]} />
        : <CatalogScreen key={route} cardId={/^\/cards\/([^/]+)$/.exec(route)?.[1]} />}
      <footer className="workspace-footer"><span><span className="dot" /> Local profile</span><span>NEUROSCAPE / LOCAL</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
