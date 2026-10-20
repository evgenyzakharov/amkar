import { signOut, useAuth } from '../auth';
import type { AdminRoute } from '../router';
import { AdminHome } from './AdminHome';
import { AdminSeason } from './AdminSeason';
import { LoginForm } from './LoginForm';
import { CoachesPage, TeamsPage } from './DirectoryPages';
import { MatchEditor, NewMatchEditor } from './MatchEditor';
import { PlayerEditor, PlayersList } from './PlayerEditor';
import { PointsSettingsEditor } from './PointsSettingsEditor';

/** #/admin/…: без входа — форма входа, без прав админа — объяснение, иначе раздел админки. */
export function AdminPage({ route }: { route: AdminRoute }) {
  const auth = useAuth();

  if (auth.status === 'loading') return <p className="muted">Загрузка…</p>;
  if (auth.status === 'signed-out') return <LoginForm />;
  if (auth.role === 'checking') return <p className="muted">Проверка прав…</p>;
  if (auth.role !== 'admin') {
    return (
      <div>
        <h2>Нет доступа</h2>
        <p>
          {auth.role === 'error'
            ? `Не удалось проверить права: ${auth.adminError}`
            : `Вы вошли как ${auth.email}, но менять данные этому аккаунту нельзя.`}
        </p>
        <button type="button" onClick={() => void signOut()}>
          Выйти
        </button>
      </div>
    );
  }

  switch (route.page) {
    case 'home':
      return <AdminHome />;
    case 'season':
      return <AdminSeason label={route.label} tab={route.tab} />;
    case 'match':
      return <MatchEditor id={route.id} />;
    case 'new-match':
      return <NewMatchEditor label={route.label} />;
    case 'teams':
      return <TeamsPage />;
    case 'coaches':
      return <CoachesPage />;
    case 'players':
      return <PlayersList />;
    case 'player':
      return <PlayerEditor id={route.id} />;
    case 'points':
      return <PointsSettingsEditor />;
  }
}
