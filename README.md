# Agenda — CRM de leads y follow-up

CRM para un equipo pequeño: captura leads en segundos, revisa tu día como una página de agenda y deja cada contacto con su siguiente paso.

**Stack:** Angular 22 · Firebase (Auth + Firestore) · Tailwind CSS v4 · Lucide.

## Puesta en marcha

1. Node 22.22.3+ o 24.15+.
2. `npm install`
3. En la consola de Firebase (`crm-lead-follow-up`):
   - **Authentication → Sign-in method:** habilita **Google**.
   - **Authentication → Settings → Authorized domains:** agrega el dominio donde publiques la app.
   - **Firestore:** crea la base de datos y publica reglas e índices: `npm run deploy:rules`.
4. `npm start` y abre http://localhost:4200. **La primera cuenta que entra crea el equipo y queda como admin**; desde *Equipo* invita al resto por email.

## Desarrollo local sin tocar la nube

```bash
npm run emulators        # en una terminal
npm run start:emulator   # en otra
```

## Publicar

`npm run deploy` (build + Firebase Hosting + reglas).

Más detalle técnico en [CLAUDE.md](CLAUDE.md); producto en [PRODUCT.md](PRODUCT.md); diseño en [DESIGN.md](DESIGN.md).
