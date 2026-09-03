-- Rewrite motion card prose and sources in first-party language.
-- Keep card ids, parameters, capabilities, and operation/verifier refs.

UPDATE motion_cards SET
  title_en = 'Reference analysis',
  title_ko = '레퍼런스 분석',
  definition_en = 'Reads a source clip as timing, grouping, and constraints a later scene can follow, without copying pixels.',
  definition_ko = '원본 클립을 픽셀 복제가 아니라 타이밍, 묶음, 제약으로 읽는다.',
  distinctions_json = '["a reference describes what to preserve; scene operations execute it","matching style is not the same as matching geometry"]',
  sources_json = '["https://github.com/westernbear/ref_studio"]'
WHERE id = 'reference';

UPDATE motion_cards SET
  title_en = 'Timing and easing',
  title_ko = '타이밍과 이징',
  definition_en = 'Sets when a property changes and the interpolation curve between keyframes.',
  definition_ko = '속성이 바뀌는 시점과 키프레임 사이 보간 곡선을 정한다.',
  distinctions_json = '["duration is elapsed frames; easing is the interpolation shape","anticipation moves away first; overshoot passes the target then settles"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/CSS/easing-function"]'
WHERE id = 'timing-easing';

UPDATE motion_cards SET
  title_en = 'Spatial choreography',
  title_ko = '공간 안무',
  definition_en = 'Places elements and moves them so spacing and paths stay readable over time.',
  definition_ko = '시간에 따라 읽히도록 요소 위치와 경로, 간격을 맞춘다.',
  distinctions_json = '["a position is a state; a trajectory is the path between states","static layout spacing is not choreography"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/CSS/transform"]'
WHERE id = 'spatial-choreography';

UPDATE motion_cards SET
  title_en = 'Layering',
  title_ko = '레이어 구성',
  definition_en = 'Orders and groups surfaces so occlusion and compositing carry hierarchy.',
  definition_ko = '가림과 합성이 위계를 말하도록 면의 순서와 묶음을 정한다.',
  distinctions_json = '["stack order hides; parenting inherits transforms","opacity does not replace stack order"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/CSS/z-index"]'
WHERE id = 'layering';

UPDATE motion_cards SET
  title_en = 'Transitions',
  title_ko = '전환',
  definition_en = 'Joins two beats or scenes with a cut, overlap, or a held pause.',
  definition_ko = '컷, 겹침, 혹은 멈춤으로 비트나 장면을 잇는다.',
  distinctions_json = '["a transition connects two states; an effect treats one state","a cut has no overlap; a dissolve shares frames"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/CSS/transition"]'
WHERE id = 'transitions';

UPDATE motion_cards SET
  title_en = 'Kinetic typography',
  title_ko = '키네틱 타이포그래피',
  definition_en = 'Moves readable type while keeping rank, rhythm, and a minimum hold.',
  definition_ko = '위계와 리듬, 최소 노출을 지키며 읽을 수 있는 글자를 움직인다.',
  distinctions_json = '["type rank is meaning; font size is one visual control","tracking changes spacing; scale changes glyph size"]',
  sources_json = '["https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html"]'
WHERE id = 'typography';

UPDATE motion_cards SET
  title_en = 'Path and morph',
  title_ko = '패스와 모프',
  definition_en = 'Moves a shape along a path, or interpolates between compatible outlines.',
  definition_ko = '경로를 따라 도형을 옮기거나, 호환되는 외곽선 사이를 보간한다.',
  distinctions_json = '["path motion relocates a shape; a morph changes the outline","a morph needs matching topology"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/SVG/Attribute/d"]'
WHERE id = 'path-morph';

UPDATE motion_cards SET
  title_en = 'Mask and matte',
  title_ko = '마스크와 매트',
  definition_en = 'Hides pixels with a vector boundary or with another layer channel.',
  definition_ko = '벡터 경계나 다른 레이어 채널로 픽셀을 가린다.',
  distinctions_json = '["a mask belongs to the layer; a matte reads another layer","a hard clip is binary unless feathered or driven by alpha"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/CSS/mask"]'
WHERE id = 'mask-matte';

UPDATE motion_cards SET
  title_en = 'Camera and 3D',
  title_ko = '카메라와 3D',
  definition_en = 'Composes depth with viewpoint motion, perspective, and layer distance.',
  definition_ko = '시점 이동, 원근, 레이어 거리로 깊이를 구성한다.',
  distinctions_json = '["camera motion moves the viewpoint; a layer transform moves content","parallax needs separated depth"]',
  sources_json = '["https://developer.mozilla.org/docs/Web/CSS/perspective"]'
WHERE id = 'camera-3d';

UPDATE motion_cards SET
  title_en = 'Lighting and compositing',
  title_ko = '조명과 합성',
  definition_en = 'Combines illumination, shadow, blend, and color so the frame reads as one image.',
  definition_ko = '빛, 그림자, 블렌드, 색을 한 화면으로 맞춘다.',
  distinctions_json = '["lighting models illumination; compositing stacks layers","a drop shadow implies lift; it is not a light"]',
  sources_json = '["https://www.w3.org/TR/compositing-1/"]'
WHERE id = 'lighting-compositing';

UPDATE motion_cards SET
  title_en = 'Effects',
  title_ko = '효과',
  definition_en = 'Applies a reviewed, bounded pixel treatment that supports the motion rather than replacing it.',
  definition_ko = '모션을 대체하지 않고 보조하는, 검토된 범위의 픽셀 처리를 적용한다.',
  distinctions_json = '["an effect treats pixels; a transform moves geometry","only reviewed templates are allowed; arbitrary scripts are not"]',
  sources_json = '["https://www.w3.org/TR/filter-effects-1/"]'
WHERE id = 'effects';

UPDATE motion_cards SET
  title_en = 'Audio synchronization',
  title_ko = '오디오 동기화',
  definition_en = 'Aligns picture beats to bounded cues, levels, and duration.',
  definition_ko = '화면 비트를 제한된 큐, 레벨, 길이에 맞춘다.',
  distinctions_json = '["a cue marks time; a waveform measures amplitude","picture rhythm may align without hitting every transient"]',
  sources_json = '["https://www.w3.org/TR/webaudio/"]'
WHERE id = 'audio';

UPDATE motion_cards SET
  title_en = 'Expressions',
  title_ko = '표현식',
  definition_en = 'Computes repeating animation values from reviewed templates and typed parameters.',
  definition_ko = '검토된 템플릿과 타입이 있는 파라미터로 반복 값을 계산한다.',
  distinctions_json = '["an expression computes a value; a keyframe stores one","approved templates are bounded; arbitrary code is not"]',
  sources_json = '["https://github.com/westernbear/ref_studio"]'
WHERE id = 'expressions';

UPDATE motion_cards SET
  title_en = 'Interaction',
  title_ko = '인터랙션',
  definition_en = 'Maps input and state changes to deterministic scene responses.',
  definition_ko = '입력과 상태 변화를 결정적인 장면 반응에 연결한다.',
  distinctions_json = '["interaction waits for input; a timeline can play without it","hover is unavailable on touch-only devices"]',
  sources_json = '["https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html"]'
WHERE id = 'interaction';

UPDATE motion_cards SET
  title_en = 'Verification and accessibility',
  title_ko = '검증과 접근성',
  definition_en = 'Checks scene predicates, deterministic frames, readable motion, and reduced-motion alternatives.',
  definition_ko = '장면 predicate, 결정적 프레임, 읽을 수 있는 모션, 약한 움직임 대안을 검사한다.',
  distinctions_json = '["verification scores machine predicates; review judges intent","reduced motion keeps meaning while cutting displacement"]',
  sources_json = '["https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html"]'
WHERE id = 'verification-accessibility';

DELETE FROM motion_aliases WHERE card_id = 'expressions' AND alias = 'wiggle 표현식';
INSERT INTO motion_aliases(card_id, alias, language)
VALUES ('expressions', 'oscillate 표현식', 'mixed');

DELETE FROM motion_cards_fts;
INSERT INTO motion_cards_fts(card_id, title_en, title_ko, definitions, aliases)
SELECT card.id, card.title_en, card.title_ko,
       card.definition_en || ' ' || card.definition_ko,
       group_concat(alias.alias, ' ')
FROM motion_cards AS card
JOIN motion_aliases AS alias ON alias.card_id = card.id
GROUP BY card.id;
