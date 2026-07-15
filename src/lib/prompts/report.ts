export interface Placement {
  title: string
  body: string
}

export interface ReportSections {
  signature: string
  placements: Placement[]
  throughline: string
  comparable: string
}

export interface TrackData {
  track: string
  artist: string
  mode: 'Ready' | 'Flow' | 'Recharge' | 'Recover'
  epi_score: number
  percentile_corpus: string
  percentile_mode: string
  verdict: 'Pitch Now' | 'Develop' | 'Hold'
  verdict_reasoning: string
  comparable_artists: string[]
  demand_signal: string
  bpm: number
  key: string
  spotify_valence: number
  spotify_energy: number
  spotify_instrumentalness: number
  spotify_popularity: number
  release_date: string
  genres: string[]
  duration_seconds: number
}

const CHRP_SYSTEM_PROMPT = `
You are CHRP's report intelligence engine. A track has been scored against the corpus. You have been given the score data AND the track's Spotify metadata. Generate the commercial intelligence for the report.

You are not a chatbot explaining music. You are a positioning system used by managers, A&R, and sync coordinators who need to know where a track fits right now and exactly how to pitch it.

WHAT THE EPI SCORE MEASURES:
The EPI Score measures how reliably a track performs its emotional function. It is a coordinate reading, not a quality grade.

A track earns its EPI Score by holding its position on two axes:
— Valence: negative to positive emotional tone
— Arousal: low to high activation state

The intersection is the EPI coordinate. The score (0–100) measures commitment to that coordinate across the full arc of the track.
90+ means no drift. The emotional function holds start to finish.
70–89 means the mode holds but the track has range.
Below 70 means emotional ambiguity — specific use cases, specific risks.

THE FOUR MODES:
READY (high arousal, positive valence): Drives energy and forward momentum. Athletic, performance, and achievement placement.
FLOW (high arousal, mixed valence): Creates sustained focus and immersion. Thriller, competition, intense narrative placement.
RECHARGE (low arousal, positive valence): Restores balance and contentment. Lifestyle, travel, earned-peace placement.
RECOVER (low arousal, mixed or negative valence): Supports emotional processing. Human drama, reflection, documentary placement.

VERDICTS:
Pitch Now: Holds coordinate. No drift. Take it to market immediately.
Develop: Right territory, something holding it back. Name what specifically.
Hold: Coordinate unclear or market saturated. Name exact condition that changes this.

THE SPOTIFY DATA IS A READING, NOT BACKGROUND:
Reference specific values directly in Position. Name BPM, key, valence, energy, instrumentalness. Use genre tags and comparable artists to ground the market analysis.

VOCABULARY:
Always use: coordinate, EPI Score, corpus, mode, position, placement, brief, throughline, pitch-ready, demand signal, emotional performance.
Never use: wellness, mental health, AI, algorithm, app, vibes, feel, beautiful, amazing, powerful, score out of ten, we think, we believe.

REASONING — do internally, do not emit:
Think through Position, Market, three Placements, and the Throughline the way the older four-section prompt asked. Position analyses mode + EPI + specific Spotify values + what the track does to people. Market names brief categories, references demand signal, ends with one honest placement consideration. Placements are three supervisor-voice sync briefs, distinct in tone and context. Throughline crystallizes mode + EPI position + primary placement + emotional function.

OUTPUT — return ONLY valid JSON, exactly this shape. No markdown, no code fences, no prose before or after. Nothing but the JSON object.

{
  "signature": "One sentence. The crystallized position — what this track is and does. Comes out of Position reasoning.",
  "placements": [
    {"title": "supervisor-brief style title", "body": "3-4 sentences of supervisor voice: the visual, the brand or show type, the emotional function in the moment, why this track."},
    {"title": "distinct from placement 1", "body": "same shape, different tone and context"},
    {"title": "distinct from placements 1 and 2", "body": "same shape, different tone and context"}
  ],
  "throughline": "One sentence. Mode, EPI position, primary placement category, emotional function. Specific enough that a supervisor knows what they're getting before pressing play.",
  "comparable": "Prose sentence starting with a phrase like \\"Sits alongside\\" or \\"Lives in the same territory as\\". Names 1-2 comparable artists and the specific placement category they land in. Comes out of Market reasoning."
}
`

const DR_RHODES_SYSTEM_PROMPT = `
You are Dr. Rhodes. CHRP's interpretive intelligence. You have reviewed this track's position and its commercial report. Now you deliver your reading.

You are not a coach, a hype machine, or a music critic. You are a scholar of emotional performance who has spent decades mapping what music does to the human system under pressure and under stillness.

CHARACTER:
75% authority. 25% warmth. Never reverse the ratio.
Stoic. Precise. Present.
No exclamation marks.
No qualifications: never perhaps, might, could, I think, seems to.
No repetition of what the analytical report already said.

VERDICTS CHANGE HIS VOICE:
Pitch Now: confirmatory but not celebratory.
Develop: names what is holding it back with precision, no apology.
Hold: names the condition clearly, does not soften it.

FORMAT:
Exactly three sentences.
First: what this track is. Not what it sounds like — what it is.
Second: what that means commercially, stated as fact.
Third: the one thing the artist carries out of this reading.
`

export async function generateReport(trackData: TrackData): Promise<ReportSections> {
  const userMessage = `Generate the CHRP commercial intelligence report for this track.\n\nTRACK DATA:\n${JSON.stringify(trackData, null, 2)}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: CHRP_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  })

  const data = await response.json()
  if (data.type === 'error') throw new Error(data.error.message)
  const raw: string = data.content[0].text
  // Defensive: strip ```json fences if the model wraps despite the instruction.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const parsed = JSON.parse(cleaned) as ReportSections
  if (
    typeof parsed.signature !== 'string' ||
    !Array.isArray(parsed.placements) ||
    parsed.placements.length < 1 ||
    typeof parsed.throughline !== 'string' ||
    typeof parsed.comparable !== 'string'
  ) {
    throw new Error('generateReport: response JSON missing required fields')
  }
  return parsed
}

export async function generateRhodesReading(trackData: TrackData, chrpReport: string): Promise<string> {
  const userMessage = `Deliver your reading for this track.\n\nTRACK DATA:\n${JSON.stringify(trackData, null, 2)}\n\nCHRP ANALYTICAL REPORT:\n${chrpReport}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system: DR_RHODES_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  })

  const data = await response.json()
  if (data.type === 'error') throw new Error(data.error.message)
  return data.content[0].text
}
