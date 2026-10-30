# Дерекқор құрылымы / Database structure

Runtime: **SQLite 3** (`better-sqlite3`, WAL mode, foreign keys ON).
Файл: `DATA_DIR/arena.db` (әдепкі `./data/arena.db`).

Схема Firebase **Cloud Firestore** коллекцияларымен 1:1 сәйкес келеді — төмендегі әр кестенің
жанында сәйкес коллекция атауы берілген.

---

## 1. Кестелер

### `users` → Firestore `users/{uid}`
| Баған | Тип | Сипаттама |
|---|---|---|
| `id` | TEXT PK | UUID (Firestore-да — auth uid) |
| `google_sub` | TEXT UNIQUE | **legacy** — енді қолданылмайды (Google кіру алынып тасталды), схема үйлесімділігі үшін қалды |
| `email` | TEXT | бірегей емес, бірақ қолданбада бірегей тексеріледі |
| `name`, `picture` | TEXT | профиль |
| `role` | TEXT | `student` \| `teacher` \| `admin` |
| `group_name`, `school` | TEXT | оқушы метадеректері |
| `xp`, `total_score`, `correct`, `wrong`, `streak_best`, `play_seconds`, `sessions_count` | INTEGER | агрегаттар (тез рейтинг үшін денормализация) |
| `created_at`, `last_activity` | TEXT ISO | |
| `disabled` | INTEGER | 0/1 — бұғаттау |

### `credentials` → Firestore `users/{uid}/private/credentials`
| Баған | Сипаттама |
|---|---|
| `user_id` | PK, FK → users |
| `password_hash` | scrypt нәтижесі (hex, 64 байт) |
| `salt` | 32-байт кездейсоқ (hex) |
| `algo` | `scrypt$16384$8$1` |

> Firestore-ға көшкенде бұл коллекция **клиентке оқуға жабық** болуы керек (security rules).

### `sessions_auth` → Firestore `authSessions/{tokenHash}`
| Баған | Сипаттама |
|---|---|
| `token_hash` | PK — токеннің SHA-256 хеші (шикі токен сақталмайды) |
| `user_id` | FK → users, ON DELETE CASCADE |
| `created_at`, `expires_at` | 14 күн |
| `user_agent` | тексеру үшін |

### `game_sessions` → Firestore `game_sessions/{id}`
| Баған | Сипаттама |
|---|---|
| `id` | UUID PK |
| `user_id` | FK → users |
| `game_id` | `adventure` \| `strategy` \| `defense` \| `race` \| `puzzle` \| `battle` |
| `level` | 1–10 |
| `difficulty` | `easy` \| `medium` \| `hard` (ұпай коэффициенті) |
| `mode` | `solo` \| `duo` \| `quad` \| `team` \| `online` |
| `question_ids` | JSON массиві — сұрақ таңдауы **серверде** бекітіледі |
| `answers` | JSON `[{qid, correct, ms}]` |
| `current_index`, `correct_count`, `wrong_count`, `streak_best` | прогресс |
| `base_score` | ойын механикасынан келген, шектелген ұпай |
| `score`, `xp` | **серверде есептелген** қорытынды |
| `status` | `active` \| `completed` \| `abandoned` |
| `started_at`, `finished_at`, `duration_seconds` | |

### `student_results` → Firestore `student_results/{id}`
Бір сессияға бір жазба (`session_id UNIQUE`) — қайталап ұпай жинауға жол бермейді.
`score`, `xp`, `correct`, `wrong`, `accuracy`, `duration_seconds`, `created_at`.

### `achievements_unlocked` → Firestore `users/{uid}/achievements/{achievementId}`
`user_id` + `achievement_id` (композиттік PK), `unlocked_at`.

### `question_stats` → Firestore `question_stats/{questionId}`
`attempts`, `correct` — оқытушы панеліндегі «қиын сұрақтар» есебі үшін.

### `answer_log` → Firestore `answer_log/{autoId}`
Толық аудит: `session_id`, `user_id`, `question_id`, `correct`, `answer` (JSON, 500 таңбаға дейін), `created_at`.

### `security_log` → Firestore `security_log/{autoId}`
`event` (`login`, `failed_login`, `register`, `google_login`, `oauth_error`, `oauth_state_mismatch`,
`rbac_denied`, `rate_limit`, `role_change`, `user_disabled`, `question_created`, `settings_updated`),
`detail`, `ip`, `created_at`.

### `app_settings` → Firestore `app_settings/{key}`
`key`/`value`: `registration`, `daily_challenge`, `weekly_challenge`, `leaderboard_public`,
`questions_per_level`.

### `custom_questions` → Firestore `custom_questions/{id}`
Әкімші қосқан сұрақтар: `category`, `difficulty`, `format`, `prompt`, `options` (JSON),
`answer_key` (JSON), `explanation`, `source_id`, `created_by`, `active`.

---

## 2. Индекстер

```sql
CREATE INDEX idx_sessions_user  ON game_sessions(user_id, status);
CREATE INDEX idx_results_game   ON student_results(game_id, score DESC);
CREATE INDEX idx_users_score    ON users(total_score DESC);
```
Firestore баламасы: `game_sessions(user_id, status)`, `student_results(game_id, score DESC)`,
`users(xp DESC)` композиттік индекстері.

---

## 2.1. Онлайн матч (WebSocket) жазбалары

Онлайн сайыста әр адам ойыншыға **жеке** `game_sessions` жазбасы ашылады
(`mode='online'`, `game_id='battle'`), содан кейін ол `finalizeSession()` арқылы аяқталады —
яғни жергілікті режиммен бірдей валидациядан өтеді. Бот орындары дерекқорға жазылмайды.

- Бөлме күйі (seats, feed, deadline) **жадыда** (`server/multiplayer.js`), дерекқорда емес.
- Әр жауап `answer_log` және `question_stats` кестелеріне түседі — оқытушы панеліндегі
  «қиын сұрақтар» есебі онлайн ойындарды да қамтиды.
- Матч үзілсе (барлық ойыншы ажыраса), жазба `status='abandoned'` болып белгіленеді — жетім
  сессия қалмайды.

## 3. Ұпай есептеу (серверде)

```
mult           = {easy: 0.8, medium: 1.0, hard: 1.3}[difficulty]
answerScore    = correct × 100 × mult + bestStreak × 15
gameplayScore  = min(clientBaseScore, questions × 120) × 0.5
completionBonus= (answered == total) ? 60 : 0
score          = round(answerScore + gameplayScore + completionBonus)

xp = min(2000, round(score/10 + correct×5 + bestStreak×2))
```

Клиент ешқашан қорытынды ұпайды өзі есептемейді; `baseScore` — тек шектелген кіріс параметрі.

---

## 4. Firestore-қа миграция

1. `users` → `users/{uid}`; `credentials` → жабық субколлекция (немесе Firebase Auth-қа көшу).
2. `sessions_auth` → `authSessions/{sha256(token)}` немесе Firebase session cookies.
3. `game_sessions` / `student_results` — тікелей көшіру (әр құжатқа `id`).
4. Агрегаттар (`users.xp` т.б.) — Cloud Function триггерімен `student_results` жазылғанда жаңарту.
5. **Security rules (эскиз):**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isAdmin()   { return request.auth != null && get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role == 'admin'; }
    function isTeacher() { return isAdmin() || (request.auth != null && get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role == 'teacher'); }

    match /users/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || isTeacher());
      allow update: if isAdmin();                    // оқушы өз xp/score-ын өзгерте алмайды
      match /achievements/{aid} { allow read: if request.auth != null && request.auth.uid == uid; allow write: if false; }
      match /private/{doc} { allow read, write: if false; }
    }
    match /game_sessions/{sid} {
      allow read: if request.auth != null && resource.data.user_id == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.user_id == request.auth.uid;
      allow update, delete: if false;                // тек Cloud Function
    }
    match /student_results/{rid} { allow read: if request.auth != null; allow write: if false; }
    match /question_stats/{qid} { allow read: if isTeacher(); allow write: if false; }
    match /security_log/{lid}   { allow read: if isAdmin();  allow write: if false; }
    match /app_settings/{k}     { allow read: if true; allow write: if isAdmin(); }
    match /custom_questions/{q} { allow read: if request.auth != null; allow write: if isAdmin(); }
  }
}
```

> Ескерту: бұл — жобамен бірге берілетін **эскиз**. Firestore-ға көшірсеңіз, оны emulator-де
> тексермейінше «жұмыс істейді» деп есептемеңіз.
