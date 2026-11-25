// Real-time 3D WebGL spirit dragon for the KPR intro (no external dependencies).
// An original long-dragon design in the site's emerald, acid green and teal: a sculpted head
// with branching antlers, glowing eyes, a hinged jaw and S-wave whiskers, on a parallel-transport
// serpentine body with overlapping scales, belly scutes, a sawtooth dorsal crest and HDR bloom.
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

  // -------------------- Sculpt the dragon head --------------------
  function buildDragonHeadMeshes() {
    const upper = createMeshBuilder();

    // High-density sculpted cranium & chiseled Oriental muzzle with rounded Ruyi nose boss
    const Z_RINGS = 46;
    const RAD_SEGS = 36;
    const skullRings = [];

    for (let r = 0; r < Z_RINGS; r++) {
      const u = r / (Z_RINGS - 1);
      // Cosine-clustered spacing near snout tip (u > 0.8) so the rounded front nose & nostrils have high detail!
      const uMapped = u < 0.80 ? (u / 0.80) * 0.86 : 0.86 + Math.sin(((u - 0.80) / 0.20) * (Math.PI * 0.5)) * 0.14;
      const z = lerp(-0.62, 1.48, uMapped);

      // Smooth rounded dome closure over the front of the Ruyi nose pad (zero flat square shovel!)
      const domeT = clamp((z - 1.24) / 0.24, 0, 1);
      const snoutDome = Math.sqrt(Math.max(0.004, 1 - domeT * domeT));

      // Width profile: muscular cranium -> wide cheekbones -> tapered muzzle waist -> compact Oriental Ruyi nose shield
      const cheekFlare = Math.exp(-Math.pow((z - 0.04) / 0.32, 2)) * 0.19;
      const muzzleWaist = -Math.exp(-Math.pow((z - 0.72) / 0.28, 2)) * 0.12;
      const nosePad = Math.exp(-Math.pow((z - 1.22) / 0.18, 2)) * 0.05;
      const halfW = (0.39 + cheekFlare + muzzleWaist + nosePad) * snoutDome;

      // Dorsal profile: crown -> scowling brow -> saddle dip -> proud upturned Eastern nasal boss!
      const browPeak = Math.exp(-Math.pow((z - 0.14) / 0.25, 2)) * 0.17;
      const bridgeDip = -Math.exp(-Math.pow((z - 0.72) / 0.28, 2)) * 0.14;
      const upturnedNose = Math.exp(-Math.pow((z - 1.22) / 0.19, 2)) * 0.19;
      const rawTopY = 0.43 + browPeak + bridgeDip + upturnedNose;
      const noseCenterY = 0.24;
      const topY = lerp(noseCenterY, rawTopY, snoutDome);

      // Scalloped fierce Oriental upper lip margin
      const lipS =
        Math.sin((z + 0.12) * 4.5) * 0.028 -
        Math.exp(-Math.pow((z - 1.06) / 0.13, 2)) * 0.050 +
        smoothstep(1.20, 1.44, z) * 0.08;
      const rawBotY = z < -0.10 ? lerp(-0.22, 0.04, smoothstep(-0.62, -0.10, z)) : (0.03 + lipS);
      const botY = lerp(noseCenterY, rawBotY, snoutDome);

      const row = [];
      for (let s = 0; s < RAD_SEGS; s++) {
        const a = (s / RAD_SEGS) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const absCa = Math.abs(ca);
        const sideSign = ca >= 0 ? 1 : -1;

        // Chiseled mid-snout bridge that relaxes back to organic rounded Ruyi nose bosses at the front!
        const boxiness = smoothstep(-0.08, 0.45, z) * smoothstep(1.22, 0.88, z) * 0.24;
        const shapedX = Math.sign(ca) * Math.pow(absCa, 1 - boxiness);
        const shapedY = sa >= 0 ? Math.pow(sa, 1 - boxiness * 0.8) : sa;

        // Taper lower snout/gumline inward near the front tip so the nose pad forms a proud shield (wider at nostrils than lip, never duckbilled!)
        const frontLipTaper = 1.0 - smoothstep(0.92, 1.44, z) * (1.0 - clamp(sa, 0.0, 1.0)) * 0.34;
        let x = shapedX * halfW * frontLipTaper;
        let y = sa >= 0 ? lerp(botY, topY, shapedY) : botY;
        let zOut = z;
        let cavity = 0.52;
        let mId = MAT_HEAD;

        if (sa >= 0) {
          // 1) DEEP ANGRY V-SHAPED BROW FURROW & OVERHANGING SUPRAORBITAL RIDGE
          const browRegion = Math.exp(-Math.pow((z - 0.22) / 0.20, 2));
          const centerScowl = browRegion * Math.exp(-Math.pow(absCa / 0.22, 2)) * smoothstep(0.58, 0.98, sa);
          y -= centerScowl * 0.16;
          cavity -= centerScowl * 0.46;

          const browCrest = Math.exp(-Math.pow((z - (0.32 - absCa * 0.25)) / 0.14, 2)) *
            Math.exp(-Math.pow((absCa - 0.68) / 0.23, 2)) * smoothstep(0.36, 0.84, sa);
          y += browCrest * 0.24;
          x += sideSign * browCrest * 0.14;
          cavity += browCrest * 0.36;

          // Deep dark-olive orbital socket recessed clearly inward so the protruding blazing eye gem is 100% unoccluded!
          const socketDist = Math.hypot((z - 0.26) / 0.16, (absCa - 0.78) / 0.22, (sa - 0.42) / 0.24);
          if (socketDist < 1.35) {
            const pit = Math.exp(-Math.pow(socketDist / 0.75, 2));
            x -= sideSign * pit * 0.19;
            y -= pit * 0.09;
            cavity -= pit * 0.65;
          }

          // 2) Smooth nasal bridge with a single soft central ridge line
          if (z > 0.34 && z < 1.10 && sa > 0.60) {
            const bridgeMask = smoothstep(0.34, 0.50, z) * smoothstep(1.10, 0.92, z) * smoothstep(0.60, 0.85, sa);
            const ridge = Math.exp(-Math.pow(absCa / 0.12, 2));
            y += ridge * 0.035 * bridgeMask;
            cavity += (ridge - 0.3) * 0.3 * bridgeMask;
          }

          // 3) Rounded nose and forward-facing teardrop nostrils
          const philtrum = Math.exp(-Math.pow((z - 1.34) / 0.14, 2)) * Math.exp(-Math.pow(absCa / 0.18, 2)) * smoothstep(0.15, 0.95, sa);
          y -= philtrum * 0.065;
          zOut -= philtrum * 0.045;
          cavity -= philtrum * 0.36;

          // Forward-and-slightly-outward facing dark teardrop nostrils right on the front snout boss!
          const nDz = (z - 1.35) / 0.12;
          const nDx = (absCa - 0.50) / 0.22;
          const nDy = (sa - 0.58) / 0.24;
          const nDist = Math.hypot(nDz, nDx, nDy);
          if (nDist < 1.45) {
            const wing = Math.exp(-Math.pow((nDist - 0.88) / 0.25, 2));
            const hole = Math.exp(-Math.pow(nDist / 0.60, 2));
            x += sideSign * (wing * 0.068 - hole * 0.072);
            y += wing * 0.055 - hole * 0.062;
            zOut += wing * 0.038 - hole * 0.13; // deep sculpted forward-facing nostril cavity!
            cavity += wing * 0.36 - hole * 0.92;
          }

          // 4) Zygomatic cheek ridge + flared upper lip curl
          const zygoma = Math.exp(-Math.pow((z - 0.02) / 0.26, 2)) * Math.exp(-Math.pow((sa - 0.18) / 0.14, 2));
          x += sideSign * zygoma * 0.075;
          cavity += zygoma * 0.25;

          const lipCurl = smoothstep(-0.04, 0.14, z) * smoothstep(1.44, 1.24, z) * Math.exp(-Math.pow(sa / 0.13, 2));
          x += sideSign * lipCurl * 0.042;
          cavity += lipCurl * 0.22;
        } else {
          if (z > -0.04) {
            const vault = Math.sin(-sa) * smoothstep(1.36, 0.98, z) * smoothstep(-0.04, 0.14, z);
            y = botY + vault * 0.15;
            x *= 1 - Math.sin(-sa) * 0.15;
            if (vault > 0.055 && z < 0.95 && absCa < 0.72) {
              mId = MAT_FURNACE;
              cavity = 1.0;
            } else {
              cavity = 0.25;
            }
          } else {
            y = lerp(botY, -0.25, Math.sin(-sa));
            cavity = 0.32;
          }
        }

        row.push(upper.addVert(x, y, zOut, u, s / RAD_SEGS, mId, clamp(cavity, 0.02, 1.0)));
      }
      skullRings.push(row);
    }
    upper.loftRings(skullRings, true);

    const tipCenter = upper.addVert(0, 0.24, 1.485, 1, 0.25, MAT_HEAD, 0.55);
    const lastRing = skullRings[Z_RINGS - 1];
    for (let s = 0; s < RAD_SEGS; s++) {
      upper.addTri(lastRing[s], tipCenter, lastRing[(s + 1) % RAD_SEGS]);
    }

    // --- UNMISTAKABLE BLAZING SCOWLING SPIRIT EYES (protruding cleanly out of recessed dark eye sockets!) ---
    upper.addSculptedSpike({
      rings: 9, segs: 12, matId: MAT_FURNACE, mirrorX: true,
      sample: (t) => ({
        // Angled fiercely back-and-upward along the orbital rim, fully outside the recessed socket wall!
        x: lerp(0.35, 0.53, t) + Math.sin(t * Math.PI) * 0.035,
        y: lerp(0.28, 0.40, t) + Math.sin(t * Math.PI) * 0.015,
        z: lerp(0.42, 0.13, t) + Math.sin(t * Math.PI) * 0.025,
        rx: 0.072 * Math.sin(Math.max(0.08, t) * Math.PI * 0.92),
        ry: 0.082 * Math.sin(Math.max(0.08, t) * Math.PI * 0.92),
        taperPow: 1.25,
        sharp: 0.28,
        cav: 1.0,
      }),
    });

    // --- DEEP INNER THROAT FURNACE (strictly recessed inside mouth so outer snout stays crisp jade!) ---
    upper.addSculptedSpike({
      rings: 6, segs: 12, matId: MAT_FURNACE, mirrorX: false,
      sample: (t) => ({
        x: 0,
        y: lerp(-0.07, 0.04, t),
        z: lerp(-0.06, 0.32, t),
        rx: lerp(0.27, 0.16, t),
        ry: lerp(0.20, 0.12, t),
        sharp: 0.0,
        cav: 1.0,
      }),
    });

    // --- Branching antlers: a swept-back main beam with two tines per side ---
    upper.addSculptedSpike({
      rings: 14, segs: 10, matId: MAT_CREST, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.20, 0.46, t),
        y: lerp(0.52, 1.05, Math.pow(t, 0.8)),
        z: lerp(-0.10, -1.05, t),
        rx: 0.078,
        ry: 0.070,
        taperPow: 1.35,
        sharp: 0.22,
        cav: lerp(0.40, 0.92, t),
      }),
    });
    const antlerTines = [
      { bx: 0.29, by: 0.75, bz: -0.43, tx: 0.36, ty: 1.14, tz: -0.22, r: 0.05 },
      { bx: 0.37, by: 0.89, bz: -0.72, tx: 0.62, ty: 1.22, tz: -0.62, r: 0.045 },
    ];
    for (const tn of antlerTines) {
      upper.addSculptedSpike({
        rings: 8, segs: 8, matId: MAT_CREST, mirrorX: true,
        sample: (t) => ({
          x: lerp(tn.bx, tn.tx, t),
          y: lerp(tn.by, tn.ty, Math.pow(t, 0.85)),
          z: lerp(tn.bz, tn.tz, t),
          rx: tn.r,
          ry: tn.r * 0.9,
          taperPow: 1.5,
          sharp: 0.24,
          cav: lerp(0.45, 0.94, t),
        }),
      });
    }

    // --- UPPER DENTITION: 4 Front Incisors + 2 Massive Curved Canine Sabers + 8 Lateral Teeth ---
    const upperTeeth = [
      { x: 0.065, y: 0.08, z: 1.34, dx: 0.0, dy: -0.14, dz: 0.01, r: 0.030 },
      { x: 0.165, y: 0.07, z: 1.30, dx: 0.01, dy: -0.16, dz: 0.00, r: 0.035 },
      { x: 0.31, y: 0.04, z: 1.07, dx: -0.02, dy: -0.32, dz: -0.07, r: 0.066 },
      { x: 0.30, y: 0.05, z: 0.86, dx: -0.01, dy: -0.18, dz: -0.03, r: 0.044 },
      { x: 0.31, y: 0.05, z: 0.68, dx: -0.01, dy: -0.15, dz: -0.03, r: 0.040 },
      { x: 0.34, y: 0.05, z: 0.50, dx: -0.01, dy: -0.13, dz: -0.02, r: 0.036 },
      { x: 0.37, y: 0.06, z: 0.33, dx: -0.01, dy: -0.11, dz: -0.02, r: 0.032 },
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
          sharp: 0.18,
          cav: lerp(0.50, 0.98, t),
        }),
      });
    }

    // === 2. ARTICULATED ROARING LOWER JAW (MANDIBLE + CURLED TONGUE + LOWER TUSKS) ===
    const lower = createMeshBuilder();
    const J_RINGS = 24;
    const J_SEGS = 24;
    const jawRings = [];

    for (let r = 0; r < J_RINGS; r++) {
      const u = r / (J_RINGS - 1);
      const z = lerp(-0.06, 1.18, u);
      const chinRound = smoothstep(1.18, 1.04, z);
      const halfW = lerp(0.43, 0.27, Math.pow(u, 0.72)) * Math.max(0.36, Math.pow(chinRound, 0.7));
      const chinHook = Math.exp(-Math.pow((z - 1.13) / 0.11, 2)) * 0.085;
      const topGumY = 0.02 + chinHook;
      const botChinY = -0.20 + u * 0.032 + chinHook * 0.55 - Math.exp(-Math.pow((z - 0.98) / 0.16, 2)) * 0.045;

      const row = [];
      for (let s = 0; s < J_SEGS; s++) {
        const a = (s / J_SEGS) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const absCa = Math.abs(ca);
        let x = Math.sign(ca) * Math.pow(absCa, 0.82) * halfW;
        let y = sa >= 0 ? topGumY : lerp(topGumY, botChinY, Math.pow(-sa, 0.80));
        let mId = MAT_HEAD;
        let cavity = 0.48;

        if (sa >= 0) {
          const trough = Math.sin(sa) * smoothstep(1.06, 0.82, z) * smoothstep(-0.04, 0.12, z);
          y = topGumY - trough * 0.11;
          if (trough > 0.035 && absCa < 0.68 && z < 0.92) {
            mId = MAT_FURNACE;
            cavity = 1.0;
          } else {
            cavity = 0.56;
          }
        } else {
          // Chiseled chin ridges & ventral jaw bevels
          const jawBevel = Math.exp(-Math.pow((absCa - 0.72) / 0.20, 2)) * Math.sin(-sa);
          y -= jawBevel * 0.032;
          cavity += jawBevel * 0.24 - Math.exp(-Math.pow(absCa / 0.22, 2)) * 0.16;
        }
        row.push(lower.addVert(x, y, z, u, s / J_SEGS, mId, clamp(cavity, 0.12, 1.0)));
      }
      jawRings.push(row);
    }
    lower.loftRings(jawRings, true);
    const jawTip = lower.addVert(0, 0.02, 1.20, 1, 0.25, MAT_HEAD, 0.62);
    const lastJawRing = jawRings[J_RINGS - 1];
    for (let s = 0; s < J_SEGS; s++) {
      lower.addTri(lastJawRing[s], jawTip, lastJawRing[(s + 1) % J_SEGS]);
    }

    // Sculpted chin beard spikes
    lower.addSculptedSpike({
      rings: 6, segs: 8, matId: MAT_CREST, mirrorX: false,
      sample: (t) => ({
        x: 0, y: lerp(-0.18, -0.31, t), z: lerp(1.02, 0.86, t),
        rx: 0.055, ry: 0.045, sharp: 0.35, cav: lerp(0.35, 0.85, t),
      }),
    });
    lower.addSculptedSpike({
      rings: 6, segs: 8, matId: MAT_CREST, mirrorX: true,
      sample: (t) => ({
        x: lerp(0.16, 0.22, t), y: lerp(-0.16, -0.27, t), z: lerp(0.92, 0.75, t),
        rx: 0.045, ry: 0.038, sharp: 0.35, cav: lerp(0.35, 0.85, t),
      }),
    });

    // Curled glowing dragon tongue
    lower.addSculptedSpike({
      rings: 10, segs: 10, matId: MAT_FURNACE, mirrorX: false,
      sample: (t) => ({
        x: 0,
        y: 0.01 + Math.sin(t * Math.PI * 0.95) * 0.11 + Math.pow(t, 3) * 0.08,
        z: lerp(0.08, 0.96, t),
        rx: lerp(0.16, 0.025, Math.pow(t, 0.85)),
        ry: lerp(0.052, 0.014, t),
        sharp: 0.15,
        cav: 1.0,
      }),
    });

    // Lower Dentition: 4 Front Incisors + 2 Huge Upward Canine Tusks + 6 Cheek Teeth
    const lowerTeeth = [
      { x: 0.055, y: 0.05, z: 1.11, dx: 0.0, dy: 0.11, dz: 0.01, r: 0.025 },
      { x: 0.135, y: 0.04, z: 1.09, dx: 0.0, dy: 0.13, dz: 0.01, r: 0.029 },
      { x: 0.235, y: 0.02, z: 0.99, dx: 0.015, dy: 0.27, dz: -0.03, r: 0.058 },
      { x: 0.255, y: 0.01, z: 0.78, dx: 0.0, dy: 0.15, dz: -0.02, r: 0.038 },
      { x: 0.285, y: 0.01, z: 0.58, dx: 0.0, dy: 0.13, dz: -0.02, r: 0.034 },
      { x: 0.315, y: 0.01, z: 0.40, dx: 0.0, dy: 0.10, dz: -0.01, r: 0.030 },
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
          sharp: 0.18,
          cav: lerp(0.50, 0.98, t),
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

      // 1) Ventral Belly Scutes
      float scuteU = uv.x * 64.0;
      float scuteFrac = fract(scuteU);
      // Asymmetric imbricated plate: sharp dark groove at trailing seam, smooth convex ramp across plate!
      float scuteGroove = smoothstep(0.0, 0.18, scuteFrac) * smoothstep(1.0, 0.86, scuteFrac);
      float scuteCurve = 0.72 + 0.28 * cos((uv.y - 0.5) * 14.0);
      float scuteH = scuteGroove * scuteCurve;
      float scuteDu = (0.5 - scuteFrac) * 1.35 * scuteGroove;

      // 2) Tightly Packed Overlapping Diamond/Shield Scales
      // Evaluate two staggered scale layers and take max() so every scale genuinely overlaps the next!
      vec2 baseUv = vec2(uv.x * 38.0, uv.y * 12.0);
      float bestH = -1.0;
      float bestDu = 0.0;
      float bestDv = 0.0;
      for (int layer = 0; layer < 2; layer++) {
        vec2 o = layer == 0 ? vec2(0.0, 0.0) : vec2(0.5, 0.5);
        vec2 g = baseUv + o;
        vec2 f = fract(g) - 0.5; // f.x along spine [-0.5..0.5], f.y around circumference [-0.5..0.5]
        // Parabolic pointed dragon scale shield pointing backward (+u along spine)
        float edgeCurve = f.x + 0.95 * f.y * f.y - 0.24;
        float inside = 1.0 - smoothstep(-0.08, 0.09, edgeCurve);
        // Ramp height from scale root (-0.5) up to the raised overlapping scale lip (+0.24)
        float ramp = clamp((f.x + 0.5) * 0.95, 0.0, 1.0);
        float crown = 1.0 - 0.55 * f.y * f.y;
        float h = inside * (0.18 + 0.82 * ramp * crown);
        if (h > bestH) {
          bestH = h;
          bestDu = inside * (0.55 - smoothstep(-0.08, 0.06, edgeCurve) * 2.2);
          bestDv = inside * (-f.y * 1.45);
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

      vec3 N = normalize(vNormal);
      // Blend in a little faceted crispness on the head and crest
      if (uHasDeriv > 0.5 && vMat < 4.5 && (vMat < 0.5 || vMat > 3.5)) {
        vec3 dx = dFdx(vWorldPos);
        vec3 dy = dFdy(vWorldPos);
        vec3 fN = normalize(cross(dx, dy) + vec3(1e-6));
        if (dot(fN, N) < 0.0) fN = -fN;
        N = normalize(mix(N, fN, 0.26));
      }
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCamPos - vWorldPos);

      // Translucent Spirit-Flame Mane Wisps (MAT_SPIRIT = 5.0)
      if (vMat > 4.5) {
        float flow = fbm(vec2(vUv.x * 5.0 - uTime * 2.6, vUv.y * 3.0));
        float edgeFade = sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265);
        float lenFade = smoothstep(0.0, 0.14, vUv.x) * pow(1.0 - clamp(vUv.x, 0.0, 1.0), 1.4);
        float wispA = edgeFade * lenFade * (0.30 + 0.65 * flow) * (0.60 + 0.35 * uPower) * uAlpha;
        if (wispA < 0.01) discard;
        vec3 wispCol = mix(vec3(0.10, 0.70, 0.45), vec3(0.55, 1.0, 0.80), flow * 0.75 + uPower * 0.2);
        gl_FragColor = vec4(wispCol * wispA, clamp(wispA * 0.72, 0.0, 1.0));
        return;
      }

      // Blazing Incandescent Furnace: Scowling Eyes + Deep Inner Mouth + Tongue (MAT_FURNACE = 3.0)
      if (vMat > 2.5 && vMat < 3.5) {
        float flicker = 0.94 + 0.06 * sin(uTime * 18.0 + vWorldPos.x * 5.0);
        float core = clamp(0.35 + pow(abs(dot(N, V)), 0.75) * 0.65, 0.0, 1.0);
        // Teal edge -> near-white core
        vec3 hotCol = mix(vec3(0.35, 1.0, 0.80), vec3(0.92, 1.0, 0.97), core) * (1.42 * flicker + uPower * 0.25);
        float a = clamp(uAlpha, 0.0, 1.0);
        gl_FragColor = vec4(hotCol * a, a);
        return;
      }

      float cavity = vCavity;
      float alpha = 0.98;

      // Apply overlapping scales + ventral belly scute relief on serpentine body
      if (vMat > 0.5 && vMat < 1.5) {
        vec3 rel = bodyRelief(vUv);
        vec3 T1 = normalize(cross(N, vec3(0.0, 1.0, 0.15)) + vec3(1e-4));
        vec3 T2 = normalize(cross(N, T1));
        N = normalize(N + T1 * rel.y * 0.38 + T2 * rel.z * 0.38);
        cavity = clamp(0.14 + rel.x * 0.82, 0.05, 1.0);
        alpha *= 1.0 - smoothstep(0.86, 1.0, vUv.x);
      }

      // One material family across head and body:
      vec3 Lkey = normalize(vec3(0.28, 0.76, 0.58));
      vec3 Lfill = normalize(vec3(-0.60, -0.35, 0.42));
      float ndl = dot(N, Lkey) * 0.5 + 0.5;
      float fill = max(0.0, dot(N, Lfill));
      float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
      float fresnel = pow(1.0 - ndv, 2.35);

      // Subtle surging spirit chi along the dragon
      float flowWave = fbm(vec2(vUv.x * 6.0 - uTime * 1.8, vUv.y * 3.5 + uTime * 0.2));
      float chiPulse = smoothstep(0.48, 0.90, flowWave) * (0.14 + 0.26 * uPower);

      // The site's own palette, matching the 2D hard-light intro:
      // crevices and seams: near-black teal (#061a12); midtones: deep emerald -> acid green (#44d62c);
      // grazing Fresnel edges and ridges: bright teal (#28f0b4)
      vec3 colCrease = vec3(0.02, 0.10, 0.07);
      vec3 colShadow = vec3(0.05, 0.30, 0.18);
      vec3 colMid    = vec3(0.12, 0.60, 0.32);
      vec3 colBright = vec3(0.27, 0.84, 0.17);
      vec3 colRim    = vec3(0.16, 0.94, 0.71);

      float shade = clamp(ndl * 0.46 + fill * 0.12 + cavity * 0.62 - 0.16, 0.0, 1.0);
      // Guarantee deep sculpted dark-jade occlusion inside nostrils, eye sockets & nasal grooves even under direct front light!
      shade *= smoothstep(0.0, 0.30, cavity) * 0.78 + 0.22 * smoothstep(0.02, 0.18, cavity);
      vec3 color = mix(colCrease, colShadow, smoothstep(0.02, 0.32, shade));
      color = mix(color, colMid, smoothstep(0.28, 0.64, shade));
      color = mix(color, colBright, smoothstep(0.62, 0.96, shade));
      color += colRim * (fresnel * (0.34 + 0.26 * cavity));
      color += vec3(0.16, 0.94, 0.70) * chiPulse;

      // Antlers, dorsal crest & whiskers (MAT_CREST = 4.0): tips brighten to mint
      if (vMat > 3.5 && vMat < 4.5) {
        float tip = clamp(vUv.x, 0.0, 1.0);
        color = mix(color, vec3(0.55, 1.0, 0.80), tip * 0.48);
        alpha *= mix(0.99, 0.88, tip);
      }

      // Teeth (MAT_TOOTH = 2.0): pale mint, backlit by the glow inside the mouth
      if (vMat > 1.5 && vMat < 2.5) {
        vec3 toMouth = uMouthPos - vWorldPos;
        float mDist = length(toMouth);
        float toothBacklight = exp(-mDist * 2.4) * 0.55;
        color = mix(vec3(0.42, 0.78, 0.62), vec3(0.92, 1.0, 0.95), clamp(vCavity * 0.72 + fresnel * 0.45, 0.0, 1.0));
        color += vec3(0.85, 1.0, 0.95) * toothBacklight;
      }

      color *= (1.0 + uPower * 0.14);

      float finalA = clamp(alpha * uAlpha, 0.0, 1.0);
      if (finalA < 0.01) discard;
      // Note: MAT_FURNACE writes > 1.0 into float/clamped bright-pass; keep solid jade <= 0.95 so bloom stays selective!
      gl_FragColor = vec4(min(color, vec3(0.96)) * finalA, finalA);
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
      vec3 emeraldTint = vec3(0.16, 0.85, 0.45) * lum;
      vec3 hotTint = vec3(0.55, 1.0, 0.85);
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
    };

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

    const BODY_RINGS = 76;
    const BODY_SEGS = 22;
    const FIN_COUNT = 52; // closely packed continuous sawtooth dorsal crest!
    const WHISK_RINGS = 18;
    const WHISK_SEGS = 8;
    const RIBBON_COUNT = 10;
    const RIBBON_RINGS = 18;

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

    // B) Continuous sawtooth dorsal spine crest fins (5 verts per fin)
    const finBaseV = vCursor;
    for (let f = 0; f < FIN_COUNT; f++) {
      const b = vCursor;
      vCursor += 5;
      dynIndices.push(b + 0, b + 1, b + 4);
      dynIndices.push(b + 3, b + 2, b + 4);
      dynIndices.push(b + 1, b + 3, b + 4);
      dynIndices.push(b + 2, b + 0, b + 4);
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
    let orbitAngle = 0.85; // starts sweeping around the front-left -> front-center so face is immediately prominent!
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

    // Flowing 3D coil round the mark with a vertical wave and helical pitch, so the dragon passes
    // behind and in front of KPR. The arc spans ~245 deg: at ~330 deg the tail came back round to
    // within ~30 deg of the head and the body ran straight through the head and neck.
    function evalCoilPoint(u, headAngle, timeSec) {
      const aspect = W / H;
      const centerLiftY = (liftPx / H) * 2 * HALF_H_AT_Z0;
      const spanRad = TAU * 0.68;
      const a = headAngle - u * spanRad;

      const rxFactor = aspect < 0.85 ? 0.68 : 0.46;
      const baseRx = Math.min(HALF_H_AT_Z0 * aspect * rxFactor, 2.45) * squeeze * fitScale * (1.0 + u * 0.08);
      const baseRy = Math.min(baseRx * 0.60, HALF_H_AT_Z0 * 0.39, 1.30) * squeeze * fitScale;
      const baseRz = Math.min(1.75, baseRx * 0.76) * squeeze;

      const waveAmp = (0.06 + 0.16 * smoothstep(0.0, 0.35, u)) * fitScale * squeeze;
      const swimY = Math.sin(u * 9.0 - timeSec * 4.4) * waveAmp;
      const swimR = Math.cos(u * 7.0 - timeSec * 3.6) * waveAmp * 0.65;
      // Helical S-pitch separates head height cleanly from the trailing coil so the roaring silhouette stays unobstructed
      const helixY = (0.48 - u) * baseRy * 0.72;

      const lx = Math.cos(a) * (baseRx + swimR);
      const ly = Math.sin(a) * baseRy * 0.72 + Math.sin(a * 2.0 + 0.4) * baseRy * 0.30 + helixY + swimY;
      const lz = Math.sin(a) * baseRz;

      const tilt = -0.22;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      return {
        x: lx * ct - ly * st,
        y: centerLiftY + lx * st + ly * ct,
        z: lz,
      };
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
        orbitAngle += speed * dt;
        alpha = Math.min(1, alpha + dt / 0.75);
      }

      hist.length = 0;
      for (let i = 0; i < BODY_RINGS; i++) {
        hist.push(evalCoilPoint(i / (BODY_RINGS - 1), orbitAngle, tSec));
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
          const worldUpX = debugOverride && debugOverride.up ? debugOverride.up[0] : -fx * 0.16;
          const worldUpY = debugOverride && debugOverride.up ? debugOverride.up[1] : 1.0;
          const worldUpZ = debugOverride && debugOverride.up ? debugOverride.up[2] : 0.12;
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
      const neckOffset = headScale * 0.34;
      const hx = f0.p.x + f0.fx * neckOffset;
      const hy = f0.p.y + f0.fy * neckOffset;
      const hz = f0.p.z + f0.fz * neckOffset;

      matHead[0] = f0.rx * headScale; matHead[1] = f0.ry * headScale; matHead[2] = f0.rz * headScale; matHead[3] = 0;
      matHead[4] = f0.ux * headScale; matHead[5] = f0.uy * headScale; matHead[6] = f0.uz * headScale; matHead[7] = 0;
      matHead[8] = f0.fx * headScale; matHead[9] = f0.fy * headScale; matHead[10] = f0.fz * headScale; matHead[11] = 0;
      matHead[12] = hx; matHead[13] = hy; matHead[14] = hz; matHead[15] = 1;

      const baseJaw = debugOverride && debugOverride.jawRad !== undefined
        ? debugOverride.jawRad
        : (0.66 + Math.sin(tSec * 3.2) * 0.055 + power * 0.18);
      const cj = Math.cos(baseJaw), sj = Math.sin(baseJaw);
      const localJaw = new Float32Array([
        1, 0, 0, 0,
        0, cj, sj, 0,
        0, -sj, cj, 0,
        0, -0.05, -0.06, 1,
      ]);
      mat4Mul(matJaw, matHead, localJaw);

      mouthWorldPos[0] = hx + (f0.ux * -0.04 + f0.fx * 0.42) * headScale;
      mouthWorldPos[1] = hy + (f0.uy * -0.04 + f0.fy * 0.42) * headScale;
      mouthWorldPos[2] = hz + (f0.uz * -0.04 + f0.fz * 0.42) * headScale;

      // --- A) Serpentine Body (commanding head -> athletic muscular neck -> graceful monotonic tail taper) ---
      const neckRadius = headScale * 0.33;
      for (let r = 0; r < BODY_RINGS; r++) {
        const u = r / (BODY_RINGS - 1);
        const fr = spineFrames[r];
        const taper = Math.pow(Math.max(0.03, 1 - u * 0.96), 0.72);
        const radW = neckRadius * taper;
        const radH = neckRadius * taper * 1.06;

        for (let s = 0; s <= BODY_SEGS; s++) {
          const v = s / BODY_SEGS;
          const ang = v * TAU;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const bellyFlat = ca < 0 ? 1 - (-ca) * 0.12 : 1 + Math.pow(ca, 3) * 0.08;
          const lx = sa * radW;
          const ly = ca * radH * bellyFlat;

          const px = fr.p.x + fr.rx * lx + fr.ux * ly;
          const py = fr.p.y + fr.ry * lx + fr.uy * ly;
          const pz = fr.p.z + fr.rz * lx + fr.uz * ly;

          let nx = fr.rx * sa + fr.ux * ca;
          let ny = fr.ry * sa + fr.uy * ca;
          let nz = fr.rz * sa + fr.uz * ca;
          const nl = Math.hypot(nx, ny, nz) || 1;
          writeVert(bodyBaseV + r * bodyRingStride + s, px, py, pz, nx / nl, ny / nl, nz / nl, u, v, MAT_BODY, 0.52);
        }
      }

      // --- B) Continuous Overlapping Sawtooth Dorsal Spine Crest ---
      for (let f = 0; f < FIN_COUNT; f++) {
        const u = 0.015 + (f / (FIN_COUNT - 1)) * 0.91;
        const posRing = u * (BODY_RINGS - 1);
        const rIdx = Math.min(BODY_RINGS - 2, Math.max(1, Math.round(posRing)));
        const fr = spineFrames[rIdx];
        const frPrev = spineFrames[Math.max(0, rIdx - 1)];
        const frNext = spineFrames[Math.min(BODY_RINGS - 1, rIdx + 2)];

        const taper = u < 0.14 ? 1.0 : Math.pow(Math.max(0.08, 1 - (u - 0.14) / 0.86), 0.72);
        const bodyR = neckRadius * taper * 0.95;
        const finH = headScale * 0.34 * taper * (0.92 + 0.12 * Math.sin(f * 1.5));
        const halfThick = neckRadius * taper * 0.16;

        // Wide connected sawtooth base (front meets previous fin, back overlaps next fin!)
        const pFrontX = lerp(fr.p.x, frPrev.p.x, 0.82) + fr.ux * bodyR;
        const pFrontY = lerp(fr.p.y, frPrev.p.y, 0.82) + fr.uy * bodyR;
        const pFrontZ = lerp(fr.p.z, frPrev.p.z, 0.82) + fr.uz * bodyR;

        const pBackX = lerp(fr.p.x, frNext.p.x, 0.68) + fr.ux * bodyR;
        const pBackY = lerp(fr.p.y, frNext.p.y, 0.68) + fr.uy * bodyR;
        const pBackZ = lerp(fr.p.z, frNext.p.z, 0.68) + fr.uz * bodyR;

        // Swept-back shark-fin apex
        const sway = Math.sin(tSec * 6.0 - f * 0.45) * halfThick * 0.4;
        const apexX = fr.p.x + fr.ux * (bodyR + finH) - fr.fx * (finH * 0.88) + fr.rx * sway;
        const apexY = fr.p.y + fr.uy * (bodyR + finH) - fr.fy * (finH * 0.88) + fr.ry * sway;
        const apexZ = fr.p.z + fr.uz * (bodyR + finH) - fr.fz * (finH * 0.88) + fr.rz * sway;

        const b = finBaseV + f * 5;
        writeVert(b + 0, pFrontX - fr.rx * halfThick, pFrontY - fr.ry * halfThick, pFrontZ - fr.rz * halfThick, -fr.rx, -fr.ry, -fr.rz, 0.08, 0, MAT_CREST, 0.32);
        writeVert(b + 1, pBackX - fr.rx * halfThick, pBackY - fr.ry * halfThick, pBackZ - fr.rz * halfThick, -fr.rx, -fr.ry, -fr.rz, 0.15, 1, MAT_CREST, 0.25);
        writeVert(b + 2, pFrontX + fr.rx * halfThick, pFrontY + fr.ry * halfThick, pFrontZ + fr.rz * halfThick, fr.rx, fr.ry, fr.rz, 0.08, 0, MAT_CREST, 0.32);
        writeVert(b + 3, pBackX + fr.rx * halfThick, pBackY + fr.ry * halfThick, pBackZ + fr.rz * halfThick, fr.rx, fr.ry, fr.rz, 0.15, 1, MAT_CREST, 0.25);
        writeVert(b + 4, apexX, apexY, apexZ, fr.ux, fr.uy, fr.uz, 1.0, 0.5, MAT_CREST, 0.94);
      }

      // --- C) 2 Bold Calligraphic S-Curve Snout Whiskers ---
      for (let w = 0; w < 2; w++) {
        const sd = w === 0 ? 1 : -1;
        const wPts = [];
        for (let r = 0; r < WHISK_RINGS; r++) {
          const t = r / (WHISK_RINGS - 1);
          const wave1 = Math.sin(t * 4.2 - tSec * 4.8 + w * 0.7) * 0.14 * t;
          const wave2 = Math.cos(t * 3.0 - tSec * 3.8) * 0.11 * t;
          // Sweeps boldly outward horizontally, dips slightly, then flicks up & down at the calligraphic tip
          const lx = sd * (0.36 + Math.pow(t, 0.76) * 1.58);
          const ly = 0.22 - Math.sin(t * Math.PI * 1.1) * 0.10 + Math.sin(Math.max(0, t - 0.55) * 6.0) * 0.26 + wave1;
          const lz = 1.08 - Math.pow(t, 1.2) * 1.15 + wave2;
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
          const rad = headScale * lerp(0.050, 0.006, Math.pow(t, 0.75));
          for (let s = 0; s < WHISK_SEGS; s++) {
            const a = (s / WHISK_SEGS) * TAU;
            const ca = Math.cos(a), sa = Math.sin(a);
            const rnx = nx * ca + bx * sa, rny = ny * ca + by * sa, rnz = nz * ca + bz * sa;
            writeVert(
              whiskBaseV[w] + r * WHISK_SEGS + s,
              wPts[r].x + rnx * rad, wPts[r].y + rny * rad, wPts[r].z + rnz * rad,
              rnx, rny, rnz,
              t, s / WHISK_SEGS, MAT_CREST, lerp(0.45, 0.96, t)
            );
          }
        }
      }

      // --- D) Spirit-Flame Mane & Coil Wisps ---
      for (let rb = 0; rb < RIBBON_COUNT; rb++) {
        const startRing = rb < 5 ? 1 + rb * 2 : 10 + (rb - 5) * 10;
        const side = rb % 2 === 0 ? 1 : -1;
        const baseV = ribbonBaseV + rb * RIBBON_RINGS * 2;
        const maxRibbonW = headScale * (rb < 5 ? 0.34 : 0.25);

        for (let r = 0; r < RIBBON_RINGS; r++) {
          const t = r / (RIBBON_RINGS - 1);
          const spIdx = Math.min(BODY_RINGS - 1, Math.round(startRing + t * (rb < 5 ? 14 : 18)));
          const fr = spineFrames[spIdx];
          const flutter = Math.sin(tSec * 7.2 - t * 5.5 + rb * 1.9) * headScale * 0.22 * t;
          const liftOut = headScale * (0.34 + t * 0.56) + flutter;
          const cx = fr.p.x + fr.rx * side * liftOut + fr.ux * (headScale * 0.24 * (1 + t));
          const cy = fr.p.y + fr.ry * side * liftOut + fr.uy * (headScale * 0.24 * (1 + t));
          const cz = fr.p.z + fr.rz * side * liftOut + fr.uz * (headScale * 0.24 * (1 + t));
          const rw = maxRibbonW * Math.sin(Math.max(0.05, t) * Math.PI);

          writeVert(baseV + r * 2, cx - fr.ux * rw, cy - fr.uy * rw, cz - fr.uz * rw, fr.rx * side, fr.ry * side, fr.rz * side, t, 0, MAT_SPIRIT, 1);
          writeVert(baseV + r * 2 + 1, cx + fr.ux * rw, cy + fr.uy * rw, cz + fr.uz * rw, fr.rx * side, fr.ry * side, fr.rz * side, t, 1, MAT_SPIRIT, 1);
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

    function renderPassToTarget(targetCtx, clipSide, nowMs) {
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

    function render(frontCtx, backCtx, nowMs) {
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
        renderPassToTarget(frontCtx, 0.0, nowMs);
      } else {
        renderPassToTarget(backCtx, -1.0, nowMs);
        renderPassToTarget(frontCtx, 1.0, nowMs);
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
      reset() {
        hist.length = 0;
        orbitAngle = 0.85;
        speed = 0.88;
        squeeze = 1.0;
        alpha = 0.0;
        power = 0.0;
        lunge = null;
      },
      update: updateState,
      render,
      triggerLunge,
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
