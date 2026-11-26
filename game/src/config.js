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

// --- Scoring ------------------------------------------------------------
FG.RING_POINTS = 100;
FG.CLOSE_POINTS = 25;
FG.LANDING_POINTS = 500;

// --- Look ----------------------------------------------------------------
FG.SKY_TOP = '#16233f';
FG.SKY_MID = '#3d5a7d';
FG.SKY_HORIZON = '#e8825a';
FG.SUN_COLOR = '#ffd9a0';
FG.GRASS_DARK = '#2e5d33';
FG.GRASS_LIGHT = '#4a7d3a';
FG.FIELD_A = '#5d8a3c';
FG.FIELD_B = '#7a9a44';
FG.ROCK = '#6b6f78';
FG.SNOW = '#e8ecf2';
FG.RUNWAY_ASPHALT = '#2b2e35';
FG.RING_NEXT = '#ffb02e';
FG.RING_OTHER = '#7fd4ff';
FG.HUD_CYAN = '#8ff5ff';
FG.HUD_AMBER = '#ffc357';
FG.HUD_RED = '#ff5a5a';
FG.HUD_GREEN = '#7dffa8';
