// Alpine Runway — a chase-view flight game over a mountain valley.
// config.js: every tunable number in one place. Units: metres for x/z,
// feet for altitude, knots for speed, degrees for angles.

const FG = {};

// Logical canvas size. The canvas element is resized to the window; the
// renderer scales this logical frame to fit, so screenshots at 1280x720
// match what a player sees.
FG.VIEW_W = 1280;
FG.VIEW_H = 720;
FG.FOV_DEG = 72;
FG.FT_PER_M = 3.28084;
FG.KT_TO_FPS = 1.68781;
FG.KT_TO_MPS = 0.514444; // knots to metres per second, for x/z motion

// --- Flight model -------------------------------------------------------
FG.MIN_SPEED_KT = 55; // below this the wing stops flying
FG.STALL_SPEED_KT = 75; // below this: heavy sink + STALL warning
FG.MAX_SPEED_KT = 260;
FG.THROTTLE_RATE = 0.45; // throttle units per second
FG.PITCH_RATE = 30; // deg per second at full input
FG.PITCH_MIN = -18;
FG.PITCH_MAX = 28;
FG.ROLL_RATE = 75; // deg per second at full input
FG.ROLL_MAX = 62;
FG.ROLL_LEVEL_RATE = 28; // deg per second the wings level themselves
FG.TURN_RATE = 0.28; // heading deg/s per deg of bank, at reference speed
FG.TURN_REF_SPEED_KT = 160;
FG.SPEED_LERP = 0.45; // how fast speed chases the throttle target
FG.STALL_SINK_FPS = 30; // extra sink below stall speed
FG.CEILING_FT = 6000;

// --- Course -------------------------------------------------------------
FG.RING_COUNT = 10;
FG.RING_FIRST_Z = 900; // metres
FG.RING_SPACING_Z = 800;
FG.RING_RADIUS_FT = 95;
FG.RUNWAY_Z0 = 9000; // landing runway, metres along the course
FG.RUNWAY_Z1 = 9600;
FG.RUNWAY_HALF_W = 20; // metres
FG.RUNWAY_ELEV_FT = 80;
FG.COURSE_END_Z = 10100;
FG.START_ALT_FT = 420;
FG.START_SPEED_KT = 150;

// --- Fuel & damage ------------------------------------------------------
FG.FUEL_MAX = 100; // percent
FG.FUEL_START = 100;
FG.FUEL_IDLE_BURN = 0.35; // percent per second at throttle 0
FG.FUEL_THROTTLE_BURN = 0.55; // extra percent per second at full throttle
FG.FUEL_RING_BONUS = 3; // percent refuelled per ring flown through
FG.FUEL_LOW = 25; // warning below this
FG.FUEL_BONUS_PER_POINT = 3; // landing bonus points per fuel percent left
FG.OVERSPEED_KT = 235; // above this the airframe takes damage
FG.DAMAGE_OVERSPEED_RATE = 8; // damage percent per second over the limit
FG.DAMAGE_SCRAPE_RATE = 25; // damage percent per second scraping terrain
FG.SCRAPE_CLEARANCE_FT = 25; // below this clearance, fast flight scrapes
FG.HARD_LANDING_VS_FPS = -12; // faster sink than this at touchdown = hard
FG.HARD_LANDING_DAMAGE = 25;
FG.LANDING_POINTS_HARD = 250;

// --- Camera / feel ------------------------------------------------------
FG.PLANE_SCALE = 1.35; // chase-view aircraft size
FG.FOV_KICK_DEG = 6; // extra field of view at top speed
FG.FOV_KICK_SPEED_KT = 160; // speed where the kick starts
FG.SPEED_LINES_KT = 205; // speed lines show above this
FG.SHAKE_SECONDS = 0.6; // camera shake after touchdown / crash

// --- Wind -----------------------------------------------------------------
FG.WIND_KT = 12; // steady crosswind from the west, blowing toward +x
FG.WIND_GUST_KT = 6; // gust amplitude on top of the steady wind
FG.CLOCK_BONUS_PER_SECOND = 2; // time-trial landing bonus per second left

// --- Scoring ------------------------------------------------------------
FG.RING_POINTS = 100;
FG.CLOSE_POINTS = 25;
FG.LANDING_POINTS = 500;

// --- Look ----------------------------------------------------------------
FG.SKY_TOP = '#1a2350';
FG.SKY_MID = '#4a4a86';
FG.SKY_HORIZON = '#ff9a5c';
FG.SKY_HAZE = '#ffb37a';
FG.SUN_COLOR = '#ffd9a0';
FG.GRASS_DARK = '#2e5d33';
FG.GRASS_LIGHT = '#4a7d3a';
FG.FIELD_A = '#5d8a3c';
FG.FIELD_B = '#7a9a44';
FG.FIELD_WHEAT = '#a8944f';
FG.FIELD_PLOWED = '#6e5138';
FG.FIELD_MEADOW = '#4f7d46';
FG.ROAD_COLOR = '#6b5a44';
FG.ROCK = '#6b6f78';
FG.SNOW = '#e8ecf2';
FG.RUNWAY_ASPHALT = '#2b2e35';
FG.RING_NEXT = '#ffb02e';
FG.RING_OTHER = '#7fd4ff';
FG.HUD_CYAN = '#8ff5ff';
FG.HUD_AMBER = '#ffc357';
FG.HUD_RED = '#ff5a5a';
FG.HUD_GREEN = '#7dffa8';
