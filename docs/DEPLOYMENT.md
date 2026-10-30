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

## 2. Google Cloud Run

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

### `Dockerfile`

```dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY package.json ./
RUN mkdir -p /data
EXPOSE 8787
CMD ["node", "--import", "tsx", "server/index.js"]
```

> Ескерту: production образінде `tsx` қажет, себебі сервер `shared/*.ts` файлдарын импорттайды.
> Балама: `tsc` арқылы серверді алдын ала жинау (келесі қадам ретінде ұсынылады).

---

## 3. Firebase Hosting (фронт) + Cloud Run (API)

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

## 4. Кәдімгі VPS (systemd + nginx)

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

## 5. GitHub

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

## 6. Өндіріс алдындағы тексеру тізімі

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
