"""Worlds 4-10: crumble and platforms, flux pads, ceilings, circuits, low orbit, spinners, and the finale world.
Run: python3 worlds_4_10.py   (then test with autopilot.cjs)
Per world: 1-2 intro, 3-4 practice, 5 breather, 6-8 combine, 9 challenge, 10 finale.
"""
import json
import os
from levelgen import write_world

R = lambda **k: ('run', k)
C = lambda **k: ('conn', k)
M = lambda **k: ('maze', k)


def lvl(const, id, name, sub, seed, *segments):
    return (const, dict(id=id, name=name, sub=sub, seed=seed, layout=2, segments=list(segments)))


crumble = lambda n=4: ('crumble', {'len': n})
plat = lambda gap=5, period=6.0, phase=0: ('platform', {'gap': gap, 'period': period, 'phase': phase})
holes = lambda **k: ('holes', k)
piston = lambda **k: ('piston', k)
strips = lambda **k: ('strips', k)
pad = lambda kind, n=5, **k: ('pad', dict(kind=kind, len=n, **k))
ice = lambda n=6, **k: ('ice', dict(len=n, **k))
laser = lambda period=2.6, on=0.42, phase=0: ('laser', {'period': period, 'on': on, 'phase': phase})
door = lambda **k: ('door', k)
well = lambda n=6, scale=0.4: ('well', {'len': n, 'scale': scale})
jump = lambda gap=3, low=None: ('jump', {'gap': gap, 'low': low})
arm = lambda speed=1.0, phase=0, top=True: ('arm', {'speed': speed, 'phase': phase, 'top': top})
disc = lambda speed=0.6: ('disc', {'speed': speed})

W4 = [
    lvl('SOFT_GROUND', 'w4-soft-ground', 'Soft Ground', 'Cracked tiles fall away: keep moving', 41,
        R(cw=3, feats=[crumble(4)]), C(len=3), R(cw=3, feats=[crumble(5)])),
    lvl('FERRY', 'w4-ferry', 'Ferry', 'Wait for the platform and ride it over', 42,
        R(cw=3, feats=[plat(5)]), C(len=3), R(cw=3)),
    lvl('FALLING_FLOOR', 'w4-falling-floor', 'Falling Floor', 'Crumbling doorways in a small maze', 43,
        R(cw=3, feats=[crumble(4)]), C(len=2), M(mw=3, ny=2, feats=[('crumble', {'n': 3})]), C(len=2), R(cw=3, feats=[crumble(5)])),
    lvl('CROSSING', 'w4-crossing', 'Crossing', 'Two rides, one cracked floor', 44,
        R(cw=3, feats=[plat(5)]), C(len=3), R(cw=3, checkpoint=True, feats=[crumble(3), plat(5, 5.5)]), C(len=3), R(cw=3)),
    lvl('REST_STOP', 'w4-rest-stop', 'Rest Stop', 'A breather on wide ground', 45,
        R(cw=4, feats=[crumble(3)]), C(len=3), R(cw=4, feats=[plat(5, 6.5)])),
    lvl('CRUMBLE_MAZE', 'w4-crumble-maze', 'Crumble Maze', 'Wrong turns cost you the floor', 46,
        R(cw=3, feats=[crumble(4)]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[('crumble', {'n': 5})]), C(len=2), R(cw=3, feats=[plat(5)])),
    lvl('FERRY_LINES', 'w4-ferry-lines', 'Ferry Lines', 'Platforms back to back', 47,
        R(cw=3, feats=[plat(5, 5.5)]), C(len=4, feat='holes'), R(cw=3, checkpoint=True, feats=[crumble(3), plat(5, 5.0, 0.3)]), C(len=3), R(cw=3, feats=[plat(5, 5.0)])),
    lvl('QUICK_FEET', 'w4-quick-feet', 'Quick Feet', 'Long crumbling runs and narrow halls', 48,
        R(cw=3, feats=[crumble(6), holes()]), C(len=2), M(mw=2, ny=3, checkpoint=True, feats=[('crumble', {'n': 4})]), C(len=2, w=2), R(cw=3, feats=[crumble(2), plat(5)])),
    lvl('BREAKAWAY', 'w4-breakaway', 'Breakaway', 'Pistons, platforms and a floor that will not wait', 49,
        R(cw=3, feats=[piston(), crumble(5)]), C(len=3, feat='pistonX'), R(cw=3, checkpoint=True, feats=[plat(5, 5.0), crumble(3)]), C(len=2),
        M(mw=3, ny=3, feats=[('crumble', {'n': 5}), ('deadholes', {'n': 2})]), C(len=3), R(cw=3, feats=[crumble(6), holes()])),
    lvl('CRUMBLE_BELT', 'w4-crumble-belt', 'Crumble Belt', 'World 4 finale', 40,
        R(cw=3, feats=[crumble(4), holes()]), C(len=4, feat='holes'), M(mw=3, ny=3, checkpoint=True, feats=[('crumble', {'n': 6})]), C(len=3),
        R(cw=3, feats=[plat(5, 5.0), crumble(3)]), C(len=3, feat='pistonX'), R(cw=3, checkpoint=True, feats=[crumble(3), holes(), crumble(3)]), C(len=2, w=2),
        M(mw=2, ny=3, feats=[('crumble', {'n': 4})]), C(len=2, w=2), R(cw=3, feats=[plat(5, 4.8)])),
]

W5 = [
    lvl('BOOST_LANE', 'w5-boost-lane', 'Boost Lane', 'Green pads fire you forward', 51,
        R(cw=3, feats=[pad('boost', 3)]), C(len=3), R(cw=3, feats=[pad('boost', 3)])),
    lvl('ICE_RINK', 'w5-ice-rink', 'Ice Rink', 'Pale blue ice: gentle on the tilt', 52,
        R(cw=4, feats=[ice(6)]), C(len=3), R(cw=4, feats=[ice(8)])),
    lvl('CONVEYOR', 'w5-conveyor', 'Conveyor', 'Belts push with you, then against you', 53,
        R(cw=3, feats=[pad('conveyor', 6)]), C(len=3), R(cw=3, checkpoint=True, feats=[pad('conveyor', 6, against=True)]), C(len=3), R(cw=3, feats=[pad('sticky', 4)])),
    lvl('SIDE_WIND', 'w5-side-wind', 'Side Wind', 'Belts push toward the holes', 54,
        R(cw=3, feats=[pad('conveyor', 6, side='top', holes='top')]), C(len=3), R(cw=3, checkpoint=True, feats=[pad('conveyor', 7, side='low', holes='low')]), C(len=3), R(cw=3)),
    lvl('GLIDE', 'w5-glide', 'Glide', 'A breather with a boost', 55,
        R(cw=4, feats=[pad('boost', 3)]), C(len=3), R(cw=4, feats=[ice(6)])),
    lvl('SLIPPERY_MAZE', 'w5-slippery-maze', 'Slippery Maze', 'A labyrinth made of ice', 56,
        R(cw=3, feats=[ice(5)]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[('ice', {})]), C(len=2), R(cw=3, feats=[pad('boost', 3)])),
    lvl('THIN_ICE', 'w5-thin-ice', 'Thin Ice', 'Ice beside the edge', 57,
        R(cw=3, feats=[ice(8, holes='top')]), C(len=3), R(cw=3, checkpoint=True, feats=[pad('sticky', 3), ice(7, holes='low')]), C(len=3), R(cw=3, feats=[pad('conveyor', 6, side='top', holes='top')])),
    lvl('FAST_LANE', 'w5-fast-lane', 'Fast Lane', 'Boost, then brake on sticky ground', 58,
        R(cw=3, feats=[pad('boost', 3), pad('sticky', 4)]), C(len=4, feat='holes'), R(cw=3, checkpoint=True, feats=[pad('conveyor', 5, against=True), holes()]), C(len=2),
        M(mw=3, ny=2, feats=[('ice', {})]), C(len=2), R(cw=3, feats=[pad('boost', 3), holes()])),
    lvl('RAILS', 'w5-rails', 'Rails', 'Every surface at once', 59,
        R(cw=3, feats=[pad('conveyor', 6, side='top', holes='top')]), C(len=3), M(mw=3, ny=3, checkpoint=True, feats=[('ice', {}), ('deadholes', {'n': 2})]), C(len=3),
        R(cw=3, feats=[ice(7, holes='low'), pad('sticky', 3)]), C(len=3), R(cw=3, feats=[pad('boost', 3), piston()])),
    lvl('FLUX_RAILS', 'w5-flux-rails', 'Flux Rails', 'World 5 finale', 50,
        R(cw=3, feats=[pad('boost', 3), ice(4, holes='top')]), C(len=4, feat='holes'), R(cw=3, checkpoint=True, feats=[pad('conveyor', 4, against=True), pad('conveyor', 4, side='low', holes='low')]), C(len=3),
        M(mw=3, ny=3, feats=[('ice', {}), ('deadholes', {'n': 2})]), C(len=3), R(cw=3, checkpoint=True, feats=[pad('sticky', 3), strips(), pad('boost', 3)]), C(len=2, w=2),
        M(mw=2, ny=3), C(len=2, w=2), R(cw=3, feats=[ice(7, holes='top')])),
]

W6 = [
    lvl('UPSIDE_DOWN', 'w6-upside-down', 'Upside Down', 'Flip onto the glass ceiling and back', 61,
        R(cw=3), C(len=9, feat='flip'), R(cw=3)),
    lvl('CEILING_WALK', 'w6-ceiling-walk', 'Ceiling Walk', 'A longer roll across the glass', 62,
        R(cw=3, feats=[holes()]), C(len=3), R(cw=3, checkpoint=True), C(len=12, feat='flip'), R(cw=3)),
    lvl('FLIP_MAZE', 'w6-flip-maze', 'Flip Maze', 'Over the gap and into a maze', 63,
        R(cw=3), C(len=9, feat='flip'), M(mw=3, ny=2, checkpoint=True), C(len=2), R(cw=3, feats=[holes()])),
    lvl('AUTO_FLIP', 'w6-auto-flip', 'Auto Flip', 'These pads flip you on their own', 64,
        R(cw=3), C(len=9, feat='autoflip'), R(cw=3, checkpoint=True, feats=[holes()]), C(len=9, feat='flip'), R(cw=3)),
    lvl('SKYLIGHT', 'w6-skylight', 'Skylight', 'A breather', 65,
        R(cw=4), C(len=9, feat='autoflip'), R(cw=4)),
    lvl('FLIP_AND_WALL', 'w6-flip-and-wall', 'Flip and Wall', 'Ceiling first, then a wall', 66,
        R(cw=3, feats=[piston()]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[holes()]), C(len=10, feat='wall'), R(cw=3)),
    lvl('HIGH_CEILING', 'w6-high-ceiling', 'High Ceiling', 'Long glass, then a maze', 67,
        R(cw=3, feats=[strips()]), C(len=13, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[('deadholes', {'n': 2})]), C(len=2), R(cw=3, feats=[holes(), piston()])),
    lvl('TOPSY', 'w6-topsy', 'Topsy Turvy', 'Three crossings in a row', 68,
        R(cw=3), C(len=9, feat='flip'), R(cw=3, checkpoint=True, feats=[piston()]), C(len=9, feat='autoflip'), R(cw=3, checkpoint=True, feats=[holes()]), C(len=10, feat='flip'), R(cw=3)),
    lvl('SKY_MAZE', 'w6-sky-maze', 'Sky Maze', 'Mazes on both sides of the glass', 69,
        R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=2), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[('deadholes', {'n': 2})]),
        C(len=10, feat='wall'), R(cw=3, feats=[strips(), piston()])),
    lvl('SKYWARD', 'w6-skyward', 'Skyward', 'World 6 finale', 60,
        R(cw=3, feats=[holes(), piston()]), C(len=11, feat='flip'), M(mw=3, ny=3, checkpoint=True), C(len=10, feat='autoflip'),
        R(cw=3, checkpoint=True, feats=[strips(), holes(), strips()]), C(len=12, feat='flip'), M(mw=2, ny=3), C(len=2, w=2), R(cw=3, feats=[piston(period=2.8)])),
]

W7 = [
    lvl('SWITCH_ON', 'w7-switch-on', 'Switch On', 'Roll onto the switch to open the door', 71,
        R(cw=3, feats=[door()]), C(len=3), R(cw=3)),
    lvl('LASER_GATE', 'w7-laser-gate', 'Laser Gate', 'Lasers blink: cross while they are off', 72,
        R(cw=3, feats=[laser(3.0, 0.42)]), C(len=3), R(cw=3, feats=[laser(3.0, 0.42), laser(3.0, 0.42, 0.5)])),
    lvl('LOCKED_MAZE', 'w7-locked-maze', 'Locked Maze', 'The exit is locked: find the switch', 73,
        R(cw=3), C(len=2), M(mw=3, ny=3, feats=[('switchdoor', {})]), C(len=2), R(cw=3)),
    lvl('RED_LIGHTS', 'w7-red-lights', 'Red Lights', 'Lasers guard the maze', 74,
        R(cw=3, feats=[laser()]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[('lasers', {'n': 2})]), C(len=3), R(cw=3, feats=[door()])),
    lvl('POWER_NAP', 'w7-power-nap', 'Power Nap', 'A breather', 75,
        R(cw=4, feats=[door()]), C(len=3), R(cw=4, feats=[laser(3.4, 0.38)])),
    lvl('DOUBLE_LOCK', 'w7-double-lock', 'Double Lock', 'Two doors, two switches', 76,
        R(cw=3, feats=[door(), laser()]), C(len=3), R(cw=3, checkpoint=True, feats=[door(top=True), piston()]), C(len=3), R(cw=3, feats=[laser(2.4), laser(2.4, 0.42, 0.4)])),
    lvl('WIRING', 'w7-wiring', 'Wiring', 'Switch maze, then a laser corridor', 77,
        R(cw=3, feats=[laser()]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('lasers', {'n': 2})]), C(len=3),
        R(cw=3, feats=[laser(2.4), strips(), laser(2.4, 0.42, 0.5)])),
    lvl('SHORT_CIRCUIT', 'w7-short-circuit', 'Short Circuit', 'Doors, lasers and a gravity wall', 78,
        R(cw=3, feats=[door(), holes()]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[laser(2.4), laser(2.4, 0.42, 0.4)]), C(len=2),
        M(mw=3, ny=3, feats=[('switchdoor', {})]), C(len=2), R(cw=3, feats=[piston(), laser(2.2)])),
    lvl('OVERLOAD', 'w7-overload', 'Overload', 'Every gate at once', 79,
        R(cw=3, feats=[laser(2.2), door()]), C(len=4, feat='strips'), M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('lasers', {'n': 3}), ('deadholes', {'n': 1})]), C(len=3),
        R(cw=3, checkpoint=True, feats=[door(), laser(2.2, 0.45)]), C(len=3, w=2), M(mw=2, ny=3, feats=[('lasers', {'n': 2})]), C(len=2, w=2), R(cw=3, feats=[laser(2.0), laser(2.0, 0.42, 0.5)])),
    lvl('CIRCUIT', 'w7-circuit', 'Circuit', 'World 7 finale', 70,
        R(cw=3, feats=[door(), laser(2.4)]), C(len=3, feat='pistonX'), M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('lasers', {'n': 2})]), C(len=10, feat='wall'),
        R(cw=3, checkpoint=True, feats=[laser(2.2), strips(), laser(2.2, 0.42, 0.5)]), C(len=3), R(cw=3, feats=[door(), piston(period=2.8)]), C(len=3),
        M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('lasers', {'n': 3})]), C(len=2), R(cw=3, feats=[laser(2.0), holes()])),
]

W8 = [
    lvl('HOP', 'w8-hop', 'Hop', 'Pink pads launch you over gaps', 81,
        R(cw=3, feats=[jump(2)]), C(len=3), R(cw=3, feats=[jump(3)])),
    lvl('LOW_GRAVITY', 'w8-low-gravity', 'Low Gravity', 'Green haze: the sphere feels light', 82,
        R(cw=3, feats=[well(6)]), C(len=3), R(cw=3, checkpoint=True, feats=[jump(3)]), C(len=3), R(cw=3, feats=[well(5), holes()])),
    lvl('AUTOPILOT', 'w8-autopilot', 'Autopilot', 'These walls take you on their own', 83,
        R(cw=3), C(len=9, feat='autowall'), R(cw=3, checkpoint=True, feats=[jump(3)]), C(len=3), R(cw=3)),
    lvl('MOON_MAZE', 'w8-moon-maze', 'Moon Maze', 'A labyrinth in low gravity', 84,
        R(cw=3, feats=[jump(3)]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[('well', {'scale': 0.5})]), C(len=2), R(cw=3, feats=[jump(3)])),
    lvl('ORBIT_REST', 'w8-orbit-rest', 'Free Float', 'A breather', 85,
        R(cw=4, feats=[well(6)]), C(len=3), R(cw=4, feats=[jump(2)])),
    lvl('LONG_JUMP', 'w8-long-jump', 'Long Jump', 'Wider gaps, lighter gravity', 86,
        R(cw=3, feats=[jump(3)]), C(len=3), R(cw=3, checkpoint=True, feats=[jump(2), jump(2)]), C(len=9, feat='autowall'), R(cw=3, feats=[jump(3)])),
    lvl('SLINGSHOT', 'w8-slingshot', 'Slingshot', 'Jumps and an auto flip', 87,
        R(cw=3, feats=[jump(2), holes()]), C(len=9, feat='autoflip'), R(cw=3, checkpoint=True, feats=[jump(3)]), C(len=2),
        M(mw=3, ny=2, feats=[('well', {'scale': 0.5})]), C(len=2), R(cw=3, feats=[jump(3)])),
    lvl('ZERO_G', 'w8-zero-g', 'Zero G', 'Auto walls, jumps and a maze', 88,
        R(cw=3, feats=[jump(3)]), C(len=10, feat='autowall'), M(mw=3, ny=3, checkpoint=True, feats=[('deadholes', {'n': 2})]), C(len=3),
        R(cw=3, feats=[jump(3, low=0.5), piston()]), C(len=9, feat='autoflip'), R(cw=3, feats=[holes()])),
    lvl('ESCAPE_VELOCITY', 'w8-escape-velocity', 'Escape Velocity', 'Every orbit trick', 89,
        R(cw=3, feats=[jump(3, low=0.5)]), C(len=10, feat='autowall'), R(cw=3, checkpoint=True, feats=[jump(3, low=0.5), strips()]), C(len=10, feat='autoflip'),
        M(mw=3, ny=3, checkpoint=True, feats=[('well', {'scale': 0.5}), ('deadholes', {'n': 2})]), C(len=3), R(cw=3, feats=[jump(3), holes()])),
    lvl('LOW_ORBIT', 'w8-low-orbit', 'Low Orbit', 'World 8 finale', 80,
        R(cw=3, feats=[jump(3, low=0.4)]), C(len=10, feat='autowall'), M(mw=3, ny=3, checkpoint=True), C(len=3),
        R(cw=3, checkpoint=True, feats=[jump(2), jump(2, low=0.5)]), C(len=11, feat='autoflip'), R(cw=3, checkpoint=True, feats=[piston(), jump(3)]), C(len=10, feat='wall'),
        M(mw=2, ny=3, feats=[('well', {'scale': 0.5})]), C(len=2, w=2), R(cw=3, feats=[jump(3)])),
]

W9 = [
    lvl('SWEEPER', 'w9-sweeper', 'Sweeper', 'Slip past the arm along the edge', 91,
        R(cw=5, feats=[arm(0.9)]), C(len=3), R(cw=5, feats=[arm(0.9, top=False)])),
    lvl('TURNTABLE', 'w9-turntable', 'Turntable', 'Ride the turning disc across', 92,
        R(cw=3, feats=[disc(0.5)]), C(len=3), R(cw=3, feats=[disc(0.6)])),
    lvl('SPIN_DOCTOR', 'w9-spin-doctor', 'Spin Doctor', 'Arms and discs', 93,
        R(cw=5, feats=[arm(1.0)]), C(len=3), R(cw=3, checkpoint=True, feats=[disc(0.6)]), C(len=3), R(cw=5, feats=[arm(1.1, top=False)])),
    lvl('ROUNDABOUT', 'w9-roundabout', 'Roundabout', 'A maze between the spinners', 94,
        R(cw=3, feats=[disc(0.6)]), C(len=2), M(mw=3, ny=3, checkpoint=True), C(len=3), R(cw=5, feats=[arm(1.1)])),
    lvl('MERRY_GO_ROUND', 'w9-merry-go-round', 'Merry-Go-Round', 'A breather', 95,
        R(cw=4, feats=[disc(0.4)]), C(len=3), R(cw=5, feats=[arm(0.8)])),
    lvl('WINDMILL', 'w9-windmill', 'Windmill', 'Faster arms', 96,
        R(cw=5, feats=[arm(1.3)]), C(len=3), R(cw=5, checkpoint=True, feats=[arm(1.3, top=False)]), C(len=3), R(cw=3, feats=[disc(0.8), holes()])),
    lvl('GEARBOX', 'w9-gearbox', 'Gearbox', 'Spinners, pistons and a wall', 97,
        R(cw=3, feats=[disc(0.7), piston()]), C(len=10, feat='wall'), R(cw=5, checkpoint=True, feats=[arm(1.2)]), C(len=2),
        M(mw=3, ny=2, feats=[('deadholes', {'n': 1})]), C(len=3), R(cw=3, feats=[disc(0.8)])),
    lvl('CENTRIFUGE', 'w9-centrifuge', 'Centrifuge', 'Fast discs over long drops', 98,
        R(cw=3, feats=[disc(0.9)]), C(len=3), R(cw=5, checkpoint=True, feats=[arm(1.4, top=False)]), C(len=3), R(cw=3, feats=[disc(1.0), strips()]), C(len=2),
        M(mw=3, ny=3, feats=[('deadholes', {'n': 2})]), C(len=3), R(cw=5, feats=[arm(1.4)])),
    lvl('VORTEX', 'w9-vortex', 'Vortex', 'Spin, flip, spin', 99,
        R(cw=5, feats=[arm(1.3)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[disc(0.9), holes()]), C(len=2),
        M(mw=3, ny=3, checkpoint=True, feats=[('deadholes', {'n': 2})]), C(len=3), R(cw=5, feats=[arm(1.5, top=False)]), C(len=3), R(cw=3, feats=[disc(1.0)])),
    lvl('SPIN_CYCLE', 'w9-spin-cycle', 'Spin Cycle', 'World 9 finale', 90,
        R(cw=5, feats=[arm(1.2)]), C(len=3), R(cw=3, checkpoint=True, feats=[disc(0.8), piston()]), C(len=10, feat='wall'),
        M(mw=3, ny=3, checkpoint=True, feats=[('deadholes', {'n': 2})]), C(len=3), R(cw=5, checkpoint=True, feats=[arm(1.5, top=False)]), C(len=3),
        R(cw=3, feats=[disc(1.0), strips()]), C(len=3), R(cw=5, feats=[arm(1.6)])),
]

W10 = [
    lvl('HORIZON_LINE', 'w10-horizon-line', 'Horizon Line', 'A tour of everything so far', 101,
        R(cw=3, feats=[crumble(4), pad('boost', 3)]), C(len=9, feat='wall'), R(cw=3, checkpoint=True, feats=[door()]), C(len=3), R(cw=3, feats=[jump(3)])),
    lvl('MIXED_SIGNALS', 'w10-mixed-signals', 'Mixed Signals', 'Lasers on ice', 102,
        R(cw=3, feats=[ice(5), laser(2.6)]), C(len=3), R(cw=3, checkpoint=True, feats=[plat(5), laser(2.4)]), C(len=3), R(cw=3, feats=[pad('conveyor', 6, side='top', holes='top')])),
    lvl('DARK_MATTER', 'w10-dark-matter', 'Dark Matter', 'A switch maze over the glass', 103,
        R(cw=3, feats=[crumble(5)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('crumble', {'n': 3})]), C(len=3), R(cw=5, feats=[arm(1.1)])),
    lvl('GRAVITY_WELL', 'w10-gravity-well', 'Gravity Well', 'Jumps, discs and walls', 104,
        R(cw=3, feats=[disc(0.6)]), C(len=10, feat='autowall'), R(cw=3, checkpoint=True, feats=[plat(5), crumble(3)]), C(len=10, feat='flip'), R(cw=3, feats=[jump(2), laser(2.4)])),
    lvl('QUIET_ORBIT', 'w10-quiet-orbit', 'Quiet Orbit', 'A breather before the end', 105,
        R(cw=4, feats=[pad('boost', 3)]), C(len=9, feat='autoflip'), R(cw=4, feats=[crumble(3)])),
    lvl('SINGULARITY', 'w10-singularity', 'Singularity', 'Ice maze, lasers and sweepers', 106,
        R(cw=5, feats=[arm(1.2)]), C(len=3), M(mw=3, ny=3, checkpoint=True, feats=[('ice', {}), ('lasers', {'n': 2})]), C(len=3),
        R(cw=3, checkpoint=True, feats=[door(), laser(2.4)]), C(len=3), R(cw=3, feats=[plat(5), holes()])),
    lvl('ACCRETION', 'w10-accretion', 'Accretion', 'Crumbling floors between crossings', 107,
        R(cw=3, feats=[crumble(5), piston()]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[crumble(4), pad('boost', 3)]), C(len=10, feat='flip'),
        M(mw=3, ny=3, checkpoint=True, feats=[('crumble', {'n': 5}), ('deadholes', {'n': 2})]), C(len=3), R(cw=3, feats=[disc(0.8), laser(2.2)])),
    lvl('REDSHIFT', 'w10-redshift', 'Redshift', 'Fast pads, faster arms', 108,
        R(cw=3, feats=[pad('boost', 3), strips(), crumble(3)]), C(len=3), R(cw=5, checkpoint=True, feats=[arm(1.4)]), C(len=10, feat='autowall'),
        R(cw=3, checkpoint=True, feats=[jump(3), laser(2.2)]), C(len=2), M(mw=2, ny=3, feats=[('lasers', {'n': 2})]), C(len=2, w=2), R(cw=3, feats=[ice(7, holes='low')])),
    lvl('EVENT_HORIZON_X', 'w10-point-of-no-return', 'Point of No Return', 'The hardest level before the finale', 109,
        R(cw=3, feats=[crumble(5), laser(2.2)]), C(len=11, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('lasers', {'n': 2})]), C(len=10, feat='wall'),
        R(cw=3, checkpoint=True, feats=[crumble(3), plat(5, 5.0)]), C(len=3), R(cw=5, checkpoint=True, feats=[arm(1.5, top=False)]), C(len=3),
        R(cw=3, feats=[disc(1.0), pad('conveyor', 4, side='top', holes='top')])),
    lvl('HORIZON', 'w10-event-horizon', 'Beyond the Horizon', 'The grand finale', 100,
        R(cw=3, feats=[pad('boost', 3), crumble(5)]), C(len=10, feat='autowall'), M(mw=3, ny=3, checkpoint=True, feats=[('switchdoor', {}), ('crumble', {'n': 4})]), C(len=3),
        R(cw=3, checkpoint=True, feats=[laser(2.2), plat(5, 5.0)]), C(len=11, feat='flip'), R(cw=5, checkpoint=True, feats=[arm(1.5)]), C(len=3),
        R(cw=3, checkpoint=True, feats=[disc(1.0), ice(4, holes='low')]), C(len=10, feat='wall'), M(mw=2, ny=3, feats=[('lasers', {'n': 2}), ('ice', {})]), C(len=2, w=2),
        R(cw=3, feats=[door(), strips(), piston(period=2.6)])),
]

WORLDS = [
    ('world4', 'World 4 · Crumble Belt', W4), ('world5', 'World 5 · Flux Rails', W5), ('world6', 'World 6 · Skyward', W6),
    ('world7', 'World 7 · Circuit', W7), ('world8', 'World 8 · Low Orbit', W8), ('world9', 'World 9 · Spin Cycle', W9),
    ('world10', 'World 10 · Event Horizon', W10),
]

if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    routes = {}
    for fname, title, levels in WORLDS:
        if only and fname not in only:
            continue
        print(fname)
        routes.update(write_world(f'../../src/levels/generated/{fname}.ts', title, 'worlds_4_10.py', levels))
    old = json.load(open('routes.json')) if os.path.exists('routes.json') else {}
    old.update(routes)
    json.dump(old, open('routes.json', 'w'), indent=0)
