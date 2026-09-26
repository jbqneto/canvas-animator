# Roadmap: pequenas entregas

Cada tarefa é um commit (ou poucos), testado no navegador, na branch `claude/animation-project-analysis-qvgws3`.
Este arquivo é a memória do trabalho: status, decisões e contratos que a próxima tarefa precisa conhecer.

Base: `docs/RESEARCH.md`.

## Status

- [x] T0 — Correção de bugs (drag, undo da timeline, export, upload de vídeo, camadas, gráficos)
- [x] T1 — Pesquisa + roadmap (este arquivo)
- [x] T2 — Infra de testes (Vitest) + testes dos utilitários existentes
- [x] T3 — Motor de keyframes (puro, testado): easing por keyframe, interpolação, spline de caminho, orientação
- [ ] T4 — Ator: importar imagem local (botão + arrastar para o palco), renderizar, selecionar, mover
- [ ] T5 — Auto-keyframe + inspector do ator + losangos de keyframe na timeline
- [ ] T6 — Caminho de movimento visível, caminho suave/reto, orientar ao caminho
- [ ] T7 — Boneco palito: FK (girar osso em volta do pai) + interpolar pose entre dois quadros
- [ ] T8 — Salvar/abrir projeto (arquivo local) + autosave/recuperação
- [ ] T9 — Diálogo de export: MP4, WebM transparente (VP9 alpha), trecho de quadros
- [ ] T10 — PWA instalável (manifest, service worker, ícones, abrir .fmproj pelo sistema)
- [ ] T11 — Template de mapa: mapa-múndi + rota por países gerando keyframes
- [ ] T12 — PR

## Contratos / decisões (atualizar a cada tarefa)

- Renderer: `renderCompositeFrame` em `src/utils/exportVideo.ts` é a única função de desenho (preview e export).
  Ordem de desenho = ordem das camadas (`resolveObjectLayer`).
- Histórico: `useHistory` guarda `HistorySnapshot`; arrasto usa `updatePresent` (transiente) + `commitAction`.
  Listeners de janela devem ler `getCurrentSnapshot()`, nunca props capturadas.
- Tempo: quadros começam em 1. `videoTimeForFrame(frame, fps, duration)`.
- Export: WebCodecs via mediabunny (lazy import), timestamps explícitos.
- Keyframes (`src/engine/keyframes.ts`): `Track<T> = Keyframe<T>[]` ordenado; easing do key vale para o
  segmento que COMEÇA nele; clamp antes/depois. `sampleTrack(track, frame, fallback)`,
  `samplePosition(track, frame, fallback, smooth)` → `{x, y, angle}` (Catmull-Rom centrípeta, velocidade
  constante por comprimento de arco), `pathPolyline` para desenhar a guia. Novos keys usam `DEFAULT_EASING`.
