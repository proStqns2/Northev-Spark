import type { Metadata } from 'next';
import { ExpressClient } from './ExpressClient';

export const metadata: Metadata = {
  title: 'Service R·C·L',
  description:
    'La barre de valeurs R, C, L du studio et le service Express qui la sert : diviseur R / (L ∥ C) résolu par analyse nodale, routes JSON documentées.',
};

export const dynamic = 'force-dynamic';

export default function ExpressPage() {
  return <ExpressClient />;
}
