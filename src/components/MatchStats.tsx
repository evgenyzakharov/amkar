// Общие части страниц тренеров и соперников: полоса «победы–ничьи–поражения» и разрезы итогов.
import { WDL, ppmText, type Totals } from '../coaches';

export function WdlBar({ t }: { t: Totals }) {
  return (
    <span className="wdl-bar" aria-hidden="true">
      {(
        [
          ['W', t.w],
          ['D', t.d],
          ['L', t.l],
        ] as const
      ).map(([r, n]) => n > 0 && <span key={r} className={`wdl-${r}`} style={{ flexGrow: n }} />)}
    </span>
  );
}

/** Полоса и числа «В–Н–П» в ячейке таблицы. */
export function Wdl({ t }: { t: Totals }) {
  return (
    <span className="wdl-cell">
      <WdlBar t={t} />
      <span className="num">
        {t.w}–{t.d}–{t.l}
      </span>
    </span>
  );
}

/** Итоги по строкам: по турнирам, дома и в гостях. */
export function Slices({ rows }: { rows: { label: string; t: Totals }[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th className="num">М</th>
            <th>{WDL}</th>
            <th className="num">Очки/м</th>
            <th className="num">Мячи</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, t }) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">{t.p}</td>
              <td className="nowrap">
                {t.w}–{t.d}–{t.l}
              </td>
              <td className="num">{ppmText(t)}</td>
              <td className="num nowrap">
                {t.gf}:{t.ga}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
