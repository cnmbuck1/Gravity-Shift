"""
Gravitor level generator.

A level is a serpentine stack of segments, built bottom (start) to top (goal):
  run   - a straight corridor across the full width, with features along it
  maze  - a labyrinth room (depth-first maze) entered at one bottom corner, left at the far top corner
  conn  - a vertical connector up the side between two segments (plain, hazards, or a gravity crossing)

The generator writes the level as the game's text-grid maze plus feature data, and also a
route (waypoints, shifts, waits) that the autopilot test follows to prove the level can be finished.

Coordinates: the grid is built y-up (row 0 = bottom border), then flipped so row 0 is the far end.
Cell (c, row) has its centre at x = c + ox, z = row + oz.
"""
import heapq
import json
import math
import random

W = 25            # board width in cells (fits maze pitches 3 and 4)
CEIL = 4.0        # underside of glass ceilings over flip crossings
NOTCH_Y = 2.6     # a 'low' wall notch is cut from the wall's bottom edge up to here; a 'high' one from the top down to 6 - NOTCH_Y + 1
WALL_PISTON_PERIOD = 3.0
BRIDGE_Y = 0.8


class Level:
    def __init__(self, spec):
        self.spec = spec
        self.rng = random.Random(spec.get('seed', 1))
        self.cells = {}            # (c, y) -> char, y-up
        self.platforms = []        # TS source strings
        self.movers = []
        self.zones = []
        self.crumble = []          # (c, y)
        self.pads = []             # dicts in cell coords
        self.lasers = []
        self.doors = []
        self.switches = []
        self.wells = []
        self.rotators = []
        self.maze_lasers = []
        self.wall_notches = []     # (crossing index, row a, row b, 'low' | 'high')
        self.wall_pistons = []     # (crossing index, row)      # indexes of lasers placed inside mazes (the route finds them itself)
        self.portals = []          # dicts: a, b (cell coords), exit (dx, dy y-up) or None, decoy
        self.keys = []             # (cx, cy)
        self.fans = []             # (c0, c1, y0, y1, dir (dx, dy y-up), strength, period, on, phase)
        self.pulses = []           # (c0, c1, y0, y1, period, on, phase)
        self.maze_pulses = []      # indexes of pulses placed in maze doorways
        self.checkpoints = []      # (cx, cy) cell coords (float)
        self.legs = []             # route legs, cell coords until resolved
        self.y = 1                 # next free row (y-up); row 0 is the border
        self.side = spec.get('side', 'W')  # side the next segment is entered from
        self.specials = 0

    # ---------- grid ----------
    def put(self, c, y, ch):
        self.cells[(c, y)] = ch

    def get(self, c, y):
        return self.cells.get((c, y), '#')

    def carve(self, c0, c1, y0, y1, ch='.'):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for c in range(min(c0, c1), max(c0, c1) + 1):
                self.put(c, y, ch)

    def side_cols(self, side, w):
        return (1, w) if side == 'W' else (W - 1 - w, W - 2)

    # ---------- segments ----------
    def run(self, cw=3, feats=(), start=False, goal=False, checkpoint=False):
        """Corridor across the board, entered at self.side, left at the other side."""
        y0, y1 = self.y, self.y + cw - 1
        assert y0 >= getattr(self, 'pocket_top', -9) + 2, 'switch pocket would open into this segment: lengthen the connector'
        self.carve(1, W - 2, y0, y1)
        east = self.side == 'W'          # travelling east?
        step = 1 if east else -1
        # Columns along the direction of travel, excluding the end zones where connectors attach.
        order = list(range(1, W - 1)) if east else list(range(W - 2, 0, -1))
        entry = order[0]
        exitc = order[-1]
        if start:
            for c in order[:4]:
                self.carve(c, c, y0, y1, 'S')
            self.spawn = (order[1] + (0.5 if east else -0.5), (y0 + y1) / 2)
        if checkpoint:
            cc = order[4] if start else order[2]
            self.carve(cc - 1 if east else cc, cc if east else cc + 1, y0, y1, 'C')
            self.checkpoints.append((cc - 0.5 if east else cc + 0.5, (y0 + y1) / 2))
        lo = 7 if start else 5
        usable = order[lo:len(order) - (6 if goal else 5)]
        feats = list(feats)
        if self.spec.get('fit'):
            feats = self._fit(usable, feats)
        slots = self._slots(usable, feats)
        mid = (y0 + y1) / 2
        route_marks = []                 # (col index along order, leg) specials in travel order
        for (f, args), (a, b) in zip(feats, slots):
            mark = self._run_feature(f, args, order, a, b, y0, y1, east)
            if mark:
                route_marks.append(mark)
        if goal:
            g = order[-5:]
            for c in g:
                self.carve(c, c, y0, y1, 'G')
            self.goal = (sum(g[1:4]) / 3, mid)
        # Route through the run: entry -> specials in order -> exit.
        self.run_route = (entry, exitc, mid, route_marks, step)
        self.y = y1 + 1
        self.side = 'E' if east else 'W'
        return (y0, y1)

    # Clear cells needed before a feature for the approach (waiting spot, run-up).
    APPROACH = {'platform': 2, 'laser': 2, 'jump': 2, 'door': 6, 'bridge': 0, 'fan': 2, 'pulse': 1, 'gapwarp': 1}
    # Clear cells needed after a feature (where the route steps off it).
    EXIT = {'platform': 2, 'arm': 2, 'bridge': 0, 'fan': 1, 'pulse': 1, 'gapwarp': 1}

    def _slots(self, usable, feats):
        if self.spec.get('layout', 1) == 1:
            return self._slots_v1(usable, feats)
        """Places the features along the usable columns, spreading spare room evenly.
        Returns (first, last) column pairs in travel order."""
        if not feats:
            return []
        widths = [self._feat_width(f, a) for f, a in feats]
        names = [f for f, _ in feats]
        need = [max(self.APPROACH.get(f, 1), self._exit().get(names[k - 1], 1) if k else 0) for k, f in enumerate(names)] + [self._exit().get(names[-1], 1)]
        free = len(usable) - sum(widths) - sum(need)
        assert free >= 0, f'features {feats} do not fit in {len(usable)} columns'
        extra = [free // len(need)] * len(need)
        for k in range(free % len(need)):
            extra[k] += 1
        out, i = [], 0
        for k, w in enumerate(widths):
            i += need[k] + extra[k]
            out.append((usable[i], usable[i + w - 1]))
            i += w
        return out

    def _exit(self):
        # Worlds 11+: two clear cells after crumbling floor, so a fast crossing can run out onto solid ground.
        return {**self.EXIT, 'crumble': 2} if self.spec.get('fit') and not self.spec.get('hardened') else self.EXIT

    SHRINK = {'fan': ('len', 3), 'pulse': ('len', 2), 'gapwarp': ('gap', 2), 'crumble': ('len', 3), 'ice': ('len', 4)}

    def _fit(self, usable, feats):
        """Worlds 11+: shorten stretchy features (fans, pulses, gate gaps, crumble, ice) until a run's features fit."""
        feats = [(f, dict(a)) for f, a in feats]
        while True:
            widths = [self._feat_width(f, a) for f, a in feats]
            names = [f for f, _ in feats]
            need = sum(max(self.APPROACH.get(f, 1), self._exit().get(names[k - 1], 1) if k else 0) for k, f in enumerate(names)) + (self._exit().get(names[-1], 1) if names else 0)
            if not feats or len(usable) - sum(widths) - need >= 0:
                return feats
            for f, a in sorted(feats, key=lambda fa: -self._feat_width(*fa)):
                if f in self.SHRINK:
                    k, lo = self.SHRINK[f]
                    cur = a.get(k, {'fan': 4, 'pulse': 3, 'gapwarp': 3, 'crumble': 4, 'ice': 6}[f])
                    if cur > lo:
                        a[k] = cur - 1
                        break
            else:
                return feats

    def _slots_v1(self, usable, feats):
        """Worlds 1-3 layout (kept so those tested levels stay as they are). Splits the usable columns evenly among the features: returns (first, last) index pairs into usable."""
        if not feats:
            return []
        widths = [self._feat_width(f, a) for f, a in feats]
        free = len(usable) - sum(widths)
        gap = max(1, free // (len(feats) + 1))
        out, i = [], gap
        for w in widths:
            out.append((usable[i], usable[min(i + w - 1, len(usable) - 1)]))
            i += w + gap
        return out

    def _feat_width(self, f, args):
        return {'holes': 2, 'piston': 1, 'strips': 1, 'bridge': 6 + args.get('deck', 5), 'crumble': args.get('len', 4),
                'platform': args.get('gap', 5), 'pad': args.get('len', 5), 'laser': 1, 'door': 1, 'arm': args.get('size', 5),
                'disc': 5, 'jump': 2 + args.get('gap', 3), 'well': args.get('len', 6), 'ice': args.get('len', 6),
                'fan': args.get('len', 4), 'pulse': args.get('len', 3), 'key': 2, 'gapwarp': 3 + args.get('gap', 3)}.get(f, 1)

    def _run_feature(self, f, args, order, a, b, y0, y1, east):
        cw = y1 - y0 + 1
        step = 1 if east else -1
        lo, hi = min(a, b), max(a, b)
        mid = (y0 + y1) / 2
        if f == 'holes':
            # 2x2 hole on one edge; on 3-wide corridors it is punched outward into the wall row.
            top = args.get('top', self.rng.random() < 0.5)
            if cw >= 4:
                rows = (y1 - 1, y1) if top else (y0, y0 + 1)
            else:
                rows = (y1, y1 + 1) if top else (y0 - 1, y0)
                if rows[0] < 1:
                    rows = (y1, y1 + 1)
            self.carve(lo, hi, rows[0], rows[1], ' ')
        elif f == 'piston':
            self.movers.append(('pistonZ', a, y0, y1, args.get('period', 3.2), args.get('phase', 0)))
            return ('piston', len(self.movers) - 1, a)
        elif f == 'strips':
            row = y1 if args.get('top', self.rng.random() < 0.5) else y0
            self.put(a, row, 'X')
            if cw >= 4:
                self.put(a, row - 1 if row == y1 else row + 1, 'X')
        elif f == 'bridge':
            deck = args.get('deck', 5)
            c0 = a                                  # first ramp column (travel order)
            ramp1 = [c0 + step * i for i in range(3)]
            deckc = [c0 + step * (3 + i) for i in range(deck)]
            ramp2 = [c0 + step * (3 + deck + i) for i in range(3)]
            for c in deckc:
                self.carve(c, c, y0, y1, 'B')
            self.platforms.append(('ramp', ramp1, deckc, mid, cw))
            self.platforms.append(('deck', deckc, mid, args.get('width', 2.0)))
            self.platforms.append(('ramp', ramp2, deckc, mid, cw))
            return ('bridge', deckc[0], deckc[-1])
        elif f == 'crumble':
            for c in range(lo, hi + 1):
                for y in range(y0, y1 + 1):
                    self.put(c, y, 'K')
                    self.crumble.append((c, y))
            return ('fast', lo if east else hi, hi if east else lo)
        elif f == 'platform':
            for c in range(lo, hi + 1):
                self.carve(c, c, y0, y1, ' ')
            self.movers.append(('platform', a, b, mid, cw, args.get('period', 6.0), args.get('phase', 0)))
            return ('platform', len(self.movers) - 1, a, b)
        elif f == 'pad':
            kind = args['kind']
            d = args.get('dir')
            if args.get('against'):
                d = (-step, 0)
            elif args.get('side'):
                d = (0, 1 if args['side'] == 'top' else -1)
            elif d is None:
                d = (step, 0)
            py0, py1 = self._edge_holes(args.get('holes'), lo, hi, y0, y1)
            self.pads.append(dict(kind=kind, c0=lo, c1=hi, y0=py0, y1=py1, dir=d))
            if kind == 'sticky' or kind == 'ice':
                return ('slow', lo, hi) if kind == 'ice' else None
        elif f == 'laser':
            self.lasers.append((a, y0, y1, args.get('period', 2.6), args.get('on', 0.42), args.get('phase', 0)))
            return ('laser', len(self.lasers) - 1, a)
        elif f == 'door':
            # Door across the corridor; its switch sits in a pocket off the corridor a few cells before.
            sw = a - step * args.get('back', 4)
            pocket = (y1 + 1, y1 + 2) if args.get('top', True) else (y0 - 2, y0 - 1)
            self.carve(sw, sw + step, pocket[0], pocket[1])
            self.pocket_top = max(getattr(self, 'pocket_top', 0), pocket[1])
            self.doors.append((a, y0, y1))
            sx = sw + step * 0.5
            sy = pocket[1] if args.get('top', True) else pocket[0]
            self.switches.append((sx, sy, len(self.doors) - 1))
            return ('switch', (sx, sy), a)
        elif f == 'arm':
            size = args.get('size', cw)
            cx = (a + b) / 2
            self.rotators.append(('arm', cx, mid, size - 1.6, args.get('speed', 1.3), args.get('phase', 0)))
            # The ball slips past along an edge lane while the bar lies along the corridor.
            lane = y1 if args.get('top', True) else y0
            return ('arm', len(self.rotators) - 1, a, b, lane)
        elif f == 'disc':
            for c in range(lo, hi + 1):
                self.carve(c, c, y0, y1, ' ')
            cx = (a + b) / 2
            self.rotators.append(('disc', cx, mid, 2.45, args.get('speed', 0.6), 0))
            return ('fast', a - step, b + step)
        elif f == 'jump':
            gap = args.get('gap', 3)
            self.pads.append(dict(kind='jump', c0=a, c1=a, y0=y0, y1=y1, dir=(step, 0)))
            if args.get('low'):
                # Low gravity over the jump: a longer, floatier flight.
                far = a + step * (gap + 1)
                self.wells.append((min(a, far), max(a, far), y0, y1, args['low']))
            for i in range(gap):
                c = a + step * (1 + i)
                self.carve(c, c, y0, y1, ' ')
            return ('jump', a, a + step * (gap + 1))
        elif f == 'well':
            self.wells.append((lo, hi, y0, y1, args.get('scale', 0.4)))
        elif f == 'fan':
            # Crosswind: the fan sits on one wall and blows toward 2x2 holes punched into the other.
            top = args.get('top', self.rng.random() < 0.5)       # holes on the top (far) edge?
            if not top and y0 - 1 < 1:
                top = True
            self._edge_holes('top' if top else 'low', lo, hi, y0, y1)
            d = (0, 1) if top else (0, -1)
            self.fans.append((lo, hi, y0, y1, d, args.get('strength', 11), args.get('period', 3.0), args.get('on', 0.5), args.get('phase', 0)))
            return ('fan', len(self.fans) - 1, lo if east else hi, hi if east else lo)
        elif f == 'pulse':
            self.pulses.append((lo, hi, y0, y1, args.get('period', 2.6), args.get('on', 0.45), args.get('phase', 0)))
            return ('pulse', len(self.pulses) - 1, lo if east else hi, hi if east else lo)
        elif f == 'key':
            # A key in a pocket off the corridor (like a switch pocket).
            top = args.get('top', self.rng.random() < 0.5)
            if not top and y0 - 2 < 1:
                top = True
            pocket = (y1 + 1, y1 + 2) if top else (y0 - 2, y0 - 1)
            self.carve(a, a + step, pocket[0], pocket[1])
            if top:
                self.pocket_top = max(getattr(self, 'pocket_top', 0), pocket[1])
            kx = a + step * 0.5
            ky = pocket[1] if top else pocket[0]
            self.keys.append((kx, ky))
            return ('switch', (kx, ky), a)
        elif f == 'gapwarp':
            # A chasm across the corridor: a gate before it sends you to a gate past it.
            gap = args.get('gap', 3)
            cs = [a + step * (1 + i) for i in range(gap)]
            for c in cs:
                self.carve(c, c, y0, y1, ' ')
            ga, gb = (a, mid), (a + step * (gap + 2), mid)
            self.portals.append(dict(a=ga, b=gb, exit=(step, 0), decoy=False))
            return ('warp', len(self.portals) - 1, ga, (gb[0] + step, mid))
        elif f == 'ice':
            py0, py1 = self._edge_holes(args.get('holes'), lo, hi, y0, y1)
            self.pads.append(dict(kind='ice', c0=lo, c1=hi, y0=py0, y1=py1, dir=None))
            return ('slow', lo, hi)
        return None

    def _edge_holes(self, where, lo, hi, y0, y1):
        """2x2 holes every few cells along one edge of a pad ('top' or 'low'), punched outward into the wall.
        Returns the rows the pad itself covers, so the pad never hides a hole."""
        if not where:
            return y0, y1
        top = where != 'low'
        rows = (y1, y1 + 1) if top else (y0 - 1, y0)
        assert rows[0] >= 1, 'edge holes would cut the border'
        for c in range(lo, hi, 4):
            self.carve(c, min(c + 1, hi), rows[0], rows[1], ' ')
        return (y0, y1 - 1) if top else (y0 + 1, y1)

    def maze(self, mw=3, ny=3, feats=(), goal=False, checkpoint=False):
        """Labyrinth room. Entered at the bottom corner on self.side, left at the top corner on the other side."""
        p = mw + 1
        nx = (W - 1) // p
        y0 = self.y
        assert y0 >= getattr(self, 'pocket_top', -9) + 2, 'switch pocket would open into this segment: lengthen the connector'
        h = ny * p - 1
        cell_c = lambda i: 1 + i * p
        cell_y = lambda j: y0 + j * p
        # Depth-first maze over nx x ny cells.
        start = (0, 0) if self.side == 'W' else (nx - 1, 0)
        end = (nx - 1, ny - 1) if self.side == 'W' else (0, ny - 1)
        seen = {start}
        stack = [start]
        links = set()
        rng = self.rng
        while stack:
            i, j = stack[-1]
            nb = [(i + di, j + dj) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= i + di < nx and 0 <= j + dj < ny and (i + di, j + dj) not in seen]
            if not nb:
                stack.pop()
                continue
            n = rng.choice(nb)
            links.add(frozenset(((i, j), n)))
            seen.add(n)
            stack.append(n)
        # A few extra openings so the labyrinth has loops as well as dead ends.
        for _ in range(args_loops(feats)):
            i, j = rng.randrange(nx - 1), rng.randrange(ny)
            links.add(frozenset(((i, j), (i + 1, j))))
        for i in range(nx):
            for j in range(ny):
                self.carve(cell_c(i), cell_c(i) + mw - 1, cell_y(j), cell_y(j) + mw - 1)
        for l in links:
            (a, b) = tuple(l)
            (i1, j1), (i2, j2) = sorted((a, b))
            if j1 == j2:   # horizontal neighbours: open the wall column between them
                c = cell_c(i1) + mw
                self.carve(c, c, cell_y(j1), cell_y(j1) + mw - 1)
            else:
                yy = cell_y(j1) + mw
                self.carve(cell_c(i1), cell_c(i1) + mw - 1, yy, yy)
        ex = (cell_c(end[0]), cell_c(end[0]) + mw - 1)
        sc = (cell_c(start[0]), cell_c(start[0]) + mw - 1)
        if checkpoint:
            self.carve(sc[0], sc[1], y0, y0, 'C')
            self.checkpoints.append(((sc[0] + sc[1]) / 2, y0))
        dead = self._dead_ends(nx, ny, links, start, end)
        for f, args in feats:
            if f == 'switchdoor':
                # Switch in the dead end farthest from the exit; door seals the exit.
                d = dead[0] if dead else start
                sx, sy = cell_c(d[0]) + (mw - 1) / 2, cell_y(d[1]) + (mw - 1) / 2
                self.doors.append(('maze', ex[0], ex[1], y0 + h))
                self.switches.append((sx, sy, len(self.doors) - 1))
                self.maze_switch = (sx, sy)
            elif f == 'pistons':
                # Pistons sliding across doorways between maze cells.
                ls = sorted(links, key=lambda l: sorted(l))
                rng.shuffle(ls)
                for k, l in enumerate(ls[:args.get('n', 2)]):
                    (a, b) = tuple(l)
                    (i1, j1), (i2, j2) = sorted((a, b))
                    period = args.get('period', 3.0) - 0.2 * (k % 3)
                    if j1 == j2:
                        c = cell_c(i1) + mw
                        self.movers.append(('pistonZ', c, cell_y(j1), cell_y(j1) + mw - 1, period, round(k * 0.31 % 1, 2)))
                    else:
                        yy = cell_y(j1) + mw
                        self.movers.append(('pistonX', yy, cell_c(i1), cell_c(i1) + mw - 1, period, round(k * 0.31 % 1, 2)))
            elif f == 'keys':
                # Keys in the dead ends farthest from the exit (after any switch's).
                first = 1 if getattr(self, 'maze_switch', None) else 0
                ks = dead[first:first + args.get('n', 2)]
                self.maze_keys = []
                for d in ks:
                    kx, ky = cell_c(d[0]) + (mw - 1) / 2, cell_y(d[1]) + (mw - 1) / 2
                    self.keys.append((kx, ky))
                    self.maze_keys.append((kx, ky))
                self.key_dead = set(ks)
            elif f == 'warpexit':
                # The exit is walled up: the way out is a gate in a far dead end. Gates in other dead ends are decoys
                # that send you back to the maze's start.
                used = getattr(self, 'key_dead', set())
                free = [d for d in dead if d not in used]
                if getattr(self, 'maze_switch', None):
                    free = free[1:]
                assert free, 'warpexit needs a dead end'
                d = free[0]
                self.warp_dead = set(free[:1 + args.get('decoys', 0)])
                ga = (cell_c(d[0]) + (mw - 1) / 2, cell_y(d[1]) + (mw - 1) / 2)
                self.maze_warp = dict(gate=ga, idx=len(self.portals))
                self.portals.append(dict(a=ga, b=None, exit=None, decoy=False))   # b set once the next segment exists
                for dd in free[1:1 + args.get('decoys', 0)]:
                    gd = (cell_c(dd[0]) + (mw - 1) / 2, cell_y(dd[1]) + (mw - 1) / 2)
                    st = (cell_c(start[0]) + (mw - 1) / 2, y0 + (mw - 1) / 2)
                    self.portals.append(dict(a=gd, b=st, exit=None, decoy=True))
            elif f == 'pulses':
                # Pulse floors across maze doorways.
                ls = sorted(links, key=lambda l: sorted(l))
                rng.shuffle(ls)
                for k, l in enumerate(ls[:args.get('n', 2)]):
                    (a_, b_) = tuple(l)
                    (i1, j1), (i2, j2) = sorted((a_, b_))
                    period = args.get('period', 2.6) + 0.3 * (k % 3)
                    if j1 == j2:
                        c = cell_c(i1) + mw
                        self.pulses.append((c, c, cell_y(j1), cell_y(j1) + mw - 1, period, 0.35, round(k * 0.29 % 1, 2)))
                    else:
                        yy = cell_y(j1) + mw
                        self.pulses.append((cell_c(i1), cell_c(i1) + mw - 1, yy, yy, period, 0.35, round(k * 0.29 % 1, 2)))
                    self.maze_pulses.append(len(self.pulses) - 1)
            elif f == 'deadholes':
                used = getattr(self, 'key_dead', set()) | getattr(self, 'warp_dead', set())
                for d in [d for d in dead[1:] if d not in used][:args.get('n', 2)]:
                    self.carve(cell_c(d[0]), cell_c(d[0]) + mw - 1, cell_y(d[1]), cell_y(d[1]) + mw - 1, ' ')
            elif f == 'ice':
                self.pads.append(dict(kind='ice', c0=1, c1=W - 2, y0=y0, y1=y0 + h - 1, dir=None))
            elif f == 'well':
                self.wells.append((1, W - 2, y0, y0 + h - 1, args.get('scale', 0.5)))
            elif f == 'lasers':
                for k in range(args.get('n', 2)):
                    j = rng.randrange(ny)
                    i = rng.randrange(nx - 1)
                    if frozenset(((i, j), (i + 1, j))) in links:
                        c = cell_c(i) + mw
                        self.lasers.append((c, cell_y(j), cell_y(j) + mw - 1, 2.4 + k * 0.4, 0.4, k * 0.3))
                        self.maze_lasers.append(len(self.lasers) - 1)
            elif f == 'crumble':
                # Whole maze cells crumble (a one-cell strip would trap the ball half-sunk instead of dropping it).
                skip = {start, end}
                if getattr(self, 'maze_switch', None):
                    # The trip to the switch and back crosses these cells twice, so they must hold.
                    sw = dead[0] if dead else start
                    skip |= set(self._cell_path(links, start, sw)) & set(self._cell_path(links, sw, end))
                    skip.add(sw)
                # On the way through, only cells the route crosses in a straight line (no stopping to turn on them).
                main = list(reversed(self._cell_path(links, start, end)))
                for k in range(1, len(main) - 1):
                    a_, b_, c_ = main[k - 1], main[k], main[k + 1]
                    if (b_[0] - a_[0], b_[1] - a_[1]) != (c_[0] - b_[0], c_[1] - b_[1]):
                        skip.add(b_)
                cells = [(i, j) for i in range(nx) for j in range(ny) if (i, j) not in skip]
                rng.shuffle(cells)
                for (i, j) in cells[:args.get('n', 4)]:
                    for c in range(cell_c(i), cell_c(i) + mw):
                        for yy in range(cell_y(j), cell_y(j) + mw):
                            if self.get(c, yy) == '.':
                                self.put(c, yy, 'K')
                                self.crumble.append((c, yy))
        if goal:
            self.carve(ex[0], ex[1], y0 + h - mw, y0 + h - 1, 'G')
            self.goal = ((ex[0] + ex[1]) / 2, y0 + h - (mw + 1) / 2)
        self.key_dead = set()
        self.warp_dead = set()
        self.maze_route = (((sc[0] + sc[1]) / 2, y0), ((ex[0] + ex[1]) / 2, y0 + h - 1))
        self.y = y0 + h
        self.side = 'E' if self.side == 'W' else 'W'
        return (y0, y0 + h - 1)

    def _cell_path(self, links, a, b):
        """Maze cells on the way from a to b."""
        nb = {}
        for l in links:
            p, q = tuple(l)
            nb.setdefault(p, []).append(q)
            nb.setdefault(q, []).append(p)
        prev, todo = {a: None}, [a]
        while todo:
            n = todo.pop(0)
            for m in nb.get(n, []):
                if m not in prev:
                    prev[m] = n
                    todo.append(m)
        out, n = [], b
        while n is not None:
            out.append(n)
            n = prev.get(n)
        return out

    def _dead_ends(self, nx, ny, links, start, end):
        deg = {}
        for l in links:
            for n in l:
                deg[n] = deg.get(n, 0) + 1
        dead = [n for n in deg if deg[n] == 1 and n not in (start, end)]
        # Farthest from the exit first.
        dead.sort(key=lambda n: -(abs(n[0] - end[0]) + abs(n[1] - end[1])))
        return dead

    def conn(self, length=3, width=3, feat=None, args=None):
        """Vertical connector up the current side (self.side is where the previous segment left)."""
        args = args or {}
        side = 'E' if self.side == 'E' else 'W'
        c0, c1 = self.side_cols(side, width)
        if self.spec.get('fit'):
            # Room for a key or switch pocket off the corridor below.
            length = max(length, getattr(self, 'pocket_top', -9) + 2 - self.y)
        y0, y1 = self.y, self.y + length - 1
        if feat == 'warp':
            # No corridor: the rows stay solid and a warp gate carries the sphere over them.
            self.conn_route = ('warp', None, y0, y1, None)
            self.y = y1 + 1
            return (y0, y1)
        self.carve(c0, c1, y0, y1)
        crossing = None
        if feat == 'holes':
            # 2x2 hole on the inner edge, punched into the wall beside the connector.
            yy = (y0 + y1) // 2
            inner = c1 if side == 'W' else c0
            out = 1 if side == 'W' else -1
            self.carve(inner, inner + out, yy, yy + 1, ' ')
        elif feat == 'pistonX':
            self.movers.append(('pistonX', (y0 + y1) // 2, c0, c1, args.get('period', 3.0), args.get('phase', 0)))
        elif feat == 'strips':
            yy = (y0 + y1) // 2
            self.put(c0 if side == 'E' else c1, yy, 'X')
            self.put(c1 if side == 'E' else c0, yy + 2, 'X')
        elif feat in ('wall', 'autowall', 'flip', 'autoflip'):
            assert length >= 8, 'crossings need 8+ rows'
            self.carve(c0, c1, y0, y0 + 2, 'P')
            self.carve(c0, c1, y1 - 2, y1, 'P')
            self.carve(c0, c1, y0 + 3, y1 - 3, ' ')
            if feat in ('wall', 'autowall'):
                wc = W - 1 if side == 'E' else 0
                for yy in range(y0, y1 + 1):
                    self.put(wc, yy, '|')
            crossing = (feat, side, c0, c1, y0, y1)
            self.crossings.append(crossing)
            # Obstacles on the wall itself: notches cut from its bottom or top edge (steer around them or fall
            # through) and pistons sliding across it. Laid out evenly along the chasm, in travel order.
            notches, pist = list(args.get('notches', [])), args.get('wpistons', 0)
            items = _interleave(list(notches), pist)
            if feat in ('wall', 'autowall') and items:
                rows = list(range(y0 + 3, y1 - 2))       # chasm rows, travel order (y-up = forward)
                need = sum(2 if k == 'n' else 1 for k, _ in items)
                # At least one clear row before, between and after the obstacles (room to line up for the next one).
                assert need + len(items) + 1 <= len(rows), f'wall obstacles {items} need a longer crossing ({len(rows)} chasm rows)'
                gap = (len(rows) - need) // (len(items) + 1)
                r = rows[0] + gap
                for k, v in items:
                    if k == 'n':
                        self.wall_notches.append((len(self.crossings) - 1, r, r + 1, v))
                        r += 2 + gap
                    else:
                        self.wall_pistons.append((len(self.crossings) - 1, r))
                        r += 1 + gap
            self.specials += 1
        if args.get('checkpoint'):
            pass
        self.conn_route = (side, (c0 + c1) / 2, y0, y1, crossing)
        self.y = y1 + 1
        return (y0, y1)


def _interleave(notches, pist):
    out, i = [], 0
    while notches or pist:
        if notches and (i % 2 == 0 or not pist):
            out.append(('n', notches.pop(0)))
        elif pist:
            out.append(('p', None))
            pist -= 1
        i += 1
    return out


def args_loops(feats):
    for f, a in feats:
        if f == 'loops':
            return a.get('n', 2)
    return 2


# ---------------------------------------------------------------------------
# Build a level from its spec: a list of segments.
# ---------------------------------------------------------------------------

def build(spec):
    L = Level(spec)
    L.crossings = []
    L.spawn = None
    L.goal = None
    legs = []          # route legs in y-up cell coords
    segs = spec['segments']
    last_exit = None   # (c, y) where the previous segment left
    pending_warp = None  # portal index whose far gate goes at the next segment's entry
    for k, (kind, a) in enumerate(segs):
        is_first = k == 0
        is_last = k == len(segs) - 1
        if kind == 'run':
            (y0, y1) = L.run(cw=a.get('cw', 3), feats=a.get('feats', []), start=is_first, goal=is_last, checkpoint=a.get('checkpoint', False))
            entry, exitc, mid, marks, step = L.run_route
            if is_first:
                last_exit = L.spawn
            if pending_warp is not None:
                L.portals[pending_warp]['b'] = (entry, mid)
                L.portals[pending_warp]['exit'] = (step, 0)
                last_exit = (entry, mid)
                pending_warp = None
            elif last_exit and not is_first:
                legs.append(('path', last_exit, (entry, mid)))
                last_exit = (entry, mid)
            for m in marks:
                last_exit = route_mark(legs, last_exit, m, mid, step, 2 if spec.get('fit') and not spec.get('hardened') else 1)
            end = L.goal if is_last else (exitc, mid)
            legs.append(('path', last_exit, end))
            last_exit = end
        elif kind == 'maze':
            (y0, y1) = L.maze(mw=a.get('mw', 3), ny=a.get('ny', 3), feats=a.get('feats', []), goal=is_last, checkpoint=a.get('checkpoint', False))
            (s, e) = L.maze_route
            if pending_warp is not None:
                L.portals[pending_warp]['b'] = s
                L.portals[pending_warp]['exit'] = (0, 1)
                last_exit = s
                pending_warp = None
            # Keys first (nearest first), then the switch: its door only stays open a few seconds.
            ks = list(getattr(L, 'maze_keys', []))
            L.maze_keys = []
            while ks:
                ks.sort(key=lambda q: abs(q[0] - last_exit[0]) + abs(q[1] - last_exit[1]))
                q = ks.pop(0)
                legs.append(('path', last_exit, q))
                last_exit = q
            sw = getattr(L, 'maze_switch', None)
            if sw:
                legs.append(('path', last_exit, sw))
                last_exit = sw
                L.maze_switch = None
            mw_ = getattr(L, 'maze_warp', None)
            if mw_:
                legs.append(('path', last_exit, mw_['gate']))
                legs.append(('warp', mw_['idx']))
                last_exit = None
                L.maze_warp = None
                pending_warp = mw_['idx']
                continue
            end = L.goal if is_last else e
            legs.append(('path', last_exit, end))
            last_exit = end
        elif kind == 'conn':
            (y0, y1) = L.conn(length=a.get('len', 3), width=a.get('w', 3), feat=a.get('feat'), args=a)
            if L.conn_route[0] == 'warp':
                if pending_warp is None:
                    # Gate at the end of the corridor we just ran.
                    L.portals.append(dict(a=last_exit, b=None, exit=None, decoy=False))
                    legs.append(('warp', len(L.portals) - 1))
                    pending_warp = len(L.portals) - 1
                continue
            side, cx, cy0, cy1, crossing = L.conn_route
            if crossing:
                feat = crossing[0]
                legs.append(('path', last_exit, (cx, cy0 + 1)))
                if feat in ('wall', 'autowall'):
                    legs.append(('shift', side, feat))
                    legs.append(('wall', side, cy0 + 1, cy1 - 1, len(L.crossings) - 1))
                    legs.append(('shift', side, feat, 'back'))
                else:
                    legs.append(('shift', side, feat))
                    legs.append(('ceil', side, cx, cy0 + 1, cy1 - 1))
                    legs.append(('shift', side, feat, 'back'))
                last_exit = (cx, cy1 - 1)
            legs.append(('path', last_exit, (cx, cy1)))
            last_exit = (cx, cy1)
    L.legs = legs
    return L


def route_mark(legs, last, m, mid, s, runout=1):
    kind = m[0]
    if kind == 'bridge':
        return last          # the grid path already runs over the bridge cells
    if kind == 'fast':
        a, b = m[1], m[2]
        s = 1 if b > a else -1
        legs.append(('path', last, (a - s, mid)))
        legs.append(('go', (b + runout * s, mid), 3.2))
        return (b + runout * s, mid)
    if kind == 'slow':
        return last
    if kind == 'platform':
        idx, a, b = m[1], m[2], m[3]
        s = 1 if b > a else -1
        legs.append(('path', last, (a - 2 * s, mid)))
        legs.append(('platform', idx, (a - s, mid), (b + 2 * s, mid)))
        return (b + 2 * s, mid)
    if kind == 'piston':
        idx, c = m[1], m[2]
        legs.append(('path', last, (c - 2 * s, mid)))
        legs.append(('piston', idx, (c - 2 * s, mid), (c + 2 * s, mid)))
        return (c + 2 * s, mid)
    if kind == 'laser':
        idx, c = m[1], m[2]
        legs.append(('path', last, (c - 2 * s, mid)))
        legs.append(('laser', idx, (c - 2 * s, mid), (c + 2 * s, mid)))
        return (c + 2 * s, mid)
    if kind == 'switch':
        (sx, sy), door = m[1], m[2]
        legs.append(('path', last, (sx, sy)))
        return (sx, sy)
    if kind == 'arm':
        idx, a, b, lane = m[1], m[2], m[3], m[4]
        s = 1 if b > a else -1
        legs.append(('path', last, (a - s, lane)))
        legs.append(('arm', idx, (a - s, lane), (b + 2 * s, lane)))
        return (b + 2 * s, lane)
    if kind in ('fan', 'pulse'):
        idx, a, b = m[1], m[2], m[3]
        s = 1 if b > a else -1
        back = 2 if kind == 'fan' else 1
        legs.append(('path', last, (a - back * s, mid)))
        legs.append((kind, idx, (a - back * s, mid), (b + 2 * s, mid)))
        return (b + 2 * s, mid)
    if kind == 'warp':
        idx, ga, after = m[1], m[2], m[3]
        s = 1 if after[0] > ga[0] else -1
        legs.append(('path', last, ga))
        legs.append(('warp', idx))
        legs.append(('path', (after[0] - s, mid), after))
        return after
    if kind == 'jump':
        a, land = m[1], m[2]
        s = 1 if land > a else -1
        legs.append(('path', last, (a - 2 * s, mid)))
        legs.append(('go', (land + s, mid), 6.0))
        return (land + s, mid)
    return last


# ---------------------------------------------------------------------------
# Emit TypeScript + route.
# ---------------------------------------------------------------------------

def emit(L, const, meta, export=True, drop_end=None, land_start=False):
    """drop_end: cells (c, y) that become drop holes (the end of an upper floor); land_start: the start pad
    becomes a landing pad (a lower floor of a multi-level board)."""
    ys = [y for (_, y) in L.cells]
    H = max(ys) + 2                      # top border row
    ox, oz = -(W // 2), -(H // 2)
    R = lambda y: H - 1 - y              # y-up -> row
    X = lambda c: round(c + ox, 3)
    Z = lambda y: round(R(y) + oz, 3)
    rows = []
    for y in range(H - 1, -1, -1):
        rows.append(''.join(L.get(c, y) if 0 < c < W - 1 and 0 < y < H - 1 else ('|' if L.get(c, y) == '|' else '#') for c in range(W)))
    plats, movers, zones = [], [], []
    L.wall_piston_idx = {}
    for p in L.platforms:
        if p[0] == 'ramp':
            _, cols, deckc, mid, cw = p
            # The high end of the ramp touches the deck.
            near_deck = cols[-1] if abs(cols[-1] - deckc[0]) <= 1 or abs(cols[-1] - deckc[-1]) <= 1 else cols[0]
            far = cols[0] if near_deck == cols[-1] else cols[-1]
            s = 1 if near_deck > far else -1
            lo = X(far) - 0.5 * s
            hi = X(near_deck) + 0.5 * s
            plats.append(f"rampX({lo}, 0, {hi}, {BRIDGE_Y}, {Z(mid)}, {cw})")
        elif p[0] == 'deck':
            _, deckc, mid, width = p
            x0, x1 = min(X(c) for c in deckc) - 0.5, max(X(c) for c in deckc) + 0.5
            plats.append(f"{{ position: [{(x0 + x1) / 2}, {BRIDGE_Y - 0.15}, {Z(mid)}], size: [{x1 - x0}, 0.3, {width}], role: 'safe' }}")
    for m in L.movers:
        if m[0] == 'pistonZ':
            _, c, y0, y1, period, phase = m
            movers.append(f"{{ from: [{X(c)}, 0.45, {Z(y1) - 0.05}], to: [{X(c)}, 0.45, {Z(y0) + 0.05}], size: [1.3, 0.9, 0.9], period: {period}, phase: {phase} }}")
        elif m[0] == 'pistonX':
            _, y, c0, c1, period, phase = m
            movers.append(f"{{ from: [{X(c0) - 0.05}, 0.45, {Z(y)}], to: [{X(c1) + 0.05}, 0.45, {Z(y)}], size: [0.9, 0.9, 1.3], period: {period}, phase: {phase} }}")
        elif m[0] == 'platform':
            _, a, b, mid, cw, period, phase = m
            s = 1 if b > a else -1
            ps = 2.2
            xa = X(a) - 0.5 * s + ps / 2 * s + 0.05 * s
            xb = X(b) + 0.5 * s - ps / 2 * s - 0.05 * s
            depth = min(cw, 3) - 0.2
            movers.append(f"{{ kind: 'platform', from: [{round(xa, 3)}, -0.2, {Z(mid)}], to: [{round(xb, 3)}, -0.2, {Z(mid)}], size: [{ps}, 0.4, {depth}], period: {period}, phase: {phase} }}")
    for (feat, side, c0, c1, y0, y1) in L.crossings:
        sgn = 1 if side == 'E' else -1
        auto = feat.startswith('auto')
        za0, za1 = Z(y0 + 2) - 0.5, Z(y0) + 0.5            # pad A (near, bottom)
        zb0, zb1 = Z(y1) - 0.5, Z(y1 - 2) + 0.5            # pad B (far, top)
        x0, x1 = X(c0) - 0.5, X(c1) + 0.5
        zc = (Z(y0) + Z(y1)) / 2
        zl = y1 - y0 + 1
        a = ', auto: true' if auto else ''
        if feat in ('wall', 'autowall'):
            wc = W - 1 if side == 'E' else 0
            face = X(wc) - 0.5 * sgn
            ci = L.crossings.index((feat, side, c0, c1, y0, y1))
            # The wall is built in z slices; a notched slice keeps only the band the notch leaves.
            cuts = sorted(((Z(rb) - 0.5, Z(ra) + 0.5, v) for (k, ra, rb, v) in L.wall_notches if k == ci), key=lambda t: t[0])
            zlo, zhi = Z(y1) - 0.5, Z(y0) + 0.5
            z = zlo
            for (za, zb, v) in cuts + [(zhi, zhi, None)]:
                if za > z + 1e-6:
                    plats.append(f"{{ position: [{X(wc)}, 3, {round((z + za) / 2, 3)}], size: [1, 8, {round(za - z, 3)}], role: 'gravity' }}")
                if v:
                    ylo, yhi = (NOTCH_Y, 7) if v == 'low' else (-1, 8 - NOTCH_Y - 2)
                    plats.append(f"{{ position: [{X(wc)}, {(ylo + yhi) / 2}, {round((za + zb) / 2, 3)}], size: [1, {yhi - ylo}, {round(zb - za, 3)}], role: 'gravity' }}")
                z = zb
            for (k, r) in L.wall_pistons:
                if k == ci:
                    px = round(face - 0.45 * sgn, 3)
                    L.wall_piston_idx[(ci, r)] = len(movers)
                    movers.append(f"{{ from: [{px}, 0.6, {Z(r)}], to: [{px}, 5.4, {Z(r)}], size: [0.9, 0.9, 1.3], period: {WALL_PISTON_PERIOD}, phase: {round((r * 0.37) % 1, 2)} }}")
            plats.append(f"{{ position: [{face - 0.02 * sgn}, 3.2, {(zb0 + zb1) / 2}], size: [0.04, 6.2, 3], role: 'gravity' }}")
            on, off = ('right', 'left') if side == 'E' else ('left', 'right')
            arrow_on, arrow_off = ('▶', '◀') if side == 'E' else ('◀', '▶')
            zones.append(f"{{ min: [{x0}, 0, {za0}], max: [{x1}, 2, {za1}], allow: ['{on}'], whenDown: [0, -1, 0], hint: 'GRAVITY ZONE · SHIFT {arrow_on} ONTO THE WALL'{a} }}")
            wx0, wx1 = (face - 1.5, face + 0.1) if side == 'E' else (face - 0.1, face + 1.5)
            zones.append(f"{{ min: [{wx0}, 0.2, {zb0}], max: [{wx1}, 7.5, {zb1}], allow: ['{off}'], whenDown: [{sgn}, 0, 0], hint: 'GRAVITY ZONE · SHIFT {arrow_off} TO DROP IN'{a} }}")
        else:
            # Glass ceiling over the whole crossing; flip up, roll across, flip down.
            plats.append(f"{{ position: [{(x0 + x1) / 2}, {CEIL + 0.2}, {zc}], size: [{x1 - x0}, 0.4, {zl}], role: 'gravity', glass: true }}")
            lean = f"[{sgn}, 0, 0]"
            zones.append(f"{{ min: [{x0}, 0, {za0}], max: [{x1}, 2, {za1}], allow: ['flip'], whenDown: [0, -1, 0], hint: 'GRAVITY ZONE · FLIP ⇅ ONTO THE CEILING', lean: {lean}{a} }}")
            zones.append(f"{{ min: [{x0}, {CEIL - 1.6}, {zb0}], max: [{x1}, {CEIL}, {zb1}], allow: ['flip'], whenDown: [0, 1, 0], hint: 'GRAVITY ZONE · FLIP ⇅ TO DROP DOWN'{a} }}")
    extra = []
    if L.crumble:
        extra.append('  crumble: [\n' + ''.join(f"    {{ position: [{X(c)}, 0, {Z(y)}], size: [1, 1] }},\n" for c, y in L.crumble) + '  ],')
    if L.pads:
        ps = []
        for p in L.pads:
            xa, xb = sorted((X(p['c0']), X(p['c1'])))
            za, zb = sorted((Z(p['y0']), Z(p['y1'])))
            d = p.get('dir')
            dd = f", dir: [{d[0]}, {-d[1]}]" if d else ''
            ps.append(f"    {{ kind: '{p['kind']}', min: [{xa - 0.5}, {za - 0.5}], max: [{xb + 0.5}, {zb + 0.5}], y: 0{dd} }},\n")
        extra.append('  pads: [\n' + ''.join(ps) + '  ],')
    if L.lasers:
        ls = []
        for (c, y0, y1, period, on, phase) in L.lasers:
            ls.append(f"    {{ from: [{X(c)}, 0.45, {Z(y1) - 0.5}], to: [{X(c)}, 0.45, {Z(y0) + 0.5}], period: {period}, on: {on}, phase: {phase} }},\n")
        extra.append('  lasers: [\n' + ''.join(ls) + '  ],')
    if L.doors:
        ds = []
        for d in L.doors:
            if d[0] == 'maze':
                _, ca, cb, y = d
                ds.append(f"    {{ position: [{(X(ca) + X(cb)) / 2}, 0.5, {Z(y)}], size: [{cb - ca + 1}, 1, 0.9] }},\n")
            else:
                c, y0, y1 = d
                ds.append(f"    {{ position: [{X(c)}, 0.5, {(Z(y0) + Z(y1)) / 2}], size: [0.9, 1, {y1 - y0 + 1}] }},\n")
        extra.append('  doors: [\n' + ''.join(ds) + '  ],')
        extra.append('  switches: [\n' + ''.join(f"    {{ position: [{X(sx)}, 0.05, {Z(sy)}], doors: [{d}], time: {door_time(L, rows, R, sx, sy, d)} }},\n" for sx, sy, d in L.switches) + '  ],')
    chutes = getattr(L, 'chutes', [])
    if L.wells or chutes:
        extra.append('  wells: [\n' + ''.join(f"    {{ min: [{X(a) - 0.5}, -1, {Z(y1) - 0.5}], max: [{X(b) + 0.5}, 6, {Z(y0) + 0.5}], scale: {s} }},\n" for a, b, y0, y1, s in L.wells)
                     + ''.join(f"    {{ min: [{X(a) - 0.5}, 1.1, {Z(y1) - 0.5}], max: [{X(b) + 0.5}, 5.4, {Z(y0) + 0.5}], scale: 0.3, steer: 2.6 }},\n" for a, b, y0, y1 in chutes) + '  ],')
    if L.rotators:
        rs = []
        for (k, cx, cy, size, speed, phase) in L.rotators:
            yy = 0 if k == 'arm' else 0
            rs.append(f"    {{ kind: '{k}', centre: [{X(cx)}, {yy}, {Z(cy)}], size: {size}, speed: {speed}, phase: {phase} }},\n")
        extra.append('  rotators: [\n' + ''.join(rs) + '  ],')
    if L.portals:
        ps = []
        for g in L.portals:
            a, b = g['a'], g['b']
            assert b is not None, 'warp gate without a far end (a warp connector must be followed by a segment)'
            ex = f", exit: [{g['exit'][0]}, {-g['exit'][1]}]" if g.get('exit') else ''
            dc = ', decoy: true' if g.get('decoy') else ''
            ps.append(f"    {{ a: [{X(a[0])}, 0, {Z(a[1])}], b: [{X(b[0])}, 0, {Z(b[1])}]{ex}{dc} }},\n")
        extra.append('  portals: [\n' + ''.join(ps) + '  ],')
    if L.keys:
        extra.append('  keys: [\n' + ''.join(f"    {{ position: [{X(kx)}, 0, {Z(ky)}] }},\n" for kx, ky in L.keys) + '  ],')
    if L.fans:
        fs = []
        for (c0, c1, y0, y1, d, strength, period, on, phase) in L.fans:
            fs.append(f"    {{ min: [{X(c0) - 0.5}, -0.2, {Z(y1) - 0.5}], max: [{X(c1) + 0.5}, 2, {Z(y0) + 0.5}], dir: [{d[0]}, {-d[1]}], strength: {strength}, period: {period}, on: {on}, phase: {phase} }},\n")
        extra.append('  fans: [\n' + ''.join(fs) + '  ],')
    if L.pulses:
        extra.append('  pulses: [\n' + ''.join(f"    {{ min: [{X(c0) - 0.5}, {Z(y1) - 0.5}], max: [{X(c1) + 0.5}, {Z(y0) + 0.5}], y: 0, period: {period}, on: {on}, phase: {phase} }},\n" for (c0, c1, y0, y1, period, on, phase) in L.pulses) + '  ],')
    if L.spec.get('dark'):
        extra.append('  dark: true,')
    out_rows = []
    for i, r in enumerate(rows):
        y = H - 1 - i
        r = list(r)
        for c in range(W):
            if drop_end is not None and r[c] == 'G':
                r[c] = 'D' if (c, y) in drop_end else '.'
            if land_start and r[c] == 'S':
                r[c] = 'L'
        out_rows.append(''.join(r))
    rows_src = '\n'.join(f"      '{r}', // {i}" for i, r in enumerate(out_rows))
    sp = L.spawn
    gp = L.goal
    route = resolve_route(L, rows, X, Z, R)
    par3, par2 = estimate_par(L, rows, route)
    meta['par'] = (par3, par2)
    zsrc = ('\n  shiftZones: [\n    ' + ',\n    '.join(zones) + ',\n  ],') if zones else ''
    nl = '\n'
    L.counts = dict(movers=len(movers), lasers=len(L.lasers), rotators=len(L.rotators), fans=len(L.fans), pulses=len(L.pulses), portals=len(L.portals))
    L.H, L.ox, L.oz = H, ox, oz
    src = f"""
{'export ' if export else ''}const {const}: LevelDef = {{
  id: '{meta['id']}',
  name: '{meta['name']}',
  subtitle: '{meta['sub']}',
  spawn: [{X(sp[0])}, 0.6, {Z(sp[1])}],
  frame: FLOOR,
  allowShifts: {'true' if zones else 'false'},{zsrc}
  maze: {{
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [{ox}, {oz}],
    rows: [
{rows_src}
    ],
  }},
  platforms: [{nl + '    ' + (',' + nl + '    ').join(plats) + ',' + nl + '  ' if plats else ''}],
  movers: [{nl + '    ' + (',' + nl + '    ').join(movers) + ',' + nl + '  ' if movers else ''}],
  checkpoints: [{', '.join(f'{{ position: [{X(c)}, 0, {Z(y)}], frame: FLOOR }}' for c, y in L.checkpoints)}],
{nl.join(extra) + nl if extra else ''}  goal: {{ position: [{X(gp[0])}, 0, {Z(gp[1])}], up: [0, 1, 0], facing: [0, 0, 1] }},
  camera: MAZE_CAMERA,
  killY: -6,
  par: {{ three: {par3}, two: {par2} }},
  fallMargin: 6,
}};
"""
    return src, route


DOOR_PACE = 2.4      # m/s a player is expected to hold from a switch to its door
DOOR_SPARE = 2.0     # seconds of slack on top


def door_time(L, rows, R, sx, sy, d):
    """Seconds a switch keeps its door open: the walk from the switch to the door at a brisk pace, plus a little
    slack (Chris, 2026-11-16: doors should only stay open a few seconds)."""
    door = L.doors[d]
    if door[0] == 'maze':
        _, ca, cb, y = door
        target = ((ca + cb) / 2, y - 1)
    else:
        c, y0, y1 = door
        target = (c, (y0 + y1) / 2)
    _, n, cells = grid_path(rows, (sx, R(sy)), (target[0], R(target[1])))
    on_path = set(cells)
    wait = 0.0
    # Blinking lasers and sliding pistons on the way back can each hold the player up for about one cycle.
    for (c, y0, y1, period, _, _) in L.lasers:
        if any((R(y), c) in on_path for y in range(y0, y1 + 1)):
            wait += period
    for m in L.movers:
        if m[0] == 'pistonZ':
            _, c, y0, y1, period, _ = m
            hit = any((R(y), c) in on_path for y in range(y0, y1 + 1))
        elif m[0] == 'pistonX':
            _, y, c0, c1, period, _ = m
            hit = any((R(y), c) in on_path for c in range(c0, c1 + 1))
        else:
            hit = False
        if hit:
            wait += period
    return max(4, int(math.ceil(n / DOOR_PACE + wait + DOOR_SPARE)))


def grid_path(rows, a, b):
    """Dijkstra over walkable cells, preferring the middle of corridors. a, b: (c, row)."""
    H, Wd = len(rows), len(rows[0])
    WALK = '.SCGPBKL'

    def ok(r, c):
        return 0 <= r < H and 0 <= c < Wd and rows[r][c] in WALK

    def cost(r, c):
        pen = 0
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if not ok(r + dr, c + dc) or (rows[r + dr][c + dc] == 'B') != (rows[r][c] == 'B'):
                    pen += 1
                # Keep well clear of holes: they pull the sphere in when it brushes their edge.
                if 0 <= r + dr < H and 0 <= c + dc < Wd and rows[r + dr][c + dc] == ' ':
                    pen += 3
        return 1 + pen * 2

    sc, sr = int(round(a[0])), int(round(a[1]))
    gc, gr = int(round(b[0])), int(round(b[1]))
    if not ok(sr, sc) or not ok(gr, gc):
        raise ValueError(f'path end not walkable {a}->{b}: {rows[sr][sc] if 0 <= sr < H else "?"} {rows[gr][gc] if 0 <= gr < H else "?"}')
    dist = {(sr, sc): 0}
    prev = {}
    pq = [(0, sr, sc)]
    while pq:
        d, r, c = heapq.heappop(pq)
        if (r, c) == (gr, gc):
            break
        if d > dist[(r, c)]:
            continue
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (r + dr, c + dc)
            if ok(*n):
                nd = d + cost(*n)
                if nd < dist.get(n, 1e9):
                    dist[n] = nd
                    prev[n] = (r, c)
                    heapq.heappush(pq, (nd, *n))
    if (gr, gc) not in dist:
        raise ValueError(f'no path {a} -> {b}')
    path = [(gr, gc)]
    while path[-1] != (sr, sc):
        path.append(prev[path[-1]])
    path.reverse()
    pts = [path[0]]
    for i in range(1, len(path) - 1):
        p0, p1, p2 = path[i - 1], path[i], path[i + 1]
        if (p1[0] - p0[0], p1[1] - p0[1]) != (p2[0] - p1[0], p2[1] - p1[1]):
            pts.append(p1)
    pts.append(path[-1])
    return pts, len(path), path


def resolve_route(L, rows, X, Z, R):
    """Turns the legs into autopilot steps in world coordinates."""
    steps = []
    L.route_len = 0
    for leg in L.legs:
        k = leg[0]
        if k == 'path':
            a, b = leg[1], leg[2]
            pts, n, cells = grid_path(rows, (a[0], R(a[1])), (b[0], R(b[1])))
            L.route_len += n
            # Maze lasers on this stretch: stop short, wait for the beam, cross.
            beams = {}
            for idx in L.maze_lasers:
                c, y0, y1 = L.lasers[idx][0], L.lasers[idx][1], L.lasers[idx][2]
                for y in range(y0, y1 + 1):
                    beams[(R(y), c)] = idx
            for idx in L.maze_pulses:
                c0, c1, y0, y1 = L.pulses[idx][:4]
                for y in range(y0, y1 + 1):
                    for c in range(c0, c1 + 1):
                        beams[(R(y), c)] = ('pulses', idx)
            hits = []
            for i, cell in enumerate(cells):
                # One wait per doorway (a pulse patch can cover several cells in a row).
                if cell in beams and not (hits and i - hits[-1] <= 2 and beams[cells[hits[-1]]] == beams[cell]):
                    hits.append(i)
            if hits:
                start = 0
                for i in hits:
                    i0, i1 = max(start, i - 2), min(len(cells) - 1, i + 2)
                    # Cross straight over the beam; stop one cell past it if the way turns right after.
                    if i1 == i + 2 and (cells[i + 2][0] - cells[i + 1][0], cells[i + 2][1] - cells[i + 1][1]) != (cells[i + 1][0] - cells[i][0], cells[i + 1][1] - cells[i][1]):
                        i1 = i + 1
                    sub, _, _ = grid_path(rows, (cells[start][1], cells[start][0]), (cells[i0][1], cells[i0][0])) if i0 > start else ([cells[start]], 0, None)
                    for (r, c) in sub[1:]:
                        steps.append({'p': [X(c), 0.5, round(r + (Z(0) - R(0)), 3)]})
                    zr = lambda r: round(r + (Z(0) - R(0)), 3)
                    bm = beams[cells[i]]
                    pts3 = {'near': [X(cells[i0][1]), 0.5, zr(cells[i0][0])], 'at': [X(cells[i][1]), 0.5, zr(cells[i][0])], 'far': [X(cells[i1][1]), 0.5, zr(cells[i1][0])]}
                    steps.append({'cycle': bm[0], 'idx': bm[1], **pts3} if isinstance(bm, tuple) else {'laser': bm, **pts3})
                    start = i1
                sub, _, _ = grid_path(rows, (cells[start][1], cells[start][0]), (cells[-1][1], cells[-1][0]))
                pts = sub
            for (r, c) in pts[1:]:
                steps.append({'p': [X(c), 0.5, round(r + (Z(0) - R(0)), 3)]})
            # Land on the exact (possibly half-cell) end point.
            steps.append({'p': [X(b[0]), 0.5, Z(b[1])]})
        elif k == 'go':
            b, v = leg[1], leg[2]
            steps.append({'p': [X(b[0]), 0.5, Z(b[1])], 'v': v})
            L.route_len += 6
        elif k == 'shift':
            side, feat = leg[1], leg[2]
            back = len(leg) > 3
            if feat in ('wall', 'autowall'):
                d = ('left' if side == 'E' else 'right') if back else ('right' if side == 'E' else 'left')
            else:
                d = 'flip'
            steps.append({'shift': d, 'auto': feat.startswith('auto')})
        elif k == 'wall':
            side, y0, y1 = leg[1], leg[2], leg[3]
            wc = W - 1 if side == 'E' else 0
            sgn = 1 if side == 'E' else -1
            xw = X(wc) - 0.5 * sgn - 0.5 * sgn
            steps.append({'p': [xw, 3, Z(y0)]})
            ci = leg[4]
            obstacles = [(ra, 'n', rb, v) for (k, ra, rb, v) in L.wall_notches if k == ci] + [(r, 'p', r, None) for (k, r) in L.wall_pistons if k == ci]
            lane = 3
            for (ra, kind, rb, v) in sorted(obstacles):
                if kind == 'n':
                    # Line up in the clear row before the notch, on the side the notch leaves, then pass it.
                    lane = 4.9 if v == 'low' else 1.4
                    steps.append({'p': [xw, lane, Z(ra - 1)], 'v': 2.5})
                    steps.append({'p': [xw, lane, Z(rb + 1)], 'v': 2.5})
                else:
                    steps.append({'p': [xw, lane, Z(ra - 1)], 'v': 2.5})
                    steps.append({'piston': L.wall_piston_idx[(ci, ra)], 'near': [xw, lane, Z(ra - 1)], 'far': [xw, lane, Z(ra + 1)]})
            steps.append({'p': [xw, 3, Z(y1)], 'v': 2.5})
            L.route_len += (y1 - y0) + 4
        elif k == 'ceil':
            side, cx, y0, y1 = leg[1], leg[2], leg[3], leg[4]
            steps.append({'p': [X(cx), CEIL - 0.5, Z(y1)], 'v': 2.5})
            L.route_len += (y1 - y0) + 4
        elif k == 'platform':
            idx, a, b = leg[1], leg[2], leg[3]
            steps.append({'platform': idx, 'near': [X(a[0]), 0.5, Z(a[1])], 'far': [X(b[0]), 0.5, Z(b[1])]})
            L.route_len += abs(b[0] - a[0]) + 8
        elif k == 'piston':
            idx, a, b = leg[1], leg[2], leg[3]
            steps.append({'piston': idx, 'near': [X(a[0]), 0.5, Z(a[1])], 'far': [X(b[0]), 0.5, Z(b[1])]})
            L.route_len += 4
        elif k == 'laser':
            idx, a, b = leg[1], leg[2], leg[3]
            steps.append({'laser': idx, 'near': [X(a[0]), 0.5, Z(a[1])], 'far': [X(b[0]), 0.5, Z(b[1])]})
            L.route_len += 4
        elif k == 'arm':
            idx, a, b = leg[1], leg[2], leg[3]
            steps.append({'arm': idx, 'near': [X(a[0]), 0.5, Z(a[1])], 'far': [X(b[0]), 0.5, Z(b[1])]})
            L.route_len += abs(b[0] - a[0]) + 4
        elif k in ('fan', 'pulse'):
            idx, a, b = leg[1], leg[2], leg[3]
            steps.append({'cycle': k + 's', 'idx': idx, 'near': [X(a[0]), 0.5, Z(a[1])], 'far': [X(b[0]), 0.5, Z(b[1])]})
            L.route_len += abs(b[0] - a[0]) + 4
        elif k == 'warp':
            g = L.portals[leg[1]]
            steps.append({'warp': leg[1], 'to': [X(g['b'][0]), 0.5, Z(g['b'][1])]})
    return steps


def estimate_par(L, rows, route):
    # Roughly 2.4 m/s for a clean run through corridors, plus time for each special crossing.
    secs = L.route_len / 2.4 + 5 * L.specials + 3 * len(L.lasers) + 3 * len(L.switches) + 4 * len([m for m in L.movers if m[0] == 'platform']) \
        + 3 * len(L.fans) + 2 * len(L.pulses) + 2 * len(L.portals) + 1.5 * len(L.keys)
    three = int(math.ceil(secs / 5.0) * 5)
    two = int(math.ceil(secs * 1.6 / 5.0) * 5)
    return max(three, 20), max(two, 35)


HEADER = """import type {{ LevelDef }} from '../LevelTypes';
import {{ MAZE_CAMERA, rampX }} from '../levelHelpers';

/**
 * {title}
 * Generated by tools/levelgen ({script}); edit the spec there and regenerate rather than editing this file.
 */
const FLOOR = {{ down: [0, -1, 0] as [number, number, number], forward: [0, 0, -1] as [number, number, number] }};
"""


TIER_DROP = 5.0      # metres between the floors of a multi-level board


def _no_crumble_turns(L, route, redo):
    """The route must never turn on a crumbling tile: turn those tiles back into floor and emit again."""
    s = None
    while True:
        ys = [y for (_, y) in L.cells]
        H = max(ys) + 2
        ox, oz = -(W // 2), -(H // 2)
        bad = set()
        for st in route:
            if 'p' in st and 'v' not in st:
                c, y = int(round(st['p'][0] - ox)), int(round(H - 1 - (st['p'][2] - oz)))
                if L.get(c, y) == 'K':
                    bad.add((c, y))
        if not bad:
            return s, route
        todo = list(bad)
        while todo:
            c, y = todo.pop()
            if L.get(c, y) != 'K':
                continue
            L.put(c, y, '.')
            L.crumble.remove((c, y))
            todo += [(c + 1, y), (c - 1, y), (c, y + 1), (c, y - 1)]
        s, route = redo()


def build_tiered(const, spec):
    """A multi-level board: each floor is built as its own level, then placed under the one above
    (every second floor mirrored front to back, so it starts right under the drop hole)."""
    tiers = spec['tiers']
    src, route, side = '', [], 'W'
    parts, pars = [], [0, 0]
    offs = dict(movers=0, lasers=0, rotators=0, fans=0, pulses=0, portals=0)
    prev = None      # (world z of the drop's middle row, cw)
    for t, ts in enumerate(tiers):
        last = t == len(tiers) - 1
        segs = ts['segments']
        if t:
            # Under another floor a wall has only about 4 m of headroom: notches go high (the lane runs low).
            segs = [(k, {**a, 'notches': ['high' for _ in a['notches']]}) if k == 'conn' and a.get('notches') else (k, a) for k, a in segs]
        sub = dict(spec, segments=segs, side=side, seed=spec.get('seed', 1) * 10 + t)
        L = build(sub)
        nxt_chute = None if last else tiers[t + 1].get('chute')
        chute = ts.get('chute') if t else None
        sgn_order = None
        if t:
            # Start of a lower floor: where the floor above dropped us.
            order = [W - 2 - i for i in range(W - 2)] if side == 'E' else [1 + i for i in range(W - 2)]
            srows = sorted({y for (c, y), ch in L.cells.items() if ch == 'S'})
            if chute:
                g = chute
                for i in range(4):
                    for y in srows:
                        L.put(order[i], y, '.')
                for i in range(g):
                    for y in srows:
                        L.put(order[i], y, ' ')
                for i in (g, g + 1):
                    for y in srows:
                        L.put(order[i], y, 'L')
                island = ((order[g] + order[g + 1]) / 2, (srows[0] + srows[-1]) / 2)
                L.checkpoints.append(island)
                L.legs[0] = ('path', island, L.legs[0][2])
                L.spawn = island
                L.chutes = [(min(order[0], order[g + 1]), max(order[0], order[g + 1]), srows[0], srows[-1])]
            elif not any(True for _ in L.checkpoints):
                pass
        drop = None
        if not last:
            gcells = [(c, y) for (c, y), ch in L.cells.items() if ch == 'G']
            cols = sorted({c for c, _ in gcells})
            gys = sorted({y for _, y in gcells})
            if nxt_chute:
                far = cols[-2:] if L.side == 'E' else cols[:2]
                drop = {(c, y) for (c, y) in gcells if c in far}
                L.goal = (sum(far) / 2, (gys[0] + gys[-1]) / 2)
                # The route must run on to the drop holes, not stop at the old goal.
                assert L.legs[-1][0] == 'path', 'a floor before a chute must end with a corridor'
                L.legs[-1] = ('path', L.legs[-1][1], L.goal)
            else:
                drop = set(gcells)
        name = f'{const}__{t}'
        meta = dict(id=f"{spec['id']}-{t}", name=spec['name'], sub=spec['sub'])
        redo = lambda: emit(L, name, meta, export=False, drop_end=drop, land_start=bool(t) and not chute)
        s, r = redo()
        s2, r2 = _no_crumble_turns(L, r, redo)
        if s2:
            s, r = s2, r2
        src += s
        pars[0] += meta['par'][0]
        pars[1] += meta['par'][1]
        # Placement: floor t sits TIER_DROP lower than floor t-1; odd floors are mirrored.
        flip = t % 2 == 1
        sg = -1 if flip else 1
        dy = -TIER_DROP * t
        Zl = lambda y: L.H - 1 - y + L.oz
        if t == 0:
            dz = 0.0
        else:
            srows = sorted({y for (c, y), ch in L.cells.items() if ch in 'SL' and (c, y) != (-1, -1)})
            mid_local = Zl((srows[0] + srows[-1]) / 2)
            dz = prev - sg * mid_local
        parts.append(f"placeTier({name}, {{ dy: {dy}, dz: {round(dz, 3)}{', flip: true' if flip else ''} }})")
        # Route: move into place and renumber obstacles.
        tf = lambda q: [q[0], round(q[1] + dy, 3), round(sg * q[2] + dz, 3)]
        kinds = {'platform': 'movers', 'piston': 'movers', 'laser': 'lasers', 'arm': 'rotators', 'warp': 'portals'}
        for st in r:
            st = dict(st)
            for key in ('p', 'near', 'far', 'at', 'to'):
                if key in st:
                    st[key] = tf(st[key])
            for key, kind in kinds.items():
                if key in st and isinstance(st[key], int) and not isinstance(st[key], bool):
                    st[key] += offs[kind]
            if 'cycle' in st:
                st['idx'] += offs[st['cycle']]
            route.append(st)
        for k in offs:
            offs[k] += L.counts[k]
        if not last:
            gys = sorted({y for (c, y) in drop})
            prev = sg * Zl((gys[0] + gys[-1]) / 2) + dz
            step = {'drop': round(-TIER_DROP * (t + 1), 3)}
            if nxt_chute:
                step['chute'] = True
            route.append(step)
        side = L.side
    # Chute steps steer toward the island: that is the next floor's first route point.
    for i, st in enumerate(route):
        if st.get('chute'):
            st['steer'] = route[i + 1]['p']
    par3 = int(math.ceil((pars[0] + 4 * (len(tiers) - 1)) / 5.0) * 5)
    par2 = int(math.ceil((pars[1] + 6 * (len(tiers) - 1)) / 5.0) * 5)
    src += f"""
export const {const}: LevelDef = stackTiers({{ id: '{spec['id']}', name: '{spec['name']}', subtitle: '{spec['sub']}', par: {{ three: {par3}, two: {par2} }} }}, [
  {(','+chr(10)+'  ').join(parts)},
]);
"""
    return src, route, (par3, par2)


ERRORS = []


def write_world(path, title, script, levels):
    """levels: list of (const, spec). Returns {id: route}."""
    src = HEADER.format(title=title, script=script)
    routes = {}
    for const, spec in levels:
        if 'tiers' in spec:
            try:
                s, route, par = build_tiered(const, spec)
            except (AssertionError, ValueError) as e:
                ERRORS.append(f"{spec['id']}: {e}")
                continue
            src += s
            routes[spec['id']] = route
            print(f"  {spec['id']:28s} tiers {len(spec['tiers'])}  par {par}")
            continue
        try:
            L = build(spec)
            meta = dict(id=spec['id'], name=spec['name'], sub=spec['sub'])
            s, route = emit(L, const, meta)
        except (AssertionError, ValueError) as e:
            ERRORS.append(f"{spec['id']}: {e}")
            continue
        # The route must never turn on a crumbling tile: turn those tiles back into floor and emit again.
        while True:
            ys = [y for (_, y) in L.cells]
            H = max(ys) + 2
            ox, oz = -(W // 2), -(H // 2)
            bad = set()
            for st in route:
                if 'p' in st and 'v' not in st:
                    c, y = int(round(st['p'][0] - ox)), int(round(H - 1 - (st['p'][2] - oz)))
                    if L.get(c, y) == 'K':
                        bad.add((c, y))
            if not bad:
                break
            todo = list(bad)
            while todo:
                c, y = todo.pop()
                if L.get(c, y) != 'K':
                    continue
                L.put(c, y, '.')
                L.crumble.remove((c, y))
                todo += [(c + 1, y), (c - 1, y), (c, y + 1), (c, y - 1)]
            s, route = emit(L, const, meta)
        if 'rampX' not in s:
            pass
        src += s
        routes[spec['id']] = route
        print(f"  {spec['id']:28s} rows {len([1 for _ in s.splitlines() if _.strip().startswith(chr(39))])}  par {meta['par']}")
    if 'rampX(' not in src:
        src = src.replace("import { MAZE_CAMERA, rampX } from '../levelHelpers';", "import { MAZE_CAMERA } from '../levelHelpers';")
    if 'stackTiers(' in src:
        src = src.replace("from '../levelHelpers';\n", "from '../levelHelpers';\nimport { placeTier, stackTiers } from '../tiers';\n", 1)
    open(path, 'w').write(src)
    return routes
