/**
 * Leitura tipada de colunas jsonb (o banco as entrega como `Json`/`unknown`).
 * O chamador declara a forma esperada; nada é validado em tempo de execução.
 */
export function jsonAs<T>(value: unknown): T | null {
  return (value ?? null) as T | null;
}

export function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
