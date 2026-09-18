import type { Color } from 'chess.js'

export type TrainingPosition = {
  id: string
  title: string
  category: string
  theme: string
  fen: string
  side: Color
  solution: string
  explanation: string
}

export const ENDGAME_POSITIONS: TrainingPosition[] = [
  { id: 'endgame-kqk-1', title: 'Dama contra rei', category: 'Finais básicos', theme: 'mate técnico', fen: '7k/8/5K2/8/8/8/6Q1/8 w - - 0 1', side: 'w', solution: 'g2g7', explanation: 'Restrinja o rei antes de aproximar o seu próprio rei.' },
  { id: 'endgame-krk-1', title: 'Torre contra rei', category: 'Finais básicos', theme: 'corte do rei', fen: '7k/5K2/8/8/8/8/6R1/8 w - - 0 1', side: 'w', solution: 'g2g8', explanation: 'Use a torre para cortar linhas e empurrar o rei até a borda.' },
  { id: 'endgame-pawn-1', title: 'Rei e peão passado', category: 'Peões', theme: 'oposição', fen: '8/8/8/4k3/4P3/4K3/8/8 w - - 0 1', side: 'w', solution: 'e3d3', explanation: 'A oposição e a posição do rei determinam se o peão consegue avançar.' },
  { id: 'endgame-rook-pawn-1', title: 'Torre ativa no final', category: 'Torres', theme: 'atividade', fen: '8/6k1/5pp1/7p/8/6P1/5PKP/4R3 w - - 0 1', side: 'w', solution: 'e1e7', explanation: 'Torres pertencem atrás de peões passados e em linhas ativas.' },
]

export const TACTICAL_POSITIONS: TrainingPosition[] = [
  { id: 'tactic-fork-1', title: 'Garfo de cavalo', category: 'Tática', theme: 'garfo', fen: 'r3k3/pp3ppp/8/1N6/8/8/PPP2PPP/4K3 w - - 0 1', side: 'w', solution: 'b5c7', explanation: 'Procure casas onde o cavalo ataque duas peças valiosas ao mesmo tempo.' },
  { id: 'tactic-pin-1', title: 'Cravada absoluta', category: 'Tática', theme: 'cravada', fen: '4k3/4n3/8/8/8/8/8/4R1K1 w - - 0 1', side: 'w', solution: 'e1e7', explanation: 'Uma peça cravada ao rei perde liberdade e pode se tornar alvo.' },
  { id: 'tactic-skewer-1', title: 'Espeto', category: 'Tática', theme: 'espeto', fen: '8/5q2/4k3/8/8/1B6/8/4K3 w - - 0 1', side: 'w', solution: 'b3c4', explanation: 'Ataque a peça mais valiosa na frente para ganhar a peça atrás.' },
  { id: 'tactic-mate-1', title: 'Mate em um', category: 'Tática', theme: 'mate', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', side: 'w', solution: 'f7f8', explanation: 'Antes de calcular material, verifique sempre xeques forçados.' },
  { id: 'tactic-discovery-1', title: 'Ataque descoberto', category: 'Tática', theme: 'ataque descoberto', fen: '3qk3/8/8/8/8/3N4/8/3RK3 w - - 0 1', side: 'w', solution: 'd3f4', explanation: 'Mover a peça bloqueadora pode liberar uma linha de ataque de outra peça.' },
  { id: 'tactic-hanging-1', title: 'Peça pendurada', category: 'Tática', theme: 'material', fen: '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', side: 'w', solution: 'd2d5', explanation: 'Identifique peças sem defesa e capture quando não houver recurso tático melhor.' },
]
