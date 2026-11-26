// Real-time 3D WebGL Genji Shimada Spirit Dragon renderer (zero external dependencies).
// Anatomically sculpted Overwatch-inspired Eastern Ryu head (carved stepped chevron snout,
// organic Ruyi cloud-nose with flared comma nostrils, sculpted flame-brow plates over deep
// recessed sockets & blazing almond spirit eyes, broad scooped dragon ears, majestic swept
// crown horns, 6-tier overlapping lion-like cheek-mane & collar ruff, flowing wisdom beard,
// poised hinged mandible with curved fangs & grooved glowing tongue, and calligraphic S-wave
// whiskers) fused onto a high-res serpentine body with carved jade scales, curved belly scutes,
// swept flame-blade dorsal crest, translucent subsurface-lit jade shader, and selective HDR bloom.
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Material IDs:
  // 0.0 = sculpted chartreuse-jade head, ears & jaw armor
  // 1.0 = serpentine body (overlapping diamond scales + ribbed ventral belly scutes)
  // 2.0 = curved fangs & teeth (ivory-lime backlit by inner mouth glow)
  // 3.0 = blazing incandescent core (scowling eyes + deep inner throat + tongue)
  // 4.0 = cheek-mane blades, horns, continuous dorsal crest & snout whiskers
  // 5.0 = ethereal spirit-flame wisps streaming from mane & coils
  const MAT_HEAD = 0.0;
  const MAT_BODY = 1.0;
  const MAT_TOOTH = 2.0;
  const MAT_FURNACE = 3.0;
  const MAT_CREST = 4.0;
  const MAT_SPIRIT = 5.0;

  function mat4Perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy * 0.5);
    const nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  function mat4LookAt(out, eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  function mat4Mul(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[c * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[c * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[c * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  }

  // -------------------- Indexed Mesh Builder --------------------
  function createMeshBuilder() {
    const pos = [];
    const uv = [];
    const mat = [];
    const cav = [];
    const idx = [];

    function addVert(x, y, z, u, v, m, c = 0.5) {
      const i = pos.length / 3;
      pos.push(x, y, z);
      uv.push(u, v);
      mat.push(m);
      cav.push(c);
      return i;
    }

    function addTri(a, b, c) {
      idx.push(a, b, c);
    }

    function addQuad(a, b, c, d) {
      idx.push(a, b, c, a, c, d);
    }

    function loftRings(rings, closed) {
      const R = rings.length;
      if (R < 2) return;
      const S = rings[0].length;
      for (let r = 0; r < R - 1; r++) {
        const r0 = rings[r], r1 = rings[r + 1];
        const limit = closed ? S : S - 1;
        for (let s = 0; s < limit; s++) {
          const sn = (s + 1) % S;
          addQuad(r0[s], r1[s], r1[sn], r0[sn]);
        }
      }
    }

    // Loft sculpted horn / blade / ear / fang along a 3D centerline with optional concave scoop
    function addSculptedSpike(opts) {
      const {
        rings = 10, segs = 12, matId = MAT_HEAD,
        sample,
        mirrorX = false,
      } = opts;
      const sides = mirrorX ? [1, -1] : [1];
      for (const sx of sides) {
        const ringIndices = [];
        for (let r = 0; r < rings; r++) {
          const t = r / (rings - 1);
          const st = sample(t);
          const tNext = Math.min(1, t + 0.04);
          const tPrev = Math.max(0, t - 0.04);
          const pN = sample(tNext), pP = sample(tPrev);
          let tx = (pN.x - pP.x) * sx, ty = pN.y - pP.y, tz = pN.z - pP.z;
          const tl = Math.hypot(tx, ty, tz) || 1;
          tx /= tl; ty /= tl; tz /= tl;

          let upX = 0, upY = 1, upZ = 0;
          if (Math.abs(ty) > 0.92) { upX = 0; upY = 0; upZ = 1; }
          let nx = upY * tz - upZ * ty;
          let ny = upZ * tx - upX * tz;
          let nz = upX * ty - upY * tx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const bx = ty * nz - tz * ny;
          const by = tz * nx - tx * nz;
          const bz = tx * ny - ty * nx;

          const rot = (st.rotZ || 0) * sx;
          const cr = Math.cos(rot), sr = Math.sin(rot);
          const taperPow = st.taperPow || 1.85;
          const taper = 1 - Math.pow(t, taperPow) * 0.97;
          const rx = Math.max(0.002, st.rx * taper);
          const ry = Math.max(0.002, st.ry * taper);
          const baseCav = st.cav !== undefined ? st.cav : lerp(0.32, 0.92, t);
          const scoop = st.scoop || 0; // creates hollowed inner ear cup when > 0!

          const row = [];
          for (let s = 0; s < segs; s++) {
            const a = (s / segs) * TAU;
            const ca = Math.cos(a), sa = Math.sin(a);
            const sharp = st.sharp !== undefined ? st.sharp : 0.25;
            let px0 = Math.sign(ca) * Math.pow(Math.abs(ca), 1 - sharp) * rx;
            let py0 = Math.sign(sa) * Math.pow(Math.abs(sa), 1 - sharp) * ry;
            let vCav = baseCav;

            // Optional concave front/inner ear scoop
            if (scoop > 0 && sa > 0.15) {
              const cup = Math.sin(sa) * Math.sin(t * Math.PI) * (1 - Math.abs(ca) * 0.65);
              py0 -= cup * ry * scoop * 1.45;
              vCav -= cup * 0.42;
            }

            const lx = px0 * cr - py0 * sr;
            const ly = px0 * sr + py0 * cr;
            const vx = st.x * sx + nx * lx + bx * ly;
            const vy = st.y + ny * lx + by * ly;
            const vz = st.z + nz * lx + bz * ly;
            row.push(addVert(vx, vy, vz, t, s / segs, matId, clamp(vCav, 0.06, 1.0)));
          }
          ringIndices.push(row);
        }
        if (sx < 0) {
          for (const row of ringIndices) row.reverse();
        }
        loftRings(ringIndices, true);
      }
    }

    function buildFloat32() {
      const vCount = pos.length / 3;
      const nrm = new Float32Array(pos.length);
      for (let i = 0; i < idx.length; i += 3) {
        const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3;
        const abx = pos[ib] - pos[ia], aby = pos[ib + 1] - pos[ia + 1], abz = pos[ib + 2] - pos[ia + 2];
        const acx = pos[ic] - pos[ia], acy = pos[ic + 1] - pos[ia + 1], acz = pos[ic + 2] - pos[ia + 2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        nrm[ia] += nx; nrm[ia + 1] += ny; nrm[ia + 2] += nz;
        nrm[ib] += nx; nrm[ib + 1] += ny; nrm[ib + 2] += nz;
        nrm[ic] += nx; nrm[ic + 1] += ny; nrm[ic + 2] += nz;
      }
      const stride = 10;
      const interleaved = new Float32Array(vCount * stride);
      for (let v = 0; v < vCount; v++) {
        const p3 = v * 3, p2 = v * 2, o = v * stride;
        let nx = nrm[p3], ny = nrm[p3 + 1], nz = nrm[p3 + 2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        interleaved[o] = pos[p3];
        interleaved[o + 1] = pos[p3 + 1];
        interleaved[o + 2] = pos[p3 + 2];
        interleaved[o + 3] = nx / nl;
        interleaved[o + 4] = ny / nl;
        interleaved[o + 5] = nz / nl;
        interleaved[o + 6] = uv[p2];
        interleaved[o + 7] = uv[p2 + 1];
        interleaved[o + 8] = mat[v];
        interleaved[o + 9] = cav[v];
      }
      return {
        verts: interleaved,
        indices: new Uint16Array(idx),
        indexCount: idx.length,
      };
    }

    return { addVert, addTri, addQuad, loftRings, addSculptedSpike, buildFloat32 };
  }

  // -------------------- Sculpt Authentic Genji Shimada Ryu Head --------------------
  function buildDragonHeadMeshes() {
    const upper = createMeshBuilder();

    // High-density sculpted cranium & noble Eastern Ryu muzzle with sleek tapered bridge & Ruyi nose
    const Z_RINGS = 56;
    const RAD_SEGS = 44;
    const skullRings = [];

    for (let r = 0; r < Z_RINGS; r++) {
      const u = r / (Z_RINGS - 1);
      // Cosine-clustered spacing near snout tip so the Ruyi nose & comma nostrils sculpt cleanly
      const uMapped = u < 0.76 ? (u / 0.76) * 0.84 : 0.84 + Math.sin(((u - 0.76) / 0.24) * (Math.PI * 0.5)) * 0.16;
      const z = lerp(-0.74, 1.48, uMapped);

      // Smooth rounded Ruyi nose dome closure (tucks cleanly without a sharp front pole pinch!)
      const domeT = clamp((z - 1.30) / 0.18, 0, 1);
      const snoutDome = Math.sqrt(Math.max(0.012, 1 - domeT * domeT));

      // Authentic Ref 1/2/3 proportions: WIDE commanding cranium & cheekbones -> SLEEK tapered muzzle -> compact Ruyi nose!
      const backNeckTaper = lerp(0.82, 1.0, smoothstep(-0.74, -0.32, z));
      const muzzleTaper = lerp(1.0, 0.60, smoothstep(0.18, 1.04, z));
      const cheekFlare = Math.exp(-Math.pow((z - 0.04) / 0.34, 2)) * 0.22;
      const muzzleWaist = -Math.exp(-Math.pow((z - 0.78) / 0.26, 2)) * 0.055;
      const nosePad = Math.exp(-Math.pow((z - 1.22) / 0.17, 2)) * 0.072;
      const halfW = (0.42 * backNeckTaper * muzzleTaper + cheekFlare + muzzleWaist + nosePad) * snoutDome;

      // Authentic Ref 2 side profile: HIGH commanding crown & brow -> graceful descending bridge -> sleek slightly upturned Ruyi nose
      const crownSlope = lerp(0.38, 0.50, smoothstep(-0.74, -0.10, z));
      const bridgeDrop = lerp(0.0, -0.18, smoothstep(0.24, 0.86, z));
      const browPeak = Math.exp(-Math.pow((z - 0.14) / 0.26, 2)) * 0.16;
      const bridgeDip = -Math.exp(-Math.pow((z - 0.76) / 0.24, 2)) * 0.06;
      const upturnedNose = Math.exp(-Math.pow((z - 1.22) / 0.17, 2)) * 0.115;
      const rawTopY = crownSlope + bridgeDrop + browPeak + bridgeDip + upturnedNose;
      const noseCenterY = 0.21;
      const topY = lerp(noseCenterY, rawTopY, snoutDome);

      // Scalloped Oriental dragon upper lip line (Ref 2)
      const lipS =
        Math.sin((z + 0.14) * 4.5) * 0.026 -
        Math.exp(-Math.pow((z - 1.02) / 0.13, 2)) * 0.045 +
        smoothstep(1.18, 1.44, z) * 0.092;
      const rawBotY = z < -0.12 ? lerp(-0.26, 0.03, smoothstep(-0.74, -0.12, z)) : (0.025 + lipS);
      const botY = lerp(noseCenterY, rawBotY, snoutDome);

      const row = [];
      for (let s = 0; s < RAD_SEGS; s++) {
        const a = (s / RAD_SEGS) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const absCa = Math.abs(ca);
        const sideSign = ca >= 0 ? 1 : -1;

        const boxiness = smoothstep(-0.08, 0.44, z) * smoothstep(1.14, 0.82, z) * 0.18;
        const shapedX = Math.sign(ca) * Math.pow(absCa, 1 - boxiness);
        const shapedY = sa >= 0 ? Math.pow(sa, 1 - boxiness * 0.7) : sa;

        // Round the lower-front lip corners inward cleanly so the Ruyi nose pad has an organic cloud silhouette (Ref 3)
        const frontLipTaper = 1.0 - smoothstep(0.94, 1.44, z) * (1.0 - smoothstep(-0.1, 0.55, sa)) * 0.36;
        let x = shapedX * halfW * frontLipTaper;
        let y = sa >= 0 ? lerp(botY, topY, shapedY) : botY;
        let zOut = z;
        let cavity = 0.54;
        let mId = MAT_HEAD;

        if (sa >= 0) {
          // 1) NOBLE FURROWED GLABELLA & DEEP-SET ORBITAL ARCH (Ref 1, 2, 3, 4)
          const browRegion = Math.exp(-Math.pow((z - 0.18) / 0.22, 2));
          const centerScowl = browRegion * Math.exp(-Math.pow(absCa / 0.20, 2)) * smoothstep(0.50, 0.98, sa);
          y -= centerScowl * 0.145;
          cavity -= centerScowl * 0.54;

          const browCrest = Math.exp(-Math.pow((z - (0.30 - absCa * 0.24)) / 0.15, 2)) *
            Math.exp(-Math.pow((absCa - 0.64) / 0.23, 2)) * smoothstep(0.38, 0.86, sa);
          y += browCrest * 0.21;
          x += sideSign * browCrest * 0.14;
          cavity += browCrest * 0.34;

          // Deep dark-jade orbital socket recessed cleanly so the piercing eyes shine from both front & 3/4!
          const socketDist = Math.hypot((z - 0.26) / 0.18, (absCa - 0.74) / 0.24, (sa - 0.44) / 0.24);
          if (socketDist < 1.38) {
            const pit = Math.exp(-Math.pow(socketDist / 0.78, 2));
            x -= sideSign * pit * 0.19;
            y -= pit * 0.075;
            cavity -= pit * 0.72;
          }

          // 2) CARVED STEPPED CHEVRON NASAL BRIDGE PLATES (Ref 1, 3, 4!)
          if (z > 0.32 && z < 1.08 && sa > 0.52) {
            const bridgeMask = smoothstep(0.32, 0.44, z) * smoothstep(1.08, 0.94, z) * smoothstep(0.52, 0.84, sa);
            const chev = z + absCa * 0.13;
            const stepWave = Math.pow(0.5 + 0.5 * Math.cos((chev - 0.36) * 26.0), 1.6);
            const centerCrest = Math.exp(-Math.pow(absCa / 0.20, 2)) * 0.022;
            y += ((stepWave - 0.32) * 0.052 + centerCrest) * bridgeMask;
            cavity += (stepWave - 0.48) * 0.58 * bridgeMask;
          }

          // 3) ORGANIC RUYI CLOUD-SCROLL NOSE & DEEP FORWARD-FACING COMMA NOSTRILS (Ref 1, 3, 4!)
          const philtrum = Math.exp(-Math.pow((z - 1.38) / 0.13, 2)) * Math.exp(-Math.pow(absCa / 0.16, 2)) * smoothstep(0.05, 0.95, sa);
          y -= philtrum * 0.048;
          zOut -= philtrum * 0.052;
          cavity -= philtrum * 0.48;

          // Sculpted Ruyi scroll lobes curling neatly above each nostril
          const lobe = Math.exp(-Math.pow((z - 1.24) / 0.13, 2)) * Math.exp(-Math.pow((absCa - 0.56) / 0.24, 2)) * smoothstep(0.42, 0.92, sa);
          x += sideSign * lobe * 0.052;
          y += lobe * 0.048;
          cavity += lobe * 0.28;

          // Deep sculpted forward-facing comma nostrils right on the front Ruyi nose face (Ref 3 & Ref 4!)
          const nDz = (z - 1.36) / 0.12;
          const nDx = (absCa - 0.48) / 0.22;
          const nDy = (sa - 0.48) / 0.24;
          const nDist = Math.hypot(nDz, nDx, nDy);
          if (nDist < 1.48) {
            const wing = Math.exp(-Math.pow((nDist - 0.90) / 0.24, 2));
            const hole = Math.exp(-Math.pow(nDist / 0.64, 2));
            x += sideSign * (wing * 0.070 - hole * 0.068);
            y += wing * 0.052 - hole * 0.055;
            zOut += wing * 0.044 - hole * 0.16;
            cavity += wing * 0.36 - hole * 1.15;
          }

          // 4) Zygomatic cheek ridge + sculpted flared upper lip scroll + canine boss
          const zygoma = Math.exp(-Math.pow((z - 0.04) / 0.28, 2)) * Math.exp(-Math.pow((sa - 0.18) / 0.15, 2));
          x += sideSign * zygoma * 0.088;
          cavity += zygoma * 0.24;

          const canineBoss = Math.exp(-Math.pow((z - 1.03) / 0.12, 2)) * Math.exp(-Math.pow((sa - 0.14) / 0.16, 2));
          x += sideSign * canineBoss * 0.038;
          cavity += canineBoss * 0.20;

          const lipCurl = smoothstep(-0.06, 0.14, z) * smoothstep(1.42, 1.20, z) * Math.exp(-Math.pow(sa / 0.13, 2));
          x += sideSign * lipCurl * 0.038;
          cavity += lipCurl * 0.22;
        } else {
          if (z > -0.06) {
            const vault = Math.sin(-sa) * smoothstep(1.34, 0.96, z) * smoothstep(-0.06, 0.14, z);
            y = botY + vault * 0.15;
            x *= 1 - Math.sin(-sa) * 0.15;
            if (vault > 0.065 && z < 0.88 && absCa < 0.66) {
              mId = MAT_FURNACE;
              cavity = 1.0;
            } else {
              cavity = 0.22;
            }
          } else {
            y = lerp(botY, -0.28, Math.sin(-sa));
            cavity = 0.34;
          }
        }

        row.push(upper.addVert(x, y, zOut, u, s / RAD_SEGS, mId, clamp(cavity, 0.02, 1.0)));
      }
      skullRings.push(row);
    }
    upper.loftRings(skullRings, true);

    // Tuck nose tip center neatly inside the philtrum cleft so the front Ruyi nose rounds smoothly with zero pole pinch!
    const tipCenter = upper.addVert(0, 0.205, 1.445, 1, 0.25, MAT_HEAD, 0.36);
    const lastRing = skullRings[Z_RINGS - 1];
    for (let s = 0; s < RAD_SEGS; s++) {
      upper.addTri(lastRing[s], tipCenter, lastRing[(s + 1) % RAD_SEGS]);
    }

    // --- SCULPTED FLAME-BROW PLATES & LOWER EYELID RIMS (commanding wise gaze visible in front & 3/4 - Ref 1, 2, 3!) ---
    upper.addSculptedSpike({
      rings: 10, segs: 10, matId: MAT_HEAD, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.11, 0.66, Math.pow(t, 0.85)),
        y: lerp(0.47, 0.72, Math.pow(t, 0.88)) + Math.sin(t * Math.PI) * 0.045,
        z: lerp(0.48, -0.08, Math.pow(t, 1.04)),
        rx: 0.095 * (1 - 0.15 * t),
        ry: 0.056,
        taperPow: 1.55,
        rotZ: -0.34,
        sharp: 0.26,
        cav: lerp(0.42, 0.88, t),
      }),
    });
    // Secondary temple brow plume curling subtly upward (Ref 3)
    upper.addSculptedSpike({
      rings: 8, segs: 8, matId: MAT_HEAD, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.36, 0.69, t),
        y: lerp(0.58, 0.84, Math.pow(t, 0.88)),
        z: lerp(0.22, -0.22, t),
        rx: 0.068,
        ry: 0.038,
        taperPow: 1.5,
        rotZ: -0.44,
        sharp: 0.30,
        cav: lerp(0.42, 0.88, t),
      }),
    });
    // Sculpted lower eyelid cheek rim framing the piercing eye cleanly from below (Ref 3)
    upper.addSculptedSpike({
      rings: 8, segs: 8, matId: MAT_HEAD, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.25, 0.58, t),
        y: lerp(0.285, 0.365, Math.sin(t * Math.PI * 0.85)),
        z: lerp(0.48, 0.06, t),
        rx: 0.060 * Math.sin(Math.max(0.12, t) * Math.PI * 0.92),
        ry: 0.036 * Math.sin(Math.max(0.12, t) * Math.PI * 0.92),
        taperPow: 1.35,
        sharp: 0.16,
        cav: 0.56,
      }),
    });

    // --- PIERCING BLAZING ALMOND SPIRIT EYES (focused wise gaze locked forward & 3/4 - Ref 1, 2, 3!) ---
    upper.addSculptedSpike({
      rings: 10, segs: 12, matId: MAT_FURNACE, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.26, 0.54, t) + Math.sin(t * Math.PI) * 0.034,
        y: lerp(0.355, 0.480, t) + Math.sin(t * Math.PI) * 0.016,
        z: lerp(0.47, 0.13, t) + Math.sin(t * Math.PI) * 0.025,
        rx: 0.068 * Math.sin(Math.max(0.08, t) * Math.PI * 0.94),
        ry: 0.056 * Math.sin(Math.max(0.08, t) * Math.PI * 0.94),
        taperPow: 1.25,
        sharp: 0.24,
        cav: 1.0,
      }),
    });

    // --- DEEP INNER THROAT FURNACE (recessed deep in throat so mouth glows with rich depth instead of flat white!) ---
    upper.addSculptedSpike({
      rings: 8, segs: 14, matId: MAT_FURNACE, mirrorX: false,
      sample: (t) => ({
        x: 0,
        y: lerp(-0.08, 0.04, t),
        z: lerp(-0.14, 0.22, t),
        rx: lerp(0.26, 0.15, t),
        ry: lerp(0.19, 0.11, t),
        sharp: 0.0,
        cav: 1.0,
      }),
    });

    // --- 2 BROAD SCULPTED SCOOPED DRAGON EARS (Ref 1 & Ref 3 #1 iconic silhouette!) ---
    upper.addSculptedSpike({
      rings: 14, segs: 16, matId: MAT_HEAD, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.31, 0.70, Math.pow(t, 0.90)) + Math.sin(t * Math.PI) * 0.03,
        y: lerp(0.48, 1.28, Math.pow(t, 0.86)) - Math.pow(t, 2.4) * 0.05,
        z: lerp(-0.08, -0.68, Math.pow(t, 1.05)),
        rx: 0.245 * (1 - 0.14 * t) * (1 + Math.sin(t * Math.PI) * 0.24),
        ry: 0.092,
        taperPow: 1.48,
        rotZ: -0.42,
        sharp: 0.24,
        scoop: 0.82,
        cav: lerp(0.36, 0.84, t),
      }),
    });

    // --- 2 MAJESTIC S-CURVED SWEPT-BACK CROWN HORNS + NOBLE SPUR (graceful curve, Ref 2!) ---
    upper.addSculptedSpike({
      rings: 16, segs: 12, matId: MAT_CREST, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.20, 0.46, Math.pow(t, 0.82)) + Math.sin(t * Math.PI * 1.1) * 0.06,
        y: lerp(0.55, 1.16, Math.pow(t, 0.72)) - Math.pow(t, 2.2) * 0.16 + Math.pow(Math.max(0, t - 0.65) / 0.35, 2.0) * 0.12,
        z: lerp(-0.16, -1.62, Math.pow(t, 1.04)),
        rx: 0.122,
        ry: 0.102,
        taperPow: 1.52,
        sharp: 0.24,
        cav: lerp(0.34, 0.86, t),
      }),
    });
    // Flowing secondary spur sweeping gracefully upward off the crown horn
    upper.addSculptedSpike({
      rings: 9, segs: 10, matId: MAT_CREST, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.34, 0.60, Math.pow(t, 0.88)),
        y: lerp(0.86, 1.28, Math.pow(t, 0.80)) - Math.pow(t, 2.2) * 0.06,
        z: lerp(-0.72, -1.16, t),
        rx: 0.064,
        ry: 0.054,
        taperPow: 1.55,
        sharp: 0.24,
        cav: lerp(0.40, 0.88, t),
      }),
    });

    // --- CENTRAL CROWN CREST (gracefully curved sculpted plates bridging occiput into dorsal spine!) ---
    const crownFins = [
      { by: 0.54, bz: 0.02, ty: 0.74, tz: -0.34, rx: 0.044, ry: 0.090 },
      { by: 0.50, bz: -0.24, ty: 0.78, tz: -0.74, rx: 0.052, ry: 0.110 },
      { by: 0.44, bz: -0.54, ty: 0.72, tz: -1.10, rx: 0.050, ry: 0.105 },
    ];
    for (const cf of crownFins) {
      upper.addSculptedSpike({
        rings: 8, segs: 8, matId: MAT_CREST, mirrorX: false,
        sample: (t) => ({
          x: 0,
          y: lerp(cf.by, cf.ty, Math.pow(t, 0.76)) - Math.pow(t, 2.2) * 0.05,
          z: lerp(cf.bz, cf.tz, Math.pow(t, 1.06)),
          rx: cf.rx,
          ry: cf.ry,
          taperPow: 1.5,
          sharp: 0.32,
          cav: lerp(0.32, 0.84, t),
        }),
      });
    }

    // --- 6 PAIRS OF CURVED FLOWING FLAME-MANE & COLLAR RUFF LOCKS (graceful calligraphic sweep - Ref 2 & Ref 1!) ---
    const cheekPlates = [
      // Upper temple flame-locks sweeping gracefully up-then-back behind ears
      { bx: 0.40, by: 0.48, bz: -0.10, tx: 0.80, ty: 0.86, tz: -1.24, arcY: 0.11, arcX: 0.08, rx: 0.165, ry: 0.060, rot: -0.40 },
      { bx: 0.48, by: 0.34, bz: -0.06, tx: 0.92, ty: 0.56, tz: -1.32, arcY: 0.09, arcX: 0.10, rx: 0.185, ry: 0.065, rot: -0.24 },
      // Heroic main zygomatic cheek-mane wave (widest noble lion-like dragon silhouette!)
      { bx: 0.52, by: 0.18, bz: -0.05, tx: 0.94, ty: 0.24, tz: -1.34, arcY: 0.06, arcX: 0.11, rx: 0.195, ry: 0.068, rot: -0.06 },
      { bx: 0.50, by: 0.03, bz: -0.08, tx: 0.86, ty: -0.05, tz: -1.22, arcY: 0.03, arcX: 0.09, rx: 0.175, ry: 0.060, rot: 0.12 },
      // Lower jaw-angle ruff & neck-collar mane wave
      { bx: 0.42, by: -0.11, bz: -0.14, tx: 0.72, ty: -0.28, tz: -1.04, arcY: -0.03, arcX: 0.07, rx: 0.155, ry: 0.054, rot: 0.28 },
      { bx: 0.28, by: -0.22, bz: -0.24, tx: 0.48, ty: -0.42, tz: -0.98, arcY: -0.05, arcX: 0.05, rx: 0.135, ry: 0.048, rot: 0.42 },
    ];
    for (const cp of cheekPlates) {
      upper.addSculptedSpike({
        rings: 12, segs: 10, matId: MAT_CREST, mirrorX: true,
        sample: (t) => ({
          // Flowing S-curve flame-lock: flares out smoothly, arches, then sweeps into a graceful recurved tip!
          x: lerp(cp.bx, cp.tx, Math.pow(t, 0.80)) + Math.sin(t * Math.PI) * cp.arcX - Math.pow(t, 2.5) * 0.06,
          y: lerp(cp.by, cp.ty, Math.pow(t, 0.84)) + Math.sin(t * Math.PI) * cp.arcY + Math.pow(Math.max(0, t - 0.6) / 0.4, 2) * 0.05,
          z: lerp(cp.bz, cp.tz, Math.pow(t, 1.05)),
          rx: cp.rx * (1 + Math.sin(t * Math.PI) * 0.18),
          ry: cp.ry * 0.84,
          taperPow: 1.48,
          rotZ: cp.rot,
          sharp: 0.42,
          cav: lerp(0.28, 0.86, t),
        }),
      });
    }

    // --- UPPER DENTITION: Seated neatly inside the sleeker scalloped upper lip (Ref 1, 2, 3) ---
    const upperTeeth = [
      { x: 0.055, y: 0.075, z: 1.32, dx: 0.0, dy: -0.11, dz: 0.01, r: 0.024 },
      { x: 0.135, y: 0.065, z: 1.28, dx: 0.01, dy: -0.125, dz: 0.00, r: 0.028 },
      { x: 0.245, y: 0.040, z: 1.04, dx: -0.015, dy: -0.255, dz: -0.055, r: 0.054 },
      { x: 0.255, y: 0.048, z: 0.84, dx: -0.01, dy: -0.150, dz: -0.025, r: 0.036 },
      { x: 0.280, y: 0.050, z: 0.66, dx: -0.01, dy: -0.130, dz: -0.025, r: 0.033 },
      { x: 0.320, y: 0.052, z: 0.48, dx: -0.01, dy: -0.110, dz: -0.02, r: 0.030 },
      { x: 0.365, y: 0.058, z: 0.31, dx: -0.01, dy: -0.095, dz: -0.02, r: 0.027 },
    ];
    for (const td of upperTeeth) {
      upper.addSculptedSpike({
        rings: 7, segs: 8, matId: MAT_TOOTH, mirrorX: true,
        sample: (t) => ({
          x: td.x + td.dx * t * t,
          y: td.y + td.dy * t,
          z: td.z + td.dz * t * t,
          rx: td.r,
          ry: td.r * 0.88,
          taperPow: 1.7,
          sharp: 0.16,
          cav: lerp(0.44, 0.96, t),
        }),
      });
    }

    // === 2. ARTICULATED NOBLE LOWER JAW (SLEEK MANDIBLE + FLOWING CURVED BEARD + GROOVED TONGUE + TUSKS) ===
    const lower = createMeshBuilder();
    const J_RINGS = 28;
    const J_SEGS = 28;
    const jawRings = [];

    for (let r = 0; r < J_RINGS; r++) {
      const u = r / (J_RINGS - 1);
      const z = lerp(-0.10, 1.16, u);
      const chinRound = smoothstep(1.16, 1.02, z);
      const halfW = lerp(0.42, 0.225, Math.pow(u, 0.74)) * Math.max(0.36, Math.pow(chinRound, 0.68));
      const chinHook = Math.exp(-Math.pow((z - 1.11) / 0.11, 2)) * 0.082;
      const topGumY = 0.02 + chinHook;
      const botChinY = -0.195 + u * 0.030 + chinHook * 0.55 - Math.exp(-Math.pow((z - 0.96) / 0.16, 2)) * 0.044;

      const row = [];
      for (let s = 0; s < J_SEGS; s++) {
        const a = (s / J_SEGS) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const absCa = Math.abs(ca);
        let x = Math.sign(ca) * Math.pow(absCa, 0.82) * halfW;
        let y = sa >= 0 ? topGumY : lerp(topGumY, botChinY, Math.pow(-sa, 0.80));
        let mId = MAT_HEAD;
        let cavity = 0.50;

        if (sa >= 0) {
          const trough = Math.sin(sa) * smoothstep(1.02, 0.78, z) * smoothstep(-0.06, 0.12, z);
          y = topGumY - trough * 0.105;
          if (trough > 0.045 && absCa < 0.58 && z < 0.84) {
            mId = MAT_FURNACE;
            cavity = 1.0;
          } else {
            cavity = 0.44;
          }
        } else {
          const jawBevel = Math.exp(-Math.pow((absCa - 0.72) / 0.20, 2)) * Math.sin(-sa);
          y -= jawBevel * 0.032;
          cavity += jawBevel * 0.24 - Math.exp(-Math.pow(absCa / 0.22, 2)) * 0.18;
        }
        row.push(lower.addVert(x, y, z, u, s / J_SEGS, mId, clamp(cavity, 0.12, 1.0)));
      }
      jawRings.push(row);
    }
    lower.loftRings(jawRings, true);
    const jawTip = lower.addVert(0, 0.025, 1.18, 1, 0.25, MAT_HEAD, 0.58);
    const lastJawRing = jawRings[J_RINGS - 1];
    for (let s = 0; s < J_SEGS; s++) {
      lower.addTri(lastJawRing[s], jawTip, lastJawRing[(s + 1) % J_SEGS]);
    }

    // Flowing curved Eastern dragon wisdom beard (sweeps smoothly along chin & curls gracefully back!)
    lower.addSculptedSpike({
      rings: 12, segs: 8, matId: MAT_CREST, mirrorX: false,
      sample: (t) => ({
        x: 0,
        y: lerp(-0.17, -0.34, Math.pow(t, 0.75)) - Math.sin(t * Math.PI) * 0.06 + Math.pow(t, 2.4) * 0.06,
        z: lerp(1.00, 0.26, Math.pow(t, 0.96)),
        rx: 0.082, ry: 0.048, taperPow: 1.55, sharp: 0.30, cav: lerp(0.32, 0.84, t),
      }),
    });
    lower.addSculptedSpike({
      rings: 10, segs: 8, matId: MAT_CREST, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.13, 0.25, Math.pow(t, 0.85)),
        y: lerp(-0.15, -0.29, Math.pow(t, 0.80)) - Math.sin(t * Math.PI) * 0.04,
        z: lerp(0.90, 0.28, t),
        rx: 0.060, ry: 0.038, taperPow: 1.55, rotZ: 0.22, sharp: 0.30, cav: lerp(0.32, 0.84, t),
      }),
    });
    lower.addSculptedSpike({
      rings: 9, segs: 8, matId: MAT_CREST, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.24, 0.42, Math.pow(t, 0.85)),
        y: lerp(-0.12, -0.22, t) - Math.sin(t * Math.PI) * 0.03,
        z: lerp(0.58, 0.02, t),
        rx: 0.066, ry: 0.038, taperPow: 1.5, rotZ: 0.30, sharp: 0.30, cav: lerp(0.30, 0.82, t),
      }),
    });

    // Curled glowing dragon tongue (sculpted translucent jade-lime tongue that reads cleanly against the bright throat - Ref 2 & 3!)
    lower.addSculptedSpike({
      rings: 14, segs: 12, matId: MAT_HEAD, mirrorX: false,
      sample: (t) => ({
        x: 0,
        y: 0.01 + Math.sin(t * Math.PI * 0.92) * 0.095 + Math.pow(t, 3) * 0.065,
        z: lerp(0.10, 0.94, t),
        rx: lerp(0.145, 0.022, Math.pow(t, 0.85)),
        ry: lerp(0.044, 0.014, t),
        sharp: 0.14,
        cav: lerp(0.88, 0.64, t),
      }),
    });

    // Lower Dentition: Seated cleanly inside the sleeker mandible
    const lowerTeeth = [
      { x: 0.048, y: 0.050, z: 1.09, dx: 0.0, dy: 0.092, dz: 0.01, r: 0.021 },
      { x: 0.115, y: 0.040, z: 1.07, dx: 0.0, dy: 0.110, dz: 0.01, r: 0.025 },
      { x: 0.195, y: 0.022, z: 0.96, dx: 0.012, dy: 0.225, dz: -0.025, r: 0.048 },
      { x: 0.220, y: 0.012, z: 0.76, dx: 0.0, dy: 0.130, dz: -0.02, r: 0.032 },
      { x: 0.255, y: 0.012, z: 0.56, dx: 0.0, dy: 0.112, dz: -0.02, r: 0.029 },
      { x: 0.295, y: 0.012, z: 0.38, dx: 0.0, dy: 0.088, dz: -0.01, r: 0.026 },
    ];
    for (const td of lowerTeeth) {
      lower.addSculptedSpike({
        rings: 7, segs: 8, matId: MAT_TOOTH, mirrorX: true,
        sample: (t) => ({
          x: td.x + td.dx * t * t,
          y: td.y + td.dy * t,
          z: td.z + td.dz * t * t,
          rx: td.r,
          ry: td.r * 0.88,
          taperPow: 1.7,
          sharp: 0.16,
          cav: lerp(0.48, 0.98, t),
        }),
      });
    }

    return {
      upper: upper.buildFloat32(),
      lower: lower.buildFloat32(),
    };
  }

  // -------------------- GLSL Shaders: spirit dragon --------------------
  const DRAGON_VERT = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec2 aUv;
    attribute float aMat;
    attribute float aCavity;

    uniform mat4 uViewProj;
    uniform mat4 uModel;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vMat;
    varying float vCavity;

    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
      vUv = aUv;
      vMat = aMat;
      vCavity = aCavity;
      gl_Position = uViewProj * wp;
    }
  `;

  const DRAGON_FRAG = `
    #extension GL_OES_standard_derivatives : enable
    precision highp float;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vMat;
    varying float vCavity;

    uniform vec3 uCamPos;
    uniform vec3 uMouthPos;
    uniform float uTime;
    uniform float uAlpha;
    uniform float uPower;
    uniform float uClipSide;
    uniform float uHasDeriv;
    // The KPR logo as a mask (its PNG's alpha) and where it sits in this framebuffer, in pixels
    // from the bottom-left: x0, y0, x1, y1. Lets the front pass cut the dragon away wherever it
    // would cover a letter, so KPR always reads as in front of it.
    uniform sampler2D uLogoTex;
    uniform vec4 uLogoRect;
    uniform float uLogoOn;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise2(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 3; i++) {
        v += amp * noise2(p);
        p *= 2.07;
        amp *= 0.5;
      }
      return v;
    }

    // Authentic overlapping fish/dragon armor scales on flanks + curved ribbed ventral scutes underneath!
    vec3 bodyRelief(vec2 uv) {
      float bellyDist = abs(uv.y - 0.5) * 2.0;
      float bellyMask = 1.0 - smoothstep(0.24, 0.38, bellyDist);

      // 1) Ventral Belly Scutes (Ref 1 & Ref 3: smooth curved horizontal jade plates along throat/belly)
      float scuteU = uv.x * 58.0;
      float scuteFrac = fract(scuteU);
      float scuteGroove = smoothstep(0.0, 0.20, scuteFrac) * smoothstep(1.0, 0.84, scuteFrac);
      float scuteCurve = 0.76 + 0.24 * cos((uv.y - 0.5) * 13.0);
      float scuteH = scuteGroove * scuteCurve;
      float scuteDu = (0.5 - scuteFrac) * 1.15 * scuteGroove;

      // 2) Sculpted Overlapping Carved-Jade Shield Scales (Ref 2 — refined, smooth beveled lips)
      vec2 baseUv = vec2(uv.x * 32.0, uv.y * 10.0);
      float bestH = -1.0;
      float bestDu = 0.0;
      float bestDv = 0.0;
      for (int layer = 0; layer < 2; layer++) {
        vec2 o = layer == 0 ? vec2(0.0, 0.0) : vec2(0.5, 0.5);
        vec2 g = baseUv + o;
        vec2 f = fract(g) - 0.5;
        float edgeCurve = f.x + 0.88 * f.y * f.y - 0.25;
        float inside = 1.0 - smoothstep(-0.10, 0.08, edgeCurve);
        float ramp = clamp((f.x + 0.52) * 0.92, 0.0, 1.0);
        float crown = 1.0 - 0.45 * f.y * f.y;
        float h = inside * (0.24 + 0.76 * ramp * crown);
        if (h > bestH) {
          bestH = h;
          bestDu = inside * (0.48 - smoothstep(-0.09, 0.05, edgeCurve) * 1.9);
          bestDv = inside * (-f.y * 1.25);
        }
      }

      float h = mix(bestH, scuteH, bellyMask);
      float du = mix(bestDu, scuteDu, bellyMask);
      float dv = mix(bestDv, 0.0, bellyMask);
      return vec3(h, du, dv);
    }

    void main() {
      if (uClipSide < -0.5 && vWorldPos.z > 0.015) discard;
      if (uClipSide > 0.5 && vWorldPos.z < -0.015) discard;
      // Front pass: never draw over a KPR letter. The orbit already keeps clear of the emblem;
      // this is only for the final lunge across the screen. Exact letter shapes, no margin, so
      // it never leaves a dark outline round the letters.
      if (uLogoOn > 0.5) {
        vec2 lp = (gl_FragCoord.xy - uLogoRect.xy) / max(uLogoRect.zw - uLogoRect.xy, vec2(1.0));
        if (lp.x > 0.0 && lp.x < 1.0 && lp.y > 0.0 && lp.y < 1.0) {
          if (texture2D(uLogoTex, vec2(lp.x, 1.0 - lp.y)).a > 0.5) discard;
        }
      }

      // Smooth sculpted normals (no harsh low-poly triangle faceting!)
      vec3 N = normalize(vNormal);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCamPos - vWorldPos);

      // Translucent Spirit-Flame Mane & Coil Wisps (MAT_SPIRIT = 5.0)
      if (vMat > 4.5) {
        float flow = fbm(vec2(vUv.x * 4.5 - uTime * 2.3, vUv.y * 2.8));
        float edgeFade = pow(sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265), 1.35);
        float lenFade = smoothstep(0.0, 0.16, vUv.x) * pow(1.0 - clamp(vUv.x, 0.0, 1.0), 1.5);
        float wispA = edgeFade * lenFade * (0.26 + 0.68 * flow) * (0.58 + 0.38 * uPower) * uAlpha * vCavity;
        if (wispA < 0.008) discard;
        vec3 wispCol = mix(vec3(0.38, 0.84, 0.12), vec3(0.88, 1.00, 0.48), flow * 0.78 + uPower * 0.2);
        gl_FragColor = vec4(wispCol * wispA, clamp(wispA * 0.66, 0.0, 1.0));
        return;
      }

      // Blazing Incandescent Spirit Core: Eyes + Deep Inner Throat (MAT_FURNACE = 3.0)
      if (vMat > 2.5 && vMat < 3.5) {
        float flicker = 0.95 + 0.05 * sin(uTime * 15.0 + vWorldPos.x * 4.5);
        float core = clamp(0.24 + pow(abs(dot(N, V)), 0.85) * 0.76, 0.0, 1.0);
        // Luminous chartreuse-lime edge -> warm glowing cream-white core (never flat blown-out block!)
        vec3 hotCol = mix(vec3(0.76, 0.98, 0.22), vec3(1.0, 1.0, 0.88), core) * (1.28 * flicker + uPower * 0.22);
        float a = clamp(uAlpha, 0.0, 1.0);
        gl_FragColor = vec4(hotCol * a, a);
        return;
      }

      float cavity = vCavity;
      // Keep solid dragon geometry 100% opaque so zero internal triangle self-blending seams appear!
      float alpha = 1.0;

      // Apply sculpted carved-jade scales + ventral belly scutes on serpentine body
      if (vMat > 0.5 && vMat < 1.5) {
        vec3 rel = bodyRelief(vUv);
        vec3 T1 = normalize(cross(N, vec3(0.0, 1.0, 0.15)) + vec3(1e-4));
        vec3 T2 = normalize(cross(N, T1));
        N = normalize(N + T1 * rel.y * 0.34 + T2 * rel.z * 0.34);
        cavity = clamp(0.16 + rel.x * 0.80, 0.05, 1.0);
        alpha *= 1.0 - smoothstep(0.85, 1.0, vUv.x);
      }

      // Carved Translucent-Style Overwatch Jade Spirit Shader (Ref 1, 2, 3, 4):
      // Rich midtone jade + deep carved crevices + silky specular sheen + razor Fresnel rim!
      vec3 Lkey = normalize(vec3(0.38, 0.78, 0.48));
      vec3 Lfill = normalize(vec3(-0.62, -0.35, 0.40));
      vec3 Hkey = normalize(Lkey + V);
      float ndl = dot(N, Lkey) * 0.5 + 0.5;
      float fill = max(0.0, dot(N, Lfill));
      float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
      float fresnel = pow(1.0 - ndv, 2.65);
      // Silky polished carved-jade specular highlight (Ref 1 & Ref 3 gloss!)
      float spec = pow(max(0.0, dot(N, Hkey)), 32.0) * (0.24 + 0.18 * cavity);

      // Localized subtle inner spirit warmth near the open mouth only (never washes out brows or nose!)
      float mouthDist = length(uMouthPos - vWorldPos);
      float sssMouth = exp(-mouthDist * 2.85) * (0.14 + 0.18 * (1.0 - ndv)) * smoothstep(0.18, 0.65, cavity);

      // Subtle drifting spirit chi along the scales
      float flowWave = fbm(vec2(vUv.x * 5.5 - uTime * 1.6, vUv.y * 3.2 + uTime * 0.18));
      float chiPulse = smoothstep(0.50, 0.92, flowWave) * (0.10 + 0.24 * uPower);

      // Calibrated directly to Ref 1-4 so EVERY brow ridge, nostril, ear scoop & mane blade reads sharply!
      vec3 colCrease = vec3(0.11, 0.26, 0.03);
      vec3 colShadow = vec3(0.28, 0.52, 0.07);
      vec3 colMid    = vec3(0.49, 0.76, 0.13);
      vec3 colBright = vec3(0.68, 0.89, 0.24);
      vec3 colRim    = vec3(0.92, 1.00, 0.54);

      float shade = clamp(ndl * 0.48 + fill * 0.12 + cavity * 0.56 - 0.19, 0.0, 1.0);
      // Deep carved dark-jade occlusion inside nostrils, eye sockets, brow furrows, ear hollows & scale seams
      shade *= smoothstep(0.0, 0.32, cavity) * 0.80 + 0.20 * smoothstep(0.02, 0.18, cavity);
      vec3 color = mix(colCrease, colShadow, smoothstep(0.02, 0.34, shade));
      color = mix(color, colMid, smoothstep(0.30, 0.66, shade));
      color = mix(color, colBright, smoothstep(0.64, 0.98, shade));
      color += vec3(0.92, 1.00, 0.62) * spec;
      color += colRim * (fresnel * (0.40 + 0.24 * cavity));
      color += vec3(0.86, 1.00, 0.36) * sssMouth;
      color += vec3(0.62, 0.92, 0.20) * chiPulse;

      // Cheek-mane locks, crown horns, curved dorsal fins, wisdom beard & whiskers (MAT_CREST = 4.0)
      // Keep the same rich carved jade family with a refined luminous edge toward tips (no neon yellow blowout!)
      if (vMat > 3.5 && vMat < 4.5) {
        float tip = clamp(vUv.x, 0.0, 1.0);
        color = mix(color, vec3(0.80, 0.97, 0.38), tip * 0.24);
      }

      // Fangs & Teeth (MAT_TOOTH = 2.0): crisp sculpted ivory-jade backlit by inner mouth glow
      if (vMat > 1.5 && vMat < 2.5) {
        float toothBacklight = exp(-mouthDist * 2.4) * 0.42;
        color = mix(vec3(0.56, 0.78, 0.18), vec3(0.96, 1.00, 0.74), clamp(vCavity * 0.70 + fresnel * 0.40, 0.0, 1.0));
        color += vec3(1.0, 1.0, 0.84) * toothBacklight;
      }

      color *= (1.0 + uPower * 0.14);

      float finalA = clamp(alpha * uAlpha, 0.0, 1.0);
      if (finalA < 0.01) discard;
      gl_FragColor = vec4(min(color, vec3(0.94)) * finalA, finalA);
    }
  `;

  const QUAD_VERT = `
    attribute vec2 aQuad;
    varying vec2 vUv;
    void main() {
      vUv = aQuad * 0.5 + 0.5;
      gl_Position = vec4(aQuad, 0.0, 1.0);
    }
  `;

  // Selective HDR Bloom: blooms the blazing eyes, roaring inner mouth, and crisp silhouette rims
  // into a soft green halo without washing out the sculpted crevices.
  const BRIGHT_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    void main() {
      vec4 c = texture2D(uTex, vUv);
      float lum = max(c.r, max(c.g, c.b));
      // Strong knee at > 0.82 catches MAT_FURNACE (eyes/mouth) + bright Fresnel rims; soft aura on body
      float hot = smoothstep(0.80, 0.99, lum);
      float aura = smoothstep(0.35, 0.85, lum) * 0.22;
      vec3 emeraldTint = vec3(0.34, 0.86, 0.14) * lum;
      vec3 hotTint = vec3(0.84, 1.0, 0.44);
      vec3 glow = mix(emeraldTint, hotTint, hot) * (aura + hot * 0.92);
      gl_FragColor = vec4(glow, 1.0);
    }
  `;

  const BLUR_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uDir;
    void main() {
      vec4 sum = texture2D(uTex, vUv) * 0.227027;
      sum += texture2D(uTex, vUv + uDir * 1.384615) * 0.316216;
      sum += texture2D(uTex, vUv - uDir * 1.384615) * 0.316216;
      sum += texture2D(uTex, vUv + uDir * 3.230769) * 0.070270;
      sum += texture2D(uTex, vUv - uDir * 3.230769) * 0.070270;
      gl_FragColor = sum;
    }
  `;

  const BLIT_FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uMode;
    void main() {
      vec4 c = texture2D(uTex, vUv);
      if (uMode < 0.5) {
        float a = clamp(c.a, 0.0, 1.0);
        gl_FragColor = vec4(min(c.rgb, vec3(a)), a);
      } else {
        vec3 b = c.rgb * 0.44;
        float a = clamp(max(b.r, max(b.g, b.b)), 0.0, 1.0);
        gl_FragColor = vec4(min(b, vec3(a)), a);
      }
    }
  `;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('Dragon3D shader error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function linkProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('Dragon3D link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function createFbo(gl, w, h, withDepth) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    let depthRb = null;
    if (withDepth) {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, depthRb, w, h };
  }

  function disposeFbo(gl, f) {
    if (!f) return;
    if (f.tex) gl.deleteTexture(f.tex);
    if (f.depthRb) gl.deleteRenderbuffer(f.depthRb);
    if (f.fbo) gl.deleteFramebuffer(f.fbo);
  }

  // -------------------- Main 3D spirit dragon instance --------------------
  window.createSpiritDragon3D = function createSpiritDragon3D() {
    const glCanvas = document.createElement('canvas');
    const gl = glCanvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    const hasDeriv = !!gl.getExtension('OES_standard_derivatives');
    const fragSrc = hasDeriv
      ? DRAGON_FRAG
      : DRAGON_FRAG.replace('#extension GL_OES_standard_derivatives : enable', '').replace('dFdx(vWorldPos)', 'vec3(0.0)').replace('dFdy(vWorldPos)', 'vec3(0.0)');

    const progDragon = linkProgram(gl, DRAGON_VERT, fragSrc);
    const progBright = linkProgram(gl, QUAD_VERT, BRIGHT_FRAG);
    const progBlur = linkProgram(gl, QUAD_VERT, BLUR_FRAG);
    const progBlit = linkProgram(gl, QUAD_VERT, BLIT_FRAG);
    if (!progDragon || !progBright || !progBlur || !progBlit) return null;

    const uDragon = {
      aPos: gl.getAttribLocation(progDragon, 'aPos'),
      aNormal: gl.getAttribLocation(progDragon, 'aNormal'),
      aUv: gl.getAttribLocation(progDragon, 'aUv'),
      aMat: gl.getAttribLocation(progDragon, 'aMat'),
      aCavity: gl.getAttribLocation(progDragon, 'aCavity'),
      uViewProj: gl.getUniformLocation(progDragon, 'uViewProj'),
      uModel: gl.getUniformLocation(progDragon, 'uModel'),
      uCamPos: gl.getUniformLocation(progDragon, 'uCamPos'),
      uMouthPos: gl.getUniformLocation(progDragon, 'uMouthPos'),
      uTime: gl.getUniformLocation(progDragon, 'uTime'),
      uAlpha: gl.getUniformLocation(progDragon, 'uAlpha'),
      uPower: gl.getUniformLocation(progDragon, 'uPower'),
      uClipSide: gl.getUniformLocation(progDragon, 'uClipSide'),
      uHasDeriv: gl.getUniformLocation(progDragon, 'uHasDeriv'),
      uLogoTex: gl.getUniformLocation(progDragon, 'uLogoTex'),
      uLogoRect: gl.getUniformLocation(progDragon, 'uLogoRect'),
      uLogoOn: gl.getUniformLocation(progDragon, 'uLogoOn'),
    };

    // The KPR logo image, used as the mask that keeps the dragon behind the letters.
    let logoTex = null;
    let logoRectPx = null; // { l, t, r, b } in CSS px, from script.js each frame
    const logoImg = new Image();
    logoImg.onload = () => {
      logoTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, logoTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, logoImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    };
    logoImg.src = 'kpr-logo.png';

    const headData = buildDragonHeadMeshes();
    function uploadStaticMesh(m) {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
      return { vbo, ibo, count: m.count || m.indexCount };
    }
    const upperGpu = uploadStaticMesh(headData.upper);
    const lowerGpu = uploadStaticMesh(headData.lower);

    const BODY_RINGS = 96;
    const BODY_SEGS = 28;
    const FIN_COUNT = 34; // bold, sculptural, clearly spaced swept dorsal blades (Ref 2!)
    const WHISK_RINGS = 26;
    const WHISK_SEGS = 8;
    const RIBBON_COUNT = 16;
    const RIBBON_RINGS = 20;

    const dynIndices = [];
    let vCursor = 0;

    // A) Body tube
    const bodyBaseV = vCursor;
    for (let r = 0; r < BODY_RINGS; r++) {
      for (let s = 0; s <= BODY_SEGS; s++) vCursor++;
    }
    const bodyRingStride = BODY_SEGS + 1;
    for (let r = 0; r < BODY_RINGS - 1; r++) {
      const r0 = bodyBaseV + r * bodyRingStride;
      const r1 = r0 + bodyRingStride;
      for (let s = 0; s < BODY_SEGS; s++) {
        dynIndices.push(r0 + s, r1 + s, r1 + s + 1, r0 + s, r1 + s + 1, r0 + s + 1);
      }
    }

    // B) Continuous curved swept flame-blade dorsal crest fins (7 verts per fin: 4 base + mid-lead + mid-trail + swept tip)
    const finBaseV = vCursor;
    for (let f = 0; f < FIN_COUNT; f++) {
      const b = vCursor;
      vCursor += 7;
      // Left side (-rx)
      dynIndices.push(b + 0, b + 4, b + 5);
      dynIndices.push(b + 0, b + 5, b + 1);
      dynIndices.push(b + 4, b + 6, b + 5);
      // Right side (+rx)
      dynIndices.push(b + 2, b + 5, b + 4);
      dynIndices.push(b + 2, b + 3, b + 5);
      dynIndices.push(b + 4, b + 5, b + 6);
      // Thin leading ridge cap
      dynIndices.push(b + 0, b + 2, b + 4);
    }

    // C) 2 Calligraphic Flowing Snout Whiskers
    const whiskBaseV = [0, 0];
    for (let w = 0; w < 2; w++) {
      whiskBaseV[w] = vCursor;
      for (let r = 0; r < WHISK_RINGS; r++) {
        for (let s = 0; s < WHISK_SEGS; s++) vCursor++;
      }
      for (let r = 0; r < WHISK_RINGS - 1; r++) {
        const r0 = whiskBaseV[w] + r * WHISK_SEGS;
        const r1 = r0 + WHISK_SEGS;
        for (let s = 0; s < WHISK_SEGS; s++) {
          const sn = (s + 1) % WHISK_SEGS;
          dynIndices.push(r0 + s, r1 + s, r1 + sn, r0 + s, r1 + sn, r0 + sn);
        }
      }
    }

    const solidIndexCount = dynIndices.length;

    // D) Spirit-smoke / flame ribbons
    const ribbonBaseV = vCursor;
    const spiritStartIdx = dynIndices.length;
    for (let rb = 0; rb < RIBBON_COUNT; rb++) {
      const base = vCursor;
      vCursor += RIBBON_RINGS * 2;
      for (let r = 0; r < RIBBON_RINGS - 1; r++) {
        const a0 = base + r * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
        dynIndices.push(a0, b0, b1, a0, b1, a1);
      }
    }
    const spiritIndexCount = dynIndices.length - spiritStartIdx;

    const STRIDE = 10;
    const dynVerts = new Float32Array(vCursor * STRIDE);
    const dynVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, dynVbo);
    gl.bufferData(gl.ARRAY_BUFFER, dynVerts.byteLength, gl.DYNAMIC_DRAW);

    const dynIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(dynIndices), gl.STATIC_DRAW);

    const quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    let W = 1, H = 1, dpr = 1, fboW = 1, fboH = 1, bloomW = 1, bloomH = 1;
    let sceneFbo = null, bloomA = null, bloomB = null;

    function resize(width, height, pixelRatio) {
      W = Math.max(1, width);
      H = Math.max(1, height);
      dpr = Math.min(pixelRatio || 1, 2);
      const nw = Math.max(2, Math.round(W * dpr));
      const nh = Math.max(2, Math.round(H * dpr));
      if (nw === fboW && nh === fboH && sceneFbo) return;
      fboW = nw; fboH = nh;
      bloomW = Math.max(2, Math.round(nw * 0.36));
      bloomH = Math.max(2, Math.round(nh * 0.36));
      glCanvas.width = nw;
      glCanvas.height = nh;
      disposeFbo(gl, sceneFbo);
      disposeFbo(gl, bloomA);
      disposeFbo(gl, bloomB);
      sceneFbo = createFbo(gl, fboW, fboH, true);
      bloomA = createFbo(gl, bloomW, bloomH, false);
      bloomB = createFbo(gl, bloomW, bloomH, false);
    }

    const camPos = new Float32Array([0, 0, 9.2]);
    const matProj = new Float32Array(16);
    const matView = new Float32Array(16);
    const matVP = new Float32Array(16);
    const matHead = new Float32Array(16);
    const matJaw = new Float32Array(16);
    const matIdentity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const mouthWorldPos = new Float32Array(3);

    const HALF_H_AT_Z0 = 9.2 * Math.tan((42 * Math.PI) / 360);
    const hist = [];
    let orbitAngle = 0.85; // where the head starts on the orbit; randomStart() picks a new one each load
    let speed = 0.88;
    let squeeze = 1.0;
    let alpha = 0.0;
    let power = 0.0;
    let liftPx = 0, fitScale = 1;
    let lunge = null;
    let debugOverride = null;

    function pxToWorldY(py) {
      return (0.5 - py / H) * 2 * HALF_H_AT_Z0;
    }
    function pxToWorldX(px) {
      const aspect = W / H;
      return (px / W - 0.5) * 2 * HALF_H_AT_Z0 * aspect;
    }

    // ---- Orbit: a tilted 3D ring weaving freely through and around the diamond ----
    // The head flies a true 3D tilted ring centered on the diamond, with zero solid barrier or
    // keep-out collision, so it glides smoothly behind (back canvas, behind diamond and KPR) and
    // in front of the diamond (mid canvas, in front of the diamond while KPR stays crisp on top).
    // Every lap or so the ring smoothly re-tilts and may execute a wide sweeping 3D U-turn off
    // the ring's plane; the body follows the trail the head actually flew with a gentle wave.
    const rand = (a, b) => a + Math.random() * (b - a);
    const ring = { cx: 0, cy: 0, r: 2.4, alpha: 0.34, tau: -0.18, alphaT: 0.34, tauT: -0.18, dir: 1, side: 1 };
    let ringPx = null;          // the diamond on screen: { cx, cy, half } in CSS px (script.js)
    const head = { p: null, h: null, w: null }; // position, heading, angular velocity
    const trail = [];           // head positions, newest first
    let lapProgress = 0, lapGoal = TAU * 1.1, lastTheta = null;
    let uturnLeft = 0;          // seconds left of the outward push at the start of a U-turn
    const tmpP = { x: 0, y: 0, z: 0 };

    // Every load starts the dragon somewhere new: a random point on the orbit, flying either
    // way round, with the ring tilted and rolled at random, so no two intros open the same.
    function randomStart() {
      orbitAngle = rand(0, TAU);
      ring.dir = Math.random() < 0.5 ? -1 : 1;
      ring.alpha = ring.alphaT = (Math.random() < 0.5 ? -1 : 1) * rand(0.22, 0.46);
      ring.tau = ring.tauT = rand(-0.3, 0.3);
      lapGoal = TAU * rand(0.75, 1.25);
    }
    randomStart();

    // Centre and radius from the diamond: slightly wider than its tips so the sides sweep
    // gracefully outside while the near and far passes weave freely through the diamond.
    function updateRingFrame() {
      const aspect = W / H;
      const worldPerPx = (2 * HALF_H_AT_Z0) / H;
      let cx = 0, cy = (liftPx / H) * 2 * HALF_H_AT_Z0, half = Math.min(W, H) * 0.32;
      if (ringPx && ringPx.half > 4) {
        cx = pxToWorldX(ringPx.cx);
        cy = pxToWorldY(ringPx.cy);
        half = ringPx.half;
      }
      ring.cx = cx;
      ring.cy = cy;
      ring.r = Math.min(HALF_H_AT_Z0 * aspect * 0.86, Math.max(1.0, half * worldPerPx * 1.18)) * squeeze;
    }
    // The ring starts in the XZ plane, tilts toward the viewer by alpha (so the near and far
    // halves sweep gracefully above/below and across the diamond), and rolls in the screen plane by tau.
    function ringPoint(theta, out) {
      const R = ring.r;
      const x0 = Math.cos(theta) * R, zr = Math.sin(theta) * R;
      const ca = Math.cos(ring.alpha), sa = Math.sin(ring.alpha);
      const y1 = -zr * sa, z1 = zr * ca;
      const ct = Math.cos(ring.tau), st = Math.sin(ring.tau);
      out.x = ring.cx + x0 * ct - y1 * st;
      out.y = ring.cy + x0 * st + y1 * ct;
      out.z = z1;
      return out;
    }
    function ringAngleOf(p) {
      const dx = p.x - ring.cx, dy = p.y - ring.cy;
      const ct = Math.cos(ring.tau), st = Math.sin(ring.tau);
      const x0 = dx * ct + dy * st;
      const y1 = -dx * st + dy * ct;
      const ca = Math.cos(ring.alpha), sa = Math.sin(ring.alpha);
      return Math.atan2(-y1 * sa + p.z * ca, x0);
    }
    function ringNormal() {
      const ca = Math.cos(ring.alpha), sa = Math.sin(ring.alpha);
      const ct = Math.cos(ring.tau), st = Math.sin(ring.tau);
      return { x: -st * ca, y: ct * ca, z: sa };
    }
    function bodyLength() { return TAU * ring.r * 0.62; }

    function placeOnRing(theta) {
      updateRingFrame();
      head.p = ringPoint(theta, { x: 0, y: 0, z: 0 });
      const ahead = ringPoint(theta + ring.dir * 0.01, { x: 0, y: 0, z: 0 });
      const hx = ahead.x - head.p.x, hy = ahead.y - head.p.y, hz = ahead.z - head.p.z;
      const hl = Math.hypot(hx, hy, hz) || 1;
      head.h = { x: hx / hl, y: hy / hl, z: hz / hl };
      // Start already curving round the ring (axis from how the tangent turns just ahead, rate =
      // the orbit's angular speed), so there's no settling wobble on the first frames.
      const a2 = ringPoint(theta + ring.dir * 0.02, { x: 0, y: 0, z: 0 });
      const a3 = ringPoint(theta + ring.dir * 0.03, { x: 0, y: 0, z: 0 });
      let tx = a3.x - a2.x, ty = a3.y - a2.y, tz = a3.z - a2.z;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let wx = head.h.y * tz - head.h.z * ty, wy = head.h.z * tx - head.h.x * tz, wz = head.h.x * ty - head.h.y * tx;
      const wl = Math.hypot(wx, wy, wz) || 1;
      head.w = { x: (wx / wl) * speed, y: (wy / wl) * speed, z: (wz / wl) * speed };
      // Lay the body out behind the head along the ring, so it is whole from the first frame.
      trail.length = 0;
      const len = bodyLength() * 1.15, steps = 160;
      for (let k = 0; k <= steps; k++) {
        trail.push(ringPoint(theta - ring.dir * (k / steps) * (len / ring.r), { x: 0, y: 0, z: 0 }));
      }
      lastTheta = theta;
      lapProgress = 0;
    }

    // A new lap: smoothly re-tilt the 3D ring and, about half the time, swing into a wide U-turn.
    function newLap() {
      ring.alphaT = (Math.random() < 0.5 ? -1 : 1) * rand(0.22, 0.52);
      ring.tauT = rand(-0.36, 0.36);
      if (Math.random() < 0.55) {
        ring.dir *= -1;
        // Bias the U-turn arc toward whichever vertical side has more room so it stays framed.
        ring.side = head.p && head.p.y < ring.cy - 0.25 ? 1 : (head.p && head.p.y > ring.cy + 0.25 ? -1 : (Math.random() < 0.5 ? -1 : 1));
        uturnLeft = 1.4;
      }
      lapProgress = 0;
      lapGoal = TAU * rand(0.75, 1.25);
    }

    // Steering with momentum. Rather than pivoting at a fixed rate (which read as a robot
    // rotating on the spot), the head carries an angular velocity that eases toward what the
    // turn needs, so every curve builds up and lets go gradually, like a dragon leaning into a
    // glide. Turns are never tighter than ~40% of the ring's radius, and the dragon slows a
    // little through its tightest curves, then picks back up coming out of them.
    // When the target is behind it (just reversed), the turn sweeps up-and-over off the ring's
    // plane so the U-turn is a wide fluid arc clear of its own body.
    function steer(dt, baseSpeed) {
      const p = head.p, h = head.h, w = head.w;
      const theta = ringAngleOf(p);
      // Far off the ring (e.g. coming out of a wide U-turn): aim back at the nearest ring point
      // instead of one ahead, so it always curves home rather than wandering off.
      const far = Math.hypot(p.x - ring.cx, p.y - ring.cy, p.z) > ring.r * 1.45;
      ringPoint(theta + (far ? 0 : ring.dir * 0.7), tmpP);
      let dx = tmpP.x - p.x, dy = tmpP.y - p.y, dz = tmpP.z - p.z;
      let dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      // The sweeping push is only for the start of a U-turn, never for finding the way back.
      if (uturnLeft > 0 && !far && h.x * dx + h.y * dy + h.z * dz < -0.2) {
        ringPoint(theta, tmpP);
        const ox = tmpP.x - ring.cx, oy = tmpP.y - ring.cy, oz = tmpP.z;
        const ol = Math.hypot(ox, oy, oz) || 1;
        const n = ringNormal();
        // Mostly up-and-over (off the ring's plane), a little outward: a sweeping arc that
        // stays nicely framed on screen.
        dx += (ox / ol) * 0.85 + n.x * 1.15 * ring.side;
        dy += (oy / ol) * 0.85 + n.y * 1.15 * ring.side;
        dz += (oz / ol) * 0.85 + n.z * 1.15 * ring.side;
        dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;
      }

      // Axis and angle from the current heading to the wanted one.
      let ax = h.y * dz - h.z * dy, ay = h.z * dx - h.x * dz, az = h.x * dy - h.y * dx;
      const sinA = Math.hypot(ax, ay, az);
      const ang = Math.atan2(sinA, clamp(h.x * dx + h.y * dy + h.z * dz, -1, 1));
      if (sinA > 1e-3) {
        ax /= sinA; ay /= sinA; az /= sinA;
      } else if (ang > 1.5) {
        // Target dead behind: the cross product vanishes, so turn about the ring's normal
        // (made perpendicular to the heading) rather than not turning at all.
        const n = ringNormal();
        const nd = n.x * h.x + n.y * h.y + n.z * h.z;
        ax = n.x - h.x * nd; ay = n.y - h.y * nd; az = n.z - h.z * nd;
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
      } else {
        ax = 0; ay = 0; az = 0;
      }

      const turnRadius = Math.max(0.75, ring.r * 0.4);
      const wNow = Math.hypot(w.x, w.y, w.z);
      const linSpeed = baseSpeed * (1 - 0.28 * clamp(wNow / (baseSpeed / turnRadius), 0, 1));
      const wDes = Math.min(ang * 1.8, linSpeed / turnRadius);
      const k = 1 - Math.exp(-dt * 2.6); // how quickly the turn builds up / relaxes
      w.x += (ax * wDes - w.x) * k;
      w.y += (ay * wDes - w.y) * k;
      w.z += (az * wDes - w.z) * k;

      // Rotate the heading about w by |w| * dt (Rodrigues).
      const wl = Math.hypot(w.x, w.y, w.z);
      if (wl > 1e-6) {
        const kx = w.x / wl, ky = w.y / wl, kz = w.z / wl;
        const th = wl * dt, c = Math.cos(th), s = Math.sin(th);
        const kd = kx * h.x + ky * h.y + kz * h.z;
        const cx = ky * h.z - kz * h.y, cy = kz * h.x - kx * h.z, cz = kx * h.y - ky * h.x;
        h.x = h.x * c + cx * s + kx * kd * (1 - c);
        h.y = h.y * c + cy * s + ky * kd * (1 - c);
        h.z = h.z * c + cz * s + kz * kd * (1 - c);
        const hl = Math.hypot(h.x, h.y, h.z) || 1;
        h.x /= hl; h.y /= hl; h.z /= hl;
      }
      p.x += h.x * linSpeed * dt;
      p.y += h.y * linSpeed * dt;
      p.z += h.z * linSpeed * dt;
      return theta;
    }

    // ---- Strike dashes: on the first two slashes the dragon flies the blade's own path ----
    // It whips from wherever it is on the orbit to the start of the cut (`leadMs`), then runs
    // the cut in step with the crescent being drawn (same ease-out, over `cutMs`), so its head
    // is the tip of the blade. The cut swells toward the viewer mid-stroke, staying on the near
    // side: in front of the diamond and, as always, behind the KPR letters. Afterwards it hooks
    // back toward the ring under its own steering. The cleave keeps its own scripted lunge.
    let dash = null;
    const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
    function screenToWorld(px, py, z) {
      const k = (9.2 - z) / 9.2; // lands exactly on (px, py) after perspective
      return { x: pxToWorldX(px) * k, y: pxToWorldY(py) * k, z };
    }
    function cutPoint(d, s) {
      const u = 1 - s;
      const px = u * u * d.p0.x + 2 * u * s * d.cp.x + s * s * d.p1.x;
      const py = u * u * d.p0.y + 2 * u * s * d.cp.y + s * s * d.p1.y;
      return screenToWorld(px, py, 0.35 + 0.9 * Math.sin(Math.PI * s));
    }
    function dashPoint(d, tMs) {
      if (tMs >= d.cutAt) {
        return cutPoint(d, easeOut3(clamp((tMs - d.cutAt) / d.cutMs, 0, 1)));
      }
      // Approach: a cubic from the head along its heading, into the cut along the cut's tangent.
      const u = clamp((tMs - d.start) / (d.cutAt - d.start), 0, 1), v = 1 - u;
      const A = d.a, B = d.b, C = d.c, D = d.s0;
      const k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
      return {
        x: A.x * k0 + B.x * k1 + C.x * k2 + D.x * k3,
        y: A.y * k0 + B.y * k1 + C.y * k2 + D.y * k3,
        z: A.z * k0 + B.z * k1 + C.z * k2 + D.z * k3,
      };
    }
    function triggerDash(nowMs, path, leadMs, cutMs) {
      if (!head.p || !head.h || lunge) return;
      const d = { p0: path.p0, cp: path.cp, p1: path.p1, start: nowMs, cutAt: nowMs + Math.max(1, leadMs), cutMs: Math.max(60, cutMs) };
      d.end = d.cutAt + d.cutMs;
      d.s0 = cutPoint(d, 0);
      const s1 = cutPoint(d, 0.03);
      let tx = s1.x - d.s0.x, ty = s1.y - d.s0.y, tz = s1.z - d.s0.z;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const a = { ...head.p };
      const L = Math.max(0.6, Math.hypot(d.s0.x - a.x, d.s0.y - a.y, d.s0.z - a.z) / 3);
      d.a = a;
      d.b = { x: a.x + head.h.x * L, y: a.y + head.h.y * L, z: a.z + head.h.z * L };
      d.c = { x: d.s0.x - tx * L, y: d.s0.y - ty * L, z: d.s0.z - tz * L };
      d.last = nowMs;
      dash = d;
      power = 1.0;
    }
    // Moves the head along the dash for this frame and lays the trail behind it in small steps,
    // so the body follows the curve smoothly even at this speed.
    function stepDash(nowMs) {
      const d = dash;
      const tEnd = Math.min(nowMs, d.end);
      const steps = Math.max(1, Math.ceil((tEnd - d.last) / 4));
      for (let i = 1; i <= steps; i++) {
        const p = dashPoint(d, d.last + ((tEnd - d.last) * i) / steps);
        trail.unshift(p);
      }
      d.last = tEnd;
      const p = trail[0], q = dashPoint(d, tEnd - 6);
      let hx = p.x - q.x, hy = p.y - q.y, hz = p.z - q.z;
      const hl = Math.hypot(hx, hy, hz);
      head.p = { x: p.x, y: p.y, z: p.z };
      if (hl > 1e-5) head.h = { x: hx / hl, y: hy / hl, z: hz / hl };
      power = 1.0;
      if (nowMs < d.end) return;
      // Release: follow through, already hooking back round toward the diamond.
      dash = null;
      const cx = ring.cx - head.p.x, cy = ring.cy - head.p.y, cz = -head.p.z;
      const h = head.h;
      let ax = h.y * cz - h.z * cy, ay = h.z * cx - h.x * cz, az = h.x * cy - h.y * cx;
      const al = Math.hypot(ax, ay, az) || 1;
      head.w = { x: (ax / al) * 6, y: (ay / al) * 6, z: (az / al) * 6 };
      lastTheta = ringAngleOf(head.p);
      lapProgress = 0;
    }

    function updateState(dt, nowMs, phase, phaseAtMs) {
      const tSec = nowMs * 0.001;
      if (debugOverride) {
        alpha = 1;
        return;
      }

      if (lunge) {
        const p = clamp((nowMs - lunge.start) / lunge.dur, 0, 1);
        power = 1.0;
        if (dt > 0 && nowMs > lunge.start + lunge.dur + 130) {
          alpha = Math.max(0, alpha - dt / 0.34);
        }
        const aspect = W / H;
        const spanX = HALF_H_AT_Z0 * aspect * 1.45;
        const spanY = HALF_H_AT_Z0 * 1.18;
        const headU = -0.32 + p * 1.62;
        hist.length = 0;
        for (let i = 0; i < BODY_RINGS; i++) {
          const u = headU - (i / (BODY_RINGS - 1)) * 1.12;
          const sWave = Math.sin(u * 5.2 - p * 4.0) * 0.32;
          const bx = lerp(spanX, -spanX, u) - sWave * 0.45;
          const by = lerp(spanY, -spanY, u) + sWave * 0.82;
          const bz = Math.sin(clamp(u, 0, 1) * Math.PI) * 2.35 - 0.3;
          hist.push({ x: bx, y: by, z: bz });
        }
        return;
      }

      if (dt > 0) {
        if (phase === 'charge') {
          const p = clamp((nowMs - phaseAtMs) / 820, 0, 1);
          speed = 0.88 + 3.2 * (p * p * p);
          squeeze = 1.0 - 0.22 * (1 - Math.pow(1 - p, 3));
          power = p;
        } else if (phase === 'strike') {
          power = Math.max(0.55, power);
        } else {
          speed = 0.88;
          squeeze += (1.0 - squeeze) * Math.min(1, dt * 4);
          power *= Math.max(0, 1 - dt * 3);
        }
        alpha = Math.min(1, alpha + dt / 0.75);
      }

      updateRingFrame();
      if (!head.p) placeOnRing(orbitAngle);
      if (dt > 0) {
        // Ease the ring toward its new tilt, so the change reads as the dragon banking.
        const k = Math.min(1, dt * 0.9);
        ring.alpha += (ring.alphaT - ring.alpha) * k;
        ring.tau += (ring.tauT - ring.tau) * k;

        uturnLeft = Math.max(0, uturnLeft - dt);
        if (dash) {
          stepDash(nowMs); // moves the head and lays its trail itself
        } else {
          const theta = steer(dt, speed * ring.r);
          let d = theta - lastTheta;
          d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
          lapProgress += d * ring.dir;
          lastTheta = theta;
          // No turning back once the strikes have started: it just speeds round.
          if (phase !== 'charge' && phase !== 'strike' && lapProgress > lapGoal) newLap();

          trail.unshift({ x: head.p.x, y: head.p.y, z: head.p.z });
        }
        const keep = bodyLength() * 1.2;
        let acc = 0;
        for (let i = 1; i < trail.length; i++) {
          acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y, trail[i].z - trail[i - 1].z);
          if (acc > keep) { trail.length = i + 1; break; }
        }
        if (trail.length > 3000) trail.length = 3000;
      }

      const spine = resampleSpine(trail, bodyLength(), BODY_RINGS);
      // A gentle swimming wave travels from the neck to the tail (side to side, with a little
      // rise and fall), so the body ripples like something alive instead of riding the head's
      // path like a train on a track. It fades in behind the neck so the head stays on course.
      const n = ringNormal();
      const amp = ring.r * 0.045;
      hist.length = 0;
      for (let i = 0; i < BODY_RINGS; i++) {
        const u = i / (BODY_RINGS - 1);
        const env = smoothstep(0.04, 0.22, u) * (1 - 0.35 * u);
        const sp = spine[i];
        if (env <= 0) { hist.push(sp); continue; }
        const a = spine[Math.max(0, i - 1)], b = spine[Math.min(BODY_RINGS - 1, i + 1)];
        let tx = a.x - b.x, ty = a.y - b.y, tz = a.z - b.z;
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        let sx = ty * n.z - tz * n.y, sy = tz * n.x - tx * n.z, sz = tx * n.y - ty * n.x;
        const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        const side = Math.sin(u * 13.0 - tSec * 3.4) * amp * env;
        const rise = Math.cos(u * 9.0 - tSec * 2.7) * amp * 0.45 * env;
        hist.push({ x: sp.x + sx * side + n.x * rise, y: sp.y + sy * side + n.y * rise, z: sp.z + sz * side + n.z * rise });
      }
    }

    function resampleSpine(pts, targetLen, count) {
      const out = [{ ...pts[0] }];
      const spacing = targetLen / (count - 1);
      let a = pts[0], acc = 0;
      for (let k = 1; k < pts.length && out.length < count; k++) {
        const b = pts[k];
        let seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        while (seg > 1e-5 && acc + seg >= spacing && out.length < count) {
          const t = (spacing - acc) / seg;
          const p = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
          };
          out.push(p);
          a = p;
          acc = 0;
          seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        }
        acc += seg;
        a = b;
      }
      while (out.length < count) {
        const last = out[out.length - 1];
        const prev = out[Math.max(0, out.length - 2)];
        const dx = last.x - prev.x, dy = last.y - prev.y, dz = last.z - prev.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        out.push({
          x: last.x + (dx / l) * spacing,
          y: last.y + (dy / l) * spacing,
          z: last.z + (dz / l) * spacing,
        });
      }
      return out;
    }

    function writeVert(vIdx, px, py, pz, nx, ny, nz, u, v, m, cav) {
      const o = vIdx * STRIDE;
      dynVerts[o] = px;
      dynVerts[o + 1] = py;
      dynVerts[o + 2] = pz;
      dynVerts[o + 3] = nx;
      dynVerts[o + 4] = ny;
      dynVerts[o + 5] = nz;
      dynVerts[o + 6] = u;
      dynVerts[o + 7] = v;
      dynVerts[o + 8] = m;
      dynVerts[o + 9] = cav;
    }

    const spineFrames = new Array(BODY_RINGS);
    const bank = { x: 0, y: 0, z: 0, t: 0 }; // the head's smoothed lean into turns
    function buildDynamicGeometry(nowMs) {
      const tSec = nowMs * 0.001;
      const headScale = debugOverride
        ? debugOverride.headScale
        : clamp(Math.min(W, H) / 860, 0.68, 1.15) * 0.74 * (0.72 + 0.28 * fitScale);
      const bodyLen = debugOverride ? debugOverride.bodyLen : 11.4 * (0.74 + 0.26 * fitScale);

      const spinePts = debugOverride
        ? debugOverride.spine(BODY_RINGS, tSec)
        : hist.slice(0, BODY_RINGS);

      for (let i = 0; i < BODY_RINGS; i++) {
        const pPrev = spinePts[Math.max(0, i - 1)];
        const pNext = spinePts[Math.min(BODY_RINGS - 1, i + 1)];
        let fx = pPrev.x - pNext.x, fy = pPrev.y - pNext.y, fz = pPrev.z - pNext.z;
        // Normalise the direction of travel FIRST. The gap between rings is only ~0.1-0.2 units,
        // so a bias added before normalising swamps it and the head ends up staring at the
        // camera whichever way the body is going. Here the head follows its path, with just a
        // light turn toward the viewer near the snout so the face still reads.
        let fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;
        if (!debugOverride && i < 4) {
          const gazeK = (1 - i / 4) * 0.16;
          fz += gazeK;
          fl = Math.hypot(fx, fy, fz) || 1;
          fx /= fl; fy /= fl; fz /= fl;
        }

        let ux, uy, uz;
        if (i === 0) {
          let worldUpX = debugOverride && debugOverride.up ? debugOverride.up[0] : -fx * 0.16;
          let worldUpY = debugOverride && debugOverride.up ? debugOverride.up[1] : 1.0;
          let worldUpZ = debugOverride && debugOverride.up ? debugOverride.up[2] : 0.12;
          // Bank into the turn: tip the head's up toward the inside of the curve, more in tighter
          // turns, eased over time so the roll flows in and out instead of snapping.
          if (!debugOverride && BODY_RINGS > 4) {
            const q0 = spinePts[0], q2 = spinePts[2], q4 = spinePts[4];
            let bx = q0.x + q4.x - 2 * q2.x, by = q0.y + q4.y - 2 * q2.y, bz = q0.z + q4.z - 2 * q2.z;
            const bd = bx * fx + by * fy + bz * fz;
            bx -= fx * bd; by -= fy * bd; bz -= fz * bd;
            const bl = Math.hypot(bx, by, bz);
            const seg = Math.hypot(q0.x - q2.x, q0.y - q2.y, q0.z - q2.z) || 1;
            const lean = clamp((bl / (seg * seg)) * 0.6, 0, 0.85); // curvature (1/radius) -> lean
            const tx = bl > 1e-6 ? (bx / bl) * lean : 0, ty = bl > 1e-6 ? (by / bl) * lean : 0, tz = bl > 1e-6 ? (bz / bl) * lean : 0;
            const dtB = clamp(tSec - (bank.t || tSec), 0, 0.1);
            const kb = bank.t ? 1 - Math.exp(-dtB * 3.0) : 1;
            bank.x += (tx - bank.x) * kb; bank.y += (ty - bank.y) * kb; bank.z += (tz - bank.z) * kb;
            bank.t = tSec;
            worldUpX += bank.x; worldUpY += bank.y; worldUpZ += bank.z;
          }
          const dotFU = fx * worldUpX + fy * worldUpY + fz * worldUpZ;
          ux = worldUpX - fx * dotFU;
          uy = worldUpY - fy * dotFU;
          uz = worldUpZ - fz * dotFU;
          const ul = Math.hypot(ux, uy, uz) || 1;
          ux /= ul; uy /= ul; uz /= ul;
        } else {
          const prev = spineFrames[i - 1];
          const dotPU = prev.ux * fx + prev.uy * fy + prev.uz * fz;
          ux = prev.ux - fx * dotPU;
          uy = prev.uy - fy * dotPU;
          uz = prev.uz - fz * dotPU;
          uy += 0.08 * (1 - Math.abs(fy));
          const dot2 = ux * fx + uy * fy + uz * fz;
          ux -= fx * dot2; uy -= fy * dot2; uz -= fz * dot2;
          const ul = Math.hypot(ux, uy, uz) || 1;
          ux /= ul; uy /= ul; uz /= ul;
        }

        const rx = uy * fz - uz * fy;
        const ry = uz * fx - ux * fz;
        const rz = ux * fy - uy * fx;

        spineFrames[i] = { p: spinePts[i], fx, fy, fz, ux, uy, uz, rx, ry, rz };
      }

      const f0 = spineFrames[0];
      // Seat the skull cleanly over the neck origin so the sweeping cheek-mane & collar ruff fuse seamlessly!
      const neckOffset = headScale * 0.24;
      const hx = f0.p.x + f0.fx * neckOffset;
      const hy = f0.p.y + f0.fy * neckOffset;
      const hz = f0.p.z + f0.fz * neckOffset;

      matHead[0] = f0.rx * headScale; matHead[1] = f0.ry * headScale; matHead[2] = f0.rz * headScale; matHead[3] = 0;
      matHead[4] = f0.ux * headScale; matHead[5] = f0.uy * headScale; matHead[6] = f0.uz * headScale; matHead[7] = 0;
      matHead[8] = f0.fx * headScale; matHead[9] = f0.fy * headScale; matHead[10] = f0.fz * headScale; matHead[11] = 0;
      matHead[12] = hx; matHead[13] = hy; matHead[14] = hz; matHead[15] = 1;

      // Calm, dignified poised jaw while peacefully gliding; roars wide open as it charges and strikes!
      const baseJaw = debugOverride && debugOverride.jawRad !== undefined
        ? debugOverride.jawRad
        : (0.44 + Math.sin(tSec * 2.4) * 0.045 + power * 0.34);
      const cj = Math.cos(baseJaw), sj = Math.sin(baseJaw);
      const localJaw = new Float32Array([
        1, 0, 0, 0,
        0, cj, sj, 0,
        0, -sj, cj, 0,
        0, -0.05, -0.06, 1,
      ]);
      mat4Mul(matJaw, matHead, localJaw);

      mouthWorldPos[0] = hx + (f0.ux * -0.03 + f0.fx * 0.44) * headScale;
      mouthWorldPos[1] = hy + (f0.uy * -0.03 + f0.fy * 0.44) * headScale;
      mouthWorldPos[2] = hz + (f0.uz * -0.03 + f0.fz * 0.44) * headScale;

      // --- A) Serpentine Body (smooth collar tuck -> muscular Eastern dragon neck & torso -> graceful whip tail) ---
      const neckRadius = headScale * 0.34;
      for (let r = 0; r < BODY_RINGS; r++) {
        const u = r / (BODY_RINGS - 1);
        const fr = spineFrames[r];
        const neckBlend = lerp(0.86, 1.0, smoothstep(0.0, 0.08, u));
        const taper = Math.pow(Math.max(0.025, 1 - u * 0.97), 0.74) * neckBlend;
        const radW = neckRadius * taper;
        const radH = neckRadius * taper * 1.06;

        for (let s = 0; s <= BODY_SEGS; s++) {
          const v = s / BODY_SEGS;
          const ang = v * TAU;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const bellyFlat = ca < 0 ? 1 - (-ca) * 0.14 : 1 + Math.pow(ca, 3) * 0.08;
          const lx = sa * radW;
          const ly = ca * radH * bellyFlat;

          const px = fr.p.x + fr.rx * lx + fr.ux * ly;
          const py = fr.p.y + fr.ry * lx + fr.uy * ly;
          const pz = fr.p.z + fr.rz * lx + fr.uz * ly;

          let nx = fr.rx * sa + fr.ux * ca;
          let ny = fr.ry * sa + fr.uy * ca;
          let nz = fr.rz * sa + fr.uz * ca;
          const nl = Math.hypot(nx, ny, nz) || 1;
          writeVert(bodyBaseV + r * bodyRingStride + s, px, py, pz, nx / nl, ny / nl, nz / nl, u, v, MAT_BODY, 0.54);
        }
      }

      // --- B) Bold Sculpted Curved Swept Dorsal Blade-Fins (Ref 2!) ---
      for (let f = 0; f < FIN_COUNT; f++) {
        const u = 0.055 + (f / (FIN_COUNT - 1)) * 0.86;
        const posRing = u * (BODY_RINGS - 1);
        const rIdx = Math.min(BODY_RINGS - 3, Math.max(2, Math.round(posRing)));
        const fr = spineFrames[rIdx];
        const frPrev = spineFrames[Math.max(0, rIdx - 2)];
        const frNext = spineFrames[Math.min(BODY_RINGS - 1, rIdx + 2)];

        const entryRamp = smoothstep(0.04, 0.12, u);
        const taper = (u < 0.16 ? 1.0 : Math.pow(Math.max(0.08, 1 - (u - 0.16) / 0.84), 0.74)) * (0.76 + 0.24 * entryRamp);
        const bodyR = neckRadius * taper * 0.92;
        const finH = headScale * 0.34 * taper * (0.94 + 0.10 * Math.sin(f * 1.2));
        const halfThick = neckRadius * taper * 0.13;

        const pFrontX = lerp(fr.p.x, frPrev.p.x, 0.65) + fr.ux * bodyR;
        const pFrontY = lerp(fr.p.y, frPrev.p.y, 0.65) + fr.uy * bodyR;
        const pFrontZ = lerp(fr.p.z, frPrev.p.z, 0.65) + fr.uz * bodyR;

        const pBackX = lerp(fr.p.x, frNext.p.x, 0.55) + fr.ux * bodyR;
        const pBackY = lerp(fr.p.y, frNext.p.y, 0.55) + fr.uy * bodyR;
        const pBackZ = lerp(fr.p.z, frNext.p.z, 0.55) + fr.uz * bodyR;

        const sway = Math.sin(tSec * 4.4 - f * 0.45) * halfThick * 0.4;
        const midLeadX = fr.p.x + fr.ux * (bodyR + finH * 0.56) - fr.fx * (finH * 0.18) + fr.rx * (sway * 0.4);
        const midLeadY = fr.p.y + fr.uy * (bodyR + finH * 0.56) - fr.fy * (finH * 0.18) + fr.ry * (sway * 0.4);
        const midLeadZ = fr.p.z + fr.uz * (bodyR + finH * 0.56) - fr.fz * (finH * 0.18) + fr.rz * (sway * 0.4);

        const midTrailX = fr.p.x + fr.ux * (bodyR + finH * 0.30) - fr.fx * (finH * 0.58) + fr.rx * (sway * 0.5);
        const midTrailY = fr.p.y + fr.uy * (bodyR + finH * 0.30) - fr.fy * (finH * 0.58) + fr.ry * (sway * 0.5);
        const midTrailZ = fr.p.z + fr.uz * (bodyR + finH * 0.30) - fr.fz * (finH * 0.58) + fr.rz * (sway * 0.5);

        const apexX = fr.p.x + fr.ux * (bodyR + finH) - fr.fx * (finH * 1.08) + fr.rx * sway;
        const apexY = fr.p.y + fr.uy * (bodyR + finH) - fr.fy * (finH * 1.08) + fr.ry * sway;
        const apexZ = fr.p.z + fr.uz * (bodyR + finH) - fr.fz * (finH * 1.08) + fr.rz * sway;

        const b = finBaseV + f * 7;
        writeVert(b + 0, pFrontX - fr.rx * halfThick, pFrontY - fr.ry * halfThick, pFrontZ - fr.rz * halfThick, -fr.rx, -fr.ry, -fr.rz, 0.06, 0, MAT_CREST, 0.30);
        writeVert(b + 1, pBackX - fr.rx * halfThick, pBackY - fr.ry * halfThick, pBackZ - fr.rz * halfThick, -fr.rx, -fr.ry, -fr.rz, 0.14, 1, MAT_CREST, 0.24);
        writeVert(b + 2, pFrontX + fr.rx * halfThick, pFrontY + fr.ry * halfThick, pFrontZ + fr.rz * halfThick, fr.rx, fr.ry, fr.rz, 0.06, 0, MAT_CREST, 0.30);
        writeVert(b + 3, pBackX + fr.rx * halfThick, pBackY + fr.ry * halfThick, pBackZ + fr.rz * halfThick, fr.rx, fr.ry, fr.rz, 0.14, 1, MAT_CREST, 0.24);
        writeVert(b + 4, midLeadX, midLeadY, midLeadZ, fr.ux * 0.8 + fr.fx * 0.6, fr.uy * 0.8 + fr.fy * 0.6, fr.uz * 0.8 + fr.fz * 0.6, 0.55, 0.3, MAT_CREST, 0.66);
        writeVert(b + 5, midTrailX, midTrailY, midTrailZ, fr.ux * 0.7 - fr.fx * 0.7, fr.uy * 0.7 - fr.fy * 0.7, fr.uz * 0.7 - fr.fz * 0.7, 0.48, 0.8, MAT_CREST, 0.44);
        writeVert(b + 6, apexX, apexY, apexZ, fr.ux, fr.uy, fr.uz, 1.0, 0.5, MAT_CREST, 0.88);
      }

      // --- C) 2 Iconic Long Calligraphic Ribbon Snout Whiskers (anchored cleanly at the sleek Ruyi nose pad - Ref 1, 3, 4!) ---
      for (let w = 0; w < 2; w++) {
        const sd = w === 0 ? 1 : -1;
        const wPts = [];
        for (let r = 0; r < WHISK_RINGS; r++) {
          const t = r / (WHISK_RINGS - 1);
          const wave1 = Math.sin(t * 4.2 - tSec * 3.6 + w * 0.75) * 0.14 * t;
          const wave2 = Math.cos(t * 3.0 - tSec * 2.9) * 0.11 * t;
          // Smooth C2-continuous calligraphic S-wave sweeping wide from the Ruyi nose and rising gracefully at the brush-tip!
          const lx = sd * (0.27 + Math.pow(t, 0.82) * 1.92);
          const ly = 0.19 - Math.sin(t * Math.PI * 1.15) * 0.14 + Math.pow(t, 2.35) * 0.52 + wave1;
          const lz = 1.14 - Math.pow(t, 1.18) * 1.16 + wave2;
          wPts.push({
            x: hx + (f0.rx * lx + f0.ux * ly + f0.fx * lz) * headScale,
            y: hy + (f0.ry * lx + f0.uy * ly + f0.fy * lz) * headScale,
            z: hz + (f0.rz * lx + f0.uz * ly + f0.fz * lz) * headScale,
          });
        }
        for (let r = 0; r < WHISK_RINGS; r++) {
          const t = r / (WHISK_RINGS - 1);
          const pA = wPts[Math.max(0, r - 1)], pB = wPts[Math.min(WHISK_RINGS - 1, r + 1)];
          let tx = pB.x - pA.x, ty = pB.y - pA.y, tz = pB.z - pA.z;
          const tl = Math.hypot(tx, ty, tz) || 1;
          tx /= tl; ty /= tl; tz /= tl;
          let nx = f0.uy * tz - f0.uz * ty;
          let ny = f0.uz * tx - f0.ux * tz;
          let nz = f0.ux * ty - f0.uy * tx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
          // Slightly ribbon-flattened oval cross-section for sleek calligraphic elegance
          const radW = headScale * lerp(0.058, 0.005, Math.pow(t, 0.78));
          const radH = radW * 0.68;
          for (let s = 0; s < WHISK_SEGS; s++) {
            const a = (s / WHISK_SEGS) * TAU;
            const ca = Math.cos(a), sa = Math.sin(a);
            const rnx = nx * ca + bx * sa, rny = ny * ca + by * sa, rnz = nz * ca + bz * sa;
            const px = wPts[r].x + (nx * ca * radW + bx * sa * radH);
            const py = wPts[r].y + (ny * ca * radW + by * sa * radH);
            const pz = wPts[r].z + (nz * ca * radW + bz * sa * radH);
            writeVert(
              whiskBaseV[w] + r * WHISK_SEGS + s,
              px, py, pz, rnx, rny, rnz,
              t, s / WHISK_SEGS, MAT_CREST, lerp(0.46, 0.97, t)
            );
          }
        }
      }

      // --- D) Ethereal Spirit-Flame Wisps streaming from the cheek-mane, crown & serpentine coils (Ref 4!) ---
      for (let rb = 0; rb < RIBBON_COUNT; rb++) {
        const mane = rb < 8;
        const side = rb % 2 === 0 ? 1 : -1;
        const baseV = ribbonBaseV + rb * RIBBON_RINGS * 2;
        const rate = mane ? 0.48 : 0.30;
        const life = ((tSec * rate + rb * 0.618) % 1 + 1) % 1;
        const env = Math.sin(life * Math.PI);
        const startRing = mane ? 1 + rb * 1.4 + life * 6 : 14 + ((rb - 8) / 8) * 58 + life * 18;
        const span = (mane ? 15 : 20) * (0.62 + 0.38 * env);
        const maxRibbonW = headScale * (mane ? 0.34 : 0.24) * (0.52 + 0.48 * env);

        for (let r = 0; r < RIBBON_RINGS; r++) {
          const t = r / (RIBBON_RINGS - 1);
          const spIdx = Math.max(0, Math.min(BODY_RINGS - 1, Math.round(startRing + t * span)));
          const fr = spineFrames[spIdx];
          const curl = Math.sin(tSec * 5.2 - t * 6.4 + rb * 2.3) * headScale * 0.28 * t;
          const liftOut = headScale * (0.28 + t * (0.52 + 0.42 * env)) + curl;
          const rise = headScale * (0.18 + t * 0.52 * env) + Math.cos(tSec * 3.9 - t * 4.8 + rb) * headScale * 0.14 * t;
          const cx = fr.p.x + fr.rx * side * liftOut + fr.ux * rise;
          const cy = fr.p.y + fr.ry * side * liftOut + fr.uy * rise;
          const cz = fr.p.z + fr.rz * side * liftOut + fr.uz * rise;
          const rw = maxRibbonW * Math.sin(Math.max(0.05, t) * Math.PI);

          writeVert(baseV + r * 2, cx - fr.ux * rw, cy - fr.uy * rw, cz - fr.uz * rw, fr.rx * side, fr.ry * side, fr.rz * side, t, 0, MAT_SPIRIT, env);
          writeVert(baseV + r * 2 + 1, cx + fr.ux * rw, cy + fr.uy * rw, cz + fr.uz * rw, fr.rx * side, fr.ry * side, fr.rz * side, t, 1, MAT_SPIRIT, env);
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, dynVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dynVerts);
    }

    function bindDragonVbo(vbo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const b = STRIDE * 4;
      gl.enableVertexAttribArray(uDragon.aPos);
      gl.vertexAttribPointer(uDragon.aPos, 3, gl.FLOAT, false, b, 0);
      gl.enableVertexAttribArray(uDragon.aNormal);
      gl.vertexAttribPointer(uDragon.aNormal, 3, gl.FLOAT, false, b, 12);
      gl.enableVertexAttribArray(uDragon.aUv);
      gl.vertexAttribPointer(uDragon.aUv, 2, gl.FLOAT, false, b, 24);
      gl.enableVertexAttribArray(uDragon.aMat);
      gl.vertexAttribPointer(uDragon.aMat, 1, gl.FLOAT, false, b, 32);
      gl.enableVertexAttribArray(uDragon.aCavity);
      gl.vertexAttribPointer(uDragon.aCavity, 1, gl.FLOAT, false, b, 36);
    }

    function drawQuad(prog, aLoc) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.enableVertexAttribArray(aLoc);
      gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(aLoc);
    }

    function renderPassToTarget(targetCtx, clipSide, nowMs, useLogoMask) {
      if (!targetCtx || !sceneFbo) return;

      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo.fbo);
      gl.viewport(0, 0, fboW, fboH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(progDragon);
      gl.uniformMatrix4fv(uDragon.uViewProj, false, matVP);
      gl.uniform3fv(uDragon.uCamPos, camPos);
      gl.uniform3fv(uDragon.uMouthPos, mouthWorldPos);
      gl.uniform1f(uDragon.uTime, nowMs * 0.001);
      gl.uniform1f(uDragon.uAlpha, alpha);
      gl.uniform1f(uDragon.uPower, power);
      gl.uniform1f(uDragon.uClipSide, clipSide);
      gl.uniform1f(uDragon.uHasDeriv, hasDeriv ? 1.0 : 0.0);
      // Fallback exact-letter logo mask only when no dedicated mid canvas sits under .intro-mark--logo.
      const maskOn = !!useLogoMask && clipSide > 0.5 && logoTex && logoRectPx;
      gl.uniform1f(uDragon.uLogoOn, maskOn ? 1.0 : 0.0);
      if (maskOn) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, logoTex);
        gl.uniform1i(uDragon.uLogoTex, 1);
        gl.activeTexture(gl.TEXTURE0);
        const sx = fboW / W, sy = fboH / H;
        gl.uniform4f(uDragon.uLogoRect,
          logoRectPx.l * sx, (H - logoRectPx.b) * sy,
          logoRectPx.r * sx, (H - logoRectPx.t) * sy);
      }

      gl.uniformMatrix4fv(uDragon.uModel, false, matIdentity);
      bindDragonVbo(dynVbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynIbo);
      gl.drawElements(gl.TRIANGLES, solidIndexCount, gl.UNSIGNED_SHORT, 0);

      gl.uniformMatrix4fv(uDragon.uModel, false, matHead);
      bindDragonVbo(upperGpu.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, upperGpu.ibo);
      gl.drawElements(gl.TRIANGLES, upperGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.uniformMatrix4fv(uDragon.uModel, false, matJaw);
      bindDragonVbo(lowerGpu.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lowerGpu.ibo);
      gl.drawElements(gl.TRIANGLES, lowerGpu.count, gl.UNSIGNED_SHORT, 0);

      gl.depthMask(false);
      gl.uniformMatrix4fv(uDragon.uModel, false, matIdentity);
      bindDragonVbo(dynVbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynIbo);
      gl.drawElements(gl.TRIANGLES, spiritIndexCount, gl.UNSIGNED_SHORT, spiritStartIdx * 2);

      gl.disableVertexAttribArray(uDragon.aPos);
      gl.disableVertexAttribArray(uDragon.aNormal);
      gl.disableVertexAttribArray(uDragon.aUv);
      gl.disableVertexAttribArray(uDragon.aMat);
      gl.disableVertexAttribArray(uDragon.aCavity);
      gl.depthMask(true);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);

      // Selective HDR Bloom
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.useProgram(progBright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFbo.tex);
      gl.uniform1i(gl.getUniformLocation(progBright, 'uTex'), 0);
      drawQuad(progBright, gl.getAttribLocation(progBright, 'aQuad'));

      gl.useProgram(progBlur);
      const uBlurTex = gl.getUniformLocation(progBlur, 'uTex');
      const uBlurDir = gl.getUniformLocation(progBlur, 'uDir');
      const aBlurQuad = gl.getAttribLocation(progBlur, 'aQuad');
      gl.uniform1i(uBlurTex, 0);

      for (let pass = 0; pass < 2; pass++) {
        const radius = pass === 0 ? 1.0 : 2.2;
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fbo);
        gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
        gl.uniform2f(uBlurDir, radius / bloomW, 0);
        drawQuad(progBlur, aBlurQuad);

        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
        gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
        gl.uniform2f(uBlurDir, 0, radius / bloomH);
        drawQuad(progBlur, aBlurQuad);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, fboW, fboH);
      gl.useProgram(progBlit);
      const uBlitTex = gl.getUniformLocation(progBlit, 'uTex');
      const uBlitMode = gl.getUniformLocation(progBlit, 'uMode');
      const aBlitQuad = gl.getAttribLocation(progBlit, 'aQuad');
      gl.uniform1i(uBlitTex, 0);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, sceneFbo.tex);
      gl.uniform1f(uBlitMode, 0.0);
      drawQuad(progBlit, aBlitQuad);

      const prevComp = targetCtx.globalCompositeOperation;
      targetCtx.globalCompositeOperation = 'source-over';
      targetCtx.drawImage(glCanvas, 0, 0, W, H);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1f(uBlitMode, 1.0);
      drawQuad(progBlit, aBlitQuad);

      targetCtx.globalCompositeOperation = 'lighter';
      targetCtx.drawImage(glCanvas, 0, 0, W, H);
      targetCtx.globalCompositeOperation = prevComp;
    }

    function render(frontCtx, backCtx, nowMs, midCtx) {
      if (alpha < 0.01 && !debugOverride) return;

      const aspect = W / H;
      mat4Perspective(matProj, (42 * Math.PI) / 180, aspect, 0.25, 40.0);
      if (debugOverride && debugOverride.eye) {
        camPos[0] = debugOverride.eye[0];
        camPos[1] = debugOverride.eye[1];
        camPos[2] = debugOverride.eye[2];
        mat4LookAt(matView, debugOverride.eye, debugOverride.target || [0, 0, 0], [0, 1, 0]);
      } else {
        camPos[0] = 0; camPos[1] = 0; camPos[2] = 9.2;
        mat4LookAt(matView, camPos, [0, 0, 0], [0, 1, 0]);
      }
      mat4Mul(matVP, matProj, matView);

      buildDynamicGeometry(nowMs);

      if (lunge || !backCtx || debugOverride) {
        renderPassToTarget(frontCtx, 0.0, nowMs, false);
      } else {
        // Far side (z <= 0) behind diamond and KPR; near side (z >= 0) on mid canvas in front of
        // diamond and strictly behind the KPR logo DOM layer.
        renderPassToTarget(backCtx, -1.0, nowMs, false);
        renderPassToTarget(midCtx || frontCtx, 1.0, nowMs, !midCtx);
      }
    }

    function triggerLunge(nowMs) {
      lunge = {
        start: nowMs,
        dur: 490,
      };
      power = 1.0;
    }

    function sampleTrailPointScreen() {
      if (hist.length < 4) return null;
      const p = hist[Math.floor(Math.random() * Math.min(hist.length, 65))];
      const zDist = Math.max(1.2, 9.2 - p.z);
      const scale = 9.2 / zDist;
      const aspect = W / H;
      const sx = (0.5 + (p.x * scale) / (2 * HALF_H_AT_Z0 * aspect)) * W;
      const sy = (0.5 - (p.y * scale) / (2 * HALF_H_AT_Z0)) * H;
      return { x: sx, y: sy };
    }

    return {
      resize,
      setLift(px, fit) {
        liftPx = px;
        fitScale = fit;
      },
      // The diamond round KPR on screen, in CSS px: centre and half its tip-to-tip width.
      setRing(cxPx, cyPx, halfPx) {
        if (halfPx > 4) ringPx = { cx: cxPx, cy: cyPx, half: halfPx };
      },
      // The KPR logo's box on screen in CSS px; the dragon is never drawn over its letters.
      setLogo(l, t, r, b) {
        if (r - l > 4 && b - t > 4) logoRectPx = { l, t, r, b };
      },
      // Read-only snapshot for checking the orbit in the browser console.
      debugState() {
        const pxPerWorld = H / (2 * HALF_H_AT_Z0);
        let minDistPx = Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of hist) {
          const k = 9.2 / Math.max(0.5, 9.2 - p.z);
          const sx = p.x * k - ring.cx, sy = p.y * k - ring.cy;
          minDistPx = Math.min(minDistPx, Math.hypot(sx, sy) * pxPerWorld - (ringPx ? ringPx.half : 0));
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        }
        return { dir: ring.dir, alpha: ring.alpha, tau: ring.tau, r: ring.r,
          clearPx: minDistPx, minZ, maxZ, lunge: !!lunge, head: head.p && { ...head.p },
          heading: head.h && { ...head.h }, turnRate: head.w ? Math.hypot(head.w.x, head.w.y, head.w.z) : 0, theta: lastTheta };
      },
      reset() {
        hist.length = 0;
        trail.length = 0;
        head.p = null;
        ring.dir = 1;
        uturnLeft = 0;
        orbitAngle = 0.85;
        speed = 0.88;
        squeeze = 1.0;
        alpha = 0.0;
        power = 0.0;
        lunge = null;
        dash = null;
        randomStart();
      },
      update: updateState,
      render,
      triggerLunge,
      triggerDash,
      sampleTrailPointScreen,
      setDebugPose(pose) {
        debugOverride = pose;
      },
      dispose() {
        disposeFbo(gl, sceneFbo);
        disposeFbo(gl, bloomA);
        disposeFbo(gl, bloomB);
      },
    };
  };
})();
