"""Worlds 11-20 (levels 101-200): multi-level boards, warp gates, keys, fans, blackout, pulse floors,
then four worlds that combine them. Harder than worlds 1-10 from the first level: longer courses,
faster hazards, fewer checkpoints and tighter door timers.
Run: python3 worlds_11_20.py [world11 ...]   (then test with autopilot.cjs)
Per world: 1-2 intro, 3-4 practice, 5 breather, 6-8 combine, 9 challenge, 10 finale.
"""
import json
import os
import levelgen
from levelgen import write_world

R = lambda **k: ('run', k)
C = lambda **k: ('conn', k)
M = lambda **k: ('maze', k)


def lvl(const, id, name, sub, seed, *segments, dark=False):
    return (const, dict(id=id, name=name, sub=sub, seed=seed, layout=2, fit=True, segments=list(segments), dark=dark))


def tiers(const, id, name, sub, seed, *floors, dark=False):
    """A multi-level board: each floor is a list of segments; the next floor starts under the drop."""
    return (const, dict(id=id, name=name, sub=sub, seed=seed, layout=2, fit=True, tiers=list(floors), dark=dark))


def T(*segments, chute=None):
    """One floor. chute=N: drop down a glide chute and steer N cells sideways onto the landing."""
    return dict(segments=list(segments), chute=chute)


crumble = lambda n=4: ('crumble', {'len': n})
plat = lambda gap=5, period=5.5, phase=0: ('platform', {'gap': gap, 'period': period, 'phase': phase})
holes = lambda **k: ('holes', k)
piston = lambda period=2.8, phase=0: ('piston', {'period': period, 'phase': phase})
strips = lambda **k: ('strips', k)
pad = lambda kind, n=5, **k: ('pad', dict(kind=kind, len=n, **k))
ice = lambda n=6, **k: ('ice', dict(len=n, **k))
# Lasers: the spec's period is the intent; at least 2.3 s with 42% on keeps a gap you can roll through from a standstill.
laser = lambda period=2.3, on=0.42, phase=0: ('laser', {'period': max(period, 2.3), 'on': on, 'phase': phase})
door = lambda **k: ('door', k)
jump = lambda gap=3, low=None: ('jump', {'gap': gap, 'low': low})
arm = lambda speed=1.4, phase=0, top=True: ('arm', {'speed': speed, 'phase': phase, 'top': top})
disc = lambda speed=0.9: ('disc', {'speed': speed})
# New in worlds 11-20.
# Fans stay weaker than full tilt (16 m/s²), so a gust can be fought; spec strength/period are the intent, capped
# for fairness: at most 12.5 m/s², a lull of at least 2.1 s.
fan = lambda n=4, strength=11, period=3.6, on=0.4, phase=0, **k: ('fan', dict(len=n, strength=min(strength, 12.5) - 1, period=max(period, 3.6), on=on, phase=phase, **k))
# World 14 (Chris, 2026-11-22): a fan right in front of every trap, always on, blowing hard toward the void.
# Full tilt is 17 m/s², so the strongest gale still leaves a little to steer with.
gale = lambda n=4, strength=11, **k: ('fan', dict(len=n, strength=strength, period=4.0, on=1.0, phase=0, **k))
# Pulse floors: dark for at least 1.9 s of each cycle.
pulse = lambda n=3, period=3.0, on=0.35, phase=0: ('pulse', {'len': n, 'period': max(period, 2.9), 'on': on, 'phase': phase})
key = lambda **k: ('key', k)
gapwarp = lambda gap=3: ('gapwarp', {'gap': gap})
# Maze features.
keys = lambda n=2: ('keys', {'n': n})
warpexit = lambda decoys=0: ('warpexit', {'decoys': decoys})
mpulses = lambda n=2, period=2.9: ('pulses', {'n': n, 'period': max(period, 2.9)})
mlasers = lambda n=2: ('lasers', {'n': n})
dead = lambda n=2: ('deadholes', {'n': n})
sw = ('switchdoor', {})
WARP = C(len=2, feat='warp')

# ---------------------------------------------------------------------------------------------
W11 = [
    tiers('FIRST_DROP', 'w11-first-drop', 'First Drop', 'Roll into the teal hole to reach the floor below', 111,
          T(R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[holes()])),
          T(R(cw=3), C(len=3), R(cw=3, feats=[holes(), strips()]))),
    tiers('BASEMENT', 'w11-basement', 'Basement', 'A maze upstairs, a crumbling run downstairs', 112,
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=2, feats=[dead(1)]), C(len=2), R(cw=3, feats=[piston()])),
          T(R(cw=3, feats=[crumble(4)]), C(len=3, feat='holes'), R(cw=3, feats=[holes(), crumble(3)]))),
    tiers('GLIDE_PATH', 'w11-glide-path', 'Glide Path', 'The chute slows your fall: steer onto the landing', 113,
          T(R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[strips()])),
          T(R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[piston()]), chute=4)),
    tiers('THREE_FLOORS', 'w11-three-floors', 'Three Floors', 'Down, down, and down again', 114,
          T(R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[piston()])),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=2), C(len=2), R(cw=3)),
          T(R(cw=3, feats=[crumble(3)]), C(len=3), R(cw=3, feats=[holes(), strips()]))),
    tiers('STAIRWELL', 'w11-stairwell', 'Stairwell', 'A breather: wide floors, soft drops', 115,
          T(R(cw=4, feats=[holes()]), C(len=3), R(cw=4)),
          T(R(cw=4), C(len=3), R(cw=4, feats=[holes()]), chute=3)),
    tiers('SINKHOLE', 'w11-sinkhole', 'Sinkhole', 'A gravity wall on the lower floor', 116,
          T(R(cw=3, feats=[holes(), piston()]), C(len=2), M(mw=3, ny=3, feats=[dead(2)]), C(len=2), R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[holes()]), C(len=10, feat='wall', notches=['low']), R(cw=3, checkpoint=True, feats=[strips(), holes()]))),
    tiers('FREE_FALL', 'w11-free-fall', 'Free Fall', 'A long glide and a glass ceiling', 117,
          T(R(cw=3, feats=[holes(), strips()]), C(len=10, feat='flip'), R(cw=3, feats=[piston(2.6)])),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=2, ny=3, feats=[dead(2)]), C(len=2, w=2), R(cw=3, feats=[crumble(4)]), chute=5)),
    tiers('UNDERCROFT', 'w11-undercroft', 'Undercroft', 'Three floors, two locked doors', 118,
          T(R(cw=3, feats=[door(), holes()]), C(len=3), R(cw=3, feats=[piston(2.6)])),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[sw, dead(1)]), C(len=2), R(cw=3)),
          T(R(cw=3, feats=[crumble(4), holes()]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[door(), strips()]), chute=4)),
    tiers('ABYSS', 'w11-abyss', 'Abyss', 'Two glide chutes over the void', 119,
          T(R(cw=3, feats=[holes(), piston(2.5)]), C(len=10, feat='flip'), M(mw=3, ny=2, feats=[dead(2)]), C(len=2), R(cw=3, feats=[crumble(3)])),
          T(R(cw=3, feats=[strips(), holes()]), C(len=10, feat='wall', notches=['high']), R(cw=3, checkpoint=True, feats=[piston(2.4)]), chute=4),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=2, ny=3, feats=[dead(3)]), C(len=2, w=2), R(cw=3, feats=[crumble(5)]), chute=5)),
    tiers('DEPTHS', 'w11-depths', 'The Depths', 'World 11 finale: four floors down', 110,
          T(R(cw=3, feats=[holes(), piston(2.5)]), C(len=2), M(mw=3, ny=3, feats=[dead(2)]), C(len=10, feat='flip'), R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[holes()]), C(len=13, feat='wall', notches=['low'], wpistons=1), R(cw=3, checkpoint=True, feats=[door(), piston(2.4)]), chute=4),
          T(R(cw=3, feats=[strips(), holes()]), C(len=2), M(mw=2, ny=3, feats=[dead(2)]), C(len=2, w=2), R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[holes()]), C(len=3, feat='pistonX'), R(cw=3, feats=[piston(2.3), holes()]), chute=5)),
]

W12 = [
    lvl('WARP_GATE', 'w12-warp-gate', 'Warp Gate', 'Roll into the ring to come out of its twin', 121,
        R(cw=3, feats=[gapwarp(3)]), C(len=3), R(cw=3, feats=[holes()]), WARP, R(cw=3, feats=[gapwarp(4)])),
    lvl('JUMP_CUT', 'w12-jump-cut', 'Jump Cut', 'Gates skip the walls between corridors', 122,
        R(cw=3, feats=[holes()]), WARP, R(cw=3, feats=[piston()]), WARP, R(cw=3, feats=[gapwarp(3), strips()]), C(len=3), R(cw=3, feats=[holes()])),
    lvl('WRONG_RING', 'w12-wrong-ring', 'Wrong Ring', 'The maze exit is a gate: red rings send you back', 123,
        R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[warpexit(1)]), WARP, R(cw=3, feats=[gapwarp(3)])),
    lvl('RELAY', 'w12-relay', 'Relay', 'Gate to gate to gate', 124,
        R(cw=3, feats=[gapwarp(3), piston()]), WARP, R(cw=3, checkpoint=True, feats=[holes(), gapwarp(3)]), C(len=2), M(mw=3, ny=2, feats=[warpexit(1)]), WARP, R(cw=3, feats=[strips()])),
    lvl('SHORTCUT', 'w12-shortcut', 'Shortcut', 'A breather', 125,
        R(cw=4, feats=[gapwarp(3)]), WARP, R(cw=4, feats=[holes()])),
    lvl('PHASE_SHIFT', 'w12-phase-shift', 'Phase Shift', 'Gates and a gravity wall', 126,
        R(cw=3, feats=[gapwarp(3), holes()]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[piston(2.6), gapwarp(4)]), WARP,
        M(mw=3, ny=3, feats=[warpexit(2), dead(1)]), WARP, R(cw=3, feats=[crumble(4)])),
    lvl('MIRROR_HALL', 'w12-mirror-hall', 'Mirror Hall', 'Narrow halls, more decoys', 127,
        R(cw=3, feats=[holes(), gapwarp(3)]), C(len=2), M(mw=2, ny=3, feats=[warpexit(2)]), WARP, R(cw=3, checkpoint=True, feats=[laser(), gapwarp(3)]),
        C(len=10, feat='flip'), R(cw=3, feats=[piston(2.5), holes()])),
    lvl('TELEPORTER', 'w12-teleporter', 'Teleporter', 'Ring hopping past pistons and lasers', 128,
        R(cw=3, feats=[piston(2.4), gapwarp(3)]), WARP, R(cw=3, checkpoint=True, feats=[laser(2.0), gapwarp(3)]), C(len=10, feat='wall', notches=['low']),
        M(mw=3, ny=3, feats=[warpexit(2), dead(1)]), WARP, R(cw=3, feats=[strips(), holes()])),
    lvl('WORMHOLE', 'w12-wormhole', 'Wormhole', 'Every gate trick at once', 129,
        R(cw=3, feats=[gapwarp(4), holes()]), C(len=2), M(mw=2, ny=3, feats=[warpexit(3)]), WARP, R(cw=3, checkpoint=True, feats=[piston(2.3), gapwarp(3)]),
        C(len=10, feat='flip'), R(cw=3, feats=[laser(2.0), holes()]), WARP, M(mw=3, ny=3, checkpoint=True, feats=[warpexit(2), dead(1)]), WARP, R(cw=3, feats=[crumble(4)])),
    lvl('WARP_GATE_X', 'w12-warp-core', 'Warp Core', 'World 12 finale', 120,
        R(cw=3, feats=[gapwarp(3), piston(2.4)]), WARP, M(mw=3, ny=3, feats=[warpexit(2), dead(1)]), WARP, R(cw=3, checkpoint=True, feats=[laser(2.0), gapwarp(4)]),
        C(len=10, feat='wall', wpistons=1), R(cw=3, feats=[holes(), strips()]), C(len=2), M(mw=2, ny=3, checkpoint=True, feats=[warpexit(3)]), WARP,
        R(cw=3, feats=[gapwarp(3), piston(2.2)]), C(len=10, feat='flip'), R(cw=3, feats=[crumble(4), holes()])),
]

W13 = [
    lvl('FIRST_KEY', 'w13-first-key', 'First Key', 'Grab the gold key to open the goal', 131,
        R(cw=3, feats=[key(top=True)]), C(len=3), R(cw=3, feats=[holes()])),
    lvl('KEY_RING', 'w13-key-ring', 'Key Ring', 'Three keys, three pockets', 132,
        R(cw=3, feats=[key(top=True), holes()]), C(len=4), R(cw=3, feats=[key(top=False), piston()]), C(len=4), R(cw=3, feats=[key(top=True)])),
    lvl('LOCKSMITH', 'w13-locksmith', 'Locksmith', 'The keys hide in the dead ends', 133,
        R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[keys(2)]), C(len=2), R(cw=3, feats=[piston()])),
    lvl('STRONGROOM', 'w13-strongroom', 'Strongroom', 'Keys behind a door and a laser', 134,
        R(cw=3, feats=[key(top=False), door()]), C(len=3), M(mw=3, ny=3, checkpoint=True, feats=[keys(2), dead(1)]), C(len=3), R(cw=3, feats=[laser(), key(top=True)])),
    lvl('SPARE_KEY', 'w13-spare-key', 'Spare Key', 'A breather', 135,
        R(cw=4, feats=[key(top=True)]), C(len=4), R(cw=4, feats=[holes(), key(top=False)])),
    lvl('DEPOSIT_BOX', 'w13-deposit-box', 'Deposit Box', 'Keys on both sides of a wall walk', 136,
        R(cw=3, feats=[key(top=False), piston(2.6)]), C(len=10, feat='wall'), M(mw=3, ny=3, checkpoint=True, feats=[keys(2), dead(1)]), C(len=4),
        R(cw=3, feats=[crumble(4), key(top=True)])),
    lvl('MASTER_KEY', 'w13-master-key', 'Master Key', 'Narrow halls, three keys', 137,
        R(cw=3, feats=[holes(), key(top=True)]), C(len=2), M(mw=2, ny=3, feats=[keys(3)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[laser(2.0), holes()])),
    lvl('SAFE_CRACKER', 'w13-safe-cracker', 'Safe Cracker', 'Switches, keys and a ceiling', 138,
        R(cw=3, feats=[key(top=False), door()]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[sw, keys(2)]), C(len=3),
        R(cw=3, feats=[piston(2.4), key(top=True), holes()])),
    lvl('BANK_JOB', 'w13-bank-job', 'Bank Job', 'Five keys and nowhere to rest', 139,
        R(cw=3, feats=[key(top=True), piston(2.4)]), C(len=2), M(mw=3, ny=3, feats=[keys(2), dead(1)]), C(len=10, feat='wall', notches=['low']),
        R(cw=3, checkpoint=True, feats=[laser(2.0), key(top=False)]), C(len=2), M(mw=2, ny=3, feats=[keys(1), dead(2)]), C(len=4, w=2), R(cw=3, feats=[crumble(4), key(top=True)])),
    lvl('VAULT', 'w13-vault', 'The Vault', 'World 13 finale', 130,
        R(cw=3, feats=[key(top=False), door()]), C(len=3, feat='pistonX'), M(mw=3, ny=3, feats=[sw, keys(2)]), C(len=10, feat='flip'),
        R(cw=3, checkpoint=True, feats=[laser(2.0), key(top=True), holes()]), C(len=10, feat='wall', wpistons=1), M(mw=2, ny=3, checkpoint=True, feats=[keys(2), dead(1)]), C(len=4, w=2),
        R(cw=3, feats=[piston(2.2), key(top=False), crumble(3)])),
]

W14 = [
    lvl('BREEZE', 'w14-breeze', 'Breeze', 'Fans blow you toward the holes: lean into the wind', 141,
        R(cw=3, feats=[gale(4, 10)]), C(len=3), R(cw=3, feats=[gale(4, 10)])),
    lvl('CROSSWIND', 'w14-crosswind', 'Crosswind', 'Fans back to back', 142,
        R(cw=3, feats=[gale(4, 10.5), gale(4, 10.5)]), C(len=3), R(cw=3, feats=[gale(4, 10.5), gale(4, 10.5)])),
    lvl('WIND_TUNNEL', 'w14-wind-tunnel', 'Wind Tunnel', 'Fans and a maze', 143,
        R(cw=3, feats=[gale(4, 11)]), C(len=2), M(mw=3, ny=3, feats=[dead(2)]), C(len=2), R(cw=3, feats=[gale(5, 11)])),
    lvl('GUSTS', 'w14-gusts', 'Gusts', 'Stronger fans', 144,
        R(cw=3, feats=[gale(4, 11.5), piston()]), C(len=3), R(cw=3, checkpoint=True, feats=[gale(4, 11.5), gale(4, 11.5)]), C(len=3),
        R(cw=3, feats=[gale(5, 11.5)])),
    lvl('CALM', 'w14-calm', 'Eye of the Storm', 'A breather', 145,
        R(cw=4, feats=[gale(4, 10)]), C(len=3), R(cw=4, feats=[gale(4, 10)])),
    lvl('UPDRAFT', 'w14-updraft', 'Updraft', 'Fans and a gravity wall', 146,
        R(cw=3, feats=[gale(4, 12), gale(4, 12)]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[gale(4, 12), piston(2.6)]), C(len=3),
        R(cw=3, feats=[gale(5, 12), strips()])),
    lvl('HEADWIND', 'w14-headwind', 'Gale Force', 'Ice and wind do not mix', 147,
        R(cw=3, feats=[gale(4, 12), ice(4)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[gale(4, 12)]), C(len=2),
        M(mw=3, ny=3, feats=[dead(2)]), C(len=2), R(cw=3, feats=[gale(4, 12), gale(4, 12)])),
    lvl('JET_STREAM', 'w14-jet-stream', 'Jet Stream', 'Fans, lasers and pistons', 148,
        R(cw=3, feats=[laser(2.0), gale(4, 12.5)]), C(len=3, feat='pistonX'), R(cw=3, checkpoint=True, feats=[gale(4, 12.5), piston(2.4)]), C(len=10, feat='wall', notches=['high']),
        R(cw=3, feats=[gale(5, 12.5), strips()])),
    lvl('CYCLONE', 'w14-cyclone', 'Cyclone', 'The storm gets worse', 149,
        R(cw=3, feats=[gale(4, 13), gale(4, 13)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[dead(2)]), C(len=3),
        R(cw=3, feats=[gale(4, 13), gale(4, 13)]), C(len=10, feat='wall', wpistons=1), R(cw=3, checkpoint=True, feats=[laser(2.0), gale(5, 13)])),
    lvl('STORM_FRONT', 'w14-storm-front', 'Storm Front', 'World 14 finale', 140,
        R(cw=3, feats=[gale(4, 13.5), piston(2.4)]), C(len=10, feat='wall', notches=['low']), R(cw=3, checkpoint=True, feats=[gale(4, 13.5), gale(4, 13.5)]), C(len=2),
        M(mw=2, ny=3, feats=[dead(2)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[gale(4, 13.5), gale(4, 13.5)]), C(len=3, feat='pistonX'),
        R(cw=3, feats=[laser(1.9), gale(5, 13.5), strips()])),
]

W15 = [
    lvl('LIGHTS_OUT', 'w15-lights-out', 'Lights Out', 'The power is down: your sphere carries the only lamp', 151,
        R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[holes(), strips()]), C(len=3), R(cw=3), dark=True),
    lvl('NIGHT_MAZE', 'w15-night-maze', 'Night Maze', 'A labyrinth in the dark', 152,
        R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[dead(2)]), C(len=2), R(cw=3, feats=[piston()]), dark=True),
    lvl('BLIND_CORNER', 'w15-blind-corner', 'Blind Corner', 'Pistons you hear before you see', 153,
        R(cw=3, feats=[piston(2.6), holes()]), C(len=3, feat='holes'), R(cw=3, checkpoint=True, feats=[crumble(4), piston(2.5)]), C(len=2), M(mw=2, ny=3, feats=[dead(2)]), C(len=2, w=2), R(cw=3), dark=True),
    lvl('GLOWWORM', 'w15-glowworm', 'Glowworm', 'Lasers light the way, briefly', 154,
        R(cw=3, feats=[laser(2.2), holes()]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[mlasers(2), dead(1)]), C(len=3), R(cw=3, feats=[laser(2.0), strips()]), dark=True),
    lvl('NIGHT_LIGHT', 'w15-night-light', 'Night Light', 'A breather', 155,
        R(cw=4, feats=[holes()]), C(len=3), R(cw=4, feats=[strips()]), dark=True),
    lvl('DARK_SIDE', 'w15-dark-side', 'Dark Side', 'A gravity wall in the dark', 156,
        R(cw=3, feats=[holes(), piston(2.6)]), C(len=10, feat='wall'), M(mw=3, ny=3, checkpoint=True, feats=[dead(2)]), C(len=3), R(cw=3, feats=[crumble(4), holes()]), dark=True),
    lvl('ECLIPSE', 'w15-eclipse', 'Eclipse', 'Ceiling flip with the lights off', 157,
        R(cw=3, feats=[holes(), strips()]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[laser(2.0), holes()]), C(len=2), M(mw=2, ny=3, feats=[dead(3)]), C(len=2, w=2), R(cw=3, feats=[piston(2.4)]), dark=True),
    lvl('NEW_MOON', 'w15-new-moon', 'New Moon', 'Doors, keys and pistons in the dark', 158,
        R(cw=3, feats=[door(), holes()]), C(len=3), M(mw=3, ny=3, checkpoint=True, feats=[keys(2), dead(1)]), C(len=10, feat='wall', notches=['low']), R(cw=3, feats=[piston(2.4), crumble(3)]), dark=True),
    lvl('PITCH_BLACK', 'w15-pitch-black', 'Pitch Black', 'Two mazes, no light', 159,
        R(cw=3, feats=[piston(2.4), holes()]), C(len=2), M(mw=2, ny=3, feats=[dead(3)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[laser(2.0), crumble(4)]), C(len=2),
        M(mw=3, ny=3, checkpoint=True, feats=[sw, dead(2)]), C(len=3), R(cw=3, feats=[holes(), strips()]), dark=True),
    lvl('BLACKOUT', 'w15-blackout', 'Blackout', 'World 15 finale', 150,
        R(cw=3, feats=[holes(), piston(2.4)]), C(len=10, feat='wall', wpistons=1), M(mw=3, ny=3, checkpoint=True, feats=[dead(2)]), C(len=3),
        R(cw=3, checkpoint=True, feats=[laser(1.9), crumble(4)]), C(len=10, feat='flip'), M(mw=2, ny=3, feats=[dead(2)]), C(len=2, w=2),
        R(cw=3, feats=[fan(4, strength=12), holes()]), dark=True),
]

W16 = [
    lvl('HEARTBEAT', 'w16-heartbeat', 'Heartbeat', 'Red-edged floors light up: cross while they are dark', 161,
        R(cw=3, feats=[pulse(3)]), C(len=3), R(cw=3, feats=[pulse(3, phase=0.5), holes()])),
    lvl('RHYTHM', 'w16-rhythm', 'Rhythm', 'Two pulses in a row', 162,
        R(cw=3, feats=[pulse(3), pulse(3, phase=0.5)]), C(len=3), R(cw=3, checkpoint=True, feats=[holes(), pulse(4, period=3.0)]), C(len=3), R(cw=3, feats=[pulse(3, phase=0.3)])),
    lvl('PULSE_MAZE', 'w16-pulse-maze', 'Pulse Maze', 'Doorways that pulse', 163,
        R(cw=3, feats=[pulse(3)]), C(len=2), M(mw=3, ny=3, feats=[mpulses(3), dead(1)]), C(len=2), R(cw=3, feats=[pulse(3), holes()])),
    lvl('SYNCOPATION', 'w16-syncopation', 'Syncopation', 'Pulses and pistons, off the beat', 164,
        R(cw=3, feats=[pulse(3, period=2.6), piston(2.6)]), C(len=3), M(mw=3, ny=3, checkpoint=True, feats=[mpulses(3), dead(1)]), C(len=3), R(cw=3, feats=[piston(2.4), pulse(4, period=3.0)])),
    lvl('RESTING_RATE', 'w16-resting-rate', 'Resting Rate', 'A breather', 165,
        R(cw=4, feats=[pulse(3, period=3.2)]), C(len=3), R(cw=4, feats=[holes()])),
    lvl('TEMPO', 'w16-tempo', 'Tempo', 'Pulses and a gravity wall', 166,
        R(cw=3, feats=[pulse(3, period=2.6), holes()]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[laser(2.0), pulse(3, period=2.6)]), C(len=2),
        M(mw=3, ny=3, feats=[mpulses(3), dead(1)]), C(len=3), R(cw=3, feats=[pulse(4, period=2.8), strips()])),
    lvl('DOUBLE_TIME', 'w16-double-time', 'Double Time', 'Faster pulses over the glass', 167,
        R(cw=3, feats=[pulse(3, period=2.4), pulse(3, period=2.4, phase=0.5)]), C(len=10, feat='flip'), M(mw=2, ny=3, checkpoint=True, feats=[mpulses(3), dead(2)]), C(len=2, w=2),
        R(cw=3, feats=[pulse(3, period=2.4), holes()])),
    lvl('ARRHYTHMIA', 'w16-arrhythmia', 'Arrhythmia', 'Pulses, doors and lasers', 168,
        R(cw=3, feats=[door(), pulse(3, period=2.5)]), C(len=3), M(mw=3, ny=3, checkpoint=True, feats=[sw, mpulses(2), mlasers(1)]), C(len=10, feat='wall', notches=['low']),
        R(cw=3, feats=[laser(2.0), pulse(4, period=2.6), holes()])),
    lvl('FLATLINE', 'w16-flatline', 'Flatline', 'The pulse never stops', 169,
        R(cw=3, feats=[pulse(3, period=2.4), piston(2.4)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[mpulses(4), dead(1)]), C(len=3),
        R(cw=3, feats=[pulse(3, period=2.4), pulse(3, period=2.4, phase=0.5)]), C(len=10, feat='wall', wpistons=1), R(cw=3, checkpoint=True, feats=[pulse(3, period=2.4), holes()])),
    lvl('PULSE', 'w16-pulse', 'Pulse', 'World 16 finale', 160,
        R(cw=3, feats=[pulse(3, period=2.4), holes()]), C(len=3, feat='pistonX'), M(mw=3, ny=3, checkpoint=True, feats=[mpulses(3), dead(1)]), C(len=10, feat='flip'),
        R(cw=3, checkpoint=True, feats=[laser(1.9), pulse(4, period=2.6)]), C(len=10, feat='wall', notches=['high']), M(mw=2, ny=3, feats=[mpulses(3), dead(2)]), C(len=2, w=2),
        R(cw=3, feats=[pulse(3, period=2.3), piston(2.2), strips()])),
]

W17 = [
    tiers('KEY_DROP', 'w17-key-drop', 'Key Drop', 'A key on every floor', 171,
          T(R(cw=3, feats=[key(top=True), holes()]), C(len=3), R(cw=3, feats=[piston()])),
          T(R(cw=3, feats=[key(top=False)]), C(len=3), R(cw=3, feats=[holes(), strips()]))),
    tiers('CELLAR_DOOR', 'w17-cellar-door', 'Cellar Door', 'Keys upstairs, the goal downstairs', 172,
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[keys(2)]), C(len=2), R(cw=3, feats=[piston(2.6)])),
          T(R(cw=3, feats=[crumble(4)]), C(len=3), R(cw=3, feats=[key(top=True), holes()]), chute=4)),
    tiers('DEEP_STORAGE', 'w17-deep-storage', 'Deep Storage', 'Three floors of keys', 173,
          T(R(cw=3, feats=[key(top=False), piston(2.6)]), C(len=3), R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=2, feats=[keys(1)]), C(len=2), R(cw=3)),
          T(R(cw=3, feats=[laser(2.0), key(top=True)]), C(len=3), R(cw=3, feats=[crumble(3), holes()]))),
    tiers('LOCKER_ROOM', 'w17-locker-room', 'Locker Room', 'A switch upstairs, keys below', 174,
          T(R(cw=3, feats=[door(), holes()]), C(len=3), R(cw=3, feats=[key(top=False)])),
          T(R(cw=3, feats=[holes()]), C(len=10, feat='wall'), M(mw=3, ny=3, checkpoint=True, feats=[keys(2), dead(1)]), C(len=2), R(cw=3, feats=[piston(2.4)]), chute=4)),
    tiers('DUMBWAITER', 'w17-dumbwaiter', 'Dumbwaiter', 'A breather', 175,
          T(R(cw=4, feats=[key(top=True)]), C(len=3), R(cw=4)),
          T(R(cw=4, feats=[holes()]), C(len=3), R(cw=4, feats=[key(top=False)]))),
    tiers('SAFE_DEPOSIT', 'w17-safe-deposit', 'Safe Deposit', 'Keys behind a ceiling flip', 176,
          T(R(cw=3, feats=[key(top=True), piston(2.5)]), C(len=10, feat='flip'), M(mw=3, ny=3, feats=[keys(1), dead(2)]), C(len=2), R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[laser(2.0), holes()]), C(len=3), R(cw=3, checkpoint=True, feats=[key(top=False), piston(2.4)]), chute=5)),
    tiers('UNDERVAULT', 'w17-undervault', 'Undervault', 'Three floors, four keys', 177,
          T(R(cw=3, feats=[key(top=False), holes()]), C(len=2), M(mw=3, ny=3, feats=[keys(1), dead(1)]), C(len=2), R(cw=3, feats=[piston(2.4)])),
          T(R(cw=3, feats=[holes()]), C(len=10, feat='wall', notches=['low']), R(cw=3, checkpoint=True, feats=[key(top=True), laser(2.0)]), chute=4),
          T(R(cw=3, feats=[strips(), holes()]), C(len=2), M(mw=2, ny=3, feats=[keys(1), dead(2)]), C(len=2, w=2), R(cw=3, feats=[crumble(4)]))),
    tiers('TREASURY', 'w17-treasury', 'Treasury', 'Switch, keys and a glide', 178,
          T(R(cw=3, feats=[door(), key(top=False)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[sw, keys(1)]), C(len=2), R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[holes(), piston(2.4)]), C(len=10, feat='wall', wpistons=1), R(cw=3, checkpoint=True, feats=[key(top=True), crumble(3)]), chute=5)),
    tiers('BOTTOMLESS', 'w17-bottomless', 'Bottomless', 'Keys on three floors, two chutes', 179,
          T(R(cw=3, feats=[key(top=True), piston(2.3)]), C(len=2), M(mw=2, ny=3, feats=[keys(1), dead(2)]), C(len=10, feat='flip'), R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[laser(1.9), holes()]), C(len=10, feat='wall', notches=['high']), R(cw=3, checkpoint=True, feats=[key(top=False), piston(2.3)]), chute=4),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[keys(2), dead(1)]), C(len=2), R(cw=3, feats=[crumble(4), strips()]), chute=5)),
    tiers('DEEP_VAULT', 'w17-deep-vault', 'Deep Vault', 'World 17 finale', 170,
          T(R(cw=3, feats=[key(top=False), door()]), C(len=2), M(mw=3, ny=3, feats=[sw, keys(1), dead(1)]), C(len=10, feat='flip'), R(cw=3, feats=[piston(2.3), holes()])),
          T(R(cw=3, feats=[holes()]), C(len=13, feat='wall', notches=['low'], wpistons=1), R(cw=3, checkpoint=True, feats=[key(top=True), laser(1.9)]), chute=4),
          T(R(cw=3, feats=[strips(), holes()]), C(len=2), M(mw=2, ny=3, feats=[keys(2), dead(2)]), C(len=2, w=2), R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[holes()]), C(len=3, feat='pistonX'), R(cw=3, feats=[key(top=False), piston(2.2)]), chute=5)),
]

W18 = [
    lvl('WARP_WIND', 'w18-warp-wind', 'Warp Wind', 'Gates and fans', 181,
        R(cw=3, feats=[fan(4, strength=12)]), WARP, R(cw=3, feats=[pulse(3), gapwarp(3)]), C(len=3), R(cw=3, feats=[fan(4, strength=12), holes()])),
    lvl('STATIC', 'w18-static', 'Static', 'Pulses at the gates', 182,
        R(cw=3, feats=[pulse(3), gapwarp(3)]), C(len=2), M(mw=3, ny=3, feats=[warpexit(1), mpulses(2)]), WARP, R(cw=3, feats=[pulse(3), holes()])),
    lvl('THUNDERCLAP', 'w18-thunderclap', 'Thunderclap', 'Storm in the maze', 183,
        R(cw=3, feats=[fan(4, strength=12), holes()]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[warpexit(2), mpulses(2)]), WARP, R(cw=3, feats=[pulse(3, period=2.6), gapwarp(3)])),
    lvl('LIGHTNING', 'w18-lightning', 'Lightning Rod', 'Fans, pulses and a wall', 184,
        R(cw=3, feats=[pulse(3, period=2.6), fan(4, strength=12)]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[gapwarp(3), pulse(3, period=2.6)]), WARP,
        R(cw=3, feats=[fan(4, strength=13, period=3.4), holes()])),
    lvl('DRIZZLE', 'w18-drizzle', 'Drizzle', 'A breather', 185,
        R(cw=4, feats=[fan(4, strength=10)]), WARP, R(cw=4, feats=[pulse(3, period=3.2)])),
    lvl('SUPERCELL', 'w18-supercell', 'Supercell', 'Warp, wind and a ceiling', 186,
        R(cw=3, feats=[fan(4, strength=13, period=3.4)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[warpexit(2), mpulses(2)]), WARP,
        R(cw=3, feats=[pulse(3, period=2.5), piston(2.4)]), C(len=3), R(cw=3, feats=[fan(4, strength=13, period=3.4), holes()])),
    lvl('MONSOON', 'w18-monsoon', 'Monsoon', 'Narrow halls in the storm', 187,
        R(cw=3, feats=[fan(4, strength=13, period=3.4), pulse(3, period=2.5)]), C(len=2), M(mw=2, ny=3, feats=[warpexit(2)]), WARP,
        R(cw=3, checkpoint=True, feats=[laser(2.0), gapwarp(3)]), C(len=10, feat='wall', notches=['low']), R(cw=3, feats=[fan(5, strength=13, period=3.3), strips()])),
    lvl('HAILSTORM', 'w18-hailstorm', 'Hailstorm', 'Everything crumbles in the wind', 188,
        R(cw=3, feats=[crumble(4), fan(4, strength=13, period=3.3)]), WARP, M(mw=3, ny=3, checkpoint=True, feats=[warpexit(2), mpulses(3)]), WARP,
        R(cw=3, feats=[pulse(3, period=2.4), gapwarp(3)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[fan(4, strength=13, period=3.3), holes()])),
    lvl('TYPHOON', 'w18-typhoon', 'Typhoon', 'The worst of the weather', 189,
        R(cw=3, feats=[pulse(3, period=2.4), fan(4, strength=13, period=3.3)]), C(len=10, feat='wall', wpistons=1), M(mw=3, ny=3, checkpoint=True, feats=[warpexit(2), mpulses(3)]), WARP,
        R(cw=3, feats=[gapwarp(3), fan(4, strength=14, period=3.3)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[laser(1.9), pulse(3, period=2.4)]), C(len=2),
        M(mw=2, ny=3, feats=[mpulses(2), dead(2)]), C(len=2, w=2), R(cw=3, feats=[fan(4, strength=14, period=3.2), holes()])),
    lvl('WARP_STORM', 'w18-warp-storm', 'Warp Storm', 'World 18 finale', 180,
        R(cw=3, feats=[fan(4, strength=13, period=3.3)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[warpexit(3), mpulses(3)]), WARP,
        R(cw=3, checkpoint=True, feats=[pulse(3, period=2.4), fan(4, strength=14, period=3.2)]), C(len=13, feat='wall', notches=['low'], wpistons=1), M(mw=2, ny=3, feats=[warpexit(2)]), WARP,
        R(cw=3, checkpoint=True, feats=[laser(1.9), gapwarp(4)]), C(len=3, feat='pistonX'), R(cw=3, feats=[pulse(3, period=2.3), fan(4, strength=14, period=3.2), strips()])),
]

W19 = [
    tiers('NIGHT_DROP', 'w19-night-drop', 'Night Drop', 'Drop through the dark', 191,
          T(R(cw=3, feats=[holes(), key(top=True)]), C(len=3), R(cw=3, feats=[piston(2.6)])),
          T(R(cw=3, feats=[gapwarp(3)]), C(len=3), R(cw=3, feats=[holes(), key(top=False)])), dark=True),
    tiers('MOONLIGHT', 'w19-moonlight', 'Moonlight', 'Gates and keys in the dark', 192,
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[keys(1), warpexit(1)]), WARP, R(cw=3, feats=[piston(2.5)])),
          T(R(cw=3, feats=[key(top=True), holes()]), C(len=3), R(cw=3, feats=[pulse(3)]), chute=4), dark=True),
    tiers('NOCTURNE', 'w19-nocturne', 'Nocturne', 'Three dark floors', 193,
          T(R(cw=3, feats=[key(top=False), gapwarp(3)]), C(len=3), R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=2, feats=[keys(1), dead(1)]), C(len=2), R(cw=3, feats=[pulse(3)])),
          T(R(cw=3, feats=[fan(4, strength=12)]), C(len=3), R(cw=3, feats=[holes(), strips()])), dark=True),
    tiers('GRAVEYARD_SHIFT', 'w19-graveyard-shift', 'Graveyard Shift', 'A dark wall walk and a glide', 194,
          T(R(cw=3, feats=[key(top=True), piston(2.5)]), C(len=10, feat='wall'), M(mw=3, ny=3, checkpoint=True, feats=[keys(1), warpexit(1)]), WARP, R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[pulse(3), key(top=False)]), chute=4), dark=True),
    tiers('STARGAZER', 'w19-stargazer', 'Stargazer', 'A breather', 195,
          T(R(cw=4, feats=[key(top=True)]), C(len=3), R(cw=4)),
          T(R(cw=4, feats=[holes()]), C(len=3), R(cw=4, feats=[gapwarp(3)]), chute=3), dark=True),
    tiers('MIDNIGHT', 'w19-midnight', 'Midnight', 'Keys, fans and a ceiling in the dark', 196,
          T(R(cw=3, feats=[fan(4, strength=12), key(top=False)]), C(len=10, feat='flip'), M(mw=3, ny=3, feats=[keys(1), dead(2)]), C(len=2), R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[pulse(3, period=2.6), holes()]), C(len=3), R(cw=3, checkpoint=True, feats=[gapwarp(3), key(top=True)]), chute=5), dark=True),
    tiers('DEAD_OF_NIGHT', 'w19-dead-of-night', 'Dead of Night', 'Three floors, every trick', 197,
          T(R(cw=3, feats=[key(top=True), holes()]), C(len=2), M(mw=3, ny=3, feats=[warpexit(1), mpulses(1)]), WARP, R(cw=3, feats=[piston(2.4)])),
          T(R(cw=3, feats=[holes()]), C(len=10, feat='wall', notches=['low']), R(cw=3, checkpoint=True, feats=[fan(4, strength=12), key(top=False)]), chute=4),
          T(R(cw=3, feats=[strips(), holes()]), C(len=2), M(mw=2, ny=3, feats=[keys(1), dead(2)]), C(len=2, w=2), R(cw=3, feats=[pulse(3, period=2.6)]))),
    tiers('WITCHING_HOUR', 'w19-witching-hour', 'Witching Hour', 'Switches and gates in the dark', 198,
          T(R(cw=3, feats=[door(), key(top=False)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[sw, keys(1)]), C(len=2), R(cw=3, feats=[gapwarp(3)])),
          T(R(cw=3, feats=[holes(), piston(2.4)]), C(len=10, feat='wall', wpistons=1), R(cw=3, checkpoint=True, feats=[key(top=True), pulse(3, period=2.5)]), chute=5), dark=True),
    tiers('NIGHTFALL', 'w19-nightfall', 'Nightfall', 'Three dark floors, two chutes', 199,
          T(R(cw=3, feats=[key(top=True), fan(4, strength=12)]), C(len=2), M(mw=2, ny=3, feats=[keys(1), dead(2)]), C(len=10, feat='flip'), R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[laser(1.9), holes()]), C(len=10, feat='wall', notches=['high']), R(cw=3, checkpoint=True, feats=[key(top=False), gapwarp(3)]), chute=4),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=3, ny=3, feats=[warpexit(2), keys(1)]), WARP, R(cw=3, feats=[pulse(3, period=2.5), strips()]), chute=5), dark=True),
    tiers('NIGHT_SHIFT', 'w19-night-shift', 'Night Shift', 'World 19 finale', 190,
          T(R(cw=3, feats=[key(top=False), door()]), C(len=2), M(mw=3, ny=3, feats=[sw, keys(1), dead(1)]), C(len=10, feat='flip'), R(cw=3, feats=[piston(2.3), holes()])),
          T(R(cw=3, feats=[holes()]), C(len=13, feat='wall', notches=['low'], wpistons=1), R(cw=3, checkpoint=True, feats=[key(top=True), fan(4, strength=13, period=3.4)]), chute=4),
          T(R(cw=3, feats=[pulse(3, period=2.5), holes()]), C(len=2), M(mw=2, ny=3, feats=[warpexit(2), keys(1)]), WARP, R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[holes()]), C(len=3, feat='pistonX'), R(cw=3, feats=[key(top=False), gapwarp(3)]), chute=5), dark=True),
]

W20 = [
    tiers('EVENT_ZERO', 'w20-event-zero', 'Event Zero', 'The last world: every idea from 11 to 19', 201,
          T(R(cw=3, feats=[key(top=True), fan(4, strength=12)]), WARP, R(cw=3, feats=[pulse(3), holes()])),
          T(R(cw=3, feats=[gapwarp(3)]), C(len=10, feat='wall'), R(cw=3, checkpoint=True, feats=[key(top=False), piston(2.4)]))),
    lvl('GRAVITON', 'w20-graviton', 'Graviton', 'Fans and keys in a pulsing maze', 202,
        R(cw=3, feats=[fan(4, strength=13, period=3.4), key(top=True)]), C(len=2), M(mw=3, ny=3, checkpoint=True, feats=[keys(2), mpulses(2)]), C(len=10, feat='flip'),
        R(cw=3, checkpoint=True, feats=[gapwarp(3), pulse(3, period=2.5)]), C(len=3), R(cw=3, feats=[laser(1.9), key(top=False)])),
    tiers('TIDAL_FORCE', 'w20-tidal-force', 'Tidal Force', 'Three floors with the lights off', 203,
          T(R(cw=3, feats=[key(top=False), pulse(3, period=2.6)]), C(len=2), M(mw=3, ny=3, feats=[warpexit(1)]), WARP, R(cw=3, feats=[holes()])),
          T(R(cw=3, feats=[fan(4, strength=13, period=3.4)]), C(len=10, feat='wall', notches=['low']), R(cw=3, checkpoint=True, feats=[key(top=True), piston(2.3)]), chute=4),
          T(R(cw=3, feats=[holes()]), C(len=3), R(cw=3, feats=[pulse(3, period=2.5), crumble(3)])), dark=True),
    lvl('EVENT_HORIZON_2', 'w20-spaghettify', 'Spaghettification', 'Long, narrow and full of gates', 204,
        R(cw=3, feats=[gapwarp(3), piston(2.3)]), C(len=2), M(mw=2, ny=3, feats=[warpexit(3)]), WARP, R(cw=3, checkpoint=True, feats=[fan(4, strength=13, period=3.3), pulse(3, period=2.4)]),
        C(len=10, feat='wall', wpistons=1), M(mw=2, ny=3, checkpoint=True, feats=[keys(2), mpulses(2)]), C(len=2, w=2), R(cw=3, feats=[laser(1.8), key(top=True), holes()])),
    lvl('QUIET_ZONE', 'w20-quiet-zone', 'Quiet Zone', 'A last breather', 205,
        R(cw=4, feats=[key(top=True), pulse(3, period=3.2)]), WARP, R(cw=4, feats=[fan(4, strength=10), key(top=False)])),
    tiers('HAWKING', 'w20-hawking', 'Hawking Radiation', 'Keys on every floor, two chutes', 206,
          T(R(cw=3, feats=[key(top=True), laser(1.9)]), C(len=10, feat='flip'), M(mw=3, ny=3, feats=[keys(1), mpulses(2)]), C(len=2), R(cw=3, feats=[fan(4, strength=13, period=3.3)])),
          T(R(cw=3, feats=[holes()]), C(len=10, feat='wall', notches=['high']), R(cw=3, checkpoint=True, feats=[key(top=False), gapwarp(3)]), chute=4),
          T(R(cw=3, feats=[pulse(3, period=2.4), holes()]), C(len=3), R(cw=3, feats=[key(top=True), piston(2.2)]), chute=5)),
    lvl('DARK_ENERGY', 'w20-dark-energy', 'Dark Energy', 'Every trick, no light', 207,
        R(cw=3, feats=[fan(4, strength=13, period=3.3), key(top=False)]), C(len=10, feat='flip'), M(mw=3, ny=3, checkpoint=True, feats=[keys(1), warpexit(2)]), WARP,
        R(cw=3, feats=[pulse(3, period=2.4), gapwarp(3)]), C(len=10, feat='wall', notches=['low']), R(cw=3, checkpoint=True, feats=[laser(1.8), key(top=True), holes()]), dark=True),
    tiers('PERIHELION', 'w20-perihelion', 'Perihelion', 'Four floors down', 208,
          T(R(cw=3, feats=[key(top=True), piston(2.3)]), C(len=2), M(mw=3, ny=3, feats=[sw, keys(1)]), C(len=2), R(cw=3, feats=[door(), holes()])),
          T(R(cw=3, feats=[fan(4, strength=13, period=3.3)]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[pulse(3, period=2.4), key(top=False)]), chute=4),
          T(R(cw=3, feats=[holes()]), C(len=2), M(mw=2, ny=3, feats=[warpexit(2), keys(1)]), WARP, R(cw=3, feats=[crumble(4)])),
          T(R(cw=3, feats=[laser(1.8), holes()]), C(len=10, feat='wall', wpistons=1), R(cw=3, checkpoint=True, feats=[key(top=True), gapwarp(3)]), chute=5)),
    tiers('POINT_OF_NO_RETURN_2', 'w20-last-light', 'Last Light', 'The hardest level before the finale', 209,
          T(R(cw=3, feats=[pulse(3, period=2.3), key(top=False)]), C(len=13, feat='wall', notches=['low'], wpistons=1), M(mw=3, ny=4, checkpoint=True, feats=[keys(1), warpexit(1), mpulses(1)]), WARP,
            R(cw=3, feats=[fan(4, strength=14, period=3.2), holes()])),
          T(R(cw=3, feats=[holes()]), C(len=10, feat='flip'), R(cw=3, checkpoint=True, feats=[laser(1.8), key(top=True), piston(2.2)]), chute=5),
          T(R(cw=3, feats=[pulse(3, period=2.3), gapwarp(3)]), C(len=2), M(mw=2, ny=3, feats=[keys(2), dead(2)]), C(len=2, w=2), R(cw=3, feats=[fan(4, strength=14, period=3.2), holes()])), dark=True),
    tiers('SINGULARITY_X', 'w20-singularity', 'Singularity', 'The grand finale: level 200', 200,
          T(R(cw=3, feats=[key(top=True), fan(4, strength=13, period=3.3)]), C(len=2), M(mw=3, ny=3, feats=[sw, keys(1), mpulses(1)]), C(len=10, feat='flip'), R(cw=3, feats=[door()])),
          T(R(cw=3, feats=[holes()]), C(len=13, feat='wall', notches=['low'], wpistons=1), R(cw=3, checkpoint=True, feats=[pulse(3, period=2.3), key(top=False), laser(1.8)]), chute=4),
          T(R(cw=3, feats=[fan(4, strength=14, period=3.2), holes()]), C(len=2), M(mw=2, ny=3, checkpoint=True, feats=[warpexit(2), keys(1)]), WARP, R(cw=3, feats=[crumble(4), piston(2.2)])),
          T(R(cw=3, feats=[pulse(3, period=2.3)]), C(len=3, feat='pistonX'), R(cw=3, feats=[key(top=True), gapwarp(3)]), chute=5), dark=True),
]

WORLDS = [
    ('world11', 'World 11 · Depths', W11), ('world12', 'World 12 · Warp Gate', W12), ('world13', 'World 13 · Vault', W13),
    ('world14', 'World 14 · Storm Front', W14), ('world15', 'World 15 · Blackout', W15), ('world16', 'World 16 · Pulse', W16),
    ('world17', 'World 17 · Deep Vault', W17), ('world18', 'World 18 · Warp Storm', W18), ('world19', 'World 19 · Night Shift', W19),
    ('world20', 'World 20 · Singularity', W20),
]

if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    routes = {}
    for fname, title, levels in WORLDS:
        if only and fname not in only:
            continue
        print(fname)
        routes.update(write_world(f'../../src/levels/generated/{fname}.ts', title, 'worlds_11_20.py', levels))
    old = json.load(open('routes.json')) if os.path.exists('routes.json') else {}
    old.update(routes)
    json.dump(old, open('routes.json', 'w'), indent=0)
    for e in levelgen.ERRORS:
        print('ERROR', e)
