import { useEffect, useState } from 'react'
import { mappingApi } from '@/mapping/api'
import { MESSAGE_MAX } from '@/mapping/editor/InfoFields'
import type { MappingScene } from '@/mapping/types'

interface Board {
  sceneId: number
  sceneName: string
  layerId: string
  name: string
  text: string
}

function boardsIn(scenes: MappingScene[]): Board[] {
  return scenes.flatMap((scene) =>
    scene.layers
      .filter((l) => l.type === 'info' && l.style === 'message')
      .map((l) => ({ sceneId: scene.id, sceneName: scene.name, layerId: l.id, name: l.name, text: l.text ?? '' })),
  )
}

/**
 * The message boards in the scenes, each with its words to change from the
 * phone. Saving changes the scene, so the house shows the new words within a
 * second or two, even mid-show.
 */
export default function MessageBoards({ canEdit }: { canEdit: boolean }) {
  const [boards, setBoards] = useState<Board[] | null>(null)

  useEffect(() => {
    mappingApi
      .listScenes()
      .then((scenes) => setBoards(boardsIn(scenes)))
      .catch(() => setBoards([]))
  }, [])

  if (!boards?.length) return null
  return (
    <section className="mt-1">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Message boards</h2>
      <ul className="space-y-3">
        {boards.map((b) => (
          <BoardCard key={`${b.sceneId}-${b.layerId}`} board={b} canEdit={canEdit} />
        ))}
      </ul>
      {!canEdit && <p className="mt-2 px-1 text-sm text-slate-500">Only an admin account can change the messages.</p>}
    </section>
  )
}

function BoardCard({ board, canEdit }: { board: Board; canEdit: boolean }) {
  const [text, setText] = useState(board.text)
  const [saved, setSaved] = useState(board.text)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setNote(null)
    try {
      // Read the scene fresh so nothing else changed meanwhile is undone.
      const scenes = await mappingApi.listScenes()
      const scene = scenes.find((s) => s.id === board.sceneId)
      if (!scene || !scene.layers.some((l) => l.id === board.layerId)) throw new Error('This board was removed.')
      const words = text.trim()
      await mappingApi.updateScene(scene.id, {
        layers: scene.layers.map((l) => (l.id === board.layerId ? { ...l, text: words } : l)),
      })
      setText(words)
      setSaved(words)
      setNote('Saved. The house shows it in a moment.')
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-3xl bg-panel-900 p-4 ring-1 ring-white/[0.06]">
      <p className="mb-2 truncate text-sm text-slate-400">
        {board.name || 'Message board'} · <span className="text-slate-500">{board.sceneName}</span>
      </p>
      <textarea
        className="input min-h-[5rem] w-full rounded-xl text-[16px]"
        value={text}
        maxLength={MESSAGE_MAX}
        disabled={!canEdit || busy}
        placeholder="Merry Christmas from our house!"
        onChange={(e) => setText(e.target.value.replace(/\s*\n\s*/g, ' '))}
      />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn-primary rounded-xl px-5 py-2.5 text-[15px]"
          disabled={!canEdit || busy || text.trim() === saved}
          onClick={() => void save()}>
          {busy ? 'Saving…' : 'Show this message'}
        </button>
        <span className="text-xs text-slate-500">{text.length}/{MESSAGE_MAX}</span>
      </div>
      {note && <p className="mt-2 text-sm text-slate-400">{note}</p>}
    </li>
  )
}
