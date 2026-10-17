/**
 * Toda alteração de dados é um "patch": um mapa `caminho → novo valor`
 * (ou `null` para apagar). Exemplo:
 *
 *   { "bills/b123": { ...conta }, "invoices/i9/purchases/p4/ignored": true }
 *
 * O mesmo patch é aplicado no estado local e enviado ao Firebase com
 * `update()`, que grava só esses caminhos. Assim duas pessoas editando itens
 * diferentes nunca sobrescrevem o trabalho uma da outra.
 */

export type Patch = Record<string, unknown>;

type Tree = Record<string, unknown>;

function isObject(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Remove `undefined` (o Firebase rejeita) recursivamente. */
export function sanitize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitize) as T;
  if (!isObject(value)) return value;
  const out: Tree = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = sanitize(v);
  }
  return out as T;
}

export function getAtPath(tree: unknown, path: string): unknown {
  let node: unknown = tree;
  for (const key of path.split("/")) {
    if (!isObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

function setAtPath(tree: Tree, keys: string[], value: unknown): Tree {
  const [head, ...rest] = keys;
  const copy: Tree = { ...tree };
  if (rest.length === 0) {
    if (value === null || value === undefined) delete copy[head];
    else copy[head] = value;
    return copy;
  }
  const child = isObject(copy[head]) ? (copy[head] as Tree) : {};
  const updated = setAtPath(child, rest, value);
  if (Object.keys(updated).length === 0 && (value === null || value === undefined)) delete copy[head];
  else copy[head] = updated;
  return copy;
}

/** Aplica o patch sem mutar o objeto original (compartilha os ramos não alterados). */
export function applyPatch<T extends object>(tree: T, patch: Patch): T {
  let result = tree as unknown as Tree;
  for (const [path, value] of Object.entries(patch)) {
    result = setAtPath(result, path.split("/"), value === null ? null : sanitize(value));
  }
  return result as unknown as T;
}

/** Patch que desfaz `patch` quando aplicado sobre o resultado dele. */
export function inversePatch(tree: object, patch: Patch): Patch {
  const inverse: Patch = {};
  for (const path of Object.keys(patch)) {
    const previous = getAtPath(tree, path);
    inverse[path] = previous === undefined ? null : previous;
  }
  return inverse;
}

/** Chave segura para o Firebase (proíbe . # $ [ ] /). */
export function safeKey(value: string): string {
  return value.replace(/[.#$[\]/]/g, "_");
}
