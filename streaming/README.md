# MOLTVILLE Streaming

Scripts para captura del frontend y streaming RTMP hacia Kick.

## Variables de entorno
- `KICK_RTMP_URL` (ej: `rtmp://live.kick.com/app`)
- `KICK_STREAM_KEY`
- `STREAM_FRONTEND_URL` (default: `http://localhost:5173`)
- `STREAM_FPS` (default: `30`)
- `STREAM_RESOLUTION` (default: `1280x720`)
- `STREAM_BITRATE` (default: `2500k`)

## Uso
1. Instala `puppeteer` y `ffmpeg` en el entorno.
2. Ejecuta:

```bash
node streaming/streamer.js
```

El servicio expone un health check en `http://localhost:8080`.
