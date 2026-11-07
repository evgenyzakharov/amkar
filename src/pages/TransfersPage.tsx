import { useMemo } from 'react';
import { Card, Tiles, type Tile } from '../components/cards';
import { LoadStatus, PageNav } from '../components/common';
import { Crest } from '../components/Crest';
import { TransferLegend, TransferSeasons } from '../components/TransferSeasons';
import { loadTransfers } from '../db/queries';
import { plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { historyHref, opponentHref, playerHref, seasonHref } from '../router';
import { usePageState } from '../pageState';
import { placeOf, topWithTies, transferStats, type ClubTally, type Partner, type TransferStats } from '../transfers';

const ALL = 'all';
const load = () => loadTransfers();
const PARTNERS = 8;

export function TransfersPage() {
  useDocumentTitle('Трансферы');
  const state = useLoad(ALL, load);
  const stats = useMemo(() => (state.status === 'ready' ? transferStats(state.data.transfers, state.data.seasons) : null), [state]);

  return (
    <div className="card-page transfers-page">
      <PageNav up={<a href={historyHref()}>← История</a>} />
      <h1 className="page-title">Трансферы</h1>
      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : (
        stats && (
          <>
            <Tiles tiles={transferTiles(stats, state.data.seasons[0]?.start_year)} label="Трансферы в цифрах" />
            <div className="card-row card-row-even">
              <TopClubs title="Откуда приходили" direction="in" list={stats.top.in} links={state.data.opponentIds} />
              <TopClubs title="Куда уходили" direction="out" list={stats.top.out} links={state.data.opponentIds} />
            </div>
            <p className="note">
              Считаются переходы и аренды, без возвратов из аренды ({stats.returns}). Своя академия и «Амкар-2» в топ не идут ({stats.own}{' '}
              {plural(stats.own, ['игрок', 'игрока', 'игроков'])}), у {stats.noClub} {plural(stats.noClub, ['трансфера', 'трансферов', 'трансферов'])}{' '}
              клуб не записан. Строка раскрывается — кто и в каком сезоне; в скобках — как клуб назывался тогда.
            </p>
            <Card title="По сезонам" aside={<TransferLegend />}>
              <TransferSeasons seasons={stats.bySeason} />
            </Card>
            {stats.partners.length > 0 && (
              <Card title="Обмен в обе стороны" aside="клубы, куда и откуда">
                <Partners partners={stats.partners.slice(0, PARTNERS)} links={state.data.opponentIds} />
              </Card>
            )}
          </>
        )
      )}
    </div>
  );
}

function transferTiles(s: TransferStats, from: number | undefined): Tile[] {
  const tiles: Tile[] = [
    {
      value: `${s.in} / ${s.out}`,
      label: `пришли / ушли${from ? ` — с ${from} года` : ''}`,
    },
    {
      value: s.clubs,
      label: `${plural(s.clubs, ['клуб', 'клуба', 'клубов'])}, с которыми был обмен игроками`,
    },
    {
      value: s.loansIn + s.loansOut,
      label: `аренд: ${s.loansIn} к нам, ${s.loansOut} от нас`,
    },
  ];
  const p = s.partners[0];
  if (p)
    tiles.push({
      value: `${p.in}↔${p.out}`,
      label: `главный партнёр — ${p.name}`,
    });
  return tiles;
}

function ClubName({ teamId, name, links }: { teamId: number; name: string; links: Set<number> }) {
  return links.has(teamId) ? <a href={opponentHref(teamId)}>{name}</a> : <span>{name}</span>;
}

function TopClubs({ title, direction, list, links }: { title: string; direction: 'in' | 'out'; list: ClubTally[]; links: Set<number> }) {
  // раскрытая строка переживает «Назад» с карточки игрока
  const [open, setOpen] = usePageState<number | null>(`open-${direction}`, null);
  const n = (c: ClubTally) => c.n;
  const { shown, cut, rest } = topWithTies(list, n);
  if (shown.length === 0) return null;
  const max = shown[0].n;
  return (
    <Card title={title} aside="топ-10">
      <ol className="tr-top">
        {shown.map((c, i) => {
          const isOpen = open === c.teamId;
          return (
            <li key={c.teamId} className={isOpen ? 'open' : undefined}>
              <span className="tr-place">{placeOf(shown, n, i)}</span>
              <span className="tr-crest">
                <Crest src={c.crest} className="tr-crest-img" />
              </span>
              <span className="tr-club">
                <ClubName teamId={c.teamId} name={c.name} links={links} />
                {c.loans > 0 && <small>аренда: {c.loans}</small>}
              </span>
              <span className="tr-track" aria-hidden="true">
                <span className="tr-bar" style={{ width: `${(100 * c.n) / max}%` }} />
              </span>
              <button
                type="button"
                className="tr-count"
                aria-expanded={isOpen}
                aria-label={`${c.name}: ${c.n} ${plural(c.n, ['игрок', 'игрока', 'игроков'])} — ${isOpen ? 'свернуть' : 'показать'}`}
                onClick={() => setOpen(isOpen ? null : c.teamId)}
              >
                {c.n}
                <span className="tr-chev" aria-hidden="true">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && (
                <ul className="tr-moves">
                  {c.moves.map((m) => (
                    <li key={m.transferId}>
                      <a href={playerHref(m.playerId)}>{m.player}</a>{' '}
                      <span className="muted">
                        · <a href={seasonHref(m.season)}>{m.season}</a>
                        {m.loan && ', аренда'}
                        {m.then && ` («${m.then}»)`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {rest > 0 && (
        <p className="note">
          По {cut} — ещё {rest} {plural(rest, ['клуб', 'клуба', 'клубов'])}.
        </p>
      )}
    </Card>
  );
}

function Partners({ partners, links }: { partners: Partner[]; links: Set<number> }) {
  return (
    <ul className="tr-partners">
      {partners.map((p) => (
        <li key={p.teamId}>
          <span className="tr-crest">
            <Crest src={p.crest} className="tr-crest-img" />
          </span>
          <ClubName teamId={p.teamId} name={p.name} links={links} />
          <span className="tr-both">
            <b>{p.in}</b> {plural(p.in, ['пришёл', 'пришли', 'пришли'])} · <b>{p.out}</b> {plural(p.out, ['ушёл', 'ушли', 'ушли'])}
          </span>
        </li>
      ))}
    </ul>
  );
}
