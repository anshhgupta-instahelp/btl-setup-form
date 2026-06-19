'use client'
import { useState } from 'react'

const CITIES = ['Delhi/NCR', 'Mumbai', 'Bangalore', 'Pune', 'Hyderabad']

export default function Home() {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    city: '',
    society: '',
    promoter1: '',
    promoter2: '',
    promoter3: '',
  })
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    setResult(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!photo) return setError('Please upload a setup photo.')
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = new FormData()
      Object.entries(form).forEach(([k, v]) => data.append(k, v))
      data.append('photo', photo)

      const res = await fetch('/api/analyze', { method: 'POST', body: data })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analysis failed')
      setResult(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setResult(null)
    setPhoto(null)
    setPreview(null)
    setError(null)
    setForm(f => ({ ...f, society: '', promoter1: '', promoter2: '', promoter3: '' }))
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-block bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">INSTAHELP BY URBAN COMPANY</div>
        <h1 className="text-2xl font-bold text-gray-800">BTL Setup Check</h1>
        <p className="text-gray-500 text-sm mt-1">Upload your setup photo for instant approval</p>
      </div>

      {result ? (
        <div className={`rounded-2xl p-6 text-center shadow-lg ${result.approved ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-400'}`}>
          <div className="text-5xl mb-3">{result.approved ? '✅' : '❌'}</div>
          <h2 className={`text-2xl font-bold mb-2 ${result.approved ? 'text-green-700' : 'text-red-700'}`}>
            {result.approved ? 'Setup Approved!' : 'Not Approved'}
          </h2>
          {result.approved ? (
            <p className="text-green-700 font-semibold text-lg">Please proceed</p>
          ) : (
            <div className="text-left mt-4">
              <p className="text-red-700 font-semibold mb-2">Issues found:</p>
              <ul className="space-y-2">
                {result.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-red-700 text-sm">
                    <span className="mt-0.5">•</span><span>{issue}</span>
                  </li>
                ))}
              </ul>
              {result.notes && <p className="text-gray-600 text-sm mt-3 italic">{result.notes}</p>}
            </div>
          )}
          <button onClick={reset} className="mt-6 w-full bg-gray-700 text-white py-3 rounded-xl font-semibold">
            Submit Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
            <input type="date" required value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">City *</label>
            <select required value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
              <option value="">Select city</option>
              {CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Society */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Society Name *</label>
            <input type="text" required placeholder="e.g. Mapsko Royal Ville, Gurugram" value={form.society}
              onChange={e => setForm(f => ({ ...f, society: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>

          {/* Promoters */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Promoter 1 *</label>
            <input type="text" required placeholder="Name" value={form.promoter1}
              onChange={e => setForm(f => ({ ...f, promoter1: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Promoter 2 <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" placeholder="Name" value={form.promoter2}
              onChange={e => setForm(f => ({ ...f, promoter2: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Promoter 3 <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" placeholder="Name" value={form.promoter3}
              onChange={e => setForm(f => ({ ...f, promoter3: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Setup Photo *</label>
            <label className="block w-full cursor-pointer">
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
              {preview ? (
                <div className="relative rounded-xl overflow-hidden border-2 border-green-400">
                  <img src={preview} alt="Preview" className="w-full object-cover max-h-64" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white font-semibold">Tap to change</span>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-green-400 transition-colors">
                  <div className="text-4xl mb-2">📸</div>
                  <p className="text-gray-600 font-medium">Tap to take photo or upload</p>
                  <p className="text-gray-400 text-sm mt-1">JPG, PNG supported</p>
                </div>
              )}
            </label>
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl text-lg transition-colors">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Analysing setup...
              </span>
            ) : 'Check Setup'}
          </button>
        </form>
      )}
    </main>
  )
}
