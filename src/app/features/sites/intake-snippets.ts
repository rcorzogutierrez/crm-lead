/**
 * Código de ejemplo de la guía para conectar un sitio Astro (`/sites/guide`). Es código, no texto
 * de interfaz: no se traduce. Debe coincidir con `docs/astro-intake.md` y con lo que valida la
 * función (`functions/src/intake-core.ts`).
 */

export function astroConfig(): string {
  return `import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel'; // or @astrojs/netlify, @astrojs/cloudflare, @astrojs/node

export default defineConfig({
  adapter: vercel(),
  env: {
    schema: {
      CRM_INTAKE_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      TURNSTILE_SECRET: envField.string({ context: 'server', access: 'secret' }),
      PUBLIC_TURNSTILE_SITEKEY: envField.string({ context: 'client', access: 'public' }),
    },
  },
});`;
}

export function astroAction(endpoint: string): string {
  return `import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { CRM_INTAKE_TOKEN, TURNSTILE_SECRET } from 'astro:env/server';

const CRM_INTAKE_URL = '${endpoint}';

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
      website: z.string().default(''),   // honeypot
      startedAt: z.coerce.number(),      // ms when the page loaded
      submissionId: z.uuid(),            // avoids duplicates on resubmit
      'cf-turnstile-response': z.string(),
    }),
    handler: async (input, ctx) => {
      if (input.website || Date.now() - input.startedAt < 3000) return { ok: true };

      const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: input['cf-turnstile-response'],
          remoteip: ctx.clientAddress,
        }),
      }).then((r) => r.json());
      if (!check.success) throw new ActionError({ code: 'FORBIDDEN' });
      if (!input.email && !input.phone) throw new ActionError({ code: 'BAD_REQUEST' });

      const page = new URL(ctx.request.headers.get('referer') ?? ctx.url);
      const res = await fetch(CRM_INTAKE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: \`Bearer \${CRM_INTAKE_TOKEN}\`,
        },
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
      if (!res.ok) throw new ActionError({ code: 'INTERNAL_SERVER_ERROR' });
      return { ok: true };
    },
  }),
};`;
}

export function astroForm(): string {
  return `---
import { actions } from 'astro:actions';
import { PUBLIC_TURNSTILE_SITEKEY } from 'astro:env/client';
const result = Astro.getActionResult(actions.lead);
---
{result?.data?.ok && <p>Thanks! We'll call you shortly.</p>}
{result?.error && <p role="alert">Couldn't send it. Please try again.</p>}

<form method="POST" action={actions.lead} id="lead-form">
  <label>Name <input name="name" required maxlength="120" autocomplete="name" /></label>
  <label>Email <input name="email" type="email" maxlength="160" autocomplete="email" /></label>
  <label>Phone <input name="phone" type="tel" maxlength="40" autocomplete="tel" /></label>
  <label>Company <input name="company" maxlength="120" autocomplete="organization" /></label>
  <label>Interested in <input name="interest" maxlength="120" /></label>
  <label>Message <textarea name="message" maxlength="2000"></textarea></label>

  <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px" />
  <input type="hidden" name="startedAt" />
  <input type="hidden" name="submissionId" />

  <div class="cf-turnstile" data-sitekey={PUBLIC_TURNSTILE_SITEKEY}></div>
  <button type="submit">Send</button>
</form>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer is:inline></script>
<script>
  const form = document.getElementById('lead-form') as HTMLFormElement;
  form.startedAt.value = String(Date.now());
  form.submissionId.value = crypto.randomUUID();
</script>`;
}

export function curlTest(endpoint: string): string {
  return `curl -i ${endpoint} \\
  -H "content-type: application/json" \\
  -H "authorization: Bearer $CRM_INTAKE_TOKEN" \\
  -d '{"name":"Test Web","email":"test@example.com","message":"Hello"}'`;
}

export function requestBody(): string {
  return `{
  "submissionId": "3f1c…",      // optional, UUID
  "name": "María Gómez",         // required
  "email": "maria@example.com",  // email or phone required
  "phone": "+1 305 555 0101",
  "company": "", "interest": "Auto insurance", "message": "…",
  "page": "https://mysite.com/contact",
  "utmSource": "", "utmMedium": "", "utmCampaign": ""
}`;
}
