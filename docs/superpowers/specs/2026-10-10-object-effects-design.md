# Efeitos por objeto: sombra, glow, desfoque e tint

Data: 2026-10-10 · Origem: `docs/ROADMAP.md` > "Próximos passos" item 1 e `docs/RESEARCH.md` (recomendação 1).

## Objetivo

Dar a qualquer objeto animado (ator imagem/forma, texto, gráfico, boneco) quatro efeitos: **sombra**, **glow**,
**desfoque** e **tint** (cor de sobreposição). Os parâmetros numéricos são animáveis pelo mesmo modelo de
keyframes das outras propriedades (regra do cronômetro, easing por key, losangos na timeline).

Para quê: legenda e título legíveis sobre qualquer fundo de vídeo, destaque visual, entradas tipo
"desfoque 12 → 0".

Fora do escopo desta entrega (YAGNI): lista ordenada/repetível de efeitos, brilho/contraste/saturação, cor
animada, efeitos em camada de ajuste ou na cena inteira, novos modelos/templates que usem efeitos.

## Premissas confirmadas

- Escopo: exatamente os 4 efeitos acima (decidido em 2026-10-10).
- Modelo de dados: **slots fixos**, um por efeito, não uma lista de instâncias.
- Desenho: **canvas fora da tela** só para objetos com efeito ativo.
- Projetos antigos abrem sem mudança (efeitos ausentes = tudo desligado).

## Modelo de dados

Parâmetros numéricos (animáveis) e cores (estáticas, por objeto):

| Efeito  | Numéricos (propriedade → padrão) | Estáticos |
|---------|----------------------------------|-----------|
| Sombra  | `shadowOpacity` 0, `shadowBlur` 8, `shadowX` 0, `shadowY` 4 | `shadowColor` `#000000` |
| Glow    | `glowRadius` 0, `glowStrength` 1 | `glowColor` `#ffffff` |
| Desfoque| `blur` 0 | n/a |
| Tint    | `tintAmount` 0 | `tintColor` `#ff0000` |

Um efeito está **desligado** quando seu gatilho é 0: `shadowOpacity`, `glowRadius`, `blur` e `tintAmount`.
Os demais parâmetros só têm efeito quando o gatilho é > 0. Isso evita um booleano `enabled` e deixa o fade
in/out de um efeito ser só animar o gatilho.

Em `src/types.ts`:

- `EffectParams` (valores estáticos/`base`): todos os numéricos acima, mais as três cores.
- `MotionTracks` ganha uma `Track<number>` opcional por propriedade numérica (`shadowOpacity`, `shadowBlur`,
  `shadowX`, `shadowY`, `glowRadius`, `glowStrength`, `blur`, `tintAmount`).
- `Animated` ganha `effects?: EffectParams`. Ausente = `DEFAULT_EFFECTS` (tudo desligado). Não é preciso
  migração: `parseProject` já completa campos novos com defaults.
- `ActorProperty` (`keyof Animated['tracks']`) passa a incluir as novas chaves automaticamente.

Cores são guardadas só em `effects` (sem track). Mudar a cor edita o valor estático, sem criar key.

## Motor (`src/engine/effects.ts`, puro e testado)

- `DEFAULT_EFFECTS`, `EFFECT_PROPS` (lista das propriedades numéricas, com grupo, mínimo, máximo, passo).
- `sampleEffects(obj, frame): ResolvedEffects`: valores no frame (`sampleTrack` com fallback em
  `effects`/default), com clamp (opacidades e strength 0..1 ou faixa definida, raios >= 0).
- `hasActiveEffects(resolved): boolean`: algum gatilho > 0. Usado pelo renderer para decidir o caminho.
- `effectsMargin(resolved): number`: folga em pixels (desfoque, raio de glow, blur + offset da sombra) que a
  canvas fora da tela precisa para não cortar o efeito.
- Edição reaproveita `setActorProperty`/`toggleAnimated`/`actorPropertyValue`/`shiftActorTime`/
  `moveActorKeys` de `engine/actor.ts`. Para isso `setActorProperty` e `actorPropertyValue` passam a saber
  que o `base` das propriedades de efeito mora em `obj.effects` (com fallback em `DEFAULT_EFFECTS`) e não em
  `obj.base`. Essa decisão fica num único helper (`baseOf(prop)`), não espalhada.
- `actorKeyframes` já junta todas as tracks, então os losangos da timeline passam a incluir efeitos sem
  mais código.

## Renderer (`src/utils/exportVideo.ts`)

`withTransform` continua sendo o único ponto de desenho de atores, textos, gráficos e bonecos. Mudança:

1. Amostra `sampleEffects` junto de `sampleActor`.
2. **Sem efeito ativo:** caminho atual, byte a byte igual (nenhuma regressão de performance ou imagem).
3. **Com efeito ativo:** desenha o objeto (já com translate/rotate/scale) numa canvas fora da tela do
   tamanho da cena, reaproveitada entre frames (cache por tamanho), e compõe de volta com a ordem fixa:
   - desfoque: `ctx.filter = blur(Npx)` ao desenhar a canvas fora da tela;
   - sombra e glow: `drop-shadow` desenhado atrás do objeto já composto (`shadowColor/Blur/Offset` na
     composição, uma vez por objeto, não por primitiva);
   - tint: `globalCompositeOperation = 'source-atop'` com `tintColor` e `globalAlpha = tintAmount` sobre a
     canvas fora da tela, antes de compor.
   - O `globalAlpha` de opacidade do objeto vale só na composição final.
4. A função de composição vive à parte (`drawWithEffects(ctx, scene size, resolved, drawFn)`) para ser
   testada com um canvas fake/injeção de contexto e para `renderCompositeFrame` ficar legível.

Preview e export usam a mesma função (princípio já existente: `renderCompositeFrame` é o único desenho).
A câmera continua aplicada por fora, então efeitos acompanham zoom/pan/rotação.

O texto já tem sombra fixa de legibilidade em `drawText` (`ctx.shadowBlur = 12`). Ela continua igual: o
efeito Sombra é adicional e independente.

## UI

- Seção "Efeitos" em `MotionInspector.tsx` (serve a ator, texto, gráfico e boneco), colapsável, com quatro
  grupos. Cada parâmetro numérico usa o mesmo controle com cronômetro das outras propriedades; cada cor é um
  seletor simples.
- Ligar/desligar um efeito = ajustar o gatilho (campo numérico mais um botão rápido que alterna entre 0 e o
  padrão do grupo).
- Todos os textos novos entram em `pt-BR.ts` e `en-US.ts` (`npm run i18n:scan` limpo).
- A timeline não muda de código: os losangos vêm de `actorKeyframes`.

## MCP

Fora desta entrega. `describe_scene` e `lint_scene` não mudam; anotar no ROADMAP que efeitos via MCP
(`apply_template`/novo `set_effects`) é o passo seguinte natural.

## Compatibilidade e persistência

- `.fmproj`: `effects` é opcional e `tracks` aceita as chaves novas; arquivos antigos abrem iguais.
- Arquivos novos abertos em versão antiga perdem os efeitos sem quebrar (campos desconhecidos ignorados).
- Histórico: editar efeito é uma ação de desfazer como qualquer propriedade (`commitAction`), arrasto de
  slider usa `updatePresent` + `commitAction`.

## Testes

- `engine/effects.test.ts`: defaults e clamp, amostragem entre keys com easing, gatilho 0 = desligado,
  `effectsMargin`, edição pela regra do cronômetro (sem keys edita `effects`; com keys cria key),
  `shiftActorTime`/`moveActorKeys` movendo tracks de efeito, `actorKeyframes` incluindo efeitos.
- Renderer: objeto sem efeito produz as mesmas chamadas de desenho de hoje; com efeito chama a canvas fora da
  tela e compõe na ordem esperada (teste com contexto espiado).
- Serialização: projeto antigo sem `effects` abre; projeto com efeitos faz round-trip.
- Verificação manual no navegador: texto com sombra sobre vídeo, glow em seta, entrada "desfoque 12 → 0",
  tint animado, exportar MP4 e conferir que preview e export batem.

## Riscos e decisões em aberto

- **Performance:** canvas fora da tela por objeto com efeito, por frame. Mitigação: só objetos com efeito
  ativo, uma canvas reaproveitada, tamanho limitado à caixa do objeto + `effectsMargin` se a versão da cena
  inteira se mostrar lenta no export longo. Decidir na implementação com medição, sem otimizar antes.
- `ctx.filter` não existe em todos os navegadores (Safari antigo). Fallback: desfoque ignorado e aviso único
  no inspetor; sombra e tint não dependem dele.
- Ordem fixa dos efeitos é uma simplificação consciente; ordem configurável exigiria o modelo de lista
  descartado.
