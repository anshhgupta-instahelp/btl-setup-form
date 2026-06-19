import './globals.css'

export const metadata = {
  title: 'BTL Setup Upload | InstaHelp',
  description: 'Upload your setup photo for quality check',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
