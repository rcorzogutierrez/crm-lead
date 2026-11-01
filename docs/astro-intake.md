# Conectar un sitio Astro con CRM Lead

Cada formulario que envía el sitio entra en el CRM como **negocio nuevo** de la empresa dueña de la
clave (origen *Web*), con la próxima acción "Llamar" para ahora. Si el contacto ya existe (mismo email
o teléfono), se cuelga de él; si además ya tiene un negocio abierto con ese vendedor, se añade una nota
y la llamada a ese negocio en vez de abrir otro.

## 1. Crear la clave en el CRM

Un admin de la empresa entra en **Ajustes → Sitios web → Conectar un sitio**, pone el nombre del sitio
y quién recibe sus negocios, y pulsa *Crear clave*. La clave (`<empresa>.<clave>.<secreto>`) se muestra
**una sola vez**: cópiala. En el CRM solo queda su hash. Si se pierde o se filtra, crea otra y desactiva
la anterior.

## 2. Variables del sitio

| Variable | De dónde sale | Tipo |
| --- | --- | --- |
| `CRM_INTAKE_TOKEN` | La clave del paso 1 | Secreta, solo servidor |
| `TURNSTILE_SECRET` | Cloudflare → Turnstile → el widget del dominio | Secreta, solo servidor |
| `PUBLIC_TURNSTILE_SITEKEY` | Cloudflare → Turnstile → el mismo widget | Pública |

Se ponen en el hosting del sitio (Vercel, Netlify, Cloudflare…) y en `.env` para desarrollo. **Nunca**
en el código ni en el HTML: con la clave cualquiera podría crear negocios.

## 3. `astro.config.mjs`

El sitio necesita un adaptador de servidor para que la Action corra en el servidor (las páginas pueden
seguir siendo estáticas).

```js
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel'; // o @astrojs/netlify, @astrojs/cloudflare, @astrojs/node

export default defineConfig({
  adapter: vercel(),
  env: {
    schema: {
      CRM_INTAKE_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      TURNSTILE_SECRET: envField.string({ context: 'server', access: 'secret' }),
      PUBLIC_TURNSTILE_SITEKEY: envField.string({ context: 'client', access: 'public' }),
    },
  },
});
```

Si el sitio define `security.csp`, permite `https://challenges.cloudflare.com` en `script-src` y
`frame-src` (Turnstile).

## 4. `src/actions/index.ts`

```ts
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { CRM_INTAKE_TOKEN, TURNSTILE_SECRET } from 'astro:env/server';

const CRM_INTAKE_URL = 'https://crm-lead-follow-up.web.app/api/intake';

export const server = {
  lead: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.union([z.email().max(160), z.literal('')]).default(''),
      phone: z.string().trim().max(40).default(''),
      company: z.string().trim().max(120).default(''),
      interest: z.string().trim().max(120).default(''),
      message: z.string().trim().max(2000).default(''),
      website: z.string().default(''), // campo trampa: un humano lo deja vacío
      startedAt: z.coerce.number(), // ms al cargar la página
      submissionId: z.uuid(), // evita duplicados si se reenvía
      'cf-turnstile-response': z.string(),
    }),
    handler: async (input, ctx) => {
      // Bots: fingimos éxito para no darles pistas.
      if (input.website || Date.now() - input.startedAt < 3000) return { ok: true };

      const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: input['cf-turnstile-response'],
          remoteip: ctx.clientAddress,
        }),
      }).then((r) => r.json());
      if (!check.success) throw new ActionError({ code: 'FORBIDDEN', message: 'Verificación fallida' });

      if (!input.email && !input.phone) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Deja un email o un teléfono' });
      }

      const page = new URL(ctx.request.headers.get('referer') ?? ctx.url);
      const res = await fetch(CRM_INTAKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${CRM_INTAKE_TOKEN}` },
        body: JSON.stringify({
          submissionId: input.submissionId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          company: input.company,
          interest: input.interest,
          message: input.message,
          page: page.origin + page.pathname,
          utmSource: page.searchParams.get('utm_source') ?? '',
          utmMedium: page.searchParams.get('utm_medium') ?? '',
          utmCampaign: page.searchParams.get('utm_campaign') ?? '',
        }),
      });
      if (!res.ok) throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo enviar' });
      return { ok: true };
    },
  }),
};
```

## 5. El formulario (`.astro`)

```astro
---
import { actions } from 'astro:actions';
import { PUBLIC_TURNSTILE_SITEKEY } from 'astro:env/client';
const result = Astro.getActionResult(actions.lead);
---
{result?.data?.ok && <p>¡Gracias! Te llamamos en breve.</p>}
{result?.error && <p role="alert">No se pudo enviar. Inténtalo otra vez.</p>}

<form method="POST" action={actions.lead} id="lead-form">
  <label>Nombre <input name="name" required maxlength="120" autocomplete="name" /></label>
  <label>Email <input name="email" type="email" maxlength="160" autocomplete="email" /></label>
  <label>Teléfono <input name="phone" type="tel" maxlength="40" autocomplete="tel" /></label>
  <label>Empresa <input name="company" maxlength="120" autocomplete="organization" /></label>
  <label>¿Qué te interesa? <input name="interest" maxlength="120" /></label>
  <label>Mensaje <textarea name="message" maxlength="2000"></textarea></label>

  <!-- Campo trampa: oculto para personas, los bots lo rellenan. -->
  <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px" />
  <input type="hidden" name="startedAt" />
  <input type="hidden" name="submissionId" />

  <div class="cf-turnstile" data-sitekey={PUBLIC_TURNSTILE_SITEKEY}></div>
  <button type="submit">Enviar</button>
</form>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer is:inline></script>
<script>
  const form = document.getElementById('lead-form') as HTMLFormElement;
  form.startedAt.value = String(Date.now());
  form.submissionId.value = crypto.randomUUID();
</script>
```

## Respuestas del CRM

| Código | Significa |
| --- | --- |
| `201` | Negocio creado (`{ ok, id, leadId }`) |
| `200` | Ese `submissionId` ya había llegado; no se duplica |
| `400` | Falta o sobra algo: `error` dice qué campo (`invalid:email`, `invalid:contact`…) |
| `401` | Clave incorrecta, desactivada o empresa suspendida |
| `429` | Más de 30 envíos por minuto con esa clave |

Límites: nombre 2–120, email 160, teléfono 40, empresa e interés 120, mensaje 2000, página 300 y cada
`utm*` 100 caracteres. Se necesita email o teléfono.

## Probar desde la terminal

```bash
curl -i https://crm-lead-follow-up.web.app/api/intake \
  -H "content-type: application/json" \
  -H "authorization: Bearer $CRM_INTAKE_TOKEN" \
  -d '{"name":"Prueba Web","email":"prueba@ejemplo.com","message":"Hola"}'
```

El negocio aparece en *Hoy* del responsable. Bórralo después desde su ficha.
