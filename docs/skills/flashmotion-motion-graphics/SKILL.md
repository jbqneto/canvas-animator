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

O Chromium headless pode não ter encoder H.264. Se ffmpeg estiver disponível (PATH ou
`FLASHMOTION_FFMPEG`), o CLI converte o WebM intermediário para MP4. Sem ffmpeg, retorna
`H264_UNAVAILABLE` e grava `.webm`, nunca bytes WebM em `.mp4`. Verifique dimensões, FPS, quadros e
duração antes de entregar.
