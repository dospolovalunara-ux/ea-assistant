'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, formatDate, daysUntil, PRIORITY_LABEL, STATUS_LABEL, cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { Plus, Trash2, CheckCircle2, Circle, Filter } from 'lucide-react'

const PRIORITY_BADGE: Record<string, string> = { urgent: 'badge-red', high: 'badge-yellow', medium: 'badge-blue', low: 'badge-gray' }
const STATUS_BADGE: Record<string, string> = { pending: 'badge-gray', in_progress: 'badge-blue', done: 'badge-green', cancelled: 'badge-gray' }

export default function TasksPage() {
  const { tasks, addTask, updateTask, deleteTask } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'done'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'executive' | 'self'>('all')
  const [form, setForm] = useState<Partial<Task>>({ priority: 'medium', status: 'pending', source: 'executive', tags: [] })
  const [tagsStr, setTagsStr] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const filtered = tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false
    return true
  }).sort((a, b) => {
    const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
    if (pOrder[a.priority as keyof typeof pOrder] !== pOrder[b.priority as keyof typeof pOrder])
      return pOrder[a.priority as keyof typeof pOrder] - pOrder[b.priority as keyof typeof pOrder]
    return a.dueDate.localeCompare(b.dueDate)
  })

  function save() {
    if (!form.title || !form.dueDate) return
    const t: Task = {
      id: uid(), title: form.title!, description: form.description ?? '',
      priority: (form.priority as Task['priority']) ?? 'medium',
      status: (form.status as Task['status']) ?? 'pending',
      dueDate: form.dueDate!, createdAt: today,
      source: (form.source as Task['source']) ?? 'executive',
      tags: tagsStr.split(',').map(s => s.trim()).filter(Boolean),
    }
    addTask(t)
    setShowForm(false)
    setForm({ priority: 'medium', status: 'pending', source: 'executive', tags: [] })
    setTagsStr('')
  }

  function toggleStatus(t: Task) {
    if (t.status === 'done') updateTask(t.id, { status: 'pending' })
    else if (t.status === 'pending') updateTask(t.id, { status: 'in_progress' })
    else if (t.status === 'in_progress') updateTask(t.id, { status: 'done', completedAt: today })
  }

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today).length,
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Задачи и поручения</h1>
          <p className="text-slate-400 text-sm mt-1">{stats.pending} ожидает · {stats.inProgress} в работе · {stats.done} выполнено{stats.overdue > 0 ? ` · ${stats.overdue} просрочено` : ''}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus size={16} />Новая задача</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">Создать задачу</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Название *</label>
              <input className="input" placeholder="Что нужно сделать?" value={form.title ?? ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Описание</label>
              <textarea className="input" rows={2} placeholder="Детали задачи..." value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="label">Приоритет</label>
              <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as Task['priority'] }))}>
                <option value="urgent">Срочно</option>
                <option value="high">Высокий</option>
                <option value="medium">Средний</option>
                <option value="low">Низкий</option>
              </select>
            </div>
            <div>
              <label className="label">Дедлайн *</label>
              <input type="date" className="input" value={form.dueDate ?? ''} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Источник</label>
              <select className="input" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value as Task['source'] }))}>
                <option value="executive">От руководителя</option>
                <option value="self">Своя задача</option>
              </select>
            </div>
            <div>
              <label className="label">Теги (через запятую)</label>
              <input className="input" placeholder="board, finance, hr" value={tagsStr} onChange={e => setTagsStr(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">Сохранить</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Отмена</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-slate-400" />
        {(['all', 'pending', 'in_progress', 'done'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('btn text-xs py-1 px-3', filter === s ? 'bg-brand-500 text-white' : 'btn-ghost')}>
            {s === 'all' ? 'Все' : STATUS_LABEL[s]}
          </button>
        ))}
        <div className="w-px h-5 bg-slate-200 mx-1" />
        {(['all', 'executive', 'self'] as const).map(s => (
          <button key={s} onClick={() => setSourceFilter(s)}
            className={cn('btn text-xs py-1 px-3', sourceFilter === s ? 'bg-slate-700 text-white' : 'btn-ghost')}>
            {s === 'all' ? 'Все источники' : s === 'executive' ? 'От руководителя' : 'Мои задачи'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">Задач нет</p>}
        {filtered.map(t => {
          const d = daysUntil(t.dueDate)
          const isOverdue = t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today
          return (
            <div key={t.id} className={cn('card flex items-start gap-3', t.status === 'done' && 'opacity-60')}>
              <button onClick={() => toggleStatus(t)} className="mt-0.5 shrink-0 text-brand-500 hover:text-brand-700 transition">
                {t.status === 'done' ? <CheckCircle2 size={20} /> : <Circle size={20} className="text-slate-300 hover:text-brand-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={cn('font-medium text-sm', t.status === 'done' && 'line-through text-slate-400')}>{t.title}</span>
                  <span className={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABEL[t.priority]}</span>
                  <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
                  {t.source === 'executive' && <span className="badge badge-purple">Руководитель</span>}
                </div>
                {t.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</p>}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className={cn('text-xs', isOverdue ? 'text-red-500 font-medium' : d <= 1 ? 'text-amber-500' : 'text-slate-400')}>
                    {isOverdue ? `Просрочено на ${Math.abs(d)} дн.` : d === 0 ? 'Сегодня' : d === 1 ? 'Завтра' : formatDate(t.dueDate)}
                  </span>
                  {t.tags.map(tag => <span key={tag} className="badge badge-gray">{tag}</span>)}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <select value={t.status} onChange={e => updateTask(t.id, { status: e.target.value as Task['status'], completedAt: e.target.value === 'done' ? today : undefined })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none">
                  <option value="pending">Ожидает</option>
                  <option value="in_progress">В работе</option>
                  <option value="done">Выполнено</option>
                  <option value="cancelled">Отменено</option>
                </select>
                <button onClick={() => deleteTask(t.id)} className="text-slate-300 hover:text-red-400 transition p-1"><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
