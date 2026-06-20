import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req) {
  try {
    const data = await req.formData()
    const date = data.get('date')
    const city = data.get('city')
    const society = data.get('society')
    const promoter1 = data.get('promoter1')
    const promoter2 = data.get('promoter2') || ''
    const promoter3 = data.get('promoter3') || ''
    const photo = data.get('photo')

    if (!photo) return NextResponse.json({ error: 'No photo uploaded' }, { status: 400 })

    const bytes = await photo.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = photo.type || 'image/jpeg'

    console.log(`Photo size: ${Math.round(bytes.byteLength / 1024)}KB, type: ${mimeType}`)

    // Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })

    const prompt = `You are a BTL (Below The Line) setup quality checker for InstaHelp by Urban Company.

Analyse this setup photo carefully and check the following:

1. REQUIRED ELEMENTS — for each, determine if it is PRESENT or MISSING (do not confuse missing with damaged):
   - Multi-use standee (large reusable branded standee)
   - Single-use standee (smaller standee or flex board)
   - Promo table (table with branded cover/cloth)
   - Goodie bag (gift bags visible at the stall)
   - Gazebo/canopy (required ONLY for outdoor setups; skip for indoor)

2. QUALITY ISSUES — only flag issues for elements that ARE present:
   - Gazebo/canopy: is the fabric wrinkled, dirty, or torn?
   - Promo table cloth: is it wrinkled, dirty, misaligned, or torn?
   - Standees: are they tilted, damaged, or dirty?
   - Overall: are elements properly positioned and upright?
   - IMPORTANT: table height adjustment or folded table legs is NOT a quality issue.

3. FOOD TABLE BANNER — ONLY check this if a food/snacks/refreshments table is ACTUALLY visible in the photo. If no food table is present, skip this check entirely. If a food table IS present, check if it has an InstaHelp banner on the FRONT FACE. Missing banner on a food table = violation.

4. LOGO VERSION:
   - OLD logo: "UC InstaHelp By Urban Company" with a white square UC icon
   - NEW logo: "Instahelp By Urban Company" with italic "Insta" + bold "help", yellow/lime-green accent, NO UC square
   - Check which version(s) are visible on any element.

CRITICAL RULES:
- If an element is not visible/present, report it as "X is missing" — never say it is "damaged" if it simply is not there.
- Only report food table banner issues if a food table is actually present in the photo.
- Be specific and accurate — do not hallucinate elements that are not visible.

Respond ONLY with valid JSON in this exact format:
{
  "approved": true or false,
  "issues": ["list each issue clearly, empty array if none"],
  "logo_version": "old" or "new" or "both" or "unclear",
  "notes": "one short sentence of additional observations, or empty string"
}

A setup is APPROVED only if: all required elements are present, no quality issues, food table (if present) has banner on front face. Logo version does not affect approval — just note it.`

    const geminiBody = JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }],
      generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                approved: { type: 'boolean' },
                issues: { type: 'array', items: { type: 'string' } },
                logo_version: { type: 'string', enum: ['old', 'new', 'both', 'unclear'] },
                notes: { type: 'string' }
              },
              required: ['approved', 'issues', 'logo_version', 'notes']
            }
          }
    })

    let geminiRes, lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
      )
      if (geminiRes.ok || geminiRes.status !== 503) break
      lastErr = geminiRes.status
      console.log(`Gemini 503 on attempt ${attempt}, retrying...`)
      await new Promise(r => setTimeout(r, attempt * 1500))
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error(`Gemini error ${geminiRes.status}: ${errText.slice(0, 200)}`)
      return NextResponse.json({ error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 100)}` }, { status: 500 })
    }

    const geminiJson = await geminiRes.json()
    const parts = geminiJson?.candidates?.[0]?.content?.parts || []
    const rawText = parts.map(p => p.text || '').join('').trim()
    console.log('rawText len:', rawText.length, 'start:', JSON.stringify(rawText.slice(0, 120)), 'end:', JSON.stringify(rawText.slice(-80)))

    let analysis, parseErr = ''
    // Try 1: direct parse
    try { analysis = JSON.parse(rawText) } catch (e) { parseErr += 'direct:' + e.message + '; ' }
    // Try 2: strip markdown fences
    if (!analysis) {
      try {
        const clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        analysis = JSON.parse(clean)
      } catch (e) { parseErr += 'fence-strip:' + e.message + '; ' }
    }
    // Try 3: regex extract last {...} block (greedy)
    if (!analysis) {
      const m = rawText.match(/\{[\s\S]*\}/)
      if (m) {
        console.log('regex match len:', m[0].length, 'end:', JSON.stringify(m[0].slice(-80)))
        try { analysis = JSON.parse(m[0]) } catch (e) { parseErr += 'regex:' + e.message + '; ' }
      } else { parseErr += 'no-json-block; ' }
    }
    if (!analysis) throw new Error('Parse failed (' + parseErr + ') raw: ' + rawText.slice(0, 300))

    // Upload photo to Cloudinary using FormData
    let photoUrl = ''
    try {
      const cloudForm = new FormData()
      const photoBlob = new Blob([Buffer.from(base64, 'base64')], { type: mimeType })
      cloudForm.append('file', photoBlob, 'photo.jpg')
      cloudForm.append('upload_preset', 'btl_setups')
      const cloudRes = await fetch('https://api.cloudinary.com/v1_1/dph2tzsck/image/upload', {
        method: 'POST',
        body: cloudForm
      })
      const cloudJson = await cloudRes.json()
      photoUrl = cloudJson.secure_url || ''
      if (photoUrl) {
        console.log('Cloudinary upload OK:', photoUrl)
      } else {
        console.error('Cloudinary upload failed:', JSON.stringify(cloudJson).slice(0, 300))
      }
    } catch (err) {
      console.error('Cloudinary upload error:', err.message)
    }

    // Log to Google Sheets via Apps Script
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL
    if (scriptUrl) {
      try {
        const promoters = [promoter1, promoter2, promoter3].filter(Boolean).join(', ')
        await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date, city, society, promoters,
            approved: analysis.approved,
            issues: analysis.issues,
            logo_version: analysis.logo_version,
            notes: analysis.notes,
            photo_url: photoUrl
          })
        })
        console.log('Logged to Sheets')
      } catch (err) {
        console.error('Sheets logging failed:', err.message)
      }
    }

    return NextResponse.json(analysis)
  } catch (err) {
    console.error('Route error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
