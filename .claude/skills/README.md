# Skills del proyecto

Claude Code carga automáticamente las skills de esta carpeta (también en los hilos en la nube).

| Skill | Origen | Licencia |
|---|---|---|
| `angular-developer` | [angular/skills](https://github.com/angular/skills) (generada desde `angular/angular`, commit `8ffc232bbf35188411a6511a3c038e29fa0fa2f7`, 2026-10-24) | MIT, © Google LLC |

Las convenciones de `CLAUDE.md` (Signal Forms, `@Service()`, sin Material, i18n propio…) mandan sobre la guía general de la skill.

Para actualizarla, copiar de nuevo la carpeta `angular-developer/` desde el repo oficial sin editarla a mano:

```bash
git clone --depth 1 https://github.com/angular/skills /tmp/angular-skills
rm -rf .claude/skills/angular-developer
cp -r /tmp/angular-skills/angular-developer .claude/skills/
```
