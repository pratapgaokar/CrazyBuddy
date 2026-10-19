(() => {
  const canvas = document.querySelector('#companionModel');
  const fallback = document.querySelector('#modelFallback');
  if (!canvas) return;

  /* ------------------------------------------------------------------
   * Public control surface used by renderer.js
   *   CompanionModel.set({ walking, facing, mood, speed })
   *     walking : bool   - gait on/off
   *     facing  : -1 | 0 | 1   - look left / at the user / right
   *     mood    : 'neutral' | 'happy' | 'sad'   (happy = signature wink,
   *               sad = droopy half-lidded eyes)
   *   CompanionModel.wink(side = 'right', holdMs = 850)  one-shot wink
   *               side: 'right' | 'left' | 'both' (as seen on screen)
   *   CompanionModel.blink()                             one-shot blink
   *   set({ autoBlink, autoWink })   idle behaviour on/off (both default true)
   *
   * Eyes: the head is one painted texture. The artist painted the dragon's
   * screen-right eye closed (a wink) and the screen-left eye open. At load we
   * find, for every vertex around one eye, the matching point around the other
   * eye (mirrored), and keep that second UV as `aUvAlt`. The fragment shader
   * can then show either painting on either eye, with a lid line that sweeps
   * down or up, which gives blink, wink (either side) and both-eyes-open.
   *     speed   : px/second actually travelled on screen. The gait phase is
   *               driven by distance, so feet never "skate".
   * The model is a single un-rigged mesh, so the walk is procedural: body
   * hop + waddle + lean in JS, foot lift / head nod / tail swing in the
   * vertex shader. Swap in a rigged GLB later and only this file changes.
   * ------------------------------------------------------------------ */
  const state = { walking: false, facing: 0, mood: 'neutral', speed: 0, autoBlink: true, autoWink: true };
  window.CompanionModel = {
    set(patch) { Object.assign(state, patch); wake(); },
    wink(side = 'right', holdMs = 850) { eyeEvents.wink = { side, hold: holdMs / 1000, at: -1 }; wake(); },
    blink() { eyeEvents.blink = { at: -1 }; wake(); },
    state
  };
  const eyeEvents = { wink: null, blink: null };

  const PX_PER_CYCLE = 110; // screen px for one full left+right step cycle
  const WALK_YAW = 1.25; // radians: nearly side-on while walking
  const IDLE_FRAME_MS = 33; // ~30fps when nothing is moving

  // Eye geometry in model space (measured from the mesh). The two eyes mirror
  // each other around x = EYE.xm. rx/ry cover the whole lid area.
  const EYE = { xm: -0.01, y: 0.072, ax: -0.17, rx: 0.105, ry: 0.11 };
  const EYE_BX = 2 * EYE.xm - EYE.ax;

  const VERTEX = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUv;
    attribute vec2 aUvAlt;    // same spot on the *other* eye (see header)
    attribute float aEyeW;    // 1 where that swap is valid, fades to 0 at the island edge
    uniform vec4 uEyeC;       // eye A centre xy, eye B centre xy
    uniform vec2 uEyeR;       // eye radii
    uniform mat4 uProjection;
    uniform mat4 uModel;
    uniform float uPhase;     // gait phase (radians)
    uniform float uWalk;      // 0..1 how much gait is blended in
    uniform float uHeadPitch; // radians, + looks down
    uniform float uTailDroop; // 0..1
    uniform float uTime;
    uniform float uDebug;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec2 vUvAlt;
    varying vec4 vEyeQ;       // eye-local coords (-1..1) for eye A (xy) and B (zw)
    varying float vEyeW;
    varying vec3 vDebug;

    mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }

    void main() {
      vec3 p = aPosition;
      vec3 n = aNormal;
      // Rest-pose position so the lids stay glued to the head while it nods.
      vEyeQ = vec4((aPosition.xy - uEyeC.xy) / uEyeR, (aPosition.xy - uEyeC.zw) / uEyeR);
      vUvAlt = aUvAlt;
      vEyeW = aEyeW;

      // Head nod about a neck pivot.
      float headW = smoothstep(0.02, 0.22, p.y);
      float nod = uHeadPitch + sin(uPhase * 2.0 - 0.8) * 0.07 * uWalk;
      vec3 pivot = vec3(0.0, 0.05, 0.02);
      mat3 R = rotX(nod * headW);
      p = pivot + R * (p - pivot);
      n = R * n;

      // Feet: low and toward the front. Left/right foot are half a cycle apart.
      float footW = smoothstep(-0.28, -0.42, p.y) * smoothstep(-0.02, 0.10, p.z);
      float side = smoothstep(-0.04, 0.04, p.x);
      float ph = uPhase + side * 3.14159265;
      p.y += footW * max(0.0, sin(ph)) * 0.11 * uWalk;
      p.z += footW * cos(ph) * 0.05 * uWalk;

      // Tail: low and either outboard or behind. Whips while walking,
      // sways gently at rest, droops when sad.
      float tailW = smoothstep(0.12, 0.40, abs(p.x)) * smoothstep(-0.05, -0.25, p.y);
      tailW = max(tailW, smoothstep(-0.05, -0.30, p.z) * smoothstep(0.0, -0.3, p.y));
      float wave = sin(uPhase * 2.0 - abs(p.x) * 7.0 - p.z * 7.0);
      p.y += tailW * (wave * 0.06 * uWalk + sin(uTime * 2.0 - abs(p.x) * 5.0) * 0.02 - uTailDroop * 0.07);
      p.x += tailW * sin(uTime * 1.6 - p.z * 5.0) * 0.03 * (1.0 - uWalk);
      p.z += tailW * wave * 0.03 * uWalk;

      vNormal = mat3(uModel) * n;
      vUv = aUv;
      vDebug = vec3(footW * (1.0 - side), footW * side, tailW);
      gl_Position = uProjection * uModel * vec4(p, 1.0);
    }
  `;
  const FRAGMENT = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec2 vUvAlt;
    varying vec4 vEyeQ;
    varying float vEyeW;
    varying vec3 vDebug;
    uniform sampler2D uTexture;
    uniform vec4 uBaseColor;
    uniform vec2 uOpen;       // how open eye A (screen-left) and B (screen-right) are, 0..1
    uniform float uDebug;
    uniform float uEyeDebug;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 light = normalize(vec3(-0.45, 0.75, 1.0));
      float diffuse = max(dot(n, light), 0.0);
      float fill = 0.42 + diffuse * 0.58;
      vec4 tex = texture2D(uTexture, vUv);

      // Eyes. Eye A is painted open, eye B is painted closed. The lid line sits
      // at height lid (eye-local y); "closed" art is above it, "open" art below.
      float mA = vEyeW * (1.0 - smoothstep(0.80, 1.0, length(vEyeQ.xy)));
      float mB = vEyeW * (1.0 - smoothstep(0.80, 1.0, length(vEyeQ.zw)));
      if (mA > 0.0 || mB > 0.0) {
        vec4 alt = texture2D(uTexture, vUvAlt);
        float lidA = -1.15 + 2.3 * uOpen.x;
        float lidB = -1.15 + 2.3 * uOpen.y;
        float closeA = smoothstep(lidA - 0.08, lidA + 0.08, vEyeQ.y);        // above lid -> closed art (alt)
        float openB = 1.0 - smoothstep(lidB - 0.08, lidB + 0.08, vEyeQ.w);   // below lid -> open art (alt)
        tex = mix(tex, alt, mA * closeA + mB * openB);
        if (uEyeDebug > 0.5) tex.rgb = mix(tex.rgb, vec3(mA, 0.0, mB), 0.35);
      }
      tex *= uBaseColor;
      vec3 col = tex.rgb * fill;
      if (uDebug > 0.5) col = mix(col, vDebug, 0.8 * clamp(vDebug.r + vDebug.g + vDebug.b, 0.0, 1.0));
      gl_FragColor = vec4(col, tex.a);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function mat4Perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=(2*far*near)*nf; out[15]=0;
    return out;
  }

  function mat4Mul(a,b) {
    const o = new Float32Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function mat4Translate(x,y,z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); }
  function mat4Scale(x,y,z) { return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); }
  function mat4RotateY(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
  function mat4RotateX(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
  function mat4RotateZ(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
  function chain(...ms) { return ms.reduce((acc, m) => mat4Mul(acc, m)); }

  function readAccessor(json, binary, index) {
    const acc=json.accessors[index], view=json.bufferViews[acc.bufferView];
    const componentSize = acc.componentType===5126?4:acc.componentType===5125?4:acc.componentType===5123?2:1;
    const countPer = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[acc.type];
    const stride=view.byteStride || componentSize*countPer;
    const base=(view.byteOffset||0)+(acc.byteOffset||0);
    const out = acc.componentType===5126 ? new Float32Array(acc.count*countPer) : new Uint32Array(acc.count*countPer);
    const dv=new DataView(binary);
    for(let i=0;i<acc.count;i++) for(let c=0;c<countPer;c++) {
      const off=base+i*stride+c*componentSize;
      out[i*countPer+c]=acc.componentType===5126?dv.getFloat32(off,true):acc.componentType===5125?dv.getUint32(off,true):dv.getUint16(off,true);
    }
    return {data:out,count:acc.count,components:countPer};
  }

  function parseGlb(arrayBuffer) {
    const dv=new DataView(arrayBuffer); if(dv.getUint32(0,true)!==0x46546c67) throw new Error('Not a GLB');
    let off=12, json=null, bin=null;
    while(off<arrayBuffer.byteLength){ const len=dv.getUint32(off,true), type=dv.getUint32(off+4,true); const start=off+8; if(type===0x4e4f534a) json=JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer,start,len))); else if(type===0x004e4942) bin=arrayBuffer.slice(start,start+len); off=start+len; }
    if(!json||!bin) throw new Error('Incomplete GLB'); return {json,bin};
  }

  async function loadImage(json, binary) {
    const image=json.images[0], view=json.bufferViews[image.bufferView];
    const bytes=new Uint8Array(binary, view.byteOffset||0, view.byteLength);
    const blob=new Blob([bytes],{type:image.mimeType||'image/png'});
    return createImageBitmap(blob);
  }

  function buildNormals(positions, indices) {
    const n=new Float32Array(positions.length);
    for(let i=0;i<indices.length;i+=3){
      const ia=indices[i]*3, ib=indices[i+1]*3, ic=indices[i+2]*3;
      const ax=positions[ib]-positions[ia], ay=positions[ib+1]-positions[ia+1], az=positions[ib+2]-positions[ia+2];
      const bx=positions[ic]-positions[ia], by=positions[ic+1]-positions[ia+1], bz=positions[ic+2]-positions[ia+2];
      const nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
      n[ia]+=nx;n[ia+1]+=ny;n[ia+2]+=nz; n[ib]+=nx;n[ib+1]+=ny;n[ib+2]+=nz; n[ic]+=nx;n[ic+1]+=ny;n[ic+2]+=nz;
    }
    for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}
    return n;
  }

  // For every vertex near one eye, find the UV of the mirrored point near the
  // other eye (barycentric inside the partner's front-facing triangles).
  // Only triangles in the eye's own UV island are used (islands are found as
  // connected components, since the exporter splits vertices at UV seams), so
  // nothing is ever sampled from a neighbouring part of the texture. `w` fades
  // the swap out where the mirrored point has no partner triangle.
  function buildEyeUvAlt(pos, uv, idx) {
    const n = pos.length / 3;
    const alt = new Float32Array(uv); // default: own UV (no swap)
    const w = new Float32Array(n);    // 0 = no swap here
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let t = 0; t < idx.length; t += 3) {
      const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
      parent[b] = a; parent[find(c)] = a;
    }
    const cx = [EYE.ax, EYE_BX];
    const inZone = (x, y, k, s) => {
      const dx = (x - cx[k]) / (EYE.rx * s), dy = (y - EYE.y) / (EYE.ry * s);
      return dx * dx + dy * dy <= 1;
    };
    // The island that holds the eye art: the front-facing vertex nearest each eye centre.
    const island = [0, 0];
    for (let k = 0; k < 2; k++) {
      let bd = Infinity;
      for (let v = 0; v < n; v++) {
        if (pos[v * 3 + 2] < 0.1) continue;
        const d = (pos[v * 3] - cx[k]) ** 2 + (pos[v * 3 + 1] - EYE.y) ** 2;
        if (d < bd) { bd = d; island[k] = find(v); }
      }
    }
    const tris = [[], []];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      if (pos[a + 2] < 0.08 || pos[b + 2] < 0.08 || pos[c + 2] < 0.08) continue;
      const area = (pos[b] - pos[a]) * (pos[c + 1] - pos[a + 1]) - (pos[b + 1] - pos[a + 1]) * (pos[c] - pos[a]);
      if (area <= 0) continue; // back-facing seen from the front
      const ex = (pos[a] + pos[b] + pos[c]) / 3, ey = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      const comp = find(idx[t]);
      for (let k = 0; k < 2; k++) if (comp === island[k] && inZone(ex, ey, k, 1.6)) tris[k].push(t);
    }
    for (let k = 0; k < 2; k++) {
      const seen = new Set(), partner = tris[1 - k];
      for (const t of tris[k]) for (let j = 0; j < 3; j++) {
        const v = idx[t + j];
        if (seen.has(v)) continue;
        seen.add(v);
        const mx = 2 * EYE.xm - pos[v * 3], my = pos[v * 3 + 1];
        let best = -1, bestMin = -Infinity, bl = null;
        for (const pt of partner) {
          const a = idx[pt] * 3, b = idx[pt + 1] * 3, c = idx[pt + 2] * 3;
          const d = (pos[b + 1] - pos[c + 1]) * (pos[a] - pos[c]) + (pos[c] - pos[b]) * (pos[a + 1] - pos[c + 1]);
          if (Math.abs(d) < 1e-12) continue;
          const l0 = ((pos[b + 1] - pos[c + 1]) * (mx - pos[c]) + (pos[c] - pos[b]) * (my - pos[c + 1])) / d;
          const l1 = ((pos[c + 1] - pos[a + 1]) * (mx - pos[c]) + (pos[a] - pos[c]) * (my - pos[c + 1])) / d;
          const l2 = 1 - l0 - l1, m = Math.min(l0, l1, l2);
          if (m > bestMin) { bestMin = m; best = pt; bl = [l0, l1, l2]; if (m >= 0) break; }
        }
        if (best < 0) continue;
        const ids = [idx[best], idx[best + 1], idx[best + 2]];
        let ww = bl.map((x) => Math.max(0, x)); const sum = ww[0] + ww[1] + ww[2] || 1; ww = ww.map((x) => x / sum);
        const us = ids.map((i) => uv[i * 2]), vs = ids.map((i) => uv[i * 2 + 1]);
        alt[v * 2] = us[0] * ww[0] + us[1] * ww[1] + us[2] * ww[2];
        alt[v * 2 + 1] = vs[0] * ww[0] + vs[1] * ww[1] + vs[2] * ww[2];
        w[v] = Math.min(1, Math.max(0, 1 + 6 * bestMin));
      }
    }
    return { alt, w };
  }

  let wake = () => {};

  async function start() {
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
    if(!gl) throw new Error('WebGL unavailable');
    if(!gl.getExtension('OES_element_index_uint')) throw new Error('32-bit indices unsupported');
    const res=await fetch('./assets/cerebraq-dragon.glb');
    if(!res.ok) throw new Error('GLB not found');
    const {json,bin}=parseGlb(await res.arrayBuffer());
    const primitive=json.meshes[0].primitives[0];
    const pos=readAccessor(json,bin,primitive.attributes.POSITION).data;
    const uv=readAccessor(json,bin,primitive.attributes.TEXCOORD_0).data;
    const idx=readAccessor(json,bin,primitive.indices).data;
    const normals=buildNormals(pos,idx);
    const {alt:uvAlt,w:eyeW}=buildEyeUvAlt(pos,uv,idx);

    const vs=compile(gl,gl.VERTEX_SHADER,VERTEX), fs=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT);
    const program=gl.createProgram(); gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    function buffer(data, target=gl.ARRAY_BUFFER){const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;}
    const pb=buffer(pos), nb=buffer(normals), ub=buffer(uv), ab=buffer(uvAlt), wb=buffer(eyeW), ib=buffer(new Uint32Array(idx),gl.ELEMENT_ARRAY_BUFFER);
    const attrs={aPosition:gl.getAttribLocation(program,'aPosition'),aNormal:gl.getAttribLocation(program,'aNormal'),aUv:gl.getAttribLocation(program,'aUv'),aUvAlt:gl.getAttribLocation(program,'aUvAlt'),aEyeW:gl.getAttribLocation(program,'aEyeW')};
    gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.enableVertexAttribArray(attrs.aPosition);gl.vertexAttribPointer(attrs.aPosition,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.enableVertexAttribArray(attrs.aNormal);gl.vertexAttribPointer(attrs.aNormal,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.enableVertexAttribArray(attrs.aUv);gl.vertexAttribPointer(attrs.aUv,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,ab);gl.enableVertexAttribArray(attrs.aUvAlt);gl.vertexAttribPointer(attrs.aUvAlt,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,wb);gl.enableVertexAttribArray(attrs.aEyeW);gl.vertexAttribPointer(attrs.aEyeW,1,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);

    const img=await loadImage(json,bin), tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    if (img.close) img.close();
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(0,0,0,0);

    const U = (name) => gl.getUniformLocation(program, name);
    const uProj=U('uProjection'), uModel=U('uModel'), uBase=U('uBaseColor'), uPhase=U('uPhase'), uWalk=U('uWalk'),
          uHead=U('uHeadPitch'), uTail=U('uTailDroop'), uTime=U('uTime'), uDebug=U('uDebug'),
          uOpen=U('uOpen');
    gl.uniform1i(U('uTexture'), 0);
    gl.uniform1f(uDebug, new URLSearchParams(location.search).has('debugWeights') ? 1 : 0);
    gl.uniform1f(U('uEyeDebug'), new URLSearchParams(location.search).has('debugEyes') ? 1 : 0);
    gl.uniform4f(U('uEyeC'), EYE.ax, EYE.y, EYE_BX, EYE.y);
    gl.uniform2f(U('uEyeR'), EYE.rx, EYE.ry);

    const projection=new Float32Array(16);
    function resize(){
      const dpr=Math.min(devicePixelRatio||1,1.5), w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);mat4Perspective(projection,0.72,w/h,0.05,10);gl.uniformMatrix4fv(uProj,false,projection);
    }

    // Eye controller ------------------------------------------------------
    const sm = (x) => x * x * (3 - 2 * x);
    function envelope(age, up, hold, down) { // 0..1..0, or -1 once finished
      if (age < up) return sm(age / up);
      if (age < up + hold) return 1;
      if (age < up + hold + down) return 1 - sm((age - up - hold) / down);
      return -1;
    }
    const eyes = { blinkT0: null, double: false, nextBlink: 1.6, winkT0: null, winkSide: 'right', winkHold: 0.85, nextWink: 14 + Math.random() * 14 };
    const eyesBusy = () => eyes.blinkT0 !== null || eyes.winkT0 !== null;
    function updateEyes(t, happy, sad) {
      if (eyeEvents.blink) { eyes.blinkT0 = t; eyeEvents.blink = null; }
      if (eyeEvents.wink) { eyes.winkT0 = t; eyes.winkSide = eyeEvents.wink.side; eyes.winkHold = eyeEvents.wink.hold; eyeEvents.wink = null; }

      if (state.autoBlink && eyes.blinkT0 === null && t >= eyes.nextBlink) {
        eyes.blinkT0 = t; eyes.double = Math.random() < 0.15;
      }
      let blink = 0;
      if (eyes.blinkT0 !== null) {
        const e = envelope(t - eyes.blinkT0, 0.07, 0.04, 0.13);
        if (e < 0) {
          eyes.blinkT0 = null;
          if (eyes.double) { eyes.double = false; eyes.nextBlink = t + 0.1; }
          else eyes.nextBlink = t + 2.2 + Math.random() * 3.8;
        } else blink = e;
      }

      // Now and then, a cheeky wink while it is just standing there looking at you.
      if (state.autoWink && eyes.winkT0 === null && state.mood === 'neutral' && !state.walking && state.facing === 0 && t >= eyes.nextWink) {
        eyes.winkT0 = t; eyes.winkSide = Math.random() < 0.7 ? 'right' : 'left'; eyes.winkHold = 0.8;
      }
      let wA = 0, wB = 0;
      if (eyes.winkT0 !== null) {
        const e = envelope(t - eyes.winkT0, 0.12, eyes.winkHold, 0.2);
        if (e < 0) { eyes.winkT0 = null; eyes.nextWink = t + 16 + Math.random() * 30; }
        else { if (eyes.winkSide !== 'left') wB = e; if (eyes.winkSide !== 'right') wA = e; }
      }

      const base = 1 - 0.45 * sad;                       // sad: heavy lids
      const happyWink = sm(Math.min(1, Math.max(0, (happy - 0.3) / 0.4))); // happy: signature wink
      return [base * (1 - blink) * (1 - wA), base * (1 - blink) * (1 - wB) * (1 - happyWink)];
    }

    // Smoothed animation values
    const cur = { walk: 0, yaw: 0, mood: 0, phase: 0, time: 0 };
    const ease = (from, to, dt, rate) => from + (to - from) * Math.min(1, dt * rate);
    let last = performance.now();
    let raf = 0;

    function frame(now) {
      raf = 0;
      if (document.hidden) return; // resumes via visibilitychange

      const sinceLast = now - last;
      const moodTarget = state.mood === 'happy' ? 1 : state.mood === 'sad' ? -1 : 0;
      const yawTarget = state.walking ? state.facing * WALK_YAW : state.facing * 0.9;
      const busy = state.walking || state.mood !== 'neutral' || cur.walk > 0.01 ||
                   Math.abs(cur.mood - moodTarget) > 0.02 || Math.abs(cur.yaw - yawTarget) > 0.02 || eyesBusy() ||
                   eyeEvents.wink || eyeEvents.blink;

      // Idle: ~30fps normally, but drop to ~10fps in deep idle (nothing
      // moving, no blink/wink due soon) - breathing stays smooth, GPU rests.
      const eyeSoon = (state.autoBlink && eyes.nextBlink - cur.time < 0.6) ||
                      (state.autoWink && eyes.nextWink - cur.time < 0.6);
      const idleMs = eyeSoon ? IDLE_FRAME_MS : 100;
      if (!busy && sinceLast < idleMs) { raf = requestAnimationFrame(frame); return; }

      const dt = Math.min(0.1, sinceLast / 1000);
      last = now;
      cur.time += dt;

      cur.walk = ease(cur.walk, state.walking ? 1 : 0, dt, 9);
      cur.mood = ease(cur.mood, moodTarget, dt, 5);
      cur.yaw = ease(cur.yaw, yawTarget, dt, 5);
      if (state.phase != null) cur.phase = state.phase; // test hook: pin the gait phase
      else if (state.walking) cur.phase += state.speed * dt * (Math.PI * 2 / PX_PER_CYCLE);

      const happy = Math.max(cur.mood, 0), sad = Math.max(-cur.mood, 0);
      const stride = Math.abs(Math.sin(cur.phase));
      const t = cur.time;

      // Body motion --------------------------------------------------
      let hop = stride * 0.05 * cur.walk * (1 + 1.4 * happy) * (1 - 0.5 * sad);
      hop += Math.abs(Math.sin(t * 8)) * 0.11 * happy * (1 - cur.walk); // happy jumps in place
      const land = Math.pow(1 - stride, 3) * (0.05 + 0.04 * happy) * cur.walk; // squash on touchdown
      const breathe = Math.sin(t * 1.8) * 0.012 * (1 - 0.5 * sad);
      const sy = 1 + breathe - land - sad * 0.03;
      const sx = 1 + (1 - sy) * 0.5;
      const dir = Math.sign(state.facing);
      const roll = Math.sin(cur.phase) * 0.07 * cur.walk + Math.sin(t * 1.2) * 0.01 - dir * 0.07 * cur.walk;
      const pitch = sad * 0.10 * (1 - Math.abs(dir));
      const yaw = cur.yaw + Math.sin(t * 0.55) * 0.18 * (1 - Math.abs(state.facing)) * (1 - Math.max(happy, sad)) +
                  Math.sin(t * 8) * 0.12 * happy * (1 - cur.walk);
      const y = hop + 0.5 * (sy - 1) * 1.0;

      const model = chain(
        mat4Translate(0, y, -2.15),
        mat4RotateZ(roll),
        mat4RotateX(pitch),
        mat4RotateY(yaw),
        mat4Scale(sx, sy, sx)
      );

      resize();
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uModel,false,model);
      const eyeOpen = state.eyes || updateEyes(t, happy, sad); // state.eyes = [openA, openB]: test hook to pin the lids
      gl.uniform2f(uOpen, eyeOpen[0], eyeOpen[1]);
      gl.uniform1f(uPhase, cur.phase);
      gl.uniform1f(uWalk, cur.walk);
      gl.uniform1f(uHead, 0.38 * sad - 0.10 * happy);
      gl.uniform1f(uTail, sad);
      gl.uniform1f(uTime, t);
      gl.uniform4f(uBase, 1 - 0.20 * sad + 0.05 * happy, 1 - 0.16 * sad + 0.02 * happy, 1 + 0.0 * sad - 0.02 * happy, 1);
      gl.drawElements(gl.TRIANGLES,idx.length,gl.UNSIGNED_INT,0);

      raf = requestAnimationFrame(frame);
    }

    wake = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', wake);
    wake();
  }
  start().catch(err=>{console.error('[CerebraQ Companion] 3D model failed:',err); fallback.hidden=false;});
})();
