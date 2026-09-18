import { useEffect, useRef, useState } from 'react'
import type { Color } from 'chess.js'
import { useCamera } from './hooks/useCamera'
import { useCornerCalibration } from './hooks/useCornerCalibration'
import { useVideoAspectRatio } from './hooks/useVideoAspectRatio'
import { gridLines } from './vision/geometry'
import type { Point } from './vision/types'

const CORNER_STEPS = ['superior-esquerdo', 'superior-direito', 'inferior-direito', 'inferior-esquerdo']

function calibrationHint(cornerCount: number) {
  if (cornerCount >= 4) return 'Os 4 pontos marcados não formam um quadrilátero válido. Toque na imagem para recomeçar a calibração.'
  return `Toque nos 4 cantos do tabuleiro nesta ordem — ${CORNER_STEPS.join(' → ')}. Próximo: ${CORNER_STEPS[cornerCount]} (${cornerCount}/4).`
}

export default function CameraAnalysis() {
  const { state, devices, stream, start, stop } = useCamera()
  const video = useRef<HTMLVideoElement>(null)
  const { corners, addCorner, reset, calibrated } = useCornerCalibration()
  const [orientation, setOrientation] = useState<Color>('w')
  const aspectRatio = useVideoAspectRatio(video, stream)
  useEffect(() => { if (video.current && stream) video.current.srcObject = stream }, [stream])
  const message: Record<string,string> = { idle:'Inicie a câmera para calibrar o tabuleiro.', unsupported:'Este navegador não oferece acesso à câmera.', insecure:'A câmera exige HTTPS ou localhost.', denied:'Permissão de câmera negada.', unavailable:'Nenhuma câmera disponível.', error:'Não foi possível iniciar a câmera.', active: calibrated ? 'Calibração pronta. O reconhecimento local será iniciado quando o modelo estiver disponível.' : calibrationHint(corners.length) }
  return <main className="camera-shell"><header className="trainer-topbar"><div><span className="eyebrow">VISÃO LOCAL</span><h1>Tabuleiro por câmera</h1></div></header><section className="camera-layout"><div className="camera-stage" style={aspectRatio ? { aspectRatio } : undefined} onClick={addCorner}><video ref={video} autoPlay muted playsInline />{corners.map((p,i)=><i className="camera-point" key={i} style={{left:`${p.x}%`,top:`${p.y}%`}} />)}{calibrated && <svg viewBox="0 0 100 100" className="camera-grid">{gridLines(corners as [Point,Point,Point,Point]).flatMap((l,i)=>[<line key={`v${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}/>,<line key={`h${i}`} x1={l.c.x} y1={l.c.y} x2={l.d.x} y2={l.d.y}/>])}</svg>}</div><aside className="card camera-panel"><p>{message[state]}</p><div className="move-actions">{state==='active'?<button onClick={stop}>Encerrar câmera</button>:<button className="primary" onClick={()=>void start()}>Iniciar câmera</button>}<button onClick={reset} disabled={!corners.length}>Recalibrar</button></div>{devices.length>1&&<select onChange={(e)=>void start(e.target.value)} defaultValue=""><option value="" disabled>Selecionar câmera</option>{devices.map((device)=><option value={device.id} key={device.id}>{device.label}</option>)}</select>}<label>Orientação <select value={orientation} onChange={(e)=>setOrientation(e.target.value as Color)}><option value="w">Brancas embaixo</option><option value="b">Pretas embaixo</option></select></label>{calibrated&&<small>Grade 8x8 calibrada · orientação {orientation==='w'?'brancas':'pretas'} embaixo.</small>}</aside></section></main>
}
