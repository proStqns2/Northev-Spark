import { CircuitDoc } from '@/lib/engine/types';
import { EquivalentResult } from '@/lib/engine/equivalent';
import { formatPhasor, formatSI } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';
import { circuitBounds, GRID, orderedEnds, orientationOf } from './geometry';
import { KIND_COLORS, SYMBOL_SVG } from './symbolSvg';
import { safeSlug } from '@/lib/utils';

/** Génère un SVG autonome (styles inline, aucune dépendance) pour export/impression. */
export function circuitToSvg(
  doc: CircuitDoc,
  equivalent: EquivalentResult,
  options: { showLabels?: boolean; showValues?: boolean; theme?: 'dark' | 'light' } = {},
): string {
  const { showLabels = true, showValues = true, theme = 'dark' } = options;
  const bounds = circuitBounds(doc.components);
  const pad = 2;
  const width = (bounds.maxX - bounds.minX + pad) * GRID + 320;
  const height = Math.max((bounds.maxY - bounds.minY + pad) * GRID, 460);
  const bg = theme === 'dark' ? '#070d17' : '#f7fafd';
  const fg = theme === 'dark' ? '#e9f0fc' : '#0f1b2c';
  const soft = theme === 'dark' ? '#b0c3db' : '#3c526e';
  const mute = theme === 'dark' ? '#7c94b2' : '#6c829e';
  const accent = theme === 'dark' ? '#38e1e6' : '#0e949e';
  const panel = theme === 'dark' ? '#0b1424' : '#ffffff';
  const line = theme === 'dark' ? '#283d5a' : '#c8d6e6';

  const ox = -bounds.minX * GRID + GRID;
  const oy = -bounds.minY * GRID + GRID;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Space Grotesk, system-ui, sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);
  // grille
  for (let x = 0; x <= width; x += GRID * 2) {
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${line}" stroke-width="0.5" opacity="0.35"/>`);
  }
  for (let y = 0; y <= height; y += GRID * 2) {
    parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${line}" stroke-width="0.5" opacity="0.35"/>`);
  }

  // composants
  for (const c of doc.components) {
    const [a, b] = orderedEnds(c);
    const p1 = { x: a.x * GRID + ox, y: a.y * GRID + oy };
    const p2 = { x: b.x * GRID + ox, y: b.y * GRID + oy };
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    const color = KIND_COLORS[c.kind] ?? soft;
    parts.push(
      `<g transform="translate(${mid.x.toFixed(2)} ${mid.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${(len / 100).toFixed(4)})">${SYMBOL_SVG[c.kind](color)}</g>`,
    );
    if (showValues && len > 26) {
      const vertical = orientationOf(c) === 'v';
      parts.push(
        `<text x="${(mid.x + (vertical ? 16 : 0)).toFixed(1)}" y="${(mid.y + (vertical ? 0 : -16)).toFixed(1)}" font-size="10.5" fill="${soft}" font-family="JetBrains Mono, monospace" text-anchor="${vertical ? 'start' : 'middle'}" dominant-baseline="${vertical ? 'middle' : 'auto'}">${escapeXml(c.label ?? c.id)}</text>`,
      );
    }
  }

  // masse
  if (doc.ground) {
    const [gx, gy] = doc.ground.split(',').map(Number);
    if (!Number.isNaN(gx) && !Number.isNaN(gy)) {
      const x = gx * GRID + ox;
      const y = gy * GRID + oy;
      parts.push(
        `<g stroke="${soft}" stroke-width="2" stroke-linecap="round"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 9}"/><line x1="${x - 10}" y1="${y + 9}" x2="${x + 10}" y2="${y + 9}"/><line x1="${x - 6.5}" y1="${y + 14}" x2="${x + 6.5}" y2="${y + 14}"/><line x1="${x - 3}" y1="${y + 19}" x2="${x + 3}" y2="${y + 19}"/></g>`,
      );
    }
  }

  // bornes A/B
  for (const [cell, label, color] of [
    [doc.terminals.a, 'A', '#38e1e6'],
    [doc.terminals.b, 'B', '#a479ff'],
  ] as const) {
    if (!cell) continue;
    const [x, y] = cell.split(',').map(Number);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    const px = x * GRID + ox;
    const py = y * GRID + oy;
    parts.push(
      `<g><circle cx="${px}" cy="${py}" r="11" fill="none" stroke="${color}" stroke-width="1.4" opacity="0.5"/><circle cx="${px}" cy="${py}" r="4" fill="${color}"/><text x="${px}" y="${py - 17}" font-size="10" fill="${color}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="700">${label}</text></g>`,
    );
  }

  // cartouche de résultats
  const px = width - 300;
  parts.push(`<rect x="${px}" y="24" width="272" height="212" rx="14" fill="${panel}" stroke="${line}"/>`);
  parts.push(
    `<text x="${px + 18}" y="52" font-size="11" fill="${accent}" font-family="JetBrains Mono, monospace" letter-spacing="1.6">ÉQUIVALENT</text>`,
  );
  parts.push(
    `<text x="${px + 18}" y="76" font-size="14" fill="${fg}" font-weight="600">${escapeXml(doc.name)}</text>`,
  );
  const rows: Array<[string, string]> = equivalent.ok
    ? [
        ['U_th', formatPhasor(equivalent.vth)],
        ['Z_th', formatSI(abs(equivalent.rth), 'Ω')],
        ['I_N', Number.isFinite(abs(equivalent.inorton)) ? formatSI(abs(equivalent.inorton), 'A') : '∞'],
        ['Régime', doc.regime === 'ac' ? `AC · ${formatSI(doc.frequency, 'Hz')}` : 'DC'],
      ]
    : [['Statut', 'Montage incomplet']];
  rows.forEach(([label, value], i) => {
    const y = 108 + i * 28;
    parts.push(
      `<text x="${px + 18}" y="${y}" font-size="10.5" fill="${mute}" font-family="JetBrains Mono, monospace">${label}</text>`,
    );
    parts.push(
      `<text x="${px + 254}" y="${y}" font-size="11.5" fill="${fg}" text-anchor="end" font-family="JetBrains Mono, monospace">${escapeXml(value)}</text>`,
    );
  });
  if (equivalent.ok && equivalent.verificationErrorPct < 1) {
    parts.push(
      `<text x="${px + 18}" y="${213}" font-size="9.5" fill="#46e6a0" font-family="JetBrains Mono, monospace">✓ vérifié · écart ${equivalent.verificationErrorPct.toExponential(1)} %</text>`,
    );
  }
  parts.push(
    `<text x="${px + 18}" y="228" font-size="8.5" fill="${mute}" font-family="JetBrains Mono, monospace">northev spark · ${new Date().toLocaleDateString('fr-FR')}</text>`,
  );

  if (showLabels) {
    parts.push(
      `<text x="24" y="${height - 18}" font-size="9" fill="${mute}" font-family="JetBrains Mono, monospace">${escapeXml(doc.name)} — ${doc.components.length} dipôles · bornes A ${doc.terminals.a ?? '—'} / B ${doc.terminals.b ?? '—'}</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export function downloadSvg(doc: CircuitDoc, equivalent: EquivalentResult) {
  const svg = circuitToSvg(doc, equivalent);
  triggerDownload(new Blob([svg], { type: 'image/svg+xml' }), `${safeSlug(doc.name)}.svg`);
}

export async function downloadPng(doc: CircuitDoc, equivalent: EquivalentResult, scale = 2) {
  const svg = circuitToSvg(doc, equivalent);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Rendu PNG impossible.'));
    image.src = url;
  });
  const viewBox = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const w = Number(viewBox?.[1] ?? 1200);
  const h = Number(viewBox?.[2] ?? 720);
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible.');
  ctx.fillStyle = '#070d17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  await new Promise<void>((resolve) =>
    canvas.toBlob((result) => {
      if (result) triggerDownload(result, `${safeSlug(doc.name)}.png`);
      resolve();
    }, 'image/png'),
  );
}

export function downloadHtml(doc: CircuitDoc, equivalent: EquivalentResult) {
  const svg = circuitToSvg(doc, equivalent);
  const rows = doc.components
    .map(
      (c) =>
        `<tr><td>${escapeXml(c.label ?? c.id)}</td><td>${c.kind}</td><td>(${c.a}) → (${c.b})</td><td>${formatSI(c.value, '')}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeXml(doc.name)} — Northev Spark</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font-family: "Space Grotesk", system-ui, sans-serif; background:#060b14; color:#e9f0fc; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 80px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid #283d5a; padding-bottom:18px; }
  .brand { display:flex; gap:10px; align-items:center; font-weight:600; letter-spacing:-.01em; }
  .dot { width:10px; height:10px; border-radius:3px; background:#38e1e6; box-shadow:0 0 14px #38e1e6; }
  h1 { font-size: 26px; margin: 26px 0 6px; letter-spacing:-.02em; }
  .sub { color:#7c94b2; font-size: 13px; margin:0 0 22px; }
  .card { border:1px solid #283d5a; background:#0b1424; border-radius:16px; overflow:hidden; }
  .metrics { display:grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap:1px; background:#283d5a; border-top:1px solid #283d5a; }
  .metric { background:#0b1424; padding:16px; }
  .metric span { display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:#7c94b2; }
  .metric strong { font-family:"JetBrains Mono", monospace; font-size:16px; font-weight:500; color:#38e1e6; }
  table { width:100%; border-collapse:collapse; margin-top:22px; font-size:13px; }
  th,td { text-align:left; padding:9px 12px; border-bottom:1px solid #1b2a40; }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:#7c94b2; font-weight:600; }
  td:nth-child(4){ font-family:"JetBrains Mono",monospace; }
  footer { margin-top:34px; color:#7c94b2; font-size:11px; }
</style>
</head>
<body>
<div class="wrap">
  <header><div class="brand"><span class="dot"></span> Northev Spark</div><div style="font-size:12px;color:#7c94b2">Export HTML autonome</div></header>
  <h1>${escapeXml(doc.name)}</h1>
  <p class="sub">${escapeXml(doc.notes ?? '') || 'Montage exporté depuis le studio Northev Spark.'}</p>
  <div class="card">
    ${svg.replace(/<svg /, '<svg style="width:100%;height:auto;display:block" ')}
    <div class="metrics">
      <div class="metric"><span>Tension Thévenin</span><strong>${escapeXml(equivalent.ok ? formatPhasor(equivalent.vth) : '—')}</strong></div>
      <div class="metric"><span>Impédance Thévenin</span><strong>${escapeXml(equivalent.ok ? formatSI(abs(equivalent.rth), 'Ω') : '—')}</strong></div>
      <div class="metric"><span>Courant Norton</span><strong>${escapeXml(equivalent.ok && Number.isFinite(abs(equivalent.inorton)) ? formatSI(abs(equivalent.inorton), 'A') : '—')}</strong></div>
      <div class="metric"><span>Régime</span><strong>${doc.regime === 'ac' ? `AC ${formatSI(doc.frequency, 'Hz')}` : 'DC'}</strong></div>
    </div>
  </div>
  <table>
    <thead><tr><th>Référence</th><th>Type</th><th>Connexions</th><th>Valeur</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>Généré le ${new Date().toLocaleString('fr-FR')} · Northev Spark · équivalents Thévenin / Norton</footer>
</div>
</body>
</html>`;
  triggerDownload(new Blob([html], { type: 'text/html' }), `${safeSlug(doc.name)}.html`);
}

export function downloadJson(doc: CircuitDoc, equivalent: EquivalentResult) {
  const payload = {
    app: 'northev-spark',
    version: 1,
    exportedAt: new Date().toISOString(),
    doc,
    equivalent: equivalent.ok
      ? {
          vth: equivalent.vth,
          rth: equivalent.rth,
          inorton: equivalent.inorton,
          isc: equivalent.isc,
          status: equivalent.status,
          verificationErrorPct: equivalent.verificationErrorPct,
        }
      : null,
  };
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${safeSlug(doc.name)}.json`,
  );
}

export function circuitToMarkdown(doc: CircuitDoc, equivalent: EquivalentResult): string {
  const lines: string[] = [];
  lines.push(`# ${doc.name}`);
  lines.push('');
  if (doc.notes) lines.push(doc.notes, '');
  lines.push(`- Régime : ${doc.regime === 'ac' ? `sinusoïdal ${formatSI(doc.frequency, 'Hz')}` : 'continu'}`);
  lines.push(`- Bornes : A = (${doc.terminals.a ?? '—'}) · B = (${doc.terminals.b ?? '—'})`);
  lines.push(`- Masse : ${doc.ground ? `(${doc.ground})` : 'non définie'}`);
  lines.push('');
  lines.push('## Résultat');
  if (equivalent.ok) {
    lines.push(`- **U_th** = ${formatPhasor(equivalent.vth)}`);
    lines.push(`- **Z_th** = ${formatSI(abs(equivalent.rth), 'Ω')}`);
    lines.push(`- **I_N** = ${Number.isFinite(abs(equivalent.inorton)) ? formatSI(abs(equivalent.inorton), 'A') : '∞'}`);
    lines.push(`- Vérification croisée : écart ${equivalent.verificationErrorPct.toExponential(2)} %`);
  } else {
    lines.push(`Calcul impossible : ${equivalent.error}`);
  }
  lines.push('');
  lines.push('## Composants');
  lines.push('| Référence | Type | A | B | Valeur |');
  lines.push('|---|---|---|---|---|');
  for (const c of doc.components) {
    lines.push(`| ${c.label ?? c.id} | ${c.kind} | ${c.a} | ${c.b} | ${formatSI(c.value, '')} |`);
  }
  return lines.join('\n');
}

export function downloadMarkdown(doc: CircuitDoc, equivalent: EquivalentResult) {
  triggerDownload(
    new Blob([circuitToMarkdown(doc, equivalent)], { type: 'text/markdown' }),
    `${safeSlug(doc.name)}.md`,
  );
}

/** Export « invitation » : carte PNG avec code multiwork */
export async function downloadInvite(
  code: string,
  doc: CircuitDoc,
  equivalent: EquivalentResult,
  authorName: string,
) {
  const svg = circuitToSvg(doc, equivalent, { theme: 'dark' });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Rendu impossible.'));
    image.src = url;
  });
  const viewBox = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const w = Number(viewBox?.[1] ?? 1000);
  const h = Number(viewBox?.[2] ?? 640);
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = (h + 150) * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#060b14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, w * 2, h * 2);
  ctx.fillStyle = 'rgba(6,11,20,.92)';
  ctx.fillRect(0, h * 2, canvas.width, 300);
  ctx.strokeStyle = '#283d5a';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, h * 2, canvas.width, 300);
  ctx.fillStyle = '#38e1e6';
  ctx.font = '600 22px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText('Atelier multiwork · Northev Spark', 40, h * 2 + 48);
  ctx.fillStyle = '#e9f0fc';
  ctx.font = '500 74px "JetBrains Mono", monospace';
  ctx.fillText(code.split('').join(' '), 40, h * 2 + 148);
  ctx.fillStyle = '#7c94b2';
  ctx.font = '400 20px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(
    `Rejoignez « ${doc.name} » avec ce code à 5 chiffres · invitation de ${authorName}`,
    40,
    h * 2 + 206,
  );
  ctx.fillStyle = '#38e1e6';
  ctx.font = '400 18px "JetBrains Mono", monospace';
  ctx.fillText('/multiwork — collaboration temps réel', 40, h * 2 + 252);
  URL.revokeObjectURL(url);
  await new Promise<void>((resolve) =>
    canvas.toBlob((result) => {
      if (result) triggerDownload(result, `invitation-${code}.png`);
      resolve();
    }, 'image/png'),
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
