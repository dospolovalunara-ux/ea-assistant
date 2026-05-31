'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, formatDate, formatMoney } from '@/lib/utils'
import type { PersonalExpense } from '@/lib/types'
import { Plus, CheckCircle2, Circle } from 'lucide-react'

const CATEGORIES = ['Транспорт', 'Питание', 'Представительские', 'Связь', 'Прочее']

export default function ExpensesPage() {
  const { personalExpenses, addPersonalExpense, updatePersonalExpense } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<PersonalExpense>>({ category: 'Транспорт', reimbursed: false, currency: 'KZT' })
  const [filter, setFilter] = useState<'all' | 'pending' | 'reimbursed'>('all')

  const today = new Date().toISOString().slice(0, 10)
  const filtered = personalExpenses.filter(e => {
    if (filter === 'pending') return !e.reimbursed
    if (filter === 'reimbursed') return e.reimbursed
    return true
  })

  const totalPending = personalExpenses.filter(e => !e.reimbursed).reduce((s, e) => s + e.amount, 0)
  const totalReimbursed = personalExpenses.filter(e => e.reimbursed).reduce((s, e) => s + e.amount, 0)

  const byCategory = CATEGORIES.map(cat => ({
    cat, total: personalExpenses.filter(e => e.category === cat && !e.reimbursed).reduce((s, e) => s + e.amount, 0)
  })).filter(x => x.total > 0)

  function save() {
    if (!form.description || !form.amount || !form.date) return
    addPersonalExpense({
      id: uid(), description: form.description!, amount: Number(form.amount),
      currency: form.currency ?? 'KZT', date: form.date!, category: form.category ?? 'Прочее',
      reimbursed: false, notes: form.notes ?? '',
    })
    setShowForm(false)
    setForm({ category: 'Транспорт', reimbursed: false, currency: 'KZT' })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Личные расходы</h1>
          <p className="text-slate-400 text-sm mt-1">К возврату: <span className="font-semibold text-red-500">{formatMoney(totalPending)}</span> · Возвращено: {formatMoney(totalReimbursed)}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus size={16} />Новый расход</button>
      </div>

      {byCategory.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {byCategory.map(({ cat, total }) => (
            <div key={cat} className="card text-center">
              <div className="text-xs text-slate-400 mb-1">{cat}</div>
              <div className="text-lg font-bold text-slate-800">{formatMoney(total)}</div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">Добавить расход</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Описание *</label><input className="input" placeholder="Такси до аэропорта" value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><label className="label">Сумма *</label><input type="number" className="input" placeholder="0" value={form.amount ?? ''} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
            <div><label className="label">Дата *</label><input type="date" className="input" value={form.date ?? ''} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><label className="label">Категория</label>
              <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="label">Валюта</label>
              <select className="input" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                <option value="KZT">KZT</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="RUB">RUB</option>
              </select>
            </div>
            <div className="col-span-2"><label className="label">Заметки</label><input className="input" placeholder="Ресторан Zafferano, встреча с партнерами" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">Сохранить</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Отмена</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['all', 'pending', 'reimbursed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn text-xs py-1 px-3 ${filter === f ? 'bg-brand-500 text-white' : 'btn-ghost'}`}>
            {f === 'all' ? 'Все' : f === 'pending' ? 'К возврату' : 'Возвращено'}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="space-y-1">
          {filtered.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">Расходов нет</p>}
          {[...filtered].sort((a, b) => b.date.localeCompare(a.date)).map(exp => (
            <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <button onClick={() => updatePersonalExpense(exp.id, { reimbursed: !exp.reimbursed, reimbursedDate: !exp.reimbursed ? today : undefined })}
                  className="shrink-0 text-brand-500">
                  {exp.reimbursed ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} className="text-slate-300" />}
                </button>
                <div>
                  <p className={`text-sm font-medium ${exp.reimbursed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{exp.description}</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{formatDate(exp.date)}</span>
                    <span className="badge badge-gray">{exp.category}</span>
                    {exp.notes && <span className="text-xs text-slate-400 truncate max-w-xs">{exp.notes}</span>}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-bold ${exp.reimbursed ? 'text-slate-400' : 'text-slate-800'}`}>{formatMoney(exp.amount, exp.currency)}</div>
                {exp.reimbursed && <div className="text-xs text-emerald-500">Возвращено {formatDate(exp.reimbursedDate ?? '')}</div>}
              </div>
            </div>
          ))}
        </div>
        {filtered.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-sm text-slate-500">Итого по фильтру:</span>
            <span className="text-base font-bold text-slate-800">{formatMoney(filtered.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        )}
      </div>
    </div>
  )
}
