"""The rider's contact triangle in bike space (metres, Y up, +Z to the front wheel)."""

import math
from mathutils import Quaternion
from forms import V, X

# Smaller street wheels lower the whole chassis evenly. Everything below the
# frame knee scales with the wheels; everything above shifts down rigidly, so the
# seat, grips and pegs keep the rider's contact triangle and proportions.
FRAME_KNEE = .60
WHEEL_RATIO = .80
CHASSIS_DROP = FRAME_KNEE * (1 - WHEEL_RATIO)
# Side-stand lean at a seated stop or when parked. The stand foot is authored to
# meet the street at this angle.
STAND_LEAN = math.radians(10)
SEAT_DROP = 0.030
RIDER_ORIGIN = V((0, 0.603 - SEAT_DROP, -0.203))
PELVIS_TILT = Quaternion(X, math.radians(7))
CHEST_TILT = Quaternion(X, math.radians(15))
HEAD_LEVEL = Quaternion(X, math.radians(-18))
SOLE_DEPTH = 0.079


def footrest(side):
    return V((side * 0.28, 0.640, -0.151))


def grip(side):
    return V((side * 0.322, 1.141, 0.050))


def palm(side):
    # The marker is the paw centre over the rubber, authored once in bike
    # space.  Runtime IK consumes this exact point (no hidden reach offset).
    return grip(side) + V((0, 0.079, 0.035))
