// The Coach is a derived, stateless ally: rendering and projectile collision
// resolve the same authored checkpoint without making the Coach block or move.

function coachEntityFor(state) {
  if (!state || !state.level || !state.progress || !state.player) return null;
  let markerId = "coach-entrance";
  let sprite = "coach-idle";
  if (state.progress.bossDefeated) {
    markerId = "coach-results";
    sprite = "coach-victory";
  } else if (state.progress.bossActive || state.progress.slips >= state.level.objectives.requiredSlipCount) {
    markerId = "coach-vault";
    sprite = "coach-point";
  } else if (state.progress.completedWings.length) {
    markerId = `coach-wing-${state.progress.completedWings[state.progress.completedWings.length - 1]}`;
    sprite = "coach-point";
  } else if (state.player.spaceId !== "club-entrance") {
    markerId = "coach-hub";
  }
  const marker = state.level.markers.find((entry) => entry.id === markerId)
    || state.level.markers.find((entry) => entry.type === "coach")
    || state.level.markers.find((entry) => entry.type === "coachCheckpoint");
  if (!marker) return null;
  return {
    id: "border-collie-coach",
    kind: "coach",
    sprite,
    position: { ...marker.position },
    spaceId: marker.spaceId,
    radius: marker.radius || 0.45,
    height: 1.8,
    active: true,
    alive: true,
    blocking: false,
  };
}

export { coachEntityFor };
