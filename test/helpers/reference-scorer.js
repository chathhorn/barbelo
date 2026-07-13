// Independent duplicate-bridge scorer (Law 77), written from the scoring
// table rather than from the app's implementation, so the sweep test
// cross-checks two separate derivations of the same rules.

function trickValue(strain) {
  if (strain === "C" || strain === "D") return 20;
  return 30;
}

function contractPoints(level, strain, doubling) {
  let points;
  if (strain === "N") points = 40 + (level - 1) * 30;
  else points = level * trickValue(strain);
  if (doubling === "X") points *= 2;
  if (doubling === "XX") points *= 4;
  return points;
}

function overtrickPoints(strain, doubling, vulnerable, overtricks) {
  if (!overtricks) return 0;
  if (doubling === "X") return overtricks * (vulnerable ? 200 : 100);
  if (doubling === "XX") return overtricks * (vulnerable ? 400 : 200);
  return overtricks * (strain === "C" || strain === "D" ? 20 : 30);
}

function undertrickPoints(doubling, vulnerable, undertricks) {
  if (!doubling) return undertricks * (vulnerable ? 100 : 50);
  let total = 0;
  for (let trick = 1; trick <= undertricks; trick += 1) {
    let penalty;
    if (vulnerable) penalty = trick === 1 ? 200 : 300;
    else penalty = trick === 1 ? 100 : trick <= 3 ? 200 : 300;
    total += penalty;
  }
  return doubling === "XX" ? total * 2 : total;
}

// Returns the declarer-perspective score for a contract taken to `tricks`
// total tricks (0-13).
function referenceScore(level, strain, doubling, vulnerable, tricks) {
  const target = level + 6;
  if (tricks < target) {
    return -undertrickPoints(doubling, vulnerable, target - tricks);
  }
  const base = contractPoints(level, strain, doubling);
  const gameOrPart = base >= 100 ? (vulnerable ? 500 : 300) : 50;
  const slam = level === 6 ? (vulnerable ? 750 : 500) : level === 7 ? (vulnerable ? 1500 : 1000) : 0;
  const insult = doubling === "X" ? 50 : doubling === "XX" ? 100 : 0;
  return base + gameOrPart + slam + insult + overtrickPoints(strain, doubling, vulnerable, tricks - target);
}

export { referenceScore };
