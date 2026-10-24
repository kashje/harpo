import { describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

import { env } from "@/env";
import { getCaller } from "@/test/trpc";
import {
  expireSecret,
  findStoredSecret,
  makeFileSecretInput,
} from "@/test/secrets";
import { getRedis } from "@/server/redis";
import { decodeSecretIdToken, secretFilePath } from "@/server/api/utils/secret";
import { sweepOrphanedFiles } from "./sweeper";

const storedFileExists = (idToken: string) =>
  existsSync(
    join(env.STORAGE_BASE_PATH, secretFilePath(decodeSecretIdToken(idToken))),
  );

describe("sweepOrphanedFiles", () => {
  it("deletes the files of expired secrets and keeps the rest", async () => {
    const caller = await getCaller();
    const expired = await caller.storage.upload(
      (await makeFileSecretInput()).input,
    );
    const active = await caller.storage.upload(
      (await makeFileSecretInput()).input,
    );
    await expireSecret(expired.idToken);

    expect(await sweepOrphanedFiles()).toBe(1);

    expect(storedFileExists(expired.idToken)).toBe(false);
    expect(storedFileExists(active.idToken)).toBe(true);
    expect(await findStoredSecret(active.idToken)).not.toBeNull();
  });

  it("deletes every file once Redis has lost its data", async () => {
    const caller = await getCaller();
    const { idToken } = await caller.storage.upload(
      (await makeFileSecretInput()).input,
    );
    await getRedis().flushall();

    expect(await sweepOrphanedFiles()).toBe(1);
    expect(storedFileExists(idToken)).toBe(false);
  });

  it("keeps every file when Redis can't tell which secrets exist", async () => {
    const caller = await getCaller();
    const { idToken } = await caller.storage.upload(
      (await makeFileSecretInput()).input,
    );
    const redis = getRedis();
    const pipeline = redis.pipeline.bind(redis);
    const spy = vi.spyOn(redis, "pipeline").mockImplementation(() => {
      const failing = pipeline();
      failing.exec = () => Promise.reject(new Error("connection refused"));
      return failing;
    });

    await expect(sweepOrphanedFiles()).rejects.toThrow("connection refused");
    expect(storedFileExists(idToken)).toBe(true);
    spy.mockRestore();
  });
});
