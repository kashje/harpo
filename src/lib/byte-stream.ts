/**
 * Helpers for reading byte streams piece by piece, shared by the browser and the server. Network
 * streams arrive in pieces of arbitrary size; these regroup them.
 */

export type Bytes = Uint8Array<ArrayBuffer>;

/** Collects pieces of a byte stream and hands out the bytes in the amounts asked for. */
export class ByteQueue {
  private pieces: Uint8Array[] = [];
  length = 0;

  push(piece: Uint8Array) {
    if (piece.length === 0) return;
    this.pieces.push(piece);
    this.length += piece.length;
  }

  /** Removes and returns the first `count` bytes. `count` must not exceed `length`. */
  take(count: number): Bytes {
    const out = new Uint8Array(count);
    let offset = 0;
    while (offset < count) {
      const piece = this.pieces[0]!;
      const size = Math.min(piece.length, count - offset);
      out.set(piece.subarray(0, size), offset);
      offset += size;
      if (size === piece.length) this.pieces.shift();
      else this.pieces[0] = piece.subarray(size);
    }
    this.length -= count;
    return out;
  }
}

/** The pieces of a `ReadableStream`. Not every browser can iterate streams with `for await` yet. */
export async function* streamPieces(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    // Stops the download when the reader gives up early; harmless once the stream is done.
    reader.cancel().catch(() => undefined);
  }
}

/**
 * Regroups a byte stream into chunks of `size` bytes. The last chunk may be shorter, and is the only
 * one marked `last`; an empty stream gives one empty last chunk.
 */
export async function* splitChunks(
  source: AsyncIterable<Uint8Array>,
  size: number,
): AsyncGenerator<{ bytes: Bytes; last: boolean }> {
  const queue = new ByteQueue();
  for await (const piece of source) {
    queue.push(piece);
    // Hold back a full chunk until more bytes arrive: only the end of the stream tells it's last.
    while (queue.length > size) yield { bytes: queue.take(size), last: false };
  }
  yield { bytes: queue.take(queue.length), last: true };
}
