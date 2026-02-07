import { SourceAlreadyRegisteredError, SourceNotFoundError } from "./errors";
import type { SourceAdapter, SourceDescriptor, SourceId } from "./types";

class SourceRegistry {
  private readonly adaptersById = new Map<SourceId, SourceAdapter>();

  register(source: SourceAdapter): void {
    if (this.adaptersById.has(source.descriptor.id)) {
      throw new SourceAlreadyRegisteredError(source.descriptor.id);
    }

    this.adaptersById.set(source.descriptor.id, source);
  }

  registerMany(sources: SourceAdapter[]): void {
    sources.forEach((source) => this.register(source));
  }

  unregister(sourceId: SourceId): void {
    this.adaptersById.delete(sourceId);
  }

  has(sourceId: SourceId): boolean {
    return this.adaptersById.has(sourceId);
  }

  get(sourceId: SourceId): SourceAdapter | undefined {
    return this.adaptersById.get(sourceId);
  }

  require(sourceId: SourceId): SourceAdapter {
    const source = this.adaptersById.get(sourceId);
    if (!source) {
      throw new SourceNotFoundError(sourceId);
    }

    return source;
  }

  list(): SourceDescriptor[] {
    return Array.from(this.adaptersById.values()).map((source) => source.descriptor);
  }

  listAdapters(): SourceAdapter[] {
    return Array.from(this.adaptersById.values());
  }
}

export const sourceRegistry = new SourceRegistry();
