# CLAUDE.md — контекст проєкту для ШІ-агента

> Прочитай цей файл перед будь-якими змінами в репозиторії. Він описує архітектуру,
> інваріанти та типові задачі. Мова проєкту (UI, коментарі, документація) — українська.

## Що це

**«Ранкова мотивація»** — особистий PWA-застосунок. Щодня о **8:00 Europe/Warsaw**
на телефон (Samsung Android — основний, iPhone — підтримується) приходить web-push
із **2–3 цитатами** з власного пулу користувача. У застосунку однією кнопкою грає
**один фіксований музичний трек** користувача. Цитати обираються **shuffle bag**:
випадково, без повторів, до вичерпання пулу; далі цикл перезапускається.

## Архітектура (3 частини)

| Частина | Технології | Де живе | Роль |
| --- | --- | --- | --- |
| `app/` | React 18 + Vite 5 + vite-plugin-pwa (injectManifest, Workbox) | GitHub Pages (деплой через Actions) | UI, push-підписка, керування цитатами/треком/PIN |
| Supabase | Postgres + Storage | хмара Supabase | усі дані + файл треку |
| `sender/` | Python 3 (requests + pywebpush) | GCP ВМ користувача, systemd timer | щоденна розсилка о 8:00 |

Потік даних: `timer → send_morning.py → Supabase (вибір цитат, запис добірки) → web-push → service worker (sw.js) → сповіщення`.

## Карта файлів

```
app/
  vite.config.js            base ('/morning-motivation/' — має збігатися з назвою репо!) + маніфест PWA
  index.html                шрифти Google (Cormorant, Golos Text), мета PWA
  public/icons/             іконки 192/512/maskable + badge-96 для сповіщень
  src/config.js             SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY, TRACK_FILE
  src/sw.js                 service worker: precache, кеш музики/шрифтів, обробка push і кліку
  src/main.jsx              вхід + registerSW
  src/App.jsx               завантаження налаштувань, PIN-гейт, вкладки, тости
  src/lib/supabase.js       клієнт sb, loadSettings/saveSetting, trackUrl(version)
  src/lib/push.js           enablePush/disablePush/subscriptionState/showLocalTest, isIOS/isStandalone
  src/lib/pin.js            sha256, remember/forget unlock (localStorage 'mm_unlock')
  src/lib/dates.js          todayWarsaw(), формат дат uk-UA
  src/components/
    PinGate.jsx             перший запуск = створення PIN; далі — розблокування
    Today.jsx               добірка дня, банер увімкнення push, iOS-підказка
    HorizonPlayer.jsx       ФІРМОВИЙ ЕЛЕМЕНТ: сонце = кнопка Play, рухається лінією обрію як прогрес
    Quotes.jsx              додавання (одиночне + «Додати списком» через порожній рядок), редагування, видалення, лічильник
    History.jsx             архів добірок (останні 60 днів)
    Settings.jsx            push on/off + тест, завантаження/заміна треку, зміна PIN, довідка
supabase/schema.sql         таблиці + RLS (anon = повний доступ) + бакет music
sender/
  send_morning.py           уся серверна логіка (див. «Ключові потоки»)
  requirements.txt          pywebpush, requests
  .env.example              SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
  morning-push.service/.timer  systemd; OnCalendar=*-*-* 08:00:00 Europe/Warsaw, Persistent=true
.github/workflows/deploy.yml  npm ci + build у app/ → GitHub Pages
```

## Модель даних (Supabase)

- `quotes(id uuid PK, text, author null, used bool, created_at)` — `used` = «вже випадала в поточному циклі». **Прапорець `used` пише лише sender**; фронт його тільки читає (лічильник, чіп «чекає своєї черги»).
- `daily_selections(day date PK, quotes jsonb, created_at)` — `quotes` = масив `[{"text","author"}]`. Читають `Today.jsx` і `History.jsx`.
- `push_subscriptions(endpoint text PK, p256dh, auth, user_agent, created_at)` — по рядку на пристрій. Новий отримувач = сам відкрив застосунок і натиснув «Увімкнути» (коду не треба).
- `app_settings(key PK, value)` — ключі: `pin_hash` (sha256 hex), `track_version` (Date.now() як рядок).
- Storage: публічний бакет `music`, один файл `track.mp3` (імʼя в `config.js::TRACK_FILE`).

## Ключові потоки

**Ранкова розсилка** (`send_morning.py`): n = random(2..3) → взяти n випадкових з `used=false`; якщо невикористаних менше за n — забрати залишок, скинути всім `used=false`, добрати з решти, позначити обраних `used=true` (перезапуск циклу) → upsert `daily_selections` → push усім підпискам; відповіді 404/410 → підписка видаляється. Порожній пул → push-нагадування «додай цитати», добірка не пишеться. Прапорці: `--dry-run` (нічого не змінює й не шле), `--test` (тестовий push без змін у базі).

**Формат push payload** — контракт між `send_morning.py` і `sw.js`:
`{"title", "date", "quotes":[{"text","author"}]}` або `{"title","body"}`. Змінюєш payload — онови **обидва** файли синхронно.

**Трек**: Settings → upload з `upsert:true` у `music/track.mp3` → `app_settings.track_version = Date.now()` → URL будується як `...track.mp3?v=<version>` (ламає кеш). SW кешує музику CacheFirst у кеш `music` (maxEntries: 2).

**PIN**: клієнтський замок, не шифрування (anon-ключ видимий у бандлі — користувач це знає і прийняв). Хеш у `app_settings.pin_hash`; розблокування запамʼятовується в localStorage `mm_unlock`.

## Точки конфігурації

1. `app/src/config.js` — 3 ключі фронтенду.
2. `app/vite.config.js` → `base` — назва GitHub-репо зі слешами.
3. `sender/.env` — 4 секрети (шаблон у `.env.example`).
4. Час розсилки — **тільки** в `morning-push.timer` (`OnCalendar`), у коді часу немає.
5. Кількість цитат — `QUOTES_PER_MORNING = (2, 3)` у `send_morning.py`.

## Залізні правила

1. **Ніколи не комітити** `sender/.env`, service_role ключ чи приватний VAPID (у `.gitignore`; anon-ключ і публічний VAPID — можна, вони і так публічні).
2. Змінюючи push payload, схему `daily_selections.quotes` або імʼя `TRACK_FILE` — оновлюй **усі** місця, що їх читають (перелічені вище), в одному коміті.
3. Після будь-яких змін у `app/` — прогнати `npm run build` (SW збирається окремим кроком і ловить свої помилки).
4. Дані живуть лише в Supabase. У localStorage — тільки `mm_unlock`. Не додавай браузерних сховищ для контенту.
5. Не чіпай дизайн-систему без запиту: палітра «небо перед світанком» (`--ink-sky #14182E`, `--sky-2 #232849`, `--mist-violet #3A2E55`, `--horizon #F4A259`, `--ray #F7D488`, `--mist #AEB4D6`, `--paper #F3EFE6`), шрифти Cormorant (цитати) + Golos Text (UI), фірмовий елемент — сонце-Play на лінії обрію.
6. Усі тексти інтерфейсу та повідомлень — українською.
7. Час — завжди `Europe/Warsaw` (фронт: `todayWarsaw()`, sender: `ZoneInfo`).

## Типові задачі

- **Змінити час розсилки**: правити `OnCalendar` у `/etc/systemd/system/morning-push.timer` → `daemon-reload` → `restart morning-push.timer`. Код не чіпати.
- **Додати отримувача**: нічого — людина відкриває URL, вводить PIN, вмикає сповіщення.
- **Змінити кількість цитат**: `QUOTES_PER_MORNING` у `send_morning.py`.
- **Нове поле цитати**: `schema.sql` (міграція) → `Quotes.jsx` (форма/список) → `pick_quotes()` (select + payload) → `sw.js` (рендер body) → `Today.jsx`/`History.jsx`.
- **Діагностика**: `journalctl -u morning-push.service`, `systemctl list-timers morning-push.timer`, `python send_morning.py --dry-run | --test`.

## Команди

```bash
cd app && npm install && npm run dev     # локальна розробка
cd app && npm run build                  # обовʼязкова перевірка перед комітом
cd sender && python send_morning.py --dry-run   # перегляд добірки без надсилання
```

## Відомі обмеження (не «баги»)

Автовідтворення музики зі сповіщення неможливе (політики Android/iOS) — потрібен один тап. Звук сповіщення — системний. На iPhone push працює лише після додавання на екран «Домівка» (iOS 16.4+). Затримки пушів на Samsung лікуються виключенням Chrome з оптимізації батареї.
