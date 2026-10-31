// Text for the slides evaluation task. The instructions are the same for every
// slides task; the user request, input files and presentations come from the
// "Slides Tasks" tab of the Google Sheet. The keys must match SLIDES_AXES in
// apps-script/Code.gs.

export const SLIDES_INSTRUCTIONS =
  'Compare the generated presentation response sets against the user request below. Inspect all rendered pages or slides shown in each response column before rating. Rate each response independently, then use the Overall section to rank the responses. Treat filenames and response labels as neutral.'

// Shown when a slides task has no Title in the sheet.
export const SLIDES_DEFAULT_TITLE = 'Slides Evaluation'

export const SLIDES_AXES = [
  {
    key: 'contentQuality',
    label:
      'Content quality: how complete, accurate, and useful the content is, including whether it covers the key concepts from the source material without misleading omissions, inaccuracies, or irrelevant additions',
    explainLabel: 'Explain the content quality rating',
    placeholder: 'Briefly explain the content quality score',
  },
  {
    key: 'storytelling',
    label:
      'Storytelling: how well the deck flows as a cohesive narrative, with clear transitions, logical or emotional buildup, and a structure that feels engaging rather than like a list of disconnected facts',
    explainLabel: 'Explain the storytelling rating',
    placeholder: 'Briefly explain the storytelling score',
  },
  {
    key: 'writingStyle',
    label:
      'Writing style: how clear, concise, specific, and natural the language is. Penalize generic, inflated, repetitive, buzzword-heavy, or formulaic language that sounds polished but communicates little',
    explainLabel: 'Explain the writing style rating',
    placeholder: 'Briefly explain the writing style score',
  },
  {
    key: 'aesthetics',
    label:
      'Aesthetics: how polished and visually appealing the deck feels overall, including typography, color use, visual consistency, visual variety, and the quality of charts, diagrams, images, and other visual elements',
    explainLabel: 'Explain the aesthetics rating',
    placeholder: 'Briefly explain the aesthetics score',
  },
  {
    key: 'layout',
    label:
      'Layout: how text, visuals, headers, charts, and other elements are arranged within each slide and across the deck, including spacing, alignment, grouping, hierarchy, and avoidance of clutter or overlap',
    explainLabel: 'Explain the layout rating',
    placeholder: 'Briefly explain the layout score',
  },
]

export const OVERALL_INTRO = 'Now, using all the above elements as guidance, please give the artifact an overall rating.'

export const OVERALL_AXIS = {
  key: 'overall',
  label: 'Overall',
  explainLabel: 'Explain the overall rating',
  placeholder: 'Briefly explain the overall score',
}

export const RATING_SCALE = [1, 2, 3, 4, 5, 6, 7]

export const RANKING_REASON_LABEL = 'What drove the ranking? Note ties or close calls.'
