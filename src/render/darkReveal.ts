import * as THREE from 'three';

/**
 * Pitch-black levels (LevelDef.dark, Worlds 15 and 19 and some of 20): every wall, trap and hazard stays
 * hidden in the dark and only shows inside the glow around the sphere (Chris, 2026-11-22: "obstacles
 * should be hidden in the dark and only light up with the glow of the ball").
 *
 * Glowing trims and hazards are emissive, so lighting alone can't hide them. Instead each material's
 * colour (and alpha) is faded by its distance from the sphere in the shader. One set of uniforms is shared
 * by every patched material; with `on` at 0 a patched material draws exactly as before, so a material
 * shared with a normal level is harmless.
 */
export const darkReveal = {
  centre: { value: new THREE.Vector3() },
  /** Fully visible inside `inner` metres, gone beyond `outer`. */
  inner: { value: 1.8 },
  outer: { value: 3.4 },
  on: { value: 0 },
};

const PATCHED = Symbol('darkReveal');

function patch(m: THREE.Material): void {
  const mat = m as THREE.Material & { [PATCHED]?: boolean };
  if (mat[PATCHED]) return;
  const ok =
    (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
    (m as THREE.MeshBasicMaterial).isMeshBasicMaterial ||
    (m as THREE.MeshLambertMaterial).isMeshLambertMaterial ||
    (m as THREE.MeshPhongMaterial).isMeshPhongMaterial ||
    (m as THREE.LineBasicMaterial).isLineBasicMaterial;
  if (!ok) return;
  mat[PATCHED] = true;
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    before?.call(m, shader, renderer);
    shader.uniforms.uRevealCentre = darkReveal.centre;
    shader.uniforms.uRevealInner = darkReveal.inner;
    shader.uniforms.uRevealOuter = darkReveal.outer;
    shader.uniforms.uRevealOn = darkReveal.on;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRevealPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 rp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rp = instanceMatrix * rp;
          #endif
          vRevealPos = (modelMatrix * rp).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRevealPos;\nuniform vec3 uRevealCentre;\nuniform float uRevealInner;\nuniform float uRevealOuter;\nuniform float uRevealOn;',
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        {
          float rk = 1.0 - uRevealOn * smoothstep(uRevealInner, uRevealOuter, distance(vRevealPos, uRevealCentre));
          // Past the glow the board isn't drawn at all, so it can't even show as a black shape against the stars.
          if (rk < 0.01) discard;
          gl_FragColor.rgb *= rk;
          gl_FragColor.a *= rk;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'darkReveal';
  m.needsUpdate = true;
}

/** Hides everything under `roots` outside the sphere's glow, except objects in `keep` (and their children). */
export function applyDarkReveal(roots: THREE.Object3D[], keep: (THREE.Object3D | null | undefined)[]): void {
  const skip = new Set<THREE.Object3D>();
  for (const k of keep) k?.traverse((o) => skip.add(o));
  for (const root of roots) {
    root.traverse((o) => {
      if (skip.has(o)) return;
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patch(m);
    });
  }
}
