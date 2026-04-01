# 🐍 Gusanito.io — Multijugador en tiempo real

Juego de gusanos multijugador inspirado en slither.io, construido con **Node.js**, **Express** y **Socket.io**.

## 🚀 Instalación y uso

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor
npm start

# 3. Abrir en el navegador
http://localhost:3000
```

Para desarrollo con recarga automática:
```bash
npm run dev
```

## 🎮 Controles

| Control | Acción |
|---|---|
| **Mouse** | Dirección del gusano |
| **Flechas del teclado** | Dirección del gusano |
| **Click izquierdo / Espacio** | Turbo (boost) |
| **Touch (móvil)** | Dirección + turbo con tap |

## ⚙️ Tecnologías

- **Node.js + Express** — servidor HTTP
- **Socket.io** — comunicación en tiempo real (WebSocket)
- **Canvas API** — renderizado del juego en el cliente

## 🗂️ Estructura del proyecto

```
slither-game/
├── server.js          # Servidor + lógica del juego (backend)
├── package.json
└── public/
    ├── index.html     # UI: lobby, HUD, pantalla de muerte
    └── game.js        # Motor de renderizado + cliente Socket.io
```

## 🌐 Despliegue en producción

Puedes desplegar este proyecto en:
- **Railway** / **Render** / **Fly.io** — soportan WebSockets
- **Heroku** — con plan pago (soporte WebSocket)
- **VPS propio** — con `pm2 start server.js`

> ⚠️ **No uses Vercel/Netlify** para este proyecto — no soportan WebSockets persistentes.
