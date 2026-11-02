import * as THREE from "three";
import { SHAPES, scene, type SceneTarget } from "./store";

/**
 * One persistent GPU particle world behind the whole site.
 * Particles live in a float texture; each frame a fullscreen pass moves them (curl noise, pull onto a
 * signed-distance shape, spring to a home), and a small GPU fluid simulation lets the pointer stir them.
 * Sections pick the shape via `scene.target`; the engine morphs between shapes by blending their SDFs.
 */

export interface EngineOptions {
  side: number; // particle texture side; count = side²
  still: boolean; // prefers-reduced-motion: settle, draw, no animation
}

const baseVert = /* glsl */ `
  uniform vec2 texelSize;
  varying vec2 vUv, vL, vR, vT, vB;
  void main() {
    vUv = uv;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

// ---------------- fluid ----------------
const SPLAT = /* glsl */ `
  precision highp float;
  uniform sampler2D uTarget; uniform vec2 uP0, uP1; uniform vec3 uColor;
  uniform float uRadius, uAspect, uClamp;
  varying vec2 vUv;
  void main() {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 pa = (vUv - uP0) * asp, ba = (uP1 - uP0) * asp;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    vec2 d = pa - ba * h;
    vec3 c = texture2D(uTarget, vUv).rgb + uColor * exp(-dot(d, d) / (uRadius * uRadius));
    if (uClamp > 0.5) c = min(c, vec3(1.0));
    gl_FragColor = vec4(c, 1.0);
  }`;
const CURL = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity; varying vec2 vUv, vL, vR, vT, vB;
  void main() {
    float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
    gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
  }`;
const VORTICITY = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity, uCurl; uniform float uCurlAmt, uDt;
  varying vec2 vUv, vL, vR, vT, vB;
  void main() {
    float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= uCurlAmt * C;
    force.y *= -1.0;
    vec2 v = texture2D(uVelocity, vUv).xy + force * uDt;
    gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
  }`;
const DIVERGENCE = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity; varying vec2 vUv, vL, vR, vT, vB;
  void main() {
    float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }`;
const SCALE = /* glsl */ `
  precision highp float;
  uniform sampler2D uTexture; uniform float uValue; varying vec2 vUv;
  void main() { gl_FragColor = uValue * texture2D(uTexture, vUv); }`;
const PRESSURE = /* glsl */ `
  precision highp float;
  uniform sampler2D uPressure, uDivergence; varying vec2 vUv, vL, vR, vT, vB;
  void main() {
    float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
    gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
  }`;
const GRAD_SUB = /* glsl */ `
  precision highp float;
  uniform sampler2D uPressure, uVelocity; varying vec2 vUv, vL, vR, vT, vB;
  void main() {
    float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
    gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
  }`;
const ADVECT = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity, uSource; uniform vec2 uVelTexel; uniform float uDt, uDissipation;
  varying vec2 vUv;
  void main() {
    vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uVelTexel;
    gl_FragColor = uDissipation * texture2D(uSource, coord);
  }`;
const COPY = /* glsl */ `
  precision highp float; uniform sampler2D uTex; varying vec2 vUv;
  void main() { gl_FragColor = texture2D(uTex, vUv); }`;

// ---------------- shapes ----------------
/** All shapes fit roughly inside a 0.65-unit box, centred at the origin, facing +z. */
const SHAPE_LIB = /* glsl */ `
  float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
  float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
  float sdBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  float sdCylY(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }
  float extrude(float d2, float z, float h) {
    vec2 w = vec2(d2, abs(z) - h);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
  }
  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  float sdTrapezoid(vec2 p, float r1, float r2, float he) {
    vec2 k1 = vec2(r2, he), k2 = vec2(r2 - r1, 2.0 * he);
    p.x = abs(p.x);
    vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
    vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
  }
  float sdTriIso(vec2 p, vec2 q) {
    p.x = abs(p.x);
    vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
    vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
    float s = -sign(q.y);
    vec2 d = min(vec2(dot(a, a), s * (p.x * q.y - p.y * q.x)), vec2(dot(b, b), s * (p.y - q.y)));
    return -sqrt(d.x) * sign(d.y);
  }

  float shSheet(vec3 p) {
    p.z -= 0.35 * p.x * p.x - 0.03;
    float box = sdRBox(p, vec3(0.21, 0.297, 0.006), 0.005);
    float ear = dot(p.xy - vec2(0.21, 0.297), vec2(0.7071)) + 0.07;
    return max(box, ear);
  }
  float shBolt(vec3 p) {
    vec2 v[7] = vec2[7](vec2(0.07, 0.34), vec2(-0.17, -0.03), vec2(-0.015, -0.03), vec2(-0.08, -0.34),
                        vec2(0.18, 0.06), vec2(0.025, 0.06), vec2(0.13, 0.34));
    vec2 q = p.xy;
    float d = dot(q - v[0], q - v[0]);
    float s = 1.0;
    for (int i = uZero, j = 6; i < 7; j = i, i++) {
      vec2 e = v[j] - v[i], w = q - v[i];
      vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
      d = min(d, dot(b, b));
      bvec3 c = bvec3(q.y >= v[i].y, q.y < v[j].y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s *= -1.0;
    }
    return extrude(s * sqrt(d), p.z, 0.045) - 0.008;
  }
  float shFlask(vec3 p) {
    vec2 q = vec2(length(p.xz), p.y);
    float body = sdTrapezoid(q - vec2(0.0, -0.15), 0.25, 0.075, 0.15);
    float neck = sdBox2(q - vec2(0.0, 0.11), vec2(0.07, 0.12));
    float rim = sdBox2(q - vec2(0.0, 0.235), vec2(0.095, 0.018));
    return smin(smin(body, neck, 0.04), rim, 0.01) - 0.005;
  }
  float shCoins(vec3 p) {
    float d = 1e5;
    for (int i = uZero; i < 5; i++) {
      float fi = float(i);
      vec3 o = vec3(0.025 * sin(fi * 2.3), -0.22 + fi * 0.07, 0.02 * cos(fi * 1.7));
      d = min(d, sdCylY(p - o, 0.026, 0.21) - 0.006);
    }
    // one coin standing on its edge in front of the stack
    vec3 r = p - vec3(0.2, -0.05, 0.12);
    r.yz = rot(1.5708) * r.yz;
    r.xy = rot(0.3) * r.xy;
    return min(d, sdCylY(r, 0.022, 0.16) - 0.006);
  }
  float shPillars(vec3 p) {
    float d = sdBox(p - vec3(0.0, -0.27, 0.0), vec3(0.32, 0.025, 0.14));
    d = min(d, sdBox(p - vec3(0.0, -0.225, 0.0), vec3(0.29, 0.02, 0.125)));
    for (int i = uZero; i < 4; i++) {
      float x = -0.2 + float(i) * 0.1333;
      d = min(d, sdCylY(p - vec3(x, -0.04, 0.0), 0.17, 0.036));
    }
    d = min(d, sdBox(p - vec3(0.0, 0.15, 0.0), vec3(0.3, 0.025, 0.13)));
    float tri = sdTriIso(vec2(p.x, 0.32 - p.y), vec2(0.32, 0.14));
    return min(d, extrude(tri, p.z, 0.12));
  }
  float shShield(vec3 p) {
    vec2 q = p.xy;
    float vesica = length(vec2(abs(q.x) + 0.25, q.y + 0.02)) - 0.47;
    float bottom = max(vesica, q.y - 0.12);
    float top = sdBox2(q - vec2(0.0, 0.2), vec2(0.2, 0.09));
    float d2 = min(bottom, top);
    float bulge = 0.035 + 0.03 * (1.0 - clamp(length(q) / 0.4, 0.0, 1.0));
    return extrude(d2, p.z, bulge) - 0.006;
  }
  float shBook(vec3 p) {
    float a = 0.42;
    vec3 l = p; l.xz = rot(-a) * l.xz;
    vec3 r = p; r.xz = rot(a) * r.xz;
    float left = sdRBox(l - vec3(-0.175, 0.0, 0.0), vec3(0.175, 0.25, 0.018), 0.006);
    float right = sdRBox(r - vec3(0.175, 0.0, 0.0), vec3(0.175, 0.25, 0.018), 0.006);
    float spine = sdCylY(p - vec3(0.0, 0.0, -0.01), 0.25, 0.025);
    return min(min(left, right), spine);
  }
  float shLock(vec3 p) {
    float body = sdRBox(p - vec3(0.0, -0.1, 0.0), vec3(0.19, 0.15, 0.07), 0.03);
    vec3 s = p - vec3(0.0, 0.1, 0.0);
    float torus = length(vec2(length(s.xy) - 0.12, s.z)) - 0.03;
    float arch = max(torus, -s.y);
    float legs = min(sdCylY(s - vec3(0.12, -0.08, 0.0), 0.08, 0.03), sdCylY(s - vec3(-0.12, -0.08, 0.0), 0.08, 0.03));
    float hole = length(p.xy - vec2(0.0, -0.08)) - 0.03;
    return max(min(min(body, arch), legs), -max(hole, -(p.z - 0.03)));
  }

  float sdf(vec3 p) {
  #if SHAPE_ID == 0
    return shSheet(p);
  #elif SHAPE_ID == 1
    return shBolt(p);
  #elif SHAPE_ID == 2
    return shFlask(p);
  #elif SHAPE_ID == 3
    return shCoins(p);
  #elif SHAPE_ID == 4
    return shPillars(p);
  #elif SHAPE_ID == 5
    return shShield(p);
  #elif SHAPE_ID == 6
    return shBook(p);
  #else
    return shLock(p);
  #endif
  }
`;

/**
 * One small program per shape (selected at compile time). Branching between all shapes in a single
 * shader gets flattened by some drivers (every particle would pay for every shape), so we don't.
 * Morphs happen physically: particles are pulled from the old surface onto the new one.
 */
const simFrag = (shapeId: number) => /* glsl */ `
  #define SHAPE_ID ${shapeId}
  precision highp float;
  uniform sampler2D tPos, tHome, tRand, tVel, tDen;
  uniform float uTime, uHZ, uFluid, uSheet, uChaos, uSettle;
  uniform int uZero; // always 0; stops the compiler unrolling loops
  uniform mat4 uProjModel; uniform mat3 uToLocal;
  varying vec2 vUv;

  ${SHAPE_LIB}
  // Tetrahedral gradient (4 samples); their mean is also the distance itself, to first order.
  vec4 sdfAndNormal(vec3 p) {
    const float e = 0.0015;
    vec3 n = vec3(0.0);
    float sum = 0.0;
    for (int i = uZero; i < 4; i++) {
      vec3 k = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
      float s = sdf(p + k * e);
      n += k * s;
      sum += s;
    }
    return vec4(normalize(n + 1e-8), sum * 0.25);
  }
  vec3 pot(vec3 p) {
    return vec3(
      sin(p.y * 1.7 + p.z * 2.3) + 0.5 * sin(p.y * 3.1 - p.z * 1.3 + 1.7) + 0.25 * sin(p.y * 5.3 + p.z * 4.1),
      sin(p.z * 1.9 + p.x * 2.1 + 2.0) + 0.5 * sin(p.z * 2.9 - p.x * 1.7) + 0.25 * sin(p.z * 4.7 + p.x * 5.1 + 3.0),
      sin(p.x * 2.2 + p.y * 1.8 + 4.0) + 0.5 * sin(p.x * 3.3 - p.y * 2.7 + 0.5) + 0.25 * sin(p.x * 5.7 + p.y * 4.3));
  }
  vec3 curlNoise(vec3 p) {
    const float e = 0.01;
    vec3 dx = (pot(p + vec3(e, 0, 0)) - pot(p - vec3(e, 0, 0))) / (2.0 * e);
    vec3 dy = (pot(p + vec3(0, e, 0)) - pot(p - vec3(0, e, 0))) / (2.0 * e);
    vec3 dz = (pot(p + vec3(0, 0, e)) - pot(p - vec3(0, 0, e))) / (2.0 * e);
    return normalize(vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) + 1e-6);
  }

  void main() {
    vec3 pos = texture2D(tPos, vUv).xyz;
    vec4 h = texture2D(tHome, vUv);
    vec3 rnd = texture2D(tRand, vUv).xyz;
    bool loose = h.w < 0.12;
    if (length(pos) > 2.4) pos *= 0.5;

    pos += curlNoise(pos * 0.8 + uTime * 0.05) * (loose ? 0.0015 : 0.0004 + uChaos * 0.004) * uHZ;

    vec4 dn = sdfAndNormal(pos);
    float d = dn.w;
    vec3 g = dn.xyz;
    pos += cross(normalize(pos + 1e-6), g) * 0.0003 * (1.0 - uChaos);
    // On the page, hold only near the surface so stirred particles fly home instead of sticking to an edge.
    float near = 1.0 - smoothstep(0.02, 0.08, abs(d));
    // uSettle ramps 0→1 after a shape change, so particles drift and swirl into the new form.
    float hold = loose ? 0.0 : 0.3 * mix(1.0, near, uSheet) * (1.0 - uChaos) * mix(0.06, 1.0, uSettle);
    pos -= g * d * hold;

    vec3 cloud = rnd * vec3(1.7, 1.05, 0.8);
    vec3 anchor = loose ? h.xyz : mix(rnd * 0.45, h.xyz, uSheet);
    float k = loose ? 0.002 : mix(0.0015, 0.035, uSheet);
    anchor = mix(anchor, cloud, uChaos);
    k = mix(k, 0.025, uChaos);
    pos += (anchor - pos) * k * uHZ;

    if (uFluid > 0.5) {
      vec4 clip = uProjModel * vec4(pos, 1.0);
      vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
      vec3 flow = uToLocal * vec3(texture2D(tVel, suv).xy, 0.0);
      pos += flow * 0.00025 * uHZ * texture2D(tDen, suv).r;
    }
    if (any(isnan(pos)) || any(isinf(pos))) pos = rnd * 0.5; // never lose a particle to bad maths
    gl_FragColor = vec4(pos, 1.0);
  }`;

const POINTS_VERT = /* glsl */ `
  uniform sampler2D uPos; uniform float uDPR, uSize, uTime, uSheet, uScan;
  attribute vec4 random;
  varying vec4 vRandom; varying float vTone; varying float vBlend;
  void main() {
    vec3 pos = texture2D(uPos, position.xy).xyz;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);

    // Tone on the page: 1 = text line, 2 = highlighted line or scan line
    float onPage = uSheet * (1.0 - smoothstep(0.015, 0.04, abs(pos.z - (0.35 * pos.x * pos.x - 0.03))));
    float row = (0.24 - pos.y) / 0.045;
    float ri = floor(row);
    float inRow = step(0.0, row) * step(ri, 10.0) * step(fract(row), 0.32);
    float rowLen = 0.12 + 0.26 * fract(sin(ri * 12.9898) * 43758.5453);
    float inLine = inRow * step(pos.x, -0.16 + rowLen) * step(-0.17, pos.x);
    float speed = mix(0.12, 0.7, uScan);
    float scanY = 0.32 - mod(uTime * speed, 0.8);
    float scan = (1.0 - smoothstep(0.0, mix(0.012, 0.02, uScan), abs(pos.y - scanY))) * step(abs(pos.x), 0.22);
    vTone = max(onPage * inLine * (ri == 7.0 ? 2.0 : 1.0), onPage * scan * 2.0);

    // Blend coordinate across the form: electric blue → violet → neon red
    vBlend = clamp(0.5 + pos.x * 1.3 + pos.y * 0.7 + 0.18 * sin(uTime * 0.35 + pos.y * 4.0 + pos.z * 3.0), 0.0, 1.0);
    vRandom = random;
    gl_PointSize = uSize * uDPR * mix(0.55, 1.0, random.z) * (1.0 + step(1.5, vTone) * 0.5) * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const POINTS_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime, uGlow, uSheet;
  varying vec4 vRandom; varying float vTone; varying float vBlend;
  const vec3 BLUE = vec3(0.145, 0.388, 0.922);
  const vec3 VIOLET = vec3(0.49, 0.25, 0.9);
  const vec3 RED = vec3(1.0, 0.188, 0.31);
  vec3 blend(float t) { return t < 0.5 ? mix(BLUE, VIOLET, t * 2.0) : mix(VIOLET, RED, t * 2.0 - 1.0); }
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float soft = 1.0 - smoothstep(0.04, 0.25, d);
    vec3 hue = blend(vBlend);
    // paper is paler on the page, richer colour on the other forms
    vec3 col = mix(hue * 0.9, mix(hue, vec3(0.82, 0.86, 1.0), 0.45) * 0.6, uSheet);
    col *= mix(0.55, 1.0, vRandom.x);
    col = mix(col, vec3(0.55, 0.72, 1.0) * 1.5, step(0.5, vTone));
    col = mix(col, RED * 1.6, step(1.5, vTone));
    float sparkle = pow(vRandom.z, 40.0) * (0.6 + 0.4 * sin(uTime * 4.0 + vRandom.y * 20.0));
    col += mix(vec3(0.7, 0.8, 1.0), RED, step(0.8, vRandom.w)) * sparkle * 2.0;
    gl_FragColor = vec4(col * soft * 0.72 * uGlow, 1.0);
  }`;

type Filter = THREE.MinificationTextureFilter & THREE.MagnificationTextureFilter;
const makeTarget = (w: number, h: number, type: THREE.TextureDataType, filter: Filter) =>
  new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false });

interface DoubleTarget {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap(): void;
}
function doubleTarget(w: number, h: number, type: THREE.TextureDataType, filter: Filter): DoubleTarget {
  const o = {
    read: makeTarget(w, h, type, filter),
    write: makeTarget(w, h, type, filter),
    swap() {
      const t = o.read;
      o.read = o.write;
      o.write = t;
    },
  };
  return o;
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Throws if WebGL2 / float render targets are unavailable; the caller shows a static fallback. */
export function createScene(canvas: HTMLCanvasElement, opts: EngineOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  if (!renderer.extensions.has("EXT_color_buffer_float")) {
    renderer.dispose();
    throw new Error("float render targets unsupported");
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 0, 6);
  camera.position.copy(camBase);
  const group = new THREE.Group();
  world.add(group);

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)));
  quad.frustumCulled = false;
  quadScene.add(quad);
  const pass = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(null);
  };
  const mat = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
    track(new THREE.ShaderMaterial({ vertexShader: baseVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }));

  // ---- fluid ----
  const SIM_RES = 128;
  const DYE_RES = 256;
  const FLUID = { velDiss: 0.98, denDiss: 0.97, pressDiss: 0.95, iters: 5, curl: 30, dt: 1 / 60 };
  const HALF = THREE.HalfFloatType;
  const velocity = doubleTarget(SIM_RES, SIM_RES, HALF, THREE.LinearFilter);
  const density = doubleTarget(DYE_RES, DYE_RES, HALF, THREE.LinearFilter);
  const pressure = doubleTarget(SIM_RES, SIM_RES, HALF, THREE.NearestFilter);
  const curlT = makeTarget(SIM_RES, SIM_RES, HALF, THREE.NearestFilter);
  const divT = makeTarget(SIM_RES, SIM_RES, HALF, THREE.NearestFilter);
  [velocity.read, velocity.write, density.read, density.write, pressure.read, pressure.write, curlT, divT].forEach(track);
  const simTexel = new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES);
  const tx = { texelSize: { value: simTexel } };

  const splatMat = mat(SPLAT, {
    ...tx,
    uTarget: { value: null },
    uP0: { value: new THREE.Vector2() },
    uP1: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Vector3() },
    uRadius: { value: 0.05 },
    uAspect: { value: 1 },
    uClamp: { value: 0 },
  });
  const curlMat = mat(CURL, { ...tx, uVelocity: { value: null } });
  const vortMat = mat(VORTICITY, { ...tx, uVelocity: { value: null }, uCurl: { value: null }, uCurlAmt: { value: FLUID.curl }, uDt: { value: FLUID.dt } });
  const divMat = mat(DIVERGENCE, { ...tx, uVelocity: { value: null } });
  const scaleMat = mat(SCALE, { ...tx, uTexture: { value: null }, uValue: { value: FLUID.pressDiss } });
  const pressMat = mat(PRESSURE, { ...tx, uPressure: { value: null }, uDivergence: { value: null } });
  const gradMat = mat(GRAD_SUB, { ...tx, uPressure: { value: null }, uVelocity: { value: null } });
  const advMat = mat(ADVECT, { ...tx, uVelocity: { value: null }, uSource: { value: null }, uVelTexel: { value: simTexel }, uDt: { value: FLUID.dt }, uDissipation: { value: 1 } });

  const splat = (t: DoubleTarget, p0: THREE.Vector2, p1: THREE.Vector2, color: THREE.Vector3, radius: number, aspect: number, clampOn: boolean) => {
    const u = splatMat.uniforms;
    u.uTarget.value = t.read.texture;
    u.uP0.value.copy(p0);
    u.uP1.value.copy(p1);
    u.uColor.value.copy(color);
    u.uRadius.value = radius;
    u.uAspect.value = aspect;
    u.uClamp.value = clampOn ? 1 : 0;
    pass(splatMat, t.write);
    t.swap();
  };

  const fluidStep = () => {
    curlMat.uniforms.uVelocity.value = velocity.read.texture;
    pass(curlMat, curlT);
    vortMat.uniforms.uVelocity.value = velocity.read.texture;
    vortMat.uniforms.uCurl.value = curlT.texture;
    pass(vortMat, velocity.write);
    velocity.swap();
    divMat.uniforms.uVelocity.value = velocity.read.texture;
    pass(divMat, divT);
    scaleMat.uniforms.uTexture.value = pressure.read.texture;
    pass(scaleMat, pressure.write);
    pressure.swap();
    pressMat.uniforms.uDivergence.value = divT.texture;
    for (let i = 0; i < FLUID.iters; i++) {
      pressMat.uniforms.uPressure.value = pressure.read.texture;
      pass(pressMat, pressure.write);
      pressure.swap();
    }
    gradMat.uniforms.uPressure.value = pressure.read.texture;
    gradMat.uniforms.uVelocity.value = velocity.read.texture;
    pass(gradMat, velocity.write);
    velocity.swap();
    advMat.uniforms.uVelocity.value = velocity.read.texture;
    advMat.uniforms.uSource.value = velocity.read.texture;
    advMat.uniforms.uDissipation.value = FLUID.velDiss;
    pass(advMat, velocity.write);
    velocity.swap();
    advMat.uniforms.uSource.value = density.read.texture;
    advMat.uniforms.uDissipation.value = FLUID.denDiss;
    pass(advMat, density.write);
    density.swap();
  };

  // ---- particles ----
  const N = opts.side;
  const count = N * N;
  const homeData = new Float32Array(count * 4);
  const randData = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const w = Math.random();
    let x: number, y: number, z: number;
    if (w < 0.12) {
      x = (Math.random() * 2 - 1) * 1.1;
      y = (Math.random() * 2 - 1) * 0.8;
      z = (Math.random() * 2 - 1) * 0.6;
    } else {
      do {
        x = (Math.random() * 2 - 1) * 0.205;
        y = (Math.random() * 2 - 1) * 0.292;
      } while ((x - 0.21 + (y - 0.297)) / Math.SQRT2 + 0.07 > 0);
      z = 0.35 * x * x - 0.03 + (Math.random() * 2 - 1) * 0.004;
    }
    homeData.set([x, y, z, w], i * 4);
    randData.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1, 1], i * 4);
  }
  const homeTex = track(new THREE.DataTexture(homeData, N, N, THREE.RGBAFormat, THREE.FloatType));
  homeTex.needsUpdate = true;
  const randTex = track(new THREE.DataTexture(randData, N, N, THREE.RGBAFormat, THREE.FloatType));
  randTex.needsUpdate = true;
  const positions = doubleTarget(N, N, THREE.FloatType, THREE.NearestFilter);
  track(positions.read);
  track(positions.write);
  const copyMat = mat(COPY, { ...tx, uTex: { value: randTex } });
  pass(copyMat, positions.read);
  pass(copyMat, positions.write);

  // One uniforms object shared by the per-shape programs.
  const simUniforms: Record<string, THREE.IUniform> = {
    ...tx,
    tPos: { value: null },
    tHome: { value: homeTex },
    tRand: { value: randTex },
    tVel: { value: null },
    tDen: { value: null },
    uTime: { value: 0 },
    uHZ: { value: 1 },
    uFluid: { value: opts.still ? 0 : 1 },
    uZero: { value: 0 },
    uSheet: { value: 1 },
    uChaos: { value: 0 },
    uSettle: { value: 1 },
    uProjModel: { value: new THREE.Matrix4() },
    uToLocal: { value: new THREE.Matrix3() },
  };
  const simMats = new Map<number, THREE.ShaderMaterial>();
  const simMatFor = (id: number) => {
    let m = simMats.get(id);
    if (!m) {
      m = mat(simFrag(id), simUniforms);
      simMats.set(id, m);
    }
    return m;
  };
  // Warm the other shape programs up after the intro, compiling off the main thread where the
  // browser supports it (KHR_parallel_shader_compile), so the first morph doesn't stutter.
  let disposed = false;
  const warm = async () => {
    const warmScene = new THREE.Scene();
    const warmQuad = new THREE.Mesh(quad.geometry);
    warmQuad.frustumCulled = false;
    warmScene.add(warmQuad);
    for (let id = 0; id < 8 && !disposed; id++) {
      warmQuad.material = simMatFor(id);
      await renderer.compileAsync(warmScene, quadCam).catch(() => undefined);
    }
  };

  const geo = track(new THREE.BufferGeometry());
  const uvPos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    uvPos[i * 3] = ((i % N) + 0.5) / N;
    uvPos[i * 3 + 1] = (Math.floor(i / N) + 0.5) / N;
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(uvPos, 3));
  geo.setAttribute("random", new THREE.BufferAttribute(rnd, 4));

  const pointsMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPos: { value: null },
        uTime: { value: 0 },
        uDPR: { value: dpr },
        uSize: { value: N >= 256 ? 2.2 : 3.2 },
        uSheet: { value: 1 },
        uScan: { value: 0 },
        uGlow: { value: 1 },
      },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
    }),
  );
  const points = new THREE.Points(geo, pointsMat);
  points.frustumCulled = false;
  group.add(points);

  // ---- animated state, eased toward scene.target ----
  const st = { x: 0.5, y: 0, s: 1.5, chaos: 1, scan: 0, glow: 0, from: 0, to: 0, mix: 1 };
  let width = 1;
  let height = 1;
  let halfW = 1;
  let halfH = 1;
  const layout = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    halfH = camBase.z * Math.tan(THREE.MathUtils.degToRad(15));
    halfW = halfH * camera.aspect;
  };
  const placement = (t: SceneTarget) => (camera.aspect < 0.9 && t.portrait ? t.portrait : t);

  const advance = (dt: number) => {
    const t = scene.target;
    const id = SHAPES[t.shape];
    if (id !== st.to) {
      st.from = st.mix > 0.5 ? st.to : st.from;
      st.to = id;
      st.mix = st.from === id ? 1 : 0;
    }
    st.mix = Math.min(1, st.mix + dt / 1.1);
    const p = placement(t);
    const k = opts.still ? 1e3 : 3;
    st.x = damp(st.x, p.x, k, dt);
    st.y = damp(st.y, p.y, k, dt);
    st.s = damp(st.s, p.s, k, dt);
    st.chaos = damp(st.chaos, t.chaos, opts.still ? 1e3 : 2.2, dt);
    st.scan = damp(st.scan, t.scan, 4, dt);
    st.glow = damp(st.glow, p.glow ?? t.glow, 2, dt);
  };

  // ---- pointer ----
  const pointer = { x: 0, y: 0, px: 0, py: 0, init: false };
  let lastSplat = 0;
  const onMove = (x: number, y: number) => {
    pointer.x = x;
    pointer.y = y;
    if (!pointer.init) {
      pointer.px = x;
      pointer.py = y;
      pointer.init = true;
    }
  };
  const onMouse = (e: PointerEvent) => onMove(e.clientX, e.clientY);
  const onTouch = (e: TouchEvent) => e.touches[0] && onMove(e.touches[0].clientX, e.touches[0].clientY);
  if (!opts.still) {
    window.addEventListener("pointermove", onMouse, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
  }
  const mapClamp = (v: number, a: number, b: number, c: number, d: number) => c + (d - c) * Math.min(1, Math.max(0, (v - a) / (b - a)));
  const P0 = new THREE.Vector2();
  const P1 = new THREE.Vector2();
  const COL = new THREE.Vector3();
  const WHITE = new THREE.Vector3(1, 1, 1);
  const touchDevice = window.matchMedia("(pointer: coarse)").matches;
  const pointerSplat = (now: number) => {
    const dx = pointer.x - pointer.px;
    const dy = pointer.y - pointer.py;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      const radius = Math.max((mapClamp(len, 0, 5, 0, 60) * 0.6 * (touchDevice ? 0.8 : 1)) / 200, 0.004);
      const mult = mapClamp(len, 0, 15, 0, 10);
      P1.set(pointer.x / width, 1 - pointer.y / height);
      if (now - lastSplat > 50) P0.copy(P1);
      else P0.set(pointer.px / width, 1 - pointer.py / height);
      COL.set(dx * mult, -dy * mult, 1);
      splat(velocity, P0, P1, COL, radius, width / height, false);
      splat(density, P0, P1, WHITE, radius, width / height, true);
      lastSplat = now;
    }
    pointer.px = pointer.x;
    pointer.py = pointer.y;
  };

  // ---- frame ----
  const projModel = new THREE.Matrix4();
  const toLocal = new THREE.Matrix3();
  const tmp = new THREE.Matrix4();
  const camTarget = new THREE.Vector3();
  let time = 0;
  const ease = (x: number) => x * x * (3 - 2 * x);

  const simulate = (dt: number, now: number) => {
    time += dt;
    advance(dt);
    const nx = pointer.init ? (pointer.x / width) * 2 - 1 : 0;
    const ny = pointer.init ? (pointer.y / height) * 2 - 1 : 0;

    group.position.set(st.x * halfW, st.y * halfH, 0);
    group.scale.setScalar(Math.max(0.01, st.s * halfH));
    const sheet = (st.from === 0 ? 1 - ease(st.mix) : 0) + (st.to === 0 ? ease(st.mix) : 0);
    // the page leans gently; icons turn more so they read as 3D objects
    group.rotation.set(-0.12 + ny * 0.12, -0.42 + (1 - sheet) * Math.sin(time * 0.35) * 0.5 + nx * 0.25, 0.06 * sheet);

    if (!opts.still) {
      camTarget.set(camBase.x - nx * 0.2, camBase.y + ny * 0.2, camBase.z);
      camera.position.lerp(camTarget, 0.05);
      pointerSplat(now);
      fluidStep();
    }
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    group.updateMatrixWorld(true);
    projModel.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld);
    toLocal.setFromMatrix4(tmp.copy(group.matrixWorld).invert().multiply(camera.matrixWorld));

    const u = simUniforms;
    u.tPos.value = positions.read.texture;
    u.tVel.value = velocity.read.texture;
    u.tDen.value = density.read.texture;
    u.uTime.value = time;
    u.uHZ.value = dt * 60;
    u.uSheet.value = sheet;
    u.uChaos.value = st.chaos;
    u.uSettle.value = ease(st.mix);
    u.uProjModel.value.copy(projModel);
    u.uToLocal.value.copy(toLocal);
    pass(simMatFor(st.to), positions.write);
    positions.swap();

    const pu = pointsMat.uniforms;
    pu.uSheet.value = sheet;
    pu.uScan.value = st.scan;
    pu.uGlow.value = st.glow;
  };

  const draw = () => {
    pointsMat.uniforms.uPos.value = positions.read.texture;
    pointsMat.uniforms.uTime.value = time;
    renderer.setRenderTarget(null);
    renderer.render(world, camera);
  };

  layout();
  let raf = 0;
  let timer = 0;
  const ro = new ResizeObserver(() => {
    layout();
    if (opts.still) draw();
  });
  ro.observe(canvas);

  if (opts.still) {
    // Reduced motion: when the section changes, settle the new form off-screen and show one calm frame.
    let seen = -1;
    const settle = () => {
      if (seen === scene.version) return;
      seen = scene.version;
      st.mix = 1;
      for (let i = 0; i < 220; i++) simulate(1 / 60, 0);
      draw();
    };
    settle();
    timer = window.setInterval(settle, 300);
  } else {
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (document.hidden) return;
      simulate(dt, now);
      draw();
    };
    raf = requestAnimationFrame(loop);
  }
  const warmTimer = window.setTimeout(() => void warm(), 2500);

  return {
    dispose() {
      disposed = true;
      window.clearTimeout(warmTimer);
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      ro.disconnect();
      window.removeEventListener("pointermove", onMouse);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
