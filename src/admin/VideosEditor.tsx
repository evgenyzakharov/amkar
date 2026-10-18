import { VIDEO_KIND_LABEL, VIDEO_SITE_LABEL, videoSite, type VideoKind } from '../db/videos';
import { newVideoKey, type VideoDraft } from './match';

interface Props {
  videos: VideoDraft[];
  onChange: (update: (videos: VideoDraft[]) => VideoDraft[]) => void;
}

/** Видео матча: полный матч или обзор, ссылкой на YouTube или ВК; сайт — по адресу. */
export function VideosEditor({ videos, onChange }: Props) {
  const update = (key: string, patch: Partial<VideoDraft>) =>
    onChange((old) => old.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  const add = () => {
    const video: VideoDraft = { key: newVideoKey(), id: null, kind: 'highlights', url: '', title: '' };
    onChange((old) => [...old, video]);
  };

  return (
    <>
      {videos.length > 0 && (
        <div className="table-wrap">
          <table className="data-table edit-table videos-edit">
            <thead>
              <tr>
                <th>Что</th>
                <th>Ссылка</th>
                <th>Сайт</th>
                <th>Подпись</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => {
                const site = videoSite(v.url);
                return (
                  <tr key={v.key}>
                    <td>
                      <select aria-label={`видео №${i + 1}: что`} value={v.kind} onChange={(e) => update(v.key, { kind: e.target.value as VideoKind })}>
                        {(Object.keys(VIDEO_KIND_LABEL) as VideoKind[]).map((k) => (
                          <option key={k} value={k}>
                            {VIDEO_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="url"
                        aria-label={`видео №${i + 1}: ссылка`}
                        placeholder="https://youtu.be/… или https://vk.com/video…"
                        value={v.url}
                        onChange={(e) => update(v.key, { url: e.target.value })}
                      />
                    </td>
                    <td className={site ? undefined : 'muted'}>{site ? VIDEO_SITE_LABEL[site] : v.url.trim() ? 'не YouTube и не ВК' : ''}</td>
                    <td>
                      <input
                        aria-label={`видео №${i + 1}: подпись`}
                        placeholder="ТВ-трансляция"
                        value={v.title}
                        onChange={(e) => update(v.key, { title: e.target.value })}
                      />
                    </td>
                    <td>
                      <button type="button" className="link-button" onClick={() => onChange((old) => old.filter((x) => x.key !== v.key))}>
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
        <button type="button" onClick={add}>
          + видео
        </button>
      </p>
    </>
  );
}
