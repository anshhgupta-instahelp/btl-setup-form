import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req) {
  try {
    const data = await req.formData()
    const date = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })
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

1. REQUIRED ELEMENTS — look carefully for each. Mark PRESENT if visible anywhere in the photo, MISSING only if truly absent:
   - Multi-use standee: a tall reusable standee with a GRID of multiple service images (6 panels showing services like Househelp Backup, Deep Dusting, Bathroom Cleaning, etc.). Usually on the LEFT side of the setup.
   - Single-use standee: a flex print banner featuring a SINGLE woman/person image with "Starts at ₹99" or similar offer text. Usually on the RIGHT side of the setup.
   - Promo table: a cube/barrel/drum shaped display unit with InstaHelp branding printed directly on it (blue, says "Get House Help in 10 mins"). It is NOT a regular table — it is a self-standing branded cube/barrel unit. NO external cloth required. Look carefully in the center of the setup.
   - Goodie bag: branded bags, gift bags, or packets placed at/on the stall for distribution — look carefully on and around the promo table.
   - Gazebo/canopy: a purple/blue tent/canopy overhead structure. REQUIRED if the setup is outdoors. To determine outdoor vs indoor: if you can see open sky, road, vehicles, trees, or the setup is on a footpath/ground outside a building = OUTDOOR = gazebo required. If setup is inside a building/lobby/hall = INDOOR = gazebo not required. Flag as missing if outdoor and no gazebo/canopy is visible overhead.

2. QUALITY ISSUES — only flag issues for elements that ARE present. Be conservative — only flag clear, obvious issues:
   - Gazebo/canopy fabric: clearly wrinkled, dirty, or torn?
   - Standees: visibly tilted at a significant angle, damaged, or dirty?
   - IMPORTANT: the promo table does NOT need a cloth — never flag missing cloth as an issue. Only flag if something is clearly wrong.

3. FOOD TABLE BANNER — Look carefully for any table with food/snacks/refreshments/drinks or a person serving food. A food table often has a non-branded cloth (orange, red, white etc.) on it. If such a table is present:
   - Check if the FRONT FACE of the table has an InstaHelp banner. The banner must be on the front-facing side visible to visitors.
   - If the front face shows a plain colored cloth (orange, red, etc.) with NO InstaHelp branding = VIOLATION. Flag it as "Food table front face does not have InstaHelp banner".
   - A banner placed on top or behind the table does NOT count — it must be on the front face.
   - If no food table is present, skip this check entirely.

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
