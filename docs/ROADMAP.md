# Roadmap: pequenas entregas

Cada tarefa é um commit (ou poucos), testado no navegador, na branch `claude/animation-project-analysis-qvgws3`.
Este arquivo é a memória do trabalho: status, decisões e contratos que a próxima tarefa precisa conhecer.

Base: `docs/RESEARCH.md`.

**Princípio: genérico primeiro.** Pedidos concretos ("avião pousando em países") são exemplos de uso.
Implementar a ferramenta genérica (caminho desenhado + objeto que segue) e montar o caso específico como
*modelo* em cima dela, sempre editável com as ferramentas normais.

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
- [x] T13 — Caminhos genéricos: ferramenta "Caminho" (pontilhado/tracejado/contínuo, guia invisível, revelar
  ao percorrer) + "Seguir caminho" para qualquer imagem (tempo, paradas, progresso por keyframe); rota no
  mapa refeita como modelo sobre essas peças
- [x] T14 — i18n pt-BR / en-US: seletor no topo direito, escolha salva no localStorage
- [x] T15 — CI (GitHub Actions): typecheck, testes, `i18n:scan` e build em todo PR e push na main
- [x] T16 — Áudio de referência: faixas de áudio (narração, música, efeito ou o som de um vídeo) com forma de
  onda na timeline, mover/cortar, volume/mudo, ouvir ao arrastar (scrub), mixadas no export
- [x] T17 — Timeline em segundos (ou quadros) com zoom: régua adaptativa, Ctrl+roda ancorado no cursor,
  botões de zoom/ajustar, a vista acompanha o cursor no play, rótulos dos clipes fixos à esquerda
- [x] T18 — Gráficos e textos no mesmo modelo de keyframes dos atores (posição, escala, rotação, opacidade,
  easing por key, seguir caminho, losangos na timeline); projetos antigos migrados (P1→P2 vira 2 keys)
- [x] T19 — Biblioteca de modelos (título, terço inferior, lista, número, gráfico, destaque com seta, rota no
  mapa) sobre as peças genéricas + entradas/saídas prontas (fade, slide, pop) aplicáveis a qualquer objeto
- [x] T20 — Formas editáveis (retângulo, elipse, seta, linha) como tipo de ator: cor, contorno, cantos e
  tamanho editáveis a qualquer momento; os modelos usam essas formas no lugar de imagens SVG
- [x] T21 — Marcadores na timeline: tecla M (inclusive tocando), nome/cor, arrastar, Shift+←/→, snap de clipes,
  keys, áudio e cursor (Alt solta) e marcadores automáticos onde o som do áudio recomeça depois de uma pausa
- [x] T22 — Trocar o FPS mantendo a duração em segundos: cena inteira reescalada num passo de desfazer
- [x] T23 — Boneco palito como ator: uma trilha de poses-chave (interpoladas osso a osso) + o mesmo transform
  animado dos atores (posição, escala, rotação, opacidade, seguir caminho), clipe e losangos na timeline;
  projetos antigos (uma cópia do boneco por frame) são convertidos ao abrir
- [x] T24 — Chave própria da IA (BYOK): colada no app, testada e guardada só no navegador; com ela o copiloto
  e as imagens falam direto com o Google (app instalado/site estático sem servidor); sem ela, usa o servidor
- [x] T25 — Girar no palco (alça redonda acima da seleção, para atores, formas, gráficos, textos e bonecos;
  Shift = 15°), espelhar pose do boneco e "Minhas poses" (salvas no navegador, valem em qualquer projeto)
- [x] T26 — "Minhas poses" vão junto no arquivo do projeto e entram na lista de quem abre o arquivo
- [x] T27 — Alças de escala nos cantos da seleção (qualquer objeto animado; Shift = passos de 5%)
- [x] T28 — Legendas a partir do roteiro (uma por linha, no tempo dos marcadores) + texto centralizado e com fundo
- [x] T29 — Legendas: importar .srt/.vtt (tempo exato do arquivo) e baixar as legendas do projeto em .srt

## Próximos passos sugeridos

1. (vazio — próximos passos a decidir depois dos testes manuais)

## Contratos / decisões (atualizar a cada tarefa)

- Legendas (`engine/captions.ts`): `scriptLines` (uma legenda por linha, vazias fora) e
  `captionSpans(lines, markerFrames, from, to)` (`to` exclusivo): a linha i começa no i-ésimo marcador em
  [from, to); linhas sem marcador dividem o resto (do último marcador usado até `to`) pelo tamanho, com piso
  de 18 caracteres (1,2 s de leitura); a última termina no próximo marcador livre ou em `to`. `captionTexts`
  cria um `TextOverlay` por trecho (`align: 'center'`, `bgColor` escuro, `fadeRise`, x no centro, y a 88%
  ou 12% da altura), com `durationFrames = fim − início − 1` porque o span de um objeto inclui o último
  frame. O diálogo (entrada especial "Legendas do roteiro" em Modelos › Títulos) vai do cursor até o fim do
  áudio; sem áudio, até o fim da timeline ou o tempo de leitura (`readingFrames`, 15 caracteres/s), o que
  for maior, e a timeline cresce se preciso. Cada legenda ganha uma camada; um passo de desfazer.
- Texto: `align` ('left' padrão | 'center') diz onde a âncora fica na linha (o `textBox` segue);
  `bgColor` desenha uma caixa arredondada medida com `measureText` atrás do texto. Os dois no inspetor.
- Arquivos de legenda (`engine/captions.ts`): `parseSubtitles(text, fps)` lê SRT e WebVTT (BOM, CRLF,
  números/ids, cabeçalho e NOTE do VTT, tempo sem hora, `,` ou `.` nos ms, configurações da cue, tags
  `<i>`/`<c.x>`/`{\an8}` fora; cue de várias linhas vira uma linha; cue sem tempo válido ou sem texto é
  ignorada). Tempo do arquivo conta do início do vídeo: t s → frame `1 + round(t·fps)`. `toSrt(spans, fps)`
  escreve o inverso (volta aos mesmos frames). Legendas do projeto = textos com `role: 'caption'`
  (`captionSpansOf`, fim = início + duração + 1); títulos e outros textos não entram no .srt.

- IA (`src/ai/`): `prompts.ts` (puro) monta instrução de sistema, conversa e partes da imagem e lê a imagem da
  resposta; usado pelo servidor e pelo navegador. `aiClient.ts`: com chave própria (`aiKey.ts`,
  `localStorage['flashmotion.geminiKey']`) chama o Google direto pelo SDK (`@google/genai`, import sob demanda,
  chunk separado) e nunca o servidor; sem chave, POST em `/api/gemini/*`. Problemas que o usuário resolve com
  uma chave viram `AiSetupError`: 'no-key' (servidor responde 503 `code: 'no-server-key'`), 'offline' (sem
  servidor: erro de rede, 404 ou resposta que não é JSON — site estático/app instalado), 'bad-key' (Google
  recusou: 401/403 ou mensagem de API key). Os diálogos mostram uma faixa com "Configurar chave".
  `AiKeyDialog` testa a chave (`models.list`, 1 item) antes de salvar.

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
- Objetos animados: `Animated` (`types.ts`) = intervalo + `base` + `tracks` + `smoothPath`/`orientToPath` +
  `follow`. `ActorOverlay`, `ChartOverlay` e `TextOverlay` estendem `Animated`; as funções de
  `engine/actor.ts` são genéricas (`<T extends Animated>`, devolvem o mesmo tipo). Âncora: centro da imagem
  (ator), centro do cartão (gráfico), início da linha de base (texto). O renderer aplica
  translate→rotate→scale→opacity e depois desenha o conteúdo; a "entrada" do gráfico/texto (crescer,
  máquina de escrever, contador) continua em `animationType`/`effect` + `easing`/`animDurationFrames`.
  Caixas locais para seleção/hit test: `chartBox`/`textBox` (`engine/overlays.ts`), `hitTestBox`.
  Criação: `createChart(conteúdo, centro)`, `createText(conteúdo, âncora)`. Arquivos antigos
  (`x`/`y`/`endX`/`endY`/`hasMotionTween`) passam por `migrateChart`/`migrateText` no `parseProject`.
  Inspector: `MotionInspector.tsx` (usado por atores, gráficos e textos); `attachToPath` liga qualquer um.
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
  interpola ângulo (arco curto) e comprimento por osso.
- Boneco como ator (`src/engine/stickActor.ts`, `StickActor extends Animated`): `joints` = pose de repouso,
  `poses: Track<StickPose>` = poses-chave (juntas locais, sem escala). Regra do cronômetro igual às outras
  propriedades (`setPose`: sem keys edita o repouso; com keys grava/atualiza o key no frame atual;
  `togglePoseTrack`/`togglePoseKey`). `samplePose` usa `interpolateStickPose` com o easing do key que abre o
  trecho ('hold' = segura a pose). O tamanho do boneco é a escala do transform (`base.scale`). Renderer desenha
  a figura local dentro do mesmo `withTransform` de gráficos/textos; sem camada própria segue a de desenhos.
  Camada `'group'` com `targetId` = id do boneco (`stickLayer`/`withStickLayers`). F6 grava a pose atual no
  próximo frame; Ctrl+B quebra o boneco (como está no frame, com rotação) em traços soltos
  (`stickToStrokes`). Migração (`migrateFrameSticks`, ao abrir projeto e nos exemplos): pose-chave onde a
  pose foi feita à mão e muda; trechos só com in-betweens do tween antigo viram easeInOut, o resto 'hold';
  posição/escala viram keys lineares só onde o movimento muda (`simplifySeries`, RDP em 0,5 px).
  UI: `StickPosePanel.tsx` (cronômetro, navegação, easing até a próxima pose, espelhar, Minhas poses, poses
  prontas) + `MotionInspector`. `mirrorPose` nega x e troca juntas l*/r* (como "colar pose espelhada"); a
  cabeça ganha `facing` (-1 = olho à esquerda), que troca no meio do trecho ao interpolar. "Minhas poses":
  `utils/userPoses.ts`, `localStorage['flashmotion.userPoses']`, aplicadas com `applyPose` (só juntas que o
  boneco tem). Salvar o projeto grava a lista em `project.poses` (fora do histórico, não entra no desfazer);
  abrir um arquivo chama `mergeUserPoses`: entram só nomes que o navegador ainda não tem (nunca sobrescreve
  nem duplica). Restaurar o autosave não importa poses (senão uma pose apagada voltaria).
- Alça de rotação (`FlashCanvas`): 26 px acima do meio da borda superior da caixa, em qualquer objeto animado
  selecionado; o ângulo é acumulado passo a passo (passa de meia volta sem pular) e grava pela regra do
  cronômetro (`setActorProperty('rotation')`); Shift arredonda para 15°.
- Alças de escala (`FlashCanvas`, `scaleHandlesLocal`): quadrados nos cantos da caixa; a escala é a do início
  × (distância do ponteiro à âncora ÷ distância no clique), mínimo 5%, pela regra do cronômetro; Shift arredonda
  para 5%. No gráfico, o canto inferior direito continua sendo o redimensionar (largura/altura, texto nítido).
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
  rasterizado 1× (WebP) e vira ator numa camada travada no fundo. `routeTemplate.ts` é só um *modelo*:
  cria um `MotionPath` pelos países (+ ponto de arco por trecho) e um ator com `follow`, parando só nos
  países (`stopAt`); acrescenta escala de "pouso" e rótulos.
- Caminhos (`src/engine/path.ts`, `MotionPath` em `types.ts`): pontos + curva/fechado + estilo; amostrado por
  comprimento de arco (memo por objeto). `ActorOverlay.follow = { pathId, progress: Track<number>, orient }`:
  posição vem do caminho (link vivo; editar o caminho muda o movimento). `buildFollowProgress` gera o tempo
  (paradas opcionais, tempo por trecho proporcional à distância). Keys de progresso aparecem na timeline como
  keys do ator. Excluir caminho desliga os seguidores. UI: ferramenta no palco (FlashCanvas),
  `PathInspector.tsx`, `ActorFollowPanel.tsx`.
- i18n (`src/i18n/`): `pt-BR.ts` é a fonte; `en-US.ts` é tipado contra ela (chave faltando = erro de tipo) e
  um teste compara os placeholders `{nome}`. `useI18n()` nos componentes; `t()` global fora do React
  (erros, nomes padrão). Idioma salvo em `localStorage['flashmotion.locale']`; 1ª visita segue o navegador;
  `<html lang>` acompanha. Conteúdo do vídeo (formato de números dos contadores, textos já criados) NÃO
  segue o idioma da interface. Nomes de países do mapa seguem. `npm run i18n:scan` lista textos fora do
  dicionário (sai com código 1 se houver). Para um novo idioma: criar o dicionário tipado e somar em `LOCALES`.
- Áudio (`AudioClip` em `types.ts`, snapshot `audio?`): arquivo embutido como data URL (projeto continua um
  arquivo só); vídeos e áudios > 8 MB são reconvertidos para Opus/WebM via mediabunny (`Conversion`).
  Tempo: `startFrame` (quadro) + `offset`/`duration` (segundos no arquivo). Toda a temporização passa por
  `clipPlayback(clip, fps, de, até)` em `src/engine/audio.ts` (playback, scrub e mixagem concordam).
  Runtime em `src/audio/audioRuntime.ts`: decodificação em cache por id+src (identidade), `playClips` agenda
  no AudioContext a partir do relógio do playback (performance.now continua mestre), `scrubClips` toca
  ~1 quadro com fade, `mixdown` renderiza o trecho exportado num OfflineAudioContext. Export: faixa de áudio
  opcional (AAC no MP4 quando o navegador codifica; senão Opus); WebM transparente começa sem áudio.
  Importar áudio estende a timeline para caber (nunca encolhe). UI: `components/AudioTracks.tsx`.
- Modelos (`src/templates/`): um modelo é uma função pura `build(valores, contexto) → { actors, charts,
  texts, paths, endFrame }`; nada na cena sabe que veio de um modelo. `params` descreve o formulário
  (text, lines, number, color, select) que o diálogo gera sozinho; textos padrão são chaves i18n. Posições em
  fração do canvas (funciona em 16:9, 9:16, quadrado). Ids com `idPrefix` único. Inserção no App: uma camada
  por objeto (textos na frente, imagens atrás), a partir do quadro atual; a timeline cresce se precisar.
  Prévia no diálogo = `renderCompositeFrame` em loop. Barras e setas dos modelos são atores-forma. Rota no
  mapa continua com diálogo próprio, aberto pela biblioteca.
- Formas (`engine/shapes.ts`): ator com `kind: 'shape'`, `src: ''` e `shape: ShapeStyle` (tipo, preenchimento,
  contorno, espessura, cantos). Por ser ator, herda keyframes, seguir caminho, presets, timeline e salvamento
  sem código novo. O renderer desenha vetor no lugar da imagem (`drawShape`), centrado na âncora; a linha vai
  de ponta a ponta da largura (a caixa tem no mínimo 16 px de altura para dar para clicar).
  `normalizeShape` repara formas lidas de arquivo. Inserção: botões no painel "Inserir".
- Entradas/saídas (`engine/motionPresets.ts`): `applyEntrance`/`applyExit(obj, preset, {frames, distance})`
  gravam keys comuns nas bordas do clipe (fade = opacidade; slides = opacidade + posição; pop = escala com
  `backOut`), a partir dos valores de repouso do objeto. Disponível no `MotionInspector` para qualquer objeto.
  Texto com `effect: 'none'` não tem entrada própria (só keyframes) — usado pelos modelos.
- Marcadores (`engine/markers.ts`, `HistorySnapshot.markers`): `{id, frame, label, color}`, ordenados, um por
  quadro. Snap: `snapFrame(f, alvos, limiar)` / `snapSpan(início, duração, …)` (a borda mais próxima ganha e o
  clipe mantém a duração); limiar = 8 px convertidos em quadros pela largura da timeline (só "puxa" quando o
  quadro é mais estreito que isso); alvos = marcadores + cursor nas edições, só marcadores no scrub; Alt
  desliga. Aplicado em clipes (mover/cortar), losangos, áudio e régua. `detectOnsets(peaks)` acha onde o som
  volta acima de 20% do pico depois de ≥ 0,25 s abaixo; `clipOnsetFrames` converte o trecho audível do clipe.
  A régua agora mapeia o clique para a célula sob o ponteiro (antes arredondava e caía um quadro antes).
- FPS (`engine/retime.ts`): `retimeScene(cena, total, deFps, paraFps)` reescala tudo que é medido em quadros
  para o mesmo instante (`retimeFrame(f, k) = round(1 + (f − 1)·k)`): intervalos (bordas reescaladas), keys
  (colisões ficam com o key mais tardio), progresso de "seguir caminho", `animDurationFrames`, caminhos,
  imagens, início dos clipes de áudio (o resto do áudio já é em segundos), marcadores, poses-chave dos bonecos,
  e reamostra os quadros desenhados. O snapshot guarda `timing {fps, totalFrames}` para o desfazer restaurar FPS e duração
  junto com a cena. Efeitos embutidos de texto/imagem (máquina de escrever, pop, pulso…) contam quadros de
  24 fps (`SceneContent.fps` → `effectRate`), então duram os mesmos segundos em qualquer FPS.
- Timeline: grade e régua por CSS (`frameGridStyle`), sem um elemento por quadro. Escala pura em
  `src/engine/timelineScale.ts`: `timelineScale(total, fps, pxPorQuadro, unidade)` escolhe passo das linhas
  fortes (rótulos ≥ 56 px) e fracas (≥ 6 px); em segundos usa tempos "redondos" (0,25 s, 1 s, 5 s, 1:00…) e,
  com zoom máximo, "1s" + "5f". Zoom = px por quadro (null = caber tudo), entre caber e 60 px/quadro;
  `scrollForZoom` mantém o quadro sob o cursor. A área da direita é um único scroll (régua `sticky`), com
  rolagem vertical sincronizada com a lista de camadas. Posições dentro dela continuam em % da largura do
  conteúdo; medidas de arrasto usam a largura da régua (`trackWidth()`). Unidade salva em
  `localStorage['flashmotion.timeUnit']` (padrão: segundos). Máx. 36.000 quadros.
