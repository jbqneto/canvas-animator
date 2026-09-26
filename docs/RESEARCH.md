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
