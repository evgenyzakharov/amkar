import { useState } from 'react';
import { LoadStatus } from '../components/common';
import { useDocumentTitle, useLoad } from '../load';
import { adminHref, adminMatchHref, adminPlayerHref } from '../router';
import { runChecks, type CheckData, type CheckItem, type CheckResult } from './checks';
import { dbErrorMessage } from './dbErrors';
import { loadDataChecks } from './queries';
import { supabaseWriter } from './writer';

const ALL = 'all';
const ICON = { ok: '✓', warn: '!', info: 'i' } as const;
/** Сколько случаев показывать сразу; остальные — по «показать все». */
const SHOWN = 8;

/** #/admin/checks: сверки данных одной страницей. Ничего не меняет, кроме отметок «Так и есть». */
export function DataChecksPage() {
  useDocumentTitle('Проверка данных');
  const state = useLoad(ALL, loadDataChecks);
  return (
    <>
      <p>
        <a href={adminHref}>← Админка</a>
      </p>
      <h2>Проверка данных</h2>
      <p className="muted">
        Сверки, которые раньше гонялись скриптом. Ничего не меняют — только показывают; у случая — ссылка на карточку. «!» — стоит посмотреть, «i» —
        известно и на статистику не влияет. Отмеченное «Так и есть» больше не считается замечанием.
      </p>
      {state.status === 'loading' && <p className="muted">Загрузка… (составы всех матчей — около 20 тысяч строк, несколько секунд)</p>}
      {state.status === 'error' && <LoadStatus state={state} />}
      {state.status === 'ready' && <Checks data={state.data} />}
    </>
  );
}

function Checks({ data }: { data: CheckData }) {
  const [ok, setOk] = useState(data.ok);
  const [error, setError] = useState<string | null>(null);
  const results = runChecks({ ...data, ok });

  async function toggle(check: CheckResult, item: CheckItem) {
    setError(null);
    const row = { check_key: check.key, item_key: item.key };
    try {
      if (item.accepted) {
        await supabaseWriter.remove('data_check_ok', row);
        setOk((list) => list.filter((o) => !(o.check_key === row.check_key && o.item_key === row.item_key)));
      } else {
        await supabaseWriter.insert('data_check_ok', [row]);
        setOk((list) => [...list, row]);
      }
    } catch (e) {
      setError(dbErrorMessage(e));
    }
  }

  return (
    <div className="data-checks">
      {error && <p className="error">{error}</p>}
      {results.map((r) => (
        <CheckRow key={r.key} check={r} onToggle={toggle} />
      ))}
    </div>
  );
}

function CheckRow({ check, onToggle }: { check: CheckResult; onToggle: (c: CheckResult, i: CheckItem) => void }) {
  const [all, setAll] = useState(false);
  const open = check.items.filter((i) => !i.accepted);
  const count = check.acceptable ? open.length : check.items.length;
  const shown = all ? check.items : check.items.slice(0, SHOWN);
  return (
    <section className={`check check-${check.level}`}>
      <span className="check-icon" aria-hidden="true">
        {ICON[check.level]}
      </span>
      <div className="check-body">
        <div className="check-title">
          <b>{check.title}</b>
          <span className="muted">{check.items.length === 0 ? 'всё в порядке' : count}</span>
        </div>
        {check.summary && <p className="note">{check.summary}</p>}
        {check.items.length > 0 && (
          <ul className="check-items">
            {shown.map((i) => (
              <li key={i.key} className={i.accepted ? 'accepted' : undefined}>
                {i.matchId ? <a href={adminMatchHref(i.matchId)}>{i.text}</a> : i.playerId ? <a href={adminPlayerHref(i.playerId)}>{i.text}</a> : i.text}
                {check.acceptable && (
                  <button type="button" className="link-button" onClick={() => onToggle(check, i)}>
                    {i.accepted ? 'так и есть ✓ · отменить' : 'так и есть'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {check.items.length > SHOWN && (
          <button type="button" className="link-button" onClick={() => setAll((a) => !a)}>
            {all ? 'свернуть' : `показать все ${check.items.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
