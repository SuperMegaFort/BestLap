/**
 * Vector SVG circuit database for Le Mans Ultimate (240x200 viewBox).
 * Each entry defines accurate corner geometry and matching trackName/track_id aliases.
 */
export const LMU_TRACKS = {
  monza: {
    name: 'Autodromo Nazionale Monza',
    aliases: ['monza'],
    path: 'M 42 152 L 42 74 L 46 70 L 42 64 Q 44 38 78 30 Q 112 24 134 38 L 138 44 L 146 42 L 184 36 Q 204 38 202 58 L 194 74 Q 206 86 192 98 L 170 110 L 166 118 L 154 120 L 136 138 Q 116 154 88 152 Z',
  },
  sarthe: {
    name: 'Circuit de la Sarthe',
    aliases: ['sarthe', 'le mans', 'lemans'],
    path: 'M 54 152 L 44 134 L 34 114 Q 28 96 42 76 L 62 46 Q 76 28 102 34 L 138 36 L 144 42 L 154 36 L 178 38 L 184 44 L 194 38 L 210 42 Q 222 48 218 66 L 208 106 Q 202 126 184 132 L 164 138 L 154 152 L 136 168 Q 118 176 98 166 L 76 156 L 68 160 Z',
  },
  spa: {
    name: 'Spa-Francorchamps',
    aliases: ['spa', 'francorchamps'],
    path: 'M 48 150 L 36 118 L 44 106 L 56 84 L 96 44 Q 124 24 148 34 L 162 48 L 150 62 L 176 58 Q 206 62 208 92 L 196 124 Q 186 146 156 146 L 122 144 L 98 134 L 82 148 L 62 158 Z',
  },
  fuji: {
    name: 'Fuji Speedway',
    aliases: ['fuji'],
    path: 'M 32 138 L 174 138 Q 208 138 208 112 Q 208 86 178 82 L 146 86 L 128 54 Q 108 32 82 48 L 64 76 L 46 82 L 38 108 L 28 122 Z',
  },
  bahrain: {
    name: 'Bahrain International Circuit',
    aliases: ['bahrain', 'sakhir'],
    path: 'M 42 150 L 42 52 Q 44 34 74 36 L 138 42 L 164 56 L 186 44 Q 208 48 198 78 L 156 96 L 178 128 Q 168 154 132 144 L 98 128 L 76 152 Z',
  },
  imola: {
    name: 'Autodromo Enzo e Dino Ferrari',
    aliases: ['imola', 'enzo'],
    path: 'M 34 126 L 84 120 L 106 106 L 134 92 L 166 52 Q 198 38 206 66 L 192 108 L 168 138 Q 142 152 112 142 L 74 148 L 42 146 Z',
  },
  portimao: {
    name: 'Autódromo Internacional do Algarve',
    aliases: ['portim', 'algarve'],
    path: 'M 36 142 L 42 66 Q 52 36 92 42 L 128 58 L 154 44 L 194 46 Q 216 60 200 98 L 164 136 Q 118 158 72 148 Z',
  },
  sebring: {
    name: 'Sebring International Raceway',
    aliases: ['sebring'],
    path: 'M 40 146 L 40 62 L 94 42 L 146 48 L 200 38 L 212 76 L 176 112 L 194 148 L 124 156 Z',
  },
  cota: {
    name: 'Circuit of the Americas',
    aliases: ['cota', 'americas'],
    path: 'M 38 144 L 30 82 L 72 46 L 122 68 L 162 40 L 204 44 L 196 108 L 146 138 L 96 154 Z',
  },
  interlagos: {
    name: 'Autódromo José Carlos Pace',
    aliases: ['interlagos', 'paulo'],
    path: 'M 42 138 L 54 62 Q 72 34 114 42 L 182 48 Q 212 64 196 104 L 154 134 L 116 116 L 88 152 Z',
  },
  losail: {
    name: 'Lusail International Circuit',
    aliases: ['losail', 'lusail', 'qatar'],
    path: 'M 44 148 L 44 52 Q 52 34 86 38 L 182 44 Q 212 56 202 98 L 172 138 Q 124 156 64 148 Z',
  },
  default: {
    name: 'Circuit',
    aliases: [],
    path: 'M 48 146 C 24 146 24 54 64 42 L 176 42 C 216 42 216 146 176 146 Z',
  },
};

export function resolveTrack(trackName = '') {
  const lower = String(trackName).toLowerCase();
  for (const [key, track] of Object.entries(LMU_TRACKS)) {
    if (key === 'default') continue;
    if (track.aliases.some((alias) => lower.includes(alias))) {
      return { key, ...track };
    }
  }
  return { key: 'default', ...LMU_TRACKS.default };
}
