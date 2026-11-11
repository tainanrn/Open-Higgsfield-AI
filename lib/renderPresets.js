// Presets for the architectural Render Studio.
// Labels are shown to the user (pt-BR); `prompt` fragments are sent to the
// model in English, which image-edit models follow more reliably.

export const SCENE_TYPES = [
  { id: 'interior', label: 'Interior', prompt: 'interior architectural visualization of the room' },
  { id: 'exterior', label: 'Fachada / exterior', prompt: 'exterior architectural visualization of the building facade and surroundings' },
  { id: 'aerial', label: 'Vista aérea / implantação', prompt: 'aerial architectural visualization of the site and buildings' },
  { id: 'landscape', label: 'Paisagismo / área externa', prompt: 'landscape architecture visualization of the outdoor area' },
];

export const STYLES = [
  { id: 'photoreal', label: 'Fotorrealista', prompt: 'ultra photorealistic architectural photography, physically based materials, real-world textures, shot on a full-frame camera with a 24mm tilt-shift lens, sharp focus, high dynamic range' },
  { id: 'magazine', label: 'Revista de arquitetura', prompt: 'editorial architectural photography for a design magazine, clean composition, balanced exposure, subtle color grading, professionally styled' },
  { id: 'clay', label: 'Maquete branca', prompt: 'white clay model render, all surfaces in matte white material, soft ambient occlusion, clean studio look, no textures' },
  { id: 'watercolor', label: 'Aquarela / croqui', prompt: 'hand-drawn architectural watercolor illustration with fine ink linework, loose washes of color, white paper background' },
  { id: 'night-render', label: 'Render noturno dramático', prompt: 'dramatic cinematic architectural render, deep contrast, glowing interior lights, reflective surfaces' },
];

export const TIMES_OF_DAY = [
  { id: 'morning', label: 'Manhã', prompt: 'soft morning daylight with gentle shadows' },
  { id: 'noon', label: 'Meio-dia', prompt: 'bright clear midday sunlight with crisp shadows and blue sky' },
  { id: 'golden', label: 'Pôr do sol', prompt: 'warm golden hour sunset light with long soft shadows' },
  { id: 'blue', label: 'Fim de tarde (blue hour)', prompt: 'blue hour dusk, deep blue sky, warm artificial lights turned on inside' },
  { id: 'night', label: 'Noite', prompt: 'night scene with artificial lighting, warm lamps and accent lights, dark sky' },
  { id: 'overcast', label: 'Nublado', prompt: 'soft diffuse overcast daylight, no harsh shadows' },
];

export const AMBIENCE = [
  { id: 'none', label: 'Sem pessoas', prompt: 'no people' },
  { id: 'people', label: 'Com algumas pessoas', prompt: 'a few naturally posed people for scale, slightly motion blurred' },
  { id: 'furnished', label: 'Decorado e habitado', prompt: 'tastefully furnished and decorated with plants, books and everyday objects, lived-in feel' },
  { id: 'vegetation', label: 'Vegetação abundante', prompt: 'lush tropical vegetation and landscaping around the architecture' },
];

export const ASPECT_RATIOS = ['16:9', '4:3', '3:2', '1:1', '3:4', '9:16', '21:9'];

export const RESOLUTIONS = [
  { id: '1k', label: '1K (rápido)' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K (mais lento)' },
];

const findPrompt = (list, id) => list.find((item) => item.id === id)?.prompt || list[0].prompt;

// Instructions that keep the model from redesigning the project.
const PRESERVE =
  'Render this 3D model screenshot as a finished image. Keep the exact same camera angle, perspective, ' +
  'architecture, geometry, proportions, openings, wall positions and furniture layout as the input image. ' +
  'Do not add, remove or move walls, windows, doors or structural elements. Only replace the flat viewport ' +
  'shading with realistic materials, lighting and atmosphere.';

/**
 * Builds the English prompt sent to the image-edit model.
 * `notes` is free text from the user (any language) describing materials etc.
 */
export function buildRenderPrompt({ scene, style, time, ambience, notes }) {
  const parts = [
    PRESERVE,
    `Scene: ${findPrompt(SCENE_TYPES, scene)}.`,
    `Style: ${findPrompt(STYLES, style)}.`,
    `Lighting: ${findPrompt(TIMES_OF_DAY, time)}.`,
    `Ambience: ${findPrompt(AMBIENCE, ambience)}.`,
  ];
  const cleanNotes = String(notes || '').trim().slice(0, 800);
  if (cleanNotes) {
    parts.push(`Additional requirements from the architect (follow them closely): ${cleanNotes}`);
  }
  parts.push('No text, watermarks or UI elements in the output.');
  return parts.join(' ');
}
