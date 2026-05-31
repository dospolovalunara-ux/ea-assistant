'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, formatDate, cn } from '@/lib/utils'
import type { Meeting, ActionItem } from '@/lib/types'
import { Plus, ChevronDown, ChevronUp, Trash2, Check, X } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = { board: 'Board', internal: 'Внутренняя', external: 'Внешняя', training: 'Обучение' }
const TYPE_BADGE: Record<string, string> = { board: 'badge-purple', internal: 'badge-blue', external: 'badge-green', training: 'badge-yellow' }

export default function MeetingsPage() {
  const { meetings, addMeeting, updateMeeting, deleteMeeting } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Meeting>>({ type: 'internal', duration: 60, participants: [], actionItems: [] })
  const [participantsStr, setParticipantsStr] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [actionInput, setActionInput] = useState<Record<string, string>>({})

  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...meetings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const upcoming = sorted.filter(m => m.date >= today)
  const past = sorted.filter(m => m.date < today)

  function save() {
    if (!form.title || !form.date || !form.time) return
    const m: Meeting = {
      id: uid(), title: form.title!, date: form.date!, time: form.time!,
      duration: form.duration ?? 60, participants: participantsStr.split('\n').filter(Boolean),
      location: form.location ?? '', type: (form.type as Meeting['type']) ?? 'internal',
      agenda: form.agenda ?? '', decisions: form.decisions ?? '', actionItems: [],
    }
    addMeeting(m)
    setShowForm(false)
    setForm({ type: 'internal', duration: 60, participants: [], actionItems: [] })
    setParticipantsStr('')
  }

  function generateAgenda(meeting: Meeting) {
    setAiSaving(true)
    setTimeout(() => {
      const agenda = `1. Открытие совещания — 5 мин\n2. Основные вопросы: ${meeting.title} — 30 мин\n3. Обсуждение с участниками — 15 мин\n4. Принятие решений — 10 мин\n5. Action items и закрытие — 5 мин`
      updateMeeting(meeting.id, { agenda })
      setAiSaving(false)
    }, 800)
  }

  function addAction(meetingId: string) {
    const text = actionInput[meetingId]
    if (!text) return
    const meeting = meetings.find(m => m.id === meetingId)!
    const item: ActionItem = { id: uid(), text, assignee: '', dueDate: '', done: false }
    updateMeeting(meetingId, { actionItems: [...meeting.actionItems, item] })
    setActionInput(prev => ({ ...prev, [meetingId]: '' }))
  }

  function toggleAction(meetingId: string, actionId: string) {
    const meeting = meetings.find(m => m.id === meetingId)!
    updateMeeting(meetingId, {
      actionItems: meeting.actionItems.map(a => a.id === actionId ? { ...a, done: !a.done } : a)
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Встречи и совещания</h1>
          <p className="text-slate-400 text-sm mt-1">{meetings.length} всего · {upcoming.length} предстоит</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={16} />Новая встреча
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">Создать встречу</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Название *</label>
              <input className="input" placeholder="Тема встречи" value={form.title ?? ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="label">Дата *</label>
              <input type="date" className="input" value={form.date ?? ''} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Время *</label>
              <input type="time" className="input" value={form.time ?? ''} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
            </div>
            <div>
              <label className="label">Длительность (мин)</label>
              <input type="number" className="input" value={form.duration ?? 60} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Тип</label>
              <select className="input" value={form.type ?? 'internal'} onChange={e => setForm(p => ({ ...p, type: e.target.value as Meeting['type'] }))}>
                <option value="board">Board</option>
                <option value="internal">Внутренняя</option>
                <option value="external">Внешняя</option>
                <option value="training">Обучение</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Место / Zoom-ссылка</label>
              <input className="input" placeholder="Зал А, 15 эт. или https://zoom.us/..." value={form.location ?? ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Участники (каждый с новой строки)</label>
              <textarea className="input" rows={3} placeholder="Иван Петров&#10;Анна Сидорова" value={participantsStr} onChange={e => setParticipantsStr(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Повестка</label>
              <textarea className="input" rows={4} placeholder="1. Обсуждение..." value={form.agenda ?? ''} onChange={e => setForm(p => ({ ...p, agenda: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">Сохранить</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Отмена</button>
          </div>
        </div>
      )}

      {/* Upcoming */}
      <Section title="Предстоящие" count={upcoming.length}>
        {upcoming.map(m => <MeetingCard key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)}
          onDelete={() => deleteMeeting(m.id)} onUpdate={updateMeeting}
          onGenerateAgenda={() => generateAgenda(m)} aiSaving={aiSaving}
          actionInput={actionInput[m.id] ?? ''} onActionInput={v => setActionInput(p => ({ ...p, [m.id]: v }))}
          onAddAction={() => addAction(m.id)} onToggleAction={(aId) => toggleAction(m.id, aId)} />)}
        {upcoming.length === 0 && <p className="text-slate-400 text-sm py-4">Предстоящих встреч нет</p>}
      </Section>

      {past.length > 0 && (
        <Section title="Прошедшие" count={past.length}>
          {past.slice().reverse().map(m => <MeetingCard key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)}
            onDelete={() => deleteMeeting(m.id)} onUpdate={updateMeeting}
            onGenerateAgenda={() => generateAgenda(m)} aiSaving={aiSaving}
            actionInput={actionInput[m.id] ?? ''} onActionInput={v => setActionInput(p => ({ ...p, [m.id]: v }))}
            onAddAction={() => addAction(m.id)} onToggleAction={(aId) => toggleAction(m.id, aId)} />)}
        </Section>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{title} <span className="ml-1 badge badge-gray">{count}</span></h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function MeetingCard({ m, open, onToggle, onDelete, onUpdate, onGenerateAgenda, aiSaving, actionInput, onActionInput, onAddAction, onToggleAction }: {
  m: Meeting; open: boolean; onToggle: () => void; onDelete: () => void
  onUpdate: (id: string, data: Partial<Meeting>) => void
  onGenerateAgenda: () => void; aiSaving: boolean
  actionInput: string; onActionInput: (v: string) => void
  onAddAction: () => void; onToggleAction: (aId: string) => void
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={onToggle}>
        <div className="flex gap-3 items-start min-w-0">
          <div className="shrink-0 w-12 text-center">
            <div className="text-xl font-bold text-brand-600 leading-none">{new Date(m.date).getDate()}</div>
            <div className="text-xs text-slate-400">{new Date(m.date).toLocaleDateString('ru-KZ', { month: 'short' })}</div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 text-sm">{m.title}</span>
              <span className={TYPE_BADGE[m.type]}>{TYPE_LABEL[m.type]}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{m.time} · {m.duration} мин · {m.location || 'Место не указано'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-slate-300 hover:text-red-400 transition"><Trash2 size={14} /></button>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          {m.participants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Участники</p>
              <div className="flex flex-wrap gap-1">{m.participants.map((p, i) => <span key={i} className="badge badge-gray">{p}</span>)}</div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-slate-500">Повестка</p>
              <button onClick={onGenerateAgenda} className={cn('text-xs text-brand-500 hover:underline', aiSaving && 'opacity-50')}>
                {aiSaving ? 'Генерирую...' : 'Сгенерировать AI'}
              </button>
            </div>
            <textarea className="input text-xs" rows={4} value={m.agenda}
              onChange={e => onUpdate(m.id, { agenda: e.target.value })} placeholder="Повестка встречи..." />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Решения</p>
            <textarea className="input text-xs" rows={3} value={m.decisions}
              onChange={e => onUpdate(m.id, { decisions: e.target.value })} placeholder="Фиксируйте принятые решения..." />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Action Items ({m.actionItems.filter(a => !a.done).length} открытых)</p>
            <div className="space-y-1.5 mb-2">
              {m.actionItems.map(a => (
                <div key={a.id} className={cn('flex items-center gap-2 p-2 rounded-lg text-sm', a.done ? 'opacity-50' : '')}>
                  <button onClick={() => onToggleAction(a.id)} className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition', a.done ? 'bg-brand-500 border-brand-500' : 'border-slate-300')}>
                    {a.done && <Check size={10} className="text-white" />}
                  </button>
                  <span className={a.done ? 'line-through text-slate-400' : ''}>{a.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input text-xs flex-1" placeholder="Добавить action item..." value={actionInput}
                onChange={e => onActionInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddAction()} />
              <button onClick={onAddAction} className="btn-primary text-xs">Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
