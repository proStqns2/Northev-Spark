import { ComponentKind } from '@/lib/engine/types';

/**
 * Symboles SVG en chaînes pures (repère -50 → +50) pour les exports
 * autonomes : PNG, SVG, HTML — rendus hors du DOM React.
 */
const LEADS = (color: string, w = 2.1) =>
  `<line x1="-50" y1="0" x2="-22" y2="0" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/><line x1="22" y1="0" x2="50" y2="0" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;

const stroke = (color: string, w = 2.1) =>
  `stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"`;

export const SYMBOL_SVG: Record<ComponentKind, (color: string) => string> = {
  resistor: (c) =>
    `${LEADS(c)}<rect x="-22" y="-9" width="44" height="18" rx="1.5" ${stroke(c)}/>`,
  potentiometer: (c) =>
    `${LEADS(c)}<rect x="-22" y="-9" width="44" height="18" rx="1.5" ${stroke(c)}/><line x1="0" y1="-9" x2="13" y2="-22" ${stroke(c)} stroke-width="1.6"/><path d="M 13 -22 l 6 1 l -2 5 z" fill="${c}"/>`,
  capacitor: (c) =>
    `${LEADS(c)}<line x1="-4" y1="-15" x2="-4" y2="15" ${stroke(c)}/><line x1="4" y1="-15" x2="4" y2="15" ${stroke(c)}/>`,
  inductor: (c) =>
    `${LEADS(c)}<path d="M -22 0 a 5.5 5.5 0 0 1 11 0 a 5.5 5.5 0 0 1 11 0 a 5.5 5.5 0 0 1 11 0 a 5.5 5.5 0 0 1 11 0" ${stroke(c)}/><line x1="-20" y1="-13" x2="20" y2="-13" ${stroke(c)} stroke-width="1.3" opacity="0.55"/><line x1="-20" y1="13" x2="20" y2="13" ${stroke(c)} stroke-width="1.3" opacity="0.55"/>`,
  lamp: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="14" ${stroke(c)}/><line x1="-10" y1="-10" x2="10" y2="10" ${stroke(c)}/><line x1="-10" y1="10" x2="10" y2="-10" ${stroke(c)}/>`,
  vsource: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="17" ${stroke(c)}/><line x1="0" y1="-8" x2="0" y2="8" ${stroke(c)}/><line x1="-8" y1="0" x2="8" y2="0" ${stroke(c)}/>`,
  isource: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="17" ${stroke(c)}/><line x1="0" y1="26" x2="0" y2="-26" ${stroke(c)} stroke-width="1.5" opacity="0.85"/><path d="M -6 -19 L 0 -27 L 6 -19" ${stroke(c)} stroke-width="1.8"/>`,
  vcvs: (c) =>
    `${LEADS(c)}<path d="M -16 -14 L 16 -14 L 0 16 Z" ${stroke(c)} stroke-linejoin="round"/><text x="0" y="-1" text-anchor="middle" font-size="11" fill="${c}" font-family="monospace">μ</text>`,
  vccs: (c) =>
    `${LEADS(c)}<path d="M -16 -14 L 16 -14 L 0 16 Z" ${stroke(c)} stroke-linejoin="round"/><text x="0" y="-1" text-anchor="middle" font-size="11" fill="${c}" font-family="monospace">g</text>`,
  ammeter: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="14" ${stroke(c)}/><text x="0" y="5" text-anchor="middle" font-size="13" fill="${c}" font-family="monospace">A</text>`,
  voltmeter: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="14" ${stroke(c)}/><text x="0" y="5" text-anchor="middle" font-size="13" fill="${c}" font-family="monospace">V</text>`,
  switch: (c) =>
    `${LEADS(c)}<circle cx="-12" cy="0" r="2.6" fill="${c}"/><circle cx="12" cy="0" r="2.6" fill="${c}"/><line x1="-12" y1="0" x2="12" y2="0" ${stroke(c)}/>`,
  wire: (c) => `<line x1="-50" y1="0" x2="50" y2="0" stroke="${c}" stroke-width="2.1" stroke-linecap="round"/>`,
};

export const KIND_COLORS: Record<ComponentKind, string> = {
  resistor: '#38e1e6',
  capacitor: '#46e6a0',
  inductor: '#a479ff',
  vsource: '#ffc266',
  isource: '#4f9dff',
  wire: '#8fa6c4',
  switch: '#cbd5e1',
  ammeter: '#8fb6ff',
  voltmeter: '#8fb6ff',
  lamp: '#ffd166',
  potentiometer: '#ff79c6',
  vcvs: '#ff9b6b',
  vccs: '#ff9b6b',
};
