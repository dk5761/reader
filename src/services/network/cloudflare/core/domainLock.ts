class CloudflareDomainLock {
  private readonly inflightByDomain = new Map<string, Promise<unknown>>();

  run<T>(domain: string, operation: () => Promise<T>): Promise<T> {
    const existingOperation = this.inflightByDomain.get(domain);
    if (existingOperation) {
      return existingOperation as Promise<T>;
    }

    const operationPromise = operation().finally(() => {
      if (this.inflightByDomain.get(domain) === operationPromise) {
        this.inflightByDomain.delete(domain);
      }
    });

    this.inflightByDomain.set(domain, operationPromise);
    return operationPromise;
  }
}

export const cloudflareDomainLock = new CloudflareDomainLock();
