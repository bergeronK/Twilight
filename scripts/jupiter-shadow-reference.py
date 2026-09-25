#!/usr/bin/env python3
"""Writes scripts/test/jupiter-shadow-reference.json for planet-moons.test.js:
from PyEphem (pip install ephem), not from the app.

Every 90 minutes for 40 days around Jupiter's 2026 quadrature (when shadows
fall well away from their moons) and 20 days around its opposition, for
each Galilean moon: whether PyEphem has it in sunlight (sun_visible), and,
when its shadow falls on the side of Jupiter facing us, where: the ray from
the Sun through the moon (PyEphem's x east, y south, z toward Earth, in
Jupiter radii) met with a sphere of one radius, in the same frame; and
the moon's own x and y, so the shadow's offset from its moon can be checked
without caring how the frames are turned.

    python3 scripts/jupiter-shadow-reference.py
"""
import ephem, json, math, datetime, os

MOONS = [ephem.Io, ephem.Europa, ephem.Ganymede, ephem.Callisto]
EPOCH = datetime.datetime(1970, 1, 1)

def unit(ra, dec):
    return (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))

def sample(t):
    j = ephem.Jupiter(t)
    # Directions from Jupiter, equatorial (of date, like PyEphem's ra/dec).
    ra, dec = float(j.g_ra), float(j.g_dec)
    to_earth = tuple(-c for c in unit(ra, dec))
    sun = ephem.Sun(t)
    # Jupiter -> Sun = (Earth -> Sun) - (Earth -> Jupiter), in AU.
    es = [sun.earth_distance * c for c in unit(float(sun.g_ra), float(sun.g_dec))]
    ej = [j.earth_distance * c for c in unit(ra, dec)]
    js = [a - b for a, b in zip(es, ej)]
    n = math.sqrt(sum(c * c for c in js)); js = [c / n for c in js]
    east = (-math.sin(ra), math.cos(ra), 0.0)
    north = (-math.sin(dec) * math.cos(ra), -math.sin(dec) * math.sin(ra), math.cos(dec))
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))
    s = (dot(js, east), -dot(js, north), dot(js, to_earth))  # x east, y south, z toward Earth
    row = []
    for M in MOONS:
        m = M(t)
        p = (float(m.x), float(m.y), float(m.z))
        shadow = None
        if dot(p, s) > 0:  # the moon is sunward of Jupiter
            # P = p - k s, |P| = 1: k^2 - 2k(p.s) + |p|^2 - 1 = 0, the nearer root.
            b = dot(p, s); c = dot(p, p) - 1; disc = b * b - c
            if disc >= 0:
                k = b - math.sqrt(disc)
                P = tuple(pi - k * si for pi, si in zip(p, s))
                if P[2] > 0:
                    shadow = [round(P[0], 3), round(P[1], 3)]
        row.append([bool(m.sun_visible), shadow, [round(p[0], 3), round(p[1], 3)]])
    return row

def run(start, days, step_h=1.5):
    t0 = datetime.datetime.fromisoformat(start)
    out = []
    for i in range(int(days * 24 / step_h)):
        t = t0 + datetime.timedelta(hours=i * step_h)
        out.append([round((t - EPOCH).total_seconds() * 1000), sample(t)])
    return out

samples = run('2026-04-20', 40) + run('2026-01-01', 20)
path = os.path.join(os.path.dirname(__file__), 'test', 'jupiter-shadow-reference.json')
with open(path, 'w') as f:
    json.dump(samples, f, separators=(',', ':'))
ecl = sum(1 for _, r in samples for m in r if not m[0])
sh = sum(1 for _, r in samples for m in r if m[1])
print(f'{len(samples)} times, {ecl} eclipsed moon-samples, {sh} shadows on the disc -> {path}')
