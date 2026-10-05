import sharp from 'sharp';
const [dir, ...ids] = process.argv.slice(2);
for (const id of ids) {
  const A = await sharp(`${dir}/${id}.base.png`).raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(`${dir}/${id}.mui9.png`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = A.info;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    if (Math.abs(A.data[i]-B.data[i]) + Math.abs(A.data[i+1]-B.data[i+1]) + Math.abs(A.data[i+2]-B.data[i+2]) > 24) { if (x<x0)x0=x; if (y<y0)y0=y; if (x>x1)x1=x; if (y>y1)y1=y; }
  }
  const pad = 40; const l = Math.max(0, x0 - pad), t = Math.max(0, y0 - pad);
  const w = Math.min(W, x1 + pad) - l, h = Math.min(H, y1 + pad) - t;
  const opts = { raw: { width: W, height: H, channels: C } };
  const a = await sharp(A.data, opts).extract({ left: l, top: t, width: w, height: h }).png().toBuffer();
  const b = await sharp(B.data, opts).extract({ left: l, top: t, width: w, height: h }).png().toBuffer();
  const joined = await sharp({ create: { width: w * 2 + 12, height: h, channels: 3, background: '#ff00ff' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: w + 12, top: 0 }]).png().toBuffer();
  await sharp(joined).resize({ width: Math.min(1600, w * 2 + 12) }).png().toFile(`${dir}/${id}.crop.png`);
  console.log(id, `bbox ${l},${t} ${w}x${h}`);
}
