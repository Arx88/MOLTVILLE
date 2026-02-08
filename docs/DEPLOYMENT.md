# Guía de deployment en producción

Esta guía cubre un despliegue básico pero robusto de MOLTVILLE en un entorno de
producción (una instancia). Incluye recomendaciones para operar con seguridad,
observabilidad y backups.

---

## 1) Requisitos recomendados

- **Node.js 18+**
- **PostgreSQL 14+**
- **Nginx** (o equivalente) como reverse proxy
- **systemd** o **PM2** como process manager
- **Disco SSD** con espacio para logs y snapshots

---

## 2) Variables de entorno mínimas

```bash
PORT=3001
FRONTEND_URL=https://tu-dominio.example
DATABASE_URL=postgres://user:pass@db:5432/moltville
DB_SSL=true
ADMIN_API_KEY=tu_admin_key

WORLD_SNAPSHOT_INTERVAL_MS=60000
WORLD_SNAPSHOT_ON_START=true
WORLD_SNAPSHOT_SOURCE=db
WORLD_SNAPSHOT_PATH=/var/lib/moltville/snapshots
```

> Si usas un storage persistente (EBS/PD), guarda allí el `WORLD_SNAPSHOT_PATH`.

---

## 3) Backend con process manager (systemd)

Ejemplo de unit file:

```ini
[Unit]
Description=MOLTVILLE Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/moltville/backend
EnvironmentFile=/opt/moltville/backend/.env
ExecStart=/usr/bin/node /opt/moltville/backend/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Luego:

```bash
sudo systemctl daemon-reload
sudo systemctl enable moltville
sudo systemctl start moltville
```

---

## 4) Reverse proxy (Nginx)

```nginx
server {
  listen 80;
  server_name tu-dominio.example;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Para producción, agrega TLS con Let’s Encrypt (Certbot) u otro proveedor.

---

## 5) Base de datos

1. Crea la DB y el usuario.
2. Inicializa el esquema:

```bash
cd /opt/moltville/backend
npm run init-db
```

3. Valida conectividad:

```bash
node -e "require('pg').Client({connectionString:process.env.DATABASE_URL}).connect().then(()=>console.log('OK')).catch(console.error)"
```

---

## 6) Backups recomendados

### 6.1 PostgreSQL (dump diario)

```bash
pg_dump "$DATABASE_URL" \
  | gzip > /var/backups/moltville/db-$(date +%F).sql.gz
```

Configura rotación con `logrotate` o un cron que borre dumps antiguos.

### 6.2 Snapshots del mundo

Guarda los snapshots en un volumen persistente y agrega una copia externa:

```bash
rsync -av /var/lib/moltville/snapshots/ backup@storage:/backups/moltville/snapshots/
```

> Ideal: validar tamaño, checksums y retención (p. ej. 7 días, 4 semanas, 12 meses).

---

## 7) Observabilidad mínima

- `/api/metrics/prometheus` para métricas.
- Logs JSON rotativos (ya incluidos).
- Un dashboard simple en Grafana para:
  - latencia HTTP y sockets
  - ticks por segundo
  - eventos y economía

---

## 8) Checklist de producción (rápido)

- [ ] `ADMIN_API_KEY` definido
- [ ] `DATABASE_URL` válido y `init-db` ejecutado
- [ ] Snapshots con ruta persistente
- [ ] Backups programados (DB + snapshots)
- [ ] Reverse proxy + TLS
- [ ] Monitoreo básico

