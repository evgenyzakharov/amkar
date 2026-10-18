import { hasAssist, newGoalKey, scorerIsAmkar, type GoalDraft, type GoalKind, type GoalSide, type SquadPlayer } from './match';

interface Props {
  goals: GoalDraft[];
  /** Игроки «Амкара» для выбора автора и ассистента: сыгравшие в матче — первыми. */
  played: SquadPlayer[];
  others: SquadPlayer[];
  onChange: (update: (goals: GoalDraft[]) => GoalDraft[]) => void;
}

const KIND_LABEL: Record<GoalKind, string> = { open_play: 'с игры', penalty: 'пенальти', own_goal: 'автогол' };

function PlayerSelect({
  value,
  onChange,
  played,
  others,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  played: SquadPlayer[];
  others: SquadPlayer[];
  label: string;
}) {
  const option = (p: SquadPlayer) => (
    <option key={p.player_id} value={p.player_id}>
      {p.shirt_number != null ? `${p.shirt_number}. ` : ''}
      {p.display_name}
    </option>
  );
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {played.length > 0 && <optgroup label="Играли в матче">{played.map(option)}</optgroup>}
      {others.length > 0 && <optgroup label={played.length > 0 ? 'Остальные из заявки' : 'Заявка сезона'}>{others.map(option)}</optgroup>}
    </select>
  );
}

export function GoalsEditor({ goals, played, others, onChange }: Props) {
  const update = (key: string, patch: Partial<GoalDraft>) =>
    onChange((old) => old.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const add = (side: GoalSide) => {
    const goal: GoalDraft = { key: newGoalKey(), id: null, side, minute: '', kind: 'open_play', scorer_id: '', scorer_name: '', assist_id: '' };
    onChange((old) => [...old, goal]);
  };

  return (
    <>
      {goals.length > 0 && (
        <div className="table-wrap">
          <table className="data-table edit-table">
            <thead>
              <tr>
                <th className="num">№</th>
                <th>Чей</th>
                <th title="«23» или «90+3»">Мин</th>
                <th>Как</th>
                <th>Автор</th>
                <th>Передача</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g, i) => {
                const amkarScorer = scorerIsAmkar(g.side, g.kind);
                return (
                  <tr key={g.key} className={g.side === 'amkar' ? 'goal-for' : 'goal-against'}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <select
                        aria-label="чей гол"
                        value={g.side}
                        onChange={(e) => update(g.key, { side: e.target.value as GoalSide })}
                      >
                        <option value="amkar">Амкар</option>
                        <option value="opponent">соперник</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="w-min"
                        aria-label="минута"
                        placeholder="90+3"
                        value={g.minute}
                        onChange={(e) => update(g.key, { minute: e.target.value })}
                      />
                    </td>
                    <td>
                      <select aria-label="как забит" value={g.kind} onChange={(e) => update(g.key, { kind: e.target.value as GoalKind })}>
                        {(Object.keys(KIND_LABEL) as GoalKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {amkarScorer ? (
                        <PlayerSelect
                          label={g.side === 'amkar' ? 'автор гола' : 'автор автогола'}
                          value={g.scorer_id}
                          onChange={(v) => update(g.key, { scorer_id: v })}
                          played={played}
                          others={others}
                        />
                      ) : (
                        <input
                          aria-label={g.side === 'amkar' ? 'автор автогола (соперник)' : 'автор гола (соперник)'}
                          placeholder={g.side === 'amkar' ? 'игрок соперника (автогол)' : 'игрок соперника'}
                          value={g.scorer_name}
                          onChange={(e) => update(g.key, { scorer_name: e.target.value })}
                        />
                      )}
                    </td>
                    <td>
                      {hasAssist(g.side, g.kind) && (
                        <PlayerSelect
                          label="голевая передача"
                          value={g.assist_id}
                          onChange={(v) => update(g.key, { assist_id: v })}
                          played={played}
                          others={others}
                        />
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        title="удалить гол"
                        onClick={() => onChange((old) => old.filter((x) => x.key !== g.key))}
                      >
                        удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="button-row">
        <button type="button" onClick={() => add('amkar')}>
          + гол «Амкара»
        </button>
        <button type="button" onClick={() => add('opponent')}>
          + гол соперника
        </button>
      </p>
    </>
  );
}
