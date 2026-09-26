# Roadmap: pequenas entregas

Cada tarefa é um commit (ou poucos), testado no navegador, na branch `claude/animation-project-analysis-qvgws3`.
Este arquivo é a memória do trabalho: status, decisões e contratos que a próxima tarefa precisa conhecer.

Base: `docs/RESEARCH.md`.

## Status

- [x] T0 — Correção de bugs (drag, undo da timeline, export, upload de vídeo, camadas, gráficos)
- [x] T1 — Pesquisa + roadmap (este arquivo)
- [x] T2 — Infra de testes (Vitest) + testes dos utilitários existentes
- [x] T3 — Motor de keyframes (puro, testado): easing por keyframe, interpolação, spline de caminho, orientação
- [x] T4 — Ator: importar imagem local (botão + arrastar para o palco), renderizar, selecionar, mover
- [x] T5 — Auto-keyframe + inspector do ator + losangos de keyframe na timeline
- [x] T6 — Caminho de movimento visível, caminho suave/reto, orientar ao caminho
- [x] T7 — Boneco palito: FK (girar osso em volta do pai) + interpolar pose entre dois quadros
- [x] T8 — Salvar/abrir projeto (arquivo local) + autosave/recuperação
- [x] T9 — Diálogo de export: MP4, WebM transparente (VP9 alpha), trecho de quadros
- [x] T10 — PWA instalável (manifest, service worker, ícones, abrir .fmproj pelo sistema)
- [x] T11 — Template de mapa: mapa-múndi + rota por países gerando keyframes
- [x] T12 — PR

## Próximos passos sugeridos

1. Áudio de referência (narração/música) com forma de onda na timeline e mixado no export.
2. Migrar gráficos e textos para o mesmo modelo de keyframes dos atores (hoje usam "motion tween P1→P2").
3. Boneco palito como ator com trilhas de pose (em vez de uma cópia por frame) — reduz o projeto e o undo.
4. Timeline com zoom e tempo em segundos; desenhar a grade com CSS em vez de uma div por frame.
5. Biblioteca de ícones/veículos (carro, navio, pino) para o template de rota.
6. Chave própria da IA (BYOK) guardada localmente, para o app instalado funcionar sem o servidor.

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
- Ator (`ActorOverlay` em `types.ts`, lógica em `src/engine/actor.ts`): imagem como data URL, `base` + `tracks`
  (position/scale/rotation/opacity). Regra do cronômetro (AE): propriedade sem keys edita `base`; com keys,
  editar grava key no frame atual (`setActorProperty`). Cada ator tem camada própria (`type: 'actor'`,
  `targetId`). Mover o clipe na timeline desloca os keys (`shiftActorTime`); arrastar losango retima
  (`moveActorKeys`). Inspector: `ActorInspector.tsx`. Import: `utils/importImage.ts` (reduz > 2048 px).
- `renderCompositeFrame(ctx, w, h, frame, scene: SceneContent, options)`; `exportVideoSequence(scene, opts)`.
- Atalhos: usar `isTypingTarget` (`utils/keyboard.ts`) para decidir se a tecla é do campo ou do editor.
- Caminho no palco (ator selecionado, ≥ 2 keys de posição): linha tracejada, um ponto por frame (espaçamento
  = velocidade), quadrados nos keys arrastáveis sem mudar o frame atual. Se o clique cai na posição atual
  do ator, arrastar o ator tem prioridade (grava key no frame atual).
- Boneco (`src/engine/stickRig.ts`): hierarquia pelos ossos (`from` = pai; cabeça presa ao pescoço).
  Arrastar junta = FK (gira em volta do pai, cadeia acompanha); Alt = livre. `interpolateStickPose`
  interpola ângulo (arco curto) e comprimento por osso. `StickFigure.tweened` marca frames gerados
  (ponto na timeline); editar à mão vira pose-chave. UI: `StickAnimationPanel.tsx`.
- Projeto (`src/project/`): `.fmproj` = JSON versionado (`serializeProject`/`parseProject`, com defaults
  para campos novos). Vídeo de fundo não é embutido (só o nome, para avisar ao abrir). File System Access
  API quando existe (Ctrl+S sobrescreve o mesmo arquivo), senão download/input. Autosave em IndexedDB
  (1,5 s após mudar) + faixa "Restaurar/Descartar" ao iniciar. "Não salvo" = comparação por referência
  com o estado do último salvar/abrir (`savedMarker`).
- Export (`ExportDialog.tsx`): MP4 (fundo incluso) ou WebM VP9 com alpha (`RenderOptions.transparent`,
  mediabunny `alpha: 'keep'`), trecho de frames inclusivo. Nome do arquivo = nome do projeto.
- PWA (`vite.config.ts` + `PwaStatus.tsx`): `registerType: 'prompt'` (faixa "Nova versão" em vez de recarregar
  sozinho), botão "Instalar app", `file_handlers` para `.fmproj` consumido por `window.launchQueue` no App.
  Testar PWA só no build de produção: `npm run build && NODE_ENV=production npm start`.
- Mapa (`src/map/`): `worldMap.ts` carrega world-atlas 50m sob demanda (nomes pt via i18n-iso-countries),
  projeção Natural Earth (mundo ou enquadrar a rota), âncora = centróide do maior polígono. O mapa é
  rasterizado 1× (WebP) e vira ator numa camada travada no fundo. `routeTemplate.ts` gera keys de posição
  (pausa = 2 keys no mesmo ponto; arco = key no meio com easeIn/easeOut), escala de "pouso" e rótulos.
  Ator ganhou `trail` (rastro percorrido). Pausa mantém a direção de chegada (`travelAngle`).
