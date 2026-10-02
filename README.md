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
- **Biblioteca de modelos** (botão "Modelos"): título de abertura, terço inferior (nome e cargo), lista em
  tópicos, número em destaque, gráfico que entra, destaque com seta e rota no mapa (mapa-múndi + caminho pelos
  países + avião que pousa em cada um). Prévia animada e parâmetros no diálogo; tudo o que o modelo cria são
  objetos normais, editáveis.
- **Formas editáveis**: retângulo (com cantos arredondados), elipse, seta e linha, com preenchimento, contorno e
  tamanho editáveis a qualquer momento, animadas como qualquer ator.
- **Entradas e saídas prontas** (surgir, subir, descer, deslizar, pop) para qualquer objeto, gravadas como
  keyframes comuns.
- **Boneco palito**: um objeto animado como os outros. Arraste as articulações para posar (girar o osso leva o
  resto do membro; Alt estica); com o cronômetro da pose ligado, cada pose vira uma pose-chave e os ossos giram
  sozinhos entre elas. Posição, tamanho, rotação e opacidade usam os mesmos keyframes dos atores (e ele pode
  seguir um caminho). Poses prontas, espelhar pose, "Minhas poses" (vão junto no arquivo do projeto), F6 para repetir a pose
  no próximo frame, Ctrl+B para quebrar em traços, onion skin.
- **Girar e escalar no palco**: todo objeto selecionado tem uma alça redonda acima da caixa (girar; Shift =
  passos de 15°) e quadrados nos cantos (escalar em volta da âncora; Shift = passos de 5%).
- **Gráficos e textos animados**: barras, rosca, linha, métrica, contadores, efeitos de texto. Eles se movem
  como os atores: posição, escala, rotação e opacidade com keyframes, easing por key e "seguir caminho".
- **Áudio de referência**: narração, música ou efeitos (ou o som de um vídeo) na timeline com forma de onda.
  Mova e corte as faixas, ajuste volume/mudo e ouça o trecho ao arrastar o cursor (scrub) para acertar a
  animação na palavra ou na batida. O áudio vai junto no export (opcional) e fica salvo dentro do projeto.
- **Marcadores**: aperte **M** (até com a animação tocando) para marcar palavras ou batidas; clipes, keys e
  áudio grudam neles ao arrastar (Alt solta). Um clique na faixa de áudio cria marcadores onde cada fala começa.
- **Legendas do roteiro** (Modelos › Títulos): cole o roteiro da narração, uma legenda por linha. Cada linha
  começa num marcador (crie-os com M ou com um clique na faixa de áudio); as que sobram dividem o tempo pelo
  tamanho. Ou importe um **.srt/.vtt** (transcrição do YouTube, Whisper, CapCut…) e use o tempo do arquivo.
  Viram textos centralizados com fundo escuro, um por camada, editáveis como qualquer texto. O mesmo diálogo
  baixa as legendas do projeto em **.srt**, para subir junto com o vídeo.
- **Trocar o FPS** (12/24/30/60) mantém tudo no mesmo segundo: keys, clipes, marcadores e áudio são
  reescalados, como no After Effects (e dá para desfazer).
- **Timeline em segundos ou quadros**, com zoom (Ctrl + roda do mouse, ancorado no cursor) para ajustar
  quadro a quadro ou ver minutos inteiros; a vista acompanha o cursor durante o play.
- **Projeto em arquivo** `.fmproj` (Ctrl+S / Ctrl+O), autosave com recuperação, e o app instalado abre
  `.fmproj` direto do sistema. O cabeçalho mostra se a cópia no navegador está pendente, salvando,
  salva ou falhou, com nova tentativa em caso de erro. Ela é gravada após 1,5 s sem alterações e o
  salvamento é antecipado ao colocar a aba em segundo plano. Use Ctrl+S para guardar um arquivo:
  a cópia de recuperação pertence a este navegador e depende do armazenamento local disponível.
  Uma falha ao ler ou restaurar essa cópia não a apaga nem permite que seja sobrescrita automaticamente.
- **Export** MP4 (H.264) ou WebM transparente, com trecho de frames, codificado via WebCodecs com tempo exato.
  Imagens ausentes ou inválidas interrompem a exportação de vídeo/PNG com um aviso para reimportá-las,
  em vez de produzir uma cena incompleta.
  O diálogo mostra preparação, renderização e finalização do arquivo; chega a 100% apenas quando
  o arquivo está pronto. A preparação/renderização pode ser cancelada, sem baixar um arquivo parcial,
  e as opções ficam disponíveis para tentar novamente. O cancelamento fica indisponível na finalização.
  Erros aparecem no próprio diálogo; um vídeo de fundo que não consegue carregar o frame solicitado
  interrompe a exportação em vez de repetir o frame anterior silenciosamente.
- IA opcional (Gemini) para imagens e um copiloto de roteiro, com a chave do servidor ou a sua própria chave
  (ícone de chave no copiloto ou no gerador de imagens), que fica só no navegador e fala direto com o Google.
- Interface em **português (BR)** e **inglês (US)**, escolhida no canto superior direito e lembrada no navegador.

## Desenvolvimento

Requer Node 20+.

```bash
npm install
npm run dev        # http://localhost:3000 (Express + Vite)
npm test           # Vitest (keyframes, rig do boneco, caminhos, áudio, formato de projeto)
npm run lint       # typecheck
npm run i18n:scan  # textos da interface fora dos dicionários (src/i18n)
npm run build && NODE_ENV=production npm start   # build de produção (necessário para testar o PWA)
```

O CI (`.github/workflows/ci.yml`) roda typecheck, testes, `i18n:scan` e build em todo PR.

Ao abrir `.fmproj`, configurações fornecidas devem ter FPS inteiro de 1 a 120, dimensões inteiras
de 2 a 8192 px por lado e duração de 1 a 1.000.000 de quadros. Campos ausentes em projetos antigos
continuam recebendo os valores padrão; configurações inválidas e estruturas de conteúdo incompatíveis
são rejeitadas antes de substituir a cena atual.

Para os recursos de IA, defina `GEMINI_API_KEY` no `.env` (veja `.env.example`) ou deixe cada usuário colar a
própria chave no app (ícone de chave): assim o app instalado ou hospedado só como site estático também usa a IA.

## Arquitetura

| Pasta | Conteúdo |
|---|---|
| `src/ai/` | IA: prompts compartilhados entre servidor e navegador (`prompts.ts`), chave própria (`aiKey.ts`) e a escolha do caminho, servidor ou direto com o Google (`aiClient.ts`). |
| `src/engine/` | Funções puras e testadas: keyframes, easing e caminhos (`keyframes.ts`), atores (`actor.ts`), rig do boneco (`stickRig.ts`) e poses-chave do boneco (`stickActor.ts`), tempo dos clipes de áudio (`audio.ts`). |
| `src/audio/` | Web Audio: decodificação, playback, scrub, mixagem do export e importação de áudio/vídeo. |
| `src/utils/exportVideo.ts` | `renderCompositeFrame` desenha um frame (preview e export usam a mesma função) e o export via mediabunny. |
| `src/project/` | Formato `.fmproj`, abrir/salvar (File System Access API) e autosave (IndexedDB). |
| `src/map/` | Mapa-múndi (world-atlas / Natural Earth) e o template de rota. |
| `src/components/` | Interface (palco, timeline, inspectors, diálogos). |

O código de projeção e os dados do mapa são carregados apenas ao abrir a configuração de rota,
com aviso e nova tentativa se falharem. A timeline calcula os indicadores de desenho a partir dos
quadros com conteúdo e os reutiliza durante a reprodução; limpar o projeto não cria quadros vazios
para toda a duração. A exportação aceita um `AbortSignal` para cancelar esperas e liberar os encoders.

A pesquisa que orientou o projeto está em [`docs/RESEARCH.md`](docs/RESEARCH.md) e o plano/decisões em
[`docs/ROADMAP.md`](docs/ROADMAP.md).
