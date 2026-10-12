# FlashMotion MCP e automação

O servidor MCP local está implementado. Ele usa stdio com o SDK oficial e uma ponte
WebSocket autenticada para a cena aberta no editor. Não depende de cliques automatizados.

## Iniciar

```bash
npm install
npm run local
```

O comando compila o editor e `dist/mcp.mjs`, inicia o servidor em `127.0.0.1:3000` e abre
`http://localhost:3000/?mcp=1`. A janela mostra **MCP: conectado**. Mantenha o servidor
local em execução. No PWA instalado, clique em **Conectar agentes (MCP)**.
**Desconectar** encerra a ponte sem recarregar o editor ou perder alterações.

A sessão temporária dura 8 horas a partir da conexão e fica em `localStorage` com
identificador e horário de expiração; ela não armazena a credencial Bearer nem chaves de IA.
O editor retoma a conexão após recarregar, mesmo sem `?mcp=1`, até a expiração.
A interface mostra o horário limite. Abas da mesma origem compartilham a sessão;
desconectar revoga a autorização em todas elas. Um URL antigo com `?mcp=1` não reativa
uma sessão encerrada: clique em **Conectar agentes (MCP)** para iniciar outra.
O parâmetro `?mcp=1` inicia a primeira sessão quando ainda não há uma preferência gravada.
Se localStorage estiver bloqueado, a conexão funciona somente enquanto essa página permanecer aberta.

Cada aba mantém seu próprio `windowId` em sessionStorage e o reapresenta ao reconectar,
inclusive após reiniciar o servidor. Abas duplicadas recebem IDs distintos se o ID já estiver em uso.
`list_windows` também retorna `sessionId` e `expiresAt`. A sessão não mantém um modelo ou
um processo do agente em execução: servidor, aba e cliente MCP continuam necessários.

O servidor gera um token novo ao iniciar e grava `.local/mcp-session.json` com permissão
0600, numa pasta ignorada pelo Git. O cliente MCP lê esse arquivo a cada chamada;
não há token para copiar para a configuração dos agentes.

## Configurar clientes

```bash
npm run mcp:config
```

Esse comando imprime comandos para Codex e Claude Code, além de JSON para Claude Desktop,
com caminhos absolutos do executável Node e do MCP nesta instalação. Use o Node instalado;
um caminho como `/usr/bin/node` não existe em todos os sistemas.

Exemplos (substitua os caminhos pelos impressos pelo comando):

```bash
codex mcp add flashmotion -- /caminho/do/node /caminho/do/projeto/dist/mcp.mjs
claude mcp add --scope local --transport stdio flashmotion -- /caminho/do/node /caminho/do/projeto/dist/mcp.mjs
```

Codex registra o MCP globalmente. Claude Code com `--scope local` registra apenas para
você neste projeto; execute o comando na pasta do projeto. Verifique com:

```bash
codex mcp get flashmotion
claude mcp get flashmotion
```

Abra uma nova sessão do agente após adicionar o servidor. Para Claude Desktop,
incorpore o JSON impresso em `mcpServers` da configuração existente e reinicie o aplicativo.
O servidor usa caminhos absolutos e funciona mesmo se o cliente tiver outro diretório de trabalho.

Para usar outro arquivo de sessão, configure o comando com os argumentos adicionais
`--session-file /caminho/absoluto/mcp-session.json`. Um clone do projeto tem sua própria sessão.
`PORT=3001 npm run local` permite outra porta; mantenha a mesma porta para preservar
instalação e autosave. Não configure a ponte para uma interface de rede pública.

## Ferramentas

| Ferramenta | Argumentos | Resultado |
|---|---|---|
| `list_windows` | Nenhum | Janelas conectadas, IDs e estado atualizado a cada 2 s. |
| `get_status` | `windowId` | Estado atual: frame, FPS, duração, alterações, reprodução, recuperação e exportação. |
| `get_project` | `windowId` | `{ file, revision }`: JSON `.fmproj` e revisão SHA-256 do conteúdo. |
| `replace_content` | `windowId`, `content`, `expectedRevision` | Substitui o conteúdo como um passo desfazível, retornando o estado após o commit de React. |
| `seek` | `windowId`, `frame` | Pausa e move o cursor; frames inteiros de 1 até `totalFrames`. |
| `set_playing` | `windowId`, `playing` | Inicia/pausa a reprodução. |
| `render_frame` | `windowId`, `frame` | Imagem PNG nativa do MCP, sem grade ou seleção do editor. |
| `load_project` | `windowId`, `path` (absoluto) | Substitui o projeto inteiro (nome, FPS, canvas, duração e conteúdo) pelo `.fmproj` lido do caminho. Alterações não salvas dessa janela são descartadas. |
| `export_video` | `windowId`, `outputPath` (absoluto), `format` (`mp4` ou `webm-alpha`, opcional), `overwrite` (opcional), `includeAudio` (opcional, padrão `true`), `startFrame` e `endFrame` (opcionais, intervalo inclusivo) | Renderiza a linha do tempo (ou o trecho), grava o arquivo no caminho indicado (extensão compatível, dentro de uma pasta permitida) e aguarda o fim da exportação. Retorna `outputPath`, `bytes` e `extension`. O áudio da timeline (narração, música e efeitos do `add_sfx`) entra na mixagem, a menos que `includeAudio` seja `false`; se o navegador não conseguir codificar o áudio, ele é omitido. |
| `set_camera` | `windowId`, `camera` (objeto ou `null`) | Substitui a câmera virtual inteira como um passo desfazível (`base` e `tracks`; campos `panX`/`panY` em pixels a partir do centro do canvas, `zoom` de 0.05 a 20, `rotation` em graus; cada keyframe tem a forma `{frame, value, easing?}`). `null` remove a câmera. Move os objetos, não o fundo. |
| `set_effects` | `windowId`, `objectId`, `base?`, `tracks?` | Sombra, glow, desfoque e tint em UM objeto (texto, gráfico, ator ou boneco; `objectId` vem de `get_project`) como um passo desfazível. Cada efeito fica desligado enquanto seu gatilho é 0: `shadowOpacity` (0..1; também `shadowBlur` 0..100, `shadowX`/`shadowY` -200..200, `shadowColor`), `glowRadius` (0..100; `glowStrength` 0..1, `glowColor`), `blur` (0..100) e `tintAmount` (0..1; `tintColor`). `base` MESCLA nos valores estáticos (números são limitados à faixa; cores `#rrggbb`). `tracks` traz keyframes `{frame, value, easing?}` por propriedade numérica e SUBSTITUI as keys dela (`[]` remove). Raios em pixels de saída. Ex.: entrada com desfoque `{"tracks":{"blur":[{"frame":1,"value":12},{"frame":20,"value":0}]}}`. |
| `add_sfx` | `windowId`, `kind`, `frames` (1 a 32 quadros, base 1), `volume` (0 a 2, opcional) | Adiciona um efeito sonoro GERADO por código (sem arquivos nem rede, embutido no projeto) em cada quadro, como um passo desfazível. `kind`: `whoosh` (0,7 s, entradas e deslizes), `impact` (1,1 s, golpes e revelações), `riser` (2 s, tensão até um momento), `pop` (0,18 s, itens aparecendo) e `tick` (0,06 s, contadores). Retorna os ids dos clipes e `fitsTimeline` (`false` = algum clipe termina depois do fim da timeline). |
| `render_contact_sheet` | `windowId`, `frames` ou `count` (padrão 6), `startFrame`, `endFrame`, `columns` (1–6, padrão 3), `cellWidth` (160–960, padrão 480) | Um PNG em grade, uma célula por frame, rotulada com o número do frame (máximo 24). Exige reprodução pausada. |
| `lint_scene` | `windowId` | Verifica problemas antes de exportar: texto pequeno demais, fora da área segura, contraste baixo, textos vazios, objetos após o fim da linha do tempo. Retorna `{ issues }` (lista vazia = sem problemas). |
| `describe_scene` | `windowId` | Resumo compacto da linha do tempo: o que aparece e quando (em segundos), marcadores, duração e se há câmera. |
| `list_templates` | `windowId` | Lista os modelos com id, parâmetros, valores padrão e limites. |
| `apply_template` | `windowId`, `templateId`, `values` (opcional), `startFrame` (opcional) | Insere o modelo como objetos editáveis, numa única edição desfazível. Começa no frame atual se `startFrame` não for informado. Retorna `fitsTimeline=false` quando o modelo termina depois do fim do projeto. |

Fluxo de edição:

1. Chame `list_windows` e escolha explicitamente o ID da janela desejada.
2. Chame `get_project` nessa janela.
3. Edite uma cópia de `file.project.content`, preservando os objetos que deseja manter.
4. Chame `replace_content` com o conteúdo completo e `expectedRevision` igual à revisão lida.
5. Confira a cena ou renderize um frame. O usuário pode desfazer com Ctrl+Z e salvar com Ctrl+S.

Exemplo de instrução ao agente:

> Use o MCP flashmotion. Liste as janelas e, na janela do meu projeto, leia a cena e acrescente
> um marcador chamado “Entrada” no frame 24, preservando os objetos. Renderize o frame 24.

`replace_content` não altera nome, FPS, dimensões ou arquivo aberto. A revisão protege
contra alterações feitas depois da leitura. Se receber `REVISION_CONFLICT`, leia novamente
e refaça a edição sobre o conteúdo atual. Nunca reutilize uma revisão antiga automaticamente.

A validação reaproveita o parser de `.fmproj`: verifica estruturas e migra versões antigas,
mas não valida integralmente cada campo de cada objeto. Use `src/types.ts` e os construtores
em `src/engine/` para criar conteúdo válido.

## Fluxo recomendado para animar com o Claude

1. `list_windows` → escolha a janela; `describe_scene` para se orientar.
2. `list_templates` → `apply_template` (cartão de data, citação, título…) em vez de escrever JSON à mão.
3. `set_camera` para zoom lento/pan (a câmera move os objetos, não o fundo). `add_sfx` para som (whoosh nas entradas, impacto nas revelações, riser antes do momento forte; o `export_video` já mixa). `set_effects` para sombra em legendas sobre vídeo, glow de destaque e entradas com desfoque (`blur` 12 → 0). O modelo `glowTitle` (via `apply_template`) já traz glow e entrada desfocada.
4. Ajustes finos com `get_project` → `replace_content` (use `fontFamily`, `fontWeight`, `italic`, `letterSpacing` em textos; famílias: Plus Jakarta Sans, Inter, Cormorant Garamond, JetBrains Mono, IBM Plex Mono).
5. `render_contact_sheet` (6 quadros) para revisar tudo de uma vez; `render_frame` para um quadro em detalhe.
6. `lint_scene` antes de exportar (inclui `blurred-text`, `dead-air`, `uniform-entrance`, `mask-missing` e `mask-span`); `export_video` (`mp4` ou `webm-alpha`) para o arquivo final.

### Laço de revisão (olhar, dar nota, corrigir)

Um vídeo bom raramente sai na primeira tentativa. Depois de montar a cena:

1. `render_contact_sheet` com `count` 6–12 e dê uma nota de 1 a 10 por plano em: composição, movimento,
   tipografia/legibilidade e sincronia com marcadores ou áudio.
2. Anote os três piores problemas e corrija só eles (`set_effects`, `set_camera`, `replace_content`).
3. `lint_scene` e `describe_scene` (que agora lista os efeitos de cada objeto em `effects`) para conferir.
4. Repita até todo plano ter nota 8 ou mais. Evite os padrões de fábrica: texto centralizado com fade em
   tudo, mesma cor e mesma entrada em todos os objetos. Varie entrada, easing e destaque por objeto.

### Máscaras e revelar traços

Um ator `shape` com `maskOnly: true` não é desenhado: só recorta outros objetos. O objeto recortado ganha
`mask: { actorId, mode }` (`inside` mostra só o que está dentro da forma; `outside`, só o que está fora). Serve
para texto, ator, gráfico e boneco; a forma pode ser retângulo, elipse ou seta (não `line`). Via `replace_content`:

```json
{
  "actors": [
    { "id": "cut", "name": "Janela", "kind": "shape", "src": "", "maskOnly": true,
      "width": 600, "height": 200, "flipX": false, "startFrame": 1, "durationFrames": 96,
      "shape": { "type": "rect", "fill": "#ffffff", "stroke": "#000000", "strokeWidth": 0, "radius": 24 } },
    { "id": "box", "name": "Caixa", "kind": "shape", "src": "", "width": 400, "height": 240, "flipX": false,
      "startFrame": 1, "durationFrames": 96,
      "shape": { "type": "rect", "fill": "#00000000", "stroke": "#ffffff", "strokeWidth": 6, "radius": 0, "draw": { "frames": 24 } } }
  ],
  "texts": [
    { "id": "t1", "text": "Revelado", "startFrame": 1, "durationFrames": 96, "mask": { "actorId": "cut", "mode": "inside" } }
  ]
}
```

(Os objetos reais têm mais campos: parta de `get_project` e acrescente só os de cima.) Animar a posição ou a escala
do ator-máscara faz a janela se mover e revelar o texto. `shape.draw.frames` traça o contorno da forma nesse número
de quadros e depois entra o preenchimento; num caminho (`paths`), `style.reveal: "draw"` com `drawFrames` o traça sozinho.

Duas regras do `lint_scene` cuidam disso: `mask-missing` (erro: o `actorId` não existe, não é `shape`, é `line` ou é o
próprio objeto) e `mask-span` (aviso: o ator-máscara some antes do fim, ou entra depois do início, do objeto recortado;
fora do intervalo o objeto aparece inteiro). `describe_scene` lista `maskOnly` e `mask` nos itens.

Repetir e tremida: cada objeto aceita `modifiers` (via `replace_content`), por propriedade de transformação
(`position`, `scale`, `rotation`, `opacity`): `{"rotation":{"loop":"pingpong"},"position":{"shake":{"amount":4,"periodFrames":6}}}`.
`loop` (`cycle` | `pingpong`) repete as keys depois da última; `shake` soma ruído suave de ±`amount` (px na posição,
razão em escala e opacidade, graus na rotação) com novo alvo a cada `periodFrames` quadros.

O palco do editor mostra a cena **sem** a câmera (para editar no espaço da cena); a câmera aparece em `render_frame`, contact sheet e exportação.

## Erros e limites

- `LOCAL_APP_NOT_RUNNING` / `LOCAL_APP_UNREACHABLE_OR_TIMEOUT`: execute `npm run local`.
- Lista de janelas vazia: conecte a janela pelo botão ou abra `/?mcp=1`.
- `WINDOW_NOT_CONNECTED`: a janela foi fechada/desconectada; liste as janelas novamente.
- `RECOVERY_PENDING`: resolva a recuperação de autosave na interface antes de editar.
- `EXPORT_IN_PROGRESS` / `WINDOW_BUSY` / `RENDER_IN_PROGRESS`: aguarde a operação atual.
- `PLAYBACK_ACTIVE`: pause antes de renderizar.
- `COMMAND_TIMEOUT_RESULT_UNKNOWN` / `WINDOW_DISCONNECTED_RESULT_UNKNOWN`: o resultado
  pode ter sido aplicado. Leia o estado antes de repetir uma edição.
- `ABSOLUTE_PATH_REQUIRED`: `load_project` e `export_video` exigem caminho absoluto.
- `PATH_NOT_ALLOWED`, `FILE_NOT_READABLE`, `INVALID_OUTPUT_EXTENSION`, `OUTPUT_EXISTS`: veja Segurança.

Há no máximo 16 conexões WebSocket e uma chamada em andamento por janela. O timeout
é 30 s, e o limite de payload da ponte é 50 MiB. Um timeout desconecta a janela; ela tenta
reconectar automaticamente enquanto a sessão não tiver expirado. O servidor também verifica
validade e encerra o WebSocket ao expirar, mesmo se o navegador atrasar seus timers. Os limites do próprio cliente MCP podem ser menores.
O token muda quando o servidor reinicia; a ponte busca o token novo ao reconectar.

Codex e Claude podem usar o mesmo servidor local, selecionando cada janela por ID.
O MCP não oferece execução arbitrária de JavaScript, chaves de IA nem salvamento do `.fmproj`
(Ctrl+S continua na interface). Leitura e escrita de arquivos ficam restritas a `load_project`
(abre um `.fmproj`) e `export_video` (grava o vídeo), ambos com caminho absoluto; veja a seção Segurança.
O vídeo de referência não fica embutido em `.fmproj`. `render_frame` busca o tempo do vídeo
solicitado e restaura o tempo anterior ao terminar.

A ponte só é habilitada com `FLASHMOTION_MCP=1` e `HOST=127.0.0.1` (`npm run local` define
ambos). Confere conexão loopback, Host e Origin; chamadas HTTP de agentes exigem Bearer,
e o WebSocket exige autenticação inicial. A credencial de bootstrap só é entregue a requisições
com `Sec-Fetch-Site: same-origin`. Requisições de origem externa são rejeitadas.

### Segurança

`load_project` e `export_video` só acessam pastas permitidas. Por padrão são a pasta do projeto e a
pasta temporária do sistema; inclua outras com `--allow-root <pasta>` (repetível) nos argumentos do
servidor MCP ou com a variável `FLASHMOTION_MCP_ROOTS` (pastas separadas por `:` no Linux/macOS e `;`
no Windows). Só valem caminhos absolutos; links simbólicos são resolvidos antes da checagem.

- `load_project`: o arquivo precisa estar numa pasta permitida, ser um arquivo comum `.fmproj` ou `.json`
  e ter até 45 MiB. Falhas retornam `PATH_NOT_ALLOWED` ou `FILE_NOT_READABLE`, sem detalhar o motivo.
- `export_video`: a extensão precisa casar com o formato (`.mp4` ou `.webm`), o destino precisa estar numa
  pasta permitida e não pode ser um link simbólico. Um arquivo existente só é substituído com
  `overwrite: true` (senão `OUTPUT_EXISTS`). O vídeo é gravado em um arquivo `.tmp` e renomeado ao
  final, e o caminho é validado antes e depois da exportação.

Exemplo: `claude mcp add --scope local --transport stdio flashmotion -- <node> <projeto>/dist/mcp.mjs --allow-root ~/Videos`.
Mesmo assim, o servidor roda com as permissões do usuário: não dê a pastas sensíveis o status de permitidas.

## Editor online e agente local

É possível, mas a ponte atual aceita somente localhost e não implementa pareamento remoto.
A sessão em localStorage, sozinha, não dá a um processo local acesso a uma página hospedada.

A arquitetura recomendada é um relay autenticado no backend da aplicação:

1. O usuário entra no editor HTTPS e autoriza uma sessão temporária para o agente.
2. O agente local se autentica ou usa um código de pareamento de uso único.
3. A aba conecta por WSS e o agente abre uma conexão de saída por HTTPS/WSS com o relay.
4. O relay encaminha somente os comandos dessa conta, sessão e janela, até a expiração/revogação.

Assim o computador não precisa abrir portas de entrada. O cliente pode usar um adaptador
MCP stdio local ou um endpoint MCP Streamable HTTP remoto. Autenticação, isolamento entre
usuários, expiração, revogação e limites de payload precisam existir no servidor;
o sessionId não deve servir como credencial. Essa opção ainda não está implementada.

Outra opção é um helper local pareado, acessível pelo site online. Isso exige permitir
explicitamente a origem hospedada, autenticar o pareamento e lidar com HTTPS/WSS,
CORS e restrições/permissões do navegador para acesso à rede local. A ponte atual rejeita
essa origem de propósito; liberar qualquer Origin não é uma solução adequada.

Referências: [Transportes MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[Chrome — acesso à rede local](https://developer.chrome.com/blog/local-network-access).

## API direta no navegador

Em `/?automation=1`, ou numa janela conectada ao MCP, existe `window.flashmotion`:

| Método | Resultado |
|---|---|
| `getStatus()` | Estado atual. |
| `getProject()` | Cópia do JSON `.fmproj`. |
| `replaceContent(content)` | Edição validada e desfazível, sem controle de revisão na API direta. |
| `seek(frame)` / `setPlaying(boolean)` | Navegação e reprodução. |
| `await renderFrame(frame)` | PNG como data URL. |

Essa API exige uma ferramenta capaz de executar JavaScript no contexto da página.
As atualizações de React são assíncronas na API direta; leia o estado numa execução posterior.
Na ponte MCP, o commit é concluído antes da resposta de uma mutação.

## Verificação

```bash
npm run lint
npm test
npm run i18n:scan
npm run build
npm run mcp:check
```

Os testes de integração usam o SDK MCP e conexões WebSocket/HTTP reais, verificando
edição, revisão, autenticação, origem, frames, imagens, timeout e desconexão.
`mcp:check` verifica o processo de produção por stdio sem exigir uma janela aberta.

## Decisão de arquitetura

**Status:** Implementado. **Data:** 2026-10-05.

O Express coordena as janelas e armazena a credencial local. Cada cliente MCP inicia um
processo stdio independente, que encaminha comandos autenticados ao mesmo Express.
A cena permanece em React; a ponte executa apenas os comandos tipados da API do editor.
Isso permite compartilhar a cena real entre agentes e usar o renderizador existente,
sem um segundo editor ou processo de navegador controlado pelo MCP.

Referências: [MCP TypeScript SDK — servidor](https://ts.sdk.modelcontextprotocol.io/server),
[File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access),
[File Handling API](https://developer.chrome.com/docs/capabilities/web-apis/file-handling).
