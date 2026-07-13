// Application state: the single mutable STATE object plus the pure
// view-availability rules over it.

function defaultFilters() {
  return {
    search: "",
    side: "all",
    className: "all",
    vulnerability: "all",
    played: "all"
  };
}

const STATE = {
  parsed: null,
  analysis: null,
  rawResults: null,
  results: null,
  reportPair: "",
  activeView: "overview",
  selectedBoardNo: "",
  scoreOutliersOnly: false,
  rowMode: "boards",
  selectedColumns: new Set(),
  filters: defaultFilters()
};

function availableTaskViews(analysis, results) {
  return {
    overview: Boolean(analysis),
    improve: Boolean(results && results.pairStandings.length),
    boards: Boolean(analysis),
    results: Boolean(results),
    export: Boolean(analysis || results),
    diagnostics: Boolean(analysis || results)
  };
}

function ensureActiveView(analysis, results) {
  const available = availableTaskViews(analysis, results);
  if (available[STATE.activeView]) return;
  if (available.improve) STATE.activeView = "improve";
  else if (available.overview) STATE.activeView = "overview";
  else if (available.results) STATE.activeView = "results";
  else if (available.export) STATE.activeView = "export";
  else STATE.activeView = "overview";
}

export {
  STATE,
  defaultFilters,
  availableTaskViews,
  ensureActiveView,
};
