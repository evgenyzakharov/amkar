// Части карточек игрока и сезона в стиле «матч-программы»
import type { ReactNode } from 'react';
import type { ExternalLink } from '../db/types';
import { LINK_SITES } from '../format';
import type { LeadersScope } from '../router';

/** Белая карточка с заголовком раздела. */
export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        {aside && <span className="card-aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export interface Tile {
  value: ReactNode;
  label: string;
}

/** Плитки с крупными цифрами. */
export function Tiles({ tiles, label }: { tiles: Tile[]; label: string }) {
  if (tiles.length === 0) return null;
  return (
    <section className="tiles" aria-label={label}>
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <div className="tile-value">{t.value}</div>
          <div className="tile-label">{t.label}</div>
        </div>
      ))}
    </section>
  );
}

const SCOPES: { scope: LeadersScope; label: string }[] = [
  { scope: 'all', label: 'Все турниры' },
  { scope: 'league', label: 'Только чемпионат' },
];

/** Переключатель «Все турниры / Только чемпионат»: состояние — в адресе, ссылкой можно поделиться. */
export function ScopeSwitch({ scope, href }: { scope: LeadersScope; href: (scope: LeadersScope) => string }) {
  return (
    <nav className="segmented" aria-label="Турниры">
      {SCOPES.map((s) => (
        <a
          key={s.scope}
          href={href(s.scope)}
          className={s.scope === scope ? 'active' : undefined}
          aria-current={s.scope === scope ? 'true' : undefined}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

/** Кнопки-ссылки на внешние сайты в постоянном порядке; сайтов без ссылки нет. */
export function ExternalLinks({ links }: { links: ExternalLink[] }) {
  const url = new Map(links.map((l) => [l.site, l.url]));
  const present = LINK_SITES.filter((s) => url.has(s.site));
  if (present.length === 0) return null;
  return (
    <div className="ext-links">
      {present.map((s) => (
        <a key={s.site} className="ext-link" href={url.get(s.site)} target="_blank" rel="noopener noreferrer">
          {s.label}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M5 2h7v7M12 2 4.5 9.5M10 12H2V4" />
          </svg>
        </a>
      ))}
    </div>
  );
}
