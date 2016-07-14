"use strict"
// **** mini lib for js ****
//author: Onne Gorter
//license: CC0

// TAU is around the unit circle once: starting at x=1,y=0, clockwise to x=0,y=-1 (at TAU4)
const TAU = Math.PI * 2.0
const TAU2 = Math.PI
const TAU4 = Math.PI / 2.0
const TAU8 = Math.PI / 4.0
const TAU16 = Math.PI / 8.0

// reasonable maximum/minimum for js integer numbers
const MAX_NUMBER = Math.pow(2, 51)
const MIN_NUMBER = -Math.pow(2, 51)

// lets not type in Math.obvious
const sin = Math.sin
const asin = Math.asin
const cos = Math.cos
const acos = Math.acos
const tan = Math.tan
const atan = Math.atan
const atan2 = Math.atan2
const round = Math.round
const floor = Math.floor
const ceil = Math.ceil
const min = Math.min
const max = Math.max
const sqrt = Math.sqrt
const pow = Math.pow
const abs = Math.abs

function isBool(o) { return typeof o === "boolean" }
function isNumber(o) { return typeof o === "number" && !isNaN(o) }
function isString(o) { return typeof o === "string" }
function isArray(o) { return typeof o === "object" && o instanceof Array }
function isObject(o) { return typeof o === "object" && !(o instanceof Array) }
function isFunction(o) { return typeof o === "function" }

// better syntax for timers, and time is always in seconds
function after(seconds, fn) { return setTimeout(fn, seconds * 1000) }
function cancelAfterTimer(timer) { clearTimeout(timer) }
function every(seconds, fn) { return setInterval(fn, seconds * 1000) }
function cancelEveryTimer(timer) { clearInterval(timer) }

// return current wall clock time in seconds
function currentTime() { return timeFromMillis(+new Date) }

// convert from milliseconds to time (always in seconds)
function timeFromMillis(millis) { return millis / 1000.0 }

// compare two floating point numbers to see if they are the same with a tolarance
function fequals(f1, f2, within) {
    within = within || 0.1
    return abs(f1 - f2) < within
}

// modulo that results from 0..m exclusive (instead of -m .. m of just %)
function mod(n, m) {
    return (n % m + m) % m
}

// return a random number between 0..a exclusive, or a..b exclusive
function rnd(a, b) {
    if (b == null) { b = a; a = 0; if (b == null) b = 1 }
    if (a > b) { let t = b; b = a; a = t }
    return Math.random() * (b - a) + a
}

// return a random integer number between 0..a exclusive, or a..b exclusive
function rndint(a, b) {
    return rnd(a, b)|0
}

// return a random element from a list
function rnditem(list) {
    return list[rndint(list.length)]
}

// linearly interpolate between a and b, depending on fraction f=0..1 == a..b
function lerp(a, b, f) {
    return a * (1 - f) + b * f
}

// fix a between range of min and max
function clamp(a, min, max) {
    if (a < min) return min
    if (a > max) return max
    return a
}

// take any angle, normalize it between -PI..PI
function anglenorm(a) {
    while (a < -TAU2) a += TAU
    while (a > TAU2) a -= TAU
    return a
}

// take any two angles, return a1 - a2 from -PI..PI
function anglediff(a1, a2) {
    return anglenorm(a1 - a2)
}

// take any angle, and a max angle, clamp angle between -max_angle...max_angle
function angleclamp(a, max) {
    max = anglenorm(max)
    return clamp(anglenorm(a), -max, max)
}

// pythagoras distance without square root
function dist2(x1, x2, y1, y2) {
    return pow(x1 - x2, 2) + pow(y1 - y2, 2)
}

// pythagoras distance
function dist(x1, x2, y1, y2) {
    return sqrt(dist2(x1, x2, y1, y2))
}

// distance between a line and a point without square root
function linePointDist2(lx1, ly1, lx2, ly2, px, py) {
    let l2 = dist2(lx1, lx2, ly1, ly2)
    if (l2 === 0) return dist2(lx1, px, ly1, py)
    let t = ((px - lx1) * (lx2 - lx1) + (py - ly1) * (ly2 - ly1)) / l2
    if (t < 0) return dist2(lx1, px, ly1, py)
    if (t > 1) return dist2(lx2, px, ly2, py)
    return dist2(lx1 + t * (lx2 - lx1), px, ly1 + t * (ly2 - ly1), py)
}

// distance between a line and a point
function linePointDist(lx1, ly1, lx2, ly2, px, py) {
    return sqrt(linePointDist2(lx1, ly1, lx2, ly2, px, py))
}

// check if two rays intersect
function rayIntersect(px1, py1, vx1, vy1, px2, py2, vx2, vy2) {
    let d = -vx2 * vy1 + vx1 * vy2
    let t = (vx2 * (py1 - py2) -  vy2 * (px1 - px2)) / d
    if (t >= 0 && t <= 1) {
        let s = (-vy1 * (px1 - px2) + vx1 * (py1 - py2)) / d
        if (s >= 0 && s <= 1) return true
    }
    return false
}

// simple assert
function assert(c, desc) {
    if (c) return
    let e = new Error(desc? "Assertion Failed: "+ desc : "Assertion Failed")
    if (e.stack) e.message += e.stack.split("\n")[2]
    throw e
}

assert(!rayIntersect(0, 0, 100, 0, 25, 25, 100, 100))
assert(rayIntersect(0, 0, 100, 0, 25, 25, 0, -100))
assert(!rayIntersect(0, 100, 100, 0, 25, 25, 0, -100))
assert(rayIntersect(0, 100, 100, 0, 25, 25, 10, 100))
assert(rnd() >= 0)
assert(rnd(1) >= 0)
assert(rnd(0, 0) === 0)
assert(rnd(-1, 0) < 0)
assert(rnd(-1, 0) >= -1)
assert(rnd(1, 2) >= 1)
assert(rnd(2, 1) >= 1)
