(() => {
  /* Skinned-avatar engine (Three.js r128, vendored) — the rigged counterpart
   * of model.js. Same CompanionModel API so renderer.js can swap engines:
   *
   *   const m = CompanionModel3D(canvas, './assets/buddy.glb')
   *   await m.ready                    // resolves when the GLB is playing idle
   *   m.set({ mood, walking, speed, facing })
   *   m.wink() / m.blink() / m.celebrate()
   *   m.setProp('glass' | null)        // prop attached to the right hand bone
   *   m.setActive(true|false)          // start/stop the render loop
   *
   * Animation clips are matched by keyword, so any Mixamo-style GLB works:
   * walk: "walk"; celebrate: "dance", "agree", "thumbsup", "jump";
   * wave: "wave", "agree"; sad: "sad"; base: "idle".
   * wink() plays the wave clip when the character has one; blink() is a
   * subtle head dip (skinned characters here have no eyelid bones).
   */
  function createModel3D(canvas, url) {
    const state = { mood: 'neutral', walking: false, speed: 0, facing: 1 };
    let renderer3 = null;
    let scene = null;
    let camera = null;
    let mixer = null;
    let root = null;
    let clock = null;
    let raf = 0;
    let activeFlag = false;
    let targetRotY = 0;
    let headDip = 0;
    const actions = {}; // lowercase clip name -> THREE.AnimationAction
    let current = null;
    let oneShot = null;
    let anchor = null; // hand (or forearm) bone the prop attaches to
    let propGroup = null;
    let resolveReady;
    let rejectReady;
    const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

    function findAction(keywords) {
      for (const kw of keywords) {
        for (const name of Object.keys(actions)) {
          if (name.includes(kw)) return actions[name];
        }
      }
      return null;
    }
    const idleAction = () => findAction(['idle']);
    const walkAction = () => findAction(['walk', 'walking']);
    const celebrateAction = () => findAction(['dance', 'celebrat', 'agree', 'thumbsup', 'jump']);
    const waveAction = () => findAction(['wave', 'agree', 'yes']);
    const sadAction = () => findAction(['sad']);

    function play(action, { fade = 0.25, once = false } = {}) {
      if (!action) return false;
      if (current === action && !once) return true;
      if (current && current !== action) current.fadeOut(fade);
      action.reset();
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      action.fadeIn(fade);
      action.play();
      current = action;
      oneShot = once ? action : null;
      return true;
    }

    function baseAction() {
      if (state.walking) return walkAction() || idleAction();
      if (state.mood === 'sad') return sadAction() || idleAction();
      return idleAction();
    }

    function recompute() {
      if (oneShot) return; // a one-shot clip is playing; it re-enters on finish
      play(baseAction());
    }

    function playOnce(action) {
      if (!action) return false;
      return play(action, { once: true, fade: 0.18 });
    }

    function set(patch = {}) {
      const wasWalking = state.walking;
      Object.assign(state, patch);
      if (!mixer) return;
      if (typeof patch.facing === 'number') {
        targetRotY = patch.facing === 0 ? 0 : patch.facing * 1.02;
      }
      if (state.walking) {
        const w = walkAction();
        if (w) w.timeScale = 0.65 + Math.min(1, Math.max(0, state.speed || 0)) * 0.85;
      }
      if (patch.mood === 'happy' && !state.walking && !wasWalking) {
        // Becoming happy = a little celebration, then settle back to idle.
        if (!playOnce(celebrateAction())) recompute();
      } else {
        recompute();
      }
    }

    function wink() {
      if (!playOnce(waveAction())) headDip = 1; // fallback: friendly head dip
    }
    function blink() { headDip = Math.max(headDip, 0.6); }
    function celebrate() { if (!playOnce(celebrateAction())) headDip = 1; }

    /* ------------------------------ props ------------------------------ */
    function makeGlass() {
      const group = new THREE.Group();
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xd6ecff, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.05, side: THREE.DoubleSide, depthWrite: false
      });
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.115, 20, 1, true), glassMat);
      glass.position.y = 0.058;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), glassMat);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.002;
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.027, 0.07, 20),
        new THREE.MeshStandardMaterial({ color: 0x2f9df6, transparent: true, opacity: 0.85, roughness: 0.25 })
      );
      water.position.y = 0.037;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0022, 8, 24), glassMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.115;
      group.add(glass, bottom, water, rim);
      return group;
    }

    function setProp(name) {
      if (!root) return;
      if (propGroup) {
        propGroup.parent && propGroup.parent.remove(propGroup);
        propGroup = null;
      }
      if (!name) return;
      if (name !== 'glass') return; // more props can be added the same way
      propGroup = makeGlass();
      if (anchor) {
        // local size is in metres for Mixamo rigs; counter the root scale
        const s = root.scale.x || 1;
        propGroup.scale.setScalar(1 / s);
        propGroup.position.set(0.01, 0.07, 0.03);
        propGroup.rotation.set(-0.5, 0, 0.15);
        anchor.add(propGroup);
      } else {
        // No hand bone (e.g. the robot): present the glass beside the body.
        propGroup.position.set(0.42, 1.02, 0.18);
        root.add(propGroup);
      }
    }

    function findAnchor() {
      let hand = null;
      let forearm = null;
      root.traverse((obj) => {
        const n = (obj.name || '').replace(/[:_. ]/g, '').toLowerCase();
        if (!hand && n.endsWith('righthand')) hand = obj;
        if (!forearm && (n.endsWith('rightforearm') || n.endsWith('lowerarmr'))) forearm = obj;
      });
      return hand || forearm;
    }

    /* ------------------------------ setup ------------------------------ */
    function tick() {
      if (!activeFlag) { raf = 0; return; }
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      if (mixer) mixer.update(dt);
      if (root) {
        root.rotation.y += (targetRotY - root.rotation.y) * Math.min(1, dt * 7);
        if (headDip > 0) {
          headDip = Math.max(0, headDip - dt * 3.2);
          root.rotation.x = Math.sin(headDip * Math.PI) * 0.07;
        } else if (root.rotation.x !== 0) {
          root.rotation.x = 0;
        }
      }
      renderer3.render(scene, camera);
    }

    function setActive(on) {
      activeFlag = !!on;
      if (activeFlag && !raf && renderer3) {
        clock = clock || new THREE.Clock();
        raf = requestAnimationFrame(tick);
      }
      if (!activeFlag && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function init() {
      if (!window.THREE || !THREE.GLTFLoader) {
        rejectReady(new Error('Three.js not available'));
        return;
      }
      const width = canvas.clientWidth || 300;
      const height = canvas.clientHeight || 240;
      renderer3 = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer3.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer3.setSize(width, height, false);
      renderer3.outputEncoding = THREE.sRGBEncoding;
      renderer3.toneMapping = THREE.ACESFilmicToneMapping;
      renderer3.toneMappingExposure = 1.06;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 60);
      camera.position.set(0, 1.04, 4.7);
      camera.lookAt(0, 0.94, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x51606e, 1.05));
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(2.5, 4, 3.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbfd8ff, 0.35);
      rim.position.set(-3, 2, -2.5);
      scene.add(rim);

      new THREE.GLTFLoader().load(url, (gltf) => {
        root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const scale = size.y > 0 ? 1.94 / size.y : 1;
        root.scale.setScalar(scale);
        root.position.y = -box.min.y * scale;
        root.traverse((obj) => { if (obj.isMesh) obj.frustumCulled = false; });
        scene.add(root);
        mixer = new THREE.AnimationMixer(root);
        for (const clip of gltf.animations || []) {
          actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
        }
        mixer.addEventListener('finished', (e) => {
          if (e.action === oneShot) { oneShot = null; recompute(); }
        });
        anchor = findAnchor();
        play(idleAction(), { fade: 0 });
        resolveReady();
      }, undefined, (err) => rejectReady(err || new Error('GLB load failed')));
    }

    const api = { ready, set, wink, blink, celebrate, setProp, setActive };
    init();
    return api;
  }

  window.CompanionModel3D = createModel3D;
})();
