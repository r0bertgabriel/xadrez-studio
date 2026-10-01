export function downloadText(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  // Revoking synchronously can cancel the download in some browsers (notably Firefox).
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function downloadBoardPng(svg: string) {
  const image = new Image()
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1200
    const context = canvas.getContext('2d')
    context?.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'posicao.png'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    }, 'image/png')
    URL.revokeObjectURL(source)
  }
  image.onerror = () => URL.revokeObjectURL(source)
  image.src = source
}
