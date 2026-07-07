// Time periods (24h clock hours)
export const MORNING_START_HOUR = 5;
export const AFTERNOON_START_HOUR = 12;
export const EVENING_START_HOUR = 17;
export const NIGHT_START_HOUR = 22;

// Access hours classified as "unusual"
export const UNUSUAL_ACCESS_START_HOUR = 23;
export const UNUSUAL_ACCESS_END_HOUR = 5;

// Gap durations (assuming millisecond-based temporal units for default implementation)
export const SAME_DAY_GAP_THRESHOLD = 12 * 60 * 60 * 1000; // 12 hours
export const NEXT_DAY_GAP_THRESHOLD = 36 * 60 * 60 * 1000; // 36 hours

// Resumed conversation continuity boundary
export const CONVERSATION_CONTINUITY_THRESHOLD = 30 * 60 * 1000; // 30 minutes

// Confidence decay constants
export const CONTINUITY_MAX_DECAY_GAP = 2 * 60 * 60 * 1000; // 2 hours for continuity to decay to 0
export const PRESENCE_MAX_IDLE_GAP = 15 * 60 * 1000; // 15 minutes for active presence to decay to 0
