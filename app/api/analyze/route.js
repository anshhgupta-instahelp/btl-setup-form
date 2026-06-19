import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

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

    // Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })

    const prompt = `You are a BTL (Below The Line) setup quality checker for InstaHelp by Urban Company.

Analyse this setup photo and check for the following:

1. REQUIRED ELEMENTS (mark each as present/missing):
   - Multi-use standee (large branded standee, reusable)
   - Single-use standee (smaller standee or flex board)
   - Promo table (table with branded cover/cloth)
   - Goodie bag (gift bags visible at the stall)
   - Gazebo/canopy (required ONLY if this is an outdoor setup)

2. QUALITY ISSUES: Check if elements are clean, upright, properly positioned, not damaged/torn.

3. FOOD TABLE BANNER: If there is a table with food/snacks/refreshments, check if it has an InstaHelp banner on the FRONT FACE of the table. If there's a food table without a banner on the front face, that is a violation.

4. LOGO VERSION:
   - OLD logo: "UC InstaHelp By Urban Company" with a white square UC icon
   - NEW logo: "Instahelp By Urban Company" with italic "Insta" + bold "help", yellow/lime-green accent, NO UC square
   - Check which version(s) are visible.

Respond ONLY with valid JSON in this exact format:
{
  "approved": true or false,
  "issues": ["list each issue clearly, empty array if none"],
  "logo_version": "old" or "new" or "both" or "unclear",
  "notes": "one short sentence of additional observations, or empty string"
}

A setup is APPROVED only if: all required elements are present, no quality issues, food table (if any) has banner on front face. Logo version does not affect approval — just note it.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
        })
      }
    )

    const geminiJson = await geminiRes.json()
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse Gemini response')

    const analysis = JSON.parse(jsonMatch[0])

    // Send to Slack
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (webhookUrl) {
      const promoters = [promoter1, promoter2, promoter3].filter(Boolean).join(', ')
      const statusEmoji = analysis.approved ? '✅' : '❌'
      const logoLabel = { old: '🔴 Old logo', new: '🟢 New logo', both: '⚠️ Both logos', unclear: '❓ Logo unclear' }[analysis.logo_version] || ''
      
      const slackBody = {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `${statusEmoji} BTL Setup — ${analysis.approved ? 'APPROVED' : 'NOT APPROVED'}` }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Date:*\n${date}` },
              { type: 'mrkdwn', text: `*City:*\n${city}` },
              { type: 'mrkdwn', text: `*Society:*\n${society}` },
              { type: 'mrkdwn', text: `*Promoter(s):*\n${promoters}` },
              { type: 'mrkdwn', text: `*Logo:*\n${logoLabel}` },
            ]
          },
          analysis.issues.length > 0 ? {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Issues:*\n${analysis.issues.map(i => `• ${i}`).join('\n')}` }
          } : null,
          analysis.notes ? {
            type: 'section',
            text: { type: 'mrkdwn', text: `_${analysis.notes}_` }
          } : null,
        ].filter(Boolean)
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackBody)
      })
    }

    return NextResponse.json(analysis)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
