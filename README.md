# Casa 🏠

Dashboard de cocina pensado para revivir un **iPad mini de 1ª generación** (iOS 9.3.5 / Safari 9):
reloj grande, clima, temporizadores de cocina con alarma y radio por internet.

## Qué tiene

| Tarjeta | Detalle |
| --- | --- |
| **Reloj** | Hora gigante, fecha en español, saludo según la hora y chips con amanecer, atardecer, UV, lluvia y el temporizador en curso. |
| **Clima** | Open-Meteo (sin API key): temperatura, sensación, humedad y próximas 6 horas. El fondo cambia según el clima (día, noche, lluvia, tormenta…). Se refresca cada 10 min. |
| **Próximos días** | 5 días con barra de mínima/máxima y probabilidad de lluvia. |
| **Temporizador** | Botones grandes tipo microondas (+1, +3, +5, +10, +15, +30 min), hasta 3 temporizadores a la vez, pausa, y una alarma a pantalla completa con sonido de campana y botón "+1 min". Si sonaba la radio, se pausa y vuelve sola al detener la alarma. Sobrevive a recargas de la página. |
| **Radio** | Emisoras chilenas y de todo el mundo vía [radio-browser.info](https://www.radio-browser.info), favoritas con ★, búsqueda, y "qué está sonando" leyendo los metadatos ICY del stream. |
| **Modo noche** | Atenúa la pantalla de 23:00 a 07:00 (desactivable en Ajustes). |

## Estructura

```
index.html          una sola página
css/app.css         estilos (flexbox con prefijos; sin CSS Grid ni `gap`)
js/app.js           lógica del cliente en ES5 puro (Safari 9)
api/*.js            funciones serverless de Vercel (Node moderno)
  weather.js        clima recortado a lo que se muestra
  geocode.js        búsqueda de ciudades para Ajustes
  radio.js          lista de emisoras filtrada a MP3/AAC
  nowplaying.js     título de la canción (metadatos ICY)
  stream.js         relevo de audio para iOS 9 (HTTPS moderno y "audio/aacp")
  spotify/[action]  control remoto de Spotify Connect
sounds/             alarma y un silencio para "desbloquear" el audio en iOS
scripts/            generador de sonidos/íconos y servidor local
```

Todas las llamadas externas pasan por `/api` en el mismo dominio: el iPad solo habla con un servidor,
recibe JSON pequeño y la CDN de Vercel lo cachea.

## Desarrollo

```bash
npm run dev            # http://localhost:3000, usa las APIs reales
MOCK=1 npm run dev     # datos de ejemplo, sin internet
npx eslint js/app.js   # verifica que el cliente siga siendo ES5
```

## Publicar en Vercel

1. En [vercel.com/new](https://vercel.com/new) importa este repositorio.
2. Framework preset: **Other**. Sin comando de build. Listo: Vercel sirve los archivos estáticos y
   detecta las funciones de `api/` solas.

## Preparar el iPad

1. Abre la URL en Safari → **Compartir → Agregar a pantalla de inicio**. Abriéndola desde ese ícono queda en
   pantalla completa, sin barras de Safari.
2. **Ajustes → General → Bloqueo automático → Nunca**, para que no se apague (Safari 9 no puede mantener la
   pantalla encendida por sí solo).
3. Opcional: **Ajustes → General → Accesibilidad → Acceso guiado** para dejarla "bloqueada" en la app.
4. Toca la pantalla una vez después de abrirla: iOS solo permite sonido después de un toque, y con ese
   primer toque la alarma del temporizador ya puede sonar sola.
5. El volumen se controla con los botones físicos (iOS no deja cambiarlo desde una página web).

### Si Safari dice "No se puede verificar la identidad del servidor"

iOS 9 es anterior a algunos certificados raíz actuales (por ejemplo ISRG Root X1 de Let's Encrypt).
Si la página no carga por un error de certificado, en el iPad abre `http://x1.i.lencr.org/` (es HTTP a
propósito), instala el perfil que ofrece y vuelve a intentar.

## Spotify (control remoto)

El iPad no puede reproducir Spotify, pero sí controlarlo mientras suena en un celular, computador o
parlante con Spotify Connect: carátula, canción, play/pausa, siguiente, volumen y elegir dispositivo.
Si suena un temporizador, Spotify se pausa y vuelve al detener la alarma. Requiere **Spotify Premium**.

Configuración (desde un celular o computador): abre `/spotify.html` en la URL de la app y sigue los pasos.
Se necesitan tres variables de entorno en Vercel: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` y
`SPOTIFY_REFRESH_TOKEN` (esta última la entrega `/api/spotify/login` al terminar).

Todo pasa por `api/spotify/[action].js`: el iPad nunca habla directo con Spotify.
