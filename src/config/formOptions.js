// Dropdown and choice options for the evaluation form.
// Edit these lists to change what evaluators can pick. The Apps Script backend
// only checks that configurable values are non-empty text, so changes here do
// not require a backend redeploy.

export const PLATFORMS = ['ChatGPT Work', 'Claude Cowork', 'Codex', 'Claude Code', 'Other']

export const MODELS = [
  'Claude Opus 5.5',
  'Claude Sonnet 5.5',
  'Claude Haiku 5.5',
  'Claude Fable 5.1',
  'GPT-5',
  'Other',
]

export const REASONING_EFFORTS = ['Low', 'Medium', 'High', 'Extra High', 'N/A']

export const DEGRADATION_REASONS = [
  'Misinterpreted the prompt',
  'Incorrect data retrieved',
  'Incorrect analysis or calculation',
  'Wrong tool or connector used',
  'Incomplete execution',
  'Connector or authentication error',
  'Excessive latency',
  'Required unnecessary user intervention',
  'Other',
  'N/A',
]

export const FAILURE_TAGS = [
  'Wrong entity identified',
  'Incorrect metric or calculation',
  'Hallucinated data',
  'Action not executed',
  'Action executed on wrong entity',
  'Tool call error',
  'Ignored instruction',
  'Unnecessary clarification request',
  'Timeout',
  'Other',
  'N/A',
]

// The values below are also validated by the backend (apps-script/Code.gs).
// Keep both in sync if you change them.
export const TASK_SUCCESS = ['Pass', 'Partial', 'Fail']

export const WHICH_IS_BETTER = ['ChatGPT', 'Claude', 'N/A']

export const STATE_CHANGE_VALIDATED = ['Yes', 'No', 'N/A']

export const LIKERT_SCALE = [
  { value: 1, label: 'Very poor' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'Acceptable' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
]

export const NOT_APPLICABLE = 'N/A'

// Google Sheets cells hold at most 50,000 characters.
export const MAX_TEXT_LENGTH = 50000
