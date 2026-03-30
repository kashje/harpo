export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
    console.error(`❌ [StorageError] ${this.name}: ${this.message}`);
  }
}

export class StorageAdapterError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = "StorageAdapterError";
  }
}
