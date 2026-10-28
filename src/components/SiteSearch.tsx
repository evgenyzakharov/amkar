// Поиск в шапке: одно поле на все страницы. Данные — при первом нажатии в поле (loadSearchIndex, один раз за визит).
// С клавиатуры: «/» — в поиск, ↑ ↓ — выбрать, Enter — открыть, Esc — закрыть. На телефоне — лупа рядом с темой.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { loadSearchIndex } from '../db/queries';
import { search, type SearchHit, type SearchIndex } from '../search';

function Magnifier() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SiteSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // телефон: поле раскрывается по лупе
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);

  const hits: SearchHit[] = index ? search(index, query) : [];
  const show = open && query.trim().length >= 2;

  const load = () => {
    if (index || failed) return;
    loadSearchIndex().then(setIndex, () => setFailed(true));
  };
  const close = () => {
    setOpen(false);
    setPhoneOpen(false);
  };

  // «/» в любом месте страницы — в поиск; клик мимо — закрыть
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      setPhoneOpen(true);
      setTimeout(() => input.current?.focus());
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (hits.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      // по ссылке — как обычный переход: страница сверху и с начальным состоянием
      links.current[active]?.click();
    } else if (e.key === 'Escape') {
      close();
      input.current?.blur();
    }
  };

  const picked = () => {
    setQuery('');
    close();
  };

  let lastGroup = '';
  return (
    <div className={`site-search${phoneOpen ? ' open' : ''}`} ref={box}>
      <button
        type="button"
        className="site-search-toggle"
        aria-label="Поиск"
        aria-expanded={phoneOpen}
        onClick={() => {
          setPhoneOpen((o) => !o);
          setTimeout(() => input.current?.focus());
        }}
      >
        <Magnifier />
      </button>
      <div className="site-search-field">
        <Magnifier />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Поиск по сайту: игрок, клуб, тренер, сезон"
          aria-expanded={show}
          aria-controls="site-search-results"
          aria-activedescendant={show && hits[active] ? `site-search-${active}` : undefined}
          placeholder="Игрок, клуб, тренер, сезон"
          value={query}
          onFocus={() => {
            load();
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {show && (
          <div className="site-search-results" id="site-search-results" role="listbox">
            {failed ? (
              <p className="site-search-note">Поиск не загрузился — попробуйте обновить страницу.</p>
            ) : !index ? (
              <p className="site-search-note">Загрузка…</p>
            ) : hits.length === 0 ? (
              <p className="site-search-note">Ничего не нашлось.</p>
            ) : (
              hits.map((h, i) => {
                const head = h.group !== lastGroup && <h5 key={`g-${h.group}`}>{h.group}</h5>;
                lastGroup = h.group;
                return [
                  head,
                  <a
                    key={h.href}
                    id={`site-search-${i}`}
                    ref={(el) => {
                      links.current[i] = el;
                    }}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? 'on' : undefined}
                    href={h.href}
                    onMouseEnter={() => setActive(i)}
                    onClick={picked}
                  >
                    {h.title}
                    {h.detail && <span>{h.detail}</span>}
                  </a>,
                ];
              })
            )}
            {index && hits.length > 0 && <p className="site-search-note">↑ ↓ — выбрать, Enter — открыть, Esc — закрыть</p>}
          </div>
        )}
      </div>
    </div>
  );
}
