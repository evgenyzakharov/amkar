import { useState } from 'react';

/** Герб клуба по ссылке (team.crest_url), без referer — как фото игрока по ссылке; не открылся — картинки нет. */
export function Crest({ src, className = 'match-crest' }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return <img className={className} src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
}
