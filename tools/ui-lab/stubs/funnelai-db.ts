// the real package talks to Postgres; the format tests never need it
export const getConfig = async (_k: string): Promise<string | null> => null
export const setConfig = async (..._a: unknown[]): Promise<void> => {}
