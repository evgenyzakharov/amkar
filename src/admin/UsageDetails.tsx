import { useEffect, useState } from 'react';
import { ResultBadge } from '../components/common';
import { DIRECTION_LABEL, formatScore, opponentName } from '../format';
import { errorMessage } from '../load';
import { adminMatchHref, playerHref } from '../router';
import { loadUsage, type UsageData } from './queries';

/** Матчи и трансферы клуба или тренера по сезонам — раскрывается по клику на «где встречается». */
export function UsageDetails({ kind, id }: { kind: 'team' | 'coach'; id: number }) {
  const [state, setState] = useState<{ data?: UsageData; error?: string }>({});

  useEffect(() => {
    let current = true;
    loadUsage(kind, id).then(
      (data) => current && setState({ data }),
      (e: unknown) => current && setState({ error: errorMessage(e) }),
    );
    return () => {
      current = false;
    };
  }, [kind, id]);

  if (state.error) return <p className="error">Не удалось загрузить: {state.error}</p>;
  if (!state.data) return <p className="muted">Загрузка…</p>;
  const { matches, transfers } = state.data;

  const seasons = [...new Set(matches.map((m) => m.season.label))];
  return (
    <div className="usage">
      {seasons.map((label) => (
        <div key={label} className="usage-season">
          <b>{label}:</b>{' '}
          {matches
            .filter((m) => m.season.label === label)
            .map((m) => (
              <a key={m.id} className="usage-match" href={adminMatchHref(m.id)} title={kind === 'team' ? `в Excel: ${m.opponent_raw ?? '—'}` : undefined}>
                №{m.seq}
                {kind === 'coach' && ` ${opponentName(m)}`} <ResultBadge result={m.result} /> {formatScore(m)}
              </a>
            ))}
        </div>
      ))}
      {transfers.length > 0 && (
        <div className="usage-season">
          <b>Трансферы:</b>{' '}
          {transfers.map((t) => (
            <span key={t.id} className="usage-match">
              {t.season.label} <a href={playerHref(t.player.id)}>{t.player.display_name}</a> — {DIRECTION_LABEL[t.direction]}
            </span>
          ))}
        </div>
      )}
      {matches.length === 0 && transfers.length === 0 && <p className="muted">Нигде не встречается.</p>}
    </div>
  );
}
