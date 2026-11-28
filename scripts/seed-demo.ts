/**
 * Crée un compte de démonstration et quelques montages d'exemple.
 * Lancement : npx tsx scripts/seed-demo.ts
 */
import { createUser, createCircuit } from '../lib/db/repo';
import { TEMPLATES } from '../lib/data/templates';
import { equivalentOf } from '../lib/engine/equivalent';
import { abs } from '../lib/engine/complex';

async function main() {
  const email = 'demo@northev.fr';
  let result = await createUser({ email, name: 'Compte démo', password: 'demo1234' });
  if ('error' in result) {
    console.log(`ℹ️  Le compte ${email} existe déjà — montages non dupliqués.`);
    return;
  }
  const user = result.user;
  console.log(`✓ Compte de démonstration créé : ${email} / demo1234`);

  const slugs = ['thevenin-serie', 'pont-wheatstone', 'bobines-impedances', 'labo-calcul-tn'];
  for (const slug of slugs) {
    const template = TEMPLATES.find((t) => t.slug === slug);
    if (!template) continue;
    const doc = template.build();
    const eq = equivalentOf(doc);
    await createCircuit({
      ownerId: user.id,
      name: template.title,
      notes: template.summary,
      doc,
      templateSlug: slug,
      lastResult: eq.ok
        ? {
            vth: abs(eq.vth),
            rth: abs(eq.rth),
            inorton: abs(eq.inorton),
            regime: doc.regime,
          }
        : undefined,
    });
    console.log(`  · ${template.title}`);
  }
  console.log('\nConnectez-vous avec demo@northev.fr / demo1234');
}

void main();
