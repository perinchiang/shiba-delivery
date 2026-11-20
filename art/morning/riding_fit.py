"""The rider's contact triangle in bike space (metres, Y up, +Z to the front wheel)."""

import math
from mathutils import Quaternion
from forms import V, X

SEAT_DROP = 0.030
RIDER_ORIGIN = V((0, 0.603 - SEAT_DROP, -0.203))
PELVIS_TILT = Quaternion(X, math.radians(7))
CHEST_TILT = Quaternion(X, math.radians(15))
HEAD_LEVEL = Quaternion(X, math.radians(-18))
SOLE_DEPTH = 0.079


def footrest(side):
    return V((side * 0.237, 0.613, -0.151))


def grip(side):
    return V((side * 0.322, 1.141, 0.050))


def palm(side):
    return grip(side) + V((0, 0.079, -0.010))
