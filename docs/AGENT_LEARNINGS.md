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
O Chromium headless do ambiente de referência não tinha encoder H.264; o ffmpeg foi usado para
converter VP9/Opus em H.264/AAC. Em um Story de 59 s, CRF 18 e maxrate 3,6 Mbit/s produziram 12 MB.

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

---

## Diário

### 2026-10-13 — CLI headless oficial

- `npm run agent` passa a ser o caminho padrão para agentes em nuvem ou sem aba visível: validação/lint/descrição são browser-free e render/export usam Chromium isolado.
- Fontes são atendidas localmente, service workers ficam bloqueados e nenhum autosave do editor normal é tocado.
- Export MP4 converte WebM com ffmpeg quando necessário; sem ffmpeg, salva WebM com extensão correta e aviso explícito.

### 2026-10-12/13 — Story “Brasil em números 2022–2026”

- Projeto gerado por script Python a partir de JSON, com câmera, trilha e efeitos sonoros.
- MCP não estava acessível da nuvem; aba do Chrome em segundo plano congelou renderização. O projeto saiu via Chromium headless e ffmpeg.
- Gerar o `.fmproj` por código e revisar por contact sheet foi mais rápido que montar a cena objeto a objeto.
