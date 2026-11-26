import { NextResponse } from 'next/server';
import { providerStatus } from '@/lib/ai/providers';
import { cloudEnabled } from '@/lib/db/supabase';
import { TEMPLATES } from '@/lib/data/templates';

export const runtime = 'nodejs';

export async function GET() {
  const providers = providerStatus();
  return NextResponse.json({
    ok: true,
    app: 'northev-spark',
    version: '1.0.0',
    engine: 'MNA complexe — continu & sinusoïdal établi',
    templates: TEMPLATES.length,
    integrations: {
      supabase: cloudEnabled(),
      openai: providers.openai,
      gemini: providers.gemini,
      localAgents: true,
    },
    time: new Date().toISOString(),
  });
}
