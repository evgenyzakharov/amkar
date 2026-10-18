import { signOut, useAuth } from '../auth';
import { NotFound } from '../components/common';
import { useDocumentTitle } from '../load';
import type { AdminRoute } from '../router';
import { AdminHome } from './AdminHome';
import { AdminSeason } from './AdminSeason';
import { LoginForm } from './LoginForm';

/** #/admin/…: без входа — форма входа, без прав админа — объяснение, иначе раздел админки. */
export function AdminPage({ route }: { route: AdminRoute }) {
  const auth = useAuth();
  useDocumentTitle('Админка');

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
      return <AdminSeason label={route.label} />;
    default:
      return <NotFound message="Такого раздела в админке пока нет." />;
  }
}
