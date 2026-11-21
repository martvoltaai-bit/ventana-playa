  // ---------- Oclusor: invisible, pero tapa lo que está detrás (hace el "agujero" en la pared)
  AFRAME.registerComponent('occluder', {
    init() {
      const apply = () => {
        const mesh = this.el.getObject3D('mesh');
        if (!mesh) return;
        mesh.material = new THREE.MeshBasicMaterial({ colorWrite: false });
        mesh.renderOrder = -1;
      };
      apply();
      this.el.addEventListener('object3dset', apply);
      this.el.addEventListener('loaded', apply);   // por si el material por defecto se aplicó después
    }
  });

  // ---------- La playa
  AFRAME.registerComponent('beach', {
    init() {
      const g = new THREE.Group();
      this.el.setObject3D('beach', g);
      this.t = 0;

      const SEA_Y = -0.585;
      const FAR = -70;
      const SUN = new THREE.Vector3(-14, 10, FAR);

      // --- Cielo (plano lejano con degradé y sol)
      const skyMat = new THREE.ShaderMaterial({
        uniforms: { uSun: { value: new THREE.Vector2(SUN.x, SUN.y) } },
        vertexShader: `
          varying vec3 vPos;
          void main() { vPos = position + vec3(0.0, 69.4, 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec2 uSun;
          varying vec3 vPos;
          void main() {
            float t = clamp((vPos.y + 0.6) / 45.0, 0.0, 1.0);
            vec3 horizon = vec3(0.93, 0.92, 0.86);
            vec3 mid = vec3(0.55, 0.78, 0.95);
            vec3 zenith = vec3(0.16, 0.44, 0.82);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.12, t));
            col = mix(col, zenith, smoothstep(0.1, 1.0, t));
            float d = distance(vPos.xy, uSun);
            col += vec3(1.0, 0.85, 0.6) * 0.55 * exp(-d * 0.12);   // halo
            col = mix(col, vec3(1.0, 0.98, 0.9), 1.0 - smoothstep(2.3, 2.6, d)); // disco
            gl_FragColor = vec4(col, 1.0);
          }`
      });
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(420, 160), skyMat);
      sky.position.set(0, 69.4, FAR);   // borde inferior en y = -10.6
      g.add(sky);

      // --- Isla lejana
      const island = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        new THREE.MeshBasicMaterial({ color: 0x8fa7b5 })
      );
      island.scale.set(14, 2.6, 3); island.position.set(24, SEA_Y - 0.4, FAR + 8);
      g.add(island);
      const island2 = island.clone(); island2.scale.set(7, 1.6, 2); island2.position.set(36, SEA_Y - 0.3, FAR + 6);
      g.add(island2);

      // --- Mar
      const seaGeo = new THREE.PlaneGeometry(140, 68, 280, 220);
      seaGeo.rotateX(-Math.PI / 2);
      seaGeo.translate(0, 0, -2.5 - 34);   // de z = -2.5 a z = -70.5
      this.seaUniforms = {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(SUN.x, SUN.y - SEA_Y, SUN.z + 8).normalize() }
      };
      const seaMat = new THREE.ShaderMaterial({
        uniforms: this.seaUniforms,
        extensions: { derivatives: true },
        vertexShader: `
          uniform float uTime;
          varying vec3 vP; varying float vH;
          float w(vec2 p, vec2 d, float f, float s, float a) { return sin(dot(p, normalize(d)) * f + uTime * s) * a; }
          void main() {
            vec3 p = position;
            float near = smoothstep(-30.0, -4.0, p.z);          // olas más marcadas cerca de la orilla
            float h = w(p.xz, vec2(0.15, 1.0), 1.5, 1.3, 0.05 + 0.03 * near)
                    + w(p.xz, vec2(-0.6, 1.0), 2.6, 1.8, 0.022)
                    + w(p.xz, vec2(0.9, 0.35), 4.8, 2.5, 0.009)
                    + w(p.xz, vec2(-0.2, -1.0), 7.3, 3.1, 0.004);
            p.y += h;
            vP = p; vH = h;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform float uTime; uniform vec3 uCam; uniform vec3 uSunDir;
          varying vec3 vP; varying float vH;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float vnoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
            if (n.y < 0.0) n = -n;
            vec3 v = normalize(uCam - vP);
            vec3 deep = vec3(0.02, 0.24, 0.42);
            vec3 shallow = vec3(0.12, 0.62, 0.66);
            float sh = smoothstep(-14.0, -3.0, vP.z);
            vec3 col = mix(deep, shallow, sh);
            float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            col = mix(col, vec3(0.72, 0.86, 0.96), fres * 0.75);
            vec3 r = reflect(-v, n);
            col += vec3(1.0, 0.92, 0.75) * pow(max(dot(r, uSunDir), 0.0), 180.0) * 1.6;
            // espuma de la orilla, que va y viene
            float shore = -3.35 + sin(uTime * 0.7) * 0.28 + sin(uTime * 0.31 + vP.x * 0.4) * 0.12;
            float nz = vnoise(vP.xz * vec2(6.0, 9.0) + vec2(0.0, uTime * 0.4));
            float foam = 1.0 - smoothstep(0.0, 0.55, abs(vP.z - shore) - nz * 0.25);
            foam += smoothstep(0.045, 0.075, vH) * 0.35 * nz;       // crestas
            col = mix(col, vec3(0.97, 0.98, 0.97), clamp(foam, 0.0, 1.0));
            // bruma hacia el horizonte
            float dist = length(vP.xz - uCam.xz);
            col = mix(col, vec3(0.88, 0.91, 0.9), smoothstep(18.0, 68.0, dist) * 0.85);
            gl_FragColor = vec4(col, 1.0);
          }`
      });
      this.sea = new THREE.Mesh(seaGeo, seaMat);
      this.sea.position.y = SEA_Y;
      g.add(this.sea);

      // --- Arena (con declive hacia el mar y zona mojada)
      const sandGeo = new THREE.PlaneGeometry(30, 7, 120, 60);
      sandGeo.rotateX(-Math.PI / 2);
      sandGeo.translate(0, 0, -0.1 - 3.5);   // de z = -0.1 a z = -7.1
      const pos = sandGeo.attributes.position;
      const colors = [];
      const dry = new THREE.Color(0xeedcb0), wet = new THREE.Color(0xb59a6e), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        let y = -0.42 + 0.05 * (z + 0.1);
        y += Math.sin(x * 1.7 + z * 0.8) * 0.012 + Math.sin(x * 4.1 - z * 2.3) * 0.005;
        pos.setY(i, y);
        const dryness = THREE.MathUtils.smoothstep(z, -3.2, -2.4);  // 0 = mojada, 1 = seca
        c.copy(wet).lerp(dry, dryness);
        const grain = 0.94 + Math.random() * 0.08;
        colors.push(c.r * grain, c.g * grain, c.b * grain);
      }
      sandGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      sandGeo.computeVertexNormals();
      g.add(new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));

      // --- Palmera
      this.palm = this.makePalm();
      this.palm.position.set(-0.85, -0.525, -2.2);
      g.add(this.palm);

      // --- Nubes
      this.clouds = [];
      const cloudTex = this.cloudTexture();
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.9 })
        );
        const s = 10 + Math.random() * 14;
        m.scale.set(s * 2.2, s, 1);
        m.position.set(-90 + i * 30 + Math.random() * 10, 7 + Math.random() * 18, FAR + 4 + Math.random() * 3);
        m.userData.speed = 0.6 + Math.random() * 0.6;
        g.add(m); this.clouds.push(m);
      }

      // --- Gaviotas
      this.birds = [];
      for (let i = 0; i < 4; i++) {
        const b = this.makeBird();
        b.userData = { r: 3 + Math.random() * 5, h: 2 + Math.random() * 3, z: -12 - Math.random() * 14,
                       sp: 0.15 + Math.random() * 0.15, ph: Math.random() * 6.28, cx: -4 + Math.random() * 8 };
        g.add(b); this.birds.push(b);
      }
      this.camPos = new THREE.Vector3();
    },

    makePalm() {
      const palm = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
      let p = new THREE.Vector3(0, 0, 0);
      const segs = 12, h = 2.1;
      let top;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const a = new THREE.Vector3(Math.pow(t0, 2) * 0.55, t0 * h, 0);
        const b = new THREE.Vector3(Math.pow(t1, 2) * 0.55, t1 * h, 0);
        const len = a.distanceTo(b);
        const r0 = 0.065 - t0 * 0.025;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.004, r0 + 0.006, len * 1.02, 10), trunkMat);
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        palm.add(seg);
        top = b;
      }
      const leafTex = this.leafTexture();
      const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
      this.fronds = new THREE.Group();
      this.fronds.position.copy(top);
      for (let i = 0; i < 9; i++) {
        const len = 1.0 + Math.random() * 0.35;
        const geo = new THREE.PlaneGeometry(len, 0.42, 14, 1);
        geo.translate(len / 2, 0, 0);
        geo.rotateX(-Math.PI / 2);
        const pa = geo.attributes.position;
        for (let k = 0; k < pa.count; k++) {
          const x = pa.getX(k);
          pa.setY(k, 0.25 * (x / len) - Math.pow(x / len, 2) * 0.75);
        }
        geo.computeVertexNormals();
        const f = new THREE.Mesh(geo, leafMat);
        f.rotation.y = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
        f.userData.base = f.rotation.y;
        this.fronds.add(f);
      }
      palm.add(this.fronds);
      // cocos
      const coco = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.8 });
      for (let i = 0; i < 3; i++) {
        const cc = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), coco);
        cc.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2.1) * 0.06, -0.06, Math.sin(i * 2.1) * 0.06));
        palm.add(cc);
      }
      return palm;
    },

    leafTexture() {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const x = cv.getContext('2d');
      x.clearRect(0, 0, 512, 128);
      for (let i = 0; i < 60; i++) {
        const px = 10 + i * 8.2;
        const L = 58 * Math.sin(Math.min(1, (px / 512) * 1.15) * Math.PI) + 6;
        x.fillStyle = `hsl(${100 + Math.random() * 25}, 55%, ${28 + Math.random() * 14}%)`;
        for (const s of [-1, 1]) {
          x.beginPath(); x.moveTo(px, 64); x.lineTo(px + 14, 64 + s * L); x.lineTo(px + 8, 64); x.fill();
        }
      }
      x.strokeStyle = '#4a5a24'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 64); x.lineTo(512, 64); x.stroke();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    },

    cloudTexture() {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      const x = cv.getContext('2d');
      for (let i = 0; i < 22; i++) {
        const cx = 40 + Math.random() * 176, cy = 55 + Math.random() * 35, r = 18 + Math.random() * 30;
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.fill();
      }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    },

    makeBird() {
      const b = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a3f45, side: THREE.DoubleSide });
      const wing = new THREE.BufferGeometry();
      wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.06, 0, 0, 0.06, 0.4, 0.02, 0], 3));
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      b.add(l, r); b.userData.wings = [l, r];
      return b;
    },

    tick(time, dt) {
      const t = time / 1000;
      this.seaUniforms.uTime.value = t;
      this.el.sceneEl.camera.getWorldPosition(this.camPos);
      this.sea.worldToLocal(this.camPos);
      this.seaUniforms.uCam.value.copy(this.camPos);

      for (const c of this.clouds) {
        c.position.x += c.userData.speed * dt / 1000;
        if (c.position.x > 110) c.position.x = -110;
      }
      for (const b of this.birds) {
        const u = b.userData, a = t * u.sp + u.ph;
        b.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(a * 2) * 0.3, u.z + Math.sin(a) * u.r * 0.5);
        b.rotation.y = -a;
        const flap = Math.sin(t * 7 + u.ph) * 0.45;
        b.userData.wings[0].rotation.z = flap;
        b.userData.wings[1].rotation.z = -flap;
      }
      if (this.fronds) {
        this.fronds.children.forEach((f, i) => {
          f.rotation.y = f.userData.base + Math.sin(t * 1.1 + i) * 0.05;
          f.rotation.z = Math.sin(t * 1.4 + i * 0.7) * 0.04;
        });
      }
    }
  });

  // ---------- Sonido de olas (generado, sin archivos)
  let audio = null;
  function startAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {           // ruido marrón
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const swell = ctx.createGain(); swell.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.45;
    lfo.connect(lfoAmt).connect(swell.gain);
    const master = ctx.createGain(); master.gain.value = 0;
    src.connect(lp).connect(swell).connect(master).connect(ctx.destination);
    src.start(); lfo.start();
    audio = { ctx, master };
  }
  function fade(to) {
    if (!audio) return;
    const g = audio.master.gain, now = audio.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + 1.2);
  }

// ---------- Solo para prueba.html: la foto del póster como pared (se dibuja primero, sin profundidad)
AFRAME.registerComponent('pared-foto', {
  schema: { src: { default: 'marker.png' } },
  init() {
    const tex = new THREE.TextureLoader().load(this.data.src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1.3),
      new THREE.MeshBasicMaterial({ map: tex, depthWrite: false })
    );
    m.renderOrder = -2;
    this.el.setObject3D('mesh', m);
  }
});
