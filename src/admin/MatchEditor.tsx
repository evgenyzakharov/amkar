import { useState } from 'react';
import { LoadStatus, PageNav } from '../components/common';
import { useDocumentTitle, useLoad } from '../load';
import { adminMatchHref, adminSeasonHref, matchHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import { GoalsEditor } from './GoalsEditor';
import { LineupEditor } from './LineupEditor';
import { cardDraft, matchEnd, validateCard, type CardDraft } from './match';
import { MatchHeaderForm } from './MatchHeaderForm';
import { loadMatchCard, loadNewMatchCard, type MatchCardData } from './queries';
import { isDirty, saveMatchCard } from './save';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

export function MatchEditor({ id }: { id: number }) {
  const state = useLoad(id, loadMatchCard);
  useDocumentTitle(`Правка матча №${id}`);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <MatchCard key={id} initial={state.data} />;
}

export function NewMatchEditor({ label }: { label: string }) {
  const state = useLoad(label, loadNewMatchCard);
  useDocumentTitle(`Новый матч, ${label}`);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <MatchCard key={`new-${label}`} initial={state.data} />;
}

type Status = { kind: 'ok' | 'error'; text: string; link?: { href: string; text: string } };

function MatchCard({ initial }: { initial: MatchCardData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<CardDraft>(() => cardDraft(initial.base, initial.competitions));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const { base, competitions, squad, prevId, nextId } = data;
  const match = base.match;
  const label = base.season.label;
  const nameById = new Map(squad.map((p) => [p.player_id, p.display_name]));
  const nameOf = (id: number) => nameById.get(id) ?? `игрок №${id}`;
  const { errors, warnings } = validateCard(draft, base, nameOf);
  const dirty = isDirty(base, draft);
  const end = matchEnd(draft.header);

  useUnsavedGuard(dirty);

  const reset = (fresh: MatchCardData) => {
    setData(fresh);
    setDraft(cardDraft(fresh.base, fresh.competitions));
  };

  async function save(goNext: boolean) {
    setSaving(true);
    setStatus(null);
    const out = await saveMatchCard(supabaseWriter, base, draft);
    if (out.error) {
      // Записанное до ошибки уже в базе: повторное сохранение допишет остальное
      setData({ ...data, base: out.base });
      setDraft(out.draft);
      setStatus({ kind: 'error', text: dbErrorMessage(out.error) });
      setSaving(false);
      return;
    }
    const saved = out.base.match!;
    const savedLink = { href: adminMatchHref(saved.id), text: `матч №${saved.seq}` };
    try {
      if (!match && goNext) {
        reset(await loadNewMatchCard(label));
        setStatus({ kind: 'ok', text: 'Сохранено. Вводите следующий матч.', link: savedLink });
      } else if (!match) {
        window.location.hash = adminMatchHref(saved.id);
        return;
      } else if (goNext) {
        window.location.hash = nextId ? adminMatchHref(nextId) : adminSeasonHref(label);
        return;
      } else {
        reset(await loadMatchCard(saved.id));
        setStatus({ kind: 'ok', text: 'Сохранено.' });
      }
    } catch (e) {
      setData({ ...data, base: out.base });
      setDraft(out.draft);
      setStatus({ kind: 'ok', text: `Сохранено, но перечитать карточку не удалось: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  async function remove() {
    if (!match) return;
    if (!window.confirm(`Удалить матч №${match.seq} целиком — вместе с голами, составом и пропусками?`)) return;
    setSaving(true);
    try {
      await supabaseWriter.remove('match', { id: match.id });
      window.location.hash = adminSeasonHref(label);
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
      setSaving(false);
    }
  }

  const played = squad.filter((p) => ['start', 'sub', 'unknown'].includes(draft.lineup[p.player_id]?.status ?? ''));
  const others = squad.filter((p) => p.inSquad && !played.includes(p));
  const title = draft.header.opponent.trim() || match?.opponent_raw || 'соперник';

  return (
    <div className="match-card">
      <PageNav
        up={<a href={adminSeasonHref(label)}>← Сезон {label}</a>}
        prev={prevId && <a href={adminMatchHref(prevId)}>‹ предыдущий</a>}
        next={
          <>
            {nextId && <a href={adminMatchHref(nextId)}>следующий ›</a>}
            {match && <a href={matchHref(match.id)}>на сайте</a>}
          </>
        }
      />
      <h2>{match ? `Матч №${match.seq}: Амкар — ${title}` : `Новый матч, сезон ${label}`}</h2>

      <section>
        <h3>Матч</h3>
        <MatchHeaderForm
          header={draft.header}
          base={base}
          competitions={competitions}
          onChange={(update) => setDraft((d) => ({ ...d, header: update(d.header) }))}
        />
      </section>

      <section>
        <h3>Голы</h3>
        <GoalsEditor
          goals={draft.goals}
          played={played}
          others={others}
          onChange={(update) => setDraft((d) => ({ ...d, goals: update(d.goals) }))}
        />
      </section>

      <section>
        <h3>Состав</h3>
        <LineupEditor
          lineup={draft.lineup}
          squad={squad}
          end={end}
          onChange={(update) => setDraft((d) => ({ ...d, lineup: update(d.lineup) }))}
        />
      </section>

      <div className="save-bar">
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {warnings.length > 0 && (
          <ul className="warnings">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {status && (
          <p className={status.kind === 'error' ? 'error' : 'ok'} role="status">
            {status.text}
            {status.link && (
              <>
                {' '}
                <a href={status.link.href}>{status.link.text}</a>
              </>
            )}
          </p>
        )}
        <p className="button-row">
          <button type="button" className="primary" disabled={saving || errors.length > 0 || !dirty} onClick={() => void save(false)}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" disabled={saving || errors.length > 0 || !dirty} onClick={() => void save(true)}>
            {match ? 'Сохранить и к следующему' : 'Сохранить и ввести ещё'}
          </button>
          <button type="button" disabled={saving || !dirty} onClick={() => reset(data)}>
            Отменить изменения
          </button>
          {!dirty && match && <span className="muted">Изменений нет.</span>}
        </p>
      </div>

      {match && (
        <section className="danger-zone">
          <button type="button" className="danger" disabled={saving} onClick={() => void remove()}>
            Удалить матч
          </button>
        </section>
      )}
      {!match && <p className="note">Новый матч встаёт в конец сезона: №{base.nextSeq}.</p>}
    </div>
  );
}
