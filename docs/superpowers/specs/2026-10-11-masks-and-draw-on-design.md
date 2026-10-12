# Máscaras e revelar traços (quadro branco)

Data: 2026-10-11 · Origem: `docs/ROADMAP.md` > "Próximos passos" item 5 e `docs/RESEARCH.md` (lacunas "Máscara" e "Desenhar-se / revelar").

## Objetivo

Duas peças independentes que, juntas, dão o visual de explicativo/quadro branco:

1. **Máscara:** uma forma recorta outro objeto (revelar um mapa por um círculo que cresce, foco/spotlight,
   texto saindo de trás de uma barra). A forma da máscara anima como qualquer ator.
2. **Desenhar-se:** formas e caminhos traçam o próprio contorno ao entrar (e a forma preenche depois), como
   VideoScribe/Doodly.

Fora do escopo (YAGNI): borda suave (feather) na máscara, máscara de imagem/luminância, máscara com várias
formas, máscara de máscara, revelar traços do lápis, texto "escrito à mão", mão desenhando, sons de caneta.

## Premissas confirmadas

- Máscara com **forma vetorial existente** (ator `kind: 'shape'`), sem novo tipo de objeto: herda keyframes,
  camadas, desfazer e timeline de graça.
- **Borda dura** (`ctx.clip`): barata, sem canvas fora da tela. Feather fica para depois, se houver demanda.
- Traços do lápis (`DrawingStroke`) são **quadro a quadro**, sem janela de tempo própria: não entram no
  "revelar". Quem se desenha são formas e caminhos, que já têm início, duração e transformação animada.
- Projetos antigos abrem sem mudança (campos novos opcionais; ausente = comportamento atual).

## Modelo de dados (`src/types.ts`)

**Máscara**
- `ActorOverlay.maskOnly?: boolean`: o ator é só um recorte. Não é desenhado no preview/exportação; o editor o
  mostra como contorno tracejado.
- `Animated.mask?: { actorId: string; mode: 'inside' | 'outside' }`: em qualquer objeto (texto, gráfico, ator,
  boneco). `inside` mantém só o que está dentro da forma; `outside` só o que está fora (o buraco).

**Revelar**
- `ShapeStyle.draw?: { frames: number }`: nos primeiros `frames` quadros do ator, o contorno se traça (início →
  fim do perímetro, `easeInOut`); depois o preenchimento aparece em `max(1, round(frames / 2))` quadros.
  Exige `strokeWidth > 0` (sem contorno, ignora). Em `line` a própria linha é traçada.
- `MotionPath.style.reveal` ganha `'draw'` e `MotionPath.style.drawFrames?: number` (padrão 24): o caminho se
  traça do primeiro ao último ponto nos primeiros `drawFrames` quadros do seu intervalo. As outras duas opções
  (`'full'`, `'follow'`) não mudam.

## Motor (puro e testado)

- `engine/mask.ts`
  - `resolveMask(target, actors, frame): ResolvedMask | null`: o ator da máscara existe, é `kind: 'shape'`, não é
    `line`, e está no intervalo (`isActorOnScreen`) → `{ shape, state, mode }`; caso contrário `null` (objeto
    desenhado sem recorte). Referência a si mesmo é ignorada. Opacidade do ator da máscara não conta.
  - `maskPath(shape, state): Vec2[][]` contornos em coordenadas de cena (retângulo com raio, elipse, seta), já com
    translate/rotate/scale/flipX do estado amostrado. Elipse e cantos arredondados em polígono denso (≥ 48 pontos).
- `engine/reveal.ts`
  - `drawProgress(startFrame, frames, frame): number` 0..1, `easeInOut`; `frames <= 0` ou inválido → 1 (sem
    efeito).
  - `shapeOutlineLength(shape, width, height): number` perímetro (retângulo com raio, elipse por Ramanujan,
    seta pela polilinha).
  - `fillAlpha(startFrame, frames, frame): number` 0..1 (depois do traço).
- Retime (`engine/retime.ts`): `shape.draw.frames` e `style.drawFrames` escalam com o fps (`round(x · k)`, mín. 1).
- Robustez: números inválidos viram "sem efeito"; `mask` com `mode` desconhecido é ignorado.

## Renderer (`src/utils/exportVideo.ts`)

**Máscara.** Cada desenhável de objeto ganha `mask: ResolvedMask | null`, resolvido junto da amostragem. No laço
final (depois da câmera, por objeto): `ctx.save(); [câmera]; clip(máscara); draw(); ctx.restore()`.
- `inside`: caminho da forma; `outside`: retângulo enorme + caminho, `clip('evenodd')`.
- O recorte vive no mesmo espaço da câmera do objeto (usa o parallax do alvo), então máscara e alvo andam juntos.
- Efeitos: o recorte vale para a composição final, então também corta sombra e glow. Documentado.
- Sem nenhuma máscara na cena o caminho de desenho é idêntico ao atual.
- Editor: `RenderOptions.showMasks` (só o palco, `FlashCanvas`) desenha o contorno tracejado dos atores
  `maskOnly`; preview e exportação nunca desenham.

**Revelar.** `drawActorBody`/`drawShape` recebem o progresso: contorno via `setLineDash([L, L])` e
`lineDashOffset = L · (1 − p)` com `L = perímetro · 1.02`; preenchimento com `globalAlpha · fillAlpha`. Caminhos
com `reveal: 'draw'` usam `polylineUpTo(sampler, drawProgress(...))`, como o modo `follow` já faz.

## UI

- Inspetor do ator (forma): "Usar como máscara" (checkbox `maskOnly`) e "Desenhar contorno (quadros)" (0 = desligado).
- `MotionInspector` (qualquer objeto): seção "Máscara" com seletor do ator-máscara (lista só `maskOnly`, mais
  "Nenhuma") e modo (dentro / fora). Um passo de desfazer por mudança.
- `PathInspector`: opção "Desenhar" no revelar, com campo de quadros.
- Excluir um ator-máscara limpa as referências `mask` que apontavam para ele (um único passo de desfazer).
- Todos os textos em `pt-BR.ts` e `en-US.ts` (`npm run i18n:scan` limpo).

## MCP e verificação

- Sem ferramenta nova: `replace_content` aceita os campos (como `modifiers` e `parallax`). Menos superfície.
- `describe_scene`: itens `maskOnly` marcados e `mask` do alvo listado (`{ actorId, mode }`).
- `lint_scene`: `mask-missing` (referência para ator inexistente/que não serve de máscara) e `mask-span` (a máscara
  não cobre todo o intervalo do alvo, que fica sem recorte fora dele).
- Docs: contrato no `ROADMAP.md`, trecho em `AUTOMATION.md`.

## Compatibilidade e persistência

- `.fmproj`: todos os campos são opcionais; arquivos antigos abrem iguais. Arquivo novo em versão antiga perde
  máscara e revelação sem quebrar (campos desconhecidos ignorados).
- Os objetos são passados adiante pelo `parseProject` (como `effects`/`modifiers`); a leitura no renderer tolera
  valores inválidos.

## Testes

- `mask.test.ts`: resolução (inexistente, não-forma, `line`, fora do intervalo, auto-referência), caminho com
  rotação/escala/flip, `outside`.
- `reveal.test.ts`: progresso e easing, `frames` inválido, perímetros conhecidos (retângulo 100×50 = 300 sem raio).
- Renderer (contexto espiado): máscara `inside`/`outside` chama `clip` com a ordem esperada, dentro da câmera e do
  parallax do alvo; save/restore balanceados; sem máscara = mesmas chamadas de hoje; `maskOnly` não é desenhado e
  aparece tracejado só com `showMasks`; contorno com dash/offset por quadro e preenchimento depois; caminho `draw`.
- Retime, serialização (ida e volta e projeto antigo), lint, describe, componentes de UI.
- Verificação manual no navegador: círculo que cresce revelando um mapa, spotlight com `outside`, máscara sob
  câmera com zoom e parallax, forma se desenhando, caminho se desenhando, exportar MP4 e comparar com o preview.

## Divisão em tarefas por complexidade

Uma tarefa por agente, em sequência (sem paralelismo entre implementadores), cada uma com revisão própria e
uma revisão final do branch inteiro. O modelo segue o risco, não o tamanho:

| # | Tarefa | Complexidade | Modelo |
|---|--------|--------------|--------|
| 1 | Tipos + `engine/mask.ts` + `engine/reveal.ts` + retime + testes | média: geometria e bordas, mas puro | padrão |
| 2 | Renderer: recorte da máscara (câmera, parallax, efeitos, `showMasks`) | **alta**: matrizes, `evenodd`, interação com camadas de efeito | mais capaz |
| 3 | Renderer: contorno que se traça + preenchimento + caminho `draw` | média | padrão |
| 4 | UI de revelar (inspetor de forma e de caminho) + i18n | baixa: campos e textos | econômico |
| 5 | UI de máscara (checkbox, seletor, limpeza ao excluir, ghost no palco) | média: toca `App.tsx` e histórico | padrão |
| 6 | Lint, `describe_scene`, docs e contrato | baixa | econômico |
| — | Revisão final do branch | alta | mais capaz |

Ordem: 1 → 2 → 3 → 4 → 5 → 6 → revisão final. A 2 e a 3 só dependem da 1; a 4 e a 5 dependem de renderer
funcionando para o ghost; a 6 fecha com tudo pronto.

## Riscos e decisões em aberto

- **Máscara fora do intervalo = sem recorte** (não "some o alvo"): é o modo seguro; o aviso `mask-span` pega o
  descuido. Se virar fonte de surpresa, trocamos por "alvo oculto".
- **Perímetro com raio de canto:** o dash usa um comprimento levemente maior (+2%), então o traço termina um pouco
  antes do fim do tempo; aceitável e sem salto visual.
- **Feather:** exigiria camada fora da tela (já existe a de efeitos) com `destination-in` e blur; decidir só se pedirem.
- **Desempenho:** `clip` por objeto mascarado é barato; medir só se uma cena real ficar lenta.
