---
name: flashmotion-motion-graphics
description: Cria motion graphics (Stories, Shorts, vinhetas, explicadores com dados, mapas, títulos) no FlashMotion Studio — via CLI headless, MCP ou API do navegador.
---

# FlashMotion — motion graphics com qualidade

O FlashMotion Studio é um editor 2D no navegador. Projetos são arquivos `.fmproj` (JSON). Esta
skill cobre escolher o caminho de acesso, planejar, gerar a cena por código, revisar por contact
sheets, adicionar som/câmera, exportar e entregar.

Antes de começar, leia `docs/AGENT_LEARNINGS.md`; ao terminar uma sessão de motion, acrescente uma
entrada datada ao Diário. Referência do formato: `src/types.ts`; ferramentas: `docs/AUTOMATION.md`.

## 1. Acesso

1. **MCP local:** `mcp__flashmotion__*` (ou `mcp__remote-devices__flashmotion__*` em sessão ligada
   ao computador). Exige `npm run local` e uma janela conectada.
2. **API do navegador:** `window.flashmotion` em `/?automation=1`, quando houver acesso a uma aba
   visível. Aba em background pode congelar o render; prefira `npm run agent`.
3. **Agente em nuvem, CI ou sem aba visível — caminho padrão:** `npm run agent`. Use `validate`,
   `lint` e `describe` sem browser; para render/export, faça build e use o Chromium headless isolado.

O CLI usa perfil de navegador temporário, bloqueia service workers e serve a build em loopback;
não toca no localStorage/IndexedDB do editor normal. Não baixa Chromium: indique `--chromium` ou
`FLASHMOTION_CHROMIUM`; `PLAYWRIGHT_BROWSERS_PATH` e Chrome do sistema também são pesquisados.

## 2. Planejar antes de gerar JSON

- Stories/Reels/Shorts: 1080×1920, área segura aproximada x 80–1000 e y 250–1620.
- Uma ideia por cena; calcule leitura e reserve tempo para telas densas.
- Congele os dados num JSON com valores, período, unidades e fontes. Calcule variações em código.
- Use paleta curta e hierarquia tipográfica; fontes disponíveis: Plus Jakarta Sans, Inter, Cormorant
  Garamond, JetBrains Mono e IBM Plex Mono.
- Em conteúdo sensível, mantenha critério visual e sonoro consistente, explicite metodologia e cite fontes.

## 3. Gerar e validar a cena

Gere o `.fmproj` inteiro por script quando houver muitos objetos. Frames começam em 1. Textos não
quebram automaticamente: crie um objeto por linha. `layers[0]` fica na frente. `parallax: 0` fixa
HUD à câmera; paths acompanham a câmera.

```bash
npm run agent -- validate projeto.fmproj
npm run agent -- lint projeto.fmproj
npm run agent -- describe projeto.fmproj
```

O projeto usa o mesmo `parseProject`, `lintScene` e `describeScene` que a aplicação/MCP.

## 4. Revisar o motion

```bash
npm run agent -- contact-sheet projeto.fmproj --count 9 --out /tmp/revisao.png
npm run agent -- render-frame projeto.fmproj --frame 120 --out /tmp/frame.png
```

Use quadros após as entradas, durante transições e nos trechos densos. Corrija composição,
movimento, legibilidade e dados, depois rode lint novamente.

## 5. Operações e export

`apply` aceita operações tipadas (`addSfx`, `setCamera`, `setEffects`, `applyTemplate`,
`replaceContent`) num arquivo JSON e grava um novo `.fmproj`. Use `run steps.json` para carregar,
editar, renderizar, exportar e salvar numa sessão de browser.

```bash
npm run agent -- export projeto.fmproj --out /tmp/video.mp4 --range 1:300
```

O export do editor/CLI serve para prévia e para tirar o áudio mixado. **Não é o master**: o encoder
do navegador (WebCodecs com `QUALITY_HIGH`, OpenH264 ou VP9) dá cerca de 1,2 Mbps em 1080×1920, e
reencodar isso deixa o texto serrilhado.

## 6. Master de qualidade (obrigatório para entrega)

1. Renderize **todos os quadros em PNG** (`renderFrame`; script de referência
   `outputs/instagram-economia-2022-2026/src/render_png_sequence.mjs`, ~0,07 s por quadro em 1080×1920).
2. Encode **uma única vez**:
   `ffmpeg -framerate <fps> -i seq/f%04d.png -i audio_do_export.webm -map 0:v -map 1:a -c:v libx264 -preset slow -tune animation -crf 16 -profile:v high -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 192k -af loudnorm=I=-16:TP=-1.5 -t <duração> -movflags +faststart final.mp4`
3. Nunca reencode um arquivo comprimido e nunca use `-maxrate` para caber num limite de upload.
   Entregue o master na pasta do projeto; prévia para chat é uma cópia separada em 540×960.
4. **QA de codec:** compare 3 quadros do MP4 com os PNGs dos mesmos quadros
   (`ffmpeg -i final.png -i ref.png -lavfi ssim -f null -`). Exija SSIM ≥ 0,99 e olhe recortes de texto pequeno a 300%.
5. Confira com ffprobe dimensões, FPS, número de quadros e duração.

## 7. Design que sobrevive à compressão

- Fundo liso ou com gradiente amplo. Nada de grade de pontos ou ruído fino; se usar textura, que seja
  estática (`parallax: 0`) e com elementos ≥ 3 px.
- Texto < 34 px em branco ou cinza claro. Cor saturada (âmbar, azul) só em ≥ 34 px e peso ≥ 600,
  porque o croma 4:2:0 come a borda colorida.
- Câmera: movimente só na entrada da cena e pare em cerca de 1 s. Zoom contínuo em cena com texto
  faz as letras cintilarem e gasta bits.
- Texto cortado: o lint estima a largura e subestima caixa alta em negrito em 10–25%. Meça a largura real
  com `measureText` no navegador (`outputs/instagram-economia-2022-2026/src/measure_text.mjs`) antes do
  render; texto fora da área segura ou da caixa é erro.
