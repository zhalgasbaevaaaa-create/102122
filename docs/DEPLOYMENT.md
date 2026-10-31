# Орналастыру нұсқаулығы / Deployment guide

Қолданба — бір Node.js процесі (Express API + жиналған React клиенті) және бір SQLite файлы.
Бұл оны кез келген container/VM/Platform-as-a-Service ортасында қарапайым етіп орналастырады.

---

## 1. Жергілікті өндіріс сынағы

```bash
npm ci
npm run build          # dist/ пайда болады
SEED_ON_BOOT=on npm start
# → http://localhost:8787
```

Тексеру:

```bash
curl -s localhost:8787/api/health
# {"ok":true,...,"google":false,"bank":1616,...}
```

---

## 2. Render.com — тірі орналастыру (орындалды ✅)

**Тірі сайт:** **https://history-arena.onrender.com**

| Параметр | Мән |
|---|---|
| Service id | `srv-dbivmm2jnfac73boia90` |
| Аймақ / жоспар | frankfurt / free |
| Runtime | docker (`./Dockerfile`) |
| Auto-deploy | `main` тармағына әр push сайын |
| Health check | `/api/health` |

Келесі өзгерісті жіберу: `git push origin main` → Render өзі қайта құрастырады.

### ⚠️ Ашық шектеу: тұрақты диск

Тегін жоспарда **диск қосылмаған** (`POST /v1/disks` → «Payment information is required»),
сондықтан SQLite `/data` ішінде контейнермен бірге өмір сүреді. Салдары:

- әр жаңа деплойда дерекқор **нөлден** құрылады (`SEED_ON_BOOT=on` демо деректерді қайта жасайды);
- пайдаланушылар тіркейтін аккаунттар мен нәтижелер деплой арасында сақталмайды.

**Шешу жолдары (бірін таңдаңыз):**

1. **Диск қосу** — Render dashboard → Billing-ке карта тіркеу → осы сервиске 1 ГБ диск,
   mount path `/data`. Содан кейін деректер тұрақты болады. (`render.yaml` осыны күтеді.)
2. **Сыртқы Postgres** — `server/db.js` бір ғана жерде `better-sqlite3` қолданады;
   схема `docs/DATABASE.md`-де 1:1 берілген, Postgres-қа көшіру механикалық жұмыс.
3. Деректер маңызды болмаса (демо/көрсетілім) — қазіргі күйі жеткілікті.

> Демек: **функционал тұрғыдан сайт толық** (барлық 6 ойын, мультиплеер, 11 бет),
> бірақ тегін жоспарда дерекқор деплой сайын жаңарады.

---

## 3. Render.com — Blueprint арқылы (балама жол)

Репозиторийде `render.yaml` (Blueprint) дайын:

1. https://dashboard.render.com → **New → Blueprint** → осы репозиторийді таңдаңыз.
2. Render `render.yaml`-ды оқып, бір web service + 1 ГБ тұрақты диск жасайды → **Apply**.
3. 3–6 минуттан кейін сілтеме дайын: `https://history-arena-xxxx.onrender.com`
   (бұл домен **өзгермейді**, сандбокс сияқты өшіп қалмайды).

Не істелінеді:

| Параметр | Мән | Неге |
|---|---|---|
| `runtime` | `docker` | жобаның `Dockerfile`-ы қолданылады |
| `healthCheckPath` | `/api/health` | Render алдымен сервердің тірі екенін тексереді |
| `DATA_DIR` | `/data` | SQLite тұрақты дискіде жатады |
| `disk.mountPath` | `/data` | deploy сайын деректер сақталады |

> ⚠️ Тегін жоспарда сервис ~15 минут қозғалыссыз тұрса «ұйықтайды» — келесі ашылу
> 30–60 с алады (бұл — Render-дің шектеуі, қосымшаның қатесі емес). Деректер жоғалмайды.
> Толық тегін емес шешім қажет болса — Railway/Fly.io немесе төмендегі VPS нұсқасы.

**Fly.io / Railway** үшін де сол `Dockerfile` жарайды: айнымалылар
`PORT`, `DATA_DIR=/data`, `SEED_ON_BOOT` — үшеуін де орнатып, `/data` томын қосу жеткілікті.

---

## 4. Google Cloud Run

```bash
# 1) образды жинау (Dockerfile төменде)
gcloud builds submit --tag gcr.io/$PROJECT_ID/history-arena

# 3) орналастыру
gcloud run deploy history-arena \
  --image gcr.io/$PROJECT_ID/history-arena \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8787 \
  --memory 512Mi \
  --set-env-vars NODE_ENV=production,SEED_ON_BOOT=off,DATA_DIR=/data \
  --add-volume name=data,type=cloud-storage,bucket=YOUR-BUCKET \
  --add-volume-mount volume=data,mount-path=/data
```

> ⚠️ Cloud Run — эфемерлі контейнер. SQLite үшін **тұрақты том** (Cloud Storage FUSE немесе
> Filestore) қажет, әйтпесе деректер әр қайта іске қосылғанда жоғалады.
> Көп инстанция қажет болса — SQLite орнына Postgres/Cloud SQL-ға көшіңіз (схема 1:1).

### `Dockerfile` (репозиторийде дайын)

`Dockerfile` мен `.dockerignore` жобаның түбірінде бар — қайта жазу қажет емес:

```bash
docker build -t history-arena .
docker run -p 8787:8787 -v arena-data:/data history-arena
# → http://localhost:8787
```

Нені ескеру керек:

- **better-sqlite3** native модуль — build кезеңінде `python3 make g++` орнатылады;
  runtime кезеңіне тек дайын модульдер көшеді (екі сатылы образ).
- Runtime кезеңіне **`public/` да көшіріледі** — қаріптер (Lora) мен favicon сол жерде.
  Бұл жол бұрынғы құжаттағы нұсқада жетіспейтін (қаріптер 404 болар еді).
- `tsx` production тәуелділіктерде қалады, себебі сервер `shared/*.ts` файлдарын тікелей импорттайды.
- Контейнер `node` қолданушысымен (root емес) жұмыс істейді, `/data` соған тиесілі.
- `HEALTHCHECK` әр 30 с сайын `/api/health`-ты тексереді.
- /data томы — міндетті: онсыз дерекқор контейнермен бірге жойылады.

---

## 5. Firebase Hosting (фронт) + Cloud Run (API)

`firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "/api/**", "run": { "serviceId": "history-arena", "region": "europe-west1" } },
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

```bash
firebase login
firebase use YOUR_PROJECT
firebase deploy --only hosting
```

**Маңызды:** Firebase Hosting-тің rewrite-ы WebSocket-ты өткізбейді. Онлайн режим үшін
Cloud Run доменіне тікелей қосылу керек немесе `/ws` жолын nginx/Load Balancer арқылы
`Upgrade` тақырыбымен өткізу қажет.

---

## 6. Кәдімгі VPS (systemd + nginx)

```ini
# /etc/systemd/system/history-arena.service
[Unit]
Description=History Game Arena
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/history-arena
Environment=NODE_ENV=production PORT=8787 DATA_DIR=/var/lib/history-arena SEED_ON_BOOT=off
ExecStart=/usr/bin/node --import tsx server/index.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```nginx
server {
  listen 443 ssl http2;
  server_name tarih.example.kz;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  # WebSocket (онлайн мультиплеер) — Upgrade тақырыбын өткізу міндетті
  location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }

  location /assets/ {
    proxy_pass http://127.0.0.1:8787;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}
```

`X-Forwarded-Proto: https` тақырыбы маңызды — `Secure` cookie осыған байланысты.

---

## 7. GitHub

```bash
git init
git add .
git commit -m "feat: History Game Arena — Kazakhstan history platform"
git branch -M main
git remote add origin https://github.com/USER/history-arena.git
git push -u origin main
```

`.gitignore` қазірдің өзінде `node_modules/`, `dist/`, `data/`, `.env` файлдарын шығарады.
**`.env` файлын ешқашан commit етпеңіз.**

CI (GitHub Actions) үлгісі — `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - run: npm test -- --no-e2e
```

---

## 8. Өндіріс алдындағы тексеру тізімі

- [ ] `SEED_ON_BOOT=off` (демо аккаунттар жасалмауы үшін)
- [ ] Демо құпия сөздер өзгертілген (немесе дерекқор жаңадан құрылған)
- [ ] Reverse proxy `/ws` жолын `Upgrade` тақырыбымен өткізеді (онлайн мультиплеер)
- [ ] Көп инстанция болса: sticky session немесе Redis арқылы бөлме күйі
- [ ] HTTPS қосулы (cookie `Secure` болады)
- [ ] `DATA_DIR` тұрақты томда (резервтік көшірме жоспары бар)
- [ ] `npm test` — 112/112 PASS
- [ ] `npm run build` — қатесіз
- [ ] `data/arena.db` күнделікті backup (мысалы `sqlite3 arena.db ".backup /backup/arena-$(date +%F).db"`)
- [ ] Мониторинг: `/api/health` эндпоинтін uptime-мониторға қосу
