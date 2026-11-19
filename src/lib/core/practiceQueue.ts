// Non-repeating shuffled round-robin queue for custom CFOP practice sets.
// Guarantees every selected case is practised once before any case repeats,
// avoids consecutive repeats across cycle boundaries when set.length > 1,
// and cleanly supports a 1-case set.

export interface PracticeQueueState {
  caseIds: string[];
  bag: string[]; // remaining case IDs in the current round
  roundNumber: number;
  completedInRound: number;
  lastCaseId: string | null;
}

export function shuffleFisherYates<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildNextBag(
  caseIds: string[],
  lastCaseId: string | null,
  rng: () => number
): string[] {
  if (caseIds.length <= 1) return [...caseIds];
  const shuffled = shuffleFisherYates(caseIds, rng);
  // Prevent immediate back-to-back repeat across round boundary
  if (lastCaseId && shuffled[0] === lastCaseId) {
    const swapIdx = shuffled.findIndex((id) => id !== lastCaseId);
    if (swapIdx > 0) {
      [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }
  }
  return shuffled;
}

export function createPracticeQueue(
  caseIds: string[],
  rng: () => number = Math.random
): PracticeQueueState {
  const unique = Array.from(new Set(caseIds));
  return {
    caseIds: unique,
    bag: buildNextBag(unique, null, rng),
    roundNumber: 1,
    completedInRound: 0,
    lastCaseId: null,
  };
}

export function drawNextFromPracticeQueue(
  state: PracticeQueueState,
  rng: () => number = Math.random
): { caseId: string | null; nextState: PracticeQueueState } {
  if (state.caseIds.length === 0) {
    return { caseId: null, nextState: state };
  }

  let bag = [...state.bag];
  let roundNumber = state.roundNumber;
  let completedInRound = state.completedInRound;

  if (bag.length === 0) {
    bag = buildNextBag(state.caseIds, state.lastCaseId, rng);
    roundNumber += 1;
    completedInRound = 0;
  }

  const [caseId, ...rest] = bag;
  return {
    caseId,
    nextState: {
      caseIds: state.caseIds,
      bag: rest,
      roundNumber,
      completedInRound: completedInRound + 1,
      lastCaseId: caseId,
    },
  };
}
