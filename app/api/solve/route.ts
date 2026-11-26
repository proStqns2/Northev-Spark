import { NextResponse } from 'next/server';
import { circuitDocSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';
import { cachedEquivalent, cachedSolve } from '@/lib/cache';
import { reduceSeriesParallel } from '@/lib/engine/reduce';
import { abs, Complex } from '@/lib/engine/complex';

/** JSON n'accepte pas Infinity : on expose null (valeur non finie). */
const safe = (z: Complex) => ({
  re: Number.isFinite(z.re) ? z.re : null,
  im: Number.isFinite(z.im) ? z.im : null,
});

const safeReading = (r: { v: Complex; i: Complex; p: Complex; indeterminate?: boolean }) => ({
  v: safe(r.v),
  i: safe(r.i),
  p: safe(r.p),
  indeterminate: r.indeterminate ?? false,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const body = payload as { doc?: unknown; include?: { readings?: boolean; reduction?: boolean } };
  const parsed = circuitDocSchema.safeParse(body.doc);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Montage invalide.' },
      { status: 422 },
    );
  }
  const doc = parsed.data as CircuitDoc;
  const equivalent = cachedEquivalent(doc);
  const solution = body.include?.readings === false ? null : cachedSolve(doc);

  const payloadOut: Record<string, unknown> = {
    equivalent: {
      ok: equivalent.ok,
      status: equivalent.status,
      error: equivalent.error,
      vth: safe(equivalent.vth),
      rth: safe(equivalent.rth),
      inorton: safe(equivalent.inorton),
      isc: safe(equivalent.isc),
      verificationErrorPct: equivalent.verificationErrorPct,
      warnings: equivalent.warnings,
      powerMax: equivalent.powerMax,
      magnitude: equivalent.ok
        ? { vth: abs(equivalent.vth), rth: abs(equivalent.rth), inorton: abs(equivalent.inorton) }
        : null,
    },
  };

  if (solution) {
    payloadOut.solution = solution.ok
      ? {
          ok: true,
          nodeVoltages: Object.fromEntries(
            Object.entries(solution.nodeVoltages).map(([node, value]) => [node, safe(value)]),
          ),
          readings: Object.fromEntries(
            Object.entries(solution.readings).map(([id, reading]) => [id, safeReading(reading)]),
          ),
          warnings: solution.warnings,
          size: solution.size,
        }
      : { ok: false, error: solution.error };
  }

  if (body.include?.reduction) {
    payloadOut.reduction = reduceSeriesParallel(doc);
  }

  return NextResponse.json(payloadOut, { headers: { 'Cache-Control': 'no-store' } });
}
