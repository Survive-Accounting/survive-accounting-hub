// THE CUT-OUT COMPOSITOR — two WebGL2 passes that draw Lee over the chosen background, inside
// MediaPipe's own GPU context. Pure WebGL: no React, no DOM, so the worker (camera-bg.worker.ts)
// can import it. See segmentation.ts for why it is shaped like this.
//
//   pass 1   MediaPipe's background confidence → Lee (1 − bg), folded into a quarter-res buffer and
//            eased against the previous frame's: a big change lands at once (he moved), a small one
//            is eased (the edge was only flickering).
//   pass 2   the camera frame over the fill (Remove) or over a blurred copy of itself (Blur), cut by
//            that mask, upsampled with a joint-bilateral filter guided by the FULL-RES camera image —
//            mask taps whose colour matches this pixel count more, so the cut follows the real edge of
//            hair and shoulders instead of the blocky low-res mask.
import type { MPMask } from "@mediapipe/tasks-vision";

/** 1 = Blur, 2 = Remove. */
export type CutoutMode = 1 | 2;
/** Straight (not premultiplied) RGBA, 0–1. */
export type Rgba = readonly [number, number, number, number];

// The cut. Mask values below LO are background, above HI are Lee; between is the soft edge hair
// needs. Wider = softer.
const EDGE_LO = 0.3;
const EDGE_HI = 0.72;
/** The smoothed mask is this many times smaller than the frame. */
const MASK_DOWNSCALE = 4;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // uv (0,0) is the TOP-left of the picture: the camera is uploaded top row first (unflipped) and
  // MediaPipe's mask is in its input's orientation.
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// A fragment at vUv.y lands on texture row t = 1 − vUv.y of a framebuffer texture, so pass 1 works
// in flipped uv and ends up storing the picture top row first — the same orientation as everything
// else, which is what lets pass 2 read it with plain vUv.
const SMOOTH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uMpMask;
uniform sampler2D uPrev;
uniform float uFresh;
out vec4 outColor;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float person = 1.0 - texture(uMpMask, uv).r;
  float prev = mix(texture(uPrev, uv).r, person, uFresh);
  float d = person - prev;
  float v = prev + d * clamp(0.45 + abs(d) * 1.6, 0.0, 1.0);
  outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform vec2 uMaskTexel;
uniform vec2 uBlurRadius;
uniform float uGuideLod;
uniform int uMode;        // 1 blur, 2 remove
uniform vec4 uFill;       // premultiplied
uniform float uLo;
uniform float uHi;
out vec4 outColor;

float personAlpha(vec3 here) {
  float sum = 0.0;
  float wsum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * uMaskTexel;
      vec3 c = textureLod(uVideo, vUv + o, uGuideLod).rgb;
      vec3 d = c - here;
      float w = exp(-dot(d, d) * 24.0) * ((x == 0 && y == 0) ? 1.0 : 0.7);
      sum += texture(uMask, vUv + o).r * w;
      wsum += w;
    }
  }
  return smoothstep(uLo, uHi, sum / max(wsum, 1e-4));
}

vec3 blurred() {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.39996;
    float r = sqrt((float(i) + 0.5) / 16.0);
    s += textureLod(uVideo, vUv + vec2(cos(a), sin(a)) * r * uBlurRadius, 4.0).rgb;
  }
  return s / 16.0;
}

void main() {
  vec3 cam = texture(uVideo, vUv).rgb;
  float a = personAlpha(cam);
  if (uMode == 1) {
    outColor = vec4(mix(blurred(), cam, a), 1.0);
  } else {
    outColor = vec4(cam * a, a) + uFill * (1.0 - a);
  }
}`;

interface Pass { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

/** Draws in MediaPipe's context. Everything it binds it unbinds; the state MediaPipe's own graph
 *  relies on between calls (framebuffer, program, vertex array, viewport, active texture unit, blend,
 *  unpack flags) is saved and put back. */
export class CutoutCompositor {
  private readonly gl: WebGL2RenderingContext;
  private readonly smooth: Pass;
  private readonly composite: Pass;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texVideo: WebGLTexture;
  /** Ping-pong: [read, write] for the smoothed mask. */
  private readonly maskTex: WebGLTexture[];
  private readonly maskFb: WebGLFramebuffer[];
  private maskW = 0;
  private maskH = 0;
  private fresh = true;

  private constructor(gl: WebGL2RenderingContext, smooth: Pass, composite: Pass) {
    this.gl = gl;
    this.smooth = smooth;
    this.composite = composite;
    const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [smooth, composite]) {
      const loc = gl.getAttribLocation(p.prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(prevVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
    this.texVideo = gl.createTexture()!;
    this.maskTex = [gl.createTexture()!, gl.createTexture()!];
    this.maskFb = [gl.createFramebuffer()!, gl.createFramebuffer()!];
  }

  /** Null when the context can't do what the shaders need. */
  static create(gl: WebGL2RenderingContext): CutoutCompositor | null {
    // MediaPipe's mask is a float texture; sampling it with LINEAR needs this.
    if (!gl.getExtension("OES_texture_float_linear")) return null;
    const smooth = linkPass(gl, SMOOTH_FRAG, ["uMpMask", "uPrev", "uFresh"]);
    const composite = linkPass(gl, COMPOSITE_FRAG, ["uVideo", "uMask", "uMaskTexel", "uBlurRadius", "uGuideLod", "uMode", "uFill", "uLo", "uHi"]);
    return smooth && composite ? new CutoutCompositor(gl, smooth, composite) : null;
  }

  /** A new run (a new camera, a pause): don't ease from a stale frame. */
  reset(): void { this.fresh = true; }

  /** Call INSIDE MediaPipe's segment callback — its mask texture is only valid there. Draws into the
   *  context's default framebuffer, which MediaPipe has already sized to the camera frame. */
  draw(frame: TexImageSource, mpMask: MPMask, mode: CutoutMode, fill: Rgba): void {
    const gl = this.gl;
    const vw = gl.drawingBufferWidth, vh = gl.drawingBufferHeight;
    const saved = {
      fb: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      prog: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
      vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
      viewport: gl.getParameter(gl.VIEWPORT) as Int32Array,
      active: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
      blend: gl.isEnabled(gl.BLEND),
      flipY: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean,
      premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean,
    };
    try {
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindVertexArray(this.vao);

      // The camera, with mips for the edge guide and the blur.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texVideo);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      setFilter(gl, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);

      // PASS 1 — the smoothed mask.
      const mw = Math.max(64, Math.round(vw / MASK_DOWNSCALE)), mh = Math.max(64, Math.round(vh / MASK_DOWNSCALE));
      if (mw !== this.maskW || mh !== this.maskH) this.resizeMask(mw, mh);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mpMask.getAsWebGLTexture());
      setFilter(gl, gl.LINEAR);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex[0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFb[1]);
      gl.viewport(0, 0, mw, mh);
      gl.useProgram(this.smooth.prog);
      gl.uniform1i(this.smooth.u.uMpMask, 1);
      gl.uniform1i(this.smooth.u.uPrev, 2);
      gl.uniform1f(this.smooth.u.uFresh, this.fresh ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.fresh = false;
      this.maskTex.reverse();
      this.maskFb.reverse();

      // PASS 2 — the frame.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, vw, vh);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex[0]);
      gl.useProgram(this.composite.prog);
      const u = this.composite.u;
      gl.uniform1i(u.uVideo, 0);
      gl.uniform1i(u.uMask, 1);
      gl.uniform2f(u.uMaskTexel, 1 / mw, 1 / mh);
      // About 2.5% of the frame's width — a soft room, never a smear of shapes.
      gl.uniform2f(u.uBlurRadius, 0.025, 0.025 * vw / vh);
      gl.uniform1f(u.uGuideLod, Math.log2(MASK_DOWNSCALE));
      gl.uniform1i(u.uMode, mode);
      const [r, g, b, a] = fill;
      gl.uniform4f(u.uFill, r * a, g * a, b * a, a);
      gl.uniform1f(u.uLo, EDGE_LO);
      gl.uniform1f(u.uHi, EDGE_HI);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } finally {
      for (const unit of [2, 1, 0]) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, null); }
      gl.bindVertexArray(saved.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, saved.fb);
      gl.useProgram(saved.prog);
      gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
      gl.activeTexture(saved.active);
      if (saved.blend) gl.enable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, saved.flipY);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, saved.premul);
    }
  }

  private resizeMask(w: number, h: number): void {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      setFilter(gl, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFb[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTex[i], 0);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.maskW = w;
    this.maskH = h;
    this.fresh = true;
  }
}

function setFilter(gl: WebGL2RenderingContext, min: number): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function linkPass(gl: WebGL2RenderingContext, fs: string, uniforms: string[]): Pass | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[camera-bg] shader:", gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
    return s;
  };
  const v = compile(gl.VERTEX_SHADER, VERT), f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("[camera-bg] link:", gl.getProgramInfoLog(prog)); gl.deleteProgram(prog); return null; }
  return { prog, u: Object.fromEntries(uniforms.map((n) => [n, gl.getUniformLocation(prog, n)])) };
}

