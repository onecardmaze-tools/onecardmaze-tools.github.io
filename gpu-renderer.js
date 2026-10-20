/* App-specific retained vector backend (not a general Canvas2D replacement).
 * Model-space paths stay on the GPU; only small UI shapes/text use raster sprites.
 * Stroke AA uses a coverage-union depth prepass and one source-over color pass.
 * The default framebuffer is single-sampled; neither DPR nor artwork is reduced.
 */
(function (root) {
  "use strict";
  const NativePath2D = root.Path2D;
  const I = () => [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const pt = (m, x, y) => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  // Keep maximal overlapping rectangles, rather than a disjoint partition.
  // Retaining both bars of an L-shaped tile union removes antialias seams at
  // shared tile edges, including partially shared edges between unequal rows.
  const clipRectCache = new Map();
  function mergeClipRects(input) {
    const cacheKey = input.map((rect) => rect.join(",")).join(";");
    const cached = clipRectCache.get(cacheKey);
    if (cached) return cached;
    const rects = [];
    const keys = new Set();
    const add = (rect) => {
      const key = rect.join(",");
      if (!keys.has(key)) {
        keys.add(key);
        rects.push(rect);
      }
    };
    for (const [x, y, w, h] of input) {
      if (w && h)
        add([
          Math.min(x, x + w),
          Math.min(y, y + h),
          Math.max(x, x + w),
          Math.max(y, y + h),
        ]);
    }
    for (let i = 0; i < rects.length; ++i) {
      const a = rects[i];
      for (let j = 0; j < i; ++j) {
        const b = rects[j];
        if (a[1] === b[1] && a[3] === b[3] && a[0] <= b[2] && b[0] <= a[2]) {
          add([Math.min(a[0], b[0]), a[1], Math.max(a[2], b[2]), a[3]]);
        }
        if (a[0] === b[0] && a[2] === b[2] && a[1] <= b[3] && b[1] <= a[3]) {
          add([a[0], Math.min(a[1], b[1]), a[2], Math.max(a[3], b[3])]);
        }
      }
    }
    const result = rects
      .filter(
        (a, i) =>
          !rects.some(
            (b, j) =>
              i !== j &&
              a[0] >= b[0] &&
              a[1] >= b[1] &&
              a[2] <= b[2] &&
              a[3] <= b[3],
          ),
      )
      .map(([x, y, right, bottom]) => [x, y, right - x, bottom - y]);
    clipRectCache.set(cacheKey, result);
    if (clipRectCache.size > 64)
      clipRectCache.delete(clipRectCache.keys().next().value);
    return result;
  }

  class GPUPath {
    constructor(other) {
      this.lines = [];
      this.rects = [];
      this.children = [];
      this.commands = [];
      if (other) this.addPath(other);
    }
    moveTo(x, y) {
      this.commands.push(["moveTo", x, y]);
      this.lines.push([[x, y]]);
    }
    lineTo(x, y) {
      this.commands.push(["lineTo", x, y]);
      if (!this.lines.length) this.moveTo(x, y);
      else this.lines[this.lines.length - 1].push([x, y]);
    }
    closePath() {
      this.commands.push(["closePath"]);
      const l = this.lines[this.lines.length - 1];
      if (l && l.length > 1) l.push(l[0].slice());
    }
    rect(x, y, w, h) {
      const commandIndex = this.commands.length;
      this.rects.push([x, y, w, h]);
      this.moveTo(x, y);
      this.lineTo(x + w, y);
      this.lineTo(x + w, y + h);
      this.lineTo(x, y + h);
      this.closePath();
      this.commands.splice(commandIndex, Infinity, ["rect", x, y, w, h]);
    }
    arc(x, y, r, a, b, ccw) {
      const commandIndex = this.commands.length;
      let delta = b - a;
      if (!ccw) {
        while (delta < 0) delta += Math.PI * 2;
        delta = Math.min(delta, Math.PI * 2);
      } else {
        while (delta > 0) delta -= Math.PI * 2;
        delta = Math.max(delta, -Math.PI * 2);
      }
      const n = Math.max(8, Math.ceil(Math.abs(delta) * Math.sqrt(r) * 2));
      for (let k = 0; k <= n; k++) {
        const t = a + (delta * k) / n;
        const q = [x + Math.cos(t) * r, y + Math.sin(t) * r];
        if (k === 0 && !this.lines.length) this.moveTo(...q);
        else this.lineTo(...q);
      }
      this.commands.splice(commandIndex, Infinity, [
        "arc",
        x,
        y,
        r,
        a,
        b,
        !!ccw,
      ]);
    }
    addPath(p) {
      this.children.push(p);
      this.commands.push(["addPath", p]);
    }
  }
  const colorCache = new Map();
  function color(s) {
    if (colorCache.has(s)) return colorCache.get(s);
    let r;
    if (s[0] === "#") {
      let h = s.slice(1);
      if (h.length <= 4) h = [...h].map((c) => c + c).join("");
      if (h.length === 6) h += "ff";
      r = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    } else if (s.startsWith("rgb")) {
      const n = s.match(/[\d.]+/g).map(Number);
      r = [n[0] / 255, n[1] / 255, n[2] / 255, n.length > 3 ? n[3] : 1];
    } else r = s === "white" ? [1, 1, 1, 1] : [0, 0, 0, 1];
    colorCache.set(s, r);
    return r;
  }
  class GPUContext {
    constructor(canvas, config = {}) {
      this.canvas = canvas;
      const options = {
        alpha: true,
        antialias: false,
        depth: true,
        stencil: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      };
      const gl = (this.gl =
        canvas.getContext("webgl2", options) ||
        canvas.getContext("webgl", options));
      if (!gl) throw Error("GPU overlay WebGL unavailable");
      this.pendingShaders = new Set();
      this.enabledAttributes = new Set();
      this.pathBytes = 0;
      this.pathBudgetBytes = Math.max(
        1024,
        config.pathBudgetBytes || 8 * 1024 * 1024,
      );
      try {
        this.webgl2 =
          typeof WebGL2RenderingContext !== "undefined" &&
          gl instanceof WebGL2RenderingContext;
        if (!this.webgl2 && !gl.getExtension("EXT_frag_depth"))
          throw Error("Analytic path renderer requires EXT_frag_depth");
        const shader = (type, src) => {
          if (this.webgl2) {
            src =
              "#version 300 es\n" +
              src
                .replace(/attribute /g, "in ")
                .replace(
                  /varying /g,
                  type === gl.VERTEX_SHADER ? "out " : "in ",
                )
                .replace(/texture2D\(/g, "texture(");
            if (type === gl.FRAGMENT_SHADER)
              src = src
                .replace(
                  "precision highp float;",
                  "precision highp float;out vec4 fragColor;",
                )
                .replace(/gl_FragColor/g, "fragColor");
          }
          const s = gl.createShader(type);
          this.pendingShaders.add(s);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(s));
          return s;
        };
        const p = (this.program = gl.createProgram());
        gl.attachShader(
          p,
          shader(
            gl.VERTEX_SHADER,
            `attribute vec2 aPosition;attribute vec4 aColor;attribute vec2 aUv;uniform vec2 uSize;uniform mat3 uTransform;uniform vec4 uTint;varying vec4 vColor;varying vec2 vUv;varying vec2 vPos;void main(){vPos=(uTransform*vec3(aPosition,1.)).xy;gl_Position=vec4(vPos/uSize*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);vColor=aColor*uTint;vUv=aUv;}`,
          ),
        );
        gl.attachShader(
          p,
          shader(
            gl.FRAGMENT_SHADER,
            `precision highp float;varying vec4 vColor;varying vec2 vUv;varying vec2 vPos;uniform sampler2D uTex;uniform float uTextured;uniform int uClipCount;uniform vec4 uClip[18];uniform mat3 uClipInverse;
   uniform vec2 uClipScale;void main(){float clipCoverage = 1.0;
    if (uClipCount < 0) discard;
    if (uClipCount > 0) {
     vec2 point = (uClipInverse * vec3(vPos, 1.0)).xy;
     clipCoverage = 0.0;
     for (int i = 0; i < 18; ++i) {
      if (i >= uClipCount) break;
      vec4 rect = uClip[i];
      vec2 offset = (abs(point-(rect.xy+rect.zw)*0.5)-(rect.zw-rect.xy)*0.5)*uClipScale;
      float distance = max(offset.x,offset.y);
      if (distance <= -0.5) {clipCoverage=1.0;break;}
      if (distance >= 0.5) continue;
      if (offset.x > 0.0 && offset.y > 0.0) distance=length(offset);
      clipCoverage = max(clipCoverage,clamp(0.5-distance,0.0,1.0));
     }
     if (clipCoverage <= 0.0) discard;
    }gl_FragColor=vColor;gl_FragColor.rgb*=gl_FragColor.a;if(uTextured>0.5)gl_FragColor*=texture2D(uTex,vUv);gl_FragColor*=clipCoverage;}`,
          ),
        );
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
          throw Error(gl.getProgramInfoLog(p));
        for (const shader of this.pendingShaders) gl.deleteShader(shader);
        this.pendingShaders.clear();
        this.u = {};
        for (const n of [
          "uTransform",
          "uTint",
          "uSize",
          "uTex",
          "uTextured",
          "uClipCount",
          "uClip",
          "uClipInverse",
          "uClipScale",
        ])
          this.u[n] = gl.getUniformLocation(p, n);
        this.attrs = ["aPosition", "aColor", "aUv"].map((n) =>
          gl.getAttribLocation(p, n),
        );
        this.buffer = gl.createBuffer();
        this.data = [];
        this.texture = null;
        this.stack = [];
        this.path = new GPUPath();
        this.state = {
          m: I(),
          clip: null,
          globalAlpha: 1,
          strokeStyle: "#000",
          fillStyle: "#000",
          lineWidth: 1,
          lineCap: "butt",
          lineJoin: "miter",
          font: "10px sans-serif",
          textAlign: "start",
          textBaseline: "alphabetic",
          dash: [],
        };
        for (const n of Object.keys(this.state).filter(
          (n) => !["m", "clip", "dash"].includes(n),
        ))
          Object.defineProperty(this, n, {
            get: () => this.state[n],
            set: (v) => (this.state[n] = v),
          });
        this.metrics = { frames: 0, draws: 0, vertices: 0 };
        this.strokeId = 0;
        this.pathBuffers = new Map();
        this.metrics.uploads = 0;
        this.metrics.cachedDraws = 0;
        this.metrics.cacheHits = 0;
        this.metrics.cacheMisses = 0;
        this.initAnalyticStrokes();
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    useAttributes(attributes) {
      const next = new Set(attributes.filter((index) => index >= 0));
      for (const index of this.enabledAttributes) {
        if (!next.has(index)) this.gl.disableVertexAttribArray(index);
      }
      for (const index of next) {
        if (!this.enabledAttributes.has(index))
          this.gl.enableVertexAttribArray(index);
      }
      this.enabledAttributes = next;
    }

    trimPathCache() {
      // Delay eviction until the complete stroke has finished both passes: a
      // composite path can reference more than the cache budget in one draw.
      while (
        this.pathBuffers.size &&
        (this.pathBuffers.size > 256 || this.pathBytes > this.pathBudgetBytes)
      ) {
        const first = this.pathBuffers.keys().next().value;
        for (const entry of this.pathBuffers.get(first).values()) {
          this.gl.deleteBuffer(entry.buffer);
          this.pathBytes -= entry.bytes;
        }
        this.pathBuffers.delete(first);
      }
      this.metrics.pathBytes = this.pathBytes;
    }

    dispose(abandon = false) {
      if (this.disposed) return;
      this.disposed = true;
      if (this.data) this.data.length = 0;
      const gl = this.gl;
      if (abandon) {
        // Context loss already invalidated every GPU handle. Deleting those old
        // handles after restoration is an INVALID_OPERATION in real browsers.
        for (const key of [
          "pathBuffers",
          "images",
          "rasters",
          "pendingShaders",
        ])
          if (this[key]) this[key].clear();
        this.pathBytes = this.imageBytes = this.rasterBytes = 0;
        return;
      }
      if (!gl) return;
      if (this.pathBuffers) {
        for (const styles of this.pathBuffers.values()) {
          for (const entry of styles.values()) gl.deleteBuffer(entry.buffer);
        }
        this.pathBuffers.clear();
      }
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
      if (this.strokeProgram) gl.deleteProgram(this.strokeProgram.program);
      if (this.pendingStrokeProgram)
        gl.deleteProgram(this.pendingStrokeProgram);
      if (this.pendingShaders) {
        for (const shader of this.pendingShaders) gl.deleteShader(shader);
        this.pendingShaders.clear();
      }
      if (this.data && typeof this.clearRasterCache === "function")
        this.clearRasterCache();
      if (this.textures) {
        for (const texture of this.textures) gl.deleteTexture(texture);
        this.textures.clear();
      }
      if (this.textCache) this.textCache.clear();
      if (this.data) this.data.length = 0;
      this.textureCache = new WeakMap();
      this.pathBytes = 0;
      if (this.metrics) this.metrics.pathBytes = 0;
    }

    save() {
      this.stack.push({
        ...this.state,
        m: this.state.m.slice(),
        dash: this.state.dash.slice(),
      });
    }
    restore() {
      if (!this.stack.length) return;
      const state = this.stack.pop();
      if (state.clip !== this.state.clip) this.flush();
      this.state = state;
    }
    setTransform(a, b, c, d, e, f) {
      this.state.m = [a, b, c, d, e, f];
    }
    translate(x, y) {
      this.state.m = mul(this.state.m, [1, 0, 0, 1, x, y]);
    }
    scale(x, y) {
      this.state.m = mul(this.state.m, [x, 0, 0, y, 0, 0]);
    }
    rotate(a) {
      this.state.m = mul(this.state.m, [
        Math.cos(a),
        Math.sin(a),
        -Math.sin(a),
        Math.cos(a),
        0,
        0,
      ]);
    }
    beginPath() {
      this.path = new GPUPath();
    }
    moveTo(...a) {
      this.path.moveTo(...a);
    }
    lineTo(...a) {
      this.path.lineTo(...a);
    }
    closePath() {
      this.path.closePath();
    }
    rect(...a) {
      this.path.rect(...a);
    }
    arc(...a) {
      this.path.arc(...a);
    }
    setLineDash(d) {
      this.state.dash = d;
    }
    clip() {
      this.flush();
      const m = this.state.m.slice();
      const previous = this.state.clip;
      let rects = mergeClipRects(this.path.rects);
      if (previous) {
        // All scene clips are tile rectangles under the same world transform.
        // Fail explicitly if a new caller requests a different clip geometry.
        if (
          !m.every((value, index) => Math.abs(value - previous.m[index]) < 1e-8)
        ) {
          throw Error("Nested rectangular clips must share a transform");
        }
        const intersections = [];
        for (const a of previous.rects)
          for (const b of rects) {
            const x = Math.max(a[0], b[0]),
              y = Math.max(a[1], b[1]);
            const right = Math.min(a[0] + a[2], b[0] + b[2]),
              bottom = Math.min(a[1] + a[3], b[1] + b[3]);
            if (right > x && bottom > y)
              intersections.push([x, y, right - x, bottom - y]);
          }
        rects = mergeClipRects(intersections);
      }
      if (rects.length > 18)
        throw Error("Clip exceeds the 18-rectangle scene budget");
      const determinant = m[0] * m[3] - m[1] * m[2];
      if (Math.abs(determinant) < 1e-12) rects = [];
      const inverse = rects.length
        ? [
            m[3] / determinant,
            -m[1] / determinant,
            0,
            -m[2] / determinant,
            m[0] / determinant,
            0,
            (m[2] * m[5] - m[3] * m[4]) / determinant,
            (m[1] * m[4] - m[0] * m[5]) / determinant,
            1,
          ]
        : I();
      const uniforms = new Float32Array(72);
      rects.forEach((r, index) =>
        uniforms.set([r[0], r[1], r[0] + r[2], r[1] + r[3]], index * 4),
      );
      this.state.clip = {
        rects,
        m,
        inverse,
        uniforms,
        scale: [Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])],
      };
    }
    clearRect() {
      this.data.length = 0;
      this.texture = null;
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearStencil(0);
      gl.clearDepth(0);
      gl.depthMask(true);
      gl.clear(
        gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
      );
      this.strokeId = 0;
      this.metrics.frames++;
    }
    solid() {
      if (this.texture) {
        this.flush();
        this.texture = null;
      }
    }
    rgba(style) {
      const c = color(style).slice();
      c[3] *= this.globalAlpha;
      return c;
    }
    initAnalyticStrokes() {
      const gl = this.gl;
      const version = this.webgl2 ? "#version 300 es\n" : "";
      const vertex = `${version}
   precision highp float;
   ${this.webgl2 ? "in" : "attribute"} vec2 aStart;
   ${this.webgl2 ? "in" : "attribute"} vec2 aEnd;
   ${this.webgl2 ? "in" : "attribute"} vec2 aCorner;
   ${this.webgl2 ? "in" : "attribute"} vec2 aCaps;
   uniform mat3 uTransform;
   uniform vec2 uSize;
   uniform float uRadius;
   ${this.webgl2 ? "out" : "varying"} vec2 vStart;
   ${this.webgl2 ? "out" : "varying"} vec2 vDirection;
   ${this.webgl2 ? "out" : "varying"} float vLength;
   ${this.webgl2 ? "out" : "varying"} vec2 vPosition;
   ${this.webgl2 ? "out" : "varying"} vec2 vCaps;
   void main() {
    vec2 start = (uTransform * vec3(aStart, 1.0)).xy;
    vec2 end = (uTransform * vec3(aEnd, 1.0)).xy;
    vec2 delta = end - start;
    float segmentLength = length(delta);
    vec2 direction = segmentLength > 0.00001 ? delta / segmentLength : vec2(1.0, 0.0);
    vec2 normal = vec2(-direction.y, direction.x);
    float atEnd = (aCorner.x + 1.0) * 0.5;
    float cap = mix(aCaps.x, aCaps.y, atEnd);
    // Extend each quad by one device pixel for the coverage ramp. The
    // extension happens after transforming, so cached VBOs survive zoom.
    vec2 position = mix(start, end, atEnd)
      + direction * aCorner.x * (cap * uRadius + 1.0)
      + normal * aCorner.y * (uRadius + 1.0);
    vStart = start;
    vDirection = direction;
    vLength = segmentLength;
    vPosition = position;
    vCaps = aCaps;
    gl_Position = vec4(position / uSize * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
   }
  `;
      const fragment = `${version}${this.webgl2 ? "" : "#extension GL_EXT_frag_depth : require\n"}
   precision highp float;
   ${this.webgl2 ? "in" : "varying"} vec2 vStart;
   ${this.webgl2 ? "in" : "varying"} vec2 vDirection;
   ${this.webgl2 ? "in" : "varying"} float vLength;
   ${this.webgl2 ? "in" : "varying"} vec2 vPosition;
   ${this.webgl2 ? "in" : "varying"} vec2 vCaps;
   ${this.webgl2 ? "out vec4 outColor;" : ""}
   uniform float uRadius;
   uniform float uStrokeId;
   uniform vec4 uColor;
   uniform int uClipCount;
   uniform vec4 uClip[18];
   uniform mat3 uClipInverse;
   uniform vec2 uClipScale;
   void main() {
    float clipCoverage = 1.0;
    if (uClipCount < 0) discard;
    if (uClipCount > 0) {
     vec2 point = (uClipInverse * vec3(vPosition, 1.0)).xy;
     clipCoverage = 0.0;
     for (int i = 0; i < 18; ++i) {
      if (i >= uClipCount) break;
      vec4 rect = uClip[i];
      vec2 offset = (abs(point-(rect.xy+rect.zw)*0.5)-(rect.zw-rect.xy)*0.5)*uClipScale;
      float distance = max(offset.x,offset.y);
      if (distance <= -0.5) {clipCoverage=1.0;break;}
      if (distance >= 0.5) continue;
      if (offset.x > 0.0 && offset.y > 0.0) distance=length(offset);
      clipCoverage = max(clipCoverage,clamp(0.5-distance,0.0,1.0));
     }
     if (clipCoverage <= 0.0) discard;
    }
    float segmentLength = vLength;
    vec2 direction = vDirection;
    vec2 offset = vPosition - vStart;
    float along = dot(offset, direction);
    float across = abs(dot(offset, vec2(-direction.y, direction.x)));
    float distance;
    if (along < 0.0 && vCaps.x > 0.5) {
     distance = length(vec2(along, across)) - uRadius;
    } else if (along > segmentLength && vCaps.y > 0.5) {
     distance = length(vec2(along - segmentLength, across)) - uRadius;
    } else {
     float capDistance = max(vCaps.x > 0.5 ? -1.0e8 : -along,
                             vCaps.y > 0.5 ? -1.0e8 : along - segmentLength);
     vec2 boxDistance = vec2(across - uRadius, capDistance);
     distance = max(boxDistance.x, boxDistance.y);
     if (boxDistance.x > 0.0 && boxDistance.y > 0.0) distance = length(boxDistance);
    }
    float coverage = clamp(0.5 - distance, 0.0, 1.0) * clipCoverage;
    if (coverage <= 0.0) discard;
    // Each stroke owns an increasing interval in the depth buffer. The
    // first pass chooses MAX(coverage) over all segments of this stroke.
    // EQUAL in pass two selects that maximum; stencil prevents ties from
    // blending the same translucent stroke more than once.
    ${this.webgl2 ? "gl_FragDepth" : "gl_FragDepthEXT"} = (uStrokeId + coverage) / 256.0;
    ${this.webgl2 ? "outColor" : "gl_FragColor"} = vec4(uColor.rgb, uColor.a * coverage);
   }
  `;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        this.pendingShaders.add(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          this.pendingShaders.delete(shader);
          throw Error(message);
        }
        return shader;
      };
      const program = (this.pendingStrokeProgram = gl.createProgram());
      const vs = compile(gl.VERTEX_SHADER, vertex);
      const fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      this.pendingShaders.delete(vs);
      this.pendingShaders.delete(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program));
      const uniforms = {};
      for (const name of [
        "uTransform",
        "uSize",
        "uRadius",
        "uStrokeId",
        "uColor",
        "uClipCount",
        "uClip",
        "uClipInverse",
        "uClipScale",
      ]) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      this.strokeProgram = {
        program,
        uniforms,
        attributes: ["aStart", "aEnd", "aCorner", "aCaps"].map((name) =>
          gl.getAttribLocation(program, name),
        ),
      };
      this.pendingStrokeProgram = null;
    }

    pathEntry(path) {
      const key = [
        this.lineCap,
        this.lineJoin,
        this.state.dash.join(","),
        path.commands.length,
      ].join("|");
      let cached = this.pathBuffers.get(path);
      if (!cached) cached = new Map();
      this.pathBuffers.delete(path);
      this.pathBuffers.set(path, cached);
      let entry = cached.get(key);
      if (entry) {
        this.metrics.cacheHits++;
        cached.delete(key);
        cached.set(key, entry);
        return entry;
      }

      const vertices = [];
      const emitSegment = (start, end, startCap, endCap) => {
        // Six vertices are an axis-aligned box in the segment's local frame.
        for (const corner of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]) {
          vertices.push(
            start[0],
            start[1],
            end[0],
            end[1],
            corner[0],
            corner[1],
            +startCap,
            +endCap,
          );
        }
      };
      let dash = this.state.dash.filter(
        (value) => Number.isFinite(value) && value >= 0,
      );
      if (dash.length % 2) dash = dash.concat(dash);
      const cycle = dash.reduce((sum, value) => sum + value, 0);
      if (cycle <= 0) dash = [];
      const roundCap = this.lineCap === "round";
      const roundJoin = this.lineJoin === "round";

      for (const line of path.lines) {
        if (line.length < 2) continue;
        const last = line.length - 1;
        const closed =
          line[0][0] === line[last][0] && line[0][1] === line[last][1];
        let phase = 0;
        for (let index = 1; index < line.length; ++index) {
          const start = line[index - 1];
          const end = line[index];
          const dx = end[0] - start[0];
          const dy = end[1] - start[1];
          const length = Math.hypot(dx, dy);
          if (length <= 1e-10) continue;
          if (!dash.length) {
            emitSegment(
              start,
              end,
              closed || index > 1 ? roundJoin : roundCap,
              closed || index < last ? roundJoin : roundCap,
            );
            continue;
          }
          let position = 0;
          while (position < length - 1e-10) {
            let remainder = phase % cycle;
            let dashIndex = 0;
            while (
              dashIndex < dash.length - 1 &&
              remainder >= dash[dashIndex]
            ) {
              remainder -= dash[dashIndex++];
            }
            let remaining = dash[dashIndex] - remainder;
            // Zero entries are valid Canvas dash values. Advance without an
            // infinite loop; a zero dash does not add a cap-only dot here.
            if (remaining <= 1e-10) {
              phase += 1e-9;
              continue;
            }
            const next = Math.min(length, position + remaining);
            if (dashIndex % 2 === 0) {
              const a = [
                start[0] + (dx * position) / length,
                start[1] + (dy * position) / length,
              ];
              const b = [
                start[0] + (dx * next) / length,
                start[1] + (dy * next) / length,
              ];
              emitSegment(a, b, roundCap, roundCap);
            }
            phase += next - position;
            position = next;
          }
        }
      }
      const array = new Float32Array(vertices);
      const gl = this.gl;
      entry = {
        buffer: gl.createBuffer(),
        count: array.length / 8,
        bytes: array.byteLength,
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
      this.pathBytes += entry.bytes;
      this.metrics.pathBytes = this.pathBytes;
      this.metrics.uploads++;
      this.metrics.cacheMisses++;
      cached.set(key, entry);
      if (cached.size > 8) {
        const first = cached.keys().next().value;
        const removed = cached.get(first);
        gl.deleteBuffer(removed.buffer);
        this.pathBytes -= removed.bytes;
        cached.delete(first);
      }
      return entry;
    }

    collectStrokeEntries(path, entries) {
      if (path.lines.length) entries.push(this.pathEntry(path));
      for (const child of path.children)
        this.collectStrokeEntries(child, entries);
    }

    setStrokeClip(uniforms) {
      const gl = this.gl;
      const clip = this.state.clip;
      // Zero means no clip. Negative means the intersection is empty.
      gl.uniform1i(uniforms.uClipCount, clip ? clip.rects.length || -1 : 0);
      if (!clip || !clip.rects.length) return;
      gl.uniform4fv(uniforms.uClip, clip.uniforms);
      gl.uniformMatrix3fv(uniforms.uClipInverse, false, clip.inverse);
      gl.uniform2fv(uniforms.uClipScale, clip.scale);
    }

    drawStrokeEntries(entries) {
      const gl = this.gl;
      const attributes = this.strokeProgram.attributes;
      this.useAttributes(attributes);
      for (const entry of entries) {
        if (!entry.count) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
        for (let index = 0; index < attributes.length; ++index) {
          gl.vertexAttribPointer(
            attributes[index],
            2,
            gl.FLOAT,
            false,
            32,
            index * 8,
          );
        }
        gl.drawArrays(gl.TRIANGLES, 0, entry.count);
        this.metrics.draws++;
        this.metrics.vertices += entry.count;
        this.metrics.cachedDraws++;
      }
    }

    stroke(path = this.path) {
      if (path.commands.some((c) => c[0] === "arc")) {
        this.rasterPath(path, true);
        return;
      }
      this.solid();
      this.flush();
      const entries = [];
      this.collectStrokeEntries(path, entries);
      if (!entries.length) return;
      const gl = this.gl;
      gl.depthMask(true);
      gl.stencilMask(255);
      if (++this.strokeId > 254) {
        gl.clearDepth(0);
        gl.clearStencil(0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        this.strokeId = 1;
      }
      const { program, uniforms } = this.strokeProgram;
      gl.useProgram(program);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      const m = this.state.m;
      gl.uniformMatrix3fv(uniforms.uTransform, false, [
        m[0],
        m[1],
        0,
        m[2],
        m[3],
        0,
        m[4],
        m[5],
        1,
      ]);
      gl.uniform2f(uniforms.uSize, this.canvas.width, this.canvas.height);
      gl.uniform1f(
        uniforms.uRadius,
        (this.lineWidth * Math.hypot(m[0], m[1])) / 2,
      );
      gl.uniform1f(uniforms.uStrokeId, this.strokeId);
      gl.uniform4fv(uniforms.uColor, this.rgba(this.strokeStyle));
      this.setStrokeClip(uniforms);

      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.GREATER);
      gl.colorMask(false, false, false, false);
      this.drawStrokeEntries(entries);

      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.depthFunc(gl.EQUAL);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.NOTEQUAL, this.strokeId, 255);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      this.drawStrokeEntries(entries);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.depthMask(true);
      this.trimPathCache();
    }

    // Only small UI shapes use native rasterization; route geometry stays in VBOs.
    rasterScale() {
      const m = this.state.m;
      return Math.max(0.01, Math.hypot(m[0], m[1]));
    }
    rasterCache() {
      return this.rasters || (this.rasters = new Map());
    }
    cacheRaster(key, build) {
      const cache = this.rasterCache();
      let value = cache.get(key);
      if (value) {
        cache.delete(key);
        cache.set(key, value);
        return value;
      }
      value = build();
      cache.set(key, value);
      this.rasterBytes =
        (this.rasterBytes || 0) + value.cv.width * value.cv.height * 4;
      while (cache.size > 256 || this.rasterBytes > 16 * 1024 * 1024) {
        const first = cache.keys().next().value;
        if (first === key) break;
        const old = cache.get(first);
        this.flush();
        this.deleteImage(old.cv);
        this.rasterBytes -= old.cv.width * old.cv.height * 4;
        cache.delete(first);
      }
      return value;
    }
    replayPath(ctx, path, ox = 0, oy = 0) {
      for (const [op, ...a] of path.commands) {
        if (op === "addPath") this.replayPath(ctx, a[0], ox, oy);
        else if (op === "closePath") ctx.closePath();
        else {
          a[0] -= ox;
          a[1] -= oy;
          ctx[op](...a);
        }
      }
    }
    rasterPath(path, stroke = false) {
      const points = path.lines.flat();
      if (!points.length) return;
      let x = Math.min(...points.map((p) => p[0])),
        y = Math.min(...points.map((p) => p[1]));
      let right = Math.max(...points.map((p) => p[0])),
        bottom = Math.max(...points.map((p) => p[1]));
      // Full arc bounds avoid polygon approximation affecting the small sprite.
      for (const [op, cx, cy, r] of path.commands)
        if (op === "arc") {
          x = Math.min(x, cx - r);
          y = Math.min(y, cy - r);
          right = Math.max(right, cx + r);
          bottom = Math.max(bottom, cy + r);
        }
      const scale = this.rasterScale(),
        pad = (stroke ? this.lineWidth / 2 : 0) + 2 / scale;
      const commands = path.commands.map(([op, ...a]) => [
        op,
        ...a.map((n, i) =>
          typeof n === "number"
            ? +(i === 0 ? n - x : i === 1 ? n - y : n).toFixed(6)
            : n,
        ),
      ]);
      const key = JSON.stringify([
        stroke,
        commands,
        stroke ? this.strokeStyle : this.fillStyle,
        stroke ? this.lineWidth : 0,
        this.lineCap,
        this.lineJoin,
        this.state.dash,
        scale,
      ]);
      const image = this.cacheRaster(key, () => {
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.ceil((right - x + 2 * pad) * scale));
        cv.height = Math.max(1, Math.ceil((bottom - y + 2 * pad) * scale));
        const g = cv.getContext("2d");
        g.scale(scale, scale);
        g.translate(pad, pad);
        g.beginPath();
        this.replayPath(g, path, x, y);
        if (stroke) {
          g.strokeStyle = this.strokeStyle;
          g.lineWidth = this.lineWidth;
          g.lineCap = this.lineCap;
          g.lineJoin = this.lineJoin;
          g.setLineDash(this.state.dash);
          g.stroke();
        } else {
          g.fillStyle = this.fillStyle;
          g.fill();
        }
        return { cv, w: cv.width / scale, h: cv.height / scale };
      });
      this.drawImage(image.cv, x - pad, y - pad, image.w, image.h);
    }
    fill(path = this.path) {
      this.rasterPath(path);
    }
    fillRect(x, y, w, h) {
      const p = new GPUPath();
      p.rect(x, y, w, h);
      this.fill(p);
    }
    strokeRect(x, y, w, h) {
      if (Math.max(Math.abs(w), Math.abs(h)) * this.rasterScale() < 512) {
        const p = new GPUPath();
        p.rect(x, y, w, h);
        this.rasterPath(p, true);
        return;
      }
      // Rectangle joins are square. Extending the four butt segments forms the
      // exact union, including corners, without a card-sized raster texture.
      const p = new GPUPath(),
        r = this.lineWidth / 2;
      p.moveTo(x - r, y);
      p.lineTo(x + w + r, y);
      p.moveTo(x - r, y + h);
      p.lineTo(x + w + r, y + h);
      p.moveTo(x, y);
      p.lineTo(x, y + h);
      p.moveTo(x + w, y);
      p.lineTo(x + w, y + h);
      const cap = this.lineCap;
      this.lineCap = "butt";
      this.stroke(p);
      this.lineCap = cap;
    }
    deleteImage(source) {
      const entry = this.images && this.images.get(source);
      if (!entry) return;
      this.gl.deleteTexture(entry.texture);
      this.imageBytes -= entry.bytes;
      this.images.delete(source);
    }
    clearRasterCache() {
      this.flush();
      if (this.images)
        for (const source of [...this.images.keys()]) this.deleteImage(source);
      this.rasters = new Map();
      this.rasterBytes = 0;
      this.texture = null;
    }
    imageTexture(source) {
      const images = this.images || (this.images = new Map());
      let entry = images.get(source);
      if (entry) {
        images.delete(source);
        images.set(source, entry);
        return entry.texture;
      }
      const g = this.gl,
        texture = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, texture);
      g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
      entry = { texture, bytes: source.width * source.height * 4 };
      images.set(source, entry);
      this.imageBytes = (this.imageBytes || 0) + entry.bytes;
      while (images.size > 512 || this.imageBytes > 24 * 1024 * 1024) {
        const first = images.keys().next().value;
        if (first === source) break;
        this.flush();
        this.deleteImage(first);
      }
      return texture;
    }
    drawImage(source, x, y, w = source.width, h = source.height) {
      const texture = this.imageTexture(source);
      if (this.texture !== texture) {
        this.flush();
        this.texture = texture;
      }
      const m = this.state.m,
        points = [
          [x, y, 0, 0],
          [x + w, y, 1, 0],
          [x, y + h, 0, 1],
          [x + w, y + h, 1, 1],
        ];
      for (const i of [0, 1, 2, 2, 1, 3]) {
        const p = points[i],
          q = pt(m, p[0], p[1]);
        this.data.push(q[0], q[1], 1, 1, 1, this.globalAlpha, p[2], p[3]);
      }
    }
    textContext() {
      if (!this.measureCanvas) {
        this.measureCanvas = document.createElement("canvas");
        this.measureCtx = this.measureCanvas.getContext("2d");
      }
      const g = this.measureCtx;
      g.font = this.font;
      g.textAlign = this.textAlign;
      g.textBaseline = this.textBaseline;
      return g;
    }
    measureText(text) {
      return this.textContext().measureText(text);
    }
    fillText(text, x, y) {
      const scale = this.rasterScale(),
        key = JSON.stringify([
          "text",
          this.font,
          this.fillStyle,
          this.textAlign,
          this.textBaseline,
          String(text),
          scale,
        ]);
      const image = this.cacheRaster(key, () => {
        const m = this.measureText(text),
          pad = 2 / scale,
          left = -m.actualBoundingBoxLeft - pad,
          top = -m.actualBoundingBoxAscent - pad;
        const cv = document.createElement("canvas");
        cv.width = Math.max(
          1,
          Math.ceil(
            (m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 2 * pad) *
              scale,
          ),
        );
        cv.height = Math.max(
          1,
          Math.ceil(
            (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2 * pad) *
              scale,
          ),
        );
        const g = cv.getContext("2d");
        g.scale(scale, scale);
        g.font = this.font;
        g.textAlign = this.textAlign;
        g.textBaseline = this.textBaseline;
        g.fillStyle = this.fillStyle;
        g.fillText(text, -left, -top);
        return { cv, left, top, w: cv.width / scale, h: cv.height / scale };
      });
      this.drawImage(image.cv, x + image.left, y + image.top, image.w, image.h);
    }
    flush() {
      if (!this.data.length) return;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(this.data),
        gl.STREAM_DRAW,
      );
      this.metrics.uploads++;
      this.drawBuffer(this.buffer, this.data.length / 8, I(), [1, 1, 1, 1]);
      this.data.length = 0;
    }
    drawBuffer(buffer, count, transform, tint) {
      if (!count) return;
      const gl = this.gl;
      gl.useProgram(this.program);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      this.useAttributes(this.attrs);
      for (let k = 0; k < 3; k++) {
        gl.vertexAttribPointer(
          this.attrs[k],
          [2, 4, 2][k],
          gl.FLOAT,
          false,
          32,
          [0, 8, 24][k],
        );
      }
      const m = transform;
      gl.uniformMatrix3fv(this.u.uTransform, false, [
        m[0],
        m[1],
        0,
        m[2],
        m[3],
        0,
        m[4],
        m[5],
        1,
      ]);
      gl.uniform4fv(this.u.uTint, tint);
      gl.uniform2f(this.u.uSize, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.u.uTextured, this.texture ? 1 : 0);
      if (this.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.u.uTex, 0);
      }
      this.setStrokeClip(this.u);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      this.metrics.draws++;
      this.metrics.vertices += count;
    }
  }
  function create(canvas, options = {}) {
    let currentCanvas = canvas;
    let context;
    let gpu = false;
    let lost = false;
    let disposed = false;
    let restoreError = null;
    const invalidate = () => {
      if (!disposed && typeof options.invalidate === "function")
        options.invalidate();
    };
    const reportError = (error) => {
      if (typeof options.onError === "function") options.onError(error);
    };
    try {
      context = new GPUContext(currentCanvas, options);
      gpu = true;
    } catch (error) {
      // A canvas that has acquired any GL context cannot subsequently acquire
      // Canvas2D. Replace only during construction, before consumers bind it.
      const replacement = currentCanvas.cloneNode(false);
      replacement.width = currentCanvas.width;
      replacement.height = currentCanvas.height;
      if (currentCanvas.parentNode)
        currentCanvas.parentNode.replaceChild(replacement, currentCanvas);
      currentCanvas = replacement;
      context = currentCanvas.getContext("2d");
      if (!context) {
        reportError(error);
        throw Error(
          "Neither WebGL nor Canvas2D is available: " + error.message,
        );
      }
    }
    const methodCache = new Map();
    const proxy = new Proxy(
      {},
      {
        get(target, property) {
          if (property === "canvas") return currentCanvas;
          if (property === "isContextLost") return () => lost;
          const value = context[property];
          if (typeof value !== "function") return value;
          if (!methodCache.has(property)) {
            methodCache.set(property, (...args) => {
              if (disposed) return;
              // Width-dependent text layout may still be needed while rendering is
              // suspended, but no GL calls or queued vertex data are allowed.
              if (lost && property !== "measureText") return;
              return context[property](...args);
            });
          }
          return methodCache.get(property);
        },
        set(target, property, value) {
          if (!disposed) context[property] = value;
          return true;
        },
      },
    );
    const onLost = (event) => {
      event.preventDefault();
      if (disposed) return;
      lost = true;
      context.dispose(true);
      invalidate();
    };
    const onRestored = () => {
      if (disposed) return;
      try {
        // Keep the public proxy stable: all cached app references automatically
        // target new programs, textures, buffers and Canvas-style state.
        const previous = context;
        context = new GPUContext(currentCanvas, options);
        previous.dispose();
        lost = false;
        restoreError = null;
        invalidate();
      } catch (error) {
        lost = true;
        restoreError = error;
        reportError(error);
      }
    };
    if (gpu) {
      currentCanvas.addEventListener("webglcontextlost", onLost);
      currentCanvas.addEventListener("webglcontextrestored", onRestored);
    }
    return {
      canvas: currentCanvas,
      context: proxy,
      Path: gpu ? GPUPath : NativePath2D,
      get mode() {
        return gpu
          ? lost
            ? "webgl-lost"
            : "webgl-analytic"
          : "canvas2d-fallback";
      },
      get error() {
        return restoreError;
      },
      flush() {
        if (gpu && !lost && !disposed) context.flush();
      },
      resize() {
        if (!gpu || lost || disposed) return;
        // Canvas width/height changes reset the drawing surface; rebuild viewport
        // and per-frame depth/stencil state without dropping retained VBOs.
        context.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
      },
      clearRasterCache() {
        if (!disposed && typeof context.clearRasterCache === "function")
          context.clearRasterCache();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (gpu) {
          currentCanvas.removeEventListener("webglcontextlost", onLost);
          currentCanvas.removeEventListener("webglcontextrestored", onRestored);
          context.dispose();
        }
        methodCache.clear();
      },
    };
  }
  root.GPURenderer = {
    Context: GPUContext,
    Path: GPUPath,
    NativePath2D,
    create,
  };
})(window);
