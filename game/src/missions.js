// missions.js: the three missions the title screen offers. One job: what
// each mission is, so world.js can build its course and the HUD can name
// its objective. Ring Run is the original game; Time Trial races a clock
// the rings top up; Fuel Run is the same valley on a tight tank with the
// rings further apart and worth less fuel.

FG.MISSIONS = [
  {
    id: 'ring-run',
    num: 1,
    name: 'RING RUN',
    tagline: '10 rings, land the strip — full tank',
    fuelStart: 100,
    fuelRingBonus: 3,
    ringCount: 10,
    ringFirstZ: 900,
    ringSpacing: 800,
    weave: 200,
    clockStart: null,
    clockPerRing: 0,
  },
  {
    id: 'time-trial',
    num: 2,
    name: 'TIME TRIAL',
    tagline: 'Beat the clock — every ring buys +12 s',
    fuelStart: 100,
    fuelRingBonus: 3,
    ringCount: 10,
    ringFirstZ: 900,
    ringSpacing: 800,
    weave: 200,
    clockStart: 90,
    clockPerRing: 12,
  },
  {
    id: 'fuel-run',
    num: 3,
    name: 'FUEL RUN',
    tagline: '70% fuel, rings +2% only, wider weave',
    fuelStart: 70,
    fuelRingBonus: 2,
    ringCount: 10,
    ringFirstZ: 900,
    ringSpacing: 800,
    weave: 260,
    clockStart: null,
    clockPerRing: 0,
  },
];

FG.missionById = function missionById(id) {
  for (let i = 0; i < FG.MISSIONS.length; i += 1) {
    if (FG.MISSIONS[i].id === id) return FG.MISSIONS[i];
  }
  return FG.MISSIONS[0];
};
