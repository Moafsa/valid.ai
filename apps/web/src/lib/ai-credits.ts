/**
 * AI credits: what an account spends is measured by the real size of each request, not by "one use" for everything. Changing a
 * button color costs about 1 credit; rewriting a whole page costs several. It does not depend on which provider answered, so the
 * same plan limits keep working when the platform moves from a free model to a paid one.
 */
export const CREDIT_TOKENS = 5000

/** Answers cost more than questions to produce, so they weigh three times as much. */
export function creditsFor(inputTokens: number, outputTokens: number): number {
  return Math.max(1, Math.ceil((Math.max(0, inputTokens) + 3 * Math.max(0, outputTokens)) / CREDIT_TOKENS))
}

/** Before the call: roughly how many credits a request of this many characters will take (a typical answer is about 1,500 tokens). */
export function estimateCredits(inputChars: number): number {
  return creditsFor(Math.ceil(inputChars / 3.5), 1500)
}
