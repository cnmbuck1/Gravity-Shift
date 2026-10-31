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
        self.checkpoints = []      # (cx, cy) cell coords (float)
        self.legs = []             # route legs, cell coords until resolved
        self.y = 1                 # next free row (y-up); row 0 is the border
        self.side = 'W'            # side the next segment is entered from
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
    APPROACH = {'platform': 2, 'laser': 2, 'jump': 2, 'door': 6, 'bridge': 0}
    # Clear cells needed after a feature (where the route steps off it).
    EXIT = {'platform': 2, 'arm': 2, 'bridge': 0}

    def _slots(self, usable, feats):
        if self.spec.get('layout', 1) == 1:
            return self._slots_v1(usable, feats)
        """Places the features along the usable columns, spreading spare room evenly.
        Returns (first, last) column pairs in travel order."""
        if not feats:
            return []
        widths = [self._feat_width(f, a) for f, a in feats]
        names = [f for f, _ in feats]
        need = [max(self.APPROACH.get(f, 1), self.EXIT.get(names[k - 1], 1) if k else 0) for k, f in enumerate(names)] + [self.EXIT.get(names[-1], 1)]
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
                'disc': 5, 'jump': 2 + args.get('gap', 3), 'well': args.get('len', 6), 'ice': args.get('len', 6)}.get(f, 1)

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
            elif f == 'deadholes':
                for d in dead[1:1 + args.get('n', 2)]:
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
        y0, y1 = self.y, self.y + length - 1
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
    for k, (kind, a) in enumerate(segs):
        is_first = k == 0
        is_last = k == len(segs) - 1
        if kind == 'run':
            (y0, y1) = L.run(cw=a.get('cw', 3), feats=a.get('feats', []), start=is_first, goal=is_last, checkpoint=a.get('checkpoint', False))
            entry, exitc, mid, marks, step = L.run_route
            if is_first:
                last_exit = L.spawn
            if last_exit and not is_first:
                legs.append(('path', last_exit, (entry, mid)))
                last_exit = (entry, mid)
            for m in marks:
                last_exit = route_mark(legs, last_exit, m, mid, step)
            end = L.goal if is_last else (exitc, mid)
            legs.append(('path', last_exit, end))
            last_exit = end
        elif kind == 'maze':
            (y0, y1) = L.maze(mw=a.get('mw', 3), ny=a.get('ny', 3), feats=a.get('feats', []), goal=is_last, checkpoint=a.get('checkpoint', False))
            (s, e) = L.maze_route
            sw = getattr(L, 'maze_switch', None)
            if sw:
                legs.append(('path', last_exit, sw))
                last_exit = sw
                L.maze_switch = None
            end = L.goal if is_last else e
            legs.append(('path', last_exit, end))
            last_exit = end
        elif kind == 'conn':
            (y0, y1) = L.conn(length=a.get('len', 3), width=a.get('w', 3), feat=a.get('feat'), args=a)
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


def route_mark(legs, last, m, mid, s):
    kind = m[0]
    if kind == 'bridge':
        return last          # the grid path already runs over the bridge cells
    if kind == 'fast':
        a, b = m[1], m[2]
        s = 1 if b > a else -1
        legs.append(('path', last, (a - s, mid)))
        legs.append(('go', (b + s, mid), 3.2))
        return (b + s, mid)
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

def emit(L, const, meta):
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
        extra.append('  switches: [\n' + ''.join(f"    {{ position: [{X(sx)}, 0.05, {Z(sy)}], doors: [{d}] }},\n" for sx, sy, d in L.switches) + '  ],')
    if L.wells:
        extra.append('  wells: [\n' + ''.join(f"    {{ min: [{X(a) - 0.5}, -1, {Z(y1) - 0.5}], max: [{X(b) + 0.5}, 6, {Z(y0) + 0.5}], scale: {s} }},\n" for a, b, y0, y1, s in L.wells) + '  ],')
    if L.rotators:
        rs = []
        for (k, cx, cy, size, speed, phase) in L.rotators:
            yy = 0 if k == 'arm' else 0
            rs.append(f"    {{ kind: '{k}', centre: [{X(cx)}, {yy}, {Z(cy)}], size: {size}, speed: {speed}, phase: {phase} }},\n")
        extra.append('  rotators: [\n' + ''.join(rs) + '  ],')
    rows_src = '\n'.join(f"      '{r}', // {i}" for i, r in enumerate(rows))
    sp = L.spawn
    gp = L.goal
    route = resolve_route(L, rows, X, Z, R)
    par3, par2 = estimate_par(L, rows, route)
    meta['par'] = (par3, par2)
    zsrc = ('\n  shiftZones: [\n    ' + ',\n    '.join(zones) + ',\n  ],') if zones else ''
    nl = '\n'
    src = f"""
export const {const}: LevelDef = {{
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


def grid_path(rows, a, b):
    """Dijkstra over walkable cells, preferring the middle of corridors. a, b: (c, row)."""
    H, Wd = len(rows), len(rows[0])
    WALK = '.SCGPBK'

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
            hits = [i for i, cell in enumerate(cells) if cell in beams]
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
                    steps.append({'laser': beams[cells[i]], 'near': [X(cells[i0][1]), 0.5, zr(cells[i0][0])], 'at': [X(cells[i][1]), 0.5, zr(cells[i][0])], 'far': [X(cells[i1][1]), 0.5, zr(cells[i1][0])]})
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
    return steps


def estimate_par(L, rows, route):
    # Roughly 2.4 m/s for a clean run through corridors, plus time for each special crossing.
    secs = L.route_len / 2.4 + 5 * L.specials + 3 * len(L.lasers) + 3 * len(L.switches) + 4 * len([m for m in L.movers if m[0] == 'platform'])
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


def write_world(path, title, script, levels):
    """levels: list of (const, spec). Returns {id: route}."""
    src = HEADER.format(title=title, script=script)
    routes = {}
    for const, spec in levels:
        L = build(spec)
        meta = dict(id=spec['id'], name=spec['name'], sub=spec['sub'])
        s, route = emit(L, const, meta)
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
    open(path, 'w').write(src)
    return routes
