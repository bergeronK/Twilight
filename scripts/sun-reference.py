#!/usr/bin/env python3
"""Writes scripts/test/sun-reference.json: the reference sun-times.test.js
checks the app against, from PyEphem (pip install ephem), not from the app.

Every sunrise, sunset and twilight edge (the Sun's centre at -0.833, -6,
-12 and -18 degrees, no atmosphere model beyond that fixed -0.833) at ten
places from the equator to 70 N and 34 S on eight dates through 2026, plus
the Sun's altitude and azimuth at a handful of instants.

    python3 scripts/sun-reference.py
"""
import ephem, json, datetime, math, os

PLACES = [('Boston', 42.36, -71.06), ('Quito', -0.18, -78.47), ('Sydney', -33.87, 151.21),
          ('London', 51.51, -0.13), ('Reykjavik', 64.15, -21.94), ('Anchorage', 61.22, -149.90),
          ('Honolulu', 21.31, -157.86), ('Tokyo', 35.68, 139.65), ('Cape Town', -33.92, 18.42),
          ('Tromso', 69.65, 18.96)]
DATES = ['2026-01-15', '2026-03-20', '2026-05-10', '2026-06-21', '2026-08-01', '2026-09-24', '2026-11-05', '2026-12-21']
EPOCH = datetime.datetime(1970, 1, 1)
ms = lambda d: round((d - EPOCH).total_seconds() * 1000)

events = []
for name, lat, lon in PLACES:
    for day in DATES:
        y, m, d = map(int, day.split('-'))
        start = datetime.datetime(y, m, d) - datetime.timedelta(hours=lon / 15)  # about local midnight
        for h, key in [('-18', 'astro'), ('-12', 'naut'), ('-6', 'civil'), ('-0:49.98', 'rise')]:
            for rising in (True, False):
                o = ephem.Observer(); o.lat = str(lat); o.lon = str(lon); o.pressure = 0; o.elevation = 0
                o.date = start; o.horizon = h
                try:
                    t = (o.next_rising if rising else o.next_setting)(ephem.Sun(), use_center=True).datetime()
                except (ephem.AlwaysUpError, ephem.NeverUpError):
                    continue
                if (t - start).total_seconds() < 86400:
                    events.append([name, lat, lon, key, 'up' if rising else 'down', ms(t)])

positions = []
for name, lat, lon in PLACES[:5]:
    for when in ['2026-03-20T15:00:00', '2026-06-21T22:30:00', '2026-12-21T04:15:00']:
        o = ephem.Observer(); o.lat = str(lat); o.lon = str(lon); o.pressure = 0; o.elevation = 0
        t = datetime.datetime.fromisoformat(when); o.date = t
        s = ephem.Sun(o)
        positions.append([name, lat, lon, ms(t), round(math.degrees(s.alt), 4), round(math.degrees(s.az), 4)])

out = os.path.join(os.path.dirname(__file__), 'test', 'sun-reference.json')
with open(out, 'w') as f:
    json.dump({'events': events, 'positions': positions}, f, separators=(',', ':'))
print(f'{len(events)} events, {len(positions)} positions -> {out}')
