"""Worlds 1-3: tilt basics, pistons and bridges, gravity walls. Run: python3 worlds_1_3.py"""
import json
from levelgen import write_world

R = lambda **k: ('run', k)
C = lambda **k: ('conn', k)
M = lambda **k: ('maze', k)

W1 = [
    ('WIDE_TURNS', dict(id='w1-wide-turns', name='Wide Turns', sub='Four-wide corridors and easy corners', seed=11, segments=[
        R(cw=4), C(len=3), R(cw=4, checkpoint=True), C(len=3), R(cw=4)])),
    ('FIRST_MAZE', dict(id='w1-first-maze', name='First Maze', sub='A small labyrinth: find the way through', seed=12, segments=[
        R(cw=3), C(len=2), M(mw=3, ny=2), C(len=2), R(cw=3)])),
    ('HOLE_PUNCH', dict(id='w1-hole-punch', name='Hole Punch', sub='Holes along the edges', seed=13, segments=[
        R(cw=3, feats=[('holes', {}), ('holes', {})]), C(len=3), R(cw=4, checkpoint=True, feats=[('holes', {'top': True}), ('holes', {'top': False})]), C(len=4, feat='holes'), R(cw=3)])),
    ('BRANCHES', dict(id='w1-branches', name='Branches', sub='Dead ends and wrong turns', seed=14, segments=[
        R(cw=3), C(len=2), M(mw=3, ny=3, checkpoint=True), C(len=2), R(cw=3, feats=[('holes', {})])])),
    ('NARROW_WAYS', dict(id='w1-narrow-ways', name='Narrow Ways', sub='Two-wide corridors', seed=15, segments=[
        R(cw=2), C(len=2, w=2), M(mw=2, ny=3, checkpoint=True), C(len=2, w=2), R(cw=3, feats=[('holes', {}), ('holes', {})])])),
    ('LABYRINTH', dict(id='w1-labyrinth', name='Labyrinth', sub='Two mazes, some dead ends drop away', seed=16, segments=[
        R(cw=3), C(len=2), M(mw=3, ny=3, feats=[('deadholes', {'n': 2})]), C(len=2, w=2), M(mw=2, ny=3, checkpoint=True), C(len=2, w=2), R(cw=3)])),
    ('LAUNCH_FINALE', dict(id='w1-launch-finale', name='Launch Deck', sub='World 1 finale: everything so far', seed=17, segments=[
        R(cw=3, feats=[('holes', {})]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[('deadholes', {'n': 2})]), C(len=4, feat='holes'),
        R(cw=3, checkpoint=True, feats=[('holes', {}), ('holes', {}), ('holes', {})]), C(len=2, w=2), M(mw=2, ny=4), C(len=2, w=2), R(cw=3)])),
]

W2 = [
    ('PISTON_ALLEY', dict(id='w2-piston-alley', name='Piston Alley', sub='Wait for the gap, then go', seed=21, segments=[
        R(cw=3, feats=[('piston', {})]), C(len=3), R(cw=3, checkpoint=True, feats=[('piston', {'period': 3.0}), ('piston', {'period': 3.0, 'phase': 0.5})]), C(len=3), R(cw=3, feats=[('piston', {'period': 2.8})])])),
    ('HOT_FLOOR', dict(id='w2-hot-floor', name='Hot Floor', sub='Red striped floor destroys the sphere', seed=22, segments=[
        R(cw=3, feats=[('strips', {}), ('strips', {}), ('strips', {})]), C(len=4, feat='strips'), R(cw=3, checkpoint=True, feats=[('strips', {}), ('piston', {})]), C(len=3), R(cw=3, feats=[('strips', {}), ('strips', {})])])),
    ('OVERPASS', dict(id='w2-overpass', name='Overpass', sub='Ramps up to raised bridges', seed=23, segments=[
        R(cw=3, feats=[('bridge', {'deck': 5, 'width': 2.2})]), C(len=3), R(cw=3, checkpoint=True, feats=[('bridge', {'deck': 6, 'width': 2.0})]), C(len=3), R(cw=3)])),
    ('COFFEE_BREAK', dict(id='w2-coffee-break', name='Coffee Break', sub='A short one: one piston, one wide bridge', seed=24, segments=[
        R(cw=4, feats=[('piston', {'period': 3.6})]), C(len=3), R(cw=3, feats=[('bridge', {'deck': 4, 'width': 2.4})])])),
    ('GEARS', dict(id='w2-gears', name='Gears', sub='Pistons guard the maze doors', seed=25, segments=[
        R(cw=3, feats=[('piston', {})]), C(len=3, feat='pistonX'), M(mw=3, ny=2), C(len=2), R(cw=3, checkpoint=True, feats=[('bridge', {'deck': 5, 'width': 2.0})]),
        C(len=3, feat='pistonX', period=2.8), R(cw=3, feats=[('piston', {'period': 2.8})])])),
    ('RED_LINE', dict(id='w2-red-line', name='Red Line', sub='Energy strips, a maze, a narrow bridge', seed=26, segments=[
        R(cw=3, feats=[('strips', {}), ('piston', {})]), C(len=4, feat='strips'), M(mw=3, ny=3, feats=[('deadholes', {'n': 2})]), C(len=2),
        R(cw=3, checkpoint=True, feats=[('bridge', {'deck': 6, 'width': 1.8})]), C(len=3), R(cw=3, feats=[('strips', {}), ('piston', {'period': 2.6}), ('strips', {})])])),
    ('PISTON_WORKS', dict(id='w2-piston-works', name='Piston Works', sub='World 2 finale', seed=27, segments=[
        R(cw=3, feats=[('piston', {}), ('strips', {})]), C(len=3, feat='pistonX'), M(mw=3, ny=3, checkpoint=True), C(len=2),
        R(cw=3, feats=[('bridge', {'deck': 7, 'width': 1.6})]), C(len=3, feat='pistonX', period=2.6),
        R(cw=3, checkpoint=True, feats=[('piston', {'period': 2.6}), ('piston', {'period': 2.6, 'phase': 0.5}), ('strips', {})]), C(len=2, w=2), M(mw=2, ny=3), C(len=2, w=2),
        R(cw=3, feats=[('holes', {}), ('piston', {'period': 2.4})])])),
]

W3 = [
    ('SIDE_STEP', dict(id='w3-side-step', name='Side Step', sub='Shift onto the wall and back', seed=31, segments=[
        R(cw=3), C(len=9, feat='wall'), R(cw=3)])),
    ('WALL_RUN', dict(id='w3-wall-run', name='Wall Run', sub='A longer wall over a wider chasm', seed=32, segments=[
        R(cw=3), C(len=3), R(cw=3, checkpoint=True), C(len=12, feat='wall'), R(cw=3, feats=[('holes', {})])])),
    ('BOTH_WAYS', dict(id='w3-both-ways', name='Both Ways', sub='A right wall, then a left wall', seed=33, segments=[
        R(cw=3), C(len=9, feat='wall'), R(cw=3, checkpoint=True, feats=[('piston', {'period': 3.4})]), C(len=9, feat='wall'), R(cw=3)])),
    ('EASY_RIDER', dict(id='w3-easy-rider', name='Easy Rider', sub='A short breather', seed=34, segments=[
        R(cw=4), C(len=9, feat='wall'), R(cw=4)])),
    ('WALL_MAZE', dict(id='w3-wall-maze', name='Wall Maze', sub='Over the wall and into a maze', seed=35, segments=[
        R(cw=3, feats=[('holes', {})]), C(len=10, feat='wall'), M(mw=3, ny=3, checkpoint=True), C(len=2), R(cw=3, feats=[('piston', {})])])),
    ('HIGH_WIRE', dict(id='w3-high-wire', name='High Wire', sub='Two walls and a thin bridge', seed=36, segments=[
        R(cw=3, feats=[('holes', {}), ('piston', {})]), C(len=12, feat='wall'), R(cw=3, checkpoint=True, feats=[('bridge', {'deck': 6, 'width': 1.8})]),
        C(len=10, feat='wall'), M(mw=3, ny=3), C(len=2), R(cw=3, feats=[('strips', {}), ('strips', {})])])),
]

routes = {}
print('world 1'); routes.update(write_world('../../src/levels/generated/world1.ts', 'World 1 · Launch Deck: new levels.', 'worlds_1_3.py', W1))
print('world 2'); routes.update(write_world('../../src/levels/generated/world2.ts', 'World 2 · Piston Works: new levels.', 'worlds_1_3.py', W2))
print('world 3'); routes.update(write_world('../../src/levels/generated/world3.ts', 'World 3 · Wall Walk: new levels.', 'worlds_1_3.py', W3))
old = json.load(open('routes.json')) if __import__('os').path.exists('routes.json') else {}
old.update(routes)
json.dump(old, open('routes.json', 'w'), indent=0)
