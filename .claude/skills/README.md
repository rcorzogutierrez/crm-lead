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

Las convenciones de `CLAUDE.md` (Signal Forms, `@Service()`, sin Material, i18n propio, Firebase JS SDK sin `@angular/fire`, modelo de datos y reglas de acceso…) mandan sobre la guía general de las skills.

De Firebase solo se copian las skills que tocan este proyecto (Firestore, Auth, reglas, auditoría de reglas, Hosting). No se incluyen el servidor MCP ni el subagente `firestore-rules-author` del plugin (este usa herramientas de otro agente); sin él, las skills usan `firestore-rules-creation`. Un cambio en reglas sigue necesitando su caso en `tests/rules/`.

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
