# FlashMotion como framework de motion graphics — design

- **Status:** proposto (12/10/2026) — aguardando revisão do Jose
- **Base:** sessão de produção dos shorts do Mirabilia (12/10), `docs/ROADMAP.md`, `docs/AUTOMATION.md`, e a skill
  `Barty-Bart/motion-graphics` (`motion-broll`, MIT) analisada no código (`engine/motion.js`, `reference/engine-api.md`).

## Objetivo

O FlashMotion deixa de ser só um editor com MCP e vira um **framework**: editor (UI) + motor puro + biblioteca de
componentes + skills do Claude + render sem janela. Dois usos, com o mesmo motor:

1. **Complementar** — peças que entram num vídeo existente (Drift/DaVinci): cards de data, citações, mapas, contadores,
   terços inferiores, painéis com alpha sincronizados à narração.
2. **Principal** — o vídeo inteiro é motion graphics (tipografia cinética, "documentário de interface", explicativos):
   o short B do Carlo Acutis (`3-QUI-15out-video-games.mp4`) foi o primeiro caso real.

## O que a sessão de 12/10 revelou (dores reais)

| Dor | Consequência |
|---|---|
| Cada peça foi escrita como **SVG em data-URI + keyframes à mão** (`_gerador/lib.mjs`, `fm-short-b/gen.mjs`) | 72 camadas-imagem, 5,8 MB, nada editável na UI como texto/forma; fontes embutidas em cada SVG |
| `pop` escala a camada inteira em volta do centro da tela | o ✓ "voou" para fora da caixa; tive de trocar por camadas pequenas posicionadas |
| Cormorant usa algarismos antigos | "1 hour", "15" leram como "ı hour", "ı5" |
| Motion blur foi feito por fora: export a 120 fps + `ffmpeg tmix` | funciona (export de 35 s em 49 s), mas devia ser opção do export |
| Música + loudness foram feitos por fora (ffmpeg `loudnorm` + `alimiter`) | o export do MCP mixa SFX, mas não normaliza (-16 LUFS / TP -1,5) nem faz ducking |
| A ponte depende de uma aba aberta: `RECOVERY_PENDING`, sessão sumindo ao reiniciar sem `npm run local`, aba congelando no Chrome | dois bloqueios de ~20 min na mesma sessão |
| Datas em Mono 170 px estouraram 1080 px; texto pequeno no celular | o lint não sabe a largura real do texto nem o perfil "Shorts" |

## O que vale trazer da skill `motion-broll`

| Ideia | Como entra aqui |
|---|---|
| **Springs em forma fechada** (`M.S(tau, ω, ζ)`; presets `MORPH [15,.84]`, `FAST [27,.86]`, `SLOW [12.5,.9]`, `SOFT [10,.95]`, `CAM [7.5,1]`) | novo easing `spring` com parâmetros por key (F1) |
| **Track como soma de springs** (cada mudança soma uma resposta; mudanças sobrepostas se misturam) | modo `retarget` no track: trocar de alvo no meio do movimento sem "solavanco" (F4) |
| **`vis()`: troca de conteúdo com desfoque** (entra após 0,07 s em 0,26 s; sai em 0,12 s; blur 12 px; escala 0,94→1) | preset `blurSwap` de entrada/saída, com esses números como padrão (F1) |
| **Uma forma que nunca corta** (pill → card → janela → gráfico, morfando w/h/raio/cor; conteúdo troca com blur) | objeto `morphBox` com estados + slots de conteúdo (F4) |
| **Câmera que enquadra cada estado** (`center + cam × (world − focus)`, spring `CAM`) | `camera.focus(objectId)` gera keys de pan/zoom com spring (F4) |
| **Ritmo pela fala**: uma mudança por batida, 0,4–1,2 s; âncora na 1ª/última palavra do cue (±0,2 s) | importar tempos por palavra (VTT/Whisper do Drift) → marcadores; lint `off-beat` (F3) |
| **Motion blur por sub-frames** | opção nativa no export: N sub-frames, obturador 180° (F1) |
| **Ícones de um só conjunto e um só traço** (24-grid, Lucide/ISC) | tipo de forma `icon` vetorial, traço uniforme, cor do tema (F2) |
| **Regras de "não parecer template"**: sem quique, partículas, glow em UI, traços mistos, tempo morto, número inventado | perfis de estilo no lint (F3) e regras na skill do Claude (F5) |
| **Laço de revisão**: stills nos estados assentados E no meio das transições | `review_scene`: contact sheet automático em marcadores + meios de transição (F3) |

O que **não** vale trazer: o motor HTML/Chromium em si (seria um segundo FlashMotion) e o foco em painéis ao lado de
quem fala para a câmera com cursor — os canais são faceless.

## Arquitetura proposta

```
             ┌──────────── skills/ (Claude) ────────────┐
             │ director · shorts · overlay · rubric      │
             └──────────────┬────────────────────────────┘
                            │ planeja, chama MCP/CLI, revisa
   MCP (stdio) ──┐          ▼
                 ├──►  @flashmotion/sdk  (TS puro: componentes, layout, beats, brand)
   CLI headless ─┘          │ gera objetos NATIVOS (texts, shapes, icons, morphBox), não SVG
                            ▼
                 engine/ (puro, testado) ──► renderCompositeFrame ──► export (blur, loudness, alpha)
                            ▲
                     UI do editor (edita tudo que o SDK gerou)
```

Regra central: **o SDK só produz objetos que a UI sabe editar.** Nada de SVG opaco quando existe primitivo nativo.

## Fases

### F1 — Qualidade de movimento e export (pequeno, alto impacto)

1. **Easing `spring`**: `Keyframe.easing = 'spring'` + `springParams?: { w, z }` (padrão `MORPH`). `applyEasing` usa a
   resposta ao degrau fechada (normalizada para chegar em 1 no próximo key: amostrar `S(tau·k)` e garantir `t=1` no fim).
   Presets nomeados no inspetor: Morph, Rápido, Lento, Suave, Câmera.
2. **Preset `blurSwap`** em `motionPresets.ts` com os números da `vis()`.
3. **Pivô por objeto** (`anchor`) para escala/rotação — resolve o caso do ✓ sem precisar de camadas pequenas.
4. **Motion blur no export**: `export_start({ motionBlur: { subframes: 4, shutter: 180 } })`; o renderer desenha
   `subframes` amostras em `frame + k·(shutter/360)/subframes` e acumula (float, `lighter` + divisão). Exige que
   `startFrame`/visibilidade, typewriter e karaokê aceitem frame fracionário (o `sampleTrack` já aceita).
5. **Algarismos alinhados**: `TextOverlay.numerals: 'lining' | 'oldstyle'` (padrão `lining` para serifadas) via
   `font-variant-numeric`; lint `oldstyle-digits` quando Cormorant/Fraunces mostram dígitos isolados.
6. **Loudness e ducking no export**: `audio: { targetLufs: -16, truePeak: -1.5, duckMusicUnder: 'narration' }` (dois
   passes; mesmo padrão do canal).

### F2 — Componentes e marca

1. **Biblioteca vertical** (modelos editáveis, com props): cronômetro, janela de navegador (URL que digita + grade),
   bloco de código que digita, checklist que marca, grade de tiles, card de data, citação, CTA de fim com seta para o
   link do vídeo relacionado, gancho de topo persistente, legenda inferior. Tudo com safe area do preset.
2. **Ícones** (`shape.type: 'icon'`, conjunto Lucide curado ~60 ícones, traço uniforme).
3. **Brand kit por canal** (`brand.json`: paleta, fontes, tamanhos mínimos, safe areas, estilo de entrada padrão,
   SFX padrão). Mirabilia: fundo `#06080C`, ouro `#E8B65A`, Cormorant + Inter + IBM Plex Mono. Os modelos leem o kit;
   lint `off-brand-color`.
4. **Safe areas reais por preset**: Shorts reserva ~20% inferior (título/link) e ~12% à direita (botões).

### F3 — Tempo e revisão

1. **Beats**: importar tempos por palavra (VTT com timestamps inline — já lido pelo karaokê — ou JSON do Whisper do
   Drift) → marcadores `word:<palavra>`; no SDK, `at('miracle')`.
2. **Lint por perfil** (`sober-documentary`, `energetic-short`, `explainer`): proíbe `elasticOut`/`bounceOut` e glow no
   sóbrio; `pace` (mudanças < 0,4 s ou > 1,2 s sem movimento num trecho falado); `off-beat`; `text-overflow` (mede a
   largura real); `text-too-small` por preset (mín. 44 px em 1080×1920).
3. **`review_scene`**: contact sheet em cada marcador + no meio de cada transição, devolvendo a lista de frames para
   o laço "olhar → nota 1–10 → corrigir os 3 piores" (já descrito em AUTOMATION.md, agora automático).
4. **Passe de som** (`sound_pass`): sugere SFX por evento (slide→whoosh, pop→pop, contador→tick, revelação→impact,
   riser antes do marcador forte), respeitando o perfil (sóbrio = volume baixo, poucos).

### F4 — Morph e câmera

1. **Formas animáveis**: `width`, `height`, `radius`, `fill` como tracks (hoje são estáticos em `ShapeStyle`).
2. **`morphBox`**: lista de estados `[{ frame, w, h, r, fill, focus? }]` com spring `MORPH`; slots de conteúdo que
   entram/saem com `blurSwap`. É a peça que dá o visual "um objeto que vira outro" dos melhores motion graphics.
3. **`camera.focus`** e track `retarget` (soma de springs).

### F5 — SDK, CLI e skills

1. **`@flashmotion/sdk`** (TS, sem DOM): `scene({ preset, brand })`, componentes da F2, `beat`, `stagger`, `at()`,
   `sfx()`. Saída: `.fmproj` validado. Substitui `_gerador/` e os geradores ad-hoc.
2. **CLI headless** `flashmotion render cena.fmproj --out x.mp4 [--blur 4] [--alpha] [--lufs -16]` com Playwright +
   o mesmo `renderCompositeFrame`. Sem aba aberta, sem `RECOVERY_PENDING`, roda em scheduled task e no CI.
3. **MCP novo**: `build_scene` (JSON do SDK → conteúdo), `apply_beats`, `review_scene`, `sound_pass`.
4. **Skills no repo** (`skills/`, com `npm run skills:install` copiando para `~/.claude/skills`):
   - `flashmotion-director` — ideia → storyboard por batidas → build via SDK → review → export. Fonte das regras.
   - `flashmotion-shorts` — gancho no 1º segundo, persistente no topo, fim com CTA ao vídeo relacionado, loop.
   - `flashmotion-overlay` — peças para vídeos existentes: tempos do roteiro/narração, alpha (WebM VP9) para o Drift.
   - `rubric.md` — critérios de nota por plano (composição, movimento, tipografia, sincronia) e a lista de proibidos.

## Ordem sugerida e tamanho

| Fase | Entrega | Tamanho |
|---|---|---|
| F1 | spring, blurSwap, pivô, motion blur, numerais, loudness | 2–3 sessões |
| F2 | 10 componentes verticais, ícones, brand kit, safe areas | 3–4 sessões |
| F3 | beats, lint por perfil, review_scene, sound_pass | 2–3 sessões |
| F4 | formas animáveis, morphBox, camera.focus | 3 sessões |
| F5 | SDK, CLI headless, MCP novo, skills | 4–5 sessões |

F1 primeiro porque melhora tudo que já existe sem mudar o formato. A CLI headless (F5.2) pode ser antecipada se os
bloqueios da aba continuarem: é o maior ganho de robustez.

## Fora do escopo (por ora)

3D, simulação de partículas, síntese de música/voz (ACE-Step foi avaliado: sem GPU dedicada não é viável no notebook
atual), e qualquer dependência de IA paga no caminho de render.
