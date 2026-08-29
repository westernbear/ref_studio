CREATE TABLE motion_cards (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_ko TEXT NOT NULL,
  definition_en TEXT NOT NULL,
  definition_ko TEXT NOT NULL,
  distinctions_json TEXT NOT NULL CHECK (json_valid(distinctions_json)),
  parameters_json TEXT NOT NULL CHECK (json_valid(parameters_json)),
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
  operation_refs_json TEXT NOT NULL CHECK (json_valid(operation_refs_json)),
  verifier_refs_json TEXT NOT NULL CHECK (json_valid(verifier_refs_json)),
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json))
) STRICT;

CREATE TABLE motion_aliases (
  card_id TEXT NOT NULL,
  alias TEXT NOT NULL COLLATE NOCASE,
  language TEXT NOT NULL CHECK (language IN ('en','ko','mixed')),
  PRIMARY KEY (card_id, alias),
  UNIQUE (alias),
  FOREIGN KEY (card_id) REFERENCES motion_cards(id)
) STRICT;

CREATE VIRTUAL TABLE motion_cards_fts USING fts5(
  card_id UNINDEXED,
  title_en,
  title_ko,
  definitions,
  aliases,
  tokenize='unicode61'
);

INSERT INTO motion_cards VALUES
('reference','reference','Reference analysis','레퍼런스 분석','Decomposes observable motion into beats, relationships, and constraints without copying pixels.','관찰 가능한 모션을 픽셀 복제가 아닌 비트, 관계, 제약으로 분해한다.','["reference describes intent; scene operations describe execution","style similarity is not geometric identity"]','[{"name":"beat","unit":"frame","range":[0,100000]}]','["context.inspect","motion.lookup"]','["inspect_reference","annotate_beat"]','["beat_order","constraint_coverage"]','["https://arxiv.org/html/2502.13372"]'),
('timing-easing','timing-easing','Timing and easing','타이밍과 이징','Controls when change occurs and how velocity evolves between keyframes.','키프레임 사이에서 변화 시점과 속도 진행 방식을 제어한다.','["duration is elapsed time; easing is interpolation shape","overshoot exceeds the target; anticipation moves opposite first"]','[{"name":"duration","unit":"frame","range":[1,100000]},{"name":"overshoot","unit":"percent","range":[0,100]},{"name":"stagger","unit":"frame","range":[0,10000]}]','["keyframes","easing"]','["set_keyframes","set_easing"]','["keyframe_value","temporal_order","settle_frame"]','["https://arxiv.org/html/2502.13372","https://developer.mozilla.org/docs/Web/CSS/easing-function"]'),
('spatial-choreography','spatial-choreography','Spatial choreography','공간 안무','Coordinates element positions, trajectories, spacing, and visual balance over time.','시간에 따른 요소 위치, 궤적, 간격, 시각 균형을 조율한다.','["position is a state; trajectory is the path between states","layout spacing is static; choreography changes over time"]','[{"name":"x","unit":"px","range":[-100000,100000]},{"name":"y","unit":"px","range":[-100000,100000]}]','["position","path"]','["set_position","set_path"]','["bounds","collision","path_continuity"]','["https://arxiv.org/html/2502.13372"]'),
('layering','layering','Layering','레이어 구성','Orders visual elements and groups so occlusion and compositing express hierarchy.','가림과 합성이 위계를 표현하도록 시각 요소와 그룹의 순서를 정한다.','["layer order controls occlusion; parenting controls inherited transforms","opacity is not a substitute for z-order"]','[{"name":"zOrder","unit":"index","range":[-10000,10000]},{"name":"opacity","unit":"percent","range":[0,100]}]','["layers","opacity"]','["set_layer_order","set_opacity"]','["layer_order","visibility"]','["https://helpx.adobe.com/after-effects/using/layers.html"]'),
('transitions','transitions','Transitions','전환','Connects beats or scenes while preserving continuity, contrast, or deliberate interruption.','연속성, 대비 또는 의도적 단절을 유지하며 비트나 장면을 연결한다.','["transition connects states; effect decorates a state","cut has zero overlap; dissolve overlaps outgoing and incoming"]','[{"name":"duration","unit":"frame","range":[0,10000]},{"name":"overlap","unit":"frame","range":[0,10000]}]','["opacity","mask"]','["create_transition"]','["transition_overlap","continuity"]','["https://arxiv.org/html/2502.13372"]'),
('typography','typography','Kinetic typography','키네틱 타이포그래피','Animates readable text while preserving hierarchy, rhythm, and legibility.','위계, 리듬, 가독성을 유지하며 읽을 수 있는 텍스트를 움직인다.','["type hierarchy is semantic; font size is one visual control","tracking changes spacing; scale changes glyph geometry"]','[{"name":"fontSize","unit":"px","range":[1,10000]},{"name":"tracking","unit":"em","range":[-1,10]}]','["text","font"]','["create_text","set_text_style"]','["text_bounds","minimum_read_time","font_available"]','["https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html"]'),
('path-morph','path-morph','Path and morph','패스와 모프','Animates vector geometry along a path or between compatible shapes.','벡터 도형을 경로를 따라 또는 호환되는 형태 사이에서 변형한다.','["path motion moves an object; morph changes its geometry","morph requires compatible topology"]','[{"name":"progress","unit":"percent","range":[0,100]},{"name":"pathLength","unit":"px","range":[0,1000000]}]','["vectorPath","morph"]','["set_motion_path","morph_shape"]','["path_continuity","topology_compatibility"]','["https://developer.mozilla.org/docs/Web/SVG/Attribute/d"]'),
('mask-matte','mask-matte','Mask and matte','마스크와 매트','Controls visibility with vector boundaries or another layer channel.','벡터 경계 또는 다른 레이어 채널로 가시성을 제어한다.','["mask belongs to the layer; matte derives visibility from another layer","clip is binary unless feathered or alpha-driven"]','[{"name":"feather","unit":"px","range":[0,10000]},{"name":"expansion","unit":"px","range":[-10000,10000]}]','["mask","matte"]','["set_mask","set_matte"]','["mask_bounds","matte_source"]','["https://helpx.adobe.com/after-effects/using/alpha-channels-masks-mattes.html"]'),
('camera-3d','camera-3d','Camera and 3D','카메라와 3D','Uses perspective, camera motion, and depth to compose spatial scenes.','원근, 카메라 움직임, 깊이로 공간 장면을 구성한다.','["camera moves the viewpoint; layer transform moves content","parallax requires depth separation"]','[{"name":"focalLength","unit":"mm","range":[1,1000]},{"name":"depth","unit":"px","range":[-100000,100000]}]','["camera","3dTransform"]','["create_camera","set_3d_transform"]','["camera_exists","depth_order","frustum_bounds"]','["https://helpx.adobe.com/after-effects/using/cameras-lights-points-interest.html"]'),
('lighting-compositing','lighting-compositing','Lighting and compositing','조명과 합성','Combines light, shadow, blend, and color relationships into a coherent image.','빛, 그림자, 블렌드, 색 관계를 일관된 이미지로 합성한다.','["lighting models illumination; compositing combines layers","drop shadow implies elevation but does not create physical light"]','[{"name":"shadowBlur","unit":"px","range":[0,10000]},{"name":"lightIntensity","unit":"percent","range":[0,1000]}]','["dropShadow","blendMode"]','["set_drop_shadow","set_blend_mode"]','["contrast","shadow_bounds"]','["https://www.w3.org/TR/compositing-1/"]'),
('effects','effects','Effects','효과','Applies bounded visual processing that supports, rather than replaces, motion structure.','모션 구조를 대체하지 않고 보조하는 제한된 시각 처리를 적용한다.','["effect processes pixels; transform changes geometry","an effect template is reviewed; arbitrary scripts are not"]','[{"name":"amount","unit":"percent","range":[0,100]},{"name":"radius","unit":"px","range":[0,10000]}]','["effectTemplate"]','["apply_effect_template"]','["effect_supported","parameter_range"]','["https://helpx.adobe.com/after-effects/using/effects-animation-presets-overview.html"]'),
('audio','audio','Audio synchronization','오디오 동기화','Aligns visual beats with bounded audio cues, levels, and timing.','시각 비트를 제한된 오디오 큐, 레벨, 타이밍에 맞춘다.','["cue marks timing; waveform measures amplitude","visual rhythm may align without matching every transient"]','[{"name":"gain","unit":"dB","range":[-96,12]},{"name":"cueTime","unit":"second","range":[0,86400]}]','["audio","cue"]','["set_audio","add_audio_cue"]','["audio_duration","peak_level","cue_alignment"]','["https://www.w3.org/TR/webaudio/"]'),
('expressions','expressions','Expressions','표현식','Derives repeatable animation values from approved templates and typed parameters.','검토된 템플릿과 타입이 지정된 파라미터로 반복 가능한 애니메이션 값을 계산한다.','["expression computes a value; keyframe stores a value","approved templates are bounded; arbitrary code is not"]','[{"name":"frequency","unit":"Hz","range":[0,1000]},{"name":"amplitude","unit":"px","range":[0,100000]}]','["expressionTemplate"]','["apply_expression_template","remove_expression"]','["template_approved","parameter_range","finite_output"]','["https://helpx.adobe.com/after-effects/using/expression-language-reference.html"]'),
('interaction','interaction','Interaction','인터랙션','Maps user input and state changes to deterministic scene responses.','사용자 입력과 상태 변화를 결정적인 장면 반응에 연결한다.','["interaction responds to input; animation may play without input","hover is unavailable on touch-only devices"]','[{"name":"responseTime","unit":"ms","range":[0,10000]},{"name":"targetSize","unit":"px","range":[44,10000]}]','["interaction"]','["bind_interaction"]','["keyboard_parity","target_size","reduced_motion"]','["https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html"]'),
('verification-accessibility','verification-accessibility','Verification and accessibility','검증과 접근성','Evaluates scene predicates, deterministic output, readable motion, and accessible alternatives.','장면 predicate, 결정적 출력, 읽을 수 있는 모션, 접근 가능한 대안을 평가한다.','["verification checks machine predicates; review judges intent","reduced motion preserves meaning while reducing displacement"]','[{"name":"maxAttempts","unit":"count","range":[1,4]},{"name":"flashRate","unit":"Hz","range":[0,3]}]','["verification","accessibility"]','["verify_scene"]','["predicate_pass","frame_hash","reduced_motion","flash_threshold"]','["https://arxiv.org/html/2502.13372","https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html"]');

INSERT INTO motion_aliases(card_id, alias, language) VALUES
('reference','reference analysis','en'),('reference','레퍼런스 분석','ko'),('reference','motion reference','en'),('reference','동작 참고 분석','ko'),('reference','reference 비트 분석','mixed'),('reference','레퍼런스 beat sheet','mixed'),('reference','motion 레퍼런스','mixed'),
('timing-easing','timing and easing','en'),('timing-easing','타이밍과 이징','ko'),('timing-easing','anticipation overshoot','en'),('timing-easing','예비동작 오버슈트','ko'),('timing-easing','12-frame anticipation','mixed'),('timing-easing','8% 오버슈트','mixed'),('timing-easing','frame 36 settle','mixed'),
('spatial-choreography','spatial choreography','en'),('spatial-choreography','공간 안무','ko'),('spatial-choreography','motion path layout','en'),('spatial-choreography','동선 배치','ko'),('spatial-choreography','x y 동선','mixed'),('spatial-choreography','position 안무','mixed'),('spatial-choreography','path 공간 구성','mixed'),
('layering','layering','en'),('layering','레이어 구성','ko'),('layering','layer order','en'),('layering','레이어 순서','ko'),('layering','z-order 레이어','mixed'),('layering','opacity 레이어링','mixed'),('layering','layer 가림 관계','mixed'),
('transitions','transitions','en'),('transitions','전환','ko'),('transitions','scene transition','en'),('transitions','장면 전환','ko'),('transitions','dissolve 전환','mixed'),('transitions','cut 장면 연결','mixed'),('transitions','transition 오버랩','mixed'),
('typography','kinetic typography','en'),('typography','키네틱 타이포그래피','ko'),('typography','animated type','en'),('typography','움직이는 글자','ko'),('typography','type 리듬','mixed'),('typography','tracking 애니메이션','mixed'),('typography','text 가독성','mixed'),
('path-morph','path and morph','en'),('path-morph','패스와 모프','ko'),('path-morph','shape morph','en'),('path-morph','도형 변형','ko'),('path-morph','SVG 모프','mixed'),('path-morph','motion path 변형','mixed'),('path-morph','path 형태 보간','mixed'),
('mask-matte','mask and matte','en'),('mask-matte','마스크와 매트','ko'),('mask-matte','alpha matte','en'),('mask-matte','알파 매트','ko'),('mask-matte','mask 페더','mixed'),('mask-matte','matte 가시성','mixed'),('mask-matte','alpha 매트 전환','mixed'),
('camera-3d','camera and 3d','en'),('camera-3d','카메라와 3D','ko'),('camera-3d','camera parallax','en'),('camera-3d','카메라 원근','ko'),('camera-3d','3D depth 카메라','mixed'),('camera-3d','parallax 깊이','mixed'),('camera-3d','focal length 원근','mixed'),
('lighting-compositing','lighting and compositing','en'),('lighting-compositing','조명과 합성','ko'),('lighting-compositing','light and shadow','en'),('lighting-compositing','빛과 그림자','ko'),('lighting-compositing','blend mode 합성','mixed'),('lighting-compositing','drop-shadow 조명','mixed'),('lighting-compositing','compositing 색 관계','mixed'),
('effects','effects','en'),('effects','효과','ko'),('effects','visual effect','en'),('effects','시각 효과','ko'),('effects','effect template','mixed'),('effects','blur 효과','mixed'),('effects','approved effect 적용','mixed'),
('audio','audio synchronization','en'),('audio','오디오 동기화','ko'),('audio','audio cue','en'),('audio','음향 큐','ko'),('audio','beat 오디오 싱크','mixed'),('audio','audio cue 정렬','mixed'),('audio','dB 레벨 동기화','mixed'),
('expressions','expressions','en'),('expressions','표현식','ko'),('expressions','expression template','en'),('expressions','표현식 템플릿','ko'),('expressions','wiggle 표현식','mixed'),('expressions','frequency 템플릿','mixed'),('expressions','typed expression 파라미터','mixed'),
('interaction','interaction','en'),('interaction','인터랙션','ko'),('interaction','interactive motion','en'),('interaction','상호작용 모션','ko'),('interaction','hover 인터랙션','mixed'),('interaction','keyboard 반응','mixed'),('interaction','pointer 상태 전환','mixed'),
('verification-accessibility','verification and accessibility','en'),('verification-accessibility','검증과 접근성','ko'),('verification-accessibility','motion verification','en'),('verification-accessibility','모션 검증','ko'),('verification-accessibility','predicate 접근성','mixed'),('verification-accessibility','reduced motion 검증','mixed'),('verification-accessibility','frame hash 접근성','mixed');

INSERT INTO motion_cards_fts(card_id, title_en, title_ko, definitions, aliases)
SELECT card.id, card.title_en, card.title_ko,
       card.definition_en || ' ' || card.definition_ko,
       group_concat(alias.alias, ' ')
FROM motion_cards AS card
JOIN motion_aliases AS alias ON alias.card_id = card.id
GROUP BY card.id;
