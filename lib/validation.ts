import { z } from 'zod';

const acSchema = z.object({
  amplitude: z.number().finite().min(-1e9).max(1e9),
  frequency: z.number().finite().min(0).max(1e9),
  phaseDeg: z.number().finite().min(-360).max(360),
});

export const componentSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum([
    'resistor',
    'capacitor',
    'inductor',
    'vsource',
    'isource',
    'wire',
    'switch',
    'ammeter',
    'voltmeter',
    'lamp',
    'potentiometer',
    'vcvs',
    'vccs',
  ]),
  a: z.string().min(1).max(24),
  b: z.string().min(1).max(24),
  value: z.number().finite().min(-1e12).max(1e12),
  label: z.string().max(80).optional(),
  ac: acSchema.optional(),
  closed: z.boolean().optional(),
  gain: z.number().finite().min(-1e6).max(1e6).optional(),
  ctrl: z.object({ a: z.string().max(24), b: z.string().max(24) }).optional(),
});

export const circuitDocSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  notes: z.string().max(4000).optional(),
  components: z.array(componentSchema).max(400),
  ground: z.string().min(1).max(24),
  terminals: z.object({
    a: z.string().max(24).nullable(),
    b: z.string().max(24).nullable(),
  }),
  regime: z.enum(['dc', 'ac']),
  frequency: z.number().finite().min(0).max(1e9),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(48),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
    .max(200)
    .regex(/[a-zA-Z]/, 'Ajoutez au moins une lettre.')
    .regex(/[0-9]/, 'Ajoutez au moins un chiffre.'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Mot de passe requis.').max(200),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(48).optional(),
  avatar: z
    .enum(['circuit', 'bolt', 'oscillo', 'resistor', 'magnet', 'chip', 'photon', 'wave'])
    .optional(),
  theme: z.enum(['nuit', 'aurore', 'carbone', 'labo']).optional(),
  bio: z.string().max(280).optional(),
  institution: z.string().max(120).optional(),
  prefs: z
    .object({
      grid: z.boolean().optional(),
      animation: z.boolean().optional(),
      electronSpeed: z.number().min(0.2).max(3).optional(),
      digits: z.number().int().min(2).max(8).optional(),
    })
    .optional(),
});

export const roomCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  circuitId: z.string().max(64).optional(),
  doc: circuitDocSchema,
});

export const roomJoinSchema = z.object({
  code: z.string().regex(/^[1-9][0-9]{4}$/, 'Le code doit contenir 5 chiffres.'),
});

export const roomPatchSchema = z.object({
  doc: circuitDocSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().min(1).max(500).optional(),
});

export const aiSchema = z.object({
  agent: z.enum(['theo', 'nora', 'impeda', 'volt', 'mentor']),
  task: z.enum([
    'equivalence',
    'verification',
    'pedagogie',
    'optimisation',
    'reduction',
    'diagnostic',
    'rapport',
    'conversion',
    'plan',
    'quiz',
  ]),
  doc: circuitDocSchema.optional(),
  question: z.string().max(600).optional(),
  provider: z.enum(['auto', 'openai', 'gemini', 'local']).optional(),
});

export const importSchema = z.object({
  doc: circuitDocSchema,
  name: z.string().trim().min(1).max(120).optional(),
  fromTemplate: z.string().max(64).optional(),
});
