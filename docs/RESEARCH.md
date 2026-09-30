# Pesquisa: como ferramentas semelhantes resolvem animação

Objetivo do FlashMotion Studio: **criar animações** (boneco palito, um avião que "pousa" em vários
países, gráficos e números que crescem) para **enriquecer vídeos** ou virar vídeos por si só.
**Não** é um editor de vídeo: o vídeo de fundo, quando existe, é só referência de tempo/composição.

## 1. Adobe Flash / Animate

| Conceito | Como funciona | O que aproveitamos |
|---|---|---|
| **Keyframe + tween** | Toda animação tem pelo menos 2 keyframes (início e fim); o Animate interpola os quadros do meio. | Modelo central: o usuário define poucos keyframes, o motor calcula o resto. |
| **Motion tween** (moderno) | Um objeto (símbolo) com propriedades animadas; o caminho de movimento é criado automaticamente e é editável. | "Ator" com trilhas de propriedades (x, y, escala, rotação, opacidade). |
| **Classic tween** (legado) | Tween entre dois keyframes de instância; mais rígido. | Útil para poses de boneco: interpolar entre dois quadros-chave de pose. |
| **Motion guide + Orient to path** | Um traço guia define a trajetória; "Orient to path" gira o objeto para seguir a tangente. | Avião seguindo a rota e apontando o nariz na direção do voo. |
| **Onion skin** | Mostra quadros vizinhos esmaecidos enquanto edita. | Já existe; manter só no editor. |
| **Bone tool / IK** | Ossos em cadeia pai-filho; você define poses inicial/final e o Animate interpola. Cria uma "pose layer". | Boneco palito: rotação hierárquica (FK) e interpolação de poses por ângulo. |

## 2. After Effects

- **Stopwatch / auto-keyframe**: mudar uma propriedade com o relógio ligado cria um keyframe no tempo atual.
  → No FlashMotion: mover um ator no palco grava (ou atualiza) o keyframe no quadro atual.
- **Interpolação espacial** (o caminho) é separada da **temporal** (a velocidade). O padrão espacial é
  *Auto Bezier*, que suaviza o caminho automaticamente.
  → Caminho suave via spline Catmull-Rom pelos keyframes de posição (equivalente prático do Auto Bezier),
  com opção de caminho reto (linear).
- **Easy Ease (F9)** e Graph Editor para a velocidade.
  → Easing por keyframe (linear, suave, entrada/saída, "segurar", elástico, com recuo).
- Tipos de keyframe mostrados por formas diferentes na timeline (losango, círculo, ampulheta).
  → Losangos na timeline, clicáveis para pular até o quadro.

## 3. Remotion

- Vídeo é função do quadro: `frame → UI`. `interpolate(frame, [in], [out], {extrapolate: 'clamp'})` e `spring()`.
- `<Sequence from durationInFrames>` limita um elemento a um trecho do tempo.
- Renderização no navegador (`renderMediaOnWeb`) e **vídeo transparente só em WebM/MKV com VP8/VP9**.
- Licença gratuita só para indivíduos/empresas pequenas.
→ Nosso renderer já é "frame → canvas" (mesma filosofia). Adotamos `clamp`, trechos de tempo por objeto e
  export transparente em WebM VP9. Não adotamos Remotion como dependência: a interface é visual (sem código),
  o motor atual já faz o essencial, e evitamos a licença.

## 4. Motion Canvas

- Animações em TypeScript com *generators*, tweens com funções de tempo, editor com timeline sincronizada a
  **narração**.
→ Confirma a necessidade de sincronizar com a voz. Candidato futuro: importar áudio de referência com a
  forma de onda na timeline.

## 5. Pivot Animator (bonecos palito)

- Figura = segmentos ligados por juntas pivotantes. Arrastar a ponta de um segmento **gira em torno do pivô**
  mantendo o comprimento; a "origem" move a figura inteira.
- Onion skin por figura (cada figura tem um ID que a associa entre quadros).
→ Arrastar junta deve girar o osso em volta do pai e levar os filhos junto (FK). Hoje a junta move solta e
  deforma o boneco.

## 6. Rive / Lottie / Jitter

- Rive: interativo, state machines. Lottie: formato JSON de playback amplamente suportado. Jitter: rápido,
  focado em UI/Figma, sem rigs de personagem.
→ Fora do foco (entregamos vídeo, não animação interativa). Export Lottie pode ser futuro.

## 7. Apps de mapa de viagem (TravelBoast, Travel Animator, Mapanim)

- Escolhe origem → destinos, veículo (avião, carro…), estilo do mapa; o app gera a rota animada.
→ Caso do "avião que pousa em vários países": mapa-múndi vetorial + lista de países → keyframes de posição
  gerados nos centroides, com orient-to-path. Dados: `world-atlas` (Natural Earth, domínio público).

## Conclusões para o produto

1. **Keyframes por propriedade** (After Effects / motion tween) para objetos: sem cópia de cena por quadro.
2. **Caminho suave + orientar ao caminho** (motion guide / Auto Bezier).
3. **Auto-keyframe** ao arrastar no palco.
4. **Boneco com FK** e **interpolação de pose** (bone tool / classic tween).
5. **Salvar/abrir projeto** local (PWA com acesso a arquivos).
6. **Export transparente** (WebM VP9 + alpha) para usar como camada em qualquer editor de vídeo.
7. **Template de mapa** com rota entre países.

## Fontes

- [Animate: classic tweens](https://helpx.adobe.com/animate/how-to/classic-tweens.html) ·
  [motion vs classic tween](https://helpx.adobe.com/animate/using/differences-between-motion-and-classic-tweens.html) ·
  [editar motion path](https://helpx.adobe.com/animate/using/editing_the_motion_path_of_a_tween_animation.html) ·
  [bone tool / IK](https://helpx.adobe.com/animate/using/bone-tool-animation.html)
- [After Effects: keyframe interpolation](https://helpx.adobe.com/after-effects/using/keyframe-interpolation.html) ·
  [tipos de keyframe (School of Motion)](https://schoolofmotion.com/blog/after-effects-keyframe-types)
- [Remotion interpolate](https://www.remotion.dev/docs/interpolate) · [spring](https://www.remotion.dev/docs/spring) ·
  [renderMediaOnWeb](https://www.remotion.dev/docs/web-renderer/render-media-on-web)
- [Motion Canvas: tweening](https://motioncanvas.io/docs/tweening/) · [intro](https://motioncanvas.io/docs/)
- [Pivot Animator help](https://pivotanimator.net/Pivot_Animator_Help_4-2.pdf) · [onion skins](https://pivotanimator.net/help4-2/onion_skins.htm)
- [Rive vs Lottie 2026](https://www.pkgpulse.com/guides/lottie-vs-rive-vs-css-animations-web-animation-formats-2026) ·
  [ferramentas de motion design 2026](https://lottiefiles.com/blog/design-guides-and-tips/best-motion-design-tools-ranked-by-use-case)
- [Travel Animator](https://www.travelanimator.com/) · [Mapanim: apps de mapa 2026](https://mapanim.com/blog/best-travel-map-animation-apps-and-tools-2026)

---

# Rodada 2 (set/2026): o que o Flash tinha e ainda falta, e o que as ferramentas de criador fazem

Critério de prioridade: **vídeo narrado** (documentário com imagens e voz, explicativo com gráficos e
bonecos) antes de ilustração ou interatividade. Esforço: P (dias de trabalho de um PR), M (2–3 PRs), G (mudança de
arquitetura).

## Já coberto (não repetir)

Keyframes por propriedade com easing, caminho suave e "orientar ao caminho", motion guide (caminhos),
onion skin, boneco com FK e poses-chave, formas editáveis, textos e gráficos animados, marcadores, áudio com
forma de onda e scrub, legendas (roteiro, .srt/.vtt, trilha única), modelos, export MP4 e WebM com alfa,
girar/escalar no palco.

## Lacunas

| Recurso | Quem tem | Valor para vídeo narrado | Esforço | Nota |
|---|---|---|---|---|
| **Câmera** (pan/zoom/rotação da cena inteira, com keyframes) + camadas presas à câmera | Animate (Camera tool, desde 2017), AE | **Alto**: é o "Ken Burns" dos documentários; zoom num gráfico ou no mapa | M | Genérico: um transform de cena antes dos objetos. Legendas e terço inferior ficam "presos à câmera" (não dão zoom). Base para parallax. |
| **Filtros por objeto**: sombra, brilho (glow), desfoque; **efeito de cor** (tint, brilho, alfa) | Animate (filtros e color effect por instância), AE | **Alto**: legibilidade de texto sobre vídeo, destaque | P | `ctx.shadow*` e `ctx.filter` do canvas; animáveis como qualquer propriedade. |
| **Legenda palavra por palavra** (karaokê: realça a palavra falada) | CapCut, Captions, Submagic | **Alto** em vídeo curto (Shorts/Reels) | M | O VTT do Whisper traz o tempo de cada palavra (`<00:00:01.200>` dentro da cue); hoje o leitor joga isso fora. Sem tempo por palavra, dá para distribuir pelo tamanho. |
| **Máscara** (camada que recorta a de baixo) | Animate (mask layer), AE (track matte) | Médio: revelar mapa, foco/spotlight, texto saindo de trás de algo | M | Camada `mask` com `ctx.clip`/composição; a máscara pode ser animada. |
| **Desenhar-se / revelar** traços, formas e texto (estilo quadro branco) | VideoScribe, Doodly | Médio: explicativos; caminhos já revelam | P | Estender o "revelar" dos caminhos para traços do lápis e contorno de formas; texto "escrito" letra a letra já existe (typewriter). |
| **Repetir/ciclo e tremida** por propriedade (loopOut, wiggle) | AE (expressões), Animate (loop de símbolo gráfico) | Médio: fundo vivo, ícone pulsando, câmera na mão | P | Por trilha: `loop: 'cycle' \| 'pingpong'` depois do último key; `wiggle(freq, amp)` determinístico (semente por objeto). |
| **Export GIF e sequência PNG** | Animate | Médio: GIF para web/redes; PNG para editores sem suporte a WebM alfa | P–M | PNG em ZIP é simples; GIF precisa de quantização (lib pequena). |
| **Símbolos / instâncias** (desenha uma vez, reusa; editar o símbolo muda todas as cópias) | Animate (graphic/movie clip), Moho | Médio: personagem reusado, ícones | G | Mexe no modelo de dados; só vale com demanda real. |
| **Shape tween** (uma forma vira outra) + dicas de forma | Animate | Baixo–médio: transições de ícone | M–G | Interpolar polígonos com reamostragem; as formas editáveis atuais são o ponto de partida. |
| **Lip sync** (boca segue a voz) | Animate (Auto Lip-Sync, 12 visemas), Moho | Baixo para os canais atuais (sem personagem falando); alto se houver apresentador animado | M | Versão simples: abrir a boca pela amplitude do áudio (já temos a forma de onda). |
| **Profundidade de camada / parallax** | Animate (Layer Depth), AE 3D | Baixo–médio | P depois da câmera | Cada camada anda uma fração do movimento da câmera. |
| **Pincel com suavização, balde de tinta, gradiente** | Animate (fluid brush, gap closing) | Baixo: o foco não é ilustração | M | Suavização do lápis é o item barato dessa lista. |
| **Smart bones / switch layers** | Moho | Baixo agora | G | Relevante só se o boneco virar personagem de verdade. |

## Recomendação (ordem)

1. **Filtros e efeito de cor por objeto** (P): o maior ganho visual por esforço, e deixa legenda e título legíveis
   em qualquer fundo.
2. **Câmera com keyframes** + "preso à câmera" (M): o recurso que mais falta para documentário com imagens
   (Ken Burns) e o que mais aproxima do Animate moderno.
3. **Legenda palavra por palavra** (M): aproveita o trabalho de legendas; decisivo para Shorts.
4. **Repetir/tremida por propriedade** (P): barato e elimina keyframes repetidos.
5. **Máscara** (M) e **revelar traços** (P): efeitos de explicativo.
6. **GIF/PNG** quando alguém pedir; **símbolos, shape tween, lip sync** só com demanda.

## Fontes (rodada 2)

- Animate: [shape tweens e dicas de forma](https://helpx.adobe.com/animate/using/shape-tweening.html) ·
  [máscaras (Classroom in a Book)](https://www.oreilly.com/library/view/adobe-animate-cc/9780134872292/ch08.xhtml) ·
  [símbolos](https://helpx.adobe.com/animate/using/symbols.html) ·
  [instâncias, color effect, frame picker e lip sync](https://helpx.adobe.com/animate/using/symbol-instances.html) ·
  [filtros](https://helpx.adobe.com/animate/using/graphic-filters.html) ·
  [Auto Lip-Sync](https://helpx.adobe.com/ee/animate/how-to/auto-lip-sync-sensei.html) ·
  [câmera](https://helpx.adobe.com/animate/using/working-with-camera-in-animate.html) ·
  [layer depth / parallax](https://helpx.adobe.com/animate/using/layer-depth.html) ·
  [GIF](https://helpx.adobe.com/animate/using/export-for-web.html) ·
  [sprite sheet / PNG](https://helpx.adobe.com/animate/desktop/workspace-and-workflow/create-sprite-sheet.html) ·
  [traço, preenchimento, gradiente](https://helpx.adobe.com/animate/using/strokes-fills-gradients.html) ·
  [fluid brushes](https://helpx.adobe.com/animate/using/fluid-brushes.html)
- After Effects: [exemplos de expressões (wiggle, loopOut)](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-examples/expression-examples.html) ·
  [wiggle (School of Motion)](https://schoolofmotion.com/blog/wiggle-expression)
- Ken Burns: [Wikipedia](https://en.wikipedia.org/wiki/Ken_Burns_effect) ·
  [no After Effects](https://www.macprovideo.com/article/after-effects/after-effects-animation-tips-ken-burns-effects)
- Quadro branco: [VideoScribe — animação "Draw"](https://help.videoscribe.co/knowledge/draw) ·
  [estilos de animação](https://blog.videoscribe.co/the-ultimate-guide-to-videoscribe-animation-styles)
- Legendas de criador: [CapCut palavra por palavra](https://capcutguide.com/capcut-word-by-word-captions/) ·
  [estilos de legenda do CapCut](https://www.kapwing.com/resources/how-to-get-capcut-caption-styles-and-best-alternatives/)
- Moho: [Moho vs Animate (Bloop)](https://www.bloopanimation.com/moho-vs-animate-cc/) ·
  [Moho (Wikipedia)](https://en.wikipedia.org/wiki/Moho_(software))
