#!/usr/bin/env python3
"""Light pollution for Twilyte: satellite night lights -> Bortle tiles.

The Console shows how dark a place's sky is on the Bortle scale. It used to
be estimated from the populations of nearby towns (bortle-cities.bin), which
misses how brightly places are actually lit: Cherry Springs, Pennsylvania, a
Bortle 2 dark-sky park among small towns, came out 4. This builds the class
from what satellites measure instead, the way the light-pollution atlases do:

  1. the upward light each place gives off, from the VIIRS day/night band
     (NASA's Black Marble yearly composite, VNP46A4: NASA open data, no
     restrictions on use; or any single-band GeoTIFF of radiance in
     nW/cm^2/sr on a lat/lon grid, e.g. the Earth Observation Group's VNL);
  2. spread over the sky of everywhere within RMAX km by a light-spread
     kernel: Walker's law (glow falling as distance^-2.5), softened within
     D0 km and fading faster with distance (exp(-d/L)) as the light scatters
     out and the Earth curves away;
  3. scaled once, by fitting reference sites of known darkness, to the ratio
     of artificial to natural sky brightness, which gives a sky-quality
     reading in mag/arcsec^2 and so the Bortle class (SQM_BOUNDS).

Stages, each writing a file the next one reads, so a long step runs once:

  download  Black Marble VNP46A4 tiles from NASA LAADS; needs a free
            Earthdata token in EARTHDATA_TOKEN and network access to
            ladsweb.modaps.eosdis.nasa.gov
  grid      the tiles (or --geotiff FILE) -> radiance on a 1-arcminute grid
  sky       the light-spread model -> artificial sky glow (arbitrary units)
  calibrate fit the scale factor to reference-sites.json
  tiles     write lp/*.bin and lp/index.json for the app
  selftest  the model, the calibration and the tile format on synthetic data

Tiles are 10 x 10 degrees at 2 arcminutes (300 x 300 cells), each cell one
byte q = round(20 * (log10(ratio) + 3)), ratio being artificial over natural
sky brightness (q = 0: under 0.1% artificial). Rows run south to north,
columns west to east; run-length coded as milkyway.bin is: W, H as 16-bit
little-endian, then (value, count) pairs. Only tiles with some light are
written; lp/index.json lists them and the latitudes covered.

Requires Python 3 with numpy and scipy, plus h5py (Black Marble) or tifffile
(GeoTIFF): pip install numpy scipy h5py tifffile
"""
import argparse
import gzip
import json
import math
import os
import re
import shutil
import sys
import tempfile
import urllib.request

import numpy as np

# ---- The sky-quality scale ----------------------------------------------

NAT_SQM = 22.0  # a natural, moonless sky at the zenith, mag/arcsec^2
# SQM readings at the boundaries between Bortle classes 1|2 ... 8|9. The
# first seven are the commonly used table (Wikipedia's Bortle scale article
# gives the same); 8 and 9 share "below 18.38" there, so 18.0 splits them.
SQM_BOUNDS = [21.99, 21.89, 21.69, 20.49, 19.50, 18.94, 18.38, 18.00]


def ratio_of_sqm(sqm):
    """Artificial over natural brightness for a total sky reading."""
    return 10 ** ((NAT_SQM - sqm) / 2.5) - 1


def sqm_of_ratio(ratio):
    return NAT_SQM - 2.5 * np.log10(1 + np.asarray(ratio, dtype=float))


RATIO_BOUNDS = [ratio_of_sqm(s) for s in SQM_BOUNDS]


def bortle_of_ratio(ratio):
    r = np.asarray(ratio, dtype=float)
    return 1 + np.searchsorted(RATIO_BOUNDS, r, side='right')


def q_of_ratio(ratio):
    r = np.maximum(np.asarray(ratio, dtype=float), 1e-12)
    return np.clip(np.round(20 * (np.log10(r) + 3)), 0, 255).astype(np.uint8)


def ratio_of_q(q):
    q = np.asarray(q, dtype=float)
    return np.where(q > 0, 10 ** (q / 20 - 3), 0.0)


# ---- Grids ---------------------------------------------------------------

GRID = 60       # working grid, cells per degree (1 arcminute, 1.85 km)
OUT = 30        # tile grid, cells per degree (2 arcminutes, 3.7 km)
TILE = 10       # tile size, degrees
KM_PER_DEG = 111.195


def downsample_into(acc, cnt, block, row0, col0, f):
    """Add a block of fine cells (row0, col0 in fine units) into the coarse
    accumulators, f fine cells to a coarse one."""
    # Only what falls on the grid (a file may reach past its latitudes).
    top, bot = max(0, -row0), min(block.shape[0], acc.shape[0] * f - row0)
    lft, rgt = max(0, -col0), min(block.shape[1], acc.shape[1] * f - col0)
    if top >= bot or lft >= rgt:
        return
    block, row0, col0 = block[top:bot, lft:rgt], row0 + top, col0 + lft
    h, w = block.shape
    b = np.nan_to_num(block.astype(np.float64), nan=0.0, posinf=0.0, neginf=0.0)
    b[b < 0] = 0
    if row0 % f == 0 and col0 % f == 0 and h % f == 0 and w % f == 0:
        # Aligned (Black Marble tiles, whole-strip reads): sum by reshaping.
        r, c = row0 // f, col0 // f
        acc[r:r + h // f, c:c + w // f] += b.reshape(h // f, f, w // f, f).sum(axis=(1, 3))
        cnt[r:r + h // f, c:c + w // f] += f * f
        return
    # Anything else: coarse cell by index, partial edges carried.
    rr = (row0 + np.arange(h)) // f
    cc = (col0 + np.arange(w)) // f
    # Sum rows into coarse rows, then columns into coarse columns.
    urr, ri = np.unique(rr, return_inverse=True)
    ucc, ci = np.unique(cc, return_inverse=True)
    s = np.zeros((len(urr), w))
    np.add.at(s, ri, b)
    t = np.zeros((len(urr), len(ucc)))
    np.add.at(t.T, ci, s.T)
    n = np.zeros((len(urr), len(ucc)))
    np.add.at(n, (ri[:, None], ci[None, :]), 1)
    acc[np.ix_(urr, ucc)] += t
    cnt[np.ix_(urr, ucc)] += n


def grid_from_geotiff(path, lat_s, lat_n):
    """Mean radiance on the 1' grid from one lat/lon GeoTIFF (.tif or
    .tif.gz), read a strip or tile at a time."""
    import tifffile
    if path.endswith('.gz'):
        tmp = tempfile.NamedTemporaryFile(suffix='.tif', delete=False)
        with gzip.open(path, 'rb') as src:
            shutil.copyfileobj(src, tmp, 1 << 24)
        tmp.close()
        path = tmp.name
    with tifffile.TiffFile(path) as tf:
        page = tf.pages[0]
        tags = page.tags
        scale = tags['ModelPixelScaleTag'].value
        tie = tags['ModelTiepointTag'].value
        dx, dy = scale[0], scale[1]
        lon0, lat0 = tie[3], tie[4]  # the top-left corner
        f = int(round((1 / GRID) / dx))
        if f < 1 or abs(f * dx - 1 / GRID) > 1e-6 or abs(dx - dy) > 1e-9:
            raise SystemExit(f'expected square pixels dividing 1 arcminute; got {dx} x {dy}')
        rows = (lat_n - lat_s) * GRID
        acc = np.zeros((rows, 360 * GRID))
        cnt = np.zeros_like(acc)
        # Fine row r lies at latitude lat0 - (r + 0.5) dy; on the 1' grid,
        # row 0 is the southernmost, so flip after accumulating.
        row_off = int(round((lat0 - lat_n) / dy))  # fine rows above lat_n
        col_off = int(round((lon0 + 180) / dx))
        if page.is_memmappable:
            # Uncompressed (as EOG's .tif.gz unpack): whole rows of f-row
            # chunks, so every read takes the aligned path.
            mm = page.asarray(out='memmap')
            step = f * 240
            start = (-row_off) % f
            if start:
                downsample_into(acc, cnt, mm[:start], row_off, col_off, f)
            for y in range(start, mm.shape[0], step):
                blk = np.asarray(mm[y:y + step])
                downsample_into(acc, cnt, blk, y + row_off, col_off, f)
            segs = []
        else:
            segs = page.segments()
        for seg, idx, shape in segs:
            if seg is None:
                continue
            y0, x0 = idx[-3], idx[-2]  # (..., y, x, sample) in tifffile
            block = np.asarray(seg).reshape(shape[-3], shape[-2])
            downsample_into(acc, cnt, block, y0 + row_off, x0 + col_off, f)
    grid = np.divide(acc, cnt, out=np.zeros_like(acc), where=cnt > 0)
    return np.flipud(grid).astype(np.float32)


BM_VAR = 'NearNadir_Composite_Snow_Free'
BM_FILL = 65535


def bm_dataset(hf, var, name):
    """The dataset named var wherever it sits in an HDF-EOS file."""
    found = []
    hf.visititems(lambda k, o: found.append(k) if k.endswith('/' + var) else None)
    if not found:
        raise SystemExit(f'{name}: no dataset named {var}')
    return hf[found[0]]


def slim_black_marble(src, dest, var=BM_VAR):
    """Copy only the one dataset grid reads, with its attributes, compressed:
    a whole VNP46A4 tile carries a couple of dozen layers, and the set of
    them is more disk than a CI runner has."""
    import h5py
    with h5py.File(src, 'r') as hf:
        ds = bm_dataset(hf, var, os.path.basename(dest))
        with h5py.File(dest + '.slim', 'w') as out:
            o = out.create_dataset('slim/' + var, data=ds[()], chunks=True,
                                   compression='gzip', compression_opts=6, shuffle=True)
            for k, v in ds.attrs.items():
                o.attrs[k] = v
    os.replace(dest + '.slim', dest)


def grid_from_black_marble(folder, lat_s, lat_n, var=BM_VAR):
    """Mean radiance on the 1' grid from VNP46A4 tiles (hXXvYY, 10 x 10
    degrees, 2400 x 2400 cells of 15 arcseconds, v00 at the north pole)."""
    import h5py
    rows = (lat_n - lat_s) * GRID
    acc = np.zeros((rows, 360 * GRID))
    cnt = np.zeros_like(acc)
    names = sorted(n for n in os.listdir(folder) if n.endswith('.h5'))
    if not names:
        raise SystemExit(f'no .h5 files in {folder}')
    for name in names:
        m = re.search(r'\.h(\d\d)v(\d\d)\.', name)
        if not m:
            continue
        h, v = int(m.group(1)), int(m.group(2))
        north = 90 - 10 * v
        west = -180 + 10 * h
        with h5py.File(os.path.join(folder, name), 'r') as hf:
            ds = bm_dataset(hf, var, name)
            raw = ds[()].astype(np.float64)
            fill = ds.attrs.get('_FillValue', BM_FILL)
            fill = float(np.ravel(fill)[0])
            sc = float(np.ravel(ds.attrs.get('scale_factor', 1.0))[0])
            off = float(np.ravel(ds.attrs.get('add_offset', 0.0))[0])
            data = np.where(raw == fill, 0.0, raw * sc + off)
        f = data.shape[0] // (10 * GRID)  # 4 for 15" cells
        # The tile's top row is at `north`; our grid's fine rows count down
        # from lat_n.
        row0 = int(round((lat_n - north) * GRID * f))
        col0 = int(round((west + 180) * GRID * f))
        if north <= lat_s or north - 10 >= lat_n:
            continue
        downsample_into(acc, cnt, data, row0, col0, f)
        print(f'  {name}: {np.count_nonzero(data)} lit cells', file=sys.stderr)
    grid = np.divide(acc, cnt, out=np.zeros_like(acc), where=cnt > 0)
    return np.flipud(grid).astype(np.float32)


# ---- The light-spread model ---------------------------------------------

D0 = 1.0      # km: near-field softening (a cell's own light, half a cell)
L = 100.0     # km: extra fall-off with distance
RMAX = 250.0  # km: beyond this, glow is left out
FLOOR = 0.5   # nW/cm^2/sr: below this, a cell counts as unlit (sensor noise)


def kernel(d, d0=D0, l=L):
    """Sky glow at distance d (km) from a unit of upward light."""
    d = np.asarray(d, dtype=float)
    return (d * d + d0 * d0) ** -1.25 * np.exp(-d / l)


def sky_glow(rad, lat_s, d0=D0, l=L, rmax=RMAX, floor=FLOOR, band_deg=1):
    """Artificial sky glow on the 1' grid: every lit cell's light (radiance
    times its area) spread by the kernel, a latitude band at a time with the
    band's own east-west cell size, wrapping round in longitude. One-degree
    bands keep that width within 1.5% of each row's own at 60 degrees."""
    from scipy.signal import fftconvolve
    rows, cols = rad.shape
    src = np.where(rad >= floor, rad, 0).astype(np.float64)
    cell_ns = KM_PER_DEG / GRID
    lats = lat_s + (np.arange(rows) + 0.5) / GRID
    src *= (cell_ns * cell_ns * np.cos(np.radians(lats)))[:, None]  # area, km^2
    out = np.zeros((rows, cols), dtype=np.float32)
    band = band_deg * GRID
    ry = int(math.ceil(rmax / cell_ns))
    for r0 in range(0, rows, band):
        r1 = min(rows, r0 + band)
        mid = lat_s + (r0 + r1) / 2 / GRID
        cell_ew = cell_ns * max(math.cos(math.radians(mid)), 0.05)
        rx = min(int(math.ceil(rmax / cell_ew)), cols // 2)
        yy = np.arange(-ry, ry + 1)[:, None] * cell_ns
        xx = np.arange(-rx, rx + 1)[None, :] * cell_ew
        d = np.sqrt(xx * xx + yy * yy)
        k = np.where(d <= rmax, kernel(d, d0, l), 0.0)
        a0, a1 = max(0, r0 - ry), min(rows, r1 + ry)
        piece = src[a0:a1]
        if not piece.any():
            continue
        piece = np.concatenate([piece[:, -rx:], piece, piece[:, :rx]], axis=1)
        pad_top, pad_bot = ry - (r0 - a0), ry - (a1 - r1)
        piece = np.pad(piece, ((pad_top, pad_bot), (0, 0)))
        conv = fftconvolve(piece, k, mode='valid')
        out[r0:r1] = conv.astype(np.float32)
    return out


# ---- Calibration ---------------------------------------------------------

def glow_at(glow, lat_s, lat, lon):
    r = int((lat - lat_s) * GRID)
    c = int((lon + 180) * GRID) % glow.shape[1]
    if r < 0 or r >= glow.shape[0]:
        return None
    return float(glow[r, c])


def calibrate(glow, lat_s, sites):
    """The one scale factor from glow to ratio that puts the most reference
    sites inside their Bortle range, ties broken by how near each lands to
    the middle of its range (in log ratio)."""
    pts = []
    for s in sites:
        g = glow_at(glow, lat_s, s['lat'], s['lon'])
        if g is not None:
            pts.append((s, g))
    best = None
    for lc in np.arange(-12, 6, 0.01):
        c = 10 ** lc
        miss, err = 0, 0.0
        for s, g in pts:
            lo, hi = s['bortle']
            b = int(bortle_of_ratio(c * g))
            miss += b < lo or b > hi
            mid = math.log10(max(1e-4, math.sqrt(
                (RATIO_BOUNDS[lo - 2] if lo > 1 else 1e-3) *
                (RATIO_BOUNDS[hi - 1] if hi < 9 else 100))))
            err += (math.log10(max(1e-4, c * g)) - mid) ** 2
        key = (miss, err)
        if best is None or key < best[0]:
            best = (key, c)
    return best[1], best[0][0], pts


# ---- Tiles ---------------------------------------------------------------

def rle(values):
    out = bytearray()
    v = np.asarray(values, dtype=np.uint8).ravel()
    i = 0
    n = len(v)
    while i < n:
        j = i
        while j < n and j - i < 255 and v[j] == v[i]:
            j += 1
        out += bytes((int(v[i]), j - i))
        i = j
    return bytes(out)


def unrle(buf):
    w, h = buf[0] | buf[1] << 8, buf[2] | buf[3] << 8
    v = np.zeros(w * h, dtype=np.uint8)
    k = 0
    for i in range(4, len(buf) - 1, 2):
        v[k:k + buf[i + 1]] = buf[i]
        k += buf[i + 1]
    assert k == w * h, 'run lengths do not fill the tile'
    return v.reshape(h, w)


def tile_name(lat, lon):
    return f'{lat}_{lon}'


def write_tiles(glow, lat_s, lat_n, c, outdir, meta):
    """glow on the 1' grid -> ratio -> 2' tiles of q."""
    f = GRID // OUT
    rows, cols = glow.shape
    g2 = glow[:rows // f * f, :cols // f * f].reshape(rows // f, f, cols // f, f).mean(axis=(1, 3))
    q = q_of_ratio(c * g2)
    os.makedirs(outdir, exist_ok=True)
    names, total = [], 0
    n = TILE * OUT
    for lat in range(math.floor(lat_s / TILE) * TILE, lat_n, TILE):
        for lon in range(-180, 180, TILE):
            t = np.zeros((n, n), dtype=np.uint8)
            r0 = (lat - lat_s) * OUT
            for j in range(n):
                r = r0 + j
                if 0 <= r < q.shape[0]:
                    c0 = (lon + 180) * OUT
                    t[j] = q[r, c0:c0 + n]
            if not t.any():
                continue
            body = bytes((n & 255, n >> 8, n & 255, n >> 8)) + rle(t)
            name = tile_name(lat, lon)
            with open(os.path.join(outdir, name + '.bin'), 'wb') as fh:
                fh.write(body)
            names.append(name)
            total += len(body)
    index = dict(meta, v=1, tile=TILE, res=OUT, lat=[lat_s, lat_n], tiles=names)
    with open(os.path.join(outdir, 'index.json'), 'w') as fh:
        json.dump(index, fh, separators=(',', ':'))
    return names, total


# ---- Download ------------------------------------------------------------

LAADS = 'https://ladsweb.modaps.eosdis.nasa.gov/archive/allData'


def fetch(req, dest=None, tries=5):
    """A request's body (or, with dest, written to that file), retrying
    network failures and server errors with a doubling wait. A 4xx other
    than 429 is the request's fault and fails at once."""
    import time
    import urllib.error
    for k in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                if dest is None:
                    return r.read()
                with open(dest, 'wb') as fh:
                    shutil.copyfileobj(r, fh, 1 << 20)
                return None
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429 or k == tries - 1:
                raise SystemExit(f'{req.full_url}: HTTP {e.code} {e.reason}')
        except OSError as e:
            if k == tries - 1:
                raise SystemExit(f'{req.full_url}: {e}')
        print(f'  retrying {req.full_url} in {2 ** (k + 1)} s', file=sys.stderr)
        time.sleep(2 ** (k + 1))


def download(year, collection, outdir, slim=None):
    token = os.environ.get('EARTHDATA_TOKEN')
    if not token:
        raise SystemExit('Set EARTHDATA_TOKEN (urs.earthdata.nasa.gov > Generate Token).')
    auth = {'Authorization': 'Bearer ' + token}
    base = f'{LAADS}/{collection}/VNP46A4/{year}/001'
    listing = json.loads(fetch(urllib.request.Request(base + '.json', headers=auth)))
    files = listing.get('content', listing) if isinstance(listing, dict) else listing
    names = [f['name'] for f in files if f.get('name', '').endswith('.h5')]
    if not names:
        raise SystemExit(f'{base}.json lists no .h5 files')
    os.makedirs(outdir, exist_ok=True)
    for i, name in enumerate(names):
        dest = os.path.join(outdir, name)
        if os.path.exists(dest):
            continue
        fetch(urllib.request.Request(f'{base}/{name}', headers=auth), dest + '.part')
        if slim:
            slim_black_marble(dest + '.part', dest, slim)
            os.remove(dest + '.part')
        else:
            os.replace(dest + '.part', dest)
        print(f'  {i + 1}/{len(names)} {name}', file=sys.stderr)
    return names


# ---- Self-test on synthetic data -----------------------------------------

def selftest():
    import tifffile
    ok = True

    def check(cond, what):
        nonlocal ok
        print(('ok   ' if cond else 'FAIL ') + what)
        ok = ok and bool(cond)

    # The scale: Bortle from ratio at and around each boundary.
    for i, rb in enumerate(RATIO_BOUNDS):
        check(bortle_of_ratio(rb * 0.99) == i + 1 and bortle_of_ratio(rb * 1.01) == i + 2,
              f'Bortle {i + 1}|{i + 2} at ratio {rb:.4g} (SQM {SQM_BOUNDS[i]})')
    check(abs(sqm_of_ratio(ratio_of_sqm(20.5)) - 20.5) < 1e-9, 'SQM <-> ratio round trip')
    qs = np.arange(1, 200)
    check(np.all(q_of_ratio(ratio_of_q(qs)) == qs), 'q <-> ratio round trip')
    check(q_of_ratio(0) == 0 and q_of_ratio(5e-4) == 0, 'q = 0 means under 0.1% artificial')

    # The kernel: Walker's d^-2.5 where extinction is slight.
    d1, d2 = 10.0, 20.0
    slope = math.log(kernel(d2, 0, 1e9) / kernel(d1, 0, 1e9)) / math.log(d2 / d1)
    check(abs(slope + 2.5) < 1e-6, f"Walker's law, glow ~ d^{slope:.2f}")
    check(kernel(0) == D0 ** -2.5, 'finite at a lit cell itself')

    # One town on a 1' grid: glow falls off as the kernel does, the same
    # north-south and east-west (the band's own cell width), and wraps
    # across the date line.
    lat_s, lat_n = 30, 50
    rows, cols = (lat_n - lat_s) * GRID, 360 * GRID
    rad = np.zeros((rows, cols), dtype=np.float32)
    r_town, c_town = 10 * GRID + 30, 5  # 40.5 N, 179.9 W
    rad[r_town, c_town] = 1000
    glow = sky_glow(rad, lat_s)
    lat_t = lat_s + (r_town + 0.5) / GRID
    cell_ns = KM_PER_DEG / GRID
    for dist_cells in (10, 30, 60):
        north = glow[r_town + dist_cells, c_town]
        want = kernel(dist_cells * cell_ns) / kernel(0) * glow[r_town, c_town]
        check(abs(north / want - 1) < 0.02, f'{dist_cells * cell_ns:.0f} km north: {north / want:.3f} of the kernel')
    ew = int(round(30 * cell_ns / (cell_ns * math.cos(math.radians(lat_t)))))
    west = glow[r_town, (c_town - ew) % cols]
    north = glow[r_town + 30, c_town]
    check(abs(west / north - 1) < 0.05, f'as bright 55 km west (across the date line) as north: {west / north:.3f}')
    check(glow[r_town + 200, c_town] == 0 or glow[r_town + 200, c_town] < 1e-9 * glow[r_town, c_town],
          'nothing beyond RMAX')

    # Calibration: sites placed at known distances from the town recover the
    # scale they were made with.
    c_true = 3e-3
    sites = []
    for k, dist in enumerate((2, 20, 60, 120)):
        g = glow[r_town + dist, c_town]
        b = int(bortle_of_ratio(c_true * g))
        sites.append({'name': f's{k}', 'lat': lat_s + (r_town + dist + 0.5) / GRID,
                      'lon': -180 + (c_town + 0.5) / GRID, 'bortle': [b, b]})
    c_fit, miss, _ = calibrate(glow, lat_s, sites)
    check(miss == 0, f'calibration puts every site in its class (scale {c_fit:.3g}, made with {c_true:.3g})')

    # Tiles: written, read back, and the ratio at the town recovered to q's
    # resolution.
    with tempfile.TemporaryDirectory() as tmp:
        names, total = write_tiles(glow, lat_s, lat_n, c_true, tmp, {'source': 'selftest'})
        check(names == ['40_-180', '40_170'], f"the town's tile, and the one across the date line its glow reaches: {names}")
        with open(os.path.join(tmp, '40_-180.bin'), 'rb') as fh:
            t = unrle(fh.read())
        check(t.shape == (300, 300), 'a tile is 300 x 300')
        g2 = glow[r_town // 2 * 2:r_town // 2 * 2 + 2, 4:6].mean()
        tq = int(t[(r_town - (40 - lat_s) * GRID) // 2, c_town // 2])
        check(tq == int(q_of_ratio(c_true * g2)), 'the town cell reads back its q')
        idx = json.load(open(os.path.join(tmp, 'index.json')))
        check(idx['lat'] == [lat_s, lat_n] and idx['res'] == 30 and idx['tile'] == 10, 'index.json')
        print(f'     {total} bytes for the tile')

        # A GeoTIFF in, the same grid out: a 15" raster with one bright
        # 1' block, gzipped as the EOG files come.
        fine = np.zeros(((lat_n - lat_s) * 240, 360 * 240), dtype=np.float32)
        fr = int((lat_n - 40.5) * 240)  # a 1' block just south of 40.5 N
        fine[fr:fr + 4, 8:12] = 7.0
        tif = os.path.join(tmp, 'r.tif')
        tifffile.imwrite(tif, fine, rowsperstrip=240, extratags=[
            (33550, 'd', 3, (1 / 240, 1 / 240, 0.0)),
            (33922, 'd', 6, (0.0, 0.0, 0.0, -180.0, float(lat_n), 0.0))])
        with open(tif, 'rb') as a, gzip.open(tif + '.gz', 'wb') as b:
            shutil.copyfileobj(a, b)
        g = grid_from_geotiff(tif + '.gz', lat_s, lat_n)
        rr, cc = np.nonzero(g)
        check(len(rr) >= 1 and abs(g.max() - 7.0) < 1e-6 and g.sum() > 0,
              f'GeoTIFF block lands on the 1\' grid at {lat_s + (rr[0] + 0.5) / GRID:.3f}, {-180 + (cc[0] + 0.5) / GRID:.3f}')

        # A Black Marble tile in, laid out as VNP46A4's are: h08v05 is
        # 40-30 N, 100-90 W, 15" cells from the north-west corner, scaled
        # integers with a fill value. One 1' block, 2' south of 40 N and 5'
        # east of 100 W, lands there; fill reads as unlit; and the slimmed
        # copy download --slim keeps grids the same.
        import h5py
        bm, sl = os.path.join(tmp, 'bm'), os.path.join(tmp, 'slim')
        os.makedirs(bm), os.makedirs(sl)
        name = 'VNP46A4.A2024001.h08v05.002.2025001000000.h5'
        raw = np.full((2400, 2400), BM_FILL, dtype=np.uint16)
        raw[8:12, 20:24] = 70
        raw[100:200, 100:200] = 0  # measured dark, not fill
        with h5py.File(os.path.join(bm, name), 'w') as hf:
            ds = hf.create_dataset('HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields/' + BM_VAR, data=raw)
            ds.attrs['_FillValue'] = np.array([BM_FILL], dtype=np.uint16)
            ds.attrs['scale_factor'] = 0.1
            ds.attrs['add_offset'] = 0.0
            hf.create_dataset('HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields/Other', data=raw)
        g = grid_from_black_marble(bm, lat_s, lat_n)
        rr, cc = np.nonzero(g)
        where = f'{lat_s + (rr[0] + 0.5) / GRID:.3f}, {-180 + (cc[0] + 0.5) / GRID:.3f}' if len(rr) else 'nowhere'
        check(len(rr) == 1 and rr[0] == (40 - lat_s) * GRID - 3 and cc[0] == 80 * GRID + 5
              and abs(g[rr[0], cc[0]] - 7.0) < 1e-6, f'Black Marble block lands on the 1\' grid at {where}')
        slim_black_marble(os.path.join(bm, name), os.path.join(sl, name))
        with h5py.File(os.path.join(sl, name), 'r') as hf:
            kept = []
            hf.visititems(lambda k, o: kept.append(k) if isinstance(o, h5py.Dataset) else None)
        check(kept == ['slim/' + BM_VAR], f'the slimmed file keeps only {BM_VAR}')
        check(np.array_equal(grid_from_black_marble(sl, lat_s, lat_n), g),
              f'and grids the same ({os.path.getsize(os.path.join(sl, name))} bytes'
              f' from {os.path.getsize(os.path.join(bm, name))})')
    print('selftest', 'passed' if ok else 'FAILED')
    return ok


# ---- A fixture for the app's tests -------------------------------------

def fixture(outdir):
    """A small tile set from the real pipeline: one town of 5 x 5 lit cells
    at 40.25 N, 99.75 W, scaled so its centre is an inner-city sky, plus the
    q and Bortle class the app should read at points north of it (at 2'
    cell centres, where the app's bilinear read is exact)."""
    lat_s, lat_n = 30, 50
    rows, cols = (lat_n - lat_s) * GRID, 360 * GRID
    rad = np.zeros((rows, cols), dtype=np.float32)
    r0, c0 = int((40.25 - lat_s) * GRID), int((-99.75 + 180) * GRID)
    rad[r0 - 2:r0 + 3, c0 - 2:c0 + 3] = 200.0
    glow = sky_glow(rad, lat_s)
    f = GRID // OUT
    g2 = lambda r, c: glow[r // f * f:r // f * f + f, c // f * f:c // f * f + f].mean()
    scale = 60.0 / g2(r0, c0)
    names, _ = write_tiles(glow, lat_s, lat_n, scale, outdir, {'source': 'fixture'})
    points = []
    for km in (0, 10, 25, 50, 100, 150, 240):
        rr = r0 + int(round(km / (KM_PER_DEG / GRID)))
        rr = rr // f * f  # the 2' cell's first fine row
        lat = lat_s + (rr // f + 0.5) / OUT
        lon = -180 + (c0 // f + 0.5) / OUT
        q = int(q_of_ratio(scale * g2(rr, c0)))
        points.append({'km': km, 'lat': round(lat, 6), 'lon': round(lon, 6), 'q': q,
                       'bortle': int(bortle_of_ratio(ratio_of_q(q)))})
    json.dump({'tiles': names, 'points': points}, open(os.path.join(outdir, 'expect.json'), 'w'), indent=1)
    return names, points


# ---- Command line --------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    d = sub.add_parser('download')
    d.add_argument('--year', type=int, default=2024)
    d.add_argument('--collection', default='5200')
    d.add_argument('--out', default='data/vnp46a4')
    d.add_argument('--slim', nargs='?', const=BM_VAR, metavar='VAR',
                   help='keep only this dataset of each file (default %(const)s)')
    g = sub.add_parser('grid')
    g.add_argument('--black-marble', help='folder of VNP46A4 .h5 tiles')
    g.add_argument('--geotiff', help='one radiance GeoTIFF (.tif or .tif.gz)')
    g.add_argument('--var', default=BM_VAR)
    g.add_argument('--lat', type=int, nargs=2, default=[-65, 75])
    g.add_argument('--out', default='data/radiance.npz')
    s = sub.add_parser('sky')
    s.add_argument('--in', dest='inp', default='data/radiance.npz')
    s.add_argument('--out', default='data/glow.npz')
    s.add_argument('--d0', type=float, default=D0)
    s.add_argument('--l', type=float, default=L)
    s.add_argument('--rmax', type=float, default=RMAX)
    s.add_argument('--floor', type=float, default=FLOOR)
    c = sub.add_parser('calibrate')
    c.add_argument('--in', dest='inp', default='data/glow.npz')
    c.add_argument('--sites', default=os.path.join(os.path.dirname(__file__), 'reference-sites.json'))
    t = sub.add_parser('tiles')
    t.add_argument('--in', dest='inp', default='data/glow.npz')
    t.add_argument('--scale', type=float, required=True, help='from calibrate')
    t.add_argument('--out', default='lp')
    t.add_argument('--source', required=True, help='what the tiles were made from, for index.json')
    sub.add_parser('selftest')
    fx = sub.add_parser('fixture')
    fx.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'test', 'fixtures', 'lp'))
    a = ap.parse_args()

    if a.cmd == 'selftest':
        sys.exit(0 if selftest() else 1)
    if a.cmd == 'fixture':
        names, points = fixture(a.out)
        print(f'{len(names)} tiles in {a.out}:', ', '.join(names))
        for p in points:
            print(f'  {p["km"]:>4} km north: q {p["q"]:>3}, Bortle {p["bortle"]}')
        return
    if a.cmd == 'download':
        names = download(a.year, a.collection, a.out, a.slim)
        print(f'{len(names)} tiles in {a.out}')
    elif a.cmd == 'grid':
        lat_s, lat_n = a.lat
        if a.black_marble:
            rad = grid_from_black_marble(a.black_marble, lat_s, lat_n, a.var)
        elif a.geotiff:
            rad = grid_from_geotiff(a.geotiff, lat_s, lat_n)
        else:
            raise SystemExit('give --black-marble FOLDER or --geotiff FILE')
        np.savez_compressed(a.out, rad=rad, lat_s=lat_s, lat_n=lat_n)
        print(f'{a.out}: {rad.shape}, {np.count_nonzero(rad)} lit cells')
    elif a.cmd == 'sky':
        z = np.load(a.inp)
        glow = sky_glow(z['rad'], int(z['lat_s']), a.d0, a.l, a.rmax, a.floor)
        np.savez_compressed(a.out, glow=glow, lat_s=z['lat_s'], lat_n=z['lat_n'],
                            model=json.dumps({'d0': a.d0, 'l': a.l, 'rmax': a.rmax, 'floor': a.floor}))
        print(f'{a.out}: {glow.shape}')
    elif a.cmd == 'calibrate':
        z = np.load(a.inp)
        sites = json.load(open(a.sites))['sites']
        scale, miss, pts = calibrate(z['glow'], int(z['lat_s']), sites)
        print(f'scale {scale:.6g}: {len(pts) - miss} of {len(pts)} sites in range')
        for s, g in pts:
            r = scale * g
            b = int(bortle_of_ratio(r))
            lo, hi = s['bortle']
            flag = '' if lo <= b <= hi else '   <-- outside ' + (f'{lo}' if lo == hi else f'{lo}-{hi}')
            print(f'  {s["name"]:<34} Bortle {b}  SQM {float(sqm_of_ratio(r)):.2f}{flag}')
    elif a.cmd == 'tiles':
        z = np.load(a.inp)
        meta = {'source': a.source, 'scale': a.scale, 'model': json.loads(str(z['model']))}
        names, total = write_tiles(z['glow'], int(z['lat_s']), int(z['lat_n']), a.scale, a.out, meta)
        print(f'{len(names)} tiles, {total / 1e6:.2f} MB, in {a.out}')


if __name__ == '__main__':
    main()
