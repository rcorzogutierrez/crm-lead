# Skills del proyecto

Claude Code carga automáticamente las skills de esta carpeta (también en los hilos en la nube).

| Skill | Origen | Licencia |
|---|---|---|
| `angular-developer` | [angular/skills](https://github.com/angular/skills) (generada desde `angular/angular`, commit `8ffc232bbf35188411a6511a3c038e29fa0fa2f7`, 2026-10-24) | MIT, © Google LLC |
| `firebase-firestore` | [firebase/agent-skills](https://github.com/firebase/agent-skills) (commit `92eed24c0976a79a66d5b8038e9eda8b441ef92d`, 2026-10-20) | Apache 2.0, © Google LLC (`LICENSE` en su carpeta) |
| `firebase-auth-basics` | [firebase/agent-skills](https://github.com/firebase/agent-skills) (commit `92eed24c0976a79a66d5b8038e9eda8b441ef92d`, 2026-10-20) | Apache 2.0, © Google LLC (`LICENSE` en su carpeta) |
| `firestore-rules-creation` | [firebase/agent-skills](https://github.com/firebase/agent-skills) (commit `92eed24c0976a79a66d5b8038e9eda8b441ef92d`, 2026-10-20) | Apache 2.0, © Google LLC (`LICENSE` en su carpeta) |
| `firebase-security-rules-auditor` | [firebase/agent-skills](https://github.com/firebase/agent-skills) (commit `92eed24c0976a79a66d5b8038e9eda8b441ef92d`, 2026-10-20) | Apache 2.0, © Google LLC (`LICENSE` en su carpeta) |
| `firebase-hosting-basics` | [firebase/agent-skills](https://github.com/firebase/agent-skills) (commit `92eed24c0976a79a66d5b8038e9eda8b441ef92d`, 2026-10-20) | Apache 2.0, © Google LLC (`LICENSE` en su carpeta) |
| `review-animations` | [emilkowalski/skills](https://github.com/emilkowalski/skills) (commit `2d228630ba1446365f614a108cb8252f1feda202`, 2026-10-11) | MIT, © Emil Kowalski (`LICENSE` en su carpeta) |
| `mobile-native` | [emilkowalski/skills](https://github.com/emilkowalski/skills) (commit `2d228630ba1446365f614a108cb8252f1feda202`, 2026-10-11) | MIT, © Emil Kowalski (`LICENSE` en su carpeta) |
| `break-ui` | [emilkowalski/skills](https://github.com/emilkowalski/skills) (commit `2d228630ba1446365f614a108cb8252f1feda202`, 2026-10-11) | MIT, © Emil Kowalski (`LICENSE` en su carpeta) |

Las convenciones de `CLAUDE.md` (Signal Forms, `@Service()`, sin Material, i18n propio, Firebase JS SDK sin `@angular/fire`, modelo de datos y reglas de acceso…) mandan sobre la guía general de las skills.

De Firebase solo se copian las skills que tocan este proyecto (Firestore, Auth, reglas, auditoría de reglas, Hosting). No se incluyen el servidor MCP ni el subagente `firestore-rules-author` del plugin (este usa herramientas de otro agente); sin él, las skills usan `firestore-rules-creation`. Un cambio en reglas sigue necesitando su caso en `tests/rules/`.

De Emil Kowalski solo se copian tres skills que no dependen de React: `review-animations` (revisión estricta de curvas, duraciones y `prefers-reduced-motion`), `mobile-native` (detalles para que la app se sienta nativa en el móvil) y `break-ui` (probar pantallas con datos extremos). El diseño general y la crítica visual siguen siendo de la skill **impeccable**: por eso no se incluyen `emil-design-eng` ni `animate`, y cuando estas skills remiten a ellas (o a Next.js, Framer Motion…), se aplica impeccable y el stack de `CLAUDE.md`. En `break-ui`, los datos extremos se siembran en los emuladores (`npm run start:emulator`) en vez de añadir un interruptor "Demo / Worst case" al código de la app.

Para actualizarlas, copiar de nuevo cada carpeta desde su repo oficial sin editarla a mano:

```bash
git clone --depth 1 https://github.com/angular/skills /tmp/angular-skills
rm -rf .claude/skills/angular-developer
cp -r /tmp/angular-skills/angular-developer .claude/skills/
```

```bash
git clone --depth 1 https://github.com/firebase/agent-skills /tmp/firebase-skills
for s in firebase-firestore firebase-auth-basics firestore-rules-creation firebase-security-rules-auditor firebase-hosting-basics; do
  rm -rf .claude/skills/$s && cp -r /tmp/firebase-skills/skills/$s .claude/skills/ && cp /tmp/firebase-skills/LICENSE .claude/skills/$s/
done
```

```bash
git clone --depth 1 https://github.com/emilkowalski/skills /tmp/emil-skills
for s in review-animations mobile-native break-ui; do
  rm -rf .claude/skills/$s && cp -r /tmp/emil-skills/skills/$s .claude/skills/ && cp /tmp/emil-skills/LICENSE .claude/skills/$s/
done
```
