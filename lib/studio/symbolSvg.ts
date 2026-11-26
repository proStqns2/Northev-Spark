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
    `${LEADS(c)}<polyline points="-22,0 -19,-8 -13,8 -7,-8 -1,8 5,-8 11,8 15,-6 18,0 22,0" ${stroke(c)} stroke-linejoin="round"/>`,
  potentiometer: (c) =>
    `${LEADS(c)}<polyline points="-22,0 -19,-8 -13,8 -7,-8 -1,8 5,-8 11,8 15,-6 18,0 22,0" ${stroke(c)} stroke-linejoin="round"/><line x1="0" y1="-8" x2="10" y2="-20" ${stroke(c)}/><path d="M 10 -20 l 5 2 l -3 4 z" fill="${c}"/>`,
  capacitor: (c) =>
    `${LEADS(c)}<line x1="-5" y1="-14" x2="-5" y2="14" ${stroke(c)}/><line x1="5" y1="-14" x2="5" y2="14" ${stroke(c)}/>`,
  inductor: (c) =>
    `${LEADS(c)}<path d="M -22 0 q 5.5 -13 11 0 q 5.5 -13 11 0 q 5.5 -13 11 0 q 5.5 -13 11 0" ${stroke(c)}/>`,
  lamp: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="14" ${stroke(c)}/><line x1="-10" y1="-10" x2="10" y2="10" ${stroke(c)}/><line x1="-10" y1="10" x2="10" y2="-10" ${stroke(c)}/>`,
  vsource: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="16" ${stroke(c)}/><line x1="0" y1="-8" x2="0" y2="8" ${stroke(c)}/><line x1="-8" y1="0" x2="8" y2="0" ${stroke(c)}/>`,
  isource: (c) =>
    `${LEADS(c)}<circle cx="0" cy="0" r="16" ${stroke(c)}/><line x1="0" y1="10" x2="0" y2="-8" ${stroke(c)}/><path d="M -5 -6 L 0 -10 L 5 -6" ${stroke(c)}/>`,
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
