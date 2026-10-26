import type { Result } from '../db/types';
import { RESULT_TITLE } from '../format';
import { allowedResults, findCoach, findTeam, fixResult, type CardBase, type Competition, type HeaderDraft } from './match';

// Схемы для подсказки — ввести можно любую
const FORMATIONS = ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-5-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1', '4-4-1-1', '4-3-1-2'];

interface Props {
  header: HeaderDraft;
  base: CardBase;
  competitions: Competition[];
  /** Прежнее название клуба в сезон матча, если оно отличается от названия в справочнике. */
  nameThen?: string | null;
  /** Правка — функцией от текущего значения: несколько событий подряд не затирают друг друга. */
  onChange: (update: (h: HeaderDraft) => HeaderDraft) => void;
}

export function MatchHeaderForm({ header: h, base, competitions, nameThen, onChange }: Props) {
  const set = <K extends keyof HeaderDraft>(key: K, value: HeaderDraft[K]) => onChange((old) => ({ ...old, [key]: value }));
  // Счёт и серия пенальти: результат подстраивается сам
  const setScore = (key: 'goals_for' | 'goals_against' | 'pens_for' | 'pens_against', value: string) =>
    onChange((old) => fixResult({ ...old, [key]: value }));
  const allowed = allowedResults(h);
  const raw = base.match?.opponent_raw;
  const opponent = h.opponent.trim();
  const newTeam = opponent !== '' && !findTeam(base.teams, opponent);
  const coach = h.coach.trim();
  const newCoach = coach !== '' && !findCoach(base.coaches, coach);

  return (
    <div className="form-grid">
      <label>
        № в сезоне
        <input className="w-num" inputMode="numeric" value={h.seq} onChange={(e) => set('seq', e.target.value)} />
      </label>
      <label>
        Турнир
        <select value={h.competition_id} onChange={(e) => set('competition_id', e.target.value)}>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Тур или стадия
        <input value={h.round} placeholder="17 или 1/16 финала" onChange={(e) => set('round', e.target.value)} />
      </label>
      <label>
        Дата
        <input type="date" value={h.match_date} onChange={(e) => set('match_date', e.target.value)} />
      </label>
      <label>
        Где
        <select value={h.venue} onChange={(e) => set('venue', e.target.value as HeaderDraft['venue'])}>
          <option value="">—</option>
          <option value="home">дома</option>
          <option value="away">в гостях</option>
          <option value="neutral">на нейтральном поле</option>
        </select>
      </label>

      <label className="span-2">
        Соперник
        <input
          list="admin-teams"
          value={h.opponent}
          placeholder={raw ? `в Excel: ${raw}` : 'из справочника или новый'}
          onChange={(e) => set('opponent', e.target.value)}
        />
        <datalist id="admin-teams">
          {base.teams.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <span className="field-note">
          {nameThen ? (
            <>
              В сезоне {base.season.label} клуб назывался «{nameThen}» — так он и показан на сайте. Названия по годам — в
              справочнике соперников.
            </>
          ) : newTeam ? (
            <>Нового соперника «{opponent}» добавим в справочник. Название — однозначное: «Динамо Пермь», а не «Динамо».</>
          ) : raw && !opponent ? (
            <>
              Пока записан текстом из Excel: «{raw}».{' '}
              <button type="button" className="link-button" onClick={() => set('opponent', raw)}>
                взять это название
              </button>
            </>
          ) : null}
        </span>
      </label>

      <fieldset className="score">
        <legend>Счёт «Амкар» : соперник</legend>
        <input
          className="w-num"
          inputMode="numeric"
          aria-label="голы Амкара"
          value={h.goals_for}
          onChange={(e) => setScore('goals_for', e.target.value)}
        />
        :
        <input
          className="w-num"
          inputMode="numeric"
          aria-label="голы соперника"
          value={h.goals_against}
          onChange={(e) => setScore('goals_against', e.target.value)}
        />
        <label className="inline">
          <input type="checkbox" checked={h.extra_time} onChange={(e) => set('extra_time', e.target.checked)} /> доп. время
        </label>
        <span className="pens">
          пен.
          <input
            className="w-num"
            inputMode="numeric"
            aria-label="пенальти Амкара"
            value={h.pens_for}
            onChange={(e) => setScore('pens_for', e.target.value)}
          />
          :
          <input
            className="w-num"
            inputMode="numeric"
            aria-label="пенальти соперника"
            value={h.pens_against}
            onChange={(e) => setScore('pens_against', e.target.value)}
          />
        </span>
      </fieldset>

      <label>
        Результат
        <select value={h.result} onChange={(e) => set('result', e.target.value as HeaderDraft['result'])}>
          <option value="">неизвестен</option>
          {(['W', 'D', 'L'] as Result[]).map((r) => (
            <option key={r} value={r} disabled={!allowed.includes(r)}>
              {RESULT_TITLE[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="inline">
        <input type="checkbox" checked={h.awarded} onChange={(e) => set('awarded', e.target.checked)} /> техническая
        (без игры)
      </label>

      <label>
        Тренер
        <input list="admin-coaches" value={h.coach} onChange={(e) => set('coach', e.target.value)} />
        <datalist id="admin-coaches">
          {base.coaches.map((c) => (
            <option key={c.id} value={c.short_name}>
              {c.full_name}
            </option>
          ))}
        </datalist>
        {newCoach && <span className="field-note">Нового тренера «{coach}» добавим в справочник.</span>}
      </label>
      <label>
        Схема
        <input list="admin-formations" className="w-short" value={h.formation} onChange={(e) => set('formation', e.target.value)} />
        <datalist id="admin-formations">
          {FORMATIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <label>
        Зрители
        <input inputMode="numeric" className="w-short" value={h.attendance} onChange={(e) => set('attendance', e.target.value)} />
      </label>
      <label className="span-all">
        Заметки
        <textarea rows={2} value={h.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
    </div>
  );
}
