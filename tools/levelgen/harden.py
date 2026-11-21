"""Harder levels 6-10 for Worlds 1-10 (Chris, 2026-11-21: "levels 6-10 in every world need to get harder").

harden(spec, world) returns a tougher copy of a level spec:
  - pistons, lasers and gusts cycle faster, sweeping arms and discs turn faster;
  - mazes get an extra hole-floored dead end;
  - only the first checkpoint is kept;
  - one more stretch of course goes in before the finish, built from the world's own idea.
The level keeps its id and name, so the in-game order and save keys are unchanged.
"""
import copy

holes = ('holes', {})
EXTRA = {
    # world: (connector, run features) added before the last segment
    1: (('conn', {'len': 4, 'feat': 'holes'}), [holes, holes, holes]),
    2: (('conn', {'len': 3, 'feat': 'pistonX', 'period': 2.6}), [('piston', {'period': 2.5}), ('strips', {}), holes]),
    3: (('conn', {'len': 12, 'feat': 'wall', 'notches': ['low'], 'wpistons': 1}), [('piston', {'period': 2.6}), holes]),
    4: (('conn', {'len': 3}), [('crumble', {'len': 4}), ('platform', {'gap': 5, 'period': 5.0})]),
    5: (('conn', {'len': 3}), [('pad', {'kind': 'conveyor', 'len': 5, 'against': True}), ('pad', {'kind': 'boost', 'len': 3})]),
    6: (('conn', {'len': 10, 'feat': 'flip'}), [holes, ('piston', {'period': 2.6})]),
    7: (('conn', {'len': 3}), [('door', {}), ('laser', {'period': 2.3, 'on': 0.42})]),
    8: (('conn', {'len': 10, 'feat': 'autowall'}), [('jump', {'gap': 3, 'low': 0.5}), holes]),
    9: (('conn', {'len': 3}), [('disc', {'speed': 1.0}), holes]),
    10: (('conn', {'len': 10, 'feat': 'flip'}), [('crumble', {'len': 3}), ('laser', {'period': 2.3, 'on': 0.42})]),
}


def _faster(feats):
    out = []
    for f, a in feats:
        a = dict(a)
        if f in ('piston', 'laser') or (f == 'pistons'):
            base = a.get('period', {'piston': 3.2, 'laser': 2.6, 'pistons': 3.0}[f])
            a['period'] = round(max(2.3 if f == 'laser' else 2.2, base * 0.85), 2)
        elif f == 'arm':
            a['speed'] = round(a.get('speed', 1.3) * 1.15, 2)
        elif f == 'disc':
            a['speed'] = round(a.get('speed', 0.6) * 1.15, 2)
        elif f == 'platform':
            a['period'] = round(max(4.6, a.get('period', 6.0) * 0.9), 2)
        out.append((f, a))
    return out


def harden(spec, world):
    s = copy.deepcopy(spec)
    segs = []
    seen_cp = False
    for kind, a in s['segments']:
        a = dict(a)
        if a.get('checkpoint'):
            if seen_cp:
                a['checkpoint'] = False
            seen_cp = True
        if kind in ('run', 'maze'):
            feats = _faster(a.get('feats', []))
            if kind == 'maze':
                names = [f for f, _ in feats]
                if 'deadholes' in names:
                    feats = [(f, {**x, 'n': x.get('n', 2) + 1}) if f == 'deadholes' else (f, x) for f, x in feats]
                elif 'switchdoor' not in names:
                    feats.append(('deadholes', {'n': 1}))
            a['feats'] = feats
        if kind == 'conn' and a.get('feat') == 'pistonX':
            a['period'] = round(max(2.2, a.get('period', 3.0) * 0.85), 2)
        segs.append((kind, a))
    conn, feats = EXTRA[world]
    # The finish stays last; the new stretch goes in just before the connector that leads to it.
    last = segs.pop()
    lead = segs.pop() if segs and segs[-1][0] == 'conn' else None
    segs.append(lead or ('conn', {'len': 3}))
    segs.append(('run', {'cw': 3, 'feats': feats}))
    segs.append((conn[0], dict(conn[1])))
    segs.append(last)
    s['segments'] = segs
    s['layout'] = 2
    s['fit'] = True
    s['hardened'] = True
    return s
