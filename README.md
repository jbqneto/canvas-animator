# FlashMotion Studio

Estúdio de animação 2D no navegador, no espírito do Flash, para **criar animações que enriquecem vídeos**
(ou viram vídeos por si só): bonecos palito, imagens que seguem caminhos (um avião que pousa em vários
países), gráficos que crescem e números que contam. Feito para desktop e instalável como aplicativo (PWA).

Não é um editor de vídeo: um vídeo de fundo pode ser carregado como referência, e a animação é exportada
como MP4 completo ou como **camada transparente** (WebM VP9 + alpha) para colocar por cima do vídeo em
qualquer editor.

## Recursos

- **Atores com keyframes** (estilo After Effects): importe PNG/SVG/WebP (botão ou arrastar para o palco),
  ligue o cronômetro de posição/escala/rotação/opacidade e mova o objeto em frames diferentes. Easing por
  keyframe, caminho curvo editável no palco, orientar ao caminho, rastro do percurso, losangos arrastáveis
  na linha do tempo.
- **Caminhos + "seguir caminho"** (motion guide do Flash): desenhe uma rota clicando pontos (pontilhada,
  tracejada, contínua ou guia invisível, que pode ir aparecendo conforme é percorrida) e faça qualquer imagem
  (PNG, SVG, JPG) percorrê-la, com tempo, suavização, paradas em cada ponto e orientação na direção do
  movimento. Editar o caminho atualiza o movimento.
- **Modelos** montados com essas peças, por exemplo "Rota no mapa": mapa-múndi + caminho pelos países +
  avião que o segue e pousa em cada um. Tudo o que o modelo cria continua editável.
- **Boneco palito**: poses com cinemática direta (girar o osso leva o resto do membro), poses prontas e
  interpolação de pose entre dois frames (tween clássico), onion skin.
- **Gráficos e textos animados**: barras, rosca, linha, métrica, contadores, efeitos de texto.
- **Projeto em arquivo** `.fmproj` (Ctrl+S / Ctrl+O), autosave com recuperação, e o app instalado abre
  `.fmproj` direto do sistema.
- **Export** MP4 (H.264) ou WebM transparente, com trecho de frames, codificado via WebCodecs com tempo exato.
- IA opcional (Gemini) para imagens e um copiloto de roteiro.
- Interface em **português (BR)** e **inglês (US)**, escolhida no canto superior direito e lembrada no navegador.

## Desenvolvimento

Requer Node 20+.

```bash
npm install
npm run dev        # http://localhost:3000 (Express + Vite)
npm test           # Vitest (motor de keyframes, rig do boneco, rota, formato de projeto)
npm run lint       # typecheck
npm run i18n:scan  # textos da interface fora dos dicionários (src/i18n)
npm run build && NODE_ENV=production npm start   # build de produção (necessário para testar o PWA)
```

O CI (`.github/workflows/ci.yml`) roda typecheck, testes, `i18n:scan` e build em todo PR.

Para os recursos de IA, defina `GEMINI_API_KEY` no `.env` (veja `.env.example`).

## Arquitetura

| Pasta | Conteúdo |
|---|---|
| `src/engine/` | Funções puras e testadas: keyframes, easing e caminhos (`keyframes.ts`), atores (`actor.ts`), rig do boneco (`stickRig.ts`). |
| `src/utils/exportVideo.ts` | `renderCompositeFrame` desenha um frame (preview e export usam a mesma função) e o export via mediabunny. |
| `src/project/` | Formato `.fmproj`, abrir/salvar (File System Access API) e autosave (IndexedDB). |
| `src/map/` | Mapa-múndi (world-atlas / Natural Earth) e o template de rota. |
| `src/components/` | Interface (palco, timeline, inspectors, diálogos). |

A pesquisa que orientou o projeto está em [`docs/RESEARCH.md`](docs/RESEARCH.md) e o plano/decisões em
[`docs/ROADMAP.md`](docs/ROADMAP.md).
