# Aprendizados de agentes no FlashMotion

Diário prático do que funcionou, do que quebrou e das armadilhas do formato. Agentes: leiam antes
de animar e acrescentem uma entrada datada ao terminar uma sessão. Entradas novas vão no topo do Diário.

Skill relacionada: `docs/skills/flashmotion-motion-graphics/SKILL.md`.
Implementação de referência: `outputs/instagram-economia-2022-2026/src/` (gerador Python + harness Playwright).

## 1. Como o agente acessa o editor (árvore de decisão)

| Situação | Caminho | Observações |
|---|---|---|
| Trabalho automatizado em nuvem, CI ou sem aba visível | **`npm run agent`** | Caminho padrão. `validate`, `lint` e `describe` não precisam de browser; render e export usam Chromium headless com perfil isolado. |
| Claude Code/Desktop local com o MCP registrado | `mcp__flashmotion__*` | Caminho interativo. Exige `npm run local` e janela conectada/visível. |
| Sessão na nuvem ligada ao computador pelo app desktop | MCP local proxiado como `mcp__remote-devices__flashmotion__*` | Depende do MCP estar configurado no Claude Desktop e de uma janela conectada. |
| Sessão na nuvem com Claude in Chrome | `window.flashmotion` via ferramenta JavaScript | A aba precisa estar visível; em segundo plano o Chrome congela a renderização. |
| Agente com acesso ao computador local | Playwright contra a aplicação | Use o CLI oficial antes de recorrer ao harness manual. |

O CLI headless usa origem e contexto novos a cada execução. Não compartilha localStorage/IndexedDB
do editor normal, bloqueia service workers e serve apenas `dist/` em loopback. Não há necessidade
de expor porta ou iniciar `npm run local`.

Coisas que não funcionam a partir da nuvem:
- `device_bash` (VM no computador do usuário) não alcança o `localhost` do host.
- MCP stdio local não é alcançável da nuvem sem o proxy do app desktop.

## 2. API do navegador (`window.flashmotion`)

Em `/?automation=1`, a API inclui `getStatus`, `getProject`, `replaceContent`, `loadProject`,
`setCamera`, `setEffects`, `addSfx`, `listTemplates`, `applyTemplate`, `seek`, `setPlaying`,
`renderFrame`, `renderContactSheet`, `startExport`, `exportStatus` e `exportChunk`.

- `replaceContent` não muda FPS, canvas ou duração. Para substituir um projeto inteiro, use `loadProject`.
- SFX de `addSfx` entram no conteúdo; persista-os com `getProject()`.
- `RECOVERY_PENDING` na aba normal indica autosave pendente: nunca descarte o trabalho do usuário.
  O CLI não usa essa origem nem esse armazenamento.

## 3. Render headless

Use `npm run agent` como caminho padrão:

1. Rode `npm run build` uma vez.
2. Use `npm run agent -- validate arquivo.fmproj` e depois `contact-sheet` para QA.
3. Exporte com `npm run agent -- export arquivo.fmproj --out /tmp/video.mp4 --range 1:300`.

O CLI inicia servidor estático efêmero em `127.0.0.1` e Chromium com contexto novo, fontes locais
e service workers bloqueados. Defina `FLASHMOTION_CHROMIUM` ou use `--chromium` se o executável
não estiver no local padrão; `PLAYWRIGHT_BROWSERS_PATH` também é reconhecido. Não há download de
navegador. Se o Chromium não tiver encoder H.264, o export retorna WebM; com ffmpeg, converte para
MP4 H.264/AAC. Sem ffmpeg, grava `.webm` e informa `H264_UNAVAILABLE` — nunca grava WebM com nome
`.mp4`.

Harness manual de referência (fallback): `outputs/instagram-economia-2022-2026/src/render_harness.mjs`.
O Chromium headless do ambiente de referência não tinha encoder H.264. **Converter esse WebM para MP4
(CRF 18, maxrate 3,6M) foi um erro de qualidade**: veja a seção 3b. O master tem que sair de PNG sem
perdas, com uma única passada x264.

## 3b. Qualidade de vídeo — texto nítido (diagnóstico de 13/10/2026)

**Sintoma:** texto "serrilhado" e com bordas "quebradas" no MP4 final, embora o quadro renderizado (PNG) esteja perfeito. **A causa é a compressão, não o desenho.**

Medição no Story de 59 s, com SSIM do quadro do MP4 contra o PNG sem perdas do mesmo quadro:

| Pipeline | SSIM | Tamanho |
|---|---|---|
| Export do navegador (WebCodecs, ~1,2 Mbps) → reencode H.264 (CRF 18, maxrate 3,6M) | 0,979–0,983 | 12 MB |
| PNG por quadro (`renderFrame`) → **uma** passada x264 (CRF 16, `-tune animation`) | 0,995–0,996 | 11,6 MB |

Com o mesmo tamanho, a qualidade fica muito melhor. Causas, em ordem de peso:

1. **Duas compressões com perda.** O export do editor usa WebCodecs com `QUALITY_HIGH` do mediabunny. Isso vira encode por quantizador: cerca de 1,2 Mbps para 1080×1920 em VP9 no headless. No Chrome Linux, o H.264 sai do OpenH264, um encoder de software fraco. Reencodar esse arquivo soma artefatos.
2. **`-maxrate` para caber em 30 MB.** Limitar o bitrate para enviar no chat piora tudo.
3. **Fundo com textura fina** (grade de pontos de 1,6 px) e **halo da sombra fixa do texto.** Os dois gastam bits e geram ruído em volta das letras.
4. **Croma 4:2:0.** Texto colorido e fino (âmbar ou azul sobre azul-escuro) perde a borda de cor.
5. **Zoom de câmera contínuo.** As bordas das letras são re-rasterizadas a cada quadro (subpixel), o que gera cintilação e consome bits.

**Regras:**
- **Master = sequência PNG + uma única passada ffmpeg.** Use `render_png_sequence.mjs` (ou o `npm run agent` quando ele suportar), depois:
  `ffmpeg -framerate 30 -i seq/f%04d.png -i audio_do_editor.webm -map 0:v -map 1:a -c:v libx264 -preset slow -tune animation -crf 16 -profile:v high -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 192k -af loudnorm=I=-16:TP=-1.5 -t <duração> -movflags +faststart final.mp4`.
  O export do editor serve **só** para tirar a faixa de áudio mixada (`-map 1:a`).
- **Nunca reencode um vídeo já comprimido** e nunca use `-maxrate` para caber no chat. Entregue o master na pasta do computador. Se precisar de prévia no chat, faça uma cópia separada em 540×960.
- **Fundo:** liso ou com gradiente amplo. Textura só se for sutil, estática (`parallax: 0`) e com elementos ≥ 3 px.
- **Cor:** texto < 34 px em branco ou cinza claro; cor saturada só a partir de 34 px e peso 600 ou mais.
- **Câmera:** movimento só na entrada da cena (ease até parar em cerca de 1 s) e cena parada no resto. Nada de zoom contínuo em cenas com texto.
- **QA de codec (obrigatório):** extraia 3 quadros do MP4 final e compare com o PNG do mesmo quadro (`ffmpeg -i final.png -i ref.png -lavfi ssim -f null -`). Exija SSIM ≥ 0,99 e olhe recortes de texto pequeno e colorido a 300%.
- **Texto cortado:** o lint estima a largura com 0,55 em por caractere, o que subestima caixa alta em negrito em 10–25%. Meça a largura real com `measureText` no navegador (`measure_text.mjs`). Qualquer texto que passe da área segura ou da caixa onde está é erro e deve ser corrigido antes do render.

Scripts de referência: `outputs/instagram-economia-2022-2026/src/render_png_sequence.mjs` e `measure_text.mjs`.


## 4. Armadilhas do formato `.fmproj` / motor

- Quadros começam em 1. Um objeto ocupa de `startFrame` até `startFrame + durationFrames`.
- Texto usa a âncora no início da linha de base; `align` só aceita `left` ou `center`; `fillText` não quebra linha.
- Famílias de fonte: Plus Jakarta Sans, Inter, Cormorant Garamond, JetBrains Mono e IBM Plex Mono.
- Contadores usam `isNumberCounter`, `counterStart`, `counterEnd`, `counterDecimals`, prefixo/sufixo e `animDurationFrames`.
- Ordem sem camadas: paths → atores → textos. Com camadas, `layers[0]` fica por cima.
- Câmera move objetos, exceto `parallax: 0`; paths não têm parallax.
- `addSfx` aceita no máximo 32 quadros por chamada.

## 5. Padrões de motion que funcionaram

- Para Story/Reel, área segura aproximada: y 250–1620, x 80–1000 em 1080×1920.
- Varie entradas; títulos aceitam blur 8→0, contadores uma duração curta, barras o traço revelado.
- Quebre legendas por frase e em partes equilibradas, com NBSP entre valores e unidades.
- Guarde os dados num único JSON e calcule variações em código.
- QA com 6–12 quadros numa contact sheet e render em resolução nativa para detalhes densos.

## 6. Lacunas e melhorias identificadas

1. O CLI headless está disponível em `npm run agent`; o MCP interativo ainda depende de uma janela conectada.
2. Sem encoder H.264, o Chromium gera WebM; o CLI converte via ffmpeg se disponível e explicita o fallback.
3. Uma aba oculta continua sujeita ao throttling do navegador; use o CLI para render/export batch.
4. A API direta do navegador é mais ampla que as operações disponíveis pela tabela MCP.
5. O `export` do `npm run agent` ainda reencoda o WebM do navegador (`scripts/agent/ffmpeg.ts`: CRF 18 + maxrate 3,6M). Deve passar a renderizar PNG por quadro e encodar uma vez (seção 3b).
6. O export do editor usa `QUALITY_HIGH` (cerca de 1,2 Mbps em 1080×1920 no VP9). Falta uma opção de qualidade "master", com bitrate explícito alto ou `QUALITY_VERY_HIGH`.
7. A sombra preta fixa em todo texto (`drawText`) deveria ser opcional: em fundo escuro e liso ela só gera halo.
8. O lint estima a largura do texto (0,55 em por caractere) e não percebe texto que passa da área segura quando é caixa alta em negrito.

---

## Diário

### 2026-10-13 — Git pela VM do `device_bash`
- **Não rode `git status` (nem outro comando que grave no índice) pela VM do `device_bash`.** O git cria `.git/index.lock` e a VM não consegue apagá-lo; o lock fica preso e trava os commits do José e do Codex. Para ler o estado do repo use `git --no-optional-locks status` ou `git log`. Se o lock ficar, peça permissão de exclusão e remova só o `.git/index.lock` vazio.
- O MCP só fica acessível à sessão na nuvem quando está registrado no Claude Desktop (`mcpServers`), igual ao `drift`. Confira com `get_device_info` → `localMcpServers`.

### 2026-10-13 — Qualidade: texto serrilhado no MP4
- O José reportou textos "serrilhados" e "cortados" no MP4. Os PNGs estavam perfeitos; a culpa era da cadeia de compressão (export WebCodecs de ~1,2 Mbps reencodado com maxrate).
- O re-render do mesmo projeto via PNG + x264 (CRF 16, `-tune animation`) subiu o SSIM de 0,98 para 0,996 no mesmo tamanho (11,6 MB). Regras na seção 3b.
- Nenhum texto passava do canvas (conferido com `measureText`). Se algo continuar "cortado", pedir um print do ponto exato.

### 2026-10-13 — CLI headless oficial

- `npm run agent` passa a ser o caminho padrão para agentes em nuvem ou sem aba visível: validação/lint/descrição são browser-free e render/export usam Chromium isolado.
- Fontes são atendidas localmente, service workers ficam bloqueados e nenhum autosave do editor normal é tocado.
- Export MP4 converte WebM com ffmpeg quando necessário; sem ffmpeg, salva WebM com extensão correta e aviso explícito.

### 2026-10-12/13 — Story “Brasil em números 2022–2026”

- Projeto gerado por script Python a partir de JSON, com câmera, trilha e efeitos sonoros.
- MCP não estava acessível da nuvem; aba do Chrome em segundo plano congelou renderização. O projeto saiu via Chromium headless e ffmpeg.
- Gerar o `.fmproj` por código e revisar por contact sheet foi mais rápido que montar a cena objeto a objeto.
