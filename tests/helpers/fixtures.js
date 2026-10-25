export function validPayload(overrides = {}) {
  return {
    submissionId: '3f2b8c1e-6a4d-4f1b-9c2e-7d5a1b0e9f42',
    dateOfTest: '2026-10-25',
    platform: 'Claude Cowork',
    modelUsed: 'Claude Opus 5.5',
    reasoningEffort: 'High',
    prompt: 'Review last week of Facebook Ads performance and pause the worst ad set.',
    expectedResult: 'Identifies ad set B as underperforming by CPA and pauses it.',
    taskSuccess: 'Pass',
    whichIsBetter: 'Claude',
    latencySeconds: 42.5,
    degradationReason: 'N/A',
    failureTags: ['N/A'],
    likertScore: 5,
    stateChangeValidated: 'Yes',
    actualResult: 'Paused ad set B after comparing CPA across 4 ad sets.',
    additionalNotes: 'Clean run.',
    taskCode: 'FBADS001',
    origin: 'http://localhost:5173',
    ...overrides,
  }
}
