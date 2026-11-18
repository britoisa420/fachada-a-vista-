const CR_DEF = { modelo: 'mk_verde', nome: '', slogan: '', estilo: 'acm', fonte: 'sans', corFachada: '#ece7dd', corPlaca: '#1f2d3d', corLetra: '#ffffff', noite: 'dia', logo: null, foto: null, fotoW: 0, fotoH: 0, px: 50, py: 30, pw: 60, ph: 22 };
const MODELOS = { mk_verde: 'Loja clássica', mk_azul: 'Fachada azul', mk_tijolo: 'Prédio de tijolo', mk_bairro: 'Loja de bairro', foto: 'Foto do meu ponto', rua: 'Desenho de loja', galeria: 'Desenho de galeria', sobrado: 'Desenho de sobrado' };
const ESTILOS = { acm: 'Placa em ACM', caixa: 'Letra caixa', luminoso: 'Luminoso', neon: 'Neon', toldo: 'Toldo' };
const FONTES = {
  sans: ['Moderna', 'Arial, Helvetica, sans-serif', 700, .6],
  black: ['Forte', "'Arial Black', Impact, Arial, sans-serif", 900, .74],
  serif: ['Clássica', "Georgia, 'Times New Roman', serif", 700, .58],
  round: ['Amigável', "'Trebuchet MS', Verdana, sans-serif", 700, .58],
  script: ['Manuscrita', "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive", 400, .45],
};
const PALETAS = [
  ['Clássica', '#ece7dd', '#1f2d3d', '#ffffff'], ['Café', '#4a3a30', '#1c1714', '#e9c38a'], ['Minimalista', '#f4f4f2', '#111111', '#ffffff'],
  ['Vibrante', '#ffd23f', '#d7263d', '#ffffff'], ['Natural', '#dfe7d8', '#2e5e3a', '#f5efe0'], ['Grafite', '#3b3f44', '#e45a24', '#ffffff'],
];
function shade(hex, amt) {
  const n = parseInt(String(hex || '#888888').slice(1), 16); const t = amt < 0 ? 0 : 255; const a = Math.abs(amt);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join('');
}
const hexOk = (h, d) => /^#[0-9a-fA-F]{6}$/.test(h || '') ? h : d;

function signSvg(c, b, night, slot) {
  const [, family, weight, k] = FONTES[c.fonte] || FONTES.sans;
  const placa = hexOk(c.corPlaca, CR_DEF.corPlaca), letra = hexOk(c.corLetra, CR_DEF.corLetra);
  const nome = (c.nome || '').trim() || 'Nome da sua loja';
  const slogan = (c.slogan || '').trim();
  let { x, y, w, h } = b; let out = '';
  let tb = { x, y, w, h }; // área do texto
  if (c.estilo === 'toldo') {
    const over = w * .04, stripeH = h * .55, val = h * .45;
    const sw = (w + 2 * over) / 12;
    let stripes = '';
    for (let i = 0; i < 12; i++) stripes += `<rect x="${x - over + i * sw}" y="${y}" width="${sw + .5}" height="${stripeH}" fill="${i % 2 ? '#f4f1ea' : placa}"/>`;
    out += `<clipPath id="aw"><path d="M${x} ${y}H${x + w}L${x + w + over} ${y + stripeH}H${x - over}Z"/></clipPath><g clip-path="url(#aw)">${stripes}</g>`;
    out += `<path d="M${x} ${y}H${x + w}L${x + w + over} ${y + stripeH}H${x - over}Z" fill="#000" opacity=".12"/>`;
    out += `<rect x="${x - over}" y="${y + stripeH}" width="${w + 2 * over}" height="${val}" fill="${placa}"/>`;
    const nS = 10, sR = (w + 2 * over) / nS / 2;
    for (let i = 0; i < nS; i++) out += `<circle cx="${x - over + sR + i * sR * 2}" cy="${y + stripeH + val}" r="${sR}" fill="${placa}"/>`;
    out += `<rect x="${x - over}" y="${y + h + sR}" width="${w + 2 * over}" height="${h * .12}" fill="#000" opacity=".16"/>`;
    tb = { x, y: y + stripeH, w, h: val };
  } else if (c.estilo === 'acm') {
    out += `<rect x="${x}" y="${y + h}" width="${w}" height="${h * .07}" fill="#000" opacity=".18"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${placa}"/><rect x="${x}" y="${y}" width="${w}" height="${h * .08}" fill="#fff" opacity=".13"/>`;
    if (night) {
      for (let i = 0; i < 3; i++) { const cx = x + w * (i + .5) / 3; out += `<rect x="${cx - 14}" y="${y - 26}" width="28" height="12" rx="3" fill="#2a2a2a"/><path d="M${cx - 10} ${y - 14}L${cx - w / 5} ${y + h}H${cx + w / 5}L${cx + 10} ${y - 14}Z" fill="url(#spot)"/>`; }
    }
  } else if (c.estilo === 'luminoso') {
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * .12}" fill="url(#lum)" stroke="${shade(placa, -.35)}" stroke-width="6" ${night ? 'filter="url(#glowBig)"' : ''}/>`;
  } else if (c.estilo === 'neon') {
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * .1}" fill="${shade(placa, -.55)}" stroke="${shade(placa, -.75)}" stroke-width="4"/>`;
  }
  // texto (com logo à esquerda, se houver)
  const pad = tb.h * .13;
  let ax = tb.x + pad, aw = tb.w - 2 * pad; const ay = tb.y + pad, ah = tb.h - 2 * pad;
  if (c.logo) {
    const ar = Math.max(.6, Math.min(2.6, c._logoAR || 1)); const L = ah;
    const Lw = Math.min(L * ar, aw * .4);
    if (slot) { slot.logo = { x: ax, y: ay, L: Lw, H: L }; ax += Lw + pad; aw -= Lw + pad; }
    else // desenhada direto no canvas
    { out += `<image href="${c.logo}" x="${ax}" y="${ay}" width="${L}" height="${L}" preserveAspectRatio="xMidYMid meet"/>`; ax += L + pad; aw -= L + pad; }
  }
  const len = Math.max(nome.length, 4);
  let ns = Math.min(ah * (slogan ? .6 : .8), aw / (len * k));
  let ss = slogan ? Math.min(ns * .45, ah * .26, aw / (Math.max(slogan.length, 4) * .52)) : 0;
  const gap = slogan ? ns * .22 : 0;
  const block = ns * .74 + (slogan ? gap + ss * .74 : 0);
  const cx = ax + aw / 2; const top = ay + (ah - block) / 2;
  const nb = top + ns * .74, sb = nb + gap + ss * .74;
  const T = (txt, size, base, extra, fam = family, wt = weight) => `<text x="${cx.toFixed(1)}" y="${base.toFixed(1)}" text-anchor="middle" font-family="${esc(fam)}" font-weight="${wt}" font-size="${size.toFixed(1)}" ${extra}>${esc(txt)}</text>`;
  const sloganTxt = slogan ? T(slogan, ss, sb, `fill="${letra}" opacity=".9" letter-spacing="${(ss * .06).toFixed(1)}"`, 'Arial, Helvetica, sans-serif', 400) : '';
  if (c.estilo === 'caixa') {
    const d = ns * .05;
    out += T(nome, ns, nb + d, `fill="${shade(letra, -.5)}" transform="translate(${d * .6} 0)"`);
    out += `<g ${night ? 'filter="url(#glow)"' : ''}>${T(nome, ns, nb, `fill="${letra}"`)}${sloganTxt}</g>`;
  } else if (c.estilo === 'neon') {
    out += `<g filter="url(#${night ? 'glowBig' : 'glow'})">${T(nome, ns, nb, `fill="none" stroke="${letra}" stroke-width="${(ns * .055).toFixed(1)}" stroke-linejoin="round"`)}${T(nome, ns, nb, `fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="${(ns * .018).toFixed(1)}"`)}${sloganTxt}</g>`;
  } else {
    out += `<g ${night && c.estilo === 'luminoso' ? 'filter="url(#glow)"' : ''}>${T(nome, ns, nb, `fill="${letra}"`)}${sloganTxt}</g>`;
  }
  return out;
}

function crDefs(c, night) {
  const placa = hexOk(c.corPlaca, CR_DEF.corPlaca);
  return `<defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d7381"/><stop offset="1" stop-color="#2f4049"/></linearGradient>
    <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a6"/><stop offset="1" stop-color="#c98a3e"/></linearGradient>
    <linearGradient id="lum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(placa, night ? .45 : .2)}"/><stop offset="1" stop-color="${night ? shade(placa, .1) : placa}"/></linearGradient>
    <linearGradient id="spot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".3"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glowBig" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
}
function facadeSvg(c) {
  const night = c.noite === 'noite';
  const fach = hexOk(c.corFachada, CR_DEF.corFachada), placa = hexOk(c.corPlaca, CR_DEF.corPlaca), letra = hexOk(c.corLetra, CR_DEF.corLetra);
  let W = 1200, H = 800, walls = '', openings = '', box;
  const sky = night ? '#121a2b' : '#d6dee3';
  const ground = `<rect x="0" y="680" width="${W}" height="120" fill="${night ? '#3c3a37' : '#a9a49c'}"/><rect x="0" y="680" width="${W}" height="8" fill="#000" opacity=".12"/>`;
  const frame = '#262626';
  const win = (x, y, w, h, f = frame) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/><rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="url(#${night ? 'gw' : 'gl'})"/>`;
  if (c.modelo === 'foto') {
    if (c.foto && c.fotoW) {
      W = c.fotoW; H = c.fotoH;
      walls = `<image href="${c.foto}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
    } else {
      walls = `<rect width="${W}" height="${H}" fill="#cfccc6"/><text x="600" y="380" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#6d6a66">Envie uma foto do seu ponto</text><text x="600" y="430" text-anchor="middle" font-family="Arial" font-size="26" fill="#6d6a66">pode ser a loja vazia, em obra ou só a parede</text>`;
    }
    const bw = W * c.pw / 100, bh = bw * c.ph / 100;
    box = { x: W * c.px / 100 - bw / 2, y: H * c.py / 100 - bh / 2, w: bw, h: bh };
  } else if (c.modelo === 'galeria') {
    walls = `<rect width="${W}" height="${H}" fill="${sky}"/><rect x="0" y="140" width="${W}" height="540" fill="#cfc8bc"/><rect x="0" y="140" width="${W}" height="24" fill="#b5ad9f"/>
      <rect x="360" y="164" width="480" height="516" fill="${fach}"/><rect x="345" y="164" width="18" height="516" fill="#a39b8e"/><rect x="837" y="164" width="18" height="516" fill="#a39b8e"/>
      <rect x="70" y="250" width="230" height="90" fill="#9d968b"/><rect x="900" y="250" width="230" height="90" fill="#9d968b"/><rect x="0" y="390" width="${W}" height="22" fill="#8d877e"/>`;
    openings = `<rect x="40" y="430" width="290" height="250" fill="#6f767b"/><rect x="870" y="430" width="290" height="250" fill="#6f767b"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="40" y="${440 + i * 34}" width="290" height="3" fill="#5c6267"/><rect x="870" y="${440 + i * 34}" width="290" height="3" fill="#5c6267"/>`).join('')}
      <rect x="400" y="430" width="400" height="250" fill="${frame}"/><rect x="410" y="440" width="380" height="70" fill="#8f969b"/>${[0, 1, 2, 3].map((i) => `<rect x="410" y="${448 + i * 16}" width="380" height="3" fill="#767d82"/>`).join('')}
      <rect x="410" y="510" width="185" height="170" fill="url(#${night ? 'gw' : 'gl'})"/><rect x="605" y="510" width="185" height="170" fill="url(#${night ? 'gw' : 'gl'})"/>`;
    box = { x: 385, y: 232, w: 430, h: 128 };
  } else if (c.modelo === 'sobrado') {
    walls = `<rect width="${W}" height="${H}" fill="${sky}"/><rect x="0" y="120" width="300" height="560" fill="#b7aea3"/><rect x="900" y="90" width="300" height="590" fill="#c4bdb2"/>
      <rect x="300" y="60" width="600" height="620" fill="${fach}"/><rect x="290" y="50" width="620" height="26" fill="${shade(fach, -.25)}"/><rect x="300" y="438" width="600" height="14" fill="${shade(fach, -.18)}"/>`;
    openings = `${win(370, 130, 190, 200)}${win(640, 130, 190, 200)}<rect x="360" y="330" width="210" height="12" fill="${shade(fach, -.3)}"/><rect x="630" y="330" width="210" height="12" fill="${shade(fach, -.3)}"/>
      ${win(370, 470, 240, 210)}<rect x="485" y="480" width="10" height="200" fill="${frame}"/>${win(650, 480, 190, 150)}`;
    box = { x: 335, y: 345, w: 530, h: 85 };
  } else {
    walls = `<rect width="${W}" height="${H}" fill="${sky}"/><rect x="0" y="40" width="150" height="640" fill="#b7aea3"/><rect x="1050" y="60" width="150" height="620" fill="#c4bdb2"/>
      <rect x="150" y="30" width="900" height="650" fill="${fach}"/><rect x="150" y="30" width="60" height="650" fill="${shade(fach, -.12)}"/><rect x="990" y="30" width="60" height="650" fill="${shade(fach, -.12)}"/>`;
    openings = `${win(300, 110, 190, 180)}${win(710, 110, 190, 180)}${win(225, 465, 430, 215)}<rect x="730" y="450" width="230" height="230" fill="${frame}"/><rect x="742" y="462" width="100" height="218" fill="url(#${night ? 'gw' : 'gl'})"/><rect x="848" y="462" width="100" height="218" fill="url(#${night ? 'gw' : 'gl'})"/>`;
    box = { x: 290, y: 325, w: 620, h: 112 };
  }
  const defs = crDefs(c, night);
  const dark = night ? `<rect width="${W}" height="${H}" fill="#0b1020" opacity="${c.modelo === 'foto' ? .55 : .5}"/>` : '';
  const ground2 = c.modelo === 'foto' ? '' : ground;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">${defs}${walls}${ground2}${dark}${openings}${signSvg(c, box, night)}</svg>`;
  return { svg, w: W, h: H };
}
// ====================================================================
// Mockups com fotos reais: a placa é aplicada em perspectiva sobre a foto
// ====================================================================
// quad = cantos da área da placa (sup. esq., sup. dir., inf. dir., inf. esq.) em pixels da foto original
const MOCKUPS = {
  mk_verde: { nome: 'Loja clássica', src: '/static/mockups/fachada-verde.jpg', w: 1600, h: 949, quad: [[330, 140], [1245, 140], [1245, 214], [330, 214]], credito: 'Foto base: chris.rycroft, CC BY 2.0, via Wikimedia Commons (modificada)', parede: '#6f9466' },
  mk_azul: { nome: 'Fachada azul', src: '/static/mockups/fachada-azul.jpg', w: 1600, h: 1585, quad: [[398, 462], [1258, 462], [1258, 588], [398, 588]], credito: 'Foto base: Myotus, CC BY 4.0, via Wikimedia Commons (modificada)', parede: '#1f3556' },
  mk_tijolo: { nome: 'Prédio de tijolo', src: '/static/mockups/fachada-tijolo.jpg', w: 1600, h: 1087, quad: [[1045, 342], [1456, 459], [1457, 627], [1046, 585]], credito: 'Foto base: Myotus, CC BY 4.0, via Wikimedia Commons (modificada)', parede: '#d9d3c8' },
  mk_bairro: { nome: 'Loja de bairro', src: '/static/mockups/fachada-bairro.jpg', w: 1600, h: 1200, quad: [[174, 472], [1378, 472], [1378, 670], [174, 670]], credito: '', parede: '#ece6d6', cobrir: '#ece6d6', overlay: 0 },
};
const isMock = (m) => !!MOCKUPS[m];
const imgCache = {};
function loadImg(src) {
  if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => { delete imgCache[src]; rej(new Error('Não foi possível carregar a foto.')); }; i.src = src; });
  return imgCache[src];
}
function svgToImg(svg) { return loadImgOnce('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)); }
function loadImgOnce(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível gerar a imagem.')); i.src = src; }); }

// Homografia (4 pontos -> 4 pontos)
function homography(s, d) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = s[i], [u, v] = d[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) { // eliminação de Gauss
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return ([x, y]) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
}
function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
  // expande um pouco o triângulo de destino para não aparecer costura
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const ex = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * .7, p[1] + dy / l * .7]; };
  const [e0, e1, e2] = [ex(d0), ex(d1), ex(d2)];
  ctx.save(); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
  const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2;
  const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (!den) { ctx.restore(); return; }
  const a = ((d1[0] - d0[0]) * (y2 - y0) - (d2[0] - d0[0]) * (y1 - y0)) / den;
  const c = ((d2[0] - d0[0]) * (x1 - x0) - (d1[0] - d0[0]) * (x2 - x0)) / den;
  const bb = ((d1[1] - d0[1]) * (y2 - y0) - (d2[1] - d0[1]) * (y1 - y0)) / den;
  const dd = ((d2[1] - d0[1]) * (x1 - x0) - (d1[1] - d0[1]) * (x2 - x0)) / den;
  ctx.transform(a, bb, c, dd, d0[0] - a * x0 - c * y0, d0[1] - bb * x0 - dd * y0);
  ctx.drawImage(img, 0, 0); ctx.restore();
}
function warp(ctx, tex, tw, th, quad) {
  const H = homography([[0, 0], [tw, 0], [tw, th], [0, th]], quad);
  const nx = 24, ny = 6;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x0 = tw * i / nx, x1 = tw * (i + 1) / nx, y0 = th * j / ny, y1 = th * (j + 1) / ny;
    const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; const q = p.map(H);
    drawTri(ctx, tex, p[0], p[1], p[2], q[0], q[1], q[2]);
    drawTri(ctx, tex, p[0], p[2], p[3], q[0], q[2], q[3]);
  }
}
const quadPath = (ctx, q) => { ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); };

// Desenha a fachada (foto real, foto do cliente ou desenho) em um canvas
async function renderFachada(c, maxSide = 2000) {
  const night = c.noite === 'noite';
  let img, W, H, quad, credito = '';
  if (isMock(c.modelo)) {
    const m = MOCKUPS[c.modelo]; img = await loadImg(m.src);
    W = img.naturalWidth; H = img.naturalHeight; const kx = W / m.w, ky = H / m.h;
    quad = m.quad.map(([x, y]) => [x * kx, y * ky]); credito = m.credito;
  } else if (c.modelo === 'foto' && c.foto) {
    img = await loadImg(c.foto); W = img.naturalWidth; H = img.naturalHeight;
    const bw = W * c.pw / 100, bh = bw * c.ph / 100, x = W * c.px / 100 - bw / 2, y = H * c.py / 100 - bh / 2;
    quad = [[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]];
  } else {
    // desenho (reserva)
    const f = facadeSvg(c); const i = await svgToImg(f.svg);
    const s = Math.min(2, maxSide / Math.max(f.w, f.h));
    const cv = document.createElement('canvas'); cv.width = Math.round(f.w * s); cv.height = Math.round(f.h * s);
    cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height); return cv;
  }
  const s = Math.min(1.5, maxSide / Math.max(W, H));
  const cv = document.createElement('canvas'); cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const ctx = cv.getContext('2d'); ctx.scale(s, s);
  ctx.drawImage(img, 0, 0, W, H);
  if (night) { ctx.fillStyle = 'rgba(8,12,30,.58)'; ctx.fillRect(0, 0, W, H); }
  // tamanho real da placa
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const tw = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2, th = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const plate = ['acm', 'luminoso', 'toldo'].includes(c.estilo);
  // sombra da placa
  if (plate) {
    ctx.save(); ctx.filter = `blur(${Math.max(3, th * .06)}px)`; ctx.fillStyle = 'rgba(0,0,0,.35)';
    const dy = th * .07; quadPath(ctx, quad.map(([x, y]) => [x + th * .02, y + dy])); ctx.fill(); ctx.restore();
  }
  const mdef = MOCKUPS[c.modelo] || {};
  if (mdef.cobrir) { ctx.save(); ctx.fillStyle = mdef.cobrir; quadPath(ctx, quad); ctx.fill(); ctx.restore(); }
  // textura da placa (SVG em 2x)
  const k = Math.min(3, Math.max(1.5, 1800 / tw));
  const slot = {}; const c2 = Object.assign({}, c);
  if (c.logo) { try { const li0 = await loadLogo(c.logo); c2._logoAR = li0.naturalWidth / li0.naturalHeight; } catch (_) { /* sem logo */ } } if (c2.estilo === 'toldo' && tw / th > 9) c2.estilo = 'acm';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tw} ${th}" width="${Math.round(tw * k)}" height="${Math.round(th * k)}">${crDefs(c2, night)}${signSvg(c2, { x: 0, y: 0, w: tw, h: th }, night, slot)}</svg>`;
  const tex = await svgToImg(svg);
  const tc = document.createElement('canvas'); tc.width = tex.width; tc.height = tex.height; const tctx = tc.getContext('2d'); tctx.drawImage(tex, 0, 0);
  if (slot.logo && c.logo) {
    try {
      const li = await loadLogo(c.logo); const sx = tc.width / tw, sy = tc.height / th;
      const bw0 = slot.logo.L, bh0 = slot.logo.H, box = Math.min(bw0, bh0), r = Math.min(bw0 / li.naturalWidth, bh0 / li.naturalHeight);
      const lw = li.naturalWidth * r, lh = li.naturalHeight * r;
      const lx = slot.logo.x + (bw0 - lw) / 2, ly = slot.logo.y + (bh0 - lh) / 2;
      // contraste: logo escura em placa escura (ou clara em clara) ganha um fundo
      const lt = logoTom(li); const fundo = lum(hexOk(fundoLetra(c), '#1f2d3d'));
      if (lt != null && Math.abs(lt - fundo) < .35) {
        const pd = box * .08, bx = (lx - pd) * sx, by = (ly - pd) * sy, bw = (lw + 2 * pd) * sx, bh = (lh + 2 * pd) * sy, rr = Math.min(bw, bh) * .18;
        tctx.save(); tctx.fillStyle = lt < .5 ? '#ffffff' : '#141414';
        tctx.beginPath(); if (tctx.roundRect) tctx.roundRect(bx, by, bw, bh, rr); else tctx.rect(bx, by, bw, bh); tctx.fill(); tctx.restore();
      }
      if (c.estilo === 'caixa') { tctx.save(); tctx.globalAlpha = .45; tctx.filter = 'brightness(0)'; tctx.drawImage(li, (lx + lh * .04) * sx, (ly + lh * .04) * sy, lw * sx, lh * sy); tctx.restore(); }
      tctx.drawImage(li, lx * sx, ly * sy, lw * sx, lh * sy);
    } catch (e) { console.warn('logo', e); }
  }
  ctx.save(); ctx.scale(1, 1);
  // a textura está em k×; mapeia o retângulo (0..tw*k) para o quad
  warp(ctx, tc, tc.width, tc.height, quad);
  ctx.restore();
  // luz e textura da parede por cima (deixa a placa "assentada" na foto)
  ctx.save(); quadPath(ctx, quad); ctx.clip();
  try { ctx.filter = 'grayscale(1)'; } catch (_) { /* sem filtro */ }
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = mdef.overlay != null ? mdef.overlay : (plate ? .28 : .4);
  ctx.drawImage(img, 0, 0, W, H);
  ctx.restore();
  if (plate && !night) { // leve brilho no topo da placa
    ctx.save(); quadPath(ctx, quad); ctx.clip();
    const g = ctx.createLinearGradient(quad[0][0], quad[0][1], quad[3][0], quad[3][1]);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (credito) {
    const fs = Math.max(11, W * .009); ctx.font = `${fs}px Arial, sans-serif`; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,.45)'; const tw2 = ctx.measureText(credito).width;
    ctx.fillRect(W - tw2 - fs * 1.2, H - fs * 1.9, tw2 + fs * 1.2, fs * 1.9);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(credito, W - fs * .6, H - fs * .6);
  }
  return cv;
}

// recorta a área vazia (transparente ou fundo liso) em volta da logo
const logoCache = {};
function loadLogo(src) {
  if (!logoCache[src]) logoCache[src] = loadImg(src).then((img) => {
    try {
      const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, 1200 / Math.max(W, H));
      const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      let transp = false; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 200) { transp = true; break; }
      const bg = [d[0], d[1], d[2]];
      const vazio = (i) => transp ? d[i + 3] < 24 : (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 36);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (!vazio((yy * w + xx) * 4)) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 < 0) return mk(cv);
      const m = Math.round(Math.max(x1 - x0, y1 - y0) * .04);
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
      const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      return mk(out);
    } catch (_) { return img; }
    function mk(c) { c.naturalWidth = c.width; c.naturalHeight = c.height; return c; }
  });
  return logoCache[src];
}
function logoTom(img) {
  try {
    const n = 48, cv = document.createElement('canvas'); cv.width = n; cv.height = n; const x = cv.getContext('2d');
    x.drawImage(img, 0, 0, n, n); const d = x.getImageData(0, 0, n, n).data; let t = 0, k = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { t += (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) / 255; k++; }
    return k ? t / k : null;
  } catch (_) { return null; }
}
const fundoLetra = (c) => c.estilo === 'caixa' ? (isMock(c.modelo) ? MOCKUPS[c.modelo].parede : c.corFachada) : c.corPlaca;
async function fileToDataUrl(file, max, type) {
  if (window.createImageBitmap) {
    try {
      const bm = await createImageBitmap(file);
      const s = Math.min(1, max / Math.max(bm.width, bm.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s);
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); if (bm.close) bm.close();
      return { url: cv.toDataURL(type, .86), w: cv.width, h: cv.height };
    } catch (_) { /* tenta pelo caminho antigo */ }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      res({ url: cv.toDataURL(type, .86), w: cv.width, h: cv.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (.299 * ((n >> 16) & 255) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255; };
const legivel = (fundo, letra) => Math.abs(lum(fundo) - lum(letra)) > .4 ? letra : (lum(fundo) > .55 ? '#111111' : '#ffffff');
// ====================================================================
// Interface do simulador
// ====================================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

let c = (() => { let x; try { x = Object.assign({}, CR_DEF, JSON.parse(localStorage.getItem('fv-criador') || '{}')); } catch (_) { x = Object.assign({}, CR_DEF); } if (!(x.modelo === 'foto' || isMock(x.modelo))) x.modelo = CR_DEF.modelo; return x; })();
function save() {
  try { localStorage.setItem('fv-criador', JSON.stringify(c)); }
  catch (_) { try { localStorage.setItem('fv-criador', JSON.stringify(Object.assign({}, c, { foto: null }))); } catch (__) { /* sem armazenamento */ } }
}

let tok = 0, raf = 0;
async function draw() {
  const el = $('#prev'); const t = ++tok; el.classList.add('busy');
  try {
    const cv = await renderFachada(c, 1400);
    if (t !== tok) return;
    el.innerHTML = ''; el.appendChild(cv); el.classList.remove('busy');
  } catch (e) { if (t === tok) { el.classList.remove('busy'); el.innerHTML = `<p class="small" style="padding:20px">${esc(e.message)}</p>`; } }
}
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };

function sync() {
  $$('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    if (el.type === 'radio') el.checked = String(c[k]) === el.value;
    else if (el.type !== 'file') el.value = c[k] ?? '';
  });
  $('#foto-box').hidden = c.modelo !== 'foto';
  $('#foto-btn').textContent = c.foto ? 'Trocar foto do ponto' : 'Enviar foto do ponto';
  $('#tile-foto-img').innerHTML = c.foto ? `<img src="${c.foto}" alt="">` : '<span class="tile-ph">+</span>';
  $('#logo-btn').textContent = c.logo ? 'Trocar logo' : 'Adicionar logo';
  $('#logo-thumb').innerHTML = c.logo ? `<img src="${c.logo}" alt="Logo carregada" class="logo-thumb">` : '';
  $('#logo-rm').hidden = !c.logo;
}

function saveFile(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  $('#tiles').insertAdjacentHTML('afterbegin', Object.entries(MOCKUPS).map(([k, m]) => `<label class="tile"><input type="radio" name="modelo" value="${k}" data-k="modelo"><img src="${m.src}" alt="" loading="lazy"><span>${esc(m.nome)}</span></label>`).join(''));
  $('#estilos').innerHTML = Object.entries(ESTILOS).map(([k, v]) => `<label class="chip"><input type="radio" name="estilo" value="${k}" data-k="estilo"><span>${v}</span></label>`).join('');
  $('#fontes').innerHTML = Object.entries(FONTES).map(([k, v]) => `<label class="chip"><input type="radio" name="fonte" value="${k}" data-k="fonte"><span>${v[0]}</span></label>`).join('');
  $('#paletas').innerHTML = PALETAS.map((p, i) => `<button type="button" class="pal" data-pal="${i}" aria-label="Paleta ${p[0]}"><span style="background:${p[1]}"></span><span style="background:${p[2]}"></span><span style="background:${p[3]}"></span><em>${p[0]}</em></button>`).join('');
  sync(); draw();
  $('#cr-form').addEventListener('submit', (e) => e.preventDefault());

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]'); if (!el || el.type === 'file') return;
    const k = el.dataset.k; c[k] = el.type === 'range' ? +el.value : el.value;
    if (k === 'nome') el.closest('.field').classList.remove('has-error');
    save(); if (k === 'modelo') sync(); schedule();
  });
  $('#paletas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pal]'); if (!b) return;
    const p = PALETAS[+b.dataset.pal]; Object.assign(c, { corFachada: p[1], corPlaca: p[2], corLetra: p[3] }); save(); sync(); schedule();
  });
  const fileIn = (sel, k) => $(sel).addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; const err = $(`[data-err="${k}"]`); err.hidden = true;
    if (!f) return;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (/hei[cf]/i.test(f.type + f.name)) return fail('Fotos HEIC não são aceitas. Envie em JPG.');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return fail('Envie JPG, PNG ou WEBP.');
    if (f.size > 20 * 1048576) return fail('Arquivo grande demais (máximo 20 MB).');
    try {
      if (k === 'foto') { const r = await fileToDataUrl(f, 1600, 'image/jpeg'); Object.assign(c, { foto: r.url, fotoW: r.w, fotoH: r.h, modelo: 'foto' }); }
      else { const r = await fileToDataUrl(f, 600, 'image/png'); c.logo = r.url; }
      save(); sync(); schedule();
    } catch (x) { fail(x.message); }
    e.target.value = '';
  });
  fileIn('#foto-in', 'foto'); fileIn('#logo-in', 'logo');
  $('#logo-rm').addEventListener('click', () => { c.logo = null; save(); sync(); schedule(); });

  $$('[data-baixar]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const cv = await renderFachada(c, 2000);
      const nome = (c.nome || 'minha-loja').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();
      cv.toBlob((bl) => saveFile(bl, `fachada-${nome}.jpg`), 'image/jpeg', .9);
    } finally { b.disabled = false; }
  }));
  $('#usar').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!(c.nome || '').trim()) { const n = $('#nome'); n.focus(); n.closest('.field').classList.add('has-error'); return; }
    b.disabled = true; b.textContent = 'Preparando…';
    try {
      const cv = await renderFachada(c, 1600);
      sessionStorage.setItem('fv-sim', cv.toDataURL('image/jpeg', .88));
      sessionStorage.setItem('fv-sim-nome', c.nome || '');
      location.href = '/pedidos/novo';
    } catch (x) { b.disabled = false; b.textContent = 'Usar no meu pedido'; window.alert('Não foi possível preparar a imagem: ' + x.message); }
  });
});
