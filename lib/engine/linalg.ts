import { Complex, abs, cx, div } from './complex';

export class SingularMatrixError extends Error {
  constructor(message = 'Matrice singulière : le circuit est mal posé.') {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

/**
 * Résolution d'un système linéaire complexe A·x = b par élimination de Gauss
 * avec pivot partiel. Les matrices de circuits restent petites (< 200).
 */
export function solveLinearSystem(A: Complex[][], b: Complex[]): Complex[] {
  const n = b.length;
  if (n === 0) return [];
  const M: Complex[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // recherche du pivot le plus grand en module
    let pivot = col;
    let best = abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const candidate = abs(M[row][col]);
      if (candidate > best) {
        best = candidate;
        pivot = row;
      }
    }
    if (best < 1e-13) {
      throw new SingularMatrixError();
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const pivotValue = M[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = div(M[row][col], pivotValue);
      if (factor.re === 0 && factor.im === 0) continue;
      for (let k = col; k <= n; k++) {
        M[row][k] = {
          re: M[row][k].re - factor.re * M[col][k].re + factor.im * M[col][k].im,
          im: M[row][k].im - factor.re * M[col][k].im - factor.im * M[col][k].re,
        };
      }
    }
  }

  const x: Complex[] = new Array(n).fill(cx(0, 0));
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let k = row + 1; k < n; k++) {
      const term = M[row][k];
      const v = x[k];
      sum = {
        re: sum.re - (term.re * v.re - term.im * v.im),
        im: sum.im - (term.re * v.im + term.im * v.re),
      };
    }
    x[row] = div(sum, M[row][row]);
  }
  return x;
}

export class UnionFind {
  private parent = new Map<string, string>();

  add(node: string) {
    if (!this.parent.has(node)) this.parent.set(node, node);
  }

  find(node: string): string {
    this.add(node);
    let root = node;
    while (this.parent.get(root) !== root) {
      const next = this.parent.get(root)!;
      // compression de chemin
      this.parent.set(root, this.parent.get(next) ?? next);
      root = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  groups(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const node of this.parent.keys()) {
      const root = this.find(node);
      const list = out.get(root) ?? [];
      list.push(node);
      out.set(root, list);
    }
    return out;
  }

  nodes(): string[] {
    return [...this.parent.keys()];
  }
}
