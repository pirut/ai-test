export async function readApiPayload<T>(response: Response) {
  const text = await response.text();
  if (!text) {
    return {} as { error?: string } & Partial<T>;
  }

  try {
    return JSON.parse(text) as { error?: string } & Partial<T>;
  } catch {
    return { error: `The server returned an invalid response (${response.status}).` } as {
      error?: string;
    } & Partial<T>;
  }
}
