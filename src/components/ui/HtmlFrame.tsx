import { useEffect, useState } from 'react'

interface Props {
  url: string
  style?: React.CSSProperties
  title?: string
}

export function HtmlFrame({ url, style, title }: Props) {
  const [srcDoc, setSrcdoc] = useState<string>('')

  useEffect(() => {
    setSrcdoc('')
    fetch(url)
      .then(r => r.text())
      .then(html => setSrcdoc(html))
      .catch(() => setSrcdoc('<body style="font-family:sans-serif;padding:20px;color:#888">Error loading file.</body>'))
  }, [url])

  return (
    <iframe
      srcDoc={srcDoc}
      title={title}
      style={style}
      sandbox="allow-scripts"
    />
  )
}
