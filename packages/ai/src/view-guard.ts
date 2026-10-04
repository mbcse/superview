/** Deterministic refuse for empty, punctuation-only, or keyboard-smash views. */
export function shouldRefuseView(sentence: string) {
  const trimmed = sentence.trim();
  if (!trimmed) return true;
  if (!/[A-Za-z]{3,}/.test(trimmed)) return true;
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  const vowels = (letters.match(/[aeiouy]/gi) ?? []).length;
  const vowelRatio = vowels / Math.max(1, letters.length);
  const unique = new Set(tokens);
  return unique.size <= 2 && tokens.length >= 2 && vowelRatio < 0.28;
}

export function refusedSpec(view: string, reason = "not a readable view") {
  return {
    normalizedView: view.slice(0, 80),
    interpretation: "",
    mechanism: "",
    horizon: "1y",
    confidenceInInterpretation: 0,
    assumptions: [],
    falsifiers: [],
    clarifyingQuestions: [],
    angles: [],
    refuse: true,
    refuseReason: reason
  };
}
