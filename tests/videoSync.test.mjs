import test from "node:test";
import assert from "node:assert/strict";
import { writePublicVideos } from "../src/lib/videoSync.js";

test("cloud write excludes blob URLs and private drafts, keeping the public HTTP video", async () => {
  const writes = [];
  const storage = {
    async set(...args) {
      writes.push(args);
    },
  };
  const blob = { id: "local", public: true, videoUrl: "blob:https://example.com/local" };
  const remote = { id: "remote", public: true, videoUrl: "https://example.com/reel.mp4" };
  const draft = { id: "draft", public: false, videoUrl: "https://example.com/draft.mp4" };

  const result = await writePublicVideos(storage, "marketplace:videos", [blob, remote, draft]);

  assert.deepEqual(writes, [["marketplace:videos", [remote], true]]);
  assert.deepEqual(result, { written: true, count: 1 });
});

test("a blob-only snapshot makes no cloud write and cannot erase the shared feed", async () => {
  const writes = [];
  const storage = { async set(...args) { writes.push(args); } };
  const result = await writePublicVideos(storage, "marketplace:videos", [
    { id: "local", public: true, videoUrl: "blob:https://example.com/local" },
  ]);
  assert.deepEqual(writes, []);
  assert.deepEqual(result, { written: false, count: 0 });
});
