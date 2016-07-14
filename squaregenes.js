"use strict"
/*
A life simulator.

As long as there are empty spaces, random genes are created, given a bit of
energy, and a nucleus that decodes their instructions.

For genes to stay around. They must copy themselves as all nuclei will die of
old age eventually. To do that, they must find energy, or run out and starve.

Most genes wont't make it. But few find a way. And with every copy perhaps
mutate and find even better ways to stay around. Slowly life grows. And after a
while, but inevitably, the simulator will be teeming with life.

The thing to note, this simulator only provides a few things:
1. an enviroment with rules
2. an implementation of how genes are to be interpreted
3. as genes ask for a copy, mutate the copy (how much depends on the ask)
4. on empy spaces, create random genes with some energy

From there genes are on their own. Natural selection emerges because genes
might copy. And only those that do, and do well, stay around.

The system uses squares, so that it can simulate many parts and many genes at
once. Parts of entities do not need to be fully connected, yet share all
energy. (Again for speed.)

Green parts harvest energy slowly from the environment. Red can eat green (and
nuclei) and release energy quickly. Blue can eat red.

Usually over time, larger entities will learn to use red/blue as a defensive
border. A cell wall if you like.

You can see the genes at work by clicking on a part. A visual of the gene will
appear at the right side of the screen. The more red, the more an instruction
was activated in the recent past. For what the genes encode for, read the rest
of the sourcecode.

author: Onne Gorter
license: MIT
*/

var POW = 7 // world is a 2^POW sized, huge worlds eat a lot of cpu (8 or 9 works well)
var SCALE = 3 // draw each part as a SCALExSCALE rectangle
var ALLOW_MULTI_NUCLEI = true // allow a single entity to have more then one nuclei
var VERTICAL = false

// **** setup the world ****
var SIZE = Math.pow(2, POW)
var MASK = SIZE - 1
const WORLD = new Array(SIZE * SIZE)
const ENTITIES = []

// re initialize things to set another size than hardcoded
function init(size) {
    POW = min(64, floor(Math.log2(size)))
    SIZE = Math.pow(2, POW)
    MASK = SIZE - 1
    WORLD.length = SIZE * SIZE
}

function worldX(coord) { return coord & MASK }
function worldY(coord) { return coord >> POW }
function coordXY(x, y) { return ((y & MASK) << POW)|(x & MASK) }
assert(worldX(1) === 1)
assert(worldY(1) === 0)
assert(worldX(SIZE + 17) === 17)
assert(worldY(SIZE + 17) === 1)
assert(coordXY(17, 1) === SIZE + 17)

function move(coord, signal) {
    switch (signal) {
        case 0: return coordXY(worldX(coord) + 1, worldY(coord))
        case 1: return coordXY(worldX(coord), worldY(coord) + 1)
        case 2: return coordXY(worldX(coord) - 1, worldY(coord))
        case 3: return coordXY(worldX(coord), worldY(coord) - 1)
    }
}
assert(move(coordXY(SIZE - 1, SIZE - 1), 0) === coordXY(0, SIZE - 1))
assert(move(coordXY(SIZE - 1, SIZE - 1), 1) === coordXY(SIZE - 1, 0))

function setPart(part) {
    //assert(part)
    //assert(part.entity.parts > 0)
    var old = WORLD[part.coord]
    if (old && !old.removed) {
        //assert(old.entity === part.entity)
        old.destroy()
    }
    WORLD[part.coord] = part
}

function getPart(coord) {
    return WORLD[coord]
}

function getPartIf(coord, entity) {
    var part = WORLD[coord]
    if (part && part.entity === entity) return part
    return null
}

// **** gene commands ****

// ahum, the IF_ commands evaluate like xor
function evalIf(value, signal) {
    return !!(!!value ^ (signal >= 4))
}
assert(evalIf("hello", 1))
assert(!evalIf("hello", 5))
assert(evalIf(null, 5))

// genes instructions, mostly cmd,signal pairs, both go from 0-7
// 4 signals 0..3, 4..7 are the same signals, but negated
// signals are boolean, either on or off
// IF codes stop processing of a gene unless the condition holds
const IF_PART = 0 // traverse entity, 0= if part at x+1, 1=y+1, ...; 4=x+1 but "if not"
const IF_ENERGY = 1 // check if energy level is 0..3, or 4..7 for "if not"
const IF_AGE = 2 // check if age is 0..3, or 4..7 for "if not"
const IF_LEVEL = 3 // check if this is the intial nucleus, or later copy
const ROTATE = 4 // rotate dir by, -2,-1,+1,+2, and/or flip rotate sign
const BUILD = 5 // build a new part, if possible
const SEED = 6 // duplicate/mutate current genes into independent nucleus
const BEGIN = 7 // start of a new gene, also stops current gene

// POSSIBILITIES, NOT USED AT THE MOMENT
const IF_SIGNAL = 1 // check if a signal is present
const SET_SIGNAL = 2 // set (or unset if signal >= 4) a signal
const KILL = 6 // kill anything (including own parts), get some of its energy
const IF_RANDOM = 3 // if signal <= rndint(8)


// **** setup entities/parts ****

// constants
const MUTATION_RATE = 0.01
const ENERGY_GENE_COST = 1 / 20
const START_LIFE = 1000 // alive for only 1000 ticks ~ 50 seconds @ 20 ticks per second
const START_ENERGY = 1.33
const MAX_ENERGY = 2
const MAX_SEED_ENERGY = 3
const NEW_PART_COST = 1
const NEW_SEED_COST = 1.33
const START_FOOD = NEW_PART_COST * 0.8
const KILL_COST = 0.3

// per second constants
const GREEN_ENERGY_ADD = 0.75
const FOOD_ENERGY_ADD = 4

// entity has one or more parts, and at least one nucleus, it keeps track of energy and some statistics
class Entity {
    constructor(energy, generation) {
        //assert(isNumber(energy))
        //assert(isNumber(generation))
        this.energy = energy
        this.maxenergy = 0
        this.parts = 0
        this.nucleus = 0
        this.removed = false
        this.alive = 0
        this.generation = generation
        ENTITIES.push(this)
        totalentities += 1
    }

    update(dt) {
        this.alive += 1
        //assert(isNumber(this.energy))
        //assert(isNumber(this.parts))
        //assert(isNumber(this.nucleus))
        this.maxenergy = this.parts * MAX_ENERGY
        if (this.energy > this.maxenergy) this.energy = this.maxenergy

        if (this.energy < 0) this.removed = true
        if (this.nucleus <= 0) this.removed = true
        if (this.parts <= 0) this.removed = true
    }
}

// a part is in one square of the world, part of an entity
class Part {
    constructor(coord, entity) {
        this.coord = coord
        this.entity = entity
        this.life = START_LIFE // every part has limited life
        this.removed = false
        this.entity.parts += 1
        if (this instanceof Nucleus) this.entity.nucleus += 1
    }

    destroy() {
        if (this.removed) return
        this.entity.parts -= 1
        if (this instanceof Nucleus) this.entity.nucleus -= 1
        this.removed = true
    }

    update(dt) {
        this.life -= 1
        if (this.life < 0) this.destroy()
        if (this.entity.removed) this.destroy()
    }
}

// green parts extract energy from the environment, slowly
class Green extends Part {
    update(dt) {
        super.update(dt)
        if (this.removed) return
        this.entity.energy += GREEN_ENERGY_ADD * dt
    }
}

// eaters (red/blue) extract energy after eating another part, fast energy supply
class Eater extends Part {
    constructor(coord, entity) {
        super(coord, entity)
        this.food = START_FOOD
        this.life *= 5 // stay around for a lot longer, but until food is zero

        // gain energy from the entity about to be eaten, blue gets a bonus
        var part = getPart(coord)
        if (part && part.entity !== entity) {
            var enemy = part.entity
            var add = enemy.energy / enemy.parts + rnd(MAX_ENERGY)
            if (this instanceof Blue) add *= 2
            enemy.energy -= add
            this.food += add
            part.destroy()
        }
    }

    update(dt) {
        super.update(dt)
        if (this.food <= 0) this.destroy()
        if (this.removed) return
        var add = FOOD_ENERGY_ADD * dt
        if (this.entity.energy + add < this.entity.maxenergy) {
            this.food -= add
            this.entity.energy += add
        }
    }
}

// two kind of eaters, red eats green and nucleus, blue eats red
class Red extends Eater { }
class Blue extends Eater { }

// nucleus is what has genes, evaluating them costs energy
// it can inherit from another nucleus, in which case it copies properties like directionality
class Nucleus extends Part {
    constructor(coord, entity, genes, nucleus) {
        super(coord, entity)
        //assert(isArray(genes))
        this.genes = genes
        this.geneslength = genes.length
        this.life -= this.geneslength
        this.level = nucleus? nucleus.level + 1 : 0
        this.dir = nucleus? nucleus.dir : rndint(4)
        this.sign = nucleus? nucleus.sign : rnditem([-1,1])
        this.trace = null
        this.start = _update
    }

    getEnergySignal(signal) {
        //assert(signal >= 0 && signal < 4)
        var fraction = this.entity.energy / (this.entity.parts * MAX_ENERGY)
        return fraction * 4.1 >= (signal + 1)
    }

    getAgeSignal(signal) {
        //assert(signal >= 0 && signal < 4)
        var fraction = this.life / START_LIFE
        return fraction * 4.1 >= (signal + 1)
    }

    getLevelSignal(signal) {
        //assert(signal >= 0 && signal < 4)
        return (this.level & 0x3) === signal
    }

    update(dt) {
        // don't update the tick it was created, prevents BUILDs in x+, y+ directions to be immediate
        if (this.start === _update) return
        super.update(dt)
        if (this.removed) return

        var cost = this.interpret()
        this.entity.energy -= cost * ENERGY_GENE_COST * dt
    }

    interpret() {
        // interpret all genes, they are separated by BEGIN commands
        var cost = 0
        var seenbegin = true
        for (var i = 0, il = this.geneslength; i < il; i++) {
            if (this.removed) break
            var cmd = this.genes[i]
            if (cmd >= BEGIN) { seenbegin = true; continue }
            i += 1
            if (!seenbegin) continue
            cost += this.interpretGene(i - 1, il)
            seenbegin = false
        }
        return cost
    }

    interpretGene(i, il) {
        // interpret a single gene, stopping when a condition is false, or a new BEGIN is found
        var cost = 0
        var coord = this.coord
        var selected = this
        var trace = this.trace
        while (true) {
            if (this.removed) return cost
            if (i >= il) return cost

            var cmd = this.genes[i]
            //assert(cmd >= 0 && cmd < 8)
            if (cmd >= BEGIN) return cost
            if (trace) trace[i] = 0xFF
            i += 1
            if (i >= il) return cost
            var signal = this.genes[i]
            i += 1

            // first series of IF_ commands have no cost
            if (cost > 0 || cmd > IF_LEVEL) cost += 1

            switch (cmd) {
                case ROTATE:
                    if (signal >= 4) this.sign *= -1
                    this.dir = (this.dir + this.sign * (signal & 0x3)) & 0x3
                    break
                case IF_PART:
                    if (!selected) break
                    coord = move(coord, (this.dir + this.sign * (signal & 0x3)) & 0x3)
                    selected = getPartIf(coord, this.entity)
                    if (!evalIf(selected, signal)) return cost
                    break
                case IF_ENERGY:
                    if (!evalIf(this.getEnergySignal(signal & 0x3), signal)) return cost
                    break
                case IF_AGE:
                    if (!evalIf(this.getAgeSignal(signal & 0x3), signal)) return cost
                    break
                case IF_LEVEL:
                    if (!evalIf(this.getLevelSignal(signal & 0x3), signal)) return cost
                    break
                case BUILD:
                    var builder = getBuilderFor(signal)
                    if (this.entity.energy < builder.cost) break
                    if (!builder.canBuild(selected, coord)) break
                    this.entity.energy -= builder.cost
                    selected = builder.build(coord, this.entity, this)
                    setPart(selected)
                    break
                case SEED:
                    if (this.entity.energy < NEW_SEED_COST) break
                    var coord2 = move(coord, rndint(4))
                    if (getPart(coord2)) break
                    this.entity.energy -= NEW_SEED_COST
                    var energy = this.entity.energy / 2
                    if (energy > MAX_SEED_ENERGY) energy = MAX_SEED_ENERGY
                    this.entity.energy -= energy
                    var genes = mutateGenes(this.genes, signal)

                    var part = new Nucleus(coord2, new Entity(energy, this.entity.generation + 1), genes)
                    setPart(part)
                    break
            }
        }
    }
}

// test nucleus working
(function() {
    var signal = 0 // signal 4..7 are the same as 0..3 but inverted
    var n1 = new Nucleus(0, new Entity(START_ENERGY, 0), [])
    assert(n1.getEnergySignal(0))
    assert(n1.getEnergySignal(1))
    assert(!n1.getEnergySignal(2))
    assert(!n1.getEnergySignal(3))
    n1.entity.energy = MAX_ENERGY
    assert(n1.getEnergySignal(2))
    assert(n1.getEnergySignal(3))

    signal = 0; assert(evalIf(n1.getEnergySignal(signal & 0x3), signal))
    signal = 3; assert(evalIf(n1.getEnergySignal(signal & 0x3), signal))
    signal = 4; assert(!evalIf(n1.getEnergySignal(signal & 0x3), signal))
    signal = 7; assert(!evalIf(n1.getEnergySignal(signal & 0x3), signal))

    assert(n1.getAgeSignal(0))
    assert(n1.getAgeSignal(3))
    signal = 0; assert(evalIf(n1.getAgeSignal(signal & 0x3), signal))
    signal = 4; assert(!evalIf(n1.getAgeSignal(signal & 0x3), signal))

    n1.life = START_LIFE / 4
    assert(n1.getAgeSignal(0))
    assert(!n1.getAgeSignal(1))
    assert(!n1.getAgeSignal(2))
    assert(!n1.getAgeSignal(3))

    signal = 0; assert(evalIf(n1.getAgeSignal(signal & 0x3), signal))
    signal = 4; assert(!evalIf(n1.getAgeSignal(signal & 0x3), signal))
    signal = 1; assert(!evalIf(n1.getAgeSignal(signal & 0x3), signal))
    signal = 5; assert(evalIf(n1.getAgeSignal(signal & 0x3), signal))

    assert(n1.getLevelSignal(0))
    assert(!n1.getLevelSignal(1))

    assert(n1.entity.parts === 1)
    n1.destroy()
    assert(n1.entity.parts === 0)
    assert(n1.entity.nucleus === 0)
})()

// used by BUILD command, to evaluate if it can be build, and what the result is
const NucleusBuilder = {
    name: "N",
    cost: NEW_PART_COST,
    canBuild: function(selected, coord) { return ALLOW_MULTI_NUCLEI && (selected || !getPart(coord)) },
    build: function(coord, entity, nucleus) { return new Nucleus(coord, entity, mutateGenes(nucleus.genes, 0), nucleus) },
}
const GreenBuilder = {
    name: "G",
    cost: NEW_PART_COST,
    canBuild: function(selected, coord) { return selected || !getPart(coord) },
    build: function(coord, entity, nucleus) { return new Green(coord, entity) },
}
const RedBuilder = {
    name: "R",
    cost: NEW_PART_COST * 0.66,
    canBuild: function(selected, coord) {
        if (selected) return false
        var part = getPart(coord)
        return part instanceof Green || part instanceof Nucleus
    },
    build: function(coord, entity, nucleus) { return new Red(coord, entity) },
}
const BlueBuilder = {
    name: "B",
    cost: NEW_PART_COST * 0.33,
    canBuild: function(selected, coord) {
        if (selected) return false
        var part = getPart(coord)
        return part instanceof Red
    },
    build: function(coord, entity, nucleus) { return new Blue(coord, entity) },
}

function getBuilderFor(signal) {
    switch (signal & 0x3) {
        case 0: return NucleusBuilder
        case 1: return GreenBuilder
        case 2: return RedBuilder
        case 3: return BlueBuilder
    }
}

// **** creating and mutating genes ****

function randomSignal() { return rndint(8) }

// mutate the genes a bit, by flipping bits, removing, adding or doubling regions
function mutateGenes(genes, scale) {
    //assert(isArray(genes))

    var mutations = (1.1 + rnd(0.1 + scale) * MUTATION_RATE * genes.length)|0
    if (scale === 0) mutations = max(0, mutations - rndint(25))
    //if (verbose()) console.log("mutate:", scale, "mutations:", mutations, "genelength:", genes.length)
    if (mutations <= 0) return genes

    genes = genes.slice(0)
    for (var i = 0; i < mutations; i++) {
        var at = rndint(genes.length)
        if (genes.length > 20 && rnd() < 0.03) { // remove something
            var remove = rndint(1, 15)
            //console.log("mutating remove:", at, remove)
            genes.splice(at, remove)
            continue
        }
        if (rnd() < 0.02) {
            var insert = rndint(1, 15)
            for (var j = 0; j < insert; j++) {
                //console.log("mutating insert:", at, insert)
                genes.splice(at, 0, randomSignal())
            }
            continue
        }
        if (rnd() < 0.01) {
            genes = genes.concat(genes)
            //console.log("mutating duplicate genes")
            continue
        }

        //console.log("mutating at:", at)
        genes[at] = randomSignal()
    }

    //console.log("done mutating", JSON.stringify(genes))
    return genes
}

function randomGenes() {
    var length = rndint(10, 300)
    var genes = new Array(length)
    for (var i = 0; i < length; i++) {
        genes[i] = randomSignal()
    }
    return genes
}

function randomCoord() {
    var coord = rndint(WORLD.length)
    if (getPart(coord)) return -1
    if (getPart(move(coord, 0))) return -1
    if (getPart(move(coord, 1))) return -1
    if (getPart(move(coord, 2))) return -1
    if (getPart(move(coord, 3))) return -1
    return coord
}

// create a random entity with a random genome, on a random coord
function randomEntity() {
    var coord = randomCoord()
    if (coord < 0) return

    var part = new Nucleus(coord, new Entity(START_ENERGY, 0), randomGenes())
    part.entity.parts = 1
    part.entity.nucleus = 1
    setPart(part)
}

// to place an entity somewhere using js inspector
function addEntity(genes) {
    assert(isArray(genes))
    assert(isNumber(genes[0]))
    assert(genes[0] >= 0 || genes[0] <= 8)

    var coord = -1
    for (var i = 0; i < 100; i++) {
        coord = randomCoord()
        if (coord >= 0) break
    }
    if (coord < 0) {
        console.log("unable to place entity")
        return
    }

    var part = new Nucleus(coord, new Entity(START_ENERGY, 0), genes)
    part.entity.parts = 1
    part.entity.nucleus = 1
    setPart(part)
    console.log("added entity:", worldX(coord), worldY(coord), coord)
}

// some statistics
var _update = 0
var _update_dur = 0
var totalentities = 0
var allentities = 0
var allparts = 0
var maxalive = 0
var maxgeneration = 0
var maxenergy = 0
var maxparts = 0

// only true once every 256 updates
function verbose() { return (_update & 0xFF) === 0 }

// update world ... dt is fixed, not really depending on time
function update(dt) {
    _update += 1
    var start = currentTime()
    var removed = []
    allentities = 0
    allparts = 0

    for (var i = 0, il = WORLD.length; i < il; i++) {
        var part = WORLD[i]
        if (!part) continue
        part.update(dt)
        allparts += 1
        if (part.removed) removed.push(part)
    }

    maxalive = 0
    maxgeneration = 0
    maxenergy = 0
    maxparts = 0
    var entity = null
    for (var i = 0, il = ENTITIES.length; i < il; i++) {
        entity = ENTITIES[i]
        entity.update(dt)
        allentities += 1
        if (maxalive < entity.alive) maxalive = entity.alive
        if (maxgeneration < entity.generation) maxgeneration = entity.generation
        if (maxenergy < entity.energy) maxenergy = entity.energy
        if (maxparts < entity.parts) maxparts = entity.parts
        if (entity.removed) { ENTITIES.splice(i, 1); i -= 1; il -= 1 }
    }

    assert(WORLD.length === SIZE * SIZE) // no negative or fractional associations
    assert(ENTITIES.length <= allparts + 250) // ensure no major leak, but we don't count parts exact, so need a wide fuzz
    if (entity) {
        assert(isNumber(entity.energy))
        assert(isNumber(entity.parts))
        assert(isNumber(entity.nucleus))
    }

    for (var i = 0, il = removed.length; i < il; i++) {
        var coord = removed[i].coord
        var part = WORLD[coord]
        if (part && part.removed) WORLD[coord] = null
    }

    for (var i = 0; i < 10; i++) {
        randomEntity()
    }

    var took = currentTime() - start
    _update_dur = _update_dur * 0.9 + took * 0.1
}

// **** rendering ****

function render(g) {
    g.clearRect(0, 0, g.width, g.height)
    g.beginPath()
    g.strokeStyle = "black"
    g.rect(0, 0, SCALE * SIZE, SCALE * SIZE)
    g.stroke()
    g.strokeStyle = "orange"
    g.lineWidth = 1.0
    for (var x = 0; x < SIZE; x++) {
        for (var y = 0; y < SIZE; y++) {
            var coord = y * SIZE + x
            var part = WORLD[coord]
            if (!part) continue
            g.beginPath()
            g.rect(x * SCALE, y * SCALE, SCALE, SCALE)
            if (part.entity === highlightentity) {
                g.fillStyle = "#FFA"
                if (part instanceof Green) g.fillStyle = "#8F8"
                if (part instanceof Red) g.fillStyle = "#F88"
                if (part instanceof Blue) g.fillStyle = "#88F"
                //if (part instanceof Shell) g.fillStyle = "666"
                if (part === highlightnucleus) g.fillStyle = "black"
                g.fill()
                g.stroke()
            } else {
                g.fillStyle = "#EE8"
                if (part instanceof Green) g.fillStyle = "#4D4"
                if (part instanceof Red) g.fillStyle = "#D44"
                if (part instanceof Blue) g.fillStyle = "#44D"
                //if (part instanceof Shell) g.fillStyle = "333"
                g.fill()
            }
        }
    }
    g.lineWidth = 1.0

    if (highlightentity) {
        renderGeneTrace(g, highlightnucleus)

        g.globalAlpha = 0.8
        g.strokeStyle = "black"
        g.fillStyle = "black"
        if (highlightentity.removed) {
            g.strokeStyle = "grey"
            g.fillStyle = "grey"
        }
        g.beginPath()
        g.arc(mousex, mousey, 10, 0, TAU)
        g.stroke()
        var text = "size="+ highlightentity.parts +" energy="+ highlightentity.energy.toFixed(1) +" gen="+ highlightentity.generation
        var w = g.measureText(text).width
        g.fillText(text, mousex - w/2, mousey + 18)

        if (highlightnucleus && !highlightnucleus.removed) {
            var text = "age="+ highlightnucleus.life +" level="+ highlightnucleus.level
            var w = g.measureText(text).width
            g.fillText(text, mousex - w/2, mousey + 32)
        }
        g.globalAlpha = 1
    }

    g.fillStyle = "black"
    var line = ""
    line += "t="+ _update +" (fps="+ (1/_update_dur).toFixed(1) +") parts="+ allparts +" "
    line += "entities="+ allentities +" (died="+ (totalentities - allentities) +") "
    line += "maxgen="+ maxgeneration +" oldest="+ maxalive +" largest="+ maxparts
    g.fillText(line, 5, SIZE * SCALE + 14)
}

function cmdnames(cmd, signal) {
    switch(cmd) {
        case ROTATE: return "ROTATE:"+ (signal>=4?"!":"") +"+"+ ((signal&0x3) + 1)
        case IF_PART: return (signal>=4?"!":"") +"PART? "+ (signal&0x3)
        case IF_ENERGY: return (signal>=4?"!":"") +"ENERGY? "+ (signal&0x3)
        case IF_AGE: return (signal>=4?"!":"") +"AGE? "+ (signal&0x3)
        case IF_LEVEL: return (signal>=4?"!":"") +"LEVEL? "+ (signal&0x3)
        case BUILD: return "BUILD:"+ getBuilderFor(signal).name
        case SEED: return "SEED:"+ (signal&0x7)
        case BEGIN: return "-"
    }
    return ""
}

// render genome, highlighting the most hottest commands
var showgenes = false
function renderGeneTrace(g, nucleus) {
    if (!nucleus) return

    var genes = nucleus.genes
    var trace = nucleus.trace

    var x = SIZE * SCALE
    var y = 0
    var maxy = SIZE * SCALE
    if (VERTICAL) {
        x = 10
        y = SIZE * SCALE + 30
        maxy = y + SIZE * SCALE
    }
    if (!showgenes) { // first time, make sure we have space to show genes
        showgenes = true
        resize()
    }

    g.strokeStyle = "grey"
    for (var i = 0, il = genes.length; i < il;) {
        var cmd = genes[i]
        var signal = -1
        var t = trace? (trace[i]|0) : 0
        i += 1
        if (cmd < BEGIN) {
            i += 1
            signal = genes[i + 1]
        }

        if (y + 16 > maxy) {
            y = 0
            x += 75
            if (VERTICAL) {
                y = SIZE * SCALE + 30
            }
        }
        g.beginPath()
        g.rect(x, y, 70, 15)
        g.fillStyle = "rgb(255,"+ ((255 - t*0.7)|0) +","+ ((255 - t*0.7)|0) +")"
        g.fill()
        if (cmd === SEED) {
            g.lineWidth = 2
            g.strokeStyle = "blue"
        } else if (cmd === BUILD) {
            g.lineWidth = 2
            g.strokeStyle = "green"
        } else if (cmd >= BEGIN) {
            g.lineWidth = 1
            g.strokeStyle = "#DDD"
        } else {
            g.lineWidth = 1
            g.strokeStyle = "grey"
        }
        g.stroke()
        g.fillStyle = "black"
        g.fillText(cmdnames(cmd, signal), x + 4, y + 12)
        y += 16
    }
    g.lineWidth = 1
    if (trace && !nucleus.removed) for (var i = 0, il = trace.length; i < il; i++) {
        var t = (trace[i]|0)
        trace[i] = (t - 8 - (t >> 3))|0
    }
}

var trace = new Array(500)
var mousex = 0
var mousey = 0
var highlightentity = null
var highlightnucleus = null
window.onmousedown = function(event, x, y) {
    if (event.target !== $canvas) return
    mousex = event.offsetX || x || 0
    mousey = event.offsetY || y || 0

    highlightentity = null
    if (highlightnucleus) highlightnucleus.trace = null
    highlightnucleus = null
    var part = WORLD[coordXY(mousex/SCALE, mousey/SCALE)]
    if (part) {
        highlightentity = part.entity
        var coord = part.coord

        // search around for nucleus
        if (part instanceof Nucleus) highlightnucleus = part
        if (!highlightnucleus) {
            part = getPart(move(coord, 0))
            if (part instanceof Nucleus && part.entity === highlightentity) highlightnucleus = part
        }
        if (!highlightnucleus) {
            part = getPart(move(coord, 2))
            if (part instanceof Nucleus && part.entity === highlightentity) highlightnucleus = part
        }
        if (!highlightnucleus) {
            part = getPart(move(coord, 1))
            if (part instanceof Nucleus && part.entity === highlightentity) highlightnucleus = part
        }
        if (!highlightnucleus) {
            part = getPart(move(coord, 3))
            if (part instanceof Nucleus && part.entity === highlightentity) highlightnucleus = part
        }
    }

    console.log("entity:", highlightentity, "nucleus", highlightnucleus)
    if (highlightnucleus) {
        trace.length = 0
        trace.length = highlightnucleus.genes.length
        highlightnucleus.trace = trace
        console.log("genes:", JSON.stringify(highlightnucleus.genes))
    }
}

// cheat by passing any touch event to onmousedown
window.ontouchstart = function(event) {
    for (var i = 0; i < event.changedTouches.length; i++) {
        var touch = event.changedTouches[i]
        if (touch.target !== $canvas) continue
        window.onmousedown(touch, touch.pageX - $canvas.offsetLeft, touch.pageY - $canvas.offsetTop)
    }
}

// **** setup ****

var $canvas = null
var g = null

function resize() {
    if (!$canvas) return
    var width = g.width = SCALE * SIZE
    var height = g.height = SCALE * SIZE + 30
    if (showgenes) {
        if (!VERTICAL) {
            width += SCALE * SIZE < 400? 5 * 75 : 3 * 75
        } else {
            height += SCALE * SIZE
        }
    }
    $canvas.width = g.width = width
    $canvas.height = g.height = height
}

window.onresize = resize
window.onload = function() {
    var parent = document.getElementById("squaregenes") || document.body
    if (parent.getAttribute("size")) init(Number(parent.getAttribute("size"))|0)
    if (parent.getAttribute("scale")) SCALE = max(1, Number(parent.getAttribute("scale"))|0)
    if (parent.getAttribute("multi")) ALLOW_MULTI_NUCLEI = JSON.parse(parent.getAttribute("multi").toLowerCase())
    if (parent.getAttribute("vertical")) VERTICAL = JSON.parse(parent.getAttribute("vertical").toLowerCase())
    $canvas = document.createElement("canvas")
    g = $canvas.getContext("2d")
    g.font = "14px sans"
    resize()
    parent.appendChild($canvas)
}

// as fast as possible, simulate a step, render 20 times per second
var lastrender = 0
every(0.001, function(){
    update(0.05)

    if (!g) return
    var now = currentTime()
    if (now - lastrender > 0.05) {
        lastrender = now
        render(g)
    }
})

/** /
// funny rectangle like creature, usually results in very square life forms not often seen
addEntity([0,5,5,1,0,6,1,1,1,4,3,7,5,7,4,6,7,1,0,0,4,4,2,7,1,6,2,0,1,1,0,3,1,6,5,7,4,7,5,1,7,6,5,5,7,7,2,3,4,4,7,2,4,3,1,5,7,7,6,0,0,4,1,4,4,4,5,0,0,0,7,3,3,3,6,0,3,3,2,0,5,4,1,1,7,4,5,2,1,2,4,4,5,2,7,3,7,5,3,4,4,3,1,0,6,1,1])
/**/

