import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { applyMorphBindings, bindMorphTargets, composeFace, createFaceWeights, normalizeMorphName } from "./faceRig.ts";

function meshWithMorphs(names: string[]): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.morphAttributes.position = names.map(() => new Float32BufferAttribute(new Array(9).fill(0), 3));
  const mesh = new Mesh(geometry);
  mesh.updateMorphTargets();
  // Mimic GLTFLoader, which names morph targets from extras.targetNames.
  mesh.morphTargetDictionary = Object.fromEntries(names.map((n, i) => [n, i]));
  return mesh;
}

describe("composeFace", () => {
  it("adds layers and clamps to [0, 1]", () => {
    const w = composeFace([{ jawOpen: 0.7, eyeBlinkLeft: -0.5 }, { jawOpen: 0.6, mouthFunnel: 0.2 }]);
    expect(w.jawOpen).toBe(1);
    expect(w.mouthFunnel).toBeCloseTo(0.2);
    expect(w.eyeBlinkLeft).toBe(0);
    expect(w.browInnerUp).toBe(0);
  });
});

describe("morph bindings", () => {
  it("binds ARKit-named targets case-insensitively and ignores unknown targets", () => {
    const root = new Group();
    const head = meshWithMorphs(["JawOpen", "eyeBlinkLeft", "viseme_aa"]);
    root.add(head);
    const bindings = bindMorphTargets(root);
    expect(bindings.map((b) => b.channel).sort()).toEqual(["eyeBlinkLeft", "jawOpen"]);

    const weights = createFaceWeights();
    weights.jawOpen = 0.8;
    weights.eyeBlinkLeft = 0.3;
    applyMorphBindings(bindings, weights);
    expect(head.morphTargetInfluences).toEqual([0.8, 0.3, 0]);
  });

  it("accepts _L/_R suffixed names (Face Cap / some exporters)", () => {
    expect(normalizeMorphName("eyeBlink_L")).toBe("eyeblinkleft");
    expect(normalizeMorphName("mouthSmile.R")).toBe("mouthsmileright");
    expect(normalizeMorphName("jawOpen")).toBe("jawopen");
    const root = new Group();
    root.add(meshWithMorphs(["eyeBlink_L", "mouthSmile_R", "browInnerUp"]));
    expect(bindMorphTargets(root).map((b) => b.channel)).toEqual(["eyeBlinkLeft", "mouthSmileRight", "browInnerUp"]);
  });

  it("returns no bindings for a model without morph targets", () => {
    const root = new Group();
    root.add(new Mesh(new BufferGeometry()));
    expect(bindMorphTargets(root)).toEqual([]);
  });
});
