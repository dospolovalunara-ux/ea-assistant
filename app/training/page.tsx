'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, formatDate, cn } from '@/lib/utils'
import type { TrainingSession, TrainingParticipant } from '@/lib/types'
import { Plus, ChevronDown, ChevronUp, UserPlus, Check } from 'lucide-react'

const STATUS_BADGE: Record<string, string> = { scheduled: 'badge-blue', completed: 'badge-green', cancelled: 'badge-gray' }
const STATUS_LABEL: Record<string, string> = { scheduled: 'Запланировано', completed: 'Завершено', cancelled: 'Отменено' }

export default function TrainingPage() {
  const { trainings, addTraining, updateTraining } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<TrainingSession>>({ status: 'scheduled', duration: 120, participants: [] })
  const [partForms, setPartForms] = useState<Record<string, Partial<TrainingParticipant>>>({})

  const today = new Date().toISOString().slice(0, 10)

  function save() {
    if (!form.title || !form.date) return
    const t: TrainingSession = {
      id: uid(), title: form.title!, date: form.date!, time: form.time ?? '12:00',
      duration: form.duration ?? 120, instructor: form.instructor ?? '',
      topic: form.topic ?? '', status: 'scheduled', notes: form.notes ?? '', participants: [],
    }
    addTraining(t)
    setShowForm(false)
    setForm({ status: 'scheduled', duration: 120, participants: [] })
  }

  function addParticipant(trainingId: string) {
    const pf = partForms[trainingId]
    if (!pf?.name) return
    const training = trainings.find(t => t.id === trainingId)!
    const p: TrainingParticipant = {
      id: uid(), name: pf.name!, email: pf.email ?? '', phone: pf.phone ?? '',
      attended: false, registeredAt: today,
    }
    updateTraining(trainingId, { participants: [...training.participants, p] })
    setPartForms(prev => ({ ...prev, [trainingId]: {} }))
  }

  function toggleAttendance(trainingId: string, participantId: string) {
    const training = trainings.find(t => t.id === trainingId)!
    updateTraining(trainingId, {
      participants: training.participants.map(p => p.id === participantId ? { ...p, attended: !p.attended } : p)
    })
  }

  const upcoming = [...trainings].filter(t => t.date >= today && t.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))
  const past = [...trainings].filter(t => t.date < today || t.status !== 'scheduled').sort((a, b) => b.date.localeCompare(a.date))
  const totalParticipants = trainings.reduce((s, t) => s + t.participants.length, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Вайбкодинг обучение</h1>
          <p className="text-slate-400 text-sm mt-1">{trainings.length} потоков · {totalParticipants} участников всего</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus size={16} />Новый поток</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">Создать поток обучения</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Название *</label><input className="input" placeholder="Вайбкодинг — Поток #5" value={form.title ?? ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div><label className="label">Дата *</label><input type="date" className="input" value={form.date ?? ''} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label className="label">Время</label><input type="time" className="input" value={form.time ?? ''} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} /></div>
            <div><label className="label">Длительность (мин)</label><input type="number" className="input" value={form.duration ?? 120} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} /></div>
            <div><label className="label">Инструктор</label><input className="input" value={form.instructor ?? ''} onChange={e => setForm(p => ({ ...p, instructor: e.target.value }))} /></div>
            <div className="col-span-2"><label className="label">Тема занятия</label><input className="input" placeholder="Prompt engineering, no-code..." value={form.topic ?? ''} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} /></div>
            <div className="col-span-2"><label className="label">Заметки</label><textarea className="input" rows={2} value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">Создать</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Отмена</button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Предстоящие</h2>
          <div className="space-y-3">
            {upcoming.map(t => <TrainingCard key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)}
              onUpdate={updateTraining} partForm={partForms[t.id] ?? {}}
              onPartForm={v => setPartForms(p => ({ ...p, [t.id]: v }))}
              onAddParticipant={() => addParticipant(t.id)} onToggleAttendance={(pId) => toggleAttendance(t.id, pId)} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Прошедшие</h2>
          <div className="space-y-3">
            {past.map(t => <TrainingCard key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)}
              onUpdate={updateTraining} partForm={partForms[t.id] ?? {}}
              onPartForm={v => setPartForms(p => ({ ...p, [t.id]: v }))}
              onAddParticipant={() => addParticipant(t.id)} onToggleAttendance={(pId) => toggleAttendance(t.id, pId)} />)}
          </div>
        </div>
      )}

      {trainings.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">Потоков обучения нет</p>}
    </div>
  )
}

function TrainingCard({ t, open, onToggle, onUpdate, partForm, onPartForm, onAddParticipant, onToggleAttendance }: {
  t: TrainingSession; open: boolean; onToggle: () => void
  onUpdate: (id: string, data: Partial<TrainingSession>) => void
  partForm: Partial<TrainingParticipant>; onPartForm: (v: Partial<TrainingParticipant>) => void
  onAddParticipant: () => void; onToggleAttendance: (pId: string) => void
}) {
  const attended = t.participants.filter(p => p.attended).length
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={onToggle}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{t.title}</span>
            <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{formatDate(t.date)} · {t.time} · {t.duration} мин</p>
          {t.topic && <p className="text-xs text-slate-500 mt-0.5">{t.topic}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-400">Участников</div>
            <div className="text-sm font-bold text-slate-700">{t.participants.length}</div>
          </div>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-500">Статус:</label>
            <select value={t.status} onChange={e => onUpdate(t.id, { status: e.target.value as TrainingSession['status'] })}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none">
              <option value="scheduled">Запланировано</option>
              <option value="completed">Завершено</option>
              <option value="cancelled">Отменено</option>
            </select>
            {t.status === 'completed' && (
              <span className="text-xs text-slate-500">Явка: <strong>{attended}/{t.participants.length}</strong></span>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">Список участников ({t.participants.length})</p>
            </div>
            <div className="space-y-1.5 mb-3">
              {t.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-slate-700">{p.name}</span>
                    {p.phone && <span className="text-xs text-slate-400 ml-2">{p.phone}</span>}
                  </div>
                  <button onClick={() => onToggleAttendance(p.id)}
                    className={cn('w-6 h-6 rounded-full flex items-center justify-center border-2 transition', p.attended ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400')}>
                    {p.attended && <Check size={12} className="text-white" />}
                  </button>
                </div>
              ))}
              {t.participants.length === 0 && <p className="text-xs text-slate-400">Участников нет</p>}
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl">
              <input className="input text-xs" placeholder="ФИО *" value={partForm.name ?? ''}
                onChange={e => onPartForm({ ...partForm, name: e.target.value })} />
              <input className="input text-xs" placeholder="Телефон" value={partForm.phone ?? ''}
                onChange={e => onPartForm({ ...partForm, phone: e.target.value })} />
              <input className="input text-xs" placeholder="Email" value={partForm.email ?? ''}
                onChange={e => onPartForm({ ...partForm, email: e.target.value })} />
              <button onClick={onAddParticipant} className="btn-primary text-xs col-span-3">
                <UserPlus size={14} />Добавить участника
              </button>
            </div>
          </div>

          {t.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Заметки</p>
              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">{t.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
