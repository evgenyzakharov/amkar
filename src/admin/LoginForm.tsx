import { useState, type FormEvent } from 'react';
import { signIn } from '../auth';
import { useDocumentTitle } from '../load';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle('Вход');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    // После удачного входа форму сменит админка — состояние уже не нужно
    if (message) {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <h2>Вход для админа</h2>
      <label>
        Почта
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Пароль
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}
