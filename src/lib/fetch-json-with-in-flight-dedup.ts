const inFlightGetRequests = new Map<string, Promise<unknown>>();

function getErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const errorValue = (data as { error?: unknown }).error;
    if (typeof errorValue === 'string' && errorValue.length > 0) {
      return errorValue;
    }
  }

  return `Request failed with status ${status}`;
}

export async function fetchJsonWithInFlightDedup<T>(url: string): Promise<T> {
  const existingRequest = inFlightGetRequests.get(url) as Promise<T> | undefined;
  if (existingRequest !== undefined) {
    return existingRequest;
  }

  const request = fetch(url)
    .then(async (response) => {
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data, response.status));
      }

      return data as T;
    })
    .finally(() => {
      inFlightGetRequests.delete(url);
    });

  inFlightGetRequests.set(url, request);
  return request;
}
