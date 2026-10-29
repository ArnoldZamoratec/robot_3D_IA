// Prepares local avatar assets (all written to git-ignored folders under public/):
//  1. Copies the Basis Universal transcoder from the installed `three` package (needed for KTX2 textures).
//  2. Downloads the three.js "facecap" demo head (52 ARKit blendshapes) for local development.
//     Its licence is not stated in the three.js repository: use it for local testing only and
//     replace it with an avatar you are licensed to use before any public deployment.
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const threeVersion = JSON.parse(
  await (await import("node:fs/promises")).readFile(`${root}node_modules/three/package.json`, "utf8"),
).version;

await mkdir(`${root}public/basis`, { recursive: true });
for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  await copyFile(`${root}node_modules/three/examples/jsm/libs/basis/${f}`, `${root}public/basis/${f}`);
}
console.log(`basis transcoder copied from three@${threeVersion}`);

const target = `${root}public/models/facecap.glb`;
const exists = await stat(target).then(() => true, () => false);
if (exists) {
  console.log("public/models/facecap.glb already present");
} else {
  // Pinned to a three.js release tag so the file cannot change underneath us.
  const url = "https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/facecap.glb";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  await mkdir(`${root}public/models`, { recursive: true });
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${url}`);
}
// Realistic full-body human (MakeHuman/MPFB, CC0) from met4citizen/TalkingHead, pinned to a commit.
const mpfb = `${root}public/models/mpfb.glb`;
if (!(await stat(mpfb).then(() => true, () => false))) {
  const url = "https://raw.githubusercontent.com/met4citizen/TalkingHead/6318ff8c798e4a661fcd70c9373c4ab789c822bb/avatars/mpfb.glb";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  await writeFile(mpfb, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${url}`);
}
console.log("Set VITE_AVATAR_URL=/models/mpfb.glb (CC0, recommended) in .env and restart `npm run dev`.");
