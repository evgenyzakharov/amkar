# Амкар — история в цифрах

Витрина исторической статистики ФК «Амкар»: сезоны, матчи, составы, голы, трансферы. Сайт на GitHub Pages, данные в Supabase. Читать может любой посетитель, менять — только админ после входа.

Стек: React + Vite + TypeScript, `@supabase/supabase-js`. Тесты схемы гоняются на PGlite (Postgres в Node), отдельная база для них не нужна.

## Запуск с нуля

### 1. Supabase

1. Создать проект в [Supabase](https://supabase.com).
2. **SQL Editor** → выполнить по порядку файлы из [supabase/migrations](supabase/migrations).
3. **Authentication → Users → Add user**: завести себе пользователя с почтой и паролем.
4. **Authentication → Sign In / Providers**: выключить «Allow new users to sign up». Посторонний и после регистрации ничего не сможет изменить, но лишние аккаунты ни к чему.
5. Дать себе права админа (SQL Editor):

   ```sql
   insert into admins (user_id) select id from auth.users where email = 'ваша@почта';
   ```

### 2. Локально

```bash
cp .env.example .env
```

Заполнить `.env`: **Project Settings → API** → Project URL и anon (publishable) ключ. Анонимный ключ не секрет: он попадает в код сайта, а защищают данные политики RLS.

```bash
npm install
```

```bash
npm run dev
```

### 3. GitHub

1. Создать репозиторий и запушить `main`.
2. **Settings → Pages → Source**: GitHub Actions.
3. **Settings → Secrets and variables → Actions**, добавить:

   | Секрет | Где взять |
   |---|---|
   | `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon (publishable) ключ |
   | `SUPABASE_DB_URL` | кнопка **Connect** → Session pooler. Строка с паролем базы — настоящий секрет |

## Воркфлоу

| Файл | Что делает |
|---|---|
| [ci.yml](.github/workflows/ci.yml) | Линт и тесты на каждый push и PR; на push в `main` — сборка и деплой на Pages |
| [keep-alive.yml](.github/workflows/keep-alive.yml) | Каждый день пингует Supabase, чтобы бесплатный проект не уснул. Раз в ~50 дней делает пустой коммит, иначе GitHub отключает расписание |
| [backup.yml](.github/workflows/backup.yml) | По понедельникам снимает `pg_dump` схемы `public` в артефакт на 90 дней. Перед массовым дозаполнением — запустить вручную. Артефакты публичного репозитория видны всем, но в дампе только то, что и так открыто на сайте: данные таблицы `admins` исключены |

## Как меняются данные

- **Обычный ввод** — через админку сайта: `…/#/admin`, вход почтой и паролем из Supabase Auth.
- **Массовое дозаполнение** (однофамильцы, соперники, счета, даты) — Claude готовит `.sql`, админ выполняет его в SQL Editor. Разовые файлы лежат в `local/`, в репозиторий не попадают.
- **Схема** меняется только новыми файлами в `supabase/migrations`. Старые миграции не правим: они уже выполнены в базе.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Сайт локально |
| `npm test` | Тесты схемы |
| `npm run lint` | ESLint |
| `npm run build` | Проверка типов и сборка в `dist` |
