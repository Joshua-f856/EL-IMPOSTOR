// =============================================================================
// qr.js — Generador de códigos QR sin librerías (modo byte, versiones 1-10, ECC L/M/Q/H)
//
//   crearMatrizQR('https://...', 'M')  -> { size, modulos: boolean[][] }   (true = módulo oscuro)
//   dibujarQR(canvas, texto, { px, margen, ecc })                           -> dibuja en un <canvas>
//
// Capacidad (bytes) con ECC "M": v1=14, v2=26, v3=42, v4=62, v5=84, v6=106, v7=122, v8=152, v9=180, v10=213.
// Un enlace típico de sala (~70 caracteres) cabe en la versión 5-6.
// =============================================================================

// Índices: [nivel][versión]; nivel 0=L, 1=M, 2=Q, 3=H. Versión 0 sin usar.
const ECC_POR_BLOQUE = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]
];
const NUM_BLOQUES = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]
];
const BITS_FORMATO = [1, 0, 3, 2]; // L, M, Q, H
const NIVELES = { L: 0, M: 1, Q: 2, H: 3 };
const VERSION_MAX = 10;

function bytesUtf8(texto) {
  return Array.from(new TextEncoder().encode(texto));
}

function modulosCrudos(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function codewordsDatos(ver, nivel) {
  return Math.floor(modulosCrudos(ver) / 8) - ECC_POR_BLOQUE[nivel][ver] * NUM_BLOQUES[nivel][ver];
}

// ---- Reed-Solomon sobre GF(256) con polinomio 0x11D
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisorRS(grado) {
  const r = new Array(grado).fill(0);
  r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = gfMul(raiz, 0x02);
  }
  return r;
}

function restoRS(datos, divisor) {
  const r = divisor.map(() => 0);
  for (const b of datos) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

function agregarEccEntrelazar(datos, ver, nivel) {
  const nb = NUM_BLOQUES[nivel][ver];
  const eccLen = ECC_POR_BLOQUE[nivel][ver];
  const crudos = Math.floor(modulosCrudos(ver) / 8);
  const cortos = nb - (crudos % nb);
  const largoCorto = Math.floor(crudos / nb);
  const bloques = [];
  const div = divisorRS(eccLen);
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1));
    k += dat.length;
    const ecc = restoRS(dat, div);
    if (i < cortos) dat.push(0);
    bloques.push(dat.concat(ecc));
  }
  const res = [];
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((b, j) => {
      if (i !== largoCorto - eccLen || j >= cortos) res.push(b[i]);
    });
  }
  return res;
}

// ---- Construcción de la matriz
function posicionesAlineacion(ver, size) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const paso = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = size - 7; r.length < n; pos -= paso) r.splice(1, 0, pos);
  return r;
}

function crearMatriz(ver, nivel, codewords) {
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fun = Array.from({ length: size }, () => new Array(size).fill(false));
  const poner = (x, y, v) => { mod[y][x] = v; fun[y][x] = true; };

  // temporización
  for (let i = 0; i < size; i++) { poner(6, i, i % 2 === 0); poner(i, 6, i % 2 === 0); }
  // buscadores
  const buscador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) poner(x, y, d !== 2 && d !== 4);
      }
    }
  };
  buscador(3, 3); buscador(size - 4, 3); buscador(3, size - 4);
  // alineación
  const al = posicionesAlineacion(ver, size);
  const n = al.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) poner(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  const formato = (mascara) => {
    const datos = (BITS_FORMATO[nivel] << 3) | mascara;
    let rem = datos;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((datos << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) poner(8, i, bit(i));
    poner(8, 7, bit(6)); poner(8, 8, bit(7)); poner(7, 8, bit(8));
    for (let i = 9; i < 15; i++) poner(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) poner(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) poner(8, size - 15 + i, bit(i));
    poner(8, size - 8, true);
  };
  formato(0); // reserva el área (se reescribe con la máscara elegida)
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const b = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      poner(a, c, b); poner(c, a, b);
    }
  }
  // datos en zigzag
  let k = 0;
  for (let der = size - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = der - j;
        const arriba = ((der + 1) & 2) === 0;
        const y = arriba ? size - 1 - vert : vert;
        if (!fun[y][x] && k < codewords.length * 8) {
          mod[y][x] = ((codewords[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0;
          k++;
        }
      }
    }
  }
  return { size, mod, fun, formato };
}

function aplicarMascara(m, mascara) {
  const { size, mod, fun } = m;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inv;
      switch (mascara) {
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (!fun[y][x] && inv) mod[y][x] = !mod[y][x];
    }
  }
}

function penalizacion(mod, size) {
  let p = 0;
  const lineas = [];
  for (let i = 0; i < size; i++) {
    lineas.push(mod[i]);
    lineas.push(mod.map((fila) => fila[i]));
  }
  for (const l of lineas) {
    // N1: rachas >= 5
    let racha = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && l[i] === l[i - 1]) racha++;
      else { if (racha >= 5) p += 3 + (racha - 5); racha = 1; }
    }
    // N3: patrón 1:1:3:1:1 con 4 claros a un lado
    for (let i = 0; i + 11 <= size; i++) {
      const s = l.slice(i, i + 11).map((v) => (v ? 1 : 0)).join('');
      if (s === '10111010000' || s === '00001011101') p += 40;
    }
  }
  // N2: bloques 2x2
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = mod[y][x];
      if (v === mod[y][x + 1] && v === mod[y + 1][x] && v === mod[y + 1][x + 1]) p += 3;
    }
  }
  // N4: proporción de módulos oscuros
  let oscuros = 0;
  mod.forEach((f) => f.forEach((v) => { if (v) oscuros++; }));
  p += Math.floor(Math.abs(oscuros * 20 - size * size * 10) / (size * size)) * 10;
  return p;
}

export function crearMatrizQR(texto, ecc = 'M') {
  const nivel = NIVELES[ecc] ?? 1;
  const bytes = bytesUtf8(String(texto));
  let ver = 1;
  for (; ver <= VERSION_MAX; ver++) {
    const bitsContador = ver <= 9 ? 8 : 16;
    if (4 + bitsContador + bytes.length * 8 <= codewordsDatos(ver, nivel) * 8) break;
  }
  if (ver > VERSION_MAX) throw new Error('El texto es demasiado largo para el QR (máx. ~200 caracteres).');

  // flujo de bits: modo byte (0100) + contador + datos + terminador + relleno
  const bits = [];
  const poner = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poner(0x4, 4);
  poner(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => poner(b, 8));
  const capacidad = codewordsDatos(ver, nivel) * 8;
  poner(0, Math.min(4, capacidad - bits.length));
  poner(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacidad; pad ^= 0xec ^ 0x11) poner(pad, 8);
  const datos = new Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => { datos[i >>> 3] |= b << (7 - (i & 7)); });

  const codewords = agregarEccEntrelazar(datos, ver, nivel);
  const base = crearMatriz(ver, nivel, codewords);
  const { size } = base;

  let mejor = 0, mejorPena = Infinity;
  for (let mk = 0; mk < 8; mk++) {
    aplicarMascara(base, mk);
    base.formato(mk);
    const p = penalizacion(base.mod, size);
    if (p < mejorPena) { mejor = mk; mejorPena = p; }
    aplicarMascara(base, mk); // deshacer (XOR)
  }
  aplicarMascara(base, mejor);
  base.formato(mejor);
  return { size, version: ver, modulos: base.mod };
}

export function dibujarQR(canvas, texto, { px = 6, margen = 4, ecc = 'M', oscuro = '#000000', claro = '#ffffff' } = {}) {
  const { size, modulos } = crearMatrizQR(texto, ecc);
  const total = (size + margen * 2) * px;
  canvas.width = total;
  canvas.height = total;
  const g = canvas.getContext('2d');
  g.fillStyle = claro;
  g.fillRect(0, 0, total, total);
  g.fillStyle = oscuro;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modulos[y][x]) g.fillRect((x + margen) * px, (y + margen) * px, px, px);
    }
  }
  return canvas;
}
