import { useEffect, useState } from 'react';
import { LoadStatus } from '../components/common';
import { LINK_SITES } from '../format';
import { errorMessage, useLoad } from '../load';
import { adminMatchHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import { LINK_SITE_KEYS, isSeasonDirty, saveSeason, seasonDraft, validateSeason, type SeasonDraft } from './people';
import { checkGoals, type GoalsCheck } from './goalsCheck';
import { loadGoalsCheck, loadSeasonInfo, type SeasonInfoData } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

const siteLabel = (s: string) => LINK_SITES.find((x) => x.site === s)?.label ?? s;

export function SeasonInfoEditor({ label }: { label: string }) {
  const state = useLoad(label, loadSeasonInfo);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <SeasonInfo key={label} initial={state.data} />;
}

function SeasonInfo({ initial }: { initial: SeasonInfoData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<SeasonDraft>(() => seasonDraft(initial.season, initial.links));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { season, links } = data;

  const errors = validateSeason(draft, siteLabel);
  const dirty = isSeasonDirty(draft, season, links);
  useUnsavedGuard(dirty);
  const set = <K extends keyof SeasonDraft>(key: K, value: SeasonDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    setStatus(null);
    let saved = false;
    try {
      await saveSeason(supabaseWriter, season, links, draft);
      saved = true;
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    try {
      const fresh = await loadSeasonInfo(season.label);
      setData(fresh);
      // После ошибки введённое остаётся в форме: исправить и сохранить ещё раз
      if (saved) setDraft(seasonDraft(fresh.season, fresh.links));
    } catch (e) {
      setStatus({ kind: 'error', text: `Не удалось перечитать сезон: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      <div className="form-grid">
        <label className="span-2">
          Лига
          <input value={draft.division} placeholder="Премьер-лига" onChange={(e) => set('division', e.target.value)} />
          <span className="field-note">как называть на сайте в этом сезоне</span>
        </label>
        <label>
          Уровень
          <input className="w-num" inputMode="numeric" value={draft.tier} onChange={(e) => set('tier', e.target.value)} />
          <span className="field-note">1 — высший дивизион</span>
        </label>
        <label>
          Место
          <input className="w-num" inputMode="numeric" value={draft.final_place} onChange={(e) => set('final_place', e.target.value)} />
        </label>
        <label>
          Команд в лиге
          <input className="w-num" inputMode="numeric" value={draft.teams_count} onChange={(e) => set('teams_count', e.target.value)} />
        </label>
        {draft.expected_place !== null && (
          <label>
            Ждали место
            <input className="w-num" inputMode="decimal" value={draft.expected_place} onChange={(e) => set('expected_place', e.target.value)} />
            <span className="field-note">перед сезоном, для очков сезона; 2,5 — между 2-м и 3-м</span>
          </label>
        )}
        {LINK_SITE_KEYS.map((s) => (
          <label key={s} className="span-2">
            {siteLabel(s)}
            <input
              type="url"
              placeholder="https://…"
              value={draft.links[s]}
              onChange={(e) => setDraft((d) => ({ ...d, links: { ...d.links, [s]: e.target.value } }))}
            />
          </label>
        ))}
        <label className="span-all">
          Заметки
          <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <label className="inline span-all goals-switch">
          <input type="checkbox" checked={draft.goals_from_matches} onChange={(e) => set('goals_from_matches', e.target.checked)} /> Голы,
          передачи и пропущенные за сезон — по карточкам матчей
          <span className="field-note">
            выключено — на сайте итоги из таблицы автора (Excel); включайте, когда все голы сезона внесены в матчи
          </span>
        </label>
      </div>
      <div className="save-bar">
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {status && (
          <p className={status.kind === 'error' ? 'error' : 'ok'} role="status">
            {status.text}
          </p>
        )}
        <p className="button-row">
          <button type="button" className="primary" disabled={saving || !dirty || errors.length > 0} onClick={() => void save()}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" disabled={saving || !dirty} onClick={() => setDraft(seasonDraft(season, links))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <GoalsCheckPanel seasonId={season.id} />
    </>
  );
}

/** Сверка: сколько голов и передач в Excel и сколько внесено в карточки матчей. */
function GoalsCheckPanel({ seasonId }: { seasonId: number }) {
  const [state, setState] = useState<{ check?: GoalsCheck; error?: string }>({});
  useEffect(() => {
    let alive = true;
    loadGoalsCheck(seasonId).then(
      (d) => alive && setState({ check: checkGoals(d.matches, d.goals, d.totals, (id) => d.names.get(id) ?? `игрок №${id}`) }),
      (e: unknown) => alive && setState({ error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [seasonId]);

  if (state.error) return <p className="error">Сверка голов не загрузилась: {state.error}</p>;
  if (!state.check) return <p className="muted">Сверка голов…</p>;
  const { players, gaps, noScore } = state.check;
  const differing = players.filter((p) => p.differs).length;
  const cell = (excel: number | null, match: number) => (
    <>
      <td className="num">{excel ?? '—'}</td>
      <td className={`num${(excel ?? 0) !== match ? ' check-diff' : ''}`}>{match}</td>
    </>
  );

  return (
    <section className="goals-check">
      <h3>Сверка голов: Excel и карточки матчей</h3>
      <p className={gaps.length || noScore.length || differing ? 'warnings' : 'ok'}>
        {gaps.length === 0 && noScore.length === 0 && differing === 0
          ? 'Всё сходится: голы матчей совпадают со счётом и с таблицей автора.'
          : [
              gaps.length > 0 && `в ${gaps.length} матчах внесено не столько голов, сколько в счёте`,
              noScore.length > 0 && `в ${noScore.length} матчах нет счёта`,
              differing > 0 && `у ${differing} игроков числа расходятся с Excel`,
            ]
              .filter(Boolean)
              .join('; ') + '.'}
      </p>
      {gaps.length > 0 && (
        <p className="check-list">
          Голов внесено меньше или больше, чем в счёте:{' '}
          {gaps.map((g) => (
            <a key={g.id} href={adminMatchHref(g.id)} title="открыть карточку матча">
              №{g.seq} {g.opponent} — {g.enteredFor} из {g.scoredFor}
              {g.enteredAgainst !== g.scoredAgainst && `, пропущенных ${g.enteredAgainst} из ${g.scoredAgainst}`}
            </a>
          ))}
        </p>
      )}
      {noScore.length > 0 && (
        <p className="check-list">
          Без счёта:{' '}
          {noScore.map((m) => (
            <a key={m.id} href={adminMatchHref(m.id)}>
              №{m.seq} {m.opponent}
            </a>
          ))}
        </p>
      )}
      {players.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Игрок</th>
                <th className="num" title="голы — итоги из таблицы автора">Голы Excel</th>
                <th className="num" title="голы — внесены в карточки матчей">по матчам</th>
                <th className="num" title="передачи — итоги из таблицы автора">Передачи Excel</th>
                <th className="num" title="передачи — внесены в карточки матчей">по матчам</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.player_id}>
                  <td>{p.name}</td>
                  {cell(p.excelGoals, p.matchGoals)}
                  {cell(p.excelAssists, p.matchAssists)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">Без товарищеских матчей. Красным — где число по матчам не совпадает с Excel.</p>
    </section>
  );
}
